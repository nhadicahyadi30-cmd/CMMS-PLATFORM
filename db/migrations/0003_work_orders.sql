-- 0003: work order, SLA, alur approval, log, lampiran
begin;

create table sla_policies (
  org_id      uuid not null references organizations(id) on delete cascade,
  priority    text not null check (priority in ('P1','P2','P3','P4')),
  label       text not null,
  respond_min int not null check (respond_min > 0),
  resolve_min int not null check (resolve_min >= respond_min),
  primary key (org_id, priority)
);

create table wo_counters (
  org_id uuid not null, plant_id uuid not null, yymm char(4) not null, last int not null default 0,
  primary key (org_id, plant_id, yymm)
);

-- nomor WO berurutan per plant per bulan: WO-<KODEPLANT>-<YYMM>-<NNNN>
create function next_wo_code(p_org uuid, p_plant uuid, p_at timestamptz default now()) returns text language plpgsql as $$
declare ym char(4) := to_char(p_at at time zone 'Asia/Jakarta', 'YYMM'); n int; pc citext;
begin
  insert into wo_counters (org_id, plant_id, yymm, last) values (p_org, p_plant, ym, 1)
  on conflict (org_id, plant_id, yymm) do update set last = wo_counters.last + 1 returning last into n;
  select code into pc from plants where id = p_plant;
  return 'WO-' || upper(pc) || '-' || ym || '-' || lpad(n::text, 4, '0');
end $$;

create table work_orders (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  plant_id      uuid not null,
  code          text not null,
  wo_type       text not null check (wo_type in ('breakdown','corrective','preventive','emergency')),
  source        text not null default 'manual' check (source in ('manual','pm_auto','inspection','whatsapp','rca')),
  title         text not null check (length(btrim(title)) > 0),
  description   text not null default '',
  asset_id      uuid not null,
  priority      text not null check (priority in ('P1','P2','P3','P4')),
  status        text not null default 'waiting' check (status in ('waiting','approved','assigned','progress','done','closed','rejected')),
  requester_id  uuid references users(id) on delete set null,
  requester_text text,
  technician_id uuid,
  est_hours     numeric(5,1) not null default 2 check (est_hours >= 0),
  actual_hours  numeric(6,2) check (actual_hours >= 0),
  downtime_hours numeric(6,2) not null default 0 check (downtime_hours >= 0),
  result_notes  text,
  pm_plan_id    uuid,                 -- diisi oleh migrasi 0004 (FK)
  pm_due        date,
  created_at    timestamptz not null default now(),
  approved_at   timestamptz, approved_by uuid references users(id),
  rejected_at   timestamptz, reject_reason text,
  assigned_at   timestamptz,
  started_at    timestamptz,
  done_at       timestamptz,
  closed_at     timestamptz, closed_by uuid references users(id),
  sla_respond_due timestamptz,
  sla_resolve_due timestamptz,
  updated_at    timestamptz not null default now(),
  foreign key (org_id, plant_id) references plants(org_id, id),
  foreign key (org_id, asset_id) references assets(org_id, id),
  foreign key (org_id, technician_id) references technicians(org_id, id),
  unique (org_id, code),
  unique (org_id, id),
  check (status <> 'rejected' or reject_reason is not null),
  check (status not in ('done','closed') or actual_hours is not null)
);
create index wo_status_idx on work_orders (org_id, plant_id, status);
create index wo_asset_idx on work_orders (asset_id, created_at desc);
create index wo_tech_idx on work_orders (technician_id) where status in ('assigned','progress');
create index wo_open_idx on work_orders (org_id, created_at) where status not in ('closed','rejected');

