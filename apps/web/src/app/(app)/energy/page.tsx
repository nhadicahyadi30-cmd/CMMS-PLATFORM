'use client';
import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { api, getUser } from '@/lib/api';
import { csvToEntries, parseCsv } from '@/lib/csv';
import { useApi } from '@/lib/hooks';
import Field from '@/components/Field';
import { ChartCard, fmt, HBars, LineChart, S, SimpleTable, VBars } from '@/components/charts';

type Tab = 'ov' | 'model' | 'anom' | 'input' | 'set';
const TABS: [Tab, string][] = [['ov', 'Ringkasan'], ['model', 'Model beban'], ['anom', 'Anomali'], ['input', 'Input data'], ['set', 'Unit & tarif']];
const rp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthLabel = (s: string) => new Date(s).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
const KIND: Record<string, string> = { day: 'Harian', shift: 'Per shift', range: 'Rentang tanggal', po: 'Per PO' };
const can = () => ['admin', 'supervisor', 'planner'].includes(getUser()?.role ?? '');

function presets() {
  const t = new Date(); const back = (n: number) => { const d = new Date(t); d.setDate(d.getDate() - n); return ymd(d); };
  return [{ k: 'month', l: 'Bulan ini', from: ymd(new Date(t.getFullYear(), t.getMonth(), 1)), to: ymd(t) }, { k: 'd30', l: '30 hari', from: back(29), to: ymd(t) }, { k: 'd90', l: '90 hari', from: back(89), to: ymd(t) }];
}
const Card = ({ l, v, u, h }: { l: string; v: string; u?: string; h?: string }) => <div className="card" title={h}><div className="text-xs text-slate-500">{l}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{v}<span className="ml-1 text-sm font-normal text-slate-500">{u}</span></div></div>;

function Overview({ qs, plant }: { qs: string; plant: string }) {
  const sum = useApi<any[]>(`/energy/summary?${qs}`); const trend = useApi<any[]>(`/energy/trend?months=12${plant ? `&plantId=${plant}` : ''}`);
  const S1 = sum.data ?? []; const lines = S1.filter((r) => r.kind === 'line'); const utils = S1.filter((r) => r.kind === 'utility');
  const tk = S1.reduce((a, r) => a + Number(r.kwh), 0), lk = lines.reduce((a, r) => a + Number(r.kwh), 0), lt = lines.reduce((a, r) => a + Number(r.ton ?? 0), 0), cost = S1.reduce((a, r) => a + Number(r.cost), 0);
  const T = trend.data ?? []; const months = T.map((r) => monthLabel(r.month));
  if (sum.error) return <p className="text-red-600">{sum.error}</p>;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Card l="Total energi" v={fmt(tk, 0)} u="kWh" /><Card l="kWh per ton (lini produksi)" v={lt > 0 ? fmt(lk / lt, 1) : '—'} u="kWh/ton" h="Total kWh lini ÷ total ton output lini" />
        <Card l="Biaya listrik" v={cost ? rp(cost) : '—'} h="kWh × tarif yang berlaku pada hari itu. Isi tarif di tab Unit & tarif." /><Card l="Porsi utilitas" v={tk > 0 ? fmt((100 * (tk - lk)) / tk, 1) : '—'} u="%" h="kWh unit utilitas ÷ total" />
      </div>
      {S1.length === 0 && !sum.loading && <p className="text-sm text-slate-500">Belum ada data energi pada periode ini. Masukkan data di tab Input data.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="kWh per ton menurut lini" note="Lebih rendah = lebih hemat" chart={<HBars rows={lines.filter((r) => r.kwhPerTon != null).map((r) => ({ label: `${r.code} ${r.name}`, value: Number(r.kwhPerTon) }))} unit=" kWh/ton" digits={1} />}
          table={<SimpleTable head={['Lini', 'kWh', 'Ton', 'kWh/ton', 'Biaya']} rows={lines.map((r) => [`${r.code} ${r.name}`, fmt(r.kwh, 0), fmt(r.ton, 1), fmt(r.kwhPerTon, 1), rp(Number(r.cost))])} />} />
        <ChartCard title="Konsumsi per unit (kWh)" note="Lini produksi dan utilitas" chart={<HBars rows={S1.map((r) => ({ label: `${r.code} ${r.name}`, value: Number(r.kwh), extra: `${fmt(r.sharePct, 1)}%` }))} unit=" kWh" />}
          table={<SimpleTable head={['Unit', 'Jenis', 'kWh', 'Porsi %']} rows={S1.map((r) => [`${r.code} ${r.name}`, r.kind === 'line' ? 'Lini' : 'Utilitas', fmt(r.kwh, 0), fmt(r.sharePct, 1)])} />} />
        <ChartCard title="kWh per ton per bulan" note="12 bulan terakhir; bulan tanpa output tidak digambar" chart={<LineChart labels={months} unit=" kWh/ton" digits={1} min={0} series={[{ name: 'kWh/ton', values: T.map((r) => (r.kwhPerTon == null ? null : Number(r.kwhPerTon))) }]} />}
          table={<SimpleTable head={['Bulan', 'kWh lini', 'Ton', 'kWh/ton']} rows={T.map((r, i) => [months[i], fmt(r.lineKwh, 0), fmt(r.ton, 1), fmt(r.kwhPerTon, 1)])} />} />
        <ChartCard title="Konsumsi bulanan (kWh)" series={[{ name: 'Lini produksi', values: [], color: S[0] }, { name: 'Utilitas', values: [], color: S[1] }]}
          chart={<VBars labels={months} stacked unit=" kWh" series={[{ name: 'Lini produksi', values: T.map((r) => Number(r.lineKwh)) }, { name: 'Utilitas', values: T.map((r) => Number(r.utilityKwh)) }]} />}
          table={<SimpleTable head={['Bulan', 'Lini (kWh)', 'Utilitas (kWh)']} rows={T.map((r, i) => [months[i], fmt(r.lineKwh, 0), fmt(r.utilityKwh, 0)])} />} />
      </div>
      {utils.length > 0 && <p className="text-xs text-slate-500">Unit utilitas tidak punya output ton, sehingga tidak dihitung kWh/ton.</p>}
    </div>
  );
}

