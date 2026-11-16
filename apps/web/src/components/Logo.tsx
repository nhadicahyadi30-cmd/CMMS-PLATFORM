/** Lambang MaintHub: kubus isometrik (modul-modul yang terhubung) dengan antena sensor — prediksi berbasis data. */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg height={size} width={(size * 180) / 250} viewBox="222 26 180 250" aria-hidden="true" className={`mh-logo shrink-0 overflow-visible ${className}`}>
      <path d="M302 54.1A17 17 0 0 1 328 54.1" fill="none" stroke="#12c4b4" strokeWidth="4.5" strokeLinecap="round" className="mh-wave" />
      <path d="M294.3 47.6A27 27 0 0 1 335.7 47.6" fill="none" stroke="#0c7468" strokeWidth="4.5" strokeLinecap="round" className="mh-wave mh-wave2" />
      <path d="M315 73V90" stroke="#12c4b4" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="315" cy="65" r="8" fill="#12c4b4" />
      <path d="M240 130 315 88 390 130 315 170Z" fill="#12c4b4" className="f f-top" />
      <path d="M231 136 309 181V268L231 224Z" fill="#2f6bff" className="f f-left" />
      <path d="M321 181 399 136V224L321 268Z" fill="#1f47c8" className="f f-right" />
    </svg>
  );
}

export const TAGLINE = 'Predict. Maintain. Optimize. Connected.';
export const TAGLINE_WORDS = ['Predict.', 'Maintain.', 'Optimize.', 'Connected.'];

export default function Logo({ size = 32, tagline = false, dark = true, compact = false }: { size?: number; tagline?: boolean; dark?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <div className="leading-none">
        <div className={`text-[1.2rem] font-medium tracking-tight ${dark ? 'text-stone-100' : 'text-slate-900'}`}>Maint<span className="text-teal-400">Hub</span></div>
        {tagline && <div className={`${compact ? 'max-sm:hidden ' : ''}mt-1.5 text-[0.6rem] uppercase tracking-[0.18em] ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{TAGLINE}</div>}
      </div>
    </div>
  );
}
