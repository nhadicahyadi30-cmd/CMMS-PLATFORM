'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { canInstall, onInstallChange, promptInstall } from '@/lib/pwa';

interface N { id: string; kind: string; title: string; body: string; link: string; createdAt: string; readAt: string | null }
const KIND: Record<string, { c: string; t: string }> = {
  alarm: { c: 'bg-red-500', t: 'Alarm' }, wo_new: { c: 'bg-blue-500', t: 'WO baru' }, wo_assigned: { c: 'bg-teal-500', t: 'Tugas' }, wo_pm: { c: 'bg-amber-500', t: 'PM' },
};
const ago = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 1 ? 'baru saja' : m < 60 ? `${m} mnt lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`; };

/** Bel notifikasi: polling ringan tiap 30 detik; menampilkan notifikasi perangkat bila diizinkan dan aplikasi sedang terbuka. */
export default function NotificationBell({ place = 'below' }: { place?: 'below' | 'above' }) {
  const router = useRouter();
  const [unread, setUnread] = useState(0); const [open, setOpen] = useState(false); const [items, setItems] = useState<N[] | null>(null);
  const [perm, setPerm] = useState<string>('unsupported'); const [install, setInstall] = useState(canInstall());
  const lastSeen = useRef<string | null>(null); const box = useRef<HTMLDivElement>(null);

  useEffect(() => { if (typeof Notification !== 'undefined') setPerm(Notification.permission); return onInstallChange(() => setInstall(canInstall())); }, []);

  const load = useCallback(async () => { try { const d = await api<{ items: N[]; unread: number }>('/notifications?limit=15'); setItems(d.items); setUnread(d.unread); } catch { /* abaikan */ } }, []);

  const notify = useCallback(async (title: string, body: string, link: string) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
      if (reg) await reg.showNotification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: 'mainthub', data: { link } });
      else new Notification(title, { body, icon: '/icons/icon-192.png' });
    } catch { /* abaikan */ }
  }, []);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const c = await api<{ unread: number; latest: string | null }>('/notifications/count'); if (stop) return;
        setUnread(c.unread);
        if (c.latest && lastSeen.current !== null && c.latest > lastSeen.current) {     // ada yang baru sejak pengecekan terakhir
          const d = await api<{ items: N[] }>('/notifications?unread=1&limit=1'); const n = d.items[0];
          if (n) { setItems(null); await notify(n.title, n.body, n.link); }
        }
        if (c.latest) lastSeen.current = c.latest; else if (lastSeen.current === null) lastSeen.current = '';   // '' = belum ada notifikasi sebelumnya
      } catch { /* jaringan putus: coba lagi nanti */ }
    };
    tick(); const t = setInterval(tick, 30000); return () => { stop = true; clearInterval(t); };
  }, [notify]);

  useEffect(() => {
    if (!open) return;
    load();
    const out = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', out); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); };
  }, [open, load]);

  async function go(n: N) {
    setOpen(false);
    if (!n.readAt) { try { await api(`/notifications/${n.id}/read`, { method: 'POST' }); setUnread((u) => Math.max(0, u - 1)); } catch { /* abaikan */ } }
    if (n.link) router.push(n.link);
  }
  async function readAll() { try { await api('/notifications/read-all', { method: 'POST' }); setUnread(0); setItems((l) => l?.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })) ?? null); } catch { /* abaikan */ } }
  async function enable() { if (typeof Notification !== 'undefined') setPerm(await Notification.requestPermission()); }

  return (
    <div className="relative" ref={box}>
      <button className="relative rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label={`Notifikasi${unread ? `, ${unread} belum dibaca` : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7ZM10 20a2 2 0 0 0 4 0" /></svg>
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[0.6rem] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifikasi" className={`absolute z-50 w-80 max-w-[88vw] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-2xl ${place === 'above' ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-2'}`}>
          <div className="flex items-center justify-between border-b px-3 py-2"><span className="text-sm font-semibold">Notifikasi</span>{unread > 0 && <button className="text-xs text-blue-700 hover:underline" onClick={readAll}>Tandai semua dibaca</button>}</div>
          <ul className="max-h-80 overflow-y-auto">
            {items === null && <li className="p-4 text-center text-sm text-slate-500">Memuat…</li>}
            {items?.map((n) => (
              <li key={n.id}><button onClick={() => go(n)} className={`flex w-full gap-2 border-b px-3 py-2.5 text-left hover:bg-slate-50 ${n.readAt ? '' : 'bg-blue-50/60'}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${KIND[n.kind]?.c ?? 'bg-slate-400'}`} aria-hidden="true" />
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{n.title}</span><span className="block truncate text-xs text-slate-500">{n.body}</span><span className="text-[0.7rem] text-slate-400">{KIND[n.kind]?.t} · {ago(n.createdAt)}</span></span></button></li>))}
            {items && !items.length && <li className="p-6 text-center text-sm text-slate-500">Belum ada notifikasi.</li>}
          </ul>
          {(perm === 'default' || install) && (
            <div className="space-y-1 border-t bg-slate-50 px-3 py-2 text-xs">
              {perm === 'default' && <button className="block text-blue-700 hover:underline" onClick={enable}>Aktifkan notifikasi di perangkat ini</button>}
              {install && <button className="block text-blue-700 hover:underline" onClick={() => promptInstall()}>Pasang MaintHub sebagai aplikasi</button>}
              {perm === 'default' && <p className="text-slate-400">Notifikasi perangkat muncul saat MaintHub terbuka di latar belakang.</p>}
            </div>)}
        </div>)}
    </div>
  );
}
