import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connOf, levelOf, runStateOf, worstLevel } from './monitor.rules';

test('levelOf: batas atas/bawah, kritis didahulukan', () => {
  const l = { warnHigh: 85, critHigh: 95, warnLow: 10, critLow: 5 };
  assert.equal(levelOf(70, l), 'ok'); assert.equal(levelOf(85, l), 'warning'); assert.equal(levelOf(96, l), 'critical');
  assert.equal(levelOf(9, l), 'warning'); assert.equal(levelOf(5, l), 'critical');
  assert.equal(levelOf(null, l), 'ok'); assert.equal(levelOf(50, {}), 'ok');
});
test('connOf: online / tertunda / offline / never', () => {
  const now = 1_000_000_000;
  assert.equal(connOf(now - 60_000, now), 'online'); assert.equal(connOf(now - 10 * 60_000, now), 'delayed');
  assert.equal(connOf(now - 16 * 60_000, now), 'offline'); assert.equal(connOf(null, now), 'never');
});
test('runStateOf: jalan, berhenti, tidak diketahui', () => {
  assert.equal(runStateOf(10, 1200, 1200.3, 'online'), 'running');
  assert.equal(runStateOf(10, 1200, 1200, 'online'), 'stopped');
  assert.equal(runStateOf(1, 1200, 1200, 'online'), 'unknown');
  assert.equal(runStateOf(10, 1200, 1200.3, 'offline'), 'unknown');
});
test('worstLevel', () => { assert.equal(worstLevel(['ok', 'warning']), 'warning'); assert.equal(worstLevel(['warning', 'critical', 'ok']), 'critical'); assert.equal(worstLevel([]), 'ok'); });
