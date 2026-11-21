-- Uji power meter: rollup harian, celah data, reset meter, banyak meter per unit, bentrok manual, isolasi RLS.
\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;
select provision_org('pm-uji', 'Meter Uji') as org \gset
select provision_org('pm-lain', 'Meter Lain') as org2 \gset
insert into plants (id, org_id, code, name) values ('00000000-0000-0000-0000-0000000e1001', :'org', 'M1', 'Plant M1'), ('00000000-0000-0000-0000-0000000e1002', :'org', 'M2', 'Plant M2');
insert into energy_units (id, org_id, plant_id, code, name, kind) values
 ('00000000-0000-0000-0000-0000000f1001', :'org', '00000000-0000-0000-0000-0000000e1001', 'LINE-1', 'Lini 1', 'line'),
 ('00000000-0000-0000-0000-0000000f1002', :'org', '00000000-0000-0000-0000-0000000e1001', 'BOILER', 'Boiler', 'utility'),
 ('00000000-0000-0000-0000-0000000f1003', :'org', '00000000-0000-0000-0000-0000000e1002', 'LINE-X', 'Lini X', 'line');
set local session_replication_role = origin;

set local role maintainhub_app;
select set_config('app.org_id', :'org', true), set_config('app.plant_ids', '', true), set_config('app.all_plants', '1', true) \gset
do $$
declare o uuid := (select org_id from plants where code = 'M1'); m1 uuid; m2 uuid; m3 uuid; n int;
begin
  insert into energy_meters (org_id, plant_id, unit_id, code, name) values (o, '00000000-0000-0000-0000-0000000e1001', '00000000-0000-0000-0000-0000000f1001', 'MTR-1', 'Meter lini 1') returning id into m1;
  insert into energy_meters (org_id, plant_id, unit_id, code, name, multiplier) values (o, '00000000-0000-0000-0000-0000000e1001', '00000000-0000-0000-0000-0000000f1001', 'MTR-2', 'Meter lini 1 (CT)', 2) returning id into m2;
  begin insert into energy_meters (org_id, plant_id, unit_id, code, name) values (o, '00000000-0000-0000-0000-0000000e1001', '00000000-0000-0000-0000-0000000f1001', 'MTR-1', 'dup'); assert false; exception when unique_violation then null; end;
  begin insert into energy_meters (org_id, plant_id, unit_id, code, name) values (o, '00000000-0000-0000-0000-0000000e1001', '00000000-0000-0000-0000-0000000f1003', 'MTR-9', 'unit plant lain'); assert false; exception when check_violation then null; end;
  begin insert into energy_meters (org_id, plant_id, unit_id, code, name) values (o, '00000000-0000-0000-0000-0000000e1001', '00000000-0000-0000-0000-0000000f1001', 'bad code!', 'x'); assert false; exception when check_violation then null; end;
  begin insert into energy_meters (org_id, plant_id, unit_id, code, name, multiplier) values (o, '00000000-0000-0000-0000-0000000e1001', '00000000-0000-0000-0000-0000000f1001', 'MTR-0', 'x', 0); assert false; exception when check_violation then null; end;

  -- Asia/Jakarta (+07): 2026-03-10 00:00 lokal = 2026-03-09 17:00 UTC. Meter 1: 1000 kWh sebelum hari 10, +120 pada hari 10, +100 pada hari 11.
  insert into energy_meter_readings (meter_id, ts, kwh, org_id) values
    (m1, '2026-03-09 16:00+00', 1000, o), (m1, '2026-03-10 16:30+00', 1120, o), (m1, '2026-03-11 16:50+00', 1220, o),
    (m2, '2026-03-09 16:00+00', 500,  o), (m2, '2026-03-10 16:30+00', 560,  o), (m2, '2026-03-11 16:50+00', 610,  o);
  n := energy_meter_rollup('00000000-0000-0000-0000-0000000f1001', '2026-03-12', 3);
  assert n = 2, 'dua hari penuh terhitung, hari 9 tanpa data awal dilewati: ' || n;
  assert (select kwh from energy_entries where unit_id = '00000000-0000-0000-0000-0000000f1001' and date_from = '2026-03-10') = 120 + 60 * 2, 'hari 10 = meter1 120 + meter2 60 x multiplier 2';
  assert (select kwh from energy_entries where unit_id = '00000000-0000-0000-0000-0000000f1001' and date_from = '2026-03-11') = 100 + 50 * 2, 'hari 11';
  assert (select count(*) from energy_entries where source = 'meter') = 2;
  assert (select by_user from energy_entries where date_from = '2026-03-10' and source = 'meter') is null;

  -- Idempoten
  assert energy_meter_rollup('00000000-0000-0000-0000-0000000f1001', '2026-03-12', 3) = 2 and (select count(*) from energy_entries where source = 'meter') = 2, 'idempoten';

  -- Data terlambat memperbaiki hari yang tadinya berlubang: tambah pembacaan meter 2 yang sempat hilang (hari 12 baru, rollup hari ini 13)
  insert into energy_meter_readings (meter_id, ts, kwh, org_id) values (m1, '2026-03-12 16:55+00', 1300, o);
  assert energy_meter_rollup('00000000-0000-0000-0000-0000000f1001', '2026-03-13', 3) = 2, 'hari 12 tanpa meter 2 dilewati (celah data), hari 11 tetap';
  assert not exists (select 1 from energy_entries where date_from = '2026-03-12'), 'tidak ada angka palsu saat salah satu meter tidak punya data';
  insert into energy_meter_readings (meter_id, ts, kwh, org_id) values (m2, '2026-03-12 16:55+00', 650, o);
  n := energy_meter_rollup('00000000-0000-0000-0000-0000000f1001', '2026-03-13', 3); assert n = 3 and (select kwh from energy_entries where date_from = '2026-03-12') = 80 + 40 * 2, 'data terlambat melengkapi hari 12';

  -- Meter di-reset (angka mundur): hari dilewati
  insert into energy_meter_readings (meter_id, ts, kwh, org_id) values (m1, '2026-03-13 16:55+00', 5, o), (m2, '2026-03-13 16:55+00', 660, o);
  assert energy_meter_rollup('00000000-0000-0000-0000-0000000f1001', '2026-03-14', 1) = 0 and not exists (select 1 from energy_entries where date_from = '2026-03-13'), 'reset meter tidak menghasilkan angka negatif';

  -- Bentrok dengan entri manual: manual dipertahankan, tidak error
  insert into energy_meters (org_id, plant_id, unit_id, code, name) values (o, '00000000-0000-0000-0000-0000000e1001', '00000000-0000-0000-0000-0000000f1002', 'MTR-B', 'Boiler') returning id into m3;
  insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, kwh) values (o, '00000000-0000-0000-0000-0000000e1001', '00000000-0000-0000-0000-0000000f1002', 'day', '2026-03-10', '2026-03-10', 77);
  insert into energy_meter_readings (meter_id, ts, kwh, org_id) values (m3, '2026-03-09 16:00+00', 10, o), (m3, '2026-03-10 16:50+00', 40, o);
  assert energy_meter_rollup('00000000-0000-0000-0000-0000000f1002', '2026-03-11', 2) = 0 and (select kwh from energy_entries where unit_id = '00000000-0000-0000-0000-0000000f1002' and date_from = '2026-03-10') = 77, 'entri manual menang';

  -- Unit tanpa meter aktif
  assert energy_meter_rollup('00000000-0000-0000-0000-0000000f1003', '2026-03-11', 2) = 0;
  update energy_meters set active = false where id = m3;
  assert energy_meter_rollup('00000000-0000-0000-0000-0000000f1002', '2026-03-11', 2) = 0, 'tanpa meter aktif tidak menghitung';
  assert (select meter_rollup_at from energy_units where code = 'LINE-1') is not null;
end $$;

-- Isolasi: org lain tidak melihat meter; pengguna plant M2 tidak melihat meter plant M1.
select set_config('app.plant_ids', '00000000-0000-0000-0000-0000000e1002', true), set_config('app.all_plants', '0', true) \gset
do $$ begin
  assert (select count(*) from energy_meters) = 0, 'plant M2 tidak melihat meter M1';
  assert (select count(*) from energy_meter_readings) = 0, 'pembacaan ikut terisolasi';
end $$;
select set_config('app.org_id', :'org2', true), set_config('app.all_plants', '1', true) \gset
do $$ begin assert (select count(*) from energy_meters) = 0 and (select count(*) from energy_meter_readings) = 0, 'org lain tidak melihat apa pun'; end $$;
rollback;
select 'meters.sql OK' as hasil;
