'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense, lazy } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

import RootContainer from '@/components/RootContainer';
import DownloadableFiles from '@/components/DownloadableFiles';

import receptors from '../../../public/receptors.json';

const ConservationChartAsync = lazy(() => import('@/components/ConservationChartAsync'));
const OptimizedSnakePlot   = lazy(() => import('@/components/OptimizedSnakePlot'));
const OptimizedSVGTree     = lazy(() => import('@/components/OptimizedSVGTree'));
const MSAViewer            = lazy(() =>
  import('@/components/MSAViewer').then(m => ({ default: m.MSAViewer })),
);

/* ------------------------------------------------------------------------- */
/*  ↓↓↓ 1.  Tiny route entry — just a Suspense wrapper around the content ↓↓↓ */
/* ------------------------------------------------------------------------- */

export default function ReceptorPage() {
  return (
    <Suspense fallback={<RootContainer>Loading receptor…</RootContainer>}>
      <ReceptorContent />
    </Suspense>
  );
}

/* ------------------------------------------------------------------------- */
/*  ↓↓↓ 2.  The full Client Component that builds the receptor page ↓↓↓      */
/* ------------------------------------------------------------------------- */

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

function ReceptorContent() {
  const searchParams = useSearchParams();
  const gene = searchParams.get('gene');

  const [receptor, setReceptor] = useState<Receptor | null>(null);

  /* --- fetch receptor data when the gene changes --- */
  useEffect(() => {
    if (gene) {
      const found = receptors.find((r: Receptor) => r.geneName === gene);
      setReceptor(found ?? null);
    }
  }, [gene]);

  /* --- scroll to top whenever a new receptor loads --- */
  useEffect(() => {
    if (receptor) window.scrollTo({ top: 0 });
  }, [receptor]);

  /* ---------- early-exit screens ---------- */
  if (!gene) {
    return (
      <RootContainer>
        <h1 className="text-3xl font-bold text-foreground">Receptor Details</h1>
        <p className="text-lg text-muted-foreground">
          Please select a receptor from the{' '}
          <Link href="/" className="text-foreground underline hover:text-foreground/80">
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
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-foreground" />
        </div>
      </RootContainer>
    );
  }

  /* ---------- full receptor page ---------- */
  return (
    <>
      <RootContainer>
        {/* header --------------------------------------------------------- */}
        <div className="flex flex-col items-start">
          <Link href="/" className="flex items-center gap-0.5 text-foreground hover:text-foreground/80">
            <ChevronLeft className="h-8 w-8" />
            <h1 className="text-3xl font-bold">{`${receptor.geneName} - ${receptor.name}`}</h1>
          </Link>
        </div>

        {/* basic info card ----------------------------------------------- */}
        <div className="grid gap-6">
          <div className="space-y-4 rounded-lg bg-card p-6 text-card-foreground shadow-md">
            <h2 className="text-xl font-semibold">Receptor Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <InfoItem label="Class"                 value={receptor.class} />
              <InfoItem label="Number of Orthologs"  value={receptor.numOrthologs} />
              <InfoItem label="Last Common Ancestor" value={receptor.lca} />
              <InfoItem label="UniProt ID"           value={receptor.gpcrdbId} />
            </div>
          </div>
        </div>

        {/* heavy visual sections load one-by-one ------------------------- */}
        <SequentialSections key={receptor.geneName} receptor={receptor} />
      </RootContainer>
    </>
  );
}

/* helper for tidy info pairs */
const InfoItem = ({ label, value }: { label: string; value: string | number }) => (
  <div>
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="font-medium">{value}</p>
  </div>
);

/* ------------------------------------------------------------------------- */
/*  ↓↓↓ 3.  Sequentially load heavy visual sections ↓↓↓                      */
/* ------------------------------------------------------------------------- */

function SequentialSections({ receptor }: { receptor: Receptor }) {
  const [sectionIndex, setSectionIndex] = useState(0);
  const next = (expected: number) => () =>
    setSectionIndex(prev => (prev < expected ? expected : prev));

  return (
    <>
      {sectionIndex >= 0 && (
        <Suspense fallback={<ConservationSkeleton />}>
          <ConservationChartAsync
            conservationFile={receptor.conservationFile}
            onLoaded={next(1)}
          />
        </Suspense>
      )}

      {sectionIndex >= 1 && (
        <Suspense fallback={<SectionSpinner title="Residue Conservation Snake Plot" />}>
          <OptimizedSnakePlot
            svgPath={receptor.snakePlot}
            conservationFile={receptor.conservationFile}
            onLoaded={next(2)}
          />
        </Suspense>
      )}

      {sectionIndex >= 2 && (
        <Suspense fallback={<SectionSpinner title="Phylogenetic Tree of Orthologs" />}>
          <OptimizedSVGTree svgPath={receptor.svgTree} onLoaded={next(3)} />
        </Suspense>
      )}

      {sectionIndex >= 3 && (
        <Suspense fallback={<SectionSpinner title="Multiple Sequence Alignment of Orthologs" />}>
          <MSAViewer
            alignmentPath={receptor.alignment}
            conservationFile={receptor.conservationFile}
            onLoaded={next(4)}
          />
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

/* ------------------------------------------------------------------------- */
/*  ↓↓↓ 4.  Local loading placeholders ↓↓↓                                   */
/* ------------------------------------------------------------------------- */

const ConservationSkeleton = () => (
  <div className="rounded-lg bg-card p-6 shadow-md">
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-48 rounded bg-muted" />
      <div className="h-64 w-full rounded bg-muted" />
    </div>
  </div>
);

const SectionSpinner = ({ title }: { title: string }) => (
  <div className="rounded-lg bg-card p-6 shadow-md">
    <h2 className="mb-4 text-lg font-medium">{title}</h2>
    <div className="flex items-center justify-center p-8">
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-foreground" />
    </div>
  </div>
);
