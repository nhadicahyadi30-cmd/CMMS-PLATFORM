'use client';
import { FormEvent, Fragment, useEffect, useState } from 'react';
import Loading from '@/components/Loading';
import { api, ApiError, getUser } from '@/lib/api';
import { useApi } from '@/lib/hooks';

interface Tag { id: string; assetId: string; assetCode: string; assetName: string; tag: string; name: string; unit: string; kind: 'gauge' | 'runhours'; warnHigh: number | null; critHigh: number | null; warnLow: number | null; critLow: number | null; minValid: number | null; maxValid: number | null; confirmCount: number; active: boolean; lastTs: string | null; lastValue: number | null }
interface Key { id: string; name: string; plantId: string | null; plantName: string | null; active: boolean; createdAt: string; lastUsedAt: string | null }
const msg = (e: any) => (e instanceof ApiError && Array.isArray(e.details?.issues) ? e.details.issues.map((i: any) => `${i.path?.join('.') ?? ''} ${i.message}`).join('; ') : e?.message ?? 'Terjadi kesalahan');
const ago = (s: string | null) => { if (!s) return 'belum pernah'; const m = Math.round((Date.now() - new Date(s).getTime()) / 60000); return m < 1 ? 'baru saja' : m < 60 ? `${m} mnt lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`; };
const n = (v: string) => (v.trim() === '' ? null : Number(v));
const EMPTY = { assetId: '', tag: '', name: '', unit: '', kind: 'gauge', warnHigh: '', critHigh: '', warnLow: '', critLow: '', minValid: '', maxValid: '', confirmCount: '1' };

function Spark({ tagId }: { tagId: string }) {
  const { data } = useApi<{ ts: string; avg: number }[]>(`/telemetry/series?tagId=${tagId}&hours=24&bucket=5m`);
  if (!data?.length) return <p className="text-xs text-slate-500">Belum ada data 24 jam terakhir.</p>;
  const v = data.map((d) => Number(d.avg)); const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
  const pts = v.map((y, i) => `${(i / Math.max(1, v.length - 1)) * 600},${70 - ((y - lo) / r) * 60}`).join(' ');
  return <div><svg viewBox="0 0 600 80" className="h-24 w-full" role="img" aria-label="Tren 24 jam"><polyline points={pts} fill="none" stroke="#0fa89a" strokeWidth="2" strokeLinejoin="round" /></svg><p className="text-xs text-slate-500">24 jam terakhir (rata-rata per 5 menit): min {lo.toFixed(1)} · maks {hi.toFixed(1)}</p></div>;
}

