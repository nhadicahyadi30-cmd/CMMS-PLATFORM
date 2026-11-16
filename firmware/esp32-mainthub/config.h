// Konfigurasi node ESP32 MaintHub. Ubah nilai di sini, jangan di file .ino.
// JANGAN commit API key asli ke Git. Isi hanya di salinan lokal Anda.
#pragma once

// ---- Jaringan ----
#define WIFI_SSID        "NAMA_WIFI_PABRIK"
#define WIFI_PASS        "PASSWORD_WIFI"

// ---- MaintHub ----
// Contoh LAN: "http://192.168.1.50/api/ingest/readings"   (http, tanpa TLS: hanya untuk jaringan tertutup)
// Contoh internet: "https://cmms.perusahaan.com/api/ingest/readings"
#define MH_URL           "http://192.168.1.50/api/ingest/readings"
#define MH_API_KEY       "mhk_ISI_KUNCI_DARI_MENU_TELEMETRI"
#define MH_ASSET         "PMP-203"     // kode aset persis seperti di menu Aset & Equipment
#define MH_PLANT         ""            // isi kode plant bila kode aset sama ada di beberapa plant, selain itu kosongkan

// HTTPS: isi MH_ROOT_CA dengan sertifikat root server (PEM) untuk verifikasi.
// Jika dibiarkan kosong, koneksi TETAP terenkripsi tetapi identitas server TIDAK diverifikasi.
// #define MH_ROOT_CA "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"

// ---- Tag sensor (harus sama dengan yang didaftarkan di menu Telemetri Mesin) ----
#define TAG_OIL_TEMP     "oil_temp"       // gauge, °C
#define TAG_CURRENT      "motor_current"  // gauge, A
#define TAG_VIBRATION    "vibration_rms"  // gauge, g (opsional)
#define TAG_RUNHOURS     "running_hours"  // jenis runhours (kumulatif, jam)

// ---- Sensor yang terpasang (0 = tidak dipakai) ----
#define USE_DS18B20      1
#define USE_CURRENT      1
#define USE_MPU6050      0

// ---- Pin ----
#define PIN_ONEWIRE      4     // DS18B20 data (+ resistor 4,7 kΩ ke 3V3)
#define PIN_CURRENT_ADC  34    // keluaran modul SCT-013 (ADC1; jangan pakai ADC2 saat WiFi aktif)
#define PIN_RUN          27    // input status jalan dari kontaktor/aux lewat optocoupler; -1 = deteksi dari arus
#define RUN_ACTIVE_LEVEL LOW   // level pin saat mesin jalan (optocoupler umumnya LOW)
#define PIN_I2C_SDA      21
#define PIN_I2C_SCL      22

// ---- Deteksi mesin jalan & kalibrasi ----
#define RUN_CURRENT_A    1.5f  // dipakai bila PIN_RUN = -1: arus di atas ini = jalan
#define CURRENT_CAL      30.0f // ampere per volt keluaran modul (mis. SCT-013-030 dengan modul bertegangan: 30 A = 1 V)
#define CURRENT_BIAS_MV  1650  // titik tengah ADC (modul dengan bias 3V3/2)
#define VIB_RANGE_G      2.0f  // rentang MPU6050 ±2 g

// ---- Waktu ----
#define SAMPLE_MS        30000UL   // baca sensor tiap 30 dtk
#define SEND_MS          60000UL   // kirim batch tiap 60 dtk
#define RUNHOUR_SAVE_MS  600000UL  // simpan running hour ke flash tiap 10 mnt (dan saat mesin berhenti/mulai)
#define BUFFER_MAX       240       // maks antrean offline (≈2 jam pada 30 dtk); terlama dibuang bila penuh
#define NTP_SERVER       "pool.ntp.org"
#define WDT_SECONDS      90
