-- Uji laporan otomatis: batas periode (zona Asia/Jakarta), inisialisasi jadwal, RLS, akses penjadwal.
\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;
select provision_org('rp-uji', 'Report Uji') as org \gset
select provision_org('rp-lain', 'Report Lain') as org2 \gset
insert into plants (id, org_id, code, name) values ('00000000-0000-0000-0000-0000000bb001', :'org', 'R1', 'Plant R1'), ('00000000-0000-0000-0000-0000000bb002', :'org', 'R2', 'Plant R2');
set local session_replication_role = origin;

-- 1. Perhitungan periode
do $$
declare r record;
  procedure_check text;
begin
  -- harian: 16 Nov 2026 07:30 WIB -> kemarin (15 Nov); sebelum 07:00 -> 14 Nov
  select * into r from report_period('daily', 7, '2026-11-16 07:30:00+07'); assert r.p_from = '2026-11-15' and r.p_to = '2026-11-15', 'harian setelah jam kirim: ' || r.p_from;
  select * into r from report_period('daily', 7, '2026-11-16 06:59:00+07'); assert r.p_from = '2026-11-14' and r.p_to = '2026-11-14', 'harian sebelum jam kirim';
  -- zona waktu: 15 Nov 17:30 UTC = 16 Nov 00:30 WIB -> belum jam 07 -> 14 Nov
  select * into r from report_period('daily', 7, '2026-11-15 17:30:00+00'); assert r.p_to = '2026-11-14', 'konversi UTC->WIB';
  -- mingguan: 16 Nov 2026 adalah Senin
  select * into r from report_period('weekly', 7, '2026-11-16 08:00:00+07'); assert r.p_from = '2026-11-09' and r.p_to = '2026-11-15', 'senin setelah jam kirim';
  select * into r from report_period('weekly', 7, '2026-11-16 06:00:00+07'); assert r.p_from = '2026-11-02' and r.p_to = '2026-11-08', 'senin sebelum jam kirim';
  select * into r from report_period('weekly', 7, '2026-11-19 12:00:00+07'); assert r.p_from = '2026-11-09' and r.p_to = '2026-11-15', 'tengah minggu';
  -- bulanan
  select * into r from report_period('monthly', 7, '2026-11-16 12:00:00+07'); assert r.p_from = '2026-10-01' and r.p_to = '2026-10-31', 'bulanan';
  select * into r from report_period('monthly', 7, '2026-11-01 05:00:00+07'); assert r.p_from = '2026-09-01' and r.p_to = '2026-09-30', 'tgl 1 sebelum jam kirim';
  select * into r from report_period('monthly', 7, '2026-01-01 08:00:00+07'); assert r.p_from = '2025-12-01' and r.p_to = '2025-12-31', 'batas tahun';
  select * into r from report_period('monthly', 7, '2028-03-01 08:00:00+07'); assert r.p_from = '2028-02-01' and r.p_to = '2028-02-29', 'Februari kabisat';
  -- tahunan
  select * into r from report_period('yearly', 7, '2026-11-16 12:00:00+07'); assert r.p_from = '2025-01-01' and r.p_to = '2025-12-31', 'tahunan';
  select * into r from report_period('yearly', 7, '2026-01-01 06:00:00+07'); assert r.p_from = '2024-01-01' and r.p_to = '2024-12-31', '1 Jan sebelum jam kirim';
  begin perform * from report_period('hourly', 7); assert false, 'harus galat';
  exception when sqlstate '22023' then null; end;
end $$;

-- 2. Jadwal: RLS, inisialisasi, validasi
set local role maintainhub_app;
select set_config('app.org_id', :'org', true), set_config('app.plant_ids', '00000000-0000-0000-0000-0000000bb001', true), set_config('app.all_plants', '0', true) \gset
do $$
declare o uuid := current_setting('app.org_id')::uuid; s uuid; s2 uuid; lp date; cur date;
begin
  insert into report_schedules (org_id, name, frequency, recipients) values (o, 'Harian semua plant', 'daily', array['atasan@contoh.id']) returning id, last_period_to into s, lp;
  select p_to into cur from report_period('daily', 7);
  assert lp = cur, 'jadwal baru tidak mengirim periode yang sudah lewat';
  -- semua plant (plant_id null) boleh dibuat oleh pengguna terbatas? policy mengizinkan null; plant lain ditolak
  begin insert into report_schedules (org_id, plant_id, name, frequency, recipients) values (o, '00000000-0000-0000-0000-0000000bb002', 'x', 'daily', array['a@b.id']); assert false, 'plant di luar akses harus ditolak';
  exception when insufficient_privilege then null; end;
  insert into report_schedules (org_id, plant_id, name, frequency, recipients) values (o, '00000000-0000-0000-0000-0000000bb001', 'Mingguan R1', 'weekly', array['a@b.id','c@d.id']) returning id into s2;
  assert (select count(*) from report_schedules) = 2, 'dua jadwal terlihat';
  -- validasi
  begin insert into report_schedules (org_id, name, frequency, recipients) values (o, 'x', 'daily', '{}'); assert false, 'penerima kosong';
  exception when check_violation then null; end;
  begin insert into report_schedules (org_id, name, frequency, recipients) values (o, 'x', 'hourly', array['a@b.id']); assert false, 'frekuensi salah';
  exception when check_violation then null; end;
  begin insert into report_schedules (org_id, name, frequency, send_hour, recipients) values (o, 'x', 'daily', 24, array['a@b.id']); assert false, 'jam di luar rentang';
  exception when check_violation then null; end;
  -- ubah frekuensi: titik awal dihitung ulang & penghitung gagal direset
  update report_schedules set fail_count = 2, last_period_to = '2020-01-01' where id = s;
  update report_schedules set frequency = 'monthly' where id = s;
  select last_period_to into lp from report_schedules where id = s; select p_to into cur from report_period('monthly', 7);
  assert lp = cur and (select fail_count from report_schedules where id = s) = 0, 'ubah frekuensi menghitung ulang titik awal';
  -- riwayat
  insert into report_runs (org_id, schedule_id, kind, frequency, period_from, period_to, status, recipients, bytes) values (o, s, 'scheduled', 'daily', current_date - 1, current_date - 1, 'sent', array['atasan@contoh.id'], 12345);
  assert (select count(*) from report_runs) = 1;
end $$;

-- 3. Isolasi antar organisasi
select set_config('app.org_id', :'org2', true), set_config('app.plant_ids', '', true), set_config('app.all_plants', '1', true) \gset
do $$ begin
  assert (select count(*) from report_schedules) = 0 and (select count(*) from report_runs) = 0, 'org lain tidak melihat jadwal/riwayat';
  begin insert into report_schedules (org_id, name, frequency, recipients) values ('00000000-0000-0000-0000-000000000000', 'x', 'daily', array['a@b.id']); assert false;
  exception when insufficient_privilege or foreign_key_violation then null; end;
end $$;

-- 4. Penjadwal (role auth) melihat jadwal lintas-org, tapi tidak bisa mengubah
reset role;
set local role maintainhub_auth;
do $$ declare n int; begin
  select count(*) into n from report_schedules; assert n = 2, 'penjadwal melihat semua jadwal aktif lintas org: ' || n;
  begin update report_schedules set active = false; assert false, 'role auth tidak boleh mengubah';
  exception when insufficient_privilege then null; end;
  begin select count(*) into n from report_runs; assert false, 'role auth tidak boleh membaca riwayat';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
\echo UJI LAPORAN LULUS
