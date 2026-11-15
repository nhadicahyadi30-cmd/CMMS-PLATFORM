-- 0011: Sparepart & Inventory (stok, mutasi append-only, BOM PM, purchase request)
begin;

create table doc_counters (
  org_id uuid not null, plant_id uuid not null, kind text not null, yymm char(4) not null, last int not null default 0,
  primary key (org_id, plant_id, kind, yymm)
);
create function next_doc_code(p_kind text, p_org uuid, p_plant uuid) returns text language plpgsql as $$
declare ym char(4) := to_char(now() at time zone 'Asia/Jakarta', 'YYMM'); n int; pc citext;
begin
  insert into doc_counters (org_id, plant_id, kind, yymm, last) values (p_org, p_plant, p_kind, ym, 1)
  on conflict (org_id, plant_id, kind, yymm) do update set last = doc_counters.last + 1 returning last into n;
  select code into pc from plants where id = p_plant;
  return p_kind || '-' || upper(pc) || '-' || ym || '-' || lpad(n::text, 4, '0');
end $$;

create table parts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  plant_id    uuid not null,
  code        citext not null,
  name        text not null,
  category    text not null default 'umum',
  unit        text not null default 'pcs',
  location    text,
  on_hand     numeric(12,2) not null default 0 check (on_hand >= 0),   -- hanya diubah trigger stock_tx
  min_stock   numeric(12,2) not null default 0 check (min_stock >= 0),
  reorder_qty numeric(12,2) not null default 1 check (reorder_qty > 0),
  unit_cost   numeric(14,2) not null default 0 check (unit_cost >= 0),
  critical    boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (org_id, plant_id) references plants(org_id, id),
  unique (org_id, code),
  unique (org_id, id)
);
create trigger parts_upd before update on parts for each row execute function set_updated_at();
create index parts_plant_idx on parts (plant_id) where active;
create index parts_name_trgm on parts using gin (name gin_trgm_ops);
-- on_hand tidak boleh diubah langsung oleh aplikasi
create function parts_protect_onhand() returns trigger language plpgsql as $$
begin
  if new.on_hand is distinct from old.on_hand and pg_trigger_depth() < 2 then  -- hanya sah bila dipicu dari trigger stock_tx (tidak bisa dipalsukan lewat SQL biasa)
    raise exception 'Stok hanya boleh berubah lewat mutasi stok' using errcode='42501';
  end if;
  return new;
end $$;
create trigger parts_protect before update on parts for each row execute function parts_protect_onhand();
create function parts_init_onhand() returns trigger language plpgsql as $$
begin
  if new.on_hand <> 0 then raise exception 'Stok awal dimasukkan lewat mutasi stok (penerimaan/penyesuaian)' using errcode='23514'; end if;
  return new;
end $$;
create trigger parts_init before insert on parts for each row execute function parts_init_onhand();

create table stock_tx (
  id        bigint generated always as identity primary key,
  org_id    uuid not null,
  plant_id  uuid not null,
  part_id   uuid not null references parts(id),
  kind      text not null check (kind in ('in','out','return','adjust')),
  qty       numeric(12,2) not null check (qty <> 0),   -- in/out/return: positif; adjust: bertanda
  delta     numeric(12,2) not null default 0,           -- diisi trigger
  unit_cost numeric(14,2),
  wo_id     uuid references work_orders(id),
  pr_id     uuid,
  note      text,
  by_user   uuid references users(id) on delete set null,
  at        timestamptz not null default now(),
  check (kind = 'adjust' or qty > 0),
  check (kind <> 'adjust' or (note is not null and length(btrim(note)) > 0))
);
create index on stock_tx (part_id, at desc);
create index on stock_tx (wo_id) where wo_id is not null;
create trigger stock_tx_no_change before update or delete on stock_tx for each row execute function forbid_change();

create function stock_tx_apply() returns trigger language plpgsql as $$
declare p parts%rowtype; w work_orders%rowtype;
begin
  select * into p from parts where id = new.part_id for update;
  if p.plant_id <> new.plant_id then raise exception 'Suku cadang bukan milik plant ini' using errcode='23514'; end if;
  if new.wo_id is not null then
    select * into w from work_orders where id = new.wo_id;
    if w.plant_id is distinct from new.plant_id then raise exception 'WO bukan milik plant ini' using errcode='23514'; end if;
    if new.kind = 'out' and w.status in ('closed','rejected','waiting') then
      raise exception 'Suku cadang tidak bisa dikeluarkan untuk WO berstatus %', w.status using errcode='23514';
    end if;
  end if;
  new.delta := case new.kind when 'out' then -new.qty else new.qty end;
  if p.on_hand + new.delta < 0 then
    raise exception 'Stok % tidak cukup: tersedia %, diminta %', p.code, p.on_hand, abs(new.delta) using errcode='23514';
  end if;
  if new.kind in ('out','return') then new.unit_cost := coalesce(new.unit_cost, p.unit_cost); end if;
  update parts set on_hand = on_hand + new.delta,
                   unit_cost = case when new.kind = 'in' and new.unit_cost is not null then new.unit_cost else unit_cost end
   where id = p.id;
  return new;
