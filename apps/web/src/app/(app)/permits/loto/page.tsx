'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import Field from '@/components/Field';
import { ENERGY } from '@/lib/safety';

export default function LotoMaster() {
  const plants = useApi<any[]>('/plants'); const [plantId, setPlantId] = useState(''); const [assetId, setAssetId] = useState('');
  const assets = useApi<{ items: any[] }>(plantId ? `/assets?plantId=${plantId}&size=200` : null);
  const list = useApi<any[]>(plantId ? `/loto-points?plantId=${plantId}${assetId ? `&assetId=${assetId}` : ''}` : null);
  const [msg, setMsg] = useState(''); const [f, setF] = useState({ description: '', energyType: 'electrical', method: '' });
  async function add() {
    setMsg('');
    const seq = Math.max(0, ...(list.data?.filter((x) => x.assetId === assetId).map((x) => x.seq) ?? [])) + 1;
    try { await api('/loto-points', { method: 'POST', body: { plantId, assetId, seq, ...f } }); setF({ description: '', energyType: 'electrical', method: '' }); list.reload(); } catch (e: any) { setMsg(e.issues ? e.issues.map((i: any) => i.message).join('; ') : e.message); }
  }
  async function toggle(x: any) { try { await api(`/loto-points/${x.id}`, { method: 'PUT', body: { plantId: x.plantId, assetId: x.assetId, seq: x.seq, description: x.description, energyType: x.energyType, method: x.method, active: !x.active } }); list.reload(); } catch (e: any) { setMsg(e.message); } }
  async function del(x: any) { if (!confirm(`Hapus titik "${x.description}"?`)) return; try { await api(`/loto-points/${x.id}`, { method: 'DELETE' }); list.reload(); } catch (e: any) { setMsg(e.message); } }
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Titik Isolasi (LOTO) per Aset</h1>
      <p className="text-sm text-slate-600">Daftar titik isolasi energi (breaker, valve, dll.) yang dipakai ulang saat mengajukan izin kerja. Isi berdasarkan prosedur LOTO resmi perusahaan dan diverifikasi oleh orang yang berwenang.</p>
      <div className="grid max-w-xl gap-3 sm:grid-cols-2">
        <Field label="Plant"><select className="input" value={plantId} onChange={(e) => { setPlantId(e.target.value); setAssetId(''); }}><option value="">Pilih plant…</option>{plants.data?.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></Field>
        <Field label="Aset"><select className="input" disabled={!plantId} value={assetId} onChange={(e) => setAssetId(e.target.value)}><option value="">Semua aset</option>{assets.data?.items.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
      </div>
      {msg && <p className="text-sm text-red-600" role="alert">{msg}</p>}
      {assetId && <div className="card max-w-3xl space-y-2"><div className="text-sm font-medium">Tambah titik isolasi</div>
        <div className="flex flex-wrap gap-2"><input className="input min-w-[14rem] flex-1" placeholder="Mis. Breaker Q1 panel MCC-2" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <select className="input w-36" value={f.energyType} onChange={(e) => setF({ ...f, energyType: e.target.value })}>{Object.entries(ENERGY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input className="input min-w-[10rem] flex-1" placeholder="Cara isolasi (mis. OFF + kunci)" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} />
          <button className="btn" disabled={f.description.trim().length < 2} onClick={add}>Tambah</button></div></div>}
      {plantId && <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Aset</th><th>#</th><th>Titik isolasi</th><th>Energi</th><th>Cara</th><th>Status</th><th /></tr></thead>
        <tbody>{list.data?.map((x) => (<tr key={x.id} className="border-t"><td className="p-2">{x.assetName}</td><td>{x.seq}</td><td>{x.description}</td><td>{ENERGY[x.energyType]}</td><td>{x.method}</td><td>{x.active ? 'Aktif' : 'Nonaktif'}</td>
          <td className="space-x-2 pr-2 text-right"><button className="btn-ghost" onClick={() => toggle(x)}>{x.active ? 'Nonaktifkan' : 'Aktifkan'}</button><button className="btn-ghost" onClick={() => del(x)}>Hapus</button></td></tr>))}
          {!list.loading && !list.data?.length && <tr><td colSpan={7} className="p-4 text-center text-slate-500">Belum ada titik isolasi</td></tr>}</tbody></table></div>}
    </div>
  );
}
