'use client';
import { FormEvent, useState } from 'react';
import { api, getUser } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import Field from '@/components/Field';

type Tab = 'stock' | 'reorder' | 'pr';
const rp = (n: number | string) => 'Rp ' + Math.round(Number(n)).toLocaleString('id-ID');
const PR_LABEL: Record<string, string> = { draft: 'Draft', submitted: 'Menunggu approval', approved: 'Disetujui', rejected: 'Ditolak', ordered: 'Dipesan', received: 'Diterima' };

function useAct(reload: () => void) {
  const [msg, setMsg] = useState('');
  const run = async (fn: () => Promise<unknown>, ok = 'Tersimpan') => { setMsg(''); try { await fn(); setMsg(ok); reload(); return true; } catch (e: any) { setMsg(e.message); return false; } };
  return { msg, run };
}

function Summary() {
  const { data } = useApi<any>('/inventory/summary');
  if (!data) return null;
  const K = ({ l, v, warn }: { l: string; v: string | number; warn?: boolean }) => <div className="card"><div className="text-xs text-slate-500">{l}</div><div className={`text-lg font-semibold ${warn ? 'text-red-600' : ''}`}>{v}</div></div>;
  return <div className="grid gap-3 sm:grid-cols-4"><K l="Jenis suku cadang" v={data.parts} /><K l="Di bawah minimum" v={data.low} warn={data.low > 0} /><K l="Kritis di bawah minimum" v={data.criticalLow} warn={data.criticalLow > 0} /><K l="Nilai stok" v={rp(data.stockValue)} /></div>;
}

