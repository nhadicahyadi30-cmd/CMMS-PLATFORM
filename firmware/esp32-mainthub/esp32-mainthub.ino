/*
  MaintHub ESP32 node: suhu oli (DS18B20), arus motor (SCT-013), getaran (MPU6050, opsional),
  dan RUNNING HOUR kumulatif yang tahan mati listrik. Mengirim batch ke POST /api/ingest/readings.

  Library (Arduino Library Manager): OneWire, DallasTemperature. Board: ESP32 Arduino core 2.x atau 3.x.
  Perintah serial (115200): status | sethours <jam> | wifi <nama> <password>
  (sethours: nilai awal running hour sesuai hour meter fisik; wifi: simpan Wi-Fi ke flash tanpa flash ulang)
*/
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <esp_task_wdt.h>
#include <time.h>
#include "config.h"
#if USE_DS18B20
#include <OneWire.h>
#include <DallasTemperature.h>
#endif
#if USE_MPU6050
#include <Wire.h>
#endif

#define FW_VERSION "1.1.0"

struct Sample { uint32_t ts; float oil; float amps; float vib; float hours; };  // ts = epoch detik (0 = waktu belum valid)

static Preferences prefs;
static Sample buf[BUFFER_MAX];
static int bufHead = 0, bufCount = 0;           // ring buffer
static uint32_t runSeconds = 0;                 // total detik mesin jalan (disimpan di NVS)
static double runFrac = 0;                      // sisa pecahan detik
static bool running = false;
static uint32_t lastTick = 0, lastSample = 0, lastSend = 0, lastSave = 0, lastWifiTry = 0;
static uint32_t savedSeconds = 0;
static float lastAmps = 0;
static bool authFailed = false;
static String wifiSsid, wifiPass;
static uint64_t upMs = 0;
static uint32_t boots = 0;
static bool unregisteredWarned = false;
#if USE_DS18B20
static OneWire ow(PIN_ONEWIRE);
static DallasTemperature ds(&ow);
#endif

static bool timeValid() { return time(nullptr) > 1700000000; }
static uint32_t nowEpoch() { return timeValid() ? (uint32_t)time(nullptr) : 0; }
static float hoursNow() { return (runSeconds + (float)runFrac) / 3600.0f; }

static void saveHours(bool force) {
  if (!force && runSeconds == savedSeconds) return;
  prefs.putUInt("rs", runSeconds); savedSeconds = runSeconds; lastSave = millis();
}

// ---- Pembacaan sensor ----
static float readCurrentA() {
#if USE_CURRENT
  // RMS dari ~200 ms (10 siklus 50 Hz), offset DC dibuang dengan rata-rata.
  const int N = 400; double sum = 0, sum2 = 0; uint32_t t0 = micros();
  for (int i = 0; i < N; i++) { double mv = (double)(int)analogReadMilliVolts(PIN_CURRENT_ADC) - CURRENT_BIAS_MV; sum += mv; sum2 += mv * mv; while (micros() - t0 < (uint32_t)(i + 1) * 500) {} }
  double mean = sum / N, var = sum2 / N - mean * mean; if (var < 0) var = 0;
  float vrms = sqrt(var) / 1000.0f; float a = vrms * CURRENT_CAL; return a < 0.15f ? 0.0f : a;  // noise di bawah 0,15 A dianggap 0
#else
  return NAN;
#endif
}
static float readOilC() {
#if USE_DS18B20
  ds.requestTemperatures(); float t = ds.getTempCByIndex(0);
  if (t == DEVICE_DISCONNECTED_C || t < -40 || t > 150) return NAN;   // sensor lepas/rusak: jangan kirim
  return t;
#else
  return NAN;
#endif
}
static float readVibG() {
#if USE_MPU6050
  const int N = 200; double s = 0, s2 = 0;
  for (int i = 0; i < N; i++) {
    Wire.beginTransmission(0x68); Wire.write(0x3B); Wire.endTransmission(false); Wire.requestFrom(0x68, 6);
    if (Wire.available() < 6) return NAN;
    int16_t x = (Wire.read() << 8) | Wire.read(), y = (Wire.read() << 8) | Wire.read(), z = (Wire.read() << 8) | Wire.read();
    double g = sqrt((double)x * x + (double)y * y + (double)z * z) / (32768.0 / VIB_RANGE_G); s += g; s2 += g * g; delay(2);
  }
  double m = s / N, v = s2 / N - m * m; return v > 0 ? sqrt(v) : 0;   // RMS komponen dinamis (gravitasi dibuang)
#else
  return NAN;
#endif
}

static bool readRunInput(float amps) {
  if (PIN_RUN >= 0) return digitalRead(PIN_RUN) == RUN_ACTIVE_LEVEL;
  return amps >= RUN_CURRENT_A;
}

// ---- Antrean & pengiriman ----
static void push(const Sample& s) {
  if (bufCount == BUFFER_MAX) { bufHead = (bufHead + 1) % BUFFER_MAX; bufCount--; }   // buang yang terlama
  buf[(bufHead + bufCount) % BUFFER_MAX] = s; bufCount++;
}

