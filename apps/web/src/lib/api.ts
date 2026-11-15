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

export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}, retry = true): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (r.status === 401 && retry && (await bootstrap())) return api<T>(path, init, false);
  if (r.status === 204) return undefined as T;
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, typeof d.message === 'string' ? d.message : d.message?.message ?? 'Terjadi kesalahan');
  return d as T;
}
