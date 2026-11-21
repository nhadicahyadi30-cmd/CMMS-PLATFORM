# Perangkat RTU lewat MQTT, banyak perangkat, konfigurasi tanpa flash ulang

Ringkasnya: **satu firmware untuk semua perangkat**. Alamat Wi-Fi, mesin, kunci, jalur kirim (HTTP atau MQTT), broker, mode demo dan sensor diatur lewat **portal Wi-Fi di HP** atau **kode konfigurasi** dari menu *Perangkat RTU*. Tidak perlu mengedit `config.h` atau flash ulang tiap perangkat.

> Status pengujian: logika pembaca kode konfigurasi (C++), pembuat kode (API), fungsi flow Node-RED, dan sintaks firmware sudah diuji di komputer pengembang (firmware dikompilasi hanya terhadap *stub*, bukan papan ESP32 asli). **Belum diuji**: firmware di ESP32 sungguhan, Mosquitto/Node-RED yang berjalan di Docker, dan portal di HP. Uji bertahap seperti di bagian 5.

## 1. Gambaran

```
ESP32 (RTU) --MQTT--> Mosquitto --> Node-RED --HTTP--> MaintHub (/api/ingest/readings)
     ^                                  |
     +------- ack (mainthub/<id>/ack) --+
```

- Setiap perangkat memakai topik sendiri: `mainthub/<id-perangkat>/ingest` (data), `.../ack` (balasan), `.../status` (online/offline, retained).
- **Ack**: perangkat menahan data di antrean (240 sampel; antrean hilang bila perangkat mati listrik, running hour tidak) sampai Node-RED membalas `{"code":200}`. Jika Node-RED/MaintHub mati, data tidak hilang dan dikirim ulang saat pulih. Kode lain mengikuti HTTP: 401 kunci ditolak, 400 format ditolak.
- Setiap perangkat membawa **API key sendiri** (terbatas pada plant mesinnya) di dalam pesan. Broker wajib user+password, tetapi pesan tidak dienkripsi: pakai hanya di jaringan pabrik yang tertutup (VLAN), tidak di internet.
- Multi-perangkat: daftarkan sebanyak mungkin perangkat di menu *Perangkat RTU*; satu broker dan satu flow Node-RED melayani semuanya (wildcard `mainthub/+/ingest`).

## 2. Menyalakan broker + Node-RED (Docker)

1. Di `.env` isi `MQTT_USER` dan `MQTT_PASS` (lihat `.env.example`). Password ini nanti dimasukkan ke form pendaftaran perangkat.
2. Jalankan: `docker compose --profile iot up -d`
3. Windows: izinkan port **1883** di firewall (Windows Defender Firewall → Inbound rule → TCP 1883).
4. Cek: `docker compose logs mosquitto nodered`. Editor Node-RED: http://localhost:1880 (hanya bisa dibuka dari komputer itu; tanpa login). Flow *MaintHub gateway* sudah terpasang otomatis dengan alamat MaintHub dan broker yang benar.
5. Tanpa Docker: pasang Mosquitto dan Node-RED sendiri, impor `tools/nodered/mainthub-flow.json`, isi `MAINTHUB_URL` di Environment Variables tab flow, dan pastikan node *Broker lokal* menunjuk broker Anda.

Catatan keamanan: port 1884 di Mosquitto hanya untuk jaringan Docker internal (Node-RED) dan **tidak dipublikasikan** ke host. Hanya 1883 yang terbuka, dengan password.

## 3. Mendaftarkan perangkat dan mengonfigurasinya

1. MaintHub → **Perangkat RTU** → pilih mesin, nama perangkat, **Jalur kirim = MQTT**, isi alamat broker (IP komputer yang menjalankan Docker), user dan password broker, pilih sensor (atau Mode demo). Klik *Daftarkan*.
2. Salin **kode konfigurasi** (satu baris `{"mh":1,...}`). Kunci hanya tampil sekali.
3. **Flash firmware sekali** (`firmware/esp32-mainthub/`, library: OneWire, DallasTemperature, PubSubClient).
4. Nyalakan ESP32. Karena Wi-Fi belum diisi, ia membuat Wi-Fi **MaintHub-RTU-xxxx** (kata sandi `mainthub1`, ganti dengan `PORTAL_PASS` di config.h). Sambungkan HP; halaman konfigurasi terbuka otomatis (atau `http://192.168.4.1`).
5. Isi Wi-Fi pabrik, tempel kode konfigurasi, **Simpan**. Perangkat restart, tersambung, dan muncul *Online* di tabel dalam 1–2 menit.

