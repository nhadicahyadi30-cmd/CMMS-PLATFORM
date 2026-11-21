-- 0023: Peran Produksi, Inspeksi & Checklist, Izin Kerja (Permit to Work) + LOTO
-- Modul baru: 11 = Inspeksi & Checklist, 12 = Izin Kerja (PTW).
-- Alur PTW: diajukan (teknisi) -> disetujui (Supervisor/Admin) -> area diserahkan (Produksi/Admin)
--           -> aktif (LOTO terpasang + nol energi terverifikasi) -> selesai (semua gembok dilepas) -> ditutup (area diterima kembali oleh Produksi/Admin).
-- Semua aturan wewenang dan urutan dijaga di database (trigger), bukan hanya di API.
begin;

-- ---------- peran & modul ----------
do $$
declare c record;
begin
  for c in select conrelid::regclass::text as tbl, conname from pg_constraint
            where contype = 'c' and conrelid in ('roles'::regclass, 'role_modules'::regclass, 'notifications'::regclass)
              and (pg_get_constraintdef(oid) like '%admin%' or pg_get_constraintdef(oid) like '%module%' or pg_get_constraintdef(oid) like '%wo_new%')
  loop execute format('alter table %s drop constraint %I', c.tbl, c.conname); end loop;
end $$;
alter table roles add constraint roles_code_check check (code in ('admin','supervisor','planner','technician','production'));
alter table role_modules add constraint role_modules_module_check check (module between 1 and 12);
alter table notifications add constraint notifications_kind_check check (kind in ('wo_new','wo_assigned','wo_pm','alarm','ptw','inspection'));
insert into roles values ('production', 'Produksi') on conflict do nothing;

insert into role_modules (org_id, role_code, module)
select o.id, x.r, x.m from organizations o
  cross join (values ('admin',11),('admin',12),('supervisor',11),('supervisor',12),('planner',11),
                     ('technician',11),('technician',12),('production',3),('production',11),('production',12)) x(r, m)
on conflict do nothing;

create or replace function provision_org(p_slug text, p_name text) returns uuid language plpgsql as $$
declare o uuid;
begin
  insert into organizations (slug, name) values (p_slug, p_name) returning id into o;
  insert into role_modules (org_id, role_code, module)
  select o, 'admin', g from generate_series(1,12) g
  union all select o, 'supervisor', g from unnest(array[1,2,3,4,5,6,7,8,9,11,12]) g
  union all select o, 'planner', g from unnest(array[1,2,3,5,6,7,8,9,11]) g
  union all select o, 'technician', g from unnest(array[1,2,3,5,11,12]) g
  union all select o, 'production', g from unnest(array[3,11,12]) g;
  insert into sla_policies (org_id, priority, label, respond_min, resolve_min) values
    (o,'P1','Kritis',15,240), (o,'P2','Tinggi',60,480), (o,'P3','Sedang',240,1440), (o,'P4','Rendah',1440,4320);
  perform seed_failure_modes(o);
  return o;
end $$;

create function user_role(p_user uuid) returns text language sql stable as $$
  select role_code from users where id = p_user and active
$$;

-- ======================================================================
-- INSPEKSI & CHECKLIST
-- ======================================================================
create table inspection_templates (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  plant_id       uuid not null,
  code           citext not null check (code ~ '^[A-Za-z0-9._-]{2,30}$'),
  name           text not null check (length(btrim(name)) > 0),
  description    text not null default '',
  asset_id       uuid,
  audience       text not null default 'any' check (audience in ('any','technician','production')),
  frequency_days int check (frequency_days is null or frequency_days between 1 and 366),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (org_id, plant_id) references plants(org_id, id),
  foreign key (org_id, asset_id) references assets(org_id, id),
  unique (org_id, code), unique (org_id, id)
);
create trigger insp_tpl_upd before update on inspection_templates for each row execute function set_updated_at();

create function insp_tpl_guard() returns trigger language plpgsql as $$
begin
  if new.asset_id is not null and not exists (select 1 from assets where id = new.asset_id and plant_id = new.plant_id) then
    raise exception 'Aset bukan milik plant ini' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger insp_tpl_g before insert or update on inspection_templates for each row execute function insp_tpl_guard();

