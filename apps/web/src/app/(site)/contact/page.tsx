import type { Metadata } from 'next';
import PageHero from '@/components/site/PageHero';
import ContactForm from '@/components/site/ContactForm';
import { CONTACT } from '@/lib/site-content';

export const metadata: Metadata = { title: 'Kontak & Demo', description: 'Minta demo MaintHub atau hubungi tim kami.' };

export default function Contact() {
  return (
    <>
      <PageHero eyebrow="Kontak" title={<>Mari bicara soal <span className="text-grad">mesin Anda.</span></>}>Ceritakan sedikit tentang pabrik Anda. Kami balas dengan jadwal demo.</PageHero>
      <section className="px-5 pb-28 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_1.3fr]">
          <div className="space-y-6 text-slate-300">
            {[['Email', CONTACT.email], ['Telepon', CONTACT.phone], ['Lokasi', CONTACT.address]].map(([l, v]) => <div key={l}><div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{l}</div><div className="mt-1.5 text-lg">{v}</div></div>)}
            <p className="text-sm leading-relaxed text-slate-500">Sudah punya akun? Gunakan tombol <em>Masuk</em> di bagian atas halaman.</p>
          </div>
          <ContactForm email={CONTACT.email} />
        </div>
      </section>
    </>
  );
}
