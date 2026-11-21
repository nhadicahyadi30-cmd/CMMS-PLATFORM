# Power meter per area (Electrical & Utility)

Menghubungkan power meter di panel/area ke MaintHub supaya **kWh harian per area terisi otomatis** (tanpa input manual), lalu dipakai oleh kWh/ton, model beban dasar, anomali, dan biaya.

> Status pengujian: perhitungan harian di database (celah data, reset meter, beberapa meter per area, bentrok dengan input manual, isolasi plant), validasi payload API, dan fungsi decode Node-RED sudah diuji di komputer pengembang. **Belum diuji**: endpoint dengan server berjalan, halaman web di browser, dan semua hardware (meter, gateway, node Modbus). Uji dengan satu meter dulu dan bandingkan dengan angka di layar meter.

## 1. Cara kerja

```
Power meter --RS-485 Modbus RTU--> Gateway (RTU-ke-TCP) / USB-RS485 --> Node-RED --HTTP--> MaintHub
                                                                          POST /api/ingest/meters
```

- Meter menyimpan **energi kumulatif (kWh)** yang terus naik. Node-RED membacanya tiap ±1 menit dan mengirim `{"meter":"MTR-LINE1","kwh":12345.5}`.
- MaintHub menyimpan pembacaan lalu menghitung **kWh hari D = pembacaan terakhir akhir hari D − pembacaan terakhir akhir hari sebelumnya**, dikali *pengali* meter, dijumlah semua meter aktif di area itu. Hari dihitung pada zona waktu plant (bawaan Asia/Jakarta). Hasilnya masuk ke entri energi harian (ditandai "otomatis dari power meter").
- **Area** = *unit energi* (lini produksi atau utilitas). Satu area boleh punya beberapa meter (dijumlah); satu meter hanya untuk satu area.
- **Tidak ada angka palsu**: hari dilewati bila salah satu meter tidak punya pembacaan dalam 3 jam sebelum batas hari (celah data) atau angkanya mundur (meter di-reset). Hari yang tadinya berlubang otomatis terisi bila data susulan datang (3 hari terakhir dihitung ulang tiap pengiriman; tombol *Hitung ulang* untuk 14 hari).
- Hari berjalan (hari ini) baru dihitung setelah lewat tengah malam, jadi grafik tidak membawa angka setengah hari.
- Entri **manual** pada tanggal yang sama tetap menang (tidak ditimpa).
- Pembacaan yang lebih tua dari 7 hari ditolak (sama dengan telemetri).

## 2. Langkah di MaintHub

1. **Electrical & Utility → Pengaturan**: pastikan *Unit energi* (area) sudah ada, dan tarif listrik diisi.
2. Bagian **Power meter** → pilih area, isi **kode meter** (mis. `MTR-LINE1`), nama, dan **pengali**:
   - Meter yang sudah menampilkan kWh sebenarnya: pengali **1**.
   - Meter yang membaca sisi sekunder CT (tanpa rasio terprogram): pengali = rasio CT (× rasio PT bila ada). Cek angka meter dengan kWh-meter utama PLN/panel.
3. **Telemetri → API key**: buat kunci (boleh dibatasi ke satu plant) untuk gateway. Salin saat tampil.
4. Status meter berubah *Menunggu data → Online* setelah pembacaan pertama masuk. Entri harian muncul setelah satu hari penuh terlewati (butuh pembacaan sebelum dan sesudah batas tengah malam).

## 3. Hardware

Pilih salah satu pola:

| Pola | Isi | Catatan |
|---|---|---|
| **A. Meter Modbus RTU (RS-485) + gateway RTU-ke-TCP** | Power meter RS-485 (mis. Eastron SDM, Schneider iEM/PM, Socomec, Circutor, dll.), gateway Modbus (mis. USR-TCP232, Moxa MGate), kabel twisted-pair | Paling umum di pabrik; satu gateway melayani banyak meter dalam satu bus |
| **B. Meter RS-485 + adaptor USB-RS485** di komputer Node-RED | Adaptor USB-RS485, komputer/mini-PC dekat panel | Murah untuk satu panel; Node-RED harus bisa mengakses port serial |
| **C. Meter Modbus TCP / Ethernet** | Meter dengan port Ethernet | Tanpa gateway; cukup alamat IP meter dan port 502 |

