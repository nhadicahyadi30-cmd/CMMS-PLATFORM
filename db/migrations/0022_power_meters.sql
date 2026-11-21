-- 0022: Power meter (pembacaan kWh kumulatif per area/unit) -> entri energi harian otomatis
begin;

alter table energy_entries add column source text not null default 'manual' check (source in ('manual','meter'));
alter table energy_units   add column meter_rollup_at timestamptz;

create table energy_meters (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  plant_id   uuid not null,
  unit_id    uuid not null,
  code       text not null check (code ~ '^[A-Za-z0-9._-]{1,40}$'),
  name       text not null,
  multiplier numeric(12,4) not null default 1 check (multiplier > 0),   -- rasio CT/PT bila meter membaca sisi primer mentah; 1 untuk meter yang sudah menghitung
  active     boolean not null default true,
  last_seen  timestamptz,
  last_kwh   double precision,
  created_at timestamptz not null default now(),
  foreign key (org_id, plant_id) references plants(org_id, id),
  foreign key (org_id, unit_id) references energy_units(org_id, id),
  unique (plant_id, code), unique (org_id, id)
);

create table energy_meter_readings (
  meter_id uuid not null references energy_meters(id) on delete cascade,
  ts       timestamptz not null,
  kwh      double precision not null check (kwh >= 0),   -- register energi kumulatif (kWh)
  kw       double precision,                             -- daya sesaat (opsional)
  org_id   uuid not null,
  primary key (meter_id, ts)
);
create index energy_meter_readings_org_ts on energy_meter_readings (org_id, ts desc);

-- Meter harus berada di plant yang sama dengan unitnya.
create function energy_meter_guard() returns trigger language plpgsql as $$
declare u energy_units;
begin
  select * into u from energy_units where id = new.unit_id;
  if u.id is null or u.plant_id <> new.plant_id then raise exception 'Unit energi bukan milik plant ini' using errcode = '23514'; end if;
  return new;
end $$;
create trigger energy_meter_g before insert or update on energy_meters for each row execute function energy_meter_guard();

alter table energy_meters enable row level security;          alter table energy_meters force row level security;
alter table energy_meter_readings enable row level security;  alter table energy_meter_readings force row level security;
create policy tenant_plant on energy_meters using (org_id = app_org() and app_plant_ok(plant_id)) with check (org_id = app_org() and app_plant_ok(plant_id));
create policy tenant on energy_meter_readings using (org_id = app_org() and exists (select 1 from energy_meters m where m.id = meter_id))
                                             with check (org_id = app_org() and exists (select 1 from energy_meters m where m.id = meter_id));

-- Hitung ulang kWh harian sebuah unit dari pembacaan meter, untuk p_days hari penuh sebelum p_today (tanggal lokal plant).
-- kWh hari D = pembacaan terakhir sebelum akhir D dikurangi pembacaan terakhir sebelum awal D (dikali multiplier), dijumlah semua meter aktif unit.
-- Hari dilewati bila ada meter tanpa pembacaan dalam 3 jam sebelum batas hari (celah data) atau angka mundur (meter di-reset): tidak ada angka palsu.
-- Idempoten: entri hasil meter (source='meter') dibuat ulang, jadi data yang datang terlambat memperbaiki harinya. Entri manual yang bentrok dipertahankan.
create function energy_meter_rollup(p_unit uuid, p_today date, p_days int default 7) returns int language plpgsql as $$
declare u energy_units; tz text; d date; n int := 0; total numeric; ok boolean; m record; s double precision; e double precision; ds timestamptz; de timestamptz;
begin
  select * into u from energy_units where id = p_unit;
  if u.id is null then return 0; end if;
  if not exists (select 1 from energy_meters where unit_id = p_unit and active) then return 0; end if;
  select timezone into tz from plants where id = u.plant_id;
  for d in select g::date from generate_series((p_today - least(greatest(p_days, 1), 62))::timestamp, (p_today - 1)::timestamp, interval '1 day') g loop
    ds := d::timestamp at time zone tz; de := (d + 1)::timestamp at time zone tz;
    total := 0; ok := true;
    for m in select id, multiplier from energy_meters where unit_id = p_unit and active loop
      select kwh into s from energy_meter_readings where meter_id = m.id and ts < ds and ts >= ds - interval '3 hours' order by ts desc limit 1;
      select kwh into e from energy_meter_readings where meter_id = m.id and ts < de and ts >= de - interval '3 hours' order by ts desc limit 1;
      if s is null or e is null or e < s then ok := false; exit; end if;
      total := total + (e - s)::numeric * m.multiplier;
    end loop;
    delete from energy_entries where unit_id = p_unit and source = 'meter' and period_kind = 'day' and date_from = d;
    if ok then
      begin
        insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, kwh, note, source)
          values (u.org_id, u.plant_id, u.id, 'day', d, d, round(total, 3), 'otomatis dari power meter', 'meter');
        n := n + 1;
      exception when check_violation then null;   -- bentrok dengan entri manual: yang manual dipertahankan
      end;
    end if;
  end loop;
  update energy_units set meter_rollup_at = now() where id = p_unit;
  return n;
end $$;

commit;