function Model({ qs }: { qs: string }) {
  const r = useApi<any[]>(`/energy/regression?${qs}`);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Model per lini: <b>kWh = beban dasar + (kWh/ton × ton)</b>, dari data harian pada periode terpilih. Beban dasar tinggi berarti lini boros saat idle; R² mendekati 1 berarti konsumsi sangat ditentukan produksi. Butuh minimal 3 hari berproduksi.</p>
      {r.error && <p className="text-red-600">{r.error}</p>}
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-2">Lini</th><th>Hari data</th><th>Beban dasar (kWh/hari)</th><th>kWh per ton</th><th>R²</th></tr></thead>
        <tbody>{r.data?.map((x) => (<tr key={x.unitId} className="border-t"><td className="p-2">{x.code} — {x.name}</td><td>{x.days}</td><td>{x.baseKwh == null ? <span className="text-slate-400">data kurang</span> : fmt(x.baseKwh, 1)}</td><td>{x.kwhPerTon == null ? '—' : fmt(x.kwhPerTon, 2)}</td><td>{x.r2 == null ? '—' : fmt(x.r2, 3)}</td></tr>))}
          {r.data?.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-slate-500">Belum ada data lini dengan output ton pada periode ini.</td></tr>}</tbody></table></div>
    </div>
  );
}

function Anomalies({ qs }: { qs: string }) {
  const [z, setZ] = useState('2'); const a = useApi<any[]>(`/energy/anomalies?${qs}&z=${z}`);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3"><Field label="Ambang (simpangan baku)"><select className="input" value={z} onChange={(e) => setZ(e.target.value)}><option value="1.5">1,5 (sensitif)</option><option value="2">2 (bawaan)</option><option value="3">3 (ketat)</option></select></Field>
        <p className="max-w-xl text-sm text-slate-600">Hari ketika konsumsi menyimpang dari yang diharapkan model beban (lini) atau dari rata-rata (utilitas). Butuh minimal 7 hari data per unit.</p></div>
      {a.error && <p className="text-red-600">{a.error}</p>}
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-2">Tanggal</th><th>Unit</th><th>kWh aktual</th><th>kWh diharapkan</th><th>Ton</th><th>Simpangan</th></tr></thead>
        <tbody>{a.data?.map((x, i) => (<tr key={i} className="border-t"><td className="p-2">{new Date(x.day).toLocaleDateString('id-ID')}</td><td>{x.code}</td><td>{fmt(x.kwh, 1)}</td><td>{fmt(x.expected, 1)}</td><td>{x.ton == null ? '—' : fmt(x.ton, 1)}</td>
          <td><span className={Number(x.z) > 0 ? 'text-red-700' : 'text-blue-700'}>{Number(x.z) > 0 ? '▲ ' : '▼ '}{fmt(Math.abs(Number(x.z)), 2)} σ</span></td></tr>))}
          {a.data?.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-500">Tidak ada hari yang menyimpang pada ambang ini.</td></tr>}</tbody></table></div>
    </div>
  );
}

