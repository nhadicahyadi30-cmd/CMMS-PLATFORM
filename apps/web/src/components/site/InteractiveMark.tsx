'use client';
import { KeyboardEvent, useState } from 'react';

const TEAL = '#12c4b4', BLUE = '#2f6bff', BLUE2 = '#1f47c8';

/** Lambang interaktif: tiap sisi kubus mewakili satu kata tagline (Predict = atas, Maintain = kiri, Optimize = kanan, Connected = antena). */
export default function InteractiveMark({ active, onActive, onBurst, burst }: { active: number | null; onActive: (i: number | null) => void; onBurst: () => void; burst: number }) {
  const [spin] = useState(() => Math.random());
  const dim = (i: number) => (active !== null && active !== i ? 0.38 : 1);
  const lift = (i: number, x: number, y: number) => (active === i ? `translate(${x}px, ${y}px)` : 'translate(0, 0)');
  const key = (i: number) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActive(i); onBurst(); } };
  const face = (i: number, label: string) => ({
    role: 'button' as const, tabIndex: 0, 'aria-label': label, 'aria-pressed': active === i,
    onPointerEnter: () => onActive(i), onFocus: () => onActive(i), onClick: onBurst, onKeyDown: key(i),
    style: { cursor: 'pointer', outline: 'none' },
  });
  const g = (i: number, x: number, y: number) => ({ style: { transform: lift(i, x, y), opacity: dim(i), transition: 'transform .55s cubic-bezier(.2,.8,.2,1), opacity .4s', filter: active === i ? 'drop-shadow(0 0 14px rgba(18,196,180,.55))' : 'none' } });

  return (
    <svg viewBox="180 0 270 300" className="h-full w-full overflow-visible" role="group" aria-label="MaintHub logo: Predict, Maintain, Optimize, Connected">
      <defs><radialGradient id="mh-core" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor={TEAL} stopOpacity=".35" /><stop offset="1" stopColor={TEAL} stopOpacity="0" /></radialGradient></defs>

      {/* orbit data nodes */}
      <g aria-hidden="true" style={{ opacity: 0.9 }}>
        <ellipse cx="315" cy="190" rx="128" ry="40" fill="none" stroke="rgba(255,255,255,.08)" />
        {[0, 1, 2].map((k) => (
          <circle key={k} r={k === 0 ? 3.2 : 2.4} fill={k === 1 ? BLUE : TEAL}>
            <animateMotion dur={`${9 + k * 3 + spin}s`} repeatCount="indefinite" begin={`-${k * 3}s`} path="M187 190 a128 40 0 1 0 256 0 a128 40 0 1 0 -256 0" />
          </circle>))}
      </g>
      <circle cx="315" cy="185" r="110" fill="url(#mh-core)" aria-hidden="true" />

      {/* Connected: antenna + signal (index 3) */}
      <g {...face(3, 'Connected')} {...g(3, 0, -10)}>
        <rect x="290" y="20" width="50" height="80" fill="transparent" />
        <path d="M302 54.1A17 17 0 0 1 328 54.1" fill="none" stroke={TEAL} strokeWidth="4.5" strokeLinecap="round" className="mh-wave" />
        <path d="M294.3 47.6A27 27 0 0 1 335.7 47.6" fill="none" stroke="#0c7468" strokeWidth="4.5" strokeLinecap="round" className="mh-wave mh-wave2" />
        {active === 3 && <path d="M286 41A38 38 0 0 1 344 41" fill="none" stroke={TEAL} strokeWidth="3.5" strokeLinecap="round" opacity=".7" className="mh-wave mh-wave3" />}
        <path d="M315 73V90" stroke={TEAL} strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="315" cy="65" r="8" fill={TEAL} />
      </g>

      {/* signal burst saat diklik */}
      <g key={burst} aria-hidden="true" style={{ pointerEvents: 'none' }}>
        {burst > 0 && [0, 0.25].map((d) => <circle key={d} cx="315" cy="65" r="8" fill="none" stroke={TEAL} strokeWidth="2" className="mh-burst" style={{ animationDelay: `${d}s` }} />)}
      </g>

      {/* Predict: sisi atas (0) */}
      <g {...face(0, 'Predict')} {...g(0, 0, -14)}><path d="M240 130 315 88 390 130 315 170Z" fill={TEAL} /></g>
      {/* Maintain: sisi kiri (1) */}
      <g {...face(1, 'Maintain')} {...g(1, -12, 8)}><path d="M231 136 309 181V268L231 224Z" fill={BLUE} /></g>
      {/* Optimize: sisi kanan (2) */}
      <g {...face(2, 'Optimize')} {...g(2, 12, 8)}><path d="M321 181 399 136V224L321 268Z" fill={BLUE2} /></g>
    </svg>
  );
}
