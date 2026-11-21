'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, getUser } from '@/lib/api';
import { useApi } from '@/lib/hooks';

type St = 'aman' | 'padat' | 'lembur' | 'kurang' | 'kosong'; type TSt = 'libur' | 'rendah' | 'normal' | 'padat' | 'lembur' | 'berlebih';
interface Sugg { id: string; name: string; qualified: boolean; level: number; utilizationAfter: number | null; reasons: string[] }
interface Ov {
  window: { from: string; to: string; days: number; workDays: number };
  settings: { productiveFactor: number; reservePct: number; workdaysPerWeek: number; otMaxDayH: number; otMaxWeekH: number; targetUtil: number };
  demand: { assignedH: number; backlogH: number; pmH: number; unplannedH: number; totalH: number; historyH30: number; pmPlans: number; pmOverdue: number };
  team: { technicians: number; capacityH: number; overtimeCapacityH: number; utilization: number | null; status: St; overtime: { neededH: number; perTechPerDay: number; perTechPerWeek: number; withinLimit: boolean }; headcount: { current: number; recommended: number; minimum: number; withOvertime: number; gap: number; perTechH: number }; advice: string[] };
  byTechnician: { id: string; code: string; name: string; shift: string; workDays: number; absentDays: number; capacityH: number; loadH: number; openWo: number; absentToday: boolean; status: TSt; utilization: number | null; overtimeH: number }[];
  byShift: { shift: string; technicians: number; capacityH: number; loadH: number; utilization: number | null }[];
  backlog: { id: string; code: string; title: string; priority: string; remH: number; skill: { code: string; minLevel: number } | null; suggestions: Sugg[] }[];
}
const ST: Record<St, { t: string; c: string; i: string }> = {
  aman: { t: 'Aman', c: 'bg-emerald-100 text-emerald-800', i: '✓' }, padat: { t: 'Padat', c: 'bg-amber-100 text-amber-800', i: '!' },
  lembur: { t: 'Perlu lembur', c: 'bg-orange-100 text-orange-800', i: '⏱' }, kurang: { t: 'Kurang teknisi', c: 'bg-red-100 text-red-800', i: '▲' }, kosong: { t: 'Tidak ada kapasitas', c: 'bg-red-100 text-red-800', i: '✕' },
};
const TST: Record<TSt, { t: string; c: string }> = {
  libur: { t: 'Libur/cuti', c: 'bg-slate-200 text-slate-700' }, rendah: { t: 'Longgar', c: 'bg-sky-100 text-sky-800' }, normal: { t: 'Normal', c: 'bg-emerald-100 text-emerald-800' },
  padat: { t: 'Padat', c: 'bg-amber-100 text-amber-800' }, lembur: { t: 'Lembur', c: 'bg-orange-100 text-orange-800' }, berlebih: { t: 'Berlebih', c: 'bg-red-100 text-red-800' },
};
const pct = (u: number | null) => (u == null ? '-' : `${Math.round(u * 100)}%`);
const msg = (e: any) => (e instanceof ApiError && Array.isArray(e.details?.issues) ? e.details.issues.map((i: any) => `${i.path?.join('.') ?? ''} ${i.message}`).join('; ') : e?.message ?? 'Terjadi kesalahan');
const Bar = ({ u }: { u: number | null }) => <div className="h-2 w-24 overflow-hidden rounded bg-slate-100" aria-hidden="true"><div className={`h-full ${u != null && u > 1 ? 'bg-red-500' : u != null && u > 0.85 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, Math.round((u ?? 0) * 100))}%` }} /></div>;

