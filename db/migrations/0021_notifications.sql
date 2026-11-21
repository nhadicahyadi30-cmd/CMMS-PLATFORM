-- Notifikasi dalam aplikasi: WO baru, WO ditugaskan, PM jatuh tempo (WO otomatis), alarm.
-- Dibuat oleh pemicu database supaya muncul dari jalur apa pun (web, WhatsApp, API sensor, pembuat PM).
begin;

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null,
  kind       text not null check (kind in ('wo_new','wo_assigned','wo_pm','alarm')),
  title      text not null check (length(btrim(title)) > 0),
  body       text not null default '',
  link       text not null default '',
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  foreign key (org_id, user_id) references users(org_id, id) on delete cascade
);
create index notif_user_idx   on notifications (user_id, created_at desc);
create index notif_unread_idx on notifications (user_id) where read_at is null;

alter table notifications enable row level security; alter table notifications force row level security;
create policy tenant on notifications using (org_id = app_org()) with check (org_id = app_org());
-- Catatan: API selalu menyaring user_id = pengguna yang login; RLS menjamin isolasi antar-organisasi.

-- Kirim ke semua pengguna aktif dengan peran tertentu yang berhak atas plant itu (admin = semua plant).
create function notify_roles(p_org uuid, p_plant uuid, p_roles text[], p_kind text, p_title text, p_body text, p_link text)
returns void language plpgsql as $$
begin
  insert into notifications (org_id, user_id, kind, title, body, link)
  select p_org, u.id, p_kind, p_title, p_body, p_link from users u
   where u.org_id = p_org and u.active and u.role_code = any(p_roles)
     and (u.role_code = 'admin' or exists (select 1 from user_plants up where up.user_id = u.id and up.plant_id = p_plant));
exception when others then
  raise warning 'notify_roles gagal: %', sqlerrm;   -- notifikasi tidak boleh menggagalkan transaksi utama
end $$;

create function wo_notify_ins() returns trigger language plpgsql as $$
declare an text; pre text := case when new.priority = 'P1' or new.wo_type = 'emergency' then '[P1] ' else '' end;
begin
  select name into an from assets where id = new.asset_id;
  if new.source = 'pm_auto' then
    perform notify_roles(new.org_id, new.plant_id, array['admin','supervisor','planner'], 'wo_pm', 'PM jatuh tempo: ' || new.title, coalesce(an, '') || ' · ' || new.code, '/work-orders/' || new.id);
  else
    perform notify_roles(new.org_id, new.plant_id, array['admin','supervisor','planner'], 'wo_new', pre || 'WO baru: ' || new.title, coalesce(an, '') || ' · ' || new.code, '/work-orders/' || new.id);
  end if;
  return null;
end $$;
create trigger wo_notify_a after insert on work_orders for each row execute function wo_notify_ins();

create function wo_notify_assign() returns trigger language plpgsql as $$
declare tu uuid; an text;
begin
  if new.technician_id is not null and new.technician_id is distinct from old.technician_id then
    select user_id into tu from technicians where id = new.technician_id;
    if tu is not null then
      select name into an from assets where id = new.asset_id;
      insert into notifications (org_id, user_id, kind, title, body, link)
      values (new.org_id, tu, 'wo_assigned', 'Tugas baru: ' || new.title, coalesce(an, '') || ' · ' || new.code || ' · ' || new.priority, '/work-orders/' || new.id);
    end if;
  end if;
  return null;
exception when others then
  raise warning 'wo_notify_assign gagal: %', sqlerrm; return null;
end $$;
create trigger wo_notify_b after update of technician_id on work_orders for each row execute function wo_notify_assign();

create function alarm_notify_ins() returns trigger language plpgsql as $$
begin
  if new.severity in ('warning','critical') then
    perform notify_roles(new.org_id, new.plant_id, array['admin','supervisor','planner'], 'alarm',
      case when new.severity = 'critical' then 'ALARM KRITIS: ' else 'Alarm: ' end || new.message, new.code, '/ai');
  end if;
  return null;
end $$;
create trigger alarm_notify_a after insert on alarms for each row execute function alarm_notify_ins();

commit;
