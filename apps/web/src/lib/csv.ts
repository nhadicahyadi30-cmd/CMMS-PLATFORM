/** Parser CSV sederhana: pembatas koma, titik koma, atau tab (tempel dari Excel), kutip ganda, baris kosong diabaikan. */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, ''); const first = t.split(/\r?\n/, 1)[0] ?? '';
  const cnt = (ch: string) => first.split(ch).length - 1;
  const delim = cnt('\t') > 0 && cnt('\t') >= Math.max(cnt(';'), cnt(',')) ? '\t' : cnt(';') > cnt(',') ? ';' : ',';
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const ALIAS: Record<string, string> = { kind: 'periodKind', periode: 'periodKind', tipe: 'periodKind', datefrom: 'dateFrom', dari: 'dateFrom', tanggal: 'dateFrom', dateto: 'dateTo', sampai: 'dateTo', po: 'poCode', pocode: 'poCode', periodkind: 'periodKind', unit: 'unit', shift: 'shift', sku: 'sku', kwh: 'kwh', ton: 'ton', note: 'note', catatan: 'note' };

/** Ubah baris CSV menjadi objek untuk /energy/import. Angka berformat Indonesia (1.234,5) tidak didukung: gunakan titik desimal. */
export function csvToEntries(rows: string[][]): { rows: Record<string, unknown>[]; problems: string[] } {
  if (rows.length < 2) return { rows: [], problems: ['File kosong atau tanpa baris data'] };
  const head = rows[0].map((h) => ALIAS[h.trim().toLowerCase().replace(/[\s_-]/g, '')] ?? '');
  const problems: string[] = []; const out: Record<string, unknown>[] = [];
  for (const need of ['unit', 'periodKind', 'dateFrom', 'kwh']) if (!head.includes(need)) problems.push(`Kolom wajib "${need}" tidak ditemukan`);
  if (problems.length) return { rows: [], problems };
  rows.slice(1).forEach((r, i) => {
    const o: Record<string, unknown> = {};
    head.forEach((k, j) => {
      const v = (r[j] ?? '').trim(); if (!k || v === '') return;
      if (k === 'kwh' || k === 'ton') { const n = Number(v); if (!Number.isFinite(n)) problems.push(`Baris ${i + 1}: ${k} "${v}" bukan angka (pakai titik desimal)`); else o[k] = n; }
      else o[k] = k === 'periodKind' ? v.toLowerCase() : v;
    });
    out.push(o);
  });
  return { rows: out, problems };
}
