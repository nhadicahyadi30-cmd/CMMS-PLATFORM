import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { dbCtx, RequireModule, Roles } from '../auth/auth.guard';
import { mapDbError, parse } from '../common/http';

const CATS = ['man', 'machine', 'method', 'material', 'measurement', 'environment'] as const;
const CaseDto = z.object({
  plantId: z.string().uuid(), assetId: z.string().uuid(), woId: z.string().uuid().nullish(),
  title: z.string().trim().min(3).max(200), problem: z.string().trim().max(2000).default(''),
});
const CasePatch = z.object({
  title: z.string().trim().min(3).max(200), problem: z.string().trim().max(2000),
  rootCause: z.string().trim().max(2000).nullable(), rootCauseCategory: z.enum(CATS).nullable(),
  verificationNotes: z.string().trim().max(2000).nullable(), standardizationNotes: z.string().trim().max(2000).nullable(),
  ownerId: z.string().uuid().nullable(),
}).partial();
const COLMAP: Record<string, string> = {
  title: 'title', problem: 'problem', rootCause: 'root_cause', rootCauseCategory: 'root_cause_category',
  verificationNotes: 'verification_notes', standardizationNotes: 'standardization_notes', ownerId: 'owner_id',
};
const ActionDto = z.object({
  kind: z.enum(['corrective', 'preventive']).default('corrective'), description: z.string().trim().min(3).max(1000),
  ownerId: z.string().uuid().nullish(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});
const FmeaDto = z.object({
  plantId: z.string().uuid(), assetId: z.string().uuid(), functionDesc: z.string().trim().min(2).max(300),
  failureModeId: z.string().uuid().nullish(), failureModeText: z.string().trim().max(200).nullish(),
  effect: z.string().trim().min(2).max(500), cause: z.string().trim().min(2).max(500),
  severity: z.number().int().min(1).max(10), occurrence: z.number().int().min(1).max(10), detection: z.number().int().min(1).max(10),
  currentControls: z.string().trim().max(500).nullish(), recommendedAction: z.string().trim().max(500).nullish(), rcaCaseId: z.string().uuid().nullish(),
});
const DateQ = z.object({ plantId: z.string().uuid().optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), limit: z.coerce.number().int().min(1).max(30).default(10) });

const CASE_COLS = `r.id, r.code, r.plant_id as "plantId", r.asset_id as "assetId", a.code as "assetCode", a.name as "assetName", r.wo_id as "woId",
  r.title, r.problem, r.stage, r.root_cause as "rootCause", r.root_cause_category as "rootCauseCategory", r.verification_notes as "verificationNotes",
  r.standardization_notes as "standardizationNotes", r.owner_id as "ownerId", o.full_name as "ownerName", r.created_at as "createdAt", r.closed_at as "closedAt"`;
const CASE_FROM = `from rca_cases r join assets a on a.id = r.asset_id left join users o on o.id = r.owner_id`;

@Controller('rca')
@RequireModule(8)
export class RcaController {
  constructor(private db: DbService) {}

  private run<T>(req: any, fn: (c: PoolClient) => Promise<T>) {
    return this.db.tx(dbCtx(req.user), fn).catch((e) => mapDbError(e));
  }
  private nf(r: { rows: unknown[]; rowCount?: number | null }, what: string) {
    if (!r.rowCount && !r.rows.length) throw new HttpException(`${what} tidak ditemukan`, HttpStatus.NOT_FOUND);
  }

  // ---------- kandidat & master ----------
  @Get('candidates')
  candidates(@Query('plantId') plantId: string | undefined, @Req() req: any) {
    const pid = plantId ? parse(z.string().uuid(), plantId) : null;
    return this.run(req, async (c) => (await c.query(
      `select asset_id as "assetId", code, name, breakdowns, downtime_h as "downtimeH", last_at as "lastAt" from rca_candidates($1)`, [pid])).rows);
  }

  @Post('failure-modes') @Roles('admin', 'supervisor')
  addMode(@Body() b: unknown, @Req() req: any) {
    const d = parse(z.object({ code: z.string().trim().min(2).max(20).toUpperCase(), name: z.string().trim().min(2).max(120),
      category: z.enum(['mekanikal', 'elektrikal', 'instrumentasi', 'proses', 'operasional', 'lainnya']).default('lainnya') }), b);
    return this.run(req, async (c) => (await c.query(
      `insert into failure_modes (org_id, code, name, category) values ($1,$2,$3,$4) returning id, code, name, category, active`, [req.user.org, d.code, d.name, d.category])).rows[0]);
  }
  @Patch('failure-modes/:id') @Roles('admin', 'supervisor')
  patchMode(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(z.object({ name: z.string().trim().min(2).max(120).optional(), active: z.boolean().optional() }), b);
    return this.run(req, async (c) => {
      const r = await c.query(`update failure_modes set name = coalesce($1, name), active = coalesce($2, active) where id = $3 returning id, code, name, category, active`, [d.name ?? null, d.active ?? null, id]);
      this.nf(r, 'Mode kegagalan'); return r.rows[0];
    });
  }

