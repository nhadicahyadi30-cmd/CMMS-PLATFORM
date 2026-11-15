'use client';
import { ChangeEvent, useEffect, useState } from 'react';
import { fetchBlobUrl, uploadFile } from '@/lib/api';

export interface Att { id: string; kind: 'photo' | 'document' | 'voice'; filename: string; mime: string; sizeBytes: number; via: string; createdAt: string }

function Thumb({ a }: { a: Att }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let off = false; let u: string | null = null;
    fetchBlobUrl(`/attachments/${a.id}/file`).then((x) => { u = x; if (!off) setUrl(x); }).catch(() => undefined);
    return () => { off = true; if (u) URL.revokeObjectURL(u); };
  }, [a.id]);
  const open = async () => { const x = await fetchBlobUrl(`/attachments/${a.id}/file`); window.open(x, '_blank', 'noopener'); };
  return (
    <button type="button" onClick={open} className="w-32 text-left" title={a.filename}>
      {a.kind === 'photo' && url
        ? <img src={url} alt={a.filename} className="h-24 w-32 rounded border object-cover" />
        : <div className="flex h-24 w-32 items-center justify-center rounded border bg-slate-100 text-xs text-slate-500">{a.kind === 'photo' ? 'Memuat…' : 'PDF'}</div>}
      <div className="mt-1 truncate text-xs">{a.filename}</div>
      <div className="text-[11px] text-slate-500">{Math.max(1, Math.round(a.sizeBytes / 1024))} KB{a.via === 'whatsapp' ? ' · WhatsApp' : ''}</div>
    </button>
  );
}

export default function Attachments({ woId, items, canAdd, onChange }: { woId: string; items: Att[]; canAdd: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []); e.target.value = '';
    if (!files.length) return;
    setBusy(true); setErr('');
    try { for (const f of files) await uploadFile(`/work-orders/${woId}/attachments?filename=${encodeURIComponent(f.name)}`, f); onChange(); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <section className="card">
      <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Lampiran ({items.length})</h2>
        {canAdd && <label className="btn-ghost cursor-pointer">{busy ? 'Mengunggah…' : '+ Tambah foto/PDF'}
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="hidden" onChange={pick} disabled={busy} /></label>}</div>
      {err && <p role="alert" className="mb-2 text-sm text-red-600">{err}</p>}
      {items.length ? <div className="flex flex-wrap gap-3">{items.map((a) => <Thumb key={a.id} a={a} />)}</div> : <p className="text-sm text-slate-500">Belum ada lampiran. Maks. 10 MB per berkas (JPEG, PNG, WebP, PDF).</p>}
    </section>
  );
}
