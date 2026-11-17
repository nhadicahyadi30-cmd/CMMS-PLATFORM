'use client';
export interface User { sub: string; org: string; role: 'admin' | 'supervisor' | 'planner' | 'technician'; name: string; plants: string[]; all: boolean; modules: number[] }

let token: string | null = null;
let me: User | null = null;
export const getUser = () => me;

async function authCall(path: 'login' | 'refresh', body?: unknown): Promise<User | null> {
  const r = await fetch(`/auth/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) { token = null; me = null; if (path === 'login') throw new Error((await r.json().catch(() => ({}))).message ?? 'Login gagal'); return null; }
  const d = await r.json(); token = d.accessToken; me = d.user; return me;
}
export const login = (org: string, username: string, password: string) => authCall('login', { org, username, password });
export const bootstrap = () => authCall('refresh');
export async function logout() { await fetch('/auth/logout', { method: 'POST' }); token = null; me = null; }

export class ApiError extends Error { constructor(public status: number, msg: string, public details?: any) { super(msg); } }

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}, retry = true): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (r.status === 401 && retry && (await bootstrap())) return api<T>(path, init, false);
  if (r.status === 204) return undefined as T;
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, typeof d.message === 'string' ? d.message : d.message?.message ?? (r.status >= 502 && r.status <= 504 ? `Server API tidak bisa dihubungi (HTTP ${r.status}). Jalankan: docker compose ps` : `Terjadi kesalahan (HTTP ${r.status})`), d);
  return d as T;
}

/** Unggah berkas sebagai badan mentah (server memvalidasi isi berkas, bukan ekstensi). */
export async function uploadFile<T = any>(path: string, file: File, retry = true): Promise<T> {
  const r = await fetch(`/api${path}`, { method: 'PUT', headers: { 'content-type': file.type || 'application/octet-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: file });
  if (r.status === 401 && retry && (await bootstrap())) return uploadFile<T>(path, file, false);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, typeof d.message === 'string' ? d.message : d.message?.message ?? 'Unggah gagal');
  return d as T;
}

/** Ambil berkas terproteksi sebagai object URL (butuh header Authorization, jadi tidak bisa lewat <img src> langsung). */
export async function fetchBlobUrl(path: string, retry = true): Promise<string> {
  const r = await fetch(`/api${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (r.status === 401 && retry && (await bootstrap())) return fetchBlobUrl(path, false);
  if (!r.ok) throw new ApiError(r.status, 'Berkas tidak bisa dimuat');
  return URL.createObjectURL(await r.blob());
}

/** Unduh berkas dari endpoint terproteksi (CSV laporan). */
export async function downloadFile(path: string, retry = true): Promise<void> {
  const r = await fetch(`/api${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (r.status === 401 && retry && (await bootstrap())) return downloadFile(path, false);
  if (!r.ok) throw new ApiError(r.status, 'Unduhan gagal');
  const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? 'laporan.csv';
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Unduh berkas (mis. PDF) dari endpoint POST yang memakai token akses. */
export async function apiDownload(path: string, body: unknown, retry = true): Promise<{ blob: Blob; filename: string }> {
  const r = await fetch(`/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  if (r.status === 401 && retry && (await bootstrap())) return apiDownload(path, body, false);
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new ApiError(r.status, typeof d.message === 'string' ? d.message : d.message?.message ?? 'Gagal mengunduh', d); }
  const cd = r.headers.get('content-disposition') ?? ''; const m = /filename="?([^";]+)"?/.exec(cd);
  return { blob: await r.blob(), filename: m?.[1] ?? 'laporan.pdf' };
}
