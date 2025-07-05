'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Slider } from '@/components/ui/slider';
import { useState, useRef, useEffect, memo } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2} from 'lucide-react';
import receptors from '../../../../public/receptors.json';

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
} from '@tanstack/react-table';

// ─── Client-side data processing functions ───────────────────────────────────

const highScorePairs = new Set([
  'R-K',
  'N-B',
  'D-B',
  'Q-E',
  'Q-Z',
  'E-Z',
  'H-Y',
  'I-V',
  'I-J',
  'L-M',
  'L-J',
  'M-J',
  'F-Y',
  'W-Y',
  'V-J',
]);

function blosum80Score(aa1: string, aa2: string): number {
  if (!aa1 || !aa2 || aa1 === '-' || aa2 === '-') {
    return -1;
  }
  const processedAa1 = aa1.includes('/') ? aa1.split('/')[0] : aa1;
  const processedAa2 = aa2.includes('/') ? aa2.split('/')[0] : aa2;
  if (processedAa1 === processedAa2) return 3;
  const pair = `${processedAa1}-${processedAa2}`;
  const reversePair = `${processedAa2}-${processedAa1}`;
  if (highScorePairs.has(pair) || highScorePairs.has(reversePair)) return 2;
  return 1;
}

async function readFastaFile(fastaFilePath: string): Promise<Record<string, string>> {
  const response = await fetch(fastaFilePath);
  if (!response.ok) {
    throw new Error(`Failed to fetch FASTA file: ${response.status}`);
  }
  
  const fastaData = await response.text();
  const sequences: Record<string, string> = {};
  let currentHeader: string | null = null;

  fastaData.split('\n').forEach(line => {
    if (line.startsWith('>')) {
      const parts = line.slice(1).trim().split('|');
      if (parts.length >= 3) {
        const genePart = parts[2].split('_')[0];
        currentHeader = genePart;
        sequences[currentHeader] = '';
      } else {
        console.warn(`Unexpected FASTA header format: ${line}`);
        currentHeader = null;
      }
    } else if (currentHeader) {
      sequences[currentHeader] += line.trim();
    }
  });

  return sequences;
}

async function readConservationData(
  conservationFilePath: string
): Promise<Record<string, { conservation: number; aa: string }>> {
  const response = await fetch(conservationFilePath);
  if (!response.ok) {
    throw new Error(`Failed to fetch conservation file: ${response.status}`);
  }
  
  const data = await response.text();
  const conservationData: Record<string, { conservation: number; aa: string }> = {};

  data.split('\n').forEach(line => {
    const [resNum, conservation, aa] = line.split('\t');
    if (resNum && conservation && aa) {
      conservationData[resNum.trim()] = {
        conservation: parseFloat(conservation.trim()),
        aa: aa.trim(),
      };
    }
  });

  return conservationData;
}

function mapResidues(seq1: string, seq2: string): Array<{ resNum1: string; resNum2: string }> {
  const mappedResidues: Array<{ resNum1: string; resNum2: string }> = [];
  let resNum1 = 0;
  let resNum2 = 0;

  for (let i = 0; i < seq1.length; i++) {
    const aa1 = seq1[i];
    const aa2 = seq2[i];
    let currentResNum1 = 'gap';
    let currentResNum2 = 'gap';

    if (aa1 !== '-') {
      resNum1 += 1;
      currentResNum1 = resNum1.toString();
    }
    if (aa2 !== '-') {
      resNum2 += 1;
      currentResNum2 = resNum2.toString();
    }

    if (aa1 !== '-' || aa2 !== '-') {
      mappedResidues.push({
        resNum1: currentResNum1,
        resNum2: currentResNum2,
      });
    }
  }

  return mappedResidues;
}

