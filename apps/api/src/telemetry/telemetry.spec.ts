import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { IngestDto, alarmMessage, breach, confirmedSeverity, newKey, parseKey, parseTs, secretMatches } from './telemetry.rules';

test('kunci API: format, parse, verifikasi', () => {
  const id = '11111111-2222-3333-4444-555555555555';
  const { key, hash } = newKey(id);
  const p = parseKey(key)!; assert.equal(p.id, id); assert.ok(secretMatches(p.secret, hash));
  assert.equal(secretMatches('salah-salah-salah-salah-salah', hash), false);
  assert.equal(parseKey('bukan-kunci'), null); assert.equal(parseKey(`mhk_${id}.pendek`), null);
  assert.notEqual(newKey(id).key, key);
});
test('payload: satu pembacaan atau batch; value string numerik diterima', () => {
  const a = IngestDto.parse({ asset: 'PMP-203', tag: 'Oil_Temp', value: '78.4' }); assert.equal(a.readings[0].value, 78.4); assert.equal(a.readings[0].tag, 'oil_temp');
  const b = IngestDto.parse({ readings: [{ asset: 'A', tag: 't', value: 1 }, { asset: 'B', tag: 't', value: 2 }] }); assert.equal(b.readings.length, 2);
  assert.equal(IngestDto.safeParse({ asset: 'A', tag: 't', value: null }).success, false);
  assert.equal(IngestDto.safeParse({ asset: 'A', tag: 't', value: 'abc' }).success, false);
  assert.equal(IngestDto.safeParse({ asset: 'A', tag: 'Tag Salah!', value: 1 }).success, false);
  assert.equal(IngestDto.safeParse({ readings: [] }).success, false);
  assert.equal(IngestDto.safeParse({ readings: Array(501).fill({ asset: 'A', tag: 't', value: 1 }) }).success, false);
});
test('parseTs: ISO, epoch detik/ms, batas waktu', () => {
  const now = Date.parse('2026-11-16T10:00:00Z');
  assert.equal(parseTs('2026-11-16T09:59:00Z', now).toISOString(), '2026-11-16T09:59:00.000Z');
  assert.equal(parseTs(1794823140, now).toISOString(), new Date(1794823140000).toISOString());
  assert.equal(parseTs(1794823140000, now).getTime(), 1794823140000);
  assert.equal(parseTs(undefined, now).getTime(), now);
  assert.throws(() => parseTs('2026-11-16T10:30:00Z', now), /masa depan/);
  assert.throws(() => parseTs('2026-11-01T00:00:00Z', now), /7 hari/);
  assert.throws(() => parseTs('kemarin', now), /tidak valid/);
});
test('breach: tinggi/rendah, kritis lebih utama dari peringatan', () => {
  const l = { warnHigh: '85', critHigh: '95', warnLow: 10, critLow: 5 };   // numeric dari pg berupa string
  assert.equal(breach(l, 80), null);
  assert.deepEqual(breach(l, 85), { sev: 'warning', side: 'high', limit: 85 });
  assert.deepEqual(breach(l, 99), { sev: 'critical', side: 'high', limit: 95 });
  assert.deepEqual(breach(l, 8), { sev: 'warning', side: 'low', limit: 10 });
  assert.deepEqual(breach(l, 5), { sev: 'critical', side: 'low', limit: 5 });
  assert.equal(breach({}, 1e9), null);
});
test('confirmedSeverity: perlu N pembacaan berturut-turut', () => {
  const l = { warnHigh: 85, critHigh: 95 };
  assert.equal(confirmedSeverity(l, [90], 1), 'warning');
  assert.equal(confirmedSeverity(l, [90, 80, 90], 2), null);       // pembacaan sebelumnya normal -> belum alarm
  assert.equal(confirmedSeverity(l, [90, 88], 3), null);           // data belum cukup
  assert.equal(confirmedSeverity(l, [99, 97, 96], 3), 'critical');
  assert.equal(confirmedSeverity(l, [99, 90, 96], 3), 'warning');
});
test('pesan alarm', () => {
  assert.equal(alarmMessage({ assetCode: 'PMP-203', assetName: 'Pompa', tagName: 'Suhu oli', unit: '°C', value: 97, sev: 'critical', side: 'high', limit: 95 }), 'PMP-203 Pompa: Suhu oli 97 °C di atas batas kritis (95 °C)');
});
