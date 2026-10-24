'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { GA_MEASUREMENT_ID, trackPageview } from '@/lib/gtag';

// only the production build reports to Google Analytics, so local dev-server visits are not counted
const ENABLED = process.env.NODE_ENV === 'production' && !!GA_MEASUREMENT_ID;

export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!ENABLED) return;
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const url = `${pathname}${search}`;
    trackPageview(url);
  }, [pathname]);

  if (!ENABLED) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}');
        `}
      </Script>
    </>
  );
}


