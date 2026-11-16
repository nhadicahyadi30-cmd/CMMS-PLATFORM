-- Uji leads: role auth hanya bisa INSERT; role app tidak punya akses.
\set ON_ERROR_STOP on
begin;
set local role maintainhub_auth;
insert into leads (name, company, message) values ('Budi', 'PT Uji', 'halo');
do $$ begin
  begin perform count(*) from leads; assert false, 'auth tidak boleh membaca leads';
  exception when insufficient_privilege then null; end;
  begin update leads set status = 'closed'; assert false, 'auth tidak boleh mengubah leads';
  exception when insufficient_privilege then null; end;
  begin insert into leads (name, company) values ('', 'x'); assert false, 'nama kosong harus ditolak';
  exception when check_violation then null; end;
end $$;
reset role;
set local role maintainhub_app;
do $$ begin
  begin perform count(*) from leads; assert false, 'app tidak boleh membaca leads';
  exception when insufficient_privilege then null; end;
  begin insert into leads (name, company) values ('a', 'b'); assert false, 'app tidak boleh menulis leads';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
\echo UJI LEADS LULUS
