import type { Metadata } from 'next';
import Reveal from '@/components/site/Reveal';
import PageHero from '@/components/site/PageHero';
import CtaBand from '@/components/site/CtaBand';
import { LogoMark } from '@/components/Logo';

export const metadata: Metadata = { title: 'Tentang MaintHub', description: 'Apa itu MaintHub, apa yang kami yakini, dan bagaimana platform ini dibangun.' };

const VALUES = [
  ['Data lapangan dulu', 'Angka KPI harus berasal dari kejadian nyata di lantai pabrik, bukan input manual yang bisa dipoles.'],
  ['Aturan dijaga sistem', 'Alur work order, stok yang tak bisa minus, dan log yang tak bisa diubah ditegakkan di database — bukan sekadar kebiasaan.'],
  ['Sederhana untuk teknisi', 'Teknisi cukup memakai WhatsApp atau satu layar. Kerumitan ada di belakang, bukan di tangan mereka.'],
  ['Jujur soal kemampuan', 'Kami menandai apa yang sudah teruji dan apa yang belum. Kepercayaan dibangun dari itu.'],
];

export default function About() {
  return (
    <>
      <PageHero eyebrow="Tentang kami" title={<>Apa itu <span className="text-grad">MaintHub?</span></>}>
        MaintHub adalah platform CMMS (Computerized Maintenance Management System) berbasis web untuk pabrik multi-plant. Ia mengelola seluruh aktivitas perawatan — dari aset sampai analisis akar masalah — dalam satu tempat.
      </PageHero>

      <section className="px-5 pb-24 sm:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Misi kami</h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-300">Membantu tim perawatan berpindah dari bereaksi terhadap kerusakan ke memprediksi dan mencegahnya — dengan alat yang dipakai teknisi sehari-hari, bukan hanya dilihat manajemen setiap bulan.</p>
            <p className="mt-4 leading-relaxed text-slate-400">Nama <strong className="font-medium text-slate-200">MaintHub</strong> menggambarkan idenya: sebuah <em>hub</em> tempat semua data perawatan bertemu. Lambangnya — kubus modul dengan antena sensor — melambangkan modul-modul yang saling terhubung dan data yang mengalir untuk prediksi.</p>
          </Reveal>
          <Reveal delay={120}><div className="relative flex aspect-square max-w-md items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent"><div className="absolute inset-10 rounded-full bg-teal-400/10 blur-3xl" aria-hidden="true" /><LogoMark size={230} className="mh-float relative" /></div></Reveal>
        </div>
      </section>

      <section className="border-y border-white/5 bg-[#090c11] px-5 py-24 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal><h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Yang kami pegang</h2></Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {VALUES.map(([t, d], i) => <Reveal key={t} delay={(i % 2) * 100}><div className="h-full rounded-2xl border border-white/10 p-8"><h3 className="text-xl font-semibold text-teal-300">{t}</h3><p className="mt-3 leading-relaxed text-slate-400">{d}</p></div></Reveal>)}
          </div>
        </div>
      </section>

      <section className="px-5 py-24 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal><h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Dibangun di atas fondasi yang kuat</h2></Reveal>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {[['PostgreSQL 16', 'Aturan bisnis & isolasi data (row-level security) di level database'], ['NestJS API', 'Validasi ketat, peran per modul, jejak audit'], ['Next.js', 'Antarmuka web responsif untuk kantor dan lapangan'], ['Docker', 'Dipasang di server Anda sendiri atau cloud pilihan']].map(([t, d], i) => (
              <Reveal key={t} delay={i * 80} className="bg-[#07090d] p-7"><div className="font-mono text-sm text-blue-400">{t}</div><p className="mt-3 text-sm leading-relaxed text-slate-400">{d}</p></Reveal>))}
          </div>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
