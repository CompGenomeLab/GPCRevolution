// GA4 helper utilities

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';

declare global {
  interface Window {
    dataLayer: Array<unknown>;
    gtag: (...args: Array<unknown>) => void;
  }
}

export function trackPageview(url: string): void {
  if (!GA_MEASUREMENT_ID) return;
  if (typeof window === 'undefined') return;
  if (typeof window.gtag !== 'function') return;

  window.gtag('config', GA_MEASUREMENT_ID, {
    page_path: url,
  });
}

export function trackEvent(
  action: string,
  params: Record<string, unknown> = {}
): void {
  if (!GA_MEASUREMENT_ID) return;
  if (typeof window === 'undefined') return;
  if (typeof window.gtag !== 'function') return;

  window.gtag('event', action, params);
}


