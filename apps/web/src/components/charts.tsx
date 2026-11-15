'use client';
import { ReactNode, useState } from 'react';

// Palet kategorikal tetap (urutan hue tidak diputar): biru, oranye, aqua. Teks tidak pernah memakai warna seri.
export const S = ['#2a78d6', '#eb6834', '#1baf7a'];
const INK = '#475569', GRID = '#e2e8f0';
export const fmt = (n: number | null | undefined, d = 0) => (n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: 0 }));

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

export interface Series { name: string; values: (number | null)[]; color?: string }
interface Tip { x: number; y: number; lines: string[] }

/** Kartu grafik: judul, catatan, legenda (>=2 seri), grafik + tombol tampilan tabel. */
export function ChartCard({ title, note, series, chart, table }: { title: string; note?: string; series?: Series[]; chart: ReactNode; table: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="card">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div><h3 className="text-sm font-semibold">{title}</h3>{note && <p className="text-xs text-slate-500">{note}</p>}</div>
        <button className="shrink-0 text-xs text-slate-600 underline" onClick={() => setAsTable(!asTable)}>{asTable ? 'Lihat grafik' : 'Lihat tabel'}</button>
      </div>
      {series && series.length > 1 && (
        <div className="mb-1 flex flex-wrap gap-3 text-xs text-slate-600">{series.map((s, i) => (
          <span key={s.name} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color ?? S[i] }} />{s.name}</span>))}</div>)}
      {asTable ? <div className="overflow-x-auto text-sm">{table}</div> : chart}
    </section>
  );
}

function TipBox({ tip, w, h }: { tip: Tip | null; w: number; h: number }) {
  if (!tip) return null;
  const right = tip.x > w * 0.6;
  return (
    <div role="tooltip" className="pointer-events-none absolute z-10 rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
      style={{ left: `${(tip.x / w) * 100}%`, top: `${(tip.y / h) * 100}%`, transform: `translate(${right ? '-105%' : '5%'}, -50%)` }}>
      {tip.lines.map((l, i) => <div key={i} className={i === 0 ? 'font-medium text-slate-900' : 'text-slate-600'}>{l}</div>)}</div>
  );
}

/** Batang vertikal: 1 seri, atau bertumpuk (2–3 seri) dengan jarak 2px antar segmen dan ujung atas membulat 4px. */
export function VBars({ labels, series, unit = '', stacked = false, digits = 0 }: { labels: string[]; series: Series[]; unit?: string; stacked?: boolean; digits?: number }) {
  const W = 560, H = 220, L = 44, R = 8, T = 10, B = 28;
  const [tip, setTip] = useState<Tip | null>(null);
  const n = labels.length; const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0));
  const maxV = niceMax(stacked ? Math.max(...totals, 0) : Math.max(...series.flatMap((s) => s.values.map((v) => v ?? 0)), 0));
  const iw = W - L - R, ih = H - T - B, slot = iw / n, grp = Math.min(slot * 0.7, 40 * (stacked ? 1 : series.length));
  const y = (v: number) => T + ih - (v / maxV) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxV);
  return (
    <div className="relative"><svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={series.map((s) => s.name).join(', ')}>
      {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} /><text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={INK}>{fmt(t, maxV < 5 ? 1 : 0)}</text></g>)}
      {labels.map((lb, i) => {
        const cx = L + slot * i + slot / 2; const bw = stacked ? grp : grp / series.length;
        let acc = 0;
        return (
          <g key={lb} onMouseMove={() => setTip({ x: cx, y: T + 8, lines: [lb, ...series.map((s) => `${s.name}: ${fmt(s.values[i], digits)}${unit}`)] })} onMouseLeave={() => setTip(null)}>
            <rect x={L + slot * i} y={T} width={slot} height={ih} fill="transparent" />
            {series.map((s, k) => {
              const v = s.values[i] ?? 0; if (v <= 0) return null;
              const x = stacked ? cx - bw / 2 : cx - grp / 2 + bw * k + 1; const w = stacked ? bw : Math.max(bw - 2, 2);
              const y0 = stacked ? y(acc + v) : y(v), hgt = stacked ? y(acc) - y(acc + v) - 2 : T + ih - y(v);
              acc += v; const r = Math.min(4, w / 2, Math.max(hgt, 0));
              const top = !stacked || k === series.length - 1 || !series.slice(k + 1).some((q) => (q.values[i] ?? 0) > 0);
              const hh = Math.max(hgt, 1);
              return <path key={s.name} fill={s.color ?? S[k]} d={top ? `M${x},${y0 + hh} V${y0 + r} Q${x},${y0} ${x + r},${y0} H${x + w - r} Q${x + w},${y0} ${x + w},${y0 + r} V${y0 + hh} Z` : `M${x},${y0} H${x + w} V${y0 + hh} H${x} Z`} />;
            })}
            <text x={cx} y={H - 10} textAnchor="middle" fontSize={10} fill={INK}>{lb}</text>
          </g>);
      })}
    </svg><TipBox tip={tip} w={W} h={H} /></div>
  );
}