function Input({ plant, from, to }: { plant: string; from: string; to: string }) {
  const units = useApi<any[]>(plant ? `/energy/units?plantId=${plant}` : null);
  const list = useApi<any[]>(plant ? `/energy/entries?plantId=${plant}&from=${from}&to=${to}` : null);
  const [kind, setKind] = useState('day'); const [msg, setMsg] = useState(''); const [csv, setCsv] = useState<{ rows: Record<string, unknown>[]; problems: string[]; name: string } | null>(null);
  const [imp, setImp] = useState<{ message: string; errors?: { row: number; message: string }[] } | null>(null);
  const active = units.data?.filter((u) => u.active) ?? [];
  if (!plant) return <p className="text-sm text-slate-600">Pilih plant di atas untuk memasukkan data.</p>;
  if (!can()) return <p className="text-sm text-slate-600">Hanya Planner, Supervisor, dan Admin yang dapat memasukkan data.</p>;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget; setMsg('');
    const g = (k: string) => String(f.get(k) ?? '').trim(); const num = (k: string) => (g(k) === '' ? null : Number(g(k)));
    try {
      await api('/energy/entries', { method: 'POST', body: { plantId: plant, unitId: g('unit'), periodKind: kind, dateFrom: g('from'), dateTo: kind === 'range' || kind === 'po' ? g('to') || g('from') : undefined,
        shift: kind === 'shift' ? g('shift') : undefined, poCode: kind === 'po' ? g('po') : undefined, sku: g('sku') || undefined, kwh: Number(g('kwh')), ton: num('ton') ?? undefined } });
      setMsg('Tersimpan'); form.reset(); list.reload();
    } catch (er: any) { setMsg(er.message); }
  }
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; setImp(null); if (!file) return setCsv(null);
    if (file.size > 2_000_000) return setCsv({ rows: [], problems: ['File terlalu besar (maks 2 MB)'], name: file.name });
    const r = csvToEntries(parseCsv(await file.text())); setCsv({ ...r, name: file.name });
  }
  async function doImport() {
    if (!csv) return; setImp(null);
    try { const r = await api<any>('/energy/import', { method: 'POST', body: { plantId: plant, rows: csv.rows } }); setImp({ message: `${r.imported} baris berhasil diimpor` }); setCsv(null); list.reload(); }
    catch (er: any) { setImp({ message: er.message, errors: er.details?.errors }); }
  }
  const template = 'unit,kind,dateFrom,dateTo,shift,po,sku,kwh,ton\nL1,day,2026-03-01,,,,,1250.5,80\nL1,shift,2026-03-02,,pagi,,,400,25\nL2,po,2026-03-01,2026-03-03,,PO-123,SKU-A,900,60\nU1,day,2026-03-01,,,,,500,\n';
  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="card grid gap-3 sm:grid-cols-4">
        <Field label="Unit"><select name="unit" className="input" required defaultValue=""><option value="" disabled>Pilih…</option>{active.map((u) => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}</select></Field>
        <Field label="Cara input"><select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label={kind === 'range' || kind === 'po' ? 'Dari tanggal' : 'Tanggal'}><input name="from" type="date" className="input" required /></Field>
        {(kind === 'range' || kind === 'po') && <Field label="Sampai tanggal"><input name="to" type="date" className="input" required /></Field>}
        {kind === 'shift' && <Field label="Shift"><select name="shift" className="input"><option>pagi</option><option>siang</option><option>malam</option></select></Field>}
        {kind === 'po' && <Field label="Kode PO"><input name="po" className="input" required /></Field>}
        {kind === 'po' && <Field label="SKU"><input name="sku" className="input" /></Field>}
        <Field label="Energi (kWh)"><input name="kwh" inputMode="decimal" className="input" required /></Field>
        <Field label="Output (ton, lini produksi)"><input name="ton" inputMode="decimal" className="input" /></Field>
        <div className="flex items-end gap-3"><button className="btn">Simpan</button>{msg && <span role="alert" className={`text-sm ${msg === 'Tersimpan' ? 'text-emerald-700' : 'text-red-600'}`}>{msg}</span>}</div>
        <p className="text-xs text-slate-500 sm:col-span-4">Satu unit tidak boleh dihitung dua kali pada tanggal yang sama. Shift berbeda pada tanggal yang sama dan antar-PO boleh berdampingan. Rentang/PO dibagi rata per hari.</p>
      </form>

      <section className="card space-y-2"><h2 className="text-sm font-semibold">Impor CSV</h2>
        <p className="text-xs text-slate-600">Kolom wajib: unit, kind (day/shift/range/po), dateFrom, kwh. Opsional: dateTo, shift, po, sku, ton. Bila ada satu baris bermasalah, tidak ada yang disimpan. <a className="text-blue-700 underline" download="template-energi.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`}>Unduh templat</a></p>
        <input type="file" accept=".csv,text/csv" onChange={pick} aria-label="Pilih file CSV" />
        {csv && <div className="text-sm">{csv.problems.length ? <ul className="list-disc pl-5 text-red-700">{csv.problems.slice(0, 8).map((p, i) => <li key={i}>{p}</li>)}</ul> : <p>{csv.name}: {csv.rows.length} baris siap diimpor.</p>}
          {!csv.problems.length && <button className="btn mt-2" onClick={doImport}>Impor {csv.rows.length} baris</button>}</div>}
        {imp && <div role="alert" className={`text-sm ${imp.errors ? 'text-red-700' : 'text-emerald-700'}`}>{imp.message}{imp.errors && <ul className="mt-1 list-disc pl-5">{imp.errors.map((x, i) => <li key={i}>Baris {x.row}: {x.message}</li>)}</ul>}</div>}
      </section>

      <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-2">Tanggal</th><th>Unit</th><th>Cara</th><th>kWh</th><th>Ton</th><th>Keterangan</th><th></th></tr></thead>
        <tbody>{list.data?.map((e) => (<tr key={e.id} className="border-t"><td className="p-2">{new Date(e.dateFrom).toLocaleDateString('id-ID')}{e.dateTo !== e.dateFrom && ` – ${new Date(e.dateTo).toLocaleDateString('id-ID')}`}</td><td>{e.unitCode}</td><td>{KIND[e.periodKind]}</td><td>{fmt(e.kwh, 1)}</td><td>{e.ton == null ? '—' : fmt(e.ton, 1)}</td><td>{[e.shift, e.poCode, e.sku].filter(Boolean).join(' · ')}</td>
          <td><button className="text-xs text-red-600 underline" onClick={() => confirm('Hapus entri ini?') && api(`/energy/entries/${e.id}`, { method: 'DELETE' }).then(list.reload)}>hapus</button></td></tr>))}
          {list.data?.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-slate-500">Belum ada entri pada periode ini.</td></tr>}</tbody></table></div>
    </div>
  );
}

