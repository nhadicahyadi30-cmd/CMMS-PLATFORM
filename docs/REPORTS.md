# Laporan otomatis (PDF + email)

Menu **Reports** (modul 9). Jenis laporan: **harian, mingguan, bulanan, tahunan**.

## Isi laporan (PDF A4)
Ringkasan eksekutif otomatis (kalimat siap baca atasan), 8 kartu indikator dengan perbandingan periode sebelumnya (Availability, MTTR, MTBF, kepatuhan PM, breakdown, downtime, WO selesai, backlog), Pareto aset downtime, umur backlog, biaya maintenance per aset, kinerja teknisi, sparepart di bawah stok minimum, dan tren 12 bulan (khusus bulanan/tahunan). Semua angka memakai rumus KPI yang sama dengan dashboard (`kpi_*` di database).

## Cara pakai
- **Buat laporan** — pilih jenis, tanggal (periode yang memuat tanggal itu), plant → **Unduh PDF**. Admin/supervisor juga bisa **Kirim sekarang** ke email.
- **Jadwal otomatis** (admin/supervisor) — nama, frekuensi, jam kirim (WIB), plant, penerima (maks. 20).
  - Harian: tiap hari, memuat kemarin · Mingguan: tiap Senin, Senin–Minggu lalu · Bulanan: tiap tanggal 1, bulan lalu · Tahunan: tiap 1 Januari, tahun lalu.
  - Jadwal baru tidak mengirim periode yang sudah lewat; pengiriman pertama pada jatuh tempo berikutnya.
  - Gagal kirim dicoba lagi tiap ±30 menit, maksimal 3 kali per periode, lalu periode itu dilewati dan tercatat di **Riwayat kirim**.
- **Riwayat kirim** — setiap kiriman (berhasil/gagal) beserta alasannya.

## Mengaktifkan email
Isi di `.env`, lalu `docker compose up -d --build`:
```
SMTP_HOST=smtp.gmail.com        # Office 365: smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false               # port 465 -> true
SMTP_USER=akun@perusahaan.com
SMTP_PASS=...                   # Gmail/Google Workspace: "App password", bukan password login
SMTP_FROM="MaintHub <akun@perusahaan.com>"
```
Gunakan akun khusus (mis. `laporan@…`) dan bukan akun pribadi.

## Keamanan
- Pengiriman email hanya untuk admin/supervisor; akun yang dibatasi plant wajib memilih plant (tidak bisa mengirim "semua plant").
- Pengiriman dan perubahan jadwal masuk `audit_log`.
- Penerima boleh alamat di luar perusahaan: hanya tambahkan alamat yang berhak menerima data perawatan.

## Catatan teknis
Penjadwal berjalan di proses API (cek tiap menit, zona Asia/Jakarta); aman bila ada beberapa instance (kunci baris). Matikan dengan `REPORTS_SCHEDULER=off`. Jika server mati saat jatuh tempo, laporan terkirim saat server hidup kembali (periode terakhir saja).
