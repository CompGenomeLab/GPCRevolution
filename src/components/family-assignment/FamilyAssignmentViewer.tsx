'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FamilyFigure, STAGES, fmt } from '@/lib/family-assignment/draw';
import type { FamilyBundle, FamilyIndexEntry, StageKey } from '@/types/family-assignment';

const DATA_DIR = '/family-assignment';

const STAGE_LABELS: Record<StageKey, string> = {
  initial: 'Clade extraction',
  after_7tm: 'Single 7TM core',
  after_topology: 'Topology score ≥ 0.8',
  after_assignment: 'Overlaps resolved',
  after_reassignment: 'GPR1 reassignment',
};

const MSA_LABELS: Record<string, string> = {
  gap: 'gap', hydrophobic: 'hydrophobic', polar: 'polar/neutral',
  acidic: 'acidic (D/E)', basic: 'basic (K/R/H)', other: 'other/ambiguous',
};

export function FamilyAssignmentViewer() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const searchParams = useSearchParams();
  const [families, setFamilies] = useState<FamilyIndexEntry[]>([]);
  const [data, setData] = useState<FamilyBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<StageKey>('initial');
  const [showHuman, setShowHuman] = useState(false);
  const [swapped, setSwapped] = useState(false);
  const [labelled, setLabelled] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // GPCR families first, in their display order, then the controls.
  const ordered = useMemo(() => {
    const byName = (a: FamilyIndexEntry, b: FamilyIndexEntry) => a.display.localeCompare(b.display);
    return [...families.filter(f => !f.control).sort(byName), ...families.filter(f => f.control).sort(byName)];
  }, [families]);
  const displayOf = useMemo(() => {
    const m: Record<string, string> = {};
    families.forEach(f => { m[f.gene] = f.display; });
    return (gene: string) => m[gene] || gene;
  }, [families]);

  const requested = searchParams.get('family');
  const current = useMemo(() => {
    if (!ordered.length) return null;
    return ordered.find(f => f.gene === requested) || ordered[0];
  }, [ordered, requested]);
  const currentIdx = current ? ordered.findIndex(f => f.gene === current.gene) : -1;

  useEffect(() => {
    fetch(DATA_DIR + '/index.json')
      .then(r => { if (!r.ok) throw new Error('index ' + r.status); return r.json(); })
      .then(setFamilies)
      .catch(e => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(DATA_DIR + '/' + current.gene + '.json')
      .then(r => { if (!r.ok) throw new Error(current.gene + ' ' + r.status); return r.json(); })
      .then((d: FamilyBundle) => {
        if (cancelled) return;
        setData(d);
        // Keep the selected step where this family has it; the controls have only the clade.
        setMode(m => (d.highlight_sets[m] && !d.highlight_sets[m]!.no_data ? m : 'initial'));
      })
      .catch(e => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [current]);

  // The reassignment of Dikarya Class A sequences to GPR1 is a step of its own only where it
  // changes the family's own clade (Class A). Elsewhere it moves at most a few sequences between
  // the other families' rows, so "Overlaps resolved" is drawn with the final assignment.
  const hasReassignment = !!data?.highlight_sets.after_reassignment
    && !data.highlight_sets.after_reassignment.no_data;
  const reassignmentChanges = !!data && hasReassignment
    && data.highlight_sets.after_assignment?.n !== data.highlight_sets.after_reassignment?.n;
  const drawMode: StageKey = mode === 'after_assignment' && hasReassignment && !reassignmentChanges
    ? 'after_reassignment' : mode;
  useEffect(() => {
    if (mode === 'after_reassignment' && !reassignmentChanges) setMode('after_assignment');
  }, [mode, reassignmentChanges]);

  const figure = useMemo(() => (data && families.length ? new FamilyFigure(data, displayOf) : null),
                         [data, families.length, displayOf]);

  const draw = useCallback(() => {
    if (!figure || !panelRef.current || !labelRef.current || !canvasRef.current) return;
    const panelWidth = panelRef.current.clientWidth - figure.gutterWidth - 1;
    figure.render(labelRef.current, canvasRef.current, panelWidth, { mode: drawMode, showHuman, swapped, dark });
    setLabelled(figure.labelledHuman);
  }, [figure, drawMode, showHuman, swapped, dark]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(t); t = setTimeout(draw, 150); };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); clearTimeout(t); };
  }, [draw]);

  const goTo = useCallback((i: number) => {
    if (i < 0 || i >= ordered.length || i === currentIdx) return;
    router.replace('?family=' + encodeURIComponent(ordered[i].gene), { scroll: false });
  }, [ordered, currentIdx, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'SELECT' || tag === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft') goTo(currentIdx - 1);
      if (e.key === 'ArrowRight') goTo(currentIdx + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, currentIdx]);

  const downloadSvg = () => {
    if (!figure || !labelRef.current || !canvasRef.current || !data) return;
    const svg = figure.toSvg(labelRef.current, canvasRef.current);
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'family_assignment_' + displayOf(data.gene).replace(/\s+/g, '_') + '.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const name = data ? displayOf(data.gene) : '';
  const hs = data ? (data.highlight_sets[drawMode] || data.highlight_sets.initial || null) : null;
  const complete = data?.complete_set || null;
  const humanAll = data?.human || [];
  const humanNoun = data?.human_noun || 'human';
  const searchKind = data
    ? (String(data.hmmregion).toUpperCase() === 'NA' ? 'MMseqs2 search'
       : data.hmmregion === 1 ? 'HMM search, matched regions' : 'HMM search, full sequences')
    : '';
  const total = complete ? complete.n : data?.n_leaves || 0;
  const shownN = hs ? (complete && hs.n_complete !== undefined ? hs.n_complete : hs.n) : 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Family</span>
          <Select value={current?.gene || ''} onValueChange={g => goTo(ordered.findIndex(f => f.gene === g))}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Loading…" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>GPCR families</SelectLabel>
                {ordered.filter(f => !f.control).map(f => (
                  <SelectItem key={f.gene} value={f.gene}>{f.display}</SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Controls</SelectLabel>
                {ordered.filter(f => f.control).map(f => (
                  <SelectItem key={f.gene} value={f.gene}>{f.display}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => goTo(currentIdx - 1)}
                  disabled={currentIdx <= 0} title="Previous family"><ChevronLeft /></Button>
          <Button variant="outline" size="icon" onClick={() => goTo(currentIdx + 1)}
                  disabled={currentIdx < 0 || currentIdx >= ordered.length - 1} title="Next family">
            <ChevronRight />
          </Button>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant={showHuman ? 'secondary' : 'outline'} size="sm" disabled={!humanAll.length}
                  onClick={() => setShowHuman(v => !v)}>
            {(showHuman ? 'Hide ' : 'Show ') + humanNoun + ' sequences'}
          </Button>
          <Button variant="outline" size="sm" disabled={!data?.score} onClick={() => setSwapped(v => !v)}>
            Swap MSA / search metrics
          </Button>
          <Button variant="outline" size="sm" disabled={!data} onClick={downloadSvg}>
            <Download /> SVG
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-md border p-1 w-fit">
        {STAGES.filter(s => s !== 'after_reassignment' || reassignmentChanges).map(s => {
          const set = data?.highlight_sets[s];
          const disabled = !data || (s !== 'initial' && (!set || set.no_data));
          return (
            <Button key={s} size="sm" variant={mode === s ? 'secondary' : 'ghost'} disabled={disabled}
                    onClick={() => setMode(s)}
                    title={disabled && data ? 'This step does not apply to this family.' : undefined}>
              {STAGE_LABELS[s]}
            </Button>
          );
        })}
      </div>

      {error && <p className="text-sm text-destructive">Could not load the data: {error}</p>}

      {data && hs && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md border bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
          <span>Family: <b className="text-foreground">{name}</b></span>
          <span>Search: <b className="text-foreground">{displayOf(data.search_name)}</b> ({searchKind})</span>
          <span>Tree leaves: <b className="text-foreground">{fmt(data.n_leaves)}</b>
            {complete && ' (representatives)'}</span>
          {complete && <span>Family members, complete set: <b className="text-foreground">{fmt(complete.n)}</b></span>}
          <span>{STAGE_LABELS[mode]}: <b className="text-foreground">{fmt(shownN)}</b>
            {total ? ` (${(100 * shownN / total).toFixed(1)}% ${complete ? 'of the family' : 'of the tree'})` : ''}
            {complete ? `, ${fmt(hs.n)} drawn here` : ''}</span>
          <span>Alignment: <b className="text-foreground">{fmt(data.aln_len)}</b> columns</span>
          <span>Bins: <b className="text-foreground">{fmt(data.n_bins)}</b> × {data.bin_size} leaves</span>
        </div>
      )}
      {complete && (
        <p className="text-sm text-muted-foreground">
          {name} was sampled into its own tree, so the {fmt(data!.n_leaves)} leaves drawn here are
          representatives of the {fmt(complete.n)} members of the family. Counts are given over the
          complete membership; the complete set is also what marks {name} on the other families&apos; trees.
        </p>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[900px] rounded-lg border bg-card p-4 text-card-foreground">
          <p className="mb-2 text-xs text-muted-foreground">
            Shared x-axis: <b>{data ? fmt(data.n_leaves) : '–'}</b> tree leaves, binned every{' '}
            <b>{data?.bin_size ?? '–'}</b> leaves
          </p>
          <div ref={panelRef} className="flex items-stretch overflow-hidden rounded border border-border">
            <div ref={labelRef} className="flex flex-col border-r border-border bg-muted/40"
                 style={{ width: figure?.gutterWidth ?? 95, flex: `0 0 ${figure?.gutterWidth ?? 95}px` }} />
            <div ref={canvasRef} className="flex min-w-0 flex-1 flex-col" />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"
               style={{ marginLeft: (figure?.gutterWidth ?? 95) + 2 }}>
            <span>← higher-scoring leaves</span><span>lower-scoring leaves →</span>
          </div>

          {data && (
            <div className="mt-5 flex flex-wrap gap-6 border-t border-border pt-4 text-[11px] text-muted-foreground">
              <div>
                <div className="mb-1 font-semibold text-foreground">MSA, majority residue class per bin × column</div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {data.msa.categories.map((c, i) => (
                    <span key={c} className="inline-flex items-center gap-1">
                      <i className="inline-block h-[11px] w-[11px] rounded-sm border border-black/10"
                         style={{ background: data.msa.colors[i] }} />{MSA_LABELS[c] || c}
                    </span>
                  ))}
                </div>
              </div>
              {hs && hs.ranges.length > 0 && (
                <div>
                  <div className="mb-1 font-semibold text-foreground">Extracted clade</div>
                  <span className="inline-flex items-center gap-1">
                    <i className="inline-block h-[11px] w-[11px] rounded-sm border border-[rgba(75,75,75,0.8)] bg-[rgba(115,115,115,0.55)]" />
                    {STAGE_LABELS[mode]}{figure && figure.initialSet().ranges.length > 1
                      ? ` (${figure.initialSet().ranges.length} clades)` : ''}
                  </span>
                </div>
              )}
              {showHuman && humanAll.length > 0 && figure && (
                <div>
                  <div className="mb-1 font-semibold text-foreground">{data.human_group_title || 'Human sequences'}</div>
                  {fmt(humanAll.length)} {humanNoun} leaves in this tree, {fmt(labelled)} named at this width
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
