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
-- 5. provision_org menyiapkan akses modul + SLA bawaan
begin;
do $$ declare o uuid := provision_org('uji-provision','Uji'); begin
  assert (select count(*) from role_modules where org_id=o and role_code='admin') = 10, 'admin 10 modul';
  assert (select count(*) from role_modules where org_id=o and role_code='technician') = 4, 'teknisi 4 modul';
  assert (select count(*) from sla_policies where org_id=o) = 4, '4 kebijakan SLA';
end $$;
rollback;
-- 6. inventory: stok hanya lewat mutasi, tidak boleh minus, PR perlu Supervisor
begin;
set local role maintainhub_app;
select set_config('app.org_id', :'org1', true), set_config('app.plant_ids', :'p1', true), set_config('app.all_plants','0', true) \gset
do $$
declare pid uuid; w uuid; pr uuid;
begin
  insert into parts (id, org_id, plant_id, code, name, min_stock, unit_cost) values ('00000000-0000-0000-0000-00000000bb01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','BRG-6205','Bearing 6205', 5, 25000) returning id into pid;
  perform pg_temp.expect_fail($q$update parts set on_hand = 999 where code = 'BRG-6205'$q$, 'mutasi stok');
  perform pg_temp.expect_fail($q$insert into parts (org_id, plant_id, code, name, on_hand) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','X','x', 5)$q$, 'Stok awal');
  insert into stock_tx (org_id, plant_id, part_id, kind, qty, unit_cost, note) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1', pid, 'in', 10, 26000, 'terima awal');
  assert (select on_hand from parts where id = pid) = 10, 'stok 10 setelah penerimaan';
  assert (select unit_cost from parts where id = pid) = 26000, 'harga terakhir diperbarui';
  perform pg_temp.expect_fail(format($q$insert into stock_tx (org_id, plant_id, part_id, kind, qty) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','%s','out', 11)$q$, pid), 'tidak cukup');
  -- WO belum disetujui tidak boleh menerima suku cadang
  insert into work_orders (id, org_id, plant_id, wo_type, title, asset_id, priority) values ('00000000-0000-0000-0000-00000000bb02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','corrective','x','00000000-0000-0000-0000-0000000000e1','P3') returning id into w;
  perform pg_temp.expect_fail(format($q$insert into stock_tx (org_id, plant_id, part_id, kind, qty, wo_id) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','%s','out', 1, '%s')$q$, pid, w), 'berstatus waiting');
  update work_orders set status='approved', approved_by='00000000-0000-0000-0000-0000000000c2' where id = w;
  insert into stock_tx (org_id, plant_id, part_id, kind, qty, wo_id) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1', pid, 'out', 4, w);
  assert (select on_hand from parts where id = pid) = 6, 'stok 6 setelah keluar 4';
  assert (select unit_cost from stock_tx where wo_id = w) = 26000, 'biaya WO memakai harga saat itu';
  insert into stock_tx (org_id, plant_id, part_id, kind, qty, wo_id) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1', pid, 'return', 1, w);
  assert (select on_hand from parts where id = pid) = 7, 'retur menambah stok';
  perform pg_temp.expect_fail(format($q$insert into stock_tx (org_id, plant_id, part_id, kind, qty) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','%s','adjust', -1)$q$, pid), 'stock_tx_check1');
  insert into stock_tx (org_id, plant_id, part_id, kind, qty, note) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1', pid, 'adjust', -2, 'opname: rusak');
  assert (select on_hand from parts where id = pid) = 5, 'penyesuaian -2';
  perform pg_temp.expect_fail($q$update stock_tx set qty = 1$q$, 'permission denied');
  -- PR
  insert into purchase_requests (org_id, plant_id, requested_by) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c3') returning id into pr;
  assert (select code from purchase_requests where id = pr) ~ '^PR-P1-[0-9]{4}-0001$', 'kode PR';
  perform pg_temp.expect_fail(format($q$update purchase_requests set status='submitted' where id='%s'$q$, pr), 'tanpa item');
  insert into pr_items (org_id, pr_id, part_id, qty) values ('00000000-0000-0000-0000-0000000000a1', pr, pid, 20);
  update purchase_requests set status='submitted' where id = pr;
  perform pg_temp.expect_fail(format($q$insert into pr_items (org_id, pr_id, part_id, qty) values ('00000000-0000-0000-0000-0000000000a1','%s','%s',1)$q$, pr, pid), 'draft');
  perform pg_temp.expect_fail(format($q$update purchase_requests set status='approved', approved_by='00000000-0000-0000-0000-0000000000c3' where id='%s'$q$, pr), 'Supervisor');
  update purchase_requests set status='approved', approved_by='00000000-0000-0000-0000-0000000000c2' where id = pr;
  update purchase_requests set status='ordered' where id = pr;
  update pr_items set qty_received = 20 where pr_id = pr;
  update purchase_requests set status='received' where id = pr;
  perform pg_temp.expect_fail(format($q$update purchase_requests set notes='x' where id='%s'$q$, pr), 'tidak dapat diubah');
end $$;
rollback;
-- isolasi: plant lain tidak terlihat
begin; set local role maintainhub_app;
select set_config('app.org_id', :'org1', true), set_config('app.plant_ids', '', true), set_config('app.all_plants','0', true) \gset
do $$ begin assert (select count(*) from parts) = 0, 'tanpa plant tidak melihat suku cadang'; end $$;
rollback;
\echo SEMUA UJI LULUS
