# Data demo (2 plant)

Mengisi organisasi **demo** dengan dua plant lengkap supaya semua menu terisi:

| Plant | Isi |
|---|---|
| **PA** | aset berjenjang, teknisi + skill, WO (riwayat 2 bulan), PM, sparepart + stok, unit energi + power meter, telemetri/alarm, RCA/FMEA |
| **PB** | sama, dengan data berbeda |

Semua berupa baris biasa: bisa diedit, dihapus, dan ditambah dari aplikasi.

## Pasang
```bash
# PowerShell (Windows) - tanda < tidak didukung di PowerShell
docker compose cp db/seed/demo_data.sql db:/tmp/demo_data.sql
docker compose exec db psql -U maintainhub_owner -d maintainhub -v org_slug=demo -f /tmp/demo_data.sql
```
Ganti `maintainhub_owner`/`maintainhub` bila `POSTGRES_USER`/`POSTGRES_DB` di .env Anda berbeda. Di bash/CMD: `docker compose exec -T db psql ... -f - < db/seed/demo_data.sql`.
Pengguna demo: `spv.pa`, `plan.pa`, `tek.pa1`, `prd.pa` (Produksi), `spv.pb`, `plan.pb`, `tek.pb1`, `prd.pb` (Produksi) (kata sandi **sama dengan admin**).
Script berhenti bila plant PA/PB sudah ada.

## Hapus / ulang
```powershell
docker compose cp db/seed/demo_remove.sql db:/tmp/demo_remove.sql
docker compose exec db psql -U maintainhub_owner -d maintainhub -v org_slug=demo -f /tmp/demo_remove.sql
```
Menghapus plant PA/PB beserta seluruh isinya (termasuk data yang Anda tambah di sana) dan pengguna demo. Plant P1 dan admin tidak disentuh.

Catatan: script memakai `session_replication_role = replica`, jadi harus dijalankan oleh pemilik/superuser database.


## Data keselamatan & inspeksi (ditambahkan)
Per plant: 2 templat inspeksi (teknisi mingguan, operator harian) dengan riwayat ±8 minggu/14 hari, sebagian abnormal dan menghasilkan WO otomatis; 3 titik LOTO per aset; 6 izin kerja contoh (diajukan, disetujui, diserahkan, aktif, ditutup, ditolak) lengkap dengan gembok dan riwayat. Dipasang dan dihapus oleh script yang sama. Bila database sudah berisi data demo lama, jalankan `demo_remove.sql` lalu `demo_data.sql` lagi (migrasi 0023 otomatis lewat layanan `migrate`).
