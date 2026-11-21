import './globals.css';
import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import PwaRegister from '@/components/PwaRegister';
export const metadata = {
  title: { default: 'MaintHub — Predict. Maintain. Optimize. Connected.', template: '%s · MaintHub' },
  description: 'CMMS platform for factories: work orders, preventive maintenance, spare parts, KPIs, RCA, energy, and an AI assistant.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'MaintHub', statusBarStyle: 'black-translucent' as const },
  icons: { apple: '/icons/apple-touch-icon.png' },
};
export const viewport: Viewport = { themeColor: '#070d1a', width: 'device-width', initialScale: 1 };
export default function Root({ children }: { children: ReactNode }) {
  return <html lang="id"><body>{children}<PwaRegister /></body></html>;
}
