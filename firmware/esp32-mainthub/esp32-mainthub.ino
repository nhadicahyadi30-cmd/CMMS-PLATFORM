/*
  MaintHub ESP32 node: suhu oli (DS18B20), arus motor (SCT-013), getaran (MPU6050, opsional),
  dan RUNNING HOUR kumulatif yang tahan mati listrik. Mengirim batch ke POST /api/ingest/readings.

  Dua jalur kirim: HTTP langsung ke MaintHub, atau MQTT (broker Mosquitto + Node-RED). Dipilih di konfigurasi, bukan di kode.
  KONFIGURASI TANPA FLASH ULANG: firmware yang SAMA dipakai semua perangkat. Pengaturan disimpan di flash (NVS) lewat
    1) portal Wi-Fi "MaintHub-RTU-xxxx" (otomatis muncul bila Wi-Fi belum diisi, atau tahan tombol BOOT 3 detik), atau
    2) serial: cfg <kode dari menu Perangkat RTU>
  config.h hanya berisi nilai awal (default).

  Library (Arduino Library Manager): OneWire, DallasTemperature, PubSubClient. Board: ESP32 Arduino core 2.x atau 3.x.
  Perintah serial (115200): status | show | portal | cfg <kode> | sethours <jam> | wifi <nama> <password> | factory
*/
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <PubSubClient.h>
#include <Preferences.h>
#include <esp_task_wdt.h>
#include <time.h>
#include "config.h"
#include "mh_util.h"
#ifndef DEMO_MODE
#define DEMO_MODE 0
#endif
// Nilai awal bila config.h lama tidak memilikinya
#ifndef MH_TRANSPORT
#define MH_TRANSPORT 0          // 0 = HTTP, 1 = MQTT
#endif
#ifndef MQTT_HOST
#define MQTT_HOST ""
#endif
#ifndef MQTT_PORT
#define MQTT_PORT 1883
#endif
#ifndef MQTT_USER
#define MQTT_USER ""
#endif
#ifndef MQTT_PASS
#define MQTT_PASS ""
#endif
#ifndef PIN_PORTAL
#define PIN_PORTAL 0            // tombol BOOT; tahan 3 detik untuk membuka portal konfigurasi; -1 = nonaktif
#endif
#ifndef PORTAL_PASS
#define PORTAL_PASS "mainthub1" // kata sandi Wi-Fi portal (min. 8 karakter); ganti bila perlu
#endif
#if DEMO_MODE   // data dummy: tanpa sensor, library OneWire/DallasTemperature tidak diperlukan
#undef USE_DS18B20
#define USE_DS18B20 0
#undef USE_CURRENT
#define USE_CURRENT 0
#undef USE_MPU6050
#define USE_MPU6050 0
#endif
#if USE_DS18B20
#include <OneWire.h>
#include <DallasTemperature.h>
#endif
#if USE_MPU6050
#include <Wire.h>
#endif

#define FW_VERSION "1.2.0"

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
static MhCfg cfg;                               // konfigurasi aktif (dari NVS, default dari config.h)
static char assetJ[100], plantJ[100], devJ[52], keyJ[260];   // salinan ber-escape untuk JSON
static WiFiClient mqNet; static PubSubClient mq(mqNet);
static volatile int ackCode = 0;                // balasan Node-RED atas kiriman MQTT (kode ala HTTP)
static uint32_t lastMqTry = 0, btnSince = 0;
static bool wantPortal = false;
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

// ---- Data dummy (DEMO_MODE): pola realistis agar dashboard bisa dicoba tanpa sensor ----
static float demoNoise(uint32_t seed) { seed = seed * 1664525u + 1013904223u; return ((seed >> 8) & 0xFFFF) / 65535.0f - 0.5f; }   // -0,5 .. 0,5
static float demoOil() { float s = upMs / 1000.0f; float rise = s / 3600.0f * 1.5f; if (rise > 25) rise = 25; return 62 + 5 * sinf(s / 900.0f) + rise + demoNoise((uint32_t)s) * 0.8f; }   // naik ±1,5 °C/jam sampai +25 °C
static float demoAmps() { float s = upMs / 1000.0f; return 18 + 1.2f * sinf(s / 300.0f) + demoNoise((uint32_t)s + 7) * 0.6f; }
static float demoVib() { float s = upMs / 1000.0f; float v = 0.18f + s / 3600.0f * 0.01f + fabsf(demoNoise((uint32_t)s + 13)) * 0.02f; return v; }

