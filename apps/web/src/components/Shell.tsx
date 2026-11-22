'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { bootstrap, getUser, logout, User } from '@/lib/api';
import Logo from './Logo';
import NotificationBell from './NotificationBell';
import HelpButton from './HelpButton';
import ConfirmHost from './Confirm';

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
  mon: 'M3 4h18v12H3zM8 20h8M12 16v4M7 11l3-3 3 3 4-4',
  dev: 'M7 7h10v10H7zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4',
  pred: 'M3 17l5-5 4 3 8-9M15 6h5v5',
  wf: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 19v-1.5C3 15 5.5 13 9 13s6 2 6 4.5V19H3Zm13-13a2.5 2.5 0 0 1 0 5m1 2c2.5.4 4 2 4 4v2h-3',
  qr: 'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h2v2h-2v-2Zm4 0h2v2h-2v-2Zm-4 4h2v2h-2v-2Zm4 0h2v2h-2v-2ZM7 7h0m10 0h0M7 17h0',
  insp: 'M9 4h6l1 2h3v15H5V6h3l1-2Zm-1 9 2 2 4-4M8 18h8',
  ptw: 'M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6l-8-3Zm-3 9 2.2 2.2L15.5 10',
  fld: 'M5 3h14v18H5V3Zm4 15h6M9 7h6M9 11h6',
  home: 'M3 11 12 4l9 7v9h-6v-6H9v6H3v-9Z',
  skill: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z',
  adm: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
};
const NAV: { m: number; href: string; label: string; icon: keyof typeof I; group: string }[] = [
  { m: 3, href: '/home', label: 'Home', icon: 'home', group: 'Operations' },
  { m: 3, href: '/work-orders', label: 'Work Orders', icon: 'wo', group: 'Operations' },
  { m: 2, href: '/pm', label: 'Preventive Maintenance', icon: 'pm', group: 'Operations' },
  { m: 11, href: '/inspections', label: 'Inspections & Checklists', icon: 'insp', group: 'Operations' },
  { m: 12, href: '/permits', label: 'Permit to Work (PTW)', icon: 'ptw', group: 'Operations' },
  { m: 11, href: '/field', label: 'Field Mode', icon: 'fld', group: 'Operations' },
  { m: 3, href: '/workload', label: 'Technician Workload', icon: 'wf', group: 'Operations' },
  { m: 3, href: '/skills', label: 'Skill Matrix', icon: 'skill', group: 'Operations' },
  { m: 1, href: '/assets', label: 'Assets & Equipment', icon: 'asset', group: 'Operations' },
  { m: 1, href: '/scan', label: 'Scan Asset QR', icon: 'qr', group: 'Operations' },
  { m: 6, href: '/inventory', label: 'Spare Parts & Inventory', icon: 'inv', group: 'Operations' },
  { m: 9, href: '/kpi', label: 'KPI Dashboard', icon: 'kpi', group: 'Analytics' },
  { m: 9, href: '/reports', label: 'Reports', icon: 'rep', group: 'Analytics' },
  { m: 8, href: '/rca', label: 'RCA & Failures', icon: 'rca', group: 'Analytics' },
  { m: 1, href: '/monitoring', label: 'Machine Monitoring', icon: 'mon', group: 'Analytics' },
  { m: 1, href: '/predictions', label: 'Predictions Dashboard', icon: 'pred', group: 'Analytics' },
  { m: 1, href: '/devices', label: 'RTU Devices', icon: 'dev', group: 'Analytics' },
  { m: 1, href: '/telemetry', label: 'Telemetry (Sensors & Keys)', icon: 'tel', group: 'Analytics' },
  { m: 7, href: '/energy', label: 'Electrical & Utility', icon: 'energy', group: 'Analytics' },
  { m: 5, href: '/ai', label: 'AI Assistant', icon: 'ai', group: 'Analytics' },
  { m: 1, href: '/import', label: 'Data Import', icon: 'imp', group: 'Settings' },
  { m: 10, href: '/admin', label: 'Administration', icon: 'adm', group: 'Settings' },
];
const ROLE: Record<string, string> = { admin: 'Administrator', supervisor: 'Supervisor', planner: 'Planner', technician: 'Technician', production: 'Production' };

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
    bootstrap().then((u) => { if (!u) router.replace(`/login?next=${encodeURIComponent(path)}`); else { setUser(u); setReady(true); } });
  }, [user, router, path]);
  useEffect(() => setOpen(false), [path]);
  if (!ready || !user) return <div className="flex min-h-screen items-center justify-center bg-ink-950"><div className="animate-pulse"><Logo size={56} dark /></div></div>;

  const items = NAV.filter((n) => user.modules.includes(n.m) && (n.href !== '/import' || user.role !== 'technician') && !(user.role === 'production' && ['/workload', '/skills'].includes(n.href)) && (n.href !== '/home' || ['technician', 'production'].includes(user.role)));
  const groups = [...new Set(items.map((n) => n.group))];
  const QUICK: Record<string, string[]> = { technician: ['/home', '/work-orders', '/inspections', '/permits'], production: ['/home', '/work-orders', '/inspections', '/permits'] };
  const quick = (QUICK[user.role] ?? ['/work-orders', '/pm', '/inspections', '/permits']).map((h) => items.find((n) => n.href === h)).filter((n): n is (typeof items)[number] => !!n).slice(0, 4);
  const initials = user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const side = (
    <aside className="flex h-full w-64 flex-col bg-ink-900 text-slate-300">
      <div className="border-b border-white/5 px-5 py-5"><Link href="/work-orders" aria-label="MaintHub beranda"><Logo size={40} tagline /></Link></div>
      <nav className="nav-scroll flex-1 space-y-5 overflow-y-auto px-3 py-4 text-sm" aria-label="Navigasi utama">
        {groups.map((g) => (
          <div key={g}>
            <div className="mb-1.5 px-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{g}</div>
            <div className="space-y-0.5">
              {items.filter((n) => n.group === g).map((n) => {
                const on = path.startsWith(n.href);
                return (
                  <Link key={n.href} href={n.href} aria-current={on ? 'page' : undefined}
                    className={`group relative flex items-center gap-3 rounded-lg px-2.5 py-2 transition ${on ? 'bg-white/10 font-semibold text-white' : 'hover:bg-white/5 hover:text-white'}`}>
                    {on && <span className="absolute inset-y-1 left-0 w-1 rounded-sm bg-yellow-400" />}
                    <span className={on ? 'text-yellow-300' : 'text-slate-500 group-hover:text-slate-300'}><NavIcon d={I[n.icon]} /></span>
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
          <NotificationBell place="above" />
          <button className="rounded-md p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-white" title="Keluar" aria-label="Keluar" onClick={async () => { await logout(); router.replace('/login'); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="app-root min-h-screen lg:flex">
      <div className="hidden shrink-0 lg:block print:hidden"><div className="sticky top-0 h-screen">{side}</div></div>
      <div className="sticky top-0 z-30 flex items-center justify-between bg-ink-900 px-4 py-3 lg:hidden print:hidden">
        <Logo size={30} />
        <div className="flex items-center gap-1 text-slate-300"><NotificationBell />
        <button className="rounded-md p-2 text-slate-300 hover:bg-white/10" aria-label="Buka menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button></div>
      </div>
      {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} /><div className="absolute inset-y-0 left-0 shadow-2xl">{side}</div></div>}
      <main className="app-main min-w-0 flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8"><div className="mx-auto max-w-7xl">{children}</div></main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ink-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden" aria-label="Pintasan">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {quick.map((n) => {
            const on = path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={on ? 'page' : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[0.68rem] font-medium ${on ? 'text-yellow-300' : 'text-slate-400'}`}>
                <NavIcon d={I[n.icon]} /><span className="max-w-full truncate">{n.label.replace('Inspections & Checklists', 'Inspections').replace('Permit to Work (PTW)', 'Permits').replace('Preventive Maintenance', 'Preventive').replace('Spare Parts & Inventory', 'Inventory')}</span>
              </Link>
            );
          })}
          <button className="flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[0.68rem] font-medium text-slate-400" onClick={() => setOpen(true)} aria-label="Buka semua menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>Menu
          </button>
        </div>
      </nav>
      <HelpButton />
      <ConfirmHost />
    </div>
  );
}
