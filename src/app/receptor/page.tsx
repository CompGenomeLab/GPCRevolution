'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import receptors from '@/data/receptors.json';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Container } from '@/components/container';

interface Receptor {
  geneName: string;
  class: string;
  numOrthologs: number;
  lca: string;
  gpcrdbId: string;
  tree: string;
  alignment: string;
  conservationFile: string;
  snakePlot: string;
  svgTree: string;
}

export default function ReceptorPage() {
  return (
    <Suspense
      fallback={
        <Container>
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-muted rounded mb-4"></div>
            <div className="space-y-4">
              <div className="h-4 w-32 bg-muted rounded"></div>
              <div className="h-4 w-64 bg-muted rounded"></div>
            </div>
          </div>
        </Container>
      }
    >
      <ReceptorContent />
    </Suspense>
  );
}

function ReceptorContent() {
  const searchParams = useSearchParams();
  const gene = searchParams.get('gene');
  const [receptor, setReceptor] = useState<Receptor | null>(null);

  useEffect(() => {
    if (gene) {
      const found = receptors.find((r: Receptor) => r.geneName === gene);
      setReceptor(found || null);
    }
  }, [gene]);

  if (!gene) {
    return (
      <Container>
        <h1 className="text-3xl font-bold text-foreground">Receptor Details</h1>
        <p className="text-lg text-muted-foreground">
          Please select a receptor from the search page.
        </p>
      </Container>
    );
  }

  if (!receptor) {
    return (
      <Container>
        <h1 className="text-3xl font-bold text-foreground">Receptor Not Found</h1>
        <p className="text-lg text-muted-foreground">The receptor {gene} could not be found.</p>
      </Container>
    );
  }

  return (
    <Container>
      <div className="flex flex-col items-start justify-start">
        <Link
          href="/"
          className="text-foreground hover:text-foreground/80  flex items-center gap-0.5"
        >
          <ChevronLeft className="w-8 h-8" />
          <h1 className="text-3xl font-bold text-foreground hover:text-foreground/80">
            {receptor.geneName}
          </h1>
        </Link>
      </div>

      <div className="grid gap-6">
        <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md space-y-4">
          <h2 className="text-xl font-semibold  text-foreground">Basic Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Class</p>
              <p className="font-medium text-foreground">{receptor.class}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Number of Orthologs</p>
              <p className="font-medium text-foreground">{receptor.numOrthologs}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Last Common Ancestor</p>
              <p className="font-medium text-foreground">{receptor.lca}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">GPCRdb ID</p>
              <p className="font-medium text-foreground">{receptor.gpcrdbId}</p>
            </div>
          </div>
        </div>
      </div>
    </Container>
  );
}