  @Get('people')
  people(@Req() req: any) {
    return this.run(req, async (c) => (await c.query(`select id, full_name as "fullName", role_code as role from users where active order by full_name`)).rows);
  }

  @Get('pareto')
  pareto(@Query() q: unknown, @Req() req: any) {
    const d = parse(DateQ, q);
    return this.run(req, async (c) => (await c.query(
      `select failure_mode_id as "failureModeId", code, name, category, events, downtime_h as "downtimeH", share_pct as "sharePct", cum_pct as "cumPct"
         from kpi_pareto_cause($1,$2,$3,$4)`, [d.from, d.to, d.plantId ?? null, d.limit])).rows);
  }

  // ---------- kasus RCA ----------
  @Get('cases')
  list(@Query() q: unknown, @Req() req: any) {
    const d = parse(z.object({ plantId: z.string().uuid().optional(), assetId: z.string().uuid().optional(), stage: z.enum(['plan', 'do', 'check', 'act', 'closed', 'open']).optional() }), q);
    const w: string[] = []; const p: unknown[] = [];
    if (d.plantId) { p.push(d.plantId); w.push(`r.plant_id = $${p.length}`); }
    if (d.assetId) { p.push(d.assetId); w.push(`r.asset_id = $${p.length}`); }
    if (d.stage === 'open') w.push(`r.stage <> 'closed'`); else if (d.stage) { p.push(d.stage); w.push(`r.stage = $${p.length}`); }
    return this.run(req, async (c) => (await c.query(
      `select ${CASE_COLS}, (select count(*)::int from rca_actions x where x.case_id = r.id) as "actionsTotal",
              (select count(*)::int from rca_actions x where x.case_id = r.id and x.status <> 'open') as "actionsDone" ${CASE_FROM}
        ${w.length ? 'where ' + w.join(' and ') : ''} order by (r.stage = 'closed'), r.created_at desc limit 200`, p)).rows);
  }

  @Get('cases/:id')
  one(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.run(req, async (c) => {
      const r = await c.query(`select ${CASE_COLS} ${CASE_FROM} where r.id = $1`, [id]);
      this.nf(r, 'RCA');
      const whys = await c.query('select id, level, answer from rca_whys where case_id = $1 order by level', [id]);
      const causes = await c.query('select id, category, cause, is_root as "isRoot" from rca_causes where case_id = $1 order by category, id', [id]);
      const actions = await c.query(
        `select x.id, x.kind, x.description, x.owner_id as "ownerId", u.full_name as "ownerName", x.due_date as "dueDate", x.status,
                x.done_at as "doneAt", x.verified_at as "verifiedAt", v.full_name as "verifiedByName", x.verification_note as "verificationNote"
           from rca_actions x left join users u on u.id = x.owner_id left join users v on v.id = x.verified_by where x.case_id = $1 order by x.created_at`, [id]);
      return { ...r.rows[0], whys: whys.rows, causes: causes.rows, actions: actions.rows };
    });
  }

  @Post('cases') @Roles('admin', 'supervisor', 'planner')
  create(@Body() b: unknown, @Req() req: any) {
    const d = parse(CaseDto, b);
    return this.run(req, async (c) => (await c.query(
      `insert into rca_cases (org_id, plant_id, asset_id, wo_id, title, problem, owner_id, created_by) values ($1,$2,$3,$4,$5,$6,$7,$7) returning id, code, stage`,
      [req.user.org, d.plantId, d.assetId, d.woId ?? null, d.title, d.problem, req.user.sub])).rows[0]);
  }

  @Patch('cases/:id') @Roles('admin', 'supervisor', 'planner')
  patch(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(CasePatch, b);
    const keys = Object.keys(d).filter((k) => d[k] !== undefined);
    if (!keys.length) throw new HttpException('Tidak ada perubahan', HttpStatus.BAD_REQUEST);
    return this.run(req, async (c) => {
      const r = await c.query(`update rca_cases set ${keys.map((k, i) => `${COLMAP[k]} = $${i + 1}`).join(', ')} where id = $${keys.length + 1} returning id, stage`, [...keys.map((k) => d[k]), id]);
      this.nf(r, 'RCA'); return r.rows[0];
    });
  }

