# Memasang perangkat RTU (ESP32) di mesin (suhu oli, arus, getaran, running hour)

Panduan ini untuk satu **node ESP32** per mesin. Node membaca sensor, menghitung **running hour** sendiri (tahan mati listrik), lalu mengirim data ke MaintHub lewat Wi-Fi. Data muncul di *Telemetri Mesin* dan dianalisis di *Dashboard Prediksi*.

> **Status: belum diuji pada perangkat nyata.** Firmware sudah dikompilasi dan logikanya diuji dengan perangkat tiruan di komputer, tetapi belum dijalankan di ESP32, sensor, maupun server produksi. Pasang dulu di **satu mesin percobaan** dan bandingkan dengan alat ukur/hour meter yang ada sebelum diperbanyak.

## 1. Komponen (per mesin)
| Fungsi | Komponen | Catatan |
|---|---|---|
| Otak + Wi-Fi | ESP32 DevKit (ESP32-WROOM-32) | Pakai catu 5 V stabil (adaptor DIN-rail 24 V → 5 V lebih baik dari charger HP) |
| Suhu oli | DS18B20 versi probe stainless tahan air + resistor 4,7 kΩ | Tempel/pasang di housing/ sump oli; jangan kontak langsung dengan komponen > 120 °C |
| Arus motor | SCT-013 (mis. 30 A/1 V, keluaran tegangan) | Penjepit non-invasif: cukup dijepit di **satu kabel fasa** |
| Status jalan | Optocoupler (PC817) + resistor, dari kontak bantu kontaktor | Paling akurat untuk running hour. Alternatif: tanpa kabel kontak, deteksi dari arus (`PIN_RUN = -1`) |
| Getaran (opsional) | Modul MPU6050 (I²C) | Tempel dengan baut/epoksi di rumah bearing. Ini indikator tren, bukan pengganti analisis getaran profesional |
| Pelindung | Box IP65, gland kabel, fuse kecil, terminal | |

## 2. Keselamatan
- Pekerjaan di panel listrik hanya oleh **teknisi listrik berwenang**, dengan prosedur LOTO perusahaan Anda.
- **Jangan menyambung tegangan jaringan (220/380 V) langsung ke ESP32.** Sinyal status jalan harus lewat optocoupler dari kontak bantu (kontak kering atau 24 V DC).
- SCT-013 dijepit di kabel yang berisolasi; jangan dilepas saat motor berbeban jika modulnya tanpa resistor beban/ dioda pelindung.
- Area berpotensi ledakan/ debu mudah meledak (ATEX): perangkat ini **tidak** bersertifikat untuk area tersebut.
- Pastikan kebijakan IT mengizinkan perangkat IoT di jaringan pabrik (idealnya VLAN terpisah).

## 3. Pengkabelan
```
DS18B20      : merah → 3V3 · hitam → GND · kuning (data) → GPIO4, resistor 4,7 kΩ antara data dan 3V3
Arus SCT-013 : keluaran modul → GPIO34 (ADC1, hanya input); modul dengan bias 3V3/2 (≈1,65 V di titik tengah)
Status jalan : kontak bantu kontaktor → LED optocoupler (seri resistor sesuai tegangan); transistor optocoupler: GPIO27 ke GND
               (INPUT_PULLUP aktif: LOW saat mesin jalan, sesuai RUN_ACTIVE_LEVEL)
MPU6050      : VCC → 3V3 · GND → GND · SDA → GPIO21 · SCL → GPIO22
```
Gunakan **ADC1** (GPIO32–39) untuk arus; ADC2 tidak dapat dipakai saat Wi-Fi menyala.

## 4. Cara cepat: menu Perangkat ESP32 (disarankan)
1. Login sebagai Admin → **Analitik → Perangkat ESP32** → *Daftarkan ESP32 baru*: pilih mesin, beri nama, centang sensor yang terpasang, isi **alamat server** (IP laptop/server yang bisa dijangkau ESP32, mis. `http://192.168.1.50`; bukan `localhost`).
2. MaintHub otomatis membuat sensor (`oil_temp`, `motor_current`, `vibration_rms`, `running_hours`) bila belum ada, satu API key khusus perangkat (terbatas ke plant mesin), dan **config.h** siap pakai. Unduh sekarang: kunci tidak bisa ditampilkan lagi (bila hilang, klik *Kunci baru* dan flash ulang).
3. Taruh `config.h` di `firmware/esp32-mainthub/`, isi Wi-Fi, upload (bagian 5). Status di tabel berubah dari *Menunggu data pertama* menjadi *Online*.
4. Tabel menampilkan juga kekuatan Wi-Fi, uptime, jumlah reboot, antrean data, versi firmware, dan total pembacaan, dari "heartbeat" yang dikirim ESP32 bersama datanya.
Batas alarm awal (suhu oli 85/95 °C) hanya contoh: sesuaikan di menu Telemetri.

