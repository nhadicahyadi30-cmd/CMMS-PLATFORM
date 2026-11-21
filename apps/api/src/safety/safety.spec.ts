import { test } from 'node:test';
import assert from 'node:assert/strict';
import { permitActions, permitExpired, PermitDto, LotoDto } from './permit.rules';
import { audiencesFor, isAbnormal, ItemDto, TemplateDto, RecordDto } from './inspection.rules';

const U = '11111111-1111-4111-8111-111111111111', O = '22222222-2222-4222-8222-222222222222';
const base = { plantId: U, assetId: U, title: 'Ganti motor', validFrom: '2026-03-10T01:00:00Z', validUntil: '2026-03-10T09:00:00Z' };

test('izin: masa berlaku maksimal 24 jam dan harus berurutan', () => {
  assert.ok(PermitDto.safeParse(base).success);
  assert.ok(!PermitDto.safeParse({ ...base, validUntil: '2026-03-10T00:00:00Z' }).success);
  assert.ok(!PermitDto.safeParse({ ...base, validUntil: '2026-03-11T02:00:00Z' }).success);
  assert.ok(!PermitDto.safeParse({ ...base, title: 'x' }).success);
  const d = PermitDto.parse(base);
  assert.equal(d.requiresLoto, true); assert.equal(d.workType, 'general'); assert.deepEqual(d.lotoPointIds, []);
});

test('izin: aksi menurut tahap dan peran', () => {
  assert.deepEqual(permitActions('requested', 'supervisor', U, O), ['approve', 'reject', 'edit', 'cancel']);
  assert.deepEqual(permitActions('requested', 'technician', O, O), ['edit', 'cancel']);
  assert.deepEqual(permitActions('requested', 'technician', U, O), []);
  assert.deepEqual(permitActions('requested', 'production', U, O), []);
  assert.ok(permitActions('approved', 'production', U, O).includes('handover'));
  assert.ok(!permitActions('approved', 'supervisor', U, O).includes('handover'));
  assert.ok(permitActions('approved', 'admin', U, O).includes('handover'));
  const prodHanded = permitActions('handed_over', 'production', U, O);
  assert.ok(prodHanded.includes('lock') && !prodHanded.includes('verify') && !prodHanded.includes('activate'));
  const tek = permitActions('handed_over', 'technician', O, O);
  assert.ok(tek.includes('verify') && tek.includes('activate') && tek.includes('cancel'));
  assert.deepEqual(permitActions('active', 'production', U, O), ['unlock']);
  assert.ok(permitActions('active', 'technician', U, O).includes('complete'));
  assert.deepEqual(permitActions('completed', 'technician', O, O), []);
  assert.deepEqual(permitActions('completed', 'production', U, O), ['close']);
  assert.deepEqual(permitActions('closed', 'admin', U, O), []);
  assert.deepEqual(permitActions('cancelled', 'admin', U, O), []);
});

test('izin: kedaluwarsa hanya untuk izin yang sedang berjalan', () => {
  const now = new Date('2026-03-10T12:00:00Z');
  assert.ok(permitExpired('active', '2026-03-10T09:00:00Z', now));
  assert.ok(permitExpired('handed_over', '2026-03-10T09:00:00Z', now));
  assert.ok(!permitExpired('closed', '2026-03-10T09:00:00Z', now));
  assert.ok(!permitExpired('active', '2026-03-10T13:00:00Z', now));
});

test('titik LOTO master', () => {
  assert.ok(LotoDto.safeParse({ plantId: U, assetId: U, seq: 1, description: 'Breaker Q1' }).success);
  assert.ok(!LotoDto.safeParse({ plantId: U, assetId: U, seq: 0, description: 'Breaker Q1' }).success);
  assert.ok(!LotoDto.safeParse({ plantId: U, assetId: U, seq: 1, description: 'Breaker Q1', energyType: 'magic' }).success);
});

test('inspeksi: butir angka punya batas, butir lain tidak', () => {
  assert.ok(ItemDto.safeParse({ text: 'Tekanan', kind: 'number', minVal: 2, maxVal: 5, unit: 'bar' }).success);
  assert.ok(!ItemDto.safeParse({ text: 'Tekanan', kind: 'number', minVal: 6, maxVal: 5 }).success);
  assert.ok(!ItemDto.safeParse({ text: 'Bersih', kind: 'check', minVal: 1 }).success);
  assert.ok(!TemplateDto.safeParse({ plantId: U, code: 'bad code!', name: 'Ronda', items: [{ text: 'Bersih' }] }).success);
  assert.ok(!TemplateDto.safeParse({ plantId: U, code: 'RND-1', name: 'Ronda', items: [] }).success);
  assert.ok(TemplateDto.safeParse({ plantId: U, code: 'RND-1', name: 'Ronda', items: [{ text: 'Bersih' }] }).success);
});

test('inspeksi: deteksi tidak normal sama dengan aturan database', () => {
  const num = { kind: 'number', minVal: 2, maxVal: 5 };
  assert.ok(!isAbnormal(num, { value: 2 }) && !isAbnormal(num, { value: 5 }));
  assert.ok(isAbnormal(num, { value: 1.99 }) && isAbnormal(num, { value: 5.01 }));
  assert.ok(!isAbnormal(num, {}));
  assert.ok(isAbnormal({ kind: 'check' }, { ok: false }) && !isAbnormal({ kind: 'check' }, { ok: true }) && !isAbnormal({ kind: 'check' }, {}));
  assert.ok(!isAbnormal({ kind: 'text' }, { }));
  assert.ok(!isAbnormal({ kind: 'number', minVal: null, maxVal: 5 }, { value: -100 }));
});

test('inspeksi: audiens per peran dan muatan kirim', () => {
  assert.deepEqual(audiencesFor('production'), ['any', 'production']);
  assert.deepEqual(audiencesFor('technician'), ['any', 'technician']);
  assert.deepEqual(audiencesFor('supervisor'), ['any', 'technician', 'production']);
  assert.ok(RecordDto.safeParse({ templateId: U, results: [{ itemId: O, ok: true }], clientUid: U }).success);
  assert.ok(!RecordDto.safeParse({ templateId: U, results: [{ itemId: 'x', ok: true }] }).success);
  assert.ok(!RecordDto.safeParse({ templateId: U, results: [], performedAt: 'kemarin' }).success);
});
