import { Body, Controller, Get, HttpException, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../db/db.service';
import { dbCtx, RequireModule, Roles } from '../auth/auth.guard';
import { mapDbError, parse } from '../common/http';

const crit = z.number().int().min(1).max(5);
const AssetDto = z.object({
  plantId: z.string().uuid(), parentId: z.string().uuid().nullish(),
  code: z.string().min(1).max(60), name: z.string().min(1).max(200),
  assetType: z.enum(['plant', 'area', 'equipment', 'component']),
  manufacturer: z.string().max(100).nullish(), model: z.string().max(100).nullish(), serialNo: z.string().max(100).nullish(),
  yearInstalled: z.number().int().min(1950).max(2100).nullish(),
  status: z.enum(['running', 'standby', 'breakdown', 'retired']).optional(),
  critSafety: crit.optional(), critProduction: crit.optional(), critQuality: crit.optional(), critCost: crit.optional(),
  specs: z.record(z.unknown()).optional(),
});
const ListQ = z.object({
  plantId: z.string().uuid().optional(), type: z.string().optional(), q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1), size: z.coerce.number().int().min(1).max(200).default(50),
});

const COLS = `id, plant_id as "plantId", parent_id as "parentId", code, name, asset_type as "assetType", manufacturer, model,
  serial_no as "serialNo", year_installed as "yearInstalled", status, crit_safety as "critSafety", crit_production as "critProduction",
  crit_quality as "critQuality", crit_cost as "critCost", criticality_score as "criticalityScore", criticality_class as "criticalityClass",
  specs, qr_token as "qrToken"`;

@Controller('assets')
@RequireModule(1)
export class AssetsController {
  constructor(private db: DbService) {}

  @Get()
  async list(@Query() q: unknown, @Req() req: any) {
    const f = parse(ListQ, q);
    return this.db.tx(dbCtx(req.user), async (c) => {
      const where: string[] = []; const args: unknown[] = [];
      if (f.plantId) { args.push(f.plantId); where.push(`plant_id = $${args.length}`); }
      if (f.type) { args.push(f.type); where.push(`asset_type = $${args.length}`); }
      if (f.q) { args.push(`%${f.q}%`); where.push(`(name ilike $${args.length} or code::text ilike $${args.length})`); }
      args.push(f.size, (f.page - 1) * f.size);
      const sql = `select ${COLS}, count(*) over() as total from assets ${where.length ? 'where ' + where.join(' and ') : ''}
                   order by code limit $${args.length - 1} offset $${args.length}`;
      const r = await c.query(sql, args);
      return { total: Number(r.rows[0]?.total ?? 0), items: r.rows.map(({ total, ...x }: any) => x) };
    });
  }

  @Get(':id')
  async one(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => {
      const r = await c.query(`select ${COLS} from assets where id = $1`, [id]);
      if (!r.rows[0]) throw new HttpException('Aset tidak ditemukan', HttpStatus.NOT_FOUND);
      const wo = await c.query(
        `select id, code, title, wo_type as "woType", priority, status, created_at as "createdAt" from work_orders where asset_id = $1 order by created_at desc limit 20`, [id]);
      return { ...r.rows[0], workOrders: wo.rows };
    });
  }

  @Post() @Roles('admin', 'supervisor', 'planner')
  async create(@Body() b: unknown, @Req() req: any) {
    const d = parse(AssetDto, b);
    try {
      return await this.db.tx(dbCtx(req.user), async (c) => {
        const r = await c.query(
          `insert into assets (org_id, plant_id, parent_id, code, name, asset_type, manufacturer, model, serial_no, year_installed, status,
             crit_safety, crit_production, crit_quality, crit_cost, specs)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,coalesce($11,'running'),coalesce($12,1),coalesce($13,1),coalesce($14,1),coalesce($15,1),coalesce($16::jsonb,'{}'::jsonb))
           returning ${COLS}`,
          [req.user.org, d.plantId, d.parentId ?? null, d.code, d.name, d.assetType, d.manufacturer ?? null, d.model ?? null, d.serialNo ?? null,
           d.yearInstalled ?? null, d.status ?? null, d.critSafety ?? null, d.critProduction ?? null, d.critQuality ?? null, d.critCost ?? null,
           d.specs ? JSON.stringify(d.specs) : null]);
        await c.query(`insert into audit_log (org_id, user_id, event, entity, entity_id) values ($1,$2,'asset_create','asset',$3)`, [req.user.org, req.user.sub, r.rows[0].id]);
        return r.rows[0];
      });
    } catch (e) { mapDbError(e); }
  }

  @Patch(':id') @Roles('admin', 'supervisor', 'planner')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(AssetDto.partial().omit({ plantId: true }), b);
    const map: Record<string, string> = { parentId: 'parent_id', code: 'code', name: 'name', assetType: 'asset_type', manufacturer: 'manufacturer',
      model: 'model', serialNo: 'serial_no', yearInstalled: 'year_installed', status: 'status', critSafety: 'crit_safety',
      critProduction: 'crit_production', critQuality: 'crit_quality', critCost: 'crit_cost' };
    const sets: string[] = []; const args: unknown[] = [];
    for (const [k, col] of Object.entries(map)) if ((d as any)[k] !== undefined) { args.push((d as any)[k]); sets.push(`${col} = $${args.length}`); }
    if (d.specs !== undefined) { args.push(JSON.stringify(d.specs)); sets.push(`specs = $${args.length}`); }
    if (!sets.length) throw new HttpException('Tidak ada perubahan', HttpStatus.BAD_REQUEST);
    args.push(id);
    try {
      return await this.db.tx(dbCtx(req.user), async (c) => {
        const r = await c.query(`update assets set ${sets.join(', ')} where id = $${args.length} returning ${COLS}`, args);
        if (!r.rows[0]) throw new HttpException('Aset tidak ditemukan', HttpStatus.NOT_FOUND);
        await c.query(`insert into audit_log (org_id, user_id, event, entity, entity_id) values ($1,$2,'asset_update','asset',$3)`, [req.user.org, req.user.sub, id]);
        return r.rows[0];
      });
    } catch (e) { mapDbError(e); }
  }
}
