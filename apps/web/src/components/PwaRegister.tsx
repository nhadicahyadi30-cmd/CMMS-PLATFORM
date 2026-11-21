'use client';
import { useEffect } from 'react';
import '@/lib/pwa';

/** Mendaftarkan service worker. Hanya jalan di build produksi dan di alamat aman (HTTPS atau localhost). */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => { /* tidak kritis */ });
  }, []);
  return null;
}
