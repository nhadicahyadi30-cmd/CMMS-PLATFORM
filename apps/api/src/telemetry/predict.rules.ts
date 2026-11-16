/** Mesin prediksi sederhana & transparan (tanpa ML): regresi linear, ETA ke batas, anomali MAD, skor kesehatan. */

export interface Pt { t: number; v: number } // t = ms epoch
export interface Trend { slopePerHour: number; r2: number; n: number }
export interface TagLimits { warnHigh?: number | null; critHigh?: number | null; warnLow?: number | null; critLow?: number | null }
export type SensorStatus = 'nodata' | 'offline' | 'critical' | 'risk' | 'watch' | 'ok';

export const MIN_POINTS = 12;
export const STALE_MS = 15 * 60_000;
export const MAX_ETA_H = 24 * 30;
const HOUR = 3_600_000;

/** Regresi kuadrat-terkecil v = a + b·jam. Mengembalikan null bila data kurang/ tidak bervariasi waktu. */
export function linearTrend(pts: Pt[]): Trend | null {
  const n = pts.length;
  if (n < MIN_POINTS) return null;
  const t0 = pts[0].t;
  let sx = 0, sy = 0;
  for (const p of pts) { sx += (p.t - t0) / HOUR; sy += p.v; }
  const mx = sx / n, my = sy / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) { const dx = (p.t - t0) / HOUR - mx, dy = p.v - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slopePerHour: slope, r2, n };
}

/** Jam sampai nilai mencapai `limit` mengikuti tren. null = tidak menuju batas / tren tidak dapat dipercaya. */
export function etaHours(current: number, tr: Trend | null, limit: number | null | undefined, dir: 'high' | 'low'): number | null {
  if (limit == null || !tr || tr.r2 < 0.6) return null;
  if (dir === 'high') { if (current >= limit) return 0; if (tr.slopePerHour <= 0) return null; }
  else { if (current <= limit) return 0; if (tr.slopePerHour >= 0) return null; }
  const h = (limit - current) / tr.slopePerHour;
  return h > MAX_ETA_H ? null : Math.max(0, h);
}