Mengonfigurasi ulang kapan saja (pindah mesin, ganti Wi-Fi, kunci baru): tahan tombol **BOOT 3 detik** (portal terbuka lagi), atau di Serial Monitor (115200): `portal`, `cfg <kode>`, `wifi <nama> <password>`, `show` (lihat konfigurasi tanpa rahasia), `status`, `sethours <jam>`, `factory` (kembali ke nilai config.h; running hour tetap).

Portal juga punya bagian *Pengaturan manual* (jalur kirim, broker, sensor, mode demo, set running hour) bila tidak memakai kode.

Pindah dari HTTP ke MQTT (atau sebaliknya) pada perangkat yang sama: di tabel pilih *Kunci baru*, pilih jalur di formulir, lalu tempel kode baru di portal. Kunci lama langsung dicabut.

## 4. Fasilitas yang tersedia di kedua jalur

| Fasilitas | HTTP | MQTT |
|---|---|---|
| Suhu oli, arus, getaran, running hour (tahan mati listrik) | ya | ya |
| Mode demo (data dummy) dan pilihan sensor, diatur dari konfigurasi | ya | ya |
| Heartbeat (Wi-Fi, uptime, antrean, firmware, boot) ke tabel Perangkat RTU | ya | ya (di dalam pesan data) |
| Antrean + kirim ulang, buang data cacat (400), berhenti bila kunci ditolak (401) | ya | ya (lewat ack) |
| Status online/offline instan di broker (`mainthub/<id>/status`, last will) | - | ya |
| Konfigurasi tanpa flash ulang (portal, `cfg`) | ya | ya |

Batasan: hitungan running hour dijeda selama portal terbuka (maks. 10 menit); konfigurasi sensor yang dipakai hanya memilih dari sensor yang sudah dikompilasi (`USE_*` di config.h bawaan = semuanya aktif).

## 5. Uji bertahap (disarankan urutan ini)

1. **Mode demo dulu.** Daftarkan perangkat dengan Mode demo. Di Serial Monitor harus muncul `MQTT tersambung ke ...` lalu `terkirim N sampel via MQTT`. Jika gagal tersambung, pesan menjelaskan penyebab (broker tidak terjangkau / password salah).
2. **Lihat pesan di broker:** `docker compose exec mosquitto mosquitto_sub -h localhost -p 1884 -t "mainthub/#" -v` (data, ack, status tampil).
3. **Uji tanpa perangkat:** `docker compose exec mosquitto mosquitto_pub -h localhost -p 1884 -t mainthub/esp-uji/ingest -m '{"key":"mhk_KUNCI_PERANGKAT","readings":[{"asset":"PMP-203","tag":"oil_temp","value":70.5}]}'` lalu amati balasan di `mainthub/esp-uji/ack` (`{"code":200}`).
4. Cek di MaintHub → Monitoring Mesin: nilai terakhir muncul.
5. Baru ganti ke sensor sungguhan (daftar periksa di `docs/ESP32.md` bagian 5d).

## 6. Pemecahan masalah

| Gejala di Serial Monitor | Penyebab umum |
|---|---|
| `MQTT gagal ... broker tidak terjangkau` | IP broker salah, firewall port 1883, beda Wi-Fi, container mosquitto mati (`docker compose ps`) |
| `MQTT gagal ... user/password broker salah` | `MQTT_USER/MQTT_PASS` di `.env` berbeda dengan yang diketik; setelah mengubah `.env` jalankan `docker compose --profile iot up -d --force-recreate mosquitto` |
| `Node-RED tidak membalas` (kode -3) | container nodered mati, atau flow belum ter-deploy; lihat `docker compose logs nodered` |
| `API key ditolak (401)` | kunci di kode salah/dicabut; buat *Kunci baru* dan tempel kode baru |
| Status tabel tetap *Menunggu data pertama* | Perangkat belum tersambung; ketik `show` di serial untuk melihat jalur, broker, dan status |
| Portal tidak terbuka otomatis di HP | buka `http://192.168.4.1` manual; matikan data seluler HP sementara |
