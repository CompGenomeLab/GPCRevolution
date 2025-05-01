'use client';

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
}

export function Container({ children, className }: Props) {
  return <div className={cn('max-w-4xl mx-auto space-y-8 py-4', className)}>{children}</div>;
}
