# MaintainHub CMMS (nama sementara)

Platform CMMS berbasis web: 10 modul, multi-plant, multi-user dengan RBAC. Pilot: pabrik F&B (>500 aset, >30 teknisi).

## Status
| Bagian | Status |
|---|---|
| Skema DB (PostgreSQL 16, RLS, trigger alur WO) | ✅ selesai, lolos uji (`db/tests`) |
| Infrastruktur (Docker Compose, Nginx, backup, CI) | ✅ sintaks tervalidasi, belum dijalankan end-to-end |
| API NestJS: login/refresh/lockout, aset, WO + approval, PM, kirim & terima WhatsApp | 🟡 kode ditulis, **belum dikompilasi/dijalankan** (query SQL-nya sudah diuji ke Postgres) |
| Web Next.js: login, aset, WO (aksi sesuai peran), PM | 🟡 kode ditulis, **belum dikompilasi/dijalankan** |
| Pemrosesan pesan WhatsApp masuk (balasan teknisi → log/lampiran WO) | ⏳ berikutnya |
| Modul 5–10 produksi | ⏳ tahap selanjutnya |

Prototipe interaktif 10 modul adalah spesifikasi fungsional untuk port ke produksi.

## Menjalankan (setelah apps/ lengkap)
```bash
cp .env.example .env   # isi semua CHANGE_ME
docker compose up -d --build
```
Migrasi `db/migrations/*.sql` dijalankan otomatis oleh service `migrate` (idempoten).

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
