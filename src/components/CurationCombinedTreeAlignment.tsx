'use client';

import { useEffect, useMemo, useRef } from 'react';
import CombinedTreeAlignment from '@/components/CombinedTreeAlignment';

type ReceptorLike = {
  conservationFile?: string;
} | null;

type SequenceRecord = {
  header: string;
  sequence: string;
};

type Props = {
  newick: string;
  alignmentFasta: string;
  receptor: ReceptorLike;
  maskedHeaders: string[];
  onToggleMaskedHeader: (header: string) => void;
  height?: number;
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

export default function CurationCombinedTreeAlignment({
  newick,
  alignmentFasta,
  receptor,
  maskedHeaders,
  onToggleMaskedHeader,
  height = 600,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const listenerCleanupRef = useRef<(() => void) | null>(null);
  const parsedSequences = useMemo(() => parseFasta(alignmentFasta), [alignmentFasta]);
  const maskedSet = useMemo(() => new Set(maskedHeaders), [maskedHeaders]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const clearInjected = () => {
      if (listenerCleanupRef.current) {
        listenerCleanupRef.current();
        listenerCleanupRef.current = null;
      }
      const root = host.querySelector('[data-plot="combined-tree-msa"]') as HTMLElement | null;
      if (root) {
        root.querySelectorAll('.curation-mask-overlay,.curation-mask-hitbox').forEach(node => node.remove());
      }
    };

    const injectInteractivity = () => {
      clearInjected();

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

      const listeners: Array<{ el: SVGElement; fn: EventListener }> = [];

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
        if (!mappedHeader) continue;

        const parent = rowText.parentElement;
        if (!parent) continue;

        const rowTop = y - rowHeight * 0.55;

        const hitbox = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        hitbox.setAttribute('class', 'curation-mask-hitbox');
        hitbox.setAttribute('x', '0');
        hitbox.setAttribute('y', String(rowTop));
        hitbox.setAttribute('width', String(svgWidth));
        hitbox.setAttribute('height', String(Math.max(10, rowHeight)));
        hitbox.setAttribute('fill', 'transparent');
        hitbox.style.cursor = 'pointer';

        const toggle = () => onToggleMaskedHeader(mappedHeader);
        const toggleListener: EventListener = () => toggle();
        hitbox.addEventListener('click', toggleListener);
        listeners.push({ el: hitbox, fn: toggleListener });
        parent.appendChild(hitbox);

        if (maskedSet.has(mappedHeader)) {
          const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          overlay.setAttribute('class', 'curation-mask-overlay');
          overlay.setAttribute('x', '0');
          overlay.setAttribute('y', String(rowTop));
          overlay.setAttribute('width', String(svgWidth));
          overlay.setAttribute('height', String(Math.max(10, rowHeight)));
          overlay.setAttribute('fill', 'rgba(239,68,68,0.22)');
          overlay.style.pointerEvents = 'none';
          parent.appendChild(overlay);
        }
      }

      listenerCleanupRef.current = () => {
        for (const { el, fn } of listeners) {
          el.removeEventListener('click', fn);
        }
      };
      return true;
    };

    let retry = 0;
    let retryTimer: number | null = null;
    const scheduleInject = () => {
      const ok = injectInteractivity();
      if (ok) return;
      if (retry >= 12) return;
      retry += 1;
      retryTimer = window.setTimeout(scheduleInject, 120);
    };

    const raf = window.requestAnimationFrame(scheduleInject);

    return () => {
      window.cancelAnimationFrame(raf);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      clearInjected();
    };
  }, [alignmentFasta, maskedSet, onToggleMaskedHeader, parsedSequences, newick]);

  return (
    <div ref={hostRef}>
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
        height={height}
      />
    </div>
  );
}
