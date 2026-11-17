-- 0019: Perangkat pengirim terdaftar (ESP32/gateway): konfigurasi + status terakhir (heartbeat).
begin;
create table ingest_devices (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  plant_id       uuid not null,
  asset_id       uuid not null,
  device_id      text not null check (device_id ~ '^[A-Za-z0-9_.-]{3,40}$'),
  name           text not null check (length(btrim(name)) > 0 and length(name) <= 120),
  key_id         uuid references ingest_keys(id) on delete set null,
  sensors        text[] not null default '{}',
  active         boolean not null default true,
  fw             text check (length(fw) <= 20),
  ip             text check (length(ip) <= 45),
  rssi           int  check (rssi between -127 and 0),
  uptime_s       bigint check (uptime_s >= 0),
  queue          int  check (queue >= 0),
  heap_kb        int  check (heap_kb >= 0),
  boots          int  check (boots >= 0),
  readings_total bigint not null default 0,
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now(),
  last_seen      timestamptz,
  unique (org_id, device_id),
  foreign key (org_id, plant_id) references plants(org_id, id),
  foreign key (org_id, asset_id) references assets(org_id, id)
);
create index ingest_devices_asset on ingest_devices (org_id, asset_id);
alter table ingest_devices enable row level security; alter table ingest_devices force row level security;
create policy tenant_plant on ingest_devices using (org_id = app_org() and app_plant_ok(plant_id)) with check (org_id = app_org() and app_plant_ok(plant_id));
commit;
