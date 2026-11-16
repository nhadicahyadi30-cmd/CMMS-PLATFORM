import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysIn, periodFor, previousPeriod } from './report-period';

test('harian & mingguan (Senin-Minggu), termasuk Minggu dan Senin', () => {
  assert.deepEqual(periodFor('daily', '2026-11-16'), { from: '2026-11-16', to: '2026-11-16' });
  assert.deepEqual(periodFor('weekly', '2026-11-16'), { from: '2026-11-16', to: '2026-11-22' });   // Senin
  assert.deepEqual(periodFor('weekly', '2026-11-22'), { from: '2026-11-16', to: '2026-11-22' });   // Minggu
  assert.deepEqual(periodFor('weekly', '2026-11-19'), { from: '2026-11-16', to: '2026-11-22' });
  assert.deepEqual(periodFor('weekly', '2026-01-01'), { from: '2025-12-29', to: '2026-01-04' });   // lintas tahun
});
test('bulanan & tahunan, termasuk Februari kabisat', () => {
  assert.deepEqual(periodFor('monthly', '2026-11-16'), { from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(periodFor('monthly', '2028-02-10'), { from: '2028-02-01', to: '2028-02-29' });
  assert.deepEqual(periodFor('monthly', '2027-02-10'), { from: '2027-02-01', to: '2027-02-28' });
  assert.deepEqual(periodFor('yearly', '2026-06-30'), { from: '2026-01-01', to: '2026-12-31' });
});
test('periode pembanding', () => {
  assert.deepEqual(previousPeriod('daily', '2026-11-16', '2026-11-16'), { from: '2026-11-15', to: '2026-11-15' });
  assert.deepEqual(previousPeriod('weekly', '2026-11-16', '2026-11-22'), { from: '2026-11-09', to: '2026-11-15' });
  assert.deepEqual(previousPeriod('monthly', '2026-03-01', '2026-03-31'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(previousPeriod('monthly', '2026-01-01', '2026-01-31'), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(previousPeriod('yearly', '2026-01-01', '2026-12-31'), { from: '2025-01-01', to: '2025-12-31' });
});
test('tanggal tidak valid ditolak; hitung hari', () => {
  assert.throws(() => periodFor('daily', '2026-02-30'));
  assert.throws(() => periodFor('daily', 'kemarin'));
  assert.equal(daysIn('2028-02-01', '2028-02-29'), 29);
});
