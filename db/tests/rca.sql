-- Uji modul RCA: alur PDCA, gerbang tahap, verifikasi, FMEA, kandidat, Pareto penyebab, RLS.
\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;
select provision_org('rca-uji', 'RCA Uji') as org \gset
select provision_org('rca-lain', 'RCA Lain') as org2 \gset
insert into plants (id, org_id, code, name) values
  ('00000000-0000-0000-0000-0000000ca001', :'org', 'R1', 'Plant R1'),
  ('00000000-0000-0000-0000-0000000ca002', :'org2', 'R2', 'Plant R2');
insert into assets (id, org_id, plant_id, code, name, asset_type) values
  ('00000000-0000-0000-0000-0000000ca101', :'org', '00000000-0000-0000-0000-0000000ca001', 'RA1', 'Pompa RA1', 'equipment'),
  ('00000000-0000-0000-0000-0000000ca102', :'org', '00000000-0000-0000-0000-0000000ca001', 'RA2', 'Pompa RA2', 'equipment');
insert into users (id, org_id, username, full_name, role_code, password_hash) values
  ('00000000-0000-0000-0000-0000000ca201', :'org', 'sup', 'Sup', 'supervisor', '$argon2id$x'),
  ('00000000-0000-0000-0000-0000000ca202', :'org', 'tek', 'Tek', 'technician', '$argon2id$x');
-- 3 breakdown pada RA1 (mode BRG x2, SEAL x1), 1 pada RA2
insert into work_orders (org_id, plant_id, code, wo_type, title, asset_id, priority, status, actual_hours, downtime_hours, done_at, failure_mode_id)
select :'org', '00000000-0000-0000-0000-0000000ca001', 'WO-R-' || n, 'breakdown', 'uji ' || n, a::uuid, 'P3', 'done', 1, dt, now() - make_interval(days => d),
       (select id from failure_modes where org_id = :'org' and code = fm)
  from (values (1,'00000000-0000-0000-0000-0000000ca101',4,10,'FM-BRG'),(2,'00000000-0000-0000-0000-0000000ca101',2,20,'FM-BRG'),
               (3,'00000000-0000-0000-0000-0000000ca101',1,30,'FM-SEAL'),(4,'00000000-0000-0000-0000-0000000ca102',5,5,'FM-BRG')) v(n,a,dt,d,fm);
set local session_replication_role = origin;

set local role maintainhub_app;
select set_config('app.org_id', :'org', true), set_config('app.plant_ids', '', true), set_config('app.all_plants', '1', true) \gset
do $$
declare o uuid := current_setting('app.org_id')::uuid; p uuid := '00000000-0000-0000-0000-0000000ca001'; a uuid := '00000000-0000-0000-0000-0000000ca101';
  sup uuid := '00000000-0000-0000-0000-0000000ca201'; tek uuid := '00000000-0000-0000-0000-0000000ca202'; c uuid; act uuid; m text; k record;
