'use client';
import { FormEvent, useState } from 'react';

const F = 'mt-1.5 w-full rounded-lg border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/30';

/** Membuka aplikasi email dengan pesan terisi. (Tanpa server: tidak ada data yang disimpan di sini.) */
export default function ContactForm({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const body = [`Nama: ${f.get('name')}`, `Perusahaan: ${f.get('company')}`, `Telepon: ${f.get('phone') || '-'}`, `Jumlah plant / aset: ${f.get('size') || '-'}`, '', String(f.get('msg') || '')].join('\n');
    window.location.href = `mailto:${email}?subject=${encodeURIComponent('MaintHub demo request — ' + f.get('company'))}&body=${encodeURIComponent(body)}`;
    setSent(true);
  }
  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-7 sm:p-9">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm text-slate-300">Name<input name="name" required className={F} autoComplete="name" /></label>
        <label className="block text-sm text-slate-300">Company<input name="company" required className={F} autoComplete="organization" /></label>
        <label className="block text-sm text-slate-300">Phone / WhatsApp<input name="phone" type="tel" className={F} autoComplete="tel" /></label>
        <label className="block text-sm text-slate-300">Plants & estimated assets<input name="size" className={F} placeholder="mis. 3 plant, ±800 aset" /></label>
      </div>
      <label className="block text-sm text-slate-300">What would you like to improve in your maintenance today?<textarea name="msg" rows={5} className={F} /></label>
      <button className="w-full rounded-md bg-white py-3 text-sm font-semibold text-[#07090d] transition hover:bg-teal-300">Send demo request</button>
      {sent && <p role="status" className="text-sm text-teal-300">Aplikasi email Anda terbuka dengan pesan yang sudah terisi. Kalau tidak terbuka, kirim langsung ke {email}.</p>}
    </form>
  );
}
