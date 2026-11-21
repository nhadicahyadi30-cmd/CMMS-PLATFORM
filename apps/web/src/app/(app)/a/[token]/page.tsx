'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';

interface Asset { id: string; plantId: string; code: string; name: string; assetType: string; manufacturer: string | null; model: string | null; status: string; criticalityClass: string | null;
  workOrders: { id: string; code: string; title: string; priority: string; status: string; createdAt: string; woType: string }[] }
const OPEN = ['waiting', 'approved', 'assigned', 'progress', 'done'];
const ST: Record<string, string> = { waiting: 'Menunggu approval', approved: 'Disetujui', assigned: 'Ditugaskan', progress: 'Dikerjakan', done: 'Selesai (belum ditutup)', closed: 'Ditutup', rejected: 'Ditolak' };

/** Halaman tujuan QR di mesin: ringkasan aset, WO terbuka, riwayat, dan formulir lapor kerusakan (ramah HP). */
export default function AssetByQr() {
  const { token } = useParams<{ token: string }>(); const r = useRouter();
  const { data: a, error, loading } = useApi<Asset>(`/assets/by-qr/${token}`);
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!a) return; setBusy(true); setErr(''); const f = new FormData(e.currentTarget);
    try {
      const wo = await api('/work-orders', { method: 'POST', body: { plantId: a.plantId, assetId: a.id, woType: String(f.get('woType')), priority: String(f.get('priority')), title: String(f.get('title')), description: String(f.get('description') ?? ''), estHours: 2 } });
      r.push(`/work-orders/${wo.id}`);
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }

  if (loading) return <p className="text-sm text-slate-500">Memuat aset…</p>;
  if (error || !a) return <div className="card max-w-md space-y-2"><h1 className="text-lg font-semibold">Aset tidak ditemukan</h1><p className="text-sm text-slate-600">{error || 'Kode QR tidak dikenali.'}</p><Link href="/scan" className="btn inline-flex">Pindai lagi</Link></div>;
  const open = a.workOrders.filter((w) => OPEN.includes(w.status)); const hist = a.workOrders.filter((w) => !OPEN.includes(w.status)).slice(0, 5);
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="card space-y-1">
        <div className="font-mono text-sm text-slate-500">{a.code}</div><h1 className="text-xl font-semibold">{a.name}</h1>
        <p className="text-sm text-slate-600">{a.assetType}{a.manufacturer ? ` · ${a.manufacturer}` : ''}{a.model ? ` ${a.model}` : ''} · status {a.status}{a.criticalityClass ? ` · kritikalitas ${a.criticalityClass}` : ''}</p>
        <div className="flex flex-wrap gap-2 pt-2"><button className="btn" onClick={() => setShow(!show)}>{show ? 'Tutup formulir' : 'Lapor kerusakan / masalah'}</button><Link href={`/assets`} className="btn-ghost">Daftar aset</Link></div>
      </div>
      {show && (
        <form onSubmit={submit} className="card space-y-3">
          <h2 className="font-medium">Lapor untuk {a.code}</h2>
          <label className="block text-sm"><span className="mb-1 block text-slate-600">Apa masalahnya?</span><input name="title" required minLength={3} maxLength={200} className="input" placeholder="Mis. Motor panas dan bunyi kasar" /></label>
          <label className="block text-sm"><span className="mb-1 block text-slate-600">Keterangan (opsional)</span><textarea name="description" rows={3} className="input" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm"><span className="mb-1 block text-slate-600">Jenis</span><select name="woType" className="input" defaultValue="breakdown"><option value="breakdown">Mesin rusak/berhenti</option><option value="corrective">Perbaikan</option><option value="emergency">Darurat</option></select></label>
            <label className="block text-sm"><span className="mb-1 block text-slate-600">Prioritas</span><select name="priority" className="input" defaultValue="P3"><option value="P1">P1 · Kritis</option><option value="P2">P2 · Tinggi</option><option value="P3">P3 · Sedang</option><option value="P4">P4 · Rendah</option></select></label>
          </div>
          {err && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{err}</p>}
          <button className="btn w-full" disabled={busy}>{busy ? 'Mengirim…' : 'Kirim laporan'}</button>
          <p className="text-xs text-slate-500">Laporan menjadi Work Order dan menunggu approval Supervisor. Foto bisa ditambahkan di halaman WO setelah dikirim.</p>
        </form>)}
      <section className="card"><h2 className="mb-2 font-medium">WO yang masih berjalan</h2>
        {open.length ? <ul className="divide-y text-sm">{open.map((w) => <li key={w.id} className="py-2"><Link href={`/work-orders/${w.id}`} className="block"><span className="font-mono text-blue-700">{w.code}</span> <span className="text-xs text-slate-500">{w.priority} · {ST[w.status] ?? w.status}</span><div>{w.title}</div></Link></li>)}</ul> : <p className="text-sm text-slate-500">Tidak ada WO terbuka untuk aset ini.</p>}</section>
      {hist.length > 0 && <section className="card"><h2 className="mb-2 font-medium">Riwayat terakhir</h2><ul className="divide-y text-sm">{hist.map((w) => <li key={w.id} className="py-2"><Link href={`/work-orders/${w.id}`}><span className="font-mono text-slate-500">{w.code}</span> · {w.title} <span className="text-xs text-slate-400">({ST[w.status] ?? w.status}, {new Date(w.createdAt).toLocaleDateString('id-ID')})</span></Link></li>)}</ul></section>}
    </div>
  );
}