begin
  assert (select count(*) from failure_modes) = 12, 'master mode kegagalan terisi untuk org';
  -- kandidat
  assert (select count(*) from rca_candidates(p)) = 1 and (select breakdowns from rca_candidates(p)) = 3, 'RA1 jadi kandidat (3 breakdown)';
  assert (select downtime_h from rca_candidates(p)) = 7, 'downtime kandidat 7';
  -- buat kasus
  insert into rca_cases (org_id, plant_id, asset_id, title, problem, stage) values (o, p, a, 'Bearing pompa RA1 sering rusak', 'Tiga kali dalam 90 hari', 'closed') returning id into c;
  assert (select stage from rca_cases where id = c) = 'plan', 'tahap awal dipaksa plan';
  assert (select code from rca_cases where id = c) like 'RCA-%', 'kode otomatis: ' || (select code from rca_cases where id = c);
  assert (select count(*) from rca_candidates(p)) = 0, 'aset dengan RCA aktif keluar dari kandidat';
  -- gerbang plan -> do
  begin update rca_cases set stage = 'do' where id = c; assert false; exception when check_violation then m := sqlerrm; end;
  assert m like '%akar masalah%', 'butuh akar masalah: ' || m;
  update rca_cases set root_cause = 'Pelumasan tidak sesuai jadwal', root_cause_category = 'method' where id = c;
  begin update rca_cases set stage = 'do' where id = c; assert false; exception when check_violation then m := sqlerrm; end;
  assert m like '%5 Why%', 'butuh 5 Why: ' || m;
  insert into rca_whys (org_id, case_id, level, answer) values (o, c, 1, 'Bearing panas'), (o, c, 2, 'Grease kurang');
  begin insert into rca_whys (org_id, case_id, level, answer) values (o, c, 2, 'dobel'); assert false; exception when unique_violation then null; end;
  begin update rca_cases set stage = 'do' where id = c; assert false; exception when check_violation then m := sqlerrm; end;
  assert m like '%tindakan%', 'butuh tindakan: ' || m;
  insert into rca_causes (org_id, case_id, category, cause, is_root) values (o, c, 'method', 'Jadwal pelumasan tidak ada', true);
  insert into rca_actions (org_id, case_id, kind, description, owner_id) values (o, c, 'corrective', 'Buat jadwal pelumasan PM', sup) returning id into act;
  update rca_cases set stage = 'do' where id = c;
  -- do -> check butuh semua tindakan selesai
  begin update rca_cases set stage = 'check' where id = c; assert false; exception when check_violation then m := sqlerrm; end;
  assert m like '%belum selesai%', 'tindakan masih open: ' || m;
  update rca_actions set status = 'done' where id = act;
  assert (select done_at from rca_actions where id = act) is not null, 'done_at terisi';
  update rca_cases set stage = 'check' where id = c;
  -- check -> act butuh verifikasi
  begin update rca_cases set stage = 'act' where id = c; assert false; exception when check_violation then m := sqlerrm; end;
  assert m like '%verifikasi efektivitas%', 'butuh catatan verifikasi: ' || m;
  update rca_cases set verification_notes = 'Tidak ada kerusakan 30 hari' where id = c;
  begin update rca_cases set stage = 'act' where id = c; assert false; exception when check_violation then m := sqlerrm; end;
  assert m like '%diverifikasi Supervisor%', 'tindakan belum diverifikasi: ' || m;
  -- teknisi tidak boleh verifikasi
  begin update rca_actions set status = 'verified', verified_by = tek where id = act; assert false; exception when insufficient_privilege then null; end;
  update rca_actions set status = 'verified', verified_by = sup, verification_note = 'ok' where id = act;
  assert (select verified_at from rca_actions where id = act) is not null, 'verified_at terisi';
  begin update rca_actions set description = 'ubah' where id = act; assert false; exception when check_violation then null; end;
  update rca_cases set stage = 'act' where id = c;
  -- tutup butuh standarisasi; loncat tahap ditolak
  begin update rca_cases set stage = 'closed' where id = c; assert false; exception when check_violation then m := sqlerrm; end;
  assert m like '%standarisasi%', 'butuh standarisasi: ' || m;
  update rca_cases set standardization_notes = 'PM-LUB diperbarui' where id = c;
  update rca_cases set stage = 'closed' where id = c;
  assert (select closed_at from rca_cases where id = c) is not null, 'closed_at terisi';
  begin update rca_cases set title = 'x' where id = c; assert false; exception when check_violation then null; end;
  begin insert into rca_whys (org_id, case_id, level, answer) values (o, c, 3, 'x'); assert false; exception when check_violation then null; end;
  begin insert into rca_actions (org_id, case_id, description) values (o, c, 'x'); assert false; exception when check_violation then null; end;
  -- loncat tahap ditolak
  insert into rca_cases (org_id, plant_id, asset_id, title) values (o, p, '00000000-0000-0000-0000-0000000ca102', 'RA2') returning id into c;
  begin update rca_cases set stage = 'act' where id = c; assert false; exception when check_violation then null; end;
  -- FMEA
  insert into fmea_items (org_id, plant_id, asset_id, function_desc, failure_mode_text, effect, cause, severity, occurrence, detection)
    values (o, p, a, 'Memompa', 'Bearing aus', 'Mesin berhenti', 'Pelumasan', 8, 5, 4);
  assert (select rpn from fmea_items) = 160, 'RPN = 8 x 5 x 4 = 160';
  begin insert into fmea_items (org_id, plant_id, asset_id, function_desc, effect, cause, severity, occurrence, detection) values (o, p, a, 'f', 'e', 'c', 5, 5, 5); assert false; exception when check_violation then null; end;
  begin insert into fmea_items (org_id, plant_id, asset_id, function_desc, failure_mode_text, effect, cause, severity, occurrence, detection) values (o, p, a, 'f', 'm', 'e', 'c', 11, 5, 5); assert false; exception when check_violation then null; end;
  assert (select events from fmea_suggest_occurrence(a)) = 3 and (select occurrence from fmea_suggest_occurrence(a)) = 6, '3 kejadian -> skala 6';
  assert (select events from fmea_suggest_occurrence(a, (select id from failure_modes where code = 'FM-BRG'))) = 2, '2 kejadian mode BRG';
  assert (select occurrence from fmea_suggest_occurrence(a, (select id from failure_modes where code = 'FM-BRG'))) = 5, 'skala 5';
  -- Pareto penyebab: BRG 3 kejadian (4+2+5 jam = 11), SEAL 1
  assert (select count(*) from kpi_pareto_cause(current_date - 60, current_date, p)) = 2, 'dua mode kegagalan';
  assert (select code from kpi_pareto_cause(current_date - 60, current_date, p) limit 1) = 'FM-BRG', 'BRG teratas';
  assert (select events from kpi_pareto_cause(current_date - 60, current_date, p) limit 1) = 3, 'BRG 3 kejadian';
  assert (select downtime_h from kpi_pareto_cause(current_date - 60, current_date, p) limit 1) = 11, 'downtime BRG 11';
  assert (select share_pct from kpi_pareto_cause(current_date - 60, current_date, p) limit 1) = 75.0, 'porsi 75%';
  assert (select max(cum_pct) from kpi_pareto_cause(current_date - 60, current_date, p)) = 100, 'kumulatif 100';
end $$;

-- isolasi tenant: org lain tidak melihat apa pun
select set_config('app.org_id', :'org2', true) \gset
do $$ begin
  assert (select count(*) from rca_cases) = 0 and (select count(*) from rca_whys) = 0 and (select count(*) from fmea_items) = 0 and (select count(*) from rca_actions) = 0, 'RLS RCA bocor';
  assert (select count(*) from failure_modes) = 12, 'hanya mode kegagalan org sendiri';
  begin insert into rca_cases (org_id, plant_id, asset_id, title) values (current_setting('app.org_id')::uuid, '00000000-0000-0000-0000-0000000ca002', '00000000-0000-0000-0000-0000000ca101', 'x'); assert false; exception when others then null; end;
end $$;
rollback;
\echo UJI RCA LULUS
