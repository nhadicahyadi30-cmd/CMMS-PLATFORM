-- Uji rumus KPI dengan data yang jawabannya dihitung manual. Jalankan setelah migrasi (tidak butuh seed).
\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;   -- sisipkan data historis tanpa memicu trigger alur WO
select provision_org('kpi-uji', 'KPI Uji') as org \gset
insert into plants (id, org_id, code, name) values ('00000000-0000-0000-0000-0000000fa001', :'org', 'K1', 'Plant K1');
insert into assets (id, org_id, plant_id, code, name, asset_type) values
  ('00000000-0000-0000-0000-0000000fa101', :'org', '00000000-0000-0000-0000-0000000fa001', 'A1', 'Mesin A1', 'equipment'),
  ('00000000-0000-0000-0000-0000000fa102', :'org', '00000000-0000-0000-0000-0000000fa001', 'A2', 'Mesin A2', 'equipment');
insert into technicians (id, org_id, plant_id, code, full_name, skill, shift, hourly_rate) values
  ('00000000-0000-0000-0000-0000000fa201', :'org', '00000000-0000-0000-0000-0000000fa001', 'TK1', 'Teknisi K1', 'Mekanik', 'pagi', 50000);
create temp table _w (n int, typ text, asset text, st text, act numeric, dt numeric, created date, done date, pm date, sla timestamptz);
insert into _w values
 (1,'breakdown','a101','done', 3, 4, '2026-01-03','2026-01-03', null, '2026-01-03 23:00+07'),
 (2,'breakdown','a101','done', 1, 2, '2026-01-05','2026-01-05', null, '2026-01-05 01:00+07'),
 (3,'corrective','a102','done', 2, 0, '2026-01-07','2026-01-07', null, null),
 (4,'preventive','a101','done', 1, 0, '2026-01-02','2026-01-05', '2026-01-04', null),
 (5,'preventive','a102','done', 1, 0, '2026-01-02','2026-01-12', '2026-01-08', null),
 (6,'breakdown','a102','done', 5, 9, '2026-02-01','2026-02-01', null, null),
 (7,'corrective','a101','progress', null, 0, '2026-01-01', null, null, '2026-01-02 00:00+07');
insert into work_orders (id, org_id, plant_id, code, wo_type, title, asset_id, priority, status, technician_id, actual_hours, downtime_hours, created_at, done_at, pm_due, sla_resolve_due)
select ('00000000-0000-0000-0000-0000000fa3' || lpad(n::text, 2, '0'))::uuid, :'org', '00000000-0000-0000-0000-0000000fa001', 'WO-K1-' || n, typ, 'uji ' || n,
       ('00000000-0000-0000-0000-0000000fa1' || right(asset, 2))::uuid, 'P3', st, '00000000-0000-0000-0000-0000000fa201', act, dt,
       (created::timestamp at time zone 'Asia/Jakarta'), (done::timestamp + interval '12 hours') at time zone 'Asia/Jakarta', pm, sla
  from _w;
insert into parts (id, org_id, plant_id, code, name) values ('00000000-0000-0000-0000-0000000fa401', :'org', '00000000-0000-0000-0000-0000000fa001', 'PX', 'Part X');
insert into stock_tx (org_id, plant_id, part_id, kind, qty, delta, unit_cost, wo_id, at) values
  (:'org', '00000000-0000-0000-0000-0000000fa001', '00000000-0000-0000-0000-0000000fa401', 'out', 2, -2, 10000, '00000000-0000-0000-0000-0000000fa301', '2026-01-03 12:00+07'),
  (:'org', '00000000-0000-0000-0000-0000000fa001', '00000000-0000-0000-0000-0000000fa401', 'return', 1, 1, 10000, '00000000-0000-0000-0000-0000000fa301', '2026-01-04 12:00+07');
set local session_replication_role = origin;

set local role maintainhub_app;
select set_config('app.org_id', :'org', true), set_config('app.plant_ids', '', true), set_config('app.all_plants', '1', true) \gset
do $$
declare k record; p uuid := '00000000-0000-0000-0000-0000000fa001';
begin
  select * into k from kpi_overview('2026-01-01', '2026-01-10', p);
  assert k.days = 10 and k.equipment = 2 and k.sched_hours = 480, 'jam terjadwal 2 x 24 x 10 = 480, dapat ' || k.sched_hours;
  assert k.downtime_h = 6, 'downtime 6, dapat ' || k.downtime_h;
  assert k.breakdowns = 2, 'breakdown 2';
  assert k.availability_pct = 98.75, 'availability 98,75, dapat ' || k.availability_pct;
  assert k.mttr_h = 2.00, 'MTTR 2,0, dapat ' || k.mttr_h;
  assert k.mtbf_h = 237.0, 'MTBF 237, dapat ' || k.mtbf_h;
  assert k.pm_due = 2 and k.pm_ontime = 1 and k.pm_compliance_pct = 50.0, 'PM 1 dari 2';
  assert k.wo_done = 4, 'WO selesai di periode = 4, dapat ' || k.wo_done;
  assert k.sla_done = 2 and k.sla_met = 1 and k.sla_pct = 50.0, 'SLA 1 dari 2';
  assert k.backlog = 1 and k.backlog_overdue = 1, 'backlog 1 terlambat: ' || k.backlog || '/' || k.backlog_overdue;
  assert k.parts_cost = 10000, 'biaya suku cadang netto 10.000, dapat ' || k.parts_cost;
  assert k.labor_cost = 350000, 'biaya tenaga kerja 7 jam x 50.000, dapat ' || k.labor_cost;
  -- periode tanpa data: tidak error, rasio NULL
  select * into k from kpi_overview('2025-01-01', '2025-01-10', p);
  assert k.breakdowns = 0 and k.mtbf_h is null and k.mttr_h is null and k.pm_compliance_pct is null and k.availability_pct = 100, 'periode kosong';
  assert (select count(*) from kpi_pareto('2026-01-01', '2026-01-10', p)) = 1, 'pareto hanya aset ber-downtime';
  assert (select cum_pct from kpi_pareto('2026-01-01', '2026-01-10', p)) = 100, 'kumulatif 100';
  assert (select n from kpi_backlog(p) where bucket = '> 30 hari') = 1, 'backlog > 30 hari';
  assert (select overdue from kpi_backlog(p) where bucket = '> 30 hari') = 1, 'overdue SLA';
  assert (select done from kpi_technicians('2026-01-01', '2026-01-10', p)) = 4, 'teknisi menyelesaikan 4';
  assert (select hours from kpi_technicians('2026-01-01', '2026-01-10', p)) = 7, 'teknisi 7 jam';
  assert (select total_cost from kpi_cost_assets('2026-01-01', '2026-01-10', p) where code = 'A1') = 260000, 'biaya aset A1';
  assert (select count(*) from kpi_trend(12, p)) = 12, 'tren 12 bulan';
end $$;
-- isolasi: konteks tenant lain tidak melihat data ini
select set_config('app.org_id', '00000000-0000-0000-0000-0000000000a1', true) \gset
do $$ begin assert (select breakdowns from kpi_overview('2026-01-01', '2026-01-10', null)) = 0, 'tenant lain tidak melihat data KPI'; end $$;
rollback;
\echo UJI KPI LULUS
