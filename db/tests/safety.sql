-- Uji: peran Produksi + modul, Inspeksi & Checklist, Izin Kerja (PTW) + LOTO, isolasi RLS.
\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;
select provision_org('sf-uji', 'Safety Uji') as org \gset
select provision_org('sf-lain', 'Safety Lain') as org2 \gset
insert into plants (id, org_id, code, name) values
  ('00000000-0000-0000-0000-0000000a1001', :'org', 'S1', 'Plant S1'),
  ('00000000-0000-0000-0000-0000000a1002', :'org', 'S2', 'Plant S2'),
  ('00000000-0000-0000-0000-0000000a1003', :'org2', 'X1', 'Plant X1');
insert into assets (id, org_id, plant_id, code, name, asset_type) values
  ('00000000-0000-0000-0000-0000000b1001', :'org', '00000000-0000-0000-0000-0000000a1001', 'PUMP-1', 'Pompa 1', 'equipment'),
  ('00000000-0000-0000-0000-0000000b1002', :'org', '00000000-0000-0000-0000-0000000a1001', 'FAN-1', 'Fan 1', 'equipment'),
  ('00000000-0000-0000-0000-0000000b1003', :'org', '00000000-0000-0000-0000-0000000a1002', 'PUMP-2', 'Pompa S2', 'equipment');
insert into users (id, org_id, username, full_name, role_code, password_hash) values
  ('00000000-0000-0000-0000-0000000c0001', :'org', 'adm',  'Admin',     'admin',      '$argon2id$x'),
  ('00000000-0000-0000-0000-0000000c0002', :'org', 'spv',  'Supervisor','supervisor', '$argon2id$x'),
  ('00000000-0000-0000-0000-0000000c0003', :'org', 'tek1', 'Teknisi 1', 'technician', '$argon2id$x'),
  ('00000000-0000-0000-0000-0000000c0004', :'org', 'tek2', 'Teknisi 2', 'technician', '$argon2id$x'),
  ('00000000-0000-0000-0000-0000000c0005', :'org', 'prd',  'Produksi',  'production', '$argon2id$x'),
  ('00000000-0000-0000-0000-0000000c0006', :'org', 'prd2', 'Produksi S2','production','$argon2id$x'),
  ('00000000-0000-0000-0000-0000000c0007', :'org', 'pln',  'Planner',   'planner',    '$argon2id$x');
insert into user_plants (user_id, plant_id) values
  ('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-0000000a1001'),
  ('00000000-0000-0000-0000-0000000c0003', '00000000-0000-0000-0000-0000000a1001'),
  ('00000000-0000-0000-0000-0000000c0004', '00000000-0000-0000-0000-0000000a1001'),
  ('00000000-0000-0000-0000-0000000c0005', '00000000-0000-0000-0000-0000000a1001'),
  ('00000000-0000-0000-0000-0000000c0006', '00000000-0000-0000-0000-0000000a1002'),
  ('00000000-0000-0000-0000-0000000c0007', '00000000-0000-0000-0000-0000000a1001');
set local session_replication_role = origin;

-- peran & modul
do $$
declare o uuid := (select id from organizations where slug = 'sf-uji');
begin
  assert (select array_agg(module order by module) from role_modules where org_id = o and role_code = 'production') = array[3,11,12]::smallint[], 'Produksi: modul 3, 11, 12';
  assert (select array_agg(module order by module) from role_modules where org_id = o and role_code = 'technician') = array[1,2,3,5,11,12]::smallint[], 'Teknisi';
  assert (select count(*) from role_modules where org_id = o and role_code = 'admin') = 12, 'Admin 12 modul';
  assert not exists (select 1 from role_modules where org_id = o and role_code = 'supervisor' and module = 10), 'Supervisor tanpa Administrasi';
end $$;

set local role maintainhub_app;
select set_config('app.org_id', :'org', true), set_config('app.plant_ids', '', true), set_config('app.all_plants', '1', true) \gset

