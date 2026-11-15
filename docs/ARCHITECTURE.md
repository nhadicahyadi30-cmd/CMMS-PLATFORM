# Arsitektur

## Stack
Next.js + TypeScript + Tailwind (web) · NestJS (API) · PostgreSQL 16 · S3-compatible (MinIO/S3) untuk foto/lampiran · Nginx · Docker Compose (portabel VPS/cloud/on-prem) · GitHub Actions CI.
Asisten AI memanggil Claude API (Messages) dari backend; basis pengetahuan memakai pencarian teks penuh Postgres (konfigurasi `indonesian`), tanpa ekstensi tambahan. Tahap lanjut bila diperlukan: pgvector untuk pencarian semantik, TimescaleDB (data sensor/energi), antrean job (BullMQ/Redis) untuk reminder & webhook.

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
Selesai di kode: modul 1–9 dan fondasi modul 10 (multi-plant, pengguna, RBAC). Berikutnya: penerapan pertama ke server nyata, uji S3/WhatsApp/Claude API dengan kredensial sungguhan, pemeriksaan visual di browser, lalu modul 10 lanjutan (SSO, audit lanjutan), ingest alarm via API-key dari SCADA/PLC, dan pgvector bila pencarian kata kunci kurang.

## Batasan saat ini
Backend/frontend dikompilasi dan di-build oleh CI, tetapi belum pernah dijalankan end-to-end (tanpa Docker/npm di lingkungan pembuatan); logika bisnis yang ada di SQL diuji pada Postgres nyata.
Asisten AI: memberi saran saja (tidak punya aksi), jawaban selalu dengan sumber, batas pemakaian per pengguna per jam, teks dari database dinetralkan sebelum masuk prompt. Basis pengetahuan berlaku untuk seluruh organisasi, bukan per plant.
Target KPI (95/90/90) masih nilai bawaan di kode, belum menjadi pengaturan organisasi.
