-- 0012: Dashboard KPI & Reporting. Semua rumus ada di fungsi SQL (SECURITY INVOKER => tunduk RLS plant/tenant pemanggil).
begin;

alter table plants add column operating_hours_per_day numeric(4,1) not null default 24 check (operating_hours_per_day > 0 and operating_hours_per_day <= 24);
alter table technicians add column hourly_rate numeric(12,2) not null default 0 check (hourly_rate >= 0);

-- Definisi (periode = p_from..p_to inklusif, zona Asia/Jakarta):
--  Jam terjadwal  = hari periode x jam operasi/hari plant, dijumlah per equipment aktif
--  Downtime       = sum downtime_hours WO (non-preventif) yang SELESAI di periode
--  Breakdown      = WO bertipe breakdown/emergency selesai di periode
--  Availability   = 1 - downtime / jam terjadwal
--  MTTR           = rata-rata actual_hours WO breakdown/emergency/corrective selesai di periode
--  MTBF           = (jam terjadwal - downtime) / jumlah breakdown
--  Kepatuhan PM   = WO preventif jatuh tempo di periode yang selesai paling lambat 2 hari setelah jatuh tempo
--  Backlog        = WO belum dikerjakan tuntas (waiting, approved, assigned, progress); 'done' menunggu penutupan tidak dihitung
--  SLA            = WO selesai di periode yang selesai sebelum batas resolusi
create function kpi_overview(p_from date, p_to date, p_plant uuid default null)
returns table (days int, equipment int, sched_hours numeric, downtime_h numeric, breakdowns int, availability_pct numeric, mttr_h numeric, mtbf_h numeric,
               pm_due int, pm_ontime int, pm_compliance_pct numeric, wo_created int, wo_done int, backlog int, backlog_overdue int,
               sla_done int, sla_met int, sla_pct numeric, parts_cost numeric, labor_cost numeric)
