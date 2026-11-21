-- DATA DEMO: 2 plant lengkap dengan riwayat ±2 bulan, agar semua menu terisi.
-- Memakai organisasi yang SUDAH ada (bawaan: slug "demo", dibuat oleh bootstrap) dan menambah plant PA + PB beserta isinya.
-- Semua data tetap data biasa: dapat diubah, dihapus, dan ditambah dari aplikasi. Untuk menghapus seluruh data demo: db/seed/demo_remove.sql.
-- Jalankan sebagai pemilik/superuser database (butuh session_replication_role). JANGAN dijalankan di produksi.
--   psql -U <pemilik> -d <database> -v org_slug=demo -f db/seed/demo_data.sql
\set ON_ERROR_STOP on
\if :{?org_slug}
\else
\set org_slug demo
\endif
begin;
select set_config('demo.org_slug', :'org_slug', true);
set local session_replication_role = replica;   -- melewati trigger: riwayat bertanggal lampau, tanpa notifikasi massal

do $demo$
declare
  v_slug text := current_setting('demo.org_slug');
  o uuid; adm uuid; ph text;
  t0 timestamptz := date_trunc('hour', now());
  today date := (now() at time zone 'Asia/Jakarta')::date;
  plans text[]; v_d date; v_open boolean; wo_ct timestamptz; wp int; pr_i int; tg_oil uuid[]; tg_cur uuid[]; tg_vib uuid[]; tg_run uuid[]; cur_base numeric[]; closed_wo uuid;
  p int; pid uuid; pc text; pn text; tzs text := 'Asia/Jakarta';
  i int; j int; k int; n int; r double precision;
  a_def text[]; a_row text[]; area1 uuid; area2 uuid; aid uuid[]; acode text[]; aname text[]; tel_idx int[];
  tid uuid[]; tname text[]; t_skills text[]; sk_codes text[] := array['MEK','ELK','INS','PLC','HYD','WLD']; sk_ids uuid[];
  uid_spv uuid; uid_plan uuid; uid_tek uuid; tmp uuid;
  prob text[] := array['Bearing motor berisik dan panas','Seal pompa bocor','V-belt konveyor kendor/slip','Sensor suhu pembacaan tidak stabil','MCB panel trip berulang','Motor overheat saat beban penuh','Rembesan oli pada gearbox','Getaran tinggi pada kopling','Kebocoran steam pada flange','Suara abnormal pada kompresor'];
  prob_fm text[] := array['FM-BRG','FM-SEAL','FM-BELT','FM-SNS','FM-ELC','FM-MOT','FM-LUB','FM-BRG','FM-SEAL','FM-BRG'];
  prob_sk text[] := array['MEK','MEK','MEK','INS','ELK','ELK','MEK','MEK','WLD','MEK'];
  wid uuid; wtype text; wprio text; wstat text; c timestamptz; ap timestamptz; asg timestamptz; st timestamptz; dn timestamptz; cl timestamptz;
  est numeric; act numeric; dt numeric; age_d int; ai int; ti int; tech int; sk uuid; fmid uuid; wsrc text;
  part_ids uuid[]; part_codes text[]; pdef text[]; part_cost numeric[]; pr uuid;
  plan_id uuid; plan_row text[]; interval_d int; last_done date; n_done int; wo_due date;
  m_id uuid; tag_id uuid; base numeric; u_id uuid; unit_codes text[]; unit_names text[]; unit_kind text[]; unit_kw numeric[]; unit_ids uuid[]; mtr_id uuid;
  fm_ids uuid; case_id uuid; v_hash text;
