'use client';
import Link from 'next/link';
import { getUser } from '@/lib/api';
import FactoryScene from '@/components/FactoryScene';

type Tile = { href: string; title: string; hint: string; m: number; main?: boolean };

const TILES: Record<string, Tile[]> = {
  technician: [
    { href: '/work-orders', title: 'Work Order saya', hint: 'Lihat dan kerjakan tugas yang ditugaskan', m: 3, main: true },
    { href: '/inspections', title: 'Isi inspeksi', hint: 'Checklist harian atau mingguan mesin', m: 11 },
    { href: '/permits', title: 'Izin kerja', hint: 'Ajukan izin, pasang gembok, mulai kerja', m: 12 },
    { href: '/field', title: 'Mode Lapangan', hint: 'Tetap bisa bekerja tanpa sinyal', m: 11 },
    { href: '/scan', title: 'Pindai QR aset', hint: 'Buka atau laporkan mesin dari kodenya', m: 1 },
    { href: '/inventory', title: 'Sparepart', hint: 'Cek stok suku cadang', m: 6 },
  ],
  production: [
    { href: '/work-orders/new', title: 'Lapor kerusakan', hint: 'Mesin bermasalah? Laporkan di sini', m: 3, main: true },
    { href: '/work-orders', title: 'Laporan saya', hint: 'Pantau perkembangan perbaikan', m: 3 },
    { href: '/permits', title: 'Izin kerja di area saya', hint: 'Serahkan area dan konfirmasi penutupan', m: 12 },
    { href: '/inspections', title: 'Checklist operator', hint: 'Pemeriksaan harian mesin', m: 11 },
    { href: '/scan', title: 'Pindai QR aset', hint: 'Laporkan mesin langsung dari kodenya', m: 1 },
  ],
};

export default function Home() {
  const u = getUser();
  if (!u) return null;
  const tiles = (TILES[u.role] ?? [{ href: '/work-orders', title: 'Work Order', hint: 'Daftar semua pekerjaan', m: 3, main: true }]).filter((t) => u.modules.includes(t.m));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Halo, {u.name.split(' ')[0]}</h1>
          <p className="mt-3 text-sm text-slate-700">Pilih apa yang mau dikerjakan.</p>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <div className="grid gap-3 sm:grid-cols-2">
          {tiles.map((t, i) => (
            <Link key={t.href} href={t.href}
              className={`group relative flex min-h-28 flex-col justify-between rounded-xl border-[1.5px] p-4 transition hover:-translate-y-0.5 ${t.main ? 'border-ink-900 bg-ink-900 text-white sm:col-span-2' : 'border-stone-300 bg-white text-ink-900 hover:border-ink-900'}`}
              style={{ boxShadow: t.main ? '0 4px 0 #ffc93c' : '0 3px 0 rgba(16,27,51,.12)' }}>
              <span className={`text-xs font-bold tracking-widest ${t.main ? 'text-yellow-300' : 'text-slate-500'}`}>{String(i + 1).padStart(2, '0')}</span>
              <span>
                <span className="block text-xl font-bold leading-tight" style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif", textTransform: 'uppercase' }}>{t.title} <span aria-hidden="true" className={`inline-block transition group-hover:translate-x-1 ${t.main ? 'text-yellow-300' : 'text-blue-700'}`}>→</span></span>
                <span className={`mt-0.5 block text-sm ${t.main ? 'text-slate-300' : 'text-slate-600'}`}>{t.hint}</span>
              </span>
            </Link>
          ))}
        </div>
        <div className="hidden overflow-hidden rounded-xl border-[1.5px] border-ink-900 bg-ink-900 lg:block" style={{ boxShadow: '0 4px 0 rgba(16,27,51,.25)' }}>
          <FactoryScene className="w-full" />
        </div>
      </div>
    </div>
  );
}
