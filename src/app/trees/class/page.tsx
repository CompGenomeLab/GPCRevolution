'use client';

import { Container } from '@/components/container';
import { useSearchParams } from 'next/navigation';

export default function ClassTreePage() {
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
    <Container>
      <h1 className="text-3xl font-bold text-foreground">{getTitle()}</h1>
    </Container>
  );
}
