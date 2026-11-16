import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { dbCtx, RequireModule, Roles } from '../auth/auth.guard';
import { mapDbError, parse } from '../common/http';
import { newKey } from './telemetry.rules';

const Lim = z.number().finite().nullish();
const TagBody = z.object({
  assetId: z.string().uuid(),
  tag: z.string().trim().toLowerCase().regex(/^[a-z0-9_.-]{1,60}$/, 'tag: huruf kecil, angka, _ . -'),
  name: z.string().trim().min(1).max(120), unit: z.string().trim().max(20).default(''),
  kind: z.enum(['gauge', 'runhours']).default('gauge'),
  warnHigh: Lim, critHigh: Lim, warnLow: Lim, critLow: Lim, minValid: Lim, maxValid: Lim,
  confirmCount: z.number().int().min(1).max(20).default(1), active: z.boolean().default(true),
});
const TagPatch = TagBody.omit({ assetId: true, tag: true }).partial();
const COLS: Record<string, string> = { name: 'name', unit: 'unit', kind: 'kind', warnHigh: 'warn_high', critHigh: 'crit_high', warnLow: 'warn_low', critLow: 'crit_low', minValid: 'min_valid', maxValid: 'max_valid', confirmCount: 'confirm_count', active: 'active' };
const TAG_SEL = `t.id, t.asset_id as "assetId", a.code as "assetCode", a.name as "assetName", t.tag, t.name, t.unit, t.kind, t.warn_high::float8 as "warnHigh", t.crit_high::float8 as "critHigh",
  t.warn_low::float8 as "warnLow", t.crit_low::float8 as "critLow", t.min_valid::float8 as "minValid", t.max_valid::float8 as "maxValid", t.confirm_count as "confirmCount", t.active`;
const BUCKET: Record<string, string | null> = { raw: null, '1m': '1 minute', '5m': '5 minutes', '1h': '1 hour', '1d': '1 day' };

@Controller('telemetry')
@RequireModule(1)
export class TelemetryController {
  constructor(private db: DbService) {}
  private run<T>(req: any, fn: (c: PoolClient) => Promise<T>) { return this.db.tx(dbCtx(req.user), fn).catch((e) => mapDbError(e)); }

  // ---- API key (hanya admin) ----
  @Get('keys') @Roles('admin')
  keys(@Req() req: any) { return this.run(req, async (c) => (await c.query(`select k.id, k.name, k.plant_id as "plantId", p.name as "plantName", k.active, k.created_at as "createdAt", k.last_used_at as "lastUsedAt" from ingest_keys k left join plants p on p.id = k.plant_id order by k.created_at desc`)).rows); }

  @Post('keys') @Roles('admin')
  createKey(@Body() b: unknown, @Req() req: any) {
    const d = parse(z.object({ name: z.string().trim().min(1).max(120), plantId: z.string().uuid().nullish() }), b);
    const id = randomUUID(); const k = newKey(id);
    return this.run(req, async (c) => {
      await c.query('insert into ingest_keys (id, org_id, plant_id, name, secret_hash, created_by) values ($1,$2,$3,$4,$5,$6)', [id, req.user.org, d.plantId ?? null, d.name, k.hash, req.user.sub]);
      return { id, name: d.name, key: k.key, note: 'Simpan kunci ini sekarang. Kunci tidak dapat ditampilkan lagi.' };
    });
  }

  @Delete('keys/:id') @Roles('admin')
  revoke(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.run(req, async (c) => { const r = await c.query('update ingest_keys set active = false where id = $1 returning id', [id]); if (!r.rows[0]) throw new HttpException('Kunci tidak ditemukan', HttpStatus.NOT_FOUND); return { id, active: false }; });
  }

