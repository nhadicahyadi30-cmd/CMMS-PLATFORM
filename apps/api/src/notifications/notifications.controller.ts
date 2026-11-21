import { Controller, Get, HttpException, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../db/db.service';
import { dbCtx } from '../auth/auth.guard';
import { parse } from '../common/http';

const Q = z.object({ unread: z.coerce.boolean().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) });
const COLS = `id, kind, title, body, link, created_at as "createdAt", read_at as "readAt"`;

/** Notifikasi milik pengguna yang login. Dibuat oleh pemicu database (db/migrations/0021_notifications.sql). */
@Controller('notifications')
export class NotificationsController {
  constructor(private db: DbService) {}

  @Get()
  list(@Query() q: unknown, @Req() req: any) {
    const f = parse(Q, q);
    return this.db.tx(dbCtx(req.user), async (c) => {
      // pembersihan oportunistik: notifikasi sudah dibaca > 30 hari atau apa pun > 90 hari
      await c.query(`delete from notifications where user_id = $1 and (created_at < now() - interval '90 days' or (read_at is not null and created_at < now() - interval '30 days'))`, [req.user.sub]);
      const items = (await c.query(`select ${COLS} from notifications where user_id = $1 ${f.unread ? 'and read_at is null' : ''} order by created_at desc limit $2`, [req.user.sub, f.limit])).rows;
      const unread = num((await c.query('select count(*) as n from notifications where user_id = $1 and read_at is null', [req.user.sub])).rows[0].n);
      return { unread, items };
    });
  }

  /** Ringan untuk polling berkala dari bel di header. */
  @Get('count')
  count(@Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => {
      const r = (await c.query(`select count(*) as n, max(created_at) as latest from notifications where user_id = $1 and read_at is null`, [req.user.sub])).rows[0];
      return { unread: num(r.n), latest: r.latest };
    });
  }

  @Post('read-all')
  readAll(@Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => ({ updated: (await c.query('update notifications set read_at = now() where user_id = $1 and read_at is null', [req.user.sub])).rowCount }));
  }

  @Post(':id/read')
  read(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => {
      const r = await c.query('update notifications set read_at = coalesce(read_at, now()) where id = $1 and user_id = $2 returning id', [id, req.user.sub]);
      if (!r.rows[0]) throw new HttpException('Notifikasi tidak ditemukan', HttpStatus.NOT_FOUND);
      return { ok: true };
    });
  }
}
const num = (x: unknown) => Number(x ?? 0);
