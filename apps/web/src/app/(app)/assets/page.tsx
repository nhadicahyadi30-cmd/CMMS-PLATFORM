'use client';
import Link from 'next/link';
import { useState } from 'react';
import { getUser } from '@/lib/api';
import { useApi } from '@/lib/hooks';

export default function Assets() {
  const [q, setQ] = useState('');
  const { data, error, loading } = useApi<{ total: number; items: any[] }>(`/assets?size=100${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">Aset & Equipment</h1>
        <div className="flex gap-2"><input className="input max-w-xs" placeholder="Cari kode / nama…" value={q} onChange={(e) => setQ(e.target.value)} />
          {["admin", "supervisor", "planner"].includes(getUser()?.role ?? "") && <Link href="/assets/new" className="btn whitespace-nowrap">+ Tambah aset</Link>}
          <Link href="/assets/labels" className="btn-ghost whitespace-nowrap">Label QR</Link></div></div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>
          <th className="p-2">Kode</th><th>Nama</th><th>Tipe</th><th>Status</th><th>Kritikalitas</th></tr></thead>
          <tbody>{data?.items.map((a) => (
            <tr key={a.id} className="border-t"><td className="p-2 font-mono">{a.code}</td><td>{a.name}</td><td>{a.assetType}</td><td>{a.status}</td>
              <td>{a.criticalityClass} ({a.criticalityScore})</td></tr>))}
            {!loading && !data?.items.length && <tr><td colSpan={5} className="p-4 text-center text-slate-500">Belum ada aset</td></tr>}</tbody></table>
      </div>
      <p className="text-xs text-slate-500">{data?.total ?? 0} aset</p>
    </div>
  );
}
