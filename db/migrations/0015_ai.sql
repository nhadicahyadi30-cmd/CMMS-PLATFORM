-- 0015: AI Assistant (basis pengetahuan dengan pencarian teks penuh, log percakapan, alarm)
begin;

alter table work_orders drop constraint work_orders_source_check;
alter table work_orders add constraint work_orders_source_check check (source in ('manual','pm_auto','inspection','whatsapp','rca','alarm'));

create table kb_docs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  body text not null check (length(btrim(body)) > 0 and length(body) <= 200000),
  tags text[] not null default '{}',
  active boolean not null default true,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (org_id, id)
);
create trigger kb_docs_upd before update on kb_docs for each row execute function set_updated_at();

create table kb_chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  doc_id uuid not null references kb_docs(id) on delete cascade,
  idx int not null, content text not null,
  tsv tsvector generated always as (to_tsvector('indonesian', content)) stored,
  unique (doc_id, idx)
);
create index kb_chunks_tsv on kb_chunks using gin (tsv);

-- Pecah dokumen per paragraf, gabungkan sampai ~900 karakter; paragraf yang lebih panjang dipotong di batas kalimat/spasi.
create function kb_rechunk(p_doc uuid) returns int language plpgsql as $$
declare d kb_docs; para text; buf text := ''; n int := 0; piece text;
  flush_at constant int := 900;
begin
  select * into d from kb_docs where id = p_doc;
  if d.id is null then return 0; end if;
  delete from kb_chunks where doc_id = p_doc;
  for para in select btrim(x) from regexp_split_to_table(replace(d.body, E'\r', ''), E'\n[ \t]*\n') x where btrim(x) <> '' loop
    while length(para) > 1200 loop
      piece := left(para, 1200);
      piece := coalesce(substring(piece from '^(.*[.!?;\n ])'), piece);       -- potong di batas kalimat/spasi terakhir
      if length(piece) < 400 then piece := left(para, 1200); end if;
      if buf <> '' then n := n + 1; insert into kb_chunks (org_id, doc_id, idx, content) values (d.org_id, p_doc, n, btrim(buf)); buf := ''; end if;
      n := n + 1; insert into kb_chunks (org_id, doc_id, idx, content) values (d.org_id, p_doc, n, btrim(piece));
      para := btrim(substr(para, length(piece) + 1));
    end loop;
    if para = '' then continue; end if;
    if buf <> '' and length(buf) + length(para) + 2 > flush_at then
      n := n + 1; insert into kb_chunks (org_id, doc_id, idx, content) values (d.org_id, p_doc, n, btrim(buf)); buf := '';
    end if;
    buf := case when buf = '' then para else buf || E'\n\n' || para end;
  end loop;
  if buf <> '' then n := n + 1; insert into kb_chunks (org_id, doc_id, idx, content) values (d.org_id, p_doc, n, btrim(buf)); end if;
  return n;
end $$;

create function kb_docs_chunk_trg() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.body is distinct from old.body then perform kb_rechunk(new.id); end if;
  return null;
end $$;
create trigger kb_docs_chunk after insert or update on kb_docs for each row execute function kb_docs_chunk_trg();

-- Pencarian: kata kunci digabung dengan OR (pertanyaan alami jarang mengandung semua kata), diurut ts_rank_cd; dokumen nonaktif dilewati.
create function kb_search(p_query text, p_limit int default 5)
returns table (doc_id uuid, title text, chunk_id uuid, idx int, content text, rank real)
language plpgsql stable as $$
declare q tsquery;
begin
  q := nullif(replace(plainto_tsquery('indonesian', left(coalesce(p_query, ''), 500))::text, '&', '|'), '')::tsquery;
  if q is null or q::text = '' then return; end if;
  return query
    select c.doc_id, d.title, c.id, c.idx, c.content, ts_rank_cd(c.tsv, q)
      from kb_chunks c join kb_docs d on d.id = c.doc_id
     where d.active and c.tsv @@ q order by 6 desc, d.title, c.idx limit least(greatest(p_limit, 1), 20);
end $$;

create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  asset_id uuid, wo_id uuid, alarm_id uuid,
  question text not null, answer text not null, sources jsonb not null default '[]',
  mode text not null check (mode in ('ai','retrieval','error')), model text,
  input_tokens int, output_tokens int,
  created_at timestamptz not null default now()
);
create index on ai_messages (user_id, created_at desc);
create index on ai_messages (asset_id, created_at desc) where asset_id is not null;

create table alarms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  plant_id uuid not null, asset_id uuid,
  code text not null default '',
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  message text not null check (length(btrim(message)) > 0),
  source text not null default 'manual' check (source in ('manual','api')),
  status text not null default 'open' check (status in ('open','ack','closed')),
  raised_at timestamptz not null default now(),
  ack_by uuid references users(id) on delete set null, ack_at timestamptz,
  wo_id uuid, ai_diagnosis text, ai_diagnosed_at timestamptz,
  foreign key (org_id, plant_id) references plants(org_id, id),
  foreign key (org_id, asset_id) references assets(org_id, id),
  foreign key (org_id, wo_id) references work_orders(org_id, id),
  unique (org_id, code)
);
create index on alarms (plant_id, status, raised_at desc);
create function alarms_before_insert() returns trigger language plpgsql as $$
begin
  new.status := 'open'; new.ack_by := null; new.ack_at := null; new.wo_id := null;
  if new.code = '' then new.code := next_doc_code('AL', new.org_id, new.plant_id); end if;
  if new.asset_id is not null and not exists (select 1 from assets where id = new.asset_id and plant_id = new.plant_id) then raise exception 'Aset bukan milik plant ini' using errcode='23514'; end if;
  return new;
end $$;
create trigger alarms_ins before insert on alarms for each row execute function alarms_before_insert();
create function alarms_guard() returns trigger language plpgsql as $$
begin
  if old.status = 'closed' then raise exception 'Alarm % sudah ditutup', old.code using errcode='23514'; end if;
  if new.status <> old.status and (old.status, new.status) not in (('open','ack'),('open','closed'),('ack','closed')) then
    raise exception 'Transisi status alarm tidak valid: % -> %', old.status, new.status using errcode='23514'; end if;
  if new.status = 'ack' and old.status = 'open' then new.ack_at := now(); end if;
  if new.org_id <> old.org_id or new.plant_id <> old.plant_id or new.asset_id is distinct from old.asset_id or new.message <> old.message or new.raised_at <> old.raised_at then
    raise exception 'Data alarm tidak dapat diubah' using errcode='23514'; end if;
  return new;
end $$;
create trigger alarms_g before update on alarms for each row execute function alarms_guard();

do $$
declare t text;
begin
  foreach t in array array['kb_docs','kb_chunks','ai_messages'] loop
    execute format('alter table %I enable row level security', t); execute format('alter table %I force row level security', t);
    execute format('create policy tenant on %I using (org_id = app_org()) with check (org_id = app_org())', t);
  end loop;
  alter table alarms enable row level security; alter table alarms force row level security;
  create policy tenant_plant on alarms using (org_id = app_org() and app_plant_ok(plant_id)) with check (org_id = app_org() and app_plant_ok(plant_id));
end $$;
grant select, insert, update, delete on kb_docs, kb_chunks, ai_messages, alarms to maintainhub_app;
grant execute on function kb_search(text,int), kb_rechunk(uuid) to maintainhub_app;
commit;
