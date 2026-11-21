import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { dbCtx, RequireModule, Roles } from '../auth/auth.guard';
import { mapDbError, parse } from '../common/http';
import { LockAdd, LockRemove, LotoDto, Note, PermitDto, PermitPatch, PointAdd, Reason, permitActions, permitExpired } from './permit.rules';

const COLS = `p.id, p.code, p.plant_id as "plantId", p.asset_id as "assetId", a.name as "assetName", a.code as "assetCode", p.wo_id as "woId", w.code as "woCode",
  p.work_type as "workType", p.title, p.hazards, p.precautions, p.requires_loto as "requiresLoto", p.team, p.valid_from as "validFrom", p.valid_until as "validUntil",
  p.status, p.requested_by as "requestedById", ur.full_name as "requestedBy", p.created_at as "createdAt",
  ua.full_name as "approvedBy", p.approved_at as "approvedAt", p.reject_reason as "rejectReason",
  uh.full_name as "handoverBy", p.handover_at as "handoverAt", p.handover_note as "handoverNote",
  uv.full_name as "activatedBy", p.activated_at as "activatedAt", uc.full_name as "completedBy", p.completed_at as "completedAt", p.completion_note as "completionNote",
  ut.full_name as "returnedBy", p.returned_at as "returnedAt", p.cancel_reason as "cancelReason", p.cancelled_at as "cancelledAt"`;
const FROM = `from permits p join assets a on a.id = p.asset_id left join work_orders w on w.id = p.wo_id join users ur on ur.id = p.requested_by
  left join users ua on ua.id = p.approved_by left join users uh on uh.id = p.handover_by left join users uv on uv.id = p.activated_by
  left join users uc on uc.id = p.completed_by left join users ut on ut.id = p.returned_by`;
const ListQ = z.object({ status: z.string().optional(), plantId: z.string().uuid().optional(), assetId: z.string().uuid().optional(), mine: z.coerce.boolean().optional(), page: z.coerce.number().int().min(1).default(1), size: z.coerce.number().int().min(1).max(100).default(50) });

@Controller('permits')
@RequireModule(12)
export class PermitsController {
  constructor(private db: DbService) {}
  private run<T>(req: any, fn: (c: PoolClient) => Promise<T>) { return this.db.tx(dbCtx(req.user), fn).catch((e) => mapDbError(e)); }
  private withActions(x: any, u: any) {
    return { ...x, expired: permitExpired(x.status, x.validUntil), actions: permitActions(x.status, u.role, u.sub, x.requestedById) };
  }

  @Get()
  list(@Query() q: unknown, @Req() req: any) {
    const f = parse(ListQ, q);
    return this.run(req, async (c) => {
      const w: string[] = []; const a: unknown[] = [];
      if (f.status) { a.push(f.status.split(',')); w.push(`p.status = any($${a.length})`); }
      if (f.plantId) { a.push(f.plantId); w.push(`p.plant_id = $${a.length}`); }
      if (f.assetId) { a.push(f.assetId); w.push(`p.asset_id = $${a.length}`); }
      if (f.mine) { a.push(req.user.sub); w.push(`p.requested_by = $${a.length}`); }
      a.push(f.size, (f.page - 1) * f.size);
      const r = await c.query(`select ${COLS}, count(*) over() as total ${FROM} ${w.length ? 'where ' + w.join(' and ') : ''} order by p.created_at desc limit $${a.length - 1} offset $${a.length}`, a);
      return { total: Number(r.rows[0]?.total ?? 0), items: r.rows.map(({ total, ...x }: any) => this.withActions(x, req.user)) };
    });
  }

