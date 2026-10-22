'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import {
  CUTOFF, STATE_NAMES, TopologyMap, palette, VIEW_HEIGHT, decodePayload, fmtInt, fmtScore, pct,
  type RowView, type SortMode,
} from '@/lib/topology-filter/viewer';
import type { TopologyFamilyEntry, TopologyIndex } from '@/types/topology-filter';

const DATA_DIR = '/topology-filter';
const SORTS: Record<SortMode, string> = {
  score_desc: 'Topology score, best first',
  score: 'Topology score, worst first',
  coverage: 'Coverage, lowest first',
  file: 'Alignment order',
};

/** Share of each family's single-core sequences removed by the 0.8 cutoff. */
function FilterImpact({ families, current, onPick }: {
  families: TopologyFamilyEntry[]; current: string | null; onPick: (family: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Family</th>
            <th className="px-3 py-2 text-right">Single 7TM core</th>
            <th className="px-3 py-2 text-right">Topology score ≥ {CUTOFF}</th>
            <th className="px-3 py-2 text-right">Removed</th>
            <th className="px-3 py-2">Share removed</th>
          </tr>
        </thead>
        <tbody>
          {families.map(f => {
            const share = f.removed / (f.single_core || 1);
            return (
              <tr key={f.family} onClick={() => onPick(f.family)}
                  className={`cursor-pointer border-t hover:bg-muted/40 ${current === f.family ? 'bg-muted/60' : ''}`}>
                <td className="px-3 py-1.5 font-medium">{f.display}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtInt(f.single_core)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtInt(f.kept)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtInt(f.removed)}</td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-40 rounded-sm bg-muted" title="0 to 100%">
                      <div className="h-2.5 rounded-sm bg-[#b3261e]" style={{ width: `${100 * share}%` }} />
                    </div>
                    <span className="tabular-nums text-muted-foreground">{pct(share)}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TopologyFilterViewer() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const pal = palette(dark);
  const searchParams = useSearchParams();
  const [index, setIndex] = useState<TopologyIndex | null>(null);
  const [map, setMap] = useState<TopologyMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxGap, setMaxGap] = useState(10);
  const [pendingGap, setPendingGap] = useState(10);
  const [sortMode, setSortMode] = useState<SortMode>('score_desc');
  const [rowView, setRowView] = useState<RowView>('all');
  const [helix, setHelix] = useState<string>('all');
  const [note, setNote] = useState('');
  const occRef = useRef<HTMLCanvasElement>(null);
  const consRef = useRef<HTMLCanvasElement>(null);
  const heatRef = useRef<HTMLCanvasElement>(null);
  const sideRef = useRef<HTMLCanvasElement>(null);
  const histRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const families = useMemo(() => {
    if (!index) return [];
    return [...index.families].sort((a, b) => a.display.localeCompare(b.display));
  }, [index]);
  const current = useMemo(() => {
    if (!families.length) return null;
    return families.find(f => f.family === searchParams.get('family')) || families[0];
  }, [families, searchParams]);

  useEffect(() => {
    fetch(DATA_DIR + '/index.json')
      .then(r => { if (!r.ok) throw new Error('index ' + r.status); return r.json(); })
      .then(setIndex)
      .catch(e => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMap(null);
    fetch(DATA_DIR + '/' + current.family + '.json.gz')
      .then(r => { if (!r.ok) throw new Error(current.family + ' ' + r.status); return r.arrayBuffer(); })
      .then(decodePayload)
      .then(d => { if (!cancelled) setMap(new TopologyMap(d)); })
      .catch(e => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [current]);

  // Attach the canvases, then redraw whenever a setting changes.
  useEffect(() => {
    if (!map || !occRef.current || !consRef.current || !heatRef.current || !sideRef.current || !tipRef.current) return;
    map.attach({ occupancy: occRef.current, consensus: consRef.current, heat: heatRef.current,
                 side: sideRef.current, tip: tipRef.current });
    map.onViewChange = () => {
      const v = map.view;
      if (!v) {
        setNote(map.rowView === 'removed' ? `No sequence scores below ${fmtScore(CUTOFF)}; nothing is filtered out.`
                                          : 'No sequence is retained.');
        return;
      }
      const rowsPerPixel = v.h / VIEW_HEIGHT;
      setNote(`Showing sequences ${fmtInt(Math.floor(v.y) + 1)}–${fmtInt(Math.ceil(v.y + v.h))} of ` +
        `${fmtInt(map.nRows())} and columns ${fmtInt(Math.floor(v.x) + 1)}–${fmtInt(Math.ceil(v.x + v.w))} of ` +
        `${fmtInt(map.visible.length)}, ${rowsPerPixel < 1 ? (1 / rowsPerPixel).toFixed(1) + ' px per sequence'
        : rowsPerPixel.toFixed(1) + ' sequences per pixel'}. Scroll to zoom, drag to pan.`);
    };
    return map.bindInteraction();
  }, [map]);

  useEffect(() => {
    if (!map) return;
    map.setTheme(dark);
    map.setMaxGap(maxGap / 100);
    map.computeOrder();
    map.drawHeat(false);
    if (histRef.current) map.drawHist(histRef.current);
  }, [map, maxGap, dark]);

  useEffect(() => {
    if (!map) return;
    map.sortMode = sortMode;
    map.rowView = rowView;
    map.computeOrder();
    map.drawHeat(false);
  }, [map, sortMode, rowView]);

  useEffect(() => {
    if (!map) return;
    map.helix = helix === 'all' ? 'all' : Number(helix);
    map.renderSide();
  }, [map, helix]);

  useEffect(() => {
    if (!map) return;
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => { map.renderView(); if (histRef.current) map.drawHist(histRef.current); }, 150);
    };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); clearTimeout(t); };
  }, [map]);

  const pick = useCallback((family: string) => {
    router.replace('?family=' + encodeURIComponent(family), { scroll: false });
  }, [router]);

  const counts = map ? map.counts() : null;
  const summary = map ? map.summary() : null;
  const lowest = map ? map.lowest(100) : [];

  return (
    <div className="space-y-6">
      {index && <FilterImpact families={families} current={current?.family || null} onPick={pick} />}

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">Family</span>
        <Select value={current?.family || ''} onValueChange={pick}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Loading…" /></SelectTrigger>
          <SelectContent>
            {families.map(f => <SelectItem key={f.family} value={f.family}>{f.display}</SelectItem>)}
          </SelectContent>
        </Select>
        {loading && <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> loading the alignment…</span>}
      </div>

      {error && <p className="text-sm text-destructive">Could not load the data: {error}</p>}

      {map && summary && counts && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Sequences', fmtInt(map.D.nSeq), 'single 7TM core'],
            ['Retained', fmtInt(counts.kept), `topology score ≥ ${fmtScore(CUTOFF)}`],
            ['Median score', fmtScore(summary.median), `mean ${summary.mean.toFixed(3)}`],
            ['Alignment', fmtInt(map.D.alignmentWidth), 'columns'],
          ].map(([k, v, n]) => (
            <div key={k} className="rounded-lg border px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
              <div className="text-2xl font-semibold tabular-nums">{v}</div>
              <div className="text-xs text-muted-foreground">{n}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-6">
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Hide columns with more than</div>
          <Slider className="w-56" min={0} max={90} step={1} value={[pendingGap]}
                  onValueChange={v => setPendingGap(v[0])} onValueCommit={v => setMaxGap(v[0])} />
          <div className="text-xs text-muted-foreground">
            {pendingGap}% gaps{map ? ` — ${fmtInt(map.visibleCount(pendingGap / 100))} columns shown` : ''}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Row order</div>
          <Select value={sortMode} onValueChange={v => setSortMode(v as SortMode)}>
            <SelectTrigger className="w-[230px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(SORTS) as SortMode[]).map(k => <SelectItem key={k} value={k}>{SORTS[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Side panel</div>
          <Select value={helix} onValueChange={setHelix}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All helices (mean Jaccard)</SelectItem>
              {map && Array.from({ length: map.nHelices }, (_, b) => (
                <SelectItem key={b} value={String(b)}>TM{b + 1}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Filter view</div>
          <div className="flex gap-1 rounded-md border p-1">
            {([['all', 'All'], ['kept', 'Retained'], ['removed', 'Filtered out']] as [RowView, string][]).map(([v, l]) => (
              <Button key={v} size="sm" variant={rowView === v ? 'secondary' : 'ghost'} onClick={() => setRowView(v)}>
                {l} <span className="ml-1 tabular-nums text-muted-foreground">{counts ? fmtInt(counts[v]) : ''}</span>
              </Button>
            ))}
          </div>
        </div>
        <Button variant="outline" size="sm" disabled={!map} onClick={() => map?.resetZoom()}>Reset zoom</Button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[900px] rounded-lg border bg-card p-4 text-card-foreground">
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {Object.entries(pal.states as Record<string, string>).filter(([l]) => !map || map.D.labels.includes(l)).map(([l, c]) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <i className="inline-block h-3 w-3 rounded-sm" style={{ background: c }} />{l} — {STATE_NAMES[l]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-3 w-3 rounded-sm border border-border" style={{ background: pal.gap }} />gap
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-3 w-3 rounded-sm bg-[#b3261e]/50" />filtered out (in “All”)
            </span>
          </div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Column occupancy</div>
          <canvas ref={occRef} className="block h-[44px]" />
          <div className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">Column consensus topology</div>
          <canvas ref={consRef} className="block h-[34px]" />
          <div className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            Alignment, one row per sequence, one pixel per visible column
          </div>
          <div className="flex items-start gap-2">
            <div className="relative min-w-0 flex-1 overflow-hidden rounded-md border border-border bg-muted">
              <canvas ref={heatRef} className="block w-full" style={{ imageRendering: 'pixelated' }} />
            </div>
            <div className="relative w-[360px] flex-none rounded-md border border-border bg-card">
              <canvas ref={sideRef} className="block" />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{note}</p>

          <div className="mt-5 text-[11px] uppercase tracking-wide text-muted-foreground">Topology score distribution</div>
          <canvas ref={histRef} className="block h-[120px] w-full" />
        </div>
      </div>

      {map && counts && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">
            Lowest-scoring sequences{' '}
            <span className="text-sm font-normal text-muted-foreground">
              {fmtInt(counts.removed)} of {fmtInt(map.D.nSeq)} below {fmtScore(CUTOFF)}
            </span>
          </h2>
          <div className="max-h-[480px] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-right">#</th><th className="px-3 py-2">Accession</th>
                  <th className="px-3 py-2 text-right">Score</th><th className="px-3 py-2 text-right">Coverage</th>
                  <th className="px-3 py-2 text-right">Residues</th><th className="px-3 py-2">Topology composition</th>
                </tr>
              </thead>
              <tbody>
                {lowest.map((i, rank) => {
                  const comp = map.comps[i];
                  const total = Object.values(comp).reduce((a, b) => a + b, 0) || 1;
                  const removed = map.scores[i] < CUTOFF;
                  return (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1 text-right tabular-nums">{rank + 1}</td>
                      <td className="px-3 py-1 font-mono text-xs" title={map.D.descriptions[i]}>{map.D.ids[i]}</td>
                      <td className={`px-3 py-1 text-right tabular-nums ${removed ? 'font-semibold text-[#b3261e]' : ''}`}>
                        {fmtScore(map.scores[i])}</td>
                      <td className="px-3 py-1 text-right tabular-nums">{pct(map.coverage[i])}</td>
                      <td className="px-3 py-1 text-right tabular-nums">{fmtInt(map.residues[i])}</td>
                      <td className="px-3 py-1 text-xs text-muted-foreground">
                        {map.D.labels.filter(l => comp[l]).map(l => (
                          <span key={l} className="mr-2 inline-flex items-center gap-1">
                            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: (pal.states as Record<string, string>)[l] || pal.gap }} />
                            {l} {pct(comp[l] / total)}
                          </span>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Coverage is the share of the columns occupied in at least 30% of the sequences where the sequence has a
            residue. A low score with high coverage means a divergent helix arrangement; a low coverage means a
            fragment that does not span the family core.
          </p>
        </div>
      )}

      <div ref={tipRef} className="pointer-events-none fixed z-50 hidden max-w-[380px] rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg" />
    </div>
  );
}
