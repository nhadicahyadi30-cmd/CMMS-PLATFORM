'use client';
import { FormEvent, useState } from 'react';

const F = 'mt-1.5 w-full rounded-lg border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/30';

/** Sends the demo request to the API (stored in the database). If the API is unreachable, falls back to opening the email app. */
export default function ContactForm({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'fallback' | 'error'>('idle');
  const [err, setErr] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form);
    const payload = { name: String(f.get('name') || ''), company: String(f.get('company') || ''), phone: String(f.get('phone') || ''), email: String(f.get('email') || ''), size: String(f.get('size') || ''), message: String(f.get('msg') || ''), website: String(f.get('website') || '') };
    setState('sending'); setErr('');
    try {
      const r = await fetch('/api/public/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (r.ok) { setState('done'); form.reset(); return; }
      if (r.status === 429) { setErr('Too many requests. Please try again in a while.'); setState('error'); return; }
      if (r.status === 400) { setErr('Please check your details (name, company, and a valid email).'); setState('error'); return; }
      throw new Error(String(r.status));
    } catch {
      const body = [`Name: ${payload.name}`, `Company: ${payload.company}`, `Phone: ${payload.phone || '-'}`, `Email: ${payload.email || '-'}`, `Plants / assets: ${payload.size || '-'}`, '', payload.message].join('\n');
      window.location.href = `mailto:${email}?subject=${encodeURIComponent('MaintHub demo request — ' + payload.company)}&body=${encodeURIComponent(body)}`;
      setState('fallback');
    }
  }

  if (state === 'done') return (
    <div role="status" className="rounded-2xl border border-teal-400/30 bg-teal-400/10 p-9 text-center">
      <div className="text-2xl font-semibold text-teal-300">Thank you!</div>
      <p className="mt-3 text-slate-300">Your demo request has been received. Our team will get back to you shortly with a proposed schedule.</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-7 sm:p-9">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm text-slate-300">Name<input name="name" required maxLength={200} className={F} autoComplete="name" /></label>
        <label className="block text-sm text-slate-300">Company<input name="company" required maxLength={200} className={F} autoComplete="organization" /></label>
        <label className="block text-sm text-slate-300">Work email<input name="email" type="email" maxLength={200} className={F} autoComplete="email" /></label>
        <label className="block text-sm text-slate-300">Phone / WhatsApp<input name="phone" type="tel" maxLength={60} className={F} autoComplete="tel" /></label>
      </div>
      <label className="block text-sm text-slate-300">Plants & estimated assets<input name="size" maxLength={200} className={F} placeholder="e.g. 3 plants, ~800 assets" /></label>
      <label className="block text-sm text-slate-300">What would you like to improve in your maintenance today?<textarea name="msg" rows={5} maxLength={4000} className={F} /></label>
      {/* honeypot: hidden from people, bots tend to fill it */}
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <button disabled={state === 'sending'} className="w-full rounded-md bg-white py-3 text-sm font-semibold text-[#07090d] transition hover:bg-teal-300 disabled:opacity-60">{state === 'sending' ? 'Sending…' : 'Send demo request'}</button>
      {state === 'error' && <p role="alert" className="text-sm text-red-300">{err}</p>}
      {state === 'fallback' && <p role="status" className="text-sm text-teal-300">We could not reach our server, so your email app should now open with the message pre-filled. If it does not, send it directly to {email}.</p>}
    </form>
  );
}
