import { z } from 'zod';

/** Aturan power meter: payload ingest, kode meter, status koneksi. */
const Num = z.union([z.number(), z.string().trim().min(1).transform(Number)]).refine((n) => Number.isFinite(n), 'harus angka');
export const MeterReadingDto = z.object({
  meter: z.string().trim().regex(/^[A-Za-z0-9._-]{1,40}$/, 'kode meter: huruf, angka, . _ -'),
  plant: z.string().trim().max(60).optional(),                       // opsional bila kode meter sama di beberapa plant
  kwh: Num.refine((n) => n >= 0 && n < 1e10, 'kwh harus 0 s.d. < 1e10 (register energi kumulatif)'),
  kw: Num.refine((n) => n > -1e7 && n < 1e7, 'kw di luar jangkauan').optional(),
  ts: z.union([z.string().trim().min(1), z.number()]).optional(),    // ISO 8601 atau epoch; kosong = sekarang
});
export const MeterIngestDto = z.union([
  z.object({ meters: z.array(MeterReadingDto).min(1, 'meters kosong').max(500, 'maksimal 500 pembacaan per permintaan') }),
  MeterReadingDto.transform((r) => ({ meters: [r] })),
]);
export type MeterReading = z.infer<typeof MeterReadingDto>;

export const MeterDto = z.object({
  plantId: z.string().uuid(), unitId: z.string().uuid(),
  code: z.string().trim().regex(/^[A-Za-z0-9._-]{1,40}$/, 'kode meter: huruf, angka, . _ -'),
  name: z.string().trim().min(2).max(120),
  multiplier: z.number().gt(0).max(1e6).default(1),
});

export type MeterConn = 'online' | 'delayed' | 'offline' | 'waiting';
/** Online bila ada data dalam 15 menit, tertunda sampai 2 jam, selebihnya offline. */
export function meterConn(lastSeenMs: number | null, now = Date.now()): MeterConn {
  if (lastSeenMs === null) return 'waiting';
  const age = now - lastSeenMs;
  return age <= 15 * 60_000 ? 'online' : age <= 2 * 3600_000 ? 'delayed' : 'offline';
}
