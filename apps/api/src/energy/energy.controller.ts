import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { dbCtx, RequireModule, Roles } from '../auth/auth.guard';
import { mapDbError, parse } from '../common/http';
import { MeterDto, meterConn } from './meters.rules';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD');
const SHIFTS = ['pagi', 'siang', 'malam'] as const;
const UnitDto = z.object({ plantId: z.string().uuid(), code: z.string().trim().min(1).max(30), name: z.string().trim().min(2).max(120), kind: z.enum(['line', 'utility']) });
const EntryBase = z.object({
  periodKind: z.enum(['day', 'shift', 'range', 'po']), dateFrom: date, dateTo: date.optional(),
  shift: z.enum(SHIFTS).optional(), poCode: z.string().trim().min(1).max(40).optional(), sku: z.string().trim().max(60).optional(),
  kwh: z.number().min(0).max(1e9), ton: z.number().min(0).max(1e9).nullish(), note: z.string().trim().max(300).optional(),
});
const EntryDto = EntryBase.extend({ plantId: z.string().uuid(), unitId: z.string().uuid() });
const RangeQ = z.object({ plantId: z.string().uuid().optional(), from: date, to: date });
const MAX_IMPORT = 2000;

/** Satu entri: tanggal akhir bawaan = tanggal awal untuk hari/shift. Aturan bentuk & bentrok ditegakkan di DB. */
async function insertEntry(c: PoolClient, org: string, by: string, plantId: string, unitId: string, e: z.infer<typeof EntryBase>) {
  const to = e.dateTo ?? e.dateFrom;
  return (await c.query(
    `insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, shift, po_code, sku, kwh, ton, note, by_user)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
    [org, plantId, unitId, e.periodKind, e.dateFrom, to, e.shift ?? null, e.poCode ?? null, e.sku ?? null, e.kwh, e.ton ?? null, e.note ?? null, by])).rows[0];
}

@Controller('energy')
@RequireModule(7)
export class EnergyController {
  constructor(private db: DbService) {}
  private run<T>(req: any, fn: (c: PoolClient) => Promise<T>) { return this.db.tx(dbCtx(req.user), fn).catch((e) => mapDbError(e)); }
  private audit(c: PoolClient, u: any, event: string, id: string, detail: object = {}) {
    return c.query('insert into audit_log (org_id, user_id, event, entity, entity_id, detail) values ($1,$2,$3,$4,$5,$6)', [u.org, u.sub, event, 'energy', id, JSON.stringify(detail)]);
  }

  // ---------- unit & tarif ----------
  @Get('units')
  units(@Query('plantId') plantId: string | undefined, @Req() req: any) {
    const pid = plantId ? parse(z.string().uuid(), plantId) : null;
    return this.run(req, async (c) => (await c.query(
      `select u.id, u.plant_id as "plantId", u.code, u.name, u.kind, u.active from energy_units u where ($1::uuid is null or u.plant_id = $1) order by u.active desc, u.kind, u.code`, [pid])).rows);
  }
  @Post('units') @Roles('admin', 'supervisor', 'planner')
  addUnit(@Body() b: unknown, @Req() req: any) {
    const d = parse(UnitDto, b);
    return this.run(req, async (c) => (await c.query(
      `insert into energy_units (org_id, plant_id, code, name, kind) values ($1,$2,$3,$4,$5) returning id, code, name, kind, active`, [req.user.org, d.plantId, d.code, d.name, d.kind])).rows[0]);
  }
  @Patch('units/:id') @Roles('admin', 'supervisor', 'planner')
  patchUnit(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(z.object({ name: z.string().trim().min(2).max(120).optional(), active: z.boolean().optional() }), b);
    return this.run(req, async (c) => {
      const r = await c.query('update energy_units set name = coalesce($1, name), active = coalesce($2, active) where id = $3 returning id, code, name, active', [d.name ?? null, d.active ?? null, id]);
      if (!r.rows[0]) throw new HttpException('Unit tidak ditemukan', HttpStatus.NOT_FOUND); return r.rows[0];
    });
  }

  @Get('tariffs')
  tariffs(@Query('plantId') plantId: string | undefined, @Req() req: any) {
    const pid = plantId ? parse(z.string().uuid(), plantId) : null;
    return this.run(req, async (c) => (await c.query(
      `select id, plant_id as "plantId", valid_from as "validFrom", price_per_kwh as "pricePerKwh" from energy_tariffs where ($1::uuid is null or plant_id = $1) order by plant_id, valid_from desc`, [pid])).rows);
  }
  @Post('tariffs') @Roles('admin', 'supervisor')
  addTariff(@Body() b: unknown, @Req() req: any) {
    const d = parse(z.object({ plantId: z.string().uuid(), validFrom: date, pricePerKwh: z.number().min(0).max(1e6) }), b);
    return this.run(req, async (c) => (await c.query(
      `insert into energy_tariffs (org_id, plant_id, valid_from, price_per_kwh) values ($1,$2,$3,$4) returning id`, [req.user.org, d.plantId, d.validFrom, d.pricePerKwh])).rows[0]);
  }
  @Delete('tariffs/:id') @Roles('admin', 'supervisor')
  delTariff(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.run(req, async (c) => { await c.query('delete from energy_tariffs where id = $1', [id]); return { ok: true }; });
  }

  // ---------- power meter ----------
  @Get('meters')
  meters(@Query('plantId') plantId: string | undefined, @Req() req: any) {
    const pid = plantId ? parse(z.string().uuid(), plantId) : null;
    return this.run(req, async (c) => (await c.query(
      `select m.id, m.plant_id as "plantId", m.unit_id as "unitId", u.code as "unitCode", u.name as "unitName", m.code, m.name, m.multiplier::float8 as multiplier, m.active, m.last_seen as "lastSeen", m.last_kwh as "lastKwh",
              (select count(*)::int from energy_entries e where e.unit_id = m.unit_id and e.source = 'meter') as "autoDays"
         from energy_meters m join energy_units u on u.id = m.unit_id where ($1::uuid is null or m.plant_id = $1) order by m.active desc, u.code, m.code`, [pid]))
      .rows.map((r: any) => ({ ...r, conn: r.active ? meterConn(r.lastSeen ? new Date(r.lastSeen).getTime() : null) : 'offline' })));
  }
  @Post('meters') @Roles('admin', 'supervisor', 'planner')
  addMeter(@Body() b: unknown, @Req() req: any) {
    const d = parse(MeterDto, b);
    return this.run(req, async (c) => {
      const r = (await c.query(`insert into energy_meters (org_id, plant_id, unit_id, code, name, multiplier) values ($1,$2,$3,$4,$5,$6) returning id, code, name`, [req.user.org, d.plantId, d.unitId, d.code, d.name, d.multiplier])).rows[0];
      await this.audit(c, req.user, 'energy.meter.create', r.id, { code: d.code, unitId: d.unitId }); return r;
    });
  }
  @Patch('meters/:id') @Roles('admin', 'supervisor', 'planner')
  patchMeter(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(z.object({ name: z.string().trim().min(2).max(120).optional(), multiplier: z.number().gt(0).max(1e6).optional(), active: z.boolean().optional() }), b);
    return this.run(req, async (c) => {
      const r = await c.query('update energy_meters set name = coalesce($1, name), multiplier = coalesce($2, multiplier), active = coalesce($3, active) where id = $4 returning id, code, name, active', [d.name ?? null, d.multiplier ?? null, d.active ?? null, id]);
      if (!r.rows[0]) throw new HttpException('Meter tidak ditemukan', HttpStatus.NOT_FOUND);
      await this.audit(c, req.user, 'energy.meter.update', id, d); return r.rows[0];
    });
  }
  /** Hitung ulang kWh harian dari pembacaan meter (mis. setelah mengubah multiplier atau data terlambat). Maks 62 hari ke belakang. */
  @Post('meters/rollup') @Roles('admin', 'supervisor', 'planner')
  rollup(@Body() b: unknown, @Req() req: any) {
    const d = parse(z.object({ plantId: z.string().uuid(), days: z.number().int().min(1).max(62).default(14) }), b);
    return this.run(req, async (c) => {
      const rows = (await c.query(`select u.id, (now() at time zone p.timezone)::date as today from energy_units u join plants p on p.id = u.plant_id where u.plant_id = $1 and u.active`, [d.plantId])).rows;
      let days = 0; for (const u of rows) days += Number((await c.query('select energy_meter_rollup($1, $2::date, $3) as n', [u.id, u.today, d.days])).rows[0].n);
      await this.audit(c, req.user, 'energy.meter.rollup', d.plantId, { days: d.days, written: days }); return { daysWritten: days };
    });
  }

  // ---------- entri ----------
  @Get('entries')
  entries(@Query() q: unknown, @Req() req: any) {
    const d = parse(RangeQ.extend({ unitId: z.string().uuid().optional() }), q);
    return this.run(req, async (c) => (await c.query(
      `select e.id, e.unit_id as "unitId", u.code as "unitCode", e.period_kind as "periodKind", e.date_from as "dateFrom", e.date_to as "dateTo", e.shift, e.po_code as "poCode", e.sku,
              e.kwh, e.ton, e.note, e.source, x.full_name as "byName"
         from energy_entries e join energy_units u on u.id = e.unit_id left join users x on x.id = e.by_user
        where e.date_to >= $1 and e.date_from <= $2 and ($3::uuid is null or e.plant_id = $3) and ($4::uuid is null or e.unit_id = $4)
        order by e.date_from desc, u.code limit 500`, [d.from, d.to, d.plantId ?? null, d.unitId ?? null])).rows);
  }
  @Post('entries') @Roles('admin', 'supervisor', 'planner')
  addEntry(@Body() b: unknown, @Req() req: any) {
    const d = parse(EntryDto, b);
    return this.run(req, async (c) => {
      const r = await insertEntry(c, req.user.org, req.user.sub, d.plantId, d.unitId, d);
      await this.audit(c, req.user, 'energy.entry.create', r.id, { unitId: d.unitId, periodKind: d.periodKind, kwh: d.kwh }); return r;
    });
  }
  @Delete('entries/:id') @Roles('admin', 'supervisor', 'planner')
  delEntry(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.run(req, async (c) => {
      const r = await c.query('delete from energy_entries where id = $1 returning id, unit_id, kwh', [id]);
      if (!r.rows[0]) throw new HttpException('Entri tidak ditemukan', HttpStatus.NOT_FOUND);
      await this.audit(c, req.user, 'energy.entry.delete', id, { kwh: r.rows[0].kwh }); return { ok: true };
    });
  }

  /** Impor massal (baris sudah di-parse dari CSV di browser). Semua-atau-tidak-sama-sekali: bila ada baris bermasalah tidak ada yang disimpan. */
  @Post('import') @Roles('admin', 'supervisor', 'planner')
  import(@Body() b: unknown, @Req() req: any) {
    const d = parse(z.object({ plantId: z.string().uuid(), rows: z.array(z.record(z.any())).min(1).max(MAX_IMPORT) }), b);
    const RowDto = EntryBase.extend({ unit: z.string().trim().min(1) });
    return this.db.tx(dbCtx(req.user), async (c) => {
      const units = new Map<string, string>((await c.query('select code, id from energy_units where plant_id = $1 and active', [d.plantId])).rows.map((u: any) => [String(u.code).toLowerCase(), u.id]));
      const errors: { row: number; message: string }[] = []; let ok = 0;
      for (let i = 0; i < d.rows.length; i++) {
        const n = i + 1; const p = RowDto.safeParse(d.rows[i]);
        if (!p.success) { errors.push({ row: n, message: p.error.issues.map((x) => `${x.path.join('.') || 'baris'}: ${x.message}`).join('; ') }); continue; }
        const unitId = units.get(p.data.unit.toLowerCase());
        if (!unitId) { errors.push({ row: n, message: `Unit "${p.data.unit}" tidak ada di plant ini` }); continue; }
        await c.query('savepoint r');
        try { await insertEntry(c, req.user.org, req.user.sub, d.plantId, unitId, p.data); await c.query('release savepoint r'); ok++; }
        catch (e: any) { await c.query('rollback to savepoint r'); errors.push({ row: n, message: String(e.message).slice(0, 200) }); }
      }
      if (errors.length) { const err = new HttpException({ message: `${errors.length} baris bermasalah, tidak ada yang disimpan`, errors: errors.slice(0, 50), total: errors.length }, HttpStatus.UNPROCESSABLE_ENTITY); throw err; }
      await this.audit(c, req.user, 'energy.import', d.plantId, { rows: ok });
      return { imported: ok };
    }).catch((e) => mapDbError(e));
  }

  // ---------- analitik ----------
  @Get('summary')
  summary(@Query() q: unknown, @Req() req: any) {
    const d = parse(RangeQ, q);
    return this.run(req, async (c) => (await c.query(
      `select unit_id as "unitId", code, name, kind, kwh, ton, kwh_per_ton as "kwhPerTon", cost, share_pct as "sharePct" from energy_summary($1,$2,$3)`, [d.from, d.to, d.plantId ?? null])).rows);
  }
  @Get('daily')
  daily(@Query() q: unknown, @Req() req: any) {
    const d = parse(RangeQ.extend({ unitId: z.string().uuid().optional() }), q);
    return this.run(req, async (c) => (await c.query(
      `select x.unit_id as "unitId", u.code, x.day, round(x.kwh, 1) as kwh, round(x.ton, 1) as ton from energy_daily($1,$2,$3,$4) x join energy_units u on u.id = x.unit_id order by x.day, u.code`,
      [d.from, d.to, d.plantId ?? null, d.unitId ?? null])).rows);
  }
  @Get('regression')
  regression(@Query() q: unknown, @Req() req: any) {
    const d = parse(RangeQ, q);
    return this.run(req, async (c) => (await c.query(
      `select unit_id as "unitId", code, name, days, base_kwh as "baseKwh", kwh_per_ton as "kwhPerTon", r2 from energy_regression($1,$2,$3)`, [d.from, d.to, d.plantId ?? null])).rows);
  }
  @Get('anomalies')
  anomalies(@Query() q: unknown, @Req() req: any) {
    const d = parse(RangeQ.extend({ z: z.coerce.number().min(1).max(5).default(2) }), q);
    return this.run(req, async (c) => (await c.query(
      `select unit_id as "unitId", code, day, kwh, ton, expected, z from energy_anomalies($1,$2,$3,$4)`, [d.from, d.to, d.plantId ?? null, d.z])).rows);
  }
  @Get('trend')
  trend(@Query() q: unknown, @Req() req: any) {
    const d = parse(z.object({ plantId: z.string().uuid().optional(), months: z.coerce.number().int().min(2).max(24).default(12) }), q);
    return this.run(req, async (c) => (await c.query(
      `select month, line_kwh as "lineKwh", ton, kwh_per_ton as "kwhPerTon", utility_kwh as "utilityKwh" from energy_trend($1,$2)`, [d.months, d.plantId ?? null])).rows);
  }
}
