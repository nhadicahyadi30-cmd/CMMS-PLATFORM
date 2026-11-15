import { Body, Controller, Get, HttpException, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { dbCtx, RequireModule, Roles } from '../auth/auth.guard';
import { mapDbError, parse } from '../common/http';

const num = (max = 1e9) => z.number().min(0).max(max);
const PartDto = z.object({
  plantId: z.string().uuid(), code: z.string().trim().min(1).max(60), name: z.string().trim().min(2).max(200),
  category: z.string().trim().max(60).default('umum'), unit: z.string().trim().min(1).max(20).default('pcs'), location: z.string().trim().max(60).nullish(),
  minStock: num().default(0), reorderQty: z.number().positive().max(1e9).default(1), unitCost: num().default(0), critical: z.boolean().default(false),
});
const PartPatch = PartDto.omit({ plantId: true, code: true }).partial().extend({ active: z.boolean().optional() });
const StockDto = z.object({
  partId: z.string().uuid(), kind: z.enum(['in', 'adjust']), qty: z.number().max(1e9),
  unitCost: num().optional(), note: z.string().trim().max(300).optional(),
});
const PrDto = z.object({
  plantId: z.string().uuid(), notes: z.string().trim().max(500).optional(),
  items: z.array(z.object({ partId: z.string().uuid(), qty: z.number().positive().max(1e9) })).min(1).max(100),
});
const ListQ = z.object({
  plantId: z.string().uuid().optional(), q: z.string().max(100).optional(), low: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1), size: z.coerce.number().int().min(1).max(200).default(50),
});

const PART_COLS = `p.id, p.plant_id as "plantId", p.code, p.name, p.category, p.unit, p.location, p.on_hand as "onHand", p.min_stock as "minStock",
  p.reorder_qty as "reorderQty", p.unit_cost as "unitCost", p.critical, p.active, (p.on_hand <= p.min_stock) as low`;

/** Saran pemesanan ulang: stok + yang sedang dipesan masih di bawah minimum. */
const REORDER_SQL = `
  select ${PART_COLS}, coalesce(o.pending, 0) as "onOrder",
         greatest(p.reorder_qty, ceil((p.min_stock - p.on_hand - coalesce(o.pending, 0) + 0.0001) / p.reorder_qty) * p.reorder_qty) as "suggestQty"
    from parts p
    left join lateral (select sum(i.qty - i.qty_received) as pending from pr_items i join purchase_requests r on r.id = i.pr_id
                        where i.part_id = p.id and r.status in ('draft','submitted','approved','ordered')) o on true
   where p.active and p.on_hand + coalesce(o.pending, 0) <= p.min_stock
   order by p.critical desc, (p.on_hand - p.min_stock), p.code`;

@Controller('inventory')
@RequireModule(6)
export class InventoryController {
  constructor(private db: DbService) {}

  private audit(c: PoolClient, u: any, event: string, entity: string, id: string, detail: object = {}) {
    return c.query('insert into audit_log (org_id, user_id, event, entity, entity_id, detail) values ($1,$2,$3,$4,$5,$6)', [u.org, u.sub, event, entity, id, JSON.stringify(detail)]);
  }

