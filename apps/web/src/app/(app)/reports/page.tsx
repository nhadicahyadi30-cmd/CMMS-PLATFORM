'use client';
import { FormEvent, useMemo, useState } from 'react';
import { api, apiDownload, ApiError, getUser } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { Freq, periodFor } from '@/lib/report-period';

const FREQ: Record<Freq, string> = { daily: 'Harian', weekly: 'Mingguan', monthly: 'Bulanan', yearly: 'Tahunan' };
const WHEN: Record<Freq, string> = { daily: 'setiap hari, memuat hari kemarin', weekly: 'setiap Senin, memuat Senin–Minggu lalu', monthly: 'setiap tanggal 1, memuat bulan lalu', yearly: 'setiap 1 Januari, memuat tahun lalu' };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDate = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const range = (a: string, b: string) => (a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`);
const splitEmails = (s: string) => s.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
const msg = (e: any) => (e instanceof ApiError && Array.isArray(e.details?.issues) ? e.details.issues.map((i: any) => i.message).join('; ') : e?.message ?? 'Terjadi kesalahan');

type Tab = 'gen' | 'sch' | 'hist';

export default function ReportsPage() {
  const user = getUser()!; const manage = user.role === 'admin' || user.role === 'supervisor';
  const [tab, setTab] = useState<Tab>('gen');
  const status = useApi<{ emailEnabled: boolean; from: string | null; schedulerEnabled: boolean }>('/reports/status');
  const plants = useApi<{ id: string; code: string; name: string }[]>('/plants');
  const tabs: [Tab, string][] = [['gen', 'Buat laporan'], ...(manage ? ([['sch', 'Jadwal otomatis'], ['hist', 'Riwayat kirim']] as [Tab, string][]) : [])];

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Reports</h1><p className="text-sm text-slate-600">Laporan KPI maintenance dalam PDF: unduh kapan saja, atau kirim otomatis ke atasan lewat email.</p></div>
      {status.data && !status.data.emailEnabled && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          <strong>Email belum dikonfigurasi di server.</strong> Unduh PDF tetap bisa. Untuk mengaktifkan kirim email dan jadwal otomatis, isi <code>SMTP_HOST</code> dan <code>SMTP_FROM</code> di file <code>.env</code> (lihat <code>docs/REPORTS.md</code>), lalu restart.
        </div>
      )}
      <div className="flex gap-2" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={k === tab} className={k === tab ? 'btn' : 'btn-ghost'} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'gen' && <Generate manage={manage} emailOn={!!status.data?.emailEnabled} plants={plants.data ?? []} />}
      {tab === 'sch' && manage && <Schedules emailOn={!!status.data?.emailEnabled} plants={plants.data ?? []} />}
      {tab === 'hist' && manage && <History />}
    </div>
  );
}

function PlantSelect({ value, onChange, plants }: { value: string; onChange: (v: string) => void; plants: { id: string; code: string; name: string }[] }) {
  const user = getUser()!;
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Plant">
      {user.all && <option value="">Semua plant</option>}
      {!user.all && !value && <option value="">Pilih plant…</option>}
      {plants.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
    </select>
  );
}

function Generate({ manage, emailOn, plants }: { manage: boolean; emailOn: boolean; plants: { id: string; code: string; name: string }[] }) {
  const user = getUser()!;
  const [freq, setFreq] = useState<Freq>('weekly'); const [date, setDate] = useState(today()); const [plant, setPlant] = useState('');
  const [to, setTo] = useState(''); const [busy, setBusy] = useState(''); const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const period = useMemo(() => { try { return periodFor(freq, date); } catch { return null; } }, [freq, date]);
  const body = { frequency: freq, date, plantId: plant || null };

  async function download() {
    setBusy('pdf'); setRes(null);
    try { const { blob, filename } = await apiDownload('/reports/pdf', body); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href); setRes({ ok: true, text: `${filename} diunduh.` }); }
    catch (e) { setRes({ ok: false, text: msg(e) }); } finally { setBusy(''); }
  }
  async function send(e: FormEvent) {
    e.preventDefault(); setBusy('mail'); setRes(null);
    try { const r = await api('/reports/send', { method: 'POST', body: { ...body, recipients: splitEmails(to) } }); setRes(r.ok ? { ok: true, text: `Laporan terkirim ke ${splitEmails(to).length} penerima.` } : { ok: false, text: `Gagal mengirim: ${r.error}` }); }
    catch (x) { setRes({ ok: false, text: msg(x) }); } finally { setBusy(''); }
  }
  const needPlant = !user.all && !plant;
  return (
    <section className="card space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm"><span className="mb-1 block text-slate-600">Jenis laporan</span>
          <select className="input" value={freq} onChange={(e) => setFreq(e.target.value as Freq)}>{(Object.keys(FREQ) as Freq[]).map((f) => <option key={f} value={f}>{FREQ[f]}</option>)}</select></label>
        <label className="block text-sm"><span className="mb-1 block text-slate-600">Tanggal di dalam periode</span><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1 block text-slate-600">Plant</span><PlantSelect value={plant} onChange={setPlant} plants={plants} /></label>
      </div>
      <p className="text-sm text-slate-700">Periode laporan: <strong>{period ? range(period.from, period.to) : '—'}</strong></p>
      <div><button className="btn" disabled={!period || busy !== ''} onClick={download}>{busy === 'pdf' ? 'Menyusun PDF…' : 'Unduh PDF'}</button></div>

      {manage && (
        <form onSubmit={send} className="space-y-2 border-t pt-4">
          <h2 className="text-sm font-semibold">Kirim lewat email</h2>
          <label className="block text-sm"><span className="mb-1 block text-slate-600">Penerima (pisahkan dengan koma atau baris baru, maks. 20)</span>
            <textarea className="input h-20" value={to} onChange={(e) => setTo(e.target.value)} placeholder="manajer.pabrik@perusahaan.com, direktur@perusahaan.com" /></label>
          <button className="btn" disabled={!period || !emailOn || needPlant || !splitEmails(to).length || busy !== ''}>{busy === 'mail' ? 'Mengirim…' : 'Kirim sekarang'}</button>
          {!emailOn && <p className="text-xs text-slate-500">Aktif setelah SMTP dikonfigurasi di server.</p>}
          {needPlant && <p className="text-xs text-slate-500">Pilih plant: akun Anda tidak punya akses ke semua plant.</p>}
        </form>
      )}
      {res && <p role={res.ok ? 'status' : 'alert'} className={`text-sm ${res.ok ? 'text-green-700' : 'text-red-700'}`}>{res.text}</p>}
    </section>
  );
}

function Schedules({ emailOn, plants }: { emailOn: boolean; plants: { id: string; code: string; name: string }[] }) {
  const user = getUser()!;
  const list = useApi<any[]>('/reports/schedules');
  const [f, setF] = useState({ name: '', frequency: 'weekly' as Freq, sendHour: 7, plantId: '', recipients: '' });
  const [err, setErr] = useState(''); const [info, setInfo] = useState(''); const [busy, setBusy] = useState('');

  async function create(e: FormEvent) {
    e.preventDefault(); setBusy('new'); setErr(''); setInfo('');
    try { await api('/reports/schedules', { method: 'POST', body: { name: f.name, frequency: f.frequency, sendHour: f.sendHour, plantId: f.plantId || null, recipients: splitEmails(f.recipients) } }); setF({ ...f, name: '', recipients: '' }); list.reload(); setInfo('Jadwal dibuat. Pengiriman pertama mengikuti jatuh tempo berikutnya.'); }
    catch (x) { setErr(msg(x)); } finally { setBusy(''); }
  }
  async function act(id: string, what: 'toggle' | 'run' | 'del', active?: boolean) {
    setBusy(id); setErr(''); setInfo('');
    try {
      if (what === 'toggle') await api(`/reports/schedules/${id}`, { method: 'PATCH', body: { active: !active } });
      else if (what === 'del') { if (!confirm('Hapus jadwal ini?')) return; await api(`/reports/schedules/${id}`, { method: 'DELETE' }); }
      else { const r = await api(`/reports/schedules/${id}/run-now`, { method: 'POST' }); setInfo(r.ok ? 'Laporan dikirim.' : ''); if (!r.ok) setErr(`Gagal mengirim: ${r.error}`); }
      list.reload();
    } catch (x) { setErr(msg(x)); } finally { setBusy(''); }
  }
  return (
    <div className="space-y-4">
      <form onSubmit={create} className="card space-y-3">
        <h2 className="text-sm font-semibold">Jadwal baru</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm"><span className="mb-1 block text-slate-600">Nama jadwal</span><input className="input" required maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Laporan mingguan ke Plant Manager" /></label>
          <label className="block text-sm"><span className="mb-1 block text-slate-600">Frekuensi</span><select className="input" value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value as Freq })}>{(Object.keys(FREQ) as Freq[]).map((k) => <option key={k} value={k}>{FREQ[k]}</option>)}</select></label>
          <label className="block text-sm"><span className="mb-1 block text-slate-600">Jam kirim (WIB)</span><select className="input" value={f.sendHour} onChange={(e) => setF({ ...f, sendHour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select></label>
          <label className="block text-sm"><span className="mb-1 block text-slate-600">Plant</span><PlantSelect value={f.plantId} onChange={(v) => setF({ ...f, plantId: v })} plants={plants} /></label>
        </div>
        <label className="block text-sm"><span className="mb-1 block text-slate-600">Penerima (pisahkan dengan koma atau baris baru)</span><textarea className="input h-16" required value={f.recipients} onChange={(e) => setF({ ...f, recipients: e.target.value })} /></label>
        <p className="text-xs text-slate-500">{FREQ[f.frequency]}: dikirim {WHEN[f.frequency]}, pukul {String(f.sendHour).padStart(2, '0')}:00 WIB.{!user.all && !f.plantId ? ' Pilih plant.' : ''}</p>
        <button className="btn" disabled={busy !== '' || (!user.all && !f.plantId)}>Buat jadwal</button>
        {!emailOn && <p className="text-xs text-amber-700">SMTP belum dikonfigurasi: jadwal tersimpan tetapi belum akan terkirim.</p>}
      </form>
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}{info && <p role="status" className="text-sm text-green-700">{info}</p>}
      <section className="card overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead><tr className="border-b"><th className="py-2 pr-3">Nama</th><th className="pr-3">Frekuensi</th><th className="pr-3">Plant</th><th className="pr-3">Penerima</th><th className="pr-3">Periode berikutnya</th><th className="pr-3">Status</th><th /></tr></thead>
          <tbody>
            {list.data?.map((s) => (
              <tr key={s.id} className="border-b align-top last:border-0">
                <td className="py-2 pr-3 font-medium">{s.name}</td>
                <td className="pr-3">{FREQ[s.frequency as Freq]}<div className="text-xs text-slate-500">{String(s.sendHour).padStart(2, '0')}:00 WIB</div></td>
                <td className="pr-3">{s.plantName ?? 'Semua plant'}</td>
                <td className="pr-3 text-xs">{s.recipients.join(', ')}</td>
                <td className="pr-3 text-xs">{s.nextPeriodFrom ? range(s.nextPeriodFrom, s.nextPeriodTo) : '—'}</td>
                <td className="pr-3">{s.active ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Aktif</span> : <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">Nonaktif</span>}{s.failCount > 0 && <div className="text-xs text-red-700">{s.failCount}x gagal</div>}</td>
                <td className="whitespace-nowrap py-2 text-right">
                  <button className="btn-ghost mr-1" disabled={busy !== '' || !emailOn} onClick={() => act(s.id, 'run')}>Kirim sekarang</button>
                  <button className="btn-ghost mr-1" disabled={busy !== ''} onClick={() => act(s.id, 'toggle', s.active)}>{s.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                  <button className="btn-ghost" disabled={busy !== ''} onClick={() => act(s.id, 'del')}>Hapus</button>
                </td>
              </tr>))}
            {list.data && !list.data.length && <tr><td colSpan={7} className="py-6 text-center text-slate-500">Belum ada jadwal.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function History() {
  const runs = useApi<any[]>('/reports/runs');
  return (
    <section className="card overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead><tr className="border-b"><th className="py-2 pr-3">Waktu (WIB)</th><th className="pr-3">Laporan</th><th className="pr-3">Periode</th><th className="pr-3">Penerima</th><th className="pr-3">Hasil</th></tr></thead>
        <tbody>
          {runs.data?.map((r) => (
            <tr key={r.id} className="border-b align-top last:border-0">
              <td className="py-2 pr-3 tabular-nums">{r.at}</td>
              <td className="pr-3">{FREQ[r.frequency as Freq]}<div className="text-xs text-slate-500">{r.kind === 'scheduled' ? `Terjadwal${r.scheduleName ? ': ' + r.scheduleName : ''}` : 'Manual'}</div></td>
              <td className="pr-3 text-xs">{range(r.periodFrom, r.periodTo)}</td>
              <td className="pr-3 text-xs">{r.recipients.join(', ')}</td>
              <td className="pr-3">{r.status === 'sent' ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Terkirim</span> : <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">Gagal</span>}{r.error && <div className="max-w-xs text-xs text-red-700">{r.error}</div>}</td>
            </tr>))}
          {runs.data && !runs.data.length && <tr><td colSpan={5} className="py-6 text-center text-slate-500">Belum ada pengiriman.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
