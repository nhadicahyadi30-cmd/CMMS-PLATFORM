'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { api, getUser } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import Field from '@/components/Field';
import { ChartCard, fmt, HBars, SimpleTable } from '@/components/charts';

type Tab = 'cases' | 'cand' | 'fmea' | 'pareto';
const TABS: [Tab, string][] = [['cases', 'Kasus RCA'], ['cand', 'Kandidat RCA'], ['fmea', 'FMEA'], ['pareto', 'Pareto penyebab']];
const STAGE: Record<string, string> = { plan: 'Plan', do: 'Do', check: 'Check', act: 'Act', closed: 'Selesai' };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const rpnClass = (n: number) => (n >= 200 ? 'bg-red-100 text-red-800' : n >= 100 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700');

function NewCase({ preset, onDone }: { preset?: { assetId: string; title: string }; onDone: () => void }) {
  const router = useRouter(); const plants = useApi<any[]>('/plants'); const [plant, setPlant] = useState('');
  const assets = useApi<{ items: any[] }>(plant ? `/assets?plantId=${plant}&size=200` : null);
  const [msg, setMsg] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); setMsg('');
    try { const r = await api<any>('/rca/cases', { method: 'POST', body: { plantId: plant, assetId: String(f.get('assetId')), title: String(f.get('title')), problem: String(f.get('problem') ?? '') } }); onDone(); router.push(`/rca/${r.id}`); }
    catch (er: any) { setMsg(er.message); }
  }
  return (
    <form onSubmit={submit} className="card grid gap-3 sm:grid-cols-2">
      <Field label="Plant"><select className="input" value={plant} onChange={(e) => setPlant(e.target.value)} required><option value="">Pilih…</option>{plants.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Aset"><select name="assetId" className="input" required defaultValue={preset?.assetId ?? ''}><option value="">Pilih…</option>{assets.data?.items.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
      <div className="sm:col-span-2"><Field label="Judul masalah"><input name="title" className="input" required minLength={3} defaultValue={preset?.title ?? ''} /></Field></div>
      <div className="sm:col-span-2"><Field label="Uraian masalah"><textarea name="problem" className="input" rows={2} /></Field></div>
      <div className="flex items-center gap-3 sm:col-span-2"><button className="btn">Buat RCA</button>{msg && <span role="alert" className="text-sm text-red-600">{msg}</span>}</div>
    </form>
  );
}

