-- 0010: pembuatan organisasi baru dengan konfigurasi bawaan (matriks akses modul + kebijakan SLA)
begin;
create function provision_org(p_slug text, p_name text) returns uuid language plpgsql as $$
declare o uuid;
begin
  insert into organizations (slug, name) values (p_slug, p_name) returning id into o;
  insert into role_modules (org_id, role_code, module)
  select o, 'admin', g from generate_series(1,10) g
  union all select o, 'supervisor', g from generate_series(1,9) g
  union all select o, 'planner', g from unnest(array[1,2,3,5,6,7,8,9]) g
  union all select o, 'technician', g from unnest(array[1,2,3,5]) g;
  insert into sla_policies (org_id, priority, label, respond_min, resolve_min) values
    (o,'P1','Kritis',15,240), (o,'P2','Tinggi',60,480), (o,'P3','Sedang',240,1440), (o,'P4','Rendah',1440,4320);
  return o;
end $$;
commit;
