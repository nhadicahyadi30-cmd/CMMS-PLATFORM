import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, Res } from '@nestjs/common';
import { z } from 'zod';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { dbCtx, RequireModule, Roles } from '../auth/auth.guard';
import { mapDbError, parse } from '../common/http';
import { config } from '../config';
import { MailerService } from './mailer';
import { periodFor } from './report-period';
import { ReportsService, Scope } from './reports.service';

const D = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD');
const Freq = z.enum(['daily', 'weekly', 'monthly', 'yearly']);
const Emails = z.array(z.string().trim().toLowerCase().email('Alamat email tidak valid').max(200)).min(1, 'Minimal satu penerima').max(20, 'Maksimal 20 penerima').transform((a) => [...new Set(a)]);
const Gen = z.object({ frequency: Freq, date: D, plantId: z.string().uuid().nullish() });
const Send = Gen.extend({ recipients: Emails });
const Sched = z.object({ name: z.string().trim().min(1).max(120), frequency: Freq, sendHour: z.number().int().min(0).max(23).default(7), plantId: z.string().uuid().nullish(), recipients: Emails, active: z.boolean().default(true) });
const SchedPatch = Sched.partial();

const row = (r: any) => ({ id: r.id, name: r.name, frequency: r.frequency, sendHour: r.send_hour, plantId: r.plant_id, plantName: r.plant_name ?? null, recipients: r.recipients, active: r.active,
  lastPeriodTo: r.last_period_to_s ?? null, failCount: r.fail_count, nextPeriodFrom: r.next_from ?? null, nextPeriodTo: r.next_to ?? null });

/** Laporan otomatis & unduh PDF (modul 9). Jadwal dan pengiriman email hanya untuk admin/supervisor. */
@Controller('reports')
@RequireModule(9)
export class ReportsController {
  constructor(private db: DbService, private svc: ReportsService, private mail: MailerService) {}

  private scope(g: { frequency: any; date: string; plantId?: string | null }): Scope {
    try { const p = periodFor(g.frequency, g.date); return { freq: g.frequency, from: p.from, to: p.to, plantId: g.plantId ?? null }; }
    catch (e: any) { throw new HttpException(e.message, HttpStatus.BAD_REQUEST); }
  }
  /** Laporan yang dikirim ke luar aplikasi tidak boleh melampaui plant milik pengirim. */
  private assertScope(u: any, plantId: string | null | undefined) {
    if (!plantId && !u.all) throw new HttpException('Pilih plant tertentu: akun Anda tidak punya akses ke semua plant', HttpStatus.FORBIDDEN);
  }
  private audit(c: PoolClient, u: any, event: string, id: string | null, detail: object) {
    return c.query('insert into audit_log (org_id, user_id, event, entity, entity_id, detail) values ($1,$2,$3,$4,$5,$6)', [u.org, u.sub, event, 'report', id, JSON.stringify(detail)]);
  }

  @Get('status') @Roles('admin', 'supervisor', 'planner')
  status() { return { emailEnabled: this.mail.enabled, from: this.mail.enabled ? this.mail.from : null, schedulerEnabled: config.reportsScheduler && this.mail.enabled }; }

  @Post('pdf') @Roles('admin', 'supervisor', 'planner')
  async pdf(@Body() body: unknown, @Req() req: any, @Res() res: any) {
    const g = parse(Gen, body); const s = this.scope(g);
    try {
      const { data, pdf } = await this.db.tx(dbCtx(req.user), (c) => this.svc.generate(c, s));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${this.svc.fileName(data)}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(pdf);
    } catch (e) { mapDbError(e); }
  }

  @Post('send') @Roles('admin', 'supervisor')
  async send(@Body() body: unknown, @Req() req: any) {
    const g = parse(Send, body); const u = req.user; const s = this.scope(g); this.assertScope(u, g.plantId);
    if (!this.mail.enabled) throw new HttpException('Email belum dikonfigurasi di server (SMTP_HOST dan SMTP_FROM)', HttpStatus.SERVICE_UNAVAILABLE);
    try {
      return await this.db.tx(dbCtx(u), async (c) => {
        const r = await this.svc.deliver(c, { scope: s, to: g.recipients, kind: 'manual', userId: u.sub, orgId: u.org });
        await this.audit(c, u, 'report_send', null, { ...s, to: g.recipients, ok: r.ok });
        return r;
      });
    } catch (e) { mapDbError(e); }
  }

  // ---- Jadwal ----
  private readonly SELECT = `select s.*, to_char(s.last_period_to, 'YYYY-MM-DD') as last_period_to_s, pl.name as plant_name,
      to_char(p.p_from, 'YYYY-MM-DD') as next_from, to_char(p.p_to, 'YYYY-MM-DD') as next_to
    from report_schedules s left join plants pl on pl.id = s.plant_id, lateral report_period(s.frequency, s.send_hour) p`;

