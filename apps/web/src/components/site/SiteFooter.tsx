import Link from 'next/link';
import Logo from '../Logo';
import { CONTACT } from '@/lib/site-content';

export default function SiteFooter() {
  const col = (title: string, items: [string, string][]) => (
    <div><h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</h3>
      <ul className="mt-4 space-y-2.5 text-sm">{items.map(([h, l]) => <li key={h}><Link href={h} className="text-slate-300 transition hover:text-teal-300">{l}</Link></li>)}</ul></div>
  );
  return (
    <footer className="border-t border-white/10 bg-[#05070a]">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div><Logo size={44} tagline /><p className="mt-5 max-w-xs text-sm leading-relaxed text-slate-400">CMMS platform for plants that would rather prevent than repair.</p></div>
        {col('Platform', [['/products', 'Products'], ['/services', 'Services'], ['/login', 'Sign in to the app']])}
        {col('Company', [['/about', 'About us'], ['/clients', 'Clients & pilot partners'], ['/contact', 'Contact']])}
        <div><h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Get in touch</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-300"><li><a className="hover:text-teal-300" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></li><li>{CONTACT.phone}</li><li>{CONTACT.address}</li></ul></div>
      </div>
      <div className="border-t border-white/5 py-6 text-center text-xs text-slate-500">© {new Date().getFullYear()} MaintHub. All rights reserved.</div>
    </footer>
  );
}