// ---- Pembacaan sensor ----
static float readCurrentA() {
  if (cfg.demo) return demoAmps();
  if (!cfg.sCur) return NAN;
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
  if (cfg.demo) return demoOil();
  if (!cfg.sOil) return NAN;
#if USE_DS18B20
  ds.requestTemperatures(); float t = ds.getTempCByIndex(0);
  if (t == DEVICE_DISCONNECTED_C || t < -40 || t > 150) return NAN;   // sensor lepas/rusak: jangan kirim
  return t;
#else
  return NAN;
#endif
}
static float readVibG() {
  if (cfg.demo) return demoVib();
  if (!cfg.sVib) return NAN;
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
  char plant[120] = ""; if (plantJ[0]) snprintf(plant, sizeof plant, ",\"plant\":\"%s\"", plantJ);
  int n = snprintf(out + len, cap - len, "%s{\"asset\":\"%s\"%s,\"tag\":\"%s\",\"value\":%.3f%s}", first ? "" : ",", assetJ, plant, tag, v, tsPart);
  return (n < 0 || (size_t)n >= cap - len) ? -1 : len + n;
}

// ---- Konfigurasi (NVS) ----
static void rebuildEscaped() {
  mh_jescape(cfg.asset, assetJ, sizeof assetJ); mh_jescape(cfg.plant, plantJ, sizeof plantJ);
  mh_jescape(cfg.devId, devJ, sizeof devJ); mh_jescape(cfg.key, keyJ, sizeof keyJ);
}
static void nv(const char* k, char* dst, size_t cap, const char* def) { String v = prefs.getString(k, def); snprintf(dst, cap, "%s", v.c_str()); }
static void loadCfg() {
  memset(&cfg, 0, sizeof cfg);
  nv("ssid", cfg.ssid, sizeof cfg.ssid, WIFI_SSID); nv("pass", cfg.pass, sizeof cfg.pass, WIFI_PASS);
  nv("devid", cfg.devId, sizeof cfg.devId, DEVICE_ID); nv("asset", cfg.asset, sizeof cfg.asset, MH_ASSET); nv("plant", cfg.plant, sizeof cfg.plant, MH_PLANT);
  nv("key", cfg.key, sizeof cfg.key, MH_API_KEY); nv("url", cfg.url, sizeof cfg.url, MH_URL);
  nv("mqh", cfg.mqHost, sizeof cfg.mqHost, MQTT_HOST); nv("mqu", cfg.mqUser, sizeof cfg.mqUser, MQTT_USER); nv("mqw", cfg.mqPass, sizeof cfg.mqPass, MQTT_PASS);
  cfg.tr = prefs.getInt("tr", MH_TRANSPORT); cfg.mqPort = prefs.getInt("mqp", MQTT_PORT);
  cfg.demo = prefs.getInt("demo", DEMO_MODE); cfg.sOil = prefs.getInt("sOil", USE_DS18B20); cfg.sCur = prefs.getInt("sCur", USE_CURRENT); cfg.sVib = prefs.getInt("sVib", USE_MPU6050);
  rebuildEscaped();
}
static void saveCfg() {
  prefs.putString("ssid", cfg.ssid); prefs.putString("pass", cfg.pass); prefs.putString("devid", cfg.devId); prefs.putString("asset", cfg.asset); prefs.putString("plant", cfg.plant);
  prefs.putString("key", cfg.key); prefs.putString("url", cfg.url); prefs.putString("mqh", cfg.mqHost); prefs.putString("mqu", cfg.mqUser); prefs.putString("mqw", cfg.mqPass);
  prefs.putInt("tr", cfg.tr); prefs.putInt("mqp", cfg.mqPort); prefs.putInt("demo", cfg.demo); prefs.putInt("sOil", cfg.sOil); prefs.putInt("sCur", cfg.sCur); prefs.putInt("sVib", cfg.sVib);
}
static bool wifiConfigured() { return cfg.ssid[0] && strcmp(cfg.ssid, "NAMA_WIFI_PABRIK") != 0; }

