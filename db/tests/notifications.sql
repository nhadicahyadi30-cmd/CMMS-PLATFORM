-- Uji notifikasi: penerima sesuai peran & plant, WO PM, penugasan teknisi, alarm, isolasi org.
\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;
select provision_org('nt-uji', 'Notif Uji') as org \gset
select provision_org('nt-lain', 'Notif Lain') as org2 \gset
insert into plants (id, org_id, code, name) values ('00000000-0000-0000-0000-0000000e2001', :'org', 'N1', 'Plant N1'), ('00000000-0000-0000-0000-0000000e2002', :'org', 'N2', 'Plant N2');
insert into assets (id, org_id, plant_id, code, name, asset_type) values ('00000000-0000-0000-0000-0000000f2001', :'org', '00000000-0000-0000-0000-0000000e2001', 'MTR-N1', 'Motor N1', 'equipment');
insert into users (id, org_id, username, full_name, role_code, password_hash, active) values
 ('00000000-0000-0000-0000-0000000a2001', :'org', 'adm', 'Admin', 'admin', '$argon2id$x', true),
 ('00000000-0000-0000-0000-0000000a2002', :'org', 'spv1', 'Spv Plant 1', 'supervisor', '$argon2id$x', true),
 ('00000000-0000-0000-0000-0000000a2003', :'org', 'spv2', 'Spv Plant 2', 'supervisor', '$argon2id$x', true),
 ('00000000-0000-0000-0000-0000000a2004', :'org', 'tek1', 'Teknisi 1', 'technician', '$argon2id$x', true),
 ('00000000-0000-0000-0000-0000000a2005', :'org', 'spvoff', 'Spv nonaktif', 'supervisor', '$argon2id$x', false);
insert into user_plants values ('00000000-0000-0000-0000-0000000a2002', '00000000-0000-0000-0000-0000000e2001'), ('00000000-0000-0000-0000-0000000a2003', '00000000-0000-0000-0000-0000000e2002'), ('00000000-0000-0000-0000-0000000a2005', '00000000-0000-0000-0000-0000000e2001');
insert into technicians (id, org_id, plant_id, user_id, code, full_name, skill, shift) values ('00000000-0000-0000-0000-000000a22001', :'org', '00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000a2004', 'T-N1', 'Teknisi 1', 'listrik', 'pagi');
insert into pm_plans (id, org_id, plant_id, asset_id, name, trigger_type, interval_days, est_hours, lead_days, next_due)
 values ('00000000-0000-0000-0000-000000c22001', :'org', '00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000f2001', 'Cek motor N1', 'calendar', 30, 2, 3, current_date);
set local session_replication_role = origin;
set local role maintainhub_app;
select set_config('app.org_id', :'org', true), set_config('app.all_plants', '1', true);

-- WO manual baru -> admin + spv plant 1 saja (bukan spv plant 2, bukan yang nonaktif, bukan teknisi)
insert into work_orders (id, org_id, plant_id, wo_type, source, title, asset_id, priority)
 values ('00000000-0000-0000-0000-000000d22001', :'org', '00000000-0000-0000-0000-0000000e2001', 'breakdown', 'manual', 'Motor panas', '00000000-0000-0000-0000-0000000f2001', 'P1');
do $$ declare r record; begin
  assert (select count(*) from notifications where kind = 'wo_new') = 2, 'WO baru: 2 penerima (admin + spv plant 1)';
  assert (select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000a2003') = 0, 'spv plant lain tidak diberi tahu';
  assert (select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000a2005') = 0, 'pengguna nonaktif tidak diberi tahu';
  assert (select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000a2004') = 0, 'teknisi tidak diberi tahu WO baru';
  assert (select title from notifications where user_id = '00000000-0000-0000-0000-0000000a2002') like '[P1] WO baru: Motor panas', 'judul + penanda P1';
  assert (select link from notifications where user_id = '00000000-0000-0000-0000-0000000a2002') = '/work-orders/00000000-0000-0000-0000-000000d22001', 'tautan ke WO';
end $$;

-- penugasan -> teknisi yang bersangkutan
update work_orders set status = 'approved', approved_by = '00000000-0000-0000-0000-0000000a2002' where id = '00000000-0000-0000-0000-000000d22001';
update work_orders set technician_id = '00000000-0000-0000-0000-000000a22001', status = 'assigned' where id = '00000000-0000-0000-0000-000000d22001';
do $$ begin
  assert (select count(*) from notifications where kind = 'wo_assigned' and user_id = '00000000-0000-0000-0000-0000000a2004') = 1, 'teknisi diberi tahu saat ditugaskan';
  assert (select count(*) from notifications where kind = 'wo_assigned') = 1, 'hanya satu notifikasi penugasan';
end $$;
update work_orders set est_hours = 3 where id = '00000000-0000-0000-0000-000000d22001';   -- bukan perubahan teknisi
do $$ begin assert (select count(*) from notifications where kind = 'wo_assigned') = 1, 'tidak ada duplikat tanpa perubahan teknisi'; end $$;

-- PM otomatis
select pm_generate(:'org');
do $$ begin
  assert (select count(*) from notifications where kind = 'wo_pm') = 2, 'PM jatuh tempo: 2 penerima';
  assert (select title from notifications where kind = 'wo_pm' limit 1) like 'PM jatuh tempo:%', 'judul PM';
end $$;

-- alarm: warning/critical diberi tahu, info tidak
insert into alarms (org_id, plant_id, asset_id, severity, message) values (:'org', '00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000f2001', 'critical', 'Suhu oli 112 C');
insert into alarms (org_id, plant_id, asset_id, severity, message) values (:'org', '00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000f2001', 'info', 'Info saja');
do $$ begin
  assert (select count(*) from notifications where kind = 'alarm') = 2, 'alarm kritis: 2 penerima; info tidak';
  assert (select title from notifications where kind = 'alarm' limit 1) like 'ALARM KRITIS:%', 'judul alarm kritis';
end $$;

-- isolasi org
select set_config('app.org_id', :'org2', true);
do $$ begin assert (select count(*) from notifications) = 0, 'org lain tidak melihat notifikasi'; end $$;
select set_config('app.org_id', :'org', true);

-- batasan nilai
do $$ begin
  begin insert into notifications (org_id, user_id, kind, title) values (app_org(), '00000000-0000-0000-0000-0000000a2001', 'salah', 'x'); assert false, 'kind tidak valid harus ditolak';
  exception when check_violation then null; end;
  begin insert into notifications (org_id, user_id, kind, title) values (app_org(), '00000000-0000-0000-0000-0000000a2001', 'alarm', '  '); assert false, 'judul kosong harus ditolak';
  exception when check_violation then null; end;
end $$;
rollback;
\echo notifications.sql OK