function Stock() {
  const [q, setQ] = useState(''); const [low, setLow] = useState(false);
  const parts = useApi<{ total: number; items: any[] }>(`/inventory/parts?size=100${q ? `&q=${encodeURIComponent(q)}` : ''}${low ? '&low=true' : ''}`);
  const plants = useApi<any[]>('/plants');
  const { msg, run } = useAct(parts.reload);
  const [open, setOpen] = useState(false); const [detail, setDetail] = useState<string | null>(null);
  const hist = useApi<any>(detail ? `/inventory/parts/${detail}` : null);
  const role = getUser()?.role; const canWrite = ['admin', 'supervisor', 'planner'].includes(role ?? ''); const canAdjust = ['admin', 'supervisor'].includes(role ?? '');

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    if (await run(() => api('/inventory/parts', { method: 'POST', body: { plantId: String(f.get('plantId')), code: String(f.get('code')), name: String(f.get('name')), category: String(f.get('category') || 'umum'), unit: String(f.get('unit') || 'pcs'),
      location: String(f.get('location') || '') || null, minStock: Number(f.get('minStock') || 0), reorderQty: Number(f.get('reorderQty') || 1), unitCost: Number(f.get('unitCost') || 0), critical: f.get('critical') === 'on' } }), 'Suku cadang ditambahkan')) { form.reset(); setOpen(false); }
  }
  const mutate = (p: any, kind: 'in' | 'adjust') => {
    const label = kind === 'in' ? `Jumlah diterima untuk ${p.code}?` : `Selisih stok ${p.code} (negatif untuk mengurangi)?`;
    const v = prompt(label); if (v === null) return; const qty = Number(v.replace(',', '.')); if (!Number.isFinite(qty) || qty === 0) return;
    const note = kind === 'adjust' ? prompt('Alasan penyesuaian (wajib)') : prompt('Catatan (opsional)') ?? undefined;
    if (kind === 'adjust' && !note) return;
    run(() => api('/inventory/stock', { method: 'POST', body: { partId: p.id, kind, qty, note: note || undefined } }), 'Stok diperbarui');
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Cari kode / nama…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} />Hanya di bawah minimum</label>
        {canWrite && <button className="btn ml-auto" onClick={() => setOpen(!open)}>{open ? 'Tutup' : '+ Suku cadang'}</button>}
      </div>
      {msg && <p role="status" className="text-sm text-slate-700">{msg}</p>}
      {open && (
        <form onSubmit={create} className="card grid gap-3 sm:grid-cols-4">
          <Field label="Plant"><select name="plantId" className="input" required><option value="">Pilih…</option>{plants.data?.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select></Field>
          <Field label="Kode"><input name="code" className="input" required maxLength={60} /></Field>
          <Field label="Nama"><input name="name" className="input sm:col-span-2" required /></Field>
          <Field label="Kategori"><input name="category" className="input" placeholder="umum" /></Field>
          <Field label="Satuan"><input name="unit" className="input" placeholder="pcs" /></Field>
          <Field label="Lokasi rak"><input name="location" className="input" /></Field>
          <Field label="Harga satuan (Rp)"><input name="unitCost" type="number" min="0" className="input" /></Field>
          <Field label="Stok minimum"><input name="minStock" type="number" min="0" step="any" className="input" /></Field>
          <Field label="Jumlah pesan ulang"><input name="reorderQty" type="number" min="0.01" step="any" defaultValue={1} className="input" /></Field>
          <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" name="critical" />Suku cadang kritis</label>
          <div className="sm:col-span-4 text-xs text-slate-500">Stok awal dimasukkan lewat tombol "Terima" setelah suku cadang dibuat (agar tercatat di riwayat).</div>
          <div className="sm:col-span-4"><button className="btn">Simpan</button></div>
        </form>)}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Kode</th><th>Nama</th><th className="text-right">Stok</th><th className="text-right">Min</th><th className="text-right">Harga</th><th>Rak</th><th /></tr></thead>
          <tbody>{parts.data?.items.map((p) => (
            <tr key={p.id} className="border-t"><td className="p-2 font-mono">{p.code}{p.critical && <span title="Kritis" className="ml-1 text-red-600">●</span>}</td><td>{p.name}</td>
              <td className={`text-right font-medium ${p.low ? 'text-red-600' : ''}`}>{Number(p.onHand)} {p.unit}</td><td className="text-right">{Number(p.minStock)}</td><td className="text-right">{rp(p.unitCost)}</td><td>{p.location ?? '—'}</td>
              <td className="space-x-2 whitespace-nowrap p-2 text-right">
                <button className="underline" onClick={() => setDetail(detail === p.id ? null : p.id)}>Riwayat</button>
                {canWrite && <button className="underline" onClick={() => mutate(p, 'in')}>Terima</button>}
                {canAdjust && <button className="underline" onClick={() => mutate(p, 'adjust')}>Sesuaikan</button>}</td></tr>))}
            {!parts.loading && !parts.data?.items.length && <tr><td colSpan={7} className="p-4 text-center text-slate-500">Belum ada suku cadang</td></tr>}</tbody></table>
      </div>
      {detail && hist.data && (
        <div className="card"><h3 className="mb-2 font-semibold">Riwayat {hist.data.code} — {hist.data.name}</h3>
          <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th>Waktu</th><th>Jenis</th><th className="text-right">Jumlah</th><th>WO</th><th>Oleh</th><th>Catatan</th></tr></thead>
            <tbody>{hist.data.history.map((h: any) => (<tr key={h.id} className="border-t"><td>{new Date(h.at).toLocaleString('id-ID')}</td><td>{({ in: 'Masuk', out: 'Keluar', return: 'Retur', adjust: 'Penyesuaian' } as any)[h.kind]}</td>
              <td className={`text-right ${Number(h.delta) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{Number(h.delta) > 0 ? '+' : ''}{Number(h.delta)}</td><td>{h.woCode ?? '—'}</td><td>{h.by ?? '—'}</td><td>{h.note ?? ''}</td></tr>))}</tbody></table></div>)}
    </div>
  );
}

function Reorder() {
  const list = useApi<any[]>('/inventory/reorder'); const { msg, run } = useAct(list.reload);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const canWrite = ['admin', 'supervisor', 'planner'].includes(getUser()?.role ?? '');
  async function makePr(plantId: string) {
    const items = (list.data ?? []).filter((p) => p.plantId === plantId && sel[p.id]).map((p) => ({ partId: p.id, qty: Number(p.suggestQty) }));
    if (!items.length) return;
    await run(async () => { const pr = await api('/inventory/prs', { method: 'POST', body: { plantId, notes: 'Dibuat dari saran pemesanan ulang', items } }); await api(`/inventory/prs/${pr.id}/submit`, { method: 'POST', body: {} }); }, 'PR dibuat dan diajukan ke Supervisor');
    setSel({});
  }
  const plantIds = Array.from(new Set((list.data ?? []).map((p) => p.plantId)));
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Suku cadang yang stoknya (ditambah pesanan berjalan) sudah di bawah minimum. Centang lalu buat PR per plant.</p>
      {msg && <p role="status" className="text-sm text-slate-700">{msg}</p>}
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2" /><th>Kode</th><th>Nama</th><th className="text-right">Stok</th><th className="text-right">Min</th><th className="text-right">Dipesan</th><th className="text-right">Saran</th></tr></thead>
        <tbody>{list.data?.map((p) => (<tr key={p.id} className="border-t"><td className="p-2"><input type="checkbox" disabled={!canWrite} checked={!!sel[p.id]} onChange={(e) => setSel({ ...sel, [p.id]: e.target.checked })} /></td>
          <td className="font-mono">{p.code}{p.critical && <span className="ml-1 text-red-600">●</span>}</td><td>{p.name}</td><td className="text-right text-red-600">{Number(p.onHand)}</td><td className="text-right">{Number(p.minStock)}</td><td className="text-right">{Number(p.onOrder)}</td><td className="text-right font-medium">{Number(p.suggestQty)} {p.unit}</td></tr>))}
          {!list.loading && !list.data?.length && <tr><td colSpan={7} className="p-4 text-center text-slate-500">Semua stok di atas minimum 👍</td></tr>}</tbody></table></div>
      {canWrite && plantIds.map((pid) => <button key={pid} className="btn mr-2" onClick={() => makePr(pid)}>Buat PR dari yang dicentang (plant {pid.slice(0, 4)}…)</button>)}
    </div>
  );
}

function Prs() {
  const list = useApi<any[]>('/inventory/prs'); const { msg, run } = useAct(list.reload);
  const [open, setOpen] = useState<string | null>(null); const detail = useApi<any>(open ? `/inventory/prs/${open}` : null);
  const role = getUser()?.role; const sup = role === 'admin' || role === 'supervisor'; const planner = sup || role === 'planner';
  const act = (id: string, a: string, body: unknown = {}, ok = 'Diperbarui') => run(async () => { await api(`/inventory/prs/${id}/${a}`, { method: 'POST', body }); detail.reload(); }, ok);
  return (
    <div className="space-y-3">
      {msg && <p role="status" className="text-sm text-slate-700">{msg}</p>}
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">No. PR</th><th>Status</th><th>Item</th><th>Pemohon</th><th>Dibuat</th></tr></thead>
        <tbody>{list.data?.map((r) => (<tr key={r.id} className="cursor-pointer border-t hover:bg-slate-50" onClick={() => setOpen(open === r.id ? null : r.id)}><td className="p-2 font-mono">{r.code}</td><td>{PR_LABEL[r.status]}</td><td>{r.items}</td><td>{r.requestedBy ?? '—'}</td><td>{new Date(r.createdAt).toLocaleDateString('id-ID')}</td></tr>))}
          {!list.loading && !list.data?.length && <tr><td colSpan={5} className="p-4 text-center text-slate-500">Belum ada PR</td></tr>}</tbody></table></div>
      {open && detail.data && (
        <div className="card space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">{detail.data.code} — {PR_LABEL[detail.data.status]}</h3>
          <div className="flex flex-wrap gap-2">
            {detail.data.status === 'draft' && planner && <button className="btn" onClick={() => act(open, 'submit', {}, 'PR diajukan')}>Ajukan</button>}
            {detail.data.status === 'submitted' && sup && <><button className="btn" onClick={() => act(open, 'approve', {}, 'PR disetujui')}>Setujui</button>
              <button className="btn-ghost" onClick={() => { const r = prompt('Alasan penolakan?'); if (r) act(open, 'reject', { reason: r }, 'PR ditolak'); }}>Tolak</button></>}
            {detail.data.status === 'approved' && planner && <button className="btn" onClick={() => act(open, 'order', {}, 'PR ditandai dipesan')}>Tandai dipesan</button>}
            {detail.data.status === 'ordered' && planner && <button className="btn" onClick={() => act(open, 'receive', {}, 'Barang diterima, stok bertambah')}>Terima barang</button>}</div></div>
          {detail.data.rejectReason && <p className="text-sm text-red-600">Ditolak: {detail.data.rejectReason}</p>}
          <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th>Kode</th><th>Nama</th><th className="text-right">Jumlah</th><th className="text-right">Diterima</th><th className="text-right">Estimasi</th></tr></thead>
            <tbody>{detail.data.items.map((i: any) => (<tr key={i.id} className="border-t"><td className="font-mono">{i.code}</td><td>{i.name}</td><td className="text-right">{Number(i.qty)} {i.unit}</td><td className="text-right">{Number(i.qtyReceived)}</td><td className="text-right">{rp(Number(i.qty) * Number(i.unitCost))}</td></tr>))}</tbody></table></div>)}
    </div>
  );
}

export default function Inventory() {
  const [tab, setTab] = useState<Tab>('stock');
  const T: [Tab, string][] = [['stock', 'Stok'], ['reorder', 'Saran pesan ulang'], ['pr', 'Purchase Request']];
  return (
    <div className="space-y-4"><h1 className="text-xl font-semibold">Sparepart & Inventory</h1><Summary />
      <div className="flex gap-2">{T.map(([k, l]) => <button key={k} className={tab === k ? 'btn' : 'btn-ghost'} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'stock' ? <Stock /> : tab === 'reorder' ? <Reorder /> : <Prs />}</div>
  );
}