// ---- MQTT ----
static void mqTopic(char* out, size_t cap, const char* leaf) { snprintf(out, cap, "mainthub/%s/%s", cfg.devId, leaf); }
static void onMqtt(char* topic, byte* p, unsigned int n) {
  char b[200]; unsigned int m = n < sizeof b - 1 ? n : sizeof b - 1; memcpy(b, p, m); b[m] = 0;
  char v[16]; if (mh_jget(b, "code", v, sizeof v)) ackCode = atoi(v);
}
static bool mqConnect() {
  if (mq.connected()) return true;
  if (WiFi.status() != WL_CONNECTED || !cfg.mqHost[0]) return false;
  if (lastMqTry && millis() - lastMqTry < 10000) return false;
  lastMqTry = millis();
  mq.setServer(cfg.mqHost, cfg.mqPort); mq.setBufferSize(6400); mq.setKeepAlive(30); mq.setSocketTimeout(5); mq.setCallback(onMqtt);
  char will[80]; mqTopic(will, sizeof will, "status");
  bool ok = cfg.mqUser[0] ? mq.connect(cfg.devId, cfg.mqUser, cfg.mqPass, will, 1, true, "offline") : mq.connect(cfg.devId, NULL, NULL, will, 1, true, "offline");
  if (!ok) {
    int st = mq.state(); Serial.printf("MQTT gagal tersambung ke %s:%d (kode %d: %s)\n", cfg.mqHost, cfg.mqPort, st,
      st == -2 ? "broker tidak terjangkau: cek IP, port 1883, firewall, satu Wi-Fi" : st == 4 || st == 5 ? "user/password broker salah" : st == 2 ? "client id ditolak" : "lihat dokumentasi PubSubClient");
    return false;
  }
  mq.publish(will, "online", true); char ack[80]; mqTopic(ack, sizeof ack, "ack"); mq.subscribe(ack, 0);
  Serial.printf("MQTT tersambung ke %s:%d sebagai %s\n", cfg.mqHost, cfg.mqPort, cfg.devId);
  return true;
}

// Kirim satu badan JSON. Mengembalikan kode ala HTTP: 200 sukses, 401/400 ditolak, <=0 gagal jaringan/tidak ada balasan.
static int transmit(const char* body, int len, String& resp) {
  resp = "";
  if (cfg.tr == 1) {
    if (!mqConnect()) return -1;
    char t[80]; mqTopic(t, sizeof t, "ingest"); ackCode = 0;
    if (!mq.publish(t, (const uint8_t*)body, (unsigned int)len, false)) return -2;
    uint32_t t0 = millis(); while (!ackCode && millis() - t0 < 12000) { mq.loop(); esp_task_wdt_reset(); delay(20); }   // tunggu balasan Node-RED
    return ackCode ? ackCode : -3;
  }
  HTTPClient http; WiFiClientSecure tls; WiFiClient plain; bool https = strncmp(cfg.url, "https", 5) == 0;
  if (https) {
#ifdef MH_ROOT_CA
    tls.setCACert(MH_ROOT_CA);
#else
    tls.setInsecure();
#endif
    http.begin(tls, cfg.url);
  } else http.begin(plain, cfg.url);
  http.setTimeout(10000); http.addHeader("Content-Type", "application/json"); if (cfg.key[0]) http.addHeader("x-api-key", cfg.key);   // kosong = lewat Node-RED (kunci disimpan di sana)
  int code = http.POST((uint8_t*)body, len); resp = code > 0 ? http.getString() : ""; http.end();
  return code;
}

