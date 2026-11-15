'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import Field from '@/components/Field';

const CRIT: [string, string][] = [['critSafety', 'Keselamatan'], ['critProduction', 'Produksi'], ['critQuality', 'Kualitas'], ['critCost', 'Biaya perbaikan']];

export default function NewAsset() {
  const r = useRouter();
  const plants = useApi<any[]>('/plants');
  const [plantId, setPlantId] = useState('');
  const parents = useApi<{ items: any[] }>(plantId ? `/assets?plantId=${plantId}&size=200` : null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr('');
    const f = new FormData(e.currentTarget);
    const opt = (k: string) => { const v = String(f.get(k) ?? '').trim(); return v === '' ? undefined : v; };
    const body: Record<string, unknown> = { plantId, code: String(f.get('code')).trim(), name: String(f.get('name')).trim(), assetType: String(f.get('assetType')),
      parentId: opt('parentId'), manufacturer: opt('manufacturer'), model: opt('model'), serialNo: opt('serialNo'),
      yearInstalled: opt('yearInstalled') ? Number(opt('yearInstalled')) : undefined };
    for (const [k] of CRIT) body[k] = Number(f.get(k));
    try { await api('/assets', { method: 'POST', body }); r.push('/assets'); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="card max-w-2xl space-y-3">
      <h1 className="text-xl font-semibold">Tambah Aset</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plant"><select className="input" required value={plantId} onChange={(e) => setPlantId(e.target.value)}>
          <option value="">Pilih plant…</option>{plants.data?.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></Field>
        <Field label="Induk (opsional)"><select name="parentId" className="input" disabled={!plantId}>
          <option value="">— tanpa induk —</option>{parents.data?.items.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
        <Field label="Kode aset"><input name="code" className="input" required maxLength={60} placeholder="P1-LN1-MIX01" /></Field>
        <Field label="Nama"><input name="name" className="input" required maxLength={200} /></Field>
        <Field label="Tipe"><select name="assetType" className="input" defaultValue="equipment">
          <option value="area">Area</option><option value="equipment">Equipment</option><option value="component">Komponen</option></select></Field>
        <Field label="Tahun pasang"><input name="yearInstalled" type="number" min={1950} max={2100} className="input" /></Field>
        <Field label="Pabrikan"><input name="manufacturer" className="input" maxLength={100} /></Field>
        <Field label="Model"><input name="model" className="input" maxLength={100} /></Field>
        <Field label="No. seri"><input name="serialNo" className="input" maxLength={100} /></Field>
      </div>
      <fieldset className="rounded-md border p-3"><legend className="px-1 text-sm text-slate-600">Kritikalitas (1 rendah – 5 tinggi)</legend>
        <div className="grid gap-3 sm:grid-cols-4">{CRIT.map(([k, l]) => (
          <Field key={k} label={l}><select name={k} className="input" defaultValue="1">{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></Field>))}</div>
        <p className="mt-2 text-xs text-slate-500">Total ≥15 = kelas A, ≥10 = kelas B, selain itu kelas C (dihitung otomatis).</p></fieldset>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      <div className="flex gap-2"><button className="btn" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        <button type="button" className="btn-ghost" onClick={() => r.back()}>Batal</button></div>
    </form>
  );
}
