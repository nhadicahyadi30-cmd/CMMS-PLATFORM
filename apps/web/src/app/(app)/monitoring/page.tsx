'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useApi } from '@/lib/hooks';

type Level = 'ok' | 'warning' | 'critical'; type Conn = 'online' | 'delayed' | 'offline' | 'never'; type Run = 'running' | 'stopped' | 'unknown';
interface Sensor { tagId: string; tag: string; name: string; unit: string; kind: 'gauge' | 'runhours'; lastValue: number | null; lastTs: string | null; warnHigh: number | null; critHigh: number | null; warnLow: number | null; critLow: number | null; level: Level; spark: number[] }
interface Asset { assetId: string; code: string; name: string; lastTs: number | null; runningHours: number | null; runState: Run; conn: Conn; level: Level; sensors: Sensor[] }
interface Mon { generatedAt: string; minutes: number; summary: Record<string, number>; assets: Asset[] }

const LVL: Record<Level, { t: string; c: string; i: string; bar: string }> = {
  ok: { t: 'Normal', c: 'bg-emerald-100 text-emerald-800', i: '✓', bar: 'bg-emerald-500' },
  warning: { t: 'Peringatan', c: 'bg-amber-100 text-amber-800', i: '▲', bar: 'bg-amber-500' },
  critical: { t: 'Kritis', c: 'bg-red-100 text-red-800', i: '⛔', bar: 'bg-red-500' },
};
const CONN: Record<Conn, { t: string; c: string }> = { online: { t: 'Online', c: 'text-emerald-700' }, delayed: { t: 'Tertunda', c: 'text-amber-700' }, offline: { t: 'Offline', c: 'text-slate-500' }, never: { t: 'Belum ada data', c: 'text-slate-400' } };
const RUN: Record<Run, { t: string; c: string }> = { running: { t: '● JALAN', c: 'bg-emerald-600 text-white' }, stopped: { t: '■ BERHENTI', c: 'bg-slate-300 text-slate-800' }, unknown: { t: '? —', c: 'bg-slate-100 text-slate-500' } };
const ago = (ms: number | null, now: number) => { if (ms == null) return 'belum ada data'; const s = Math.max(0, Math.round((now - ms) / 1000)); return s < 60 ? `${s} dtk lalu` : s < 3600 ? `${Math.round(s / 60)} mnt lalu` : s < 86400 ? `${Math.round(s / 3600)} jam lalu` : `${Math.round(s / 86400)} hari lalu`; };
const fmt = (v: number | null, d = 1) => (v == null ? '-' : v.toLocaleString('id-ID', { maximumFractionDigits: d }));

function Spark({ v, level }: { v: number[]; level: Level }) {
  if (v.length < 2) return <div className="h-8 text-xs text-slate-400">tren belum tersedia</div>;
  const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
  const pts = v.map((y, i) => `${(i / (v.length - 1)) * 100},${28 - ((y - lo) / r) * 24}`).join(' ');
  const col = level === 'critical' ? '#dc2626' : level === 'warning' ? '#d97706' : '#0f766e';
  return <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full" aria-hidden="true"><polyline points={pts} fill="none" stroke={col} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></svg>;
}

function Gauge({ s, now }: { s: Sensor; now: number }) {
  const top = s.critHigh ?? s.warnHigh; const max = top != null ? top * 1.15 : null;
  const pct = max && s.lastValue != null ? Math.min(100, Math.max(0, (s.lastValue / max) * 100)) : null;
  const stale = s.lastTs == null || now - new Date(s.lastTs).getTime() > 15 * 60_000;
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-baseline justify-between gap-2"><span className="text-sm text-slate-600">{s.name}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${stale ? 'bg-slate-100 text-slate-500' : LVL[s.level].c}`}>{stale ? 'Tidak ada data' : <><span aria-hidden="true">{LVL[s.level].i}</span> {LVL[s.level].t}</>}</span></div>
      <div className={`mt-1 text-2xl font-semibold ${stale ? 'text-slate-400' : ''}`}>{fmt(s.lastValue, 2)} <span className="text-sm font-normal text-slate-500">{s.unit}</span></div>
      {pct != null && <div className="relative mt-2 h-2 rounded bg-slate-200" role="img" aria-label={`${fmt(s.lastValue)} dari batas ${top}`}>
        <div className={`h-2 rounded ${stale ? 'bg-slate-400' : LVL[s.level].bar}`} style={{ width: `${pct}%` }} />
        {s.warnHigh != null && max && <span className="absolute top-[-3px] h-[14px] w-px bg-amber-600" style={{ left: `${(s.warnHigh / max) * 100}%` }} title={`peringatan ${s.warnHigh}`} />}
        {s.critHigh != null && max && <span className="absolute top-[-3px] h-[14px] w-px bg-red-600" style={{ left: `${(s.critHigh / max) * 100}%` }} title={`kritis ${s.critHigh}`} />}</div>}
      <div className="mt-2"><Spark v={s.spark} level={stale ? 'ok' : s.level} /></div>
    </div>
  );
}

