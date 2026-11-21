import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeterDto, MeterIngestDto, meterConn } from './meters.rules';

test('MeterIngestDto: satu pembacaan atau daftar, angka string diterima', () => {
  const one = MeterIngestDto.parse({ meter: 'MTR-1', kwh: '1234.5' }) as any; assert.equal(one.meters.length, 1); assert.equal(one.meters[0].kwh, 1234.5);
  const many = MeterIngestDto.parse({ meters: [{ meter: 'A', kwh: 1, kw: 3.2, ts: 1790000000 }, { meter: 'B', kwh: 2 }] }) as any; assert.equal(many.meters.length, 2);
});
test('MeterIngestDto: menolak kode buruk, kwh negatif/NaN/terlalu besar, daftar kosong', () => {
  assert.throws(() => MeterIngestDto.parse({ meter: 'bad code!', kwh: 1 }));
  assert.throws(() => MeterIngestDto.parse({ meter: 'A', kwh: -1 }));
  assert.throws(() => MeterIngestDto.parse({ meter: 'A', kwh: 'abc' }));
  assert.throws(() => MeterIngestDto.parse({ meter: 'A', kwh: 1e11 }));
  assert.throws(() => MeterIngestDto.parse({ meters: [] }));
});
test('MeterDto: multiplier bawaan 1 dan harus > 0', () => {
  const base = { plantId: '00000000-0000-0000-0000-000000000001', unitId: '00000000-0000-0000-0000-000000000002', code: 'MTR-1', name: 'Meter' };
  assert.equal(MeterDto.parse(base).multiplier, 1);
  assert.throws(() => MeterDto.parse({ ...base, multiplier: 0 }));
});
test('meterConn: batas 15 menit dan 2 jam', () => {
  const now = 1_000_000_000_000;
  assert.equal(meterConn(null, now), 'waiting'); assert.equal(meterConn(now - 60_000, now), 'online');
  assert.equal(meterConn(now - 30 * 60_000, now), 'delayed'); assert.equal(meterConn(now - 3 * 3600_000, now), 'offline');
});
