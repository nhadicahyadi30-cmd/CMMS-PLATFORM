'use client';
import { FormEvent, useEffect, useState } from 'react';
import { askConfirm } from '@/components/Confirm';
import { api, ApiError, getUser } from '@/lib/api';
import { useApi } from '@/lib/hooks';

type Conn = 'online' | 'delayed' | 'offline' | 'waiting' | 'disabled'; type Sig = 'good' | 'fair' | 'weak' | 'unknown';
interface Dev { id: string; deviceId: string; name: string; active: boolean; sensors: string[]; fw: string | null; ip: string | null; rssi: number | null; uptimeS: number | null; queue: number | null; heapKb: number | null; boots: number | null; readingsTotal: number; lastSeen: string | null; assetId: string; assetCode: string; assetName: string; keyActive: boolean; conn: Conn; signal: Sig }
interface Created { id: string; deviceId: string; key: string; config: string; provision?: string; transport?: 'http' | 'mqtt'; assetCode?: string; createdTags?: string[]; existingTags?: string[]; warnings: string[]; note: string }

const CONN: Record<Conn, { t: string; c: string; i: string }> = {
  online: { t: 'Online', c: 'bg-emerald-100 text-emerald-800', i: '●' }, delayed: { t: 'Tertunda', c: 'bg-amber-100 text-amber-800', i: '◔' },
  offline: { t: 'Offline', c: 'bg-slate-200 text-slate-700', i: '○' }, waiting: { t: 'Menunggu data pertama', c: 'bg-blue-100 text-blue-800', i: '…' }, disabled: { t: 'Nonaktif', c: 'bg-slate-100 text-slate-500', i: '–' },
};
const SIG: Record<Sig, string> = { good: 'Kuat', fair: 'Cukup', weak: 'Lemah', unknown: '-' };
const ago = (s: string | null) => { if (!s) return 'belum pernah'; const m = Math.round((Date.now() - new Date(s).getTime()) / 60000); return m < 1 ? 'baru saja' : m < 60 ? `${m} mnt lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`; };
const up = (s: number | null) => (s == null ? '-' : s < 3600 ? `${Math.round(s / 60)} mnt` : s < 86400 ? `${(s / 3600).toFixed(1)} jam` : `${(s / 86400).toFixed(1)} hari`);
const msg = (e: any) => (e instanceof ApiError && Array.isArray(e.details?.issues) ? e.details.issues.map((i: any) => `${i.path?.join('.') ?? ''} ${i.message}`).join('; ') : e?.message ?? 'Terjadi kesalahan');