function Settings({ plant }: { plant: string }) {
  const units = useApi<any[]>(`/energy/units${plant ? `?plantId=${plant}` : ''}`); const tariffs = useApi<any[]>(`/energy/tariffs${plant ? `?plantId=${plant}` : ''}`);
  const meters = useApi<any[]>(plant ? `/energy/meters?plantId=${plant}` : null); const [rolled, setRolled] = useState('');
  const [msg, setMsg] = useState(''); const sup = ['admin', 'supervisor'].includes(getUser()?.role ?? '');
  const run = async (fn: () => Promise<unknown>, reload: () => void) => { setMsg(''); try { await fn(); reload(); return true; } catch (e: any) { setMsg(e.message); return false; } };
  if (!plant) return <p className="text-sm text-slate-600">Pilih plant di atas.</p>;
  return (
    <div className="space-y-4">
      {msg && <p role="alert" className="text-sm text-red-600">{msg}</p>}
      <section className="card space-y-2"><h2 className="text-sm font-semibold">Unit energi</h2>
        {can() && <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget; (await run(() => api('/energy/units', { method: 'POST', body: { plantId: plant, code: String(f.get('code')), name: String(f.get('name')), kind: String(f.get('kind')) } }), units.reload)) && form.reset(); }}>
          <Field label="Kode"><input name="code" className="input w-28" required /></Field><Field label="Nama"><input name="name" className="input" required minLength={2} /></Field>
          <Field label="Jenis"><select name="kind" className="input"><option value="line">Lini produksi</option><option value="utility">Utilitas</option></select></Field><button className="btn">Tambah</button></form>}
        <ul className="divide-y text-sm">{units.data?.map((u) => (<li key={u.id} className="flex items-center justify-between py-1.5"><span className={u.active ? '' : 'text-slate-400 line-through'}>{u.code} — {u.name} <span className="text-xs text-slate-500">({u.kind === 'line' ? 'lini' : 'utilitas'})</span></span>
          {can() && <button className="text-xs underline" onClick={() => run(() => api(`/energy/units/${u.id}`, { method: 'PATCH', body: { active: !u.active } }), units.reload)}>{u.active ? 'nonaktifkan' : 'aktifkan'}</button>}</li>))}</ul></section>
      <section className="card space-y-2"><h2 className="text-sm font-semibold">Power meter (koneksi otomatis per area)</h2>
        <p className="text-xs text-slate-600">Daftarkan power meter untuk tiap area (unit energi). Gateway/Node-RED mengirim pembacaan kWh kumulatif ke <code>POST /api/ingest/meters</code> dengan API key dari menu Telemetri; MaintHub menghitung kWh harian otomatis (selisih akhir-awal hari, dijumlah bila satu area punya beberapa meter). Hari yang datanya berlubang dilewati, bukan ditebak. Panduan sambungan hardware: tombol <b>?</b> atau <code>docs/POWER_METER.md</code>.</p>
        {can() && <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget; (await run(() => api('/energy/meters', { method: 'POST', body: { plantId: plant, unitId: String(f.get('unit')), code: String(f.get('code')), name: String(f.get('name')), multiplier: Number(f.get('mult') || 1) } }), meters.reload)) && form.reset(); }}>
          <Field label="Area (unit)"><select name="unit" className="input" required><option value="">Pilih…</option>{units.data?.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}</select></Field>
          <Field label="Kode meter"><input name="code" className="input w-32" required pattern="[A-Za-z0-9._-]{1,40}" title="huruf, angka, . _ -" placeholder="MTR-LINE1" /></Field>
          <Field label="Nama"><input name="name" className="input" required minLength={2} placeholder="Panel utama Lini 1" /></Field>
          <Field label="Pengali (CT/PT)"><input name="mult" inputMode="decimal" className="input w-24" defaultValue="1" /></Field><button className="btn">Tambah meter</button></form>}
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-1">Meter</th><th>Area</th><th>Status</th><th>Terakhir</th><th>kWh terakhir</th><th>Pengali</th><th /></tr></thead>
          <tbody>{meters.data?.map((m) => (<tr key={m.id} className="border-t"><td className="py-1.5"><span className="font-mono">{m.code}</span><div className="text-xs text-slate-500">{m.name}</div></td><td>{m.unitCode}</td>
            <td><span className={`rounded-full px-2 py-0.5 text-xs ${m.conn === 'online' ? 'bg-emerald-100 text-emerald-800' : m.conn === 'delayed' ? 'bg-amber-100 text-amber-800' : m.conn === 'waiting' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-700'}`}>{!m.active ? 'Nonaktif' : m.conn === 'online' ? 'Online' : m.conn === 'delayed' ? 'Tertunda' : m.conn === 'waiting' ? 'Menunggu data' : 'Offline'}</span></td>
            <td>{m.lastSeen ? new Date(m.lastSeen).toLocaleString('id-ID') : '-'}</td><td>{m.lastKwh == null ? '-' : Number(m.lastKwh).toLocaleString('id-ID')}</td><td>{m.multiplier}</td>
            <td className="text-right">{can() && <button className="text-xs underline" onClick={() => run(() => api(`/energy/meters/${m.id}`, { method: 'PATCH', body: { active: !m.active } }), meters.reload)}>{m.active ? 'nonaktifkan' : 'aktifkan'}</button>}</td></tr>))}
            {meters.data?.length === 0 && <tr><td colSpan={7} className="py-2 text-slate-500">Belum ada power meter di plant ini.</td></tr>}</tbody></table></div>
        {can() && (meters.data?.length ?? 0) > 0 && <div className="flex flex-wrap items-center gap-2"><button className="btn-ghost" onClick={async () => { setRolled(''); try { const r = await api<{ daysWritten: number }>('/energy/meters/rollup', { method: 'POST', body: { plantId: plant, days: 14 } }); setRolled(`Selesai: ${r.daysWritten} hari dihitung ulang (14 hari terakhir).`); } catch (e: any) { setMsg(e.message); } }}>Hitung ulang 14 hari terakhir</button><span className="text-xs text-slate-600">{rolled || 'Pakai setelah mengubah pengali atau bila data meter datang terlambat. Entri manual yang bentrok dipertahankan.'}</span></div>}
      </section>
      <section className="card space-y-2"><h2 className="text-sm font-semibold">Tarif listrik (Rp per kWh)</h2>
        {sup && <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget; (await run(() => api('/energy/tariffs', { method: 'POST', body: { plantId: plant, validFrom: String(f.get('from')), pricePerKwh: Number(f.get('price')) } }), tariffs.reload)) && form.reset(); }}>
          <Field label="Berlaku mulai"><input name="from" type="date" className="input" required /></Field><Field label="Rp per kWh"><input name="price" inputMode="decimal" className="input" required /></Field><button className="btn">Tambah</button></form>}
        <ul className="divide-y text-sm">{tariffs.data?.map((t) => (<li key={t.id} className="flex items-center justify-between py-1.5"><span>Mulai {new Date(t.validFrom).toLocaleDateString('id-ID')}: {rp(Number(t.pricePerKwh))}/kWh</span>
          {sup && <button className="text-xs text-red-600 underline" onClick={() => run(() => api(`/energy/tariffs/${t.id}`, { method: 'DELETE' }), tariffs.reload)}>hapus</button>}</li>))}
          {tariffs.data?.length === 0 && <li className="py-2 text-slate-500">Belum ada tarif; biaya akan tampil Rp 0.</li>}</ul></section>
    </div>
  );
}

