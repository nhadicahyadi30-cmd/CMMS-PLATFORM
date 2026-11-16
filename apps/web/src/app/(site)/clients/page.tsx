import type { Metadata } from 'next';
import Link from 'next/link';
import Reveal from '@/components/site/Reveal';
import PageHero from '@/components/site/PageHero';
import CtaBand from '@/components/site/CtaBand';
import { CLIENTS, SECTORS } from '@/lib/site-content';

export const metadata: Metadata = { title: 'Clients & Partners', description: 'MaintHub clients and the pilot partner program for manufacturing.' };

export default function Clients() {
  return (
    <>
      <PageHero eyebrow="Clients & partners" title={<>Built for reliability teams that <span className="text-grad">decide with data.</span></>}>
        {CLIENTS.length ? 'Organizations that rely on MaintHub to keep their machines running.' : 'We are opening our Pilot Partner Program for multi-plant manufacturers. You work directly with our team and help shape the product roadmap.'}
      </PageHero>

      {CLIENTS.length > 0 && (
        <section className="px-5 pb-20 sm:px-8"><div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CLIENTS.map((c, i) => <Reveal key={c.name} delay={(i % 3) * 90}><div className="h-full rounded-2xl border border-white/10 p-7"><div className="text-xl font-semibold">{c.name}</div><div className="mt-1 text-sm text-teal-300">{c.sector}</div>{c.note && <p className="mt-4 text-sm text-slate-400">{c.note}</p>}</div></Reveal>)}
        </div></section>
      )}

      <section className="px-5 pb-24 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal><h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Pilot Partner Program</h2><p className="mt-4 max-w-2xl text-slate-400">Ideal for factories with many assets and technicians who still rely on Excel or scattered records.</p></Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[['Full guidance', 'Our team supports setup, data migration, and training at the pilot plant.'], ['Your feedback ships', 'Feedback from the field goes straight into the development roadmap.'], ['Transparent terms', 'Commercial terms for the pilot are made clear from the start.']].map(([t, d], i) => <Reveal key={t} delay={i * 100}><div className="h-full rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-8"><h3 className="text-xl font-semibold text-teal-300">{t}</h3><p className="mt-3 text-slate-400">{d}</p></div></Reveal>)}
          </div>
          <Reveal delay={150}><Link href="/contact" className="mt-10 inline-block rounded-md bg-white px-7 py-3 text-sm font-semibold text-[#07090d] transition hover:bg-teal-300">Join the pilot program</Link></Reveal>
        </div>
      </section>

      <section className="border-t border-white/5 bg-[#090c11] px-5 py-24 sm:px-8">
        <div className="mx-auto max-w-6xl"><Reveal><h2 className="text-3xl font-semibold tracking-tight">Industries we serve</h2></Reveal>
          <div className="mt-8 flex flex-wrap gap-3">{SECTORS.map((s, i) => <Reveal key={s} delay={i * 60}><span className="inline-block rounded-full border border-white/15 px-5 py-2.5 text-sm text-slate-200">{s}</span></Reveal>)}</div></div>
      </section>
      <CtaBand />
    </>
  );
}
