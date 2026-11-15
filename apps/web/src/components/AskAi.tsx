'use client';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';

interface Answer { answer: string; sources: { id: string; kind: string; title: string }[]; mode: 'ai' | 'retrieval'; aiError?: boolean }
const KIND: Record<string, string> = { kb: 'Basis pengetahuan', wo: 'Riwayat WO', rca: 'RCA', fmea: 'FMEA', asset: 'Aset', alarm: 'Alarm' };

/** Kotak tanya-jawab AI. Jawaban ditampilkan sebagai teks biasa (bukan HTML/markdown) dan selalu disertai sumbernya. */
export default function AskAi({ assetId, woId, placeholder = 'Contoh: kenapa bearing cepat panas dan apa yang harus dicek?' }: { assetId?: string; woId?: string; placeholder?: string }) {
  const status = useApi<{ configured: boolean; model: string | null; perHour: number }>('/ai/status');
  const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [res, setRes] = useState<Answer | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (q.trim().length < 3) return; setBusy(true); setErr(''); setRes(null);
    try { setRes(await api<Answer>('/ai/chat', { method: 'POST', body: { message: q.trim(), assetId, woId } })); }
    catch (er: any) { setErr(er.message); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="space-y-2">
        <textarea className="input" rows={3} maxLength={2000} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Pertanyaan untuk asisten" />
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn" disabled={busy || q.trim().length < 3}>{busy ? 'Menjawab…' : 'Tanya'}</button>
          {status.data && !status.data.configured && <span className="text-xs text-amber-700">AI belum diaktifkan di server — hanya pencarian basis pengetahuan.</span>}
          {err && <span role="alert" className="text-sm text-red-600">{err}</span>}
        </div>
      </form>
      {res && (
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm" aria-live="polite">
          {res.mode === 'ai' && <p className="text-xs text-slate-500">Saran dari AI — periksa kembali sebelum bertindak. AI tidak mengubah data apa pun.</p>}
          {res.aiError && <p className="text-xs text-amber-700">Layanan AI tidak dapat dijangkau; menampilkan hasil pencarian saja.</p>}
          <div className="whitespace-pre-wrap">{res.answer}</div>
          {res.sources.length > 0 && <div className="border-t pt-2 text-xs text-slate-600"><b>Sumber:</b> {res.sources.map((s) => `[${s.id}] ${KIND[s.kind] ?? s.kind}: ${s.title}`).join(' · ')}</div>}
        </div>)}
    </div>
  );
}
