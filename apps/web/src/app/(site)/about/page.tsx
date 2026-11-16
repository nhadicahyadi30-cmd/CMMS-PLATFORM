import type { Metadata } from 'next';
import Reveal from '@/components/site/Reveal';
import PageHero from '@/components/site/PageHero';
import CtaBand from '@/components/site/CtaBand';
import { LogoMark } from '@/components/Logo';

export const metadata: Metadata = { title: 'About MaintHub', description: 'Apa itu MaintHub, apa yang kami yakini, dan bagaimana platform ini dibangun.' };

const VALUES = [
  ['Field data first', 'Angka KPI berasal dari kejadian nyata di pabrik, bukan input manual yang bisa dipoles.'],
  ['Rules enforced by the system', 'Alur work order, stok yang tidak bisa minus, dan riwayat yang tidak bisa diubah dijaga langsung oleh database, tidak bergantung pada kebiasaan.'],
  ['Simple for technicians', 'Teknisi cukup pakai WhatsApp atau satu layar. Bagian yang rumit kami simpan di belakang.'],
  ['Honest about capabilities', 'Kami jelaskan mana yang sudah teruji dan mana yang belum. Kepercayaan dimulai dari situ.'],
];

export default function About() {
  return (
    <>
      <PageHero eyebrow="About us" title={<>What is <span className="text-grad">MaintHub?</span></>}>
        MaintHub adalah platform CMMS (Computerized Maintenance Management System) berbasis web untuk pabrik dengan satu atau banyak plant. Semua urusan maintenance, dari data aset sampai analisis penyebab kerusakan, ada di satu tempat.
      </PageHero>

      <section className="px-5 pb-24 sm:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Our mission</h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-300">Membantu tim perawatan berhenti sekadar memperbaiki yang rusak, dan mulai mencegahnya. Alatnya dipakai teknisi setiap hari, bukan cuma dilihat manajemen sebulan sekali.</p>
            <p className="mt-4 leading-relaxed text-slate-400">Nama <strong className="font-medium text-slate-200">MaintHub</strong> berarti pusat (<em>hub</em>) tempat semua data perawatan bertemu. Logonya, kubus modul dengan antena sensor, menggambarkan modul yang saling terhubung dan data yang terus mengalir untuk memprediksi masalah.</p>
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
            {[['PostgreSQL 16', 'Aturan bisnis dan pemisahan data antar organisasi dijaga di level database'], ['NestJS API', 'Validasi ketat, hak akses per modul, dan jejak audit'], ['Next.js', 'Tampilan web yang nyaman dipakai di kantor maupun di lapangan'], ['Docker', 'Bisa dipasang di server sendiri atau cloud pilihan Anda']].map(([t, d], i) => (
              <Reveal key={t} delay={i * 80} className="bg-[#07090d] p-7"><div className="font-mono text-sm text-blue-400">{t}</div><p className="mt-3 text-sm leading-relaxed text-slate-400">{d}</p></Reveal>))}
          </div>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
