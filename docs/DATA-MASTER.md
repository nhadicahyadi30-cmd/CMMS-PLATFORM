# Mengisi data master MaintHub

Urutan yang benar (setiap langkah bergantung pada langkah sebelumnya):

1. **Plant** — *Administrasi → Plant*. Satu plant = satu lokasi pabrik. Kode plant (mis. `JKT-01`) dipakai di semua berkas impor.
2. **Pengguna** — *Administrasi → Pengguna*. Tentukan peran (admin, supervisor, planner, teknisi) dan plant yang boleh diakses. Supervisor/planner hanya melihat plant miliknya.
3. **Teknisi** — impor massal (*Impor Data → Teknisi*, khusus admin) atau satu per satu di *Administrasi → Teknisi*. Teknisi bisa dihubungkan ke akun pengguna dan WhatsApp.
4. **Aset & equipment** — *Impor Data → Aset & Equipment*. Hierarki: plant → area → equipment → komponen, dihubungkan lewat kolom `parent` (kode induk). Urutan baris bebas; sistem mengurutkan sendiri.
5. **Suku cadang** — *Impor Data → Suku Cadang*. Stok awal dicatat lewat transaksi *penerimaan* (bukan kolom impor) agar ada jejak audit.

## Cara impor
1. Buka *Impor Data*, pilih jenis data, klik **Unduh templat CSV**.
2. Isi di Excel, lalu *Save As → CSV UTF-8*. Atau salin sel dari Excel dan tempel langsung ke kotak.
3. Klik **Periksa**: seluruh proses dijalankan lalu dibatalkan. Jika ada masalah, tabel menampilkan nomor baris dan alasannya (maksimal 100 ditampilkan).
4. Perbaiki, ulangi Periksa sampai hijau, lalu **Impor**.

Aturan: satu baris bermasalah = tidak ada yang tersimpan. Kode yang sudah ada **dilewati, tidak ditimpa**, sehingga berkas yang sama aman diimpor ulang. Maksimal 5.000 baris per impor; pecah berkas yang lebih besar.

## Kolom
| Data | Wajib | Opsional |
|---|---|---|
| Aset | plant, code, name, type | parent, manufacturer, model, serial, year, status, critSafety, critProduction, critQuality, critCost |
| Teknisi | plant, code, fullName, skill, shift | phone, hourlyRate |
| Suku cadang | plant, code, name | category, unit, location, minStock, reorderQty, unitCost, critical |

Judul kolom boleh berbahasa Indonesia (mis. `kode`, `nama`, `induk`, `telepon`); templat memberi nama baku.
