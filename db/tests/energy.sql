-- Uji modul Energi: konflik periode, pembagian per hari, tarif, kWh/ton, regresi, anomali, RLS.
\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;
select provision_org('en-uji', 'Energi Uji') as org \gset
select provision_org('en-lain', 'Energi Lain') as org2 \gset
insert into plants (id, org_id, code, name) values ('00000000-0000-0000-0000-0000000ea001', :'org', 'E1', 'Plant E1'), ('00000000-0000-0000-0000-0000000ea002', :'org2', 'E2', 'Plant E2');
insert into energy_units (id, org_id, plant_id, code, name, kind) values
  ('00000000-0000-0000-0000-0000000ea101', :'org', '00000000-0000-0000-0000-0000000ea001', 'L1', 'Lini 1', 'line'),
  ('00000000-0000-0000-0000-0000000ea102', :'org', '00000000-0000-0000-0000-0000000ea001', 'L2', 'Lini 2', 'line'),
  ('00000000-0000-0000-0000-0000000ea103', :'org', '00000000-0000-0000-0000-0000000ea001', 'L3', 'Lini 3', 'line'),
  ('00000000-0000-0000-0000-0000000ea104', :'org', '00000000-0000-0000-0000-0000000ea001', 'U1', 'Boiler', 'utility');
set local session_replication_role = origin;

set local role maintainhub_app;
select set_config('app.org_id', :'org', true), set_config('app.plant_ids', '', true), set_config('app.all_plants', '1', true) \gset
do $$
declare o uuid := current_setting('app.org_id')::uuid; p uuid := '00000000-0000-0000-0000-0000000ea001';
  l1 uuid := '00000000-0000-0000-0000-0000000ea101'; l2 uuid := '00000000-0000-0000-0000-0000000ea102'; l3 uuid := '00000000-0000-0000-0000-0000000ea103'; u1 uuid := '00000000-0000-0000-0000-0000000ea104';
  i int; ton numeric; r record; m text;
