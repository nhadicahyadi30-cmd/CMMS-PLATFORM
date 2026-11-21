'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, bootstrap, getUser } from '@/lib/api';
import { cacheFieldPage, enqueue, listOutbox, loadPack, OutboxItem, Pack, removeOutbox, savePack, syncOutbox } from '@/lib/offline';
import HelpButton from '@/components/HelpButton';
import { fmt, isAbnormal, uuid } from '@/lib/safety';

type Tab = 'check' | 'wo' | 'queue';

/** Mode Lapangan: berjalan tanpa sinyal. Data diunduh dulu saat online; isian disimpan di perangkat dan dikirim otomatis saat sinyal kembali. */
export default function FieldPage() {
  const [pack, setPack] = useState<Pack | null>(null); const [queue, setQueue] = useState<OutboxItem[]>([]);
  const [online, setOnline] = useState(true); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [tab, setTab] = useState<Tab>('check');
  const [run, setRun] = useState<any | null>(null); const [fin, setFin] = useState<any | null>(null); const [needLogin, setNeedLogin] = useState(false);

  const refresh = useCallback(async () => { setPack((await loadPack()) ?? null); setQueue(await listOutbox()); }, []);
  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    if (!getUser() && !(await bootstrap())) { setNeedLogin(true); return; }
    const r = await syncOutbox(); setNeedLogin(r.needLogin);
    if (r.sent) setMsg(`${r.sent} kiriman terkirim ke server`);
    if (r.failed) setMsg((m) => `${m ? m + '. ' : ''}${r.failed} kiriman ditolak server, lihat tab Antrean`);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    setOnline(navigator.onLine); refresh().then(() => { if (navigator.onLine) sync(); });
    const on = () => { setOnline(true); sync(); }; const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [refresh, sync]);

  async function download() {
    setBusy(true); setMsg('');
    try {
      if (!getUser() && !(await bootstrap())) { setNeedLogin(true); throw new Error('Masuk dulu untuk mengunduh data'); }
      const p = await api<Pack>('/field/pack'); await savePack(p); await cacheFieldPage(); await refresh();
      setMsg(`Data tersimpan di perangkat: ${p.templates.length} checklist, ${p.workOrders.length} WO, ${p.assets.length} aset. Halaman ini bisa dibuka tanpa sinyal.`);
    } catch (e: any) { setMsg(e.message === 'Failed to fetch' ? 'Tidak ada koneksi ke server' : e.message); } finally { setBusy(false); }
  }

  const pending = queue.filter((q) => q.status === 'pending').length; const failed = queue.filter((q) => q.status === 'failed').length;
  return (
    <div className="app-root app-main mx-auto min-h-screen max-w-2xl space-y-3 p-3 text-slate-800">
      <header className="flex items-center justify-between gap-2">
        <div><h1 className="text-lg font-semibold">Mode Lapangan</h1><p className="text-xs text-slate-500">{pack ? `${pack.user.name} · data per ${fmt(pack.generatedAt)}` : 'Belum ada data di perangkat ini'}</p></div>
        <div className="flex items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${online ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{online ? 'Online' : 'Offline'}</span>
          <Link href="/work-orders" className="btn-ghost">Aplikasi</Link></div>
      </header>
      {msg && <p className="rounded bg-sky-50 px-3 py-2 text-sm text-sky-900" role="status">{msg}</p>}
      {needLogin && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">Sesi berakhir. <Link className="underline" href="/login?next=/field">Masuk lagi</Link> (butuh sinyal) agar kiriman bisa dikirim. Isian Anda tetap aman di perangkat.</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={busy || !online} onClick={download}>{busy ? 'Mengunduh…' : 'Unduh data terbaru'}</button>
        <button className="btn-ghost" disabled={!online || !pending} onClick={sync}>Kirim antrean ({pending})</button>
      </div>
      {!pack && <p className="card text-sm text-slate-600">Saat ada sinyal, tekan <b>Unduh data terbaru</b> sekali. Setelah itu checklist, inspeksi, dan penyelesaian WO bisa dikerjakan tanpa sinyal. Izin Kerja (PTW) tetap butuh online karena persetujuannya harus real-time.</p>}

      <nav className="flex gap-2" aria-label="Menu lapangan">
        {([['check', 'Checklist'], ['wo', 'Work Order'], ['queue', `Antrean${pending + failed ? ` (${pending + failed})` : ''}`]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setRun(null); setFin(null); }} className={tab === k ? 'btn' : 'btn-ghost'}>{l}</button>))}
      </nav>

      {tab === 'check' && pack && !run && <Templates pack={pack} onPick={(t) => setRun(t)} />}
      {tab === 'check' && pack && run && <Run pack={pack} tpl={run} onDone={async (m) => { setMsg(m); setRun(null); await refresh(); sync(); }} onCancel={() => setRun(null)} />}
      {tab === 'wo' && pack && !fin && <WoList pack={pack} queue={queue} onChange={refresh} onFinish={(w) => setFin(w)} sync={sync} />}
      {tab === 'wo' && pack && fin && <Finish wo={fin} onDone={async () => { setFin(null); await refresh(); sync(); }} onCancel={() => setFin(null)} />}
      {tab === 'queue' && <Queue queue={queue} onChange={refresh} />}
      <HelpButton />
    </div>
  );
}

