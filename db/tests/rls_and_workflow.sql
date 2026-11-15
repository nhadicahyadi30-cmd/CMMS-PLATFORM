-- Uji integrasi skema. Jalankan setelah migrasi + seed, sebagai superuser; blok memakai SET ROLE maintainhub_app.
\set ON_ERROR_STOP on
\set org1 '00000000-0000-0000-0000-0000000000a1'
\set p1 '00000000-0000-0000-0000-0000000000b1'

create or replace function pg_temp.expect_fail(sql text, pat text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'DIPERKIRAKAN GAGAL tetapi berhasil: %', sql;
exception when others then
  if sqlerrm like 'DIPERKIRAKAN GAGAL%' then raise; end if;
  if sqlerrm not ilike '%'||pat||'%' then raise exception 'pesan salah untuk [%]: %', sql, sqlerrm; end if;
end $$;
grant execute on function pg_temp.expect_fail(text,text) to public;

-- 1. Isolasi tenant + plant (user P1 saja)
begin;
set local role maintainhub_app;
select set_config('app.org_id', :'org1', true), set_config('app.plant_ids', :'p1', true), set_config('app.all_plants','0', true) \gset
do $$ begin
  assert (select count(*) from assets) = 1, 'user P1 hanya boleh melihat 1 aset';
  assert (select count(*) from plants) = 1, 'user P1 hanya melihat plant 1';
  assert (select count(*) from users) = 4, 'user org1 melihat 4 user (bukan tenant lain)';
end $$;
select pg_temp.expect_fail($q$insert into assets (org_id, plant_id, code, name, asset_type) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b2','ZZ','x','equipment')$q$, 'row-level security');
select set_config('app.org_id','',true) \gset
do $$ begin assert (select count(*) from assets) = 0, 'tanpa konteks tidak boleh melihat data'; end $$;
select set_config('app.org_id', :'org1', true), set_config('app.all_plants','1', true) \gset
do $$ begin assert (select count(*) from assets) = 2, 'admin melihat 2 aset org1'; end $$;
rollback;

-- 2. Alur WO
begin;
set local role maintainhub_app;
select set_config('app.org_id', :'org1', true), set_config('app.plant_ids', :'p1', true), set_config('app.all_plants','0', true) \gset
do $$
declare w uuid; c text;
begin
  insert into work_orders (org_id, plant_id, wo_type, title, asset_id, priority, status, approved_by)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','breakdown','Mixer macet',
          '00000000-0000-0000-0000-0000000000e1','P1','approved','00000000-0000-0000-0000-0000000000c2') returning id, code into w, c;
  assert (select status from work_orders where id=w) = 'waiting', 'status awal dipaksa waiting';
  assert c ~ '^WO-P1-[0-9]{4}-0001$', 'format kode WO: '||c;
  assert (select sla_resolve_due - created_at from work_orders where id=w) = interval '4 hours', 'SLA P1 4 jam';
  perform pg_temp.expect_fail(format($q$update work_orders set status='approved', approved_by='00000000-0000-0000-0000-0000000000c3' where id='%s'$q$, w), 'Supervisor');
  perform pg_temp.expect_fail(format($q$update work_orders set status='progress' where id='%s'$q$, w), 'Transisi');
  update work_orders set status='approved', approved_by='00000000-0000-0000-0000-0000000000c2' where id=w;
  perform pg_temp.expect_fail(format($q$update work_orders set status='assigned' where id='%s'$q$, w), 'Teknisi wajib');
  update work_orders set status='assigned', technician_id='00000000-0000-0000-0000-0000000000d1' where id=w;
  update work_orders set status='progress' where id=w;
  perform pg_temp.expect_fail(format($q$update work_orders set status='done' where id='%s'$q$, w), 'work_orders_check1');
  update work_orders set status='done', actual_hours=1.5 where id=w;
  update work_orders set status='closed', closed_by='00000000-0000-0000-0000-0000000000c2' where id=w;
  perform pg_temp.expect_fail(format($q$update work_orders set title='ubah' where id='%s'$q$, w), 'tidak dapat diubah');
  insert into work_orders (org_id, plant_id, wo_type, title, asset_id, priority)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','corrective','Cek','00000000-0000-0000-0000-0000000000e1','P3') returning code into c;
  assert c ~ '-0002$', 'kode kedua berurutan: '||c;
  perform pg_temp.expect_fail($q$insert into work_orders (org_id, plant_id, wo_type, title, asset_id, priority) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','corrective','x','00000000-0000-0000-0000-0000000000e2','P3')$q$, 'plant');
  insert into wo_logs (org_id, wo_id, text) values ('00000000-0000-0000-0000-0000000000a1', w, 'uji');
  perform pg_temp.expect_fail(format($q$update wo_logs set text='x' where wo_id='%s'$q$, w), 'permission denied');
end $$;
rollback;

-- 3. Hirarki aset tanpa siklus, meter monoton, PM
begin;
do $$
begin
  insert into assets (id, org_id, plant_id, parent_id, code, name, asset_type)
   values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e1','C1','Motor','component');
  perform pg_temp.expect_fail($q$update assets set parent_id='00000000-0000-0000-0000-0000000000f1' where id='00000000-0000-0000-0000-0000000000e1'$q$, 'siklus');
  assert (select criticality_class from assets where id='00000000-0000-0000-0000-0000000000e1') = 'A', 'skor 15 => kelas A';
  insert into asset_meters (id, org_id, asset_id) values ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1');
  insert into meter_readings (meter_id, value) values ('00000000-0000-0000-0000-0000000000f2', 100);
  perform pg_temp.expect_fail($q$insert into meter_readings (meter_id, value) values ('00000000-0000-0000-0000-0000000000f2', 90)$q$, 'lebih kecil');
  insert into pm_plans (id, org_id, plant_id, asset_id, name, trigger_type, interval_days, next_due)
   values ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e1','Pelumasan','calendar',30,current_date+2);
  assert pm_generate('00000000-0000-0000-0000-0000000000a1') = 1, 'generator membuat 1 WO';
  assert pm_generate('00000000-0000-0000-0000-0000000000a1') = 0, 'generator idempoten';
  assert (select status from work_orders where pm_plan_id='00000000-0000-0000-0000-0000000000f3') = 'waiting', 'WO PM menunggu approval';
  update work_orders set status='approved', approved_by='00000000-0000-0000-0000-0000000000c2' where pm_plan_id='00000000-0000-0000-0000-0000000000f3';
  update work_orders set status='assigned', technician_id='00000000-0000-0000-0000-0000000000d1' where pm_plan_id='00000000-0000-0000-0000-0000000000f3';
  update work_orders set status='progress' where pm_plan_id='00000000-0000-0000-0000-0000000000f3';
  update work_orders set status='done', actual_hours=1 where pm_plan_id='00000000-0000-0000-0000-0000000000f3';
  update work_orders set status='closed', closed_by='00000000-0000-0000-0000-0000000000c2' where pm_plan_id='00000000-0000-0000-0000-0000000000f3';
  assert (select next_due from pm_plans where id='00000000-0000-0000-0000-0000000000f3') = current_date + 30, 'jadwal PM maju 30 hari';
  assert (select count(*) from pm_completions) = 1, 'penyelesaian PM tercatat';
end $$;
rollback;

-- 4. audit_log append-only
begin;
insert into audit_log (org_id, event) values ('00000000-0000-0000-0000-0000000000a1','uji');
do $$ begin perform pg_temp.expect_fail($q$delete from audit_log$q$, 'append'); end $$;
rollback;
\echo SEMUA UJI LULUS
