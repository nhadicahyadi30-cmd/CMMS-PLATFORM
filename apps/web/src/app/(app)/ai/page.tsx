'use client';
import { ChangeEvent, FormEvent, useState } from 'react';
import Link from 'next/link';
import { api, getUser } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import AskAi from '@/components/AskAi';
import Field from '@/components/Field';

type Tab = 'chat' | 'alarm' | 'kb';
const TABS: [Tab, string][] = [['chat', 'Tanya AI'], ['alarm', 'Alarm'], ['kb', 'Basis pengetahuan']];
const SEV: Record<string, [string, string]> = { critical: ['Kritis', 'bg-red-100 text-red-800'], warning: ['Peringatan', 'bg-amber-100 text-amber-800'], info: ['Info', 'bg-slate-100 text-slate-700'] };
const ST: Record<string, string> = { open: 'Baru', ack: 'Ditangani', closed: 'Ditutup' };
const mgr = () => ['admin', 'supervisor', 'planner'].includes(getUser()?.role ?? '');

function Chat() {
  const plants = useApi<any[]>('/plants'); const [plant, setPlant] = useState(''); const [asset, setAsset] = useState('');
  const assets = useApi<{ items: any[] }>(plant ? `/assets?plantId=${plant}&size=200` : null);
  const hist = useApi<any[]>('/ai/history?limit=10'); const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <p className="text-sm text-slate-600">Pilih aset agar jawaban memakai riwayat perbaikan, RCA, dan FMEA aset itu. Tanpa aset, AI hanya memakai basis pengetahuan dan pengetahuan umum.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Plant (opsional)"><select className="input" value={plant} onChange={(e) => { setPlant(e.target.value); setAsset(''); }}><option value="">—</option>{plants.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Aset (opsional)"><select className="input" value={asset} onChange={(e) => setAsset(e.target.value)} disabled={!plant}><option value="">—</option>{assets.data?.items.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
        </div>
        <AskAi assetId={asset || undefined} />
      </div>
      <section className="card"><h2 className="mb-2 text-sm font-semibold">Pertanyaan terakhir Anda</h2>
        {hist.data?.length === 0 && <p className="text-sm text-slate-500">Belum ada.</p>}
        <ul className="divide-y text-sm">{hist.data?.map((h) => (<li key={h.id} className="py-2"><button className="text-left font-medium text-blue-700 underline" onClick={() => setOpen(open === h.id ? null : h.id)}>{h.question}</button>
          <span className="ml-2 text-xs text-slate-500">{new Date(h.createdAt).toLocaleString('id-ID')}</span>{open === h.id && <div className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-2">{h.answer}</div>}</li>))}</ul></section>
    </div>
  );
}

function Alarms() {
  const [status, setStatus] = useState('active'); const list = useApi<any[]>(`/alarms?status=${status}`); const plants = useApi<any[]>('/plants');
  const [show, setShow] = useState(false); const [plant, setPlant] = useState(''); const assets = useApi<{ items: any[] }>(plant ? `/assets?plantId=${plant}&size=200` : null);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState<string | null>(null); const [diag, setDiag] = useState<Record<string, string>>({});
  const run = async (id: string, fn: () => Promise<any>) => { setMsg(''); setBusy(id); try { const r = await fn(); await list.reload(); return r; } catch (e: any) { setMsg(e.message); } finally { setBusy(null); } };
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget; setMsg('');
    try { await api('/alarms', { method: 'POST', body: { plantId: plant, assetId: String(f.get('asset')) || null, severity: String(f.get('severity')), message: String(f.get('message')) } }); form.reset(); setShow(false); list.reload(); }
    catch (er: any) { setMsg(er.message); }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input max-w-[12rem]" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status"><option value="active">Belum ditutup</option><option value="open">Baru</option><option value="ack">Ditangani</option><option value="closed">Ditutup</option></select>
        <button className="btn" onClick={() => setShow(!show)}>{show ? 'Tutup form' : 'Catat alarm'}</button>
        {msg && <span role="alert" className="text-sm text-red-600">{msg}</span>}
      </div>
      {show && <form onSubmit={create} className="card grid gap-3 sm:grid-cols-3">
        <Field label="Plant"><select className="input" required value={plant} onChange={(e) => setPlant(e.target.value)}><option value="">Pilih…</option>{plants.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Aset"><select name="asset" className="input" defaultValue=""><option value="">—</option>{assets.data?.items.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
        <Field label="Tingkat"><select name="severity" className="input" defaultValue="warning"><option value="info">Info</option><option value="warning">Peringatan</option><option value="critical">Kritis</option></select></Field>
        <div className="sm:col-span-3"><Field label="Pesan alarm"><input name="message" className="input" required minLength={3} maxLength={500} placeholder="Contoh: Suhu bearing motor 95°C, getaran tinggi" /></Field></div>
        <div className="sm:col-span-3"><button className="btn">Simpan</button></div></form>}
      <ul className="space-y-2">{list.data?.map((a) => (
        <li key={a.id} className="card space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2"><span className={`rounded px-2 py-0.5 text-xs font-medium ${SEV[a.severity][1]}`}>{SEV[a.severity][0]}</span><span className="font-mono text-xs text-slate-500">{a.code}</span>
            <span className="text-xs text-slate-500">{ST[a.status]} · {new Date(a.raisedAt).toLocaleString('id-ID')}</span>{a.assetCode && <span className="text-xs">{a.assetCode} {a.assetName}</span>}</div>
          <p>{a.message}</p>
          {(diag[a.id] ?? a.aiDiagnosis) && <div className="whitespace-pre-wrap rounded bg-slate-50 p-2"><div className="mb-1 text-xs text-slate-500">Diagnosis awal AI — saran, belum diverifikasi</div>{diag[a.id] ?? a.aiDiagnosis}</div>}
          {a.status !== 'closed' && <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" disabled={busy === a.id} onClick={() => run(a.id, async () => { const r = await api<any>(`/alarms/${a.id}/diagnose`, { method: 'POST', body: {} }); setDiag((d) => ({ ...d, [a.id]: r.answer })); })}>{busy === a.id ? 'Memproses…' : 'Diagnosis AI'}</button>
            {a.status === 'open' && <button className="btn-ghost" disabled={busy === a.id} onClick={() => run(a.id, () => api(`/alarms/${a.id}/ack`, { method: 'POST', body: {} }))}>Tangani</button>}
            {mgr() && !a.woId && a.assetId && <button className="btn" disabled={busy === a.id} onClick={() => run(a.id, () => api(`/alarms/${a.id}/create-wo`, { method: 'POST', body: {} }))}>Buat WO</button>}
            {mgr() && <button className="btn-ghost" disabled={busy === a.id} onClick={() => confirm('Tutup alarm ini?') && run(a.id, () => api(`/alarms/${a.id}/close`, { method: 'POST', body: {} }))}>Tutup</button>}
            {a.woCode && <Link className="text-blue-700 underline" href={`/work-orders/${a.woId}`}>{a.woCode}</Link>}</div>}
        </li>))}
        {list.data?.length === 0 && <li className="card text-sm text-slate-500">Tidak ada alarm.</li>}</ul>
    </div>
  );
}

function Kb() {
  const list = useApi<any[]>('/ai/kb'); const [show, setShow] = useState(false); const [body, setBody] = useState(''); const [title, setTitle] = useState(''); const [msg, setMsg] = useState('');
  async function file(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 200_000) return setMsg('Berkas terlalu besar (maks 200 KB). Pecah menjadi beberapa dokumen.');
    if (!/\.(txt|md|csv)$/i.test(f.name)) return setMsg('Hanya berkas .txt, .md, atau .csv. Untuk PDF/Word, salin teksnya ke kotak di bawah.');
    setBody(await f.text()); if (!title) setTitle(f.name.replace(/\.[^.]+$/, '')); setMsg('');
  }
  async function save(e: FormEvent) {
    e.preventDefault(); setMsg('');
    try { await api('/ai/kb', { method: 'POST', body: { title, body } }); setTitle(''); setBody(''); setShow(false); list.reload(); } catch (er: any) { setMsg(er.message); }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Dokumen di sini (SOP, manual, catatan perbaikan) dicari otomatis saat Anda bertanya. Jangan memasukkan data rahasia yang tidak boleh dilihat semua pengguna — dokumen berlaku untuk seluruh organisasi.</p>
      {mgr() && <button className="btn" onClick={() => setShow(!show)}>{show ? 'Tutup form' : 'Tambah dokumen'}</button>}
      {show && <form onSubmit={save} className="card space-y-3">
        <Field label="Judul"><input className="input" required minLength={2} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Isi (tempel teks, atau pilih berkas .txt/.md)"><textarea className="input" rows={8} required minLength={10} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <input type="file" accept=".txt,.md,.csv,text/plain" onChange={file} aria-label="Pilih berkas teks" />
        <div className="flex items-center gap-3"><button className="btn">Simpan</button><span className="text-xs text-slate-500">{body.length.toLocaleString('id-ID')} karakter</span></div></form>}
      {msg && <p role="alert" className="text-sm text-red-600">{msg}</p>}
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-2">Judul</th><th>Potongan</th><th>Ditambahkan</th><th>Status</th><th></th></tr></thead>
        <tbody>{list.data?.map((d) => (<tr key={d.id} className="border-t"><td className="p-2">{d.title}</td><td>{d.chunks}</td><td>{new Date(d.createdAt).toLocaleDateString('id-ID')}{d.createdByName ? ` · ${d.createdByName}` : ''}</td><td>{d.active ? 'Aktif' : 'Nonaktif'}</td>
          <td className="space-x-3 text-xs">{mgr() && <button className="underline" onClick={() => api(`/ai/kb/${d.id}`, { method: 'PATCH', body: { active: !d.active } }).then(list.reload)}>{d.active ? 'nonaktifkan' : 'aktifkan'}</button>}
            {['admin', 'supervisor'].includes(getUser()?.role ?? '') && <button className="text-red-600 underline" onClick={() => confirm(`Hapus "${d.title}"?`) && api(`/ai/kb/${d.id}`, { method: 'DELETE' }).then(list.reload)}>hapus</button>}</td></tr>))}
          {list.data?.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-slate-500">Belum ada dokumen.</td></tr>}</tbody></table></div>
    </div>
  );
}

export default function AiPage() {
  const [tab, setTab] = useState<Tab>('chat');
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">AI Assistant</h1>
      <div role="tablist" className="flex flex-wrap gap-1 border-b">{TABS.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${tab === k ? 'border-blue-600 font-medium text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>{l}</button>))}</div>
      {tab === 'chat' && <Chat />}{tab === 'alarm' && <Alarms />}{tab === 'kb' && <Kb />}
    </div>
  );
}
