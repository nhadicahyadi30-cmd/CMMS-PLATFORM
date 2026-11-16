import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { config } from '../config';
import { DbService } from '../db/db.service';
import { MailerService } from './mailer';
import { ReportsService } from './reports.service';

/** Memeriksa jadwal jatuh tempo tiap menit. Aman dijalankan di lebih dari satu instance (kunci baris di runDue). */
@Injectable()
export class ReportsScheduler implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('ReportsScheduler');
  private timer?: NodeJS.Timeout; private running = false; private warned = false;
  constructor(private db: DbService, private svc: ReportsService, private mail: MailerService) {}

  onModuleInit() {
    if (!config.reportsScheduler) { this.log.log('penjadwal laporan dimatikan (REPORTS_SCHEDULER=off)'); return; }
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick(): Promise<void> {
    if (this.running) return; this.running = true;
    try {
      if (!this.mail.enabled) { if (!this.warned) { this.warned = true; this.log.warn('SMTP belum dikonfigurasi: laporan terjadwal tidak dikirim'); } return; }
      const due = (await this.db.authPool.query(
        `select s.id, s.org_id from report_schedules s, lateral report_period(s.frequency, s.send_hour) p
          where s.active and (s.last_period_to is null or s.last_period_to < p.p_to) and (s.last_attempt_at is null or s.last_attempt_at < now() - interval '30 minutes')
          order by s.id limit 50`)).rows;
      for (const r of due) {
        try { await this.svc.runDue(r.org_id, r.id); } catch (e: any) { this.log.error(`jadwal ${r.id}: ${e?.message ?? e}`); }
      }
    } catch (e: any) { this.log.error(`tick gagal: ${e?.message ?? e}`); }
    finally { this.running = false; }
  }
}
