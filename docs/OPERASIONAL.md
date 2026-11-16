# Operasional: backup database & permintaan demo

## Backup otomatis
Service `backup` di `docker-compose.yml` membuat dump database (`pg_dump -Fc`) ke folder **`./backups`** di samping `docker-compose.yml`:
- Satu backup saat stack pertama dijalankan, lalu satu per hari setelah jam `BACKUP_HOUR` (default 02, zona `BACKUP_TZ`, default Asia/Jakarta).
- Setiap berkas diverifikasi dengan `pg_restore --list`; yang rusak diberi akhiran `.corrupt`.
- Berkas lebih tua dari `BACKUP_KEEP_DAYS` (default 14) dihapus otomatis.
- Lihat log: `docker compose logs backup`.

**Folder `./backups` ada di laptop yang sama dengan database.** Salin berkala ke tempat lain (flashdisk, Google Drive/OneDrive, server lain), karena backup di disk yang sama tidak menolong kalau laptop rusak.

Berkas lampiran (foto, PDF) ada di volume MinIO (`miniodata`), tidak ikut backup ini.

### Pulihkan (restore)
```
docker compose stop api web
docker compose exec -T db dropdb -U maintainhub_owner --if-exists maintainhub
docker compose exec -T db createdb -U maintainhub_owner maintainhub
docker compose exec -T db pg_restore -U maintainhub_owner -d maintainhub --no-owner < backups\mh_TANGGAL.dump
docker compose up -d
```
(ganti `maintainhub_owner`/`maintainhub` dengan `POSTGRES_USER`/`POSTGRES_DB` di `.env`; di PowerShell gunakan `cmd /c "... < file"` untuk pengalihan input.)
Setelah restore, jalankan `docker compose up -d --build` agar migrasi dan password role aplikasi diterapkan ulang.

## Permintaan demo dari website
Form di halaman Contact mengirim ke `POST /api/public/leads` dan tersimpan di tabel `leads`.
- Perlindungan spam: batas 5 permintaan per IP per jam, dan kolom jebakan (honeypot) tersembunyi.
- Tabel ini hanya bisa **ditulis** oleh API; tidak bisa dibaca lewat API atau akun aplikasi mana pun. Baca lewat database:
```
docker compose exec db psql -U maintainhub_owner -d maintainhub -c "select id, created_at, name, company, phone, email, size, message, status from leads order by id desc"
```
- Tandai sudah dihubungi: `update leads set status='contacted' where id=1;`
- Opsional: isi `LEADS_NOTIFY_EMAIL` (dan SMTP) di `.env` agar setiap permintaan baru juga dikirim ke email Anda.
- Jika API tidak terjangkau, form otomatis membuka aplikasi email sebagai cadangan.