-- ================= INSPEKSI =================
do $$
declare p1 uuid := '00000000-0000-0000-0000-0000000a1001'; o uuid := (select org_id from plants where code = 'S1');
        tpl uuid; tpl_prd uuid; tpl_tek uuid; i_chk uuid; i_num uuid; i_txt uuid; r record; r2 record; n int; wo record;
        tek uuid := '00000000-0000-0000-0000-0000000c0003'; prd uuid := '00000000-0000-0000-0000-0000000c0005'; spv uuid := '00000000-0000-0000-0000-0000000c0002';
begin
  insert into inspection_templates (org_id, plant_id, code, name, asset_id, frequency_days) values (o, p1, 'RND-PUMP', 'Ronda pompa', '00000000-0000-0000-0000-0000000b1001', 7) returning id into tpl;
  insert into inspection_items (org_id, template_id, seq, text, kind, critical) values (o, tpl, 1, 'Tidak ada kebocoran seal', 'check', true) returning id into i_chk;
  insert into inspection_items (org_id, template_id, seq, text, kind, unit, min_val, max_val) values (o, tpl, 2, 'Tekanan discharge', 'number', 'bar', 2, 5) returning id into i_num;
  insert into inspection_items (org_id, template_id, seq, text, kind, required) values (o, tpl, 3, 'Catatan lain', 'text', false) returning id into i_txt;
  begin insert into inspection_templates (org_id, plant_id, code, name, asset_id) values (o, p1, 'BAD-AST', 'x', '00000000-0000-0000-0000-0000000b1003'); assert false; exception when check_violation then null; end;
  begin insert into inspection_templates (org_id, plant_id, code, name) values (o, p1, 'RND-PUMP', 'dup'); assert false; exception when unique_violation then null; end;
  begin insert into inspection_items (org_id, template_id, seq, text, kind, min_val) values (o, tpl, 9, 'x', 'check', 1); assert false; exception when check_violation then null; end;

  -- normal: tanpa WO
  select * into r from inspection_record(tek, tpl, null, now(), 'ok', jsonb_build_array(
      jsonb_build_object('itemId', i_chk, 'ok', true), jsonb_build_object('itemId', i_num, 'value', 3.5)), '11111111-1111-1111-1111-111111111111');
  assert r.abnormal = 0 and r.wo_id is null and not r.duplicate and r.code like 'INS-S1-%', 'inspeksi normal: ' || r.code;
  assert (select count(*) from inspection_results where inspection_id = r.id) = 3, 'semua butir tersimpan (termasuk teks kosong)';
  -- idempoten
  select * into r2 from inspection_record(tek, tpl, null, now(), 'ok', jsonb_build_array(
      jsonb_build_object('itemId', i_chk, 'ok', true), jsonb_build_object('itemId', i_num, 'value', 3.5)), '11111111-1111-1111-1111-111111111111');
  assert r2.duplicate and r2.id = r.id, 'kirim ulang tidak menggandakan';
  assert (select count(*) from inspections) = 1;

  -- tidak normal (angka di luar batas) -> WO P3, sumber inspection
  select * into r from inspection_record(tek, tpl, null, now(), '', jsonb_build_array(
      jsonb_build_object('itemId', i_chk, 'ok', true), jsonb_build_object('itemId', i_num, 'value', 7.2)), null);
  assert r.abnormal = 1 and r.wo_id is not null, 'angka di luar batas = tidak normal';
  select * into wo from work_orders where id = r.wo_id;
  assert wo.source = 'inspection' and wo.priority = 'P3' and wo.status = 'waiting' and wo.requester_id = tek and wo.wo_type = 'corrective', 'WO dari temuan';
  assert (select inspections.wo_id from inspections where inspections.id = r.id) = r.wo_id;
  -- butir kritis tidak normal -> P2
  select * into r from inspection_record(tek, tpl, null, now(), '', jsonb_build_array(
      jsonb_build_object('itemId', i_chk, 'ok', false, 'note', 'seal merembes'), jsonb_build_object('itemId', i_num, 'value', 3)), null);
  assert (select priority from work_orders where id = r.wo_id) = 'P2', 'butir kritis = P2';
  assert (select abnormal from inspection_results where inspection_id = r.id and seq = 1) and (select note from inspection_results where inspection_id = r.id and seq = 1) = 'seal merembes';

  -- validasi
  begin perform inspection_record(tek, tpl, null, now(), '', jsonb_build_array(jsonb_build_object('itemId', i_chk, 'ok', true)), null); assert false; exception when check_violation then null; end;
  begin perform inspection_record(tek, tpl, null, now(), '', jsonb_build_array(jsonb_build_object('itemId', gen_random_uuid(), 'ok', true)), null); assert false; exception when check_violation then null; end;
  begin perform inspection_record(tek, tpl, '00000000-0000-0000-0000-0000000b1002', now(), '', '[]'::jsonb, null); assert false; exception when check_violation then null; end;
  begin perform inspection_record(tek, tpl, null, now() - interval '40 days', '', jsonb_build_array(jsonb_build_object('itemId', i_chk, 'ok', true), jsonb_build_object('itemId', i_num, 'value', 3)), null); assert false; exception when check_violation then null; end;
  select * into r from inspection_record(tek, tpl, null, now() + interval '3 days', '', jsonb_build_array(jsonb_build_object('itemId', i_chk, 'ok', true), jsonb_build_object('itemId', i_num, 'value', 3)), null);
  assert (select performed_at from inspections where inspections.id = r.id) <= now(), 'waktu masa depan dipotong ke sekarang';

  -- audiens
  insert into inspection_templates (org_id, plant_id, code, name, audience) values (o, p1, 'OPR-HARIAN', 'Ronda operator', 'production') returning id into tpl_prd;
  insert into inspection_items (org_id, template_id, seq, text) values (o, tpl_prd, 1, 'Area bersih');
  insert into inspection_templates (org_id, plant_id, code, name, audience) values (o, p1, 'TEK-ONLY', 'Khusus teknisi', 'technician') returning id into tpl_tek;
  insert into inspection_items (org_id, template_id, seq, text) values (o, tpl_tek, 1, 'Torsi baut');
  select * into r from inspection_record(prd, tpl_prd, '00000000-0000-0000-0000-0000000b1002', now(), '', jsonb_build_array(jsonb_build_object('itemId', (select id from inspection_items where template_id = tpl_prd), 'ok', true)), null);
  assert r.abnormal = 0, 'Produksi boleh checklist miliknya';
  begin perform inspection_record(prd, tpl_tek, '00000000-0000-0000-0000-0000000b1002', now(), '', jsonb_build_array(jsonb_build_object('itemId', (select id from inspection_items where template_id = tpl_tek), 'ok', true)), null); assert false; exception when insufficient_privilege then null; end;
  begin perform inspection_record(tek, tpl_prd, '00000000-0000-0000-0000-0000000b1002', now(), '', jsonb_build_array(jsonb_build_object('itemId', (select id from inspection_items where template_id = tpl_prd), 'ok', true)), null); assert false; exception when insufficient_privilege then null; end;
  perform inspection_record(spv, tpl_prd, '00000000-0000-0000-0000-0000000b1002', now(), '', jsonb_build_array(jsonb_build_object('itemId', (select id from inspection_items where template_id = tpl_prd), 'ok', true)), null);

  -- jatuh tempo
  update inspection_templates set frequency_days = 7, created_at = now() - interval '10 days' where id = tpl_tek;
  select overdue_days into n from inspection_due(p1) where template_id = tpl_tek;
  assert n = 3, 'template belum pernah diperiksa, dibuat 10 hari lalu, frekuensi 7 hari = telat 3 hari: ' || coalesce(n::text, 'null');
  select overdue_days into n from inspection_due(p1) where template_id = tpl;
  assert n < 0, 'baru diperiksa = belum jatuh tempo';
  assert not exists (select 1 from inspection_due(p1) where template_id = tpl_prd), 'tanpa frekuensi tidak muncul';
