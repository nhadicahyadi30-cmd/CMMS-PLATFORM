'use client';
import { useState } from 'react';
import { MODULES } from '@/lib/site-content';

const A = '#12c4b4', B = '#2f6bff', MUTED = '#2a3345', TXT = '#8b97ab';

/** Visual ilustrasi per modul (bukan data sungguhan). */
function Viz({ id }: { id: string }) {
  const frame = 'w-full';
  switch (id) {
    case 'wo': return (
      <div className="space-y-2.5 text-xs">
        {[['WO-1042', 'Bearing pompa P-203', 'Dikerjakan', B], ['WO-1041', 'Sensor suhu filler', 'Menunggu part', '#e0a526'], ['WO-1040', 'Ganti belt conveyor', 'Selesai', A], ['WO-1039', 'Kebocoran seal', 'Dijadwalkan', '#7a869b']].map(([n, t, s, c]) => (
          <div key={n} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-3"><div><div className="font-mono text-[0.7rem] text-slate-500">{n}</div><div className="text-sm text-slate-100">{t}</div></div><span className="rounded-full px-2.5 py-1 text-[0.68rem] font-medium" style={{ background: `${c}22`, color: c as string }}>{s}</span></div>))}
      </div>);
    case 'pm': return (
      <svg viewBox="0 0 280 170" className={frame} role="img" aria-label="Kalender preventive"><g fill={TXT} fontSize="9">{['S', 'S', 'R', 'K', 'J', 'S', 'M'].map((d, i) => <text key={i} x={20 + i * 38} y="12" textAnchor="middle">{d}</text>)}</g>
        {Array.from({ length: 35 }, (_, i) => { const x = 20 + (i % 7) * 38, y = 34 + Math.floor(i / 7) * 28; const on = [3, 8, 10, 15, 17, 22, 24, 29, 31].includes(i); const done = [3, 8, 10, 15].includes(i); return <g key={i}><rect x={x - 15} y={y - 11} width="30" height="22" rx="5" fill={on ? (done ? `${A}33` : `${B}33`) : '#ffffff08'} stroke={on ? (done ? A : B) : 'none'} />{on && <circle cx={x} cy={y} r="3" fill={done ? A : B} />}</g>; })}</svg>);
    case 'assets': return (
      <svg viewBox="0 0 280 170" className={frame} role="img" aria-label="Hierarki aset"><g stroke={MUTED} strokeWidth="1.5" fill="none"><path d="M140 28V48M140 48H50V70M140 48H140V70M140 48H230V70M50 92V112M230 92V112M140 92V112"/></g>
        {[[140, 16, 'Plant', A], [50, 82, 'Line 1', B], [140, 82, 'Line 2', B], [230, 82, 'Utilitas', B], [50, 126, 'Filler', '#7a869b'], [140, 126, 'Mixer', '#7a869b'], [230, 126, 'Boiler', '#7a869b']].map(([x, y, t, c], i) => <g key={i}><rect x={(x as number) - 32} y={(y as number) - 12} width="64" height="24" rx="6" fill="#ffffff08" stroke={c as string} /><text x={x as number} y={(y as number) + 4} textAnchor="middle" fontSize="10" fill="#e5e9f0">{t}</text></g>)}</svg>);
    case 'inv': return (
      <svg viewBox="0 0 280 170" className={frame} role="img" aria-label="Level stok"><line x1="10" x2="270" y1="96" y2="96" stroke="#e0a526" strokeDasharray="4 4" /><text x="272" y="92" textAnchor="end" fontSize="8" fill="#e0a526">stok minimum</text>
        {[110, 70, 40, 120, 55, 90].map((h, i) => <rect key={i} x={20 + i * 42} y={150 - h} width="26" height={h} rx="4" fill={h < 60 ? '#e0a526' : B} opacity={h < 60 ? 1 : 0.9} />)}</svg>);
    case 'kpi': return (
      <div><div className="mb-4 grid grid-cols-3 gap-3 text-center">{[['Availability', '96,4%'], ['MTTR', '2,8 j'], ['MTBF', '412 j']].map(([l, v]) => <div key={l} className="rounded-lg border border-white/10 bg-white/[0.03] py-3"><div className="text-lg font-semibold text-white">{v}</div><div className="text-[0.65rem] uppercase tracking-wider text-slate-500">{l}</div></div>)}</div>
        <svg viewBox="0 0 280 90" className={frame} role="img" aria-label="Tren availability"><path d="M5 70 40 62 75 66 110 48 145 52 180 34 215 38 275 16" fill="none" stroke={A} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 70 40 62 75 66 110 48 145 52 180 34 215 38 275 16V88H5Z" fill={`${A}18`} /></svg></div>);
    case 'rca': return (
      <svg viewBox="0 0 280 170" className={frame} role="img" aria-label="Diagram fishbone"><path d="M10 85H240" stroke={MUTED} strokeWidth="2" /><rect x="238" y="70" width="38" height="30" rx="6" fill={`${A}22`} stroke={A} /><text x="257" y="89" textAnchor="middle" fontSize="8" fill="#e5e9f0">Efek</text>
        {[[50, 'Mesin'], [120, 'Metode'], [190, 'Material']].map(([x, t]) => <g key={t as string} stroke={B} strokeWidth="1.6"><path d={`M${x} 20 L${(x as number) + 30} 85`} /><path d={`M${x} 150 L${(x as number) + 30} 85`} /><text x={x as number} y="14" fontSize="9" fill={TXT} stroke="none" textAnchor="middle">{t}</text></g>)}</svg>);
    case 'energy': return (
      <svg viewBox="0 0 280 170" className={frame} role="img" aria-label="Konsumsi energi"><g>{[60, 72, 66, 80, 64, 118, 70, 76].map((h, i) => <rect key={i} x={14 + i * 33} y={150 - h} width="20" height={h} rx="3" fill={i === 5 ? '#e0a526' : B} />)}</g><path d="M24 92H270" stroke={A} strokeDasharray="5 4" /><text x="268" y="88" textAnchor="end" fontSize="8" fill={A}>beban dasar</text><text x="14" y="12" fontSize="8" fill="#e0a526">▲ anomali terdeteksi</text></svg>);
    case 'ai': return (
      <div className="space-y-3 text-sm"><div className="ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-blue-500/20 px-3.5 py-2.5 text-slate-100">Kenapa bearing P-203 sering rusak?</div>
        <div className="max-w-[90%] rounded-xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-slate-200">3 dari 4 kerusakan terjadi setelah pelumasan terlewat. Lihat <span className="text-teal-300">WO-0871</span> dan manual pompa hal. 14.<div className="mt-2 flex gap-1.5 text-[0.65rem]"><span className="rounded bg-white/10 px-1.5 py-0.5 text-slate-400">Sumber: WO-0871</span><span className="rounded bg-white/10 px-1.5 py-0.5 text-slate-400">Manual hal. 14</span></div></div></div>);
    case 'wa': return (
      <div className="space-y-3 text-sm"><div className="ml-auto w-fit rounded-xl rounded-br-sm bg-teal-400/20 px-3.5 py-2 font-mono text-teal-200">MULAI WO-1042</div><div className="w-fit rounded-xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-3.5 py-2 text-slate-200">WO-1042 dimulai. Selamat bekerja, Budi.</div><div className="ml-auto w-fit rounded-xl rounded-br-sm bg-teal-400/20 px-3.5 py-2 text-teal-200">📷 foto bearing.jpg</div><div className="w-fit rounded-xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-3.5 py-2 text-slate-200">Foto ditambahkan ke WO-1042.</div></div>);
    default: return (
      <div className="space-y-2.5 text-xs">{[['Administrator', 'Semua plant'], ['Supervisor', 'Plant terpilih'], ['Planner', 'Plant terpilih'], ['Teknisi', 'WO sendiri']].map(([r, a]) => <div key={r} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-3"><span className="text-sm text-slate-100">{r}</span><span className="text-slate-400">{a}</span></div>)}<div className="rounded-lg border border-teal-400/30 bg-teal-400/10 px-3.5 py-2.5 text-teal-200">🔒 Isolasi data antar organisasi di level database</div></div>);
  }
}

export default function ProductShowcase() {
  const [i, setI] = useState(0); const m = MODULES[i];
  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      <div role="tablist" aria-label="Modul" className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
        {MODULES.map((x, k) => (
          <button key={x.id} role="tab" aria-selected={k === i} onClick={() => setI(k)} onMouseEnter={() => window.matchMedia('(hover: hover)').matches && setI(k)}
            className={`group flex shrink-0 items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition ${k === i ? 'border-teal-400/60 bg-teal-400/10 text-white' : 'border-white/10 text-slate-400 hover:border-white/30 hover:text-white'}`}>
            <span className={`font-mono text-[0.7rem] ${k === i ? 'text-teal-300' : 'text-slate-600'}`}>{String(k + 1).padStart(2, '0')}</span>{x.name}
          </button>))}
      </div>
      <div key={m.id} className="grid gap-8 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-6 sm:p-9 md:grid-cols-2" style={{ animation: 'mh-fade .5s ease' }}>
        <div className="flex flex-col justify-center">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">{m.tag}</span>
          <h3 className="mt-3 text-3xl font-semibold tracking-tight">{m.name}</h3>
          <p className="mt-4 leading-relaxed text-slate-300">{m.desc}</p>
          <ul className="mt-6 space-y-2.5 text-sm text-slate-300">{m.bullets.map((b) => <li key={b} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400" />{b}</li>)}</ul>
        </div>
        <div className="flex min-h-[250px] flex-col justify-center rounded-xl border border-white/10 bg-[#0a0e14] p-5"><Viz id={m.id} /><p className="mt-4 text-[0.65rem] uppercase tracking-[0.16em] text-slate-600">Ilustrasi tampilan</p></div>
      </div>
    </div>
  );
}
