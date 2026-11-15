# MaintainHub CMMS (nama sementara)

Platform CMMS berbasis web: 10 modul, multi-plant, multi-user dengan RBAC. Pilot: pabrik F&B (>500 aset, >30 teknisi).

## Status
| Bagian | Status |
|---|---|
| Skema DB (PostgreSQL 16, RLS, trigger alur WO) | ✅ selesai, lolos uji (`db/tests`) |
| Infrastruktur (Docker Compose, Nginx, backup, CI) | ✅ sintaks tervalidasi, belum dijalankan end-to-end |
| API NestJS: login/refresh/lockout, aset, WO + approval, PM, kirim & terima WhatsApp | 🟡 kode ditulis, **belum dikompilasi/dijalankan** (query SQL-nya sudah diuji ke Postgres) |
| Web Next.js: login, aset, WO (aksi sesuai peran), PM | 🟡 kode ditulis, **belum dikompilasi/dijalankan** |
| WhatsApp masuk: MULAI/SELESAI/STATUS dan foto → lampiran WO | 🟡 kode ada, belum diuji dengan WhatsApp sungguhan |
| Modul 6 Sparepart & Inventory: stok (mutasi append-only, tak bisa minus), WO↔suku cadang, saran reorder, PR + approval, BOM PM | 🟡 DB teruji, API/UI baru dikompilasi CI |
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
```
Seed hanya untuk dev (hash password placeholder).

## Struktur
`db/` migrasi, seed, uji · `apps/api` backend · `apps/web` frontend · `infra/` nginx & skrip · `docs/` arsitektur.