  @Get(':id')
  one(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.run(req, async (c) => {
      const r = await c.query(`select ${COLS} ${FROM} where p.id = $1`, [id]);
      if (!r.rows[0]) throw new HttpException('Izin kerja tidak ditemukan', HttpStatus.NOT_FOUND);
      const pts = await c.query(
        `select pp.id, pp.seq, pp.description, pp.energy_type as "energyType", pp.method, pp.zero_verified_at as "zeroVerifiedAt", uz.full_name as "zeroVerifiedBy"
           from permit_points pp left join users uz on uz.id = pp.zero_verified_by where pp.permit_id = $1 order by pp.seq`, [id]);
      const lk = await c.query(
        `select l.id, l.point_id as "pointId", l.lock_no as "lockNo", ua.full_name as "appliedBy", l.applied_by as "appliedById", l.applied_at as "appliedAt",
                ur.full_name as "removedBy", l.removed_at as "removedAt", l.override_reason as "overrideReason"
           from permit_locks l join users ua on ua.id = l.applied_by left join users ur on ur.id = l.removed_by where l.permit_id = $1 order by l.applied_at`, [id]);
      const ev = await c.query('select at, actor_text as actor, text from permit_events where permit_id = $1 order by at, id', [id]);
      const points = pts.rows.map((p: any) => ({ ...p, locks: lk.rows.filter((l: any) => l.pointId === p.id) }));
      return { ...this.withActions(r.rows[0], req.user), points, events: ev.rows };
    });
  }

  @Post() @Roles('technician', 'planner', 'supervisor', 'admin')
  create(@Body() b: unknown, @Req() req: any) {
    const d = parse(PermitDto, b);
    return this.run(req, async (c) => {
      const r = await c.query(
        `insert into permits (org_id, plant_id, asset_id, wo_id, work_type, title, hazards, precautions, requires_loto, team, valid_from, valid_until, requested_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id, code, status`,
        [req.user.org, d.plantId, d.assetId, d.woId ?? null, d.workType, d.title, d.hazards, d.precautions, d.requiresLoto, d.team, d.validFrom, d.validUntil, req.user.sub]);
      const id = r.rows[0].id; let seq = 0;
      if (d.lotoPointIds.length) {
        const m = await c.query(`select id, description, energy_type, method from loto_points where id = any($1) and asset_id = $2 and active order by seq`, [d.lotoPointIds, d.assetId]);
        for (const p of m.rows) await c.query(`insert into permit_points (org_id, permit_id, loto_point_id, seq, description, energy_type, method) values ($1,$2,$3,$4,$5,$6,$7)`, [req.user.org, id, p.id, ++seq, p.description, p.energy_type, p.method]);
      }
      for (const p of d.extraPoints) await c.query(`insert into permit_points (org_id, permit_id, seq, description, energy_type, method) values ($1,$2,$3,$4,$5,$6)`, [req.user.org, id, ++seq, p.description, p.energyType, p.method]);
      return r.rows[0];
    });
  }

  @Patch(':id') @Roles('technician', 'planner', 'supervisor', 'admin')
  patch(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(PermitPatch, b);
    const map: Record<string, string> = { workType: 'work_type', title: 'title', hazards: 'hazards', precautions: 'precautions', requiresLoto: 'requires_loto', team: 'team', validFrom: 'valid_from', validUntil: 'valid_until' };
    const keys = Object.keys(d).filter((k) => map[k]);
    if (!keys.length) throw new HttpException('Tidak ada yang diubah', HttpStatus.BAD_REQUEST);
    return this.run(req, async (c) => {
      const cur = (await c.query('select requested_by, status from permits where id = $1', [id])).rows[0];
      if (!cur) throw new HttpException('Izin kerja tidak ditemukan', HttpStatus.NOT_FOUND);
      if (cur.requested_by !== req.user.sub && !['supervisor', 'admin'].includes(req.user.role)) throw new HttpException('Hanya pemohon, Supervisor, atau Admin yang boleh mengubah', HttpStatus.FORBIDDEN);
      if (!['requested', 'approved'].includes(cur.status)) throw new HttpException('Izin tidak dapat diubah pada tahap ini', HttpStatus.UNPROCESSABLE_ENTITY);
      await c.query(`update permits set ${keys.map((k, i) => `${map[k]} = $${i + 2}`).join(', ')} where id = $1`, [id, ...keys.map((k) => (d as any)[k])]);
      return { id };
    });
  }

