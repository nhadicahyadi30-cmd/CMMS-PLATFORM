-- Uji telemetri: isolasi org/plant, role auth sempit, satu alarm aktif per sensor, batas nilai.
\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;
select provision_org('tl-uji', 'Telemetri Uji') as org \gset
select provision_org('tl-lain', 'Telemetri Lain') as org2 \gset
insert into plants (id, org_id, code, name) values ('00000000-0000-0000-0000-0000000cc001', :'org', 'T1', 'Plant T1'), ('00000000-0000-0000-0000-0000000cc002', :'org', 'T2', 'Plant T2');
insert into assets (id, org_id, plant_id, code, name, asset_type) values
 ('00000000-0000-0000-0000-0000000dd001', :'org', '00000000-0000-0000-0000-0000000cc001', 'PMP-1', 'Pompa 1', 'equipment'),
 ('00000000-0000-0000-0000-0000000dd002', :'org', '00000000-0000-0000-0000-0000000cc002', 'PMP-2', 'Pompa 2', 'equipment');
set local session_replication_role = origin;

set local role maintainhub_app;
select set_config('app.org_id', :'org', true), set_config('app.plant_ids', '', true), set_config('app.all_plants', '1', true) \gset
do $$
declare tg uuid; tg2 uuid; a1 uuid;
begin
  insert into sensor_tags (org_id, plant_id, asset_id, tag, name, unit, warn_high, crit_high, min_valid, max_valid)
    values ((select org_id from plants where code='T1'), '00000000-0000-0000-0000-0000000cc001', '00000000-0000-0000-0000-0000000dd001', 'oil_temp', 'Suhu oli', '°C', 85, 95, -20, 200) returning id into tg;
  insert into sensor_tags (org_id, plant_id, asset_id, tag, name) values ((select org_id from plants where code='T2'), '00000000-0000-0000-0000-0000000cc002', '00000000-0000-0000-0000-0000000dd002', 'oil_temp', 'Suhu oli') returning id into tg2;
  -- tag tidak valid & batas terbalik ditolak
  begin insert into sensor_tags (org_id, plant_id, asset_id, tag, name) values ((select org_id from plants where code='T1'), '00000000-0000-0000-0000-0000000cc001', '00000000-0000-0000-0000-0000000dd001', 'Oil Temp!', 'x'); assert false; exception when check_violation then null; end;
  begin insert into sensor_tags (org_id, plant_id, asset_id, tag, name, warn_high, crit_high) values ((select org_id from plants where code='T1'), '00000000-0000-0000-0000-0000000cc001', '00000000-0000-0000-0000-0000000dd001', 'x1', 'x', 90, 80); assert false; exception when check_violation then null; end;
  -- duplikat tag per aset ditolak
  begin insert into sensor_tags (org_id, plant_id, asset_id, tag, name) values ((select org_id from plants where code='T1'), '00000000-0000-0000-0000-0000000cc001', '00000000-0000-0000-0000-0000000dd001', 'oil_temp', 'dup'); assert false; exception when unique_violation then null; end;
  insert into sensor_readings (tag_id, ts, value, org_id) values (tg, now(), 80, (select org_id from plants where code='T1')), (tg, now() - interval '1 minute', 79, (select org_id from plants where code='T1'));
  begin insert into sensor_readings (tag_id, ts, value, org_id) values (tg, now(), 81, (select org_id from plants where code='T1')); assert false; exception when unique_violation then null; end;
  assert (select count(*) from sensor_readings) = 2, 'pembacaan tersimpan';
  -- satu alarm aktif per sensor
  insert into alarms (org_id, plant_id, asset_id, severity, message, source, sensor_tag_id) values ((select org_id from plants where code='T1'), '00000000-0000-0000-0000-0000000cc001', '00000000-0000-0000-0000-0000000dd001', 'warning', 'Suhu oli tinggi', 'api', tg) returning id into a1;
  begin insert into alarms (org_id, plant_id, asset_id, severity, message, source, sensor_tag_id) values ((select org_id from plants where code='T1'), '00000000-0000-0000-0000-0000000cc001', '00000000-0000-0000-0000-0000000dd001', 'critical', 'dup', 'api', tg); assert false; exception when unique_violation then null; end;
  update alarms set severity = 'critical' where id = a1;           -- eskalasi diizinkan
  update alarms set status = 'closed' where id = a1;
  insert into alarms (org_id, plant_id, asset_id, severity, message, source, sensor_tag_id) values ((select org_id from plants where code='T1'), '00000000-0000-0000-0000-0000000cc001', '00000000-0000-0000-0000-0000000dd001', 'warning', 'Suhu oli tinggi lagi', 'api', tg);  -- setelah ditutup boleh lagi
end $$;

