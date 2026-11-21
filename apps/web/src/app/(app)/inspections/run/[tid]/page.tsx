'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { submitInspection } from '@/lib/offline';
import { isAbnormal, uuid } from '@/lib/safety';

export default function RunChecklist() {
  const { tid } = useParams<{ tid: string }>(); const r = useRouter();
  const tpl = useApi<any>(`/inspections/templates/${tid}`);
  const assets = useApi<{ items: any[] }>(tpl.data && !tpl.data.assetId ? `/assets?plantId=${tpl.data.plantId}&size=200` : null);
  const [assetId, setAssetId] = useState(''); const [vals, setVals] = useState<Record<string, { ok?: boolean; value?: number; text?: string; note?: string }>>({});
  const [notes, setNotes] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState<any>(null); const [clientUid] = useState(() => uuid()); const [startedAt] = useState(() => new Date().toISOString());
  const set = (id: string, v: object) => setVals((o) => ({ ...o, [id]: { ...o[id], ...v } }));
  if (tpl.error) return <p className="text-red-600">{tpl.error}</p>;
  if (!tpl.data) return <p className="text-sm text-slate-500">Memuat…</p>;
  const t = tpl.data; const ab = t.items.filter((i: any) => isAbnormal(i, vals[i.id] ?? {})).length;

  async function save() {
    setErr('');
    const aid = t.assetId ?? assetId; if (!aid) return setErr('Pilih aset yang diperiksa');
    const miss = t.items.find((i: any) => i.required && ((i.kind === 'check' && vals[i.id]?.ok === undefined) || (i.kind === 'number' && vals[i.id]?.value === undefined) || (i.kind === 'text' && !vals[i.id]?.text?.trim())));
    if (miss) return setErr(`Butir wajib belum diisi: ${miss.text}`);
    setBusy(true);
    try {
      const out = await submitInspection({ templateId: t.id, assetId: aid, performedAt: startedAt, notes, clientUid, results: t.items.filter((i: any) => vals[i.id]).map((i: any) => ({ itemId: i.id, ...vals[i.id] })) }, t.name);
      if (out.queued) setDone({ queued: true }); else r.push(`/inspections/${out.result.id}`);
    } catch (e: any) { setErr(e instanceof ApiError ? e.message : 'Gagal mengirim'); } finally { setBusy(false); }
  }
  if (done?.queued) return <div className="card max-w-xl space-y-2"><h1 className="text-lg font-semibold">Disimpan di perangkat</h1><p className="text-sm text-slate-600">Tidak ada koneksi ke server. Checklist tersimpan dan akan terkirim otomatis dari <Link className="underline" href="/field">Mode Lapangan</Link> saat sinyal kembali.</p><Link className="btn" href="/field">Buka Mode Lapangan</Link></div>;
  return (
    <div className="card max-w-2xl space-y-3">
      <div><h1 className="text-xl font-semibold">{t.name}</h1>{t.description && <p className="text-sm text-slate-600">{t.description}</p>}</div>
      {!t.assetId && <label className="block text-sm"><span className="mb-1 block text-slate-600">Aset yang diperiksa</span><select className="input" value={assetId} onChange={(e) => setAssetId(e.target.value)}><option value="">Pilih aset…</option>{assets.data?.items.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>}
      {t.items.map((i: any) => { const v = vals[i.id] ?? {}; const bad = isAbnormal(i, v);
        return (<div key={i.id} className={`rounded-lg border p-3 ${bad ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}>
          <div className="text-sm font-medium">{i.seq}. {i.text}{i.critical && <span className="ml-2 rounded bg-red-100 px-1.5 text-xs text-red-800">kritis</span>}{!i.required && <span className="ml-2 text-xs text-slate-400">opsional</span>}</div>
          {i.kind === 'check' && <div className="mt-2 flex gap-2">{[[true, 'Normal'], [false, 'Tidak normal']].map(([val, l]) => (<button key={String(val)} type="button" onClick={() => set(i.id, { ok: val as boolean })} className={v.ok === val ? (val ? 'btn' : 'rounded-lg bg-red-600 px-3.5 py-1.5 text-sm font-medium text-white') : 'btn-ghost'}>{l as string}</button>))}</div>}
          {i.kind === 'number' && <div className="mt-2 flex items-center gap-2"><input className="input max-w-[10rem]" type="number" step="any" value={v.value ?? ''} onChange={(e) => set(i.id, { value: e.target.value === '' ? undefined : Number(e.target.value) })} /><span className="text-sm text-slate-500">{i.unit ?? ''}{i.minVal != null || i.maxVal != null ? ` (batas ${i.minVal ?? '−'} s/d ${i.maxVal ?? '−'})` : ''}</span></div>}
          {i.kind === 'text' && <input className="input mt-2" value={v.text ?? ''} onChange={(e) => set(i.id, { text: e.target.value })} />}
          {bad && <input className="input mt-2" placeholder="Catatan temuan (opsional)" value={v.note ?? ''} onChange={(e) => set(i.id, { note: e.target.value })} />}
        </div>); })}
      <label className="block text-sm"><span className="mb-1 block text-slate-600">Catatan umum</span><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      {ab > 0 && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">{ab} temuan tidak normal. Work Order perbaikan akan dibuat otomatis dan menunggu persetujuan Supervisor.</p>}
      {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
      <button className="btn" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan checklist'}</button>
    </div>
  );
}
