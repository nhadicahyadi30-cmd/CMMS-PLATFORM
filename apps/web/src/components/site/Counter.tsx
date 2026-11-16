'use client';
import { useEffect, useRef, useState } from 'react';

export default function Counter({ to, suffix = '', ms = 1400 }: { to: number; suffix?: string; ms?: number }) {
  const ref = useRef<HTMLSpanElement>(null); const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof IntersectionObserver === 'undefined') { setV(to); return; }
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => { const p = Math.min(1, (t - t0) / ms); setV(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    io.observe(el); return () => io.disconnect();
  }, [to, ms]);
  return <span ref={ref} className="tabular-nums">{v}{suffix}</span>;
}