static bool sendBatch() {
  if (WiFi.status() != WL_CONNECTED || bufCount == 0 || authFailed) return false;
  const int PER = 20;                               // sampel per permintaan (maks ~4 pembacaan tiap sampel)
  int take = bufCount < PER ? bufCount : PER;
  static char body[6144];
  int len = cfg.tr == 1 ? snprintf(body, sizeof body, "{\"key\":\"%s\",\"readings\":[", keyJ) : snprintf(body, sizeof body, "{\"readings\":["); bool first = true;   // MQTT: kunci ikut di isi pesan (broker berpassword, hanya LAN)
  for (int i = 0; i < take; i++) {
    const Sample& s = buf[(bufHead + i) % BUFFER_MAX]; int l;
    struct { const char* tag; float v; } items[] = { {TAG_OIL_TEMP, s.oil}, {TAG_CURRENT, s.amps}, {TAG_VIBRATION, s.vib}, {TAG_RUNHOURS, s.hours} };
    for (auto& it : items) { l = appendReading(body, sizeof body, len, it.tag, it.v, s.ts, first); if (l < 0) { take = i; goto done; } if (l != len) first = false; len = l; }
  }
done:
  {
    String ip = WiFi.localIP().toString();
    len += snprintf(body + len, sizeof body - len, "],\"device\":{\"id\":\"%s\",\"fw\":\"%s\",\"ip\":\"%s\",\"rssi\":%d,\"uptime\":%lu,\"queue\":%d,\"heap\":%lu,\"boots\":%lu}}",
                    devJ, FW_VERSION, ip.c_str(), (int)WiFi.RSSI(), (unsigned long)(upMs / 1000), bufCount - take, (unsigned long)(ESP.getFreeHeap() / 1024), (unsigned long)boots);
  }
  if (take == 0) return false;

  String resp; int code = transmit(body, len, resp);
  if (code == 200) {
    bufHead = (bufHead + take) % BUFFER_MAX; bufCount -= take;     // item yang ditolak server (mis. di luar rentang) tidak akan berhasil bila diulang, jadi tidak ditahan
    int e = resp.indexOf("\"errors\":[{"); if (e >= 0) Serial.printf("server menolak sebagian: %s\n", resp.substring(e, e + 160).c_str());
    if (!unregisteredWarned && resp.indexOf("\"device\":\"unregistered\"") >= 0) { unregisteredWarned = true; Serial.println("peringatan: ID perangkat belum terdaftar di MaintHub (menu Perangkat RTU). Data tetap diterima."); }
    Serial.printf("terkirim %d sampel via %s (sisa antrean %d)\n", take, cfg.tr == 1 ? "MQTT" : "HTTP", bufCount);
    return true;
  }
  if (code == 401) { authFailed = true; Serial.println("API key ditolak (401). Periksa kunci di konfigurasi (portal/cfg); pengiriman dihentikan sampai reboot."); return false; }
  if (code == 400) { bufHead = (bufHead + take) % BUFFER_MAX; bufCount -= take; Serial.printf("format ditolak (400): %s\n", resp.c_str()); return false; }   // data cacat: buang agar tidak macet
  if (cfg.tr == 1) {
    Serial.printf("gagal kirim MQTT (kode %d), antrean %d\n", code, bufCount);
    if (code == -3) Serial.println("  artinya: pesan terkirim ke broker tetapi Node-RED tidak membalas. Cek: container node-red hidup, flow cabang mainthub/+/ingest ter-deploy, MAINTHUB_URL benar.");
    else if (code >= 500) Serial.println("  artinya: Node-RED menerima tetapi MaintHub tidak menjawab dengan benar. Lihat debug Node-RED.");
    return false;
  }
  Serial.printf("gagal kirim (HTTP %d: %s), antrean %d\n", code, HTTPClient::errorToString(code).c_str(), bufCount);
  Serial.printf("  tujuan : %s\n  ESP32  : IP %s, gateway %s, sinyal %d dBm\n", cfg.url, WiFi.localIP().toString().c_str(), WiFi.gatewayIP().toString().c_str(), (int)WiFi.RSSI());
  if (code == -1) Serial.println("  artinya: tidak bisa membuka sambungan ke server. Cek: IP di alamat server = IPv4 laptop, firewall port 80, satu Wi-Fi yang sama, server menyala.");
  return false;
}