begin
  -- L1: kWh = 100 + 10 x ton, 5 hari berturut
  for i in 1..5 loop
    ton := 5 * i;
    insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, kwh, ton) values (o, p, l1, 'day', date '2026-03-01' + i - 1, date '2026-03-01' + i - 1, 100 + 10 * ton, ton);
  end loop;
  select * into r from energy_regression('2026-03-01', '2026-03-05', p) where code = 'L1';
  assert r.days = 5 and r.base_kwh = 100 and r.kwh_per_ton = 10 and r.r2 = 1, 'regresi L1: ' || r::text;
  select * into r from energy_summary('2026-03-01', '2026-03-05', p) where code = 'L1';
  assert r.kwh = 1250 and r.ton = 75 and r.kwh_per_ton = 16.67, 'ringkasan L1 (1250/75): ' || r::text;
  assert r.cost = 0, 'tanpa tarif biaya 0';
  insert into energy_tariffs (org_id, plant_id, valid_from, price_per_kwh) values (o, p, '2026-01-01', 1000), (o, p, '2026-03-04', 1500);
  assert (select cost from energy_summary('2026-03-01', '2026-03-05', p) where code = 'L1') = 600000 + 975000, 'biaya: 3 hari x 1000 + 2 hari x 1500';
  assert energy_tariff_at(p, '2026-02-01') = 1000 and energy_tariff_at(p, '2025-12-31') is null, 'tarif berlaku mulai tanggalnya';

  -- bentrok
  begin insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, kwh, ton) values (o, p, l1, 'day', '2026-03-03', '2026-03-03', 1, 1); assert false; exception when check_violation then m := sqlerrm; end;
  assert m like 'Bentrok%', 'hari ganda ditolak: ' || m;
  begin insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, kwh, ton) values (o, p, l1, 'range', '2026-03-05', '2026-03-08', 1, 1); assert false; exception when check_violation then null; end;
  insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, shift, kwh, ton) values (o, p, l2, 'shift', '2026-03-01', '2026-03-01', 'pagi', 10, 1);
  insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, shift, kwh, ton) values (o, p, l2, 'shift', '2026-03-01', '2026-03-01', 'siang', 10, 1);
  begin insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, shift, kwh, ton) values (o, p, l2, 'shift', '2026-03-01', '2026-03-01', 'pagi', 10, 1); assert false; exception when check_violation then null; end;
  begin insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, kwh, ton) values (o, p, l2, 'day', '2026-03-01', '2026-03-01', 10, 1); assert false; exception when check_violation then null; end;
  insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, po_code, kwh, ton) values (o, p, l3, 'po', '2026-03-01', '2026-03-04', 'PO-1', 400, 80);
  insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, po_code, kwh, ton) values (o, p, l3, 'po', '2026-03-03', '2026-03-06', 'PO-2', 200, 40);
  begin insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, kwh, ton) values (o, p, l3, 'range', '2026-03-02', '2026-03-02', 1, 1); assert false; exception when check_violation then null; end;
  -- bentuk tidak valid
  begin insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, kwh) values (o, p, l3, 'day', '2026-04-01', '2026-04-02', 1); assert false; exception when check_violation then null; end;
  begin insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, kwh) values (o, p, l3, 'shift', '2026-04-01', '2026-04-01', 1); assert false; exception when check_violation then null; end;
  begin insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, kwh, ton) values (o, p, u1, 'day', '2026-04-01', '2026-04-01', 1, 1); assert false; exception when check_violation then null; end;
  begin insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, kwh) values (o, p, l3, 'day', '2026-04-01', '2026-04-01', -5); assert false; exception when check_violation then null; end;

  -- PO dibagi per hari: PO-1 = 100 kWh/hari 4 hari; PO-2 = 50/hari 4 hari; hari 3-4 keduanya
  assert (select kwh from energy_daily('2026-03-01', '2026-03-06', p, l3) where day = '2026-03-03') = 150, 'hari 3 = 100 + 50';
  assert (select sum(kwh) from energy_daily('2026-03-01', '2026-03-06', p, l3)) = 600, 'total PO 600';
  assert (select sum(kwh) from energy_daily('2026-03-03', '2026-03-04', p, l3)) = 300, 'dipotong ke jendela: 2 hari x 150';
  assert (select count(*) from energy_daily('2026-03-01', '2026-03-06', p, l3)) = 6, 'enam hari';

  -- anomali: L2 10 hari model 50 + 5 x ton, satu hari melonjak
  for i in 11..20 loop
    ton := 10 + (i % 5) * 4;
    insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, kwh, ton) values (o, p, l2, 'day', date '2026-03-01' + i - 1, date '2026-03-01' + i - 1, 50 + 5 * ton + (case when i = 15 then 300 else 0 end), ton);
  end loop;
  assert (select count(*) from energy_anomalies('2026-03-11', '2026-03-20', p, 2)) = 1, 'satu hari anomali: ' || (select count(*) from energy_anomalies('2026-03-11', '2026-03-20', p, 2));
  assert (select day from energy_anomalies('2026-03-11', '2026-03-20', p, 2)) = '2026-03-15', 'anomali di 15 Maret';
  assert (select count(*) from energy_anomalies('2026-03-01', '2026-03-05', p, 2)) = 0, 'L1 (model sempurna, <7 hari) tidak ada anomali';

  -- utilitas: 8 hari 100 kWh, 1 hari 500
  for i in 1..9 loop
    insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, kwh) values (o, p, u1, 'day', date '2026-05-01' + i - 1, date '2026-05-01' + i - 1, case when i = 5 then 500 else 100 end);
  end loop;
  assert (select count(*) from energy_anomalies('2026-05-01', '2026-05-09', p, 2)) = 1 and (select day from energy_anomalies('2026-05-01', '2026-05-09', p, 2)) = '2026-05-05', 'anomali utilitas';
  assert (select kwh_per_ton from energy_summary('2026-05-01', '2026-05-09', p) where code = 'U1') is null, 'utilitas tanpa kWh/ton';
  assert (select share_pct from energy_summary('2026-05-01', '2026-05-09', p) where code = 'U1') = 100, 'pangsa 100% bila sendirian';
  assert (select count(*) from energy_trend(12, p)) = 12, 'tren 12 bulan';
  assert (select count(*) from energy_regression('2026-05-01', '2026-05-09', p)) = 0, 'utilitas tidak punya regresi';
  -- unit nonaktif ditolak
  update energy_units set active = false where id = l3;
  begin insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, kwh) values (o, p, l3, 'day', '2026-07-01', '2026-07-01', 1); assert false; exception when check_violation then null; end;
end $$;

select set_config('app.org_id', :'org2', true) \gset
do $$ begin
  assert (select count(*) from energy_entries) = 0 and (select count(*) from energy_units) = 0 and (select count(*) from energy_tariffs) = 0, 'RLS energi bocor';
  assert (select count(*) from energy_daily('2026-01-01', '2026-12-31')) = 0, 'fungsi harian ikut RLS';
  begin insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, kwh) values (current_setting('app.org_id')::uuid, '00000000-0000-0000-0000-0000000ea002', '00000000-0000-0000-0000-0000000ea101', 'day', '2026-03-01', '2026-03-01', 1); assert false; exception when others then null; end;
end $$;
rollback;
\echo UJI ENERGI LULUS
