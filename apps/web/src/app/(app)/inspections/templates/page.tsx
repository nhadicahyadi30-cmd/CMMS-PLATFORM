'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import Field from '@/components/Field';
import { AUDIENCE } from '@/lib/safety';

interface Item { text: string; kind: 'check' | 'number' | 'text'; unit: string; minVal: string; maxVal: string; required: boolean; critical: boolean }
const blank = (): Item => ({ text: '', kind: 'check', unit: '', minVal: '', maxVal: '', required: true, critical: false });
const num = (s: string) => (s.trim() === '' ? null : Number(s));

export default function Templates() {
  const list = useApi<any[]>('/inspections/templates?all=1'); const plants = useApi<any[]>('/plants');
  const [edit, setEdit] = useState<string | 'new' | null>(null); const [msg, setMsg] = useState('');
  const [f, setF] = useState({ plantId: '', code: '', name: '', description: '', assetId: '', audience: 'any', frequencyDays: '', active: true }); const [items, setItems] = useState<Item[]>([blank()]);
  const assets = useApi<{ items: any[] }>(edit && f.plantId ? `/assets?plantId=${f.plantId}&size=200` : null);

  async function open(id: string | 'new') {
    setMsg('');
    if (id === 'new') { setF({ plantId: '', code: '', name: '', description: '', assetId: '', audience: 'any', frequencyDays: '', active: true }); setItems([blank()]); setEdit('new'); return; }
    const t = await api(`/inspections/templates/${id}`);
    setF({ plantId: t.plantId, code: t.code, name: t.name, description: t.description, assetId: t.assetId ?? '', audience: t.audience, frequencyDays: t.frequencyDays ? String(t.frequencyDays) : '', active: t.active });
    setItems(t.items.map((i: any) => ({ text: i.text, kind: i.kind, unit: i.unit ?? '', minVal: i.minVal == null ? '' : String(i.minVal), maxVal: i.maxVal == null ? '' : String(i.maxVal), required: i.required, critical: i.critical })));
    setEdit(id);
  }
  async function save() {
    setMsg('');
    const body = { ...f, assetId: f.assetId || null, frequencyDays: f.frequencyDays ? Number(f.frequencyDays) : null,
      items: items.filter((i) => i.text.trim()).map((i) => ({ text: i.text, kind: i.kind, unit: i.kind === 'number' && i.unit ? i.unit : null, minVal: i.kind === 'number' ? num(i.minVal) : null, maxVal: i.kind === 'number' ? num(i.maxVal) : null, required: i.required, critical: i.kind === 'check' && i.critical })) };
    try { if (edit === 'new') await api('/inspections/templates', { method: 'POST', body }); else await api(`/inspections/templates/${edit}`, { method: 'PUT', body }); setEdit(null); list.reload(); setMsg('Template tersimpan'); }
    catch (e: any) { setMsg(e.issues ? 'Periksa isian: ' + JSON.stringify(e.issues.map((i: any) => i.message)) : e.message); }
  }
  const upd = (n: number, p: Partial<Item>) => setItems((a) => a.map((x, i) => (i === n ? { ...x, ...p } : x)));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">Checklist Templates</h1>{!edit && <button className="btn" onClick={() => open('new')}>+ Template baru</button>}</div>
      {msg && <p className="text-sm text-slate-700" role="status">{msg}</p>}
      {!edit && <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Kode</th><th>Nama</th><th>Aset</th><th>Untuk</th><th>Frekuensi</th><th>Status</th><th /></tr></thead>
        <tbody>{list.data?.map((t) => (<tr key={t.id} className="border-t"><td className="p-2 font-mono">{t.code}</td><td>{t.name} <span className="text-xs text-slate-500">({t.itemCount} butir)</span></td><td>{t.assetName ?? 'Pilih saat mengisi'}</td><td>{AUDIENCE[t.audience]}</td><td>{t.frequencyDays ? `${t.frequencyDays} hari` : '—'}</td><td>{t.active ? 'Aktif' : 'Nonaktif'}</td><td className="pr-2 text-right"><button className="btn-ghost" onClick={() => open(t.id)}>Ubah</button></td></tr>))}</tbody></table></div>}
      {edit && (
        <div className="card max-w-3xl space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Plant"><select className="input" disabled={edit !== 'new'} value={f.plantId} onChange={(e) => setF({ ...f, plantId: e.target.value, assetId: '' })}><option value="">Pilih plant…</option>{plants.data?.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></Field>
            <Field label="Kode (unik)"><input className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="RND-POMPA" /></Field>
            <Field label="Nama"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Aset (kosong = dipilih saat mengisi)"><select className="input" value={f.assetId} onChange={(e) => setF({ ...f, assetId: e.target.value })}><option value="">—</option>{assets.data?.items.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
            <Field label="Boleh diisi oleh"><select className="input" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>{Object.entries(AUDIENCE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Frekuensi (hari, kosong = tanpa jadwal)"><input className="input" type="number" min="1" max="366" value={f.frequencyDays} onChange={(e) => setF({ ...f, frequencyDays: e.target.value })} /></Field>
          </div>
          <Field label="Deskripsi"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Aktif</label>
          <div className="space-y-2"><h2 className="text-sm font-semibold">Butir pemeriksaan</h2>
            {items.map((it, n) => (
              <div key={n} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-2">
                <div className="min-w-[14rem] flex-1"><input className="input" placeholder={`Butir ${n + 1}`} value={it.text} onChange={(e) => upd(n, { text: e.target.value })} /></div>
                <select className="input w-32" value={it.kind} onChange={(e) => upd(n, { kind: e.target.value as Item['kind'] })}><option value="check">Normal/Tidak</option><option value="number">Angka</option><option value="text">Teks</option></select>
                {it.kind === 'number' && <><input className="input w-20" placeholder="satuan" value={it.unit} onChange={(e) => upd(n, { unit: e.target.value })} /><input className="input w-20" type="number" step="any" placeholder="min" value={it.minVal} onChange={(e) => upd(n, { minVal: e.target.value })} /><input className="input w-20" type="number" step="any" placeholder="maks" value={it.maxVal} onChange={(e) => upd(n, { maxVal: e.target.value })} /></>}
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={it.required} onChange={(e) => upd(n, { required: e.target.checked })} />wajib</label>
                {it.kind === 'check' && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={it.critical} onChange={(e) => upd(n, { critical: e.target.checked })} />kritis (WO P2)</label>}
                <button className="btn-ghost" onClick={() => setItems((a) => a.filter((_, i) => i !== n))} disabled={items.length === 1}>Hapus</button>
              </div>))}
            <button className="btn-ghost" onClick={() => setItems((a) => [...a, blank()])}>+ Tambah butir</button></div>
          <div className="flex gap-2"><button className="btn" onClick={save}>Simpan</button><button className="btn-ghost" onClick={() => setEdit(null)}>Batal</button></div>
          <p className="text-xs text-slate-500">Butir angka di luar batas, atau butir Normal/Tidak yang dijawab Tidak normal, otomatis membuat Work Order perbaikan.</p>
        </div>)}
    </div>
  );
}
