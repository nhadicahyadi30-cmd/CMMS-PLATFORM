// Contoh konfigurasi. Di MaintHub, menu Perangkat > Daftarkan ESP32 membuat file ini otomatis dengan kunci asli. JANGAN commit kunci asli ke Git.
#pragma once

// ---- Jaringan (isi, atau set tanpa flash ulang lewat Serial Monitor: wifi NAMA PASSWORD) ----
#define WIFI_SSID        "NAMA_WIFI_PABRIK"
#define WIFI_PASS        "PASSWORD_WIFI"

// ---- MaintHub ----
#define MH_URL           "http://192.168.1.50/api/ingest/readings"
#define MH_API_KEY       "mhk_ISI_KUNCI_DARI_MENU_PERANGKAT"
#define MH_ASSET         "PMP-203"
#define MH_PLANT         ""
#define DEVICE_ID        "esp-000000"
// HTTPS: untuk memverifikasi server, definisikan MH_ROOT_CA berisi sertifikat root (PEM). Tanpa ini koneksi tetap terenkripsi tetapi server tidak diverifikasi.
// #define MH_ROOT_CA "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"

// ---- Tag sensor (sudah terdaftar di MaintHub) ----
#define TAG_OIL_TEMP     "oil_temp"
#define TAG_CURRENT      "motor_current"
#define TAG_VIBRATION    "vibration_rms"
#define TAG_RUNHOURS     "running_hours"

// ---- Sensor yang terpasang (0 = tidak dipakai) ----
#define USE_DS18B20      1
#define USE_CURRENT      1
#define USE_MPU6050      0

// ---- Pin ----
#define PIN_ONEWIRE      4
#define PIN_CURRENT_ADC  34
#define PIN_RUN          27    // input status jalan lewat optocoupler; -1 = deteksi dari arus
#define RUN_ACTIVE_LEVEL LOW
#define PIN_I2C_SDA      21
#define PIN_I2C_SCL      22

// ---- Deteksi mesin jalan & kalibrasi ----
#define RUN_CURRENT_A    1.5f
#define CURRENT_CAL      30.0f
#define CURRENT_BIAS_MV  1650
#define VIB_RANGE_G      2.0f

// ---- Waktu ----
#define SAMPLE_MS        30000UL
#define SEND_MS          60000UL
#define RUNHOUR_SAVE_MS  600000UL
#define BUFFER_MAX       240
#define NTP_SERVER       "pool.ntp.org"
#define WDT_SECONDS      90
