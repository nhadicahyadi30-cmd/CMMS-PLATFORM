-- 0014: Electrical & Utility (energi per lini/utilitas, tarif, kWh/ton, regresi beban dasar, anomali)
begin;

create table energy_units (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references organizations(id) on delete cascade,
  plant_id  uuid not null,
  code      text not null,
  name      text not null,
  kind      text not null check (kind in ('line','utility')),   -- line: punya output produksi (ton); utility: boiler, chiller, kompresor, dst
  active    boolean not null default true,
  asset_id  uuid,
  foreign key (org_id, plant_id) references plants(org_id, id),
  foreign key (org_id, asset_id) references assets(org_id, id),
  unique (org_id, plant_id, code), unique (org_id, id)
);

create table energy_tariffs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade, plant_id uuid not null,
  valid_from date not null, price_per_kwh numeric(12,2) not null check (price_per_kwh >= 0),
  foreign key (org_id, plant_id) references plants(org_id, id), unique (plant_id, valid_from)
);

create table energy_entries (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  plant_id    uuid not null,
  unit_id     uuid not null,
  period_kind text not null check (period_kind in ('day','shift','range','po')),
  date_from   date not null, date_to date not null,
  shift       text check (shift in ('pagi','siang','malam')),
  po_code     text, sku text,
  kwh         numeric(14,3) not null check (kwh >= 0),
  ton         numeric(14,3) check (ton >= 0),
  note        text, by_user uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  foreign key (org_id, plant_id) references plants(org_id, id),
  foreign key (org_id, unit_id) references energy_units(org_id, id),
  check (date_to >= date_from),
  check (period_kind not in ('day','shift') or date_from = date_to),
  check ((period_kind = 'shift') = (shift is not null)),
  check ((period_kind = 'po') = (po_code is not null))
);
create index on energy_entries (unit_id, date_from, date_to);
create index on energy_entries (plant_id, date_from);

-- Satu unit tidak boleh dihitung dua kali pada tanggal yang sama.
-- Boleh berdampingan: shift berbeda pada tanggal yang sama, dan antar-PO (PO adalah sudut pandang produksi).
create function energy_guard() returns trigger language plpgsql as $$
declare u energy_units; x energy_entries;
begin
  select * into u from energy_units where id = new.unit_id;
  if u.id is null or u.plant_id <> new.plant_id then raise exception 'Unit energi bukan milik plant ini' using errcode='23514'; end if;
  if not u.active then raise exception 'Unit energi % nonaktif', u.code using errcode='23514'; end if;
  if u.kind = 'utility' and new.ton is not null then raise exception 'Unit utilitas tidak memiliki output ton' using errcode='23514'; end if;
  select * into x from energy_entries e
   where e.unit_id = new.unit_id and e.id <> new.id and e.date_from <= new.date_to and e.date_to >= new.date_from
     and not (e.period_kind = 'shift' and new.period_kind = 'shift' and e.shift <> new.shift)
     and not (e.period_kind = 'po' and new.period_kind = 'po')
   limit 1;
  if found then raise exception 'Bentrok dengan data energi lain (% %–%) pada unit %', x.period_kind, x.date_from, x.date_to, u.code using errcode='23514'; end if;
  return new;
end $$;
create trigger energy_g before insert or update on energy_entries for each row execute function energy_guard();

-- kWh/ton per hari. Entri range/PO dibagi rata per hari kalender (dipotong ke jendela yang diminta).
create function energy_daily(p_from date, p_to date, p_plant uuid default null, p_unit uuid default null)
returns table (unit_id uuid, day date, kwh numeric, ton numeric) language sql stable as $$
  select e.unit_id, d::date, sum(e.kwh / (e.date_to - e.date_from + 1)), sum(e.ton / (e.date_to - e.date_from + 1))
    from energy_entries e
   cross join lateral generate_series(greatest(e.date_from, p_from), least(e.date_to, p_to), interval '1 day') d
   where e.date_to >= p_from and e.date_from <= p_to and (p_plant is null or e.plant_id = p_plant) and (p_unit is null or e.unit_id = p_unit)
   group by e.unit_id, d::date
$$;

create function energy_tariff_at(p_plant uuid, p_day date) returns numeric language sql stable as $$
  select price_per_kwh from energy_tariffs where plant_id = p_plant and valid_from <= p_day order by valid_from desc limit 1
$$;

create function energy_summary(p_from date, p_to date, p_plant uuid default null)
returns table (unit_id uuid, code text, name text, kind text, kwh numeric, ton numeric, kwh_per_ton numeric, cost numeric, share_pct numeric)
language sql stable as $$
  with d as (select x.*, u.plant_id, energy_tariff_at(u.plant_id, x.day) as price from energy_daily(p_from, p_to, p_plant) x join energy_units u on u.id = x.unit_id),
  a as (select unit_id, sum(kwh) as kwh, sum(ton) as ton, sum(kwh * coalesce(price, 0)) as cost from d group by unit_id),
  t as (select sum(kwh) as total from a)
  select u.id, u.code, u.name, u.kind, round(a.kwh, 1), round(a.ton, 1),
         case when u.kind = 'line' and a.ton > 0 then round(a.kwh / a.ton, 2) end, round(a.cost, 0), round(100.0 * a.kwh / nullif(t.total, 0), 1)
    from a join energy_units u on u.id = a.unit_id, t order by a.kwh desc
