import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DbContext, DbService } from '../db/db.service';
import { MailerService } from './mailer';
import { buildReport, ReportData } from './report-data';
import { renderReportPdf } from './report-pdf';
import { Freq } from './report-period';
import { periodText, summarize, TITLES } from './report-summary';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const MAX_FAILS = 3;

export interface Scope { freq: Freq; from: string; to: string; plantId: string | null }

@Injectable()
export class ReportsService {
  private log = new Logger('Reports');
  constructor(private db: DbService, private mail: MailerService) {}

  /** Data + PDF dalam satu transaksi berkonteks RLS: pemanggil hanya mendapat angka dari plant yang boleh ia lihat. */
  async generate(c: PoolClient, s: Scope): Promise<{ data: ReportData; pdf: Buffer }> {
    if (s.plantId && !(await c.query('select 1 from plants where id = $1', [s.plantId])).rowCount) throw new HttpException('Plant tidak ditemukan atau Anda tidak punya akses', HttpStatus.FORBIDDEN);
    const data = await buildReport(c, s);
    return { data, pdf: Buffer.from(await renderReportPdf(data)) };
  }

  fileName(d: ReportData) { return `MaintHub-${TITLES[d.frequency].replace(/ /g, '-')}-${d.period.from}${d.period.from === d.period.to ? '' : '_' + d.period.to}.pdf`; }

  private compose(d: ReportData, pdf: Buffer, to: string[]) {
    const lines = summarize(d), title = TITLES[d.frequency];
    const text = `${title}\n${periodText(d)}  |  ${d.org}  |  ${d.plant}\n\nRingkasan:\n${lines.map((l) => '- ' + l).join('\n')}\n\nLaporan lengkap terlampir (PDF).\n\n-- MaintHub | Predict. Maintain. Optimize. Connected.`;
    const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;color:#1e2733">
      <div style="background:#0b1426;padding:18px 22px;border-radius:10px 10px 0 0"><span style="color:#f4f2ec;font-size:20px;font-weight:600">Maint</span><span style="color:#12c4b4;font-size:20px;font-weight:600">Hub</span></div>
      <div style="border:1px solid #e1e5ec;border-top:0;padding:22px;border-radius:0 0 10px 10px">
        <h2 style="margin:0 0 4px;font-size:18px">${esc(title)}</h2>
        <p style="margin:0 0 16px;color:#5b6b82;font-size:13px">${esc(periodText(d))} &middot; ${esc(d.org)} &middot; ${esc(d.plant)}</p>
        <ul style="padding-left:18px;line-height:1.6;font-size:14px">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        <p style="font-size:13px;color:#5b6b82">Laporan lengkap terlampir dalam format PDF.</p>
        <p style="font-size:11px;color:#98a3b3;margin-top:22px">Predict. Maintain. Optimize. Connected.</p>
      </div></div>`;
    return { to, subject: `[MaintHub] ${title} - ${periodText(d)} - ${d.plant}`, text, html, attachments: [{ filename: this.fileName(d), content: pdf, contentType: 'application/pdf' }] };
  }

  /** Kirim satu laporan dan catat hasilnya di riwayat (berhasil maupun gagal). Tidak melempar galat pengiriman: hasilnya dikembalikan. */
  async deliver(c: PoolClient, o: { scope: Scope; to: string[]; kind: 'manual' | 'scheduled'; scheduleId?: string; userId?: string | null; orgId: string }): Promise<{ ok: boolean; error?: string; bytes?: number }> {
    let bytes: number | undefined; let error: string | undefined;
    await c.query('savepoint deliver');
    try {
      const { data, pdf } = await this.generate(c, o.scope); bytes = pdf.length;
      await this.mail.send(this.compose(data, pdf, o.to));
      await c.query('release savepoint deliver');
    } catch (e: any) {
      await c.query('rollback to savepoint deliver');
      error = e instanceof HttpException ? String(e.message) : String(e?.message ?? e).slice(0, 300);
      this.log.warn(`gagal kirim laporan (${o.kind}): ${error}`);
    }
    await c.query(
      `insert into report_runs (org_id, schedule_id, kind, frequency, plant_id, period_from, period_to, status, recipients, bytes, error, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [o.orgId, o.scheduleId ?? null, o.kind, o.scope.freq, o.scope.plantId, o.scope.from, o.scope.to, error ? 'failed' : 'sent', o.to, bytes ?? null, error ?? null, o.userId ?? null]);
    return error ? { ok: false, error, bytes } : { ok: true, bytes };
  }

  /** Dipanggil penjadwal: proses satu jadwal yang jatuh tempo. `for update skip locked` mencegah kirim ganda bila ada lebih dari satu instance. */
  async runDue(orgId: string, scheduleId: string): Promise<void> {
    const ctx: DbContext = { orgId, plantIds: [], allPlants: true };
    await this.db.tx(ctx, async (c) => {
      const s = (await c.query(
        `select s.id, s.frequency, s.plant_id, s.recipients, s.fail_count, to_char(p.p_from, 'YYYY-MM-DD') as f, to_char(p.p_to, 'YYYY-MM-DD') as t,
                (s.last_period_to is null or s.last_period_to < p.p_to) as due,
                (s.last_attempt_at is not null and s.last_attempt_at > now() - interval '30 minutes') as cooling
           from report_schedules s, lateral report_period(s.frequency, s.send_hour) p
          where s.id = $1 and s.active for update of s skip locked`, [scheduleId])).rows[0];
      if (!s || !s.due || s.cooling) return;
      const scope: Scope = { freq: s.frequency, from: s.f, to: s.t, plantId: s.plant_id };
      const r = await this.deliver(c, { scope, to: s.recipients, kind: 'scheduled', scheduleId: s.id, orgId });
      if (r.ok) await c.query('update report_schedules set last_period_to = $2, fail_count = 0, last_attempt_at = now() where id = $1', [s.id, scope.to]);
      else {
        const giveUp = s.fail_count + 1 >= MAX_FAILS;
        await c.query('update report_schedules set fail_count = fail_count + 1, last_attempt_at = now(), last_period_to = case when $2 then $3::date else last_period_to end where id = $1', [s.id, giveUp, scope.to]);
        if (giveUp) this.log.error(`jadwal ${s.id}: menyerah setelah ${MAX_FAILS} kali gagal untuk periode ${scope.from}..${scope.to}`);
      }
    });
  }
}
