'use client';
import { useMemo, useState } from 'react';
import { downloadFile } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { ChartCard, fmt, HBars, LineChart, S, SimpleTable, VBars } from '@/components/charts';

type Tab = 'ov' | 'fail' | 'backlog' | 'tech' | 'cost' | 'rep';
const TABS: [Tab, string][] = [['ov', 'Ringkasan'], ['fail', 'Kerusakan'], ['backlog', 'Backlog & SLA'], ['tech', 'Teknisi'], ['cost', 'Biaya'], ['rep', 'Laporan']];
const TARGET = { availability: 95, pm: 90, sla: 90 }; // target bawaan; dapat dijadikan pengaturan organisasi di tahap berikutnya
const rp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthLabel = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });

function presets() {
  const t = new Date(); const y = (n: number) => { const d = new Date(t); d.setDate(d.getDate() - n); return ymd(d); };
  return [
    { k: 'month', l: 'Bulan ini', from: ymd(new Date(t.getFullYear(), t.getMonth(), 1)), to: ymd(t) },
    { k: 'd30', l: '30 hari', from: y(29), to: ymd(t) },
    { k: 'd90', l: '90 hari', from: y(89), to: ymd(t) },
    { k: 'year', l: 'Tahun ini', from: ymd(new Date(t.getFullYear(), 0, 1)), to: ymd(t) },
  ];
}

