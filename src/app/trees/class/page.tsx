'use client';

import RootContainer from '@/components/RootContainer';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

export default function ClassTreePage() {
  return (
    <Suspense
      fallback={
        <RootContainer>
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-muted rounded"></div>
          </div>
        </RootContainer>
      }
    >
      <ClassTreeContent />
    </Suspense>
  );
}

function ClassTreeContent() {
  const searchParams = useSearchParams();
  const type = searchParams.get('type');

  const getTitle = () => {
    switch (type) {
      case 'a':
        return 'Class A  Trees';
      case 'b':
        return 'Class B  Trees';
      case 'c':
        return 'Class C  Trees';
      case 'f':
        return 'Class F Trees';
      case 't':
        return 'Class T Trees';
      case 'olfactory':
        return 'Olfactory Receptor Trees';
      default:
        return 'GPCR Trees';
    }
  };

  return (
    <RootContainer>
      <h1 className="text-3xl font-bold text-foreground">{getTitle()}</h1>
    </RootContainer>
  );
}
