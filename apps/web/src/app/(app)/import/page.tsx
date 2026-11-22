'use client';
import { ChangeEvent, useState } from 'react';
import { api, ApiError, getUser } from '@/lib/api';
import { parseCsv } from '@/lib/csv';
import { csvToRows, ImportKind, SPECS, templateCsv } from '@/lib/importcsv';
import { useApi } from '@/lib/hooks';

const ORDER: ImportKind[] = ['assets', 'technicians', 'parts'];
interface RowErr { row: number; message: string }
type Result = { kind: 'ok'; dryRun: boolean; imported: number; skipped: number } | { kind: 'err'; msg: string; errors: RowErr[]; total: number };

export default function ImportPage() {
  const user = getUser()!;
  const tabs = ORDER.filter((k) => user.modules.includes(SPECS[k].module) && (k !== 'technicians' || user.role === 'admin'));
  const [kind, setKind] = useState<ImportKind>(tabs[0] ?? 'assets');
  const [text, setText] = useState(''); const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false); const [res, setRes] = useState<Result | null>(null);
  const plants = useApi<{ code: string; name: string }[]>('/plants');
  const spec = SPECS[kind];

  if (!['admin', 'supervisor', 'planner'].includes(user.role)) return <p className="text-sm text-slate-600">Impor data hanya untuk admin, supervisor, dan planner.</p>;

  const parsed = text.trim() ? csvToRows(kind, parseCsv(text)) : null;
  const ready = !!parsed && parsed.rows.length > 0;

  function download() {
    const blob = new Blob([templateCsv(kind, plants.data?.[0]?.code ?? 'PLANT-01')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `templat-${kind}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }
  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setFileName(f.name); setText(await f.text()); setRes(null); e.target.value = '';
  }
  async function run(dryRun: boolean) {
    if (!parsed) return; setBusy(true); setRes(null);
    try {
      const d = await api(spec.path, { method: 'POST', body: { rows: parsed.rows, dryRun } });
      setRes({ kind: 'ok', dryRun, imported: dryRun ? d.wouldImport : d.imported, skipped: d.skipped });
      if (!dryRun) { setText(''); setFileName(''); }
    } catch (x: any) {
      if (x instanceof ApiError && x.details?.errors) setRes({ kind: 'err', msg: x.message, errors: x.details.errors, total: x.details.total ?? x.details.errors.length });
      else setRes({ kind: 'err', msg: x.message ?? 'Gagal', errors: [], total: 0 });
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Master Data Import</h1>
        <p className="text-sm text-slate-600">Masukkan banyak data sekaligus dari Excel. Periksa dulu — tidak ada yang tersimpan sampai Anda menekan Impor.</p></div>

      <div className="flex gap-2" role="tablist">
        {tabs.map((k) => <button key={k} role="tab" aria-selected={k === kind} className={k === kind ? 'btn' : 'btn-ghost'} onClick={() => { setKind(k); setText(''); setFileName(''); setRes(null); }}>{SPECS[k].title}</button>)}
      </div>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold">1. Siapkan berkas</h2>
        <p className="text-sm text-slate-600">{spec.hint}</p>
        <p className="text-xs text-slate-500">Kode plant yang tersedia untuk Anda: {plants.data?.length ? plants.data.map((p) => p.code).join(', ') : '—'}. Di Excel: <em>Save As → CSV UTF-8</em>, atau salin sel lalu tempel di kotak bawah.</p>
        <button className="btn-ghost" onClick={download}>Unduh templat CSV</button>
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold">2. Pilih berkas atau tempel dari Excel</h2>
        <input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={onFile} aria-label="Pilih berkas CSV" className="text-sm" />
        {fileName && <p className="text-xs text-slate-500">Berkas: {fileName}</p>}
        <textarea className="input h-40 font-mono text-xs" placeholder="…atau tempel di sini (baris pertama = judul kolom)" value={text} onChange={(e) => { setText(e.target.value); setFileName(''); setRes(null); }} aria-label="Data CSV" />
        {parsed && <div className="text-sm">
          <p>{parsed.rows.length} baris data terbaca.</p>
          {parsed.problems.map((p, i) => <p key={i} className="text-amber-700">⚠ {p}</p>)}
        </div>}
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={!ready || busy} onClick={() => run(true)}>{busy ? 'Memeriksa…' : 'Periksa'}</button>
          <button className="btn" disabled={!ready || busy || !(res?.kind === 'ok' && res.dryRun)} onClick={() => run(false)} title={res?.kind === 'ok' && res.dryRun ? '' : 'Jalankan Periksa dulu'}>Impor</button>
        </div>
      </section>

      {res?.kind === 'ok' && (
        <section className={`card ${res.dryRun ? 'border-blue-300' : 'border-green-400'}`} role="status">
          {res.dryRun
            ? <p className="text-sm"><strong>Berkas valid.</strong> {res.imported} baris akan ditambahkan{res.skipped ? `, ${res.skipped} dilewati karena kode sudah ada` : ''}. Tekan <em>Impor</em> untuk menyimpan.</p>
            : <p className="text-sm"><strong>Selesai.</strong> {res.imported} data ditambahkan{res.skipped ? `, ${res.skipped} dilewati (kode sudah ada)` : ''}.</p>}
        </section>
      )}
      {res?.kind === 'err' && (
        <section className="card border-red-300" role="alert">
          <p className="mb-2 text-sm font-medium text-red-700">{res.msg}</p>
          {res.errors.length > 0 && <>
            <table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="py-1 pr-3">Baris data</th><th>Masalah</th></tr></thead>
              <tbody>{res.errors.map((e, i) => <tr key={i} className="border-b last:border-0"><td className="py-1 pr-3 tabular-nums">{e.row}</td><td>{e.message}</td></tr>)}</tbody></table>
            <p className="mt-2 text-xs text-slate-500">Nomor baris dihitung tanpa judul kolom (di Excel = nomor + 1).{res.total > res.errors.length ? ` Menampilkan ${res.errors.length} dari ${res.total}.` : ''}</p>
          </>}
        </section>
      )}
    </div>
  );
}