language sql stable as $$
  with d as (select (p_to - p_from + 1) as n),
  eq as (select a.id, pl.operating_hours_per_day as h from assets a join plants pl on pl.id = a.plant_id
          where a.asset_type = 'equipment' and a.status <> 'retired' and (p_plant is null or a.plant_id = p_plant)),
  sched as (select (select n from d) * coalesce(sum(h), 0) as hrs, count(*)::int as cnt from eq),
  wd as (select w.*, (w.done_at at time zone 'Asia/Jakarta')::date as done_d from work_orders w
          where w.status in ('done','closed') and (p_plant is null or w.plant_id = p_plant)
            and (w.done_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
  dt as (select coalesce(sum(downtime_hours) filter (where wo_type <> 'preventive'), 0) as h,
                count(*) filter (where wo_type in ('breakdown','emergency'))::int as bd,
                avg(actual_hours) filter (where wo_type in ('breakdown','emergency','corrective')) as mttr,
                count(*)::int as done,
                count(*) filter (where sla_resolve_due is not null)::int as sla_n,
                count(*) filter (where sla_resolve_due is not null and done_at <= sla_resolve_due)::int as sla_ok,
                coalesce(sum(w_labor.cost), 0) as labor
           from wd left join lateral (select wd.actual_hours * coalesce(t.hourly_rate, 0) as cost from technicians t where t.id = wd.technician_id) w_labor on true),
  pm as (select count(*)::int as due,
                count(*) filter (where status in ('done','closed') and (done_at at time zone 'Asia/Jakarta')::date <= pm_due + 2)::int as ok
           from work_orders where wo_type = 'preventive' and pm_due between p_from and p_to and status <> 'rejected' and (p_plant is null or plant_id = p_plant)),
  cr as (select count(*)::int as n from work_orders where (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to and (p_plant is null or plant_id = p_plant)),
  bl as (select count(*)::int as n, count(*) filter (where sla_resolve_due < now())::int as late
           from work_orders where status in ('waiting','approved','assigned','progress') and (p_plant is null or plant_id = p_plant)),
  pc as (select coalesce(sum(case kind when 'out' then qty * unit_cost else -qty * unit_cost end), 0) as cost
           from stock_tx where kind in ('out','return') and wo_id is not null and (at at time zone 'Asia/Jakarta')::date between p_from and p_to and (p_plant is null or plant_id = p_plant))
  select (select n from d), sched.cnt, round(sched.hrs, 1), round(dt.h, 2), dt.bd,
         case when sched.hrs > 0 then round(100 * (1 - dt.h / sched.hrs), 2) end,
         round(dt.mttr, 2),
         case when dt.bd > 0 then round((sched.hrs - dt.h) / dt.bd, 1) end,
         pm.due, pm.ok, case when pm.due > 0 then round(100.0 * pm.ok / pm.due, 1) end,
         cr.n, dt.done, bl.n, bl.late, dt.sla_n, dt.sla_ok, case when dt.sla_n > 0 then round(100.0 * dt.sla_ok / dt.sla_n, 1) end,
         round(pc.cost, 0), round(dt.labor, 0)
    from sched, dt, pm, cr, bl, pc
$$;

create function kpi_trend(p_months int default 12, p_plant uuid default null)
returns table (month date, breakdowns int, downtime_h numeric, mttr_h numeric, pm_due int, pm_ontime int, parts_cost numeric, labor_cost numeric)
language sql stable as $$
  with m as (select (date_trunc('month', (now() at time zone 'Asia/Jakarta')::date) - make_interval(months => g))::date as ms
               from generate_series(p_months - 1, 0, -1) g)
  select m.ms,
    (select count(*)::int from work_orders w where w.wo_type in ('breakdown','emergency') and w.status in ('done','closed') and (p_plant is null or w.plant_id = p_plant)
        and date_trunc('month', w.done_at at time zone 'Asia/Jakarta')::date = m.ms),
    (select coalesce(sum(w.downtime_hours), 0) from work_orders w where w.wo_type <> 'preventive' and w.status in ('done','closed') and (p_plant is null or w.plant_id = p_plant)
        and date_trunc('month', w.done_at at time zone 'Asia/Jakarta')::date = m.ms),
    (select round(avg(w.actual_hours), 2) from work_orders w where w.wo_type in ('breakdown','emergency','corrective') and w.status in ('done','closed') and (p_plant is null or w.plant_id = p_plant)
        and date_trunc('month', w.done_at at time zone 'Asia/Jakarta')::date = m.ms),
    (select count(*)::int from work_orders w where w.wo_type = 'preventive' and w.status <> 'rejected' and (p_plant is null or w.plant_id = p_plant) and date_trunc('month', w.pm_due)::date = m.ms),
    (select count(*)::int from work_orders w where w.wo_type = 'preventive' and w.status in ('done','closed') and (p_plant is null or w.plant_id = p_plant) and date_trunc('month', w.pm_due)::date = m.ms
        and (w.done_at at time zone 'Asia/Jakarta')::date <= w.pm_due + 2),
    (select round(coalesce(sum(case s.kind when 'out' then s.qty * s.unit_cost else -s.qty * s.unit_cost end), 0), 0) from stock_tx s
        where s.kind in ('out','return') and s.wo_id is not null and (p_plant is null or s.plant_id = p_plant) and date_trunc('month', s.at at time zone 'Asia/Jakarta')::date = m.ms),
    (select round(coalesce(sum(w.actual_hours * t.hourly_rate), 0), 0) from work_orders w join technicians t on t.id = w.technician_id
        where w.status in ('done','closed') and (p_plant is null or w.plant_id = p_plant) and date_trunc('month', w.done_at at time zone 'Asia/Jakarta')::date = m.ms)
  from m order by m.ms
$$;

create function kpi_pareto(p_from date, p_to date, p_plant uuid default null, p_limit int default 10)
returns table (asset_id uuid, code citext, name text, breakdowns int, downtime_h numeric, share_pct numeric, cum_pct numeric)
language sql stable as $$
  with x as (
    select a.id, a.code, a.name, count(*) filter (where w.wo_type in ('breakdown','emergency'))::int as bd, sum(w.downtime_hours) as dt
      from work_orders w join assets a on a.id = w.asset_id
     where w.wo_type <> 'preventive' and w.status in ('done','closed') and (p_plant is null or w.plant_id = p_plant)
       and (w.done_at at time zone 'Asia/Jakarta')::date between p_from and p_to
     group by a.id having sum(w.downtime_hours) > 0),
  t as (select sum(dt) as total from x),
  r as (select x.*, row_number() over (order by dt desc, code) as rn, sum(dt) over (order by dt desc, code) as run from x)
  select r.id, r.code, r.name, r.bd, round(r.dt, 2), round(100 * r.dt / t.total, 1), round(100 * r.run / t.total, 1)
    from r, t where r.rn <= p_limit order by r.rn
$$;

create function kpi_backlog(p_plant uuid default null)
returns table (bucket text, ord int, n int, overdue int)
language sql stable as $$
  with o as (select (current_date - (created_at at time zone 'Asia/Jakarta')::date) as age, (sla_resolve_due < now()) as late
               from work_orders where status in ('waiting','approved','assigned','progress') and (p_plant is null or plant_id = p_plant))
  select b.label, b.ord, count(o.age)::int, count(o.age) filter (where o.late)::int
    from (values ('0–3 hari',1,0,3),('4–7 hari',2,4,7),('8–14 hari',3,8,14),('15–30 hari',4,15,30),('> 30 hari',5,31,100000)) b(label, ord, lo, hi)
    left join o on o.age between b.lo and b.hi group by b.label, b.ord order by b.ord
$$;

create function kpi_technicians(p_from date, p_to date, p_plant uuid default null)
returns table (technician_id uuid, code text, name text, done int, hours numeric, avg_h numeric, sla_pct numeric)
language sql stable as $$
  select t.id, t.code, t.full_name, count(w.id)::int, coalesce(sum(w.actual_hours), 0), round(avg(w.actual_hours), 2),
         case when count(w.id) filter (where w.sla_resolve_due is not null) > 0
              then round(100.0 * count(w.id) filter (where w.done_at <= w.sla_resolve_due) / count(w.id) filter (where w.sla_resolve_due is not null), 1) end
    from technicians t
    left join work_orders w on w.technician_id = t.id and w.status in ('done','closed') and (w.done_at at time zone 'Asia/Jakarta')::date between p_from and p_to
   where t.active and (p_plant is null or t.plant_id = p_plant)
   group by t.id order by count(w.id) desc, t.full_name
$$;

create function kpi_cost_assets(p_from date, p_to date, p_plant uuid default null, p_limit int default 10)
returns table (asset_id uuid, code citext, name text, wo_count int, parts_cost numeric, labor_cost numeric, total_cost numeric)
language sql stable as $$
  with w as (select a.id, a.code, a.name, count(*)::int as n, coalesce(sum(wo.actual_hours * t.hourly_rate), 0) as labor
               from work_orders wo join assets a on a.id = wo.asset_id left join technicians t on t.id = wo.technician_id
              where wo.status in ('done','closed') and (p_plant is null or wo.plant_id = p_plant) and (wo.done_at at time zone 'Asia/Jakarta')::date between p_from and p_to group by a.id),
  p as (select wo.asset_id, sum(case s.kind when 'out' then s.qty * s.unit_cost else -s.qty * s.unit_cost end) as cost
          from stock_tx s join work_orders wo on wo.id = s.wo_id
         where s.kind in ('out','return') and (p_plant is null or s.plant_id = p_plant) and (s.at at time zone 'Asia/Jakarta')::date between p_from and p_to group by wo.asset_id)
  select w.id, w.code, w.name, w.n, round(coalesce(p.cost, 0), 0), round(w.labor, 0), round(coalesce(p.cost, 0) + w.labor, 0)
    from w left join p on p.asset_id = w.id order by coalesce(p.cost, 0) + w.labor desc, w.code limit p_limit
$$;

grant execute on function kpi_overview(date,date,uuid), kpi_trend(int,uuid), kpi_pareto(date,date,uuid,int), kpi_backlog(uuid),
  kpi_technicians(date,date,uuid), kpi_cost_assets(date,date,uuid,int) to maintainhub_app;
commit;
