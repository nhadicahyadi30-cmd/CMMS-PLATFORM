'use client';
import { Fragment, useEffect, useState } from 'react';
import { api, getUser } from '@/lib/api';
import { useApi } from '@/lib/hooks';

type St = 'critical' | 'risk' | 'watch' | 'offline' | 'nodata' | 'ok';
interface Sensor { tagId: string; tag: string; name: string; unit: string; kind: 'gauge' | 'runhours'; lastValue: number | null; lastTs: string | null; warnHigh: number | null; critHigh: number | null; warnLow: number | null; critLow: number | null; status: St; slopePerHour: number | null; r2: number | null; etaWarnH: number | null; etaCritH: number | null; anomaly: number; anomalous: boolean; reason: string }
interface Pm { planId: string; name: string; interval: number; current: number | null; remaining: number; ratePerDay: number | null; etaDays: number | null; state: 'overdue' | 'soon' | 'ok' | 'unknown' }
interface AssetP { assetId: string; code: string; name: string; plantId: string; status: St; health: number; runningHours: number | null; sensors: Sensor[]; pm: Pm[] }
interface Pred { generatedAt: string; windowHours: number; summary: Record<string, number>; assets: AssetP[] }

const LABEL: Record<St, string> = { critical: 'Kritis', risk: 'Berisiko', watch: 'Perlu dipantau', offline: 'Offline', nodata: 'Data belum cukup', ok: 'Normal' };
const CLS: Record<St, string> = { critical: 'bg-red-100 text-red-800', risk: 'bg-orange-100 text-orange-800', watch: 'bg-amber-100 text-amber-800', offline: 'bg-slate-200 text-slate-700', nodata: 'bg-slate-100 text-slate-500', ok: 'bg-emerald-100 text-emerald-800' };
const ICON: Record<St, string> = { critical: '⛔', risk: '▲', watch: '◔', offline: '○', nodata: '·', ok: '✓' };
const hcls = (h: number) => (h >= 80 ? 'bg-emerald-500' : h >= 55 ? 'bg-amber-500' : 'bg-red-500');
const fmtH = (h: number | null) => (h == null ? '-' : h < 1 ? `${Math.round(h * 60)} mnt` : h < 48 ? `${Math.round(h)} jam` : `${Math.round(h / 24)} hari`);
const ago = (s: string | null) => { if (!s) return 'belum ada data'; const m = Math.round((Date.now() - new Date(s).getTime()) / 60000); return m < 1 ? 'baru saja' : m < 60 ? `${m} mnt lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`; };
const Pill = ({ s }: { s: St }) => <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${CLS[s]}`}><span aria-hidden="true">{ICON[s]}</span>{LABEL[s]}</span>;

function Chart({ s, hours }: { s: Sensor; hours: number }) {
  const { data } = useApi<{ ts: string; avg: number }[]>(`/telemetry/series?tagId=${s.tagId}&hours=${hours}&bucket=${hours > 48 ? '1h' : '5m'}`);
  const [hover, setHover] = useState<number | null>(null);
  if (!data?.length) return <p className="text-xs text-slate-500">Belum ada data pada jendela ini.</p>;
  const W = 640, H = 170, L = 40, R = 10, T = 10, B = 22;
  const t = data.map((d) => new Date(d.ts).getTime()), v = data.map((d) => Number(d.avg));
  const lims = [s.warnHigh, s.critHigh, s.warnLow, s.critLow].filter((x): x is number => x != null);
  const tEnd = t[t.length - 1], proj = s.slopePerHour != null && s.r2 != null && s.r2 >= 0.6 ? 6 : 0; // proyeksi 6 jam bila tren dapat dipercaya
  const yv = [...v, ...lims.filter((l) => Math.abs(l - v[v.length - 1]) < (Math.max(...v) - Math.min(...v) + 1) * 4)];
  const lo = Math.min(...yv), hi = Math.max(...yv), pad = (hi - lo || 1) * 0.08;
  const t0 = t[0], t1 = tEnd + proj * 3600000;
  const x = (tt: number) => L + ((tt - t0) / (t1 - t0 || 1)) * (W - L - R);
  const y = (val: number) => T + (1 - (val - (lo - pad)) / (hi + pad - (lo - pad))) * (H - T - B);
  const line = v.map((val, i) => `${i ? 'L' : 'M'}${x(t[i]).toFixed(1)},${y(val).toFixed(1)}`).join('');
  const last = v[v.length - 1];
  const pj = proj ? `M${x(tEnd).toFixed(1)},${y(last).toFixed(1)}L${x(t1).toFixed(1)},${y(last + s.slopePerHour! * proj).toFixed(1)}` : '';
  const ticks = [lo, (lo + hi) / 2, hi];
  const hv = hover != null ? hover : null;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Grafik ${s.name}`} onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; const tt = t0 + ((px - L) / (W - L - R)) * (t1 - t0); let b = 0; for (let i = 1; i < t.length; i++) if (Math.abs(t[i] - tt) < Math.abs(t[b] - tt)) b = i; setHover(b); }}>
        {ticks.map((tk, i) => <g key={i}><line x1={L} x2={W - R} y1={y(tk)} y2={y(tk)} stroke="#e2e8f0" strokeWidth="1" /><text x={L - 4} y={y(tk) + 3} textAnchor="end" fontSize="10" fill="#64748b">{tk.toFixed(1)}</text></g>)}
        {([['warnHigh', '#d97706', 'W'], ['critHigh', '#dc2626', 'K'], ['warnLow', '#d97706', 'W'], ['critLow', '#dc2626', 'K']] as const).map(([k, col, lb]) => { const val = s[k]; if (val == null || val < lo - pad || val > hi + pad) return null; return <g key={k}><line x1={L} x2={W - R} y1={y(val)} y2={y(val)} stroke={col} strokeWidth="1" strokeDasharray="5 4" /><text x={W - R} y={y(val) - 3} textAnchor="end" fontSize="10" fill={col}>{lb === 'W' ? 'peringatan' : 'kritis'} {val}</text></g>; })}
        <path d={line} fill="none" stroke="#0f766e" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pj && <path d={pj} fill="none" stroke="#0f766e" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" />}
        <text x={L} y={H - 6} fontSize="10" fill="#64748b">{new Date(t0).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</text>
        <text x={W - R} y={H - 6} textAnchor="end" fontSize="10" fill="#64748b">{proj ? 'sekarang → proyeksi 6 jam' : 'sekarang'}</text>
        {hv != null && <g><line x1={x(t[hv])} x2={x(t[hv])} y1={T} y2={H - B} stroke="#94a3b8" /><circle cx={x(t[hv])} cy={y(v[hv])} r="4" fill="#0f766e" stroke="#fff" strokeWidth="2" /></g>}
      </svg>
      <p className="min-h-[1.25rem] text-xs text-slate-600">{hv != null ? `${new Date(t[hv]).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${v[hv].toFixed(2)} ${s.unit}` : `Garis putus-putus = proyeksi tren (hanya tampil bila tren konsisten, r² ≥ 0,6).`}</p>
    </div>
  );
}