Cara manual (tanpa menu Perangkat) ada di bagian berikut.

## 4b. Siapkan di MaintHub secara manual (sekali)
1. **Aset**: pastikan mesin sudah ada di *Aset & Equipment* (catat kodenya, mis. `PMP-203`).
2. **API key**: *Telemetri Mesin* → API key pengirim data → buat kunci (Admin). Salin sekarang; tidak bisa ditampilkan lagi. Disarankan **satu kunci per plant**.
3. **Sensor/tag** (menu yang sama → Tambah sensor). Contoh, sesuaikan dengan spesifikasi mesin Anda dari manual/OEM:

| Tag | Jenis | Satuan | Peringatan ≥ | Kritis ≥ | Nilai wajar | Konfirmasi |
|---|---|---|---|---|---|---|
| `oil_temp` | Pengukuran | °C | 85 | 95 | -20 … 150 | 3 |
| `motor_current` | Pengukuran | A | 90% FLA | 105% FLA | 0 … 200 | 3 |
| `vibration_rms` | Pengukuran | g | sesuai baseline | sesuai baseline | 0 … 8 | 3 |
| `running_hours` | **Running hour** | jam | - | - | - | - |

   Angka batas di atas hanya contoh. Tetapkan dari manual OEM atau baseline mesin sehat Anda. Batas yang salah menghasilkan alarm palsu atau alarm yang terlambat.
4. **PM berbasis jam**: di *Preventive*, buat rencana dengan pemicu **meter** (running hours) dan interval (mis. 500 jam). Dashboard Prediksi akan menampilkan perkiraan hari jatuh tempo dari laju pemakaian.

## 5. Pasang firmware
1. Arduino IDE → *Boards Manager*: **esp32 by Espressif** (versi 2.x atau 3.x). *Library Manager*: **OneWire** dan **DallasTemperature**.
2. Buka `firmware/esp32-mainthub/esp32-mainthub.ino`. Edit **`config.h`**: Wi-Fi, `MH_URL`, `MH_API_KEY`, `MH_ASSET`, pin, dan sensor yang dipakai (`USE_*`). **Jangan commit kunci asli ke Git.**
3. Board: *ESP32 Dev Module* → Upload. Buka Serial Monitor 115200.
4. Anda akan melihat baris seperti `oli=71.2C arus=17.80A ... jam=1200.04 jalan=1` dan `terkirim 2 sampel`.
5. **Set nilai awal running hour** sesuai hour meter fisik mesin: ketik di Serial Monitor `sethours 1204.5`. Nilai disimpan di flash. (Tanpa ini, hitungan dimulai dari 0.)
6. Cek di MaintHub: Monitoring Mesin → nilai terakhir muncul dalam ±1 menit.

Perintah serial: `status` (ringkasan), `sethours <jam>`, `wifi <nama> <password>` (simpan Wi-Fi ke flash tanpa flash ulang; nama berspasi pakai tanda kutip: `wifi "Nama WiFi" "password"`).