interface Card { label: string; value: string; unit?: string; delta?: string; good?: boolean | null; target?: string; hint: string }
function KpiCard({ c }: { c: Card }) {
  return (
    <div className="card" title={c.hint}>
      <div className="text-xs text-slate-500">{c.label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{c.value}<span className="ml-1 text-sm font-normal text-slate-500">{c.unit}</span></div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
        {c.delta && <span>{c.delta}</span>}
        {c.good !== null && c.good !== undefined && (c.good ? <span className="text-emerald-700">✓ memenuhi target {c.target}</span> : <span className="text-amber-700">⚠ di bawah target {c.target}</span>)}
      </div>
    </div>
  );
}

export default function Kpi() {
  const P = useMemo(presets, []);
  const [preset, setPreset] = useState('month'); const [from, setFrom] = useState(P[0].from); const [to, setTo] = useState(P[0].to);
  const [plant, setPlant] = useState(''); const [tab, setTab] = useState<Tab>('ov');
  const plants = useApi<any[]>('/plants');
  const qs = `from=${from}&to=${to}${plant ? `&plantId=${plant}` : ''}`; const qp = plant ? `plantId=${plant}` : '';
  const ov = useApi<any>(`/kpi/overview?${qs}`);
  const trend = useApi<any[]>(`/kpi/trend?months=12${plant ? `&plantId=${plant}` : ''}`);
  const pareto = useApi<any[]>(tab === 'fail' ? `/kpi/pareto?${qs}&limit=10` : null);
  const backlog = useApi<any[]>(tab === 'backlog' ? `/kpi/backlog?${qp}` : null);
  const techs = useApi<any[]>(tab === 'tech' ? `/kpi/technicians?${qs}` : null);
  const costA = useApi<any[]>(tab === 'cost' ? `/kpi/cost-assets?${qs}&limit=10` : null);
  const [err, setErr] = useState('');

  const cur = ov.data?.current, prev = ov.data?.previous;
  const d = (a?: number | null, b?: number | null, unit = '', dig = 1) => (a == null || b == null) ? undefined : `${Number(a) - Number(b) >= 0 ? '▲' : '▼'} ${fmt(Math.abs(Number(a) - Number(b)), dig)}${unit} vs periode lalu`;
  const cards: Card[] = cur ? [
    { label: 'Availability', value: fmt(cur.availabilityPct, 2), unit: '%', delta: d(cur.availabilityPct, prev.availabilityPct, ' pt', 2), good: cur.availabilityPct == null ? null : cur.availabilityPct >= TARGET.availability, target: `${TARGET.availability}%`, hint: '1 − downtime ÷ jam terjadwal (jam operasi plant × equipment aktif × hari)' },
    { label: 'MTTR', value: fmt(cur.mttrH, 1), unit: 'jam', delta: d(cur.mttrH, prev.mttrH, ' jam'), hint: 'Rata-rata jam kerja aktual WO breakdown/emergency/korektif yang selesai di periode (lebih kecil lebih baik)' },
    { label: 'MTBF', value: fmt(cur.mtbfH, 0), unit: 'jam', delta: d(cur.mtbfH, prev.mtbfH, ' jam', 0), hint: '(jam terjadwal − downtime) ÷ jumlah breakdown' },
    { label: 'Kepatuhan PM', value: fmt(cur.pmCompliancePct, 1), unit: '%', delta: d(cur.pmCompliancePct, prev.pmCompliancePct, ' pt'), good: cur.pmCompliancePct == null ? null : cur.pmCompliancePct >= TARGET.pm, target: `${TARGET.pm}%`, hint: `${cur.pmOntime} dari ${cur.pmDue} WO preventif jatuh tempo selesai paling lambat 2 hari setelah jatuh tempo` },
    { label: 'Ketepatan SLA', value: fmt(cur.slaPct, 1), unit: '%', delta: d(cur.slaPct, prev.slaPct, ' pt'), good: cur.slaPct == null ? null : cur.slaPct >= TARGET.sla, target: `${TARGET.sla}%`, hint: `${cur.slaMet} dari ${cur.slaDone} WO selesai sebelum batas resolusi` },
    { label: 'Backlog', value: fmt(cur.backlog), unit: 'WO', delta: cur.backlogOverdue ? `${cur.backlogOverdue} melewati SLA` : 'tidak ada yang melewati SLA', hint: 'WO belum tuntas (menunggu approval, disetujui, ditugaskan, dikerjakan) saat ini' },
  ] : [];

  const months = (trend.data ?? []).map((r) => monthLabel(r.month));
  const T = trend.data ?? [];
  const download = async (r: string) => { setErr(''); try { await downloadFile(`/kpi/export?report=${r}&${qs}`); } catch (e: any) { setErr(e.message); } };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><h1 className="text-xl font-semibold">KPI Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-40" value={plant} onChange={(e) => setPlant(e.target.value)} aria-label="Plant"><option value="">Semua plant</option>{plants.data?.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select>
          {P.map((p) => <button key={p.k} className={preset === p.k ? 'btn' : 'btn-ghost'} onClick={() => { setPreset(p.k); setFrom(p.from); setTo(p.to); }}>{p.l}</button>)}
          <input type="date" className="input w-36" value={from} max={to} onChange={(e) => { setPreset('custom'); setFrom(e.target.value); }} aria-label="Dari" />
          <input type="date" className="input w-36" value={to} min={from} onChange={(e) => { setPreset('custom'); setTo(e.target.value); }} aria-label="Sampai" /></div></div>
      {ov.error && <p role="alert" className="text-sm text-red-600">{ov.error}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{cards.map((c) => <KpiCard key={c.label} c={c} />)}</div>
      <div className="flex flex-wrap gap-2">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'btn' : 'btn-ghost'} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'ov' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Breakdown per bulan" note="WO breakdown/emergency yang selesai" chart={<VBars labels={months} series={[{ name: 'Breakdown', values: T.map((r) => r.breakdowns) }]} />}
            table={<SimpleTable head={['Bulan', 'Breakdown']} rows={T.map((r, i) => [months[i], r.breakdowns])} />} />
          <ChartCard title="Downtime per bulan (jam)" chart={<VBars labels={months} unit=" jam" digits={1} series={[{ name: 'Downtime', values: T.map((r) => Number(r.downtimeH)) }]} />}
            table={<SimpleTable head={['Bulan', 'Downtime (jam)']} rows={T.map((r, i) => [months[i], fmt(Number(r.downtimeH), 1)])} />} />
          <ChartCard title="MTTR per bulan (jam)" note="Lebih rendah lebih baik" chart={<LineChart labels={months} unit=" jam" series={[{ name: 'MTTR', values: T.map((r) => (r.mttrH == null ? null : Number(r.mttrH))) }]} />}
            table={<SimpleTable head={['Bulan', 'MTTR (jam)']} rows={T.map((r, i) => [months[i], fmt(r.mttrH == null ? null : Number(r.mttrH), 2)])} />} />
          <ChartCard title="Kepatuhan PM per bulan (%)" note={`Target ${TARGET.pm}%`} chart={<LineChart labels={months} unit="%" min={0} max={100} series={[{ name: 'Kepatuhan PM', values: T.map((r) => (r.pmDue ? Math.round((1000 * r.pmOntime) / r.pmDue) / 10 : null)) }]} />}
            table={<SimpleTable head={['Bulan', 'Jatuh tempo', 'Tepat waktu', '%']} rows={T.map((r, i) => [months[i], r.pmDue, r.pmOntime, r.pmDue ? fmt((100 * r.pmOntime) / r.pmDue, 1) : '—'])} />} />
        </div>)}

      {tab === 'fail' && (
        <ChartCard title="Pareto downtime per aset" note="10 aset dengan downtime terbanyak pada periode" chart={pareto.data?.length ? <HBars rows={pareto.data.map((r) => ({ label: `${r.code} ${r.name}`, value: Number(r.downtimeH), extra: `${fmt(Number(r.cumPct), 0)}% kum.` }))} unit=" jam" digits={1} /> : <p className="py-6 text-center text-sm text-slate-500">Tidak ada downtime pada periode ini.</p>}
          table={<SimpleTable head={['Aset', 'Breakdown', 'Downtime (jam)', '% total', '% kumulatif']} rows={(pareto.data ?? []).map((r) => [`${r.code} ${r.name}`, r.breakdowns, fmt(Number(r.downtimeH), 1), fmt(Number(r.sharePct), 1), fmt(Number(r.cumPct), 1)])} />} />)}

      {tab === 'backlog' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Umur backlog" note="WO belum tuntas menurut umurnya" series={[{ name: 'Dalam SLA', values: [] }, { name: 'Melewati SLA', values: [] }]}
            chart={<VBars stacked labels={(backlog.data ?? []).map((r) => r.bucket)} series={[{ name: 'Dalam SLA', values: (backlog.data ?? []).map((r) => r.n - r.overdue) }, { name: 'Melewati SLA', values: (backlog.data ?? []).map((r) => r.overdue) }]} />}
            table={<SimpleTable head={['Umur', 'Jumlah', 'Melewati SLA']} rows={(backlog.data ?? []).map((r) => [r.bucket, r.n, r.overdue])} />} />
          <div className="card text-sm"><h3 className="mb-1 font-semibold">Ketepatan SLA periode ini</h3>
            <p>{cur ? `${cur.slaMet} dari ${cur.slaDone} WO selesai sebelum batas resolusi (${fmt(cur.slaPct, 1)}%).` : '—'}</p>
            <p className="mt-2 text-slate-600">{cur ? `${cur.backlog} WO belum tuntas, ${cur.backlogOverdue} di antaranya sudah melewati batas SLA.` : ''}</p></div>
        </div>)}

      {tab === 'tech' && (
        <ChartCard title="Produktivitas teknisi" note="WO selesai pada periode" chart={techs.data?.length ? <HBars rows={techs.data.map((r) => ({ label: r.name, value: r.done, extra: `${fmt(Number(r.hours), 1)} jam` }))} color={S[0]} /> : <p className="py-6 text-center text-sm text-slate-500">Belum ada data teknisi.</p>}
          table={<SimpleTable head={['Teknisi', 'WO selesai', 'Jam kerja', 'Rata-rata/WO (jam)', 'SLA %']} rows={(techs.data ?? []).map((r) => [r.name, r.done, fmt(Number(r.hours), 1), fmt(r.avgH == null ? null : Number(r.avgH), 2), fmt(r.slaPct == null ? null : Number(r.slaPct), 1)])} />} />)}

      {tab === 'cost' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Biaya maintenance per bulan" note="Suku cadang (dari mutasi stok) + tenaga kerja (jam aktual × tarif teknisi)" series={[{ name: 'Suku cadang', values: [] }, { name: 'Tenaga kerja', values: [] }]}
            chart={<VBars stacked labels={months} series={[{ name: 'Suku cadang', values: T.map((r) => Number(r.partsCost)) }, { name: 'Tenaga kerja', values: T.map((r) => Number(r.laborCost)) }]} />}
            table={<SimpleTable head={['Bulan', 'Suku cadang', 'Tenaga kerja', 'Total']} rows={T.map((r, i) => [months[i], rp(Number(r.partsCost)), rp(Number(r.laborCost)), rp(Number(r.partsCost) + Number(r.laborCost))])} />} />
          <ChartCard title="Biaya per aset (10 teratas)" chart={costA.data?.length ? <HBars rows={costA.data.map((r) => ({ label: `${r.code} ${r.name}`, value: Number(r.totalCost) }))} color={S[0]} /> : <p className="py-6 text-center text-sm text-slate-500">Tidak ada biaya pada periode ini.</p>}
            table={<SimpleTable head={['Aset', 'WO', 'Suku cadang', 'Tenaga kerja', 'Total']} rows={(costA.data ?? []).map((r) => [`${r.code} ${r.name}`, r.woCount, rp(Number(r.partsCost)), rp(Number(r.laborCost)), rp(Number(r.totalCost))])} />} />
          {cur && <div className="card text-sm lg:col-span-2">Periode ini: suku cadang <b>{rp(Number(cur.partsCost))}</b> + tenaga kerja <b>{rp(Number(cur.laborCost))}</b> = <b>{rp(Number(cur.partsCost) + Number(cur.laborCost))}</b>. Tarif per jam teknisi diatur di Administrasi → Teknisi.</div>}
        </div>)}

      {tab === 'rep' && (
        <div className="card space-y-3 text-sm"><p>Unduh laporan periode {from} s.d. {to}{plant ? ' (plant terpilih)' : ' (semua plant)'} dalam format CSV, siap dibuka di Excel.</p>
          <div className="flex flex-wrap gap-2"><button className="btn" onClick={() => download('wo')}>Daftar WO selesai</button><button className="btn" onClick={() => download('downtime')}>Downtime per aset</button><button className="btn" onClick={() => download('cost')}>Biaya per aset</button></div>
          {err && <p role="alert" className="text-red-600">{err}</p>}</div>)}
    </div>
  );
}
