-- 0006: Row-Level Security (multi-tenant + multi-plant) dan hak akses role aplikasi
begin;

-- tabel ber-plant: org cocok DAN plant diizinkan
do $$
declare t text;
begin
  foreach t in array array['plants','technicians','assets','work_orders','pm_plans'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format($p$create policy tenant_plant on %I using (org_id = app_org() and app_plant_ok(%s)) with check (org_id = app_org() and app_plant_ok(%s))$p$,
      t, case when t='plants' then 'id' else 'plant_id' end, case when t='plants' then 'id' else 'plant_id' end);
  end loop;
end $$;

-- tabel turunan: ikut org, akses plant diwariskan lewat induk (subquery tunduk RLS induk)
do $$
declare t text;
begin
  foreach t in array array['users','role_modules','audit_log','sla_policies','wo_counters','wo_logs','wo_attachments',
                           'pm_completions','wa_templates','wa_messages','wa_escalation_rules','asset_meters'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy tenant on %I using (org_id = app_org()) with check (org_id = app_org())', t);
  end loop;
end $$;
-- user_plants tak punya org_id: ikut users
alter table user_plants enable row level security; alter table user_plants force row level security;
create policy via_user on user_plants using (exists (select 1 from users u where u.id = user_id));
-- meter_readings tak punya org_id: ikut meter
alter table meter_readings enable row level security; alter table meter_readings force row level security;
create policy via_meter on meter_readings using (exists (select 1 from asset_meters m where m.id = meter_id));
alter table organizations enable row level security; alter table organizations force row level security;
create policy own_org on organizations using (id = app_org());
-- refresh_tokens & wa_webhook_events: dikelola backend tanpa konteks org (login/webhook) -> hanya lewat role service
revoke all on refresh_tokens, wa_webhook_events from maintainhub_app;

-- WO & log/lampiran turunan juga dibatasi plant lewat WO induk
create policy wo_child_plant on wo_logs as restrictive using (exists (select 1 from work_orders w where w.id = wo_id));
create policy wo_child_plant on wo_attachments as restrictive using (exists (select 1 from work_orders w where w.id = wo_id));
create policy wo_child_plant on pm_completions as restrictive using (exists (select 1 from pm_plans p where p.id = pm_plan_id));

grant usage on schema public to maintainhub_app;
grant select, insert, update, delete on all tables in schema public to maintainhub_app;
grant usage, select on all sequences in schema public to maintainhub_app;
revoke delete, update on audit_log, wo_logs from maintainhub_app;   -- append-only
revoke all on refresh_tokens, wa_webhook_events from maintainhub_app;
alter default privileges in schema public grant select, insert, update, delete on tables to maintainhub_app;

commit;