  // ---------- titik isolasi ----------
  @Post(':id/points') @Roles('technician', 'planner', 'supervisor', 'admin')
  addPoint(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(PointAdd, b);
    return this.run(req, async (c) => {
      const r = await c.query(
        `insert into permit_points (org_id, permit_id, seq, description, energy_type, method)
         select $1, $2, coalesce(max(seq), 0) + 1, $3, $4, $5 from permit_points where permit_id = $2 returning id, seq`, [req.user.org, id, d.description, d.energyType, d.method]);
      return r.rows[0];
    });
  }
  @Delete(':id/points/:pid') @Roles('technician', 'planner', 'supervisor', 'admin')
  delPoint(@Param('id', ParseUUIDPipe) id: string, @Param('pid', ParseUUIDPipe) pid: string, @Req() req: any) {
    return this.run(req, async (c) => {
      const r = await c.query('delete from permit_points where id = $1 and permit_id = $2 returning id', [pid, id]);
      if (!r.rowCount) throw new HttpException('Titik tidak ditemukan', HttpStatus.NOT_FOUND);
      return { id: pid };
    });
  }
  @Post(':id/points/:pid/locks')
  addLock(@Param('id', ParseUUIDPipe) id: string, @Param('pid', ParseUUIDPipe) pid: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(LockAdd, b);
    return this.run(req, async (c) => (await c.query(
      'insert into permit_locks (org_id, permit_id, point_id, lock_no, applied_by) values ($1,$2,$3,$4,$5) returning id', [req.user.org, id, pid, d.lockNo, req.user.sub])).rows[0]);
  }
  @Post(':id/locks/:lid/remove')
  removeLock(@Param('id', ParseUUIDPipe) id: string, @Param('lid', ParseUUIDPipe) lid: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(LockRemove, b);
    return this.run(req, async (c) => {
      const r = await c.query('update permit_locks set removed_by = $3, override_reason = nullif($4, \'\') where id = $1 and permit_id = $2 returning id', [lid, id, req.user.sub, d.reason]);
      if (!r.rowCount) throw new HttpException('Gembok tidak ditemukan', HttpStatus.NOT_FOUND);
      return { id: lid };
    });
  }
  @Post(':id/points/:pid/verify') @Roles('technician', 'planner', 'supervisor', 'admin')
  verify(@Param('id', ParseUUIDPipe) id: string, @Param('pid', ParseUUIDPipe) pid: string, @Req() req: any) {
    return this.run(req, async (c) => {
      const r = await c.query('update permit_points set zero_verified_by = $3 where id = $1 and permit_id = $2 returning id', [pid, id, req.user.sub]);
      if (!r.rowCount) throw new HttpException('Titik tidak ditemukan', HttpStatus.NOT_FOUND);
      return { id: pid };
    });
  }
  @Post(':id/points/:pid/unverify') @Roles('technician', 'planner', 'supervisor', 'admin')
  unverify(@Param('id', ParseUUIDPipe) id: string, @Param('pid', ParseUUIDPipe) pid: string, @Req() req: any) {
    return this.run(req, async (c) => {
      const r = await c.query('update permit_points set zero_verified_by = null where id = $1 and permit_id = $2 returning id', [pid, id]);
      if (!r.rowCount) throw new HttpException('Titik tidak ditemukan', HttpStatus.NOT_FOUND);
      return { id: pid };
    });
  }

