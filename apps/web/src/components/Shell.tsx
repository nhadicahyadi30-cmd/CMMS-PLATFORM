'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { bootstrap, getUser, logout, User } from '@/lib/api';
import Logo from './Logo';

type Icon = string; // path data, gaya garis 24x24
const I: Record<string, Icon> = {
  asset: 'M12 3 3 8v8l9 5 9-5V8l-9-5Zm0 0v18M3 8l9 5 9-5',
  pm: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm4 10 2 2 4-4',
  wo: 'M9 3h6l1 2h3v16H5V5h3l1-2Zm-1 9h8M8 16h5',
  energy: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  rca: 'M4 6h8M4 12h12M4 18h6M16 6l5 0M19 3v6M14 18a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z',
  ai: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Zm7 11 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z',
  inv: 'M3 7l9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4',
  kpi: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  rep: 'M7 3h8l4 4v14H7V3Zm8 0v4h4M10 12h6M10 16h6M10 8h2',
  imp: 'M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3',
  tel: 'M3 12h4l2-6 4 12 2-6h6',
  adm: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
};
const NAV: { m: number; href: string; label: string; icon: keyof typeof I; group: string }[] = [
  { m: 3, href: '/work-orders', label: 'Work Order', icon: 'wo', group: 'Operasi' },
  { m: 2, href: '/pm', label: 'Preventive', icon: 'pm', group: 'Operasi' },
  { m: 1, href: '/assets', label: 'Aset & Equipment', icon: 'asset', group: 'Operasi' },
  { m: 6, href: '/inventory', label: 'Sparepart & Inventory', icon: 'inv', group: 'Operasi' },
  { m: 9, href: '/kpi', label: 'Dashboard KPI', icon: 'kpi', group: 'Analitik' },
  { m: 9, href: '/reports', label: 'Reports', icon: 'rep', group: 'Analitik' },
  { m: 8, href: '/rca', label: 'RCA & Failure', icon: 'rca', group: 'Analitik' },
  { m: 1, href: '/telemetry', label: 'Telemetri Mesin', icon: 'tel', group: 'Analitik' },
  { m: 7, href: '/energy', label: 'Electrical & Utility', icon: 'energy', group: 'Analitik' },
  { m: 5, href: '/ai', label: 'AI Assistant', icon: 'ai', group: 'Analitik' },
  { m: 1, href: '/import', label: 'Impor Data', icon: 'imp', group: 'Pengaturan' },
  { m: 10, href: '/admin', label: 'Administrasi', icon: 'adm', group: 'Pengaturan' },
];
const ROLE: Record<string, string> = { admin: 'Administrator', supervisor: 'Supervisor', planner: 'Planner', technician: 'Teknisi' };

function NavIcon({ d }: { d: string }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0"><path d={d} /></svg>;
}

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname(); const router = useRouter();
  const [user, setUser] = useState<User | null>(getUser());
  const [ready, setReady] = useState(!!getUser());
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (user) return;
    bootstrap().then((u) => { if (!u) router.replace('/login'); else { setUser(u); setReady(true); } });
  }, [user, router]);
  useEffect(() => setOpen(false), [path]);
  if (!ready || !user) return <div className="flex min-h-screen items-center justify-center bg-ink-950"><div className="animate-pulse"><Logo size={56} dark /></div></div>;

  const items = NAV.filter((n) => user.modules.includes(n.m) && (n.href !== '/import' || user.role !== 'technician'));
  const groups = [...new Set(items.map((n) => n.group))];
  const initials = user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const side = (
    <aside className="flex h-full w-64 flex-col bg-ink-900 text-slate-300">
      <div className="border-b border-white/5 px-5 py-5"><Link href="/work-orders" aria-label="MaintHub beranda"><Logo size={40} tagline /></Link></div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 text-sm" aria-label="Navigasi utama">
        {groups.map((g) => (
          <div key={g}>
            <div className="mb-1.5 px-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{g}</div>
            <div className="space-y-0.5">
              {items.filter((n) => n.group === g).map((n) => {
                const on = path.startsWith(n.href);
                return (
                  <Link key={n.href} href={n.href} aria-current={on ? 'page' : undefined}
                    className={`group relative flex items-center gap-3 rounded-lg px-2.5 py-2 transition ${on ? 'bg-white/10 font-medium text-white' : 'hover:bg-white/5 hover:text-white'}`}>
                    {on && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-gradient-to-b from-blue-400 to-teal-400" />}
                    <span className={on ? 'text-teal-400' : 'text-slate-500 group-hover:text-slate-300'}><NavIcon d={I[n.icon]} /></span>
                    {n.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/5 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-teal-400 text-xs font-semibold text-ink-950" aria-hidden="true">{initials}</div>
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-white">{user.name}</div><div className="text-xs text-slate-500">{ROLE[user.role] ?? user.role}</div></div>
          <button className="rounded-md p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-white" title="Keluar" aria-label="Keluar" onClick={async () => { await logout(); router.replace('/login'); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen lg:flex">
      <div className="hidden shrink-0 lg:block"><div className="sticky top-0 h-screen">{side}</div></div>
      <div className="sticky top-0 z-30 flex items-center justify-between bg-ink-900 px-4 py-3 lg:hidden">
        <Logo size={30} />
        <button className="rounded-md p-2 text-slate-300 hover:bg-white/10" aria-label="Buka menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      </div>
      {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} /><div className="absolute inset-y-0 left-0 shadow-2xl">{side}</div></div>}
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-7xl">{children}</div></main>
    </div>
  );
}
