import type { Metadata } from 'next';
import Reveal from '@/components/site/Reveal';
import PageHero from '@/components/site/PageHero';
import CtaBand from '@/components/site/CtaBand';
import { LogoMark } from '@/components/Logo';

export const metadata: Metadata = { title: 'About MaintHub', description: 'What MaintHub is, what we believe in, and how the platform is built.' };

const VALUES = [
  ['Field data first', 'KPI figures come from real events on the plant floor, not from manual entries that can be polished.'],
  ['Rules enforced by the system', 'Work order flow, stock that cannot go negative, and history that cannot be altered are enforced by the database itself, not left to habit.'],
  ['Simple for technicians', 'Technicians only need WhatsApp or a single screen. We keep the complexity behind the scenes.'],
  ['Honest about capabilities', 'We state clearly what has been tested and what has not. Trust starts there.'],
];

export default function About() {
  return (
    <>
      <PageHero eyebrow="About us" title={<>What is <span className="text-grad">MaintHub?</span></>}>
        MaintHub is a web-based CMMS (Computerized Maintenance Management System) for factories with one or many plants. Everything maintenance-related, from asset data to root cause analysis, lives in one place.
      </PageHero>

      <section className="px-5 pb-24 sm:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Our mission</h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-300">To help maintenance teams move from fixing what breaks to preventing it. The tool is used by technicians every day, not just reviewed by management once a month.</p>
            <p className="mt-4 leading-relaxed text-slate-400">The name <strong className="font-medium text-slate-200">MaintHub</strong> reflects a central <em>hub</em> where all maintenance data comes together. The logo, a cube of modules topped with a sensor antenna, represents connected modules and data that flows continuously to predict problems.</p>
          </Reveal>
          <Reveal delay={120}><div className="relative flex aspect-square max-w-md items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent"><div className="absolute inset-10 rounded-full bg-teal-400/10 blur-3xl" aria-hidden="true" /><LogoMark size={230} className="mh-float relative" /></div></Reveal>
        </div>
      </section>

      <section className="border-y border-white/5 bg-[#090c11] px-5 py-24 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal><h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Our principles</h2></Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {VALUES.map(([t, d], i) => <Reveal key={t} delay={(i % 2) * 100}><div className="h-full rounded-2xl border border-white/10 p-8"><h3 className="text-xl font-semibold text-teal-300">{t}</h3><p className="mt-3 leading-relaxed text-slate-400">{d}</p></div></Reveal>)}
          </div>
        </div>
      </section>

      <section className="px-5 py-24 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal><h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Built on proven technology</h2></Reveal>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {[['PostgreSQL 16', 'Business rules and data separation between organizations are enforced at the database level'], ['NestJS API', 'Strict validation, per-module access control, and audit trail'], ['Next.js', 'A web interface that works comfortably in the office and in the field'], ['Docker', 'Deploy on your own servers or the cloud of your choice']].map(([t, d], i) => (
              <Reveal key={t} delay={i * 80} className="bg-[#07090d] p-7"><div className="font-mono text-sm text-blue-400">{t}</div><p className="mt-3 text-sm leading-relaxed text-slate-400">{d}</p></Reveal>))}
          </div>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
