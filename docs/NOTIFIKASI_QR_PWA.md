# Notifikasi, Label QR Aset, dan PWA

## Notifikasi (bel di pojok aplikasi)
Dibuat oleh pemicu database (`db/migrations/0021_notifications.sql`), jadi muncul dari jalur mana pun: web, WhatsApp, API sensor, pembuat PM.

| Kejadian | Penerima | Tautan |
|---|---|---|
| WO baru (manual/WhatsApp/RCA) | Admin, Supervisor, Planner yang berhak atas plant itu (Admin: semua plant). Pengguna nonaktif dilewati. | WO |
| PM jatuh tempo (WO otomatis dari `pm_generate`) | sama | WO |
| WO ditugaskan atau teknisi diganti | akun pengguna milik teknisi tersebut (harus ditautkan di data teknisi) | WO |
| Alarm `warning`/`critical` (`info` tidak) | Admin, Supervisor, Planner plant itu | AI Assistant |

- Bel memeriksa server tiap 30 detik. Saat ada yang baru dan izin diberikan, muncul notifikasi perangkat (HP/desktop) selama MaintHub **terbuka** (termasuk di latar belakang).
- Notifikasi sudah dibaca dihapus setelah 30 hari, semuanya setelah 90 hari.
- Kegagalan membuat notifikasi tidak pernah menggagalkan WO/alarm (hanya peringatan di log database).
- **Belum ada:** push saat aplikasi benar-benar tertutup (butuh Web Push + kunci VAPID + server publik HTTPS), email, dan WhatsApp keluar. Teknisi tanpa akun login tidak menerima notifikasi.
- Teknisi hanya diberi tahu bila `technicians.user_id` terisi (hubungkan di Administrasi).

## Label QR aset
1. Menu **Aset & Equipment → Label QR**. Pilih aset, periksa alamat, klik **Cetak**.
2. Isi QR: `<alamat>/a/<qr_token>`. Token acak 32 karakter per aset (kolom `assets.qr_token`), bukan id internal.
3. **Alamat harus bisa dibuka dari HP.** Kolom alamat otomatis terisi dari alamat browser; bila `localhost`, QR hanya jalan di laptop. Pakai `http://<IP laptop>` (satu Wi-Fi) atau domain server. Ganti sebelum mencetak; label yang sudah ditempel tidak ikut berubah bila alamat server pindah, jadi sebaiknya cetak setelah memakai domain tetap.
4. Memindai membuka halaman aset: ringkasan, WO berjalan, riwayat, dan **Lapor kerusakan** (menjadi WO yang menunggu approval).
5. Pengguna harus login; bila belum, diarahkan ke login lalu kembali ke halaman aset. QR dari organisasi lain tampil "aset tidak ditemukan" (dijaga RLS).
- **Pindai QR Aset** (menu): kamera di dalam aplikasi. Butuh HTTPS atau `localhost`. Lewat `http://192.168...` kamera diblokir browser; pakai aplikasi Kamera bawaan HP, yang tetap membuka tautannya.

## PWA (dipasang di HP)
- `manifest.webmanifest`, ikon, `sw.js`, `offline.html`. Chrome/Edge Android: menu ⋮ → *Pasang aplikasi* (atau tombol di bel). iPhone: Safari → Bagikan → *Tambah ke Layar Utama*.
- Service worker hanya aktif di build produksi dan di **HTTPS atau localhost**. Lewat `http://<IP>` aplikasi tetap bisa dipakai di browser tetapi tidak bisa dipasang.
- Yang di-cache hanya berkas statis (JS/CSS/ikon). **Data (/api, /auth) tidak pernah di-cache.** Saat offline: halaman "Tidak ada koneksi".
- **Belum ada:** pengisian laporan saat offline (antrean kirim ulang). Perlu koneksi untuk semua data.
