import type { ReportData } from './report-data';

const id = (n: number, d = 1) => n.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtNum = (n: number | null, d = 1) => (n === null || n === undefined || Number.isNaN(n) ? '-' : id(n, d));
export const fmtInt = (n: number | null) => (n === null || n === undefined ? '-' : Math.round(n).toLocaleString('id-ID'));
export const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

export const TITLES = { daily: 'Daily Maintenance Report', weekly: 'Weekly Maintenance Report', monthly: 'Monthly Maintenance Report', yearly: 'Annual Maintenance Report' } as const;
export const PREV_LABEL = { daily: 'kemarin', weekly: 'minggu sebelumnya', monthly: 'bulan sebelumnya', yearly: 'tahun sebelumnya' } as const;

const longDate = (s: string) => new Date(s + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const periodText = (d: ReportData) => (d.period.from === d.period.to ? longDate(d.period.from) : `${longDate(d.period.from)} - ${longDate(d.period.to)}`);

/** Perubahan terhadap periode sebelumnya. `good` = arah yang diinginkan (naik/turun). */
export function delta(cur: number | null, prev: number | null, goodWhenUp: boolean, unit = '', d = 1): { text: string; tone: 'good' | 'bad' | 'flat' | 'na' } {
  if (cur === null || prev === null) return { text: 'tanpa pembanding', tone: 'na' };
  const diff = Math.round((cur - prev) * 10 ** d) / 10 ** d;
  if (diff === 0) return { text: 'tetap', tone: 'flat' };
  return { text: `${diff > 0 ? '+' : '-'}${id(Math.abs(diff), d)}${unit}`, tone: (diff > 0) === goodWhenUp ? 'good' : 'bad' };
}

/** Ringkasan eksekutif otomatis, kalimat pendek yang langsung bisa dibaca atasan. */
export function summarize(d: ReportData): string[] {
  const c = d.current, p = d.previous, out: string[] = [], vs = PREV_LABEL[d.frequency];
  const dir = (cur: number | null, prev: number | null, up: string, down: string) => (cur === null || prev === null || cur === prev ? '' : cur > prev ? ` (${up} dari ${vs})` : ` (${down} dari ${vs})`);

  if (c.availabilityPct !== null) out.push(`Availability ${fmtNum(c.availabilityPct, 2)}%${dir(c.availabilityPct, p.availabilityPct, 'naik', 'turun')}.`);
  out.push(c.breakdowns === 0 ? 'Tidak ada breakdown pada periode ini.' : `${c.breakdowns} breakdown dengan total downtime ${fmtNum(c.downtimeH)} jam${c.mttrH !== null ? `, MTTR rata-rata ${fmtNum(c.mttrH, 2)} jam` : ''}.`);
  if (d.pareto[0]) out.push(`Aset dengan downtime terbesar: ${d.pareto[0].code} ${d.pareto[0].name} (${fmtNum(d.pareto[0].downtimeH)} jam, ${fmtNum(d.pareto[0].sharePct, 0)}% dari total downtime).`);
  if (c.pmCompliancePct !== null) out.push(`Kepatuhan Preventive Maintenance ${fmtNum(c.pmCompliancePct, 0)}% (${c.pmOntime} dari ${c.pmDue} jadwal tepat waktu).`);
  out.push(`${c.woDone} work order selesai, ${c.woCreated} dibuat. Backlog saat ini ${c.backlog} WO${c.backlogOverdue ? `, ${c.backlogOverdue} di antaranya melewati batas SLA` : ''}.`);
  const cost = c.partsCost + c.laborCost;
  if (cost > 0) out.push(`Biaya maintenance ${fmtRp(cost)} (sparepart ${fmtRp(c.partsCost)}, tenaga kerja ${fmtRp(c.laborCost)}).`);
  const crit = d.lowStock.filter((s) => s.critical).length;
  if (d.lowStock.length) out.push(`${d.lowStock.length} sparepart di bawah stok minimum${crit ? `, ${crit} berstatus kritis` : ''}.`);
  return out;
}
