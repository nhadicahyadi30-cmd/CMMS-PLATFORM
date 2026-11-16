import type { Metadata } from 'next';
import Reveal from '@/components/site/Reveal';
import PageHero from '@/components/site/PageHero';
import CtaBand from '@/components/site/CtaBand';
import { MODULES } from '@/lib/site-content';

export const metadata: Metadata = { title: 'Products', description: 'The ten MaintHub modules: work orders, preventive maintenance, assets, spare parts, KPIs, RCA, energy, AI, WhatsApp, and administration.' };

export default function Products() {
  return (
    <>
      <PageHero eyebrow="Products" title={<>The complete toolkit for maintenance teams, <span className="text-grad">in one platform.</span></>}>
        All modules share the same data. A failure logged on a Work Order is instantly reflected in KPIs, spare parts stock, and Root Cause Analysis, with no double entry.
      </PageHero>
      <section className="px-5 pb-28 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2">
          {MODULES.map((m, i) => (
            <Reveal key={m.id} delay={(i % 2) * 100}>
              <article className="group h-full rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-8 transition duration-500 hover:-translate-y-1 hover:border-teal-400/40">
                <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">{m.tag}</span><span className="font-mono text-xs text-slate-600">Module {m.no}</span></div>
                <h2 className="mt-5 text-2xl font-semibold tracking-tight">{m.name}</h2>
                <p className="mt-3 leading-relaxed text-slate-400">{m.desc}</p>
                <ul className="mt-5 space-y-2 text-sm text-slate-300">{m.bullets.map((b) => <li key={b} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />{b}</li>)}</ul>
              </article>
            </Reveal>))}
        </div>
      </section>
      <CtaBand />
    </>
  );
}
