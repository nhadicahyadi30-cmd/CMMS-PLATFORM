import type { ReactNode } from 'react';
import Reveal from './Reveal';

export default function PageHero({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden px-5 pb-20 pt-36 sm:px-8 sm:pt-44">
      <div className="site-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-24 top-10 h-96 w-96 rounded-full bg-blue-600/20 blur-[130px]" aria-hidden="true" />
      <div className="relative mx-auto max-w-5xl">
        <Reveal><p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">{eyebrow}</p></Reveal>
        <Reveal delay={80}><h1 className="mt-5 text-[clamp(2.4rem,6vw,4.8rem)] font-semibold leading-[1.05] tracking-tight">{title}</h1></Reveal>
        {children && <Reveal delay={160}><div className="mt-7 max-w-2xl text-lg leading-relaxed text-slate-300">{children}</div></Reveal>}
      </div>
    </section>
  );
}
