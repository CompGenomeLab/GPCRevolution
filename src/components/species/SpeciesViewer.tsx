'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check, Download, Loader2, X } from 'lucide-react';
import { FastaDownloadButton } from '@/components/FastaDownloadButton';
import { downloadSequencesZip, type SequenceRef } from '@/lib/sequence-download';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ControlHint } from '@/components/phyletic-distribution/ControlPanel';
import type { GpcrRow, SpeciesIndex, SpeciesPayload } from '@/types/species';

const DATA_DIR = '/species';
const DEFAULT_TAXID = '9606';
const CUTOFF = 0.8;
const RED = 'text-[#b3261e]';
const AMBER = 'text-amber-700 dark:text-amber-400';

/** Outcome filters of the sequence table. */
const OUTCOMES: [string, string, (r: GpcrRow) => boolean][] = [
  ['all', 'All outcomes', () => true],
  ['kept', 'Final members', r => r[4] === 'kept' || r[4] === 'dikarya'],
  ['removed', 'Removed by the filters', r => r[4] === 'core' || r[4] === 'topology'],
  ['core', 'No seven-helix core', r => r[4] === 'core'],
  ['topology', `Poor structural fit (topology score < ${CUTOFF})`, r => r[4] === 'topology'],
  ['claimed', 'Found by two families', r => r[8].length > 0],
  ['overlap', 'Given to the other family', r => r[4] === 'overlap'],
  ['dikarya', 'Fungal, moved from Class A to GPR1', r => r[4] === 'dikarya'],
];

const fmtInt = (n: number) => n.toLocaleString('en-US');

function evalueNumber(e: string) {
  const v = parseFloat(e);
  return Number.isFinite(v) ? v : Infinity;
}

/** The family a row is listed under: the Dikarya Class A sequences moved to GPR1 are GPR1's. */
const listedFamily = (r: GpcrRow) => (r[4] === 'dikarya' ? r[5] : r[1]);

/** Where a row's sequence is stored for download: the final family's file, the clade's removed file, or the
 * control's file (public/sequences/, build_family_fasta.py). */
const sequenceRef = (r: GpcrRow): SequenceRef =>
  r[4] === 'control' ? { set: 'controls', family: r[1], accession: r[0] }
    : r[4] === 'core' || r[4] === 'topology' ? { set: 'removed', family: r[1], accession: r[0] }
      : { set: '', family: r[5], accession: r[0] };

/** The rows as FASTA groups, one per family label, in the order the table shows them. */
function groupRows(rows: GpcrRow[], label: (r: GpcrRow) => string) {
  const groups = new Map<string, SequenceRef[]>();
  for (const r of rows) {
    const l = label(r);
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l)!.push(sequenceRef(r));
  }
  return [...groups].map(([l, sequences]) => ({ label: l, sequences }));
}

/** Pipeline stages a row passed, in the order of the Methods. */
const passedCore = (r: GpcrRow) => r[4] !== 'core';
const passedTopology = (r: GpcrRow) => r[4] !== 'core' && r[4] !== 'topology';
const keptAfterOverlap = (r: GpcrRow) => r[4] === 'kept' || r[4] === 'dikarya';

const STAGES = ['Found', 'One seven-helix core', 'Good structural fit', 'Overlaps resolved', 'Final'];

