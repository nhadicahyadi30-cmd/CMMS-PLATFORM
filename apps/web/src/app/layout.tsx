import './globals.css';
import type { ReactNode } from 'react';
export const metadata = { title: { default: 'MaintHub — Predict. Maintain. Optimize. Connected.', template: '%s · MaintHub' }, description: 'Platform CMMS untuk pabrik: work order, preventive, sparepart, KPI, RCA, energi, dan asisten AI.' };
export default function Root({ children }: { children: ReactNode }) {
  return <html lang="id"><body>{children}</body></html>;
}
