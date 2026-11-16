import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linearTrend, etaHours, anomalyScore, predictSensor, healthScore, pmForecast, Pt } from './predict.rules';

const H = 3_600_000, NOW = Date.UTC(2026, 0, 1, 12);
const series = (f: (h: number) => number, n = 48, stepMin = 30): Pt[] => Array.from({ length: n }, (_, i) => ({ t: NOW - (n - 1 - i) * stepMin * 60_000, v: f(i * stepMin / 60) }));

test('linearTrend: kemiringan & r2 untuk garis lurus', () => {
  const tr = linearTrend(series((h) => 50 + 2 * h))!;
  assert.ok(Math.abs(tr.slopePerHour - 2) < 1e-9); assert.ok(tr.r2 > 0.999);
});
test('linearTrend: data kurang → null', () => assert.equal(linearTrend(series(() => 1, 5)), null));
test('etaHours: naik ke batas, dan batas sudah terlewati = 0', () => {
  const tr = linearTrend(series((h) => 50 + 2 * h))!;
  const cur = 50 + 2 * 23.5;
  assert.ok(Math.abs(etaHours(cur, tr, 107, 'high')! - 5) < 1e-6);
  assert.equal(etaHours(cur, tr, 90, 'high'), 0);
  assert.equal(etaHours(cur, tr, 30, 'low')! >= 0, true);
});
test('etaHours: tren turun tidak menuju batas atas; r2 rendah tidak dipercaya', () => {
  const tr = linearTrend(series((h) => 80 - h))!;
  assert.equal(etaHours(60, tr, 100, 'high'), null);
  const noisy = linearTrend(series((h) => 50 + (Math.sin(h * 7) * 5)))!;
  assert.equal(etaHours(50, noisy, 100, 'high'), null);
});
test('anomalyScore: lonjakan terdeteksi, sinyal datar tidak', () => {
  const base = Array.from({ length: 40 }, (_, i) => 60 + (i % 3) * 0.3);
  assert.ok(anomalyScore(base, 90) > 3.5);
  assert.ok(Math.abs(anomalyScore(Array(40).fill(60), 60.2)) < 3.5);
});
test('predictSensor: status berjenjang', () => {
  const lim = { warnHigh: 90, critHigh: 100 };
  const mk = (pts: Pt[], lastTs = NOW) => predictSensor({ kind: 'gauge', limits: lim, points: pts, lastTs, lastValue: pts.at(-1)?.v ?? null, now: NOW });
  assert.equal(mk(series(() => 60)).status, 'ok');
  assert.equal(mk(series((h) => 60 + 0.5 * h)).status, 'watch');   // naik pelan: 83.5 → warn ≈ 13 jam? lihat di bawah
  assert.equal(mk(series((h) => 80 + 0.5 * h)).status, 'risk');    // 103.5 → sudah lewat
  assert.equal(mk(series(() => 105)).status, 'critical');
  assert.equal(mk(series(() => 60), NOW - 20 * 60_000).status, 'offline');
  assert.equal(mk(series(() => 60, 3)).status, 'nodata');
});
test('healthScore & pmForecast', () => {
  assert.equal(healthScore(['ok', 'ok']), 100);
  assert.equal(healthScore(['critical', 'risk', 'watch']), 20);
  assert.equal(healthScore(['critical', 'critical', 'critical']), 0);
  assert.equal(pmForecast(1000, 500, 1520, 10).state, 'overdue');
  const f = pmForecast(1000, 500, 1450, 10);
  assert.equal(f.state, 'soon'); assert.equal(Math.round(f.etaDays!), 5);
  assert.equal(pmForecast(1000, 500, 1100, 10).state, 'ok');
  assert.equal(pmForecast(1000, 500, 1100, null).state, 'unknown');
});
