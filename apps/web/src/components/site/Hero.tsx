'use client';
import Link from 'next/link';
import { PointerEvent, useEffect, useRef } from 'react';
import { LogoMark, TAGLINE_WORDS } from '../Logo';

const CHIPS = [
  { t: 'Pump P-203 vibration  4.2 mm/s ▲', cls: 'left-0 top-[14%]', d: '0s' },
  { t: 'PM compliance  96%', cls: 'right-0 top-[30%]', d: '1.2s' },
  { t: 'Alarm → Work Order auto-created', cls: 'left-[2%] bottom-[22%]', d: '2.1s' },
  { t: 'MTBF  412 h', cls: 'right-[4%] bottom-[10%]', d: '0.6s' },
];

export default function Hero() {
  const stage = useRef<HTMLDivElement>(null); const copy = useRef<HTMLDivElement>(null);

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
    e.currentTarget.style.setProperty('--ry', `${x * 22}deg`); e.currentTarget.style.setProperty('--rx', `${-y * 16}deg`);
  }
  function reset(e: PointerEvent<HTMLDivElement>) { e.currentTarget.style.setProperty('--ry', '0deg'); e.currentTarget.style.setProperty('--rx', '0deg'); }

  return (
    <section className="snap-sec relative flex min-h-screen items-center overflow-hidden pt-16">
      <div className="site-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-40 top-1/4 h-[520px] w-[520px] rounded-full bg-blue-600/25 blur-[140px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-[480px] w-[480px] rounded-full bg-teal-400/20 blur-[140px]" aria-hidden="true" />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-8 px-5 sm:px-8 lg:grid-cols-[1.05fr_1fr]">
        <div ref={copy} className="will-change-transform">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs uppercase tracking-[0.18em] text-slate-300"><span className="h-1.5 w-1.5 rounded-full bg-teal-400" />CMMS platform for modern manufacturing</p>
          <h1 className="text-[clamp(2.8rem,8vw,6.4rem)] font-semibold leading-[1.02] tracking-tight">
            {TAGLINE_WORDS.map((w, i) => <span key={w} className={`block ${i === 0 ? 'text-stone-100' : i === 1 ? 'text-blue-400' : 'text-grad'}`}>{w}</span>)}
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-slate-300">Satu platform untuk Work Order, Preventive Maintenance, Spare Parts, KPI, hingga Root Cause Analysis. Tim lapangan tahu apa yang harus dikerjakan, manajemen melihat kondisi mesin yang sebenarnya.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/contact" className="rounded-md bg-white px-6 py-3 text-sm font-semibold text-[#07090d] transition hover:bg-teal-300">Request a Demo</Link>
            <Link href="/products" className="rounded-md border border-white/25 px-6 py-3 text-sm font-medium text-white transition hover:border-white/60 hover:bg-white/5">Explore Products</Link>
          </div>
        </div>

        <div ref={stage} className="relative mx-auto aspect-square w-full max-w-[520px] will-change-transform" onPointerMove={tilt} onPointerLeave={reset} style={{ ['--rx' as string]: '0deg', ['--ry' as string]: '0deg' }}>
          {[0, 1.4, 2.8].map((d) => <span key={d} className="mh-ring absolute inset-[12%] rounded-full border border-teal-400/50" style={{ animationDelay: `${d}s` }} aria-hidden="true" />)}
          <div className="absolute inset-0 flex items-center justify-center" style={{ perspective: '1100px' }}>
            <div className="mh-float transition-transform duration-200 ease-out" style={{ transform: 'rotateX(var(--rx)) rotateY(var(--ry))', transformStyle: 'preserve-3d', filter: 'drop-shadow(0 30px 50px rgba(18,196,180,.25))' }}>
              <LogoMark size={340} className="max-w-full" />
            </div>
          </div>
          {CHIPS.map((c) => (
            <div key={c.t} className={`mh-float absolute hidden rounded-lg border border-white/10 bg-[#0d1118]/80 px-3 py-2 text-[0.72rem] text-slate-200 shadow-xl backdrop-blur sm:block ${c.cls}`} style={{ animationDelay: c.d }}>{c.t}</div>
          ))}
          <p className="absolute -bottom-2 left-1/2 hidden -translate-x-1/2 text-[0.65rem] uppercase tracking-[0.18em] text-slate-500 sm:block">Illustrative preview</p>
        </div>
      </div>

      <a href="#statement" aria-label="Scroll down" className="absolute bottom-7 left-1/2 hidden -translate-x-1/2 sm:block">
        <span className="flex h-9 w-5 justify-center rounded-full border border-white/30 pt-2"><span className="mh-scroll h-1.5 w-1 rounded-full bg-white" /></span>
      </a>
    </section>
  );
}
