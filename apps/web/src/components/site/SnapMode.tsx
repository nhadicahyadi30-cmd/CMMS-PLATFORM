'use client';
import { useEffect } from 'react';

/** Mengaktifkan scroll-snap lembut hanya di website publik (tidak mengganggu aplikasi). */
export default function SnapMode() {
  useEffect(() => { const h = document.documentElement; h.classList.add('snap-site'); return () => h.classList.remove('snap-site'); }, []);
  return null;
}
