-- 0013: RCA & Failure Analysis (mode kegagalan, 5 Why, fishbone 6M, tindakan, siklus PDCA, FMEA)
begin;

create table failure_modes (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references organizations(id) on delete cascade,
  code     text not null,
  name     text not null,
  category text not null default 'lainnya' check (category in ('mekanikal','elektrikal','instrumentasi','proses','operasional','lainnya')),
  active   boolean not null default true,
  unique (org_id, code), unique (org_id, id)
);

create function seed_failure_modes(p_org uuid) returns void language sql as $$
  insert into failure_modes (org_id, code, name, category) values
   (p_org,'FM-BRG','Bearing aus/rusak','mekanikal'), (p_org,'FM-SEAL','Seal/gasket bocor','mekanikal'), (p_org,'FM-BELT','Belt/rantai putus atau kendor','mekanikal'),
   (p_org,'FM-LUB','Kurang/salah pelumasan','mekanikal'), (p_org,'FM-COR','Korosi','mekanikal'), (p_org,'FM-MOT','Motor overheat/terbakar','elektrikal'),
   (p_org,'FM-ELC','Gangguan kelistrikan (short, MCB trip)','elektrikal'), (p_org,'FM-SNS','Sensor/instrumen error','instrumentasi'), (p_org,'FM-PLC','Gangguan PLC/software','instrumentasi'),
   (p_org,'FM-CTM','Kontaminasi/kotoran','proses'), (p_org,'FM-OPR','Kesalahan pengoperasian','operasional'), (p_org,'FM-OTH','Lainnya','lainnya')
  on conflict do nothing
$$;
select seed_failure_modes(id) from organizations;
create or replace function provision_org(p_slug text, p_name text) returns uuid language plpgsql as $$
declare o uuid;
begin
  insert into organizations (slug, name) values (p_slug, p_name) returning id into o;
  insert into role_modules (org_id, role_code, module)
  select o, 'admin', g from generate_series(1,10) g
  union all select o, 'supervisor', g from generate_series(1,9) g
  union all select o, 'planner', g from unnest(array[1,2,3,5,6,7,8,9]) g
  union all select o, 'technician', g from unnest(array[1,2,3,5]) g;
  insert into sla_policies (org_id, priority, label, respond_min, resolve_min) values
    (o,'P1','Kritis',15,240), (o,'P2','Tinggi',60,480), (o,'P3','Sedang',240,1440), (o,'P4','Rendah',1440,4320);
  perform seed_failure_modes(o);
  return o;
end $$;

alter table work_orders add column failure_mode_id uuid;
alter table work_orders add constraint wo_fm_fk foreign key (org_id, failure_mode_id) references failure_modes(org_id, id);
create index on work_orders (failure_mode_id) where failure_mode_id is not null;

create table rca_cases (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  plant_id      uuid not null,
  code          text not null default '',
  asset_id      uuid not null,
  wo_id         uuid,
  title         text not null check (length(btrim(title)) > 0),
  problem       text not null default '',
  stage         text not null default 'plan' check (stage in ('plan','do','check','act','closed')),
  root_cause    text,
  root_cause_category text check (root_cause_category in ('man','machine','method','material','measurement','environment')),
  verification_notes text, standardization_notes text,
  owner_id      uuid references users(id) on delete set null,
  created_by    uuid references users(id) on delete set null,
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (org_id, plant_id) references plants(org_id, id),
  foreign key (org_id, asset_id) references assets(org_id, id),
  foreign key (org_id, wo_id) references work_orders(org_id, id),
  unique (org_id, code), unique (org_id, id)
);
create index on rca_cases (asset_id);
create trigger rca_upd before update on rca_cases for each row execute function set_updated_at();

create table rca_whys (
  id uuid primary key default gen_random_uuid(), org_id uuid not null, case_id uuid not null references rca_cases(id) on delete cascade,
  level smallint not null check (level between 1 and 5), answer text not null check (length(btrim(answer)) > 0), unique (case_id, level)
);
create table rca_causes (
  id uuid primary key default gen_random_uuid(), org_id uuid not null, case_id uuid not null references rca_cases(id) on delete cascade,
  category text not null check (category in ('man','machine','method','material','measurement','environment')),
  cause text not null check (length(btrim(cause)) > 0), is_root boolean not null default false
);
create index on rca_causes (case_id);
create table rca_actions (
  id uuid primary key default gen_random_uuid(), org_id uuid not null, case_id uuid not null references rca_cases(id) on delete cascade,
  kind text not null default 'corrective' check (kind in ('corrective','preventive')),
  description text not null check (length(btrim(description)) > 0),
  owner_id uuid references users(id) on delete set null, due_date date,
  status text not null default 'open' check (status in ('open','done','verified')),
  done_at timestamptz, verified_by uuid references users(id), verified_at timestamptz, verification_note text,
  created_at timestamptz not null default now()
);
create index on rca_actions (case_id);

