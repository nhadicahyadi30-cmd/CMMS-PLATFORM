'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { helpFor } from '@/lib/help';

/** Tombol "?" mengambang: membuka panduan penggunaan halaman yang sedang dibuka, termasuk cara menyambung hardware. */
export default function HelpButton() {
  const path = usePathname(); const [open, setOpen] = useState(false);
  const h = helpFor(path);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open]);
  if (!h) return null;
  return (
    <>
      <button className="fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-blue-700 text-lg font-semibold text-white shadow-lg transition hover:bg-blue-800 print:hidden" aria-label="Bantuan: cara menggunakan halaman ini" title="Cara menggunakan halaman ini" onClick={() => setOpen(true)}>?</button>
      {open && (
        <div className="fixed inset-0 z-50 print:hidden" role="dialog" aria-modal="true" aria-label={`Bantuan ${h.title}`}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b p-4"><div><div className="text-xs uppercase tracking-wide text-slate-500">Cara menggunakan</div><h2 className="text-lg font-semibold">{h.title}</h2></div>
              <button className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Tutup bantuan" onClick={() => setOpen(false)}>✕</button></div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm text-slate-700">
              <p>{h.what}</p>
              <section><h3 className="mb-1 font-medium text-slate-900">Langkah</h3><ol className="list-decimal space-y-1 pl-5">{h.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></section>
              {h.hardware && <section className="rounded-lg bg-amber-50 p-3"><h3 className="mb-1 font-medium text-amber-900">{h.hardware.title}</h3><ul className="list-disc space-y-1 pl-5 text-amber-950">{h.hardware.items.map((s, i) => <li key={i}>{s}</li>)}</ul></section>}
              {h.tips && <section><h3 className="mb-1 font-medium text-slate-900">Catatan</h3><ul className="list-disc space-y-1 pl-5">{h.tips.map((s, i) => <li key={i}>{s}</li>)}</ul></section>}
            </div>
          </div>
        </div>)}
    </>
  );
}