// ---- Portal konfigurasi (captive portal) ----
static String hesc(const char* s) { String o; for (; *s; s++) { char c = *s; if (c == '&') o += "&amp;"; else if (c == '<') o += "&lt;"; else if (c == '>') o += "&gt;"; else if (c == '"') o += "&quot;"; else o += c; } return o; }
static String field(const char* label, const char* name, const char* val, const char* type = "text", const char* hint = "") {
  return String("<label>") + label + "<input name='" + name + "' type='" + type + "' value=\"" + hesc(val) + "\" autocapitalize='off' autocomplete='off'></label>" + (hint[0] ? String("<small>") + hint + "</small>" : String(""));
}
static String portalPage(const String& nets, const char* note) {
  String h = F("<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>MaintHub RTU</title><style>body{font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:14px;background:#f8fafc;color:#0f172a}h1{font-size:20px}h2{font-size:15px;margin:18px 0 4px}label{display:block;font-size:13px;margin-top:10px}input,select,textarea{width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd5e1;border-radius:6px;font-size:15px}small{color:#64748b;display:block}button{margin-top:16px;width:100%;padding:12px;background:#1d4ed8;color:#fff;border:0;border-radius:6px;font-size:16px}.n{background:#ecfdf5;padding:8px;border-radius:6px}.c{display:flex;gap:8px;align-items:center;margin-top:8px}.c input{width:auto}details{margin-top:12px}</style></head><body>");
  h += "<h1>MaintHub RTU</h1><p>Perangkat <b>" + hesc(cfg.devId) + "</b> &middot; firmware " + FW_VERSION + " &middot; running hour " + String(hoursNow(), 2) + " jam</p>";
  if (note && note[0]) h += String("<p class='n'>") + note + "</p>";
  h += "<form method='post' action='/save'><h2>1. Wi-Fi</h2>";
  h += "<label>Nama Wi-Fi (SSID)<input name='ssid' list='nets' value=\"" + hesc(wifiConfigured() ? cfg.ssid : "") + "\" autocapitalize='off'></label><datalist id='nets'>" + nets + "</datalist>";
  h += field("Kata sandi Wi-Fi", "pass", "", "password", "Kosongkan bila tidak diubah");
  h += "<h2>2. Kode konfigurasi</h2><label>Tempel kode dari menu Perangkat RTU di MaintHub<textarea name='code' rows='4' placeholder='{\"mh\":1,...}'></textarea></label><small>Berisi mesin, kunci, jalur kirim (HTTP/MQTT), broker, mode demo dan sensor. Cukup ini; bagian 3 hanya untuk mengubah manual.</small>";
  h += "<details><summary>3. Pengaturan manual (lanjutan)</summary>";
  h += String("<label>Jalur kirim<select name='tr'><option value='0'") + (cfg.tr == 0 ? " selected" : "") + ">HTTP langsung ke MaintHub</option><option value='1'" + (cfg.tr == 1 ? " selected" : "") + ">MQTT (Mosquitto + Node-RED)</option></select></label>";
  h += field("ID perangkat", "devid", cfg.devId) + field("Kode aset", "asset", cfg.asset) + field("Kode plant (opsional)", "plant", cfg.plant);
  h += field("Alamat server HTTP", "url", cfg.url, "text", "mis. http://192.168.1.50/api/ingest/readings") + field("API key (kosong = tidak diubah)", "key", "", "password");
  h += field("Alamat broker MQTT", "mqh", cfg.mqHost, "text", "IP laptop/server yang menjalankan Mosquitto") + field("Port broker", "mqp", String(cfg.mqPort).c_str(), "number");
  h += field("User broker", "mqu", cfg.mqUser) + field("Password broker (kosong = tidak diubah)", "mqw", "", "password");
  h += String("<div class='c'><input type='checkbox' name='demo' value='1'") + (cfg.demo ? " checked" : "") + "><span>Mode demo (data dummy, tanpa sensor)</span></div>";
  h += String("<div class='c'><input type='checkbox' name='sOil' value='1'") + (cfg.sOil ? " checked" : "") + "><span>Sensor suhu oli (DS18B20)</span></div>";
  h += String("<div class='c'><input type='checkbox' name='sCur' value='1'") + (cfg.sCur ? " checked" : "") + "><span>Sensor arus (SCT-013)</span></div>";
  h += String("<div class='c'><input type='checkbox' name='sVib' value='1'") + (cfg.sVib ? " checked" : "") + "><span>Sensor getaran (MPU6050)</span></div>";
  h += field("Set running hour (jam, kosong = tidak diubah)", "hours", "", "number", "Samakan dengan hour meter fisik");
  h += "</details><button type='submit'>Simpan &amp; mulai ulang</button></form></body></html>";
  return h;
}
static void runPortal() {
  char ap[40]; uint8_t mac[6]; WiFi.macAddress(mac); snprintf(ap, sizeof ap, "MaintHub-RTU-%02X%02X", mac[4], mac[5]);
  String nets; WiFi.mode(WIFI_STA); WiFi.disconnect(); int n = WiFi.scanNetworks();
  for (int i = 0; i < n && i < 20; i++) nets += "<option value=\"" + hesc(WiFi.SSID(i).c_str()) + "\">";
  WiFi.mode(WIFI_AP); WiFi.softAP(ap, PORTAL_PASS);
  WebServer web(80); DNSServer dns; dns.start(53, "*", WiFi.softAPIP());
  bool saved = false; String note = wifiConfigured() ? "" : "Wi-Fi belum diisi.";
  web.on("/", HTTP_GET, [&]() { web.send(200, "text/html; charset=utf-8", portalPage(nets, note.c_str())); });
  web.on("/save", HTTP_POST, [&]() {
    auto A = [&](const char* k) { return web.arg(k); };
    String v;
    if ((v = A("ssid")).length()) snprintf(cfg.ssid, sizeof cfg.ssid, "%s", v.c_str());
    if ((v = A("pass")).length()) snprintf(cfg.pass, sizeof cfg.pass, "%s", v.c_str());
    if (A("tr").length()) cfg.tr = A("tr").toInt() == 1 ? 1 : 0;
    if ((v = A("devid")).length()) snprintf(cfg.devId, sizeof cfg.devId, "%s", v.c_str());
    snprintf(cfg.asset, sizeof cfg.asset, "%s", A("asset").c_str()); snprintf(cfg.plant, sizeof cfg.plant, "%s", A("plant").c_str());
    if ((v = A("url")).length()) snprintf(cfg.url, sizeof cfg.url, "%s", v.c_str());
    if ((v = A("key")).length()) snprintf(cfg.key, sizeof cfg.key, "%s", v.c_str());
    snprintf(cfg.mqHost, sizeof cfg.mqHost, "%s", A("mqh").c_str());
    if ((v = A("mqp")).toInt() > 0 && v.toInt() < 65536) cfg.mqPort = v.toInt();
    snprintf(cfg.mqUser, sizeof cfg.mqUser, "%s", A("mqu").c_str());
    if ((v = A("mqw")).length()) snprintf(cfg.mqPass, sizeof cfg.mqPass, "%s", v.c_str());
    cfg.demo = A("demo") == "1"; cfg.sOil = A("sOil") == "1"; cfg.sCur = A("sCur") == "1"; cfg.sVib = A("sVib") == "1";
    if ((v = A("hours")).length()) { float h = v.toFloat(); if (h >= 0 && h < 1000000) { runSeconds = (uint32_t)(h * 3600.0f); runFrac = 0; saveHours(true); } }
    String code = A("code"); code.trim();
    if (code.length()) { int k = mh_apply_provision(cfg, code.c_str()); if (k < 0) { note = "Kode konfigurasi tidak dikenali (harus berawalan {\"mh\":1,...}). Tidak ada yang disimpan."; web.send(200, "text/html; charset=utf-8", portalPage(nets, note.c_str())); return; } }
    saveCfg(); rebuildEscaped(); saved = true;
    web.send(200, "text/html; charset=utf-8", "<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'><body style='font-family:system-ui;padding:20px'><h2>Tersimpan</h2><p>Perangkat mulai ulang dan menyambung ke Wi-Fi. Anda boleh menutup halaman ini.</p></body>");
  });
  web.onNotFound([&]() { web.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/", true); web.send(302, "text/plain", ""); });   // captive portal: semua alamat diarahkan ke sini
  web.begin();
  Serial.printf("\n=== PORTAL KONFIGURASI ===\nSambungkan HP/laptop ke Wi-Fi \"%s\" (kata sandi %s), lalu buka http://%s/ (biasanya terbuka otomatis).\nBatas waktu 10 menit.\n", ap, PORTAL_PASS, WiFi.softAPIP().toString().c_str());
  uint32_t t0 = millis();
  while (!saved && millis() - t0 < 600000UL) { esp_task_wdt_reset(); dns.processNextRequest(); web.handleClient(); if (Serial.available()) { String l = Serial.readStringUntil('\n'); l.trim(); if (l == "exit") break; } delay(5); }
  uint32_t t1 = millis(); while (saved && millis() - t1 < 1500) { web.handleClient(); delay(5); }   // beri waktu halaman "Tersimpan" terkirim
  Serial.println(saved ? "Konfigurasi tersimpan, mulai ulang..." : "Portal selesai tanpa perubahan, mulai ulang...");
  delay(300); ESP.restart();
}

// ---- Serial ----
static void showCfg() {
  Serial.printf("perangkat=%s aset=%s plant=%s jalur=%s demo=%d sensor(oli=%d arus=%d getar=%d)\n  wifi=\"%s\" (%s) ip=%s\n",
    cfg.devId, cfg.asset, cfg.plant[0] ? cfg.plant : "-", cfg.tr == 1 ? "MQTT" : "HTTP", cfg.demo, cfg.sOil, cfg.sCur, cfg.sVib, cfg.ssid, WiFi.status() == WL_CONNECTED ? "tersambung" : "belum tersambung", WiFi.localIP().toString().c_str());
  if (cfg.tr == 1) Serial.printf("  broker=%s:%d user=%s mqtt=%s kunci=%s\n", cfg.mqHost, cfg.mqPort, cfg.mqUser[0] ? cfg.mqUser : "-", mq.connected() ? "tersambung" : "putus", cfg.key[0] ? "ada" : "KOSONG");
  else Serial.printf("  url=%s kunci=%s\n", cfg.url, cfg.key[0] ? "ada" : "kosong (lewat Node-RED)");
}
static void handleSerial() {
  if (!Serial.available()) return;
  String l = Serial.readStringUntil('\n'); l.trim(); if (!l.length()) return;
  if (l == "status") {
    Serial.printf("wifi=%d jam_valid=%d jalan=%d running_hour=%.2f arus=%.2fA antrean=%d\n", WiFi.status() == WL_CONNECTED, timeValid(), running, hoursNow(), lastAmps, bufCount);
  } else if (l == "show") { showCfg();
  } else if (l == "portal") { wantPortal = true;
  } else if (l == "factory") {
    const char* ks[] = {"ssid","pass","devid","asset","plant","key","url","mqh","mqu","mqw","tr","mqp","demo","sOil","sCur","sVib"}; for (auto k : ks) prefs.remove(k);
    Serial.println("konfigurasi dikembalikan ke nilai config.h (running hour tetap). Mulai ulang..."); delay(300); ESP.restart();
  } else if (l.startsWith("cfg ")) {
    int k = mh_apply_provision(cfg, l.c_str() + 4);
    if (k < 0) Serial.println("kode tidak dikenali: harus {\"mh\":1,...} dari menu Perangkat RTU");
    else { saveCfg(); rebuildEscaped(); authFailed = false; Serial.printf("%d pengaturan diterapkan dan disimpan. Mulai ulang...\n", k); delay(300); ESP.restart(); }
  } else if (l.startsWith("sethours ")) {
    float h = l.substring(9).toFloat();
    if (h >= 0 && h < 1000000) { runSeconds = (uint32_t)(h * 3600.0f); runFrac = 0; saveHours(true); Serial.printf("running hour diset ke %.2f jam\n", h); }
    else Serial.println("nilai tidak valid");
  } else if (l.startsWith("wifi ")) {
    // wifi NAMA PASSWORD   atau   wifi "Nama Dengan Spasi" "password"   (disimpan di flash, tanpa flash ulang)
    String r = l.substring(5); r.trim(); String a, b;
    auto take = [](String& src, String& out) { src.trim(); if (src.startsWith("\"")) { int e = src.indexOf('"', 1); if (e < 0) return false; out = src.substring(1, e); src = src.substring(e + 1); } else { int e = src.indexOf(' '); if (e < 0) { out = src; src = ""; } else { out = src.substring(0, e); src = src.substring(e + 1); } } src.trim(); return out.length() > 0; };
    if (take(r, a)) { if (r.length() && r.startsWith("\"")) take(r, b); else b = r; snprintf(cfg.ssid, sizeof cfg.ssid, "%s", a.c_str()); snprintf(cfg.pass, sizeof cfg.pass, "%s", b.c_str()); prefs.putString("ssid", cfg.ssid); prefs.putString("pass", cfg.pass); Serial.printf("Wi-Fi disimpan: %s. Menyambung...\n", cfg.ssid); lastWifiTry = 0; WiFi.disconnect(); }
    else Serial.println("format: wifi NAMA PASSWORD");
  } else Serial.println("perintah: status | show | portal | cfg <kode> | sethours <jam> | wifi <nama> <password> | factory");
}

static void connectWifi() {
  if (WiFi.status() == WL_CONNECTED || millis() - lastWifiTry < 15000) return;
  lastWifiTry = millis(); WiFi.disconnect(); WiFi.begin(cfg.ssid, cfg.pass);
}

void setup() {
  Serial.begin(115200); delay(200);
  prefs.begin("mh", false); runSeconds = prefs.getUInt("rs", 0); savedSeconds = runSeconds;
  loadCfg();
  if (PIN_RUN >= 0) pinMode(PIN_RUN, INPUT_PULLUP);
  if (PIN_PORTAL >= 0) pinMode(PIN_PORTAL, INPUT_PULLUP);
#if USE_CURRENT
  analogReadResolution(12); analogSetPinAttenuation(PIN_CURRENT_ADC, ADC_11db);
#endif
#if USE_DS18B20
  ds.begin(); ds.setResolution(11);
#endif
#if USE_MPU6050
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL); Wire.beginTransmission(0x68); Wire.write(0x6B); Wire.write(0); Wire.endTransmission(true);
#endif
  boots = prefs.getUInt("boots", 0) + 1; prefs.putUInt("boots", boots);
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  esp_task_wdt_config_t wc = { .timeout_ms = WDT_SECONDS * 1000, .idle_core_mask = 0, .trigger_panic = true };
  esp_task_wdt_reconfigure(&wc); esp_task_wdt_add(NULL);
#else
  esp_task_wdt_init(WDT_SECONDS, true); esp_task_wdt_add(NULL);
#endif
  if (!wifiConfigured()) { Serial.println("Wi-Fi belum dikonfigurasi: membuka portal..."); runPortal(); }   // tidak kembali (restart)
  WiFi.mode(WIFI_STA); WiFi.setAutoReconnect(true); WiFi.begin(cfg.ssid, cfg.pass); lastWifiTry = millis();
  configTime(0, 0, NTP_SERVER);
  if (cfg.demo) Serial.println("*** MODE DEMO: mengirim DATA DUMMY, bukan pembacaan sensor ***");
  Serial.printf("MaintHub node siap. perangkat=%s aset=%s jalur=%s fw=%s running_hour=%.2f jam boot#%lu\n", cfg.devId, cfg.asset, cfg.tr == 1 ? "MQTT" : "HTTP", FW_VERSION, hoursNow(), (unsigned long)boots);
  Serial.println("Ketik 'show' untuk melihat konfigurasi, 'portal' untuk membuka portal. Atau tahan tombol BOOT 3 detik.");
  lastTick = millis();
}

void loop() {
  esp_task_wdt_reset(); handleSerial(); connectWifi();
  if (PIN_PORTAL >= 0) { if (digitalRead(PIN_PORTAL) == LOW) { if (!btnSince) btnSince = millis(); else if (millis() - btnSince > 3000) wantPortal = true; } else btnSince = 0; }
  if (wantPortal) { wantPortal = false; saveHours(true); runPortal(); }
  if (cfg.tr == 1) { mqConnect(); mq.loop(); }
  uint32_t now = millis(), dt = now - lastTick; lastTick = now; upMs += dt;

  // Akumulasi running hour setiap iterasi (ketelitian milidetik, tidak bergantung interval kirim).
  if (running) {
    runFrac += dt / 1000.0; while (runFrac >= 1.0) { runFrac -= 1.0; runSeconds++; }
    if (now - lastSave >= RUNHOUR_SAVE_MS) saveHours(false);
  }
  bool inRun = cfg.demo ? true : readRunInput(PIN_RUN >= 0 ? 0 : lastAmps);
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
