'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense, lazy } from 'react';
import Link from 'next/link';
import { ChevronLeft, Download } from 'lucide-react';

import RootContainer from '@/components/RootContainer';
import DownloadableFiles from '@/components/DownloadableFiles';

import receptors from '../../../public/receptors.json';

const ConservationChart = lazy(() => import('@/components/ConservationChart'));
const SnakePlot   = lazy(() => import('@/components/SnakePlot'));
const SequenceLogoChart    = lazy(() => import('@/components/SequenceLogoChart'));
const CombinedTreeAlignment = lazy(() => import('@/components/CombinedTreeAlignment'));

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
          <div className="mt-4">
            <button
              type="button"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm hover:bg-accent"
              onClick={() => downloadAllSvgs(receptor)}
              data-action="download-all-svgs"
            >
              <Download className="h-4 w-4" /> Download All SVGs
            </button>
          </div>
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
function downloadAllSvgs(receptor: Receptor) {
  try {
    // Conservation chart (has its own exporter)
    const conservationButton = document.querySelector('[data-action="download-conservation"]') as HTMLButtonElement | null;
    conservationButton?.click();

    // Sequence logo: trigger its built-in button if present
    const logoButton = document.querySelector('[data-action="download-sequence-logo"]') as HTMLButtonElement | null;
    logoButton?.click();

    // Snake plot: trigger its built-in button if present
    const snakeButton = document.querySelector('[data-action="download-snakeplot"]') as HTMLButtonElement | null;
    snakeButton?.click();

    // Combined view: export outer container as SVG snapshot - rely on its own internal SVGs
    // We will try to find the right-side alignment SVG and left tree SVG and combine side-by-side similar to conservation export.
    const combinedContainer = document.querySelector('[data-plot="combined-tree-msa"]') as HTMLElement | null;
    if (combinedContainer) {
      const svgs = combinedContainer.querySelectorAll('svg');
      if (svgs.length > 0) {
        // Compute total bounds by concatenating horizontally
        let totalWidth = 0;
        let maxHeight = 0;
        const clones: SVGElement[] = [];
        svgs.forEach((svg) => {
          const w = parseInt(svg.getAttribute('width') || '0');
          const h = parseInt(svg.getAttribute('height') || '0');
          totalWidth += w;
          maxHeight = Math.max(maxHeight, h);
          clones.push(svg.cloneNode(true) as SVGElement);
        });
        if (totalWidth > 0 && maxHeight > 0) {
          const combinedSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          combinedSvg.setAttribute('width', `${totalWidth}`);
          combinedSvg.setAttribute('height', `${maxHeight}`);
          combinedSvg.setAttribute('viewBox', `0 0 ${totalWidth} ${maxHeight}`);
          combinedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

          let xOffset = 0;
          clones.forEach((clone) => {
            const w = parseInt(clone.getAttribute('width') || '0');
            const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            wrapper.setAttribute('transform', `translate(${xOffset},0)`);
            wrapper.appendChild(clone);
            combinedSvg.appendChild(wrapper);
            xOffset += w;
          });

          const serializer = new XMLSerializer();
          const svgString = serializer.serializeToString(combinedSvg);
          const svgWithDeclaration = `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;
          const blob = new Blob([svgWithDeclaration], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          const fileName = `${receptor.geneName}_combined_tree_alignment.svg`;
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
      }
    }
  } catch (err) {
    // best-effort: no-op on error
    console.error('Download all SVGs error:', err);
  }
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
          <ConservationChart
            conservationFile={receptor.conservationFile}
            height={280}
            onLoaded={next(1)}
          />
        </Suspense>
      )}

      {sectionIndex >= 1 && (
        <Suspense fallback={<SectionSpinner title="Sequence Logo" />}>
          <SequenceLogoChart
            sequences={[]} // Will be loaded from alignment file
            conservationFile={receptor.conservationFile}
            alignmentPath={receptor.alignment}
            height={280}
            onLoaded={next(2)}
          />
        </Suspense>
      )}

      {sectionIndex >= 2 && (
        <Suspense fallback={<SectionSpinner title="Residue Conservation Snake Plot" />}>
          <SnakePlot
            svgPath={receptor.snakePlot}
            conservationFile={receptor.conservationFile}
            onLoaded={next(3)}
          />
        </Suspense>
      )}

      {sectionIndex >= 3 && (
        <Suspense fallback={<SectionSpinner title="Tree and Multiple Sequence Alignment of Orthologs" />}>
          <CombinedSection receptor={receptor} onLoaded={next(4)} />
        </Suspense>
      )}

      {/* Download buttons are moved into the combined section header */}
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

/* ------------------------------------------------------------------------- */
/*  ↓↓↓ 5.  Combined Tree + Alignment Section ↓↓↓                            */
/* ------------------------------------------------------------------------- */

function CombinedSection({ receptor, onLoaded }: { receptor: Receptor; onLoaded: () => void }) {
  const [loading, setLoading] = useState<boolean>(false);
  const [newick, setNewick] = useState<string>('');
  const [alignmentFasta, setAlignmentFasta] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(receptor.tree).then(res => res.text()),
      fetch(receptor.alignment).then(res => res.text()),
    ])
      .then(([treeData, alignmentData]) => {
        if (cancelled) return;
        setNewick(treeData.trim());
        setAlignmentFasta(alignmentData);
      })
      .catch(err => {
        console.error('Error loading tree/alignment:', err);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        onLoaded();
      });
    return () => {
      cancelled = true;
    };
  }, [receptor.tree, receptor.alignment, onLoaded]);

  return (
    <div className="bg-card text-card-foreground rounded-lg shadow-md">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Tree and Multiple Sequence Alignment of Orthologs</h2>
        <div className="flex items-center gap-2">
          {receptor.tree && (
            <a href={`/${receptor.tree}`} download className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm hover:bg-accent">
              <Download className="h-4 w-4" /> Tree
            </a>
          )}
          {receptor.alignment && (
            <a href={`/${receptor.alignment}`} download className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm hover:bg-accent">
              <Download className="h-4 w-4" /> Alignment
            </a>
          )}
          {/* Conservation download moved into the Conservation Bar Plot header */}
        </div>
      </div>
      <div className="p-6">
        <div className="rounded-lg bg-card text-card-foreground" style={{ height: 600 }}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">Loading tree and alignment data...</p>
              </div>
            </div>
          ) : newick ? (
            <CombinedTreeAlignment
              newick={newick}
              alignmentFasta={alignmentFasta}
              receptor={receptor}
              showSupportOnBranches={false}
              mirrorRightToLeft={false}
              fontSize={14}
              leafRowSpacing={13}
              treeWidthPx={300}
              alignmentBoxWidthPx={900}
              height={600}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Unable to load tree/alignment for this receptor.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
