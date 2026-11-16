'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api';
import Logo, { TAGLINE } from '@/components/Logo';

const POINTS = ['Work order, preventive, dan sparepart dalam satu platform', 'KPI keandalan yang dihitung langsung dari data lapangan', 'Asisten AI yang menjawab dari manual dan riwayat perbaikan Anda'];

export default function Login() {
  const r = useRouter();
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr('');
    const f = new FormData(e.currentTarget);
    try { await login(String(f.get('org')), String(f.get('username')), String(f.get('password'))); r.replace('/work-orders'); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <main className="auth-bg relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="auth-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 grid w-full max-w-5xl items-center gap-12 lg:grid-cols-2">
        <section className="hidden text-white lg:block">
          <Logo size={52} dark />
          <h1 className="mt-10 text-4xl font-semibold leading-tight tracking-tight">{TAGLINE.split('. ')[0]}.<br /><span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">{TAGLINE.split('. ')[1]}</span></h1>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            {POINTS.map((p) => <li key={p} className="flex gap-3"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />{p}</li>)}
          </ul>
        </section>
        <form onSubmit={submit} className="mx-auto w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-white/[0.07] p-7 shadow-2xl backdrop-blur-xl">
          <div className="lg:hidden"><Logo size={40} dark /></div>
          <div><h2 className="text-lg font-semibold text-white">Masuk ke MaintHub</h2><p className="text-sm text-slate-400">Gunakan akun yang diberikan administrator.</p></div>
          {[['org', 'Organisasi', 'organization', 'text'], ['username', 'Username', 'username', 'text'], ['password', 'Password', 'current-password', 'password']].map(([n, l, a, t]) => (
            <label key={n} className="block text-sm text-slate-300">{l}
              <input name={n} type={t} required autoComplete={a} className="mt-1 w-full rounded-lg border border-white/15 bg-ink-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30" />
            </label>
          ))}
          {err && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</p>}
          <button className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-cyan-400 py-2.5 text-sm font-semibold text-ink-950 shadow-glow transition hover:brightness-110 disabled:opacity-60" disabled={busy}>{busy ? 'Masuk…' : 'Masuk'}</button>
        </form>
      </div>
    </main>
  );
}
