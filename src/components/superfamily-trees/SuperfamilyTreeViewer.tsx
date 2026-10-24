'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ControlHint } from '@/components/phyletic-distribution/ControlPanel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  GROUP_COLORS, drawTree, familyLabel, familyName, palette, type DrawnTree, type TreeView,
} from '@/lib/superfamily-trees/draw';
import type { TreeData, TreeIndex, TreeNode } from '@/types/superfamily-trees';

const DATA_DIR = '/superfamily-trees';
type LabelMode = 'final' | 'trees';
const LABELS: Record<LabelMode, string> = {
  final: 'Final assignment',
  trees: 'As labelled in the trees',
};
const VIEWS: Record<TreeView, string> = {
  families: 'Simplified',
  detailed: 'Circular',
};

/** the site's dark-mode checkbox colour (globals.css), kept in both themes */
const CHECKBOX_STYLE = { accentColor: '#DBD6F9' };

let measureCtx: CanvasRenderingContext2D | null = null;
function measure(text: string, px: number) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * px * 0.62;
  measureCtx.font = `bold ${px}px Arial, Helvetica, sans-serif`;
  return measureCtx.measureText(text).width;
}

const fmt = (v: number | null | undefined, d = 3) => (v == null ? '–' : v.toFixed(d));
const escHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function leafTip(d: TreeNode, cut: number) {
  const unstable = d.mti != null && d.mti >= cut;
  const rows: [string, string][] = [];
  if (d.lit) {
    rows.push(['Study', d.study || '–'], ['Species', d.sp || '–'], ['Reported as', d.claimed || '–'],
      ['Closest family of ours', d.closest && d.closest !== 'no hit' ? familyName(d.closest) : 'no hit']);
  } else {
    rows.push(['Family', familyLabel(d.fam!)]);
    if (d.famTree) rows.push(['In the trees', `${familyLabel(d.famTree)}, reassigned to ${familyLabel(d.fam!)}`]);
    else if (d.fam2) rows.push(['Final assignment', familyLabel(d.fam2)]);
    rows.push(['Lineage', d.grp!]);
    (d.tax || []).forEach(([k, v]) => rows.push([k[0].toUpperCase() + k.slice(1), v]));
  }
  rows.push(['Transfer index', fmt(d.ti)], ['Mean transfer index', fmt(d.mti) + (unstable ? ' (unstable)' : '')]);
  return `<div class="font-semibold">${escHtml(d.acc!)}${d.lit ? ' <span class="font-normal text-muted-foreground">literature sequence</span>' : ''}</div>`
    + `<table class="mt-1">${rows.map(([k, v]) => `<tr><td class="pr-3 text-muted-foreground">${escHtml(k)}</td><td>${escHtml(v)}</td></tr>`).join('')}</table>`;
}

function branchTip(T: TreeData, drawn: DrawnTree, v: number) {
  const c: Record<string, number> = {};
  drawn.below[v].forEach(l => { const f = T.nodes[l].fam!; c[f] = (c[f] || 0) + 1; });
  const comp = Object.entries(c).sort((a, b) => b[1] - a[1]).map(([f, k]) => `${escHtml(familyLabel(f))} ${k}`).join(', ');
  const s = T.nodes[v].s;
  return `<div><span class="font-semibold">TBE ${s == null ? '–' : s.toFixed(2)}</span>`
    + ` <span class="text-muted-foreground">· ${drawn.below[v].length} sequences in this clade</span></div>`
    + `<div class="mt-1 text-muted-foreground">${comp}</div>`;
}