end $$;

-- ================= PTW =================
do $$
declare p1 uuid := '00000000-0000-0000-0000-0000000a1001'; o uuid := (select org_id from plants where code = 'S1');
  a1 uuid := '00000000-0000-0000-0000-0000000b1001'; a2 uuid := '00000000-0000-0000-0000-0000000b1002';
  adm uuid := '00000000-0000-0000-0000-0000000c0001'; spv uuid := '00000000-0000-0000-0000-0000000c0002'; tek uuid := '00000000-0000-0000-0000-0000000c0003';
  tek2 uuid := '00000000-0000-0000-0000-0000000c0004'; prd uuid := '00000000-0000-0000-0000-0000000c0005';
  pm uuid; pm2 uuid; pt1 uuid; pt2 uuid; lk1 uuid; lk2 uuid; n int; pcode text;
begin
  -- Produksi tidak boleh mengajukan
  begin insert into permits (org_id, plant_id, asset_id, title, valid_from, valid_until, requested_by) values (o, p1, a1, 'x', now(), now() + interval '4 hours', prd); assert false; exception when insufficient_privilege then null; end;
  begin insert into permits (org_id, plant_id, asset_id, title, valid_from, valid_until, requested_by) values (o, p1, a1, 'x', now(), now() + interval '30 hours', tek); assert false; exception when check_violation then null; end;
  begin insert into permits (org_id, plant_id, asset_id, title, valid_from, valid_until, requested_by) values (o, p1, '00000000-0000-0000-0000-0000000b1003', 'x', now(), now() + interval '4 hours', tek); assert false; exception when check_violation then null; end;

  insert into permits (org_id, plant_id, asset_id, work_type, title, hazards, valid_from, valid_until, requested_by)
  values (o, p1, a1, 'electrical', 'Ganti motor pompa', 'Tegangan 380V', now(), now() + interval '8 hours', tek) returning id, code into pm, pcode;
  assert pcode like 'PTW-S1-%' and (select status from permits where id = pm) = 'requested', 'nomor & status awal: ' || pcode;
  assert exists (select 1 from notifications where kind = 'ptw' and user_id = spv), 'Supervisor diberi tahu';
  assert not exists (select 1 from notifications where kind = 'ptw' and user_id = prd), 'Produksi belum';

  -- persetujuan: wewenang & syarat titik isolasi
  begin update permits set status = 'approved', approved_by = tek where id = pm; assert false; exception when insufficient_privilege then null; end;
  begin update permits set status = 'approved', approved_by = spv where id = pm; assert false; exception when check_violation then null; end;
  insert into permit_points (org_id, permit_id, seq, description, energy_type, method) values (o, pm, 1, 'Breaker Q1 MCC-2', 'electrical', 'Open & lock') returning id into pt1;
  insert into permit_points (org_id, permit_id, seq, description, energy_type) values (o, pm, 2, 'Valve discharge', 'hydraulic') returning id into pt2;
  update permits set status = 'approved', approved_by = spv where id = pm;
  assert (select approved_at from permits where id = pm) is not null;
  assert exists (select 1 from notifications where kind = 'ptw' and user_id = prd), 'Produksi diminta menyerahkan area';
  begin insert into permit_points (org_id, permit_id, seq, description) values (o, pm, 3, 'x'); perform 1; end;   -- masih boleh saat disetujui
  delete from permit_points where permit_id = pm and seq = 3;
  begin update permits set status = 'active', activated_by = tek where id = pm; assert false; exception when check_violation then null; end;   -- lompat tahap

  -- serah area
  begin update permits set status = 'handed_over', handover_by = spv where id = pm; assert false; exception when insufficient_privilege then null; end;
  begin update permits set status = 'handed_over', handover_by = tek where id = pm; assert false; exception when insufficient_privilege then null; end;
  update permits set status = 'handed_over', handover_by = prd, handover_note = 'Mesin dimatikan, area dikosongkan' where id = pm;
  assert exists (select 1 from notifications where kind = 'ptw' and user_id = tek and title like 'Area diserahkan%'), 'pemohon diberi tahu';
  begin delete from permit_points where id = pt1; assert false; exception when check_violation then null; end;
  begin update permits set title = 'ubah' where id = pm; assert false; exception when check_violation then null; end;

  -- izin lain pada aset yang sama tidak boleh ikut diserahkan
  insert into permits (org_id, plant_id, asset_id, title, valid_from, valid_until, requested_by, requires_loto) values (o, p1, a1, 'Pekerjaan lain', now(), now() + interval '2 hours', tek2, false) returning id into pm2;
  update permits set status = 'approved', approved_by = adm where id = pm2;
  begin update permits set status = 'handed_over', handover_by = prd where id = pm2; assert false; exception when check_violation then null; end;
  update permits set status = 'cancelled', cancelled_by = tek2, cancel_reason = 'ditunda' where id = pm2;
  begin update permits set status = 'cancelled', cancelled_by = prd, cancel_reason = 'x' where id = pm; assert false; exception when insufficient_privilege then null; end;

  -- LOTO: aktif ditolak sebelum lengkap
  begin update permits set status = 'active', activated_by = tek where id = pm; assert false; exception when check_violation then null; end;
  insert into permit_locks (org_id, permit_id, point_id, lock_no, applied_by) values (o, pm, pt1, 'L-101', tek) returning id into lk1;
  insert into permit_locks (org_id, permit_id, point_id, lock_no, applied_by) values (o, pm, pt1, 'L-901', prd);   -- gembok operator Produksi pada titik yang sama
  begin insert into permit_locks (org_id, permit_id, point_id, lock_no, applied_by) values (o, pm, pt1, 'L-101', tek2); assert false; exception when unique_violation then null; end;
  begin update permit_points set zero_verified_by = prd where id = pt1; assert false; exception when insufficient_privilege then null; end;
  begin update permit_points set zero_verified_by = tek where id = pt2; assert false; exception when check_violation then null; end;   -- titik 2 belum bergembok
  update permit_points set zero_verified_by = tek where id = pt1;
  assert (select zero_verified_at from permit_points where id = pt1) is not null;
  begin insert into permit_locks (org_id, permit_id, point_id, lock_no, applied_by) values (o, pm, pt1, 'L-102', tek2); assert false; exception when check_violation then null; end;
  begin update permits set status = 'active', activated_by = tek where id = pm; assert false; exception when check_violation then null; end;   -- titik 2 belum
  insert into permit_locks (org_id, permit_id, point_id, lock_no, applied_by) values (o, pm, pt2, 'L-201', tek2) returning id into lk2;
  update permit_points set zero_verified_by = tek2 where id = pt2;
  begin update permits set status = 'active', activated_by = prd where id = pm; assert false; exception when insufficient_privilege then null; end;
  update permits set status = 'active', activated_by = tek where id = pm;
  assert (select activated_at from permits where id = pm) is not null;

  -- selesai: semua gembok harus dilepas, oleh pemasang atau Supervisor dengan alasan
  begin update permits set status = 'completed', completed_by = tek where id = pm; assert false; exception when check_violation then null; end;
  begin update permit_locks set removed_by = tek2 where id = lk1; assert false; exception when insufficient_privilege then null; end;
  begin update permit_locks set removed_by = spv where id = lk1; assert false; exception when check_violation then null; end;
  update permit_locks set removed_by = spv, override_reason = 'Teknisi 1 sudah pulang' where id = lk1;
  update permit_locks set removed_by = prd where permit_id = pm and lock_no = 'L-901';
  update permit_locks set removed_by = tek2 where id = lk2;
  begin update permit_locks set removed_by = tek where id = lk1; assert false; exception when check_violation then null; end;   -- sudah dilepas
  begin update permits set status = 'closed', returned_by = prd where id = pm; assert false; exception when check_violation then null; end;   -- lompat tahap
  update permits set status = 'completed', completed_by = tek, completion_note = 'Motor terpasang' where id = pm;
  assert exists (select 1 from notifications where kind = 'ptw' and user_id = prd and title like 'Terima kembali%'), 'Produksi diminta menerima area';
  begin update permits set status = 'closed', returned_by = tek where id = pm; assert false; exception when insufficient_privilege then null; end;
  update permits set status = 'closed', returned_by = prd where id = pm;
  begin update permits set title = 'x' where id = pm; assert false; exception when check_violation then null; end;   -- sudah ditutup

  select count(*) into n from permit_events where permit_id = pm;
  assert n >= 14, 'jejak audit lengkap: ' || n;
  assert exists (select 1 from permit_events where permit_id = pm and text like 'Gembok L-101 dilepas (oleh orang lain:%');
  begin delete from permit_events where permit_id = pm; assert false; exception when others then if sqlstate = 'P0004' then raise; end if; end;
  begin update permit_events set text = 'x' where permit_id = pm; assert false; exception when others then if sqlstate = 'P0004' then raise; end if; end;

  -- izin tanpa LOTO: jalur singkat; tolak oleh Supervisor
  insert into permits (org_id, plant_id, asset_id, work_type, title, valid_from, valid_until, requested_by, requires_loto) values (o, p1, a2, 'height', 'Cat rangka fan', now(), now() + interval '3 hours', tek, false) returning id into pm2;
  begin update permits set status = 'rejected', approved_by = spv where id = pm2; assert false; exception when check_violation then null; end;   -- alasan wajib (constraint)
  update permits set status = 'approved', approved_by = spv where id = pm2;
  update permits set status = 'handed_over', handover_by = adm where id = pm2;
  update permits set status = 'active', activated_by = tek where id = pm2;
  update permits set status = 'completed', completed_by = tek where id = pm2;
  update permits set status = 'closed', returned_by = prd where id = pm2;

  insert into permits (org_id, plant_id, asset_id, title, valid_from, valid_until, requested_by) values (o, p1, a2, 'Ditolak', now(), now() + interval '3 hours', tek) returning id into pm2;
  update permits set status = 'rejected', approved_by = spv, reject_reason = 'APD belum lengkap' where id = pm2;
  assert exists (select 1 from notifications where kind = 'ptw' and user_id = tek and title like 'Izin ditolak%');
  begin update permits set status = 'approved', approved_by = spv where id = pm2; assert false; exception when check_violation then null; end;
