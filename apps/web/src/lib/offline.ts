'use client';
/** Penyimpanan offline (IndexedDB, tanpa pustaka): paket data lapangan + antrean kiriman yang disinkronkan saat ada sinyal. */
import { api, ApiError } from './api';

export interface Pack { user: { name: string; role: string; plants: string[]; modules: number[] }; generatedAt: string; templates: any[]; assets: any[]; workOrders: any[] }
export interface OutboxItem { id?: number; kind: 'inspection' | 'wo_start' | 'wo_finish'; label: string; payload: any; createdAt: string; status: 'pending' | 'failed'; error?: string }

const DB = 'mainthub-field';
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await open();
  return new Promise((res, rej) => { const t = d.transaction(store, mode); const q = fn(t.objectStore(store)); t.oncomplete = () => { d.close(); res(q.result); }; t.onerror = () => { d.close(); rej(t.error); }; t.onabort = () => { d.close(); rej(t.error); }; });
}
export const savePack = (p: Pack) => tx('kv', 'readwrite', (s) => s.put(p, 'pack')).then(() => undefined);
export const loadPack = () => tx<Pack | undefined>('kv', 'readonly', (s) => s.get('pack'));
export const listOutbox = () => tx<OutboxItem[]>('outbox', 'readonly', (s) => s.getAll());
export const enqueue = (i: Omit<OutboxItem, 'id' | 'createdAt' | 'status'>) => tx('outbox', 'readwrite', (s) => s.add({ ...i, createdAt: new Date().toISOString(), status: 'pending' })).then(() => undefined);
export const removeOutbox = (id: number) => tx('outbox', 'readwrite', (s) => s.delete(id)).then(() => undefined);
const putOutbox = (i: OutboxItem) => tx('outbox', 'readwrite', (s) => s.put(i)).then(() => undefined);

/** Galat jaringan (fetch gagal) beda dengan jawaban server: hanya yang pertama boleh diantre. */
export const isNetworkError = (e: unknown) => !(e instanceof ApiError);

async function woStatus(id: string): Promise<string | null> { try { return (await api(`/work-orders/${id}`)).status; } catch { return null; } }

/** Kirim antrean berurutan. Berhenti di galat jaringan/server (dicoba lagi nanti); galat 4xx ditandai gagal agar pengguna melihat alasannya. */
export async function syncOutbox(): Promise<{ sent: number; failed: number; left: number; needLogin: boolean }> {
  const items = (await listOutbox()).filter((i) => i.status === 'pending').sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  let sent = 0, failed = 0, needLogin = false;
  for (const it of items) {
    try {
      if (it.kind === 'inspection') await api('/inspections', { method: 'POST', body: it.payload });
      else if (it.kind === 'wo_start') await api(`/work-orders/${it.payload.woId}/start`, { method: 'POST' });
      else await api(`/work-orders/${it.payload.woId}/finish`, { method: 'POST', body: it.payload.body });
      await removeOutbox(it.id!); sent++;
    } catch (e: any) {
      if (!(e instanceof ApiError)) break;                          // jaringan putus: berhenti, coba lagi nanti
      if (e.status === 401) { needLogin = true; break; }
      if (e.status >= 500 || e.status === 408 || e.status === 429) break;
      if (it.kind !== 'inspection') {                               // kirim ulang setelah sukses sebenarnya (balasan hilang): status sudah maju = berhasil
        const st = await woStatus(it.payload.woId);
        if ((it.kind === 'wo_start' && ['progress', 'done', 'closed'].includes(st ?? '')) || (it.kind === 'wo_finish' && ['done', 'closed'].includes(st ?? ''))) { await removeOutbox(it.id!); sent++; continue; }
      }
      await putOutbox({ ...it, status: 'failed', error: e.message }); failed++;
    }
  }
  const left = (await listOutbox()).filter((i) => i.status === 'pending').length;
  return { sent, failed, left, needLogin };
}

/** Kirim inspeksi; bila jaringan tidak ada, simpan di antrean (clientUid mencegah duplikat saat dikirim ulang). */
export async function submitInspection(payload: any, label: string): Promise<{ queued: boolean; result?: any }> {
  try { return { queued: false, result: await api('/inspections', { method: 'POST', body: payload }) }; }
  catch (e) { if (!isNetworkError(e)) throw e; await enqueue({ kind: 'inspection', label, payload }); return { queued: true }; }
}

/** Minta service worker menyimpan halaman /field agar bisa dibuka tanpa sinyal. */
export async function cacheFieldPage(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration(); if (!reg?.active) return false;
  reg.active.postMessage({ type: 'cache-field' }); return true;
}
