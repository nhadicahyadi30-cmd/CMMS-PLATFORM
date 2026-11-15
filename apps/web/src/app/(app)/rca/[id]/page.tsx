'use client';
import { useParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api, getUser } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import Field from '@/components/Field';
import Fishbone from '@/components/Fishbone';

const STAGES = [['plan', 'Plan', 'Analisis & rencana'], ['do', 'Do', 'Jalankan tindakan'], ['check', 'Check', 'Verifikasi efektivitas'], ['act', 'Act', 'Standarisasi'], ['closed', 'Selesai', '']] as const;
const NEXT: Record<string, string> = { plan: 'do', do: 'check', check: 'act', act: 'closed' };
const CATS: [string, string][] = [['man', 'Manusia'], ['machine', 'Mesin'], ['method', 'Metode'], ['material', 'Material'], ['measurement', 'Pengukuran'], ['environment', 'Lingkungan']];
const AS: Record<string, string> = { open: 'Belum', done: 'Selesai, menunggu verifikasi', verified: 'Terverifikasi' };

export default function RcaDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: c, error, reload } = useApi<any>(`/rca/cases/${id}`);
  const users = useApi<any[]>('/rca/people');
  const [msg, setMsg] = useState('');
  const role = getUser()?.role; const sup = role === 'supervisor' || role === 'admin';
  const run = async (fn: () => Promise<unknown>) => { setMsg(''); try { await fn(); await reload(); return true; } catch (e: any) { setMsg(e.message); return false; } };
  if (error) return <p className="text-red-600">{error}</p>;
  if (!c) return <p className="text-sm text-slate-500">Memuat…</p>;
  const locked = c.stage === 'closed'; const idx = STAGES.findIndex((s) => s[0] === c.stage);
  const why = (n: number) => c.whys.find((w: any) => w.level === n)?.answer ?? '';
  const next = NEXT[c.stage]; const needSup = next === 'act' || next === 'closed';

  const patch = (body: object) => run(() => api(`/rca/cases/${id}`, { method: 'PATCH', body }));
  const addCause = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget;
    run(() => api(`/rca/cases/${id}/causes`, { method: 'POST', body: { category: f.get('category'), cause: f.get('cause'), isRoot: f.get('isRoot') === 'on' } })).then((ok) => ok && form.reset());
  };
  const addAction = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget;
    run(() => api(`/rca/cases/${id}/actions`, { method: 'POST', body: { kind: f.get('kind'), description: f.get('description'), ownerId: f.get('ownerId') || null, dueDate: f.get('dueDate') || null } })).then((ok) => ok && form.reset());
  };

  return (
    <div className="max-w-4xl space-y-4">
      <div><div className="font-mono text-sm text-slate-500">{c.code} · {c.assetCode} {c.assetName}</div><h1 className="text-xl font-semibold">{c.title}</h1>
        {c.problem && <p className="mt-1 text-sm text-slate-600">{c.problem}</p>}</div>

      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Tahap PDCA">
        {STAGES.map((s, i) => (
          <li key={s[0]} className={`rounded-md border px-3 py-1.5 ${i === idx ? 'border-blue-600 bg-blue-50 font-medium text-blue-800' : i < idx ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-slate-200 text-slate-400'}`}>
            {i < idx ? '✓ ' : ''}{s[1]}{s[2] && <span className="ml-1 hidden text-xs sm:inline">· {s[2]}</span>}</li>))}
      </ol>
      {msg && <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{msg}</p>}

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold">Analisis 5 Why</h2>
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="flex items-center gap-2"><span className="w-14 shrink-0 text-sm text-slate-500">Why {n}</span>
            <input className="input" defaultValue={why(n)} key={`${n}-${why(n)}`} disabled={locked} placeholder={n === 1 ? 'Mengapa masalah ini terjadi?' : 'Mengapa itu terjadi?'}
              onBlur={(e) => { const v = e.target.value.trim(); if (v === why(n)) return; run(() => v ? api(`/rca/cases/${id}/whys/${n}`, { method: 'PUT', body: { answer: v } }) : api(`/rca/cases/${id}/whys/${n}`, { method: 'DELETE' })); }} /></div>))}
        <Field label="Akar masalah (kesimpulan)"><textarea className="input" rows={2} defaultValue={c.rootCause ?? ''} disabled={locked} onBlur={(e) => e.target.value !== (c.rootCause ?? '') && patch({ rootCause: e.target.value || null })} /></Field>
        <Field label="Kategori akar masalah"><select className="input max-w-xs" value={c.rootCauseCategory ?? ''} disabled={locked} onChange={(e) => patch({ rootCauseCategory: e.target.value || null })}>
          <option value="">—</option>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold">Diagram tulang ikan (6M)</h2>
        <Fishbone problem={c.title} causes={c.causes} />
        {!locked && <form onSubmit={addCause} className="flex flex-wrap items-end gap-2">
          <Field label="Kategori"><select name="category" className="input">{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <div className="min-w-[14rem] flex-1"><Field label="Kemungkinan penyebab"><input name="cause" className="input" required minLength={2} /></Field></div>
          <label className="flex items-center gap-1 pb-2 text-sm"><input type="checkbox" name="isRoot" /> akar</label>
          <button className="btn">Tambah</button></form>}
        <ul className="grid gap-1 text-sm sm:grid-cols-2">{c.causes.map((x: any) => (
          <li key={x.id} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1"><span>{x.isRoot ? '● ' : ''}<span className="text-slate-500">{CATS.find((k) => k[0] === x.category)?.[1]}:</span> {x.cause}</span>
            {!locked && <button className="text-xs text-red-600 underline" onClick={() => run(() => api(`/rca/cases/${id}/causes/${x.id}`, { method: 'DELETE' }))}>hapus</button>}</li>))}</ul>
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold">Tindakan korektif & preventif</h2>
        {c.actions.length === 0 && <p className="text-sm text-slate-500">Belum ada tindakan.</p>}
        <ul className="space-y-2">{c.actions.map((a: any) => (
          <li key={a.id} className="rounded border border-slate-200 p-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><span><b>{a.kind === 'corrective' ? 'Korektif' : 'Preventif'}</b> — {a.description}</span>
              <span className={a.status === 'verified' ? 'text-emerald-700' : 'text-slate-600'}>{a.status === 'verified' ? '✓ ' : ''}{AS[a.status]}</span></div>
            <div className="mt-1 text-xs text-slate-500">{a.ownerName ?? 'Tanpa PIC'}{a.dueDate ? ` · target ${new Date(a.dueDate).toLocaleDateString('id-ID')}` : ''}{a.verifiedByName ? ` · diverifikasi ${a.verifiedByName}` : ''}{a.verificationNote ? ` — ${a.verificationNote}` : ''}</div>
            {!locked && <div className="mt-2 flex gap-2">
              {a.status === 'open' && <><button className="btn-ghost" onClick={() => run(() => api(`/rca/cases/${id}/actions/${a.id}/done`, { method: 'POST', body: {} }))}>Tandai selesai</button>
                <button className="text-xs text-red-600 underline" onClick={() => run(() => api(`/rca/cases/${id}/actions/${a.id}`, { method: 'DELETE' }))}>hapus</button></>}
              {a.status === 'done' && sup && <button className="btn-ghost" onClick={() => { const n = prompt('Catatan verifikasi (opsional)') ?? ''; run(() => api(`/rca/cases/${id}/actions/${a.id}/verify`, { method: 'POST', body: { note: n } })); }}>Verifikasi</button>}
              {a.status === 'done' && !sup && <span className="text-xs text-slate-500">Menunggu verifikasi Supervisor</span>}</div>}
          </li>))}</ul>
        {!locked && <form onSubmit={addAction} className="grid gap-2 sm:grid-cols-[8rem_1fr_10rem_9rem_auto] sm:items-end">
          <Field label="Jenis"><select name="kind" className="input"><option value="corrective">Korektif</option><option value="preventive">Preventif</option></select></Field>
          <Field label="Tindakan"><input name="description" className="input" required minLength={3} /></Field>
          <Field label="PIC"><select name="ownerId" className="input"><option value="">—</option>{users.data?.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select></Field>
          <Field label="Target"><input name="dueDate" type="date" className="input" /></Field><button className="btn">Tambah</button></form>}
      </section>

      {(['check', 'act', 'closed'].includes(c.stage)) && <section className="card space-y-3">
        <Field label="Hasil verifikasi efektivitas (Check)"><textarea className="input" rows={2} defaultValue={c.verificationNotes ?? ''} disabled={locked || c.stage === 'act'} onBlur={(e) => e.target.value !== (c.verificationNotes ?? '') && patch({ verificationNotes: e.target.value || null })} /></Field>
        {['act', 'closed'].includes(c.stage) && <Field label="Standarisasi (SOP / PM / desain yang diperbarui)"><textarea className="input" rows={2} defaultValue={c.standardizationNotes ?? ''} disabled={locked} onBlur={(e) => e.target.value !== (c.standardizationNotes ?? '') && patch({ standardizationNotes: e.target.value || null })} /></Field>}
      </section>}

      {!locked && <div className="flex items-center gap-3">
        {(!needSup || sup) ? <button className="btn" onClick={() => run(() => api(`/rca/cases/${id}/stage`, { method: 'POST', body: { stage: next } }))}>Lanjut ke tahap {STAGES.find((s) => s[0] === next)?.[1]}</button>
          : <span className="text-sm text-slate-600">Tahap berikutnya dilanjutkan oleh Supervisor.</span>}
        {c.stage === 'check' && <span className="text-xs text-slate-500">Syarat: catatan verifikasi terisi & semua tindakan terverifikasi Supervisor.</span>}
      </div>}
    </div>
  );
}
