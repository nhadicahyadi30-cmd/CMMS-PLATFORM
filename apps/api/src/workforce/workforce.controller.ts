import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { dbCtx, RequireModule, Roles, DenyRoles } from '../auth/auth.guard';
import { mapDbError, parse } from '../common/http';
import {
  Absence, addDays, Candidate, Capacity, DEFAULT_SETTINGS, evaluate, LEVELS, Settings, SettingsDto, skillCoverage, suggest, techCapacity, techStatus,
  TechSkill, totalDemand, unplannedH, woRemainingH, workingDays,
} from './workload.rules';

const Q = z.object({ days: z.coerce.number().int().min(1).max(31).default(7), plantId: z.string().uuid().optional() });
const SkillDto = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,20}$/, 'Kode 2-20 karakter: huruf, angka, - atau _'), name: z.string().trim().min(2).max(80), minCoverage: z.number().int().min(1).max(50).default(2), active: z.boolean().default(true) });
const CellDto = z.object({ technicianId: z.string().uuid(), skillId: z.string().uuid(), level: z.number().int().min(0).max(4), certifiedUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), note: z.string().max(200).default('') });
const AbsDto = z.object({ technicianId: z.string().uuid(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.enum(['cuti', 'sakit', 'pelatihan', 'lainnya']).default('cuti'), note: z.string().max(200).default('') });

const num = (x: unknown) => Number(x ?? 0);

interface Ctx {
  today: string; windowDays: number; workDays: string[]; settings: Settings;
  techs: { id: string; code: string; name: string; plantId: string; shift: string; dailyH: number; active: boolean }[];
  caps: Map<string, Capacity>; absent: Set<string>; levels: TechSkill[];
  skills: { id: string; code: string; name: string; minCoverage: number; active: boolean }[];
  assigned: Map<string, number>;                           // jam sisa WO aktif per teknisi
  open: { id: string; code: string; title: string; status: string; priority: string; plantId: string; technicianId: string | null; remH: number; skillId: string | null; minLevel: number }[];
  pm: { id: string; name: string; plantId: string; remH: number; skillId: string | null; nextDue: string; overdue: boolean }[];
  historyH: number;
}

@Controller('workforce')
@RequireModule(3)
@DenyRoles('production')
export class WorkforceController {
  constructor(private db: DbService) {}

  // ---------- pengaturan ----------
  private async settings(c: PoolClient, org: string): Promise<Settings> {
    await c.query('insert into workforce_settings (org_id) values ($1) on conflict do nothing', [org]);
    const r = (await c.query(`select productive_factor, reserve_pct, workdays_per_week, ot_max_day_h, ot_max_week_h, target_util from workforce_settings where org_id = $1`, [org])).rows[0];
    return r ? { productiveFactor: num(r.productive_factor), reservePct: num(r.reserve_pct), workdaysPerWeek: num(r.workdays_per_week), otMaxDayH: num(r.ot_max_day_h), otMaxWeekH: num(r.ot_max_week_h), targetUtil: num(r.target_util) } : DEFAULT_SETTINGS;
  }

  @Get('settings')
  getSettings(@Req() req: any) { return this.db.tx(dbCtx(req.user), (c) => this.settings(c, req.user.org)); }

  @Put('settings') @Roles('admin')
  async putSettings(@Body() b: unknown, @Req() req: any) {
    const d = parse(SettingsDto, b);
    try {
      return await this.db.tx(dbCtx(req.user), async (c) => {
        const cur = await this.settings(c, req.user.org); const n = { ...cur, ...d };
        await c.query(`update workforce_settings set productive_factor=$2, reserve_pct=$3, workdays_per_week=$4, ot_max_day_h=$5, ot_max_week_h=$6, target_util=$7 where org_id=$1`,
          [req.user.org, n.productiveFactor, n.reservePct, n.workdaysPerWeek, n.otMaxDayH, n.otMaxWeekH, n.targetUtil]);
        await c.query(`insert into audit_log (org_id, user_id, event, entity, entity_id, detail) values ($1,$2,'workforce_settings','workforce_settings',$1,$3)`, [req.user.org, req.user.sub, JSON.stringify(d)]);
        return n;
      });
    } catch (e) { mapDbError(e); }
  }

  // ---------- konteks perhitungan (dipakai overview, matriks, saran) ----------
  private async load(c: PoolClient, org: string, days: number, plantId?: string): Promise<Ctx> {
    const settings = await this.settings(c, org);
    const today: string = (await c.query(`select to_char(now() at time zone 'Asia/Jakarta','YYYY-MM-DD') as d`)).rows[0].d;
    const end = addDays(today, days - 1); const workDays = workingDays(today, days, settings.workdaysPerWeek);
    const pf = plantId ? [plantId] : [];
    const techRows = (await c.query(`select id, code, full_name, plant_id, shift, daily_capacity_h, active from technicians where active ${plantId ? 'and plant_id = $1' : ''} order by full_name`, pf)).rows;
    const techs = techRows.map((t: any) => ({ id: t.id, code: t.code, name: t.full_name, plantId: t.plant_id, shift: t.shift, dailyH: num(t.daily_capacity_h), active: t.active }));
    const ids = techs.map((t) => t.id);
    const absRows = ids.length ? (await c.query(`select technician_id, to_char(from_date,'YYYY-MM-DD') as f, to_char(to_date,'YYYY-MM-DD') as t from technician_absences where technician_id = any($1) and to_date >= $2::date and from_date <= $3::date`, [ids, today, end])).rows : [];
    const absBy = new Map<string, Absence[]>(); const absent = new Set<string>();
    for (const a of absRows) { (absBy.get(a.technician_id) ?? absBy.set(a.technician_id, []).get(a.technician_id)!).push({ from: a.f, to: a.t }); if (a.f <= today && a.t >= today) absent.add(a.technician_id); }
    const caps = new Map<string, Capacity>(); for (const t of techs) caps.set(t.id, techCapacity({ id: t.id, dailyCapacityH: t.dailyH, absences: absBy.get(t.id) ?? [] }, workDays, days, settings));
    const levels: TechSkill[] = ids.length ? (await c.query(`select technician_id, skill_id, level, to_char(certified_until,'YYYY-MM-DD') as cu from technician_skills where technician_id = any($1)`, [ids])).rows.map((r: any) => ({ technicianId: r.technician_id, skillId: r.skill_id, level: r.level, certifiedUntil: r.cu })) : [];
    const skills = (await c.query(`select id, code, name, min_coverage, active from skills order by code`)).rows.map((s: any) => ({ id: s.id, code: s.code, name: s.name, minCoverage: s.min_coverage, active: s.active }));
    const wos = (await c.query(
      `select id, code, title, status, priority, plant_id, technician_id, est_hours, skill_id, skill_min_level from work_orders
        where status in ('waiting','approved','assigned','progress') ${plantId ? 'and plant_id = $1' : ''} order by priority, created_at`, pf)).rows;
    const assigned = new Map<string, number>(); const open: Ctx['open'] = [];
    for (const w of wos) {
      const remH = woRemainingH({ status: w.status, estHours: num(w.est_hours) });
      if (w.technician_id) assigned.set(w.technician_id, (assigned.get(w.technician_id) ?? 0) + remH);
      open.push({ id: w.id, code: w.code, title: w.title, status: w.status, priority: w.priority, plantId: w.plant_id, technicianId: w.technician_id, remH, skillId: w.skill_id, minLevel: w.skill_min_level });
    }
    // PM kalender yang jatuh tempo dalam jendela dan belum punya WO (berbasis meter tidak ikut dihitung)
    const pm = (await c.query(
      `select p.id, p.name, p.plant_id, p.est_hours, p.skill_id, to_char(p.next_due,'YYYY-MM-DD') as nd from pm_plans p
        where p.active and p.trigger_type = 'calendar' and p.next_due is not null and p.next_due <= $1::date ${plantId ? 'and p.plant_id = $2' : ''}
          and not exists (select 1 from work_orders w where w.pm_plan_id = p.id and w.pm_due = p.next_due and w.status <> 'rejected')`, [end, ...pf])).rows
      .map((p: any) => ({ id: p.id, name: p.name, plantId: p.plant_id, remH: num(p.est_hours), skillId: p.skill_id, nextDue: p.nd, overdue: p.nd < today }));
    const hist = (await c.query(
      `select coalesce(sum(coalesce(actual_hours, est_hours)),0) as h from work_orders
        where status in ('done','closed') and wo_type in ('breakdown','emergency','corrective') and done_at >= now() - interval '30 days' ${plantId ? 'and plant_id = $1' : ''}`, pf)).rows[0];
    return { today, windowDays: days, workDays, settings, techs, caps, absent, levels, skills, assigned, open, pm, historyH: num(hist.h) };
  }

  private skillDemand(x: Ctx, skillId: string): number {
    return x.open.filter((w) => w.skillId === skillId).reduce((a, w) => a + w.remH, 0) + x.pm.filter((p) => p.skillId === skillId).reduce((a, p) => a + p.remH, 0);
  }
  private candidates(x: Ctx, skillId: string | null): Candidate[] {
    return x.techs.map((t) => ({
      id: t.id, name: t.name, plantId: t.plantId, shift: t.shift, absentToday: x.absent.has(t.id),
      level: skillId ? (x.levels.find((l) => l.technicianId === t.id && l.skillId === skillId)?.level ?? 0) : 0,
      loadH: x.assigned.get(t.id) ?? 0, capacityH: x.caps.get(t.id)?.productiveH ?? 0,
    }));
  }

  // ---------- ringkasan beban & kebutuhan teknisi ----------
  @Get('overview')
  overview(@Query() q: unknown, @Req() req: any) {
    const f = parse(Q, q);
    return this.db.tx(dbCtx(req.user), async (c) => {
      const x = await this.load(c, req.user.org, f.days, f.plantId); const s = x.settings;
      const capList = [...x.caps.values()]; const capTotal = capList.reduce((a, k) => a + k.productiveH, 0);
      const assignedH = [...x.assigned.values()].reduce((a, v) => a + v, 0);
      const backlogH = x.open.filter((w) => !w.technicianId).reduce((a, w) => a + w.remH, 0);
      const pmH = x.pm.reduce((a, p) => a + p.remH, 0);
      const demand = { assignedH, backlogH, pmH, unplannedH: unplannedH(x.historyH, f.days, capTotal, s.reservePct) };
      const total = totalDemand(demand);
      const team = evaluate(total, capList, f.days, x.workDays.length, s);
      const r1 = (n: number) => Math.round(n * 10) / 10;

      const byTechnician = x.techs.map((t) => {
        const cap = x.caps.get(t.id)!; const load = x.assigned.get(t.id) ?? 0; const st = techStatus(load, cap, s);
        const wos = x.open.filter((w) => w.technicianId === t.id).length;
        return { id: t.id, code: t.code, name: t.name, shift: t.shift, plantId: t.plantId, workDays: cap.days, absentDays: cap.absentDays, capacityH: r1(cap.productiveH), loadH: r1(load), openWo: wos, absentToday: x.absent.has(t.id), ...st };
      });
      const shifts = [...new Set(x.techs.map((t) => t.shift))].sort();
      const byShift = shifts.map((sh) => {
        const ts = x.techs.filter((t) => t.shift === sh); const cap = ts.reduce((a, t) => a + x.caps.get(t.id)!.productiveH, 0); const load = ts.reduce((a, t) => a + (x.assigned.get(t.id) ?? 0), 0);
        return { shift: sh, technicians: ts.length, capacityH: r1(cap), loadH: r1(load), utilization: cap > 0 ? Math.round((load / cap) * 100) / 100 : null };
      });
      const techInfo = x.techs.map((t) => ({ id: t.id, shift: t.shift, productiveH: x.caps.get(t.id)!.productiveH, active: t.active }));
      const bySkill = x.skills.filter((k) => k.active).map((k) => ({ id: k.id, code: k.code, name: k.name, minCoverage: k.minCoverage, ...skillCoverage(k, techInfo, x.levels, this.skillDemand(x, k.id), x.today) }));

      const skillName = new Map(x.skills.map((k) => [k.id, k]));
      const backlog = x.open.filter((w) => !w.technicianId).slice(0, 30).map((w) => ({
        id: w.id, code: w.code, title: w.title, status: w.status, priority: w.priority, remH: r1(w.remH),
        skill: w.skillId ? { id: w.skillId, code: skillName.get(w.skillId)?.code ?? '', minLevel: w.minLevel } : null,
        suggestions: suggest({ estH: w.remH, minLevel: w.minLevel, plantId: w.plantId, hasSkill: !!w.skillId }, this.candidates(x, w.skillId), 3),
      }));
      return {
        window: { from: x.today, days: f.days, to: addDays(x.today, f.days - 1), workDays: x.workDays.length }, settings: s,
        demand: { ...Object.fromEntries(Object.entries(demand).map(([k, v]) => [k, r1(v)])), totalH: r1(total), historyH30: r1(x.historyH), pmPlans: x.pm.length, pmOverdue: x.pm.filter((p) => p.overdue).length },
        team, byTechnician, byShift, bySkill, backlog, levels: LEVELS,
      };
    });
  }

  // ---------- skill & matriks ----------
  @Get('skills')
  skills(@Req() req: any) { return this.db.tx(dbCtx(req.user), async (c) => (await c.query(`select id, code, name, min_coverage as "minCoverage", active from skills order by code`)).rows); }

  @Post('skills') @Roles('admin', 'supervisor', 'planner')
  async createSkill(@Body() b: unknown, @Req() req: any) {
    const d = parse(SkillDto, b);
    try { return await this.db.tx(dbCtx(req.user), async (c) => (await c.query(`insert into skills (org_id, code, name, min_coverage, active) values ($1,$2,$3,$4,$5) returning id, code, name, min_coverage as "minCoverage", active`, [req.user.org, d.code, d.name, d.minCoverage, d.active])).rows[0]); }
    catch (e) { mapDbError(e); }
  }
  @Put('skills/:id') @Roles('admin', 'supervisor', 'planner')
  async updateSkill(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(SkillDto, b);
    try {
      return await this.db.tx(dbCtx(req.user), async (c) => {
        const r = await c.query(`update skills set code=$2, name=$3, min_coverage=$4, active=$5 where id=$1 returning id, code, name, min_coverage as "minCoverage", active`, [id, d.code, d.name, d.minCoverage, d.active]);
        if (!r.rows[0]) throw new HttpException('Skill tidak ditemukan', HttpStatus.NOT_FOUND);
        return r.rows[0];
      });
    } catch (e) { mapDbError(e); }
  }
  @Delete('skills/:id') @Roles('admin', 'supervisor')
  async deleteSkill(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => {
      const r = await c.query('delete from skills where id = $1 returning id', [id]);
      if (!r.rows[0]) throw new HttpException('Skill tidak ditemukan', HttpStatus.NOT_FOUND);
      await c.query(`insert into audit_log (org_id, user_id, event, entity, entity_id, detail) values ($1,$2,'skill_delete','skill',$3,'{}')`, [req.user.org, req.user.sub, id]);
      return { ok: true };
    });
  }

  @Get('matrix')
  matrix(@Query() q: unknown, @Req() req: any) {
    const f = parse(Q, q);
    return this.db.tx(dbCtx(req.user), async (c) => {
      const x = await this.load(c, req.user.org, f.days, f.plantId);
      const techInfo = x.techs.map((t) => ({ id: t.id, shift: t.shift, productiveH: x.caps.get(t.id)!.productiveH, active: t.active }));
      const coverage = x.skills.filter((k) => k.active).map((k) => ({ skillId: k.id, ...skillCoverage(k, techInfo, x.levels, this.skillDemand(x, k.id), x.today) }));
      return {
        levels: LEVELS, today: x.today,
        skills: x.skills.map((k) => ({ id: k.id, code: k.code, name: k.name, minCoverage: k.minCoverage, active: k.active })),
        technicians: x.techs.map((t) => ({ id: t.id, code: t.code, name: t.name, shift: t.shift, plantId: t.plantId })),
        cells: x.levels.map((l) => ({ technicianId: l.technicianId, skillId: l.skillId, level: l.level, certifiedUntil: l.certifiedUntil })),
        coverage,
      };
    });
  }

  @Put('matrix') @Roles('admin', 'supervisor', 'planner')
  async setCell(@Body() b: unknown, @Req() req: any) {
    const d = parse(CellDto, b);
    try {
      return await this.db.tx(dbCtx(req.user), async (c) => {
        // RLS membatasi teknisi/skill yang terlihat; di luar itu dianggap tidak ditemukan
        const ok = (await c.query('select (select count(*) from technicians where id = $1) as t, (select count(*) from skills where id = $2) as s', [d.technicianId, d.skillId])).rows[0];
        if (!num(ok.t) || !num(ok.s)) throw new HttpException('Teknisi atau skill tidak ditemukan', HttpStatus.NOT_FOUND);
        if (d.level === 0 && !d.certifiedUntil) { await c.query('delete from technician_skills where technician_id = $1 and skill_id = $2', [d.technicianId, d.skillId]); return { technicianId: d.technicianId, skillId: d.skillId, level: 0 }; }
        const r = await c.query(
          `insert into technician_skills (org_id, technician_id, skill_id, level, certified_until, note, updated_by) values ($1,$2,$3,$4,$5,$6,$7)
           on conflict (technician_id, skill_id) do update set level = excluded.level, certified_until = excluded.certified_until, note = excluded.note, updated_by = excluded.updated_by, updated_at = now()
           returning technician_id as "technicianId", skill_id as "skillId", level, to_char(certified_until,'YYYY-MM-DD') as "certifiedUntil"`,
          [req.user.org, d.technicianId, d.skillId, d.level, d.certifiedUntil ?? null, d.note, req.user.sub]);
        return r.rows[0];
      });
    } catch (e) { mapDbError(e); }
  }

  // ---------- cuti / absen ----------
  @Get('absences')
  absences(@Query('technicianId') technicianId: string | undefined, @Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => (await c.query(
      `select a.id, a.technician_id as "technicianId", t.full_name as "technicianName", to_char(a.from_date,'YYYY-MM-DD') as "from", to_char(a.to_date,'YYYY-MM-DD') as "to", a.reason, a.note
         from technician_absences a join technicians t on t.id = a.technician_id
        where a.to_date >= current_date - 7 ${technicianId ? 'and a.technician_id = $1' : ''} order by a.from_date`, technicianId ? [technicianId] : [])).rows);
  }
  @Post('absences') @Roles('admin', 'supervisor', 'planner')
  async addAbsence(@Body() b: unknown, @Req() req: any) {
    const d = parse(AbsDto, b);
    if (d.to < d.from) throw new HttpException('Tanggal selesai tidak boleh sebelum tanggal mulai', HttpStatus.BAD_REQUEST);
    try {
      return await this.db.tx(dbCtx(req.user), async (c) => {
        const t = await c.query('select 1 from technicians where id = $1', [d.technicianId]);
        if (!t.rows[0]) throw new HttpException('Teknisi tidak ditemukan', HttpStatus.NOT_FOUND);
        return (await c.query(`insert into technician_absences (org_id, technician_id, from_date, to_date, reason, note) values ($1,$2,$3,$4,$5,$6) returning id`, [req.user.org, d.technicianId, d.from, d.to, d.reason, d.note])).rows[0];
      });
    } catch (e) { mapDbError(e); }
  }
  @Delete('absences/:id') @Roles('admin', 'supervisor', 'planner')
  async delAbsence(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => {
      const r = await c.query('delete from technician_absences where id = $1 returning id', [id]);
      if (!r.rows[0]) throw new HttpException('Data tidak ditemukan', HttpStatus.NOT_FOUND);
      return { ok: true };
    });
  }

  // ---------- rekomendasi penugasan untuk satu WO ----------
  @Get('suggest')
  suggestFor(@Query('woId', ParseUUIDPipe) woId: string, @Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => {
      const w = (await c.query('select id, code, title, plant_id, est_hours, skill_id, skill_min_level from work_orders where id = $1', [woId])).rows[0];
      if (!w) throw new HttpException('WO tidak ditemukan', HttpStatus.NOT_FOUND);
      const x = await this.load(c, req.user.org, 7);
      return { wo: { id: w.id, code: w.code, title: w.title, skillId: w.skill_id, minLevel: w.skill_min_level }, suggestions: suggest({ estH: num(w.est_hours), minLevel: w.skill_min_level, plantId: w.plant_id, hasSkill: !!w.skill_id }, this.candidates(x, w.skill_id), 5) };
    });
  }
}
