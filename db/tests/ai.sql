-- Uji modul AI: pemecahan dokumen, pencarian basis pengetahuan, alarm, log, RLS.
\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;
select provision_org('ai-uji', 'AI Uji') as org \gset
select provision_org('ai-lain', 'AI Lain') as org2 \gset
insert into plants (id, org_id, code, name) values ('00000000-0000-0000-0000-0000000aa001', :'org', 'A1', 'Plant A1'), ('00000000-0000-0000-0000-0000000aa002', :'org', 'A2', 'Plant A2');
insert into assets (id, org_id, plant_id, code, name, asset_type) values
  ('00000000-0000-0000-0000-0000000aa101', :'org', '00000000-0000-0000-0000-0000000aa001', 'AA1', 'Pompa AA1', 'equipment'),
  ('00000000-0000-0000-0000-0000000aa102', :'org', '00000000-0000-0000-0000-0000000aa002', 'AA2', 'Pompa AA2', 'equipment');
set local session_replication_role = origin;

set local role maintainhub_app;
select set_config('app.org_id', :'org', true), set_config('app.plant_ids', '', true), set_config('app.all_plants', '1', true) \gset
do $$
declare o uuid := current_setting('app.org_id')::uuid; p uuid := '00000000-0000-0000-0000-0000000aa001'; a uuid := '00000000-0000-0000-0000-0000000aa101'; a2 uuid := '00000000-0000-0000-0000-0000000aa102';
  d1 uuid; d2 uuid; d3 uuid; long_body text; al uuid; m text; i int;
