import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeviceCreate, devConn, newDeviceId, normalizeServerUrl, parseHeartbeat, renderConfig, renderProvision, selectedTags, signalOf } from './device.rules';

test('selectedTags: running hour selalu ada', () => {
  assert.deepEqual(selectedTags({ oilTemp: true, current: false, vibration: false }), ['oil_temp', 'running_hours']);
  assert.deepEqual(selectedTags({ oilTemp: false, current: false, vibration: false }), ['running_hours']);
});
test('newDeviceId: format & acak', () => { const a = newDeviceId(); assert.match(a, /^esp-[0-9a-f]{6}$/); assert.notEqual(a, newDeviceId()); });
test('normalizeServerUrl: origin, skema, peringatan localhost', () => {
  assert.equal(normalizeServerUrl('192.168.1.50').origin, 'http://192.168.1.50');
  assert.equal(normalizeServerUrl('https://cmms.contoh.com/app/x?y=1').origin, 'https://cmms.contoh.com');
  assert.ok(normalizeServerUrl('http://localhost').warnings.some((w) => w.includes('localhost')));
  assert.ok(!normalizeServerUrl('https://cmms.contoh.com').warnings.length);
  assert.throws(() => normalizeServerUrl('ftp://x.com'));
});
test('renderConfig: nilai terisi, sensor sesuai, kutip di-escape', () => {
  const c = renderConfig({ origin: 'http://10.0.0.5', key: 'mhk_abc.def', asset: 'PMP "1"', plant: 'P1', deviceId: 'esp-aaaaaa', tags: ['oil_temp', 'running_hours'] });
  assert.match(c, /#define MH_URL\s+"http:\/\/10\.0\.0\.5\/api\/ingest\/readings"/);
  assert.match(c, /#define MH_ASSET\s+"PMP \\"1\\""/);
  assert.match(c, /USE_DS18B20\s+1/); assert.match(c, /USE_CURRENT\s+0/); assert.match(c, /USE_MPU6050\s+0/);
  assert.match(c, /DEVICE_ID\s+"esp-aaaaaa"/);
});
test('renderConfig: setiap baris valid untuk C++ (komentar, #define, #pragma, kosong)', () => {
  const c = renderConfig({ origin: 'https://cmms.contoh.com', key: 'mhk_x.y', asset: 'A-1', plant: '', deviceId: 'esp-aaaaaa', tags: ['running_hours'] });
  for (const l of c.split('\n')) assert.match(l, /^(\s*|\/\/.*|#pragma once|#define \w+(\s+.*)?)$/, `baris tidak valid: ${l}`);
});
test('renderConfig: mode demo', () => {
  const base = { origin: 'http://10.0.0.5', key: 'k', asset: 'A', plant: '', deviceId: 'esp-aaaaaa', tags: ['running_hours'] as any };
  assert.match(renderConfig(base), /DEMO_MODE\s+0/); assert.match(renderConfig({ ...base, demo: true }), /DEMO_MODE\s+1/);
});
test('parseHeartbeat: valid dan rusak', () => {
  assert.deepEqual(parseHeartbeat({ id: 'esp-aaaaaa', rssi: -60, uptime: 10 }), { id: 'esp-aaaaaa', rssi: -60, uptime: 10 });
  assert.equal(parseHeartbeat({ id: 'x' }), null); assert.equal(parseHeartbeat({ id: 'esp-aaaaaa', rssi: 5 }), null); assert.equal(parseHeartbeat('x'), null);
});
test('devConn & signalOf', () => {
  const n = 10_000_000;
  assert.equal(devConn(null, n), 'waiting'); assert.equal(devConn(n - 1000, n), 'online'); assert.equal(devConn(n - 600_000, n), 'delayed'); assert.equal(devConn(n - 1_000_000, n), 'offline');
  assert.equal(signalOf(-55), 'good'); assert.equal(signalOf(-70), 'fair'); assert.equal(signalOf(-85), 'weak'); assert.equal(signalOf(null), 'unknown');
});
test('DeviceCreate: default sensor', () => {
  const d = DeviceCreate.parse({ assetId: '00000000-0000-0000-0000-000000000001', name: 'ESP Pompa', serverUrl: '192.168.1.5' });
  assert.deepEqual(d.sensors, { oilTemp: true, current: true, vibration: false });
});

test('DeviceCreate: HTTP butuh alamat server, MQTT butuh alamat broker', () => {
  const base = { assetId: '00000000-0000-0000-0000-000000000001', name: 'ESP Pompa' };
  assert.throws(() => DeviceCreate.parse(base));                                         // http tanpa alamat
  assert.throws(() => DeviceCreate.parse({ ...base, transport: 'mqtt' }));               // mqtt tanpa broker
  const m = DeviceCreate.parse({ ...base, transport: 'mqtt', mqttHost: '192.168.1.50' });
  assert.equal(m.mqttPort, 1883); assert.equal(m.serverUrl, '');
  assert.throws(() => DeviceCreate.parse({ ...base, transport: 'mqtt', mqttHost: 'x', mqttPort: 70000 }));
});
test('renderProvision: JSON valid, kunci pendek yang dibaca firmware, MQTT vs HTTP', () => {
  const base = { origin: 'http://10.0.0.5', key: 'mhk_a.b', asset: 'PMP "1"', plant: 'P1', deviceId: 'esp-aaaaaa', tags: ['oil_temp', 'running_hours'] as any };
  const h = JSON.parse(renderProvision(base));
  assert.deepEqual([h.mh, h.id, h.asset, h.tr, h.url, h.oil, h.cur, h.vib, h.demo], [1, 'esp-aaaaaa', 'PMP "1"', 'http', 'http://10.0.0.5/api/ingest/readings', 1, 0, 0, 0]);
  assert.equal(h.bh, undefined);
  const m = JSON.parse(renderProvision({ ...base, origin: '', transport: 'mqtt', mqttHost: '192.168.1.50', mqttPort: 1884, mqttUser: 'rtu', mqttPass: 'p"w', demo: true }));
  assert.deepEqual([m.tr, m.bh, m.bp, m.bu, m.bw, m.demo, m.url], ['mqtt', '192.168.1.50', 1884, 'rtu', 'p"w', 1, undefined]);
  assert.ok(!renderProvision(base).includes('\n'));   // satu baris
});
test('renderConfig: MQTT mengisi MH_TRANSPORT dan broker', () => {
  const c = renderConfig({ origin: '', key: 'k', asset: 'A', plant: '', deviceId: 'esp-aaaaaa', tags: ['running_hours'], transport: 'mqtt', mqttHost: 'b.local', mqttPort: 1883 });
  assert.match(c, /MH_TRANSPORT\s+1/); assert.match(c, /MQTT_HOST\s+"b\.local"/); assert.match(c, /MH_URL\s+""/);
});
