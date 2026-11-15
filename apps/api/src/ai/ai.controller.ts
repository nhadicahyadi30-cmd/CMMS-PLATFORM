import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { dbCtx, RequireModule, Roles } from '../auth/auth.guard';
import { mapDbError, parse } from '../common/http';
import { AiService } from './ai.service';
import { config } from '../config';

const ChatDto = z.object({ message: z.string().trim().min(3).max(2000), assetId: z.string().uuid().optional(), woId: z.string().uuid().optional() });
const KbDto = z.object({ title: z.string().trim().min(2).max(200), body: z.string().trim().min(10).max(200_000), tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]) });
const AlarmDto = z.object({ plantId: z.string().uuid(), assetId: z.string().uuid().nullish(), severity: z.enum(['info', 'warning', 'critical']).default('warning'), message: z.string().trim().min(3).max(500) });

@Controller('ai')
@RequireModule(5)
export class AiController {
  constructor(private db: DbService, private ai: AiService) {}
  private run<T>(req: any, fn: (c: PoolClient) => Promise<T>) { return this.db.tx(dbCtx(req.user), fn).catch((e) => mapDbError(e)); }
  private nf(r: { rows: unknown[]; rowCount?: number | null }, what: string) { if (!r.rowCount && !r.rows.length) throw new HttpException(`${what} tidak ditemukan`, HttpStatus.NOT_FOUND); }

  @Get('status')
  status() { return { configured: this.ai.configured, model: this.ai.configured ? config.ai.model : null, perHour: config.ai.perHour }; }

  @Post('chat')
  async chat(@Body() b: unknown, @Req() req: any) {
    const d = parse(ChatDto, b);
    try { return await this.ai.ask(req.user, { question: d.message, assetId: d.assetId, woId: d.woId }); } catch (e) { mapDbError(e); }
  }

  @Get('history')
  history(@Query() q: unknown, @Req() req: any) {
    const d = parse(z.object({ assetId: z.string().uuid().optional(), woId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }), q);
    return this.run(req, async (c) => (await c.query(
      `select id, question, answer, sources, mode, created_at as "createdAt" from ai_messages
        where user_id = $1 and ($2::uuid is null or asset_id = $2) and ($3::uuid is null or wo_id = $3) order by created_at desc limit $4`,
      [req.user.sub, d.assetId ?? null, d.woId ?? null, d.limit])).rows);
  }

  // ---------- basis pengetahuan ----------
  @Get('kb')
  kbList(@Req() req: any) {
    return this.run(req, async (c) => (await c.query(
      `select d.id, d.title, d.tags, d.active, d.created_at as "createdAt", length(d.body) as chars, (select count(*)::int from kb_chunks k where k.doc_id = d.id) as chunks, u.full_name as "createdByName"
         from kb_docs d left join users u on u.id = d.created_by order by d.active desc, d.created_at desc limit 300`)).rows);
  }
  @Get('kb/:id')
  kbOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.run(req, async (c) => { const r = await c.query('select id, title, body, tags, active from kb_docs where id = $1', [id]); this.nf(r, 'Dokumen'); return r.rows[0]; });
  }
  @Post('kb') @Roles('admin', 'supervisor', 'planner')
  kbAdd(@Body() b: unknown, @Req() req: any) {
    const d = parse(KbDto, b);
    return this.run(req, async (c) => (await c.query(
      `insert into kb_docs (org_id, title, body, tags, created_by) values ($1,$2,$3,$4,$5) returning id, title,
         (select count(*)::int from kb_chunks k where k.doc_id = kb_docs.id) as chunks`, [req.user.org, d.title, d.body, d.tags, req.user.sub])).rows[0]);
  }
  @Patch('kb/:id') @Roles('admin', 'supervisor', 'planner')
  kbPatch(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(KbDto.partial().extend({ active: z.boolean().optional() }), b);
    return this.run(req, async (c) => {
      const r = await c.query(`update kb_docs set title = coalesce($1, title), body = coalesce($2, body), tags = coalesce($3, tags), active = coalesce($4, active) where id = $5 returning id, title, active`,
        [d.title ?? null, d.body ?? null, d.tags ?? null, d.active ?? null, id]);
      this.nf(r, 'Dokumen'); return r.rows[0];
    });
  }
  @Delete('kb/:id') @Roles('admin', 'supervisor')
  kbDel(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.run(req, async (c) => { await c.query('delete from kb_docs where id = $1', [id]); return { ok: true }; });
  }
}

const SEV_PRIORITY: Record<string, string> = { critical: 'P1', warning: 'P3', info: 'P4' };

@Controller('alarms')
@RequireModule(5)
export class AlarmsController {
  constructor(private db: DbService, private ai: AiService) {}
  private run<T>(req: any, fn: (c: PoolClient) => Promise<T>) { return this.db.tx(dbCtx(req.user), fn).catch((e) => mapDbError(e)); }

