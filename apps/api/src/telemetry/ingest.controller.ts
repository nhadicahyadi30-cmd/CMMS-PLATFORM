import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Logger, Post, Req } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { Public } from '../auth/auth.guard';
import { parse } from '../common/http';
import { RateLimiter } from '../leads/leads.rules';
import { FRESH_MS, IngestDto, Reading, alarmMessage, breach, confirmedSeverity, num, parseKey, parseTs, secretMatches } from './telemetry.rules';

class ItemError extends Error {}
interface KeyInfo { id: string; orgId: string; plantId: string | null; name: string }

/** Pintu masuk data mesin dari Node-RED/gateway. Autentikasi: header `x-api-key` (atau Authorization: Bearer). */
@Controller('ingest')
export class IngestController {
  private log = new Logger('Ingest');
  private limiter = new RateLimiter(240, 60_000); // 240 permintaan/menit per kunci
  constructor(private db: DbService) {}

  private async authenticate(req: any): Promise<KeyInfo> {
    const h = String(req.headers['x-api-key'] ?? req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const p = parseKey(h);
    if (!p) throw new HttpException('API key tidak valid', HttpStatus.UNAUTHORIZED);
    const r = (await this.db.authPool.query('select id, org_id, plant_id, name, secret_hash, active from ingest_keys where id = $1', [p.id])).rows[0];
    if (!r || !r.active || !secretMatches(p.secret, r.secret_hash)) throw new HttpException('API key tidak valid', HttpStatus.UNAUTHORIZED);
    if (!this.limiter.allow(r.id)) throw new HttpException('Terlalu banyak permintaan', HttpStatus.TOO_MANY_REQUESTS);
    this.db.authPool.query(`update ingest_keys set last_used_at = now() where id = $1 and (last_used_at is null or last_used_at < now() - interval '1 minute')`, [r.id]).catch(() => undefined);
    return { id: r.id, orgId: r.org_id, plantId: r.plant_id, name: r.name };
  }
  private ctx(k: KeyInfo) { return { orgId: k.orgId, plantIds: k.plantId ? [k.plantId] : [], allPlants: !k.plantId }; }

  /** Uji koneksi + kunci dari Node-RED. */
  @Public() @Get('ping')
  async ping(@Req() req: any) { const k = await this.authenticate(req); return { ok: true, key: k.name, plantScoped: !!k.plantId }; }

  @Public() @Post('readings') @HttpCode(200)
  async readings(@Body() b: unknown, @Req() req: any) {
    const k = await this.authenticate(req);
    const { readings } = parse(IngestDto, b) as { readings: Reading[] };
    const out = { received: readings.length, accepted: 0, duplicates: 0, alarmsRaised: 0, alarmsEscalated: 0, errors: [] as { index: number; error: string }[] };
    await this.db.tx(this.ctx(k), async (c) => {
      const assets = new Map<string, any>(); const tags = new Map<string, any>();
      for (let i = 0; i < readings.length; i++) {
        await c.query('savepoint item');
        try { await this.one(c, readings[i], assets, tags, out); await c.query('release savepoint item'); }
        catch (e: any) {
          await c.query('rollback to savepoint item');
          out.errors.push({ index: i, error: e instanceof ItemError ? e.message : friendly(e) });
          if (!(e instanceof ItemError) && !friendly(e).startsWith('nilai')) this.log.warn(`item ${i}: ${e?.message}`);
        }
      }
    });
    return out;
  }

  private async one(c: PoolClient, r: Reading, assets: Map<string, any>, tags: Map<string, any>, out: any) {
    const now = Date.now(); const ts = parseTs(r.ts, now); const value = r.value as unknown as number;
    const akey = `${r.plant ?? ''}|${r.asset.toLowerCase()}`;
    if (!assets.has(akey)) {
      const rows = (await c.query(`select a.id, a.plant_id, a.code, a.name from assets a join plants p on p.id = a.plant_id where a.code = $1 and ($2::text is null or p.code::text = $2) limit 2`, [r.asset, r.plant ?? null])).rows;
      assets.set(akey, rows.length === 1 ? rows[0] : rows.length > 1 ? 'ambiguous' : null);
    }
    const a = assets.get(akey);
    if (a === null) throw new ItemError(`aset "${r.asset}" tidak ditemukan (atau di luar plant kunci ini)`);
    if (a === 'ambiguous') throw new ItemError(`kode aset "${r.asset}" ada di beberapa plant; sertakan field "plant"`);
    const tkey = `${a.id}|${r.tag}`;
    if (!tags.has(tkey)) tags.set(tkey, (await c.query('select * from sensor_tags where asset_id = $1 and tag = $2', [a.id, r.tag])).rows[0] ?? null);
    const t = tags.get(tkey);
    if (!t) throw new ItemError(`tag "${r.tag}" belum didefinisikan untuk aset ${a.code} (buat dulu di menu Telemetri)`);
    if (!t.active) throw new ItemError(`tag "${r.tag}" dinonaktifkan`);
    const lo = num(t.min_valid), hi = num(t.max_valid);
    if ((lo !== null && value < lo) || (hi !== null && value > hi)) throw new ItemError(`nilai ${value} di luar rentang wajar sensor (${lo ?? '-∞'} .. ${hi ?? '∞'})`);

    const ins = await c.query('insert into sensor_readings (tag_id, ts, value, org_id) values ($1,$2,$3,$4) on conflict do nothing returning 1', [t.id, ts, value, t.org_id]);
    if (!ins.rowCount) { out.duplicates++; return; }
    out.accepted++;

    if (t.kind === 'runhours') { // jam operasi kumulatif -> meter aset (dipakai PM berbasis meter); dicatat paling sering tiap 10 menit
      const m = (await c.query(`insert into asset_meters (org_id, asset_id, name, unit) values ($1,$2,'running_hours','jam') on conflict (asset_id, name) do update set unit = asset_meters.unit returning id`, [t.org_id, a.id])).rows[0].id;
      await c.query(`insert into meter_readings (meter_id, value, read_at, source) select $1, $2, $3, 'iot' where not exists (select 1 from meter_readings where meter_id = $1 and read_at > $3::timestamptz - interval '10 minutes')`, [m, value, ts]);
      return;
    }
    if (now - ts.getTime() > FRESH_MS) return; // backfill: simpan saja, jangan picu alarm
    const lim = { warnHigh: t.warn_high, critHigh: t.crit_high, warnLow: t.warn_low, critLow: t.crit_low };
    const b = breach(lim, value); if (!b) return;
    const recent = t.confirm_count > 1 ? (await c.query('select value from sensor_readings where tag_id = $1 order by ts desc limit $2', [t.id, t.confirm_count])).rows.map((x) => Number(x.value)) : [value];
    const sev = confirmedSeverity(lim, recent, t.confirm_count); if (!sev) return;
    const msg = alarmMessage({ assetCode: a.code, assetName: a.name, tagName: t.name, unit: t.unit, value, sev, side: b.side, limit: b.limit });
    const al = await c.query(
      `insert into alarms (org_id, plant_id, asset_id, severity, message, source, sensor_tag_id) values ($1,$2,$3,$4,$5,'api',$6)
       on conflict (sensor_tag_id) where sensor_tag_id is not null and status <> 'closed'
       do update set severity = excluded.severity where alarms.severity = 'warning' and excluded.severity = 'critical'
       returning (xmax = 0) as inserted`, [t.org_id, a.plant_id, a.id, sev, msg, t.id]);
    if (al.rows[0]) al.rows[0].inserted ? out.alarmsRaised++ : out.alarmsEscalated++;
  }
}

function friendly(e: any): string {
  if (e?.code === '23514') return `nilai ditolak: ${String(e.message).slice(0, 160)}`;
  if (e?.code === '22003') return 'nilai di luar jangkauan angka';
  return 'gagal menyimpan pembacaan';
}