### 5b. Lewat Node-RED (opsional, disarankan bila sudah ada Node-RED di pabrik)
Alur: ESP32 → Node-RED → MaintHub. Keuntungan: API key tidak ada di ESP32, dan Node-RED bisa juga menerima PLC/MQTT lain.
1. Node-RED → menu ☰ → *Import* → pilih `tools/nodered/mainthub-flow.json` → Deploy.
2. Buka tab **MaintHub gateway** → *Environment Variables*: isi `MAINTHUB_URL` (mis. `http://192.168.1.50`) dan `MAINTHUB_KEY`. Ikon node *GET /api/ingest/ping* menjadi hijau bila kunci benar.
3. Di `config.h` ESP32: `MH_URL "http://IP-NODERED:1880/mainthub/ingest"` dan `MH_API_KEY ""`.
4. Jalur MQTT (opsional, untuk perangkat/gateway lain): publish JSON ke `mainthub/<KODE-ASET>/telemetry`, mis. `{"oil_temp":71.2,"running_hours":1204.5}`. Ubah alamat broker pada node *Broker lokal*. Alur Node-RED ini **sudah memuat** node `mqtt in` (jalur B), jadi untuk MQTT cukup arahkan broker. Firmware ESP32 di repo ini memakai jalur HTTP, bukan MQTT; varian firmware MQTT belum dibuat.
Catatan: endpoint `/mainthub/ingest` di Node-RED tidak memakai autentikasi. Batasi di jaringan internal/VLAN, atau aktifkan `httpNodeAuth` di settings.js Node-RED.

### 5c. Mode demo (data dummy, tanpa sensor)
Untuk mencoba alur lengkap sebelum sensor terpasang: centang **Mode demo** saat mendaftarkan perangkat (atau set `#define DEMO_MODE 1` di `config.h`). ESP32 mengirim data buatan (suhu oli ±62 °C yang naik pelan sampai +25 °C, arus ±18 A, getaran kecil, mesin "jalan" terus, running hour bertambah). Library OneWire/DallasTemperature tidak diperlukan. Serial Monitor menampilkan `*** MODE DEMO ***`. Ketik `sethours 1200` bila ingin running hour mulai dari angka tertentu. Pakai **aset uji**: data dummy bercampur dengan data asli di aset yang sama. Ubah `DEMO_MODE` ke 0 dan upload ulang untuk beralih ke sensor sungguhan.

### 5d. Beralih dari demo ke sensor sungguhan (daftar periksa)
1. **Pasang perangkat baru, jangan pakai ulang yang demo**: di menu Perangkat ESP32 daftarkan perangkat untuk mesin sebenarnya, **kosongkan** "Mode demo", centang hanya sensor yang benar-benar terpasang. Unduh `config.h`-nya. Nonaktifkan perangkat demo lama supaya data dummy tidak tercampur.
2. Kabel sesuai bagian 3 dengan listrik **mati dan terkunci (LOTO)**. Sensor arus SCT-013 dijepit pada satu kabel fasa saja, tanpa membuka kabel daya. Pemasangan di panel dikerjakan teknisi listrik berwenang.
3. Pastikan `DEMO_MODE` bernilai `0` di `config.h`, upload, lalu buka Serial Monitor: nilai suhu/arus/getar harus masuk akal (arus ≈ 0 saat motor mati).
4. Kalibrasi arus dan suhu (bagian 7), lalu isi jam hour meter fisik dengan perintah serial `sethours <jam>`.
5. Biarkan data terkumpul beberapa hari sebelum menetapkan batas alarm; getaran dibaca sebagai tren terhadap baseline.
6. Cek: status Online di Perangkat ESP32, kartu mesin di Monitoring Mesin hidup, dan antrean mendekati 0.

## 6. Cara kerja & batasannya
- **Running hour** bertambah hanya saat input status jalan aktif (atau arus > `RUN_CURRENT_A` jika tanpa kabel kontak, dengan resolusi ±30 dtk). Disimpan ke flash tiap 10 menit dan setiap mesin start/stop; listrik mati paling banyak kehilangan 10 menit hitungan.
- **Offline**: bila Wi-Fi/server putus, sampel disimpan di memori (maks ≈ 2 jam, yang terlama dibuang) dan dikirim saat tersambung, dengan **waktu asli** pembacaan. Kirim ulang aman (duplikat diabaikan server). Data tersimpan di RAM: bila ESP32 mati listrik saat offline, antrean hilang; yang tidak hilang hanya running hour.
- **Jam**: waktu diambil dari NTP. Jika NTP tidak terjangkau (jaringan tertutup), arahkan `NTP_SERVER` ke server NTP internal. Tanpa jam yang valid, pembacaan dikirim tanpa waktu dan server memakai waktu penerimaan (antrean offline tidak akurat waktunya).
- **Alarm**: hanya dari pembacaan yang baru (≤ 10 menit). Data susulan hanya disimpan. Lihat `docs/TELEMETRY.md`.
- **Keamanan**: `http://` tidak terenkripsi, hanya untuk jaringan internal tertutup. Untuk lintas internet gunakan `https://`, dan isi `MH_ROOT_CA` agar identitas server diverifikasi. Kunci tersimpan teks-biasa di firmware: gunakan kunci per plant, dan **cabut** kunci dari menu bila perangkat hilang. Aktifkan flash encryption ESP32 bila risiko pencurian fisik tinggi.

