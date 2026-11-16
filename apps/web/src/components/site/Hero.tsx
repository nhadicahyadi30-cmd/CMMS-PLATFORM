'use client';
import Link from 'next/link';
import { PointerEvent, useEffect, useRef, useState } from 'react';
import { TAGLINE_WORDS } from '../Logo';
import InteractiveMark from './InteractiveMark';

const STAGES = [
  { t: 'Anomaly detected before failure', d: 'Pump P-203 vibration is trending up (4.2 mm/s). The asset is flagged for inspection.' },
  { t: 'Work Order created automatically', d: 'WO-1042 is assigned to a technician, with the required spare parts reserved.' },
  { t: 'Root cause found, interval adjusted', d: 'RCA shows missed lubrication. The PM interval is tightened to prevent a repeat.' },
  { t: 'Sensors, people, and parts in one platform', d: 'Alarms, work orders, inventory, and KPIs share a single source of truth.' },
];
const WORD_CLS = ['text-stone-100', 'text-blue-400', 'text-teal-300', 'text-grad'];
const jitter = (base: number, amp: number, d: number) => Math.round((base + (Math.random() * 2 - 1) * amp) * 10 ** d) / 10 ** d;
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function Hero() {
  const stage = useRef<HTMLDivElement>(null); const copy = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null); const [auto, setAuto] = useState(0); const [burst, setBurst] = useState(0);
  const [kpi, setKpi] = useState({ av: 96.4, mtbf: 412, pm: 96, wo: 12 });
  const active = hover ?? auto;

  useEffect(() => { if (hover !== null || reduced()) return; const t = setInterval(() => setAuto((a) => (a + 1) % 4), 3800); return () => clearInterval(t); }, [hover]);
  useEffect(() => {
    if (reduced()) return;
    const t = setInterval(() => setKpi({ av: jitter(96.4, 0.3, 1), mtbf: Math.round(jitter(412, 6, 0)), pm: Math.round(jitter(96, 1.2, 0)), wo: Math.round(jitter(12, 2, 0)) }), 2600);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const f = () => {
      const y = window.scrollY, h = window.innerHeight; const p = Math.min(1, y / (h * 0.7));
      if (copy.current) { copy.current.style.opacity = String(1 - p); copy.current.style.transform = `translateY(${y * 0.18}px)`; }
      if (stage.current) stage.current.style.transform = `translateY(${y * 0.1}px) scale(${1 + p * 0.08})`;
    };
    f(); window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f);
  }, []);

  function tilt(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    const s = e.currentTarget.style; s.setProperty('--ry', `${x * 22}deg`); s.setProperty('--rx', `${-y * 16}deg`); s.setProperty('--mx', `${(x + 0.5) * 100}%`); s.setProperty('--my', `${(y + 0.5) * 100}%`);
  }
  function reset(e: PointerEvent<HTMLDivElement>) { e.currentTarget.style.setProperty('--ry', '0deg'); e.currentTarget.style.setProperty('--rx', '0deg'); setHover(null); }

  const chips = [
    { t: 'Availability', v: `${kpi.av.toFixed(1)}%`, cls: 'left-0 top-[12%]', d: '0s' },
    { t: 'PM compliance', v: `${kpi.pm}%`, cls: 'right-0 top-[26%]', d: '1.2s' },
    { t: 'Open work orders', v: String(kpi.wo), cls: 'left-[1%] bottom-[34%]', d: '2.1s' },
    { t: 'MTBF', v: `${kpi.mtbf} h`, cls: 'right-[2%] bottom-[30%]', d: '0.6s' },
  ];

  return (
    <section className="snap-sec relative flex min-h-screen items-center overflow-hidden pt-16">
      <div className="site-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-40 top-1/4 h-[520px] w-[520px] rounded-full bg-blue-600/25 blur-[140px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-[480px] w-[480px] rounded-full bg-teal-400/20 blur-[140px]" aria-hidden="true" />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-8 px-5 sm:px-8 lg:grid-cols-[1.05fr_1fr]">
        <div ref={copy} className="will-change-transform">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs uppercase tracking-[0.18em] text-slate-300"><span className="h-1.5 w-1.5 rounded-full bg-teal-400" />Reliability-driven CMMS for modern manufacturing</p>
          <h1 className="text-[clamp(2.6rem,7vw,5.4rem)] font-semibold leading-[1.04] tracking-tight">
            {TAGLINE_WORDS.map((w, i) => (
              <span key={w} role="button" tabIndex={0} aria-pressed={active === i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                className={`block w-fit cursor-pointer transition duration-500 ${WORD_CLS[i]} ${active === i ? 'translate-x-2 opacity-100' : 'opacity-40'}`}>{w}</span>))}
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-slate-300">Satu platform untuk Work Order, Preventive Maintenance, Spare Parts, KPI, hingga Root Cause Analysis. Tim lapangan tahu apa yang harus dikerjakan, manajemen melihat kondisi mesin yang sebenarnya.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/contact" className="rounded-md bg-white px-6 py-3 text-sm font-semibold text-[#07090d] transition hover:bg-teal-300">Request a Demo</Link>
            <Link href="/products" className="rounded-md border border-white/25 px-6 py-3 text-sm font-medium text-white transition hover:border-white/60 hover:bg-white/5">Explore Products</Link>
          </div>
        </div>

        <div ref={stage} className="relative mx-auto aspect-square w-full max-w-[540px] will-change-transform" onPointerMove={tilt} onPointerLeave={reset} style={{ ['--rx' as string]: '0deg', ['--ry' as string]: '0deg', ['--mx' as string]: '50%', ['--my' as string]: '50%' }}>
          <div className="pointer-events-none absolute inset-0 rounded-full opacity-70" style={{ background: 'radial-gradient(240px circle at var(--mx) var(--my), rgba(18,196,180,.22), transparent 70%)' }} aria-hidden="true" />
          {[0, 1.4, 2.8].map((d) => <span key={d} className="mh-ring pointer-events-none absolute inset-[12%] rounded-full border border-teal-400/50" style={{ animationDelay: `${d}s` }} aria-hidden="true" />)}
          <div className="absolute inset-[6%] bottom-[18%]" style={{ perspective: '1100px' }}>
            <div className="mh-float h-full w-full transition-transform duration-200 ease-out" style={{ transform: 'rotateX(var(--rx)) rotateY(var(--ry))', transformStyle: 'preserve-3d' }}>
              <InteractiveMark active={active} onActive={(i) => setHover(i)} onBurst={() => setBurst((b) => b + 1)} burst={burst} />
            </div>
          </div>
          {chips.map((c) => (
            <div key={c.t} className={`mh-float pointer-events-none absolute hidden rounded-lg border border-white/10 bg-[#0d1118]/85 px-3 py-2 shadow-xl backdrop-blur sm:block ${c.cls}`} style={{ animationDelay: c.d }}>
              <div className="text-[0.6rem] uppercase tracking-[0.14em] text-slate-500">{c.t}</div><div className="text-sm font-semibold tabular-nums text-slate-100">{c.v}</div>
            </div>))}
          <div className="absolute inset-x-[4%] bottom-0 rounded-xl border border-white/10 bg-[#0d1118]/90 px-4 py-3 backdrop-blur" aria-live="polite">
            <div key={active} style={{ animation: 'mh-fade .45s ease' }}>
              <div className="flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em]"><span className={WORD_CLS[active] === 'text-stone-100' ? 'text-teal-300' : WORD_CLS[active]}>{TAGLINE_WORDS[active].replace('.', '')}</span><span className="text-slate-600">/ illustrative preview</span></div>
              <div className="mt-1 text-sm font-medium text-slate-100">{STAGES[active].t}</div>
              <div className="mt-0.5 text-xs leading-relaxed text-slate-400">{STAGES[active].d}</div>
            </div>
          </div>
        </div>
      </div>

      <a href="#statement" aria-label="Scroll down" className="absolute bottom-7 left-1/2 hidden -translate-x-1/2 sm:block">
        <span className="flex h-9 w-5 justify-center rounded-full border border-white/30 pt-2"><span className="mh-scroll h-1.5 w-1 rounded-full bg-white" /></span>
      </a>
    </section>
  );
}
