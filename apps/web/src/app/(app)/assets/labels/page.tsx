'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/hooks';

interface A { id: string; code: string; name: string; assetType: string; plantId: string; qrToken: string }

/** Cetak label QR aset. Setiap QR berisi <alamat>/a/<token>; memindainya membuka halaman aset di MaintHub. */
export default function LabelsPage() {
  const [q, setQ] = useState(''); const [plantId, setPlantId] = useState(''); const [base, setBase] = useState('');
  const plants = useApi<{ id: string; code: string; name: string }[]>('/plants');
  const assets = useApi<{ items: A[] }>(`/assets?size=200${plantId ? `&plantId=${plantId}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  const [sel, setSel] = useState<Set<string>>(new Set()); const [imgs, setImgs] = useState<Record<string, string>>({}); const [err, setErr] = useState('');

  useEffect(() => { try { setBase(localStorage.getItem('mh_base') || window.location.origin); } catch { setBase(window.location.origin); } }, []);
  const clean = base.trim().replace(/\/+$/, '');
  const local = /(^|\/\/)(localhost|127\.0\.0\.1)(:|\/|$)/i.test(clean);
  const items = assets.data?.items ?? []; const chosen = useMemo(() => items.filter((a) => sel.has(a.id)), [items, sel]);

  useEffect(() => {
    if (!clean || !chosen.length) return; let off = false;
    (async () => {
      try {
        const QR = (await import('qrcode')).default; const next: Record<string, string> = {};
        for (const a of chosen) next[a.id] = await QR.toDataURL(`${clean}/a/${a.qrToken}`, { margin: 1, width: 320, errorCorrectionLevel: 'M' });
        if (!off) { setImgs(next); setErr(''); }
      } catch (e: any) { if (!off) setErr(e?.message ?? 'Gagal membuat QR'); }
    })();
    return () => { off = true; };
  }, [chosen, clean]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = items.length > 0 && items.every((a) => sel.has(a.id));

  return (
    <div className="space-y-4">
      <div className="no-print print:hidden space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="text-xl font-semibold">Asset QR Labels</h1><p className="text-sm text-slate-600">Pilih aset, lalu cetak. Tempel label di mesin; teknisi memindainya dari HP untuk melihat riwayat dan melapor kerusakan. <Link href="/assets" className="text-blue-700 hover:underline">Kembali ke daftar aset</Link></p></div>
          <button className="btn" disabled={!chosen.length || !Object.keys(imgs).length} onClick={() => window.print()}>Cetak {chosen.length} label</button>
        </div>
        <div className="card space-y-2">
          <label className="block text-sm"><span className="mb-1 block text-slate-600">Alamat MaintHub yang akan ditulis di QR</span>
            <input className="input" value={base} onChange={(e) => { setBase(e.target.value); try { localStorage.setItem('mh_base', e.target.value); } catch { /* abaikan */ } }} placeholder="https://cmms.perusahaan.com" /></label>
          {local && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">Alamat ini (localhost) hanya bisa dibuka di laptop ini. Agar QR bisa dipindai dari HP, isi alamat yang bisa dijangkau HP: misalnya <b>http://192.168.100.9</b> (laptop dan HP satu Wi-Fi) atau nama domain server. Ganti dulu sebelum mencetak.</p>}
          {err && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{err}</p>}
          <div className="flex flex-wrap gap-2">
            <input className="input max-w-xs" placeholder="Cari kode/nama aset…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari aset" />
            <select className="input max-w-xs" value={plantId} onChange={(e) => setPlantId(e.target.value)} aria-label="Plant"><option value="">Semua plant</option>{plants.data?.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select>
            <button className="btn-ghost" onClick={() => setSel((s) => { const n = new Set(s); items.forEach((a) => (allOn ? n.delete(a.id) : n.add(a.id))); return n; })}>{allOn ? 'Batal pilih yang tampil' : 'Pilih semua yang tampil'}</button>
          </div>
          <ul className="grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {items.map((a) => <li key={a.id}><label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50"><input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} /><span className="font-mono text-xs">{a.code}</span><span className="truncate">{a.name}</span></label></li>)}
            {assets.data && !items.length && <li className="p-2 text-sm text-slate-500">Tidak ada aset.</li>}
          </ul>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2" aria-label="Pratinjau label">
        {chosen.map((a) => (
          <figure key={a.id} className="break-inside-avoid rounded-lg border border-slate-400 bg-white p-2 text-center" style={{ pageBreakInside: 'avoid' }}>
            {imgs[a.id] ? <img src={imgs[a.id]} alt={`QR ${a.code}`} className="mx-auto h-32 w-32 print:h-28 print:w-28" /> : <div className="mx-auto h-32 w-32 animate-pulse bg-slate-100" />}
            <figcaption className="mt-1 leading-tight"><div className="font-mono text-sm font-bold">{a.code}</div><div className="truncate text-xs">{a.name}</div><div className="mt-0.5 text-[0.6rem] text-slate-500">Pindai: lapor & riwayat · MaintHub</div></figcaption>
          </figure>))}
      </div>
    </div>
  );
}