static int appendReading(char* out, size_t cap, int len, const char* tag, float v, uint32_t ts, bool first) {
  if (isnan(v)) return len;
  char tsPart[40] = ""; if (ts) snprintf(tsPart, sizeof tsPart, ",\"ts\":%lu", (unsigned long)ts);
  char plant[96] = ""; if (strlen(MH_PLANT)) snprintf(plant, sizeof plant, ",\"plant\":\"%s\"", MH_PLANT);
  int n = snprintf(out + len, cap - len, "%s{\"asset\":\"%s\"%s,\"tag\":\"%s\",\"value\":%.3f%s}", first ? "" : ",", MH_ASSET, plant, tag, v, tsPart);
  return (n < 0 || (size_t)n >= cap - len) ? -1 : len + n;
}

static bool sendBatch() {
  if (WiFi.status() != WL_CONNECTED || bufCount == 0 || authFailed) return false;
  const int PER = 20;                               // sampel per permintaan (maks ~4 pembacaan tiap sampel)
  int take = bufCount < PER ? bufCount : PER;
  static char body[6144]; int len = snprintf(body, sizeof body, "{\"readings\":["); bool first = true;
  for (int i = 0; i < take; i++) {
    const Sample& s = buf[(bufHead + i) % BUFFER_MAX]; int l;
    struct { const char* tag; float v; } items[] = { {TAG_OIL_TEMP, s.oil}, {TAG_CURRENT, s.amps}, {TAG_VIBRATION, s.vib}, {TAG_RUNHOURS, s.hours} };
    for (auto& it : items) { l = appendReading(body, sizeof body, len, it.tag, it.v, s.ts, first); if (l < 0) { take = i; goto done; } if (l != len) first = false; len = l; }
  }
done:
  {
    String ip = WiFi.localIP().toString();
    len += snprintf(body + len, sizeof body - len, "],\"device\":{\"id\":\"%s\",\"fw\":\"%s\",\"ip\":\"%s\",\"rssi\":%d,\"uptime\":%lu,\"queue\":%d,\"heap\":%lu,\"boots\":%lu}}",
                    DEVICE_ID, FW_VERSION, ip.c_str(), (int)WiFi.RSSI(), (unsigned long)(upMs / 1000), bufCount - take, (unsigned long)(ESP.getFreeHeap() / 1024), (unsigned long)boots);
  }
  if (take == 0) return false;

  HTTPClient http; WiFiClientSecure tls; WiFiClient plain; bool https = String(MH_URL).startsWith("https");
  if (https) {
#ifdef MH_ROOT_CA
    tls.setCACert(MH_ROOT_CA);
#else
    tls.setInsecure();
#endif
    http.begin(tls, MH_URL);
  } else http.begin(plain, MH_URL);
  http.setTimeout(10000); http.addHeader("Content-Type", "application/json"); if (strlen(MH_API_KEY)) http.addHeader("x-api-key", MH_API_KEY);   // kosong = lewat Node-RED (kunci disimpan di sana)
  int code = http.POST((uint8_t*)body, len); String resp = code > 0 ? http.getString() : ""; http.end();

  if (code == 200) {
    bufHead = (bufHead + take) % BUFFER_MAX; bufCount -= take;     // item yang ditolak server (mis. di luar rentang) tidak akan berhasil bila diulang, jadi tidak ditahan
    int e = resp.indexOf("\"errors\":[{"); if (e >= 0) Serial.printf("server menolak sebagian: %s\n", resp.substring(e, e + 160).c_str());
    if (!unregisteredWarned && resp.indexOf("\"device\":\"unregistered\"") >= 0) { unregisteredWarned = true; Serial.println("peringatan: DEVICE_ID belum terdaftar di MaintHub (menu Perangkat). Data tetap diterima."); }
    int sv = resp.indexOf("\"serverTime\":\""); if (sv >= 0 && !timeValid()) Serial.println("catatan: jam belum sinkron NTP; waktu pembacaan memakai waktu server");
    Serial.printf("terkirim %d sampel (sisa antrean %d)\n", take, bufCount);
    return true;
  }
  if (code == 401) { authFailed = true; Serial.println("API key ditolak (401). Periksa MH_API_KEY; pengiriman dihentikan sampai reboot."); return false; }
  if (code == 400) { bufHead = (bufHead + take) % BUFFER_MAX; bufCount -= take; Serial.printf("format ditolak (400): %s\n", resp.c_str()); return false; }   // data cacat: buang agar tidak macet
  Serial.printf("gagal kirim (HTTP %d), antrean %d\n", code, bufCount);
  return false;
}

