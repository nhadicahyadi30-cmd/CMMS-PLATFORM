'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getUser } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import Field from '@/components/Field';
import PermitBadge from '@/components/PermitBadge';
import { ENERGY, fmt, localInput, WORK_TYPE } from '@/lib/safety';

const FILTERS = [['', 'Semua'], ['requested', 'Menunggu persetujuan'], ['approved,handed_over', 'Siap / LOTO'], ['active', 'Aktif'], ['completed', 'Tunggu terima area'], ['closed,rejected,cancelled', 'Selesai']];

export default function Permits() {
  const [st, setSt] = useState(''); const [form, setForm] = useState(false); const user = getUser()!;
  const canRequest = user.role !== 'production'; const canManage = ['admin', 'supervisor', 'planner'].includes(user.role);
  const list = useApi<{ total: number; items: any[] }>(`/permits?size=100${st ? `&status=${st}` : ''}`);
  const waiting = list.data?.items.filter((p) => p.actions.some((a: string) => ['approve', 'handover', 'close'].includes(a))).length ?? 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-semibold">Permit to Work (PTW) & LOTO</h1>
        <div className="flex gap-2">{canManage && <Link href="/permits/loto" className="btn-ghost">Titik isolasi (LOTO)</Link>}{canRequest && <button className="btn" onClick={() => setForm(!form)}>{form ? 'Tutup' : '+ Ajukan izin'}</button>}</div></div>
      {waiting > 0 && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">{waiting} izin menunggu tindakan Anda.</p>}
      {form && <NewPermit onDone={() => { setForm(false); list.reload(); }} />}
      <div className="flex flex-wrap gap-2">{FILTERS.map(([v, l]) => <button key={v} onClick={() => setSt(v)} className={st === v ? 'btn' : 'btn-ghost'}>{l}</button>)}</div>
      {list.error && <p className="text-sm text-red-600">{list.error}</p>}
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">No. izin</th><th>Pekerjaan</th><th>Aset</th><th>Jenis</th><th>Berlaku</th><th>Status</th></tr></thead>
        <tbody>{list.data?.items.map((p) => (<tr key={p.id} className="border-t hover:bg-slate-50"><td className="p-2 font-mono"><Link className="text-blue-700 underline" href={`/permits/${p.id}`}>{p.code}</Link></td><td>{p.title}<div className="text-xs text-slate-500">{p.requestedBy}</div></td><td>{p.assetName}</td><td>{WORK_TYPE[p.workType]}</td>
          <td className="whitespace-nowrap text-xs">{fmt(p.validFrom)}<br />s/d {fmt(p.validUntil)}{p.expired && <span className="ml-1 rounded bg-red-100 px-1.5 text-red-800">lewat waktu</span>}</td><td><PermitBadge s={p.status} />{p.actions.some((a: string) => ['approve', 'handover', 'close'].includes(a)) && <span className="ml-1 text-xs text-amber-700">● perlu tindakan</span>}</td></tr>))}
          {!list.loading && !list.data?.items.length && <tr><td colSpan={6} className="p-4 text-center text-slate-500">Belum ada izin kerja</td></tr>}</tbody></table></div>
    </div>
  );
}

