-- 0007: role khusus autentikasi (login belum punya konteks org, jadi butuh akses lintas-org yang SANGAT terbatas)
begin;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'maintainhub_auth') then create role maintainhub_auth nologin; end if;
end $$;
grant usage on schema public to maintainhub_auth;
grant select on organizations, role_modules, user_plants to maintainhub_auth;
grant select, update (failed_attempts, locked_until, last_login_at) on users to maintainhub_auth;
grant select, insert, update on refresh_tokens to maintainhub_auth;
grant insert on audit_log to maintainhub_auth;
grant usage, select on all sequences in schema public to maintainhub_auth;
create policy auth_all on organizations   for select to maintainhub_auth using (true);
create policy auth_all on users           for all    to maintainhub_auth using (true) with check (true);
create policy auth_all on role_modules    for select to maintainhub_auth using (true);
create policy auth_all on user_plants     for select to maintainhub_auth using (true);
create policy auth_all on audit_log       for insert to maintainhub_auth with check (true);
commit;