create function rca_before_insert() returns trigger language plpgsql as $$
begin
  new.stage := 'plan'; new.closed_at := null;
  if new.code = '' then new.code := next_doc_code('RCA', new.org_id, new.plant_id); end if;
  if not exists (select 1 from assets where id = new.asset_id and plant_id = new.plant_id) then raise exception 'Aset bukan milik plant ini' using errcode='23514'; end if;
  return new;
end $$;
create trigger rca_ins before insert on rca_cases for each row execute function rca_before_insert();

-- Siklus PDCA: plan -> do -> check -> act -> closed, tiap langkah punya syarat
create function rca_guard() returns trigger language plpgsql as $$
declare n int; open_n int; unver int;
begin
  if old.stage = 'closed' then raise exception 'RCA % sudah ditutup dan tidak dapat diubah', old.code using errcode='23514'; end if;
  if new.stage <> old.stage then
    if (old.stage, new.stage) not in (('plan','do'),('do','check'),('check','act'),('check','do'),('act','closed')) then
      raise exception 'Transisi tahap RCA tidak valid: % -> %', old.stage, new.stage using errcode='23514';
    end if;
    select count(*), count(*) filter (where status = 'open'), count(*) filter (where status <> 'verified') into n, open_n, unver from rca_actions where case_id = old.id;
    if new.stage = 'do' and old.stage = 'plan' then
      if coalesce(btrim(new.root_cause), '') = '' then raise exception 'Isi akar masalah sebelum masuk tahap Do' using errcode='23514'; end if;
      if not exists (select 1 from rca_whys where case_id = old.id) then raise exception 'Lengkapi analisis 5 Why sebelum masuk tahap Do' using errcode='23514'; end if;
      if n = 0 then raise exception 'Tambahkan minimal satu tindakan sebelum masuk tahap Do' using errcode='23514'; end if;
    elsif new.stage = 'check' then
      if open_n > 0 then raise exception 'Masih ada % tindakan yang belum selesai', open_n using errcode='23514'; end if;
    elsif new.stage = 'act' then
      if coalesce(btrim(new.verification_notes), '') = '' then raise exception 'Isi hasil verifikasi efektivitas sebelum tahap Act' using errcode='23514'; end if;
      if unver > 0 then raise exception 'Semua tindakan harus diverifikasi Supervisor sebelum tahap Act' using errcode='23514'; end if;
    elsif new.stage = 'closed' then
      if coalesce(btrim(new.standardization_notes), '') = '' then raise exception 'Isi standarisasi (SOP/PM/desain yang diperbarui) sebelum menutup RCA' using errcode='23514'; end if;
      new.closed_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger rca_g before update on rca_cases for each row execute function rca_guard();

-- child: tidak bisa diubah setelah RCA ditutup; verifikasi tindakan hanya Supervisor/Admin
create function rca_child_guard() returns trigger language plpgsql as $$
declare st text; cid uuid := coalesce(new.case_id, old.case_id); r text;
begin
  select stage into st from rca_cases where id = cid;
  if st = 'closed' then raise exception 'RCA sudah ditutup dan tidak dapat diubah' using errcode='23514'; end if;
  if tg_table_name = 'rca_actions' and tg_op = 'UPDATE' then
    if old.status = 'verified' then raise exception 'Tindakan yang sudah diverifikasi tidak dapat diubah' using errcode='23514'; end if;
    if new.status = 'done' and old.status = 'open' then new.done_at := now(); end if;
    if new.status = 'verified' then
      if old.status <> 'done' then raise exception 'Tindakan harus berstatus done sebelum diverifikasi' using errcode='23514'; end if;
      select role_code into r from users where id = new.verified_by and active;
      if r is null or r not in ('supervisor','admin') then raise exception 'Verifikasi tindakan hanya oleh Supervisor atau Admin' using errcode='42501'; end if;
      new.verified_at := now();
    elsif new.status = 'open' and old.status = 'done' then new.done_at := null;
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger rca_whys_g before insert or update or delete on rca_whys for each row execute function rca_child_guard();
create trigger rca_causes_g before insert or update or delete on rca_causes for each row execute function rca_child_guard();
create trigger rca_actions_g before insert or update or delete on rca_actions for each row execute function rca_child_guard();

