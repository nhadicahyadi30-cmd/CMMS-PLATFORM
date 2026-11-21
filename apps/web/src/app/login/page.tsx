'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, login } from '@/lib/api';
import Link from 'next/link';
import Logo from '@/components/Logo';
import FactoryScene from '@/components/FactoryScene';

const POINTS = ['Lapor kerusakan dan pantau perbaikannya sampai selesai', 'Izin kerja dan LOTO yang tidak bisa dilewati', 'Checklist dan inspeksi tetap jalan tanpa sinyal'];

export default function Login() {
  const r = useRouter();
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr('');
    const f = new FormData(e.currentTarget);
    try { await login(String(f.get('org')), String(f.get('username')), String(f.get('password'))); { const nx = new URLSearchParams(window.location.search).get('next'); r.replace(nx && /^\/(?!\/)/.test(nx) && !nx.startsWith('/login') ? nx : (['technician', 'production'].includes(getUser()?.role ?? '') ? '/home' : '/work-orders')); } }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }
  const fld = 'mt-1 w-full rounded-lg border-[1.5px] border-stone-400/70 bg-white px-3 py-2.5 text-base text-ink-900 placeholder:text-stone-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25';
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.15fr_1fr]" style={{ fontFamily: "'Barlow', Inter, system-ui, sans-serif" }}>
      <section className="relative hidden flex-col overflow-hidden bg-ink-900 text-white lg:flex">
        <div className="stripe-bar" aria-hidden="true" />
        <div className="flex flex-1 flex-col justify-between p-10 xl:p-14">
          <Link href="/" aria-label="Ke beranda"><Logo size={44} dark /></Link>
          <div>
            <h1 className="uppercase leading-[0.95]" style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif", fontWeight: 800, fontSize: 'clamp(3rem, 5vw, 4.6rem)' }}>
              Rawat mesin.<br /><span className="bg-yellow-400 px-2 text-ink-900" style={{ marginLeft: '-0.5rem' }}>Jaga keselamatan.</span><br />Catat semuanya.
            </h1>
            <ul className="mt-6 max-w-md space-y-2 text-[0.95rem] text-slate-300">
              {POINTS.map((t) => <li key={t} className="flex gap-3"><span className="mt-2 h-1.5 w-3 shrink-0 bg-yellow-400" aria-hidden="true" />{t}</li>)}
            </ul>
          </div>
          <FactoryScene className="-mb-6 -mr-10 w-[112%] max-w-none" />
        </div>
      </section>
      <section className="flex flex-col justify-center bg-[#f2efe7] px-5 py-10 sm:px-10">
        <Link href="/" className="mb-8 text-sm font-medium text-slate-600 hover:text-ink-900 lg:hidden">← Beranda</Link>
        <form onSubmit={submit} className="mx-auto w-full max-w-sm space-y-4">
          <div className="lg:hidden"><Logo size={40} dark={false} /></div>
          <div>
            <h2 className="uppercase text-ink-900" style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif", fontWeight: 800, fontSize: '2rem', lineHeight: 1 }}>Masuk</h2>
            <p className="mt-1 text-sm text-slate-600">Gunakan akun yang diberikan administrator perusahaan Anda.</p>
          </div>
          {[['org', 'Organisasi', 'organization', 'text'], ['username', 'Nama pengguna', 'username', 'text'], ['password', 'Kata sandi', 'current-password', 'password']].map(([n, l, a, t]) => (
            <label key={n} className="block text-sm font-semibold text-ink-900">{l}
              <input name={n} type={t} required autoComplete={a} className={fld} />
            </label>
          ))}
          {err && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>}
          <button className="btn w-full !py-3 text-base" disabled={busy}>{busy ? 'Memproses…' : 'Masuk'}</button>
          <p className="text-xs text-slate-500">Lupa kata sandi? Hubungi administrator organisasi Anda.</p>
        </form>
      </section>
    </main>
  );
}