function SensorRow({ s, a, hours, canAlarm, onMsg }: { s: Sensor; a: AssetP; hours: number; canAlarm: boolean; onMsg: (m: string) => void }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  async function alarm() {
    setBusy(true);
    try {
      const r = await api<{ code: string }>('/alarms', { method: 'POST', body: { plantId: a.plantId, assetId: a.assetId, severity: s.status === 'critical' ? 'critical' : 'warning', message: `Prediksi ${s.name} (${a.code}): ${s.reason}. Nilai ${s.lastValue ?? '-'} ${s.unit}.` } });
      onMsg(`Alarm ${r.code} dibuat untuk ${a.code} · ${s.name}.`);
    } catch (e: any) { onMsg(e?.message ?? 'Gagal membuat alarm'); } finally { setBusy(false); }
  }
  const trend = s.slopePerHour == null ? '-' : `${s.slopePerHour > 0 ? '+' : ''}${s.slopePerHour.toFixed(2)} ${s.unit}/jam`;
  return (
    <>
      <tr className="cursor-pointer border-t hover:bg-white" onClick={() => setOpen(!open)}>
        <td className="p-2 pl-6">{s.name} <span className="font-mono text-xs text-slate-400">{s.tag}</span></td>
        <td className="font-semibold">{s.lastValue == null ? '-' : `${s.lastValue} ${s.unit}`}<div className="text-xs font-normal text-slate-500">{ago(s.lastTs)}</div></td>
        <td>{s.kind === 'runhours' ? '-' : trend}{s.r2 != null && s.kind !== 'runhours' && <div className="text-xs text-slate-500">r² {s.r2.toFixed(2)}</div>}</td>
        <td>{s.etaWarnH != null ? fmtH(s.etaWarnH) : '-'}</td><td>{s.etaCritH != null ? fmtH(s.etaCritH) : '-'}</td>
        <td><Pill s={s.status} /><div className="mt-0.5 text-xs text-slate-500">{s.reason}</div></td>
        <td className="text-right" onClick={(e) => e.stopPropagation()}>{canAlarm && (s.status === 'critical' || s.status === 'risk' || s.status === 'watch') && <button className="btn-ghost text-xs" disabled={busy} onClick={alarm}>Buat alarm</button>}</td>
      </tr>
      {open && s.kind === 'gauge' && <tr className="border-t bg-white"><td colSpan={7} className="p-3"><Chart s={s} hours={hours} /></td></tr>}
    </>
  );
}

