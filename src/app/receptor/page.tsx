'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense, lazy } from 'react';
import receptors from '../../../public/receptors.json';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import RootContainer from '@/components/RootContainer';
import DownloadableFiles from '@/components/DownloadableFiles';
import FullScreenSection from '@/components/FullScreenSection';
const ConservationChartAsync = lazy(() => import('@/components/ConservationChartAsync'));
const OptimizedSnakePlot = lazy(() => import('@/components/OptimizedSnakePlot'));
const OptimizedSVGTree = lazy(() => import('@/components/OptimizedSVGTree'));
const MSAViewer = lazy(() => import('@/components/MSAViewer').then(m => ({ default: m.MSAViewer })));

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

export default function ReceptorPage() {
  const searchParams = useSearchParams();
  const gene = searchParams.get('gene') || 'no-gene';

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
      <ReceptorContent key={gene} />
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

  // Scroll to top whenever a new receptor is loaded
  useEffect(() => {
    if (receptor) {
      window.scrollTo({ top: 0 });
    }
  }, [receptor?.geneName]);

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

        {/* Sequential section loading */}
        <SequentialSections key={receptor.geneName} receptor={receptor} />
      </RootContainer>
    </>
  );
}

// ----- Local loading fallback components -----

const ConservationSkeleton = () => (
  <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-48 bg-muted rounded"></div>
      <div className="h-64 w-full bg-muted rounded"></div>
    </div>
  </div>
);

const SectionSpinner = ({ title }: { title: string }) => (
  <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
    <h2 className="text-lg font-medium mb-4">{title}</h2>
    <div className="flex items-center justify-center p-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
    </div>
  </div>
);

// --- SequentialSections component ---
function SequentialSections({ receptor }: { receptor: Receptor }) {
  const [sectionIndex, setSectionIndex] = useState(0);

  const next = (expected: number) => () =>
    setSectionIndex(prev => (prev < expected ? expected : prev));

  return (
    <>
      {sectionIndex >= 0 && (
        <Suspense fallback={<ConservationSkeleton />}>
          <FullScreenSection>
            <ConservationChartAsync
              conservationFile={receptor.conservationFile}
              onLoaded={next(1)}
            />
          </FullScreenSection>
        </Suspense>
      )}

      {sectionIndex >= 1 && (
        <Suspense fallback={<SectionSpinner title="Residue Conservation Snake Plot" />}>
          <FullScreenSection>
            <OptimizedSnakePlot
              svgPath={receptor.snakePlot}
              conservationFile={receptor.conservationFile}
              onLoaded={next(2)}
            />
          </FullScreenSection>
        </Suspense>
      )}

      {sectionIndex >= 2 && (
        <Suspense fallback={<SectionSpinner title="Phylogenetic Tree of Orthologs" />}>
          <FullScreenSection>
            <OptimizedSVGTree svgPath={receptor.svgTree} onLoaded={next(3)} />
          </FullScreenSection>
        </Suspense>
      )}

      {sectionIndex >= 3 && (
        <Suspense fallback={<SectionSpinner title="Multiple Sequence Alignment of Orthologs" />}>
          <FullScreenSection>
            <MSAViewer
              alignmentPath={receptor.alignment}
              conservationFile={receptor.conservationFile}
              onLoaded={next(4)}
            />
          </FullScreenSection>
        </Suspense>
      )}

      {sectionIndex >= 4 && (
        <DownloadableFiles
          tree={receptor.tree}
          alignment={receptor.alignment}
          conservationFile={receptor.conservationFile}
        />
      )}
    </>
  );
}