## 7. Kalibrasi
- **Arus**: bandingkan dengan clamp meter pada beban stabil, lalu ubah `CURRENT_CAL` secara proporsional (`CAL_baru = CAL_lama × arus_clamp / arus_terbaca`). Cek `CURRENT_BIAS_MV` (saat motor mati, arus terbaca harus ≈ 0).
- **Suhu oli**: bandingkan dengan termometer terkalibrasi. DS18B20 akurat ±0,5 °C, namun suhu di permukaan housing lebih rendah daripada suhu oli sebenarnya: tetapkan batas berdasarkan **hasil ukur di titik pasang**, bukan angka oli di manual.
- **Getaran**: nilai absolut MPU6050 tergantung cara pemasangan. Pakai sebagai **tren terhadap baseline** mesin sehat; biarkan beberapa hari data terkumpul sebelum menetapkan batas.

## 8. Mencoba tanpa perangkat (simulator)
```
node tools/simulate-esp32.mjs --url http://localhost/api/ingest/readings --key mhk_xxx --asset PMP-203 --backfill-hours 24 --live
```
Membuat data 24 jam dengan tren suhu oli naik, getaran naik pelan, dan running hour berjalan, lalu lanjut mengirim tiap 30 dtk. Pastikan aset dan keempat tag sudah dibuat. Tambahkan `--dry-run` untuk hanya melihat contoh payload. Hapus data simulasi sebelum produksi (gunakan aset khusus uji).

## 9. Monitoring Mesin (langsung) dan Dashboard Prediksi
**Analitik → Monitoring Mesin** menampilkan kartu per mesin: nilai sensor terbaru, tren (30 menit–12 jam), batas peringatan/kritis pada bar, **JALAN/BERHENTI** (dari kenaikan running hour 20 menit terakhir; butuh ≥ 2 pembacaan), status koneksi (Online ≤ 3 mnt, Tertunda ≤ 15 mnt, Offline), dan running hour. Diperbarui otomatis tiap 15 detik. Mesin yang kritis tampil paling atas.

### Dashboard Prediksi
*Analitik → Dashboard Prediksi* menghitung otomatis dari data 24 jam (bisa 6 jam–7 hari): tren per jam (regresi linear), **perkiraan waktu mencapai batas peringatan/kritis** (hanya jika tren konsisten, r² ≥ 0,6, maksimum 30 hari), penyimpangan dari pola biasanya, **skor kesehatan** aset, dan **perkiraan jatuh tempo PM** dari laju running hour 7 hari terakhir. Metodenya sederhana dan dapat dijelaskan; ini alat bantu prioritas, bukan jaminan kapan mesin rusak. Tombol *Buat alarm* membuat alarm manual dari prediksi, dan dari alarm bisa dibuat Work Order.

## 10. Pemecahan masalah
| Gejala | Penyebab umum |
|---|---|
| `API key ditolak (401)` | Kunci salah/ dicabut. Pengiriman berhenti sampai ESP32 di-reboot |
| `server menolak sebagian` + "aset tidak ditemukan" | `MH_ASSET` tidak sama persis dengan kode aset |
| "tag tidak dikenal" | Sensor/tag belum didaftarkan di Telemetri Mesin, atau salah ketik |
| "di luar rentang wajar" | Nilai di luar min/maks wajar sensor; periksa kabel/kalibrasi |
| Suhu `-127` / tidak terkirim | DS18B20 lepas atau resistor 4,7 kΩ tidak ada |
| Arus selalu 0 | Penjepit di dua kabel sekaligus (saling meniadakan), salah pin ADC (ADC2), atau bias tidak sesuai |
| Running hour tidak naik | Kontak status tidak aktif, `RUN_ACTIVE_LEVEL` terbalik, atau arus di bawah `RUN_CURRENT_A` |
| Dashboard "Data belum cukup" | Butuh ≥ 12 titik (±2 jam pada 10 menit). Gunakan simulator atau tunggu |
