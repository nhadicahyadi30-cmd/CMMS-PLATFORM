'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const TOKEN = /\/a\/([a-f0-9]{32})(?:[/?#]|$)/i;
const parse = (t: string): string | null => { const m = TOKEN.exec(t); if (m) return m[1].toLowerCase(); return /^[a-f0-9]{32}$/i.test(t.trim()) ? t.trim().toLowerCase() : null; };

/** Pemindai QR aset memakai kamera. Memakai BarcodeDetector bila ada, jika tidak memakai jsQR (iPhone/Firefox). */
export default function ScanPage() {
  const r = useRouter(); const video = useRef<HTMLVideoElement>(null); const [msg, setMsg] = useState('Mengarahkan kamera…'); const [err, setErr] = useState(''); const [on, setOn] = useState(false);

  useEffect(() => {
    if (!on) return; let stream: MediaStream | null = null; let stop = false; let raf = 0;
    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setErr('Kamera hanya bisa dipakai lewat HTTPS atau localhost. Alternatif: buka aplikasi Kamera bawaan HP dan arahkan ke QR, lalu ketuk tautannya.'); setOn(false); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        const v = video.current!; v.srcObject = stream; await v.play(); setMsg('Arahkan ke QR pada label mesin');
        const BD = (window as any).BarcodeDetector; const det = BD ? new BD({ formats: ['qr_code'] }) : null;
        const jsQR = det ? null : (await import('jsqr')).default; const cv = document.createElement('canvas'); const cx = cv.getContext('2d', { willReadFrequently: true })!;
        const loop = async () => {
          if (stop) return;
          try {
            let text: string | null = null;
            if (v.readyState >= 2) {
              if (det) { const c = await det.detect(v); text = c[0]?.rawValue ?? null; }
              else if (jsQR) { cv.width = v.videoWidth; cv.height = v.videoHeight; cx.drawImage(v, 0, 0); const d = cx.getImageData(0, 0, cv.width, cv.height); text = jsQR(d.data, d.width, d.height)?.data ?? null; }
            }
            if (text) { const tk = parse(text); if (tk) { stop = true; r.push(`/a/${tk}`); return; } setMsg('QR ini bukan label aset MaintHub'); }
          } catch { /* frame gagal dibaca: lanjut */ }
          raf = window.setTimeout(loop, 250);
        };
        loop();
      } catch (e: any) { setErr(e?.name === 'NotAllowedError' ? 'Izin kamera ditolak. Aktifkan izin kamera untuk situs ini di pengaturan browser.' : 'Kamera tidak bisa dibuka.'); setOn(false); }
    })();
    return () => { stop = true; clearTimeout(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [on, r]);

  return (
    <div className="mx-auto max-w-md space-y-3">
      <h1 className="text-xl font-semibold">Scan Asset QR</h1>
      <p className="text-sm text-slate-600">Pindai label di mesin untuk melihat riwayat, WO yang berjalan, dan melapor kerusakan.</p>
      {err && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">{err}</p>}
      {on ? (<><div className="overflow-hidden rounded-xl bg-black"><video ref={video} className="aspect-square w-full object-cover" playsInline muted /></div><p className="text-center text-sm text-slate-600" aria-live="polite">{msg}</p><button className="btn-ghost w-full" onClick={() => setOn(false)}>Matikan kamera</button></>)
        : <button className="btn w-full py-3" onClick={() => { setErr(''); setOn(true); }}>Buka kamera</button>}
    </div>
  );
}
