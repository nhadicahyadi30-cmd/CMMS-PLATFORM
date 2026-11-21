-- Menghapus SELURUH data demo (plant PA dan PB beserta isinya, dan pengguna demo) dari organisasi.
-- Data lain di organisasi yang sama (mis. plant P1 buatan bootstrap, akun admin) tidak disentuh.
-- Bila Anda menambah data sendiri di plant PA/PB, data itu ikut terhapus. Jalankan sebagai pemilik/superuser database.
--   psql -U <pemilik> -d <database> -v org_slug=demo -f db/seed/demo_remove.sql
\set ON_ERROR_STOP on
\if :{?org_slug}
\else
\set org_slug demo
\endif
begin;
select set_config('demo.org_slug', :'org_slug', true);
set local session_replication_role = replica;   -- melewati trigger (log WO tidak dapat dihapus lewat jalur biasa) dan FK; urutan di bawah menjaga keutuhan data

do $rm$
declare o uuid; pl uuid[];
begin
  select id into o from organizations where organizations.slug = current_setting('demo.org_slug');
  if o is null then raise exception 'Organisasi % tidak ditemukan', current_setting('demo.org_slug'); end if;
  select array_agg(id) into pl from plants where org_id = o and code in ('PA','PB');
  if pl is null then raise notice 'Tidak ada data demo (plant PA/PB) di organisasi ini.'; return; end if;

  delete from notifications where org_id = o and user_id in (select id from users where org_id = o and username in ('spv.pa','plan.pa','tek.pa1','prd.pa','spv.pb','plan.pb','tek.pb1','prd.pb'))
     or (org_id = o and (link like '/work-orders/%' and split_part(link, '/', 3)::uuid in (select id from work_orders where plant_id = any(pl))));
  delete from notifications where org_id = o and link = '/monitoring' and created_at > now() - interval '2 days' and body in (select message from alarms where plant_id = any(pl));
  delete from notifications where org_id = o and kind in ('ptw','inspection') and (link like '/permits/%' or link like '/inspections/%');
  delete from permit_locks  where permit_id in (select id from permits where plant_id = any(pl));
  delete from permit_points where permit_id in (select id from permits where plant_id = any(pl));
  delete from permit_events where permit_id in (select id from permits where plant_id = any(pl));
  delete from permits where plant_id = any(pl);
  delete from loto_points where plant_id = any(pl);
  delete from inspection_results where inspection_id in (select id from inspections where plant_id = any(pl));
  delete from inspections where plant_id = any(pl);
  delete from inspection_items where template_id in (select id from inspection_templates where plant_id = any(pl));
  delete from inspection_templates where plant_id = any(pl);
  delete from rca_actions where case_id in (select id from rca_cases where plant_id = any(pl));
  delete from rca_causes  where case_id in (select id from rca_cases where plant_id = any(pl));
  delete from rca_whys    where case_id in (select id from rca_cases where plant_id = any(pl));
  delete from fmea_items  where plant_id = any(pl);
  delete from rca_cases   where plant_id = any(pl);
  delete from alarms      where plant_id = any(pl);
  delete from sensor_readings where tag_id in (select id from sensor_tags where plant_id = any(pl));
  delete from sensor_tags where plant_id = any(pl);
  delete from ingest_devices where plant_id = any(pl);
  delete from energy_meter_readings where meter_id in (select id from energy_meters where plant_id = any(pl));
  delete from energy_meters  where plant_id = any(pl);
  delete from energy_entries where plant_id = any(pl);
  delete from energy_tariffs where plant_id = any(pl);
  delete from energy_units   where plant_id = any(pl);
  delete from pr_items where pr_id in (select id from purchase_requests where plant_id = any(pl));
  delete from purchase_requests where plant_id = any(pl);
  delete from stock_tx where plant_id = any(pl);
  delete from pm_parts where pm_plan_id in (select id from pm_plans where plant_id = any(pl));
  delete from pm_completions where pm_plan_id in (select id from pm_plans where plant_id = any(pl));
  delete from wo_attachments where wo_id in (select id from work_orders where plant_id = any(pl));
  delete from wo_logs where wo_id in (select id from work_orders where plant_id = any(pl));
  delete from work_orders where plant_id = any(pl);
  delete from pm_plans where plant_id = any(pl);
  delete from parts where plant_id = any(pl);
  delete from meter_readings where meter_id in (select id from asset_meters where asset_id in (select id from assets where plant_id = any(pl)));
  delete from asset_meters where asset_id in (select id from assets where plant_id = any(pl));
  delete from assets where plant_id = any(pl) and parent_id is not null;
  delete from assets where plant_id = any(pl);
  delete from technician_absences where technician_id in (select id from technicians where plant_id = any(pl));
  delete from technician_skills   where technician_id in (select id from technicians where plant_id = any(pl));
  delete from technicians where plant_id = any(pl);
  delete from wo_counters  where plant_id = any(pl);
  delete from doc_counters where plant_id = any(pl);
  delete from user_plants  where plant_id = any(pl);
  delete from users where org_id = o and username in ('spv.pa','plan.pa','tek.pa1','prd.pa','spv.pb','plan.pb','tek.pb1','prd.pb');
  delete from plants where id = any(pl);
  raise notice 'Data demo dihapus (plant PA, PB).';
end $rm$;

reset session_replication_role;
commit;
select 'demo_remove.sql selesai' as hasil;
