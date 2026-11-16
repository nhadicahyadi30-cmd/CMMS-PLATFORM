-- Permintaan demo dari website publik. Bukan data tenant: hanya pemilik platform yang membaca (lewat psql / role owner).
begin;
create table leads (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null check (length(name) between 1 and 200),
  company text not null check (length(company) between 1 and 200),
  phone text check (length(phone) <= 60),
  size text check (length(size) <= 200),
  message text check (length(message) <= 4000),
  email text check (length(email) <= 200),
  ip text,
  user_agent text check (length(user_agent) <= 300),
  status text not null default 'new' check (status in ('new','contacted','closed'))
);
create index leads_created on leads (created_at desc);
alter table leads enable row level security; alter table leads force row level security;
-- Role auth hanya boleh menambah (endpoint publik); tidak boleh membaca/mengubah. Role app tidak punya akses sama sekali.
create policy public_insert on leads for insert to maintainhub_auth with check (true);
revoke all on leads from maintainhub_app;   -- default privileges memberi akses ke role app; cabut
grant insert on leads to maintainhub_auth;
grant usage on sequence leads_id_seq to maintainhub_auth;
commit;
