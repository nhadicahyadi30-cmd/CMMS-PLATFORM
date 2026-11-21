import { PERMIT_COLOR, PERMIT_LABEL } from '@/lib/safety';
export default function PermitBadge({ s }: { s: string }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${PERMIT_COLOR[s] ?? 'bg-slate-100'}`}>{PERMIT_LABEL[s] ?? s}</span>;
}
