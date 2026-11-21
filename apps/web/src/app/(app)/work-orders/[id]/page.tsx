'use client';
import { useParams } from 'next/navigation';
import { askReason } from '@/components/Confirm';
import { useState } from 'react';
import { api, getUser } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import Badge from '@/components/Badge';
import Attachments from '@/components/Attachments';
import WoParts from '@/components/WoParts';
import Field from '@/components/Field';
import AskAi from '@/components/AskAi';

export default function WoDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: w, error, reload } = useApi<any>(`/work-orders/${id}`);
  const techs = useApi<any[]>(w?.status === 'approved' ? '/technicians' : null);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [fin, setFin] = useState(false); const [hrs, setHrs] = useState(''); const [dt, setDt] = useState('0'); const [fm, setFm] = useState(''); const [notes, setNotes] = useState('');
  const modes = useApi<any[]>(fin && w && w.woType !== 'preventive' ? '/failure-modes' : null);
  const role = getUser()?.role;
  const sup = role === 'supervisor' || role === 'admin';

  async function act(action: string, body?: unknown) {
    setBusy(true); setMsg('');
    try { await api(`/work-orders/${id}/${action}`, { method: 'POST', body: body ?? {} }); await reload(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }
  if (error) return <p className="text-red-600">{error}</p>;
  if (!w) return <p className="text-sm text-slate-500">Memuat…</p>;
  return (
    <div className="max-w-3xl space-y-4">
      <div><div className="font-mono text-sm text-slate-500">{w.code}</div><h1 className="text-xl font-semibold">{w.title}</h1>
        <div className="mt-1 flex gap-2"><Badge v={w.status} /><Badge v={w.priority} /><span className="text-sm text-slate-600">{w.assetName}</span></div></div>
      {w.description && <p className="card whitespace-pre-wrap text-sm">{w.description}</p>}
      <div className="card flex flex-wrap items-center gap-2">
        {w.status === 'waiting' && sup && <>
          <button className="btn" disabled={busy} onClick={() => act('approve')}>Setujui</button>
          <button className="btn-ghost" disabled={busy} onClick={async () => { const r = await askReason('WO ini akan ditolak. Tulis alasannya agar pelapor mengerti.', { ok: 'Tolak WO', danger: true }); if (r) act('reject', { reason: r }); }}>Tolak</button></>}
        {w.status === 'waiting' && !sup && <span className="text-sm text-slate-600">Menunggu approval Supervisor.</span>}
        {w.status === 'approved' && role !== 'technician' && (
          <select className="input max-w-xs" defaultValue="" onChange={(e) => e.target.value && act('assign', { technicianId: e.target.value })}>
            <option value="">Tugaskan ke teknisi…</option>{techs.data?.map((t) => <option key={t.id} value={t.id}>{t.fullName} — {t.skill}</option>)}</select>)}
        {w.status === 'assigned' && <button className="btn" disabled={busy} onClick={() => act('start')}>Mulai kerja</button>}
        {w.status === 'progress' && !fin && <button className="btn" disabled={busy} onClick={() => setFin(true)}>Selesaikan</button>}
        {w.status === 'done' && sup && <>
          <button className="btn" disabled={busy} onClick={() => act('close')}>Tutup WO</button>
          <button className="btn-ghost" disabled={busy} onClick={() => act('return')}>Kembalikan</button></>}
        {msg && <span role="alert" className="text-sm text-red-600">{msg}</span>}
      </div>
      {w.status === 'progress' && fin && (
        <form className="card grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const h = Number(hrs), d = Number(dt);
          if (!Number.isFinite(h) || h <= 0) { setMsg('Isi jam kerja aktual'); return; }
          act('finish', { actualHours: h, downtimeHours: Number.isFinite(d) ? d : 0, notes, ...(fm ? { failureModeId: fm } : {}) }).then(() => setFin(false)); }}>
          <Field label="Jam kerja aktual"><input className="input" inputMode="decimal" value={hrs} onChange={(e) => setHrs(e.target.value)} required /></Field>
          <Field label="Downtime (jam)"><input className="input" inputMode="decimal" value={dt} onChange={(e) => setDt(e.target.value)} /></Field>
          {w.woType !== 'preventive' && modes.data && (
            <Field label="Mode kegagalan (penyebab)"><select className="input" value={fm} onChange={(e) => setFm(e.target.value)}>
              <option value="">— belum diketahui —</option>{modes.data.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>)}
          <div className="sm:col-span-2"><Field label="Catatan hasil"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
          <div className="flex gap-2 sm:col-span-2"><button className="btn" disabled={busy}>Simpan & selesai</button><button type="button" className="btn-ghost" onClick={() => setFin(false)}>Batal</button></div>
        </form>)}
      <WoParts woId={id} plantId={w.plantId} items={w.parts ?? []} canEdit={['approved', 'assigned', 'progress', 'done'].includes(w.status)} onChange={reload} />
      <Attachments woId={id} items={w.attachments ?? []} canAdd={!['closed', 'rejected'].includes(w.status)} onChange={reload} />
      {getUser()?.modules.includes(5) && <details className="card"><summary className="cursor-pointer text-sm font-semibold">Tanya AI tentang WO ini</summary><div className="mt-3"><AskAi woId={id} assetId={w.assetId} /></div></details>}
      <section className="card"><h2 className="mb-2 text-sm font-semibold">Riwayat</h2>
        <ul className="space-y-1 text-sm">{w.logs.map((l: any, i: number) => (
          <li key={i}><span className="text-slate-500">{new Date(l.at).toLocaleString('id-ID')}</span> — {l.actor}: {l.text}</li>))}</ul></section>
    </div>
  );
}
