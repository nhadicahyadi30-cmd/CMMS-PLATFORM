import Link from 'next/link';
import Reveal from './Reveal';

export default function CtaBand({ title = 'Mau lihat MaintHub di pabrik Anda?', text = 'Kami siapkan demo dengan contoh data yang mirip dengan pabrik Anda.' }: { title?: string; text?: string }) {
  return (
    <section className="snap-sec relative overflow-hidden border-t border-white/10 px-5 py-28 sm:px-8">
      <div className="pointer-events-none absolute inset-x-0 -bottom-40 mx-auto h-80 max-w-3xl rounded-full bg-teal-400/25 blur-[120px]" aria-hidden="true" />
      <Reveal className="relative mx-auto max-w-3xl text-center">
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-teal-300">Predict. Maintain. Optimize.</p>
        <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-slate-300">{text}</p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/contact" className="rounded-md bg-white px-7 py-3 text-sm font-semibold text-[#07090d] transition hover:bg-teal-300">Minta Demo</Link>
          <Link href="/login" className="rounded-md border border-white/25 px-7 py-3 text-sm font-medium text-white transition hover:border-white/60 hover:bg-white/5">Masuk ke Aplikasi</Link>
        </div>
      </Reveal>
    </section>
  );
}
