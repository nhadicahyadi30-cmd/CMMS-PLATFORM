import { useId } from 'react';

/** Lambang MaintHub: heksagon (mur/baut perawatan) berisi huruf M yang titik tengahnya adalah "hub". */
export function LogoMark({ size = 32 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <defs><linearGradient id={id} x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#2f7cf0" /><stop offset="1" stopColor="#18d1c4" /></linearGradient></defs>
      <path d="M32 4.5 55 18v28L32 59.5 9 46V18Z" fill="#0b1426" stroke={`url(#${id})`} strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M19.5 43V23.5L32 35.5 44.5 23.5V43" fill="none" stroke={`url(#${id})`} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="35.5" r="3.6" fill="#18d1c4" />
    </svg>
  );
}

export const TAGLINE = 'Rawat Cerdas. Produksi Tanpa Henti.';

export default function Logo({ size = 32, tagline = false, dark = true }: { size?: number; tagline?: boolean; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <div className="leading-none">
        <div className={`text-[1.15rem] font-semibold tracking-tight ${dark ? 'text-white' : 'text-slate-900'}`}>Maint<span className="text-cyan-400">Hub</span></div>
        {tagline && <div className={`mt-1 text-[0.62rem] uppercase tracking-[0.14em] ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{TAGLINE}</div>}
      </div>
    </div>
  );
}
