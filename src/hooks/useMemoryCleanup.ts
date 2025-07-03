import { useEffect, useRef } from 'react';

interface MemoryCleanupOptions {
  enabled?: boolean;
  cleanupDelay?: number;
}

export function useMemoryCleanup(options: MemoryCleanupOptions = {}) {
  const { enabled = true, cleanupDelay = 30000 } = options;
  const cleanupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActiveRef = useRef(true);

  const scheduleCleanup = () => {
    if (!enabled) return;

    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
    }

    cleanupTimeoutRef.current = setTimeout(() => {
      if (!isActiveRef.current) return;

      if (typeof window !== 'undefined' && 'gc' in window) {
        try {
          (window as { gc?: () => void }).gc?.();
        } catch {}
      }

      const images = document.querySelectorAll('img[src*="data:"]');
      images.forEach(img => {
        const element = img as HTMLImageElement;
        if (element.src.length > 100000) {
          element.src = '';
        }
      });

      const largeTextElements = document.querySelectorAll('[data-large-content="true"]');
      largeTextElements.forEach(element => {
        const htmlElement = element as HTMLElement;
        if (htmlElement.textContent && htmlElement.textContent.length > 50000) {
          htmlElement.removeAttribute('data-cached-content');
        }
      });
    }, cleanupDelay);
  };

  const markAsActive = () => {
    isActiveRef.current = true;
    scheduleCleanup();
  };

  const markAsInactive = () => {
    isActiveRef.current = false;
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        markAsInactive();
      } else {
        markAsActive();
      }
    };

    const handleBeforeUnload = () => {
      markAsInactive();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    scheduleCleanup();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      markAsInactive();
    };
  }, [enabled, cleanupDelay]);

  return {
    scheduleCleanup,
    markAsActive,
    markAsInactive,
  };
}