  /** Pindah tahap PDCA. Syarat tiap tahap ditegakkan trigger DB; Check->Act dan Act->Closed oleh Supervisor/Admin. */
  @Post('cases/:id/stage') @Roles('admin', 'supervisor', 'planner')
  stage(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const { stage } = parse(z.object({ stage: z.enum(['do', 'check', 'act', 'closed']) }), b);
    if ((stage === 'act' || stage === 'closed') && !['supervisor', 'admin'].includes(req.user.role)) throw new HttpException('Hanya Supervisor/Admin yang dapat melanjutkan tahap ini', HttpStatus.FORBIDDEN);
    return this.run(req, async (c) => {
      const r = await c.query('update rca_cases set stage = $1 where id = $2 returning id, stage, closed_at as "closedAt"', [stage, id]);
      this.nf(r, 'RCA'); return r.rows[0];
    });
  }

  @Put('cases/:id/whys/:level') @Roles('admin', 'supervisor', 'planner')
  setWhy(@Param('id', ParseUUIDPipe) id: string, @Param('level') level: string, @Body() b: unknown, @Req() req: any) {
    const lv = parse(z.coerce.number().int().min(1).max(5), level); const { answer } = parse(z.object({ answer: z.string().trim().min(1).max(500) }), b);
    return this.run(req, async (c) => (await c.query(
      `insert into rca_whys (org_id, case_id, level, answer) values ($1,$2,$3,$4) on conflict (case_id, level) do update set answer = excluded.answer returning id, level, answer`,
      [req.user.org, id, lv, answer])).rows[0]);
  }
  @Delete('cases/:id/whys/:level') @Roles('admin', 'supervisor', 'planner')
  delWhy(@Param('id', ParseUUIDPipe) id: string, @Param('level') level: string, @Req() req: any) {
    const lv = parse(z.coerce.number().int().min(1).max(5), level);
    return this.run(req, async (c) => { await c.query('delete from rca_whys where case_id = $1 and level = $2', [id, lv]); return { ok: true }; });
  }

  @Post('cases/:id/causes') @Roles('admin', 'supervisor', 'planner')
  addCause(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(z.object({ category: z.enum(CATS), cause: z.string().trim().min(2).max(300), isRoot: z.boolean().default(false) }), b);
    return this.run(req, async (c) => (await c.query(
      `insert into rca_causes (org_id, case_id, category, cause, is_root) values ($1,$2,$3,$4,$5) returning id, category, cause, is_root as "isRoot"`,
      [req.user.org, id, d.category, d.cause, d.isRoot])).rows[0]);
  }
  @Delete('cases/:id/causes/:causeId') @Roles('admin', 'supervisor', 'planner')
  delCause(@Param('id', ParseUUIDPipe) id: string, @Param('causeId', ParseUUIDPipe) causeId: string, @Req() req: any) {
    return this.run(req, async (c) => { await c.query('delete from rca_causes where id = $1 and case_id = $2', [causeId, id]); return { ok: true }; });
  }

  // ---------- tindakan ----------
  @Post('cases/:id/actions') @Roles('admin', 'supervisor', 'planner')
  addAction(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(ActionDto, b);
    return this.run(req, async (c) => (await c.query(
      `insert into rca_actions (org_id, case_id, kind, description, owner_id, due_date) values ($1,$2,$3,$4,$5,$6) returning id, kind, description, status`,
      [req.user.org, id, d.kind, d.description, d.ownerId ?? null, d.dueDate ?? null])).rows[0]);
  }
  @Delete('cases/:id/actions/:actionId') @Roles('admin', 'supervisor', 'planner')
  delAction(@Param('id', ParseUUIDPipe) id: string, @Param('actionId', ParseUUIDPipe) actionId: string, @Req() req: any) {
    return this.run(req, async (c) => { await c.query(`delete from rca_actions where id = $1 and case_id = $2 and status = 'open'`, [actionId, id]); return { ok: true }; });
  }
  @Post('cases/:id/actions/:actionId/done') @Roles('admin', 'supervisor', 'planner')
  doneAction(@Param('id', ParseUUIDPipe) id: string, @Param('actionId', ParseUUIDPipe) actionId: string, @Req() req: any) {
    return this.run(req, async (c) => {
      const r = await c.query(`update rca_actions set status = 'done' where id = $1 and case_id = $2 and status = 'open' returning id, status`, [actionId, id]);
      this.nf(r, 'Tindakan terbuka'); return r.rows[0];
    });
  }
  @Post('cases/:id/actions/:actionId/verify') @Roles('admin', 'supervisor')
  verifyAction(@Param('id', ParseUUIDPipe) id: string, @Param('actionId', ParseUUIDPipe) actionId: string, @Body() b: unknown, @Req() req: any) {
    const { note } = parse(z.object({ note: z.string().trim().max(500).default('') }), b);
    return this.run(req, async (c) => {
      const r = await c.query(`update rca_actions set status = 'verified', verified_by = $1, verification_note = $2 where id = $3 and case_id = $4 and status = 'done' returning id, status`, [req.user.sub, note, actionId, id]);
      this.nf(r, 'Tindakan berstatus selesai'); return r.rows[0];
    });
  }

