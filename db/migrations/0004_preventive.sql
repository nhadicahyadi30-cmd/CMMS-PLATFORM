-- 0004: preventive maintenance (jadwal berbasis kalender atau meter)
begin;

create table pm_plans (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  plant_id      uuid not null,
  asset_id      uuid not null,
  name          text not null,
  trigger_type  text not null check (trigger_type in ('calendar','meter')),
  interval_days int check (interval_days > 0),
  interval_meter numeric(10,1) check (interval_meter > 0),
  meter_id      uuid references asset_meters(id),
  priority      text not null default 'P3' check (priority in ('P1','P2','P3','P4')),
  est_hours     numeric(5,1) not null default 2 check (est_hours > 0),
  lead_days     int not null default 3 check (lead_days >= 0),   -- WO dibuat N hari sebelum jatuh tempo
  checklist     jsonb not null default '[]',
  next_due      date,
  last_done     date,
  last_meter    numeric(14,2),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (org_id, plant_id) references plants(org_id, id),
  foreign key (org_id, asset_id) references assets(org_id, id),
  unique (org_id, id),
  check ((trigger_type = 'calendar' and interval_days is not null)
      or (trigger_type = 'meter' and interval_meter is not null and meter_id is not null))
);
create trigger pm_upd before update on pm_plans for each row execute function set_updated_at();
create index pm_due_idx on pm_plans (org_id, next_due) where active;

alter table work_orders add constraint wo_pm_fk foreign key (pm_plan_id) references pm_plans(id) on delete set null;
-- satu WO terbuka per rencana PM per jatuh tempo (anti-duplikat saat generator berjalan ulang)
create unique index wo_pm_once on work_orders (pm_plan_id, pm_due) where pm_plan_id is not null and status <> 'rejected';

create table pm_completions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  pm_plan_id uuid not null references pm_plans(id) on delete cascade,
  wo_id      uuid references work_orders(id) on delete set null,
  done_on    date not null,
  meter_value numeric(14,2),
  checklist_result jsonb not null default '[]',
  done_by    uuid references technicians(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Saat WO preventif ditutup: catat penyelesaian dan majukan jadwal
create function pm_on_wo_closed() returns trigger language plpgsql as $$
declare p pm_plans%rowtype; base date := (new.done_at at time zone 'Asia/Jakarta')::date;
begin
  if new.status = 'closed' and old.status <> 'closed' and new.pm_plan_id is not null then
    select * into p from pm_plans where id = new.pm_plan_id;
    insert into pm_completions (org_id, pm_plan_id, wo_id, done_on, done_by) values (new.org_id, p.id, new.id, base, new.technician_id);
    update pm_plans set last_done = base,
      next_due = case when trigger_type = 'calendar' then base + interval_days else next_due end
    where id = p.id;
  end if;
  return new;
end $$;
create trigger wo_pm_close after update on work_orders for each row execute function pm_on_wo_closed();

-- Generator WO PM (dipanggil job terjadwal): WO berstatus 'waiting' menunggu approval
create function pm_generate(p_org uuid, p_today date default current_date) returns int language plpgsql as $$
declare r record; n int := 0; new_id uuid;
begin
  for r in select * from pm_plans where org_id = p_org and active and trigger_type = 'calendar'
            and next_due is not null and next_due - lead_days <= p_today loop
    begin
      insert into work_orders (org_id, plant_id, wo_type, source, title, description, asset_id, priority, est_hours, pm_plan_id, pm_due)
      values (r.org_id, r.plant_id, 'preventive', 'pm_auto', 'PM: ' || r.name, '', r.asset_id, r.priority, r.est_hours, r.id, r.next_due);
      n := n + 1;
    exception when unique_violation then null;
    end;
  end loop;
  return n;
end $$;

commit;
