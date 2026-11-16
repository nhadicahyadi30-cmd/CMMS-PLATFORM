import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

// ---------- Kunci API ----------
export const hashSecret = (s: string) => createHash('sha256').update(s).digest('hex');
/** Format kunci: mhk_<uuid>.<rahasia>. Hanya hash rahasia yang disimpan. */
export function newKey(id: string) { const secret = randomBytes(32).toString('base64url'); return { key: `mhk_${id}.${secret}`, hash: hashSecret(secret) }; }
export function parseKey(raw: string): { id: string; secret: string } | null {
  const m = /^mhk_([0-9a-fA-F-]{36})\.([A-Za-z0-9_-]{20,80})$/.exec(raw.trim());
  return m ? { id: m[1].toLowerCase(), secret: m[2] } : null;
}
export function secretMatches(secret: string, hash: string): boolean {
  const a = Buffer.from(hashSecret(secret), 'hex'), b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- Payload ----------
const Num = z.union([z.number(), z.string().trim().min(1).transform(Number)]).refine((n) => Number.isFinite(n), 'value harus angka');
export const ReadingDto = z.object({
  asset: z.string().trim().min(1).max(60),                 // kode aset (mis. PMP-203)
  plant: z.string().trim().max(60).optional(),             // opsional: kode plant jika kode aset sama di beberapa plant
  tag: z.string().trim().toLowerCase().regex(/^[a-z0-9_.-]{1,60}$/, 'tag: huruf kecil, angka, _ . -'),
  value: Num,
  ts: z.union([z.string().trim().min(1), z.number()]).optional(), // ISO 8601 atau epoch (detik/milidetik); kosong = sekarang
});
export const IngestDto = z.union([
  z.object({ readings: z.array(ReadingDto).min(1, 'readings kosong').max(500, 'maksimal 500 pembacaan per permintaan') }),
  ReadingDto.transform((r) => ({ readings: [r] })),
]);
export type Reading = z.infer<typeof ReadingDto>;

export const MAX_AGE_MS = 7 * 24 * 3600_000;   // pembacaan lebih tua dari ini ditolak
export const FRESH_MS = 10 * 60_000;           // hanya pembacaan sebaru ini yang bisa memicu alarm (tanpa banjir alarm saat backfill)
export const MAX_FUTURE_MS = 5 * 60_000;

export function parseTs(v: string | number | undefined, now = Date.now()): Date {
  let ms: number;
  if (v === undefined) ms = now;
  else if (typeof v === 'number') ms = v < 1e11 ? v * 1000 : v;
  else if (/^\d{9,13}$/.test(v)) { const n = Number(v); ms = n < 1e11 ? n * 1000 : n; }
  else ms = Date.parse(v);
  if (!Number.isFinite(ms)) throw new Error('ts tidak valid (gunakan ISO 8601 atau epoch)');
  if (ms > now + MAX_FUTURE_MS) throw new Error('ts di masa depan');
  if (ms < now - MAX_AGE_MS) throw new Error('ts lebih tua dari 7 hari');
  return new Date(ms);
}

// ---------- Ambang batas ----------
type Lim = number | string | null | undefined;
export interface Limits { warnHigh?: Lim; critHigh?: Lim; warnLow?: Lim; critLow?: Lim }
export type Severity = 'warning' | 'critical';
export const num = (x: unknown): number | null => (x === null || x === undefined || x === '' ? null : Number(x));
export function breach(l: Limits, v: number): { sev: Severity; side: 'high' | 'low'; limit: number } | null {
  const ch = num(l.critHigh), wh = num(l.warnHigh), cl = num(l.critLow), wl = num(l.warnLow);
  if (ch !== null && v >= ch) return { sev: 'critical', side: 'high', limit: ch };
  if (cl !== null && v <= cl) return { sev: 'critical', side: 'low', limit: cl };
  if (wh !== null && v >= wh) return { sev: 'warning', side: 'high', limit: wh };
  if (wl !== null && v <= wl) return { sev: 'warning', side: 'low', limit: wl };
  return null;
}
/** Alarm hanya jika N pembacaan terakhir (terbaru dulu) semuanya melewati batas. Tingkat = yang terendah di antaranya. */
export function confirmedSeverity(l: Limits, latestFirst: number[], n: number): Severity | null {
  if (latestFirst.length < n) return null;
  let sev: Severity = 'critical';
  for (const v of latestFirst.slice(0, n)) { const b = breach(l, v); if (!b) return null; if (b.sev === 'warning') sev = 'warning'; }
  return sev;
}
export function alarmMessage(o: { assetCode: string; assetName: string; tagName: string; unit: string; value: number; sev: Severity; side: 'high' | 'low'; limit: number }): string {
  const u = o.unit ? ` ${o.unit}` : '';
  return `${o.assetCode} ${o.assetName}: ${o.tagName} ${o.value}${u} ${o.side === 'high' ? 'di atas' : 'di bawah'} batas ${o.sev === 'critical' ? 'kritis' : 'peringatan'} (${o.limit}${u})`.slice(0, 500);
}
