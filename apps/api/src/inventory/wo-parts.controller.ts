import { Body, Controller, Get, HttpException, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../db/db.service';
import { dbCtx, RequireModule, DenyRoles } from '../auth/auth.guard';
import { mapDbError, parse } from '../common/http';

const PartQty = z.object({ partId: z.string().uuid(), qty: z.number().positive().max(100000) });

/** Pemakaian suku cadang pada WO (modul 3). Teknisi hanya pada WO yang ditugaskan kepadanya. */
@Controller()
@RequireModule(3)
@DenyRoles('production')
export class WoPartsController {
  constructor(private db: DbService) {}

  /** Pencarian ringan untuk pemilih suku cadang di form WO (tanpa harga/lokasi). */
  @Get('parts-lookup')
  lookup(@Query('plantId') plantId: string, @Query('q') q: string | undefined, @Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => (await c.query(
      `select id, code, name, unit, on_hand as "onHand" from parts where active and plant_id = $1 and ($2::text is null or name ilike $2 or code::text ilike $2) order by code limit 50`,
      [plantId, q ? `%${q}%` : null])).rows);
  }

  private move(kind: 'out' | 'return') {
    return async (id: string, body: unknown, req: any) => {
      const d = parse(PartQty, body); const u = req.user;
      try {
        return await this.db.tx(dbCtx(u), async (c) => {
          const w = (await c.query('select plant_id, technician_id, status from work_orders where id = $1', [id])).rows[0];
          if (!w) throw new HttpException('WO tidak ditemukan', HttpStatus.NOT_FOUND);
          if (u.role === 'technician') {
            const mine = (await c.query('select id from technicians where user_id = $1 and active', [u.sub])).rows[0]?.id;
            if (!mine || mine !== w.technician_id) throw new HttpException('Hanya teknisi yang ditugaskan yang boleh mencatat suku cadang', HttpStatus.FORBIDDEN);
          }
          if (kind === 'return') {
            const used = (await c.query(`select coalesce(sum(case kind when 'out' then qty else -qty end),0) as n from stock_tx where wo_id = $1 and part_id = $2 and kind in ('out','return')`, [id, d.partId])).rows[0].n;
            if (Number(used) < d.qty) throw new HttpException(`Retur melebihi pemakaian (terpakai ${used})`, HttpStatus.UNPROCESSABLE_ENTITY);
          }
          await c.query(`insert into stock_tx (org_id, plant_id, part_id, kind, qty, wo_id, by_user) values ($1,$2,$3,$4,$5,$6,$7)`, [u.org, w.plant_id, d.partId, kind, d.qty, id, u.sub]);
          const p = (await c.query('select code, name from parts where id = $1', [d.partId])).rows[0];
          await c.query('insert into wo_logs (org_id, wo_id, actor_user_id, actor_text, text) values ($1,$2,$3,$4,$5)',
            [u.org, id, u.sub, u.name, `${kind === 'out' ? 'Pakai' : 'Retur'} suku cadang: ${p.code} ${p.name} × ${d.qty}`]);
          return { ok: true };
        });
      } catch (e) { mapDbError(e); }
    };
  }

  @Post('work-orders/:id/parts')
  use(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) { return this.move('out')(id, b, req); }
  @Post('work-orders/:id/parts/return')
  giveBack(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) { return this.move('return')(id, b, req); }
}