create table fmea_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade, plant_id uuid not null, asset_id uuid not null,
  function_desc text not null, failure_mode_id uuid, failure_mode_text text, effect text not null, cause text not null,
  severity smallint not null check (severity between 1 and 10), occurrence smallint not null check (occurrence between 1 and 10), detection smallint not null check (detection between 1 and 10),
  rpn int generated always as (severity * occurrence * detection) stored,
  current_controls text, recommended_action text,
  status text not null default 'open' check (status in ('open','mitigated','accepted')),
  rca_case_id uuid references rca_cases(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (org_id, plant_id) references plants(org_id, id), foreign key (org_id, asset_id) references assets(org_id, id),
  foreign key (org_id, failure_mode_id) references failure_modes(org_id, id),
  check (failure_mode_id is not null or failure_mode_text is not null)
);
create index on fmea_items (asset_id);
create trigger fmea_upd before update on fmea_items for each row execute function set_updated_at();

-- skala Occurrence (1–10) dari jumlah kejadian 12 bulan terakhir pada aset (+ mode kegagalan bila diisi)
create function fmea_suggest_occurrence(p_asset uuid, p_failure_mode uuid default null) returns table (events int, occurrence int)
language sql stable as $$
  with e as (select count(*)::int as n from work_orders where asset_id = p_asset and wo_type in ('breakdown','emergency','corrective') and status in ('done','closed')
                and done_at >= now() - interval '12 months' and (p_failure_mode is null or failure_mode_id = p_failure_mode))
  select n, case when n = 0 then 1 when n = 1 then 3 when n = 2 then 5 when n <= 4 then 6 when n <= 6 then 7 when n <= 9 then 8 when n <= 12 then 9 else 10 end from e
$$;

-- kandidat RCA: aset dengan kerusakan berulang tanpa RCA aktif
create function rca_candidates(p_plant uuid default null, p_min int default 3, p_days int default 90)
returns table (asset_id uuid, code citext, name text, breakdowns int, downtime_h numeric, last_at timestamptz)
language sql stable as $$
  select a.id, a.code, a.name, count(*)::int, coalesce(sum(w.downtime_hours), 0), max(w.done_at)
    from work_orders w join assets a on a.id = w.asset_id
   where w.wo_type in ('breakdown','emergency') and w.status in ('done','closed') and w.done_at >= now() - make_interval(days => p_days) and (p_plant is null or w.plant_id = p_plant)
     and not exists (select 1 from rca_cases r where r.asset_id = a.id and r.stage <> 'closed')
   group by a.id having count(*) >= p_min order by count(*) desc, sum(w.downtime_hours) desc
$$;

-- Pareto penyebab kegagalan (mode kegagalan terisi pada WO)
create function kpi_pareto_cause(p_from date, p_to date, p_plant uuid default null, p_limit int default 10)
returns table (failure_mode_id uuid, code text, name text, category text, events int, downtime_h numeric, share_pct numeric, cum_pct numeric)
language sql stable as $$
  with x as (select f.id, f.code, f.name, f.category, count(*)::int as n, coalesce(sum(w.downtime_hours), 0) as dt
               from work_orders w join failure_modes f on f.id = w.failure_mode_id
              where w.wo_type <> 'preventive' and w.status in ('done','closed') and (p_plant is null or w.plant_id = p_plant)
                and (w.done_at at time zone 'Asia/Jakarta')::date between p_from and p_to group by f.id),
  t as (select sum(n) as total from x),
  r as (select x.*, row_number() over (order by n desc, dt desc, code) as rn, sum(n) over (order by n desc, dt desc, code) as run from x)
  select r.id, r.code, r.name, r.category, r.n, round(r.dt, 2), round(100.0 * r.n / t.total, 1), round(100.0 * r.run / t.total, 1) from r, t where r.rn <= p_limit order by r.rn
$$;

-- RLS
do $$
declare t text;
begin
  foreach t in array array['rca_cases','fmea_items'] loop
    execute format('alter table %I enable row level security', t); execute format('alter table %I force row level security', t);
    execute format('create policy tenant_plant on %I using (org_id = app_org() and app_plant_ok(plant_id)) with check (org_id = app_org() and app_plant_ok(plant_id))', t);
  end loop;
  foreach t in array array['failure_modes','rca_whys','rca_causes','rca_actions'] loop
    execute format('alter table %I enable row level security', t); execute format('alter table %I force row level security', t);
    execute format('create policy tenant on %I using (org_id = app_org()) with check (org_id = app_org())', t);
  end loop;
  foreach t in array array['rca_whys','rca_causes','rca_actions'] loop
    execute format('create policy via_case on %I as restrictive using (exists (select 1 from rca_cases c where c.id = case_id))', t);
  end loop;
end $$;
grant select, insert, update, delete on failure_modes, rca_cases, rca_whys, rca_causes, rca_actions, fmea_items to maintainhub_app;
grant execute on function fmea_suggest_occurrence(uuid,uuid), rca_candidates(uuid,int,int), kpi_pareto_cause(date,date,uuid,int) to maintainhub_app;
commit;
