-- Data contoh untuk pengembangan/uji. JANGAN dijalankan di produksi.
-- Hash di bawah adalah placeholder argon2id (bukan password nyata); backend menyediakan skrip pembuat user admin sebenarnya.
begin;
insert into organizations (id, name, slug) values
 ('00000000-0000-0000-0000-0000000000a1','Pilot F&B Manufacturing','pilot-fnb'),
 ('00000000-0000-0000-0000-0000000000a2','Tenant Lain (uji isolasi)','tenant-lain');
insert into plants (id, org_id, code, name) values
 ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','P1','Plant 1'),
 ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a1','P2','Plant 2'),
 ('00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000a2','X1','Plant Tenant Lain');
insert into role_modules (org_id, role_code, module)
select o.id, r.c, m from organizations o,
  (values ('admin',1),('admin',2),('admin',3),('admin',4),('admin',5),('admin',6),('admin',7),('admin',8),('admin',9),('admin',10),
          ('supervisor',1),('supervisor',2),('supervisor',3),('supervisor',4),('supervisor',5),('supervisor',6),('supervisor',7),('supervisor',8),('supervisor',9),
          ('planner',1),('planner',2),('planner',3),('planner',5),('planner',6),('planner',7),('planner',8),('planner',9),
          ('technician',1),('technician',2),('technician',3),('technician',5)) r(c,m)
where o.slug='pilot-fnb';
insert into sla_policies values
 ('00000000-0000-0000-0000-0000000000a1','P1','Kritis',15,240),
 ('00000000-0000-0000-0000-0000000000a1','P2','Tinggi',60,480),
 ('00000000-0000-0000-0000-0000000000a1','P3','Sedang',240,1440),
 ('00000000-0000-0000-0000-0000000000a1','P4','Rendah',1440,4320);
insert into users (id, org_id, username, full_name, role_code, password_hash) values
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','admin','Administrator','admin','$argon2id$v=19$m=65536,t=3,p=4$PLACEHOLDER$PLACEHOLDER'),
 ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a1','spv1','Supervisor P1','supervisor','$argon2id$v=19$m=65536,t=3,p=4$PLACEHOLDER$PLACEHOLDER'),
 ('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000a1','plan1','Planner P1','planner','$argon2id$v=19$m=65536,t=3,p=4$PLACEHOLDER$PLACEHOLDER'),
 ('00000000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-0000000000a1','tek1','Teknisi P1','technician','$argon2id$v=19$m=65536,t=3,p=4$PLACEHOLDER$PLACEHOLDER'),
 ('00000000-0000-0000-0000-0000000000c5','00000000-0000-0000-0000-0000000000a2','admin','Admin Tenant Lain','admin','$argon2id$v=19$m=65536,t=3,p=4$PLACEHOLDER$PLACEHOLDER');
insert into user_plants values
 ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-0000000000b1');
insert into technicians (id, org_id, plant_id, user_id, code, full_name, skill, shift) values
 ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c4','T01','Teknisi P1','Mekanik','pagi');
insert into assets (id, org_id, plant_id, code, name, asset_type, crit_safety, crit_production, crit_quality, crit_cost) values
 ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','P1-LN1-MIX01','Mixer Adonan 1','equipment',3,5,4,3),
 ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b2','P2-LN1-PKG01','Packing 1','equipment',2,3,2,2),
 ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000b3','X1-A','Aset Tenant Lain','equipment',1,1,1,1);
commit;
