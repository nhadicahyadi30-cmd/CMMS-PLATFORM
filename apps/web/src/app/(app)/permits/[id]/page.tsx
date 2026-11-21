'use client';
import Link from 'next/link';
import { askConfirm, askReason } from '@/components/Confirm';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, getUser } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import PermitBadge from '@/components/PermitBadge';
import { ENERGY, fmt, WORK_TYPE } from '@/lib/safety';

const NEXT_HINT: Record<string, string> = {
  requested: 'Menunggu Supervisor/Admin menyetujui.',
  approved: 'Menunggu Produksi menyerahkan area (mesin dimatikan dan area aman).',
  handed_over: 'Pasang gembok di setiap titik isolasi, verifikasi nol energi, lalu mulai pekerjaan.',
  active: 'Pekerjaan berjalan. Setelah selesai, lepas semua gembok lalu laporkan selesai.',
  completed: 'Menunggu Produksi menerima area kembali.',
};

export default function PermitDetail() {
  const { id } = useParams<{ id: string }>(); const { data: p, error, reload } = useApi<any>(`/permits/${id}`);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [lockNo, setLockNo] = useState<Record<string, string>>({}); const [note, setNote] = useState('');
  const me = getUser()!;
  async function act(path: string, body: unknown = {}, method = 'POST') {
    setBusy(true); setMsg('');
    try { await api(`/permits/${id}${path}`, { method, body }); await reload(); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }
  if (error) return <p className="text-red-600">{error}</p>;
  if (!p) return <p className="text-sm text-slate-500">Memuat…</p>;
  const has = (a: string) => p.actions.includes(a);
  const allLocked = p.points.length > 0 && p.points.every((x: any) => x.locks.some((l: any) => !l.removedAt) && x.zeroVerifiedAt);
  const openLocks = p.points.flatMap((x: any) => x.locks).filter((l: any) => !l.removedAt).length;
  return (
    <div className="max-w-4xl space-y-4">
      <div><div className="font-mono text-sm text-slate-500">{p.code}</div><h1 className="text-xl font-semibold">{p.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2"><PermitBadge s={p.status} />{p.expired && <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">melewati masa berlaku</span>}<span className="text-sm text-slate-600">{p.assetName} · {WORK_TYPE[p.workType]}</span>
          {p.woId && <Link className="text-sm text-blue-700 underline" href={`/work-orders/${p.woId}`}>{p.woCode}</Link>}</div></div>
      {NEXT_HINT[p.status] && <p className="rounded bg-sky-50 px-3 py-2 text-sm text-sky-900">{NEXT_HINT[p.status]}</p>}
      {p.status === 'rejected' && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">Ditolak: {p.rejectReason}</p>}
      {p.status === 'cancelled' && <p className="rounded bg-slate-100 px-3 py-2 text-sm text-slate-700">Dibatalkan: {p.cancelReason}</p>}

      <div className="card grid gap-3 text-sm sm:grid-cols-2">
        <div><div className="text-xs uppercase text-slate-500">Berlaku</div>{fmt(p.validFrom)} s/d {fmt(p.validUntil)}</div>
        <div><div className="text-xs uppercase text-slate-500">Pemohon</div>{p.requestedBy}{p.team && <span className="text-slate-500"> · tim: {p.team}</span>}</div>
        {p.hazards && <div><div className="text-xs uppercase text-slate-500">Bahaya</div>{p.hazards}</div>}
        {p.precautions && <div><div className="text-xs uppercase text-slate-500">Pengendalian / APD</div>{p.precautions}</div>}
        <div><div className="text-xs uppercase text-slate-500">Persetujuan</div>{p.approvedBy ? `${p.approvedBy} · ${fmt(p.approvedAt)}` : '—'}</div>
        <div><div className="text-xs uppercase text-slate-500">Serah area</div>{p.handoverBy ? `${p.handoverBy} · ${fmt(p.handoverAt)}` : '—'}{p.handoverNote && <div className="text-slate-500">{p.handoverNote}</div>}</div>
      </div>

      {p.requiresLoto && (
        <div className="card space-y-3"><h2 className="font-semibold">LOTO — titik isolasi</h2>
          {!p.points.length && <p className="text-sm text-amber-800">Belum ada titik isolasi. Izin dengan LOTO tidak dapat disetujui tanpa titik isolasi.</p>}
          {p.points.map((x: any) => (
            <div key={x.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><span className="font-medium">{x.seq}. {x.description}</span> <span className="text-xs text-slate-500">({ENERGY[x.energyType]}{x.method ? ` · ${x.method}` : ''})</span></div>
                <div className="flex items-center gap-2">{x.zeroVerifiedAt ? <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">nol energi ✓ {x.zeroVerifiedBy}</span> : <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">belum diverifikasi</span>}
                  {has('verify') && p.status === 'handed_over' && (x.zeroVerifiedAt ? <button className="btn-ghost" disabled={busy} onClick={() => act(`/points/${x.id}/unverify`)}>Batal verifikasi</button> : <button className="btn-ghost" disabled={busy || !x.locks.some((l: any) => !l.removedAt)} onClick={() => act(`/points/${x.id}/verify`)}>Verifikasi nol energi</button>)}
                  {['requested', 'approved'].includes(p.status) && has('edit') && <button className="btn-ghost" disabled={busy} onClick={() => act(`/points/${x.id}`, undefined, 'DELETE')}>Hapus</button>}</div></div>
              <ul className="mt-2 space-y-1 text-sm">{x.locks.map((l: any) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2"><span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs">🔒 {l.lockNo}</span><span>{l.appliedBy}</span>
                  {l.removedAt ? <span className="text-xs text-slate-500">dilepas {fmt(l.removedAt)} oleh {l.removedBy}{l.overrideReason ? ` (${l.overrideReason})` : ''}</span> : p.status === 'active' && has('unlock') && <button className="btn-ghost" disabled={busy} onClick={async () => { if (l.appliedById === me.sub) act(`/locks/${l.id}/remove`, {}); else { const r = await askReason('Gembok ini dipasang orang lain. Melepasnya akan dicatat permanen. Apa alasannya?', { danger: true, ok: 'Lepas gembok' }); if (r) act(`/locks/${l.id}/remove`, { reason: r }); } }}>Lepas</button>}</li>))}</ul>
              {has('lock') && ['handed_over', 'active'].includes(p.status) && !x.zeroVerifiedAt && <div className="mt-2 flex gap-2"><input className="input max-w-[12rem]" placeholder="Nomor gembok pribadi" value={lockNo[x.id] ?? ''} onChange={(e) => setLockNo({ ...lockNo, [x.id]: e.target.value })} /><button className="btn" disabled={busy || !(lockNo[x.id] ?? '').trim()} onClick={async () => { await act(`/points/${x.id}/locks`, { lockNo: lockNo[x.id] }); setLockNo({ ...lockNo, [x.id]: '' }); }}>Pasang gembok</button></div>}
            </div>))}
          {p.status === 'handed_over' && <p className="text-xs text-slate-500">{allLocked ? 'LOTO lengkap: semua titik bergembok dan nol energi terverifikasi.' : 'Mulai kerja hanya bisa setelah setiap titik punya gembok dan terverifikasi nol energi.'}</p>}
        </div>)}

      <div className="card flex flex-wrap items-center gap-2">
        {has('approve') && <button className="btn" disabled={busy} onClick={() => act('/approve')}>Setujui</button>}
        {has('reject') && <button className="btn-ghost" disabled={busy} onClick={async () => { const r = await askReason('Izin ini akan ditolak. Tulis alasannya agar pemohon bisa memperbaiki.', { ok: 'Tolak izin', danger: true }); if (r) act('/reject', { reason: r }); }}>Tolak</button>}
        {has('handover') && <><input className="input max-w-xs" placeholder="Catatan serah area (opsional)" value={note} onChange={(e) => setNote(e.target.value)} /><button className="btn" disabled={busy} onClick={() => act('/handover', { note })}>Serahkan area</button></>}
        {has('activate') && p.status === 'handed_over' && <button className="btn" disabled={busy || (p.requiresLoto && !allLocked)} onClick={async () => { if (await askConfirm('Mulai pekerjaan sekarang? Pastikan semua gembok terpasang dan area sudah aman.', { ok: 'Mulai pekerjaan' })) act('/activate'); }}>Mulai pekerjaan</button>}
        {has('complete') && p.status === 'active' && <><input className="input max-w-xs" placeholder="Catatan hasil (opsional)" value={note} onChange={(e) => setNote(e.target.value)} /><button className="btn" disabled={busy || openLocks > 0} onClick={async () => { if (await askConfirm('Tandai pekerjaan selesai? Semua orang harus sudah menjauh dari mesin.', { ok: 'Ya, selesai' })) act('/complete', { note }); }}>Pekerjaan selesai</button>{openLocks > 0 && <span className="text-xs text-amber-700">Lepas {openLocks} gembok dulu</span>}</>}
        {has('close') && <button className="btn" disabled={busy} onClick={async () => { if (await askConfirm('Terima area kembali dan tutup izin? Setelah ditutup, izin tidak bisa diubah.', { ok: 'Terima & tutup' })) act('/close'); }}>Terima area kembali & tutup</button>}
        {has('cancel') && <button className="btn-ghost" disabled={busy} onClick={async () => { const r = await askReason('Izin ini akan dibatalkan dan tidak bisa dihidupkan lagi. Apa alasannya?', { ok: 'Batalkan izin', danger: true }); if (r) act('/cancel', { reason: r }); }}>Batalkan</button>}
        {!p.actions.length && <span className="text-sm text-slate-500">Tidak ada tindakan untuk peran Anda pada tahap ini.</span>}
        {msg && <span className="text-sm text-red-600" role="alert">{msg}</span>}
      </div>

      <div className="card"><h2 className="mb-2 font-semibold">Jejak izin</h2><ol className="space-y-1 text-sm">{p.events.map((e: any, i: number) => (<li key={i}><span className="text-xs text-slate-500">{fmt(e.at)}</span> · <span className="font-medium">{e.actor ?? '—'}</span> — {e.text}</li>))}</ol></div>
    </div>
  );
}
