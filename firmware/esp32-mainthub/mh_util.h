// Logika murni (tanpa library Arduino) agar bisa diuji di komputer: pembaca JSON datar, escape, dan penerapan "kode konfigurasi".
#pragma once
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>

// Ambil nilai kunci dari JSON datar. String di-unescape (\" \\ \n \/), angka/true/false diambil apa adanya. true bila kunci ada.
inline bool mh_jget(const char* json, const char* key, char* out, size_t cap) {
  if (!json || !key || !out || cap < 2) return false;
  char pat[48]; int pl = snprintf(pat, sizeof pat, "\"%s\"", key); if (pl <= 0 || pl >= (int)sizeof pat) return false;
  const char* p = json;
  while ((p = strstr(p, pat)) != NULL) {
    const char* q = p + pl; while (*q == ' ' || *q == '\t' || *q == '\r' || *q == '\n') q++;
    if (*q != ':') { p += pl; continue; }               // "key" muncul sebagai isi string, bukan sebagai kunci
    q++; while (*q == ' ' || *q == '\t' || *q == '\r' || *q == '\n') q++;
    size_t n = 0;
    if (*q == '"') {
      q++;
      while (*q && *q != '"') {
        char c = *q++;
        if (c == '\\' && *q) { char e = *q++; c = e == 'n' ? ' ' : e == 't' ? ' ' : e == 'r' ? ' ' : e; }
        if (n + 1 < cap) out[n++] = c;
      }
    } else {
      while (*q && *q != ',' && *q != '}' && *q != ' ' && *q != '\r' && *q != '\n') { if (n + 1 < cap) out[n++] = *q; q++; }
    }
    out[n] = 0; return true;
  }
  return false;
}

// Escape untuk dimasukkan ke dalam string JSON.
inline void mh_jescape(const char* in, char* out, size_t cap) {
  size_t n = 0;
  for (; in && *in && n + 2 < cap; in++) {
    unsigned char c = (unsigned char)*in;
    if (c == '"' || c == '\\') { out[n++] = '\\'; out[n++] = (char)c; }
    else if (c < 0x20) { out[n++] = ' '; }
    else out[n++] = (char)c;
  }
  out[n] = 0;
}

struct MhCfg {
  char ssid[33], pass[65], devId[24], asset[48], plant[48], key[128], url[160], mqHost[80], mqUser[48], mqPass[64];
  int tr;        // 0 = HTTP langsung ke MaintHub, 1 = MQTT (lewat Mosquitto + Node-RED)
  int mqPort;
  int demo, sOil, sCur, sVib;
};

static inline void mh_copy(char* dst, size_t cap, const char* src) { snprintf(dst, cap, "%s", src ? src : ""); }

// Terapkan "kode konfigurasi" dari menu Perangkat RTU. Hanya kunci yang ADA yang diubah. Mengembalikan jumlah kunci yang diterapkan, -1 bila bukan kode MaintHub.
inline int mh_apply_provision(MhCfg& c, const char* json) {
  char v[170]; int n = 0;
  if (!json || !mh_jget(json, "mh", v, sizeof v) || strcmp(v, "1") != 0) return -1;   // penanda versi kode
  if (mh_jget(json, "id", v, sizeof v) && v[0]) { mh_copy(c.devId, sizeof c.devId, v); n++; }
  if (mh_jget(json, "asset", v, sizeof v)) { mh_copy(c.asset, sizeof c.asset, v); n++; }
  if (mh_jget(json, "plant", v, sizeof v)) { mh_copy(c.plant, sizeof c.plant, v); n++; }
  if (mh_jget(json, "key", v, sizeof v)) { mh_copy(c.key, sizeof c.key, v); n++; }
  if (mh_jget(json, "tr", v, sizeof v)) { c.tr = strcmp(v, "mqtt") == 0 ? 1 : 0; n++; }
  if (mh_jget(json, "url", v, sizeof v)) { mh_copy(c.url, sizeof c.url, v); n++; }
  if (mh_jget(json, "bh", v, sizeof v)) { mh_copy(c.mqHost, sizeof c.mqHost, v); n++; }
  if (mh_jget(json, "bp", v, sizeof v)) { int p = atoi(v); if (p > 0 && p < 65536) c.mqPort = p; n++; }
  if (mh_jget(json, "bu", v, sizeof v)) { mh_copy(c.mqUser, sizeof c.mqUser, v); n++; }
  if (mh_jget(json, "bw", v, sizeof v)) { mh_copy(c.mqPass, sizeof c.mqPass, v); n++; }
  if (mh_jget(json, "demo", v, sizeof v)) { c.demo = atoi(v) ? 1 : 0; n++; }
  if (mh_jget(json, "oil", v, sizeof v)) { c.sOil = atoi(v) ? 1 : 0; n++; }
  if (mh_jget(json, "cur", v, sizeof v)) { c.sCur = atoi(v) ? 1 : 0; n++; }
  if (mh_jget(json, "vib", v, sizeof v)) { c.sVib = atoi(v) ? 1 : 0; n++; }
  return n;
}
