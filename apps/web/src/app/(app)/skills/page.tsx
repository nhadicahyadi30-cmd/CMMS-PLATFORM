'use client';
import { FormEvent, useState } from 'react';
import Loading from '@/components/Loading';
import { askConfirm } from '@/components/Confirm';
import { api, ApiError, getUser } from '@/lib/api';
import { useApi } from '@/lib/hooks';

type Risk = 'ok' | 'kurang' | 'spof' | 'kosong';
interface Cov { skillId: string; independent: number; experts: number; risk: Risk; certExpiring: number; certExpired: number; demandH: number; byShift: { shift: string; have: number; need: number; ok: boolean }[] }
interface Mx {
  levels: string[]; today: string;
  skills: { id: string; code: string; name: string; minCoverage: number; active: boolean }[];
  technicians: { id: string; code: string; name: string; shift: string }[];
  cells: { technicianId: string; skillId: string; level: number; certifiedUntil: string | null }[]; coverage: Cov[];
}
const RISK: Record<Risk, { t: string; c: string }> = { ok: { t: 'Aman', c: 'bg-emerald-100 text-emerald-800' }, kurang: { t: 'Kurang orang', c: 'bg-amber-100 text-amber-800' }, spof: { t: 'Hanya 1 orang (SPOF)', c: 'bg-orange-100 text-orange-800' }, kosong: { t: 'Tidak ada yang mandiri', c: 'bg-red-100 text-red-800' } };
const LV = ['bg-white text-slate-300', 'bg-slate-100 text-slate-700', 'bg-sky-100 text-sky-800', 'bg-emerald-200 text-emerald-900', 'bg-emerald-500 text-white'];
const msg = (e: any) => (e instanceof ApiError && Array.isArray(e.details?.issues) ? e.details.issues.map((i: any) => `${i.path?.join('.') ?? ''} ${i.message}`).join('; ') : e?.message ?? 'Terjadi kesalahan');
const cert = (u: string | null, today: string) => (!u ? 'none' : u < today ? 'lewat' : u <= new Date(Date.parse(today) + 60 * 864e5).toISOString().slice(0, 10) ? 'segera' : 'ok');