/** Garis satu sumbu (tanpa dual-axis). Titik bernilai null memutus garis. */
export function LineChart({ labels, series, unit = '', digits = 1, min = 0, max }: { labels: string[]; series: Series[]; unit?: string; digits?: number; min?: number; max?: number }) {
  const W = 560, H = 220, L = 44, R = 12, T = 10, B = 28;
  const [tip, setTip] = useState<number | null>(null);
  const vals = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const hi = max ?? niceMax(Math.max(...vals, 0)), lo = min;
  const iw = W - L - R, ih = H - T - B, n = labels.length;
  const x = (i: number) => L + (n === 1 ? iw / 2 : (iw * i) / (n - 1)); const y = (v: number) => T + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + t * (hi - lo));
  return (
    <div className="relative"><svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={series.map((s) => s.name).join(', ')} onMouseLeave={() => setTip(null)}>
      {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} /><text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={INK}>{fmt(t, hi < 5 ? 1 : 0)}</text></g>)}
      {labels.map((lb, i) => <text key={lb + i} x={x(i)} y={H - 10} textAnchor="middle" fontSize={10} fill={INK}>{lb}</text>)}
      {series.map((s, k) => {
        let d = ''; s.values.forEach((v, i) => { d += v === null ? '' : `${d && s.values[i - 1] !== null && s.values[i - 1] !== undefined ? 'L' : 'M'}${x(i)},${y(v)}`; });
        return <g key={s.name}><path d={d} fill="none" stroke={s.color ?? S[k]} strokeWidth={2} strokeLinejoin="round" />
          {s.values.map((v, i) => v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={s.color ?? S[k]} stroke="#fff" strokeWidth={2} />)}</g>;
      })}
      {tip !== null && <line x1={x(tip)} x2={x(tip)} y1={T} y2={T + ih} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />}
      {labels.map((lb, i) => <rect key={'h' + i} x={x(i) - iw / n / 2} y={T} width={iw / n} height={ih} fill="transparent" onMouseMove={() => setTip(i)} />)}
    </svg>
      {tip !== null && <TipBox tip={{ x: x(tip), y: T + 12, lines: [labels[tip], ...series.map((s) => `${s.name}: ${fmt(s.values[tip], digits)}${unit}`)] }} w={W} h={H} />}</div>
  );
}

/** Batang horizontal untuk peringkat (Pareto, biaya per aset). */
export function HBars({ rows, unit = '', digits = 0, color = S[0] }: { rows: { label: string; value: number; extra?: string }[]; unit?: string; digits?: number; color?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  return (
    <ul className="space-y-1.5">{rows.map((r) => (
      <li key={r.label} className="group grid grid-cols-[9rem_1fr_auto] items-center gap-2 text-xs" title={`${r.label}: ${fmt(r.value, digits)}${unit}${r.extra ? ' · ' + r.extra : ''}`}>
        <span className="truncate text-slate-700">{r.label}</span>
        <span className="h-3 rounded-r" style={{ width: `${Math.max((r.value / max) * 100, 1.5)}%`, background: color, borderRadius: '0 4px 4px 0' }} />
        <span className="tabular-nums text-slate-700">{fmt(r.value, digits)}{unit}{r.extra ? <span className="ml-1 text-slate-400">{r.extra}</span> : null}</span></li>))}</ul>
  );
}

export function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full"><thead className="text-left text-xs uppercase text-slate-500"><tr>{head.map((h, i) => <th key={h} className={`py-1 ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className={`py-1 ${j ? 'text-right tabular-nums' : ''}`}>{c}</td>)}</tr>)}</tbody></table>
  );
}
