const STEPS: [string, string][] = [['waiting', 'Diajukan'], ['approved', 'Disetujui'], ['assigned', 'Ditugaskan'], ['progress', 'Dikerjakan'], ['done', 'Selesai'], ['closed', 'Ditutup']];

/** Penunjuk tahap Work Order: sekilas terlihat sudah sampai mana. */
export default function WoStepper({ status }: { status: string }) {
  if (status === 'rejected') return <div className="rounded-lg border-[1.5px] border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800" role="status">WO ini ditolak.</div>;
  const cur = Math.max(0, STEPS.findIndex(([k]) => k === status));
  return (
    <ol className="flex items-start" aria-label="Tahap Work Order">
      {STEPS.map(([k, label], i) => {
        const done = i < cur; const now = i === cur;
        return (
          <li key={k} className="relative flex min-w-0 flex-1 flex-col items-center gap-1 text-center" aria-current={now ? 'step' : undefined}>
            {i > 0 && <span className={`absolute right-1/2 top-3 -z-0 h-0.5 w-full ${i <= cur ? 'bg-ink-900' : 'bg-stone-300'}`} aria-hidden="true" />}
            <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[0.7rem] font-bold ${done ? 'border-ink-900 bg-ink-900 text-white' : now ? 'border-ink-900 bg-yellow-400 text-ink-900 ring-4 ring-yellow-400/30' : 'border-stone-300 bg-white text-stone-400'}`}>{done ? '✓' : i + 1}</span>
            <span className={`max-w-full truncate px-0.5 text-[0.7rem] leading-tight ${now ? 'font-bold text-ink-900' : done ? 'font-medium text-slate-700' : 'text-slate-500'}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