// ---- Serial ----
static void handleSerial() {
  if (!Serial.available()) return;
  String l = Serial.readStringUntil('\n'); l.trim(); if (!l.length()) return;
  if (l == "status") {
    Serial.printf("wifi=%d jam_valid=%d jalan=%d running_hour=%.2f arus=%.2fA antrean=%d\n", WiFi.status() == WL_CONNECTED, timeValid(), running, hoursNow(), lastAmps, bufCount);
  } else if (l.startsWith("sethours ")) {
    float h = l.substring(9).toFloat();
    if (h >= 0 && h < 1000000) { runSeconds = (uint32_t)(h * 3600.0f); runFrac = 0; saveHours(true); Serial.printf("running hour diset ke %.2f jam\n", h); }
    else Serial.println("nilai tidak valid");
  } else if (l.startsWith("wifi ")) {
    // wifi NAMA PASSWORD   atau   wifi "Nama Dengan Spasi" "password"   (disimpan di flash, tanpa flash ulang)
    String r = l.substring(5); r.trim(); String a, b;
    auto take = [](String& src, String& out) { src.trim(); if (src.startsWith("\"")) { int e = src.indexOf('"', 1); if (e < 0) return false; out = src.substring(1, e); src = src.substring(e + 1); } else { int e = src.indexOf(' '); if (e < 0) { out = src; src = ""; } else { out = src.substring(0, e); src = src.substring(e + 1); } } src.trim(); return out.length() > 0; };
    if (take(r, a)) { if (r.length() && r.startsWith("\"")) take(r, b); else b = r; wifiSsid = a; wifiPass = b; prefs.putString("ssid", wifiSsid); prefs.putString("pass", wifiPass); Serial.printf("Wi-Fi disimpan: %s. Menyambung...\n", wifiSsid.c_str()); lastWifiTry = 0; WiFi.disconnect(); }
    else Serial.println("format: wifi NAMA PASSWORD");
  } else Serial.println("perintah: status | sethours <jam> | wifi <nama> <password>");
}

static void connectWifi() {
  if (WiFi.status() == WL_CONNECTED || millis() - lastWifiTry < 15000) return;
  lastWifiTry = millis(); WiFi.disconnect(); WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
}

void setup() {
  Serial.begin(115200); delay(200);
  prefs.begin("mh", false); runSeconds = prefs.getUInt("rs", 0); savedSeconds = runSeconds;
  if (PIN_RUN >= 0) pinMode(PIN_RUN, INPUT_PULLUP);
#if USE_CURRENT
  analogReadResolution(12); analogSetPinAttenuation(PIN_CURRENT_ADC, ADC_11db);
#endif
#if USE_DS18B20
  ds.begin(); ds.setResolution(11);
#endif
#if USE_MPU6050
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL); Wire.beginTransmission(0x68); Wire.write(0x6B); Wire.write(0); Wire.endTransmission(true);
#endif
  wifiSsid = prefs.getString("ssid", WIFI_SSID); wifiPass = prefs.getString("pass", WIFI_PASS);
  boots = prefs.getUInt("boots", 0) + 1; prefs.putUInt("boots", boots);
  WiFi.mode(WIFI_STA); WiFi.setAutoReconnect(true); WiFi.begin(wifiSsid.c_str(), wifiPass.c_str()); lastWifiTry = millis();
  configTime(0, 0, NTP_SERVER);
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  esp_task_wdt_config_t wc = { .timeout_ms = WDT_SECONDS * 1000, .idle_core_mask = 0, .trigger_panic = true };
  esp_task_wdt_reconfigure(&wc); esp_task_wdt_add(NULL);
#else
  esp_task_wdt_init(WDT_SECONDS, true); esp_task_wdt_add(NULL);
#endif
  Serial.printf("MaintHub node siap. perangkat=%s aset=%s fw=%s running_hour=%.2f jam boot#%lu\n", DEVICE_ID, MH_ASSET, FW_VERSION, hoursNow(), (unsigned long)boots);
  lastTick = millis();
}

void loop() {
  esp_task_wdt_reset(); handleSerial(); connectWifi();
  uint32_t now = millis(), dt = now - lastTick; lastTick = now; upMs += dt;

  // Akumulasi running hour setiap iterasi (ketelitian milidetik, tidak bergantung interval kirim).
  if (running) {
    runFrac += dt / 1000.0; while (runFrac >= 1.0) { runFrac -= 1.0; runSeconds++; }
    if (now - lastSave >= RUNHOUR_SAVE_MS) saveHours(false);
  }
  bool inRun = readRunInput(PIN_RUN >= 0 ? 0 : lastAmps);
  if (inRun != running) { running = inRun; saveHours(true); Serial.printf("mesin %s\n", running ? "JALAN" : "BERHENTI"); }

  if (now - lastSample >= SAMPLE_MS || lastSample == 0) {
    lastSample = now;
    Sample s; s.ts = nowEpoch(); s.oil = readOilC(); s.amps = readCurrentA(); s.vib = readVibG(); s.hours = hoursNow();
    if (!isnan(s.amps)) lastAmps = s.amps;
    push(s);
    Serial.printf("oli=%.1fC arus=%.2fA getar=%.3fg jam=%.2f jalan=%d\n", s.oil, s.amps, s.vib, s.hours, running);
  }
  if (now - lastSend >= SEND_MS && bufCount > 0) {
    lastSend = now;
    // Bila tertinggal, kirim beberapa permintaan berturut-turut (maks 5 per giliran).
    for (int i = 0; i < 5 && bufCount > 0; i++) { if (!sendBatch()) break; esp_task_wdt_reset(); }
  }
  delay(20);
}
