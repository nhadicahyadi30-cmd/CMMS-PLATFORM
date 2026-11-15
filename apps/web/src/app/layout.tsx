import './globals.css';
import type { ReactNode } from 'react';
export const metadata = { title: 'MaintainHub CMMS' };
export default function Root({ children }: { children: ReactNode }) {
  return <html lang="id"><body>{children}</body></html>;
}