end $$;
create trigger stock_tx_a before insert on stock_tx for each row execute function stock_tx_apply();

-- BOM suku cadang untuk rencana PM
create table pm_parts (
  org_id     uuid not null,
  pm_plan_id uuid not null references pm_plans(id) on delete cascade,
  part_id    uuid not null references parts(id),
  qty        numeric(12,2) not null check (qty > 0),
  primary key (pm_plan_id, part_id)
);

-- Purchase request
create table purchase_requests (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  plant_id     uuid not null,
  code         text not null,
  status       text not null default 'draft' check (status in ('draft','submitted','approved','rejected','ordered','received')),
  notes        text,
  requested_by uuid references users(id) on delete set null,
  approved_by  uuid references users(id), approved_at timestamptz, reject_reason text,
  ordered_at   timestamptz, received_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (org_id, plant_id) references plants(org_id, id),
  unique (org_id, code), unique (org_id, id),
  check (status <> 'rejected' or reject_reason is not null)
);
create trigger pr_upd before update on purchase_requests for each row execute function set_updated_at();
create function pr_before_insert() returns trigger language plpgsql as $$
begin
  new.status := 'draft'; new.approved_by := null; new.approved_at := null;
  if new.code is null or new.code = '' then new.code := next_doc_code('PR', new.org_id, new.plant_id); end if;
  return new;
end $$;
alter table purchase_requests alter column code set default '';
create trigger pr_ins before insert on purchase_requests for each row execute function pr_before_insert();
create function pr_guard() returns trigger language plpgsql as $$
declare r text;
begin
  if old.status in ('rejected','received') then raise exception 'PR % sudah % dan tidak dapat diubah', old.code, old.status using errcode='23514'; end if;
  if new.status <> old.status then
    if (old.status, new.status) not in (('draft','submitted'),('submitted','approved'),('submitted','rejected'),('approved','ordered'),('ordered','received')) then
      raise exception 'Transisi status PR tidak valid: % -> %', old.status, new.status using errcode='23514';
    end if;
    if new.status in ('approved','rejected') then
      select role_code into r from users where id = new.approved_by and active;
      if r is null or r not in ('supervisor','admin') then raise exception 'PR harus disetujui atau ditolak oleh Supervisor atau Admin' using errcode='42501'; end if;
      new.approved_at := now();
    end if;
    if new.status = 'ordered' then new.ordered_at := now(); end if;
    if new.status = 'received' then new.received_at := now(); end if;
    if new.status = 'submitted' and not exists (select 1 from pr_items where pr_id = old.id) then
      raise exception 'PR tanpa item tidak bisa diajukan' using errcode='23514';
    end if;
  end if;
  return new;
end $$;

create table pr_items (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  pr_id        uuid not null references purchase_requests(id) on delete cascade,
  part_id      uuid not null references parts(id),
  qty          numeric(12,2) not null check (qty > 0),
  qty_received numeric(12,2) not null default 0 check (qty_received >= 0),
  unique (pr_id, part_id),
  check (qty_received <= qty)
);
create index on pr_items (part_id);
create trigger pr_g before update on purchase_requests for each row execute function pr_guard();
-- item hanya bisa diubah saat draft; saat 'ordered' hanya qty_received yang boleh berubah
create function pr_items_guard() returns trigger language plpgsql as $$
declare st text; pid uuid := coalesce(new.pr_id, old.pr_id);
begin
  select status into st from purchase_requests where id = pid;
  if st = 'draft' then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and st = 'ordered' and new.qty = old.qty and new.part_id = old.part_id and new.pr_id = old.pr_id then return new; end if;
  raise exception 'Item PR hanya bisa diubah saat berstatus draft' using errcode='23514';
end $$;
create trigger pr_items_g before insert or update or delete on pr_items for each row execute function pr_items_guard();

-- RLS
do $$
declare t text;
begin
  foreach t in array array['parts','stock_tx','purchase_requests'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy tenant_plant on %I using (org_id = app_org() and app_plant_ok(plant_id)) with check (org_id = app_org() and app_plant_ok(plant_id))', t);
  end loop;
  foreach t in array array['pm_parts','pr_items','doc_counters'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy tenant on %I using (org_id = app_org()) with check (org_id = app_org())', t);
  end loop;
end $$;
create policy item_plant on pr_items as restrictive using (exists (select 1 from purchase_requests p where p.id = pr_id));
create policy bom_plant on pm_parts as restrictive using (exists (select 1 from pm_plans p where p.id = pm_plan_id));

grant select, insert, update, delete on parts, stock_tx, pm_parts, purchase_requests, pr_items, doc_counters to maintainhub_app;
revoke update, delete on stock_tx from maintainhub_app;
grant usage, select on all sequences in schema public to maintainhub_app;

commit;
