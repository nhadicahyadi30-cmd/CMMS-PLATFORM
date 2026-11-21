'use client';
import { useState } from 'react';
import { api, getUser } from '@/lib/api';
import { useApi } from '@/lib/hooks';

export default function Pm() {
  const { data, error, reload } = useApi<any[]>('/pm/plans');
  const [msg, setMsg] = useState('');
  const canManage = ['admin', 'supervisor', 'planner'].includes(getUser()?.role ?? '');
  async function generate() {
    try { const r = await api<{ created: number }>('/pm/generate', { method: 'POST', body: {} }); setMsg(`${r.created} WO preventif dibuat (menunggu approval).`); reload(); }
    catch (e: any) { setMsg(e.message); }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">Preventive Maintenance</h1>
        {canManage && <button className="btn" onClick={generate}>Buat WO PM jatuh tempo</button>}</div>
      {(error || msg) && <p className="text-sm text-slate-700">{error || msg}</p>}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>
          <th className="p-2">Rencana</th><th>Aset</th><th>Pemicu</th><th>Skill</th><th>Jatuh tempo</th><th>Terakhir</th></tr></thead>
          <tbody>{data?.map((p) => (<tr key={p.id} className="border-t"><td className="p-2">{p.name}</td><td>{p.assetName}</td>
            <td>{p.triggerType === 'calendar' ? `${p.intervalDays} hari` : `${p.intervalMeter} jam`}</td><td className="text-xs text-slate-500">{p.skillId ? `${p.skillCode} ≥ ${p.skillMinLevel}` : '—'}</td><td>{p.nextDue ?? '—'}</td><td>{p.lastDone ?? '—'}</td></tr>))}</tbody></table>
      </div>
    </div>
  );
}