function mapAllData(
  gene1Data: Record<string, { conservation: number; aa: string }>,
  gene2Data: Record<string, { conservation: number; aa: string }>,
  seq1: string,
  seq2: string
) {
  const mappedResidues = mapResidues(seq1, seq2);
  const resNums1: string[] = [];
  const resNums2: string[] = [];
  const percList1: number[] = [];
  const percList2: number[] = [];
  const aaList1: string[] = [];
  const aaList2: string[] = [];

  mappedResidues.forEach(({ resNum1, resNum2 }) => {
    let perc1 = 0;
    let perc2 = 0;
    let aa1 = '-';
    let aa2 = '-';

    if (resNum1 !== 'gap') {
      const data1 = gene1Data[resNum1];
      if (data1) {
        perc1 = data1.conservation;
        aa1 = data1.aa;
      }
    }
    if (resNum2 !== 'gap') {
      const data2 = gene2Data[resNum2];
      if (data2) {
        perc2 = data2.conservation;
        aa2 = data2.aa;
      }
    }

    resNums1.push(resNum1);
    resNums2.push(resNum2);
    percList1.push(perc1);
    percList2.push(perc2);
    aaList1.push(aa1);
    aaList2.push(aa2);
  });

  return { resNums1, resNums2, percList1, percList2, aaList1, aaList2 };
}

function categorizeResidues(
  resNums1: string[],
  resNums2: string[],
  percList1: number[],
  percList2: number[],
  aaList1: string[],
  aaList2: string[],
  threshold: number
) {
  const categorizedResidues: Array<{
    category: string;
    resNum1: string;
    aa1: string;
    perc1: number;
    resNum2: string;
    aa2: string;
    perc2: number;
  }> = [];

  for (let i = 0; i < percList1.length; i++) {
    const isGap1 = resNums1[i] === 'gap';
    const isGap2 = resNums2[i] === 'gap';

    if (isGap1 && isGap2) continue;

    if (!isGap1 && !isGap2) {
      const conserved1 = percList1[i] >= threshold;
      const conserved2 = percList2[i] >= threshold;

      if (conserved1 && conserved2) {
        const similarity = blosum80Score(aaList1[i], aaList2[i]);
        if (similarity > 1) {
          categorizedResidues.push({
            category: 'common',
            resNum1: resNums1[i],
            aa1: aaList1[i],
            perc1: percList1[i],
            resNum2: resNums2[i],
            aa2: aaList2[i],
            perc2: percList2[i],
          });
        } else {
          categorizedResidues.push({
            category: 'specific_both',
            resNum1: resNums1[i],
            aa1: aaList1[i],
            perc1: percList1[i],
            resNum2: resNums2[i],
            aa2: aaList2[i],
            perc2: percList2[i],
          });
        }
      } else if (conserved1 && !conserved2) {
        categorizedResidues.push({
          category: 'specific1',
          resNum1: resNums1[i],
          aa1: aaList1[i],
          perc1: percList1[i],
          resNum2: resNums2[i],
          aa2: aaList2[i],
          perc2: percList2[i],
        });
      } else if (!conserved1 && conserved2) {
        categorizedResidues.push({
          category: 'specific2',
          resNum1: resNums1[i],
          aa1: aaList1[i],
          perc1: percList1[i],
          resNum2: resNums2[i],
          aa2: aaList2[i],
          perc2: percList2[i],
        });
      }
    } else if (!isGap1 && isGap2) {
      if (percList1[i] >= threshold) {
        categorizedResidues.push({
          category: 'specific1',
          resNum1: resNums1[i],
          aa1: aaList1[i],
          perc1: percList1[i],
          resNum2: 'gap',
          aa2: '-',
          perc2: 0,
        });
      }
    } else if (isGap1 && !isGap2) {
      if (percList2[i] >= threshold) {
        categorizedResidues.push({
          category: 'specific2',
          resNum1: 'gap',
          aa1: '-',
          perc1: 0,
          resNum2: resNums2[i],
          aa2: aaList2[i],
          perc2: percList2[i],
        });
      }
    }
  }

  return categorizedResidues;
}

// ─── Original component code continues ───────────────────────────────────────

const formSchema = z.object({
  receptor1: z.string().min(1, 'Required'),
  receptor2: z.string().min(1, 'Required'),
  threshold: z.number().min(0).max(100),
});

interface Receptor {
  geneName: string;
  class: string;
  numOrthologs: number;
  lca: string;
  gpcrdbId: string;
  snakePlot: string;
  name: string;
  conservationFile: string;
}

interface CategorizedResidue {
  category: string;
  resNum1: string;
  aa1: string;
  perc1: number;
  resNum2: string;
  aa2: string;
  perc2: number;
}

