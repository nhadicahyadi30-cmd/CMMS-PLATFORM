import type { ReactNode } from 'react';
export default function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block text-slate-600">{label}</span>{children}</label>;
}
