import { Body, Controller, Get, HttpException, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { dbCtx, RequireModule, Roles } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { mapDbError, parse } from '../common/http';
import { WhatsappService } from '../whatsapp/whatsapp.service';

const CreateDto = z.object({
  plantId: z.string().uuid(), assetId: z.string().uuid(),
  woType: z.enum(['breakdown', 'corrective', 'preventive', 'emergency']),
  title: z.string().trim().min(3).max(200), description: z.string().max(4000).default(''),
  priority: z.enum(['P1', 'P2', 'P3', 'P4']), estHours: z.number().min(0).max(999).default(2),
});
const ListQ = z.object({
  status: z.string().optional(), plantId: z.string().uuid().optional(), assetId: z.string().uuid().optional(),
  mine: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1), size: z.coerce.number().int().min(1).max(200).default(50),
});

const COLS = `w.id, w.code, w.plant_id as "plantId", w.asset_id as "assetId", a.name as "assetName", w.wo_type as "woType", w.title, w.description,
  w.priority, w.status, w.technician_id as "technicianId", t.full_name as "technicianName", w.est_hours as "estHours", w.actual_hours as "actualHours",
  w.downtime_hours as "downtimeHours", w.result_notes as "resultNotes", w.created_at as "createdAt", w.sla_respond_due as "slaRespondDue",
  w.sla_resolve_due as "slaResolveDue", w.approved_at as "approvedAt", w.reject_reason as "rejectReason", w.done_at as "doneAt", w.closed_at as "closedAt"`;
const FROM = `from work_orders w join assets a on a.id = w.asset_id left join technicians t on t.id = w.technician_id`;

@Controller('work-orders')
@RequireModule(3)
export class WorkOrdersController {
  constructor(private db: DbService, private wa: WhatsappService) {}

  /** id teknisi milik user login (null bila bukan teknisi). */
  private async myTech(c: PoolClient, u: AuthUser): Promise<string | null> {
    const r = await c.query('select id from technicians where user_id = $1 and active', [u.sub]);
    return r.rows[0]?.id ?? null;
  }

  @Get()
  async list(@Query() q: unknown, @Req() req: any) {
    const f = parse(ListQ, q); const u: AuthUser = req.user;
    return this.db.tx(dbCtx(u), async (c) => {
      const where: string[] = []; const args: unknown[] = [];
      if (f.status) { args.push(f.status.split(',')); where.push(`w.status = any($${args.length})`); }
      if (f.plantId) { args.push(f.plantId); where.push(`w.plant_id = $${args.length}`); }
      if (f.assetId) { args.push(f.assetId); where.push(`w.asset_id = $${args.length}`); }
      // teknisi hanya melihat WO yang ditugaskan kepadanya atau dibuatnya sendiri
      if (u.role === 'technician' || f.mine) {
        args.push(await this.myTech(c, u)); where.push(`(w.technician_id = $${args.length}`);
        args.push(u.sub); where[where.length - 1] += ` or w.requester_id = $${args.length})`;
      }
      args.push(f.size, (f.page - 1) * f.size);
      const r = await c.query(`select ${COLS}, count(*) over() as total ${FROM} ${where.length ? 'where ' + where.join(' and ') : ''}
                               order by w.created_at desc limit $${args.length - 1} offset $${args.length}`, args);
      return { total: Number(r.rows[0]?.total ?? 0), items: r.rows.map(({ total, ...x }: any) => x) };
    });
  }

