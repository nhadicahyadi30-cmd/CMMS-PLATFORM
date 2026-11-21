// NILAI AWAL (default). Pengaturan sebenarnya dapat diganti TANPA flash ulang lewat portal Wi-Fi "MaintHub-RTU-xxxx" atau perintah serial `cfg <kode>`
// (kode dibuat otomatis di menu Perangkat RTU). Karena itu satu firmware yang sama bisa dipakai di semua perangkat.
// Menu Perangkat RTU juga membuat file ini dengan kunci asli. JANGAN commit kunci asli ke Git.
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
// Jalur kirim: 0 = HTTP langsung ke MaintHub (MH_URL), 1 = MQTT ke broker (Mosquitto) lalu Node-RED meneruskan ke MaintHub
#define MH_TRANSPORT     0
#define MQTT_HOST        ""
#define MQTT_PORT        1883
#define MQTT_USER        ""
#define MQTT_PASS        ""
// HTTPS: untuk memverifikasi server, definisikan MH_ROOT_CA berisi sertifikat root (PEM). Tanpa ini koneksi tetap terenkripsi tetapi server tidak diverifikasi.
// #define MH_ROOT_CA "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"

// ---- Tag sensor (sudah terdaftar di MaintHub) ----
#define TAG_OIL_TEMP     "oil_temp"
#define TAG_CURRENT      "motor_current"
#define TAG_VIBRATION    "vibration_rms"
#define TAG_RUNHOURS     "running_hours"

// ---- Mode demo: 1 = kirim DATA DUMMY (tanpa sensor), 0 = baca sensor sungguhan ----
#define DEMO_MODE        0

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
#define PIN_PORTAL       0     // tombol BOOT: tahan 3 detik untuk membuka portal konfigurasi; -1 = nonaktif
// #define PORTAL_PASS   "mainthub1"   // kata sandi Wi-Fi portal (min. 8 karakter)

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
