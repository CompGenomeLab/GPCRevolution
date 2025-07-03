'use client';

import { Suspense, ReactNode } from 'react';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { ErrorBoundary } from './ErrorBoundary';

interface LazySectionProps {
  children: ReactNode;
  fallback?: ReactNode;
  placeholder?: ReactNode;
  errorTitle?: string;
}

const DefaultSkeleton = () => (
  <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-48 bg-muted rounded"></div>
      <div className="h-32 w-full bg-muted rounded"></div>
    </div>
  </div>
);

export function LazySection({
  children,
  fallback = <DefaultSkeleton />,
  placeholder,
  errorTitle,
}: LazySectionProps) {
  const { elementRef, hasIntersected } = useIntersectionObserver(0.1);

  return (
    <div ref={elementRef}>
      {hasIntersected ? (
        <ErrorBoundary title={errorTitle}>
          <Suspense fallback={fallback}>{children}</Suspense>
        </ErrorBoundary>
      ) : (
        placeholder || fallback
      )}
    </div>
  );
}
