# Beban Teknisi & Matriks Skill

Menu **Beban Teknisi** (`/workload`) dan **Matriks Skill** (`/skills`), modul 3 (Work Order).

## Cara hitung (semua angka bisa diubah admin di halaman Beban Teknisi → "Ubah asumsi")
- **Kapasitas teknisi** = (hari kerja − hari cuti) × kapasitas harian × faktor produktif (default 0,70; sisanya perjalanan, izin kerja, istirahat). Hari kerja default 6/minggu.
- **Beban** = sisa jam WO yang ditugaskan (yang sedang dikerjakan dihitung separuh) + WO belum bertugas (menunggu approval atau disetujui) + PM kalender jatuh tempo dalam periode yang belum jadi WO + pekerjaan tak terencana. PM berbasis meter belum ikut.
- **Tak terencana** = rata-rata breakdown/emergency/korektif 30 hari terakhir (jam aktual, atau estimasi bila kosong), dengan batas bawah `reserve_pct` (default 10%) dari kapasitas.
- **Status tim**: aman (≤ target utilisasi 85%) → padat (≤ 100%) → perlu lembur (≤ kapasitas + lembur maksimum) → kurang teknisi. Bila tidak ada kapasitas sama sekali: "tidak ada kapasitas".
- **Lembur**: jam yang melebihi kapasitas dibagi jumlah teknisi hadir, dibandingkan dengan batas 4 jam/hari dan 18 jam/minggu (default umum di Indonesia; **cek dengan HRD/aturan yang berlaku**, ini bukan nasihat hukum).
- **Teknisi dibutuhkan**: rekomendasi (agar beban ≤ target utilisasi tanpa lembur), minimum (utilisasi 100%), dan dengan lembur maksimum; selisih terhadap jumlah sekarang.

Batasan: jam perjalanan antar-plant, keahlian ganda dalam satu WO, dan PM berbasis meter belum dimodelkan; WO tanpa estimasi jam akan dihitung 0. Hasilnya perkiraan perencanaan, bukan angka pasti.

## Matriks skill
- Level 0 Belum, 1 Dasar, 2 Terbatas, 3 Mandiri, 4 Ahli. Level ≥ 3 dihitung sebagai **tercakup**.
- Tiap skill punya `min_coverage` (orang mandiri per shift). Risiko: **aman**, **kurang orang**, **SPOF** (hanya 1 orang mandiri), **kosong** (tidak ada).
- Sertifikat opsional: ditandai "segera habis" ≤ 60 hari dan "lewat".
- WO dan rencana PM boleh punya `skill_id` + level minimum. Rekomendasi penugasan: yang memenuhi skill diutamakan, lalu beban terendah, lalu plant sama; teknisi yang sedang cuti dikeluarkan.

## API
`GET /workforce/overview?days=&plantId=`, `GET|PUT /workforce/settings` (admin), `GET|POST|PUT|DELETE /workforce/skills`, `GET|PUT /workforce/matrix`, `GET|POST|DELETE /workforce/absences`, `GET /workforce/suggest?woId=`. Migrasi: `db/migrations/0020_workforce.sql`.