export function SuperfamilyTreeViewer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const [index, setIndex] = useState<TreeIndex | null>(null);
  const [rawTree, setRawTree] = useState<TreeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fadeUnstable, setFadeUnstable] = useState(false);
  const [hiddenFam, setHiddenFam] = useState<Set<string>>(new Set());
  const [hiddenGrp, setHiddenGrp] = useState<Set<string>>(new Set());
  const boxRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else frameRef.current?.requestFullscreen();
  };

  const sets = useMemo(() => {
    const seen = new Map<string, { set: string; setName: string; setNote: string; leaves: number }>();
    index?.trees.forEach(t => { if (!seen.has(t.set)) seen.set(t.set, t); });
    return [...seen.values()];
  }, [index]);
  const alignments = useMemo(() => {
    const seen = new Map<string, { alignment: string; alignmentName: string; alignmentNote: string }>();
    index?.trees.forEach(t => { if (!seen.has(t.alignment)) seen.set(t.alignment, t); });
    return [...seen.values()];
  }, [index]);
  const setKey = searchParams.get('set') || sets[0]?.set;
  const alnKey = searchParams.get('alignment') || alignments[0]?.alignment;
  const view: TreeView = searchParams.get('view') === 'detailed' ? 'detailed' : 'families';
  const labels: LabelMode = searchParams.get('labels') === 'trees' ? 'trees' : 'final';
  const entry = index?.trees.find(t => t.set === setKey && t.alignment === alnKey) || index?.trees[0];

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set(k, v);
    router.replace('?' + p.toString(), { scroll: false });
  };

  useEffect(() => {
    fetch(DATA_DIR + '/index.json')
      .then(r => { if (!r.ok) throw new Error('index ' + r.status); return r.json(); })
      .then(setIndex)
      .catch(e => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    setLoading(true); setError(null);
    fetch(`${DATA_DIR}/${entry.file}.json`)
      .then(r => { if (!r.ok) throw new Error(entry.file + ' ' + r.status); return r.json(); })
      .then(d => { if (!cancelled) setRawTree(d); })
      .catch(e => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [entry]);

  // the final assignment relabels the Dikarya Class A leaves of the GPR1 clade as GPR1; the trees'
  // own label is kept for the tooltip
  const tree = useMemo<TreeData | null>(() => {
    if (!rawTree || labels === 'trees') return rawTree;
    return { ...rawTree, nodes: rawTree.nodes.map(d => (d.fam2 ? { ...d, fam: d.fam2, famTree: d.fam } : d)) };
  }, [rawTree, labels]);
  const drawn = useMemo(() => (tree ? drawTree(tree, view, palette(dark), measure) : null), [tree, view, dark]);

  const families = useMemo(() => {
    if (!tree) return [];
    const count: Record<string, number> = {};
    tree.nodes.forEach(d => { if (d.leaf) count[d.fam!] = (count[d.fam!] || 0) + 1; });
    return Object.keys(tree.colors).filter(f => count[f]).map(f => ({ fam: f, n: count[f], color: tree.colors[f] }))
      .sort((a, b) => Number(a.fam.startsWith('LIT_')) - Number(b.fam.startsWith('LIT_')) || b.n - a.n);
  }, [tree]);
  const groupCounts = useMemo(() => {
    const c: Record<string, number> = {};
    tree?.nodes.forEach(d => { if (d.leaf) c[d.grp!] = (c[d.grp!] || 0) + 1; });
    return c;
  }, [tree]);
  const nUnstable = useMemo(() => (tree ? tree.nodes.filter(d => d.leaf && d.mti != null && d.mti >= tree.ste2Cut).length : 0), [tree]);

  // draw, then bind hovering and zoom/pan to what was drawn
  const elsRef = useRef<Map<number, Element[]>>(new Map());
  useEffect(() => {
    const box = boxRef.current, tip = tipRef.current;
    if (!drawn || !tree || !box || !tip) return;
    box.innerHTML = drawn.svg;
    const svg = box.querySelector('svg')!;
    svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
    const els = new Map<number, Element[]>();
    svg.querySelectorAll('[data-n]').forEach(el => {
      const v = +(el as HTMLElement).dataset.n!;
      if (!els.has(v)) els.set(v, []);
      els.get(v)!.push(el);
    });
    elsRef.current = els;
    const D = tree.nodes;
    let lit: [Element, string][] = [];
    const clear = () => { lit.forEach(([el, c]) => el.classList.remove(c)); lit = []; };
    const mark = (v: number, c: string) => (els.get(v) || []).forEach(el => { el.classList.add(c); lit.push([el, c]); });
    const pathTo = (v: number) => { for (let k = v; k > 0; k = D[k].p) mark(k, 'hl'); };

    const over = (e: MouseEvent) => {
      const el = (e.target as Element).closest('.hit [data-n], .ring [data-n], .labels [data-n], .tips [data-n], .stars [data-n]');
      if (!el) return;
      const v = +(el as HTMLElement).dataset.n!;
      clear();
      if (D[v].leaf) { pathTo(v); mark(v, 'hl'); tip.innerHTML = leafTip(D[v], tree.ste2Cut); }
      else {
        const st = [...drawn.kids[v]];
        while (st.length) { const k = st.pop()!; mark(k, D[k].leaf ? 'hl' : 'sub'); st.push(...drawn.kids[k]); }
        pathTo(v); tip.innerHTML = branchTip(tree, drawn, v);
      }
      tip.style.display = 'block';
    };
    const outOf = (e: MouseEvent) => {
      if ((e.target as Element).closest('[data-n]')) { clear(); tip.style.display = 'none'; }
    };
    const move = (e: MouseEvent) => {
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = Math.min(e.clientX + 14, window.innerWidth - w - 8) + 'px';
      tip.style.top = Math.min(e.clientY + 14, window.innerHeight - h - 8) + 'px';
    };
    svg.addEventListener('mouseover', over);
    svg.addEventListener('mouseout', outOf);
    svg.addEventListener('mousemove', move);

    // fit the view to what is drawn: the tree's bounding box, with the scale bar in its empty top-right
    // corner (the tree is round, so the corner holds nothing)
    const bar = svg.querySelector('#scalebar') as SVGGElement | null;
    const parts = [...svg.children].filter(el => el !== bar && el instanceof SVGGraphicsElement) as SVGGraphicsElement[];
    const boxes = parts.map(el => el.getBBox()).filter(b => b.width > 0 && b.height > 0);
    const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y));
    const x1 = Math.max(...boxes.map(b => b.x + b.width)), y1 = Math.max(...boxes.map(b => b.y + b.height));
    if (bar) bar.setAttribute('transform', `translate(${(x1 - 10).toFixed(1)},${(y0 + 50).toFixed(1)})`);
    const PAD = 60;
    const full = [x0 - PAD, y0 - PAD, x1 - x0 + 2 * PAD, y1 - y0 + 2 * PAD];
    svg.setAttribute('viewBox', full.map(x => x.toFixed(1)).join(' '));
    // zoom and pan through the viewBox
    let vb = full.slice();
    let frame = 0;
    const commit = () => { frame = 0; svg.setAttribute('viewBox', vb.map(x => x.toFixed(1)).join(' ')); };
    const later = () => { if (!frame) frame = requestAnimationFrame(commit); };
    const unitsPerPx = () => { const r = box.getBoundingClientRect(); return Math.max(vb[2] / r.width, vb[3] / r.height); };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = box.getBoundingClientRect(), s = unitsPerPx(), k = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      const px = vb[0] + (e.clientX - r.left - (r.width - vb[2] / s) / 2) * s;
      const py = vb[1] + (e.clientY - r.top - (r.height - vb[3] / s) / 2) * s;
      vb = [px - (px - vb[0]) * k, py - (py - vb[1]) * k, vb[2] * k, vb[3] * k];
      later();
    };
    let drag: [number, number] | null = null;
    const down = (e: MouseEvent) => { drag = [e.clientX, e.clientY]; };
    const up = () => { drag = null; };
    const dragMove = (e: MouseEvent) => {
      if (!drag) return;
      const s = unitsPerPx();
      vb[0] -= (e.clientX - drag[0]) * s; vb[1] -= (e.clientY - drag[1]) * s;
      drag = [e.clientX, e.clientY]; later();
    };
    const reset = () => { vb = full.slice(); later(); };
    svg.addEventListener('wheel', wheel, { passive: false });
    svg.addEventListener('mousedown', down);
    svg.addEventListener('dblclick', reset);
    window.addEventListener('mouseup', up);
    window.addEventListener('mousemove', dragMove);
    (box as HTMLDivElement & { resetView?: () => void }).resetView = reset;
    return () => {
      window.removeEventListener('mouseup', up);
      window.removeEventListener('mousemove', dragMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [drawn, tree]);

  // fade unstable sequences, and dim the unchecked families and lineages; a branch is dimmed when
  // every sequence beyond it is
  useEffect(() => {
    if (!tree || !drawn) return;
    const D = tree.nodes, cut = tree.ste2Cut;
    const unstable = (i: number) => D[i].mti != null && D[i].mti! >= cut;
    const off = (i: number) => hiddenFam.has(D[i].fam!) || hiddenGrp.has(D[i].grp!);
    elsRef.current.forEach((list, v) => {
      const under = drawn.below[v];
      const fade = fadeUnstable && under.every(unstable);
      const dim = (hiddenFam.size > 0 || hiddenGrp.size > 0) && under.every(off);
      list.forEach(el => { el.classList.toggle('unst', fade); el.classList.toggle('dim', dim); });
    });
  }, [fadeUnstable, hiddenFam, hiddenGrp, tree, drawn]);

  const exportSvg = () => {
    const svg = boxRef.current?.querySelector('svg');
    if (!svg || !entry) return;
    const c = svg.cloneNode(true) as SVGSVGElement;
    c.querySelectorAll('.hit').forEach(g => g.remove());
    const [, , vw, vh] = (svg.getAttribute('viewBox') || '0 0 2600 2600').split(/\s+/);
    c.setAttribute('width', vw); c.setAttribute('height', vh);
    const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(c)], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${entry.set}_${entry.alignment}_${view}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, k: string) => setter(prev => {
    const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next;
  });
  const allNone = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, keys: string[]) => (
    <span className="text-xs text-muted-foreground">
      <button className="underline" onClick={() => setter(new Set())}>all</button>
      {' · '}
      <button className="underline" onClick={() => setter(new Set(keys))}>none</button>
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="space-y-1 text-sm">
          <span className="flex items-center gap-1 text-muted-foreground">Sequence set
            <ControlHint id="sft-set" label="About sequence set">The representative sequences the tree was built from. Core families leaves out STE2, STE3, Class C and Vomeronasal 2, whose clades could not be placed confidently within the superfamily; it is the tree of Figure 3. Core families + literature adds 18 sequences reported in earlier studies from lineages our genomes do not sample, to test where they fall. The two larger sets show where the left-out families are placed.</ControlHint>
          </span>
          <Select value={entry?.set} onValueChange={v => setParam('set', v)}>
            <SelectTrigger className="w-[255px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {sets.map(s => <SelectItem key={s.set} value={s.set}>{s.setName} ({s.leaves})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 text-sm">
          <span className="flex items-center gap-1 text-muted-foreground">Alignment
            <ControlHint id="sft-aln" label="About alignment">The 7TM cores were aligned with MAFFT G-INS-i, with a higher gap extension penalty (--ep 0.123, used for the main results) or with the default penalty. Comparing the two shows which groupings hold regardless of the alignment.</ControlHint>
          </span>
          <Select value={entry?.alignment} onValueChange={v => setParam('alignment', v)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {alignments.map(a => <SelectItem key={a.alignment} value={a.alignment}>{a.alignmentName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 text-sm">
          <span className="flex items-center gap-1 text-muted-foreground">View
            <ControlHint id="sft-view" label="About view">Simplified shows the tree with each single-family clade shaded and named, and the leaf tips coloured by lineage. Circular adds a family ring and a lineage ring around the tree and labels every sequence with its accession and species.</ControlHint>
          </span>
          <Select value={view} onValueChange={v => setParam('view', v)}>
            <SelectTrigger className="w-[125px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(VIEWS) as TreeView[]).map(k => <SelectItem key={k} value={k}>{VIEWS[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 text-sm">
          <span className="flex items-center gap-1 text-muted-foreground">Family labels
            <ControlHint id="sft-labels" label="About family labels">Final assignment labels as GPR1 the 21 Dikarya sequences that were labelled Class A when the trees were built and fall within the GPR1 clade, as in the final assignment of the paper. As labelled in the trees shows the families the sequences had when the trees were inferred.</ControlHint>
          </span>
          <Select value={labels} onValueChange={v => setParam('labels', v)}>
            <SelectTrigger className="w-[205px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(LABELS) as LabelMode[]).map(k => <SelectItem key={k} value={k}>{LABELS[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex h-9 items-center gap-1 whitespace-nowrap text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" style={CHECKBOX_STYLE} checked={fadeUnstable} onChange={e => setFadeUnstable(e.target.checked)} />
            Fade unstable sequences ({nUnstable})
          </label>
          <ControlHint id="sft-fade" label="About fading unstable sequences">
            Fades the sequences whose mean transfer index over the trees is at or above {tree ? tree.ste2Cut.toFixed(2) : '…'},
            that of the most stable STE2 sequence. The transfer index measures how confidently a sequence is placed.
            STE2 shows no detectable homology to the other families, so it serves as the reference for instability;
            these sequences were left out of the interpretation of the trees, and Figure 3 shows them faded.
          </ControlHint>
        </div>
      </div>
      {entry && (
        <p className="text-sm text-muted-foreground">
          {entry.setName}: {entry.setNote}; {entry.leaves} sequences. Alignment: {entry.alignmentNote}.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div ref={frameRef} className="relative overflow-hidden rounded-lg border-2 border-muted-foreground/30 bg-background">
          <div ref={boxRef}
               className={`${fullscreen ? 'h-screen' : 'aspect-square max-h-[90vh] min-h-[420px]'} w-full cursor-grab active:cursor-grabbing select-none`} />
          <Button variant="outline" size="icon" className="absolute right-2 top-2 h-8 w-8"
                  title={fullscreen ? 'Exit full screen' : 'Full screen'} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          {(loading || (!tree && !error)) && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading tree…
            </div>
          )}
          {error && <div className="absolute inset-0 flex items-center justify-center text-destructive">{error}</div>}
          <div className="absolute bottom-2 left-3 text-xs text-muted-foreground">
            Scroll to zoom, drag to pan, double-click to reset. Hover a branch or a sequence for details.
          </div>
          {/* inside the frame, so it still shows in full screen */}
          <div ref={tipRef}
               className="pointer-events-none fixed z-50 hidden max-w-md rounded-md border bg-popover px-3 py-2 text-sm leading-snug text-popover-foreground shadow-md" />
        </div>

        <aside className="space-y-5 text-sm">
          <section className="space-y-2">
            <h3 className="flex items-center gap-1 font-semibold">Branch support (TBE)
              <ControlHint id="sft-tbe" label="About branch support">
                Transfer bootstrap expectation of each branch, from up to 500 bootstrap trees; it suits deep splits
                better than the standard bootstrap. Hover a branch for its value and the families in its clade.
              </ControlHint>
            </h3>
            {[[palette(dark).s9, '≥ 0.9'], [palette(dark).s8, '≥ 0.8'], [palette(dark).branch, '< 0.8']].map(([c, t]) => (
              <div key={t} className="flex items-center gap-2">
                <span className="inline-block h-1 w-8 rounded" style={{ background: c }} />{t}
              </div>
            ))}
          </section>
          <section className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h3 className="flex items-center gap-1 font-semibold">Lineage {view === 'families' ? '(leaf tips)' : '(outer ring)'}
                <ControlHint id="sft-lineage" label="About lineages">
                  The five lineage groups of Figure 3, with the number of sequences in this tree. Uncheck a lineage to
                  dim its sequences; a branch is dimmed when every sequence beyond it is.
                </ControlHint>
              </h3>
              {allNone(setHiddenGrp, index?.groups || [])}
            </div>
            {(index?.groups || []).map(g => (
              <label key={g} className={`flex cursor-pointer items-center gap-2 ${hiddenGrp.has(g) ? 'opacity-50' : ''}`}>
                <input type="checkbox" style={CHECKBOX_STYLE} checked={!hiddenGrp.has(g)} onChange={() => toggle(setHiddenGrp, g)} />
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: GROUP_COLORS[g] }} />
                <span className="flex-1">{g}</span>
                <span className="tabular-nums text-muted-foreground">{groupCounts[g] || 0}</span>
              </label>
            ))}
          </section>
          <section className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h3 className="flex items-center gap-1 font-semibold">Families {view === 'detailed' ? '(inner ring)' : ''}
                <ControlHint id="sft-families" label="About families">
                  The families in this tree, with their number of representatives. Uncheck a family to dim its
                  sequences. Literature entries are sequences reported in earlier studies, under the family their
                  study gave them.
                </ControlHint>
              </h3>
              {allNone(setHiddenFam, families.map(f => f.fam))}
            </div>
            {families.map(({ fam, n, color }) => (
              <label key={fam} className={`flex cursor-pointer items-center gap-2 ${hiddenFam.has(fam) ? 'opacity-50' : ''}`}>
                <input type="checkbox" style={CHECKBOX_STYLE} checked={!hiddenFam.has(fam)} onChange={() => toggle(setHiddenFam, fam)} />
                {view === 'detailed' ? (
                  <span className={`inline-block h-3 w-3 ${fam.startsWith('LIT_') ? 'rounded-full ring-1 ring-foreground' : 'rounded-sm'}`}
                        style={{ background: color }} />
                ) : fam.startsWith('LIT_') ? <span className="inline-block w-3 text-center leading-none">☆</span> : null}
                <span className="flex-1">{familyLabel(fam)}</span>
                <span className="tabular-nums text-muted-foreground">{n}</span>
              </label>
            ))}
          </section>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm"
                    onClick={() => (boxRef.current as (HTMLDivElement & { resetView?: () => void }) | null)?.resetView?.()}>
              Reset view
            </Button>
            <Button variant="outline" size="sm" onClick={exportSvg}>Export SVG</Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
