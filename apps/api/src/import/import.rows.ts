import { z } from 'zod';
import { normalizePhone } from '../common/phone';

/** Sel kosong dari CSV/Excel dianggap tidak diisi. */
const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : typeof v === 'string' ? v.trim() : v);
const str = (max: number) => z.preprocess(blank, z.string().max(max).optional());
const req = (max: number, label: string) => z.preprocess(blank, z.string({ required_error: `${label} wajib diisi` }).min(1, `${label} wajib diisi`).max(max));
const int = (min: number, max: number, label: string) => z.preprocess((v) => { const b = blank(v); return b === undefined ? undefined : Number(b); }, z.number({ invalid_type_error: `${label} harus angka` }).int(`${label} harus bilangan bulat`).min(min, `${label} minimal ${min}`).max(max, `${label} maksimal ${max}`).optional());
const num = (min: number, max: number, label: string) => z.preprocess((v) => { const b = blank(v); return b === undefined ? undefined : Number(b); }, z.number({ invalid_type_error: `${label} harus angka (pakai titik sebagai desimal)` }).min(min, `${label} minimal ${min}`).max(max).optional());
const bool = z.preprocess((v) => {
  const b = blank(v); if (b === undefined) return undefined; if (typeof b === 'boolean') return b;
  const s = String(b).toLowerCase(); if (['ya', 'y', 'yes', 'true', '1'].includes(s)) return true; if (['tidak', 't', 'no', 'n', 'false', '0'].includes(s)) return false; return 'x';
}, z.boolean({ invalid_type_error: 'Isi ya/tidak' }).optional());
const lower = (v: unknown) => { const b = blank(v); return typeof b === 'string' ? b.toLowerCase() : b; };

export const AssetRow = z.object({
  plant: req(10, 'Kode plant'), code: req(60, 'Kode aset'), name: req(200, 'Nama aset'),
  type: z.preprocess(lower, z.enum(['plant', 'area', 'equipment', 'component'], { errorMap: () => ({ message: 'Jenis harus plant/area/equipment/component' }) })),
  parent: str(60), manufacturer: str(100), model: str(100), serial: str(100), year: int(1950, 2100, 'Tahun'),
  status: z.preprocess(lower, z.enum(['running', 'standby', 'breakdown', 'retired'], { errorMap: () => ({ message: 'Status harus running/standby/breakdown/retired' }) }).optional()),
  critSafety: int(1, 5, 'Skor keselamatan'), critProduction: int(1, 5, 'Skor produksi'), critQuality: int(1, 5, 'Skor kualitas'), critCost: int(1, 5, 'Skor biaya'),
});
export type AssetRowT = z.infer<typeof AssetRow>;

export const TechRow = z.object({
  plant: req(10, 'Kode plant'), code: z.preprocess(blank, z.string({ required_error: 'Kode teknisi wajib diisi' }).regex(/^[A-Za-z0-9-]{1,20}$/, 'Kode teknisi 1–20 huruf/angka/minus')),
  fullName: z.preprocess(blank, z.string({ required_error: 'Nama wajib diisi' }).min(2, 'Nama minimal 2 huruf').max(120)),
  skill: z.preprocess(blank, z.string({ required_error: 'Keahlian wajib diisi' }).min(2).max(60)),
  shift: z.preprocess(lower, z.enum(['pagi', 'siang', 'malam'], { errorMap: () => ({ message: 'Shift harus pagi/siang/malam' }) })),
  phone: z.preprocess(blank, z.string().transform(normalizePhone).refine((v) => /^\+[1-9][0-9]{7,14}$/.test(v), 'Nomor telepon tidak valid').optional()),
  hourlyRate: num(0, 1e9, 'Upah per jam'),
});
export type TechRowT = z.infer<typeof TechRow>;

export const PartRow = z.object({
  plant: req(10, 'Kode plant'), code: req(60, 'Kode suku cadang'), name: z.preprocess(blank, z.string({ required_error: 'Nama wajib diisi' }).min(2, 'Nama minimal 2 huruf').max(200)),
  category: str(60), unit: str(20), location: str(60), minStock: num(0, 1e9, 'Stok minimum'), reorderQty: num(0.01, 1e9, 'Jumlah pesan ulang'), unitCost: num(0, 1e12, 'Harga satuan'), critical: bool,
});
export type PartRowT = z.infer<typeof PartRow>;

export interface RowError { row: number; message: string }

/** Validasi tiap baris; kembalikan baris sah (dengan nomor baris data 1-based) dan daftar galat. */
export function validateRows<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, rows: Record<string, unknown>[]): { ok: { n: number; d: T }[]; errors: RowError[] } {
  const ok: { n: number; d: T }[] = []; const errors: RowError[] = [];
  rows.forEach((r, i) => {
    const p = schema.safeParse(r);
    if (p.success) ok.push({ n: i + 1, d: p.data });
    else errors.push({ row: i + 1, message: p.error.issues.map((x) => x.message).join('; ') });
  });
  return { ok, errors };
}

/**
 * Urutkan aset agar induk selalu diproses sebelum anaknya, apa pun urutan di berkas.
 * Induk boleh sudah ada di database (`existing`) atau ada di berkas yang sama. Sisanya dilaporkan.
 */
export function orderAssets<T extends { code: string; parent?: string }>(rows: { n: number; d: T }[], existing: Set<string>): { order: { n: number; d: T }[]; errors: RowError[] } {
  const key = (s: string) => s.toLowerCase();
  const errors: RowError[] = []; const inFile = new Map<string, number>();
  const uniq: { n: number; d: T }[] = [];
  for (const r of rows) {
    const k = key(r.d.code);
    if (inFile.has(k)) { errors.push({ row: r.n, message: `Kode "${r.d.code}" dobel di berkas (sudah ada di baris ${inFile.get(k)})` }); continue; }
    inFile.set(k, r.n); uniq.push(r);
  }
  const done = new Set<string>(); const order: { n: number; d: T }[] = []; let pending = uniq;
  while (pending.length) {
    const next: typeof pending = [];
    for (const r of pending) {
      const p = r.d.parent ? key(r.d.parent) : null;
      if (p === null || existing.has(p) || done.has(p)) { order.push(r); done.add(key(r.d.code)); } else next.push(r);
    }
    if (next.length === pending.length) {
      for (const r of next) {
        const p = key(r.d.parent!);
        errors.push({ row: r.n, message: inFile.has(p) ? `Induk "${r.d.parent}" membentuk siklus atau gagal diimpor` : `Induk "${r.d.parent}" tidak ditemukan (belum ada di sistem dan tidak ada di berkas)` });
      }
      break;
    }
    pending = next;
  }
  return { order, errors: errors.sort((a, b) => a.row - b.row) };
}
