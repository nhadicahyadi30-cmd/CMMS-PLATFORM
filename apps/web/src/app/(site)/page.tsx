import Link from 'next/link';
import Hero from '@/components/site/Hero';
import Reveal from '@/components/site/Reveal';
import Counter from '@/components/site/Counter';
import ProductShowcase from '@/components/site/ProductShowcase';
import CtaBand from '@/components/site/CtaBand';
import { SECTORS, STEPS } from '@/lib/site-content';

export default function Home() {
  const loop = [...SECTORS, ...SECTORS];
  return (
    <>
      <Hero />

      <section id="statement" className="snap-sec flex min-h-screen items-center px-5 py-28 sm:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <Reveal><h2 className="max-w-4xl text-[clamp(2rem,5vw,4rem)] font-semibold leading-[1.1] tracking-tight">Perawatan bukan biaya yang harus ditekan. Ini <span className="text-grad">sumber keandalan</span> yang bisa diukur.</h2></Reveal>
          <Reveal delay={120}><p className="mt-7 max-w-2xl text-lg leading-relaxed text-slate-300">MaintHub menyatukan data yang selama ini tercecer di Excel, grup WhatsApp, dan ingatan teknisi senior ke dalam satu sumber kebenaran — lalu mengubahnya menjadi keputusan.</p></Reveal>
          <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3">
            {[[10, '', 'modul terintegrasi dalam satu platform'], [500, '+', 'aset per organisasi — target desain pilot'], [30, '+', 'teknisi aktif — target desain pilot']].map(([n, s, l], i) => (
              <Reveal key={String(l)} delay={i * 120} className="bg-[#07090d] p-8 sm:p-10">
                <div className="text-6xl font-semibold tracking-tight text-white"><Counter to={n as number} suffix={s as string} /></div>
                <p className="mt-3 text-sm text-slate-400">{l}</p>
              </Reveal>))}
          </div>
        </div>
      </section>

      <section className="snap-sec relative px-5 py-28 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal><p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Cara kerja</p><h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Tiga langkah, satu siklus yang terus membaik.</h2></Reveal>
          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.w} delay={i * 140}>
                <div className="group relative h-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-8 transition duration-500 hover:-translate-y-1.5 hover:border-teal-400/40">
                  <div className="font-mono text-sm text-slate-600">0{i + 1}</div>
                  <h3 className={`mt-10 text-4xl font-semibold tracking-tight ${s.c}`}>{s.w}</h3>
                  <p className="mt-3 text-lg font-medium text-slate-100">{s.t}</p>
                  <p className="mt-3 leading-relaxed text-slate-400">{s.d}</p>
                  <div className="absolute -bottom-16 -right-16 h-40 w-40 rounded-full bg-teal-400/10 blur-3xl transition duration-500 group-hover:bg-teal-400/25" aria-hidden="true" />
                </div>
              </Reveal>))}
          </div>
        </div>
      </section>

      <section className="snap-sec border-y border-white/5 bg-[#090c11] px-5 py-28 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <Reveal><p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Produk</p><h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Sepuluh modul. Satu data. Tanpa sambungan manual.</h2></Reveal>
          <Reveal delay={120} className="mt-14"><ProductShowcase /></Reveal>
          <Reveal delay={200}><div className="mt-10 text-center"><Link href="/products" className="text-sm font-medium text-teal-300 underline-offset-4 hover:underline">Lihat semua modul →</Link></div></Reveal>
        </div>
      </section>

      <section className="snap-sec overflow-hidden px-5 py-24 sm:px-8" aria-label="Sektor industri">
        <Reveal><p className="mb-10 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Dirancang untuk industri proses & manufaktur</p></Reveal>
        <div className="relative mx-auto max-w-7xl overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
          <div className="mh-marquee flex w-max gap-14 whitespace-nowrap text-3xl font-semibold tracking-tight text-slate-700 sm:text-5xl">{loop.map((s, i) => <span key={i}>{s}<span className="ml-14 text-teal-400/60">◆</span></span>)}</div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