  // ---- Definisi sensor ----
  @Get('tags')
  tags(@Query() q: unknown, @Req() req: any) {
    const d = parse(z.object({ assetId: z.string().uuid().optional() }), q);
    return this.run(req, async (c) => (await c.query(`select ${TAG_SEL} from sensor_tags t join assets a on a.id = t.asset_id ${d.assetId ? 'where t.asset_id = $1' : ''} order by a.code, t.name limit 500`, d.assetId ? [d.assetId] : [])).rows);
  }

  @Post('tags') @Roles('admin', 'supervisor', 'planner')
  createTag(@Body() b: unknown, @Req() req: any) {
    const d = parse(TagBody, b);
    return this.run(req, async (c) => {
      const a = (await c.query('select plant_id from assets where id = $1', [d.assetId])).rows[0];
      if (!a) throw new HttpException('Aset tidak ditemukan', HttpStatus.NOT_FOUND);
      const r = await c.query(`insert into sensor_tags (org_id, plant_id, asset_id, tag, name, unit, kind, warn_high, crit_high, warn_low, crit_low, min_valid, max_valid, confirm_count, active)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
        [req.user.org, a.plant_id, d.assetId, d.tag, d.name, d.unit, d.kind, d.warnHigh ?? null, d.critHigh ?? null, d.warnLow ?? null, d.critLow ?? null, d.minValid ?? null, d.maxValid ?? null, d.confirmCount, d.active]);
      return r.rows[0];
    });
  }

  @Patch('tags/:id') @Roles('admin', 'supervisor', 'planner')
  patchTag(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(TagPatch, b) as Record<string, unknown>;
    const keys = Object.keys(d).filter((k) => COLS[k] && d[k] !== undefined);
    if (!keys.length) throw new HttpException('Tidak ada perubahan', HttpStatus.BAD_REQUEST);
    return this.run(req, async (c) => {
      const r = await c.query(`update sensor_tags set ${keys.map((k, i) => `${COLS[k]} = $${i + 2}`).join(', ')} where id = $1 returning id`, [id, ...keys.map((k) => d[k] ?? null)]);
      if (!r.rows[0]) throw new HttpException('Sensor tidak ditemukan', HttpStatus.NOT_FOUND); return r.rows[0];
    });
  }

  // ---- Data ----
  /** Nilai terakhir tiap sensor (opsional per aset). */
  @Get('latest')
  latest(@Query() q: unknown, @Req() req: any) {
    const d = parse(z.object({ assetId: z.string().uuid().optional() }), q);
    return this.run(req, async (c) => (await c.query(
      `select ${TAG_SEL}, r.ts as "lastTs", r.value as "lastValue"
         from sensor_tags t join assets a on a.id = t.asset_id
         left join lateral (select ts, value from sensor_readings where tag_id = t.id order by ts desc limit 1) r on true
        ${d.assetId ? 'where t.asset_id = $1' : ''} order by a.code, t.name limit 500`, d.assetId ? [d.assetId] : [])).rows);
  }

  /** Deret waktu untuk grafik. bucket: raw | 1m | 5m | 1h | 1d (rata-rata, min, maks per interval). */
  @Get('series')
  series(@Query() q: unknown, @Req() req: any) {
    const d = parse(z.object({ tagId: z.string().uuid(), hours: z.coerce.number().min(0.1).max(24 * 90).default(24), bucket: z.enum(['raw', '1m', '5m', '1h', '1d']).default('5m') }), q);
    const iv = BUCKET[d.bucket];
    return this.run(req, async (c) => {
      const sql = iv
        ? `select date_bin('${iv}'::interval, ts, timestamptz '2000-01-01') as ts, avg(value) as avg, min(value) as min, max(value) as max, count(*)::int as n from sensor_readings where tag_id = $1 and ts >= now() - make_interval(secs => $2) group by 1 order by 1 limit 5000`
        : `select ts, value as avg, value as min, value as max, 1 as n from sensor_readings where tag_id = $1 and ts >= now() - make_interval(secs => $2) order by ts limit 5000`;
      return (await c.query(sql, [d.tagId, d.hours * 3600])).rows;
    });
  }
}
