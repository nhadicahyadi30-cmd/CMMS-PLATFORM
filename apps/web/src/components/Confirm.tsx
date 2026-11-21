'use client';
import { useEffect, useRef, useState } from 'react';

type Opts = { danger?: boolean; ok?: string; cancel?: string; title?: string; placeholder?: string };
type Req = { message: string; opts: Opts; input: boolean; resolve: (v: boolean | string | null) => void };
let push: ((r: Req) => void) | null = null;

/** Pengganti window.confirm: dialog sendiri yang besar, jelas, dan nyaman di HP. Mengembalikan true bila pengguna setuju. */
export function askConfirm(message: string, opts: Opts = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) { resolve(typeof window !== 'undefined' ? window.confirm(message) : false); return; }
    push({ message, opts, input: false, resolve: (v) => resolve(v === true) });
  });
}

/** Pengganti window.prompt untuk alasan wajib: mengembalikan teks (tidak kosong) atau null bila dibatalkan. */
export function askReason(message: string, opts: Opts = {}): Promise<string | null> {
  return new Promise((resolve) => {
    if (!push) { const v = typeof window !== 'undefined' ? window.prompt(message) : null; resolve(v && v.trim() ? v.trim() : null); return; }
    push({ message, opts, input: true, resolve: (v) => resolve(typeof v === 'string' ? v : null) });
  });
}

/** Dipasang sekali di Shell. */
export default function ConfirmHost() {
  const [q, setQ] = useState<Req[]>([]);
  const okRef = useRef<HTMLButtonElement>(null);
  const txtRef = useRef<HTMLTextAreaElement>(null);
  const [txt, setTxt] = useState('');
  useEffect(() => { push = (r) => setQ((x) => [...x, r]); return () => { push = null; }; }, []);
  const cur = q[0];
  useEffect(() => { setTxt(''); if (cur) (cur.input ? txtRef.current : okRef.current)?.focus(); }, [cur]);
  if (!cur) return null;
  const done = (v: boolean) => { cur.resolve(cur.input ? (v && txt.trim() ? txt.trim() : null) : v); setQ((x) => x.slice(1)); };
  const danger = !!cur.opts.danger;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center print:hidden" role="alertdialog" aria-modal="true" aria-labelledby="cf-t" aria-describedby="cf-m"
      onKeyDown={(e) => { if (e.key === 'Escape') done(false); }}>
      <div className="absolute inset-0 bg-slate-900/60" onClick={() => done(false)} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <h2 id="cf-t" className="text-base font-semibold text-slate-900">{cur.opts.title ?? (danger ? 'Yakin ingin melanjutkan?' : 'Konfirmasi')}</h2>
        <p id="cf-m" className="mt-2 text-sm leading-relaxed text-slate-600">{cur.message}</p>
        {cur.input && <textarea ref={txtRef} className="input mt-3 min-h-20" rows={3} placeholder={cur.opts.placeholder ?? 'Tulis alasan…'} value={txt} onChange={(e) => setTxt(e.target.value)} aria-label="Alasan" />}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="btn-ghost min-h-11" onClick={() => done(false)}>{cur.opts.cancel ?? 'Batal'}</button>
          <button ref={okRef} className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`} disabled={cur.input && !txt.trim()} onClick={() => done(true)}>{cur.opts.ok ?? (danger ? 'Ya, hapus' : 'Ya, lanjutkan')}</button>
        </div>
      </div>
    </div>
  );
}
