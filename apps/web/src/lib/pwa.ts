'use client';
/** Menyimpan prompt pemasangan PWA dari browser (Chrome/Edge Android & desktop). */
let deferred: any = null; const subs = new Set<() => void>();
export const canInstall = () => !!deferred;
export const onInstallChange = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false; deferred.prompt(); const r = await deferred.userChoice; deferred = null; subs.forEach((f) => f()); return r.outcome === 'accepted';
}
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; subs.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; subs.forEach((f) => f()); });
}