  // ---------- FMEA ----------
  @Get('fmea')
  fmea(@Query() q: unknown, @Req() req: any) {
    const d = parse(z.object({ plantId: z.string().uuid().optional(), assetId: z.string().uuid().optional() }), q);
    const w: string[] = []; const p: unknown[] = [];
    if (d.plantId) { p.push(d.plantId); w.push(`f.plant_id = $${p.length}`); }
    if (d.assetId) { p.push(d.assetId); w.push(`f.asset_id = $${p.length}`); }
    return this.run(req, async (c) => (await c.query(
      `select f.id, f.plant_id as "plantId", f.asset_id as "assetId", a.code as "assetCode", a.name as "assetName", f.function_desc as "functionDesc",
              f.failure_mode_id as "failureModeId", coalesce(m.name, f.failure_mode_text) as "failureMode", f.effect, f.cause, f.severity, f.occurrence, f.detection, f.rpn,
              f.current_controls as "currentControls", f.recommended_action as "recommendedAction", f.status, f.rca_case_id as "rcaCaseId"
         from fmea_items f join assets a on a.id = f.asset_id left join failure_modes m on m.id = f.failure_mode_id
        ${w.length ? 'where ' + w.join(' and ') : ''} order by f.rpn desc, a.code limit 500`, p)).rows);
  }
  @Get('fmea/suggest')
  suggest(@Query() q: unknown, @Req() req: any) {
    const d = parse(z.object({ assetId: z.string().uuid(), failureModeId: z.string().uuid().optional() }), q);
    return this.run(req, async (c) => (await c.query('select events, occurrence from fmea_suggest_occurrence($1,$2)', [d.assetId, d.failureModeId ?? null])).rows[0]);
  }
  @Post('fmea') @Roles('admin', 'supervisor', 'planner')
  addFmea(@Body() b: unknown, @Req() req: any) {
    const d = parse(FmeaDto, b);
    if (!d.failureModeId && !d.failureModeText) throw new HttpException('Pilih atau isi mode kegagalan', HttpStatus.BAD_REQUEST);
    return this.run(req, async (c) => (await c.query(
      `insert into fmea_items (org_id, plant_id, asset_id, function_desc, failure_mode_id, failure_mode_text, effect, cause, severity, occurrence, detection, current_controls, recommended_action, rca_case_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id, rpn`,
      [req.user.org, d.plantId, d.assetId, d.functionDesc, d.failureModeId ?? null, d.failureModeText ?? null, d.effect, d.cause, d.severity, d.occurrence, d.detection, d.currentControls ?? null, d.recommendedAction ?? null, d.rcaCaseId ?? null])).rows[0]);
  }
  @Patch('fmea/:id') @Roles('admin', 'supervisor', 'planner')
  patchFmea(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(z.object({ severity: z.number().int().min(1).max(10), occurrence: z.number().int().min(1).max(10), detection: z.number().int().min(1).max(10),
      status: z.enum(['open', 'mitigated', 'accepted']), recommendedAction: z.string().trim().max(500).nullable(), currentControls: z.string().trim().max(500).nullable() }).partial(), b);
    const map: Record<string, string> = { severity: 'severity', occurrence: 'occurrence', detection: 'detection', status: 'status', recommendedAction: 'recommended_action', currentControls: 'current_controls' };
    const keys = Object.keys(d).filter((k) => d[k] !== undefined);
    if (!keys.length) throw new HttpException('Tidak ada perubahan', HttpStatus.BAD_REQUEST);
    return this.run(req, async (c) => {
      const r = await c.query(`update fmea_items set ${keys.map((k, i) => `${map[k]} = $${i + 1}`).join(', ')} where id = $${keys.length + 1} returning id, rpn, status`, [...keys.map((k) => d[k]), id]);
      this.nf(r, 'Item FMEA'); return r.rows[0];
    });
  }
  @Delete('fmea/:id') @Roles('admin', 'supervisor')
  delFmea(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.run(req, async (c) => { await c.query('delete from fmea_items where id = $1', [id]); return { ok: true }; });
  }
}

/** Daftar mode kegagalan dibaca saat WO diselesaikan (modul 3), jadi tidak ikut gerbang modul 8. */
@Controller('failure-modes')
@RequireModule(3)
export class FailureModesController {
  constructor(private db: DbService) {}
  @Get()
  list(@Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => (await c.query(`select id, code, name, category, active from failure_modes order by active desc, category, code`)).rows);
  }
}
