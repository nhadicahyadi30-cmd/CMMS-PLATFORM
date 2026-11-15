import { Controller, Get, HttpException, HttpStatus, Query, Req, Res } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../db/db.service';
import { dbCtx, RequireModule } from '../auth/auth.guard';
import { parse } from '../common/http';
import { toCsv } from './csv';

const D = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Q = z.object({ from: D.optional(), to: D.optional(), plantId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(10), months: z.coerce.number().int().min(1).max(36).default(12) });

const camel = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
const day = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Dashboard KPI (modul 9). Semua rumus ada di fungsi SQL kpi_* (lihat db/migrations/0012_kpi.sql). */
@Controller('kpi')
@RequireModule(9)
export class KpiController {
  constructor(private db: DbService) {}

  /** Periode default: awal bulan ini s.d. hari ini (zona Asia/Jakarta). Divalidasi. */
  private async period(q: z.infer<typeof Q>, req: any) {
    let { from, to } = q;
    if (!from || !to) {
      const r = await this.db.tx(dbCtx(req.user), async (c) => (await c.query(
        `select to_char(date_trunc('month', now() at time zone 'Asia/Jakarta'), 'YYYY-MM-DD') as f, to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD') as t`)).rows[0]);
      from ??= r.f; to ??= r.t;
    }
    const n = (day(to!) - day(from!)) / 86400000 + 1;
    if (!(n >= 1)) throw new HttpException('Tanggal akhir harus setelah tanggal awal', HttpStatus.BAD_REQUEST);
    if (n > 400) throw new HttpException('Periode maksimal 400 hari', HttpStatus.BAD_REQUEST);
    return { from: from!, to: to!, days: n };
  }

  @Get('overview')
  async overview(@Query() raw: unknown, @Req() req: any) {
    const q = parse(Q, raw); const p = await this.period(q, req);
    const prevTo = iso(day(p.from) - 86400000), prevFrom = iso(day(p.from) - p.days * 86400000);
    return this.db.tx(dbCtx(req.user), async (c) => {
      const cur = (await c.query('select * from kpi_overview($1, $2, $3)', [p.from, p.to, q.plantId ?? null])).rows[0];
      const prev = (await c.query('select * from kpi_overview($1, $2, $3)', [prevFrom, prevTo, q.plantId ?? null])).rows[0];
      return { period: { from: p.from, to: p.to, prevFrom, prevTo }, current: camel(cur), previous: camel(prev) };
    });
  }

  @Get('trend')
  trend(@Query() raw: unknown, @Req() req: any) {
    const q = parse(Q, raw);
    return this.db.tx(dbCtx(req.user), async (c) => (await c.query('select * from kpi_trend($1, $2)', [q.months, q.plantId ?? null])).rows.map(camel));
  }

  @Get('pareto')
  async pareto(@Query() raw: unknown, @Req() req: any) {
    const q = parse(Q, raw); const p = await this.period(q, req);
    return this.db.tx(dbCtx(req.user), async (c) => (await c.query('select * from kpi_pareto($1, $2, $3, $4)', [p.from, p.to, q.plantId ?? null, q.limit])).rows.map(camel));
  }

  @Get('backlog')
  backlog(@Query() raw: unknown, @Req() req: any) {
    const q = parse(Q, raw);
    return this.db.tx(dbCtx(req.user), async (c) => (await c.query('select * from kpi_backlog($1)', [q.plantId ?? null])).rows.map(camel));
  }

  @Get('technicians')
  async technicians(@Query() raw: unknown, @Req() req: any) {
    const q = parse(Q, raw); const p = await this.period(q, req);
    return this.db.tx(dbCtx(req.user), async (c) => (await c.query('select * from kpi_technicians($1, $2, $3)', [p.from, p.to, q.plantId ?? null])).rows.map(camel));
  }

  @Get('cost-assets')
  async costAssets(@Query() raw: unknown, @Req() req: any) {
    const q = parse(Q, raw); const p = await this.period(q, req);
    return this.db.tx(dbCtx(req.user), async (c) => (await c.query('select * from kpi_cost_assets($1, $2, $3, $4)', [p.from, p.to, q.plantId ?? null, q.limit])).rows.map(camel));
  }

  /** Ekspor CSV: report = wo (daftar WO selesai), downtime (per aset), cost (biaya per aset). */
  @Get('export')
  async export(@Query('report') report: string, @Query() raw: unknown, @Req() req: any, @Res() res: any) {
    const q = parse(Q, raw); const p = await this.period(q, req);
    let csv: string;
    await this.db.tx(dbCtx(req.user), async (c) => {
      if (report === 'wo') {
        const r = await c.query(
          `select w.code, w.wo_type as type, a.code as asset, a.name as asset_name, w.priority, w.status, to_char(w.created_at at time zone 'Asia/Jakarta','YYYY-MM-DD HH24:MI') as created,
                  to_char(w.done_at at time zone 'Asia/Jakarta','YYYY-MM-DD HH24:MI') as done, w.actual_hours, w.downtime_hours, t.full_name as technician,
                  coalesce((select sum(case s.kind when 'out' then s.qty * s.unit_cost else -s.qty * s.unit_cost end) from stock_tx s where s.wo_id = w.id and s.kind in ('out','return')), 0) as parts_cost,
                  coalesce(w.actual_hours * t.hourly_rate, 0) as labor_cost
             from work_orders w join assets a on a.id = w.asset_id left join technicians t on t.id = w.technician_id
            where w.status in ('done','closed') and ($3::uuid is null or w.plant_id = $3) and (w.done_at at time zone 'Asia/Jakarta')::date between $1 and $2 order by w.done_at`, [p.from, p.to, q.plantId ?? null]);
        csv = toCsv(r.rows, [['code', 'No. WO'], ['type', 'Jenis'], ['asset', 'Kode aset'], ['asset_name', 'Aset'], ['priority', 'Prioritas'], ['status', 'Status'], ['created', 'Dibuat'], ['done', 'Selesai'],
          ['actual_hours', 'Jam kerja'], ['downtime_hours', 'Downtime (jam)'], ['technician', 'Teknisi'], ['parts_cost', 'Biaya suku cadang'], ['labor_cost', 'Biaya tenaga kerja']].map(([key, label]) => ({ key, label })));
      } else if (report === 'downtime') {
        const r = await c.query('select * from kpi_pareto($1, $2, $3, 1000)', [p.from, p.to, q.plantId ?? null]);
        csv = toCsv(r.rows, [['code', 'Kode aset'], ['name', 'Aset'], ['breakdowns', 'Breakdown'], ['downtime_h', 'Downtime (jam)'], ['share_pct', '% dari total'], ['cum_pct', '% kumulatif']].map(([key, label]) => ({ key, label })));
      } else if (report === 'cost') {
        const r = await c.query('select * from kpi_cost_assets($1, $2, $3, 1000)', [p.from, p.to, q.plantId ?? null]);
        csv = toCsv(r.rows, [['code', 'Kode aset'], ['name', 'Aset'], ['wo_count', 'Jumlah WO'], ['parts_cost', 'Biaya suku cadang'], ['labor_cost', 'Biaya tenaga kerja'], ['total_cost', 'Total']].map(([key, label]) => ({ key, label })));
      } else throw new HttpException('report harus wo, downtime, atau cost', HttpStatus.BAD_REQUEST);
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-${report}-${p.from}_${p.to}.csv"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(csv!);
  }
}
