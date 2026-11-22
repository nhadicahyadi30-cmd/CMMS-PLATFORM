'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Logo from '../Logo';
import ThemeToggle from './ThemeToggle';

const LINKS = [['/products', 'Products'], ['/services', 'Services'], ['/about', 'About'], ['/clients', 'Clients'], ['/contact', 'Contact']] as const;

export default function SiteHeader() {
  const path = usePathname(); const [solid, setSolid] = useState(false); const [open, setOpen] = useState(false);
  useEffect(() => { const f = () => setSolid(window.scrollY > 24); f(); window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f); }, []);
  useEffect(() => setOpen(false), [path]);
  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${solid || open ? 'border-b border-white/10 bg-[#07090d]/80 backdrop-blur-xl' : 'border-b border-transparent'}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="MaintHub home"><Logo size={40} tagline compact /></Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Site navigation">
          {LINKS.map(([h, l]) => <Link key={h} href={h} aria-current={path === h ? 'page' : undefined} className={`rounded-md px-3.5 py-2 text-sm transition ${path === h ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>{l}</Link>)}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <Link href="/login" className="rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/50 hover:bg-white/5">Sign In</Link>
          <Link href="/contact" className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#07090d] transition hover:bg-teal-300">Request a Demo</Link>
        </div>
        <button className="rounded-md p-2 text-slate-200 hover:bg-white/10 md:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">{open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
        </button>
      </div>
      {open && (
        <div className="border-t border-white/10 px-5 pb-5 pt-2 md:hidden">
          {LINKS.map(([h, l]) => <Link key={h} href={h} className="block border-b border-white/5 py-3 text-lg text-slate-100">{l}</Link>)}
          <div className="mt-4 flex items-center gap-2"><ThemeToggle /><Link href="/login" className="flex-1 rounded-md border border-white/25 py-2.5 text-center text-sm font-medium text-white">Sign In</Link><Link href="/contact" className="flex-1 rounded-md bg-white py-2.5 text-center text-sm font-semibold text-[#07090d]">Request a Demo</Link></div>
        </div>
      )}
    </header>
  );
}
