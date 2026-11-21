'use client';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import Field from '@/components/Field';

const ROLES = [['admin', 'Admin'], ['supervisor', 'Supervisor'], ['planner', 'Planner'], ['technician', 'Teknisi'], ['production', 'Produksi']];
type Tab = 'users' | 'techs' | 'plants' | 'perms';

function useAct(reload: () => void) {
  const [msg, setMsg] = useState('');
  const run = async (fn: () => Promise<unknown>, ok = 'Tersimpan') => {
    setMsg('');
    try { await fn(); setMsg(ok); reload(); return true; } catch (e: any) { setMsg(e.message); return false; }
  };
  return { msg, run };
}

function Users() {
  const users = useApi<any[]>('/admin/users'); const plants = useApi<any[]>('/admin/plants');
  const { msg, run } = useAct(users.reload);
  const [open, setOpen] = useState(false); const [role, setRole] = useState('technician'); const [sel, setSel] = useState<string[]>([]);
  const [edit, setEdit] = useState<string | null>(null);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const PlantPick = () => <div className="flex flex-wrap gap-2">{plants.data?.map((p) => (
    <label key={p.id} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={sel.includes(p.id)} onChange={() => toggle(p.id)} />{p.code}</label>))}</div>;

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const ok = await run(() => api('/admin/users', { method: 'POST', body: { username: String(f.get('username')), fullName: String(f.get('fullName')), role, password: String(f.get('password')), plantIds: role === 'admin' ? [] : sel } }), 'Pengguna dibuat');
    if (ok) { setOpen(false); setSel([]); }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><p className="text-sm text-slate-600">Admin otomatis mengakses semua plant. Peran lain hanya plant yang dicentang.</p>
        <button className="btn" onClick={() => { setOpen(!open); setEdit(null); }}>{open ? 'Tutup' : '+ Tambah pengguna'}</button></div>
      {msg && <p role="status" className="text-sm text-slate-700">{msg}</p>}
      {open && (
        <form onSubmit={create} className="card grid gap-3 sm:grid-cols-2">
          <Field label="Username"><input name="username" className="input" required pattern="[a-z0-9._-]{3,40}" title="huruf kecil, angka, titik, minus, garis bawah" /></Field>
          <Field label="Nama lengkap"><input name="fullName" className="input" required minLength={2} /></Field>
          <Field label="Peran"><select className="input" value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Password awal (min. 10 karakter)"><input name="password" type="password" className="input" required minLength={10} autoComplete="new-password" /></Field>
          {role !== 'admin' && <div className="sm:col-span-2"><div className="mb-1 text-sm text-slate-600">Akses plant</div><PlantPick /></div>}
          <div className="sm:col-span-2"><button className="btn">Buat pengguna</button></div>
        </form>)}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Username</th><th>Nama</th><th>Peran</th><th>Plant</th><th>Status</th><th>Login terakhir</th><th /></tr></thead>
          <tbody>{users.data?.map((u) => {
            const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
            const codes = u.role === 'admin' ? 'semua' : (u.plantIds as string[]).map((id) => plants.data?.find((p) => p.id === id)?.code ?? '?').join(', ') || '—';
            return (<tr key={u.id} className="border-t align-top"><td className="p-2 font-mono">{u.username}</td><td>{u.fullName}</td><td>{u.role}</td><td>{codes}</td>
              <td>{u.active ? (locked ? <span className="text-amber-700">Terkunci</span> : 'Aktif') : <span className="text-slate-400">Nonaktif</span>}</td>
              <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('id-ID') : '—'}</td>
              <td className="space-x-2 whitespace-nowrap p-2 text-right">
                <button className="underline" onClick={() => { setEdit(edit === u.id ? null : u.id); setSel(u.plantIds); setOpen(false); }}>Ubah</button>
                {locked && <button className="underline" onClick={() => run(() => api(`/admin/users/${u.id}/unlock`, { method: 'POST', body: {} }), 'Akun dibuka')}>Buka kunci</button>}
                <button className="underline" onClick={() => { const pw = prompt(`Password baru untuk ${u.username} (min. 10 karakter)`); if (pw) run(() => api(`/admin/users/${u.id}/reset-password`, { method: 'POST', body: { password: pw } }), 'Password direset, sesi lama dicabut'); }}>Reset password</button>
              </td></tr>);
          })}</tbody></table>
      </div>
      {edit && (() => { const u = users.data?.find((x) => x.id === edit); if (!u) return null; return (
        <form key={edit} className="card grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
          run(() => api(`/admin/users/${u.id}`, { method: 'PATCH', body: { fullName: String(f.get('fullName')), role: String(f.get('role')), active: f.get('active') === 'on', plantIds: String(f.get('role')) === 'admin' ? [] : sel } }), 'Pengguna diperbarui'); }}>
          <h3 className="font-semibold sm:col-span-2">Ubah {u.username}</h3>
          <Field label="Nama lengkap"><input name="fullName" className="input" defaultValue={u.fullName} required /></Field>
          <Field label="Peran"><select name="role" className="input" defaultValue={u.role}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <div className="sm:col-span-2"><div className="mb-1 text-sm text-slate-600">Akses plant</div><PlantPick /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={u.active} />Akun aktif</label>
          <div className="sm:col-span-2 flex gap-2"><button className="btn">Simpan</button><button type="button" className="btn-ghost" onClick={() => setEdit(null)}>Batal</button></div>
          <p className="text-xs text-slate-500 sm:col-span-2">Mengubah peran atau menonaktifkan akun akan memaksa pengguna login ulang.</p>
        </form>); })()}
    </div>
  );
}