export default function PredictionsPage() {
  const user = getUser()!; const canAlarm = ['admin', 'supervisor', 'planner', 'technician'].includes(user.role);
  const [hours, setHours] = useState(24); const [filter, setFilter] = useState<'all' | 'attn'>('all'); const [open, setOpen] = useState<string | null>(null); const [note, setNote] = useState('');
  const { data, error, reload } = useApi<Pred>(`/telemetry/predictions?hours=${hours}`);
  useEffect(() => { const t = setInterval(() => reload(), 60000); return () => clearInterval(t); }, [reload]);
  const s = data?.summary;
  const rows = (data?.assets ?? []).filter((a) => filter === 'all' || ['critical', 'risk', 'watch'].includes(a.status) || a.pm.some((p) => p.state === 'overdue' || p.state === 'soon'));
  const Card = ({ label, v, cls }: { label: string; v: number | undefined; cls: string }) => <div className="card"><div className="text-xs text-slate-500">{label}</div><div className={`text-2xl font-semibold ${cls}`}>{v ?? '-'}</div></div>;

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Predictions Dashboard</h1>
        <p className="text-sm text-slate-600">Perkiraan kapan sensor mencapai batas, penyimpangan dari pola normal, dan jadwal PM berbasis running hour. Memakai tren linear dan statistik sederhana yang bisa dijelaskan; bukan pengganti penilaian teknisi.</p></div>
      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{String(error)}</p>}
      {note && <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{note}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Card label="Aset terpantau" v={s?.assets} cls="" /><Card label="Kritis" v={s?.critical} cls="text-red-700" /><Card label="Berisiko" v={s?.risk} cls="text-orange-700" />
        <Card label="Perlu dipantau" v={s?.watch} cls="text-amber-700" /><Card label="Normal" v={s?.ok} cls="text-emerald-700" /><Card label="PM terlambat" v={s?.pmOverdue} cls="text-red-700" /><Card label="PM ≤ 7 hari" v={s?.pmSoon} cls="text-amber-700" />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">Jendela analisis<select className="input w-auto" value={hours} onChange={(e) => setHours(Number(e.target.value))}><option value={6}>6 jam</option><option value={24}>24 jam</option><option value={72}>3 hari</option><option value={168}>7 hari</option></select></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={filter === 'attn'} onChange={(e) => setFilter(e.target.checked ? 'attn' : 'all')} />Hanya yang perlu perhatian</label>
        <button className="btn-ghost" onClick={() => reload()}>Segarkan</button>
        {data && <span className="text-xs text-slate-500">Dihitung {ago(data.generatedAt)} · otomatis tiap 1 menit</span>}
      </div>
      <section className="card overflow-x-auto p-0">
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Aset</th><th>Skor kesehatan</th><th>Status</th><th>Running hour</th><th>Alasan utama</th></tr></thead>
          <tbody>{rows.map((a) => {
            const worst = a.sensors.find((x) => x.status === a.status); const pmBad = a.pm.find((p) => p.state === 'overdue') ?? a.pm.find((p) => p.state === 'soon');
            return (<Fragment key={a.assetId}>
              <tr className="cursor-pointer border-t hover:bg-slate-50" onClick={() => setOpen(open === a.assetId ? null : a.assetId)}>
                <td className="p-2"><span className="font-mono">{a.code}</span> <span className="text-slate-500">{a.name}</span></td>
                <td><div className="flex items-center gap-2"><div className="h-2 w-24 rounded bg-slate-200" role="img" aria-label={`Skor ${a.health} dari 100`}><div className={`h-2 rounded ${hcls(a.health)}`} style={{ width: `${a.health}%` }} /></div><span className="font-semibold">{a.health}</span></div></td>
                <td><Pill s={a.status} /></td><td>{a.runningHours == null ? '-' : `${a.runningHours.toLocaleString('id-ID')} jam`}</td>
                <td className="text-xs text-slate-600">{worst && worst.status !== 'ok' ? `${worst.name}: ${worst.reason}` : ''}{pmBad ? `${worst && worst.status !== 'ok' ? ' · ' : ''}PM "${pmBad.name}" ${pmBad.state === 'overdue' ? 'terlambat' : `jatuh tempo ≈ ${Math.round(pmBad.etaDays ?? 0)} hari`}` : ''}</td></tr>
              {open === a.assetId && <tr className="border-t bg-slate-50"><td colSpan={5} className="p-0">
                <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th className="p-2 pl-6">Sensor</th><th>Nilai</th><th>Tren</th><th>Batas peringatan</th><th>Batas kritis</th><th>Status</th><th /></tr></thead>
                  <tbody>{a.sensors.map((x) => <SensorRow key={x.tagId} s={x} a={a} hours={Math.max(hours, 24)} canAlarm={canAlarm} onMsg={setNote} />)}</tbody></table>
                {a.pm.length > 0 && <div className="border-t p-3"><div className="mb-1 text-xs font-medium uppercase text-slate-500">Perkiraan PM berbasis running hour</div>
                  <ul className="space-y-1 text-sm">{a.pm.map((p) => <li key={p.planId}><b>{p.name}</b>: {p.state === 'unknown' ? 'belum cukup data laju pemakaian' : p.state === 'overdue' ? `terlambat ${Math.abs(Math.round(p.remaining))} jam` : `sisa ${Math.round(p.remaining)} jam ≈ ${Math.round(p.etaDays ?? 0)} hari (laju ${p.ratePerDay?.toFixed(1)} jam/hari)`} <span className="text-xs text-slate-500">· interval {p.interval} jam</span></li>)}</ul></div>}
              </td></tr>}
            </Fragment>); })}
            {data && !rows.length && <tr><td colSpan={5} className="p-4 text-center text-slate-500">{filter === 'attn' ? 'Tidak ada aset yang perlu perhatian.' : 'Belum ada sensor aktif. Tambahkan sensor di Telemetri Mesin.'}</td></tr>}</tbody></table>
      </section>
      <p className="text-xs text-slate-500">Cara membaca: ETA hanya dihitung jika tren konsisten (r² ≥ 0,6) dan dibatasi 30 hari. “Perlu dipantau” berarti batas peringatan diperkirakan tercapai ≤ 7 hari atau nilai menyimpang dari pola biasanya. Skor kesehatan = 100 dikurangi penalti status sensor dan PM.</p>
    </div>
  );
}