interface ComparisonResult {
  receptor1: Receptor;
  receptor2: Receptor;
  categorizedResidues: CategorizedResidue[];
}

const categoryLabels = {
  common: 'Common Residues',
  specific_both: 'Specifically Conserved for Both',
  specific1: 'Specifically Conserved for Receptor 1',
  specific2: 'Specifically Conserved for Receptor 2',
};

const categoryOrder = {
  common: 0,
  specific_both: 1,
  specific1: 2,
  specific2: 3,
};

const columnHelper = createColumnHelper<CategorizedResidue>();

interface ColumnMeta {
  parentColumn?: string;
}

interface ResultsTableProps {
  fetchData: (values: z.infer<typeof formSchema>) => Promise<void>;
  initialResult: ComparisonResult | null;
}

const ResultsTable = memo(function ResultsTable({ initialResult }: ResultsTableProps) {
  const [result, setResult] = useState<ComparisonResult | null>(initialResult);
  const [sorting, setSorting] = useState<SortingState>([
    {
      id: 'category',
      desc: false,
    },
  ]);
  
  useEffect(() => {
    setResult(initialResult);
  }, [initialResult]);

// ─── Snake-plot logic ──────────────────────────────────────────
const adaptBaseText = (raw: string): string => {
  if (!raw) return '';
  let txt = raw.trim().replace(/\s+/g, ' ');
  txt = txt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return txt.replace(/\|/g, '<br>');
};

// Which receptor's plot to show (1 or 2)
const [showReceptor, setShowReceptor] = useState<1 | 2>(1);

// Category → colour map
const [colorMap, setColorMap] = useState<Record<string, string>>({
  'Common Residues': '#E6E6FA',
  'Specifically Conserved for Both': '#A85638',
  'Specifically Conserved for Receptor 1': '#FFF9C2',
  'Specifically Conserved for Receptor 2': '#8F9871',
});

// Tooltip overlay data
const [tooltip, setTooltip] = useState<{
  visible: boolean;
  x: number;
  y: number;
  lines: string[];
}>({ visible: false, x: 0, y: 0, lines: [] });

// Where the fetched SVG goes
const snakeWrapperRef = useRef<HTMLDivElement>(null);

// Re-fetch / recolour plot whenever inputs change
useEffect(() => {
  if (!result) return;

  const receptor  = showReceptor === 1 ? result.receptor1 : result.receptor2;
  if (!receptor.snakePlot) return;

  const container = snakeWrapperRef.current!;
  container.innerHTML = '';            // ← wipe any previous plot immediately

  // normalise URL (works inside /public)
  let url = receptor.snakePlot.replace('/tools/snakeplots/', '/snakeplots/');
  if (!url.startsWith('/')) url = '/' + url;

  // AbortController lets us cancel this fetch if the effect re-runs
  const ctrl = new AbortController();

  fetch(url, { signal: ctrl.signal })
    .then(r => {
      if (!r.ok) throw new Error(`Failed to load SVG (${r.status})`);
      return r.text();
    })
    .then(svg => {
      container.innerHTML = svg;

      /* ───── strip stray elements ───── */
      container.querySelector(':scope > title')?.remove();
      container.querySelector(':scope > meta[charset]')?.remove();
      container.querySelector(':scope > h2')?.remove();
      container.querySelectorAll('text')
               .forEach(t => t.setAttribute('pointer-events', 'none'));

      /* ───── colour circles by category ───── */
      result.categorizedResidues.forEach(row => {
        const pos = showReceptor === 1 ? row.resNum1 : row.resNum2;
        if (pos === 'gap') return;
        const label = categoryLabels[row.category as keyof typeof categoryLabels];
        const fill  = colorMap[label];
        const circle = container.querySelector<SVGCircleElement>(`circle[id="${pos}"]`);
        if (circle) {
          circle.setAttribute('fill', fill);
          circle.setAttribute('data-snake-category', label);
        }
      });

      /* ───── wire tool-tips ───── */
      const circles = Array.from(container.querySelectorAll<SVGCircleElement>('circle[id]'));

      const onOver = (e: MouseEvent) => {
        const c        = e.currentTarget as SVGCircleElement;
        const rawText  = c.getAttribute('data-original-title') ?? c.getAttribute('title') ?? '';
        const baseText = adaptBaseText(rawText);
        const label    = c.getAttribute('data-snake-category') ?? '';
        setTooltip({
          visible: true,
          x: e.clientX,
          y: e.clientY,
          lines: label ? [baseText, `Category: ${label}`] : [baseText],
        });
      };
      const onMove  = (e: MouseEvent) =>
        setTooltip(t => ({ ...t, x: e.clientX, y: e.clientY }));
      const onLeave = () => setTooltip(t => ({ ...t, visible: false }));

      circles.forEach(c => {
        c.addEventListener('mouseover', onOver);
        c.addEventListener('mousemove', onMove);
        c.addEventListener('mouseleave', onLeave);
      });

      /* ───── clean-up when effect re-runs or component unmounts ───── */
      return () => {
        ctrl.abort();                  // cancel fetch if still running
        container.innerHTML = '';      // make sure plot is gone
        circles.forEach(c => {
          c.removeEventListener('mouseover', onOver);
          c.removeEventListener('mousemove', onMove);
          c.removeEventListener('mouseleave', onLeave);
        });
      };
    })
    .catch(err => {
      if (err.name === 'AbortError') return;   // fetch was cancelled – no worries
      console.error(err);
      container.innerHTML =
        '<p class="text-red-500">Failed to load snake plot.</p>';
    });

  // clean-up for the *first* run (if fetch resolves successfully,
  // the inner clean-up returned above will take over)
  return () => {
    ctrl.abort();
    container.innerHTML = '';
  };
}, [result, showReceptor, colorMap]);

  const columns = [
    columnHelper.accessor('resNum1', {
      header: () => <div className="text-center font-medium">Residue</div>,
      cell: info => (
        <div className="font-mono">
          {info.row.original.resNum1 !== 'gap'
            ? `${info.row.original.resNum1}`
            : '-'}
        </div>
      ),
      meta: {
        parentColumn: result?.receptor1.geneName,
      } as ColumnMeta,
    }),
    columnHelper.accessor('aa1', {
      header: () => <div className="text-center font-medium">Conserved AA</div>,
      cell: info => (
        <div className="font-mono text-center">
          {info.row.original.resNum1 !== 'gap' ? info.getValue() : '-'}
        </div>
      ),
      meta: {
        parentColumn: result?.receptor1.geneName,
      } as ColumnMeta,
    }),
    columnHelper.accessor('perc1', {
      header: () => <div className="text-center font-medium">Conservation %</div>,
      cell: info => <div className="text-center">{info.getValue().toFixed(2)}%</div>,
      meta: {
        parentColumn: result?.receptor1.geneName,
      } as ColumnMeta,
    }),
    columnHelper.accessor('resNum2', {
      header: () => <div className="text-center font-medium">Residue</div>,
      cell: info => (
        <div className="font-mono">
          {info.row.original.resNum2 !== 'gap'
            ? `${info.row.original.resNum2}`
            : '-'}
        </div>
      ),
      meta: {
        parentColumn: result?.receptor2.geneName,
      } as ColumnMeta,
    }),
    columnHelper.accessor('aa2', {
      header: () => <div className="text-center font-medium">Conserved AA</div>,
      cell: info => (
        <div className="font-mono text-center">
          {info.row.original.resNum2 !== 'gap' ? info.getValue() : '-'}
        </div>
      ),
      meta: {
        parentColumn: result?.receptor2.geneName,
      } as ColumnMeta,
    }),
    columnHelper.accessor('perc2', {
      header: () => <div className="text-center font-medium">Conservation %</div>,
      cell: info => <div className="text-center">{info.getValue().toFixed(2)}%</div>,
      meta: {
        parentColumn: result?.receptor2.geneName,
      } as ColumnMeta,
    }),
    columnHelper.accessor('category', {
      header: 'Category',
      cell: info => categoryLabels[info.getValue() as keyof typeof categoryLabels],
      sortingFn: (rowA, rowB) => {
        const categoryA = rowA.getValue('category') as keyof typeof categoryOrder;
        const categoryB = rowB.getValue('category') as keyof typeof categoryOrder;
        return categoryOrder[categoryA] - categoryOrder[categoryB];
      },
    }),
  ];

  const table = useReactTable({
    data: result?.categorizedResidues ?? [],
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
      <h2 className="text-xl font-semibold mb-4">Results</h2>
      {/* ─── Export buttons (place just above the <Table> element) ───────────────── */}
        <div className="flex justify-end gap-2 mb-4">
          {(['tsv', 'csv'] as const).map(ext => (
            <Button
              key={ext}
              variant="outline"
              size="sm"
              onClick={() => {
                if (!result) return;

                const delimiter = ext === 'csv' ? ',' : '\t';

                // Header row
                const headers = [
                  'Residue1',
                  'AA1',
                  'Perc1',
                  'Residue2',
                  'AA2',
                  'Perc2',
                  'Category',
                ];

                // Body rows
                const rows = result.categorizedResidues.map(r => [
                  r.resNum1,
                  r.aa1,
                  r.perc1.toFixed(2),
                  r.resNum2,
                  r.aa2,
                  r.perc2.toFixed(2),
                  categoryLabels[r.category as keyof typeof categoryLabels],
                ]);

                // Join rows → file text
                const fileText = [headers, ...rows]
                  .map(cols => cols.join(delimiter))
                  .join('\n');

                // Trigger download
                const blob = new Blob([fileText], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `residue_comparison.${ext}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
            >
              {`Download ${ext.toUpperCase()}`}
            </Button>
          ))}
        </div>
      <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
        
        <Table>
          <TableHeader>
            <TableRow>
              {table.getHeaderGroups()[0].headers.map(header => {
                const parentColumn = (header.column.columnDef.meta as ColumnMeta)?.parentColumn;
                if (parentColumn) {
                  return (
                    <TableHead
                      key={header.id}
                      className={`
                      sticky top-0 bg-card z-10
                      ${header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
                    `}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <div className="text-xs text-muted-foreground">{parentColumn}</div>
                        <div className="flex items-center justify-center gap-2">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{
                            asc: ' 🔼',
                            desc: ' 🔽',
                          }[header.column.getIsSorted() as string] ?? null}
                        </div>
                      </div>
                    </TableHead>
                  );
                }
                return null;
              })}
              {table.getHeaderGroups()[0].headers.map(header => {
                if (header.column.id === 'category') {
                  return (
                    <TableHead
                      key={header.id}
                      className={`
                      sticky top-0 bg-card z-10
                      ${header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
                    `}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center justify-center gap-2">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: ' 🔼',
                          desc: ' 🔽',
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    </TableHead>
                  );
                }
                return null;
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row, index) => (
              <TableRow key={row.id} className={index % 2 === 0 ? 'bg-muted/50' : ''}>
                {row.getVisibleCells().map(cell => (
                  <TableCell key={cell.id} className="text-center">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      

      {/* ─── Snake-plot title + toggles ────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between pt-4 mb-4 gap-2">
        <h2 className="text-xl font-semibold">Snake Plot Visualization</h2>

        <div className="flex gap-2">
          {/* Receptor 1 toggle */}
          <Button
            /* 👇  ACTIVE = secondary  |  INACTIVE = default  */
            variant={showReceptor === 1 ? 'secondary' : 'default'}
            onClick={() => setShowReceptor(1)}
          >
            Show Snake Plot for {result?.receptor1.geneName}
          </Button>

          {/* Receptor 2 toggle */}
          <Button
            variant={showReceptor === 2 ? 'secondary' : 'default'}
            onClick={() => setShowReceptor(2)}
          >
            Show Snake Plot for {result?.receptor2.geneName}
          </Button>
        </div>
      </div>



      {/* ─── Snake‐plot container ─────────────────────────────────── */}
      <div ref={snakeWrapperRef} className="w-full mb-6">
        {/* The fetched SVG/HTML will appear here */}
      </div>
      
       {/* ─── Colour legend & customisation ─────────────────────── */}
      <div className="flex flex-wrap gap-x-10 gap-y-4 mt-4">
        {Object.entries(colorMap).map(([label, col]) => (
          <label           // make the whole thing clickable
            key={label}
            className="flex items-center gap-2 min-w-[12rem]" // text and box in one line
          >
            <input
              type="color"
              value={col}
              onChange={e => setColorMap(m => ({ ...m, [label]: e.target.value }))}
              className="h-5 w-5 cursor-pointer border rounded-sm"  // square swatch
            />
            <span className="text-sm whitespace-nowrap leading-tight">
              {label}
            </span>
          </label>
        ))}
      </div>


      {/* ───── Tooltip overlay (mobile-friendly) ───── */}
      {tooltip.visible && (
        <div
          className="fixed z-40 pointer-events-none bg-white dark:bg-black dark:text-white text-xs sm:text-sm rounded border border-gray-300 px-1 py-0.5 sm:px-2 sm:py-1 max-w-xs sm:max-w-sm break-words leading-tight sm:leading-normal"
          style={{
            left: Math.min(tooltip.x + 10, window.innerWidth - 200),
            top: Math.max(tooltip.y - 40, 10),
          }}
        >
          {tooltip.lines.map((line, i) => (
            <div key={i} dangerouslySetInnerHTML={{ __html: line }} />
          ))}
        </div>
      )}
    </div>

  );
});

export default function ReceptorComparisonPage() {
  const [searchResults1, setSearchResults1] = useState<Receptor[]>([]);
  const [searchResults2, setSearchResults2] = useState<Receptor[]>([]);
  const [hasSearched1, setHasSearched1] = useState(false);
  const [hasSearched2, setHasSearched2] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialResult, setInitialResult] = useState<ComparisonResult | null>(null);
  const scrollPositionRef = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      scrollPositionRef.current = window.scrollY;
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (initialResult) {
      window.scrollTo(0, scrollPositionRef.current);
    }
  }, [initialResult]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      receptor1: '',
      receptor2: '',
      threshold: 90,
    },
  });

  const receptor1 = useWatch({
    control: form.control,
    name: 'receptor1',
  });

  const receptor2 = useWatch({
    control: form.control,
    name: 'receptor2',
  });

  const handleSearch1 = (value: string) => {
    if (!value.trim()) {
      setSearchResults1([]);
      setHasSearched1(false);
      return;
    }

    setHasSearched1(true);
    const term = value.toLowerCase();
    const results = receptors
      .filter(
        (receptor: Receptor) =>
          receptor.geneName.toLowerCase().includes(term) || receptor.name.toLowerCase().includes(term)
      )
      .slice(0, 10);

    setSearchResults1(results);
  };

  const handleSearch2 = (value: string) => {
    if (!value.trim()) {
      setSearchResults2([]);
      setHasSearched2(false);
      return;
    }

    setHasSearched2(true);
    const term = value.toLowerCase();
    const results = receptors
      .filter(
        (receptor: Receptor) =>
          receptor.geneName.toLowerCase().includes(term) || receptor.name.toLowerCase().includes(term)
      )
      .slice(0, 10);

    setSearchResults2(results);
  };

  async function fetchData(values: z.infer<typeof formSchema>, showLoading = true) {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const { receptor1, receptor2, threshold } = values;

      if (!receptor1 || !receptor2) {
        throw new Error('Both receptor1 and receptor2 parameters are required');
      }

      // Find matching entries
      const rec1 = receptors.find(r => r.geneName.toLowerCase() === receptor1.toLowerCase());
      const rec2 = receptors.find(r => r.geneName.toLowerCase() === receptor2.toLowerCase());

      if (!rec1 || !rec2) {
        throw new Error('One or both receptors not found in the database');
      }

      // Require same class
      if (rec1.class !== rec2.class) {
        throw new Error('Receptors must belong to the same class');
      }

      // Load aligned sequences
      const fastaFilePath = `/alignments/class${rec1.class}_humans_MSA.fasta`;
      const sequences = await readFastaFile(fastaFilePath);
      const seq1 = sequences[rec1.geneName];
      const seq2 = sequences[rec2.geneName];

      if (!seq1 || !seq2) {
        throw new Error('Could not find sequences for one or both receptors');
      }

      // Load conservation data
      const gene1Data = await readConservationData(rec1.conservationFile);
      const gene2Data = await readConservationData(rec2.conservationFile);

      // Map and categorize
      const { resNums1, resNums2, percList1, percList2, aaList1, aaList2 } = mapAllData(
        gene1Data,
        gene2Data,
        seq1,
        seq2
      );
      const categorizedResidues = categorizeResidues(
        resNums1,
        resNums2,
        percList1,
        percList2,
        aaList1,
        aaList2,
        threshold ?? 90
      );

      const result = {
        receptor1: rec1,
        receptor2: rec2,
        categorizedResidues,
      };

      setInitialResult(result);
    } catch (error) {
      console.error('Error processing request:', error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }

  async function onSubmit(values: z.infer<typeof formSchema>) {
    await fetchData(values, true);
  }

  async function updateThreshold(values: z.infer<typeof formSchema>) {
    scrollPositionRef.current = window.scrollY;
    await fetchData(values, false);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-4">
      <h1 className="text-3xl font-bold text-left">Differential Residue Conservation</h1>
      <p className="text-lg text-muted-foreground text-left">
        Enter two GPCR gene names from the same class and set a conservation threshold (0–100%).
        This tool will identify residues that are commonly and specifically conserved in each
        receptor, and render both an interactive results table and a snake plot visualization.
      </p>
      <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="receptor1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Receptor 1 Name</FormLabel>
                  <FormControl>
                    <Command shouldFilter={false} className="rounded-lg border shadow-md">
                      <CommandInput
                        placeholder="Search for receptor 1..."
                        onValueChange={value => {
                          handleSearch1(value);
                          field.onChange(value);
                        }}
                        value={field.value}
                      />
                      {hasSearched1 && (
                        <CommandList
                          className={
                            searchResults1.length > 5 ? 'max-h-[300px] overflow-y-auto' : ''
                          }
                        >
                          {searchResults1.length === 0 ? (
                            <CommandEmpty>No results found.</CommandEmpty>
                          ) : (
                            <CommandGroup>
                              {searchResults1.map((receptor, index) => (
                                <CommandItem
                                  key={index}
                                  value={`${receptor.geneName} ${receptor.name}`}
                                  className="cursor-pointer"
                                  onSelect={() => {
                                    field.onChange(receptor.geneName);
                                    setSearchResults1([]);
                                    setHasSearched1(false);
                                  }}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-medium">{`${receptor.geneName} - ${receptor.name}`}</span>
                                    <span className="text-sm text-muted-foreground">
                                      Class: {receptor.class} | Orthologs: {receptor.numOrthologs} |
                                      LCA: {receptor.lca}
                                    </span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      )}
                    </Command>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="receptor2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Receptor 2 Name</FormLabel>
                  <FormControl>
                    <Command shouldFilter={false} className="rounded-lg border shadow-md">
                      <CommandInput
                        placeholder="Search for receptor 2..."
                        onValueChange={value => {
                          handleSearch2(value);
                          field.onChange(value);
                        }}
                        value={field.value}
                      />
                      {hasSearched2 && (
                        <CommandList
                          className={
                            searchResults2.length > 5 ? 'max-h-[300px] overflow-y-auto' : ''
                          }
                        >
                          {searchResults2.length === 0 ? (
                            <CommandEmpty>No results found.</CommandEmpty>
                          ) : (
                            <CommandGroup>
                              {searchResults2.map((receptor, index) => (
                                <CommandItem
                                  key={index}
                                  value={`${receptor.geneName} ${receptor.name}`}
                                  className="cursor-pointer"
                                  onSelect={() => {
                                    field.onChange(receptor.geneName);
                                    setSearchResults2([]);
                                    setHasSearched2(false);
                                  }}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-medium">{`${receptor.geneName} - ${receptor.name}`}</span>
                                    <span className="text-sm text-muted-foreground">
                                      Class: {receptor.class} | Orthologs: {receptor.numOrthologs} |
                                      LCA: {receptor.lca}
                                    </span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      )}
                    </Command>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="threshold"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conservation Threshold: {field.value}%</FormLabel>
                  <FormControl>
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={[field.value]}
                      onValueChange={value => {
                        field.onChange(value[0]);
                        if (receptor1 && receptor2) {
                          updateThreshold({
                            receptor1,
                            receptor2,
                            threshold: value[0],
                          });
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                'Compare Receptors'
              )}
            </Button>
          </form>
        </Form>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {initialResult && (
        <div className="space-y-6">
          <ResultsTable fetchData={fetchData} initialResult={initialResult} />
        </div>
      )}
    </div>
  );
}
