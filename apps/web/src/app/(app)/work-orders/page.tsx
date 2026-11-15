'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useApi } from '@/lib/hooks';
import Badge from '@/components/Badge';

const FILTERS = [['', 'Semua'], ['waiting', 'Menunggu approval'], ['approved,assigned', 'Siap dikerjakan'], ['progress', 'Dikerjakan'], ['done', 'Selesai'], ['closed', 'Ditutup']];

export default function WorkOrders() {
  const [st, setSt] = useState('');
  const { data, error, loading } = useApi<{ total: number; items: any[] }>(`/work-orders?size=100${st ? `&status=${st}` : ''}`);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">Work Order</h1>
        <Link href="/work-orders/new" className="btn">+ Buat WO</Link></div>
      <div className="flex flex-wrap gap-2">{FILTERS.map(([v, l]) => (
        <button key={v} onClick={() => setSt(v)} className={st === v ? 'btn' : 'btn-ghost'}>{l}</button>))}</div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>
          <th className="p-2">No. WO</th><th>Judul</th><th>Aset</th><th>Prioritas</th><th>Status</th><th>Teknisi</th></tr></thead>
          <tbody>{data?.items.map((w) => (
            <tr key={w.id} className="border-t hover:bg-slate-50"><td className="p-2 font-mono"><Link className="text-blue-700 underline" href={`/work-orders/${w.id}`}>{w.code}</Link></td>
              <td>{w.title}</td><td>{w.assetName}</td><td><Badge v={w.priority} /></td><td><Badge v={w.status} /></td><td>{w.technicianName ?? '—'}</td></tr>))}
            {!loading && !data?.items.length && <tr><td colSpan={6} className="p-4 text-center text-slate-500">Tidak ada WO</td></tr>}</tbody></table>
      </div>
    </div>
  );
}