function Templates({ pack, onPick }: { pack: Pack; onPick: (t: any) => void }) {
  if (!pack.templates.length) return <p className="card text-sm text-slate-500">Tidak ada checklist untuk peran Anda.</p>;
  return <ul className="space-y-2">{pack.templates.map((t) => (
    <li key={t.id} className="card flex items-center justify-between gap-2"><div><div className="font-medium">{t.name}</div><div className="text-xs text-slate-500">{t.code} · {t.items.length} butir{t.frequencyDays ? ` · tiap ${t.frequencyDays} hari` : ''}</div></div>
      <button className="btn" onClick={() => onPick(t)}>Mulai</button></li>))}</ul>;
}

function Run({ pack, tpl, onDone, onCancel }: { pack: Pack; tpl: any; onDone: (m: string) => void; onCancel: () => void }) {
  const assets = useMemo(() => pack.assets.filter((a) => (tpl.assetId ? a.id === tpl.assetId : a.plantId === tpl.plantId)), [pack, tpl]);
  const [assetId, setAssetId] = useState(tpl.assetId ?? ''); const [vals, setVals] = useState<Record<string, { ok?: boolean; value?: number; text?: string; note?: string }>>({});
  const [notes, setNotes] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [clientUid] = useState(() => uuid()); const [startedAt] = useState(() => new Date().toISOString());
  const set = (id: string, v: object) => setVals((o) => ({ ...o, [id]: { ...o[id], ...v } }));
  const ab = tpl.items.filter((i: any) => isAbnormal(i, vals[i.id] ?? {})).length;

  async function save() {
    setErr('');
    if (!assetId) return setErr('Pilih aset yang diperiksa');
    const miss = tpl.items.find((i: any) => i.required && ((i.kind === 'check' && vals[i.id]?.ok === undefined) || (i.kind === 'number' && vals[i.id]?.value === undefined) || (i.kind === 'text' && !vals[i.id]?.text?.trim())));
    if (miss) return setErr(`Butir wajib belum diisi: ${miss.text}`);
    setBusy(true);
    const payload = { templateId: tpl.id, assetId, performedAt: startedAt, notes, clientUid, results: tpl.items.filter((i: any) => vals[i.id]).map((i: any) => ({ itemId: i.id, ...vals[i.id] })) };
    // Selalu simpan ke antrean dulu (aman jika aplikasi tertutup), lalu dikirim bila online
    await enqueue({ kind: 'inspection', label: `${tpl.name} · ${assets.find((a) => a.id === assetId)?.name ?? ''}`, payload });
    onDone(ab ? `Checklist disimpan (${ab} temuan akan menjadi WO setelah terkirim)` : 'Checklist disimpan');
  }
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between"><h2 className="font-semibold">{tpl.name}</h2><button className="btn-ghost" onClick={onCancel}>Batal</button></div>
      {!tpl.assetId && <label className="block text-sm"><span className="mb-1 block text-slate-600">Aset</span><select className="input" value={assetId} onChange={(e) => setAssetId(e.target.value)}><option value="">Pilih aset…</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>}
      {tpl.items.map((i: any) => {
        const v = vals[i.id] ?? {}; const bad = isAbnormal(i, v);
        return (
          <div key={i.id} className={`rounded-lg border p-3 ${bad ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}>
            <div className="text-sm font-medium">{i.seq}. {i.text}{i.critical && <span className="ml-2 rounded bg-red-100 px-1.5 text-xs text-red-800">kritis</span>}{!i.required && <span className="ml-2 text-xs text-slate-400">opsional</span>}</div>
            {i.kind === 'check' && <div className="mt-2 flex gap-2">{[[true, 'Normal'], [false, 'Tidak normal']].map(([val, l]) => (
              <button key={String(val)} type="button" onClick={() => set(i.id, { ok: val as boolean })} className={v.ok === val ? (val ? 'btn' : 'rounded-lg bg-red-600 px-3.5 py-1.5 text-sm font-medium text-white') : 'btn-ghost'}>{l as string}</button>))}</div>}
            {i.kind === 'number' && <div className="mt-2 flex items-center gap-2"><input className="input max-w-[10rem]" type="number" inputMode="decimal" step="any" value={v.value ?? ''} onChange={(e) => set(i.id, { value: e.target.value === '' ? undefined : Number(e.target.value) })} />
              <span className="text-sm text-slate-500">{i.unit ?? ''}{i.minVal != null || i.maxVal != null ? ` (batas ${i.minVal ?? '−'} s/d ${i.maxVal ?? '−'})` : ''}</span></div>}
            {i.kind === 'text' && <input className="input mt-2" value={v.text ?? ''} onChange={(e) => set(i.id, { text: e.target.value })} />}
            {bad && <input className="input mt-2" placeholder="Catatan temuan (opsional)" value={v.note ?? ''} onChange={(e) => set(i.id, { note: e.target.value })} />}
          </div>);
      })}
      <label className="block text-sm"><span className="mb-1 block text-slate-600">Catatan umum</span><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
      <button className="btn w-full py-2.5" disabled={busy} onClick={save}>Simpan checklist{ab ? ` (${ab} temuan)` : ''}</button>
    </div>
  );
}

function WoList({ pack, queue, onChange, onFinish, sync }: { pack: Pack; queue: OutboxItem[]; onChange: () => void; onFinish: (w: any) => void; sync: () => void }) {
  const queued = (id: string, kind: string) => queue.some((q) => q.kind === kind && q.payload.woId === id && q.status === 'pending');
  async function start(w: any) {
    await enqueue({ kind: 'wo_start', label: `Mulai ${w.code}`, payload: { woId: w.id } });
    const p = { ...pack, workOrders: pack.workOrders.map((x) => (x.id === w.id ? { ...x, status: 'progress' } : x)) }; await savePack(p); onChange(); sync();
  }
  if (!pack.workOrders.length) return <p className="card text-sm text-slate-500">Tidak ada WO yang ditugaskan kepada Anda saat data diunduh.</p>;
  return <ul className="space-y-2">{pack.workOrders.map((w) => (
    <li key={w.id} className="card space-y-1"><div className="flex items-center justify-between gap-2"><div><div className="font-medium">{w.title}</div><div className="text-xs text-slate-500">{w.code} · {w.assetName} · {w.priority}</div></div>
      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{queued(w.id, 'wo_finish') ? 'selesai (antre kirim)' : w.status === 'progress' ? 'dikerjakan' : 'ditugaskan'}</span></div>
      {w.description && <p className="text-sm text-slate-600">{w.description}</p>}
      <div className="flex gap-2 pt-1">
        {w.status === 'assigned' && !queued(w.id, 'wo_start') && <button className="btn" onClick={() => start(w)}>Mulai kerja</button>}
        {(w.status === 'progress' || queued(w.id, 'wo_start')) && !queued(w.id, 'wo_finish') && <button className="btn" onClick={() => onFinish(w)}>Selesaikan</button>}
      </div></li>))}</ul>;
}

function Finish({ wo, onDone, onCancel }: { wo: any; onDone: () => void; onCancel: () => void }) {
  const [hours, setHours] = useState(''); const [down, setDown] = useState('0'); const [notes, setNotes] = useState(''); const [err, setErr] = useState('');
  async function save() {
    const h = Number(hours); if (!hours || !(h >= 0)) return setErr('Isi jam kerja aktual');
    await enqueue({ kind: 'wo_finish', label: `Selesai ${wo.code}`, payload: { woId: wo.id, body: { actualHours: h, downtimeHours: Number(down) || 0, notes } } });
    const p = await loadPack(); if (p) await savePack({ ...p, workOrders: p.workOrders.filter((x) => x.id !== wo.id) });
    onDone();
  }
  return (
    <div className="card space-y-3"><div className="flex items-center justify-between"><h2 className="font-semibold">Selesaikan {wo.code}</h2><button className="btn-ghost" onClick={onCancel}>Batal</button></div>
      <p className="text-sm text-slate-600">{wo.title}</p>
      <div className="grid grid-cols-2 gap-3"><label className="block text-sm"><span className="mb-1 block text-slate-600">Jam kerja aktual</span><input className="input" type="number" step="0.1" min="0" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1 block text-slate-600">Downtime (jam)</span><input className="input" type="number" step="0.1" min="0" inputMode="decimal" value={down} onChange={(e) => setDown(e.target.value)} /></label></div>
      <label className="block text-sm"><span className="mb-1 block text-slate-600">Hasil pekerjaan</span><textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
      <button className="btn w-full py-2.5" onClick={save}>Simpan penyelesaian</button>
      <p className="text-xs text-slate-500">Supervisor tetap perlu menutup WO setelah terkirim. Suku cadang yang dipakai dicatat dari aplikasi saat online.</p></div>
  );
}

function Queue({ queue, onChange }: { queue: OutboxItem[]; onChange: () => void }) {
  if (!queue.length) return <p className="card text-sm text-slate-500">Antrean kosong: semua kiriman sudah sampai ke server.</p>;
  return <ul className="space-y-2">{queue.map((q) => (
    <li key={q.id} className="card flex items-center justify-between gap-2"><div><div className="text-sm font-medium">{q.label}</div><div className="text-xs text-slate-500">{fmt(q.createdAt)} · {q.status === 'pending' ? 'menunggu sinyal' : 'ditolak server'}</div>{q.error && <div className="text-xs text-red-600">{q.error}</div>}</div>
      {q.status === 'failed' && <button className="btn-ghost" onClick={async () => { await removeOutbox(q.id!); onChange(); }}>Buang</button>}</li>))}</ul>;
}
