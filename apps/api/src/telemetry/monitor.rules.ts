/** Aturan tampilan Monitoring Mesin: tingkat nilai terhadap batas, status koneksi, status jalan. */
export type Level = 'ok' | 'warning' | 'critical';
export type Conn = 'online' | 'delayed' | 'offline' | 'never';
export type RunState = 'running' | 'stopped' | 'unknown';

export interface MLimits { warnHigh?: number | null; critHigh?: number | null; warnLow?: number | null; critLow?: number | null }

export function levelOf(v: number | null | undefined, l: MLimits): Level {
  if (v == null || !Number.isFinite(v)) return 'ok';
  if ((l.critHigh != null && v >= l.critHigh) || (l.critLow != null && v <= l.critLow)) return 'critical';
  if ((l.warnHigh != null && v >= l.warnHigh) || (l.warnLow != null && v <= l.warnLow)) return 'warning';
  return 'ok';
}

/** online ≤3 menit, tertunda ≤15 menit, selebihnya offline. */
export function connOf(lastTs: number | null, now: number): Conn {
  if (lastTs == null) return 'never';
  const age = now - lastTs;
  return age <= 3 * 60_000 ? 'online' : age <= 15 * 60_000 ? 'delayed' : 'offline';
}

/** Mesin dianggap jalan bila penghitung running hour naik dalam jendela terakhir. Butuh ≥2 titik dan data masih segar. */
export function runStateOf(n: number, minV: number | null, maxV: number | null, conn: Conn): RunState {
  if (conn === 'offline' || conn === 'never' || n < 2 || minV == null || maxV == null) return 'unknown';
  return maxV - minV > 0.005 ? 'running' : 'stopped';
}

const RANK: Record<Level, number> = { critical: 2, warning: 1, ok: 0 };
export function worstLevel(ls: Level[]): Level { return ls.reduce<Level>((a, b) => (RANK[b] > RANK[a] ? b : a), 'ok'); }
