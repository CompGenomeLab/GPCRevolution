'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import Link from 'next/link';
import { ChevronLeft, Download } from 'lucide-react';
import { toast } from 'sonner';

import RootContainer from '@/components/RootContainer';

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

type ManualCurationPayload = {
  receptors?: Array<{
    geneName?: string;
    curated?: boolean;
    maskedSequenceHeaders?: string[];
    curationNote?: string | null;
  }>;
};

type SequenceRecord = {
  header: string;
  sequence: string;
};

function parseFasta(text: string): SequenceRecord[] {
  const lines = text.split(/\r?\n/);
  const out: SequenceRecord[] = [];
  let currentHeader = '';
  let currentSeq = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('>')) {
      if (currentHeader) out.push({ header: currentHeader, sequence: currentSeq });
      currentHeader = line.slice(1).trim();
      currentSeq = '';
    } else {
      currentSeq += line;
    }
  }
  if (currentHeader) out.push({ header: currentHeader, sequence: currentSeq });
  return out;
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function matchHeaderFromSpecies(speciesLabel: string, sequences: SequenceRecord[]): string | null {
  const normalizedSpecies = normalizeLabel(speciesLabel);
  for (const seq of sequences) {
    const normalizedHeader = normalizeLabel(seq.header);
    if (
      normalizedHeader.includes(normalizedSpecies) ||
      normalizedHeader.includes(normalizedSpecies.replace(/_/g, ' '))
    ) {
      return seq.header;
    }
  }
  return null;
}

const AUTO_IDENTICAL_SEQUENCE_NOTE_MARKER = '[[AUTO_IDENTICAL_SEQUENCE_NOTE]]';

function sanitizeCurationNote(note: string): string {
  return note.replaceAll(AUTO_IDENTICAL_SEQUENCE_NOTE_MARKER, '').trim();
}

