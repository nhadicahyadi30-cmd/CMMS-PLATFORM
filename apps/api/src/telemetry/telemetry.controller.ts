import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { dbCtx, RequireModule, Roles } from '../auth/auth.guard';
import { mapDbError, parse } from '../common/http';
import { newKey } from './telemetry.rules';
import { connOf, levelOf, runStateOf, worstLevel, Level } from './monitor.rules';
import { healthScore, pmForecast, predictSensor, worstStatus, SensorStatus } from './predict.rules';

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

  /** Prediksi per aset: status sensor, ETA ke batas, anomali, skor kesehatan, perkiraan PM berbasis jam jalan. */
  @Get('predictions')
  predictions(@Query() q: unknown, @Req() req: any) {
    const d = parse(z.object({ hours: z.coerce.number().min(2).max(24 * 14).default(24), assetId: z.string().uuid().optional() }), q);
    return this.run(req, async (c) => {
      const now = Date.now();
      const tags = (await c.query(
        `select ${TAG_SEL}, a.plant_id as "plantId", r.ts as "lastTs", r.value::float8 as "lastValue"
           from sensor_tags t join assets a on a.id = t.asset_id
           left join lateral (select ts, value from sensor_readings where tag_id = t.id order by ts desc limit 1) r on true
          where t.active ${d.assetId ? 'and t.asset_id = $1' : ''} order by a.code, t.name limit 500`, d.assetId ? [d.assetId] : [])).rows;
      const ids = tags.map((t: any) => t.id);
      const pts = new Map<string, { t: number; v: number }[]>();
      if (ids.length) {
        const rows = (await c.query(
          `select tag_id, date_bin('10 minutes', ts, timestamptz '2000-01-01') as ts, avg(value)::float8 as v
             from sensor_readings where tag_id = any($1::uuid[]) and ts >= now() - make_interval(secs => $2)
            group by 1, 2 order by 1, 2`, [ids, d.hours * 3600])).rows;
        for (const r of rows) { const a = pts.get(r.tag_id) ?? []; a.push({ t: new Date(r.ts).getTime(), v: r.v }); pts.set(r.tag_id, a); }
      }
      const pm = (await c.query(
        `select p.id, p.asset_id as "assetId", p.name, p.interval_meter::float8 as interval, p.last_meter::float8 as "lastMeter",
                cur.value::float8 as current, rt.rate_per_day::float8 as "ratePerDay"
           from pm_plans p
           left join lateral (select value from meter_readings where meter_id = p.meter_id order by read_at desc limit 1) cur on true
           left join lateral (select case when extract(epoch from (max(read_at) - min(read_at))) >= 3600
                                          then (max(value) - min(value)) / (extract(epoch from (max(read_at) - min(read_at))) / 86400) end as rate_per_day
                                from meter_readings where meter_id = p.meter_id and read_at >= now() - interval '7 days') rt on true
          where p.active and p.trigger_type = 'meter' ${d.assetId ? 'and p.asset_id = $1' : ''}`, d.assetId ? [d.assetId] : [])).rows;
      const hrs = (await c.query(
        `select m.asset_id as "assetId", cur.value::float8 as value
           from asset_meters m join lateral (select value from meter_readings where meter_id = m.id order by read_at desc limit 1) cur on true
          where m.name = 'running_hours' ${d.assetId ? 'and m.asset_id = $1' : ''}`, d.assetId ? [d.assetId] : [])).rows;

      const byAsset = new Map<string, any>();
      const slot = (t: any) => { let a = byAsset.get(t.assetId); if (!a) { a = { assetId: t.assetId, code: t.assetCode, name: t.assetName, plantId: t.plantId, sensors: [], pm: [], runningHours: null }; byAsset.set(t.assetId, a); } return a; };
      for (const t of tags) {
        const lim = { warnHigh: t.warnHigh, critHigh: t.critHigh, warnLow: t.warnLow, critLow: t.critLow };
        const pr = predictSensor({ kind: t.kind, limits: lim, points: pts.get(t.id) ?? [], lastTs: t.lastTs ? new Date(t.lastTs).getTime() : null, lastValue: t.lastValue, now });
        slot(t).sensors.push({ tagId: t.id, tag: t.tag, name: t.name, unit: t.unit, kind: t.kind, lastValue: t.lastValue, lastTs: t.lastTs, ...lim, ...pr });
      }
      for (const h of hrs) { const a = byAsset.get(h.assetId); if (a) a.runningHours = h.value; }
      for (const p of pm) {
        const a = byAsset.get(p.assetId); if (!a) continue;
        a.pm.push({ planId: p.id, name: p.name, interval: p.interval, current: p.current, ...pmForecast(p.lastMeter, p.interval, p.current, p.ratePerDay) });
      }
      const assets = [...byAsset.values()].map((a) => {
        const sts: SensorStatus[] = a.sensors.map((s: any) => s.status);
        const overdue = a.pm.some((x: any) => x.state === 'overdue'), soon = a.pm.some((x: any) => x.state === 'soon');
        return { ...a, status: worstStatus(sts), health: healthScore(sts, overdue, soon) };
      }).sort((x, y) => x.health - y.health);
      const summary = { assets: assets.length, critical: 0, risk: 0, watch: 0, offline: 0, ok: 0, nodata: 0, pmOverdue: 0, pmSoon: 0 } as Record<string, number>;
      for (const a of assets) { summary[a.status]++; summary.pmOverdue += a.pm.filter((x: any) => x.state === 'overdue').length; summary.pmSoon += a.pm.filter((x: any) => x.state === 'soon').length; }
      return { generatedAt: new Date(now).toISOString(), windowHours: d.hours, summary, assets };
    });
  }

  /** Monitoring langsung: nilai terakhir, tren 60 menit, status koneksi dan jalan/berhenti per mesin. */
  @Get('monitor')
  monitor(@Query() q: unknown, @Req() req: any) {
    const d = parse(z.object({ minutes: z.coerce.number().int().min(10).max(720).default(60) }), q);
    return this.run(req, async (c) => {
      const now = Date.now();
      const tags = (await c.query(
        `select ${TAG_SEL}, a.plant_id as "plantId", r.ts as "lastTs", r.value::float8 as "lastValue"
           from sensor_tags t join assets a on a.id = t.asset_id
           left join lateral (select ts, value from sensor_readings where tag_id = t.id order by ts desc limit 1) r on true
          where t.active order by a.code, t.name limit 500`)).rows;
      const ids = tags.map((t: any) => t.id);
      const spark = new Map<string, number[]>(); const win = new Map<string, { n: number; mn: number; mx: number }>();
      if (ids.length) {
        for (const r of (await c.query(
          `select tag_id, avg(value)::float8 as v from (
              select tag_id, value, date_bin(make_interval(mins => greatest(1, $2::int / 24)), ts, timestamptz '2000-01-01') as b
                from sensor_readings where tag_id = any($1::uuid[]) and ts >= now() - make_interval(mins => $2::int)) x
            group by tag_id, b order by tag_id, b`, [ids, d.minutes])).rows) {
          const a = spark.get(r.tag_id) ?? []; a.push(r.v); spark.set(r.tag_id, a);
        }
        for (const r of (await c.query(
          `select tag_id, count(*)::int as n, min(value)::float8 as mn, max(value)::float8 as mx from sensor_readings
            where tag_id = any($1::uuid[]) and ts >= now() - interval '20 minutes' group by tag_id`, [ids])).rows) win.set(r.tag_id, { n: r.n, mn: r.mn, mx: r.mx });
      }
      const m = new Map<string, any>();
      for (const t of tags) {
        let a = m.get(t.assetId); if (!a) { a = { assetId: t.assetId, code: t.assetCode, name: t.assetName, plantId: t.plantId, lastTs: null as number | null, runningHours: null as number | null, runState: 'unknown', sensors: [] as any[] }; m.set(t.assetId, a); }
        const ts = t.lastTs ? new Date(t.lastTs).getTime() : null;
        if (ts != null && (a.lastTs == null || ts > a.lastTs)) a.lastTs = ts;
        const lim = { warnHigh: t.warnHigh, critHigh: t.critHigh, warnLow: t.warnLow, critLow: t.critLow };
        const stale = ts == null || now - ts > 15 * 60_000;
        a.sensors.push({ tagId: t.id, tag: t.tag, name: t.name, unit: t.unit, kind: t.kind, lastValue: t.lastValue, lastTs: t.lastTs, ...lim, level: stale ? 'ok' : levelOf(t.lastValue, lim), spark: spark.get(t.id) ?? [] });
        if (t.kind === 'runhours') { a.runningHours = t.lastValue; a._w = win.get(t.id); }
      }
      const assets = [...m.values()].map((a) => {
        const conn = connOf(a.lastTs, now);
        const w = a._w; delete a._w;
        const runState = runStateOf(w?.n ?? 0, w?.mn ?? null, w?.mx ?? null, conn);
        const level: Level = worstLevel(a.sensors.map((s: any) => s.level));
        return { ...a, conn, runState, level };
      }).sort((x, y) => (y.level === 'critical' ? 2 : y.level === 'warning' ? 1 : 0) - (x.level === 'critical' ? 2 : x.level === 'warning' ? 1 : 0) || x.code.localeCompare(y.code));
      const sum = { assets: assets.length, online: 0, offline: 0, running: 0, stopped: 0, warning: 0, critical: 0 };
      for (const a of assets) { if (a.conn === 'online' || a.conn === 'delayed') sum.online++; else sum.offline++; if (a.runState === 'running') sum.running++; if (a.runState === 'stopped') sum.stopped++; if (a.level === 'warning') sum.warning++; if (a.level === 'critical') sum.critical++; }
      return { generatedAt: new Date(now).toISOString(), minutes: d.minutes, summary: sum, assets };
    });
  }
}
