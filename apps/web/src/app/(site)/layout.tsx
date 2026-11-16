import type { ReactNode } from 'react';
import SiteHeader from '@/components/site/SiteHeader';
import SiteFooter from '@/components/site/SiteFooter';
import SnapMode from '@/components/site/SnapMode';

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#07090d] text-stone-100 selection:bg-teal-400/30">
      <SnapMode />
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
