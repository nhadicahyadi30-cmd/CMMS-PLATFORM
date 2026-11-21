import { Body, Controller, Get, HttpException, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { dbCtx, RequireModule, Roles } from '../auth/auth.guard';
import { mapDbError, parse } from '../common/http';
import { audiencesFor, RecordDto, TemplateDto } from './inspection.rules';

const TPL_COLS = `t.id, t.code, t.name, t.description, t.plant_id as "plantId", t.asset_id as "assetId", a.name as "assetName", t.audience,
  t.frequency_days as "frequencyDays", t.active, (select count(*)::int from inspection_items i where i.template_id = t.id) as "itemCount",
  (select max(performed_at) from inspections x where x.template_id = t.id) as "lastAt"`;
const ITEM_COLS = `id, seq, text, kind, unit, min_val::float as "minVal", max_val::float as "maxVal", required, critical`;
const HistQ = z.object({
  plantId: z.string().uuid().optional(), templateId: z.string().uuid().optional(), assetId: z.string().uuid().optional(),
  abnormal: z.coerce.boolean().optional(), page: z.coerce.number().int().min(1).default(1), size: z.coerce.number().int().min(1).max(100).default(30),
});

@Controller('inspections')
@RequireModule(11)
export class InspectionsController {
  constructor(private db: DbService) {}
  private run<T>(req: any, fn: (c: PoolClient) => Promise<T>) { return this.db.tx(dbCtx(req.user), fn).catch((e) => mapDbError(e)); }

  // ---------- template ----------
  @Get('templates')
  templates(@Query('plantId') plantId: string | undefined, @Query('all') all: string | undefined, @Req() req: any) {
    const pid = plantId ? parse(z.string().uuid(), plantId) : null;
    const canSeeInactive = all === '1' && ['admin', 'supervisor', 'planner'].includes(req.user.role);
    return this.run(req, async (c) => (await c.query(
      `select ${TPL_COLS} from inspection_templates t left join assets a on a.id = t.asset_id
        where ($1::uuid is null or t.plant_id = $1) and t.audience = any($2) and ($3 or t.active) order by t.code`,
      [pid, audiencesFor(req.user.role), canSeeInactive])).rows);
  }

  @Get('templates/:id')
  template(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.run(req, async (c) => {
      const t = await c.query(`select ${TPL_COLS} from inspection_templates t left join assets a on a.id = t.asset_id where t.id = $1 and t.audience = any($2)`, [id, audiencesFor(req.user.role)]);
      if (!t.rows[0]) throw new HttpException('Template tidak ditemukan', HttpStatus.NOT_FOUND);
      const items = await c.query(`select ${ITEM_COLS} from inspection_items where template_id = $1 order by seq`, [id]);
      return { ...t.rows[0], items: items.rows };
    });
  }

  @Post('templates') @Roles('admin', 'supervisor', 'planner')
  createTemplate(@Body() b: unknown, @Req() req: any) {
    const d = parse(TemplateDto, b);
    return this.run(req, async (c) => {
      const r = await c.query(
        `insert into inspection_templates (org_id, plant_id, code, name, description, asset_id, audience, frequency_days, active) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [req.user.org, d.plantId, d.code, d.name, d.description, d.assetId ?? null, d.audience, d.frequencyDays ?? null, d.active]);
      await this.putItems(c, req.user.org, r.rows[0].id, d.items);
      return r.rows[0];
    });
  }

  @Put('templates/:id') @Roles('admin', 'supervisor', 'planner')
  updateTemplate(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(TemplateDto, b);
    return this.run(req, async (c) => {
      const r = await c.query(
        `update inspection_templates set code=$2, name=$3, description=$4, asset_id=$5, audience=$6, frequency_days=$7, active=$8 where id = $1 returning id`,
        [id, d.code, d.name, d.description, d.assetId ?? null, d.audience, d.frequencyDays ?? null, d.active]);
      if (!r.rows[0]) throw new HttpException('Template tidak ditemukan', HttpStatus.NOT_FOUND);
      await c.query('delete from inspection_items where template_id = $1', [id]);   // hasil lama menyimpan salinan teks butir, jadi aman
      await this.putItems(c, req.user.org, id, d.items);
      return { id };
    });
  }

  private async putItems(c: PoolClient, org: string, tpl: string, items: any[]) {
    let seq = 0;
    for (const i of items) {
      await c.query(
        `insert into inspection_items (org_id, template_id, seq, text, kind, unit, min_val, max_val, required, critical) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [org, tpl, ++seq, i.text, i.kind, i.unit ?? null, i.minVal ?? null, i.maxVal ?? null, i.required, i.critical]);
    }
  }

  // ---------- jatuh tempo & riwayat ----------
  @Get('due')
  due(@Query('plantId') plantId: string | undefined, @Req() req: any) {
    const pid = plantId ? parse(z.string().uuid(), plantId) : null;
    return this.run(req, async (c) => (await c.query(
      `select d.template_id as "templateId", d.code, d.name, d.plant_id as "plantId", d.asset_id as "assetId", a.name as "assetName", d.audience,
              d.frequency_days as "frequencyDays", d.last_at as "lastAt", d.due_at as "dueAt", d.overdue_days as "overdueDays"
         from inspection_due($1) d left join assets a on a.id = d.asset_id where d.audience = any($2) order by d.overdue_days desc, d.code`,
      [pid, audiencesFor(req.user.role)])).rows);
  }

  @Get()
  list(@Query() q: unknown, @Req() req: any) {
    const f = parse(HistQ, q);
    return this.run(req, async (c) => {
      const w: string[] = ['t.audience = any($1)']; const a: unknown[] = [audiencesFor(req.user.role)];
      if (f.plantId) { a.push(f.plantId); w.push(`i.plant_id = $${a.length}`); }
      if (f.templateId) { a.push(f.templateId); w.push(`i.template_id = $${a.length}`); }
      if (f.assetId) { a.push(f.assetId); w.push(`i.asset_id = $${a.length}`); }
      if (f.abnormal) w.push('i.abnormal_count > 0');
      if (req.user.role === 'production') { a.push(req.user.sub); w.push(`i.performed_by = $${a.length}`); }
      a.push(f.size, (f.page - 1) * f.size);
      const r = await c.query(
        `select i.id, i.code, i.performed_at as "performedAt", i.abnormal_count as "abnormalCount", i.wo_id as "woId", w.code as "woCode",
                t.name as "templateName", t.code as "templateCode", a.name as "assetName", u.full_name as "performedBy", count(*) over() as total
           from inspections i join inspection_templates t on t.id = i.template_id join assets a on a.id = i.asset_id join users u on u.id = i.performed_by
           left join work_orders w on w.id = i.wo_id where ${w.join(' and ')} order by i.performed_at desc limit $${a.length - 1} offset $${a.length}`, a);
      return { total: Number(r.rows[0]?.total ?? 0), items: r.rows.map(({ total, ...x }: any) => x) };
    });
  }

  @Get(':id')
  one(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.run(req, async (c) => {
      const r = await c.query(
        `select i.id, i.code, i.performed_at as "performedAt", i.notes, i.abnormal_count as "abnormalCount", i.wo_id as "woId", w.code as "woCode", i.performed_by as "performedById",
                t.name as "templateName", t.audience, a.name as "assetName", u.full_name as "performedBy"
           from inspections i join inspection_templates t on t.id = i.template_id join assets a on a.id = i.asset_id join users u on u.id = i.performed_by
           left join work_orders w on w.id = i.wo_id where i.id = $1`, [id]);
      const x = r.rows[0];
      if (!x || !audiencesFor(req.user.role).includes(x.audience) || (req.user.role === 'production' && x.performedById !== req.user.sub)) throw new HttpException('Inspeksi tidak ditemukan', HttpStatus.NOT_FOUND);
      const res = await c.query(
        `select seq, text, kind, unit, min_val::float as "minVal", max_val::float as "maxVal", critical, value_ok as "ok", value_num::float as value, value_text as text_value, abnormal, note
           from inspection_results where inspection_id = $1 order by seq`, [id]);
      return { ...x, results: res.rows };
    });
  }

  /** Catat inspeksi lengkap. Idempoten lewat clientUid: pengiriman ulang dari mode offline tidak menggandakan data. */
  @Post()
  record(@Body() b: unknown, @Req() req: any) {
    const d = parse(RecordDto, b);
    return this.run(req, async (c) => {
      const r = await c.query(
        `select id, code, abnormal, wo_id as "woId", duplicate from inspection_record($1,$2,$3,$4,$5,$6::jsonb,$7)`,
        [req.user.sub, d.templateId, d.assetId ?? null, d.performedAt ?? null, d.notes, JSON.stringify(d.results), d.clientUid ?? null]);
      return r.rows[0];
    });
  }
}
