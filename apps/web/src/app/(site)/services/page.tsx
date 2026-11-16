import type { Metadata } from 'next';
import Reveal from '@/components/site/Reveal';
import PageHero from '@/components/site/PageHero';
import CtaBand from '@/components/site/CtaBand';
import { SERVICES } from '@/lib/site-content';

export const metadata: Metadata = { title: 'Services', description: 'Implementasi, migrasi data, pelatihan, konsultasi keandalan, integrasi, dan dukungan untuk MaintHub.' };

export default function Services() {
  return (
    <>
      <PageHero eyebrow="Services" title={<>Technology is half the solution. <span className="text-grad">We make sure your team adopts it.</span></>}>
        CMMS berhasil kalau dipakai teknisi setiap hari, bukan sekadar terpasang. Layanan kami fokus ke situ.
      </PageHero>
      <section className="px-5 pb-24 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s, i) => (
            <Reveal key={s.name} delay={(i % 3) * 90} className="bg-[#07090d] p-8 transition hover:bg-[#0b1018]">
              <div className="font-mono text-sm text-teal-400">{String(i + 1).padStart(2, '0')}</div>
              <h2 className="mt-8 text-xl font-semibold tracking-tight">{s.name}</h2>
              <p className="mt-3 leading-relaxed text-slate-400">{s.desc}</p>
            </Reveal>))}
        </div>
      </section>
      <section className="px-5 pb-28 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal><h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Implementation roadmap</h2></Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-4">
            {[['Discover', 'Kami pelajari plant, peran, dan cara kerja perawatan Anda saat ini.'], ['Setup', 'Akun, peran, dan data master disiapkan lalu diperiksa.'], ['Pilot', 'Satu plant atau lini dijalankan penuh bersama tim.'], ['Scale', 'Plant lain menyusul dengan pola yang sudah terbukti.']].map(([t, d], i) => (
              <Reveal key={t} delay={i * 100}><div className="relative h-full rounded-xl border border-white/10 p-6"><span className="text-sm text-slate-600">Step {i + 1}</span><h3 className="mt-3 text-lg font-semibold">{t}</h3><p className="mt-2 text-sm leading-relaxed text-slate-400">{d}</p></div></Reveal>))}
          </div>
        </div>
      </section>
      <CtaBand title="Start with one plant." text="Ceritakan kondisi perawatan di pabrik Anda. Kami usulkan rencana pilot yang masuk akal." />
    </>
  );
}
