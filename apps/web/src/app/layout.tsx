import './globals.css';
import type { ReactNode } from 'react';
export const metadata = { title: { default: 'MaintHub — ' + 'Rawat Cerdas. Produksi Tanpa Henti.', template: '%s · MaintHub' }, description: 'Platform CMMS untuk pabrik: work order, preventive, sparepart, KPI, RCA, energi, dan asisten AI.' };
export default function Root({ children }: { children: ReactNode }) {
  return <html lang="id"><body>{children}</body></html>;
}
