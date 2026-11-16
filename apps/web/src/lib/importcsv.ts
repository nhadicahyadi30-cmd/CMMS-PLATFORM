export type ImportKind = 'assets' | 'technicians' | 'parts';

interface Spec { path: string; module: number; title: string; hint: string; cols: string[]; sample: string[]; alias: Record<string, string> }

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const mk = (keys: Record<string, string[]>) => Object.fromEntries(Object.entries(keys).flatMap(([k, al]) => [[norm(k), k], ...al.map((a) => [norm(a), k])]));

export const SPECS: Record<ImportKind, Spec> = {
  assets: {
    path: '/import/assets', module: 1, title: 'Aset & Equipment',
    hint: 'Satu baris per aset. Kolom "induk" berisi kode aset induk (boleh di berkas yang sama, urutan bebas). "plant" berisi kode plant. Tipe: plant, area, equipment, component. Status: running, standby, breakdown, retired. Kritikalitas 1–5.',
    cols: ['plant', 'code', 'name', 'type', 'parent', 'manufacturer', 'model', 'serial', 'year', 'status', 'critSafety', 'critProduction', 'critQuality', 'critCost'],
    sample: ['{PLANT}', 'LN1-FIL-01', 'Filler Line 1', 'equipment', '', 'KHS', 'Innofill', 'SN-001', '2019', 'running', '3', '5', '4', '3'],
    alias: mk({ plant: ['kodeplant', 'pabrik'], code: ['kode', 'kodeaset', 'tag'], name: ['nama', 'namaaset'], type: ['tipe', 'jenis'], parent: ['induk', 'kodeinduk'], manufacturer: ['pabrikan', 'merk', 'merek'], model: ['tipemodel'], serial: ['serialno', 'noseri', 'serialnumber'], year: ['tahun', 'yearinstalled', 'tahunpasang'], status: [], critSafety: ['keselamatan', 'safety'], critProduction: ['produksi', 'production'], critQuality: ['kualitas', 'quality'], critCost: ['biaya', 'cost'] }),
  },
  technicians: {
    path: '/import/technicians', module: 10, title: 'Teknisi',
    hint: 'Satu baris per teknisi. Shift: pagi, siang, malam. Nomor telepon boleh format 08xx atau +62 (opsional, tapi diperlukan untuk WhatsApp).',
    cols: ['plant', 'code', 'fullName', 'skill', 'shift', 'phone', 'hourlyRate'],
    sample: ['{PLANT}', 'TK-001', 'Budi Santoso', 'mekanik', 'pagi', '081234567890', '45000'],
    alias: mk({ plant: ['kodeplant', 'pabrik'], code: ['kode', 'nik', 'idteknisi'], fullName: ['nama', 'namalengkap', 'name'], skill: ['keahlian', 'skill', 'spesialisasi'], shift: [], phone: ['telepon', 'telp', 'hp', 'nohp', 'whatsapp', 'wa'], hourlyRate: ['tarif', 'upahperjam', 'rate', 'tarifperjam'] }),
  },
  parts: {
    path: '/import/parts', module: 6, title: 'Suku Cadang',
    hint: 'Satu baris per suku cadang. Kode harus unik di seluruh organisasi. Stok awal tidak diimpor di sini — catat lewat transaksi "penerimaan" agar ada jejaknya. Kritis: ya/tidak.',
    cols: ['plant', 'code', 'name', 'category', 'unit', 'location', 'minStock', 'reorderQty', 'unitCost', 'critical'],
    sample: ['{PLANT}', 'BRG-6205', 'Bearing 6205 2RS', 'bearing', 'pcs', 'Rak A-03', '4', '10', '35000', 'ya'],
    alias: mk({ plant: ['kodeplant', 'pabrik'], code: ['kode', 'sku', 'partno', 'kodepart'], name: ['nama', 'namapart', 'deskripsi'], category: ['kategori'], unit: ['satuan', 'uom'], location: ['lokasi', 'rak', 'bin'], minStock: ['stokmin', 'minimum', 'min'], reorderQty: ['qtypesan', 'jumlahpesan', 'reorder'], unitCost: ['harga', 'hargasatuan', 'biaya'], critical: ['kritis', 'critical'] }),
  },
};

/** Ubah baris CSV menjadi objek untuk API impor. Kolom tak dikenal dilaporkan, bukan diam-diam dibuang. */
export function csvToRows(kind: ImportKind, rows: string[][]): { rows: Record<string, string>[]; problems: string[] } {
  const spec = SPECS[kind];
  if (rows.length < 2) return { rows: [], problems: ['Berkas kosong atau hanya berisi judul kolom'] };
  const keys = rows[0].map((h) => spec.alias[norm(h)] ?? '');
  const problems: string[] = [];
  rows[0].forEach((h, i) => { if (!keys[i] && h.trim()) problems.push(`Kolom "${h.trim()}" tidak dikenali dan diabaikan`); });
  const dup = keys.filter((k, i) => k && keys.indexOf(k) !== i);
  if (dup.length) return { rows: [], problems: [`Kolom dobel: ${[...new Set(dup)].join(', ')}`] };
  for (const need of ['plant', 'code', 'name', 'fullName']) if (spec.cols.includes(need) && !keys.includes(need)) return { rows: [], problems: [`Kolom wajib "${need}" tidak ditemukan. Unduh templat untuk melihat judul kolom yang benar.`] };
  const out = rows.slice(1).map((r) => Object.fromEntries(keys.flatMap((k, j) => (k ? [[k, (r[j] ?? '').trim()]] : []))));
  return { rows: out, problems };
}

const esc = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export function templateCsv(kind: ImportKind, plantCode: string): string {
  const s = SPECS[kind];
  return '﻿' + [s.cols, s.sample.map((v) => v.replace('{PLANT}', plantCode))].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}
