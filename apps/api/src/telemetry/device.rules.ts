import { randomBytes } from 'node:crypto';
import { z } from 'zod';

/** Aturan perangkat ESP32: sensor bawaan, pembuatan config.h, heartbeat, status koneksi. */
export const SENSOR_DEFS = {
  oil_temp:      { key: 'oilTemp',   tag: 'oil_temp',      name: 'Suhu oli',        unit: '°C', kind: 'gauge',    warnHigh: 85,   critHigh: 95,   minValid: -20, maxValid: 150, confirm: 3 },
  motor_current: { key: 'current',   tag: 'motor_current', name: 'Arus motor',      unit: 'A',  kind: 'gauge',    warnHigh: null, critHigh: null, minValid: 0,   maxValid: 1000, confirm: 3 },
  vibration_rms: { key: 'vibration', tag: 'vibration_rms', name: 'Getaran (RMS)',   unit: 'g',  kind: 'gauge',    warnHigh: null, critHigh: null, minValid: 0,   maxValid: 16, confirm: 3 },
  running_hours: { key: 'runhours',  tag: 'running_hours', name: 'Running hour',    unit: 'jam', kind: 'runhours', warnHigh: null, critHigh: null, minValid: null, maxValid: null, confirm: 1 },
} as const;
export type SensorTag = keyof typeof SENSOR_DEFS;

/** Jalur kirim perangkat: http = langsung ke MaintHub, mqtt = lewat broker (Mosquitto) + Node-RED. */
const TransportFields = {
  serverUrl: z.string().trim().max(200).default(''),
  demo: z.boolean().default(false),
  transport: z.enum(['http', 'mqtt']).default('http'),
  mqttHost: z.string().trim().max(80).default(''),
  mqttPort: z.number().int().min(1).max(65535).default(1883),
  mqttUser: z.string().trim().max(48).default(''),
  mqttPass: z.string().max(64).default(''),
};
const needTransport = (v: { transport: string; serverUrl: string; mqttHost: string }, ctx: z.RefinementCtx) => {
  if (v.transport === 'http' && !v.serverUrl) ctx.addIssue({ code: 'custom', path: ['serverUrl'], message: 'Alamat server wajib untuk jalur HTTP' });
  if (v.transport === 'mqtt' && !v.mqttHost) ctx.addIssue({ code: 'custom', path: ['mqttHost'], message: 'Alamat broker MQTT wajib untuk jalur MQTT' });
};
export const DeviceCreate = z.object({
  assetId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  sensors: z.object({ oilTemp: z.boolean().default(true), current: z.boolean().default(true), vibration: z.boolean().default(false) }).default({ oilTemp: true, current: true, vibration: false }),
  ...TransportFields,
}).superRefine(needTransport);
export const RotateDto = z.object({ ...TransportFields }).superRefine(needTransport);

/** Tag yang akan dibuat/dipakai: running hour selalu ada. */
export function selectedTags(s: { oilTemp: boolean; current: boolean; vibration: boolean }): SensorTag[] {
  const t: SensorTag[] = []; if (s.oilTemp) t.push('oil_temp'); if (s.current) t.push('motor_current'); if (s.vibration) t.push('vibration_rms'); t.push('running_hours'); return t;
}

export const newDeviceId = () => `esp-${randomBytes(3).toString('hex')}`;

/** Ambil origin http(s) dari alamat yang diketik; tolak skema lain. Peringatkan bila alamat tidak terjangkau dari ESP32. */
export function normalizeServerUrl(raw: string): { origin: string; warnings: string[] } {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) throw new Error('Alamat server harus http:// atau https://');
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`); } catch { throw new Error('Alamat server tidak valid'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Alamat server harus http:// atau https://');
  const warnings: string[] = [];
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') warnings.push('Alamat localhost tidak bisa dijangkau dari ESP32. Ganti dengan IP laptop/server di jaringan yang sama (mis. 192.168.1.50).');
  if (u.protocol === 'http:') warnings.push('http:// tidak terenkripsi: pakai hanya di jaringan internal tertutup.');
  return { origin: u.origin, warnings };
}

const cs = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');

export interface Transport { transport?: 'http' | 'mqtt'; mqttHost?: string; mqttPort?: number; mqttUser?: string; mqttPass?: string }
export interface ConfigInput extends Transport { origin: string; key: string; asset: string; plant: string; deviceId: string; tags: SensorTag[]; demo?: boolean }

/** "Kode konfigurasi": satu baris JSON yang ditempel di portal Wi-Fi perangkat (atau `cfg <kode>` di serial) sehingga firmware yang sama dapat dipakai semua perangkat tanpa flash ulang. */
export function renderProvision(i: ConfigInput): string {
  const mqtt = i.transport === 'mqtt';
  const o: Record<string, string | number> = { mh: 1, id: i.deviceId, asset: i.asset, plant: i.plant, key: i.key, tr: mqtt ? 'mqtt' : 'http', demo: i.demo ? 1 : 0,
    oil: i.tags.includes('oil_temp') ? 1 : 0, cur: i.tags.includes('motor_current') ? 1 : 0, vib: i.tags.includes('vibration_rms') ? 1 : 0 };
  if (mqtt) { o.bh = i.mqttHost ?? ''; o.bp = i.mqttPort ?? 1883; o.bu = i.mqttUser ?? ''; o.bw = i.mqttPass ?? ''; }
  else o.url = `${i.origin}/api/ingest/readings`;
  return JSON.stringify(o);
}
/** Isi config.h lengkap yang siap di-flash (SSID/password diisi di tempat atau lewat perintah serial `wifi`). */
export function renderConfig(i: ConfigInput): string {
  const has = (t: SensorTag) => (i.tags.includes(t) ? 1 : 0);
  return `// Dibuat otomatis oleh MaintHub. Berisi API key: JANGAN dibagikan dan JANGAN di-commit ke Git.