export default function WorkloadPage() {
  const me = getUser(); const canEdit = me?.role === 'admin' || me?.role === 'supervisor' || me?.role === 'planner'; const isAdmin = me?.role === 'admin';
  const [days, setDays] = useState(7); const [plantId, setPlantId] = useState('');
  const plants = useApi<{ id: string; code: string; name: string }[]>('/plants');
  const ov = useApi<Ov>(`/workforce/overview?days=${days}${plantId ? `&plantId=${plantId}` : ''}`);
  const abs = useApi<{ id: string; technicianId: string; technicianName: string; from: string; to: string; reason: string }[]>('/workforce/absences');
  const [err, setErr] = useState(''); const [ab, setAb] = useState({ technicianId: '', from: '', to: '', reason: 'cuti' }); const [showSet, setShowSet] = useState(false);
  const [set, setSet] = useState<any>(null);
  const d = ov.data; const t = d?.team;

  async function addAbs(e: FormEvent) { e.preventDefault(); setErr(''); try { await api('/workforce/absences', { method: 'POST', body: ab }); setAb({ ...ab, from: '', to: '' }); abs.reload(); ov.reload(); } catch (x) { setErr(msg(x)); } }
  async function delAbs(id: string) { try { await api(`/workforce/absences/${id}`, { method: 'DELETE' }); abs.reload(); ov.reload(); } catch (x) { setErr(msg(x)); } }
  async function assign(woId: string, technicianId: string) { setErr(''); try { await api(`/work-orders/${woId}/assign`, { method: 'POST', body: { technicianId } }); ov.reload(); } catch (x) { setErr(msg(x)); } }
  async function saveSet(e: FormEvent) {
    e.preventDefault(); setErr('');
    try { await api('/workforce/settings', { method: 'PUT', body: { productiveFactor: Number(set.productiveFactor), reservePct: Number(set.reservePct), workdaysPerWeek: Number(set.workdaysPerWeek), otMaxDayH: Number(set.otMaxDayH), otMaxWeekH: Number(set.otMaxWeekH), targetUtil: Number(set.targetUtil) } }); setShowSet(false); ov.reload(); }
    catch (x) { setErr(msg(x)); }
  }
  const Card = ({ l, v, s, c = '' }: { l: string; v: string; s?: string; c?: string }) => <div className="card"><div className="text-xs text-slate-500">{l}</div><div className={`text-2xl font-semibold ${c}`}>{v}</div>{s && <div className="text-xs text-slate-500">{s}</div>}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-xl font-semibold">Beban & Kebutuhan Teknisi</h1><p className="text-sm text-slate-600">Menghitung beban kerja terhadap kapasitas teknisi, kebutuhan jumlah teknisi, dan perlu-tidaknya lembur. Skill tiap teknisi ada di <Link className="text-blue-700 hover:underline" href="/skills">Matriks Skill</Link>.</p></div>
        <div className="flex gap-2 text-sm">
          <select className="input" aria-label="Periode" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>7 hari ke depan</option><option value={14}>14 hari</option><option value={30}>30 hari</option></select>
          <select className="input" aria-label="Plant" value={plantId} onChange={(e) => setPlantId(e.target.value)}><option value="">Semua plant</option>{plants.data?.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select>
        </div>
      </div>
      {err && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{err}</p>}
      {ov.error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{ov.error}</p>}

      {d && t && <>
        <section className="card space-y-2">
          <div className="flex flex-wrap items-center gap-3"><span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${ST[t.status].c}`}><span aria-hidden="true">{ST[t.status].i}</span>{ST[t.status].t}</span>
            <span className="text-sm text-slate-600">{d.window.from} s.d. {d.window.to} · {d.window.workDays} hari kerja</span></div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{t.advice.map((a) => <li key={a}>{a}</li>)}</ul>
        </section>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card l="Beban kerja (jam)" v={String(d.demand.totalH)} s={`Ditugaskan ${d.demand.assignedH} · antre ${d.demand.backlogH} · PM ${d.demand.pmH} · tak terencana ${d.demand.unplannedH}`} />
          <Card l="Kapasitas produktif (jam)" v={String(t.capacityH)} s={`${t.technicians} teknisi · utilisasi ${pct(t.utilization)}`} />
          <Card l="Lembur dibutuhkan" v={t.overtime.neededH > 0 ? `${t.overtime.perTechPerDay} jam/orang/hari` : 'Tidak perlu'} s={t.overtime.neededH > 0 ? `${t.overtime.perTechPerWeek} jam/orang/minggu · ${t.overtime.withinLimit ? 'dalam batas' : 'MELEBIHI batas'}` : undefined} c={t.overtime.neededH > 0 ? (t.overtime.withinLimit ? 'text-orange-700' : 'text-red-700') : 'text-emerald-700'} />
          <Card l="Teknisi dibutuhkan" v={`${t.headcount.recommended} orang`} s={`Sekarang ${t.headcount.current} · minimum ${t.headcount.minimum} · dengan lembur ${t.headcount.withOvertime}${t.headcount.gap > 0 ? ` · kurang ${t.headcount.gap}` : t.headcount.gap < 0 ? ` · lebih ${-t.headcount.gap}` : ''}`} c={t.headcount.gap > 0 ? 'text-red-700' : ''} />
        </div>

        <section className="card overflow-x-auto p-0"><h2 className="p-3 font-medium">Beban per teknisi</h2>
          <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Teknisi</th><th>Shift</th><th>Hari kerja</th><th>Kapasitas</th><th>Beban</th><th>Utilisasi</th><th>WO aktif</th><th>Status</th></tr></thead>
            <tbody>{d.byTechnician.map((x) => (
              <tr key={x.id} className="border-t"><td className="p-2"><div className="font-medium">{x.name}</div><div className="font-mono text-xs text-slate-400">{x.code}</div></td><td>{x.shift}</td>
                <td>{x.workDays}{x.absentDays > 0 && <span className="text-xs text-slate-500"> (cuti {x.absentDays})</span>}</td><td>{x.capacityH} j</td><td>{x.loadH} j</td>
                <td><div className="flex items-center gap-2"><Bar u={x.utilization} /><span>{pct(x.utilization)}</span></div></td><td>{x.openWo}</td>
                <td><span className={`rounded px-2 py-0.5 text-xs font-medium ${TST[x.status].c}`}>{TST[x.status].t}</span>{x.overtimeH > 0 && <div className="text-xs text-slate-500">lembur ± {x.overtimeH} j</div>}</td></tr>))}
              {!d.byTechnician.length && <tr><td colSpan={8} className="p-4 text-center text-slate-500">Belum ada teknisi aktif.</td></tr>}</tbody></table>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card overflow-x-auto p-0"><h2 className="p-3 font-medium">Per shift</h2>
            <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Shift</th><th>Teknisi</th><th>Kapasitas</th><th>Beban</th><th>Utilisasi</th></tr></thead>
              <tbody>{d.byShift.map((s) => <tr key={s.shift} className="border-t"><td className="p-2 capitalize">{s.shift}</td><td>{s.technicians}</td><td>{s.capacityH} j</td><td>{s.loadH} j</td><td>{pct(s.utilization)}</td></tr>)}</tbody></table>
            <p className="p-3 text-xs text-slate-500">Beban per shift hanya dari WO yang sudah ditugaskan.</p></section>

          <section className="card space-y-2"><h2 className="font-medium">Cuti / absen teknisi</h2>
            {canEdit && <form onSubmit={addAbs} className="grid gap-2 sm:grid-cols-5">
              <select className="input sm:col-span-2" required aria-label="Teknisi" value={ab.technicianId} onChange={(e) => setAb({ ...ab, technicianId: e.target.value })}><option value="">Teknisi…</option>{d.byTechnician.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
              <input className="input" type="date" required aria-label="Mulai" value={ab.from} onChange={(e) => setAb({ ...ab, from: e.target.value })} />
              <input className="input" type="date" required aria-label="Selesai" value={ab.to} onChange={(e) => setAb({ ...ab, to: e.target.value })} />
              <select className="input" aria-label="Alasan" value={ab.reason} onChange={(e) => setAb({ ...ab, reason: e.target.value })}><option value="cuti">Cuti</option><option value="sakit">Sakit</option><option value="pelatihan">Pelatihan</option><option value="lainnya">Lainnya</option></select>
              <button className="btn sm:col-span-5">Tambah</button></form>}
            <ul className="divide-y text-sm">{abs.data?.map((a) => <li key={a.id} className="flex items-center justify-between py-1.5"><span>{a.technicianName} · {a.from} → {a.to} <span className="text-xs text-slate-500">({a.reason})</span></span>{canEdit && <button className="text-xs text-red-600 hover:underline" onClick={() => delAbs(a.id)}>Hapus</button>}</li>)}
              {abs.data && !abs.data.length && <li className="py-2 text-slate-500">Tidak ada cuti terjadwal.</li>}</ul></section>
        </div>

        <section className="card overflow-x-auto p-0"><h2 className="p-3 font-medium">WO belum ada teknisi & rekomendasi penugasan</h2>
          <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">WO</th><th>Prioritas</th><th>Jam</th><th>Skill</th><th>Rekomendasi</th></tr></thead>
            <tbody>{d.backlog.map((w) => (
              <tr key={w.id} className="border-t align-top"><td className="p-2"><Link className="font-mono text-blue-700 hover:underline" href={`/work-orders/${w.id}`}>{w.code}</Link><div className="text-xs text-slate-500">{w.title}</div></td><td>{w.priority}</td><td>{w.remH}</td>
                <td>{w.skill ? <span className="font-mono text-xs">{w.skill.code} ≥ {w.skill.minLevel}</span> : <span className="text-xs text-slate-400">tidak diisi</span>}</td>
                <td><div className="space-y-1">{w.suggestions.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-2"><span className={`rounded px-1.5 py-0.5 text-xs ${s.qualified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{s.qualified ? 'sesuai' : 'skill kurang'}</span><span className="font-medium">{s.name}</span><span className="text-xs text-slate-500" title={s.reasons.join(' · ')}>beban jadi {pct(s.utilizationAfter)}</span>
                    {canEdit && <button className="text-xs text-blue-700 hover:underline" onClick={() => { if (!s.qualified && !confirm(`${s.name} belum memenuhi level skill minimum. Tetap tugaskan?`)) return; assign(w.id, s.id); }}>Tugaskan</button>}</div>))}
                  {!w.suggestions.length && <span className="text-xs text-slate-400">tidak ada kandidat</span>}</div></td></tr>))}
              {!d.backlog.length && <tr><td colSpan={5} className="p-4 text-center text-slate-500">Semua WO aktif sudah punya teknisi.</td></tr>}</tbody></table>
          <p className="p-3 text-xs text-slate-500">WO berstatus &quot;Menunggu approval&quot; perlu disetujui dulu sebelum dapat ditugaskan.</p>
        </section>

        <section className="card space-y-2"><div className="flex items-center justify-between"><h2 className="font-medium">Asumsi perhitungan</h2>
          {isAdmin && <button className="text-sm text-blue-700 hover:underline" onClick={() => { setSet({ ...d.settings }); setShowSet(!showSet); }}>{showSet ? 'Tutup' : 'Ubah asumsi'}</button>}</div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Jam produktif = jam kerja × {d.settings.productiveFactor} (sisanya perjalanan, tunggu izin, istirahat). Hari kerja {d.settings.workdaysPerWeek}/minggu; target utilisasi {Math.round(d.settings.targetUtil * 100)}%.</li>
            <li>Beban = sisa jam WO ditugaskan (yang sedang dikerjakan dihitung separuh) + WO antre + PM kalender jatuh tempo yang belum jadi WO (PM berbasis meter tidak ikut) + pekerjaan tak terencana: rata-rata 30 hari terakhir ({d.demand.historyH30} jam breakdown/emergency/korektif), minimal {d.settings.reservePct}% dari kapasitas.</li>
            <li>Batas lembur {d.settings.otMaxDayH} jam/hari dan {d.settings.otMaxWeekH} jam/minggu; sesuaikan dengan aturan perusahaan dan peraturan ketenagakerjaan yang berlaku (ini perkiraan, bukan nasihat hukum). Jam perjalanan antar-plant tidak dihitung.</li></ul>
          {showSet && set && <form onSubmit={saveSet} className="grid gap-2 sm:grid-cols-3">
            {([['productiveFactor', 'Faktor produktif (0,3–1)'], ['reservePct', 'Cadangan tak terencana (%)'], ['workdaysPerWeek', 'Hari kerja/minggu (5–7)'], ['otMaxDayH', 'Maks lembur jam/hari'], ['otMaxWeekH', 'Maks lembur jam/minggu'], ['targetUtil', 'Target utilisasi (0,5–1)']] as const).map(([k, l]) => (
              <label key={k} className="text-xs text-slate-600">{l}<input className="input mt-1" type="number" step="any" value={set[k]} onChange={(e) => setSet({ ...set, [k]: e.target.value })} /></label>))}
            <button className="btn sm:col-span-3">Simpan asumsi</button></form>}
        </section>
      </>}
      {ov.loading && !d && <p className="text-sm text-slate-500">Menghitung…</p>}
    </div>
  );
}