create table inspection_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  template_id uuid not null references inspection_templates(id) on delete cascade,
  seq         int not null check (seq > 0),
  text        text not null check (length(btrim(text)) > 0),
  kind        text not null default 'check' check (kind in ('check','number','text')),
  unit        text,
  min_val     numeric,
  max_val     numeric,
  required    boolean not null default true,
  critical    boolean not null default false,
  unique (template_id, seq),
  check (kind = 'number' or (min_val is null and max_val is null)),
  check (min_val is null or max_val is null or min_val <= max_val)
);

create table inspections (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  plant_id     uuid not null,
  code         text not null,
  template_id  uuid not null,
  asset_id     uuid not null,
  performed_by uuid not null references users(id),
  performed_at timestamptz not null,
  created_at   timestamptz not null default now(),
  notes        text not null default '',
  abnormal_count int not null default 0,
  wo_id        uuid,
  client_uid   uuid,                       -- kunci idempotensi dari perangkat (mode offline kirim ulang tanpa duplikat)
  foreign key (org_id, plant_id) references plants(org_id, id),
  foreign key (org_id, template_id) references inspection_templates(org_id, id),
  foreign key (org_id, asset_id) references assets(org_id, id),
  foreign key (org_id, wo_id) references work_orders(org_id, id),
  unique (org_id, code), unique (org_id, id), unique (org_id, client_uid)
);
create index on inspections (template_id, performed_at desc);
create index on inspections (asset_id, performed_at desc);
create index on inspections (plant_id, performed_at desc);

create table inspection_results (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  inspection_id uuid not null references inspections(id) on delete cascade,
  item_id       uuid references inspection_items(id) on delete set null,
  seq           int not null,
  text          text not null,
  kind          text not null,
  unit          text,
  min_val       numeric, max_val numeric,
  critical      boolean not null default false,
  value_ok      boolean,
  value_num     numeric,
  value_text    text,
  abnormal      boolean not null default false,
  note          text not null default ''
);
create index on inspection_results (inspection_id, seq);

-- Catat satu inspeksi lengkap sekaligus (dipakai online maupun sinkron offline). Idempoten lewat p_client.
-- p_results: [{"itemId": uuid, "ok": bool, "value": number, "text": string, "note": string}, ...]
create function inspection_record(p_user uuid, p_template uuid, p_asset uuid, p_performed timestamptz, p_notes text, p_results jsonb, p_client uuid)
returns table (id uuid, code text, abnormal int, wo_id uuid, duplicate boolean) language plpgsql as $$
declare t inspection_templates%rowtype; urole text; o uuid := app_org(); a uuid; ins uuid; icode text; it record; r jsonb;
        v_ok boolean; v_num numeric; v_txt text; ab boolean; n_ab int := 0; any_crit boolean := false; ab_list text := ''; first_ab text; wid uuid; perf timestamptz;
