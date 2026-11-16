import type { Metadata } from 'next';
import PageHero from '@/components/site/PageHero';
import ContactForm from '@/components/site/ContactForm';
import { CONTACT } from '@/lib/site-content';

export const metadata: Metadata = { title: 'Contact & Demo', description: 'Request a MaintHub demo or get in touch with our team.' };

export default function Contact() {
  return (
    <>
      <PageHero eyebrow="Contact" title={<>Let's talk about <span className="text-grad">your plant’s reliability.</span></>}>Tell us briefly about your plant. We will reply with a proposed demo schedule.</PageHero>
      <section className="px-5 pb-28 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_1.3fr]">
          <div className="space-y-6 text-slate-300">
            {[['Email', CONTACT.email], ['Phone', CONTACT.phone], ['Location', CONTACT.address]].map(([l, v]) => <div key={l}><div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{l}</div><div className="mt-1.5 text-lg">{v}</div></div>)}
            <p className="text-sm leading-relaxed text-slate-500">Already have an account? Click <em>Sign In</em> at the top right.</p>
          </div>
          <ContactForm email={CONTACT.email} />
        </div>
      </section>
    </>
  );
}
