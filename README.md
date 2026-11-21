# MaintHub

> **Predict. Maintain. Optimize. Connected.**

![MaintHub](apps/web/brand/logo-horizontal.svg)

Platform CMMS berbasis web: 10 modul, multi-plant, multi-user dengan RBAC. Pilot: pabrik F&B (>500 aset, >30 teknisi).

## Status
| Bagian | Status |
|---|---|
| Skema DB (PostgreSQL 16, RLS, trigger alur WO) | ✅ selesai, lolos uji (`db/tests`) |
| Infrastruktur (Docker Compose, Nginx, backup, CI) | ✅ sintaks tervalidasi, belum dijalankan end-to-end |
| Backup otomatis & penyimpanan permintaan demo website | ✅ diuji (skrip backup, tabel leads); lihat docs/OPERASIONAL.md |
| Telemetri mesin: API ingest untuk Node-RED, batas alarm, running hour → meter PM | ✅ diuji di level database dan aturan; belum dengan perangkat nyata; lihat docs/TELEMETRY.md |
| Dashboard Prediksi (tren, perkiraan waktu mencapai batas, anomali, skor kesehatan, PM berbasis jam) + firmware ESP32 + simulator | ✅ logika prediksi dan SQL diuji; firmware dikompilasi dan dijalankan dengan perangkat tiruan; **belum diuji di ESP32/sensor nyata**; lihat docs/ESP32.md |
| Monitoring Mesin (kartu langsung per mesin: nilai, tren, jalan/berhenti, koneksi; auto-refresh 15 dtk) | ✅ aturan diuji (unit) dan query dijalankan di Postgres; belum dilihat dengan data perangkat nyata |
| Uji alur utama otomatis (`node tools/smoke-test.mjs`: login → WO sampai ditutup → PDF → telemetri) | ✅ skrip diuji dengan server tiruan; **belum dijalankan ke sistem sungguhan** |
| Perangkat RTU (berbasis ESP32): pendaftaran dari web (buat sensor + API key per perangkat + config.h otomatis), heartbeat status (Wi-Fi, uptime, antrean, firmware) | ✅ aturan dan SQL diuji; firmware dikompilasi + dijalankan dengan perangkat tiruan; **belum diuji dengan ESP32 asli** |
| Beban & kebutuhan teknisi (kapasitas vs beban, lembur, jumlah teknisi, cuti) dan Matriks Skill (level 0–4, cakupan per shift, sertifikat, rekomendasi penugasan) | ✅ aturan hitung diuji unit (9 tes) dan SQL diuji; **asumsi (faktor produktif, batas lembur) perlu disesuaikan dengan kondisi perusahaan; halaman web belum dijalankan di browser** |
| Notifikasi (bel: WO baru, PM jatuh tempo, penugasan, alarm), Label QR aset + pemindai + lapor dari HP, PWA (dapat dipasang, halaman offline) | 🟡 pemicu notifikasi + SQL diuji (`db/tests/notifications.sql`); halaman web baru lolos cek sintaks; **belum dijalankan di browser/HP, pustaka `qrcode`/`jsqr` belum terpasang di sandbox ini (terpasang saat build Docker)**; push saat aplikasi tertutup belum ada; lihat docs/NOTIFIKASI_QR_PWA.md |
| Perangkat RTU lewat **MQTT** + banyak perangkat + konfigurasi tanpa flash ulang (portal Wi-Fi/kode konfigurasi), Mosquitto + Node-RED di Docker (`--profile iot`) | 🟡 pembaca kode konfigurasi (C++), pembuat kode (API), fungsi flow Node-RED, dan sintaks firmware diuji di komputer; **belum diuji di ESP32 asli, broker Docker, dan HP**; lihat docs/MQTT_RTU.md |
| Power meter per area (Modbus via Node-RED/gateway) -> kWh harian otomatis di Electrical & Utility | 🟡 perhitungan harian di DB (`db/tests/meters.sql`), validasi API, dan decode Node-RED diuji; **belum diuji dengan meter/gateway nyata dan server berjalan**; lihat docs/POWER_METER.md |
| Data demo 2 plant (PA, PB) lengkap untuk semua menu, bisa dipasang/dihapus dengan script | 🟡 diuji pada database kosong (pasang → hapus → pasang ulang); **belum diuji di database laptop dan tampilan peramban**; lihat docs/DATA_DEMO.md |
| API NestJS dan Web Next.js (semua modul) | 🟡 lolos kompilasi + build di CI; **belum pernah dijalankan end-to-end** dan belum dilihat di browser sungguhan |
| WhatsApp masuk: MULAI/SELESAI/STATUS dan foto → lampiran WO | 🟡 kode ada, belum diuji dengan WhatsApp sungguhan |
| Modul 6 Sparepart & Inventory: stok (mutasi append-only, tak bisa minus), WO↔suku cadang, saran reorder, PR + approval, BOM PM | 🟡 DB teruji, API/UI baru dikompilasi CI |
| Modul 9 Dashboard KPI: availability, MTTR, MTBF, kepatuhan PM, SLA, backlog, Pareto, biaya, ekspor CSV | 🟡 rumus DB teruji dengan data hitungan manual; API/UI baru dikompilasi CI |
| Modul 5 AI Assistant: basis pengetahuan (pencarian teks penuh), tanya-jawab Claude dengan sumber, alarm + diagnosis awal + buat WO | 🟡 pencarian & alarm teruji di DB; pemanggilan Claude API belum diuji dengan kunci sungguhan. Tanpa `ANTHROPIC_API_KEY` otomatis jatuh ke mode pencarian saja |
| Modul 7 Electrical & Utility: energi per lini/utilitas (harian/shift/rentang/PO), tarif, kWh/ton, model beban dasar, anomali, impor CSV | 🟡 rumus & aturan bentrok teruji dengan data hitungan manual |
| Laporan otomatis harian/mingguan/bulanan/tahunan: unduh PDF, kirim email, jadwal, riwayat (`docs/REPORTS.md`) | 🟡 periode & jadwal teruji di DB; PDF teruji dan diperiksa visual; **pengiriman email belum diuji dengan SMTP sungguhan** |
| Impor massal data master (aset, teknisi, suku cadang): periksa dulu, semua-atau-tidak-sama-sekali, laporan galat per baris | 🟡 logika validasi teruji; endpoint & UI dikompilasi CI |
| Modul 8 RCA & Failure: siklus PDCA bergerbang, 5 Why, fishbone 6M, tindakan terverifikasi Supervisor, FMEA (RPN), Pareto penyebab | 🟡 gerbang tahap & RPN teruji di DB |
| Lampiran foto/PDF ke S3 (web + WhatsApp), bucket privat | 🟡 kode ada, belum diuji dengan S3/MinIO sungguhan |