begin
  if p_client is not null then
    select i.id, i.code, i.abnormal_count, i.wo_id into ins, icode, n_ab, wid from inspections i where i.org_id = o and i.client_uid = p_client;
    if found then return query select ins, icode, n_ab, wid, true; return; end if;
    ins := null; icode := null; n_ab := 0; wid := null;   -- select into tanpa baris mengosongkan variabel
  end if;
  select * into t from inspection_templates where inspection_templates.id = p_template;
  if not found then raise exception 'Template inspeksi tidak ditemukan' using errcode = '23514'; end if;
  if not t.active then raise exception 'Template % tidak aktif', t.code using errcode = '23514'; end if;
  urole := user_role(p_user);
  if urole is null then raise exception 'Pengguna tidak aktif' using errcode = '42501'; end if;
  if t.audience = 'production' and urole not in ('production','admin','supervisor') then raise exception 'Checklist ini khusus Produksi' using errcode = '42501'; end if;
  if t.audience = 'technician' and urole = 'production' then raise exception 'Checklist ini khusus Teknisi' using errcode = '42501'; end if;
  a := coalesce(p_asset, t.asset_id);
  if a is null then raise exception 'Pilih aset yang diperiksa' using errcode = '23514'; end if;
  if t.asset_id is not null and a <> t.asset_id then raise exception 'Template ini hanya untuk aset tertentu' using errcode = '23514'; end if;
  if not exists (select 1 from assets where assets.id = a and plant_id = t.plant_id) then raise exception 'Aset bukan milik plant template' using errcode = '23514'; end if;
  perf := least(coalesce(p_performed, now()), now());
  if perf < now() - interval '30 days' then raise exception 'Data inspeksi terlalu lama (maksimal 30 hari)' using errcode = '23514'; end if;
  if jsonb_typeof(coalesce(p_results, '[]'::jsonb)) <> 'array' then raise exception 'Hasil harus berupa daftar' using errcode = '23514'; end if;
  if exists (select 1 from jsonb_array_elements(p_results) e where not exists (select 1 from inspection_items x where x.template_id = t.id and x.id::text = e->>'itemId')) then
    raise exception 'Ada butir yang bukan bagian dari template' using errcode = '23514';
  end if;

  icode := next_doc_code('INS', o, t.plant_id);
  insert into inspections (org_id, plant_id, code, template_id, asset_id, performed_by, performed_at, notes, client_uid)
  values (o, t.plant_id, icode, t.id, a, p_user, perf, coalesce(btrim(p_notes), ''), p_client) returning inspections.id into ins;

  for it in select * from inspection_items x where x.template_id = t.id order by x.seq loop
    select e into r from jsonb_array_elements(p_results) e where e->>'itemId' = it.id::text limit 1;
    v_ok := null; v_num := null; v_txt := null; ab := false;
    if it.kind = 'check' then
      v_ok := (r->>'ok')::boolean;
      if v_ok is null and it.required then raise exception 'Butir wajib belum diisi: %', it.text using errcode = '23514'; end if;
      ab := coalesce(v_ok = false, false);
    elsif it.kind = 'number' then
      v_num := nullif(r->>'value', '')::numeric;
      if v_num is null and it.required then raise exception 'Butir wajib belum diisi: %', it.text using errcode = '23514'; end if;
      ab := v_num is not null and ((it.min_val is not null and v_num < it.min_val) or (it.max_val is not null and v_num > it.max_val));
    else
      v_txt := nullif(btrim(coalesce(r->>'text', '')), '');
      if v_txt is null and it.required then raise exception 'Butir wajib belum diisi: %', it.text using errcode = '23514'; end if;
    end if;
    if ab then
      n_ab := n_ab + 1; any_crit := any_crit or it.critical;
      first_ab := coalesce(first_ab, it.text);
      ab_list := ab_list || '- ' || it.text || case when it.kind = 'number' then ' (terukur ' || v_num || coalesce(' ' || it.unit, '') || ')' else '' end || E'\n';
    end if;
    insert into inspection_results (org_id, inspection_id, item_id, seq, text, kind, unit, min_val, max_val, critical, value_ok, value_num, value_text, abnormal, note)
    values (o, ins, it.id, it.seq, it.text, it.kind, it.unit, it.min_val, it.max_val, it.critical, v_ok, v_num, v_txt, ab, left(coalesce(r->>'note', ''), 500));
  end loop;

  if n_ab > 0 then
    insert into work_orders (org_id, plant_id, wo_type, source, title, description, asset_id, priority, requester_id)
    values (o, t.plant_id, 'corrective', 'inspection', left('Temuan inspeksi: ' || first_ab, 200),
            'Dari inspeksi ' || icode || ' (' || t.name || E')\nButir tidak normal:\n' || ab_list, a, case when any_crit then 'P2' else 'P3' end, p_user)
    returning work_orders.id into wid;
  end if;
  update inspections set abnormal_count = n_ab, wo_id = wid where inspections.id = ins;
  return query select ins, icode, n_ab, wid, false;
end $$;

