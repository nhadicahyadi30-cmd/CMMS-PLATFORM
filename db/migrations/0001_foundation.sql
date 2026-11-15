-- MaintainHub — 0001 foundation: tenant, plant, user, RBAC, audit
-- Dijalankan oleh role pemilik (maintainhub_owner). Aplikasi memakai role maintainhub_app (tunduk pada RLS).
begin;

create extension if not exists citext;
create extension if not exists pg_trgm;

-- ---------- role database ----------
do $$ begin
  if not exists (select 1 from pg_roles where rolname='maintainhub_app') then
    create role maintainhub_app nologin;  -- login diaktifkan oleh skrip provisioning (password dari secret)
  end if;
end $$;

-- ---------- util ----------
create function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- Konteks request diset backend per transaksi:
--   set_config('app.org_id', '<uuid>', true); set_config('app.plant_ids','<uuid,uuid>', true); set_config('app.all_plants','1'|'0', true)
create function app_org() returns uuid language sql stable as
$$ select nullif(current_setting('app.org_id', true), '')::uuid $$;

create function app_plant_ok(p uuid) returns boolean language sql stable as $$
  select coalesce(current_setting('app.all_plants', true), '0') = '1'
      or p = any (string_to_array(coalesce(nullif(current_setting('app.plant_ids', true), ''), ''), ',')::uuid[])
$$;

-- ---------- tenant & plant ----------
create table organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       citext not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  created_at timestamptz not null default now()
);

create table plants (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  code       citext not null,
  name       text not null,
  address    text,
  timezone   text not null default 'Asia/Jakarta',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code),
  unique (org_id, id)
);
create trigger plants_upd before update on plants for each row execute function set_updated_at();

-- ---------- RBAC ----------
create table roles (
  code text primary key check (code in ('admin','supervisor','planner','technician')),
  name text not null
);
insert into roles values ('admin','Admin'),('supervisor','Supervisor'),('planner','Planner'),('technician','Teknisi');

-- matriks akses modul per organisasi (1..10), dapat diubah Admin
create table role_modules (
  org_id    uuid not null references organizations(id) on delete cascade,
  role_code text not null references roles(code),
  module    smallint not null check (module between 1 and 10),
  primary key (org_id, role_code, module)
);

create table users (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  username        citext not null,
  email           citext,
  full_name       text not null,
  role_code       text not null references roles(code),
  password_hash   text not null,             -- argon2id; TIDAK PERNAH plaintext
  active          boolean not null default true,
  mfa_secret      text,                      -- terenkripsi di level aplikasi
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, username),
  unique (org_id, id),
  check (password_hash ~ '^\$(argon2id|2[aby])\$')
);
create trigger users_upd before update on users for each row execute function set_updated_at();

create table user_plants (
  user_id  uuid not null references users(id) on delete cascade,
  plant_id uuid not null references plants(id) on delete cascade,
  primary key (user_id, plant_id)
);

create table refresh_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  text not null unique,          -- hash SHA-256 dari token; token mentah tidak disimpan
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  user_agent  text,
  ip          inet,
  created_at  timestamptz not null default now()
);
create index on refresh_tokens (user_id) where revoked_at is null;

-- ---------- audit (append-only) ----------
create table audit_log (
  id        bigint generated always as identity primary key,
  org_id    uuid not null references organizations(id) on delete cascade,
  user_id   uuid references users(id) on delete set null,
  event     text not null,
  entity    text,
  entity_id text,
  detail    jsonb not null default '{}',
  ip        inet,
  at        timestamptz not null default now()
);
create index on audit_log (org_id, at desc);

create function forbid_change() returns trigger language plpgsql as $$
begin raise exception 'Tabel % bersifat append-only', tg_table_name using errcode='42501'; end $$;
create trigger audit_no_change before update or delete on audit_log for each row execute function forbid_change();

commit;
