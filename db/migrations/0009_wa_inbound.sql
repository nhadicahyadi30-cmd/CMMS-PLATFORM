-- 0009: pemrosesan WhatsApp masuk. Role maintainhub_auth hanya boleh (a) mengenali teknisi dari nomor telepon, (b) memperbarui status pengiriman pesan.
-- Seluruh perubahan data WO tetap berjalan lewat role aplikasi dengan konteks RLS milik teknisi tersebut.
begin;
grant select (id, org_id, plant_id, user_id, full_name, phone_e164, wa_opt_in, active) on technicians to maintainhub_auth;
create policy auth_lookup on technicians for select to maintainhub_auth using (true);
grant select (id, wa_message_id, status) on wa_messages to maintainhub_auth;
grant update (status, status_at, error_code) on wa_messages to maintainhub_auth;
create policy auth_status_sel on wa_messages for select to maintainhub_auth using (true);
create policy auth_status_upd on wa_messages for update to maintainhub_auth using (true) with check (true);
commit;
