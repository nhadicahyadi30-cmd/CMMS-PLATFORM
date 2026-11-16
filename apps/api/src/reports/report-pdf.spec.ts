import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import type { ReportData } from './report-data';
import { renderReportPdf } from './report-pdf';
import { delta, summarize } from './report-summary';

const ov = (o: Partial<ReportData['current']> = {}): ReportData['current'] => ({ availabilityPct: 96.4, mttrH: 2.8, mtbfH: 410, pmCompliancePct: 92, pmDue: 25, pmOntime: 23, woCreated: 48, woDone: 44, backlog: 12, backlogOverdue: 3, breakdowns: 5, downtimeH: 14.5, slaPct: 88, partsCost: 18_450_000, laborCost: 6_230_000, equipment: 120, ...o });
const sample = (o: Partial<ReportData> = {}): ReportData => ({
  frequency: 'monthly', period: { from: '2026-10-01', to: '2026-10-31', prevFrom: '2026-09-01', prevTo: '2026-09-30', days: 31 }, org: 'PT Uji', plant: 'Semua plant', generatedAt: '2026-11-01 07:00',
  current: ov(), previous: ov({ availabilityPct: 95.2, breakdowns: 7, downtimeH: 19.2 }),
  pareto: [{ code: 'FIL-01', name: 'Filler Line 1', breakdowns: 3, downtimeH: 6.5, sharePct: 45 }], backlog: [{ bucket: '0–3 hari', n: 5, overdue: 0 }, { bucket: '> 30 hari', n: 1, overdue: 1 }],
  costAssets: [{ code: 'FIL-01', name: 'Filler Line 1', woCount: 4, partsCost: 9_800_000, laborCost: 2_100_000, totalCost: 11_900_000 }],
  technicians: [{ code: 'TK-1', name: 'Budi', done: 12, hours: 30.5, avgH: 2.5, slaPct: 90 }],
  lowStock: [{ code: 'BRG-1', name: 'Bearing → 6205 “2RS”', onHand: 2, minStock: 4, unit: 'pcs', critical: true }],
  trend: Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, breakdowns: i % 3, downtimeH: 4 + i, pmDue: 10, pmOntime: 9 })), ...o,
});

test('PDF valid, ukuran wajar, dan bisa dibaca ulang', async () => {
  const bytes = await renderReportPdf(sample());
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 1 && doc.getPageCount() <= 3, 'halaman: ' + doc.getPageCount());
  assert.ok(bytes.length > 3000 && bytes.length < 400_000, 'ukuran: ' + bytes.length);
  assert.match(doc.getTitle() ?? '', /Monthly Maintenance Report/);
});
test('PDF tetap jadi untuk data kosong, karakter di luar WinAnsi, dan nama sangat panjang', async () => {
  const empty = sample({ frequency: 'daily', pareto: [], backlog: [], costAssets: [], technicians: [], lowStock: [], trend: null, current: ov({ availabilityPct: null, mttrH: null, mtbfH: null, pmCompliancePct: null, breakdowns: 0 }), previous: ov({ availabilityPct: null }) });
  assert.ok((await renderReportPdf(empty)).length > 1000);
  const odd = sample({ org: '株式会社 テスト ✓ ' + 'X'.repeat(300), pareto: [{ code: 'A'.repeat(40), name: 'N'.repeat(300), breakdowns: 1, downtimeH: 1, sharePct: 100 }] });
  assert.ok((await renderReportPdf(odd)).length > 1000);
});
test('PDF memanjang ke halaman berikutnya saat data banyak', async () => {
  const many = sample({ technicians: Array.from({ length: 8 }, (_, i) => ({ code: 'T' + i, name: 'Teknisi ' + i, done: i, hours: i, avgH: 1, slaPct: 80 })), lowStock: Array.from({ length: 10 }, (_, i) => ({ code: 'P' + i, name: 'Part ' + i, onHand: 0, minStock: 5, unit: 'pcs', critical: i < 3 })) });
  assert.ok((await PDFDocument.load(await renderReportPdf(many))).getPageCount() >= 2);
});

test('delta: arah baik/buruk menurut jenis angka', () => {
  assert.deepEqual(delta(96.4, 95.2, true, ' pt', 2), { text: '+1,20 pt', tone: 'good' });
  assert.deepEqual(delta(5, 7, false, '', 0), { text: '-2', tone: 'good' });      // breakdown turun = baik
  assert.equal(delta(3.5, 2.8, false, ' jam', 1).tone, 'bad');                    // MTTR naik = buruk
  assert.equal(delta(90, 90, true).tone, 'flat');
  assert.equal(delta(null, 90, true).tone, 'na');
});
test('ringkasan eksekutif memuat angka kunci dan menangani periode tanpa breakdown', () => {
  const s = summarize(sample()).join('\n');
  assert.match(s, /Availability 96,40%.*naik/); assert.match(s, /5 breakdown/); assert.match(s, /FIL-01/); assert.match(s, /23 dari 25/); assert.match(s, /3 di antaranya melewati batas SLA/); assert.match(s, /kritis/);
  const none = summarize(sample({ pareto: [], lowStock: [], current: ov({ breakdowns: 0, partsCost: 0, laborCost: 0, backlogOverdue: 0 }) })).join('\n');
  assert.match(none, /Tidak ada breakdown/); assert.doesNotMatch(none, /Biaya maintenance|sparepart di bawah/);
});