Pengkabelan RS-485 (umum, **cek manual meter Anda**):
- Sambung **A(+)/B(−)** meter ke A/B gateway atau adaptor, dengan **kabel twisted-pair berpelindung**; hubungkan semua A ke A dan B ke B (daisy-chain, bukan bintang).
- **Resistor terminasi 120 Ω** di dua ujung bus (banyak gateway/meter punya jumper/saklar terminasi).
- Setiap meter butuh **alamat slave unik** (1–247) dan **parameter yang sama dengan gateway**: baud (mis. 9600), parity (None/Even), stop bit.
- Pembacaan tegangan/CT: pemasangan CT, fuse tegangan, dan pekerjaan di panel hanya oleh **teknisi listrik berwenang** dengan LOTO. Pastikan arah CT (tanda panah ke arah beban) dan fasa sesuai; CT terbalik membuat daya/energi negatif atau salah.
- Letakkan gateway di jaringan yang bisa dijangkau Node-RED; pisahkan jaringan OT/IT sesuai kebijakan IT (VLAN).

Alamat register energi **berbeda tiap merek dan tipe**. Cari di manual meter: "Total active energy import (kWh)", catat **alamat**, **tipe data** (float32 / uint32 / int64), **urutan word**, dan **satuan** (kWh atau Wh). Beberapa meter Eastron SDM memakai input register 0x0156 (342) float32 untuk total kWh, tetapi ini contoh yang harus Anda verifikasi di manual tipe Anda, bukan jaminan.

## 4. Node-RED

1. Palet: pasang **node-red-contrib-modbus** (Manage palette). Buat *Modbus-Client* ke gateway (TCP: alamat IP dan port; atau serial untuk adaptor USB).
2. Impor `tools/nodered/powermeter-flow.json` (di Docker `--profile iot` sudah terpasang otomatis sebagai tab *Power meter*).
3. Di tab itu isi `MAINTHUB_URL` dan `MAINTHUB_KEY` (kunci dari Telemetri).
4. **Uji tanpa hardware**: klik tombol *Kirim contoh*. Bila meter `MTR-LINE1` sudah didaftarkan, node *Status* hijau ("diterima 1").
5. Edit node **Daftar meter**: kode meter, alamat slave (`unitid`), alamat register, `format` (`f32`, `f32sw` bila urutan word terbalik, `u32`, `u32sw`, `u16`), dan `scale` (mis. `0.001` bila register dalam Wh).
6. Tambahkan node **Modbus Flex Getter** di antara *Daftar meter* dan *Decode & kirim*, dan arahkan ke Modbus-Client. Flow ini mengandalkan node Modbus meneruskan properti `msg.meter`, `msg.format`, `msg.scale` dan memberi `msg.payload` berupa array register. Itu perilaku node Modbus yang umum, tetapi versi Anda bisa berbeda: bila properti hilang, tambahkan node *change* sebelum Decode untuk menyimpannya.
7. Bandingkan nilai yang terkirim dengan angka di layar meter. Bila angkanya aneh, coba `f32sw`; bila besarnya salah 1000×, atur `scale`.

Tanpa Node-RED: apa pun yang bisa HTTP POST JSON dapat mengirim langsung:

```
POST /api/ingest/meters      header: x-api-key: mhk_...
{"meters":[{"meter":"MTR-LINE1","kwh":12345.5,"kw":182.4,"ts":"2026-03-10T16:59:30Z"}]}
```
`kw` (daya sesaat) dan `ts` opsional (kosong = waktu server). Beberapa meter per permintaan (maks. 500). Pembacaan ganda pada `ts` yang sama diabaikan. Respons memuat `accepted`, `duplicates`, `daysUpdated`, dan `errors` per baris.

## 5. Yang belum ada

- Firmware ESP32 khusus power meter (mis. PZEM-004T) belum dibuat; saat ini jalurnya lewat Node-RED/gateway.
- Daya sesaat (`kw`) disimpan tetapi belum ditampilkan/dianalisis; hitungan memakai kWh kumulatif.
- Peringatan otomatis bila meter offline belum ada; status terlihat di tabel Power meter.

## 6. Pemecahan masalah

| Gejala | Kemungkinan penyebab |
|---|---|
| Status tetap *Menunggu data* | Gateway/Node-RED tidak mengirim; cek tab debug Node-RED dan `MAINTHUB_URL`/kunci |
| `meter "X" belum didaftarkan` | Kode meter di Node-RED berbeda dengan yang didaftarkan (huruf besar/kecil tidak dibedakan) |
| Entri harian tidak muncul | Belum melewati tengah malam, atau ada celah data > 3 jam di batas hari, atau meter di-reset; lihat pembacaan terakhir dan kirim ulang data susulan |
| Angka kWh/hari terlalu besar atau kecil | Pengali salah (rasio CT), satuan Wh vs kWh (`scale`), atau urutan word (`f32sw`) |
| Ada entri manual dan otomatis berbeda | Entri manual dipertahankan; hapus entri manual agar hasil meter terpakai, lalu *Hitung ulang* |