  // ---------- alur status (wewenang final dijaga trigger database) ----------
  private step(req: any, id: string, set: string, args: unknown[]) {
    return this.run(req, async (c) => {
      const r = await c.query(`update permits set ${set} where id = $1 returning id, status`, [id, ...args]);
      if (!r.rows[0]) throw new HttpException('Izin kerja tidak ditemukan', HttpStatus.NOT_FOUND);
      return r.rows[0];
    });
  }
  @Post(':id/approve') @Roles('supervisor', 'admin')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.step(req, id, `status = 'approved', approved_by = $2`, [req.user.sub]); }
  @Post(':id/reject') @Roles('supervisor', 'admin')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) { const { reason } = parse(Reason, b); return this.step(req, id, `status = 'rejected', approved_by = $2, reject_reason = $3`, [req.user.sub, reason]); }
  @Post(':id/handover') @Roles('production', 'admin')
  handover(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) { const { note } = parse(Note, b); return this.step(req, id, `status = 'handed_over', handover_by = $2, handover_note = nullif($3, '')`, [req.user.sub, note]); }
  @Post(':id/activate') @Roles('technician', 'planner', 'supervisor', 'admin')
  activate(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.step(req, id, `status = 'active', activated_by = $2`, [req.user.sub]); }
  @Post(':id/complete') @Roles('technician', 'planner', 'supervisor', 'admin')
  complete(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) { const { note } = parse(Note, b); return this.step(req, id, `status = 'completed', completed_by = $2, completion_note = nullif($3, '')`, [req.user.sub, note]); }
  @Post(':id/close') @Roles('production', 'admin')
  close(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.step(req, id, `status = 'closed', returned_by = $2`, [req.user.sub]); }
  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) { const { reason } = parse(Reason, b); return this.step(req, id, `status = 'cancelled', cancelled_by = $2, cancel_reason = $3`, [req.user.sub, reason]); }
}

/** Master titik isolasi (LOTO) per aset, dipakai ulang di setiap izin. */
@Controller('loto-points')
@RequireModule(12)
export class LotoController {
  constructor(private db: DbService) {}
  private run<T>(req: any, fn: (c: PoolClient) => Promise<T>) { return this.db.tx(dbCtx(req.user), fn).catch((e) => mapDbError(e)); }

  @Get()
  list(@Query('assetId') assetId: string | undefined, @Query('plantId') plantId: string | undefined, @Req() req: any) {
    const a = assetId ? parse(z.string().uuid(), assetId) : null; const p = plantId ? parse(z.string().uuid(), plantId) : null;
    return this.run(req, async (c) => (await c.query(
      `select l.id, l.plant_id as "plantId", l.asset_id as "assetId", a.name as "assetName", l.seq, l.description, l.energy_type as "energyType", l.method, l.active
         from loto_points l join assets a on a.id = l.asset_id where ($1::uuid is null or l.asset_id = $1) and ($2::uuid is null or l.plant_id = $2) order by a.code, l.seq`, [a, p])).rows);
  }
  @Post() @Roles('admin', 'supervisor', 'planner')
  create(@Body() b: unknown, @Req() req: any) {
    const d = parse(LotoDto, b);
    return this.run(req, async (c) => (await c.query(
      `insert into loto_points (org_id, plant_id, asset_id, seq, description, energy_type, method, active) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [req.user.org, d.plantId, d.assetId, d.seq, d.description, d.energyType, d.method, d.active])).rows[0]);
  }
  @Put(':id') @Roles('admin', 'supervisor', 'planner')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(LotoDto, b);
    return this.run(req, async (c) => {
      const r = await c.query(`update loto_points set seq=$2, description=$3, energy_type=$4, method=$5, active=$6 where id = $1 returning id`, [id, d.seq, d.description, d.energyType, d.method, d.active]);
      if (!r.rowCount) throw new HttpException('Titik tidak ditemukan', HttpStatus.NOT_FOUND);
      return r.rows[0];
    });
  }
  @Delete(':id') @Roles('admin', 'supervisor')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.run(req, async (c) => {
      const r = await c.query('delete from loto_points where id = $1 returning id', [id]);
      if (!r.rowCount) throw new HttpException('Titik tidak ditemukan', HttpStatus.NOT_FOUND);
      return r.rows[0];
    });
  }
}
