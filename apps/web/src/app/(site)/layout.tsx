import type { ReactNode } from 'react';
import SiteHeader from '@/components/site/SiteHeader';
import SiteFooter from '@/components/site/SiteFooter';
import SnapMode from '@/components/site/SnapMode';

const THEME_INIT = "try{var t=localStorage.getItem('mh-site-theme');if(!t)t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.dataset.siteTheme=t}catch(e){}";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
    <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
    <div className="site-root min-h-screen bg-[#07090d] text-stone-100 selection:bg-teal-400/30">
      <SnapMode />
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
    </>
  );
}