-- INSERT: nomor otomatis, status selalu 'waiting' (semua WO wajib approval Supervisor), SLA dari kebijakan
create function wo_before_insert() returns trigger language plpgsql as $$
declare s sla_policies%rowtype; a assets%rowtype;
begin
  select * into a from assets where id = new.asset_id;
  if a.plant_id is distinct from new.plant_id then
    raise exception 'Aset % bukan milik plant WO ini', a.code using errcode='23514';
  end if;
  new.status := 'waiting';
  new.approved_at := null; new.approved_by := null; new.closed_at := null; new.closed_by := null;
  new.code := coalesce(new.code, next_wo_code(new.org_id, new.plant_id, new.created_at));
  select * into s from sla_policies where org_id = new.org_id and priority = new.priority;
  if found then
    new.sla_respond_due := new.created_at + make_interval(mins => s.respond_min);
    new.sla_resolve_due := new.created_at + make_interval(mins => s.resolve_min);
  end if;
  return new;
end $$;
-- kolom code NOT NULL dicek setelah trigger; beri default agar insert tanpa kode lolos ke trigger
alter table work_orders alter column code set default '';
create function wo_fix_code() returns trigger language plpgsql as $$
begin if new.code = '' then new.code := null; end if; return new; end $$;
create trigger wo_a_fix before insert on work_orders for each row execute function wo_fix_code();
create trigger wo_b_ins before insert on work_orders for each row execute function wo_before_insert();

-- UPDATE: validasi transisi status + wewenang approval
create function wo_guard() returns trigger language plpgsql as $$
declare ok boolean; r text;
begin
  if old.status in ('closed','rejected') then
    raise exception 'WO % sudah % dan tidak dapat diubah', old.code, old.status using errcode='23514';
  end if;
  if new.status <> old.status then
    ok := (old.status, new.status) in (('waiting','approved'),('waiting','rejected'),('approved','assigned'),
          ('assigned','approved'),('assigned','progress'),('progress','done'),('done','progress'),('done','closed'));
    if not ok then
      raise exception 'Transisi status WO tidak valid: % -> %', old.status, new.status using errcode='23514';
    end if;
    if new.status in ('approved','rejected','closed') then
      -- approval/penutupan hanya oleh Supervisor atau Admin
      select role_code into r from users where id = case new.status when 'closed' then new.closed_by else new.approved_by end and active;
      if r is null or r not in ('supervisor','admin') then
        raise exception 'WO harus %s oleh Supervisor atau Admin', case new.status when 'closed' then 'ditutup' when 'approved' then 'disetujui' else 'ditolak' end using errcode='42501';
      end if;
    end if;
    if new.status = 'approved' and old.status = 'waiting' then new.approved_at := coalesce(new.approved_at, now()); end if;
    if new.status = 'rejected' then new.rejected_at := coalesce(new.rejected_at, now()); end if;
    if new.status = 'assigned' then
      if new.technician_id is null then raise exception 'Teknisi wajib dipilih saat menugaskan WO' using errcode='23514'; end if;
      new.assigned_at := now();
    end if;
    if new.status = 'progress' and old.status = 'assigned' then new.started_at := now(); end if;
    if new.status = 'done' then new.done_at := now(); end if;
    if new.status = 'closed' then new.closed_at := now(); end if;
  end if;
  return new;
end $$;
create trigger wo_g before update on work_orders for each row execute function wo_guard();
create trigger wo_upd before update on work_orders for each row execute function set_updated_at();

create table wo_logs (
  id            bigint generated always as identity primary key,
  org_id        uuid not null,
  wo_id         uuid not null references work_orders(id) on delete cascade,
  at            timestamptz not null default now(),
  actor_user_id uuid references users(id) on delete set null,
  actor_text    text,
  text          text not null
);
create index on wo_logs (wo_id, at);
create trigger wo_logs_no_change before update or delete on wo_logs for each row execute function forbid_change();

create table wo_attachments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  wo_id       uuid not null references work_orders(id) on delete cascade,
  kind        text not null check (kind in ('photo','document','voice')),
  s3_key      text not null,
  filename    text not null,
  mime        text not null,
  size_bytes  bigint not null check (size_bytes between 1 and 26214400),
  via         text not null default 'web' check (via in ('web','whatsapp')),
  wa_message_id text,
  uploaded_by uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on wo_attachments (wo_id);

commit;
