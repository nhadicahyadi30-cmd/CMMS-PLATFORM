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
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700;800&display=swap" />
      </head>
      <body>{children}<PwaRegister /></body>
    </html>
  );
}