  @Get('schedules') @Roles('admin', 'supervisor')
  schedules(@Req() req: any) { return this.db.tx(dbCtx(req.user), async (c) => (await c.query(`${this.SELECT} order by s.created_at desc`)).rows.map(row)); }

  @Post('schedules') @Roles('admin', 'supervisor')
  async create(@Body() body: unknown, @Req() req: any) {
    const b = parse(Sched, body); const u = req.user; this.assertScope(u, b.plantId);
    try {
      return await this.db.tx(dbCtx(u), async (c) => {
        const r = await c.query('insert into report_schedules (org_id, plant_id, name, frequency, send_hour, recipients, active, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id',
          [u.org, b.plantId ?? null, b.name, b.frequency, b.sendHour, b.recipients, b.active, u.sub]);
        await this.audit(c, u, 'report_schedule_create', r.rows[0].id, { name: b.name, frequency: b.frequency, to: b.recipients });
        return { id: r.rows[0].id };
      });
    } catch (e) { mapDbError(e); }
  }

  @Patch('schedules/:id') @Roles('admin', 'supervisor')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: any) {
    const b = parse(SchedPatch, body); const u = req.user; if (b.plantId !== undefined) this.assertScope(u, b.plantId);
    const map: [string, unknown][] = [['name', b.name], ['frequency', b.frequency], ['send_hour', b.sendHour], ['plant_id', b.plantId], ['recipients', b.recipients], ['active', b.active]];
    const set = map.filter(([, v]) => v !== undefined);
    if (!set.length) throw new HttpException('Tidak ada perubahan', HttpStatus.BAD_REQUEST);
    try {
      return await this.db.tx(dbCtx(u), async (c) => {
        const r = await c.query(`update report_schedules set ${set.map(([k], i) => `${k} = $${i + 2}`).join(', ')} where id = $1 returning id`, [id, ...set.map(([, v]) => v ?? null)]);
        if (!r.rowCount) throw new HttpException('Jadwal tidak ditemukan', HttpStatus.NOT_FOUND);
        await this.audit(c, u, 'report_schedule_update', id, Object.fromEntries(set.filter(([k]) => k !== 'recipients')));
        return { ok: true };
      });
    } catch (e) { mapDbError(e); }
  }

  @Delete('schedules/:id') @Roles('admin', 'supervisor')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    try {
      return await this.db.tx(dbCtx(req.user), async (c) => {
        const r = await c.query('delete from report_schedules where id = $1', [id]);
        if (!r.rowCount) throw new HttpException('Jadwal tidak ditemukan', HttpStatus.NOT_FOUND);
        await this.audit(c, req.user, 'report_schedule_delete', id, {});
        return { ok: true };
      });
    } catch (e) { mapDbError(e); }
  }

  /** Kirim sekarang periode terakhir yang jatuh tempo untuk jadwal ini (tidak mengubah titik awal jadwal). */
  @Post('schedules/:id/run-now') @Roles('admin', 'supervisor')
  async runNow(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const u = req.user;
    if (!this.mail.enabled) throw new HttpException('Email belum dikonfigurasi di server (SMTP_HOST dan SMTP_FROM)', HttpStatus.SERVICE_UNAVAILABLE);
    try {
      return await this.db.tx(dbCtx(u), async (c) => {
        const s = (await c.query(`select s.frequency, s.plant_id, s.recipients, to_char(p.p_from, 'YYYY-MM-DD') as f, to_char(p.p_to, 'YYYY-MM-DD') as t
                                    from report_schedules s, lateral report_period(s.frequency, s.send_hour) p where s.id = $1`, [id])).rows[0];
        if (!s) throw new HttpException('Jadwal tidak ditemukan', HttpStatus.NOT_FOUND);
        const r = await this.svc.deliver(c, { scope: { freq: s.frequency, from: s.f, to: s.t, plantId: s.plant_id }, to: s.recipients, kind: 'manual', scheduleId: id, userId: u.sub, orgId: u.org });
        await this.audit(c, u, 'report_send', id, { to: s.recipients, ok: r.ok });
        return r;
      });
    } catch (e) { mapDbError(e); }
  }

  @Get('runs') @Roles('admin', 'supervisor')
  runs(@Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => (await c.query(
      `select r.id, r.kind, r.frequency, r.status, r.recipients, r.bytes, r.error, to_char(r.period_from, 'YYYY-MM-DD') as period_from, to_char(r.period_to, 'YYYY-MM-DD') as period_to,
              to_char(r.at at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI') as at, s.name as schedule_name
         from report_runs r left join report_schedules s on s.id = r.schedule_id order by r.at desc limit 50`)).rows
      .map((r) => ({ id: r.id, kind: r.kind, frequency: r.frequency, status: r.status, recipients: r.recipients, bytes: r.bytes, error: r.error, periodFrom: r.period_from, periodTo: r.period_to, at: r.at, scheduleName: r.schedule_name })));
  }
}