Prototipe interaktif 10 modul adalah spesifikasi fungsional untuk port ke produksi.

## Menjalankan (setelah apps/ lengkap)
```bash
cp .env.example .env   # isi semua CHANGE_ME
docker compose up -d --build
```
Migrasi `db/migrations/*.sql` dijalankan otomatis oleh service `migrate` (idempoten).

## Membuat organisasi & Admin pertama
Setelah `docker compose up -d`, jalankan sekali (password acak dicetak satu kali):
```bash
docker compose run --rm -e OWNER_DATABASE_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@db:5432/$POSTGRES_DB" \
  api node dist/cli/bootstrap.js --org nama-perusahaan --name "Nama Perusahaan" --plant P1 --plant-name "Plant 1" --admin admin
```
Login di web dengan organisasi `nama-perusahaan` dan username tersebut, lalu kelola pengguna, teknisi, dan plant di menu Administrasi.

## Menguji skema database
```bash
createdb mh_test
for f in db/migrations/*.sql; do psql -d mh_test -v ON_ERROR_STOP=1 -f $f; done
psql -d mh_test -f db/seed/dev_seed.sql
psql -d mh_test -f db/tests/rls_and_workflow.sql   # harus berakhir: SEMUA UJI LULUS
psql -d mh_test -f db/tests/kpi.sql                # harus berakhir: UJI KPI LULUS
psql -d mh_test -f db/tests/rca.sql                # UJI RCA LULUS
psql -d mh_test -f db/tests/energy.sql             # UJI ENERGI LULUS
psql -d mh_test -f db/tests/ai.sql                 # UJI AI LULUS
```
Seed hanya untuk dev (hash password placeholder).

## Struktur
`db/` migrasi, seed, uji · `apps/api` backend · `apps/web` frontend · `infra/` nginx & skrip · `docs/` arsitektur.
