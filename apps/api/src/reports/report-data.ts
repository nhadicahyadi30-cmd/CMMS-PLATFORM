import { PoolClient } from 'pg';
import { daysIn, Freq, previousPeriod } from './report-period';

const camel = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export interface Overview {
  availabilityPct: number | null; mttrH: number | null; mtbfH: number | null; pmCompliancePct: number | null; pmDue: number; pmOntime: number;
  woCreated: number; woDone: number; backlog: number; backlogOverdue: number; breakdowns: number; downtimeH: number; slaPct: number | null;
  partsCost: number; laborCost: number; equipment: number;
}
export interface ReportData {
  frequency: Freq;
  period: { from: string; to: string; prevFrom: string; prevTo: string; days: number };
  org: string; plant: string; generatedAt: string;
  current: Overview; previous: Overview;
  pareto: { code: string; name: string; breakdowns: number; downtimeH: number; sharePct: number }[];
  backlog: { bucket: string; n: number; overdue: number }[];
  costAssets: { code: string; name: string; woCount: number; partsCost: number; laborCost: number; totalCost: number }[];
  technicians: { code: string; name: string; done: number; hours: number; avgH: number | null; slaPct: number | null }[];
  lowStock: { code: string; name: string; onHand: number; minStock: number; unit: string; critical: boolean }[];
  trend: { month: string; breakdowns: number; downtimeH: number; pmDue: number; pmOntime: number }[] | null;
}

function overview(r: Record<string, unknown>): Overview {
  const o = camel(r) as any;
  return {
    availabilityPct: num(o.availabilityPct), mttrH: num(o.mttrH), mtbfH: num(o.mtbfH), pmCompliancePct: num(o.pmCompliancePct), pmDue: +o.pmDue, pmOntime: +o.pmOntime,
    woCreated: +o.woCreated, woDone: +o.woDone, backlog: +o.backlog, backlogOverdue: +o.backlogOverdue, breakdowns: +o.breakdowns, downtimeH: +o.downtimeH,
    slaPct: num(o.slaPct), partsCost: +o.partsCost, laborCost: +o.laborCost, equipment: +o.equipment,
  };
}

/** Kumpulkan semua angka laporan. Dipanggil di dalam transaksi ber-konteks RLS, jadi hanya data plant yang boleh dilihat pemanggil. */
export async function buildReport(c: PoolClient, o: { freq: Freq; from: string; to: string; plantId: string | null }): Promise<ReportData> {
  const prev = previousPeriod(o.freq, o.from, o.to);
  const p = o.plantId;
  const q = async (sql: string, args: unknown[]) => (await c.query(sql, args)).rows;

  const [cur] = await q('select * from kpi_overview($1,$2,$3)', [o.from, o.to, p]);
  const [pre] = await q('select * from kpi_overview($1,$2,$3)', [prev.from, prev.to, p]);
  const [meta] = await q(`select (select name from organizations where id = app_org()) as org,
                                 case when $1::uuid is null then 'Semua plant' else (select name from plants where id = $1) end as plant,
                                 to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI') as at`, [p]);
  const pareto = (await q('select * from kpi_pareto($1,$2,$3,5)', [o.from, o.to, p])).map((r) => ({ code: String(r.code), name: r.name, breakdowns: +r.breakdowns, downtimeH: +r.downtime_h, sharePct: +r.share_pct }));
  const backlog = (await q('select * from kpi_backlog($1)', [p])).map((r) => ({ bucket: r.bucket, n: +r.n, overdue: +r.overdue }));
  const costAssets = (await q('select * from kpi_cost_assets($1,$2,$3,5)', [o.from, o.to, p])).map((r) => ({ code: String(r.code), name: r.name, woCount: +r.wo_count, partsCost: +r.parts_cost, laborCost: +r.labor_cost, totalCost: +r.total_cost }));
  const technicians = (await q('select * from kpi_technicians($1,$2,$3)', [o.from, o.to, p])).filter((r) => +r.done > 0).slice(0, 8)
    .map((r) => ({ code: r.code, name: r.name, done: +r.done, hours: +r.hours, avgH: num(r.avg_h), slaPct: num(r.sla_pct) }));
  const lowStock = (await q(`select code::text as code, name, on_hand, min_stock, unit, critical from parts
                              where active and on_hand <= min_stock and min_stock > 0 and ($1::uuid is null or plant_id = $1)
                              order by critical desc, (on_hand / min_stock) asc, code limit 10`, [p]))
    .map((r) => ({ code: r.code, name: r.name, onHand: +r.on_hand, minStock: +r.min_stock, unit: r.unit, critical: !!r.critical }));
  const trend = o.freq === 'monthly' || o.freq === 'yearly'
    ? (await q('select * from kpi_trend(12, $1)', [p])).map((r) => ({ month: new Date(r.month).toISOString().slice(0, 7), breakdowns: +r.breakdowns, downtimeH: +r.downtime_h, pmDue: +r.pm_due, pmOntime: +r.pm_ontime }))
    : null;

  return {
    frequency: o.freq, period: { from: o.from, to: o.to, prevFrom: prev.from, prevTo: prev.to, days: daysIn(o.from, o.to) },
    org: meta.org, plant: meta.plant, generatedAt: meta.at,
    current: overview(cur), previous: overview(pre), pareto, backlog, costAssets, technicians, lowStock, trend,
  };
}