-- Daftar template yang jatuh tempo (berdasarkan frekuensi dan inspeksi terakhir)
create function inspection_due(p_plant uuid default null)
returns table (template_id uuid, code citext, name text, plant_id uuid, asset_id uuid, audience text, frequency_days int, last_at timestamptz, due_at timestamptz, overdue_days int)
language sql stable as $$
  select t.id, t.code, t.name, t.plant_id, t.asset_id, t.audience, t.frequency_days, l.last_at,
         coalesce(l.last_at, t.created_at) + make_interval(days => t.frequency_days),
         floor(extract(epoch from now() - (coalesce(l.last_at, t.created_at) + make_interval(days => t.frequency_days))) / 86400)::int
    from inspection_templates t
    left join lateral (select max(i.performed_at) as last_at from inspections i where i.template_id = t.id) l on true
   where t.active and t.frequency_days is not null and (p_plant is null or t.plant_id = p_plant)
   order by 10 desc, t.code
$$;

-- ======================================================================
-- IZIN KERJA (PTW) + LOTO
-- ======================================================================
create table loto_points (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  plant_id      uuid not null,
  asset_id      uuid not null,
  seq           int not null check (seq > 0),
  description   text not null check (length(btrim(description)) > 0),
  energy_type   text not null default 'electrical' check (energy_type in ('electrical','mechanical','hydraulic','pneumatic','thermal','chemical','gravity','other')),
  method        text not null default '',
  active        boolean not null default true,
  foreign key (org_id, plant_id) references plants(org_id, id),
  foreign key (org_id, asset_id) references assets(org_id, id),
  unique (asset_id, seq)
);

create table permits (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  plant_id      uuid not null,
  code          text not null default '',
  asset_id      uuid not null,
  wo_id         uuid,
  work_type     text not null default 'general' check (work_type in ('general','electrical','hot_work','confined_space','height','excavation','chemical')),
  title         text not null check (length(btrim(title)) > 0),
  hazards       text not null default '',
  precautions   text not null default '',
  requires_loto boolean not null default true,
  team          text not null default '',
  valid_from    timestamptz not null,
  valid_until   timestamptz not null,
  status        text not null default 'requested' check (status in ('requested','approved','handed_over','active','completed','closed','rejected','cancelled')),
  requested_by  uuid not null references users(id),
  created_at    timestamptz not null default now(),
  approved_by   uuid references users(id), approved_at timestamptz,
  reject_reason text, rejected_at timestamptz,
  handover_by   uuid references users(id), handover_at timestamptz, handover_note text,
  activated_by  uuid references users(id), activated_at timestamptz,
  completed_by  uuid references users(id), completed_at timestamptz, completion_note text,
  returned_by   uuid references users(id), returned_at timestamptz,
  cancelled_by  uuid references users(id), cancelled_at timestamptz, cancel_reason text,
  updated_at    timestamptz not null default now(),
  foreign key (org_id, plant_id) references plants(org_id, id),
  foreign key (org_id, asset_id) references assets(org_id, id),
  foreign key (org_id, wo_id) references work_orders(org_id, id),
  unique (org_id, code), unique (org_id, id),
  check (valid_until > valid_from and valid_until <= valid_from + interval '24 hours'),
  check (status <> 'rejected' or reject_reason is not null),
  check (status <> 'cancelled' or cancel_reason is not null)
);
create index on permits (plant_id, status);
create index on permits (asset_id, status);
create trigger permits_upd before update on permits for each row execute function set_updated_at();

create table permit_points (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  permit_id      uuid not null references permits(id) on delete cascade,
  loto_point_id  uuid references loto_points(id) on delete set null,
  seq            int not null check (seq > 0),
  description    text not null check (length(btrim(description)) > 0),
  energy_type    text not null default 'electrical' check (energy_type in ('electrical','mechanical','hydraulic','pneumatic','thermal','chemical','gravity','other')),
  method         text not null default '',
  zero_verified_by uuid references users(id),
  zero_verified_at timestamptz,
  unique (permit_id, seq)
);
create table permit_locks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  permit_id   uuid not null references permits(id) on delete cascade,
  point_id    uuid not null references permit_points(id) on delete cascade,
  lock_no     text not null check (length(btrim(lock_no)) > 0),
  applied_by  uuid not null references users(id),
  applied_at  timestamptz not null default now(),
  removed_by  uuid references users(id),
  removed_at  timestamptz,
  override_reason text,
  unique (permit_id, lock_no)
);
create index on permit_locks (point_id);
create table permit_events (
  id          bigint generated always as identity primary key,
  org_id      uuid not null,
  permit_id   uuid not null references permits(id) on delete cascade,
  at          timestamptz not null default now(),
  actor_id    uuid references users(id) on delete set null,
  actor_text  text,
  text        text not null
);
create index on permit_events (permit_id, at);
create trigger permit_events_no_change before update or delete on permit_events for each row
  when (pg_trigger_depth() = 0) execute function forbid_change();

