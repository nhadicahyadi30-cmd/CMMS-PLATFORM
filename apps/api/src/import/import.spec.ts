import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AssetRow, PartRow, TechRow, orderAssets, validateRows } from './import.rows';

const a = (o: Record<string, unknown>) => ({ plant: 'P1', code: 'X', name: 'Nama', type: 'equipment', ...o });

test('baris aset: sel kosong dianggap tidak diisi, angka dari teks dikonversi', () => {
  const r = validateRows(AssetRow, [a({ year: '2019', critSafety: '5', manufacturer: '  ', parent: '' })]);
  assert.equal(r.errors.length, 0);
  assert.equal(r.ok[0].d.year, 2019); assert.equal(r.ok[0].d.critSafety, 5); assert.equal(r.ok[0].d.manufacturer, undefined); assert.equal(r.ok[0].d.parent, undefined);
});
test('jenis & status tidak peka huruf besar/kecil', () => {
  const r = validateRows(AssetRow, [a({ type: 'EQUIPMENT', status: 'Running' })]);
  assert.equal(r.errors.length, 0); assert.equal(r.ok[0].d.type, 'equipment'); assert.equal(r.ok[0].d.status, 'running');
});
test('galat per baris memakai nomor baris data dan pesan Indonesia', () => {
  const r = validateRows(AssetRow, [a({}), a({ type: 'mesin' }), a({ name: '' }), a({ critSafety: '9' }), a({ year: 'abc' })]);
  assert.deepEqual(r.errors.map((e) => e.row), [2, 3, 4, 5]);
  assert.match(r.errors[0].message, /Jenis harus/); assert.match(r.errors[1].message, /Nama aset wajib/); assert.match(r.errors[2].message, /maksimal 5/); assert.match(r.errors[3].message, /angka/);
});
test('teknisi: nomor telepon dinormalkan, shift divalidasi', () => {
  const t = { plant: 'P1', code: 'TK-1', fullName: 'Budi', skill: 'Mekanik', shift: 'PAGI', phone: '0812-3456-7890', hourlyRate: '25000' };
  const r = validateRows(TechRow, [t, { ...t, shift: 'sore' }, { ...t, phone: '123' }, { ...t, phone: '' }]);
  assert.equal(r.ok[0].d.phone, '+6281234567890'); assert.equal(r.ok[0].d.shift, 'pagi'); assert.equal(r.ok[0].d.hourlyRate, 25000);
  assert.deepEqual(r.errors.map((e) => e.row), [2, 3]); assert.equal(r.ok[1].d.phone, undefined);
});
test('suku cadang: ya/tidak dan desimal', () => {
  const p = { plant: 'P1', code: 'B-6205', name: 'Bearing 6205', minStock: '2', unitCost: '45000.5' };
  const r = validateRows(PartRow, [{ ...p, critical: 'Ya' }, { ...p, critical: 'tidak' }, { ...p, critical: 'mungkin' }, { ...p, minStock: '1,5' }]);
  assert.equal(r.ok[0].d.critical, true); assert.equal(r.ok[1].d.critical, false); assert.equal(r.ok[0].d.unitCost, 45000.5);
  assert.deepEqual(r.errors.map((e) => e.row), [3, 4]);
});
test('induk diproses sebelum anak walau urutan berkas terbalik', () => {
  const rows: { n: number; d: { code: string; parent?: string } }[] = [{ n: 1, d: { code: 'MTR-1', parent: 'PUMP-1' } }, { n: 2, d: { code: 'PUMP-1', parent: 'LINE-1' } }, { n: 3, d: { code: 'LINE-1' } }];
  const r = orderAssets(rows, new Set());
  assert.deepEqual(r.order.map((x) => x.d.code), ['LINE-1', 'PUMP-1', 'MTR-1']); assert.equal(r.errors.length, 0);
});
test('induk yang sudah ada di database diterima; huruf besar/kecil tidak dibedakan', () => {
  const r = orderAssets([{ n: 1, d: { code: 'A', parent: 'Line-9' } }], new Set(['line-9']));
  assert.equal(r.order.length, 1); assert.equal(r.errors.length, 0);
});
test('induk tidak ada, kode dobel, dan siklus dilaporkan', () => {
  const r = orderAssets([{ n: 1, d: { code: 'A', parent: 'ZZZ' } }, { n: 2, d: { code: 'B', parent: 'C' } }, { n: 3, d: { code: 'C', parent: 'B' } }, { n: 4, d: { code: 'a' } }], new Set());
  assert.deepEqual(r.errors.map((e) => e.row), [1, 2, 3, 4]);
  assert.match(r.errors[0].message, /tidak ditemukan/); assert.match(r.errors[1].message, /siklus/); assert.match(r.errors[3].message, /dobel/);
  assert.equal(r.order.length, 0);
});