export default function MonitoringPage() {
  const [minutes, setMinutes] = useState(60); const [attn, setAttn] = useState(false); const [q, setQ] = useState(''); const [now, setNow] = useState(Date.now());
  const { data, error, reload } = useApi<Mon>(`/telemetry/monitor?minutes=${minutes}`);
  useEffect(() => { const t = setInterval(() => { reload(); }, 15000); const c = setInterval(() => setNow(Date.now()), 1000); return () => { clearInterval(t); clearInterval(c); }; }, [reload]);
  const s = data?.summary;
  const rows = (data?.assets ?? []).filter((a) => (!attn || a.level !== 'ok' || a.conn === 'offline') && (!q || `${a.code} ${a.name}`.toLowerCase().includes(q.toLowerCase())));
  const Card = ({ label, v, cls = '' }: { label: string; v: number | undefined; cls?: string }) => <div className="card"><div className="text-xs text-slate-500">{label}</div><div className={`text-2xl font-semibold ${cls}`}>{v ?? '-'}</div></div>;
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Monitoring Mesin</h1><p className="text-sm text-slate-600">Kondisi mesin secara langsung dari perangkat RTU/Node-RED: nilai sensor, status jalan/berhenti, dan koneksi. Diperbarui otomatis tiap 15 detik. Untuk perkiraan ke depan lihat <Link href="/predictions" className="text-blue-700 underline">Dashboard Prediksi</Link>.</p></div>
      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{String(error)}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card label="Mesin terpantau" v={s?.assets} /><Card label="Online" v={s?.online} cls="text-emerald-700" /><Card label="Offline" v={s?.offline} cls="text-slate-600" />
        <Card label="Sedang jalan" v={s?.running} cls="text-emerald-700" /><Card label="Peringatan" v={s?.warning} cls="text-amber-700" /><Card label="Kritis" v={s?.critical} cls="text-red-700" />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <input className="input w-56" placeholder="Cari kode / nama mesin" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari mesin" />
        <label className="flex items-center gap-2">Tren<select className="input w-auto" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}><option value={30}>30 menit</option><option value={60}>1 jam</option><option value={180}>3 jam</option><option value={720}>12 jam</option></select></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={attn} onChange={(e) => setAttn(e.target.checked)} />Hanya yang perlu perhatian</label>
        <button className="btn-ghost" onClick={() => reload()}>Segarkan</button>
        {data && <span className="text-xs text-slate-500">Diperbarui {ago(new Date(data.generatedAt).getTime(), now)}</span>}
      </div>
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {rows.map((a) => (
          <section key={a.assetId} className={`card space-y-3 border-l-4 ${a.level === 'critical' ? 'border-l-red-500' : a.level === 'warning' ? 'border-l-amber-500' : 'border-l-emerald-500'}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><div className="font-mono text-sm text-slate-500">{a.code}</div><div className="text-lg font-semibold">{a.name}</div>
                <div className={`text-xs ${CONN[a.conn].c}`}>● {CONN[a.conn].t} · data {ago(a.lastTs, now)}</div></div>
              <div className="text-right"><span className={`inline-block rounded px-2 py-1 text-xs font-semibold ${RUN[a.runState].c}`}>{RUN[a.runState].t}</span>
                <div className="mt-1 text-xs text-slate-500">Running hour</div><div className="text-lg font-semibold">{a.runningHours == null ? '-' : `${fmt(a.runningHours, 1)} jam`}</div></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">{a.sensors.filter((x) => x.kind === 'gauge').map((x) => <Gauge key={x.tagId} s={x} now={now} />)}</div>
          </section>))}
      </div>
      {data && !rows.length && <div className="card text-center text-sm text-slate-600">{data.assets.length ? 'Tidak ada mesin yang cocok dengan filter.' : <>Belum ada mesin dengan sensor. Buat API key dan sensor di <Link href="/telemetry" className="text-blue-700 underline">Telemetri Mesin</Link>, lalu nyalakan ESP32 (panduan: <code>docs/ESP32.md</code>) atau jalankan simulator.</>}</div>}
    </div>
  );
}