  @Get()
  list(@Query() q: unknown, @Req() req: any) {
    const d = parse(z.object({ plantId: z.string().uuid().optional(), status: z.enum(['open', 'ack', 'closed', 'active']).default('active') }), q);
    const w: string[] = []; const p: unknown[] = [];
    if (d.plantId) { p.push(d.plantId); w.push(`a.plant_id = $${p.length}`); }
    if (d.status === 'active') w.push(`a.status <> 'closed'`); else { p.push(d.status); w.push(`a.status = $${p.length}`); }
    return this.run(req, async (c) => (await c.query(
      `select a.id, a.code, a.plant_id as "plantId", a.asset_id as "assetId", s.code as "assetCode", s.name as "assetName", a.severity, a.message, a.source, a.status, a.raised_at as "raisedAt",
              a.ack_at as "ackAt", a.wo_id as "woId", w.code as "woCode", a.ai_diagnosis as "aiDiagnosis", a.ai_diagnosed_at as "aiDiagnosedAt"
         from alarms a left join assets s on s.id = a.asset_id left join work_orders w on w.id = a.wo_id
        where ${w.join(' and ')} order by (a.severity = 'critical') desc, a.raised_at desc limit 200`, p)).rows);
  }

  @Post() @Roles('admin', 'supervisor', 'planner', 'technician')
  create(@Body() b: unknown, @Req() req: any) {
    const d = parse(AlarmDto, b);
    return this.run(req, async (c) => (await c.query(
      `insert into alarms (org_id, plant_id, asset_id, severity, message, source) values ($1,$2,$3,$4,$5,'manual') returning id, code, status`,
      [req.user.org, d.plantId, d.assetId ?? null, d.severity, d.message])).rows[0]);
  }

  private async setStatus(id: string, status: 'ack' | 'closed', req: any) {
    return this.run(req, async (c) => {
      const r = await c.query(`update alarms set status = $1, ack_by = case when $1 = 'ack' then $2::uuid else ack_by end where id = $3 returning id, status`, [status, req.user.sub, id]);
      if (!r.rows[0]) throw new HttpException('Alarm tidak ditemukan', HttpStatus.NOT_FOUND); return r.rows[0];
    });
  }
  @Post(':id/ack') @Roles('admin', 'supervisor', 'planner', 'technician')
  ack(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.setStatus(id, 'ack', req); }
  @Post(':id/close') @Roles('admin', 'supervisor', 'planner')
  close(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.setStatus(id, 'closed', req); }

  @Post(':id/diagnose')
  async diagnose(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const a = await this.run(req, async (c) => (await c.query('select message, severity, status from alarms where id = $1', [id])).rows[0]);
    if (!a) throw new HttpException('Alarm tidak ditemukan', HttpStatus.NOT_FOUND);
    try {
      const r = await this.ai.ask(req.user, { question: `Alarm: ${a.message}`, alarmId: id,
        task: 'Beri diagnosis awal untuk alarm ini: kemungkinan penyebab (berurutan), pemeriksaan cepat yang aman, dan kapan perlu eskalasi ke WO. Maksimal sekitar 200 kata.' });
      if (r.mode === 'ai') await this.run(req, async (c) => { await c.query('update alarms set ai_diagnosis = $1, ai_diagnosed_at = now() where id = $2 and status <> \'closed\'', [r.answer, id]); });
      return r;
    } catch (e) { mapDbError(e); }
  }

  /** Buat WO dari alarm. WO tetap melalui approval Supervisor seperti WO lain. */
  @Post(':id/create-wo') @Roles('admin', 'supervisor', 'planner')
  createWo(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.run(req, async (c) => {
      const a = (await c.query('select * from alarms where id = $1 for update', [id])).rows[0];
      if (!a) throw new HttpException('Alarm tidak ditemukan', HttpStatus.NOT_FOUND);
      if (a.wo_id) throw new HttpException('Alarm ini sudah punya WO', HttpStatus.CONFLICT);
      if (!a.asset_id) throw new HttpException('Alarm belum terkait aset; WO butuh aset', HttpStatus.UNPROCESSABLE_ENTITY);
      if (a.status === 'closed') throw new HttpException('Alarm sudah ditutup', HttpStatus.UNPROCESSABLE_ENTITY);
      const w = (await c.query(
        `insert into work_orders (org_id, plant_id, wo_type, source, title, description, asset_id, priority, requester_id)
         values ($1,$2,$3,'alarm',$4,$5,$6,$7,$8) returning id, code, status`,
        [a.org_id, a.plant_id, a.severity === 'critical' ? 'breakdown' : 'corrective', `[${a.code}] ${String(a.message).slice(0, 150)}`,
         `Dibuat dari alarm ${a.code} (${a.severity}): ${a.message}${a.ai_diagnosis ? `\n\nDiagnosis awal AI (saran, belum diverifikasi):\n${a.ai_diagnosis}` : ''}`, a.asset_id, SEV_PRIORITY[a.severity], req.user.sub])).rows[0];
      await c.query('insert into wo_logs (org_id, wo_id, actor_user_id, actor_text, text) values ($1,$2,$3,$4,$5)', [a.org_id, w.id, req.user.sub, req.user.name, `WO dibuat dari alarm ${a.code}, menunggu approval Supervisor`]);
      await c.query(`update alarms set wo_id = $1, status = case when status = 'open' then 'ack' else status end, ack_by = coalesce(ack_by, $2) where id = $3`, [w.id, req.user.sub, id]);
      return w;
    });
  }
}