function Cases() {
  const [stage, setStage] = useState('open'); const [show, setShow] = useState(false);
  const list = useApi<any[]>(`/rca/cases?stage=${stage}`);
  const can = ['admin', 'supervisor', 'planner'].includes(getUser()?.role ?? '');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input max-w-[12rem]" value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Filter tahap"><option value="open">Masih berjalan</option>{Object.entries(STAGE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {can && <button className="btn" onClick={() => setShow(!show)}>{show ? 'Tutup form' : 'RCA baru'}</button>}
      </div>
      {show && <NewCase onDone={() => { setShow(false); list.reload(); }} />}
      {list.error && <p className="text-red-600">{list.error}</p>}
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-2">Kode</th><th>Aset</th><th>Judul</th><th>Tahap</th><th>Tindakan</th><th>Dibuat</th></tr></thead>
        <tbody>{list.data?.map((r) => (<tr key={r.id} className="border-t hover:bg-slate-50"><td className="p-2 font-mono"><Link className="text-blue-700 underline" href={`/rca/${r.id}`}>{r.code}</Link></td><td>{r.assetCode}</td><td>{r.title}</td>
          <td><span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{STAGE[r.stage]}</span></td><td>{r.actionsDone}/{r.actionsTotal}</td><td>{new Date(r.createdAt).toLocaleDateString('id-ID')}</td></tr>))}
          {list.data?.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-500">Belum ada kasus RCA.</td></tr>}</tbody></table></div>
    </div>
  );
}

function Candidates() {
  const cand = useApi<any[]>('/rca/candidates'); const [pick, setPick] = useState<any>(null);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Aset dengan minimal 3 kerusakan (breakdown/emergency) dalam 90 hari terakhir yang belum punya RCA aktif.</p>
      {pick && <NewCase preset={{ assetId: pick.assetId, title: `Kerusakan berulang ${pick.code}` }} onDone={() => { setPick(null); cand.reload(); }} />}
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-2">Aset</th><th>Kerusakan</th><th>Downtime (jam)</th><th>Terakhir</th><th></th></tr></thead>
        <tbody>{cand.data?.map((a) => (<tr key={a.assetId} className="border-t"><td className="p-2">{a.code} — {a.name}</td><td>{a.breakdowns}×</td><td>{fmt(a.downtimeH, 1)}</td><td>{a.lastAt ? new Date(a.lastAt).toLocaleDateString('id-ID') : '—'}</td>
          <td><button className="btn-ghost" onClick={() => setPick(a)}>Mulai RCA</button></td></tr>))}
          {cand.data?.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-slate-500">Tidak ada aset yang memenuhi kriteria.</td></tr>}</tbody></table></div>
    </div>
  );
}

function Fmea() {
  const list = useApi<any[]>('/rca/fmea'); const modes = useApi<any[]>('/rca/failure-modes'); const plants = useApi<any[]>('/plants');
  const [plant, setPlant] = useState(''); const [asset, setAsset] = useState(''); const [fm, setFm] = useState('');
  const assets = useApi<{ items: any[] }>(plant ? `/assets?plantId=${plant}&size=200` : null);
  const sug = useApi<any>(asset ? `/rca/fmea/suggest?assetId=${asset}${fm ? `&failureModeId=${fm}` : ''}` : null);
  const [occ, setOcc] = useState(''); const [show, setShow] = useState(false); const [msg, setMsg] = useState('');
  const can = ['admin', 'supervisor', 'planner'].includes(getUser()?.role ?? '');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); setMsg('');
    try {
      await api('/rca/fmea', { method: 'POST', body: { plantId: plant, assetId: asset, functionDesc: String(f.get('fn')), failureModeId: fm || null, failureModeText: fm ? null : String(f.get('fmt') || '') || null,
        effect: String(f.get('effect')), cause: String(f.get('cause')), severity: Number(f.get('s')), occurrence: Number(occ || sug.data?.occurrence || 0), detection: Number(f.get('d')),
        currentControls: String(f.get('ctl') || '') || null, recommendedAction: String(f.get('rec') || '') || null } });
      setShow(false); list.reload();
    } catch (er: any) { setMsg(er.message); }
  }
  const sel = (n: string, label: string, hint: string) => <Field label={label}><select name={n} className="input" required defaultValue="" title={hint}><option value="" disabled>1–10</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></Field>;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><p className="text-sm text-slate-600">RPN = Severity × Occurrence × Detection. ≥200 tinggi, ≥100 sedang.</p>{can && <button className="btn" onClick={() => setShow(!show)}>{show ? 'Tutup' : 'Item FMEA baru'}</button>}</div>
      {show && <form onSubmit={submit} className="card grid gap-3 sm:grid-cols-3">
        <Field label="Plant"><select className="input" value={plant} onChange={(e) => { setPlant(e.target.value); setAsset(''); }} required><option value="">Pilih…</option>{plants.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Aset"><select className="input" value={asset} onChange={(e) => setAsset(e.target.value)} required><option value="">Pilih…</option>{assets.data?.items.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
        <Field label="Fungsi"><input name="fn" className="input" required /></Field>
        <Field label="Mode kegagalan"><select className="input" value={fm} onChange={(e) => setFm(e.target.value)}><option value="">Tulis sendiri…</option>{modes.data?.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        {!fm && <Field label="Mode kegagalan (teks)"><input name="fmt" className="input" required /></Field>}
        <Field label="Efek"><input name="effect" className="input" required /></Field><Field label="Penyebab"><input name="cause" className="input" required /></Field>
        {sel('s', 'Severity', '10 = membahayakan keselamatan / berhenti total')}
        <Field label={`Occurrence${sug.data ? ` (saran ${sug.data.occurrence}, ${sug.data.events} kejadian/12 bln)` : ''}`}>
          <select className="input" value={occ || (sug.data ? String(sug.data.occurrence) : '')} onChange={(e) => setOcc(e.target.value)} required><option value="" disabled>1–10</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></Field>
        {sel('d', 'Detection', '10 = hampir tidak mungkin terdeteksi sebelum gagal')}
        <Field label="Kontrol saat ini"><input name="ctl" className="input" /></Field><div className="sm:col-span-2"><Field label="Tindakan yang disarankan"><input name="rec" className="input" /></Field></div>
        <div className="flex items-center gap-3 sm:col-span-3"><button className="btn">Simpan</button>{msg && <span role="alert" className="text-sm text-red-600">{msg}</span>}</div></form>}
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-2">Aset</th><th>Mode kegagalan</th><th>Efek</th><th>S</th><th>O</th><th>D</th><th>RPN</th><th>Status</th><th></th></tr></thead>
        <tbody>{list.data?.map((f) => (<tr key={f.id} className="border-t align-top"><td className="p-2">{f.assetCode}</td><td>{f.failureMode}<div className="text-xs text-slate-500">{f.cause}</div></td><td>{f.effect}</td><td>{f.severity}</td><td>{f.occurrence}</td><td>{f.detection}</td>
          <td><span className={`rounded px-2 py-0.5 font-medium ${rpnClass(f.rpn)}`}>{f.rpn}</span></td>
          <td>{can ? <select className="input" value={f.status} onChange={(e) => api(`/rca/fmea/${f.id}`, { method: 'PATCH', body: { status: e.target.value } }).then(list.reload)}><option value="open">Terbuka</option><option value="mitigated">Dimitigasi</option><option value="accepted">Diterima</option></select> : f.status}</td>
          <td className="text-xs text-slate-500">{f.recommendedAction}</td></tr>))}
          {list.data?.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-slate-500">Belum ada item FMEA.</td></tr>}</tbody></table></div>
    </div>
  );
}

function Pareto() {
  const P = useMemo(() => { const t = new Date(); const f = new Date(t); f.setDate(f.getDate() - 89); return { from: ymd(f), to: ymd(t) }; }, []);
  const [range, setRange] = useState(P); const d = useApi<any[]>(`/rca/pareto?from=${range.from}&to=${range.to}&limit=10`);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2"><Field label="Dari"><input type="date" className="input" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
        <Field label="Sampai"><input type="date" className="input" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field></div>
      <ChartCard title="Penyebab kerusakan terbanyak" note="Jumlah WO non-preventif selesai per mode kegagalan. WO tanpa mode kegagalan tidak dihitung."
        chart={<HBars rows={(d.data ?? []).map((r) => ({ label: r.name, value: r.events, extra: `${fmt(r.sharePct, 1)}% · kum. ${fmt(r.cumPct, 1)}%` }))} unit=" kejadian" />}
        table={<SimpleTable head={['Mode kegagalan', 'Kategori', 'Kejadian', 'Downtime (jam)', 'Porsi %', 'Kumulatif %']} rows={(d.data ?? []).map((r) => [r.name, r.category, r.events, fmt(r.downtimeH, 1), fmt(r.sharePct, 1), fmt(r.cumPct, 1)])} />} />
      {d.data?.length === 0 && <p className="text-sm text-slate-500">Belum ada WO dengan mode kegagalan pada rentang ini. Mode kegagalan diisi teknisi saat menyelesaikan WO.</p>}
    </div>
  );
}

export default function RcaPage() {
  const [tab, setTab] = useState<Tab>('cases');
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">RCA & Failure Analysis</h1>
      <div role="tablist" className="flex flex-wrap gap-1 border-b">{TABS.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${tab === k ? 'border-blue-600 font-medium text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>{l}</button>))}</div>
      {tab === 'cases' && <Cases />}{tab === 'cand' && <Candidates />}{tab === 'fmea' && <Fmea />}{tab === 'pareto' && <Pareto />}
    </div>
  );
}
