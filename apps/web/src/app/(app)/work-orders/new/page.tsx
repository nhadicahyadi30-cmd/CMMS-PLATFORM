'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import Field from '@/components/Field';

export default function NewWo() {
  const r = useRouter();
  const plants = useApi<any[]>('/plants');
  const [plantId, setPlantId] = useState('');
  const assets = useApi<{ items: any[] }>(plantId ? `/assets?plantId=${plantId}&size=200` : null);
  const skills = useApi<{ id: string; code: string; name: string; active: boolean }[]>('/workforce/skills');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr('');
    const f = new FormData(e.currentTarget);
    try {
      const wo = await api('/work-orders', { method: 'POST', body: {
        plantId, assetId: String(f.get('assetId')), woType: String(f.get('woType')), priority: String(f.get('priority')),
        title: String(f.get('title')), description: String(f.get('description') ?? ''), estHours: Number(f.get('estHours') || 2),
        skillId: f.get('skillId') ? String(f.get('skillId')) : null, skillMinLevel: Number(f.get('skillMinLevel') || 2) } });
      r.push(`/work-orders/${wo.id}`);
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="card max-w-2xl space-y-3">
      <h1 className="text-xl font-semibold">Buat Work Order</h1>
      <p className="text-sm text-slate-600">Setiap WO menunggu approval Supervisor sebelum bisa ditugaskan.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plant"><select className="input" required value={plantId} onChange={(e) => setPlantId(e.target.value)}>
          <option value="">Pilih plant…</option>{plants.data?.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></Field>
        <Field label="Aset"><select name="assetId" className="input" required disabled={!plantId}>
          <option value="">Pilih aset…</option>{assets.data?.items.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
        <Field label="Jenis"><select name="woType" className="input" defaultValue="corrective">
          <option value="breakdown">Breakdown</option><option value="corrective">Korektif</option><option value="emergency">Darurat</option></select></Field>
        <Field label="Prioritas"><select name="priority" className="input" defaultValue="P3">
          <option value="P1">P1 — Kritis</option><option value="P2">P2 — Tinggi</option><option value="P3">P3 — Sedang</option><option value="P4">P4 — Rendah</option></select></Field>
      </div>
      <Field label="Judul"><input name="title" className="input" required minLength={3} maxLength={200} placeholder="Contoh: Mixer 1 bunyi kasar" /></Field>
      <Field label="Deskripsi"><textarea name="description" className="input" rows={4} maxLength={4000} /></Field>
      <Field label="Estimasi jam kerja"><input name="estHours" type="number" step="0.5" min="0" defaultValue={2} className="input max-w-[8rem]" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Skill yang dibutuhkan (opsional)"><select name="skillId" className="input" defaultValue="">
          <option value="">Tidak ditentukan</option>{skills.data?.filter((k) => k.active).map((k) => <option key={k.id} value={k.id}>{k.code} — {k.name}</option>)}</select></Field>
        <Field label="Level minimum"><select name="skillMinLevel" className="input" defaultValue="2">
          <option value="1">1 — Dasar</option><option value="2">2 — Terbatas</option><option value="3">3 — Mandiri</option><option value="4">4 — Ahli</option></select></Field>
      </div>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      <div className="flex gap-2"><button className="btn" disabled={busy}>{busy ? 'Menyimpan…' : 'Kirim untuk approval'}</button>
        <button type="button" className="btn-ghost" onClick={() => r.back()}>Batal</button></div>
    </form>
  );
}
