'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { bootstrap, getUser, logout, User } from '@/lib/api';

const NAV = [
  { m: 1, href: '/assets', label: 'Aset & Equipment' },
  { m: 2, href: '/pm', label: 'Preventive' },
  { m: 3, href: '/work-orders', label: 'Work Order' },
  { m: 6, href: '/inventory', label: 'Sparepart & Inventory' },
  { m: 10, href: '/admin', label: 'Administrasi' },
];
const LATER = ['AI Assistant', 'Electrical & Utility', 'RCA & Failure', 'Dashboard KPI'];

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname(); const router = useRouter();
  const [user, setUser] = useState<User | null>(getUser());
  const [ready, setReady] = useState(!!getUser());
  useEffect(() => {
    if (user) return;
    bootstrap().then((u) => { if (!u) router.replace('/login'); else { setUser(u); setReady(true); } });
  }, [user, router]);
  if (!ready || !user) return <p className="p-6 text-sm text-slate-500">Memuat…</p>;
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r bg-white p-3">
        <div className="mb-4 text-base font-semibold">MaintainHub</div>
        <nav className="space-y-1 text-sm">
          {NAV.filter((n) => user.modules.includes(n.m)).map((n) => (
            <Link key={n.href} href={n.href} className={`block rounded px-2 py-1.5 ${path.startsWith(n.href) ? 'bg-blue-50 font-medium text-blue-700' : 'hover:bg-slate-100'}`}>{n.label}</Link>
          ))}
          <div className="pt-3 text-xs uppercase text-slate-400">Tahap berikutnya</div>
          {LATER.map((l) => <div key={l} className="px-2 py-1 text-slate-400">{l}</div>)}
        </nav>
        <div className="mt-6 border-t pt-3 text-xs text-slate-500">
          <div className="font-medium text-slate-700">{user.name}</div><div>{user.role}</div>
          <button className="mt-2 underline" onClick={async () => { await logout(); router.replace('/login'); }}>Keluar</button>
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
