#!/usr/bin/env node
// Uji alur utama MaintHub lewat API (tanpa dependensi, Node 18+). Dijalankan terhadap sistem yang SUDAH hidup.
//
//   node tools/smoke-test.mjs --org NAMA_ORG --user admin --pass KATASANDI
//   node tools/smoke-test.mjs --url http://localhost --org ... --user ... --pass ... --keep
//
// Opsi:  --url    alamat Nginx (default http://localhost)
//        --keep   jangan menutup WO uji di akhir (default: WO uji dijalankan sampai ditutup)
// Yang dicek: login, daftar plant/aset/teknisi, alur Work Order (buat → setuju → tugaskan → mulai → selesai → tutup),
// WO muncul di daftar, laporan PDF harian, serta endpoint telemetri (monitor, prediksi, perangkat), dan status email.
// WO uji berjudul "[SMOKE TEST] ..." dan boleh dihapus/diabaikan; skrip ini tidak menghapus apa pun.

const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : d; };
const BASE = opt('url', 'http://localhost').replace(/\/+$/, '') + '/api';
const ORG = opt('org', process.env.MH_ORG), USER = opt('user', process.env.MH_USER), PASS = opt('pass', process.env.MH_PASS);
if (!ORG || !USER || !PASS) { console.error('Wajib: --org, --user, --pass (atau env MH_ORG/MH_USER/MH_PASS)'); process.exit(2); }

let token = null; let fails = 0; const rows = [];
const mark = (ok, name, info = '') => { rows.push({ ok, name, info }); if (!ok) fails++; console.log(`${ok ? 'OK   ' : 'GAGAL'}  ${name}${info ? '  — ' + info : ''}`); };

async function call(method, path, body, raw = false) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (raw) return r;
  const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) { const m = (data && data.message) || (typeof data === 'string' ? data.slice(0, 120) : '') || `HTTP ${r.status}`; throw new Error(`${r.status} ${Array.isArray(m) ? m.join('; ') : m}`); }
  return data;
}
async function step(name, fn) { try { const v = await fn(); mark(true, name, typeof v === 'string' ? v : ''); return v; } catch (e) { mark(false, name, e.message); return undefined; } }

console.log(`MaintHub smoke test → ${BASE}\n`);

const login = await step('Login', async () => {
  const d = await call('POST', '/auth/login', { org: ORG, username: USER, password: PASS });
  token = d.accessToken; return `${d.user.username ?? USER} (${d.user.role})`;
});
if (!login) { console.log('\nLogin gagal: sisanya tidak bisa diuji. Periksa --org/--user/--pass dan `docker compose ps`.'); process.exit(1); }

let plants = null, assets = null, techs = null;
await step('Daftar plant', async () => { plants = await call('GET', '/admin/plants'); if (!plants.length) throw new Error('belum ada plant'); return `${plants.length} plant`; });
await step('Daftar aset', async () => { assets = await call('GET', '/assets?size=5'); if (!assets.items.length) throw new Error('belum ada aset'); return `${assets.total} aset`; });
await step('Daftar teknisi', async () => { techs = await call('GET', '/admin/technicians'); if (!techs.length) throw new Error('belum ada teknisi: tambahkan di Administrasi → Teknisi'); return `${techs.length} teknisi`; });

if (plants?.length && assets?.items?.length) {
  const asset = assets.items[0]; const plantId = asset.plantId ?? plants[0].id;
  let wo = null;
  await step('WO: buat', async () => { wo = await call('POST', '/work-orders', { plantId, assetId: asset.id, woType: 'corrective', title: '[SMOKE TEST] uji alur WO', description: 'Dibuat otomatis oleh tools/smoke-test.mjs', priority: 'P3', estHours: 1 }); if (wo.status !== 'waiting') throw new Error(`status awal ${wo.status}, seharusnya waiting`); return `${wo.code} (${wo.status})`; });
  if (wo) {
    const id = wo.id;
    await step('WO: muncul di daftar', async () => { const l = await call('GET', '/work-orders?status=waiting&size=50'); if (!l.items.some((w) => w.id === id)) throw new Error('tidak ada di /work-orders'); return `${l.total} WO menunggu`; });
    await step('WO: setujui (approve)', async () => { await call('POST', `/work-orders/${id}/approve`); return 'approved'; });
    if (techs?.length) await step('WO: tugaskan ke teknisi', async () => { await call('POST', `/work-orders/${id}/assign`, { technicianId: techs[0].id }); return techs[0].fullName; });
    else mark(false, 'WO: tugaskan ke teknisi', 'dilewati, tidak ada teknisi');
    await step('WO: mulai', async () => { await call('POST', `/work-orders/${id}/start`); return 'progress'; });
    await step('WO: selesai (finish)', async () => { await call('POST', `/work-orders/${id}/finish`, { actualHours: 1, downtimeHours: 0.5, notes: 'Uji otomatis' }); return 'done'; });
    if (!a.includes('--keep')) await step('WO: tutup (close)', async () => { await call('POST', `/work-orders/${id}/close`); return 'closed'; });
    await step('WO: status akhir', async () => { const w = await call('GET', `/work-orders/${id}`); const want = a.includes('--keep') ? 'done' : 'closed'; if (w.status !== want) throw new Error(`status ${w.status}, seharusnya ${want}`); return w.status; });
  }
}

await step('Laporan PDF harian', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const r = await call('POST', '/reports/pdf', { frequency: 'daily', date: today }, true);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.subarray(0, 4).toString() !== '%PDF') throw new Error('isi bukan PDF');
  return `${Math.round(buf.length / 1024)} KB`;
});
await step('Email laporan (status)', async () => { const s = await call('GET', '/reports/status'); return s.emailEnabled ? `aktif, pengirim ${s.from}` : 'SMTP belum diatur (laporan tetap bisa diunduh)'; });

await step('Telemetri: monitor mesin', async () => { const r = await call('GET', '/telemetry/monitor'); return `${(r.items ?? r).length ?? 0} kartu`; });
await step('Telemetri: prediksi', async () => { const r = await call('GET', '/telemetry/predictions'); return `${(r.items ?? r).length ?? 0} sensor`; });
await step('Telemetri: perangkat ESP32', async () => { const r = await call('GET', '/telemetry/devices'); return `${r.length} perangkat`; });

console.log(`\n${rows.length - fails} lulus, ${fails} gagal.`);
process.exit(fails ? 1 : 0);