  // ---------- suku cadang ----------
  @Get('summary')
  summary(@Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => (await c.query(
      `select count(*)::int as parts, count(*) filter (where on_hand <= min_stock)::int as low,
              count(*) filter (where critical and on_hand <= min_stock)::int as "criticalLow", coalesce(sum(on_hand * unit_cost), 0) as "stockValue"
         from parts where active`)).rows[0]);
  }

  @Get('parts')
  list(@Query() q: unknown, @Req() req: any) {
    const f = parse(ListQ, q);
    return this.db.tx(dbCtx(req.user), async (c) => {
      const where = ['p.active']; const args: unknown[] = [];
      if (f.plantId) { args.push(f.plantId); where.push(`p.plant_id = $${args.length}`); }
      if (f.q) { args.push(`%${f.q}%`); where.push(`(p.name ilike $${args.length} or p.code::text ilike $${args.length})`); }
      if (f.low) where.push('p.on_hand <= p.min_stock');
      args.push(f.size, (f.page - 1) * f.size);
      const r = await c.query(`select ${PART_COLS}, count(*) over() as total from parts p where ${where.join(' and ')} order by p.code limit $${args.length - 1} offset $${args.length}`, args);
      return { total: Number(r.rows[0]?.total ?? 0), items: r.rows.map(({ total, ...x }: any) => x) };
    });
  }

  @Get('parts/:id')
  one(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => {
      const r = await c.query(`select ${PART_COLS} from parts p where p.id = $1`, [id]);
      if (!r.rows[0]) throw new HttpException('Suku cadang tidak ditemukan', HttpStatus.NOT_FOUND);
      const tx = await c.query(
        `select s.id, s.at, s.kind, s.qty, s.delta, s.unit_cost as "unitCost", s.note, w.code as "woCode", u.full_name as "by"
           from stock_tx s left join work_orders w on w.id = s.wo_id left join users u on u.id = s.by_user where s.part_id = $1 order by s.id desc limit 50`, [id]);
      return { ...r.rows[0], history: tx.rows };
    });
  }

  @Post('parts') @Roles('admin', 'supervisor', 'planner')
  async create(@Body() b: unknown, @Req() req: any) {
    const d = parse(PartDto, b);
    try {
      return await this.db.tx(dbCtx(req.user), async (c) => {
        const r = await c.query(
          `insert into parts (org_id, plant_id, code, name, category, unit, location, min_stock, reorder_qty, unit_cost, critical)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id, code`,
          [req.user.org, d.plantId, d.code, d.name, d.category, d.unit, d.location ?? null, d.minStock, d.reorderQty, d.unitCost, d.critical]);
        await this.audit(c, req.user, 'part_create', 'part', r.rows[0].id);
        return r.rows[0];
      });
    } catch (e) { mapDbError(e); }
  }

  @Patch('parts/:id') @Roles('admin', 'supervisor', 'planner')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(PartPatch, b);
    const map: Record<string, string> = { name: 'name', category: 'category', unit: 'unit', location: 'location', minStock: 'min_stock', reorderQty: 'reorder_qty', unitCost: 'unit_cost', critical: 'critical', active: 'active' };
    const sets: string[] = []; const args: unknown[] = [];
    for (const [k, col] of Object.entries(map)) if ((d as any)[k] !== undefined) { args.push((d as any)[k]); sets.push(`${col} = $${args.length}`); }
    if (!sets.length) throw new HttpException('Tidak ada perubahan', HttpStatus.BAD_REQUEST);
    args.push(id);
    try {
      return await this.db.tx(dbCtx(req.user), async (c) => {
        const r = await c.query(`update parts set ${sets.join(', ')} where id = $${args.length} returning id`, args);
        if (!r.rows[0]) throw new HttpException('Suku cadang tidak ditemukan', HttpStatus.NOT_FOUND);
        await this.audit(c, req.user, 'part_update', 'part', id, { fields: Object.keys(d) });
        return r.rows[0];
      });
    } catch (e) { mapDbError(e); }
  }

  // ---------- mutasi stok manual (penerimaan di luar PR, penyesuaian opname) ----------
  @Post('stock') @Roles('admin', 'supervisor', 'planner')
  async stock(@Body() b: unknown, @Req() req: any) {
    const d = parse(StockDto, b); const u = req.user;
    if (d.kind === 'in' && d.qty <= 0) throw new HttpException('Jumlah penerimaan harus lebih dari 0', HttpStatus.UNPROCESSABLE_ENTITY);
    if (d.kind === 'adjust') {
      if (!['admin', 'supervisor'].includes(u.role)) throw new HttpException('Penyesuaian stok hanya oleh Supervisor atau Admin', HttpStatus.FORBIDDEN);
      if (d.qty === 0) throw new HttpException('Selisih tidak boleh 0', HttpStatus.UNPROCESSABLE_ENTITY);
      if (!d.note) throw new HttpException('Alasan penyesuaian wajib diisi', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    try {
      return await this.db.tx(dbCtx(u), async (c) => {
        const p = await c.query('select plant_id from parts where id = $1', [d.partId]);
        if (!p.rows[0]) throw new HttpException('Suku cadang tidak ditemukan', HttpStatus.NOT_FOUND);
        await c.query(`insert into stock_tx (org_id, plant_id, part_id, kind, qty, unit_cost, note, by_user) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [u.org, p.rows[0].plant_id, d.partId, d.kind, d.qty, d.kind === 'in' ? d.unitCost ?? null : null, d.note ?? null, u.sub]);
        return (await c.query('select on_hand as "onHand" from parts where id = $1', [d.partId])).rows[0];
      });
    } catch (e) { mapDbError(e); }
  }

  // ---------- reorder & purchase request ----------
  @Get('reorder')
  reorder(@Req() req: any) { return this.db.tx(dbCtx(req.user), async (c) => (await c.query(REORDER_SQL)).rows); }

  @Get('prs')
  prs(@Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => (await c.query(
      `select r.id, r.code, r.status, r.notes, r.plant_id as "plantId", r.created_at as "createdAt", u.full_name as "requestedBy",
              (select count(*)::int from pr_items where pr_id = r.id) as items
         from purchase_requests r left join users u on u.id = r.requested_by order by r.created_at desc limit 200`)).rows);
  }

  @Get('prs/:id')
  pr(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => {
      const r = await c.query(
        `select r.id, r.code, r.status, r.notes, r.reject_reason as "rejectReason", r.plant_id as "plantId", r.created_at as "createdAt" from purchase_requests r where r.id = $1`, [id]);
      if (!r.rows[0]) throw new HttpException('PR tidak ditemukan', HttpStatus.NOT_FOUND);
      const items = await c.query(
        `select i.id, i.part_id as "partId", p.code, p.name, p.unit, i.qty, i.qty_received as "qtyReceived", p.unit_cost as "unitCost" from pr_items i join parts p on p.id = i.part_id where i.pr_id = $1 order by p.code`, [id]);
      return { ...r.rows[0], items: items.rows };
    });
  }

  @Post('prs') @Roles('admin', 'supervisor', 'planner')
  async createPr(@Body() b: unknown, @Req() req: any) {
    const d = parse(PrDto, b); const u = req.user;
    try {
      return await this.db.tx(dbCtx(u), async (c) => {
        const r = await c.query('insert into purchase_requests (org_id, plant_id, notes, requested_by) values ($1,$2,$3,$4) returning id, code, status', [u.org, d.plantId, d.notes ?? null, u.sub]);
        for (const it of d.items) {
          const ok = await c.query('select 1 from parts where id = $1 and plant_id = $2', [it.partId, d.plantId]);
          if (!ok.rows[0]) throw new HttpException('Suku cadang tidak ditemukan di plant ini', HttpStatus.UNPROCESSABLE_ENTITY);
          await c.query('insert into pr_items (org_id, pr_id, part_id, qty) values ($1,$2,$3,$4)', [u.org, r.rows[0].id, it.partId, it.qty]);
        }
        await this.audit(c, u, 'pr_create', 'pr', r.rows[0].id);
        return r.rows[0];
      });
    } catch (e) { mapDbError(e); }
  }

  private prStep(id: string, u: any, setSql: string, args: unknown[], event: string) {
    return this.db.tx(dbCtx(u), async (c) => {
      const params = [...args]; let sets = setSql;
      if (sets.includes('$U')) { params.push(u.sub); sets = sets.replace(/\$U/g, `$${params.length}`); }
      params.push(id);
      const r = await c.query(`update purchase_requests set ${sets} where id = $${params.length} returning id, code, status`, params);
      if (!r.rows[0]) throw new HttpException('PR tidak ditemukan', HttpStatus.NOT_FOUND);
      await this.audit(c, u, event, 'pr', id);
      return r.rows[0];
    }).catch((e) => mapDbError(e));
  }
  @Post('prs/:id/submit') @Roles('admin', 'supervisor', 'planner')
  submit(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.prStep(id, req.user, `status='submitted'`, [], 'pr_submit'); }
  @Post('prs/:id/approve') @Roles('admin', 'supervisor')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.prStep(id, req.user, `status='approved', approved_by=$U`, [], 'pr_approve'); }
  @Post('prs/:id/reject') @Roles('admin', 'supervisor')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(300) }), b);
    return this.prStep(id, req.user, `status='rejected', approved_by=$U, reject_reason=$1`, [reason], 'pr_reject');
  }
  @Post('prs/:id/order') @Roles('admin', 'supervisor', 'planner')
  order(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.prStep(id, req.user, `status='ordered'`, [], 'pr_order'); }

  /** Penerimaan barang: seluruh sisa item masuk stok, PR menjadi 'received'. */
  @Post('prs/:id/receive') @Roles('admin', 'supervisor', 'planner')
  async receive(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const u = req.user;
    try {
      return await this.db.tx(dbCtx(u), async (c) => {
        const pr = (await c.query('select code, status, plant_id from purchase_requests where id = $1 for update', [id])).rows[0];
        if (!pr) throw new HttpException('PR tidak ditemukan', HttpStatus.NOT_FOUND);
        if (pr.status !== 'ordered') throw new HttpException('Hanya PR berstatus ordered yang bisa diterima', HttpStatus.UNPROCESSABLE_ENTITY);
        const items = await c.query('select id, part_id, qty, qty_received from pr_items where pr_id = $1', [id]);
        for (const it of items.rows) {
          const rest = Number(it.qty) - Number(it.qty_received);
          if (rest <= 0) continue;
          await c.query(`insert into stock_tx (org_id, plant_id, part_id, kind, qty, pr_id, note, by_user) values ($1,$2,$3,'in',$4,$5,$6,$7)`, [u.org, pr.plant_id, it.part_id, rest, id, `Penerimaan ${pr.code}`, u.sub]);
          await c.query('update pr_items set qty_received = qty where id = $1', [it.id]);
        }
        const r = await c.query(`update purchase_requests set status = 'received' where id = $1 returning id, code, status`, [id]);
        await this.audit(c, u, 'pr_receive', 'pr', id);
        return r.rows[0];
      });
    } catch (e) { mapDbError(e); }
  }
}
