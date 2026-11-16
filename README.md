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