export default function Energy() {
  const P = useMemo(presets, []); const [preset, setPreset] = useState('month'); const [from, setFrom] = useState(P[0].from); const [to, setTo] = useState(P[0].to);
  const [plant, setPlant] = useState(''); const [tab, setTab] = useState<Tab>('ov'); const plants = useApi<any[]>('/plants');
  const qs = `from=${from}&to=${to}${plant ? `&plantId=${plant}` : ''}`;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Electrical & Utility</h1>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Plant"><select className="input" value={plant} onChange={(e) => setPlant(e.target.value)}><option value="">Semua plant</option>{plants.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Periode"><select className="input" value={preset} onChange={(e) => { setPreset(e.target.value); const x = P.find((p) => p.k === e.target.value); if (x) { setFrom(x.from); setTo(x.to); } }}>{P.map((p) => <option key={p.k} value={p.k}>{p.l}</option>)}<option value="custom">Kustom</option></select></Field>
        <Field label="Dari"><input type="date" className="input" value={from} onChange={(e) => { setFrom(e.target.value); setPreset('custom'); }} /></Field>
        <Field label="Sampai"><input type="date" className="input" value={to} onChange={(e) => { setTo(e.target.value); setPreset('custom'); }} /></Field>
      </div>
      <div role="tablist" className="flex flex-wrap gap-1 border-b">{TABS.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${tab === k ? 'border-blue-600 font-medium text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>{l}</button>))}</div>
      {tab === 'ov' && <Overview qs={qs} plant={plant} />}{tab === 'model' && <Model qs={qs} />}{tab === 'anom' && <Anomalies qs={qs} />}
      {tab === 'input' && <Input plant={plant} from={from} to={to} />}{tab === 'set' && <Settings plant={plant} />}
    </div>
  );
}
