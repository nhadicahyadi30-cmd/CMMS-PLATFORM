-- 0002: aset (hirarki), teknisi, meter running hours
begin;

create table technicians (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  plant_id        uuid not null,
  user_id         uuid references users(id) on delete set null,
  code            text not null,
  full_name       text not null,
  skill           text not null,
  shift           text not null check (shift in ('pagi','siang','malam')),
  daily_capacity_h numeric(4,1) not null default 8 check (daily_capacity_h > 0),
  phone_e164      text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  wa_opt_in       boolean not null default false,   -- persetujuan menerima WhatsApp (wajib untuk Meta)
  wa_opt_in_at    timestamptz,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (org_id, plant_id) references plants(org_id, id),
  unique (org_id, code),
  unique (org_id, id),
  check (not wa_opt_in or (phone_e164 is not null and wa_opt_in_at is not null))
);
create trigger tech_upd before update on technicians for each row execute function set_updated_at();
create unique index tech_phone_uq on technicians (org_id, phone_e164) where phone_e164 is not null and active;

create table assets (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  plant_id         uuid not null,
  parent_id        uuid,
  code             citext not null,
  name             text not null,
  asset_type       text not null check (asset_type in ('plant','area','equipment','component')),
  manufacturer     text,
  model            text,
  serial_no        text,
  year_installed   smallint check (year_installed between 1950 and 2100),
  status           text not null default 'running' check (status in ('running','standby','breakdown','retired')),
  acquisition_cost numeric(16,2) check (acquisition_cost >= 0),
  expected_life_years numeric(4,1) check (expected_life_years > 0),
  -- skor kritikalitas 1–5: keselamatan, produksi, kualitas, biaya perbaikan
  crit_safety      smallint not null default 1 check (crit_safety between 1 and 5),
  crit_production  smallint not null default 1 check (crit_production between 1 and 5),
  crit_quality     smallint not null default 1 check (crit_quality between 1 and 5),
  crit_cost        smallint not null default 1 check (crit_cost between 1 and 5),
  criticality_score smallint generated always as (crit_safety + crit_production + crit_quality + crit_cost) stored,
  criticality_class char(1) generated always as (case when crit_safety + crit_production + crit_quality + crit_cost >= 15 then 'A'
                                                       when crit_safety + crit_production + crit_quality + crit_cost >= 10 then 'B' else 'C' end) stored,
  specs            jsonb not null default '{}',
  qr_token         text not null default replace(gen_random_uuid()::text,'-','') unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (org_id, plant_id) references plants(org_id, id),
  foreign key (org_id, parent_id) references assets(org_id, id) on delete restrict,
  unique (org_id, code),
  unique (org_id, id),
  check (parent_id is distinct from id)
);
create trigger assets_upd before update on assets for each row execute function set_updated_at();
create index assets_plant_idx on assets (plant_id, asset_type);
create index assets_parent_idx on assets (parent_id);
create index assets_name_trgm on assets using gin (name gin_trgm_ops);

-- cegah siklus pada hirarki aset
create function assets_no_cycle() returns trigger language plpgsql as $$
begin
  if new.parent_id is not null and exists (
    with recursive up as (
      select id, parent_id from assets where id = new.parent_id
      union all select a.id, a.parent_id from assets a join up on a.id = up.parent_id)
    select 1 from up where id = new.id) then
    raise exception 'Hirarki aset tidak boleh membentuk siklus' using errcode='23514';
  end if;
  return new;
end $$;
create trigger assets_cycle before insert or update of parent_id on assets for each row execute function assets_no_cycle();

-- meter (mis. running hours) + pembacaan
create table asset_meters (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references organizations(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  name     text not null default 'running_hours',
  unit     text not null default 'jam',
  unique (asset_id, name)
);
create table meter_readings (
  id        bigint generated always as identity primary key,
  meter_id  uuid not null references asset_meters(id) on delete cascade,
  value     numeric(14,2) not null check (value >= 0),
  read_at   timestamptz not null default now(),
  source    text not null default 'manual' check (source in ('manual','plc','iot','import')),
  read_by   uuid references users(id) on delete set null
);
create index on meter_readings (meter_id, read_at desc);
-- nilai meter kumulatif tidak boleh turun (kecuali reset meter, dicatat terpisah)
create function meter_monotonic() returns trigger language plpgsql as $$
declare last numeric;
begin
  select value into last from meter_readings where meter_id = new.meter_id order by read_at desc, id desc limit 1;
  if last is not null and new.value < last then
    raise exception 'Pembacaan meter (%) lebih kecil dari pembacaan terakhir (%)', new.value, last using errcode='23514';
  end if;
  return new;
end $$;
create trigger meter_mono before insert on meter_readings for each row execute function meter_monotonic();

commit;
