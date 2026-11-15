const COLORS: Record<string, string> = {
  waiting: 'bg-amber-100 text-amber-800', approved: 'bg-sky-100 text-sky-800', assigned: 'bg-indigo-100 text-indigo-800',
  progress: 'bg-blue-100 text-blue-800', done: 'bg-emerald-100 text-emerald-800', closed: 'bg-slate-200 text-slate-700', rejected: 'bg-red-100 text-red-800',
  P1: 'bg-red-100 text-red-800', P2: 'bg-orange-100 text-orange-800', P3: 'bg-yellow-100 text-yellow-800', P4: 'bg-slate-100 text-slate-700',
};
const LABEL: Record<string, string> = { waiting: 'Menunggu approval', approved: 'Disetujui', assigned: 'Ditugaskan', progress: 'Dikerjakan', done: 'Selesai', closed: 'Ditutup', rejected: 'Ditolak' };
export default function Badge({ v }: { v: string }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${COLORS[v] ?? 'bg-slate-100'}`}>{LABEL[v] ?? v}</span>;
}
