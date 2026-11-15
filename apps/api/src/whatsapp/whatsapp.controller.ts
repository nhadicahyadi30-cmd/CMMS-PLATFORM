import { Controller, ForbiddenException, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { Public } from '../auth/auth.guard';
import { DbService } from '../db/db.service';
import { config } from '../config';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private db: DbService) {}

  /** Verifikasi endpoint oleh Meta saat mendaftarkan webhook. */
  @Public() @Get('webhook')
  verify(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string, @Res() res: any) {
    if (mode === 'subscribe' && config.wa.verifyToken && token === config.wa.verifyToken) return res.status(200).send(challenge);
    throw new ForbiddenException();
  }

  /** Terima event. Tanda tangan HMAC diverifikasi, payload disimpan idempoten; pemrosesan dilakukan worker terpisah. */
  @Public() @Post('webhook') @HttpCode(200)
  async receive(@Req() req: any) {
    const raw: Buffer | undefined = req.rawBody;
    const sig = String(req.headers['x-hub-signature-256'] ?? '');
    if (!raw || !config.wa.appSecret) throw new ForbiddenException();
    const expected = 'sha256=' + createHmac('sha256', config.wa.appSecret).update(raw).digest('hex');
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException();
    const key = createHash('sha256').update(raw).digest('hex');
    await this.db.authPool.query('insert into wa_webhook_events (event_key, payload) values ($1,$2) on conflict (event_key) do nothing', [key, req.body]);
    return { ok: true };
  }
}
