-- 0008: webhook WhatsApp masuk tanpa konteks org -> disimpan lewat role maintainhub_auth (pool layanan)
begin;
grant select, insert, update (processed_at, error) on wa_webhook_events to maintainhub_auth;
commit;
