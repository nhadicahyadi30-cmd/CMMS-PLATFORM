# Arsitektur

## Stack
Next.js + TypeScript + Tailwind (web) · NestJS (API) · PostgreSQL 16 · S3-compatible (MinIO/S3) untuk foto/lampiran · Nginx · Docker Compose (portabel VPS/cloud/on-prem) · GitHub Actions CI.
Tahap lanjut: pgvector + Claude API (Modul 5), TimescaleDB (data sensor/energi), antrean job (BullMQ/Redis) untuk reminder & webhook.

## Multi-tenant & multi-plant
Satu database; setiap tabel bisnis membawa `org_id` (dan `plant_id` bila ber-plant). Row-Level Security memaksa isolasi di level DB, bukan hanya di aplikasi. Per transaksi, API menyetel:
`app.org_id`, `app.plant_ids` (daftar uuid), `app.all_plants` ('1' untuk admin) via `set_config(..., true)`.
API terhubung sebagai role `maintainhub_app` (bukan superuser, `FORCE RLS`). Tanpa konteks → tidak ada data terlihat.

## Aturan bisnis yang ditegakkan di DB (trigger/constraint)
- Semua WO lahir berstatus `waiting` dan wajib approval Supervisor/Admin.
- Transisi status valid: waiting→approved/rejected; approved→assigned; assigned→approved/progress; progress→done; done→progress/closed.
- `assigned` butuh teknisi; `done` butuh `actual_hours`; `closed`/`rejected` tidak bisa diubah.
- Kode WO berurutan per plant per bulan; SLA dihitung dari kebijakan prioritas.
- `audit_log` dan `wo_logs` append-only. Hirarki aset tanpa siklus. Meter kumulatif tak boleh turun.
- PM: generator idempoten; penutupan WO preventif memajukan jadwal.

## Keamanan
argon2id (format dicek constraint), refresh token disimpan sebagai hash, secret MFA dienkripsi aplikasi, webhook WhatsApp diverifikasi tanda tangan, tabel `refresh_tokens` & `wa_webhook_events` tak bisa diakses role aplikasi biasa (lewat layanan khusus), HTTPS wajib di produksi.

## WhatsApp
Cloud API resmi Meta: template utility, opt-in teknisi (`wa_opt_in`), webhook idempoten (`wa_webhook_events.event_key`), pesan masuk → lampiran/log WO.

## Peta jalan
1. Fondasi + modul 1–4 (sedang berjalan) 2. Modul 6 & 9 3. Modul 7 & 8 4. Modul 5 (LLM + pgvector) 5. Modul 10 lanjutan (SSO, audit lanjutan).

## Batasan saat ini
Kode backend/frontend belum dikompilasi/diuji di lingkungan pembuatan (tanpa akses npm/Docker); hanya SQL yang diuji pada Postgres nyata.