$$;

-- model beban: kWh = intercept (beban dasar) + slope (kWh per ton). Hanya hari dengan ton > 0, minimal 3 hari.
create function energy_regression(p_from date, p_to date, p_plant uuid default null)
returns table (unit_id uuid, code text, name text, days int, base_kwh numeric, kwh_per_ton numeric, r2 numeric)
language sql stable as $$
  with d as (select * from energy_daily(p_from, p_to, p_plant) where ton > 0)
  select u.id, u.code, u.name, count(*)::int,
         case when count(*) >= 3 then round(regr_intercept(d.kwh, d.ton)::numeric, 1) end,
         case when count(*) >= 3 then round(regr_slope(d.kwh, d.ton)::numeric, 2) end,
         case when count(*) >= 3 then round(regr_r2(d.kwh, d.ton)::numeric, 3) end
    from d join energy_units u on u.id = d.unit_id where u.kind = 'line' group by u.id order by u.code
$$;

-- hari tidak wajar: sisa model (line) atau simpangan dari rata-rata (utilitas) >= z simpangan baku; minimal 7 hari data
create function energy_anomalies(p_from date, p_to date, p_plant uuid default null, p_z numeric default 2)
returns table (unit_id uuid, code text, day date, kwh numeric, ton numeric, expected numeric, z numeric)
language sql stable as $$
  with d as (select x.*, u.code, u.kind from energy_daily(p_from, p_to, p_plant) x join energy_units u on u.id = x.unit_id),
  m as (select unit_id, count(*) as n, regr_slope(kwh, ton) as b1, regr_intercept(kwh, ton) as b0, avg(kwh) as mu
          from d where kind = 'line' and ton > 0 group by unit_id),
  r as (
    select d.unit_id, d.code, d.day, d.kwh, d.ton, (m.b0 + m.b1 * d.ton)::numeric as expected, m.n from d join m using (unit_id) where d.kind = 'line' and d.ton > 0 and m.n >= 7
    union all
    select d.unit_id, d.code, d.day, d.kwh, d.ton, avg(d.kwh) over (partition by d.unit_id), count(*) over (partition by d.unit_id) from d where d.kind = 'utility'),
  s as (select r.*, r.kwh - r.expected as resid, stddev_samp(r.kwh - r.expected) over (partition by r.unit_id) as sd from r where r.n >= 7)
  select unit_id, code, day, round(kwh, 1), round(ton, 1), round(expected, 1), round(resid / sd, 2) from s where sd > 0 and abs(resid / sd) >= p_z order by abs(resid / sd) desc, day
$$;

-- tren bulanan (N bulan terakhir): total kWh lini, ton, kWh/ton, kWh utilitas
create function energy_trend(p_months int default 12, p_plant uuid default null)
returns table (month date, line_kwh numeric, ton numeric, kwh_per_ton numeric, utility_kwh numeric)
language sql stable as $$
  with m as (select generate_series(date_trunc('month', current_date) - make_interval(months => p_months - 1), date_trunc('month', current_date), interval '1 month')::date as month),
  d as (select date_trunc('month', x.day)::date as month, sum(x.kwh) filter (where u.kind = 'line') as lk, sum(x.ton) as tn, sum(x.kwh) filter (where u.kind = 'utility') as uk
          from energy_daily((date_trunc('month', current_date) - make_interval(months => p_months - 1))::date, current_date, p_plant) x join energy_units u on u.id = x.unit_id group by 1)
  select m.month, round(coalesce(d.lk, 0), 1), round(coalesce(d.tn, 0), 1), case when d.tn > 0 then round(d.lk / d.tn, 2) end, round(coalesce(d.uk, 0), 1) from m left join d using (month) order by m.month
$$;

do $$
declare t text;
begin
  foreach t in array array['energy_units','energy_tariffs','energy_entries'] loop
    execute format('alter table %I enable row level security', t); execute format('alter table %I force row level security', t);
    execute format('create policy tenant_plant on %I using (org_id = app_org() and app_plant_ok(plant_id)) with check (org_id = app_org() and app_plant_ok(plant_id))', t);
  end loop;
end $$;
grant select, insert, update, delete on energy_units, energy_tariffs, energy_entries to maintainhub_app;
grant execute on function energy_daily(date,date,uuid,uuid), energy_tariff_at(uuid,date), energy_summary(date,date,uuid), energy_regression(date,date,uuid), energy_anomalies(date,date,uuid,numeric), energy_trend(int,uuid) to maintainhub_app;
commit;
