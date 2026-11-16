-- 0016: Laporan otomatis (harian/mingguan/bulanan/tahunan): jadwal, riwayat kirim, dan perhitungan periode.
begin;

create table report_schedules (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  plant_id       uuid,                                   -- null = semua plant organisasi
  name           text not null check (length(btrim(name)) between 1 and 120),
  frequency      text not null check (frequency in ('daily','weekly','monthly','yearly')),
  send_hour      smallint not null default 7 check (send_hour between 0 and 23),   -- jam kirim, zona Asia/Jakarta
  recipients     text[] not null check (cardinality(recipients) between 1 and 20),
  active         boolean not null default true,
  last_period_to date,                                   -- akhir periode terakhir yang sudah diproses (kirim sukses atau menyerah)
  last_attempt_at timestamptz,
  fail_count     smallint not null default 0,
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (org_id, plant_id) references plants(org_id, id),
  unique (org_id, id)
);
create trigger report_schedules_upd before update on report_schedules for each row execute function set_updated_at();
create index report_schedules_active_idx on report_schedules (active) where active;

create table report_runs (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references organizations(id) on delete cascade,
  schedule_id  uuid references report_schedules(id) on delete set null,
  kind         text not null check (kind in ('scheduled','manual')),
  frequency    text not null check (frequency in ('daily','weekly','monthly','yearly')),
  plant_id     uuid,
  period_from  date not null,
  period_to    date not null,
  status       text not null check (status in ('sent','failed')),
  recipients   text[] not null default '{}',
  bytes        int,
  error        text,
  created_by   uuid references users(id) on delete set null,
  at           timestamptz not null default now()
);
create index report_runs_org_idx on report_runs (org_id, at desc);

-- Periode laporan terakhir yang sudah "jatuh tempo" pada waktu p_now (zona Asia/Jakarta):
--   daily   : kemarin                    (dikirim tiap hari pada send_hour)
--   weekly  : Senin–Minggu minggu lalu   (dikirim tiap Senin)
--   monthly : bulan lalu penuh           (dikirim tiap tanggal 1)
--   yearly  : tahun lalu penuh           (dikirim tiap 1 Januari)
create function report_period(p_freq text, p_hour int, p_now timestamptz default now())
returns table (p_from date, p_to date, due_at timestamp)
language plpgsql stable as $$
declare j timestamp := p_now at time zone 'Asia/Jakarta'; d timestamp;
begin
  if p_freq = 'daily' then
    d := date_trunc('day', j) + make_interval(hours => p_hour);
    if j < d then d := d - interval '1 day'; end if;
    return query select (d::date - 1), (d::date - 1), d;
  elsif p_freq = 'weekly' then
    d := date_trunc('week', j) + make_interval(hours => p_hour);
    if j < d then d := d - interval '7 days'; end if;
    return query select (d::date - 7), (d::date - 1), d;
  elsif p_freq = 'monthly' then
    d := date_trunc('month', j) + make_interval(hours => p_hour);
    if j < d then d := d - interval '1 month'; end if;
    return query select (d::date - interval '1 month')::date, (d::date - 1), d;
  elsif p_freq = 'yearly' then
    d := date_trunc('year', j) + make_interval(hours => p_hour);
    if j < d then d := d - interval '1 year'; end if;
    return query select (d::date - interval '1 year')::date, (d::date - 1), d;
  else raise exception 'Frekuensi tidak dikenal: %', p_freq using errcode = '22023';
  end if;
end $$;

-- Jadwal baru tidak langsung mengirim periode yang sudah lewat: mulai dari jatuh tempo berikutnya.
create function report_schedule_init() returns trigger language plpgsql as $$
begin
  if new.last_period_to is null and new.frequency in ('daily','weekly','monthly','yearly') then
    select p.p_to into new.last_period_to from report_period(new.frequency, new.send_hour) p;
  end if;
  return new;
end $$;
create trigger report_schedules_init before insert on report_schedules for each row execute function report_schedule_init();

-- Jika frekuensi/jam diubah, hitung ulang titik awal agar tidak mengirim periode lampau.
create function report_schedule_reset() returns trigger language plpgsql as $$
begin
  if new.frequency in ('daily','weekly','monthly','yearly') and (new.frequency <> old.frequency or new.send_hour <> old.send_hour or (new.active and not old.active)) then
    select p.p_to into new.last_period_to from report_period(new.frequency, new.send_hour) p;
    new.fail_count := 0; new.last_attempt_at := null;
  end if;
  return new;
end $$;
create trigger report_schedules_reset before update on report_schedules for each row execute function report_schedule_reset();

alter table report_schedules enable row level security; alter table report_schedules force row level security;
alter table report_runs enable row level security;      alter table report_runs force row level security;
create policy tenant_plant on report_schedules using (org_id = app_org() and (plant_id is null or app_plant_ok(plant_id))) with check (org_id = app_org() and (plant_id is null or app_plant_ok(plant_id)));
create policy tenant on report_runs using (org_id = app_org()) with check (org_id = app_org());
grant select, insert, update, delete on report_schedules to maintainhub_app;
grant select, insert on report_runs to maintainhub_app;
grant usage, select on all sequences in schema public to maintainhub_app;
grant execute on function report_period(text,int,timestamptz) to maintainhub_app, maintainhub_auth;

-- Penjadwal berjalan tanpa pengguna, jadi mencari jadwal jatuh tempo lintas-org lewat role auth (akses sangat sempit: hanya baca daftar jadwal).
grant select on report_schedules to maintainhub_auth;
create policy auth_read on report_schedules for select to maintainhub_auth using (true);
commit;
