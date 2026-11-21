-- 0020: Beban kerja teknisi, kebutuhan tenaga, lembur, matriks skill.
-- Skill = katalog per organisasi. Level teknisi 0-4 (0 belum, 1 dasar/dibimbing, 2 terbatas/arahan, 3 mandiri, 4 ahli/pelatih).
-- WO dan rencana PM boleh menyebut skill yang dibutuhkan + level minimum.
begin;

create table skills (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  code         text not null check (code ~ '^[A-Za-z0-9_-]{2,20}$'),
  name         text not null check (length(btrim(name)) > 0 and length(name) <= 80),
  min_coverage int  not null default 2 check (min_coverage between 0 and 50),   -- minimal teknisi level >= 3 per shift yang beroperasi
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (org_id, code),
  unique (org_id, id)
);

create table technician_skills (
  org_id          uuid not null,
  technician_id   uuid not null,
  skill_id        uuid not null,
  level           smallint not null check (level between 0 and 4),
  certified_until date,
  note            text check (length(note) <= 200),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references users(id) on delete set null,
  primary key (technician_id, skill_id),
  foreign key (org_id, technician_id) references technicians(org_id, id) on delete cascade,
  foreign key (org_id, skill_id) references skills(org_id, id) on delete cascade
);
create index tech_skills_skill on technician_skills (skill_id);

create table technician_absences (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  technician_id uuid not null,
  from_date     date not null,
  to_date       date not null,
  reason        text not null check (reason in ('cuti','sakit','pelatihan','lainnya')),
  note          text check (length(note) <= 200),
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (to_date >= from_date and to_date - from_date <= 366),
  foreign key (org_id, technician_id) references technicians(org_id, id) on delete cascade
);
create index tech_abs_range on technician_absences (org_id, from_date, to_date);

-- Parameter perhitungan: satu baris per organisasi (dibuat saat pertama dibaca/disimpan; nilai bawaan di bawah)
create table workforce_settings (
  org_id            uuid primary key references organizations(id) on delete cascade,
  productive_factor numeric(3,2) not null default 0.70 check (productive_factor between 0.30 and 1.00), -- porsi jam kerja yang benar-benar dipakai mengerjakan WO (wrench time)
  reserve_pct       int          not null default 10  check (reserve_pct between 0 and 60),             -- cadangan minimal pekerjaan tak terencana, % dari kapasitas
  workdays_per_week smallint     not null default 6   check (workdays_per_week between 5 and 7),
  ot_max_day_h      numeric(3,1) not null default 4   check (ot_max_day_h between 0 and 12),
  ot_max_week_h     numeric(4,1) not null default 18  check (ot_max_week_h between 0 and 60),
  target_util       numeric(3,2) not null default 0.85 check (target_util between 0.50 and 1.00),
  updated_at        timestamptz not null default now()
);

-- kebutuhan skill pada WO dan rencana PM
alter table work_orders add column skill_id uuid, add column skill_min_level smallint not null default 2 check (skill_min_level between 1 and 4);
alter table work_orders add constraint wo_skill_fk foreign key (org_id, skill_id) references skills(org_id, id) on delete set null (skill_id);
alter table pm_plans add column skill_id uuid, add column skill_min_level smallint not null default 2 check (skill_min_level between 1 and 4);
alter table pm_plans add constraint pm_skill_fk foreign key (org_id, skill_id) references skills(org_id, id) on delete set null (skill_id);
create index wo_skill_idx on work_orders (skill_id) where status not in ('closed','rejected');

-- WO PM otomatis mewarisi skill dari rencananya
create or replace function pm_generate(p_org uuid, p_today date default current_date) returns int language plpgsql as $$
declare r record; n int := 0;
begin
  for r in select * from pm_plans where org_id = p_org and active and trigger_type = 'calendar'
            and next_due is not null and next_due - lead_days <= p_today loop
    begin
      insert into work_orders (org_id, plant_id, wo_type, source, title, description, asset_id, priority, est_hours, pm_plan_id, pm_due, skill_id, skill_min_level)
      values (r.org_id, r.plant_id, 'preventive', 'pm_auto', 'PM: ' || r.name, '', r.asset_id, r.priority, r.est_hours, r.id, r.next_due, r.skill_id, r.skill_min_level);
      n := n + 1;
    exception when unique_violation then null;
    end;
  end loop;
  return n;
end $$;

-- RLS
do $$ declare t text; begin
  foreach t in array array['skills','technician_skills','technician_absences','workforce_settings'] loop
    execute format('alter table %I enable row level security', t); execute format('alter table %I force row level security', t);
    execute format('create policy tenant on %I using (org_id = app_org()) with check (org_id = app_org())', t);
  end loop;
end $$;
-- baris skill/absensi hanya terlihat bila teknisinya terlihat (ikut pembatasan plant)
create policy via_tech on technician_skills as restrictive using (exists (select 1 from technicians t where t.id = technician_id));
create policy via_tech on technician_absences as restrictive using (exists (select 1 from technicians t where t.id = technician_id));

commit;