export default function DevicesPage() {
  const isAdmin = getUser()?.role === 'admin';
  const devs = useApi<Dev[]>('/telemetry/devices'); const assets = useApi<{ items: { id: string; code: string; name: string }[] }>(isAdmin ? '/assets?size=200' : null);
  const [assetId, setAssetId] = useState(''); const [name, setName] = useState(''); const [s, setS] = useState({ oilTemp: true, current: true, vibration: false });
  const [server, setServer] = useState(''); const [transport, setTransport] = useState<'http' | 'mqtt'>('http'); const [mq, setMq] = useState({ host: '', port: '1883', user: '', pass: '' }); const [demo, setDemo] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [res, setRes] = useState<Created | null>(null); const [copied, setCopied] = useState(false); const [copiedCode, setCopiedCode] = useState(false);
  useEffect(() => { if (typeof window !== 'undefined' && !/^(localhost|127\.)/.test(window.location.hostname)) setServer(window.location.origin); }, []);
  useEffect(() => { const t = setInterval(() => devs.reload(), 15000); return () => clearInterval(t); }, [devs.reload]);

  /** Bagian jalur kirim untuk permintaan API (alamat server hanya untuk HTTP; broker hanya untuk MQTT). */
  const tp = () => (transport === 'mqtt' ? { transport, mqttHost: mq.host, mqttPort: Number(mq.port) || 1883, mqttUser: mq.user, mqttPass: mq.pass } : { transport, serverUrl: server });
  async function create(e: FormEvent) {
    e.preventDefault(); setErr(''); setRes(null); setBusy(true);
    try { setRes(await api<Created>('/telemetry/devices', { method: 'POST', body: { assetId, name, sensors: s, demo, ...tp() } })); setName(''); devs.reload(); }
    catch (x) { setErr(msg(x)); } finally { setBusy(false); }
  }
  async function rotate(d: Dev) {
    if (transport === 'http' ? !server : !mq.host) { setErr(transport === 'http' ? 'Isi "Alamat server" di formulir dulu, karena dipakai untuk kode konfigurasi baru.' : 'Isi alamat broker MQTT di formulir dulu, karena dipakai untuk kode konfigurasi baru.'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (!(await askConfirm(`Buat kunci baru untuk ${d.name}? Kunci lama langsung dicabut dan perangkat harus di-flash ulang.`, { danger: true, ok: 'Ya, buat kunci baru' }))) return;
    setErr(''); try { setRes(await api<Created>(`/telemetry/devices/${d.id}/rotate-key`, { method: 'POST', body: { demo, ...tp() } })); devs.reload(); window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (x) { setErr(msg(x)); }
  }
  async function remove(d: Dev) {
    if (!(await askConfirm(`Nonaktifkan ${d.name}? Kunci dicabut dan data dari perangkat ini ditolak.`, { danger: true, ok: 'Ya, nonaktifkan' }))) return;
    try { await api(`/telemetry/devices/${d.id}`, { method: 'DELETE' }); devs.reload(); } catch (x) { setErr(msg(x)); }
  }
  function download() { if (!res) return; const u = URL.createObjectURL(new Blob([res.config], { type: 'text/plain' })); const a = document.createElement('a'); a.href = u; a.download = 'config.h'; a.click(); URL.revokeObjectURL(u); }
  const list = devs.data ?? []; const count = (c: Conn) => list.filter((d) => d.conn === c).length;
  const Card = ({ l, v, c = '' }: { l: string; v: number; c?: string }) => <div className="card"><div className="text-xs text-slate-500">{l}</div><div className={`text-2xl font-semibold ${c}`}>{v}</div></div>;

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">RTU Devices</h1><p className="text-sm text-slate-600">Daftarkan perangkat RTU ke mesin, dapatkan <b>kode konfigurasi</b> (tempel di portal perangkat, tanpa flash ulang), lalu pantau status koneksinya. Satu firmware yang sama untuk semua perangkat, jalur kirim HTTP atau MQTT. Setiap perangkat punya API key sendiri yang terbatas pada plant mesinnya. Panduan pemasangan: <code>docs/ESP32.md</code>.</p></div>
      {err && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{err}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Card l="Terdaftar" v={list.filter((d) => d.active).length} /><Card l="Online" v={count('online')} c="text-emerald-700" /><Card l="Menunggu data pertama" v={count('waiting')} c="text-blue-700" /><Card l="Offline / tertunda" v={count('offline') + count('delayed')} c="text-amber-700" /></div>

      {isAdmin && (
        <form onSubmit={create} className="card space-y-3">
          <h2 className="font-medium">Daftarkan perangkat RTU baru</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-slate-600">Mesin (aset)<select className="input mt-1" required value={assetId} onChange={(e) => setAssetId(e.target.value)}><option value="">Pilih aset…</option>{assets.data?.items.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
            <label className="text-xs text-slate-600">Nama perangkat<input className="input mt-1" required minLength={2} placeholder="ESP Pompa 203" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="text-xs text-slate-600">Jalur kirim<select className="input mt-1" value={transport} onChange={(e) => setTransport(e.target.value as 'http' | 'mqtt')}><option value="http">HTTP langsung ke MaintHub</option><option value="mqtt">MQTT (Mosquitto + Node-RED)</option></select></label>
          </div>
          {transport === 'http' ? (
            <label className="block text-xs text-slate-600">Alamat server (yang dijangkau perangkat RTU)<input className="input mt-1" required placeholder="http://192.168.1.50" value={server} onChange={(e) => setServer(e.target.value)} /></label>
          ) : (
            <div className="space-y-2 rounded bg-slate-50 p-3">
              <p className="text-xs text-slate-600">Broker MQTT = komputer/server yang menjalankan Mosquitto (<code>docker compose --profile iot up -d</code>). Alamatnya adalah IP komputer itu di jaringan yang sama dengan perangkat RTU. User dan password sama dengan <code>MQTT_USER</code> / <code>MQTT_PASS</code> di file <code>.env</code>.</p>
              <div className="grid gap-3 sm:grid-cols-4">
                <label className="text-xs text-slate-600 sm:col-span-2">Alamat broker<input className="input mt-1" required placeholder="192.168.1.50" value={mq.host} onChange={(e) => setMq({ ...mq, host: e.target.value })} /></label>
                <label className="text-xs text-slate-600">Port<input className="input mt-1" type="number" min={1} max={65535} value={mq.port} onChange={(e) => setMq({ ...mq, port: e.target.value })} /></label>
                <label className="text-xs text-slate-600">User<input className="input mt-1" autoComplete="off" value={mq.user} onChange={(e) => setMq({ ...mq, user: e.target.value })} /></label>
                <label className="text-xs text-slate-600 sm:col-span-2">Password broker<input className="input mt-1" type="password" autoComplete="new-password" value={mq.pass} onChange={(e) => setMq({ ...mq, pass: e.target.value })} /></label>
              </div>
              <p className="text-xs text-slate-500">Password broker hanya dimasukkan ke kode konfigurasi di layar ini; tidak disimpan di server MaintHub.</p>
            </div>)}
          <fieldset className="flex flex-wrap gap-4 text-sm"><legend className="mb-1 text-xs text-slate-600">Sensor terpasang (running hour selalu ikut)</legend>
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.oilTemp} onChange={(e) => setS({ ...s, oilTemp: e.target.checked })} />Suhu oli (DS18B20)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.current} onChange={(e) => setS({ ...s, current: e.target.checked })} />Arus motor (SCT-013)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.vibration} onChange={(e) => setS({ ...s, vibration: e.target.checked })} />Getaran (MPU6050)</label></fieldset>
          <label className="flex items-start gap-2 rounded bg-blue-50 p-2 text-sm text-blue-900"><input type="checkbox" className="mt-1" checked={demo} onChange={(e) => setDemo(e.target.checked)} /><span><b>Mode demo (data dummy)</b>: ESP32 mengirim data buatan tanpa sensor (suhu oli naik pelan, arus, getaran, mesin &quot;jalan&quot;), supaya dashboard bisa dicoba. Pakai aset uji, karena data dummy akan bercampur dengan data asli di aset yang sama. Untuk beralih ke sensor sungguhan: ubah <code>DEMO_MODE</code> menjadi 0 di <code>config.h</code> lalu upload ulang.</span></label>
          <p className="text-xs text-slate-500">{transport === 'http'
            ? <>Alamat server harus IP/nama yang bisa dibuka dari jaringan perangkat RTU, bukan <code>localhost</code>. Di Windows: jalankan <code>ipconfig</code> dan pakai &quot;IPv4 Address&quot; laptop/server. Pastikan firewall mengizinkan port 80.</>
            : <>Pastikan firewall komputer broker mengizinkan port 1883 (Windows: izinkan masuk TCP 1883).</>}</p>
          <button className="btn" disabled={busy}>{busy ? 'Membuat…' : 'Daftarkan & buat config.h'}</button>
        </form>)}

      {res && (
        <section className="card space-y-3 border-2 border-amber-300">
          <h2 className="font-medium">Kode konfigurasi untuk {res.deviceId} <span className="ml-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-700">{res.transport === 'mqtt' ? 'MQTT' : 'HTTP'}</span></h2>
          <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">{res.note}</p>
          {res.warnings.map((w) => <p key={w} className="rounded bg-orange-50 p-2 text-sm text-orange-900">⚠ {w}</p>)}
          {(res.createdTags?.length ?? 0) > 0 && <p className="text-sm text-slate-600">Sensor dibuat otomatis di {res.assetCode}: {res.createdTags!.join(', ')}. {res.existingTags?.length ? `Sudah ada sebelumnya: ${res.existingTags.join(', ')}.` : ''} Atur batas alarm di menu Telemetri (batas awal suhu oli 85/95 °C hanyalah contoh; sesuaikan dengan manual mesin).</p>}
          {res.provision && (<>
            <textarea readOnly rows={4} className="input w-full font-mono text-xs" value={res.provision} onFocus={(e) => e.currentTarget.select()} aria-label="Kode konfigurasi" />
            <div className="flex flex-wrap gap-2"><button className="btn" onClick={() => { navigator.clipboard?.writeText(res.provision!); setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); }}>{copiedCode ? 'Kode tersalin ✓' : 'Salin kode konfigurasi'}</button>
              <button className="btn-ghost" onClick={() => setRes(null)}>Sudah saya simpan</button></div>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
              <li>Flash firmware <code>firmware/esp32-mainthub/</code> ke ESP32 (cukup <b>sekali</b>; firmware yang sama untuk semua perangkat).</li>
              <li>Nyalakan. Bila Wi-Fi belum diisi, perangkat membuat Wi-Fi <b>MaintHub-RTU-xxxx</b> (kata sandi <code>mainthub1</code>). Sambungkan HP ke situ, halaman konfigurasi terbuka otomatis (atau buka <code>192.168.4.1</code>).</li>
              <li>Isi nama &amp; kata sandi Wi-Fi pabrik, <b>tempel kode di atas</b> pada kotak &quot;Kode konfigurasi&quot;, lalu Simpan. Perangkat restart dan mengirim data.</li>
              <li>Tunggu ±1–2 menit: status di tabel di bawah berubah dari &quot;Menunggu data pertama&quot; menjadi Online. Perangkat yang sudah terpasang bisa dikonfigurasi ulang kapan saja: tahan tombol BOOT 3 detik, atau ketik <code>portal</code> / <code>cfg &lt;kode&gt;</code> di Serial Monitor.</li>
            </ol></>)}
          <details className="text-sm"><summary className="cursor-pointer text-slate-600">Cara lama: file config.h (untuk build sendiri)</summary>
            <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{res.config}</pre>
            <div className="mt-2 flex flex-wrap gap-2"><button className="btn-ghost" onClick={download}>Unduh config.h</button>
              <button className="btn-ghost" onClick={() => { navigator.clipboard?.writeText(res.config); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? 'Tersalin ✓' : 'Salin config.h'}</button></div></details>
        </section>)}

      <section className="card overflow-x-auto p-0">
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Perangkat</th><th>Mesin</th><th>Status</th><th>Terakhir</th><th>Wi-Fi</th><th>Uptime</th><th>Antrean</th><th>FW</th><th>Pembacaan</th><th /></tr></thead>
          <tbody>{list.map((d) => (
            <tr key={d.id} className="border-t align-top"><td className="p-2"><div className="font-medium">{d.name}</div><div className="font-mono text-xs text-slate-400">{d.deviceId}</div></td>
              <td><span className="font-mono">{d.assetCode}</span><div className="text-xs text-slate-500">{d.assetName}</div></td>
              <td><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${CONN[d.conn].c}`}><span aria-hidden="true">{CONN[d.conn].i}</span>{CONN[d.conn].t}</span>{!d.keyActive && d.active && <div className="text-xs text-red-600">kunci dicabut</div>}</td>
              <td>{ago(d.lastSeen)}</td><td>{d.rssi == null ? '-' : `${d.rssi} dBm`}<div className="text-xs text-slate-500">{SIG[d.signal]}</div></td><td>{up(d.uptimeS)}<div className="text-xs text-slate-500">{d.boots != null ? `boot #${d.boots}` : ''}</div></td>
              <td className={d.queue && d.queue > 20 ? 'text-amber-700' : ''}>{d.queue ?? '-'}</td><td>{d.fw ?? '-'}</td><td>{Number(d.readingsTotal).toLocaleString('id-ID')}</td>
              <td className="whitespace-nowrap p-2 text-right">{isAdmin && d.active && <><button className="text-xs text-blue-700 hover:underline" onClick={() => rotate(d)}>Kunci baru</button> <button className="ml-2 text-xs text-red-600 hover:underline" onClick={() => remove(d)}>Nonaktifkan</button></>}</td></tr>))}
            {devs.data && !list.length && <tr><td colSpan={10} className="p-4 text-center text-slate-500">{isAdmin ? 'Belum ada perangkat. Daftarkan perangkat RTU pertama di atas.' : 'Belum ada perangkat terdaftar. Minta Administrator mendaftarkannya.'}</td></tr>}</tbody></table>
      </section>
      <p className="text-xs text-slate-500">Online = data masuk ≤ 3 menit. Antrean &gt; 20 berarti perangkat menumpuk data (Wi-Fi/server bermasalah) dan baru dikirim saat tersambung. Wi-Fi: kuat ≥ −60 dBm, cukup −60…−75, lemah &lt; −75.</p>
    </div>
  );
}