function Techs() {
  const techs = useApi<any[]>('/admin/technicians'); const plants = useApi<any[]>('/admin/plants'); const users = useApi<any[]>('/admin/users');
  const { msg, run } = useAct(techs.reload); const [open, setOpen] = useState(false);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); const phone = String(f.get('phone') || '').trim(); const uid = String(f.get('userId') || '');
    const ok = await run(() => api('/admin/technicians', { method: 'POST', body: { plantId: String(f.get('plantId')), code: String(f.get('code')), fullName: String(f.get('fullName')), skill: String(f.get('skill')), shift: String(f.get('shift')), userId: uid || null, phone: phone || null } }), 'Teknisi ditambahkan');
    if (ok) setOpen(false);
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><p className="text-sm text-slate-600">Hubungkan teknisi ke akun login agar WO-nya muncul di akunnya. WhatsApp hanya aktif bila ada nomor dan teknisi sudah setuju (opt-in).</p>
        <button className="btn whitespace-nowrap" onClick={() => setOpen(!open)}>{open ? 'Tutup' : '+ Tambah teknisi'}</button></div>
      {msg && <p role="status" className="text-sm text-slate-700">{msg}</p>}
      {open && (
        <form onSubmit={create} className="card grid gap-3 sm:grid-cols-3">
          <Field label="Plant"><select name="plantId" className="input" required><option value="">Pilih…</option>{plants.data?.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select></Field>
          <Field label="Kode"><input name="code" className="input" required pattern="[A-Za-z0-9-]{1,20}" /></Field>
          <Field label="Nama"><input name="fullName" className="input" required /></Field>
          <Field label="Keahlian"><input name="skill" className="input" required placeholder="Mekanik / Listrik / …" /></Field>
          <Field label="Shift"><select name="shift" className="input"><option value="pagi">Pagi</option><option value="siang">Siang</option><option value="malam">Malam</option></select></Field>
          <Field label="Akun login (opsional)"><select name="userId" className="input"><option value="">—</option>{users.data?.filter((u) => u.role === 'technician').map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}</select></Field>
          <Field label="No. WhatsApp (opsional)"><input name="phone" className="input" placeholder="0812…" /></Field>
          <div className="sm:col-span-3"><button className="btn">Simpan</button></div>
        </form>)}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Kode</th><th>Nama</th><th>Keahlian</th><th>Shift</th><th>Akun</th><th>WhatsApp</th><th className="text-right">Tarif/jam</th><th /></tr></thead>
          <tbody>{techs.data?.map((t) => (
            <tr key={t.id} className="border-t"><td className="p-2 font-mono">{t.code}</td><td>{t.fullName}{!t.active && ' (nonaktif)'}</td><td>{t.skill}</td><td>{t.shift}</td>
              <td>{users.data?.find((u) => u.id === t.userId)?.username ?? '—'}</td><td>{t.phone ?? '—'} {t.waOptIn ? '✓ opt-in' : ''}</td><td className="text-right">Rp {Number(t.hourlyRate).toLocaleString('id-ID')}</td>
              <td className="space-x-2 whitespace-nowrap p-2 text-right">
                <button className="underline" onClick={() => { const p = prompt('Nomor WhatsApp (kosongkan untuk menghapus)', t.phone ?? ''); if (p !== null) run(() => api(`/admin/technicians/${t.id}`, { method: 'PATCH', body: { phone: p.trim() || null } })); }}>Nomor</button>
                <button className="underline" disabled={!t.phone} onClick={() => run(() => api(`/admin/technicians/${t.id}`, { method: 'PATCH', body: { waOptIn: !t.waOptIn } }), t.waOptIn ? 'Opt-in dicabut' : 'Opt-in dicatat')}>{t.waOptIn ? 'Cabut opt-in' : 'Catat opt-in'}</button>
                <button className="underline" onClick={() => { const v = prompt('Tarif per jam (Rp) untuk perhitungan biaya tenaga kerja', String(Number(t.hourlyRate))); const n = Number((v ?? '').replace(/[.,]/g, '')); if (v !== null && Number.isFinite(n) && n >= 0) run(() => api(`/admin/technicians/${t.id}`, { method: 'PATCH', body: { hourlyRate: n } })); }}>Tarif</button>
                <button className="underline" onClick={() => run(() => api(`/admin/technicians/${t.id}`, { method: 'PATCH', body: { active: !t.active } }))}>{t.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
              </td></tr>))}</tbody></table>
      </div>
    </div>
  );
}

