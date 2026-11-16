# Telemetri mesin (Node-RED → MaintHub)

MaintHub menerima data sensor (suhu oli, running hour, getaran, tekanan, dll.) lewat API. Pengirimnya biasanya **Node-RED** yang membaca PLC/SCADA/sensor, lalu meneruskan ke MaintHub. Sebuah pembacaan dikenali dari **kode aset** (yang sama dengan menu Aset & Equipment) dan **tag** sensor.

## Cara kerja
1. **Buat API key** (menu *Telemetri Mesin* → hanya Admin). Satu kunci per Node-RED; boleh dibatasi ke satu plant. Salin kunci saat muncul: tidak bisa ditampilkan lagi.
2. **Tambah sensor** per aset (menu yang sama): tag (mis. `oil_temp`), satuan, dan batas alarm.
3. **Kirim data** dari Node-RED ke `POST /api/ingest/readings`.
4. Nilai terbaru dan grafik 24 jam tampil di menu Telemetri. Jika melewati batas, **alarm otomatis** dibuat (modul AI Assistant → Alarm), dan dari alarm bisa dibuat Work Order seperti biasa.

## Jenis sensor
| Jenis | Fungsi |
|---|---|
| **Pengukuran** (`gauge`) | Suhu, tekanan, getaran, arus, dll. Bisa diberi batas peringatan/kritis (atas dan bawah) dan rentang nilai wajar. |
| **Running hour** (`runhours`) | Jam operasi **kumulatif**. Masuk ke meter aset `running_hours` (dibuat otomatis), sehingga **PM berbasis meter** berjalan tanpa input manual. Dicatat paling sering tiap 10 menit. Nilai tidak boleh turun. |

Aturan alarm:
- Batas **kritis** didahulukan dari peringatan. Alarm peringatan yang sudah ada **naik** menjadi kritis jika nilai makin buruk.
- **Satu alarm aktif per sensor**: nilai yang tetap tinggi tidak menumpuk alarm baru. Setelah alarm ditutup, pelanggaran berikutnya membuat alarm baru.
- **Konfirmasi n pembacaan**: alarm hanya muncul jika n pembacaan terakhir berturut-turut melewati batas (menahan lonjakan sesaat).
- **Nilai wajar min/maks**: pembacaan di luar rentang ini dianggap sensor rusak, ditolak, dan tidak ikut dihitung.
- Hanya pembacaan yang masih baru (≤10 menit) yang bisa memicu alarm. Data susulan (backfill) hanya disimpan.

## Endpoint
Header: `x-api-key: mhk_...` (atau `Authorization: Bearer mhk_...`). Isi: JSON.

**Uji kunci**
```
GET /api/ingest/ping
```

**Kirim pembacaan**: satu atau banyak (maks 500 per permintaan)
```json
POST /api/ingest/readings
{ "readings": [
  { "asset": "PMP-203", "tag": "oil_temp",   "value": 78.4,  "ts": "2026-11-16T14:00:00Z" },
  { "asset": "PMP-203", "tag": "run_hours",  "value": 1204.5 }
] }
```
- `asset`: kode aset. Jika kode yang sama ada di beberapa plant, tambahkan `"plant": "KODE-PLANT"`.
- `ts` opsional (ISO 8601 atau epoch detik/milidetik). Kosong = waktu server. Maksimal 7 hari ke belakang, 5 menit ke depan.
- Mengirim ulang pembacaan yang sama (aset + tag + `ts` sama) aman: dihitung sebagai duplikat, tidak menggandakan data.

Balasan (HTTP 200 jika kunci valid, walau sebagian item ditolak):
```json
{ "received": 2, "accepted": 2, "duplicates": 0, "alarmsRaised": 0, "alarmsEscalated": 0, "errors": [] }
```
`errors` berisi `{ "index": n, "error": "..." }` per item yang ditolak (aset/tag tidak dikenal, nilai di luar rentang wajar, dll.). Item lain tetap tersimpan.

Kode status: `401` kunci salah/dicabut · `400` format JSON salah · `429` terlalu sering (maks 240 permintaan/menit per kunci).

## Contoh flow Node-RED
Impor lewat menu *Import → Clipboard*, lalu ubah URL, kunci, kode aset, dan tag. Node *inject* di sini hanya contoh; ganti dengan node pembaca PLC/Modbus/OPC UA/MQTT Anda.
```json
[
 {"id":"mh_inj","type":"inject","name":"Contoh tiap 10 dtk","props":[{"p":"payload"}],"repeat":"10","once":false,"payload":"","payloadType":"date","x":150,"y":80,"wires":[["mh_fn"]]},
 {"id":"mh_fn","type":"function","name":"Susun payload MaintHub","func":"// Ganti nilai dengan hasil baca sensor Anda (msg.payload dari PLC/Modbus/MQTT)\nconst oil = 70 + Math.random() * 20;   // contoh\nmsg.headers = { 'x-api-key': env.get('MAINTHUB_KEY'), 'content-type': 'application/json' };\nmsg.payload = { readings: [ { asset: 'PMP-203', tag: 'oil_temp', value: Number(oil.toFixed(1)) } ] };\nreturn msg;","outputs":1,"x":380,"y":80,"wires":[["mh_http"]]},
 {"id":"mh_http","type":"http request","name":"Kirim ke MaintHub","method":"POST","ret":"obj","url":"http://ALAMAT-SERVER/api/ingest/readings","tls":"","x":620,"y":80,"wires":[["mh_dbg"]]},
 {"id":"mh_dbg","type":"debug","name":"Balasan","active":true,"complete":"payload","x":820,"y":80,"wires":[]}
]
```
Simpan kunci sebagai environment variable `MAINTHUB_KEY` di Node-RED agar tidak tertulis di flow. Untuk banyak sensor, kumpulkan beberapa pembacaan ke satu permintaan (array `readings`), misalnya dengan node *join* atau *batch* tiap 10-60 detik, daripada satu permintaan per nilai.

## Retensi data
Data sensor bertambah terus. Contoh perkiraan: 100 sensor × 1 pembacaan/menit ≈ 52 juta baris per tahun. Untuk membersihkan data lama:
```
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "select purge_sensor_readings(365)"
```
(hapus pembacaan lebih tua dari 365 hari; minimal 7). Kirim rata-rata per menit dari Node-RED, jangan per detik, kecuali memang perlu.

## Keamanan
- Hanya hash kunci yang disimpan. Kunci yang bocor langsung dapat **dicabut** di menu Telemetri.
- Kunci yang dibatasi ke satu plant hanya bisa menulis ke aset plant itu.
- Jalankan Node-RED di jaringan yang sama dengan server MaintHub atau lewat HTTPS. Jangan membuka PLC langsung ke internet.

## Yang belum ada
Prediksi (deteksi anomali, perkiraan sisa umur), notifikasi push/email saat alarm, dan ingest langsung via MQTT (saat ini lewat HTTP dari Node-RED). Belum diuji dengan PLC atau sensor sungguhan.