function ReceptorContent() {
  const searchParams = useSearchParams();
  const gene = searchParams.get('gene');

  const [receptor, setReceptor] = useState<Receptor | null>(null);
  const [curationNote, setCurationNote] = useState<string>('');

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

  useEffect(() => {
    let cancelled = false;
    if (!receptor?.geneName) {
      setCurationNote('');
      return;
    }

    fetch('/manual_curation.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load curation notes');
        return res.json() as Promise<ManualCurationPayload>;
      })
      .then(payload => {
        if (cancelled) return;
        const item = payload.receptors?.find(r => r.geneName === receptor.geneName);
        const raw = item?.curationNote ?? '';
        setCurationNote(sanitizeCurationNote(raw));
      })
      .catch(() => {
        if (cancelled) return;
        setCurationNote('');
      });

    return () => {
      cancelled = true;
    };
  }, [receptor?.geneName]);

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
              {curationNote ? (
                <div className="col-span-2">
                  <p className="text-base text-muted-foreground flex items-start gap-2">
                    <span
                      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background text-lg font-bold leading-none"
                      aria-hidden="true"
                    >
                      !
                    </span>
                    <span>
                      <span className="font-medium text-foreground">Curation Note: </span>
                      <span className="whitespace-pre-line">{curationNote}</span>
                    </span>
                  </p>
                </div>
              ) : null}
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
  const [showDivergentOrthologs, setShowDivergentOrthologs] = useState(false);
  const [curatedMaskedHeaders, setCuratedMaskedHeaders] = useState<string[]>([]);
  const [curationLoaded, setCurationLoaded] = useState(false);
  const combinedVizRef = useRef<HTMLDivElement | null>(null);
  const parsedSequences = useMemo(() => parseFasta(alignmentFasta), [alignmentFasta]);
  const maskedSet = useMemo(() => new Set(curatedMaskedHeaders), [curatedMaskedHeaders]);

  const downloadCombinedSVG = () => {
    const host = combinedVizRef.current;
    if (!host) {
      toast.error('Unable to find the visualization container.');
      return;
    }

    const root = host.querySelector('[data-plot="combined-tree-msa"]') as HTMLElement | null;
    if (!root) {
      toast.error('Combined MSA visualization not found.');
      return;
    }

    const svgs = Array.from(root.querySelectorAll('svg')) as SVGSVGElement[];
    if (svgs.length === 0) {
      toast.error('No SVG content found to download.');
      return;
    }

    let headerSvg: SVGSVGElement | null = null;
    let treeSvg: SVGSVGElement | null = null;
    let alignmentSvg: SVGSVGElement | null = null;

    for (const svg of svgs) {
      const pos = window.getComputedStyle(svg).position;
      if (pos === 'sticky') treeSvg = svg;
      else if (pos === 'absolute') alignmentSvg = svg;
      else if (!headerSvg) headerSvg = svg;
    }

    // Fall back to DOM order if position heuristics didn't identify everything
    if (!treeSvg) treeSvg = svgs[0] ?? null;
    if (!alignmentSvg && svgs.length >= 2) alignmentSvg = svgs[svgs.length - 1] ?? null;
    if (!headerSvg && svgs.length >= 3) headerSvg = svgs[0] ?? null;

    const getSvgSize = (svg: SVGSVGElement | null) => {
      if (!svg) return { w: 0, h: 0 };
      const vb = svg.viewBox?.baseVal;
      const vbW = vb?.width ?? 0;
      const vbH = vb?.height ?? 0;
      if (vbW > 0 && vbH > 0) return { w: vbW, h: vbH };
      const w = Number(svg.getAttribute('width') || 0);
      const h = Number(svg.getAttribute('height') || 0);
      return { w: Number.isFinite(w) ? w : 0, h: Number.isFinite(h) ? h : 0 };
    };

    const treeSize = getSvgSize(treeSvg);
    const alignSize = getSvgSize(alignmentSvg);
    const headerSize = getSvgSize(headerSvg);

    const totalW = treeSize.w + (alignSize.w || 0);
    const totalH = Math.max(treeSize.h, alignSize.h, headerSize.h);

    if (!totalW || !totalH) {
      toast.error('Unable to determine SVG dimensions for export.');
      return;
    }

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const out = document.createElementNS(SVG_NS, 'svg');
    out.setAttribute('xmlns', SVG_NS);
    out.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    out.setAttribute('width', String(totalW));
    out.setAttribute('height', String(totalH));
    out.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);

    // Background to match what the user sees
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', String(totalW));
    bg.setAttribute('height', String(totalH));
    bg.setAttribute('fill', window.getComputedStyle(root).backgroundColor || '#ffffff');
    out.appendChild(bg);

    const inlineComputedTextStyles = (src: SVGSVGElement, dst: SVGSVGElement) => {
      const srcNodes = Array.from(src.querySelectorAll('text, tspan'));
      const dstNodes = Array.from(dst.querySelectorAll('text, tspan'));
      const propsToInline = [
        'font-family',
        'font-size',
        'font-weight',
        'font-style',
        'letter-spacing',
        'word-spacing',
        'text-anchor',
        'dominant-baseline',
        'alignment-baseline',
        'baseline-shift',
        'text-rendering',
        'fill',
      ] as const;

      const n = Math.min(srcNodes.length, dstNodes.length);
      for (let i = 0; i < n; i++) {
        const cs = window.getComputedStyle(srcNodes[i] as Element);
        const dstEl = dstNodes[i] as Element;
        for (const p of propsToInline) {
          const v = cs.getPropertyValue(p);
          if (v && v.trim()) dstEl.setAttribute(p, v.trim());
        }
      }
    };

    const appendPositionedClone = (src: SVGSVGElement | null, x: number, y: number) => {
      if (!src) return;
      const clone = src.cloneNode(true) as SVGSVGElement;
      clone.removeAttribute('style'); // remove sticky/absolute positioning
      clone.setAttribute('x', String(x));
      clone.setAttribute('y', String(y));
      inlineComputedTextStyles(src, clone);
      out.appendChild(clone);
    };

    appendPositionedClone(treeSvg, 0, 0);
    if (alignmentSvg) appendPositionedClone(alignmentSvg, treeSize.w, 0);
    // Header should overlay the alignment at the top (if present)
    if (headerSvg && headerSize.h > 0) appendPositionedClone(headerSvg, treeSize.w, 0);

    const svgString = new XMLSerializer().serializeToString(out);
    const svgWithDeclaration = `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;
    const blob = new Blob([svgWithDeclaration], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const fileName = `${receptor.geneName}_tree_msa.svg`;
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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

  useEffect(() => {
    let cancelled = false;
    setCurationLoaded(false);
    setCuratedMaskedHeaders([]);
    setShowDivergentOrthologs(false);

    fetch('/manual_curation.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load manual curation data');
        return res.json() as Promise<ManualCurationPayload>;
      })
      .then(payload => {
        if (cancelled) return;
        const item = payload.receptors?.find(r => r.geneName === receptor.geneName);
        const headers = item?.curated ? item.maskedSequenceHeaders ?? [] : [];
        setCuratedMaskedHeaders(headers);
      })
      .catch(() => {
        if (cancelled) return;
        setCuratedMaskedHeaders([]);
      })
      .finally(() => {
        if (cancelled) return;
        setCurationLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [receptor.geneName]);

  useEffect(() => {
    const host = combinedVizRef.current;
    if (!host) return;

    const clearOverlays = () => {
      const root = host.querySelector('[data-plot="combined-tree-msa"]') as HTMLElement | null;
      if (!root) return;
      root.querySelectorAll('.receptor-divergent-overlay').forEach(node => node.remove());
    };

    if (!showDivergentOrthologs || maskedSet.size === 0) {
      clearOverlays();
      return;
    }

    const injectHighlights = () => {
      clearOverlays();
      const root = host.querySelector('[data-plot="combined-tree-msa"]') as HTMLElement | null;
      if (!root) return false;

      const svgs = Array.from(root.querySelectorAll('svg')) as SVGSVGElement[];
      const stickySvg = svgs.find(svg => window.getComputedStyle(svg).position === 'sticky') ?? null;
      const absoluteSvg = svgs.find(svg => window.getComputedStyle(svg).position === 'absolute') ?? null;
      if (!stickySvg || !absoluteSvg) return false;

      const leafTexts = Array.from(stickySvg.querySelectorAll('text'))
        .map(el => {
          const tspans = el.querySelectorAll('tspan');
          if (tspans.length > 0) return null;
          const y = Number(el.getAttribute('y') || NaN);
          const label = (el.textContent || '').trim();
          if (!Number.isFinite(y) || !label) return null;
          return { y, label };
        })
        .filter((x): x is { y: number; label: string } => x !== null);
      if (leafTexts.length === 0) return false;

      const sequenceRows = Array.from(absoluteSvg.querySelectorAll('text')).filter(
        textEl => textEl.querySelectorAll('tspan').length > 5
      );
      if (sequenceRows.length === 0) return false;

      const yValues = sequenceRows
        .map(el => Number(el.getAttribute('y') || NaN))
        .filter(y => Number.isFinite(y))
        .sort((a, b) => a - b);
      let rowHeight = 13;
      if (yValues.length > 1) {
        const diffs: number[] = [];
        for (let i = 1; i < yValues.length; i++) {
          const d = yValues[i] - yValues[i - 1];
          if (d > 0) diffs.push(d);
        }
        if (diffs.length > 0) rowHeight = diffs[Math.floor(diffs.length / 2)];
      }

      const svgWidth = Number(absoluteSvg.getAttribute('width') || 0);
      if (!Number.isFinite(svgWidth) || svgWidth <= 0) return false;

      for (const rowText of sequenceRows) {
        const y = Number(rowText.getAttribute('y') || NaN);
        if (!Number.isFinite(y)) continue;

        let best = leafTexts[0];
        let bestDist = Math.abs(best.y - y);
        for (let i = 1; i < leafTexts.length; i++) {
          const dist = Math.abs(leafTexts[i].y - y);
          if (dist < bestDist) {
            best = leafTexts[i];
            bestDist = dist;
          }
        }

        const mappedHeader = matchHeaderFromSpecies(best.label, parsedSequences);
        if (!mappedHeader || !maskedSet.has(mappedHeader)) continue;

        const parent = rowText.parentElement;
        if (!parent) continue;
        const rowTop = y - rowHeight * 0.55;

        const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        overlay.setAttribute('class', 'receptor-divergent-overlay');
        overlay.setAttribute('x', '0');
        overlay.setAttribute('y', String(rowTop));
        overlay.setAttribute('width', String(svgWidth));
        overlay.setAttribute('height', String(Math.max(10, rowHeight)));
        overlay.setAttribute('fill', 'rgba(239,68,68,0.22)');
        overlay.style.pointerEvents = 'none';
        parent.appendChild(overlay);
      }

      return true;
    };

    let retry = 0;
    let retryTimer: number | null = null;
    const scheduleInject = () => {
      const ok = injectHighlights();
      if (ok) return;
      if (retry >= 12) return;
      retry += 1;
      retryTimer = window.setTimeout(scheduleInject, 120);
    };
    const raf = window.requestAnimationFrame(scheduleInject);

    return () => {
      window.cancelAnimationFrame(raf);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      clearOverlays();
    };
  }, [newick, alignmentFasta, showDivergentOrthologs, maskedSet, parsedSequences]);

  const canHighlightDivergent = curationLoaded && curatedMaskedHeaders.length > 0;

  return (
    <div className="bg-card text-card-foreground rounded-lg shadow-md">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Tree and Multiple Sequence Alignment of Orthologs</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDivergentOrthologs(prev => !prev)}
            disabled={!canHighlightDivergent}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm ${
              canHighlightDivergent
                ? showDivergentOrthologs
                  ? 'bg-accent'
                  : 'hover:bg-accent'
                : 'opacity-50 cursor-not-allowed'
            }`}
            title={
              canHighlightDivergent
                ? 'Toggle curated divergent ortholog highlights'
                : 'No curated divergent orthologs for this receptor yet'
            }
          >
            Highlight Divergent Orthologs
          </button>
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
          <button
            type="button"
            onClick={downloadCombinedSVG}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm hover:bg-accent"
            data-action="download-tree-msa-svg"
          >
            <span className="sr-only">Download Tree + MSA SVG</span>
            <Download className="h-4 w-4" /> Download SVG
          </button>
          {/* Conservation download moved into the Conservation Bar Plot header */}
        </div>
      </div>
      <div className="p-6">
        <div className="rounded-lg bg-card text-card-foreground" style={{ height: 600 }} ref={combinedVizRef}>
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
