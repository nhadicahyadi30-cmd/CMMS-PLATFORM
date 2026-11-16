import { Body, Controller, HttpCode, HttpException, HttpStatus, Logger, Post, Req } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { Public } from '../auth/auth.guard';
import { parse } from '../common/http';
import { config } from '../config';
import { MailerService } from '../reports/mailer';
import { LeadDto, RateLimiter, oneLine } from './leads.rules';

/** Permintaan demo dari website publik. Disimpan ke tabel `leads` (hanya bisa ditulis, tidak bisa dibaca lewat API). */
@Controller('public')
export class LeadsController {
  private log = new Logger('Leads');
  private limiter = new RateLimiter(5, 60 * 60 * 1000); // 5 permintaan per IP per jam
  constructor(private db: DbService, private mailer: MailerService) {}

  @Public() @Post('leads') @HttpCode(201)
  async create(@Body() b: unknown, @Req() req: any) {
    const d = parse(LeadDto, b);
    if (d.website) return { ok: true }; // honeypot terisi: pura-pura sukses, jangan simpan
    const ip = String(req.headers['x-real-ip'] ?? req.ip ?? '');
    if (!this.limiter.allow(ip)) throw new HttpException('Too many requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    await this.db.authPool.query(
      `insert into leads (name, company, phone, size, message, email, ip, user_agent) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [d.name, d.company, d.phone || null, d.size || null, d.message || null, d.email || null, ip || null, String(req.headers['user-agent'] ?? '').slice(0, 300) || null],
    );
    this.notify(d).catch((e) => this.log.warn(`notifikasi email gagal: ${e.message}`));
    return { ok: true };
  }

  private async notify(d: ReturnType<typeof parse>) {
    if (!this.mailer.enabled || !config.leadsNotifyTo) return;
    const lines = [`Name: ${d.name}`, `Company: ${d.company}`, `Phone: ${d.phone || '-'}`, `Email: ${d.email || '-'}`, `Plants / assets: ${d.size || '-'}`, '', d.message || ''];
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
    await this.mailer.send({ to: [config.leadsNotifyTo], subject: `New demo request — ${oneLine(d.company)}`, text: lines.join('\n'), html: `<pre style="font-family:sans-serif">${esc(lines.join('\n'))}</pre>` });
  }
}