  @Get(':id')
  async one(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => {
      const r = await c.query(`select ${COLS} ${FROM} where w.id = $1`, [id]);
      if (!r.rows[0]) throw new HttpException('WO tidak ditemukan', HttpStatus.NOT_FOUND);
      const logs = await c.query('select at, actor_text as actor, text from wo_logs where wo_id = $1 order by at, id', [id]);
      const att = await c.query('select id, kind, filename, mime, size_bytes as "sizeBytes", via, created_at as "createdAt" from wo_attachments where wo_id = $1 order by created_at', [id]);
      return { ...r.rows[0], logs: logs.rows, attachments: att.rows };
    });
  }

  @Post()
  async create(@Body() b: unknown, @Req() req: any) {
    const d = parse(CreateDto, b); const u: AuthUser = req.user;
    try {
      return await this.db.tx(dbCtx(u), async (c) => {
        const r = await c.query(
          `insert into work_orders (org_id, plant_id, wo_type, source, title, description, asset_id, priority, est_hours, requester_id)
           values ($1,$2,$3,'manual',$4,$5,$6,$7,$8,$9) returning id, code, status`,
          [u.org, d.plantId, d.woType, d.title, d.description, d.assetId, d.priority, d.estHours, u.sub]);
        await this.log(c, u, r.rows[0].id, 'WO dibuat, menunggu approval Supervisor');
        return r.rows[0];
      });
    } catch (e) { mapDbError(e); }
  }

  @Post(':id/approve') @Roles('supervisor', 'admin')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.step(id, req.user, `status='approved', approved_by=$U`, [], 'WO disetujui');
  }
  @Post(':id/reject') @Roles('supervisor', 'admin')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(500) }), b);
    return this.step(id, req.user, `status='rejected', approved_by=$U, reject_reason=$1`, [reason], `WO ditolak: ${reason}`);
  }
  @Post(':id/assign') @Roles('supervisor', 'admin', 'planner')
  async assign(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const { technicianId } = parse(z.object({ technicianId: z.string().uuid() }), b);
    const r = await this.step(id, req.user, `status='assigned', technician_id=$1`, [technicianId], 'WO ditugaskan ke teknisi');
    this.wa.notifyAssigned(req.user, id).catch(() => undefined); // gagal kirim WA tidak menggagalkan penugasan
    return r;
  }
  @Post(':id/start') @Roles('technician', 'supervisor', 'admin')
  start(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.step(id, req.user, `status='progress'`, [], 'Pekerjaan dimulai', true);
  }
  @Post(':id/finish') @Roles('technician', 'supervisor', 'admin')
  finish(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(z.object({ actualHours: z.number().min(0).max(999), downtimeHours: z.number().min(0).max(999).default(0), notes: z.string().max(4000).default('') }), b);
    return this.step(id, req.user, `status='done', actual_hours=$1, downtime_hours=$2, result_notes=$3`, [d.actualHours, d.downtimeHours, d.notes], 'Pekerjaan selesai, menunggu penutupan', true);
  }
  @Post(':id/return') @Roles('supervisor', 'admin')
  returnWork(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.step(id, req.user, `status='progress'`, [], 'WO dikembalikan untuk diperbaiki');
  }
  @Post(':id/close') @Roles('supervisor', 'admin')
  close(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.step(id, req.user, `status='closed', closed_by=$U`, [], 'WO ditutup');
  }

  /** Jalankan satu transisi status. Validasi alur & wewenang final ada di trigger DB. */
  private async step(id: string, u: AuthUser, setSql: string, args: unknown[], logText: string, ownOnly = false) {
    try {
      return await this.db.tx(dbCtx(u), async (c) => {
        if (ownOnly && u.role === 'technician') {
          const mine = await this.myTech(c, u);
          const w = await c.query('select technician_id from work_orders where id = $1', [id]);
          if (!mine || w.rows[0]?.technician_id !== mine) throw new HttpException('Hanya teknisi yang ditugaskan yang boleh melakukan ini', HttpStatus.FORBIDDEN);
        }
        const params = [...args];
        let sets = setSql;
        if (sets.includes('$U')) { params.push(u.sub); sets = sets.replace(/\$U/g, `$${params.length}`); }
        params.push(id);
        const r = await c.query(`update work_orders set ${sets} where id = $${params.length} returning id, code, status`, params);
        if (!r.rows[0]) throw new HttpException('WO tidak ditemukan', HttpStatus.NOT_FOUND);
        await this.log(c, u, id, logText);
        return r.rows[0];
      });
    } catch (e) { mapDbError(e); }
  }

  private log(c: PoolClient, u: AuthUser, woId: string, text: string) {
    return c.query('insert into wo_logs (org_id, wo_id, actor_user_id, actor_text, text) values ($1,$2,$3,$4,$5)', [u.org, woId, u.sub, u.name, text]);
  }
}