create function permit_log(p_permit uuid, p_org uuid, p_actor uuid, p_text text) returns void language sql as $$
  insert into permit_events (org_id, permit_id, actor_id, actor_text, text)
  values (p_org, p_permit, p_actor, (select full_name from users where id = p_actor), p_text)
$$;

-- INSERT: nomor otomatis, status awal 'requested', pemohon bukan Produksi, aset sesuai plant
create function permit_before_insert() returns trigger language plpgsql as $$
begin
  if coalesce(user_role(new.requested_by), 'production') = 'production' then
    raise exception 'Izin kerja diajukan oleh Teknisi, Planner, Supervisor, atau Admin' using errcode = '42501';
  end if;
  if not exists (select 1 from assets where id = new.asset_id and plant_id = new.plant_id) then raise exception 'Aset bukan milik plant ini' using errcode = '23514'; end if;
  if new.wo_id is not null and not exists (select 1 from work_orders where id = new.wo_id and asset_id = new.asset_id) then
    raise exception 'WO tidak cocok dengan aset izin kerja' using errcode = '23514';
  end if;
  if new.valid_until <= now() then raise exception 'Masa berlaku izin sudah lewat' using errcode = '23514'; end if;
  new.status := 'requested';
  new.approved_by := null; new.approved_at := null; new.handover_by := null; new.handover_at := null; new.activated_by := null; new.activated_at := null;
  new.completed_by := null; new.completed_at := null; new.returned_by := null; new.returned_at := null; new.cancelled_by := null; new.cancelled_at := null;
  new.rejected_at := null; new.reject_reason := null; new.cancel_reason := null;
  if new.code = '' then new.code := next_doc_code('PTW', new.org_id, new.plant_id); end if;
  return new;
end $$;
create trigger permit_a_ins before insert on permits for each row execute function permit_before_insert();

create function permit_after_insert() returns trigger language plpgsql as $$
begin
  perform permit_log(new.id, new.org_id, new.requested_by, 'Izin kerja diajukan');
  perform notify_roles(new.org_id, new.plant_id, array['admin','supervisor'], 'ptw', 'Izin kerja menunggu persetujuan: ' || new.title,
                       new.code || ' · ' || (select name from assets where id = new.asset_id), '/permits/' || new.id);
  return null;
end $$;
create trigger permit_b_ins after insert on permits for each row execute function permit_after_insert();

