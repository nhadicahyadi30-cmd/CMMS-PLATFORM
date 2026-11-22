'use client';
import Link from 'next/link';
import Loading from '@/components/Loading';
import { useState } from 'react';
import { useApi } from '@/lib/hooks';
import Badge from '@/components/Badge';

const FILTERS = [['', 'Semua'], ['waiting', 'Menunggu approval'], ['approved,assigned', 'Siap dikerjakan'], ['progress', 'Dikerjakan'], ['done', 'Selesai'], ['closed', 'Ditutup']];

export default function WorkOrders() {
  const [st, setSt] = useState('');
  const { data, error, loading } = useApi<{ total: number; items: any[] }>(`/work-orders?size=100${st ? `&status=${st}` : ''}`);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">Work Orders</h1>
        <Link href="/work-orders/new" className="btn">+ Buat WO</Link></div>
      <div className="flex flex-wrap gap-2">{FILTERS.map(([v, l]) => (
        <button key={v} onClick={() => setSt(v)} className={st === v ? 'btn' : 'btn-ghost'}>{l}</button>))}</div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>
          <th className="p-2">No. WO</th><th>Judul</th><th className="hidden md:table-cell">Aset</th><th className="pr-3">Prioritas</th><th>Status</th><th className="hidden sm:table-cell">Teknisi</th></tr></thead>
          <tbody>{data?.items.map((w) => (
            <tr key={w.id} className="border-t hover:bg-slate-50"><td className="whitespace-nowrap p-2 font-mono text-[0.8rem]"><Link className="text-blue-700 underline" href={`/work-orders/${w.id}`}>{w.code}</Link></td>
              <td className="py-2 pr-2">{w.title}<div className="text-xs text-slate-500 md:hidden">{w.assetName}</div></td><td className="hidden md:table-cell">{w.assetName}</td><td className="pr-3"><Badge v={w.priority} /></td><td><Badge v={w.status} /></td><td className="hidden pr-2 sm:table-cell">{w.technicianName ?? '—'}</td></tr>))}
            {!loading && !data?.items.length && <tr><td colSpan={6} className="p-6 text-center text-slate-500">Belum ada WO di filter ini. Tekan “+ Buat WO” untuk melaporkan masalah.</td></tr>}</tbody></table>{loading && <Loading />}
      </div>
    </div>
  );
}
