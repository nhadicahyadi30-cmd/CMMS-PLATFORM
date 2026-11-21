-- Uji beban kerja & skill: isolasi org/plant, batas nilai, FK skill (set null), pewarisan skill oleh pm_generate.
\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;
select provision_org('wf-uji', 'Workforce Uji') as org \gset
select provision_org('wf-lain', 'Workforce Lain') as org2 \gset
insert into plants (id, org_id, code, name) values ('00000000-0000-0000-0000-0000000e1001', :'org', 'W1', 'Plant W1'), ('00000000-0000-0000-0000-0000000e1002', :'org', 'W2', 'Plant W2');
insert into assets (id, org_id, plant_id, code, name, asset_type) values ('00000000-0000-0000-0000-0000000f1001', :'org', '00000000-0000-0000-0000-0000000e1001', 'MTR-W1', 'Motor W1', 'equipment');
insert into technicians (id, org_id, plant_id, code, full_name, skill, shift) values
 ('00000000-0000-0000-0000-000000a11001', :'org', '00000000-0000-0000-0000-0000000e1001', 'T-W1', 'Budi', 'listrik', 'pagi'),
 ('00000000-0000-0000-0000-000000a11002', :'org', '00000000-0000-0000-0000-0000000e1002', 'T-W2', 'Sari', 'mekanik', 'malam');
insert into skills (id, org_id, code, name) values ('00000000-0000-0000-0000-000000b11001', :'org', 'LISTRIK', 'Listrik'), ('00000000-0000-0000-0000-000000b11002', :'org', 'MEKANIK', 'Mekanik');
insert into pm_plans (id, org_id, plant_id, asset_id, name, trigger_type, interval_days, est_hours, lead_days, next_due, skill_id, skill_min_level)
 values ('00000000-0000-0000-0000-000000c11001', :'org', '00000000-0000-0000-0000-0000000e1001', '00000000-0000-0000-0000-0000000f1001', 'Cek motor', 'calendar', 30, 3, 3, current_date, '00000000-0000-0000-0000-000000b11001', 3);
set local session_replication_role = origin;

-- pm_generate mewarisi skill
select pm_generate(:'org') as n \gset
do $$ begin
  assert (select count(*) from work_orders where pm_plan_id = '00000000-0000-0000-0000-000000c11001') = 1, 'WO PM dibuat';
  assert (select skill_id from work_orders where pm_plan_id = '00000000-0000-0000-0000-000000c11001') = '00000000-0000-0000-0000-000000b11001', 'skill diwarisi';
  assert (select skill_min_level from work_orders where pm_plan_id = '00000000-0000-0000-0000-000000c11001') = 3, 'level minimum diwarisi';
end $$;

set local role maintainhub_app;
select set_config('app.org_id', :'org', true), set_config('app.plant_ids', '', true), set_config('app.all_plants', '1', true) \gset
do $$
declare o uuid := (select org_id from plants where code = 'W1');
begin
  insert into technician_skills (org_id, technician_id, skill_id, level, certified_until) values
    (o, '00000000-0000-0000-0000-000000a11001', '00000000-0000-0000-0000-000000b11001', 3, current_date + 30),
    (o, '00000000-0000-0000-0000-000000a11002', '00000000-0000-0000-0000-000000b11002', 4, null);
  begin insert into technician_skills (org_id, technician_id, skill_id, level) values (o, '00000000-0000-0000-0000-000000a11001', '00000000-0000-0000-0000-000000b11002', 5); assert false, 'level 5 harus ditolak'; exception when check_violation then null; end;
  begin insert into technician_skills (org_id, technician_id, skill_id, level) values (o, '00000000-0000-0000-0000-000000a11001', '00000000-0000-0000-0000-000000b11001', 2); assert false, 'duplikat harus ditolak'; exception when unique_violation then null; end;
  begin insert into technician_absences (org_id, technician_id, from_date, to_date, reason) values (o, '00000000-0000-0000-0000-000000a11001', current_date, current_date - 1, 'cuti'); assert false, 'tanggal terbalik ditolak'; exception when check_violation then null; end;
  begin insert into technician_absences (org_id, technician_id, from_date, to_date, reason) values (o, '00000000-0000-0000-0000-000000a11001', current_date, current_date, 'bolos'); assert false, 'alasan tak dikenal ditolak'; exception when check_violation then null; end;
  insert into technician_absences (org_id, technician_id, from_date, to_date, reason) values (o, '00000000-0000-0000-0000-000000a11001', current_date, current_date + 2, 'cuti');
  begin insert into workforce_settings (org_id, productive_factor) values (o, 1.5); assert false, 'faktor > 1 ditolak'; exception when check_violation then null; end;
  insert into workforce_settings (org_id) values (o);
  assert (select productive_factor from workforce_settings) = 0.70 and (select ot_max_week_h from workforce_settings) = 18 and (select target_util from workforce_settings) = 0.85, 'nilai bawaan';
  assert (select count(*) from technician_skills) = 2 and (select count(*) from technician_absences) = 1, 'admin melihat semua';
end $$;
-- terbatas plant W1: hanya baris teknisi di plant W1 yang terlihat
select set_config('app.plant_ids', '00000000-0000-0000-0000-0000000e1001', true), set_config('app.all_plants', '0', true) \gset
do $$ begin
  assert (select count(*) from technician_skills) = 1, 'skill: hanya plant W1';
  assert (select count(*) from technician_absences) = 1, 'absensi plant W1';
  assert not exists (select 1 from technician_skills where technician_id = '00000000-0000-0000-0000-000000a11002'), 'teknisi plant lain tersembunyi';
end $$;
-- org lain tidak melihat apa pun
select set_config('app.org_id', :'org2', true), set_config('app.all_plants', '1', true) \gset
do $$ begin
  assert (select count(*) from skills) = 0 and (select count(*) from technician_skills) = 0 and (select count(*) from technician_absences) = 0 and (select count(*) from workforce_settings) = 0, 'org lain: kosong';
end $$;
-- hapus skill -> WO/PM kehilangan skill, tidak ikut terhapus
reset role;
delete from skills where id = '00000000-0000-0000-0000-000000b11001';
do $$ begin
  assert (select count(*) from work_orders where pm_plan_id = '00000000-0000-0000-0000-000000c11001') = 1, 'WO tetap ada';
  assert (select skill_id from work_orders where pm_plan_id = '00000000-0000-0000-0000-000000c11001') is null, 'skill WO jadi null';
  assert (select org_id from work_orders where pm_plan_id = '00000000-0000-0000-0000-000000c11001') is not null, 'org_id tidak ikut null';
  assert (select skill_id from pm_plans where id = '00000000-0000-0000-0000-000000c11001') is null, 'skill PM jadi null';
  assert (select count(*) from technician_skills where skill_id = '00000000-0000-0000-0000-000000b11001') = 0, 'penilaian skill ikut terhapus';
end $$;
rollback;
\echo workforce.sql OK