create function permit_guard() returns trigger language plpgsql as $$
declare r text; n int; ok boolean;
begin
  if old.status in ('closed','rejected','cancelled') then
    raise exception 'Izin % sudah % dan tidak dapat diubah', old.code, old.status using errcode = '23514';
  end if;
  if new.status = old.status then
    if old.status not in ('requested','approved') and
       (new.asset_id, new.work_type, new.title, new.hazards, new.precautions, new.requires_loto, new.valid_from, new.valid_until, new.team)
       is distinct from (old.asset_id, old.work_type, old.title, old.hazards, old.precautions, old.requires_loto, old.valid_from, old.valid_until, old.team) then
      raise exception 'Isi izin tidak dapat diubah setelah area diserahkan' using errcode = '23514';
    end if;
    return new;
  end if;
  ok := (old.status, new.status) in (('requested','approved'),('requested','rejected'),('approved','handed_over'),('handed_over','active'),
        ('active','completed'),('completed','closed'),('requested','cancelled'),('approved','cancelled'),('handed_over','cancelled'));
  if not ok then raise exception 'Transisi status izin tidak valid: % -> %', old.status, new.status using errcode = '23514'; end if;

  if new.status in ('approved','rejected') then
    r := user_role(new.approved_by);
    if r is null or r not in ('supervisor','admin') then raise exception 'Izin kerja hanya dapat disetujui atau ditolak oleh Supervisor atau Admin' using errcode = '42501'; end if;
    if new.status = 'approved' then
      if new.requires_loto and not exists (select 1 from permit_points where permit_id = old.id) then
        raise exception 'Izin dengan LOTO wajib memiliki minimal satu titik isolasi' using errcode = '23514';
      end if;
      new.approved_at := now();
    else new.rejected_at := now(); end if;
  elsif new.status = 'handed_over' then
    r := user_role(new.handover_by);
    if r is null or r not in ('production','admin') then raise exception 'Penyerahan area hanya oleh Produksi atau Admin' using errcode = '42501'; end if;
    if new.valid_until <= now() then raise exception 'Masa berlaku izin sudah lewat' using errcode = '23514'; end if;
    if exists (select 1 from permits p where p.asset_id = old.asset_id and p.id <> old.id and p.status in ('handed_over','active')) then
      raise exception 'Aset ini masih memiliki izin kerja lain yang aktif' using errcode = '23514';
    end if;
    new.handover_at := now();
  elsif new.status = 'active' then
    r := user_role(new.activated_by);
    if r is null or r = 'production' then raise exception 'Pekerjaan dimulai oleh pelaksana (bukan Produksi)' using errcode = '42501'; end if;
    if new.valid_until <= now() then raise exception 'Masa berlaku izin sudah lewat' using errcode = '23514'; end if;
    if new.requires_loto then
      select count(*) into n from permit_points pp
       where pp.permit_id = old.id and (pp.zero_verified_at is null or not exists (select 1 from permit_locks l where l.point_id = pp.id and l.removed_at is null));
      if n > 0 or not exists (select 1 from permit_points where permit_id = old.id) then
        raise exception 'LOTO belum lengkap: setiap titik isolasi harus punya gembok terpasang dan nol energi terverifikasi' using errcode = '23514';
      end if;
    end if;
    new.activated_at := now();
  elsif new.status = 'completed' then
    r := user_role(new.completed_by);
    if r is null or r = 'production' then raise exception 'Penyelesaian dilaporkan oleh pelaksana' using errcode = '42501'; end if;
    if exists (select 1 from permit_locks where permit_id = old.id and removed_at is null) then
      raise exception 'Masih ada gembok yang belum dilepas' using errcode = '23514';
    end if;
    new.completed_at := now();
  elsif new.status = 'closed' then
    r := user_role(new.returned_by);
    if r is null or r not in ('production','admin') then raise exception 'Penerimaan area kembali hanya oleh Produksi atau Admin' using errcode = '42501'; end if;
    new.returned_at := now();
  elsif new.status = 'cancelled' then
    r := user_role(new.cancelled_by);
    if r is null or not (new.cancelled_by = old.requested_by or r in ('supervisor','admin')) then raise exception 'Pembatalan hanya oleh pemohon, Supervisor, atau Admin' using errcode = '42501'; end if;
    new.cancelled_at := now();
  end if;
  return new;
end $$;
create trigger permit_b_guard before update on permits for each row execute function permit_guard();

create function permit_after_update() returns trigger language plpgsql as $$
declare actor uuid; txt text; ttl text := new.code || ' · ' || new.title;
begin
  if new.status = old.status then return null; end if;
  actor := case new.status when 'approved' then new.approved_by when 'rejected' then new.approved_by when 'handed_over' then new.handover_by
                           when 'active' then new.activated_by when 'completed' then new.completed_by when 'closed' then new.returned_by else new.cancelled_by end;
  txt := case new.status
    when 'approved' then 'Izin disetujui Supervisor, menunggu penyerahan area oleh Produksi'
    when 'rejected' then 'Izin ditolak: ' || coalesce(new.reject_reason, '')
    when 'handed_over' then 'Area diserahkan oleh Produksi' || case when coalesce(new.handover_note, '') <> '' then ': ' || new.handover_note else '' end
    when 'active' then 'LOTO lengkap, pekerjaan dimulai'
    when 'completed' then 'Pekerjaan selesai, semua gembok dilepas' || case when coalesce(new.completion_note, '') <> '' then ': ' || new.completion_note else '' end
    when 'closed' then 'Area diterima kembali oleh Produksi, izin ditutup'
    else 'Izin dibatalkan: ' || coalesce(new.cancel_reason, '') end;
  perform permit_log(new.id, new.org_id, actor, txt);
  if new.status = 'approved' then
    perform notify_roles(new.org_id, new.plant_id, array['production'], 'ptw', 'Serahkan area untuk izin kerja: ' || new.title, ttl, '/permits/' || new.id);
  elsif new.status = 'completed' then
    perform notify_roles(new.org_id, new.plant_id, array['production'], 'ptw', 'Terima kembali area: ' || new.title, ttl, '/permits/' || new.id);
  elsif new.status in ('handed_over','rejected','closed','cancelled') and actor is distinct from new.requested_by then
    insert into notifications (org_id, user_id, kind, title, body, link)
    values (new.org_id, new.requested_by, 'ptw',
            case new.status when 'handed_over' then 'Area diserahkan, lanjutkan LOTO: ' when 'rejected' then 'Izin ditolak: ' when 'closed' then 'Izin ditutup: ' else 'Izin dibatalkan: ' end || new.title,
            ttl, '/permits/' || new.id);
  end if;
  return null;
