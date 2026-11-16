import type { Metadata } from 'next';
import Link from 'next/link';
import Reveal from '@/components/site/Reveal';
import PageHero from '@/components/site/PageHero';
import CtaBand from '@/components/site/CtaBand';
import { CLIENTS, SECTORS } from '@/lib/site-content';

export const metadata: Metadata = { title: 'Klien & Mitra', description: 'Klien dan program mitra pilot MaintHub untuk industri manufaktur.' };

export default function Clients() {
  return (
    <>
      <PageHero eyebrow="Klien & mitra" title={<>Dipercaya tim perawatan yang <span className="text-grad">tidak mau menebak.</span></>}>
        {CLIENTS.length ? 'Organisasi yang memakai MaintHub untuk menjaga mesinnya tetap berjalan.' : 'MaintHub sedang membuka program mitra pilot untuk pabrik multi-plant. Anda akan bekerja langsung dengan tim kami dan ikut membentuk produknya.'}
      </PageHero>

      {CLIENTS.length > 0 && (
        <section className="px-5 pb-20 sm:px-8"><div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CLIENTS.map((c, i) => <Reveal key={c.name} delay={(i % 3) * 90}><div className="h-full rounded-2xl border border-white/10 p-7"><div className="text-xl font-semibold">{c.name}</div><div className="mt-1 text-sm text-teal-300">{c.sector}</div>{c.note && <p className="mt-4 text-sm text-slate-400">{c.note}</p>}</div></Reveal>)}
        </div></section>
      )}

      <section className="px-5 pb-24 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal><h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Program mitra pilot</h2><p className="mt-4 max-w-2xl text-slate-400">Cocok untuk pabrik dengan banyak aset dan teknisi yang masih bergantung pada Excel atau catatan terpisah.</p></Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[['Dampingan penuh', 'Tim kami membantu penyiapan, migrasi data, dan pelatihan di plant pilot.'], ['Pengaruh nyata', 'Masukan Anda langsung masuk ke peta jalan produk.'], ['Kondisi khusus', 'Syarat komersial pilot dibahas terbuka sejak awal.']].map(([t, d], i) => <Reveal key={t} delay={i * 100}><div className="h-full rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-8"><h3 className="text-xl font-semibold text-teal-300">{t}</h3><p className="mt-3 text-slate-400">{d}</p></div></Reveal>)}
          </div>
          <Reveal delay={150}><Link href="/contact" className="mt-10 inline-block rounded-md bg-white px-7 py-3 text-sm font-semibold text-[#07090d] transition hover:bg-teal-300">Daftar sebagai mitra pilot</Link></Reveal>
        </div>
      </section>

      <section className="border-t border-white/5 bg-[#090c11] px-5 py-24 sm:px-8">
        <div className="mx-auto max-w-6xl"><Reveal><h2 className="text-3xl font-semibold tracking-tight">Sektor yang kami layani</h2></Reveal>
          <div className="mt-8 flex flex-wrap gap-3">{SECTORS.map((s, i) => <Reveal key={s} delay={i * 60}><span className="inline-block rounded-full border border-white/15 px-5 py-2.5 text-sm text-slate-200">{s}</span></Reveal>)}</div></div>
      </section>
      <CtaBand />
    </>
  );
}