begin
  select id into o from organizations where organizations.slug = v_slug;
  if o is null then raise exception 'Organisasi "%" tidak ditemukan. Jalankan bootstrap dulu (lihat README) atau beri -v org_slug=<slug>.', v_slug; end if;
  if exists (select 1 from plants where org_id = o and code in ('PA','PB')) then raise exception 'Plant PA/PB sudah ada. Hapus data demo lama dulu: db/seed/demo_remove.sql'; end if;
  select id, password_hash into adm, ph from users where org_id = o and role_code = 'admin' and active order by created_at limit 1;
  if adm is null then raise exception 'Organisasi % belum punya pengguna admin', v_slug; end if;
  perform setseed(0.42);

  -- ---------- master: keahlian, failure mode, plant ----------
  insert into skills (org_id, code, name, min_coverage)
  select o, v.c, v.n, v.m from (values ('MEK','Mekanikal (bearing, pompa, gearbox)',2),('ELK','Kelistrikan (panel, motor, drive)',2),('INS','Instrumentasi & kalibrasi',1),('PLC','PLC & otomasi',1),('HYD','Hidrolik & pneumatik',1),('WLD','Pengelasan & fabrikasi',1)) v(c,n,m)
  where not exists (select 1 from skills s where s.org_id = o and s.code = v.c);
  select array_agg(id order by code) into sk_ids from (select id, code from skills where org_id = o and code = any(sk_codes) order by array_position(sk_codes, code)) s;
  perform seed_failure_modes(o);

  for p in 1..2 loop
    pc := case p when 1 then 'PA' else 'PB' end; pn := case p when 1 then 'Plant A - Pengolahan' else 'Plant B - Pengemasan' end;
    insert into plants (org_id, code, name, address) values (o, pc, pn, case p when 1 then 'Kawasan Industri, Bekasi (demo)' else 'Kawasan Industri, Cikarang (demo)' end) returning id into pid;
    insert into user_plants (user_id, plant_id) values (adm, pid) on conflict do nothing;

    -- ---------- pengguna demo (kata sandi sama dengan admin) ----------
    uid_spv := gen_random_uuid(); uid_plan := gen_random_uuid(); uid_tek := gen_random_uuid();
    insert into users (id, org_id, username, full_name, role_code, password_hash) values
      (uid_spv, o, 'spv.' || lower(pc), 'Supervisor ' || pc, 'supervisor', ph),
      (uid_plan, o, 'plan.' || lower(pc), 'Planner ' || pc, 'planner', ph),
      (uid_tek, o, 'tek.' || lower(pc) || '1', 'Teknisi ' || pc || '1', 'technician', ph);
    insert into user_plants (user_id, plant_id) values (uid_spv, pid), (uid_plan, pid), (uid_tek, pid);

    -- ---------- teknisi + matriks skill ----------
    tname := case p when 1 then array['Budi Santoso','Agus Wijaya','Rudi Hartono','Dedi Kurniawan','Slamet Riyadi','Eko Prasetyo']
                            else array['Hendra Gunawan','Yusuf Maulana','Andi Saputra','Bayu Nugroho','Fajar Ramadhan','Tono Supriyadi'] end;
    -- level per keahlian (MEK,ELK,INS,PLC,HYD,WLD); sengaja ada celah: PLC hanya 1 orang mandiri di A, HYD tidak ada yang mandiri di B
    t_skills := case p when 1 then array['4,1,0,0,2,3','1,4,2,1,0,0','2,3,3,4,0,0','3,0,1,0,2,1','2,2,0,0,1,0','3,1,0,0,0,4']
                                else array['3,1,0,0,2,0','1,4,3,2,0,0','4,0,0,0,2,1','2,3,1,3,1,0','1,2,0,0,2,0','3,0,0,0,1,3'] end;
    tid := array[]::uuid[];
    for i in 1..6 loop
      tmp := gen_random_uuid(); tid := tid || tmp;
      insert into technicians (id, org_id, plant_id, user_id, code, full_name, skill, shift, hourly_rate)
      values (tmp, o, pid, case when i = 1 then uid_tek end, 'T' || pc || lpad(i::text, 2, '0'), tname[i],
              (array['Mekanik','Elektrik','Instrumentasi','Mekanik','Elektrik','Welder'])[i], (array['pagi','pagi','pagi','siang','siang','malam'])[i], (array[32000,34000,38000,30000,31000,33000])[i]);
      for j in 1..6 loop
        insert into technician_skills (org_id, technician_id, skill_id, level, updated_by) values (o, tmp, sk_ids[j], split_part(t_skills[i], ',', j)::int, adm);
      end loop;
    end loop;
    insert into technician_absences (org_id, technician_id, from_date, to_date, reason, note, created_by) values
      (o, tid[2], today + 2, today + 4, 'cuti', 'Cuti tahunan (demo)', adm), (o, tid[5], today - 6, today - 5, 'sakit', 'Sakit (demo)', adm);

    -- ---------- aset ----------
    a_def := case p when 1 then array[
      'MIX-01|Mixer Adonan 1|Pabrikan Mixer|MX-500|3|5|4|3|1','MIX-02|Mixer Adonan 2|Pabrikan Mixer|MX-500|3|4|4|3|1','OVN-01|Oven Tunnel|Pabrikan Oven|OT-12|4|5|5|4|1',
      'CNV-01|Konveyor Utama|Pabrikan Konveyor|CV-30|2|4|3|2|1','PMP-01|Pompa Transfer Bahan|Pabrikan Pompa|CP-65|2|3|4|2|1','FAN-01|Exhaust Fan Oven|Pabrikan Fan|EF-900|2|2|2|2|1',
      'BLR-01|Boiler Uap 5 Ton|Pabrikan Boiler|SB-5T|5|5|3|4|2','CMP-01|Kompresor Udara 75 kW|Pabrikan Kompresor|SC-75|3|4|3|3|2','CHL-01|Chiller Proses|Pabrikan Chiller|CH-150|2|4|4|3|2','CTW-01|Cooling Tower|Pabrikan CT|CT-200|2|3|2|2|2']
    else array[
      'FIL-01|Mesin Filling 1|Pabrikan Filling|FL-24|3|5|5|4|1','FIL-02|Mesin Filling 2|Pabrikan Filling|FL-24|3|5|5|4|1','PKG-01|Mesin Packing|Pabrikan Packing|PK-60|3|4|4|3|1',
      'LBL-01|Mesin Labeling|Pabrikan Label|LB-300|1|3|3|2|1','CNV-01|Konveyor Kemasan|Pabrikan Konveyor|CV-20|2|3|2|2|1','PMP-01|Pompa Air Proses|Pabrikan Pompa|CP-50|2|3|3|2|2',
      'CMP-01|Kompresor Udara 55 kW|Pabrikan Kompresor|SC-55|3|4|3|3|2','CHL-01|Chiller|Pabrikan Chiller|CH-100|2|4|4|3|2','GEN-01|Genset 500 kVA|Pabrikan Genset|GS-500|4|3|2|4|2','WTR-01|Water Treatment|Pabrikan WTP|WT-20|3|3|4|3|2'] end;
    insert into assets (org_id, plant_id, code, name, asset_type, status) values (o, pid, pc || '-AREA-1', case p when 1 then 'Area Produksi Adonan & Oven' else 'Area Filling & Packing' end, 'area', 'running') returning id into area1;
    insert into assets (org_id, plant_id, code, name, asset_type, status) values (o, pid, pc || '-AREA-2', 'Area Utilitas', 'area', 'running') returning id into area2;
    aid := array[]::uuid[]; acode := array[]::text[]; aname := array[]::text[];
    for i in 1..10 loop
      a_row := string_to_array(a_def[i], '|'); tmp := gen_random_uuid(); aid := aid || tmp; acode := acode || (pc || '-' || a_row[1]); aname := aname || a_row[2];
      insert into assets (id, org_id, plant_id, parent_id, code, name, asset_type, manufacturer, model, serial_no, year_installed, status, acquisition_cost, expected_life_years, crit_safety, crit_production, crit_quality, crit_cost)
      values (tmp, o, pid, case a_row[9] when '1' then area1 else area2 end, pc || '-' || a_row[1], a_row[2], 'equipment', a_row[3], a_row[4], 'SN-' || pc || lpad(i::text, 4, '0'), 2012 + (i * 3 + p) % 11,
              case when i = 3 + p * 2 then 'standby' else 'running' end, (150 + i * 85) * 1000000, 15, a_row[5]::int, a_row[6]::int, a_row[7]::int, a_row[8]::int);
    end loop;
    tel_idx := case p when 1 then array[1,7,8,5] else array[1,3,7,6] end;

    -- ---------- sparepart ----------
    pdef := array['BRG-6205|Bearing 6205 2RS|pcs|Rak A1|4|8|55000|t','BRG-6308|Bearing 6308 2RS|pcs|Rak A1|4|8|120000|t','SEAL-MK|Seal mekanik pompa 35 mm|pcs|Rak A2|2|4|650000|t','VB-B85|V-belt B-85|pcs|Rak A3|4|10|78000|f',
      'RC-12B|Rantai roller 12B (m)|m|Rak A3|5|10|145000|f','KNT-25|Kontaktor 25A 220V|pcs|Rak B1|3|5|230000|t','MCB-32|MCB 3P 32A|pcs|Rak B1|3|6|185000|f','OLR-18|Overload relay 12-18A|pcs|Rak B1|2|4|210000|f',
      'PT100|Sensor suhu PT100|pcs|Rak B2|3|5|175000|t','PRX-M18|Proximity sensor M18|pcs|Rak B2|4|6|140000|f','OIL-220|Oli gearbox ISO VG 220|liter|Gudang oli|40|80|68000|f','GRS-EP2|Grease EP2|kg|Gudang oli|10|20|95000|f',
      'FLT-AIR|Filter udara kompresor|pcs|Rak C1|3|6|420000|t','ORG-SET|O-ring set assorted|set|Rak C2|3|5|260000|f','FUS-10|Fuse 10A (box)|box|Rak B3|3|5|90000|f'];
    part_ids := array[]::uuid[]; part_codes := array[]::text[]; part_cost := array[]::numeric[];
    for i in 1..15 loop
      a_row := string_to_array(pdef[i], '|'); tmp := gen_random_uuid(); part_ids := part_ids || tmp; part_codes := part_codes || (pc || '-' || a_row[1]); part_cost := part_cost || a_row[7]::numeric;
      insert into parts (id, org_id, plant_id, code, name, category, unit, location, on_hand, min_stock, reorder_qty, unit_cost, critical)
      values (tmp, o, pid, pc || '-' || a_row[1], a_row[2], (array['Mekanikal','Mekanikal','Mekanikal','Mekanikal','Mekanikal','Elektrikal','Elektrikal','Elektrikal','Instrumentasi','Instrumentasi','Pelumas','Pelumas','Utilitas','Utilitas','Elektrikal'])[i],
              a_row[3], a_row[4], 0, a_row[5]::numeric, a_row[6]::numeric, a_row[7]::numeric, a_row[8] = 't');
      insert into stock_tx (org_id, plant_id, part_id, kind, qty, delta, unit_cost, note, by_user, at)
      values (o, pid, tmp, 'in', a_row[6]::numeric * 1.5 + 4, a_row[6]::numeric * 1.5 + 4, a_row[7]::numeric, 'Stok awal (demo)', adm, t0 - interval '61 days');
    end loop;

    -- ---------- work order korektif / breakdown ----------
    for i in 1..55 loop
      ai := 1 + ((i * 7 + p * 3) % 10); ti := 1 + ((i * 5 + p) % 10); tech := 1 + ((i + p) % 6);
      age_d := case when i <= 9 then floor(random() * 3)::int else floor(random() * 58)::int + 1 end;
      c := ((today - age_d)::timestamp + make_interval(hours => 6 + floor(random() * 11)::int, mins => floor(random() * 60)::int)) at time zone tzs;
      if c > now() then c := now() - interval '90 minutes'; end if;
      wtype := (array['breakdown','corrective','corrective','emergency','breakdown','corrective'])[1 + i % 6];
      wprio := case wtype when 'emergency' then 'P1' when 'breakdown' then 'P2' else case when i % 2 = 0 then 'P3' else 'P4' end end;
      wsrc := case when i % 9 = 0 then 'alarm' when i % 7 = 0 then 'inspection' else 'manual' end;
      est := (array[1,2,3,4,6])[1 + i % 5]; act := round((est * (0.6 + random()))::numeric, 2);
      dt := case when wtype in ('breakdown','emergency') then round((act * (0.5 + random() * 0.8))::numeric, 2) else 0 end;
      r := random();
      wstat := case when age_d >= 7 then case when r < 0.90 then 'closed' when r < 0.96 then 'rejected' else 'done' end
                    when age_d >= 3 then case when r < 0.45 then 'closed' when r < 0.60 then 'done' when r < 0.75 then 'progress' when r < 0.85 then 'assigned' when r < 0.93 then 'approved' when r < 0.97 then 'waiting' else 'rejected' end
                    else case when r < 0.15 then 'waiting' when r < 0.30 then 'approved' when r < 0.50 then 'assigned' when r < 0.75 then 'progress' when r < 0.90 then 'done' else 'closed' end end;
      ap := least(now(), c + make_interval(mins => 20 + floor(random() * 130)::int)); asg := least(now(), ap + make_interval(mins => 10 + floor(random() * 80)::int));
      st := least(now(), asg + make_interval(mins => 15 + floor(random() * 105)::int)); dn := least(now(), st + make_interval(mins => (act * 60)::int));
      cl := least(now(), dn + make_interval(mins => 30 + floor(random() * 600)::int));
      select id into fmid from failure_modes where org_id = o and code = prob_fm[ti];
      select id into sk from skills where org_id = o and code = prob_sk[ti];
      wid := gen_random_uuid();
      insert into work_orders (id, org_id, plant_id, code, wo_type, source, title, description, asset_id, priority, status, requester_id, requester_text, technician_id, est_hours, actual_hours, downtime_hours, result_notes,
                               created_at, approved_at, approved_by, rejected_at, reject_reason, assigned_at, started_at, done_at, closed_at, closed_by, sla_respond_due, sla_resolve_due, failure_mode_id, skill_id, skill_min_level)
      select wid, o, pid, next_wo_code(o, pid, c), wtype, wsrc, prob[ti] || ' - ' || aname[ai], 'Dilaporkan operator: ' || lower(prob[ti]) || '. Mohon dicek dan diperbaiki (data demo).', aid[ai], wprio, wstat,
             case when i % 3 = 0 then uid_plan else uid_spv end, 'Operator produksi',
             case when wstat in ('assigned','progress','done','closed') then tid[tech] end, est,
             case when wstat in ('done','closed') then act end, case when wstat in ('done','closed') then dt else 0 end,
             case when wstat in ('done','closed') then 'Penyebab ditemukan dan diperbaiki; mesin diuji jalan normal (demo).' end,
             c, case when wstat <> 'waiting' and wstat <> 'rejected' then ap end, case when wstat <> 'waiting' then adm end,
             case when wstat = 'rejected' then ap end, case when wstat = 'rejected' then 'Duplikat dengan WO lain / bukan kerusakan (demo)' end,
             case when wstat in ('assigned','progress','done','closed') then asg end, case when wstat in ('progress','done','closed') then st end,
             case when wstat in ('done','closed') then dn end, case when wstat = 'closed' then cl end, case when wstat = 'closed' then adm end,
             c + make_interval(mins => s.respond_min), c + make_interval(mins => s.resolve_min), fmid, case when i % 2 = 0 then sk end, case when i % 2 = 0 then 2 + i % 2 else 1 end
        from sla_policies s where s.org_id = o and s.priority = wprio;
      insert into wo_logs (org_id, wo_id, at, actor_user_id, actor_text, text) values (o, wid, c, uid_spv, null, 'WO dibuat');
      if wstat <> 'waiting' and wstat <> 'rejected' then insert into wo_logs (org_id, wo_id, at, actor_user_id, text) values (o, wid, ap, adm, 'WO disetujui'); end if;
      if wstat = 'rejected' then insert into wo_logs (org_id, wo_id, at, actor_user_id, text) values (o, wid, ap, adm, 'WO ditolak: duplikat / bukan kerusakan'); end if;
      if wstat in ('assigned','progress','done','closed') then insert into wo_logs (org_id, wo_id, at, actor_user_id, text) values (o, wid, asg, adm, 'Ditugaskan ke ' || tname[tech]); end if;
      if wstat in ('progress','done','closed') then insert into wo_logs (org_id, wo_id, at, actor_text, text) values (o, wid, st, tname[tech], 'Mulai dikerjakan'); end if;
      if wstat in ('done','closed') then insert into wo_logs (org_id, wo_id, at, actor_text, text) values (o, wid, dn, tname[tech], 'Selesai dikerjakan'); end if;
      if wstat = 'closed' then insert into wo_logs (org_id, wo_id, at, actor_user_id, text) values (o, wid, cl, adm, 'WO ditutup'); end if;
      if wstat in ('done','closed') and i % 3 = 0 then
        k := 1 + (i * 3 + ti) % 15;
        insert into stock_tx (org_id, plant_id, part_id, kind, qty, delta, unit_cost, wo_id, note, by_user, at) values (o, pid, part_ids[k], 'out', 1 + i % 2, -(1 + i % 2), part_cost[k], wid, 'Dipakai pada WO (demo)', adm, dn);
      end if;
    end loop;
    update assets set status = 'breakdown' where id = (select asset_id from work_orders where plant_id = pid and wo_type in ('breakdown','emergency') and status in ('progress','assigned') order by created_at desc limit 1);

    -- ---------- jam operasi (meter), rencana PM, WO preventif ----------
    for j in 1..4 loop
      m_id := gen_random_uuid();
      insert into asset_meters (id, org_id, asset_id, name, unit) values (m_id, o, aid[tel_idx[j]], 'Running hour', 'jam');
      insert into meter_readings (meter_id, value, read_at, source, read_by)
      select m_id, round((11000 + j * 1700 + (59 - d) * 19.5)::numeric, 1), (today - d)::timestamp at time zone tzs + interval '7 hours', case when d % 7 = 0 then 'manual' else 'iot' end, null
        from generate_series(0, 59, 7) d;
      -- PM berbasis jam jalan: setiap 500 jam
      insert into pm_plans (org_id, plant_id, asset_id, name, trigger_type, interval_meter, meter_id, priority, est_hours, lead_days, checklist, last_done, last_meter, skill_id, skill_min_level)
      values (o, pid, aid[tel_idx[j]], 'Servis berkala per 500 jam - ' || aname[tel_idx[j]], 'meter', 500, m_id, 'P3', 4, 3,
              '[{"item":"Ganti oli / grease"},{"item":"Cek kopling dan alignment"},{"item":"Ukur getaran"},{"item":"Bersihkan filter"}]'::jsonb, today - 40, round((11000 + j * 1700 + 19.5 * 19.5 - 19.5 * 40)::numeric, 0), sk_ids[1], 2);
    end loop;
    -- PM kalender: 8 rencana, riwayat penyelesaian 2 bulan, sebagian jatuh tempo/terlambat
    plans := array['Pelumasan bearing dan gearbox|7|2|1|MEK','Cek V-belt dan tegangan rantai|14|2|4|MEK','Inspeksi panel listrik dan kekencangan terminal|30|3|6|ELK','Kalibrasi sensor suhu dan tekanan|30|2|7|INS',
                   'Servis filter dan drain kompresor|30|3|8|MEK','Thermografi panel dan motor|90|3|9|ELK','Cek kebocoran steam/air dan flange|14|2|10|WLD','Cek alignment kopling pompa|60|4|5|MEK'];
    for pr_i in 1..8 loop
      plan_row := string_to_array(plans[pr_i], '|'); interval_d := plan_row[2]::int; ai := plan_row[4]::int; est := plan_row[3]::numeric;
      select id into sk from skills where org_id = o and code = plan_row[5];
      last_done := case when pr_i % 4 = 0 then today - interval_d - 3 else today - 1 - ((pr_i * 5) % greatest(interval_d - 3, 3)) end;
      plan_id := gen_random_uuid();
      insert into pm_plans (id, org_id, plant_id, asset_id, name, trigger_type, interval_days, priority, est_hours, lead_days, checklist, next_due, last_done, skill_id, skill_min_level)
      values (plan_id, o, pid, aid[ai], plan_row[1] || ' - ' || aname[ai], 'calendar', interval_d, case when pr_i in (3,6) then 'P2' else 'P3' end, est, 3,
              '[{"item":"Periksa kondisi visual"},{"item":"Lakukan tindakan sesuai SOP"},{"item":"Catat temuan"},{"item":"Bersihkan area kerja"}]'::jsonb, last_done + interval_d, last_done, sk, 2);
      insert into pm_parts (org_id, pm_plan_id, part_id, qty) values (o, plan_id, part_ids[1 + (pr_i * 2) % 15], 1);
      for k in 0..8 loop
        v_d := last_done - k * interval_d; exit when v_d < today - 60;
        wid := gen_random_uuid(); wo_ct := ((v_d - 2)::timestamp + interval '7 hours') at time zone tzs; tech := 1 + (pr_i + k) % 6;
        insert into work_orders (id, org_id, plant_id, code, wo_type, source, title, description, asset_id, priority, status, requester_id, requester_text, technician_id, est_hours, actual_hours, downtime_hours, result_notes, pm_plan_id, pm_due,
                                 created_at, approved_at, approved_by, assigned_at, started_at, done_at, closed_at, closed_by, sla_respond_due, sla_resolve_due, skill_id, skill_min_level)
        select wid, o, pid, next_wo_code(o, pid, wo_ct), 'preventive', 'pm_auto', 'PM: ' || plan_row[1] || ' - ' || aname[ai], 'Dibuat otomatis dari rencana PM (demo).', aid[ai], pp.priority, 'closed', null, 'Sistem PM', tid[tech], est,
               round(est * 0.9, 2), 0, 'PM selesai sesuai checklist (demo).', plan_id, v_d, wo_ct, wo_ct + interval '1 hour', adm, wo_ct + interval '2 hours', (v_d::timestamp + interval '8 hours') at time zone tzs,
               (v_d::timestamp + interval '8 hours') at time zone tzs + make_interval(mins => (est * 54)::int), (v_d::timestamp + interval '16 hours') at time zone tzs, adm,
               wo_ct + make_interval(mins => s.respond_min), wo_ct + make_interval(mins => s.resolve_min), sk, 2
          from pm_plans pp join sla_policies s on s.org_id = o and s.priority = pp.priority where pp.id = plan_id;
        insert into pm_completions (org_id, pm_plan_id, wo_id, done_on, checklist_result, done_by) values (o, plan_id, wid, v_d, '[{"item":"Periksa kondisi visual","ok":true},{"item":"Catat temuan","ok":true}]'::jsonb, uid_tek);
        insert into wo_logs (org_id, wo_id, at, actor_text, text) values (o, wid, wo_ct, 'Sistem', 'WO PM dibuat otomatis'), (o, wid, (v_d::timestamp + interval '16 hours') at time zone tzs, tname[tech], 'PM selesai dan ditutup');
      end loop;
      -- WO PM berikutnya (terbuka) bila sudah masuk masa lead time
      if last_done + interval_d - 3 <= today then
        wo_due := last_done + interval_d; wo_ct := least(now(), ((wo_due - 3)::timestamp + interval '7 hours') at time zone tzs); wid := gen_random_uuid();
        wstat := (array['waiting','approved','assigned','progress'])[1 + (pr_i % 4)]; tech := 1 + pr_i % 6;
        insert into work_orders (id, org_id, plant_id, code, wo_type, source, title, description, asset_id, priority, status, requester_text, technician_id, est_hours, pm_plan_id, pm_due,
                                 created_at, approved_at, approved_by, assigned_at, started_at, sla_respond_due, sla_resolve_due, skill_id, skill_min_level)
        select wid, o, pid, next_wo_code(o, pid, wo_ct), 'preventive', 'pm_auto', 'PM: ' || plan_row[1] || ' - ' || aname[ai], 'Dibuat otomatis dari rencana PM (demo).', aid[ai], pp.priority, wstat, 'Sistem PM',
               case when wstat in ('assigned','progress') then tid[tech] end, est, plan_id, wo_due, wo_ct, case when wstat <> 'waiting' then wo_ct + interval '30 minutes' end, case when wstat <> 'waiting' then adm end,
               case when wstat in ('assigned','progress') then wo_ct + interval '1 hour' end, case when wstat = 'progress' then wo_ct + interval '2 hours' end,
               wo_ct + make_interval(mins => s.respond_min), wo_ct + make_interval(mins => s.resolve_min), sk, 2
          from pm_plans pp join sla_policies s on s.org_id = o and s.priority = pp.priority where pp.id = plan_id;
        insert into wo_logs (org_id, wo_id, at, actor_text, text) values (o, wid, wo_ct, 'Sistem', 'WO PM dibuat otomatis');
      end if;
    end loop;

    -- ---------- pembelian: satu PR diajukan (stok di bawah minimum), satu PR sudah diterima ----------
    pr := gen_random_uuid();
    insert into purchase_requests (id, org_id, plant_id, code, status, notes, requested_by, created_at, approved_by, approved_at, ordered_at, received_at)
    values (pr, o, pid, next_doc_code('PR', o, pid), 'received', 'Restock bearing dan belt (demo)', uid_plan, t0 - interval '24 days', adm, t0 - interval '23 days', t0 - interval '22 days', t0 - interval '17 days');
    insert into pr_items (org_id, pr_id, part_id, qty, qty_received) values (o, pr, part_ids[1], 8, 8), (o, pr, part_ids[4], 10, 10);
    insert into stock_tx (org_id, plant_id, part_id, kind, qty, delta, unit_cost, pr_id, note, by_user, at) values
      (o, pid, part_ids[1], 'in', 8, 8, part_cost[1], pr, 'Penerimaan PR (demo)', uid_plan, t0 - interval '17 days'), (o, pid, part_ids[4], 'in', 10, 10, part_cost[4], pr, 'Penerimaan PR (demo)', uid_plan, t0 - interval '17 days');
    update parts x set on_hand = coalesce((select sum(delta) from stock_tx t where t.part_id = x.id), 0) where x.plant_id = pid;
    update parts set min_stock = on_hand + 3 where id in (part_ids[2], part_ids[9], part_ids[13]);       -- tiga suku cadang di bawah minimum
    pr := gen_random_uuid();
    insert into purchase_requests (id, org_id, plant_id, code, status, notes, requested_by, created_at)
    values (pr, o, pid, next_doc_code('PR', o, pid), 'submitted', 'Stok di bawah minimum (demo)', uid_plan, t0 - interval '2 days');
    insert into pr_items (org_id, pr_id, part_id, qty) select o, pr, id, reorder_qty from parts where id in (part_ids[2], part_ids[9], part_ids[13]);

    -- ---------- energi: unit, power meter, tarif, entri manual (31-60 hari lalu) + otomatis dari meter (30 hari terakhir) ----------
    unit_codes := case p when 1 then array['LN1','LN2','UT-STM','UT-AIR'] else array['LN1','LN2','UT-AIR','UT-WTR'] end;
    unit_names := case p when 1 then array['Lini Adonan','Lini Oven','Boiler & Steam','Kompresor & Chiller'] else array['Lini Filling 1','Lini Filling 2','Udara Tekan','Water Treatment & Chiller'] end;
    unit_kind := array['line','line','utility','utility']; unit_kw := case p when 1 then array[135,110,70,85] else array[95,90,60,55] end::numeric[];
    unit_ids := array[]::uuid[];
    insert into energy_tariffs (org_id, plant_id, valid_from, price_per_kwh) values (o, pid, today - 120, 1352.00), (o, pid, date_trunc('month', today - 40)::date, 1444.70);
    for i in 1..4 loop
      u_id := gen_random_uuid(); mtr_id := gen_random_uuid(); unit_ids := unit_ids || u_id;
      insert into energy_units (id, org_id, plant_id, code, name, kind) values (u_id, o, pid, unit_codes[i], unit_names[i], unit_kind[i]);
      insert into energy_meters (id, org_id, plant_id, unit_id, code, name, multiplier) values (mtr_id, o, pid, u_id, 'MTR-' || pc || '-' || unit_codes[i], 'Power meter ' || unit_names[i], 1);
      -- pembacaan kWh kumulatif tiap jam, 31 hari terakhir
      insert into energy_meter_readings (meter_id, ts, kwh, kw, org_id)
      select mtr_id, h, 250000 + i * 40000 + sum(e) over (order by h), e, o
        from (select h, unit_kw[i] * (case when extract(dow from h at time zone tzs) = 0 then 0.35 else 1 end)
                              * (case when extract(hour from h at time zone tzs) between 6 and 21 then 1.0 else 0.55 end)
                              * (0.93 + 0.14 * ((abs(hashtext(mtr_id::text || h::text)) % 1000) / 1000.0))
                              * (case when p = 1 and i = 1 and (h at time zone tzs)::date = today - 5 then 1.45 else 1 end) as e
                from generate_series(t0 - interval '31 days', t0, interval '1 hour') h) x;
      if p = 2 and i = 2 then   -- celah data sengaja: meter mati dari 20:00 s.d. 04:00 (hari -12/-11 tidak dihitung, tidak ditebak)
        delete from energy_meter_readings where meter_id = mtr_id and ts > ((today - 12)::timestamp + interval '20 hours') at time zone tzs and ts < ((today - 11)::timestamp + interval '4 hours') at time zone tzs;
      end if;
      update energy_meters set last_seen = t0, last_kwh = (select kwh from energy_meter_readings where meter_id = mtr_id order by ts desc limit 1) where id = mtr_id;
      -- entri manual hari ke-60..31 lalu
      insert into energy_entries (org_id, plant_id, unit_id, period_kind, date_from, date_to, kwh, ton, note, by_user, source)
      select o, pid, u_id, 'day', d, d, round(kv, 3), case when unit_kind[i] = 'line' then round(kv / (165 + (abs(hashtext(u_id::text || d::text)) % 20)), 3) end, 'Input manual (demo)', uid_plan, 'manual'
        from (select d::date as d, unit_kw[i] * 24 * 0.80 * (case when extract(dow from d) = 0 then 0.45 else 1 end) * (0.92 + 0.16 * ((abs(hashtext(u_id::text || d::text)) % 1000) / 1000.0)) as kv
                from generate_series(today - 60, today - 31, interval '1 day') d) y;
      perform energy_meter_rollup(u_id, today, 30);
    end loop;
    update energy_entries e set ton = round(e.kwh / (165 + (abs(hashtext(e.unit_id::text || e.date_from::text)) % 20)), 3)
     where e.plant_id = pid and e.source = 'meter' and e.unit_id in (select id from energy_units where plant_id = pid and kind = 'line');   -- tonase produksi (demo)

    -- ---------- telemetri: sensor, pembacaan, alarm, perangkat RTU ----------
    tg_oil := array[]::uuid[]; tg_cur := array[]::uuid[]; tg_vib := array[]::uuid[]; tg_run := array[]::uuid[];
    cur_base := array[22, 28, 31, 15];
    for j in 1..4 loop
      ai := tel_idx[j];
      for k in 1..4 loop
        tag_id := gen_random_uuid();
        insert into sensor_tags (id, org_id, plant_id, asset_id, tag, name, unit, kind, warn_high, crit_high, min_valid, max_valid, confirm_count)
        values (tag_id, o, pid, aid[ai], (array['oil_temp','motor_current','vibration_rms','running_hours'])[k], (array['Suhu oli/bearing','Arus motor','Getaran RMS','Jam operasi'])[k], (array['°C','A','g','jam'])[k], case when k = 4 then 'runhours' else 'gauge' end,
                (array[75, cur_base[j] * 1.25, 0.8, null])[k], (array[85, cur_base[j] * 1.5, 1.5, null])[k], (array[-10, 0, 0, 0])[k], (array[150, 200, 20, 1000000])[k], (array[3, 3, 3, 1])[k]);
        if k = 1 then tg_oil := tg_oil || tag_id; elsif k = 2 then tg_cur := tg_cur || tag_id; elsif k = 3 then tg_vib := tg_vib || tag_id; else tg_run := tg_run || tag_id; end if;
        if k < 4 then
          insert into sensor_readings (tag_id, ts, value, org_id)
          select tag_id, h,
                 round((case k when 1 then 55 + j * 2 + 4 * sin(extract(epoch from h) / 13750.0) + case when p = 1 and j = 3 then 1.4 * extract(epoch from (h - (t0 - interval '14 days'))) / 86400 else 0 end
                               when 2 then cur_base[j] * (0.9 + 0.15 * sin(extract(epoch from h) / 9000.0))
                               else 0.35 + 0.03 * j + case when p = 1 and j = 4 then 0.032 * extract(epoch from (h - (t0 - interval '14 days'))) / 86400 else 0 end end
                        + (case k when 1 then 1.2 when 2 then 0.8 else 0.03 end) * (((abs(hashtext(tag_id::text || h::text)) % 1000) / 1000.0) - 0.5))::numeric, 3), o
            from generate_series(t0 - interval '14 days', t0, interval '30 minutes') h;
        else
          insert into sensor_readings (tag_id, ts, value, org_id)
          select tag_id, h, round((11000 + (j + 1) * 1700 + 19.5 * extract(epoch from (h - (t0 - interval '60 days'))) / 86400)::numeric, 1), o
            from generate_series(t0 - interval '60 days', t0, interval '6 hours') h;
        end if;
      end loop;
    end loop;
    insert into alarms (org_id, plant_id, asset_id, code, severity, message, source, status, raised_at, sensor_tag_id) values
      (o, pid, aid[tel_idx[3]], next_doc_code('ALM', o, pid), 'warning', case when p = 1 then 'Suhu oli/bearing tinggi: melewati batas peringatan 75 °C (tren naik)' else 'Arus motor tinggi: melewati batas peringatan' end, 'api', 'open', t0 - interval '3 hours', tg_oil[3]),
      (o, pid, aid[tel_idx[4]], next_doc_code('ALM', o, pid), 'warning', 'Getaran RMS naik mendekati batas 0,8 g', 'api', 'ack', t0 - interval '20 hours', tg_vib[4]);
    update alarms set ack_by = adm, ack_at = t0 - interval '18 hours' where plant_id = pid and status = 'ack';
    select id into closed_wo from work_orders where plant_id = pid and wo_type = 'breakdown' and status = 'closed' order by created_at limit 1;
    insert into alarms (org_id, plant_id, asset_id, code, severity, message, source, status, raised_at, ack_by, ack_at, wo_id, sensor_tag_id)
    values (o, pid, aid[tel_idx[1]], next_doc_code('ALM', o, pid), 'critical', 'Arus motor melewati batas kritis (sudah ditangani)', 'api', 'closed', t0 - interval '20 days', adm, t0 - interval '20 days' + interval '10 minutes', closed_wo, tg_cur[1]);
    for j in 1..3 loop
      insert into ingest_devices (org_id, plant_id, asset_id, device_id, name, sensors, fw, ip, rssi, uptime_s, queue, heap_kb, boots, readings_total, created_by, created_at, last_seen)
      values (o, pid, aid[tel_idx[j]], 'demo-' || lower(pc) || '-0' || j, 'RTU ' || aname[tel_idx[j]], array['oil_temp','motor_current','running_hours'], '1.2.0', '192.168.100.' || (60 + p * 10 + j), -(52 + j * 6), 86400 * (1 + j), case when j = 3 then 37 else 0 end, 182, 3 + j, 20000 + j * 4100, adm, t0 - interval '40 days',
              case j when 1 then now() - interval '40 seconds' when 2 then now() - interval '1 minute' else now() - interval '6 hours' end);
    end loop;

    -- ---------- RCA + FMEA ----------
    case_id := gen_random_uuid();
    insert into rca_cases (id, org_id, plant_id, code, asset_id, wo_id, title, problem, stage, root_cause, root_cause_category, verification_notes, owner_id, created_by, created_at)
    values (case_id, o, pid, next_doc_code('RCA', o, pid), aid[tel_idx[4]], closed_wo, 'Kerusakan berulang pada ' || aname[tel_idx[4]], 'Mesin berhenti mendadak 3 kali dalam 60 hari akibat bearing panas (data demo).', 'act',
            'Pelumasan tidak sesuai jadwal dan jenis grease tidak cocok', 'method', 'Pantau suhu bearing 30 hari setelah perbaikan', adm, adm, t0 - interval '15 days');
    insert into rca_whys (org_id, case_id, level, answer) values
      (o, case_id, 1, 'Mesin trip karena bearing panas'), (o, case_id, 2, 'Pelumas bearing mengering'), (o, case_id, 3, 'Interval pelumasan terlewat'),
      (o, case_id, 4, 'Jadwal PM pelumasan tidak terhubung ke WO'), (o, case_id, 5, 'Belum ada standar pelumasan per aset');
    insert into rca_causes (org_id, case_id, category, cause, is_root) values
      (o, case_id, 'method', 'Standar dan interval pelumasan belum ada', true), (o, case_id, 'man', 'Teknisi baru belum dilatih titik pelumasan', false),
      (o, case_id, 'material', 'Grease tidak sesuai spesifikasi', false), (o, case_id, 'machine', 'Seal bearing aus sehingga grease keluar', false);
    insert into rca_actions (org_id, case_id, kind, description, owner_id, due_date, status, done_at, created_at) values
      (o, case_id, 'corrective', 'Ganti bearing dan seal, isi grease EP2', adm, today - 10, 'done', t0 - interval '11 days', t0 - interval '14 days'),
      (o, case_id, 'preventive', 'Buat PM pelumasan mingguan dan standar grease per aset', adm, today + 7, 'open', null, t0 - interval '14 days'),
      (o, case_id, 'preventive', 'Pelatihan titik pelumasan untuk seluruh teknisi', adm, today + 21, 'open', null, t0 - interval '14 days');
    insert into fmea_items (org_id, plant_id, asset_id, function_desc, failure_mode_id, effect, cause, severity, occurrence, detection, current_controls, recommended_action, status)
    select o, pid, aid[x.ai], x.f, (select id from failure_modes where org_id = o and code = x.fm), x.e, x.c, x.s, x.oc, x.d, x.cc, x.ra, x.st
      from (values (1, 'Menggerakkan adonan', 'FM-BRG', 'Mesin berhenti, batch gagal', 'Bearing aus', 8, 5, 4, 'Cek getaran bulanan', 'Pasang sensor getaran online', 'open'),
                   (7, 'Menyediakan udara tekan', 'FM-ELC', 'Tekanan turun, lini berhenti', 'MCB trip karena beban', 7, 4, 3, 'Inspeksi panel bulanan', 'Thermografi panel', 'mitigated'),
                   (6, 'Mengalirkan air proses', 'FM-SEAL', 'Kebocoran, produk terkontaminasi', 'Seal mekanik aus', 7, 6, 5, 'Inspeksi visual harian', 'Ganti seal per 6 bulan', 'open'),
                   (8, 'Mendinginkan proses', 'FM-SNS', 'Suhu proses tidak terkendali', 'Sensor suhu drift', 6, 3, 6, 'Kalibrasi tahunan', 'Kalibrasi semesteran', 'accepted')) x(ai, f, fm, e, c, s, oc, d, cc, ra, st);
  end loop;

  -- ---------- beberapa notifikasi contoh untuk admin ----------
  insert into notifications (org_id, user_id, kind, title, body, link, created_at)
  select o, adm, 'wo_new', 'WO baru menunggu persetujuan: ' || w.code, w.title, '/work-orders/' || w.id, w.created_at from work_orders w where w.org_id = o and w.status = 'waiting' and w.plant_id in (select id from plants where code in ('PA','PB')) order by w.created_at desc limit 3;
  insert into notifications (org_id, user_id, kind, title, body, link, created_at)
  select o, adm, 'alarm', 'Alarm ' || a.severity || ': ' || ast.name, a.message, '/monitoring', a.raised_at from alarms a join assets ast on ast.id = a.asset_id where a.org_id = o and a.status = 'open' and a.plant_id in (select id from plants where code in ('PA','PB'));
  raise notice 'Data demo selesai dibuat untuk organisasi %.', v_slug;
end $demo$;

reset session_replication_role;
commit;
select 'demo_data.sql selesai' as hasil;