exception when others then
  raise warning 'permit_after_update gagal: %', sqlerrm; return null;
end $$;
create trigger permit_c_after after update on permits for each row execute function permit_after_update();

-- Titik isolasi per izin: boleh diubah hanya saat diajukan/disetujui; verifikasi nol energi saat area diserahkan
create function permit_point_guard() returns trigger language plpgsql as $$
declare st text; pid uuid := coalesce(new.permit_id, old.permit_id); r text;
begin
  select status into st from permits where id = pid;
  if tg_op = 'INSERT' or tg_op = 'DELETE' then
    if st not in ('requested','approved') then raise exception 'Titik isolasi hanya dapat diubah sebelum area diserahkan' using errcode = '23514'; end if;
    return coalesce(new, old);
  end if;
  if (new.description, new.energy_type, new.method, new.seq, new.permit_id) is distinct from (old.description, old.energy_type, old.method, old.seq, old.permit_id) then
    if st not in ('requested','approved') then raise exception 'Titik isolasi hanya dapat diubah sebelum area diserahkan' using errcode = '23514'; end if;
  end if;
  if new.zero_verified_by is distinct from old.zero_verified_by then
    if new.zero_verified_by is not null then
      if st <> 'handed_over' then raise exception 'Verifikasi nol energi dilakukan setelah area diserahkan dan sebelum pekerjaan dimulai' using errcode = '23514'; end if;
      r := user_role(new.zero_verified_by);
      if r is null or r = 'production' then raise exception 'Verifikasi nol energi oleh pelaksana (Teknisi/Planner/Supervisor/Admin)' using errcode = '42501'; end if;
      if not exists (select 1 from permit_locks where point_id = old.id and removed_at is null) then raise exception 'Pasang gembok pada titik ini sebelum verifikasi nol energi' using errcode = '23514'; end if;
      new.zero_verified_at := now();
    else
      if st <> 'handed_over' then raise exception 'Verifikasi hanya dapat dibatalkan sebelum pekerjaan dimulai' using errcode = '23514'; end if;
      new.zero_verified_at := null;
    end if;
  end if;
  return new;
end $$;
create trigger permit_point_g before insert or update or delete on permit_points for each row execute function permit_point_guard();