/** Members of each family after each step, like Table S1 for one genome. */
function PipelineTable({ index, data, onPick }: {
  index: SpeciesIndex; data: SpeciesPayload; onPick: (family: string) => void;
}) {
  const stageCounts = useCallback((rows: GpcrRow[], finals: number) => [
    rows.length, rows.filter(passedCore).length, rows.filter(passedTopology).length,
    rows.filter(keptAfterOverlap).length, finals,
  ], []);
  const unique = (rows: GpcrRow[]) => new Set(rows.map(r => r[0])).size;
  const all = data.gpcr;
  const totals = [unique(all), unique(all.filter(passedCore)), unique(all.filter(passedTopology)),
    unique(all.filter(keptAfterOverlap)), data.total];

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Lineage</th><th className="px-3 py-2">Family</th>
            {STAGES.map(s => <th key={s} className="px-3 py-2 text-right">{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {index.lineages.map(lin => {
            const fams = index.families.filter(f => f.lineage === lin);
            // only the families with potential members in this genome
            const famRows = fams.map(f => {
              const rows = all.filter(r => r[1] === f.key);
              return { f, counts: stageCounts(rows, data.counts[f.key] || 0) };
            }).filter(x => x.counts.some(c => c > 0));
            if (!famRows.length) return null;
            const sub = [0, 1, 2, 3, 4].map(i => famRows.reduce((a, x) => a + x.counts[i], 0));
            return (
              <React.Fragment key={lin}>
                {famRows.map(({ f, counts }, i) => {
                  return (
                    <tr key={f.key} className={`${i === 0 ? 'border-t' : ''} cursor-pointer hover:bg-muted/40`}
                        onClick={() => onPick(f.key)}>
                      {i === 0 && <td rowSpan={famRows.length + (famRows.length > 1 ? 1 : 0)}
                                      className="px-3 py-1 align-top font-medium text-foreground">{lin}</td>}
                      <td className="px-3 py-1">{f.display}</td>
                      {counts.map((c, j) => (
                        <td key={j} className={`px-3 py-1 text-right tabular-nums ${j === 4 && c ? 'font-semibold' : ''}`}>
                          {fmtInt(c)}
                          {j === 4 && f.key === 'GPR1' && c !== counts[3] ? (
                            <span className={`ml-1 text-xs ${AMBER}`}>(+{fmtInt(c - counts[3])} from Class A)</span>
                          ) : null}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {famRows.length > 1 && (
                  <tr className="bg-muted/30">
                    <td className="px-3 py-1 text-xs uppercase tracking-wide text-muted-foreground">{lin} total</td>
                    {sub.map((c, j) => <td key={j} className="px-3 py-1 text-right font-semibold tabular-nums">{fmtInt(c)}</td>)}
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          <tr className="border-t-2 bg-muted/50">
            <td className="px-3 py-1.5 font-semibold" colSpan={2}>All GPCR families (distinct sequences)</td>
            {totals.map((c, j) => <td key={j} className="px-3 py-1.5 text-right font-semibold tabular-nums">{fmtInt(c)}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const LINK = 'underline decoration-dotted hover:text-foreground';
/** Ranks shown before the lineage is expanded; the genome itself and the added groupings are always shown. */
const CANONICAL_RANKS = new Set(['domain', 'superkingdom', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species']);

/** The lineage from Eukaryota down to the genome, in our taxonomy: NCBI with the
 * groupings it lacks (Unikonta, Archaeplastida, Holozoa, Holomycota) added. */
function Taxonomy({ data }: { data: SpeciesPayload }) {
  const [expanded, setExpanded] = useState(false);
  const path = data.taxonomy;
  // the groupings we added (negative taxIDs) are always shown
  const canonical = path.filter((n, i) => CANONICAL_RANKS.has(n[2]) || n[0] < 0 || i === path.length - 1);
  const collapsible = canonical.length < path.length;
  const hidden = collapsible && !expanded ? path.length - canonical.length : 0;
  const shown = hidden ? canonical : path;
  const added = path.some(n => n[0] < 0);
  const toggle = (
    <button type="button" onClick={() => setExpanded(e => !e)}
            className="rounded border border-dashed px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
      {hidden ? `show all ${path.length} levels` : 'show main ranks only'}
    </button>
  );
  return (
    <Section title="Taxonomy" hint={<>
      The lineage of this genome, from Eukaryota down to the species, as in the NCBI Taxonomy. Only the main ranks
      are shown until the lineage is expanded. Groupings marked * were added by us and are not NCBI nodes.</>}>
      <div className="space-y-2 rounded-lg border px-4 py-3">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-sm">
        {shown.map(([id, name, rank], i) => {
          const last = i === shown.length - 1;
          const synthetic = id < 0;
          const label = rank && rank !== 'no rank' ? rank : '';
          return (
            <li key={id} className="inline-flex items-center gap-1">
              {synthetic ? (
                <span className="rounded border border-dashed border-amber-500 px-1.5 py-0.5 text-amber-800 dark:text-amber-300"
                      title={`${name}: a grouping we added; it is not an NCBI Taxonomy node`}>
                  {name}*
                </span>
              ) : (
                <a target="_blank" rel="noreferrer" title={label || undefined}
                   href={`https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=${id}`}
                   className={`rounded px-1.5 py-0.5 hover:bg-muted ${last ? 'font-semibold' : ''}`}>
                  {['genus', 'species', 'subspecies', 'strain', 'subgenus'].includes(rank) ? <i>{name}</i> : name}
                  {label && <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>}
                </a>
              )}
              {!last && <span className="text-muted-foreground">›</span>}
            </li>
          );
        })}
        {collapsible && <li className="ml-1">{toggle}</li>}
      </ol>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 pt-1">
        <p className="text-xs text-muted-foreground">
          {added ? '* Grouping we added to the NCBI Taxonomy; it is not an NCBI node.' : ''}
        </p>
        <div className="ml-auto flex flex-wrap justify-end gap-x-4 text-sm text-muted-foreground">
          <span>Taxonomy ID: <span className="tabular-nums text-foreground">{data.taxID}</span></span>
          <a className={LINK} target="_blank" rel="noreferrer"
             href={`https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=${data.taxID}`}>NCBI Taxonomy</a>
          <a className={LINK} target="_blank" rel="noreferrer"
             href={`https://www.uniprot.org/taxonomy/${data.taxID}`}>UniProt taxonomy</a>
          <a className={LINK} target="_blank" rel="noreferrer"
             href={`https://www.uniprot.org/proteomes?query=organism_id:${data.taxID}`}>UniProt proteome</a>
        </div>
      </div>
      </div>
    </Section>
  );
}

/** A titled part of the page: the title above, any links beside it, the content below. */
function Section({ title, hint, aside, children }: {
  title: string; hint?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="inline-flex items-center gap-1 text-lg font-bold">
          {title}
          {hint && <ControlHint id={'hint-' + title.replace(/\W+/g, '-')} label={`About ${title}`}>{hint}</ControlHint>}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** One count, its label inside the frame; a zero count can be flagged with a warning. */
function StatCard({ label, value, note, warn, dim, hint, onClick, compact }: {
  label: string; value: number; note?: React.ReactNode; warn?: string; dim?: boolean; hint?: React.ReactNode;
  onClick?: () => void; active?: boolean; compact?: boolean;
}) {
  return (
    <div title={warn} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
         onClick={onClick} onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
         className={`rounded-lg border text-center ${compact ? 'px-2 py-1.5' : 'px-4 py-3'} ${warn ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40' : ''} ${dim ? 'opacity-60' : ''} ${onClick ? 'cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' : ''}`}>
      <div className="inline-flex items-center gap-1 text-sm font-bold">
        {label}
        {hint && <span onClick={e => e.stopPropagation()}>
          <ControlHint id={'hint-' + label.replace(/\W+/g, '-')} label={`About ${label}`}>{hint}</ControlHint>
        </span>}
      </div>
      <div className={`flex items-center justify-center gap-1.5 ${compact ? 'text-xl' : 'text-2xl'} font-semibold tabular-nums`}>
        {fmtInt(value)}
        {warn && <AlertTriangle className={`h-5 w-5 ${AMBER}`} aria-label="warning: none found" />}
      </div>
      {note && <div className="text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

const CONTROL_GROUPS: [string, string[]][] = [
  ['G proteins', ['Galpha', 'Gbeta', 'Ggamma']],
  ['Housekeeping controls', ['TBP', 'RBP1']],
];

/** Control counts, G proteins and housekeeping genes apart; a zero count is flagged. */
function Controls({ index, data, active, onPick }: {
  index: SpeciesIndex; data: SpeciesPayload; active: string; onPick: (control: string) => void;
}) {
  const display = Object.fromEntries(index.controls.map(c => [c.key, c.display]));
  return (
    <Section title="Controls" hint={<>
      Genes present in almost all eukaryotes, found the same way as the GPCRs. A zero count (marked with a warning)
      can mean that the proteome is incomplete.</>}>
      <div className="flex flex-col gap-3 sm:flex-row">
        {CONTROL_GROUPS.map(([group, keys]) => (
          <div key={group} className="space-y-1" style={{ flex: keys.length }}>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{group}</div>
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${keys.length}, minmax(0, 1fr))` }}>
              {keys.map(k => {
                const n = data.controls[k] || 0;
                return <StatCard key={k} label={display[k] || k} value={n} active={active === k}
                                 onClick={n ? () => onPick(k) : undefined}
                                 warn={n ? undefined : `No ${display[k] || k} found in this proteome`} />;
              })}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/** The overall GPCR content of the genome: the potential GPCRs, what the filters removed and what is left,
 * then each lineage with its families. */
function Summary({ index, data, family, outcome, onPick }: {
  index: SpeciesIndex; data: SpeciesPayload; family: string; outcome: string;
  onPick: (family: string, outcome: string) => void;
}) {
  const removed = new Set(data.gpcr.filter(r => !passedTopology(r)).map(r => r[0]));
  const finals = new Set(data.gpcr.filter(keptAfterOverlap).map(r => r[0]));
  const removedOnly = [...removed].filter(a => !finals.has(a)).length;
  return (
    <Section title="GPCR content" hint={<>
      The GPCR families are grouped into the three main GPCR lineages, the Glutamate-, cAMP- and Rhodopsin-related
      receptors. STE2 (Class D) is shown apart.</>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Potential GPCRs" value={data.candidates} note="found by the GPCR family searches"
                  active={family === 'all' && outcome === 'all'} onClick={() => onPick('all', 'all')}
                  hint={<>Sequences found by the search for a GPCR family that group with the family&apos;s known
                    members in the tree of the search results.</>} />
        <StatCard label="Removed by the filters" value={removedOnly}
                  note="no seven-helix core, or a poor structural fit to the family"
                  active={family === 'all' && outcome === 'removed'} onClick={() => onPick('all', 'removed')}
                  hint={<>Sequences without a single seven-transmembrane-helix core, or whose predicted helices fit poorly
                    onto those of their family. We measure this fit with our topology score (see the Sequences
                    table); sequences scoring below {CUTOFF} were removed.</>} />
        <StatCard label="GPCRs" value={data.total}
                  active={family === 'all' && outcome === 'kept'} onClick={() => onPick('all', 'kept')}
                  note={`passed all checks · ${Object.keys(data.counts).length} of ${index.families.length} families`}
                  hint={<>Sequences that passed all checks. A sequence found by two family searches was assigned to
                    one family, so every sequence is counted once.</>} />
      </div>
      {index.lineages.map(lin => {
        const fams = index.families.filter(f => f.lineage === lin);
        const potentialOf = (keys: Set<string>) =>
          new Set(data.gpcr.filter(r => keys.has(listedFamily(r))).map(r => r[0])).size;
        const n = fams.reduce((a, f) => a + (data.counts[f.key] || 0), 0);
        const potential = potentialOf(new Set(fams.map(f => f.key)));
        return (
          <div key={lin} className="space-y-1 pt-1">
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs uppercase tracking-wide text-muted-foreground">
              {potential ? (
                <button type="button" onClick={() => onPick('lin:' + lin, 'all')}
                        className="font-bold uppercase tracking-wide text-foreground hover:underline">{lin}</button>
              ) : <span className="font-bold text-foreground">{lin}</span>}
              <span className="normal-case tracking-normal">
                {potential ? `${fmtInt(n)} GPCRs, of ${fmtInt(potential)} potential` : 'none found'}
              </span>
            </div>
            {potential > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {fams.map(f => {
                const pot = potentialOf(new Set([f.key]));
                // families without a single potential member get no box
                if (!pot) return null;
                return (
                  <StatCard key={f.key} compact label={f.display} value={data.counts[f.key] || 0} dim={!pot}
                            note={`of ${fmtInt(pot)} potential`}
                            onClick={pot ? () => onPick(f.key, 'all') : undefined} />
                );
              })}
            </div>}
          </div>
        );
      })}
    </Section>
  );
}

type SortColumn = 'accession' | 'gene' | 'protein' | 'family' | 'evalue' | 'core' | 'topology' | 'overlap' | 'final';
type SortState = { col: SortColumn; dir: 1 | -1 } | null;

/** A column header that sorts the table: first click ascending, second descending, third back to the default. */
export function SortTh<C extends string = SortColumn>({ col, sort, onSort, className = '', hint, children }: {
  col: C; sort: { col: C; dir: 1 | -1 } | null; onSort: (col: C) => void; className?: string;
  hint?: React.ReactNode; children: React.ReactNode;
}) {
  const on = sort?.col === col;
  const Icon = !on ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
  return (
    <th className={`px-3 py-2 ${className}`} aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <span className="inline-flex items-center gap-1">
        <button type="button" onClick={() => onSort(col)}
                className={`inline-flex cursor-pointer items-center gap-1 uppercase tracking-wide hover:text-foreground ${on ? 'text-foreground' : ''}`}>
          {children}
          <Icon className={`h-3 w-3 ${on ? '' : 'opacity-40'}`} aria-hidden />
        </button>
        {hint}
      </span>
    </th>
  );
}

function Mark({ ok }: { ok: boolean }) {
  return ok ? <Check className="inline h-4 w-4 text-emerald-600" /> : <X className={`inline h-4 w-4 ${RED}`} />;
}

export function downloadTsv(name: string, header: string[], rows: (string | number | null)[][]) {
  const text = [header, ...rows].map(r => r.map(v => (v === null ? '' : String(v))).join('\t')).join('\n') + '\n';
  const url = URL.createObjectURL(new Blob([text], { type: 'text/tab-separated-values' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function SpeciesViewer() {
  const searchParams = useSearchParams();
  const [index, setIndex] = useState<SpeciesIndex | null>(null);
  const [data, setData] = useState<SpeciesPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [family, setFamily] = useState('all');
  const [outcome, setOutcome] = useState('all');
  const [text, setText] = useState('');
  const [sort, setSort] = useState<SortState>(null);
  const onSort = (col: SortColumn) => setSort(cur =>
    !cur || cur.col !== col ? { col, dir: 1 } : cur.dir === 1 ? { col, dir: -1 } : null);
  const taxID = searchParams.get('taxid') || DEFAULT_TAXID;

  useEffect(() => {
    fetch(DATA_DIR + '/index.json')
      .then(r => { if (!r.ok) throw new Error('index ' + r.status); return r.json(); })
      .then(setIndex)
      .catch(e => setError(String(e)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${DATA_DIR}/species/${encodeURIComponent(taxID)}.json`)
      .then(r => { if (!r.ok) throw new Error('taxID ' + taxID + ' ' + r.status); return r.json(); })
      .then(d => { if (!cancelled) { setData(d); setFamily(searchParams.get('family') || 'all'); setOutcome('all'); setText(''); } })
      .catch(e => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taxID, searchParams]);

  const display = useMemo(() => {
    const m: Record<string, string> = {};
    index?.families.forEach(f => { m[f.key] = f.display; });
    index?.controls.forEach(c => { m[c.key] = c.display; });
    return m;
  }, [index]);
  const name = useCallback((k: string) => display[k] || k, [display]);
  const controlKeys = useMemo(() => new Set(index?.controls.map(c => c.key) || []), [index]);
  const lineageOf = useMemo(() => new Map(index?.families.map(f => [f.key, f.lineage]) || []), [index]);
  const famOrder = useMemo(() => new Map(index?.families.map((f, i) => [f.key, i]) || []), [index]);

  const rows = useMemo(() => {
    if (!data) return [] as GpcrRow[];
    const q = text.trim().toLowerCase();
    const test = (OUTCOMES.find(o => o[0] === outcome) || OUTCOMES[0])[2];
    const controlRows: GpcrRow[] = data.controlRows.map(c => [c[0], c[1], c[2], null, 'control', c[1], c[3], c[4], []]);
    const pool = family === 'ctl:all' || controlKeys.has(family) ? controlRows : data.gpcr;
    return pool
      .filter(r => family === 'all' || family === 'ctl:all' || listedFamily(r) === family
        || (family.startsWith('lin:') && lineageOf.get(listedFamily(r)) === family.slice(4)))
      .filter(r => r[4] === 'control' || test(r))
      .filter(r => !q || r[0].toLowerCase().includes(q) || r[6].toLowerCase().includes(q) || r[7].toLowerCase().includes(q))
      .sort((a, b) => (famOrder.get(listedFamily(a)) ?? 0) - (famOrder.get(listedFamily(b)) ?? 0)
        || evalueNumber(a[2]) - evalueNumber(b[2]));
  }, [data, family, outcome, text, famOrder, lineageOf, controlKeys]);

  const outcomeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    OUTCOMES.forEach(([k, , test]) => { c[k] = data ? data.gpcr.filter(test).length : 0; });
    return c;
  }, [data]);
  const listedFamilies = useMemo(
    () => (index && data ? index.families.filter(f => data.gpcr.some(r => listedFamily(r) === f.key)) : []),
    [index, data]);

  const overlapText = (r: GpcrRow) => {
    if (r[4] === 'dikarya') return `fungal sequence moved from Class A to ${name(r[5])}`;
    if (!r[8].length) return '';
    const others = r[8].map(name).join(', ');
    return r[4] === 'overlap' ? `also found by ${others}; given to ${name(r[5])}` : `also found by ${others}; kept here`;
  };
  const finalText = (r: GpcrRow) => {
    if (r[4] === 'core' || r[4] === 'topology') return 'removed';
    if (r[4] === 'dikarya') return `${name(r[5])} (from Class A)`;
    return name(r[5]);
  };

  // Rows in the order of the clicked column; without one, by family and then E-value (the order of `rows`).
  const sortedRows = (() => {
    if (!sort) return rows;
    const key = (r: GpcrRow): string | number => {
      switch (sort.col) {
        case 'accession': return r[0];
        case 'gene': return r[7].toLowerCase();
        case 'protein': return r[6].toLowerCase();
        case 'family': return famOrder.get(listedFamily(r)) ?? 1000 + (index?.controls.findIndex(c => c.key === r[1]) ?? 0);
        case 'evalue': return evalueNumber(r[2]);
        case 'core': return r[4] === 'control' ? 2 : passedCore(r) ? 1 : 0;
        case 'topology': return r[3] ?? Infinity;
        case 'overlap': return overlapText(r);
        case 'final': return finalText(r);
      }
    };
    return [...rows].sort((a, b) => {
      const ka = key(a), kb = key(b);
      // empty values stay at the end in both directions
      const ea = ka === '' || ka === Infinity, eb = kb === '' || kb === Infinity;
      if (ea !== eb) return ea ? 1 : -1;
      return (ka < kb ? -1 : ka > kb ? 1 : 0) * sort.dir;
    });
  })();

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">Could not load the data: {error}</p>}
      {loading && <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> loading…</span>}

      {data && index && (
        <>
          <h1 className="text-3xl font-bold"><i>{data.name}</i></h1>

          <Taxonomy data={data} />

          <Controls index={index} data={data} active={family} onPick={k => {
            setFamily(k);
            document.getElementById('sequences')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }} />

          <Summary index={index} data={data} family={family} outcome={outcome} onPick={(f, o) => {
            setFamily(f);
            setOutcome(o);
            document.getElementById('sequences')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }} />

          <div className="space-y-3">
            <h2 id="sequences" className="scroll-mt-4 text-lg font-bold">
              Sequences{' '}
              <ControlHint id="hint-sequences" label="About the sequence table">
                Each row is one sequence found by one family&apos;s search, so a sequence found by two families has two
                rows. Fungal sequences of the Class A search that phylogenies place with GPR1 are listed under GPR1.
              </ControlHint>{' '}
              <span className="text-sm font-normal text-muted-foreground">
                {family === 'ctl:all' || controlKeys.has(family)
                  ? `showing ${fmtInt(rows.length)} of ${fmtInt(data.controlRows.length)} control sequences`
                  : `showing ${fmtInt(rows.length)} of ${fmtInt(data.gpcr.length)} potential GPCR rows`}
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <Select value={family} onValueChange={setFamily}>
                <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All families</SelectItem>
                  {index.lineages.filter(l => listedFamilies.some(f => f.lineage === l)).map(l => (
                    <SelectItem key={'lin:' + l} value={'lin:' + l}>{l} (all)</SelectItem>
                  ))}
                  {listedFamilies.map(f => <SelectItem key={f.key} value={f.key}>{f.display}</SelectItem>)}
                  {data.controlRows.length > 0 && <SelectItem value="ctl:all">Controls (all)</SelectItem>}
                  {index.controls.filter(c => data.controls[c.key]).map(c => (
                    <SelectItem key={c.key} value={c.key}>{c.display} (control)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label} ({fmtInt(outcomeCounts[k])})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input className="w-64" value={text} onChange={e => setText(e.target.value)}
                     placeholder="Accession, gene or protein name" />
              <FastaDownloadButton count={sortedRows.length}
                detail={`The ${fmtInt(sortedRows.length)} sequences of the table as shown (filters and search applied), ` +
                  'full length (UniProtKB 2025_02), one FASTA per family in a ZIP file'}
                download={onProgress => downloadSequencesZip({
                  taxid: data.taxID,
                  name: `${data.name.replace(/\W+/g, '_')}_${data.taxID}`,
                  groups: groupRows(sortedRows, r => name(listedFamily(r))),
                  onProgress,
                })} />
              <Button variant="outline" size="sm" onClick={() => downloadTsv(
                `${data.name.replace(/\W+/g, '_')}_${data.taxID}_potential_GPCRs.tsv`,
                ['accession', 'gene', 'protein', 'family', 'search', 'search_evalue', 'single_7TM_core',
                 'topology_score', 'overlap', 'final_family'],
                sortedRows.map(r => [r[0], r[7], r[6], name(listedFamily(r)), name(r[1]), r[2], passedCore(r) ? 'yes' : 'no',
                               r[3], overlapText(r), finalText(r)]))}>
                <Download className="mr-1 h-4 w-4" /> TSV
              </Button>
            </div>
            <div className="max-h-[640px] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <SortTh col="accession" sort={sort} onSort={onSort}>Accession</SortTh>
                    <SortTh col="gene" sort={sort} onSort={onSort}>Gene</SortTh>
                    <SortTh col="protein" sort={sort} onSort={onSort}>Protein</SortTh>
                    <SortTh col="family" sort={sort} onSort={onSort}>Family</SortTh>
                    <SortTh col="evalue" sort={sort} onSort={onSort} className="text-right" hint={
                      <ControlHint id="hint-evalue" label="About the E-value">
                        How strongly the sequence matched the family&apos;s search; the lower, the stronger the match.
                      </ControlHint>}>Search E-value</SortTh>
                    <SortTh col="core" sort={sort} onSort={onSort} className="text-center">Seven-helix core</SortTh>
                    <SortTh col="topology" sort={sort} onSort={onSort} className="text-right" hint={
                      <ControlHint id="hint-topology" label="About the topology score">
                        A score we devised for how well the sequence fits its family structurally: in the
                        family&apos;s alignment, how closely the sequence&apos;s predicted transmembrane helices
                        overlap the family&apos;s consensus helices, averaged over the helices (0, no overlap; 1,
                        complete). We removed sequences scoring below {CUTOFF}. Only sequences with a seven-helix
                        core are scored.
                      </ControlHint>}>Topology score</SortTh>
                    <SortTh col="overlap" sort={sort} onSort={onSort}>Overlap</SortTh>
                    <SortTh col="final" sort={sort} onSort={onSort}>Final family</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map(r => (
                    <tr key={r[0] + r[1]} className="border-t">
                      <td className="px-3 py-1 font-mono text-xs">
                        <a className="underline decoration-dotted" target="_blank" rel="noreferrer"
                           href={`https://www.uniprot.org/uniprotkb/${r[0]}/entry`}>{r[0]}</a>
                      </td>
                      <td className="px-3 py-1 text-xs">{r[7]}</td>
                      <td className="max-w-[280px] truncate px-3 py-1 text-xs" title={r[6]}>{r[6]}</td>
                      <td className="px-3 py-1">{name(listedFamily(r))}</td>
                      <td className="px-3 py-1 text-right font-mono text-xs tabular-nums"
                          title={`E-value in the ${name(r[1])} search`}>
                        {r[2]}{r[4] === 'dikarya' ? <span className="ml-1 font-sans text-muted-foreground">(Class A)</span> : null}
                      </td>
                      <td className="px-3 py-1 text-center">
                        {r[4] === 'control' ? <span className="text-muted-foreground">–</span> : <Mark ok={passedCore(r)} />}
                      </td>
                      <td className={`px-3 py-1 text-right tabular-nums ${r[4] === 'topology' ? `font-semibold ${RED}` : ''}`}>
                        {r[3] === null ? '–' : r[3].toFixed(3)}
                      </td>
                      <td className={`px-3 py-1 text-xs ${r[4] === 'overlap' || r[4] === 'dikarya' ? AMBER : 'text-muted-foreground'}`}>
                        {overlapText(r)}
                      </td>
                      <td className={`px-3 py-1 text-xs ${r[4] === 'core' || r[4] === 'topology' ? RED
                        : r[4] === 'kept' ? '' : r[4] === 'control' ? 'text-muted-foreground' : AMBER}`}>{finalText(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>


          <details className="group rounded-lg border">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold">
              Pipeline processing stats{' '}
              <ControlHint id="hint-steps" label="About the filtering steps">
                Found: sequences found by the family&apos;s search. One seven-helix core: those with a single
                seven-transmembrane-helix core. Good structural fit: those whose predicted helices fit those of their
                family (our topology score of at least {CUTOFF}). Overlaps resolved: a sequence found by two families
                is kept in one of them. Final: fungal sequences of the Class A search that phylogenies place with GPR1
                are moved to GPR1. A sequence found by two families is counted in both until overlaps are resolved.
                Click a family to list its sequences in the table above.
              </ControlHint>
            </summary>
            <div className="px-4 pb-4">
              <PipelineTable index={index} data={data} onPick={f => {
                setFamily(f);
                setOutcome('all');
                document.getElementById('sequences')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