#pragma once

// ---- Jaringan (isi, atau set tanpa flash ulang lewat Serial Monitor: wifi NAMA PASSWORD) ----
#define WIFI_SSID        "NAMA_WIFI_PABRIK"
#define WIFI_PASS        "PASSWORD_WIFI"

// ---- MaintHub ----
#define MH_URL           "${i.origin ? cs(i.origin) + '/api/ingest/readings' : ''}"
#define MH_API_KEY       "${cs(i.key)}"
#define MH_ASSET         "${cs(i.asset)}"
#define MH_PLANT         "${cs(i.plant)}"
#define DEVICE_ID        "${cs(i.deviceId)}"
// Jalur kirim: 0 = HTTP langsung ke MaintHub (MH_URL), 1 = MQTT ke broker lalu Node-RED meneruskan ke MaintHub
#define MH_TRANSPORT     ${i.transport === 'mqtt' ? 1 : 0}
#define MQTT_HOST        "${cs(i.mqttHost ?? '')}"
#define MQTT_PORT        ${i.mqttPort ?? 1883}
#define MQTT_USER        "${cs(i.mqttUser ?? '')}"
#define MQTT_PASS        "${cs(i.mqttPass ?? '')}"
// HTTPS: untuk memverifikasi server, definisikan MH_ROOT_CA berisi sertifikat root (PEM). Tanpa ini koneksi tetap terenkripsi tetapi server tidak diverifikasi.
// #define MH_ROOT_CA "-----BEGIN CERTIFICATE-----\\n...\\n-----END CERTIFICATE-----\\n"

// ---- Tag sensor (sudah terdaftar di MaintHub) ----
#define TAG_OIL_TEMP     "oil_temp"
#define TAG_CURRENT      "motor_current"
#define TAG_VIBRATION    "vibration_rms"
#define TAG_RUNHOURS     "running_hours"

// ---- Mode demo: 1 = kirim DATA DUMMY (tanpa sensor), 0 = baca sensor sungguhan ----
#define DEMO_MODE        ${i.demo ? 1 : 0}

// ---- Sensor yang terpasang (0 = tidak dipakai) ----
#define USE_DS18B20      ${has('oil_temp')}
#define USE_CURRENT      ${has('motor_current')}
#define USE_MPU6050      ${has('vibration_rms')}

// ---- Pin ----
#define PIN_ONEWIRE      4
#define PIN_CURRENT_ADC  34
#define PIN_RUN          27    // input status jalan lewat optocoupler; -1 = deteksi dari arus
#define RUN_ACTIVE_LEVEL LOW
#define PIN_I2C_SDA      21
#define PIN_I2C_SCL      22
#define PIN_PORTAL       0     // tombol BOOT: tahan 3 detik untuk membuka portal konfigurasi; -1 = nonaktif

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
`;
}

// ---------- Heartbeat ----------
export const HeartbeatDto = z.object({
  id: z.string().regex(/^[A-Za-z0-9_.-]{3,40}$/),
  fw: z.string().max(20).optional(),
  ip: z.string().max(45).optional(),
  rssi: z.number().int().min(-127).max(0).optional(),
  uptime: z.number().int().min(0).max(4_000_000_000).optional(),
  queue: z.number().int().min(0).max(1_000_000).optional(),
  heap: z.number().int().min(0).max(1_000_000).optional(),
  boots: z.number().int().min(0).max(1_000_000_000).optional(),
});
export type Heartbeat = z.infer<typeof HeartbeatDto>;
/** Heartbeat yang rusak tidak boleh menolak pembacaan: kembalikan null. */
export function parseHeartbeat(v: unknown): Heartbeat | null { const r = HeartbeatDto.safeParse(v); return r.success ? r.data : null; }

export type DevConn = 'online' | 'delayed' | 'offline' | 'waiting';
/** online ≤3 mnt, tertunda ≤15 mnt, offline selebihnya; waiting = belum pernah kirim data. */
export function devConn(lastSeen: number | null, now: number): DevConn {
  if (lastSeen == null) return 'waiting';
  const a = now - lastSeen; return a <= 3 * 60_000 ? 'online' : a <= 15 * 60_000 ? 'delayed' : 'offline';
}
export type Signal = 'good' | 'fair' | 'weak' | 'unknown';
export function signalOf(rssi: number | null | undefined): Signal { if (rssi == null) return 'unknown'; return rssi >= -60 ? 'good' : rssi >= -75 ? 'fair' : 'weak'; }
