/** Label & pembantu untuk Inspeksi dan Izin Kerja (PTW). Aturan wewenang yang sebenarnya dijaga server dan database. */
export const PERMIT_LABEL: Record<string, string> = {
  requested: 'Menunggu persetujuan', approved: 'Disetujui · tunggu serah area', handed_over: 'Area diserahkan · LOTO', active: 'Aktif (dikerjakan)',
  completed: 'Selesai · tunggu terima area', closed: 'Ditutup', rejected: 'Ditolak', cancelled: 'Dibatalkan',
};
export const PERMIT_COLOR: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-800', approved: 'bg-sky-100 text-sky-800', handed_over: 'bg-indigo-100 text-indigo-800', active: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-teal-100 text-teal-800', closed: 'bg-slate-200 text-slate-700', rejected: 'bg-red-100 text-red-800', cancelled: 'bg-slate-100 text-slate-500',
};
export const WORK_TYPE: Record<string, string> = { general: 'Umum', electrical: 'Listrik', hot_work: 'Pekerjaan panas', confined_space: 'Ruang terbatas', height: 'Di ketinggian', excavation: 'Galian', chemical: 'Bahan kimia' };
export const ENERGY: Record<string, string> = { electrical: 'Listrik', mechanical: 'Mekanik', hydraulic: 'Hidrolik', pneumatic: 'Pneumatik', thermal: 'Panas', chemical: 'Kimia', gravity: 'Gravitasi', other: 'Lainnya' };
export const ROLE_LABEL: Record<string, string> = { admin: 'Admin', supervisor: 'Supervisor', planner: 'Planner', technician: 'Teknisi', production: 'Produksi' };
export const AUDIENCE: Record<string, string> = { any: 'Semua peran', technician: 'Khusus Teknisi', production: 'Khusus Produksi' };

export function isAbnormal(item: { kind: string; minVal?: number | null; maxVal?: number | null }, r: { ok?: boolean; value?: number }): boolean {
  if (item.kind === 'check') return r.ok === false;
  if (item.kind === 'number') return r.value != null && ((item.minVal != null && r.value < item.minVal) || (item.maxVal != null && r.value > item.maxVal));
  return false;
}
export const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
/** Nilai untuk <input type="datetime-local"> (waktu lokal perangkat). */
export const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));