begin
  -- pemecahan: paragraf pendek digabung, isi tidak hilang
  insert into kb_docs (org_id, title, body) values (o, 'SOP pelumasan bearing pompa', E'Pelumasan bearing pompa dilakukan setiap 500 jam operasi.\n\nGunakan grease NLGI 2 berbasis lithium. Jangan melumasi berlebihan karena bearing menjadi panas.\n\nSetelah pelumasan, ukur suhu bearing setelah 30 menit.') returning id into d1;
  assert (select count(*) from kb_chunks where doc_id = d1) = 1, 'tiga paragraf pendek jadi satu potongan';
  assert (select content from kb_chunks where doc_id = d1) = (select btrim(body) from kb_docs where id = d1), 'isi utuh';
  insert into kb_docs (org_id, title, body) values (o, 'Prosedur CIP tangki', (select string_agg(repeat('Bilas tangki dengan air bersih sampai pH netral. ', 6), E'\n\n') from generate_series(1, 6))) returning id into d2;
  assert (select count(*) from kb_chunks where doc_id = d2) > 1, 'dokumen panjang dipecah: ' || (select count(*) from kb_chunks where doc_id = d2);
  assert (select max(length(content)) from kb_chunks where doc_id = d2) <= 900, 'potongan <= 900 karakter';
  assert regexp_replace((select string_agg(content, ' ' order by idx) from kb_chunks where doc_id = d2), '\s+', ' ', 'g') = regexp_replace((select btrim(body) from kb_docs where id = d2), '\s+', ' ', 'g'), 'tidak ada isi hilang';
  -- satu paragraf sangat panjang dipotong di batas kalimat
  long_body := (select string_agg('Kalimat nomor ' || g || ' tentang pemeriksaan rutin kompresor udara.', ' ') from generate_series(1, 90) g);
  insert into kb_docs (org_id, title, body) values (o, 'Pemeriksaan kompresor', long_body) returning id into d3;
  assert (select count(*) from kb_chunks where doc_id = d3) >= 3 and (select max(length(content)) from kb_chunks where doc_id = d3) <= 1200, 'paragraf panjang dipotong';
  assert regexp_replace((select string_agg(content, ' ' order by idx) from kb_chunks where doc_id = d3), '\s+', ' ', 'g') = regexp_replace(long_body, '\s+', ' ', 'g'), 'potongan paragraf tidak kehilangan isi';

  -- pencarian
  assert (select title from kb_search('kenapa bearing pompa cepat panas?') limit 1) = 'SOP pelumasan bearing pompa', 'dokumen bearing teratas';
  assert (select count(*) from kb_search('jadwal cuti karyawan tahunan')) = 0, 'tidak ada kecocokan -> kosong';
  assert (select count(*) from kb_search('')) = 0 and (select count(*) from kb_search('   ')) = 0 and (select count(*) from kb_search(null)) = 0, 'kueri kosong';
  assert (select count(*) from kb_search('yang dan di')) = 0, 'hanya kata umum -> kosong';
  assert (select count(*) from kb_search('air pH tangki', 2)) = 2, 'batas hasil';
  assert (select count(*) from kb_search('tangki bilas', 1000)) <= 20, 'batas atas 20';
  assert (select count(*) from kb_search('Pelumasan; drop table kb_docs; --''"')) >= 0, 'karakter aneh tidak menimbulkan galat';
  update kb_docs set active = false where id = d1;
  assert (select count(*) from kb_search('bearing pompa panas')) = 0, 'dokumen nonaktif dilewati';
  update kb_docs set active = true, body = 'Kini hanya membahas grease sintetis.' where id = d1;
  assert (select count(*) from kb_chunks where doc_id = d1) = 1 and (select content from kb_chunks where doc_id = d1) like 'Kini hanya%', 'ubah isi memecah ulang';
  update kb_docs set title = 'judul baru' where id = d1;
  assert (select count(*) from kb_chunks where doc_id = d1) = 1, 'ubah judul tidak memecah ulang';
  begin insert into kb_docs (org_id, title, body) values (o, 'kosong', '   '); assert false; exception when check_violation then null; end;

  -- alarm
  insert into alarms (org_id, plant_id, asset_id, severity, message, status, wo_id) values (o, p, a, 'critical', 'Suhu bearing 95C', 'closed', null) returning id into al;
  assert (select status from alarms where id = al) = 'open' and (select code from alarms where id = al) like 'AL-A1-%', 'status dipaksa open & kode otomatis';
  begin insert into alarms (org_id, plant_id, asset_id, message) values (o, p, a2, 'aset plant lain'); assert false; exception when check_violation then null; end;
  begin insert into alarms (org_id, plant_id, message, severity) values (o, p, 'x', 'fatal'); assert false; exception when check_violation then null; end;
  begin update alarms set message = 'ubah' where id = al; assert false; exception when check_violation then null; end;
  update alarms set status = 'ack', ack_by = null where id = al;
  assert (select ack_at from alarms where id = al) is not null, 'ack_at terisi';
  update alarms set ai_diagnosis = 'Kemungkinan kurang pelumasan', ai_diagnosed_at = now() where id = al;
  begin update alarms set status = 'open' where id = al; assert false; exception when check_violation then null; end;
  update alarms set status = 'closed' where id = al;
  begin update alarms set status = 'ack' where id = al; assert false; exception when check_violation then m := sqlerrm; end;
  assert m like '%sudah ditutup%', 'alarm tertutup final: ' || m;

  -- log percakapan
  insert into ai_messages (org_id, question, answer, mode) values (o, 'q', 'a', 'retrieval');
  begin insert into ai_messages (org_id, question, answer, mode) values (o, 'q', 'a', 'lain'); assert false; exception when check_violation then null; end;
end $$;

select set_config('app.org_id', :'org2', true) \gset
do $$ begin
  assert (select count(*) from kb_docs) = 0 and (select count(*) from kb_chunks) = 0 and (select count(*) from alarms) = 0 and (select count(*) from ai_messages) = 0, 'RLS AI bocor';
  assert (select count(*) from kb_search('bearing pompa tangki')) = 0, 'pencarian ikut RLS';
end $$;
rollback;
\echo UJI AI LULUS