function NewPermit({ onDone }: { onDone: () => void }) {
  const r = useRouter(); const plants = useApi<any[]>('/plants'); const [plantId, setPlantId] = useState(''); const [assetId, setAssetId] = useState('');
  const assets = useApi<{ items: any[] }>(plantId ? `/assets?plantId=${plantId}&size=200` : null); const loto = useApi<any[]>(assetId ? `/loto-points?assetId=${assetId}` : null);
  const [pick, setPick] = useState<string[]>([]); const [extra, setExtra] = useState<{ description: string; energyType: string }[]>([]); const [needLoto, setNeedLoto] = useState(true);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const wos = useApi<{ items: any[] }>(assetId ? `/work-orders?assetId=${assetId}&status=approved,assigned,progress&size=50` : null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr(''); const f = new FormData(e.currentTarget);
    try {
      const p = await api('/permits', { method: 'POST', body: { plantId, assetId, woId: f.get('woId') ? String(f.get('woId')) : null, workType: String(f.get('workType')), title: String(f.get('title')), hazards: String(f.get('hazards') ?? ''), precautions: String(f.get('precautions') ?? ''),
        requiresLoto: needLoto, team: String(f.get('team') ?? ''), validFrom: new Date(String(f.get('validFrom'))).toISOString(), validUntil: new Date(String(f.get('validUntil'))).toISOString(),
        lotoPointIds: needLoto ? pick : [], extraPoints: needLoto ? extra.filter((x) => x.description.trim()) : [] } });
      onDone(); r.push(`/permits/${p.id}`);
    } catch (x: any) { setErr(x.issues ? x.issues.map((i: any) => i.message).join('; ') : x.message); } finally { setBusy(false); }
  }
  const now = new Date();
  return (
    <form onSubmit={submit} className="card max-w-3xl space-y-3">
      <h2 className="font-semibold">Ajukan izin kerja</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plant"><select className="input" required value={plantId} onChange={(e) => { setPlantId(e.target.value); setAssetId(''); }}><option value="">Pilih plant…</option>{plants.data?.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></Field>
        <Field label="Aset"><select className="input" required disabled={!plantId} value={assetId} onChange={(e) => { setAssetId(e.target.value); setPick([]); }}><option value="">Pilih aset…</option>{assets.data?.items.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
        <Field label="Jenis pekerjaan"><select name="workType" className="input">{Object.entries(WORK_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Work Order terkait (opsional)"><select name="woId" className="input"><option value="">—</option>{wos.data?.items.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.title}</option>)}</select></Field>
        <Field label="Mulai"><input name="validFrom" type="datetime-local" required className="input" defaultValue={localInput(now)} /></Field>
        <Field label="Selesai (maks. 24 jam)"><input name="validUntil" type="datetime-local" required className="input" defaultValue={localInput(new Date(now.getTime() + 4 * 3600e3))} /></Field>
      </div>
      <Field label="Uraian pekerjaan"><input name="title" required minLength={3} className="input" placeholder="Ganti motor pompa P-101" /></Field>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Bahaya yang ada"><textarea name="hazards" rows={2} className="input" placeholder="Tegangan 380 V, beban berputar…" /></Field><Field label="Pengendalian / APD"><textarea name="precautions" rows={2} className="input" placeholder="Sarung tangan isolasi, kacamata, rambu…" /></Field></div>
      <Field label="Tim pelaksana"><input name="team" className="input" placeholder="Nama-nama yang ikut bekerja" /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={needLoto} onChange={(e) => setNeedLoto(e.target.checked)} />Pekerjaan ini memerlukan LOTO (isolasi energi)</label>
      {needLoto && <div className="space-y-2 rounded-lg border border-slate-200 p-3">
        <div className="text-sm font-medium">Titik isolasi</div>
        {assetId && !loto.data?.length && <p className="text-xs text-slate-500">Belum ada titik isolasi tersimpan untuk aset ini. Tambahkan di bawah, atau minta Supervisor mengisi di "Titik isolasi (LOTO)".</p>}
        {loto.data?.filter((l) => l.active).map((l) => <label key={l.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pick.includes(l.id)} onChange={() => setPick((p) => (p.includes(l.id) ? p.filter((x) => x !== l.id) : [...p, l.id]))} />{l.seq}. {l.description} <span className="text-xs text-slate-500">({ENERGY[l.energyType]})</span></label>)}
        {extra.map((x, n) => <div key={n} className="flex gap-2"><input className="input" placeholder="Titik isolasi tambahan" value={x.description} onChange={(e) => setExtra((a) => a.map((y, i) => (i === n ? { ...y, description: e.target.value } : y)))} /><select className="input w-36" value={x.energyType} onChange={(e) => setExtra((a) => a.map((y, i) => (i === n ? { ...y, energyType: e.target.value } : y)))}>{Object.entries(ENERGY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><button type="button" className="btn-ghost" onClick={() => setExtra((a) => a.filter((_, i) => i !== n))}>×</button></div>)}
        <button type="button" className="btn-ghost" onClick={() => setExtra((a) => [...a, { description: '', energyType: 'electrical' }])}>+ Titik tambahan</button></div>}
      {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
      <button className="btn" disabled={busy || !plantId || !assetId}>{busy ? 'Mengajukan…' : 'Ajukan izin'}</button>
    </form>
  );
}
