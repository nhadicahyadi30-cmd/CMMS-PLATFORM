import './globals.css';
import type { ReactNode } from 'react';
export const metadata = { title: { default: 'MaintHub — Predict. Maintain. Optimize. Connected.', template: '%s · MaintHub' }, description: 'CMMS platform for factories: work orders, preventive maintenance, spare parts, KPIs, RCA, energy, and an AI assistant.' };
export default function Root({ children }: { children: ReactNode }) {
  return <html lang="id"><body>{children}</body></html>;
}
