'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense, lazy } from 'react';
import receptors from '../../../public/receptors.json';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import RootContainer from '@/components/RootContainer';
import { LazySection } from '@/components/LazySection';
import DownloadableFiles from '@/components/DownloadableFiles';
import { MSAViewer } from '@/components/MSAViewer';

const ConservationChartAsync = lazy(() => import('@/components/ConservationChartAsync'));
const OptimizedSnakePlot = lazy(() => import('@/components/OptimizedSnakePlot'));
const OptimizedSVGTree = lazy(() => import('@/components/OptimizedSVGTree'));

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
  name: string;
}

const ConservationSkeleton = () => (
  <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-48 bg-muted rounded"></div>
      <div className="h-64 w-full bg-muted rounded"></div>
    </div>
  </div>
);

const LargeContentSkeleton = ({ title }: { title: string }) => (
  <div className="bg-card text-card-foreground rounded-lg shadow-md overflow-hidden">
    <div className="p-6 border-b border-border">
      <div className="animate-pulse">
        <div className="h-6 w-64 bg-muted rounded" title={`Loading ${title}...`}></div>
      </div>
    </div>
    <div className="p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-4 w-32 bg-muted rounded"></div>
        <div className="h-96 w-full bg-muted rounded"></div>
      </div>
    </div>
  </div>
);

export default function ReceptorPage() {
  return (
    <Suspense
      fallback={
        <RootContainer>
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-muted rounded mb-4"></div>
            <div className="space-y-4">
              <div className="h-4 w-32 bg-muted rounded"></div>
              <div className="h-4 w-64 bg-muted rounded"></div>
            </div>
          </div>
        </RootContainer>
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
      <RootContainer>
        <h1 className="text-3xl font-bold text-foreground">Receptor Details</h1>
        <p className="text-lg text-muted-foreground">
          Please select a receptor from the{' '}
          <Link href="/" className="text-foreground hover:text-foreground/80 underline">
            search page
          </Link>
          .
        </p>
      </RootContainer>
    );
  }

  if (!receptor) {
    return (
      <RootContainer>
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
        </div>
      </RootContainer>
    );
  }

  return (
    <>
      <RootContainer>
        <div className="flex flex-col items-start justify-start">
          <Link
            href="/"
            className="text-foreground hover:text-foreground/80  flex items-center gap-0.5"
          >
            <ChevronLeft className="w-8 h-8" />
            <h1 className="text-3xl font-bold text-foreground hover:text-foreground/80">
              {`${receptor.geneName} - ${receptor.name}`}
            </h1>
          </Link>
        </div>

        <div className="grid gap-6">
          <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Receptor Information</h2>
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
                <p className="text-sm text-muted-foreground">UniProt ID</p>
                <p className="font-medium text-foreground">{receptor.gpcrdbId}</p>
              </div>
            </div>
          </div>
        </div>

        <LazySection fallback={<ConservationSkeleton />} errorTitle="Conservation Chart Error">
          <ConservationChartAsync conservationFile={receptor.conservationFile} />
        </LazySection>

        <LazySection
          fallback={<LargeContentSkeleton title="Snake Plot" />}
          errorTitle="Snake Plot Error"
        >
          <OptimizedSnakePlot
            svgPath={receptor.snakePlot}
            conservationFile={receptor.conservationFile}
          />
        </LazySection>

        <LazySection
          fallback={<LargeContentSkeleton title="Phylogenetic Tree" />}
          errorTitle="Phylogenetic Tree Error"
        >
          <OptimizedSVGTree svgPath={receptor.svgTree} />
        </LazySection>

        <LazySection
          fallback={<LargeContentSkeleton title="Multiple Sequence Alignment" />}
          errorTitle="Multiple Sequence Alignment Error"
        >
          <MSAViewer
            alignmentPath={receptor.alignment}
            conservationFile={receptor.conservationFile}
          />
        </LazySection>

        <DownloadableFiles
          tree={receptor.tree}
          alignment={receptor.alignment}
          conservationFile={receptor.conservationFile}
        />
      </RootContainer>
    </>
  );
}
