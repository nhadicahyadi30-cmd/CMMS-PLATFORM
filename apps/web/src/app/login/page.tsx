'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api';

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
    <main className="mx-auto mt-24 max-w-sm">
      <form onSubmit={submit} className="card space-y-3">
        <h1 className="text-lg font-semibold">MaintainHub CMMS</h1>
        <label className="block text-sm">Organisasi<input name="org" className="input mt-1" required autoComplete="organization" /></label>
        <label className="block text-sm">Username<input name="username" className="input mt-1" required autoComplete="username" /></label>
        <label className="block text-sm">Password<input name="password" type="password" className="input mt-1" required autoComplete="current-password" /></label>
        {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        <button className="btn w-full" disabled={busy}>{busy ? 'Masuk…' : 'Masuk'}</button>
      </form>
    </main>
  );
}
