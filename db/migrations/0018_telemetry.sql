-- 0018: telemetri mesin (suhu oli, running hour, dll). Data dikirim sistem eksternal (mis. Node-RED) lewat API key per perangkat.
begin;

-- Kunci API untuk pengirim data (Node-RED/gateway). Hanya hash yang disimpan; kunci asli ditampilkan sekali saat dibuat.
create table ingest_keys (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  plant_id     uuid,
  name         text not null check (length(btrim(name)) > 0 and length(name) <= 120),
  secret_hash  text not null,
  active       boolean not null default true,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  foreign key (org_id, plant_id) references plants(org_id, id)
);

-- Definisi sensor per aset: tag (mis. oil_temp), satuan, jenis, batas alarm.
create table sensor_tags (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  plant_id      uuid not null,
  asset_id      uuid not null,
  tag           text not null check (tag ~ '^[a-z0-9_.-]{1,60}$'),
  name          text not null check (length(btrim(name)) > 0 and length(name) <= 120),
  unit          text not null default '' check (length(unit) <= 20),
  kind          text not null default 'gauge' check (kind in ('gauge','runhours')),   -- runhours = jam operasi kumulatif -> meter aset (PM berbasis meter)
  warn_high     numeric, crit_high numeric, warn_low numeric, crit_low numeric,
  min_valid     numeric, max_valid numeric,                                          -- rentang wajar; di luar ini dianggap pembacaan rusak dan ditolak
  confirm_count int not null default 1 check (confirm_count between 1 and 20),       -- alarm hanya jika N pembacaan terakhir berturut-turut melewati batas
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  foreign key (org_id, plant_id) references plants(org_id, id),
  foreign key (org_id, asset_id) references assets(org_id, id),
  unique (org_id, asset_id, tag),
  check (warn_high is null or crit_high is null or warn_high <= crit_high),
  check (warn_low is null or crit_low is null or warn_low >= crit_low)
);

create table sensor_readings (
  tag_id uuid not null references sensor_tags(id) on delete cascade,
  ts     timestamptz not null,
  value  double precision not null,
  org_id uuid not null,
  primary key (tag_id, ts)
);
create index sensor_readings_org_ts on sensor_readings (org_id, ts desc);

-- Alarm dari ambang batas: satu alarm aktif per sensor (tidak menumpuk saat nilai tetap tinggi).
alter table alarms add column sensor_tag_id uuid references sensor_tags(id) on delete set null;
create unique index alarms_one_active_per_tag on alarms (sensor_tag_id) where sensor_tag_id is not null and status <> 'closed';

-- RLS
alter table ingest_keys enable row level security;    alter table ingest_keys force row level security;
alter table sensor_tags enable row level security;    alter table sensor_tags force row level security;
alter table sensor_readings enable row level security; alter table sensor_readings force row level security;
create policy tenant_plant on ingest_keys using (org_id = app_org() and (plant_id is null or app_plant_ok(plant_id))) with check (org_id = app_org() and (plant_id is null or app_plant_ok(plant_id)));
create policy tenant_plant on sensor_tags using (org_id = app_org() and app_plant_ok(plant_id)) with check (org_id = app_org() and app_plant_ok(plant_id));
create policy tenant on sensor_readings using (org_id = app_org() and exists (select 1 from sensor_tags t where t.id = tag_id)) with check (org_id = app_org() and exists (select 1 from sensor_tags t where t.id = tag_id));

-- Endpoint ingest tidak punya pengguna login: role auth hanya boleh MEMBACA kunci (untuk verifikasi) dan menyentuh last_used_at.
grant select on ingest_keys to maintainhub_auth;
grant update (last_used_at) on ingest_keys to maintainhub_auth;
create policy auth_read  on ingest_keys for select to maintainhub_auth using (true);
create policy auth_touch on ingest_keys for update to maintainhub_auth using (true) with check (true);

-- Retensi manual: select purge_sensor_readings(365);  (hapus pembacaan lebih tua dari N hari)
create function purge_sensor_readings(p_days int) returns bigint language plpgsql as $$
declare n bigint;
begin
  if p_days < 7 then raise exception 'Retensi minimal 7 hari' using errcode = '22023'; end if;
  delete from sensor_readings where ts < now() - make_interval(days => p_days);
  get diagnostics n = row_count; return n;
end $$;
revoke all on function purge_sensor_readings(int) from public;

commit;
