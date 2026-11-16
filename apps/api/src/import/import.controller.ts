import { Body, Controller, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { dbCtx, RequireModule, Roles } from '../auth/auth.guard';
import { mapDbError, parse } from '../common/http';
import { AssetRow, PartRow, RowError, TechRow, orderAssets, validateRows } from './import.rows';

const MAX_ROWS = 5000;
const Body_ = z.object({ rows: z.array(z.record(z.any())).min(1, 'Tidak ada baris data').max(MAX_ROWS, `Maksimal ${MAX_ROWS} baris per impor`), dryRun: z.boolean().default(false) });

class DryRun extends Error { constructor(public result: object) { super('dry-run'); } }
interface Outcome { imported: number; skipped: number }

/**
 * Impor massal. Aturan:
 *  - semua-atau-tidak-sama-sekali: satu baris bermasalah = tidak ada yang tersimpan, semua galat dilaporkan sekaligus;
 *  - kode yang sudah ada dilewati (bukan ditimpa), jadi berkas yang sama aman diimpor ulang;
 *  - dryRun menjalankan seluruh proses di database lalu membatalkannya, jadi pratinjau mencerminkan hasil sebenarnya.
 */
@Controller('import')
export class ImportController {
  constructor(private db: DbService) {}

  private async plantMap(c: PoolClient) {
    return new Map<string, string>((await c.query('select lower(code::text) as code, id from plants')).rows.map((p: any) => [p.code, p.id]));
  }

  private async execute(req: any, rawBody: unknown, work: (c: PoolClient, rows: Record<string, unknown>[], errors: RowError[]) => Promise<Outcome>, kind: string) {
    const b = parse(Body_, rawBody); const u = req.user;
    try {
      return await this.db.tx(dbCtx(u), async (c) => {
        const errors: RowError[] = [];
        const out = await work(c, b.rows, errors);
        if (errors.length) {
          errors.sort((x, y) => x.row - y.row);
          throw new HttpException({ message: `${errors.length} baris bermasalah. Tidak ada data yang disimpan.`, errors: errors.slice(0, 100), total: errors.length }, HttpStatus.UNPROCESSABLE_ENTITY);
        }
        if (b.dryRun) throw new DryRun({ dryRun: true, wouldImport: out.imported, skipped: out.skipped });
        await c.query(`insert into audit_log (org_id, user_id, event, entity, entity_id, detail) values ($1,$2,$3,$4,$5,$6)`, [u.org, u.sub, `import_${kind}`, kind, null, JSON.stringify(out)]);
        return { dryRun: false, ...out };
      });
    } catch (e) { if (e instanceof DryRun) return e.result; mapDbError(e); }
  }

  /** Jalankan satu INSERT dalam savepoint; galat DB dicatat per baris dan tidak menggagalkan baris lain. */
  private async tryInsert(c: PoolClient, n: number, errors: RowError[], sql: string, args: unknown[]): Promise<any | null> {
    await c.query('savepoint r');
    try { const r = await c.query(sql, args); await c.query('release savepoint r'); return r.rows[0] ?? {}; }
    catch (e: any) {
      await c.query('rollback to savepoint r');
      const m = e?.code === '23505' ? 'Data duplikat (kode atau nomor telepon sudah dipakai)' : e?.code === '23514' || e?.code === '23503' ? String(e.message) : 'Gagal menyimpan baris ini';
      errors.push({ row: n, message: m.slice(0, 200) }); return null;
    }
  }

  @Post('assets') @RequireModule(1) @Roles('admin', 'supervisor', 'planner')
  assets(@Body() body: unknown, @Req() req: any) {
    return this.execute(req, body, async (c, rows, errors) => {
      const v = validateRows(AssetRow, rows); errors.push(...v.errors);
      const plants = await this.plantMap(c);
      const existing = new Map<string, { id: string; plantId: string }>((await c.query('select lower(code::text) as code, id, plant_id from assets')).rows.map((a: any) => [a.code, { id: a.id, plantId: a.plant_id }]));
      const fresh: typeof v.ok = []; let skipped = 0;
      for (const r of v.ok) {
        if (!plants.has(r.d.plant.toLowerCase())) { errors.push({ row: r.n, message: `Plant "${r.d.plant}" tidak ada atau Anda tidak punya akses` }); continue; }
        if (existing.has(r.d.code.toLowerCase())) { skipped++; continue; }
        fresh.push(r);
      }
      const o = orderAssets(fresh, new Set(existing.keys())); errors.push(...o.errors);
      let imported = 0;
      for (const r of o.order) {
        const d = r.d; const plantId = plants.get(d.plant.toLowerCase())!;
        const parent = d.parent ? existing.get(d.parent.toLowerCase()) : undefined;
        if (d.parent && !parent) { errors.push({ row: r.n, message: `Induk "${d.parent}" gagal diimpor` }); continue; }
        if (parent && parent.plantId !== plantId) { errors.push({ row: r.n, message: `Induk "${d.parent}" berada di plant lain` }); continue; }
        const ins = await this.tryInsert(c, r.n, errors,
          `insert into assets (org_id, plant_id, parent_id, code, name, asset_type, manufacturer, model, serial_no, year_installed, status, crit_safety, crit_production, crit_quality, crit_cost)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,coalesce($11,'running'),coalesce($12,1),coalesce($13,1),coalesce($14,1),coalesce($15,1)) returning id`,
          [req.user.org, plantId, parent?.id ?? null, d.code, d.name, d.type, d.manufacturer ?? null, d.model ?? null, d.serial ?? null, d.year ?? null, d.status ?? null, d.critSafety ?? null, d.critProduction ?? null, d.critQuality ?? null, d.critCost ?? null]);
        if (ins) { existing.set(d.code.toLowerCase(), { id: ins.id, plantId }); imported++; }
      }
      return { imported, skipped };
    }, 'assets');
  }

  @Post('technicians') @RequireModule(10) @Roles('admin')
  technicians(@Body() body: unknown, @Req() req: any) {
    return this.execute(req, body, async (c, rows, errors) => {
      const v = validateRows(TechRow, rows); errors.push(...v.errors);
      const plants = await this.plantMap(c);
      const have = new Set<string>((await c.query('select lower(code) as code from technicians')).rows.map((t: any) => t.code));
      const seen = new Map<string, number>(); let imported = 0, skipped = 0;
      for (const r of v.ok) {
        const d = r.d; const k = d.code.toLowerCase();
        if (!plants.has(d.plant.toLowerCase())) { errors.push({ row: r.n, message: `Plant "${d.plant}" tidak ada atau Anda tidak punya akses` }); continue; }
        if (seen.has(k)) { errors.push({ row: r.n, message: `Kode "${d.code}" dobel di berkas (baris ${seen.get(k)})` }); continue; }
        seen.set(k, r.n);
        if (have.has(k)) { skipped++; continue; }
        const ins = await this.tryInsert(c, r.n, errors,
          `insert into technicians (org_id, plant_id, code, full_name, skill, shift, phone_e164, hourly_rate) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
          [req.user.org, plants.get(d.plant.toLowerCase()), d.code, d.fullName, d.skill, d.shift, d.phone ?? null, d.hourlyRate ?? 0]);
        if (ins) imported++;
      }
      return { imported, skipped };
    }, 'technicians');
  }

  @Post('parts') @RequireModule(6) @Roles('admin', 'supervisor', 'planner')
  parts(@Body() body: unknown, @Req() req: any) {
    return this.execute(req, body, async (c, rows, errors) => {
      const v = validateRows(PartRow, rows); errors.push(...v.errors);
      const plants = await this.plantMap(c);
      const have = new Set<string>((await c.query(`select lower(code::text) as k from parts`)).rows.map((p: any) => p.k));
      const seen = new Map<string, number>(); let imported = 0, skipped = 0;
      for (const r of v.ok) {
        const d = r.d; const plantId = plants.get(d.plant.toLowerCase());
        if (!plantId) { errors.push({ row: r.n, message: `Plant "${d.plant}" tidak ada atau Anda tidak punya akses` }); continue; }
        const k = d.code.toLowerCase();
        if (seen.has(k)) { errors.push({ row: r.n, message: `Kode "${d.code}" dobel di berkas (baris ${seen.get(k)})` }); continue; }
        seen.set(k, r.n);
        if (have.has(k)) { skipped++; continue; }
        const ins = await this.tryInsert(c, r.n, errors,
          `insert into parts (org_id, plant_id, code, name, category, unit, location, min_stock, reorder_qty, unit_cost, critical)
           values ($1,$2,$3,$4,coalesce($5,'umum'),coalesce($6,'pcs'),$7,coalesce($8,0),coalesce($9,1),coalesce($10,0),coalesce($11,false)) returning id`,
          [req.user.org, plantId, d.code, d.name, d.category ?? null, d.unit ?? null, d.location ?? null, d.minStock ?? null, d.reorderQty ?? null, d.unitCost ?? null, d.critical ?? null]);
        if (ins) imported++;
      }
      return { imported, skipped };
    }, 'parts');
  }
}