export function median(a: number[]): number {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Skor-z modifikasi (median/MAD) untuk nilai terakhir terhadap baseline. Mengembalikan 0 bila data kurang. */
export function anomalyScore(baseline: number[], value: number): number {
  if (baseline.length < MIN_POINTS) return 0;
  const med = median(baseline);
  const mad = median(baseline.map((x) => Math.abs(x - med)));
  const sigma = Math.max(1.4826 * mad, 0.02 * Math.abs(med), 1e-6); // lantai sigma agar sinyal datar tidak memicu alarm palsu
  return (value - med) / sigma;
}

export interface SensorInput {
  kind: 'gauge' | 'runhours';
  limits: TagLimits;
  points: Pt[];       // jendela prediksi, urut waktu
  lastTs: number | null;
  lastValue: number | null;
  now: number;
}
export interface SensorPrediction {
  status: SensorStatus;
  slopePerHour: number | null; r2: number | null;
  etaWarnH: number | null; etaCritH: number | null;
  anomaly: number; anomalous: boolean;
  reason: string;
}

export function predictSensor(i: SensorInput): SensorPrediction {
  const base: SensorPrediction = { status: 'nodata', slopePerHour: null, r2: null, etaWarnH: null, etaCritH: null, anomaly: 0, anomalous: false, reason: 'Data belum cukup' };
  if (i.lastTs == null || i.lastValue == null) return base;
  if (i.now - i.lastTs > STALE_MS) return { ...base, status: 'offline', reason: 'Tidak ada data >15 menit' };
  const v = i.lastValue, L = i.limits;
  const tr = linearTrend(i.points);
  if (i.kind !== 'runhours' && i.points.length < MIN_POINTS) return base;
  if (i.kind === 'runhours') return { ...base, status: 'ok', slopePerHour: tr?.slopePerHour ?? null, r2: tr?.r2 ?? null, reason: 'Penghitung jam jalan' };

  const breachCrit = (L.critHigh != null && v >= L.critHigh) || (L.critLow != null && v <= L.critLow);
  const breachWarn = (L.warnHigh != null && v >= L.warnHigh) || (L.warnLow != null && v <= L.warnLow);
  const pick = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.min(a, b));
  const etaWarnH = pick(etaHours(v, tr, L.warnHigh, 'high'), etaHours(v, tr, L.warnLow, 'low'));
  const etaCritH = pick(etaHours(v, tr, L.critHigh, 'high'), etaHours(v, tr, L.critLow, 'low'));
  const anomaly = anomalyScore(i.points.slice(0, -1).map((p) => p.v), v);
  const anomalous = Math.abs(anomaly) >= 3.5;

  let status: SensorStatus = 'ok', reason = 'Normal';
  if (breachCrit) { status = 'critical'; reason = 'Melewati batas kritis'; }
  else if (breachWarn) { status = 'risk'; reason = 'Melewati batas peringatan'; }
  else if (etaCritH != null && etaCritH <= 24) { status = 'risk'; reason = `Diperkirakan kritis ≈ ${fmtH(etaCritH)}`; }
  else if (etaWarnH != null && etaWarnH <= 12) { status = 'risk'; reason = `Diperkirakan melewati batas peringatan ≈ ${fmtH(etaWarnH)}`; }
  else if (etaWarnH != null && etaWarnH <= 24 * 7) { status = 'watch'; reason = `Tren naik/turun, batas peringatan ≈ ${fmtH(etaWarnH)}`; }
  else if (anomalous) { status = 'watch'; reason = 'Nilai menyimpang dari pola biasanya'; }
  return { status, slopePerHour: tr?.slopePerHour ?? null, r2: tr?.r2 ?? null, etaWarnH, etaCritH, anomaly, anomalous, reason };
}

export function fmtH(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} menit`;
  if (h < 48) return `${Math.round(h)} jam`;
  return `${Math.round(h / 24)} hari`;
}

const PENALTY: Record<SensorStatus, number> = { critical: 45, risk: 25, watch: 10, offline: 5, nodata: 0, ok: 0 };
/** Skor kesehatan aset 0–100 dari status sensor (penalti dijumlah, dibatasi 0). */
export function healthScore(statuses: SensorStatus[], pmOverdue = false, pmSoon = false): number {
  let s = 100;
  for (const st of statuses) s -= PENALTY[st];
  if (pmOverdue) s -= 15; else if (pmSoon) s -= 5;
  return Math.max(0, Math.min(100, s));
}
export function worstStatus(statuses: SensorStatus[]): SensorStatus {
  const order: SensorStatus[] = ['critical', 'risk', 'watch', 'offline', 'nodata', 'ok'];
  for (const o of order) if (statuses.includes(o)) return o;
  return 'nodata';
}

export interface PmForecast { remaining: number; ratePerDay: number | null; etaDays: number | null; state: 'overdue' | 'soon' | 'ok' | 'unknown' }
/** Perkiraan jatuh tempo PM berbasis meter. rate dari pembacaan meter terbaru (jam/hari). */
export function pmForecast(lastMeter: number | null, interval: number, current: number | null, ratePerDay: number | null): PmForecast {
  if (current == null) return { remaining: NaN, ratePerDay, etaDays: null, state: 'unknown' };
  const remaining = (lastMeter ?? 0) + interval - current;
  if (remaining <= 0) return { remaining, ratePerDay, etaDays: 0, state: 'overdue' };
  if (!ratePerDay || ratePerDay <= 0) return { remaining, ratePerDay, etaDays: null, state: 'unknown' };
  const etaDays = remaining / ratePerDay;
  return { remaining, ratePerDay, etaDays, state: etaDays <= 7 ? 'soon' : 'ok' };
}
