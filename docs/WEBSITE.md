# Website publik MaintHub

Halaman yang tampil **sebelum login**: `/` (beranda), `/products`, `/services`, `/about`, `/clients`, `/contact`. Aplikasi CMMS tetap di balik `/login` (setelah masuk → `/work-orders`).

## Mengubah isi
Semua teks ada di `apps/web/src/lib/site-content.ts`:
- `CONTACT` — **ganti email, telepon, alamat** (nilai bawaan hanya placeholder).
- `CLIENTS` — isi **hanya** klien yang sudah setuju namanya ditampilkan. Selama kosong, halaman Klien menampilkan program mitra pilot (tidak ada nama atau testimoni karangan).
- `MODULES`, `SERVICES`, `SECTORS`, `STEPS` — isi produk, layanan, sektor, dan tiga langkah.
Angka di beranda ("500+ aset", "30+ teknisi") adalah **target desain pilot**, bukan klaim pelanggan; ubah jika punya data nyata.

## Catatan
- Formulir kontak membuka aplikasi email pengunjung (mailto). Belum menyimpan data ke server.
- Visual produk bertanda "Ilustrasi" — bukan data sungguhan.
- Logo & lambang: `apps/web/brand/*.svg`, komponen `components/Logo.tsx`.