export default function TelemetryPage() {
  const user = getUser()!; const isAdmin = user.role === 'admin'; const canTag = ['admin', 'supervisor', 'planner'].includes(user.role);
  const tags = useApi<Tag[]>('/telemetry/latest'); const keys = useApi<Key[]>(isAdmin ? '/telemetry/keys' : null);
  const assets = useApi<{ items: { id: string; code: string; name: string }[] }>('/assets?size=200'); const plants = useApi<{ id: string; name: string }[]>('/plants');
  const [f, setF] = useState<typeof EMPTY>(EMPTY); const [editId, setEditId] = useState<string | null>(null); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [kName, setKName] = useState(''); const [kPlant, setKPlant] = useState(''); const [newKey, setNewKey] = useState(''); const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { const t = setInterval(() => tags.reload(), 30000); return () => clearInterval(t); }, [tags.reload]);

  async function save(e: FormEvent) {
    e.preventDefault(); setErr(''); setOk('');
    const body: any = { name: f.name, unit: f.unit, kind: f.kind, warnHigh: n(f.warnHigh), critHigh: n(f.critHigh), warnLow: n(f.warnLow), critLow: n(f.critLow), minValid: n(f.minValid), maxValid: n(f.maxValid), confirmCount: Number(f.confirmCount) || 1 };
    try {
      if (editId) await api(`/telemetry/tags/${editId}`, { method: 'PATCH', body }); else await api('/telemetry/tags', { method: 'POST', body: { ...body, assetId: f.assetId, tag: f.tag } });
      setOk(editId ? 'Sensor diperbarui.' : 'Sensor ditambahkan.'); setF(EMPTY); setEditId(null); tags.reload();
    } catch (x) { setErr(msg(x)); }
  }
  function edit(t: Tag) { setEditId(t.id); setF({ assetId: t.assetId, tag: t.tag, name: t.name, unit: t.unit, kind: t.kind, warnHigh: t.warnHigh?.toString() ?? '', critHigh: t.critHigh?.toString() ?? '', warnLow: t.warnLow?.toString() ?? '', critLow: t.critLow?.toString() ?? '', minValid: t.minValid?.toString() ?? '', maxValid: t.maxValid?.toString() ?? '', confirmCount: String(t.confirmCount) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function toggle(t: Tag) { try { await api(`/telemetry/tags/${t.id}`, { method: 'PATCH', body: { active: !t.active } }); tags.reload(); } catch (x) { setErr(msg(x)); } }
  async function makeKey(e: FormEvent) { e.preventDefault(); setErr(''); try { const r = await api<{ key: string }>('/telemetry/keys', { method: 'POST', body: { name: kName, plantId: kPlant || null } }); setNewKey(r.key); setKName(''); keys.reload(); } catch (x) { setErr(msg(x)); } }
  async function revoke(id: string) { try { await api(`/telemetry/keys/${id}`, { method: 'DELETE' }); keys.reload(); } catch (x) { setErr(msg(x)); } }
  const set = (k: keyof typeof EMPTY) => (e: any) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="space-y-4">
      {tags.loading && !tags.data && <Loading />}
      <div><h1 className="text-xl font-semibold">Telemetri Mesin</h1><p className="text-sm text-slate-600">Terima data sensor (suhu oli, running hour, getaran, dll.) dari Node-RED atau gateway. Tetapkan batas alarm, dan alarm serta Work Order mengikuti otomatis. Panduan: <code>docs/TELEMETRY.md</code>.</p></div>
      {err && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{err}</p>}
      {ok && <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{ok}</p>}

      {isAdmin && (
        <section className="card space-y-3">
          <h2 className="font-medium">API key pengirim data</h2>
          <p className="text-xs text-slate-500">Satu kunci per Node-RED/gateway. Kunci dapat dibatasi ke satu plant. Kunci asli hanya tampil sekali saat dibuat.</p>
          {newKey && <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm"><div className="font-medium text-amber-900">Simpan kunci ini sekarang. Tidak bisa ditampilkan lagi.</div><code className="mt-1 block break-all rounded bg-white p-2 text-xs">{newKey}</code>
            <button className="btn-ghost mt-2" onClick={() => { navigator.clipboard?.writeText(newKey); }}>Salin</button> <button className="btn-ghost mt-2" onClick={() => setNewKey('')}>Sudah saya simpan</button></div>}
          <form onSubmit={makeKey} className="flex flex-wrap gap-2"><input className="input max-w-xs" placeholder="Nama, mis. Node-RED Plant A" value={kName} onChange={(e) => setKName(e.target.value)} required />
            <select className="input max-w-xs" value={kPlant} onChange={(e) => setKPlant(e.target.value)}><option value="">Semua plant</option>{plants.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="btn">Buat kunci</button></form>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Nama</th><th>Plant</th><th>Terakhir dipakai</th><th>Status</th><th /></tr></thead>
            <tbody>{keys.data?.map((k) => <tr key={k.id} className="border-t"><td className="p-2">{k.name}</td><td>{k.plantName ?? 'Semua'}</td><td>{ago(k.lastUsedAt)}</td><td>{k.active ? 'Aktif' : 'Dicabut'}</td><td className="text-right">{k.active && <button className="text-xs text-red-600 hover:underline" onClick={() => revoke(k.id)}>Cabut</button>}</td></tr>)}
              {keys.data && !keys.data.length && <tr><td colSpan={5} className="p-3 text-center text-slate-500">Belum ada kunci</td></tr>}</tbody></table></div>
        </section>)}

      {canTag && (
        <form onSubmit={save} className="card space-y-3">
          <h2 className="font-medium">{editId ? 'Ubah sensor' : 'Tambah sensor'}</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-xs text-slate-600 sm:col-span-2">Aset<select className="input mt-1" required disabled={!!editId} value={f.assetId} onChange={set('assetId')}><option value="">Pilih aset…</option>{assets.data?.items.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
            <label className="text-xs text-slate-600">Tag (dikirim Node-RED)<input className="input mt-1 font-mono" required disabled={!!editId} placeholder="oil_temp" value={f.tag} onChange={set('tag')} /></label>
            <label className="text-xs text-slate-600">Jenis<select className="input mt-1" value={f.kind} onChange={set('kind')}><option value="gauge">Pengukuran (suhu, tekanan, …)</option><option value="runhours">Running hour (kumulatif)</option></select></label>
            <label className="text-xs text-slate-600 sm:col-span-2">Nama tampil<input className="input mt-1" required placeholder="Suhu oli" value={f.name} onChange={set('name')} /></label>
            <label className="text-xs text-slate-600">Satuan<input className="input mt-1" placeholder="°C" value={f.unit} onChange={set('unit')} /></label>
            <label className="text-xs text-slate-600">Konfirmasi (n pembacaan)<input className="input mt-1" type="number" min={1} max={20} value={f.confirmCount} onChange={set('confirmCount')} /></label>
            {f.kind === 'gauge' && <>
              <label className="text-xs text-slate-600">Peringatan ≥<input className="input mt-1" type="number" step="any" value={f.warnHigh} onChange={set('warnHigh')} /></label>
              <label className="text-xs text-slate-600">Kritis ≥<input className="input mt-1" type="number" step="any" value={f.critHigh} onChange={set('critHigh')} /></label>
              <label className="text-xs text-slate-600">Peringatan ≤<input className="input mt-1" type="number" step="any" value={f.warnLow} onChange={set('warnLow')} /></label>
              <label className="text-xs text-slate-600">Kritis ≤<input className="input mt-1" type="number" step="any" value={f.critLow} onChange={set('critLow')} /></label>
              <label className="text-xs text-slate-600">Nilai wajar min<input className="input mt-1" type="number" step="any" value={f.minValid} onChange={set('minValid')} /></label>
              <label className="text-xs text-slate-600">Nilai wajar maks<input className="input mt-1" type="number" step="any" value={f.maxValid} onChange={set('maxValid')} /></label></>}
          </div>
          <div className="flex gap-2"><button className="btn">{editId ? 'Simpan perubahan' : 'Tambah sensor'}</button>{editId && <button type="button" className="btn-ghost" onClick={() => { setEditId(null); setF(EMPTY); }}>Batal</button>}</div>
        </form>)}

      <section className="card overflow-x-auto p-0">
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Aset</th><th>Sensor</th><th>Nilai terakhir</th><th>Diterima</th><th>Batas (peringatan / kritis)</th><th>Status</th><th /></tr></thead>
          <tbody>{tags.data?.map((t) => { const stale = t.lastTs && Date.now() - new Date(t.lastTs).getTime() > 15 * 60000; return (<Fragment key={t.id}>
            <tr className="border-t cursor-pointer hover:bg-slate-50" onClick={() => setOpen(open === t.id ? null : t.id)}><td className="p-2"><span className="font-mono">{t.assetCode}</span> <span className="text-slate-500">{t.assetName}</span></td><td>{t.name} <span className="font-mono text-xs text-slate-400">{t.tag}</span></td>
              <td className="font-semibold">{t.lastValue === null ? '-' : `${t.lastValue} ${t.unit}`}</td><td className={stale ? 'text-amber-700' : ''}>{ago(t.lastTs)}{stale ? ' ⚠' : ''}</td>
              <td className="text-xs text-slate-600">{t.kind === 'runhours' ? 'meter PM' : `↑ ${t.warnHigh ?? '-'} / ${t.critHigh ?? '-'}  ↓ ${t.warnLow ?? '-'} / ${t.critLow ?? '-'}`}</td><td>{t.active ? 'Aktif' : 'Nonaktif'}</td>
              <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>{canTag && <><button className="text-xs text-blue-700 hover:underline" onClick={() => edit(t)}>Ubah</button> <button className="ml-2 text-xs text-slate-600 hover:underline" onClick={() => toggle(t)}>{t.active ? 'Nonaktifkan' : 'Aktifkan'}</button></>}</td></tr>
            {open === t.id && <tr className="border-t bg-slate-50"><td colSpan={7} className="p-3"><Spark tagId={t.id} /></td></tr>}</Fragment>); })}
            {tags.data && !tags.data.length && <tr><td colSpan={7} className="p-4 text-center text-slate-500">Belum ada sensor. Tambahkan sensor, lalu arahkan Node-RED ke endpoint ingest.</td></tr>}</tbody></table>
      </section>
    </div>
  );
}
