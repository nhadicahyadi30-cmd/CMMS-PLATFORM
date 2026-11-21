'use client';
import Link from 'next/link';
import { getUser } from '@/lib/api';

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
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Halo, {u.name.split(' ')[0]}</h1>
        <p className="text-sm text-slate-600">Pilih apa yang mau dikerjakan.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href}
            className={`flex min-h-24 flex-col justify-center rounded-2xl border p-4 transition ${t.main ? 'border-blue-600 bg-blue-600 text-white shadow-md hover:bg-blue-700 sm:col-span-2 lg:col-span-1' : 'border-slate-200 bg-white text-slate-900 hover:border-blue-400 hover:shadow'}`}>
            <span className="text-lg font-semibold">{t.title}</span>
            <span className={`mt-0.5 text-sm ${t.main ? 'text-blue-100' : 'text-slate-600'}`}>{t.hint}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