export default function SkillsPage() {
  const me = getUser(); const canEdit = me?.role === 'admin' || me?.role === 'supervisor' || me?.role === 'planner';
  const mx = useApi<Mx>('/workforce/matrix'); const d = mx.data;
  const [err, setErr] = useState(''); const [sk, setSk] = useState({ code: '', name: '', minCoverage: 2 });
  const [edit, setEdit] = useState<{ technicianId: string; skillId: string; level: number; certifiedUntil: string } | null>(null);

  const cell = (t: string, s: string) => d?.cells.find((c) => c.technicianId === t && c.skillId === s);
  async function addSkill(e: FormEvent) { e.preventDefault(); setErr(''); try { await api('/workforce/skills', { method: 'POST', body: sk }); setSk({ code: '', name: '', minCoverage: 2 }); mx.reload(); } catch (x) { setErr(msg(x)); } }
  async function delSkill(id: string, code: string) { if (!(await askConfirm(`Hapus skill ${code}? Level semua teknisi untuk skill ini ikut terhapus, dan WO/PM yang memakainya menjadi tanpa syarat skill.`, { danger: true }))) return; try { await api(`/workforce/skills/${id}`, { method: 'DELETE' }); mx.reload(); } catch (x) { setErr(msg(x)); } }
  async function save(e: FormEvent) {
    e.preventDefault(); if (!edit) return; setErr('');
    try { await api('/workforce/matrix', { method: 'PUT', body: { technicianId: edit.technicianId, skillId: edit.skillId, level: edit.level, certifiedUntil: edit.certifiedUntil || null } }); setEdit(null); mx.reload(); } catch (x) { setErr(msg(x)); }
  }
  const et = edit && d?.technicians.find((t) => t.id === edit.technicianId); const es = edit && d?.skills.find((s) => s.id === edit.skillId);

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Technician Skill Matrix</h1><p className="text-sm text-slate-600">Level kemampuan tiap teknisi per skill. Level <b>3 (Mandiri)</b> ke atas dihitung sebagai tercakup. Matriks dipakai untuk menandai risiko (skill hanya dikuasai satu orang atau tidak ada di satu shift) dan merekomendasikan teknisi saat menugaskan WO.</p></div>
      {err && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{err}</p>}
      {mx.error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{mx.error}</p>}
      {mx.loading && !d && <Loading />}
      {d && <>
        <div className="flex flex-wrap gap-2 text-xs" aria-label="Keterangan level">{d.levels.map((l, i) => <span key={l} className={`rounded border px-2 py-0.5 ${LV[i]}`}>{i} = {l}</span>)}<span className="rounded border px-2 py-0.5">⚠ sertifikat segera habis (≤60 hari)</span><span className="rounded border px-2 py-0.5">✕ sertifikat lewat</span></div>

        <section className="card overflow-x-auto p-0">
          <table className="w-full text-sm"><thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="sticky left-0 bg-slate-50 p-2 text-left">Teknisi</th>
            {d.skills.filter((s) => s.active).map((s) => <th key={s.id} className="p-2 text-center" title={s.name}><div className="font-mono">{s.code}</div><div className="font-normal text-slate-400">min {s.minCoverage}</div></th>)}</tr></thead>
            <tbody>{d.technicians.map((t) => (
              <tr key={t.id} className="border-t"><td className="sticky left-0 bg-white p-2"><div className="font-medium">{t.name}</div><div className="text-xs capitalize text-slate-400">{t.shift}</div></td>
                {d.skills.filter((s) => s.active).map((s) => { const c = cell(t.id, s.id); const lv = c?.level ?? 0; const cs = cert(c?.certifiedUntil ?? null, d.today);
                  return <td key={s.id} className="p-1 text-center"><button disabled={!canEdit} aria-label={`${t.name} ${s.code}: level ${lv} ${d.levels[lv]}`}
                    className={`h-9 w-12 rounded border text-sm font-semibold ${LV[lv]} ${canEdit ? 'hover:ring-2 hover:ring-blue-400' : ''}`} onClick={() => setEdit({ technicianId: t.id, skillId: s.id, level: lv, certifiedUntil: c?.certifiedUntil ?? '' })}>
                    {lv || '·'}{cs === 'segera' && <span title={`Sertifikat s.d. ${c?.certifiedUntil}`}> ⚠</span>}{cs === 'lewat' && <span title={`Sertifikat habis ${c?.certifiedUntil}`}> ✕</span>}</button></td>; })}</tr>))}
              {!d.technicians.length && <tr><td className="p-4 text-center text-slate-500" colSpan={99}>Belum ada teknisi aktif.</td></tr>}</tbody>
            <tfoot className="border-t-2 bg-slate-50 text-xs"><tr><td className="sticky left-0 bg-slate-50 p-2 font-medium">Cakupan (mandiri)</td>
              {d.skills.filter((s) => s.active).map((s) => { const k = d.coverage.find((c) => c.skillId === s.id); return <td key={s.id} className="p-1 text-center align-top">{k && <><div className="font-semibold">{k.independent}/{s.minCoverage}</div><span className={`mt-0.5 inline-block rounded px-1 ${RISK[k.risk].c}`}>{RISK[k.risk].t}</span>{k.certExpired > 0 && <div className="text-red-700">{k.certExpired} sertifikat lewat</div>}{k.byShift.some((b) => !b.ok) && <div className="text-slate-500">{k.byShift.filter((b) => !b.ok).map((b) => `${b.shift} ${b.have}/${b.need}`).join(', ')}</div>}</>}</td>; })}</tr></tfoot></table>
        </section>

        {edit && et && es && <form onSubmit={save} className="card space-y-3 border-2 border-blue-300"><h2 className="font-medium">{et.name} · {es.code} ({es.name})</h2>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Level">{d.levels.map((l, i) => <label key={l} className={`cursor-pointer rounded border px-3 py-1.5 text-sm ${LV[i]} ${edit.level === i ? 'ring-2 ring-blue-500' : ''}`}><input type="radio" className="sr-only" name="lv" checked={edit.level === i} onChange={() => setEdit({ ...edit, level: i })} />{i} · {l}</label>)}</div>
          <label className="block text-xs text-slate-600">Sertifikat berlaku sampai (opsional)<input className="input mt-1 max-w-xs" type="date" value={edit.certifiedUntil} onChange={(e) => setEdit({ ...edit, certifiedUntil: e.target.value })} /></label>
          <div className="flex gap-2"><button className="btn">Simpan</button><button type="button" className="btn-ghost" onClick={() => setEdit(null)}>Batal</button></div></form>}

        <section className="card space-y-3"><h2 className="font-medium">Daftar skill</h2>
          <ul className="divide-y text-sm">{d.skills.map((s) => <li key={s.id} className="flex items-center justify-between py-1.5"><span><span className="font-mono">{s.code}</span> · {s.name} <span className="text-xs text-slate-500">(minimal {s.minCoverage} orang mandiri per shift){!s.active && ' · nonaktif'}</span></span>
            {canEdit && me?.role !== 'planner' && <button className="text-xs text-red-600 hover:underline" onClick={() => delSkill(s.id, s.code)}>Hapus</button>}</li>)}
            {!d.skills.length && <li className="py-2 text-slate-500">Belum ada skill. Tambahkan skill pertama, mis. LISTRIK, MEKANIK, PLC, INSTRUMENT, HIDROLIK.</li>}</ul>
          {canEdit && <form onSubmit={addSkill} className="grid gap-2 sm:grid-cols-4"><input className="input" required placeholder="Kode (LISTRIK)" value={sk.code} onChange={(e) => setSk({ ...sk, code: e.target.value })} />
            <input className="input" required placeholder="Nama skill" value={sk.name} onChange={(e) => setSk({ ...sk, name: e.target.value })} />
            <input className="input" type="number" min={1} max={50} aria-label="Minimal orang mandiri per shift" value={sk.minCoverage} onChange={(e) => setSk({ ...sk, minCoverage: Number(e.target.value) })} /><button className="btn">Tambah skill</button></form>}
        </section>
      </>}
    </div>
  );
}
