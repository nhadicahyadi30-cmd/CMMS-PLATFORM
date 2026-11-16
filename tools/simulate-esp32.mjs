#!/usr/bin/env node
// Simulator node ESP32: mengisi MaintHub dengan data palsu bertren naik agar Dashboard Prediksi bisa dicoba
// sebelum perangkat terpasang. Hanya memakai Node 18+ (fetch bawaan), tanpa dependensi.
//
// Contoh:
//   node tools/simulate-esp32.mjs --url http://localhost/api/ingest/readings --key mhk_xxx --asset PMP-203 --backfill-hours 24
//   node tools/simulate-esp32.mjs ... --live            (lanjut kirim tiap 30 dtk, Ctrl+C untuk berhenti)
//   node tools/simulate-esp32.mjs ... --dry-run         (cetak contoh payload, tidak mengirim)
// Sensor/tag harus sudah dibuat di menu Telemetri Mesin: oil_temp, motor_current, vibration_rms (gauge) dan running_hours (runhours).

const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : d; };
const flag = (k) => a.includes('--' + k);
if (flag('help') || flag('h')) { console.log(readHelp()); process.exit(0); }
const URL_ = opt('url', 'http://localhost/api/ingest/readings');
const KEY = opt('key', process.env.MAINTHUB_KEY || '');
const ASSET = opt('asset', 'PMP-203');
const PLANT = opt('plant', '');
const HOURS = Math.min(168, Math.max(0, Number(opt('backfill-hours', '24'))));   // server menolak data > 7 hari
const STEP_MIN = Math.max(1, Number(opt('step-min', '5')));
const START_RH = Number(opt('start-hours', '1200'));
const DRIFT = Number(opt('drift', '0.35'));      // kenaikan suhu oli °C per jam (0 = stabil)
const LIVE = flag('live'), DRY = flag('dry-run');
if (!DRY && !KEY) { console.error('Butuh --key mhk_... (atau env MAINTHUB_KEY). Gunakan --dry-run untuk uji tanpa mengirim.'); process.exit(1); }

// Pseudo-acak deterministik agar hasil bisa diulang.
let seed = 42; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 0.58;

const T_END = Date.now();
const T0 = T_END - HOURS * 3600_000;
function point(t) {
  const h = (t - T0) / 3600_000;
  const day = Math.sin(((t / 3600_000) % 24) / 24 * 2 * Math.PI);
  const oil = 62 + day * 1.5 + DRIFT * h + gauss() * 0.4;                 // naik pelan = skenario "oli makin panas"
  const amps = 18 + gauss() * 0.4 + (h > HOURS * 0.6 ? (h - HOURS * 0.6) * 0.03 : 0);
  const vib = 0.18 + 0.0025 * h + Math.abs(gauss()) * 0.01;                 // getaran perlahan naik
  const rh = START_RH + h;                                                  // jalan terus selama simulasi
  return { t, oil, amps, vib, rh };
}
const rd = (p) => {
  const ts = Math.floor(p.t / 1000), base = { asset: ASSET, ...(PLANT ? { plant: PLANT } : {}), ts };
  return [
    { ...base, tag: 'oil_temp', value: +p.oil.toFixed(2) }, { ...base, tag: 'motor_current', value: +p.amps.toFixed(2) },
    { ...base, tag: 'vibration_rms', value: +p.vib.toFixed(3) }, { ...base, tag: 'running_hours', value: +p.rh.toFixed(2) },
  ];
};

async function send(readings) {
  if (DRY) { console.log(JSON.stringify({ readings: readings.slice(0, 4) }, null, 1), `\n... total ${readings.length} pembacaan (tidak dikirim)`); return { accepted: 0, errors: [] }; }
  const r = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': KEY }, body: JSON.stringify({ readings }) });
  const txt = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}

async function main() {
  const all = []; for (let t = T0; t <= T_END; t += STEP_MIN * 60_000) all.push(...rd(point(t)));
  let acc = 0, dup = 0, err = 0, firstErr = null;
  for (let i = 0; i < all.length; i += 500) {
    const r = await send(all.slice(i, i + 500)); acc += r.accepted ?? 0; dup += r.duplicates ?? 0; err += r.errors?.length ?? 0; firstErr ??= r.errors?.[0];
    if (DRY) break;
  }
  console.log(`Backfill ${HOURS} jam: ${all.length} pembacaan → diterima ${acc}, duplikat ${dup}, ditolak ${err}`);
  if (firstErr) console.log('Contoh penolakan:', firstErr, '\nPastikan aset & sensor sudah dibuat dengan tag yang sama.');
  if (!LIVE) return;
  console.log('Mode live: kirim tiap 30 dtk. Ctrl+C untuk berhenti.');
  for (;;) { await new Promise((r) => setTimeout(r, 30_000)); const r = await send(rd(point(Date.now()))); console.log(new Date().toISOString(), 'diterima', r.accepted, 'alarm baru', r.alarmsRaised ?? 0, 'naik', r.alarmsEscalated ?? 0); }
}
function readHelp() { return 'Opsi: --url --key --asset --plant --backfill-hours (maks 168) --step-min --start-hours --drift --live --dry-run'; }
main().catch((e) => { console.error('Gagal:', e.message); process.exit(1); });
