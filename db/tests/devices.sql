-- Uji perangkat terdaftar: isolasi org/plant, unik device_id, batas nilai, heartbeat.
\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;
select provision_org('dv-uji', 'Perangkat Uji') as org \gset
select provision_org('dv-lain', 'Perangkat Lain') as org2 \gset
insert into plants (id, org_id, code, name) values ('00000000-0000-0000-0000-0000000c1001', :'org', 'D1', 'Plant D1'), ('00000000-0000-0000-0000-0000000c1002', :'org', 'D2', 'Plant D2');
insert into assets (id, org_id, plant_id, code, name, asset_type) values
 ('00000000-0000-0000-0000-0000000d1001', :'org', '00000000-0000-0000-0000-0000000c1001', 'PMP-D1', 'Pompa D1', 'equipment'),
 ('00000000-0000-0000-0000-0000000d1002', :'org', '00000000-0000-0000-0000-0000000c1002', 'PMP-D2', 'Pompa D2', 'equipment');
set local session_replication_role = origin;

set local role maintainhub_app;
select set_config('app.org_id', :'org', true), set_config('app.plant_ids', '', true), set_config('app.all_plants', '1', true) \gset
do $$
declare o uuid := (select org_id from plants where code = 'D1');
begin
  insert into ingest_devices (org_id, plant_id, asset_id, device_id, name, sensors) values
    (o, '00000000-0000-0000-0000-0000000c1001', '00000000-0000-0000-0000-0000000d1001', 'esp-a1b2c3', 'ESP Pompa D1', '{oil_temp,running_hours}'),
    (o, '00000000-0000-0000-0000-0000000c1002', '00000000-0000-0000-0000-0000000d1002', 'esp-d4e5f6', 'ESP Pompa D2', '{}');
  begin insert into ingest_devices (org_id, plant_id, asset_id, device_id, name) values (o, '00000000-0000-0000-0000-0000000c1001', '00000000-0000-0000-0000-0000000d1001', 'esp-a1b2c3', 'dup'); assert false; exception when unique_violation then null; end;
  begin insert into ingest_devices (org_id, plant_id, asset_id, device_id, name) values (o, '00000000-0000-0000-0000-0000000c1001', '00000000-0000-0000-0000-0000000d1001', 'a b', 'x'); assert false; exception when check_violation then null; end;
  begin insert into ingest_devices (org_id, plant_id, asset_id, device_id, name, rssi) values (o, '00000000-0000-0000-0000-0000000c1001', '00000000-0000-0000-0000-0000000d1001', 'esp-zzzz', 'x', 20); assert false; exception when check_violation then null; end;
  -- aset dari plant lain tidak boleh dipasangkan ke plant ini lewat FK gabungan (org, asset) tetap sah, tetapi plant harus ada
  update ingest_devices set rssi = -61, uptime_s = 90, readings_total = readings_total + 4, last_seen = now() where device_id = 'esp-a1b2c3';
  assert (select readings_total from ingest_devices where device_id = 'esp-a1b2c3') = 4, 'heartbeat menambah total';
  assert (select count(*) from ingest_devices) = 2, 'admin (semua plant) melihat 2';
end $$;
select set_config('app.plant_ids', '00000000-0000-0000-0000-0000000c1001', true), set_config('app.all_plants', '0', true) \gset
do $$ begin
  assert (select count(*) from ingest_devices) = 1, 'terbatas plant: 1';
  assert not exists (select 1 from ingest_devices where device_id = 'esp-d4e5f6'), 'plant lain tidak terlihat';
end $$;
select set_config('app.org_id', :'org2', true), set_config('app.all_plants', '1', true) \gset
do $$ begin assert (select count(*) from ingest_devices) = 0, 'org lain: 0'; end $$;
rollback;
\echo devices.sql OK