-- SQL yang dipakai API: upsert alarm per sensor (eskalasi warning->critical, tidak menumpuk), meter jam operasi dengan throttle
do $$
declare tg uuid; o uuid; r record; m uuid; n int;
begin
  select id, org_id into tg, o from sensor_tags where tag = 'oil_temp' and plant_id = '00000000-0000-0000-0000-0000000cc001';
  update alarms set status = 'closed' where sensor_tag_id = tg and status <> 'closed';
  -- 1) pertama: warning dibuat
  with x as (insert into alarms (org_id, plant_id, asset_id, severity, message, source, sensor_tag_id) values (o, '00000000-0000-0000-0000-0000000cc001', '00000000-0000-0000-0000-0000000dd001', 'warning', 'msg', 'api', tg)
    on conflict (sensor_tag_id) where sensor_tag_id is not null and status <> 'closed' do update set severity = excluded.severity where alarms.severity = 'warning' and excluded.severity = 'critical' returning (xmax = 0) as inserted) select * into r from x;
  assert r.inserted, 'alarm baru';
  -- 2) warning lagi: tidak ada perubahan (tidak ada baris dikembalikan)
  with x as (insert into alarms (org_id, plant_id, asset_id, severity, message, source, sensor_tag_id) values (o, '00000000-0000-0000-0000-0000000cc001', '00000000-0000-0000-0000-0000000dd001', 'warning', 'msg2', 'api', tg)
    on conflict (sensor_tag_id) where sensor_tag_id is not null and status <> 'closed' do update set severity = excluded.severity where alarms.severity = 'warning' and excluded.severity = 'critical' returning (xmax = 0) as inserted) select count(*) into n from x;
  assert n = 0, 'tidak menumpuk';
  -- 3) critical: eskalasi (inserted = false)
  with x as (insert into alarms (org_id, plant_id, asset_id, severity, message, source, sensor_tag_id) values (o, '00000000-0000-0000-0000-0000000cc001', '00000000-0000-0000-0000-0000000dd001', 'critical', 'msg3', 'api', tg)
    on conflict (sensor_tag_id) where sensor_tag_id is not null and status <> 'closed' do update set severity = excluded.severity where alarms.severity = 'warning' and excluded.severity = 'critical' returning (xmax = 0) as inserted) select * into r from x;
  assert r.inserted = false, 'eskalasi';
  assert (select count(*) from alarms where sensor_tag_id = tg and status <> 'closed') = 1 and (select severity from alarms where sensor_tag_id = tg and status <> 'closed') = 'critical';
  -- meter jam operasi: dibuat otomatis, throttle 10 menit, monotonik
  insert into asset_meters (org_id, asset_id, name, unit) values (o, '00000000-0000-0000-0000-0000000dd001', 'running_hours', 'jam') on conflict (asset_id, name) do update set unit = asset_meters.unit returning id into m;
  insert into asset_meters (org_id, asset_id, name, unit) values (o, '00000000-0000-0000-0000-0000000dd001', 'running_hours', 'jam') on conflict (asset_id, name) do update set unit = asset_meters.unit;
  assert (select count(*) from asset_meters where asset_id = '00000000-0000-0000-0000-0000000dd001') = 1, 'satu meter';
  insert into meter_readings (meter_id, value, read_at, source) select m, 100, now() - interval '30 minutes', 'iot' where not exists (select 1 from meter_readings where meter_id = m and read_at > (now() - interval '30 minutes') - interval '10 minutes');
  insert into meter_readings (meter_id, value, read_at, source) select m, 100.5, now() - interval '25 minutes', 'iot' where not exists (select 1 from meter_readings where meter_id = m and read_at > (now() - interval '25 minutes') - interval '10 minutes');  -- dilewati (throttle)
  insert into meter_readings (meter_id, value, read_at, source) select m, 101, now(), 'iot' where not exists (select 1 from meter_readings where meter_id = m and read_at > now() - interval '10 minutes');
  assert (select count(*) from meter_readings where meter_id = m) = 2, 'throttle meter';
  begin insert into meter_readings (meter_id, value, read_at, source) values (m, 50, now() + interval '1 minute', 'iot'); assert false; exception when check_violation then null; end;   -- nilai turun ditolak
end $$;

-- kunci API: pembuat plant-terbatas hanya melihat kunci plantnya; org lain tidak melihat apa pun
insert into ingest_keys (org_id, plant_id, name, secret_hash) values (:'org', '00000000-0000-0000-0000-0000000cc001', 'NR plant 1', 'h1'), (:'org', null, 'NR semua', 'h2');
select set_config('app.plant_ids', '00000000-0000-0000-0000-0000000cc001', true), set_config('app.all_plants', '0', true) \gset
do $$ begin
  assert (select count(*) from ingest_keys) = 2, 'plant 1 melihat kunci plantnya + kunci semua plant';
  assert (select count(*) from sensor_tags) = 1, 'hanya tag plant 1';
  assert (select count(*) from sensor_readings) = 2, 'hanya pembacaan plant 1';
end $$;
select set_config('app.org_id', :'org2', true), set_config('app.plant_ids', '', true), set_config('app.all_plants', '1', true) \gset
do $$ begin
  assert (select count(*) from ingest_keys) = 0 and (select count(*) from sensor_tags) = 0 and (select count(*) from sensor_readings) = 0, 'org lain tidak melihat telemetri';
  begin insert into sensor_readings (tag_id, ts, value, org_id) values ('00000000-0000-0000-0000-000000000000', now(), 1, '00000000-0000-0000-0000-000000000000'); assert false, 'tag fiktif ditolak'; exception when assert_failure then raise; when others then null; end;
end $$;

-- role auth: hanya baca kunci + sentuh last_used_at
reset role; set local role maintainhub_auth;
do $$ begin
  assert (select count(*) from ingest_keys) = 2, 'auth membaca kunci lintas org';
  update ingest_keys set last_used_at = now();
  begin update ingest_keys set secret_hash = 'x'; assert false; exception when insufficient_privilege then null; end;
  begin update ingest_keys set active = false; assert false; exception when insufficient_privilege then null; end;
  begin perform count(*) from sensor_readings; assert false; exception when insufficient_privilege then null; end;
  begin perform count(*) from sensor_tags; assert false; exception when insufficient_privilege then null; end;
end $$;
rollback;
\echo UJI TELEMETRI LULUS