end $$;

-- ================= RLS =================
select set_config('app.org_id', :'org2', true), set_config('app.plant_ids', '', true), set_config('app.all_plants', '1', true) \gset
do $$ begin
  assert (select count(*) from permits) = 0 and (select count(*) from inspections) = 0 and (select count(*) from inspection_templates) = 0, 'organisasi lain tidak melihat data';
  assert (select count(*) from permit_events) = 0 and (select count(*) from permit_locks) = 0;
end $$;
select set_config('app.org_id', :'org', true), set_config('app.plant_ids', '00000000-0000-0000-0000-0000000a1002', true), set_config('app.all_plants', '0', true) \gset
do $$ begin
  assert (select count(*) from permits) = 0 and (select count(*) from inspections) = 0 and (select count(*) from permit_events) = 0, 'pengguna plant S2 tidak melihat plant S1';
  begin insert into permits (org_id, plant_id, asset_id, title, valid_from, valid_until, requested_by) values ((select org_id from plants where code='S1'), '00000000-0000-0000-0000-0000000a1001', '00000000-0000-0000-0000-0000000b1001', 'x', now(), now() + interval '1 hour', '00000000-0000-0000-0000-0000000c0003'); assert false; exception when insufficient_privilege or check_violation then null; end;
end $$;
select set_config('app.org_id', :'org', true), set_config('app.plant_ids', '00000000-0000-0000-0000-0000000a1001', true), set_config('app.all_plants', '0', true) \gset
do $$ begin
  assert (select count(*) from permits) = 4 and (select count(*) from inspections) >= 5, 'pengguna plant S1 melihat plant S1';
end $$;

select 'SEMUA UJI KESELAMATAN & INSPEKSI LULUS' as hasil;
rollback;
