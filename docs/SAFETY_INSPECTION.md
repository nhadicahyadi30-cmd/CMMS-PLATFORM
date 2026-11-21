# Inspeksi, Izin Kerja (PTW), LOTO, Peran Produksi, Mode Lapangan

## Peran & hak akses
Peran: admin, supervisor, planner, technician, **production**. Modul baru: 11 Inspeksi & Checklist, 12 Izin Kerja & LOTO. Admin mengatur modul per peran di **Admin → Hak akses** (berlaku setelah pengguna login ulang). Admin selalu penuh; modul Admin (10) tidak dapat diberikan.
Produksi: mengajukan perbaikan (hanya breakdown/korektif), hanya melihat WO miliknya, menyerahkan & mengonfirmasi penutupan izin di areanya, mengisi checklist operator; tidak dapat mengubah WO/PM, jadwal teknisi, atau suku cadang WO.

## Izin Kerja (PTW)
Teknisi ajukan → Supervisor setujui → Produksi serahkan area → teknisi pasang gembok + verifikasi nol-energi tiap titik → aktif → selesai (semua gembok dilepas) → Produksi konfirmasi penutupan. Alur dijaga trigger DB (bukan hanya UI); satu izin aktif/diserahkan per aset; jejak audit tidak dapat diubah. Pelepasan gembok oleh orang lain hanya Supervisor/Admin dengan alasan.
LOTO: daftar titik isolasi per aset (menu Izin Kerja → LOTO), gembok bernomor per orang.

## Inspeksi & Checklist
Templat per aset (ya/tidak, angka dengan batas min/maks, teks; butir wajib/kritis; audiens semua/teknisi/produksi; frekuensi hari). Temuan abnormal otomatis membuat WO (P3; P2 bila butir kritis). Pengiriman idempoten lewat `client_uid`.

## Mode Lapangan (offline) — `/field`
Buka `/field` saat online, tekan **Unduh data terbaru**. Tanpa sinyal: isi checklist/inspeksi dan mulai/selesaikan WO; masuk antrean (IndexedDB) dan terkirim otomatis saat online. PTW sengaja hanya online (status keselamatan harus aktual).

## Belum diverifikasi
Build Nest/Next dan type-check web; tampilan di browser/HP; service worker & sinkron offline di perangkat nyata. Sistem ini alat pencatatan alur, **bukan pengganti prosedur keselamatan perusahaan**.