function Permissions() {
  const { data, error, reload } = useApi<{ modules: { n: number; name: string }[]; roles: { code: string; name: string; fixed: boolean; modules: number[] }[] }>('/admin/permissions');
  const [msg, setMsg] = useState('');
  async function toggle(role: string, mods: number[], n: number) {
    const next = mods.includes(n) ? mods.filter((x) => x !== n) : [...mods, n];
    setMsg('');
    try { await api(`/admin/permissions/${role}`, { method: 'PUT', body: { modules: next } }); setMsg('Tersimpan. Berlaku untuk pengguna peran itu saat mereka masuk ulang atau sesinya diperbarui.'); reload(); } catch (e: any) { setMsg(e.message); }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Atur modul apa saja yang boleh dibuka tiap peran. Wewenang tindakan di dalam modul (mis. hanya Supervisor yang menyetujui izin kerja, hanya Produksi yang menyerahkan area) tetap dijaga sistem dan tidak bisa diubah di sini.</p>
      {(error || msg) && <p className={`text-sm ${error ? 'text-red-600' : 'text-slate-700'}`} role="status">{error || msg}</p>}
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Modul</th>{data?.roles.map((r) => <th key={r.code} className="px-2 text-center">{r.name}</th>)}</tr></thead>
        <tbody>{data?.modules.filter((m) => m.n !== 4).map((m) => (<tr key={m.n} className="border-t"><td className="p-2">{m.name}</td>
          {data!.roles.map((r) => (<td key={r.code} className="text-center"><input type="checkbox" aria-label={`${m.name} untuk ${r.name}`} checked={r.fixed || r.modules.includes(m.n)} disabled={r.fixed || m.n === 10} onChange={() => toggle(r.code, r.modules, m.n)} /></td>))}</tr>))}</tbody></table></div>
      <div className="card text-sm text-slate-600"><div className="mb-1 font-medium text-slate-800">Ringkasan wewenang (tetap)</div>
        <ul className="list-disc space-y-0.5 pl-5"><li><b>Teknisi</b>: mengerjakan WO yang ditugaskan, mengisi checklist, mengajukan izin kerja, memasang gembok dan memverifikasi nol energi.</li>
          <li><b>Supervisor</b>: menyetujui/menolak WO dan izin kerja, menutup WO, mengelola template checklist dan titik isolasi.</li>
          <li><b>Produksi</b>: meminta perbaikan, mengisi checklist operator, menyerahkan dan menerima kembali area pada izin kerja.</li>
          <li><b>Planner</b>: menjadwalkan dan menugaskan; <b>Admin</b>: semua, termasuk pengguna dan hak akses.</li></ul></div>
    </div>
  );
}

function Plants() {
  const plants = useApi<any[]>('/admin/plants'); const { msg, run } = useAct(plants.reload);
  return (
    <div className="space-y-3">
      {msg && <p role="status" className="text-sm text-slate-700">{msg}</p>}
      <form className="card flex flex-wrap items-end gap-3" onSubmit={async (e) => { e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
        if (await run(() => api('/admin/plants', { method: 'POST', body: { code: String(f.get('code')), name: String(f.get('name')) } }), 'Plant ditambahkan')) form.reset(); }}>
        <Field label="Kode"><input name="code" className="input w-28" required pattern="[A-Za-z0-9-]{1,10}" /></Field>
        <Field label="Nama plant"><input name="name" className="input w-64" required /></Field><button className="btn">+ Tambah plant</button>
      </form>
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Kode</th><th>Nama</th><th>Jam operasi/hari</th><th>Status</th></tr></thead>
        <tbody>{plants.data?.map((p) => <tr key={p.id} className="border-t"><td className="p-2 font-mono">{p.code}</td><td>{p.name}</td><td>{Number(p.operatingHours)} <button className="ml-1 underline" onClick={() => { const v = prompt('Jam operasi per hari (1–24), dipakai menghitung availability', String(Number(p.operatingHours))); const n = Number((v ?? '').replace(',', '.')); if (v !== null && n > 0 && n <= 24) run(() => api(`/admin/plants/${p.id}`, { method: 'PATCH', body: { operatingHours: n } })); }}>Ubah</button></td><td>{p.active ? 'Aktif' : 'Nonaktif'}</td></tr>)}</tbody></table></div>
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState<Tab>('users');
  const T: [Tab, string][] = [['users', 'Pengguna'], ['techs', 'Teknisi'], ['plants', 'Plant'], ['perms', 'Hak akses']];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Administrasi</h1>
      <div className="flex gap-2">{T.map(([k, l]) => <button key={k} className={tab === k ? 'btn' : 'btn-ghost'} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'users' ? <Users /> : tab === 'techs' ? <Techs /> : tab === 'perms' ? <Permissions /> : <Plants />}
    </div>
  );
}
