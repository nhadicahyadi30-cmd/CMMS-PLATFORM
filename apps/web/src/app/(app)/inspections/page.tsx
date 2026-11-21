'use client';
import Link from 'next/link';
import { useState } from 'react';
import { getUser } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { AUDIENCE, fmt } from '@/lib/safety';

type Tab = 'do' | 'history';

export default function Inspections() {
  const [tab, setTab] = useState<Tab>('do'); const [onlyAb, setOnlyAb] = useState(false);
  const user = getUser()!; const canManage = ['admin', 'supervisor', 'planner'].includes(user.role);
  const due = useApi<any[]>('/inspections/due'); const tpls = useApi<any[]>('/inspections/templates');
  const hist = useApi<{ total: number; items: any[] }>(tab === 'history' ? `/inspections?size=100${onlyAb ? '&abnormal=true' : ''}` : null);
  const dueIds = new Set(due.data?.filter((d) => d.overdueDays >= 0).map((d) => d.templateId));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-semibold">Inspeksi & Checklist</h1>
        <div className="flex gap-2"><Link href="/field" className="btn-ghost">Mode Lapangan (offline)</Link>{canManage && <Link href="/inspections/templates" className="btn-ghost">Kelola template</Link>}</div></div>
      <div className="flex gap-2"><button className={tab === 'do' ? 'btn' : 'btn-ghost'} onClick={() => setTab('do')}>Kerjakan</button><button className={tab === 'history' ? 'btn' : 'btn-ghost'} onClick={() => setTab('history')}>Riwayat</button></div>
      {tab === 'do' && (<>
        {!!dueIds.size && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">{dueIds.size} checklist sudah jatuh tempo.</p>}
        {(due.error || tpls.error) && <p className="text-sm text-red-600">{due.error || tpls.error}</p>}
        <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Checklist</th><th>Aset</th><th>Untuk</th><th>Terakhir</th><th>Jadwal</th><th /></tr></thead>
          <tbody>{tpls.data?.map((t) => { const d = due.data?.find((x) => x.templateId === t.id);
            return (<tr key={t.id} className="border-t"><td className="p-2"><div className="font-medium">{t.name}</div><div className="font-mono text-xs text-slate-500">{t.code} · {t.itemCount} butir</div></td>
              <td>{t.assetName ?? 'Pilih saat mengisi'}</td><td>{AUDIENCE[t.audience]}</td><td>{fmt(t.lastAt)}</td>
              <td>{d ? (d.overdueDays >= 0 ? <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">telat {d.overdueDays} hari</span> : <span className="text-xs text-slate-500">{-d.overdueDays} hari lagi</span>) : <span className="text-xs text-slate-400">tanpa jadwal</span>}</td>
              <td className="pr-2 text-right"><Link className="btn" href={`/inspections/run/${t.id}`}>Mulai</Link></td></tr>); })}
            {!tpls.loading && !tpls.data?.length && <tr><td colSpan={6} className="p-4 text-center text-slate-500">Belum ada template checklist{canManage ? '. Buat lewat "Kelola template".' : '.'}</td></tr>}</tbody></table></div>
      </>)}
      {tab === 'history' && (<>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyAb} onChange={(e) => setOnlyAb(e.target.checked)} />Hanya yang ada temuan</label>
        {hist.error && <p className="text-sm text-red-600">{hist.error}</p>}
        <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">No.</th><th>Checklist</th><th>Aset</th><th>Oleh</th><th>Waktu</th><th>Temuan</th><th>WO</th></tr></thead>
          <tbody>{hist.data?.items.map((i) => (<tr key={i.id} className="border-t hover:bg-slate-50"><td className="p-2 font-mono"><Link className="text-blue-700 underline" href={`/inspections/${i.id}`}>{i.code}</Link></td>
            <td>{i.templateName}</td><td>{i.assetName}</td><td>{i.performedBy}</td><td>{fmt(i.performedAt)}</td>
            <td>{i.abnormalCount ? <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">{i.abnormalCount}</span> : <span className="text-xs text-emerald-700">normal</span>}</td>
            <td>{i.woId ? <Link className="text-blue-700 underline" href={`/work-orders/${i.woId}`}>{i.woCode}</Link> : '—'}</td></tr>))}
            {!hist.loading && !hist.data?.items.length && <tr><td colSpan={7} className="p-4 text-center text-slate-500">Belum ada riwayat</td></tr>}</tbody></table></div>
      </>)}
    </div>
  );
}
