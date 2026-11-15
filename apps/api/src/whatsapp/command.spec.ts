import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from './command';

test('mulai', () => {
  assert.deepEqual(parseCommand(' mulai  wo-p1-2611-0001 '), { kind: 'start', code: 'WO-P1-2611-0001' });
});
test('selesai dengan jam saja', () => {
  assert.deepEqual(parseCommand('SELESAI WO-P1-2611-0001 2'), { kind: 'done', code: 'WO-P1-2611-0001', hours: 2, downtime: 0, notes: '' });
});
test('selesai desimal koma, downtime dan catatan', () => {
  const c = parseCommand('selesai WO-P1-2611-0001 1,5 jam dt 1 Ganti bearing');
  assert.equal(c.kind, 'done');
  if (c.kind === 'done') { assert.equal(c.hours, 1.5); assert.equal(c.downtime, 1); assert.equal(c.notes, 'Ganti bearing'); }
});
test('status, bantuan, tidak dikenal', () => {
  assert.deepEqual(parseCommand('status'), { kind: 'list' });
  assert.deepEqual(parseCommand('?'), { kind: 'help' });
  assert.deepEqual(parseCommand('halo'), { kind: 'unknown' });
  assert.deepEqual(parseCommand('SELESAI WO-P1-2611-0001'), { kind: 'unknown' }); // jam wajib
});
