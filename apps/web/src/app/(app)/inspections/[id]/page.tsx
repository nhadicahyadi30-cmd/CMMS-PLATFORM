'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApi } from '@/lib/hooks';
import { fmt } from '@/lib/safety';

export default function InspectionDetail() {
  const { id } = useParams<{ id: string }>(); const { data: x, error } = useApi<any>(`/inspections/${id}`);
  if (error) return <p className="text-red-600">{error}</p>;
  if (!x) return <p className="text-sm text-slate-500">Memuat…</p>;
  return (
    <div className="max-w-3xl space-y-4">
      <div><div className="font-mono text-sm text-slate-500">{x.code}</div><h1 className="text-xl font-semibold">{x.templateName}</h1><p className="text-sm text-slate-600">{x.assetName} · {x.performedBy} · {fmt(x.performedAt)}</p></div>
      {x.woId ? <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">{x.abnormalCount} temuan. WO perbaikan: <Link className="underline" href={`/work-orders/${x.woId}`}>{x.woCode}</Link></p> : <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Semua butir normal.</p>}
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">#</th><th>Butir</th><th>Hasil</th><th>Catatan</th></tr></thead>
        <tbody>{x.results.map((r: any) => (<tr key={r.seq} className={`border-t ${r.abnormal ? 'bg-red-50' : ''}`}><td className="p-2">{r.seq}</td><td>{r.text}{r.critical && <span className="ml-2 rounded bg-red-100 px-1.5 text-xs text-red-800">kritis</span>}</td>
          <td>{r.kind === 'check' ? (r.ok === null ? '—' : r.ok ? 'Normal' : 'Tidak normal') : r.kind === 'number' ? (r.value === null ? '—' : `${r.value} ${r.unit ?? ''}`) : (r.text_value ?? '—')}</td><td>{r.note || ''}</td></tr>))}</tbody></table></div>
      {x.notes && <p className="card whitespace-pre-wrap text-sm">{x.notes}</p>}
    </div>
  );
}
