/** Sel yang diawali = + - @ dapat dieksekusi sebagai rumus saat dibuka di Excel; beri apostrof di depannya. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(rows: Record<string, unknown>[], cols: { key: string; label: string }[]): string {
  const head = cols.map((c) => csvCell(c.label)).join(',');
  const body = rows.map((r) => cols.map((c) => csvCell(r[c.key])).join(','));
  return '﻿' + [head, ...body].join('\r\n') + '\r\n'; // BOM agar Excel membaca UTF-8
}
