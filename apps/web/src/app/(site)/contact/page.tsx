import type { Metadata } from 'next';
import PageHero from '@/components/site/PageHero';
import ContactForm from '@/components/site/ContactForm';
import { CONTACT } from '@/lib/site-content';

export const metadata: Metadata = { title: 'Contact & Demo', description: 'Minta demo MaintHub atau hubungi tim kami.' };

export default function Contact() {
  return (
    <>
      <PageHero eyebrow="Contact" title={<>Let's talk about <span className="text-grad">your plant’s reliability.</span></>}>Ceritakan singkat tentang pabrik Anda. Kami balas dengan usulan jadwal demo.</PageHero>
      <section className="px-5 pb-28 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_1.3fr]">
          <div className="space-y-6 text-slate-300">
            {[['Email', CONTACT.email], ['Phone', CONTACT.phone], ['Location', CONTACT.address]].map(([l, v]) => <div key={l}><div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{l}</div><div className="mt-1.5 text-lg">{v}</div></div>)}
            <p className="text-sm leading-relaxed text-slate-500">Sudah punya akun? Klik <em>Sign In</em> di pojok kanan atas.</p>
          </div>
          <ContactForm email={CONTACT.email} />
        </div>
      </section>
    </>
  );
}
