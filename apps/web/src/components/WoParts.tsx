'use client';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';

export interface WoPart { partId: string; code: string; name: string; unit: string; qty: string; cost: string }

export default function WoParts({ woId, plantId, items, canEdit, onChange }: { woId: string; plantId: string; items: WoPart[]; canEdit: boolean; onChange: () => void }) {
  const [q, setQ] = useState('');
  const found = useApi<any[]>(canEdit ? `/parts-lookup?plantId=${plantId}${q ? `&q=${encodeURIComponent(q)}` : ''}` : null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const total = items.reduce((s, i) => s + Number(i.cost), 0);
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); setErr('');
    try { await api(`/work-orders/${woId}/parts`, { method: 'POST', body: { partId: String(f.get('partId')), qty: Number(f.get('qty')) } }); onChange(); found.reload(); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }
  async function giveBack(i: WoPart) {
    const v = prompt(`Jumlah ${i.code} yang diretur (maks. ${Number(i.qty)})?`); const n = Number((v ?? '').replace(',', '.')); if (!n) return;
    try { await api(`/work-orders/${woId}/parts/return`, { method: 'POST', body: { partId: i.partId, qty: n } }); onChange(); } catch (x: any) { setErr(x.message); }
  }
  return (
    <section className="card"><h2 className="mb-2 text-sm font-semibold">Suku cadang terpakai</h2>
      {items.length ? <table className="mb-2 w-full text-sm"><tbody>{items.map((i) => (
        <tr key={i.partId} className="border-t"><td className="py-1 font-mono">{i.code}</td><td>{i.name}</td><td className="text-right">{Number(i.qty)} {i.unit}</td><td className="text-right">Rp {Math.round(Number(i.cost)).toLocaleString('id-ID')}</td>
          <td className="text-right">{canEdit && <button className="text-xs underline" onClick={() => giveBack(i)}>Retur</button>}</td></tr>))}
        <tr className="border-t font-medium"><td colSpan={3} className="py-1">Total biaya suku cadang</td><td className="text-right">Rp {Math.round(total).toLocaleString('id-ID')}</td><td /></tr></tbody></table>
        : <p className="mb-2 text-sm text-slate-500">Belum ada suku cadang dicatat.</p>}
      {canEdit && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <input className="input w-40" placeholder="Cari suku cadang…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select name="partId" className="input w-64" required><option value="">Pilih…</option>{found.data?.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name} (stok {Number(p.onHand)})</option>)}</select>
          <input name="qty" type="number" min="0.01" step="any" className="input w-24" placeholder="Jumlah" required />
          <button className="btn" disabled={busy}>Pakai</button></form>)}
      {err && <p role="alert" className="mt-2 text-sm text-red-600">{err}</p>}
    </section>
  );
}