create function permit_lock_guard() returns trigger language plpgsql as $$
declare st text; pid uuid := coalesce(new.permit_id, old.permit_id); r text; pp record;
begin
  select status into st from permits where id = pid;
  if tg_op = 'INSERT' then
    if st not in ('handed_over','active') then raise exception 'Gembok hanya dapat dipasang setelah area diserahkan' using errcode = '23514'; end if;
    select * into pp from permit_points where id = new.point_id;
    if pp.permit_id is distinct from new.permit_id then raise exception 'Titik isolasi bukan bagian dari izin ini' using errcode = '23514'; end if;
    if pp.zero_verified_at is not null then raise exception 'Titik ini sudah diverifikasi nol energi; batalkan verifikasi dulu bila perlu gembok tambahan' using errcode = '23514'; end if;
    new.removed_by := null; new.removed_at := null; new.override_reason := null; new.applied_at := now();
    return new;
  elsif tg_op = 'DELETE' then
    if st <> 'handed_over' or old.removed_at is not null then raise exception 'Gembok tidak dapat dihapus; lepas lewat prosedur pelepasan' using errcode = '23514'; end if;
    return old;
  end if;
  if (new.lock_no, new.applied_by, new.point_id, new.permit_id) is distinct from (old.lock_no, old.applied_by, old.point_id, old.permit_id) then
    raise exception 'Data gembok tidak dapat diubah' using errcode = '23514';
  end if;
  if old.removed_at is not null then raise exception 'Gembok sudah dilepas' using errcode = '23514'; end if;
  if new.removed_by is not null then
    if st <> 'active' then raise exception 'Gembok dilepas setelah pekerjaan selesai saat izin masih aktif' using errcode = '23514'; end if;
    r := user_role(new.removed_by);
    if r is null then raise exception 'Pengguna tidak aktif' using errcode = '42501'; end if;
    if new.removed_by <> old.applied_by then
      if r not in ('supervisor','admin') then raise exception 'Gembok hanya dilepas oleh pemasangnya, atau Supervisor/Admin dengan alasan' using errcode = '42501'; end if;
      if coalesce(btrim(new.override_reason), '') = '' then raise exception 'Alasan wajib bila gembok dilepas oleh orang lain' using errcode = '23514'; end if;
    end if;
    new.removed_at := now();
  end if;
  return new;
end $$;
create trigger permit_lock_g before insert or update or delete on permit_locks for each row execute function permit_lock_guard();

create function permit_lock_log() returns trigger language plpgsql as $$
declare d text;
begin
  select description into d from permit_points where id = new.point_id;
  if tg_op = 'INSERT' then
    perform permit_log(new.permit_id, new.org_id, new.applied_by, 'Gembok ' || new.lock_no || ' dipasang di: ' || coalesce(d, '-'));
  elsif new.removed_at is not null and old.removed_at is null then
    perform permit_log(new.permit_id, new.org_id, new.removed_by, 'Gembok ' || new.lock_no || ' dilepas' ||
      case when new.removed_by <> new.applied_by then ' (oleh orang lain: ' || coalesce(new.override_reason, '') || ')' else '' end);
  end if;
  return null;
end $$;
create trigger permit_lock_l after insert or update on permit_locks for each row execute function permit_lock_log();

create function permit_zero_log() returns trigger language plpgsql as $$
begin
  if new.zero_verified_at is not null and old.zero_verified_at is null then
    perform permit_log(new.permit_id, new.org_id, new.zero_verified_by, 'Nol energi terverifikasi: ' || new.description);
  end if;
  return null;
end $$;
create trigger permit_zero_l after update on permit_points for each row execute function permit_zero_log();

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['inspection_templates','inspections','loto_points','permits'] loop
    execute format('alter table %I enable row level security', t); execute format('alter table %I force row level security', t);
    execute format('create policy tenant_plant on %I using (org_id = app_org() and app_plant_ok(plant_id)) with check (org_id = app_org() and app_plant_ok(plant_id))', t);
  end loop;
  foreach t in array array['inspection_items','inspection_results','permit_points','permit_locks','permit_events'] loop
    execute format('alter table %I enable row level security', t); execute format('alter table %I force row level security', t);
    execute format('create policy tenant on %I using (org_id = app_org()) with check (org_id = app_org())', t);
  end loop;
  execute 'create policy via_parent on inspection_items as restrictive using (exists (select 1 from inspection_templates p where p.id = template_id))';
  execute 'create policy via_parent on inspection_results as restrictive using (exists (select 1 from inspections p where p.id = inspection_id))';
  foreach t in array array['permit_points','permit_locks','permit_events'] loop
    execute format('create policy via_parent on %I as restrictive using (exists (select 1 from permits p where p.id = permit_id))', t);
  end loop;
end $$;

grant select, insert, update, delete on inspection_templates, inspection_items, inspections, inspection_results, loto_points, permits, permit_points, permit_locks, permit_events to maintainhub_app;
grant execute on function inspection_record(uuid,uuid,uuid,timestamptz,text,jsonb,uuid), inspection_due(uuid), user_role(uuid), permit_log(uuid,uuid,uuid,text) to maintainhub_app;

commit;
