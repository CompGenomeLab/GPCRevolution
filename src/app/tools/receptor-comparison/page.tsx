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

    // ─── Snake‐plot logic ───────────────────────────────────────
  // Which receptor’s plot to show (1 or 2)
  const [showReceptor, setShowReceptor] = useState<1|2>(1);

  // Category → color map (defaults from your old JS)
  const [colorMap, setColorMap] = useState<Record<string,string>>({
    'Common Residues': '#E6E6FA',
    'Specifically Conserved for Both': '#A85638',
    'Specifically Conserved for Receptor 1': '#FFF9C2',
    'Specifically Conserved for Receptor 2': '#8F9871',
  });

  
  // Tooltip state for hover popups
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    lines: string[];
  }>({ visible: false, x: 0, y: 0, lines: [] });

  // Where to inject the raw SVG/HTML
  const snakeWrapperRef = useRef<HTMLDivElement>(null);

  // Whenever result, showReceptor or colors change, (re)fetch & recolor
  useEffect(() => {
  if (!result) return;
  const receptor = showReceptor === 1 ? result.receptor1 : result.receptor2;
  if (!receptor.snakePlot) return;

  const container = snakeWrapperRef.current!;
  container.innerHTML = '';

  // Re-route URL
  let url = receptor.snakePlot;
  if (url.startsWith('/tools/snakeplots/')) {
    url = url.replace('/tools/snakeplots/', '/snakeplots/');
  }
  if (!url.startsWith('/')) {
    url = '/' + url;
  }

  // Fetch, inject, recolor, and wire tooltips
  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`Failed to load SVG (${res.status})`);
      return res.text();
    })
    .then(svgText => {
      container.innerHTML = svgText;
      // 1️⃣ strip the <title> that sat in <head>
      container.querySelector(':scope > title')?.remove();

      // 2️⃣ strip the <meta charset="UTF-8"> that came from <head>
      container.querySelector(':scope > meta[charset]')?.remove();

      // 3️⃣ strip the <h2> caption that sat in <body>
      container.querySelector(':scope > h2')?.remove();
      container.querySelectorAll('text').forEach(t =>
      t.setAttribute('pointer-events', 'none')
    );

      // Recolor
      result.categorizedResidues.forEach(row => {
        const pos = showReceptor === 1 ? row.resNum1 : row.resNum2;
        if (pos === 'gap') return;
        const label = categoryLabels[row.category as keyof typeof categoryLabels];
        const color = colorMap[label];
        const circle = container.querySelector<SVGCircleElement>(`circle[id="${pos}"]`);
        if (circle) {
          circle.setAttribute('fill', color);
          circle.setAttribute('data-snake-category', label);
        }
      });
      
      // Hover tooltips
      Array.from(container.querySelectorAll<SVGCircleElement>('circle[id]')).forEach(circle => {
        const pos = circle.id;
        const row = result.categorizedResidues.find(r =>
          showReceptor === 1 ? r.resNum1 === pos : r.resNum2 === pos
        );
        if (!row) return;

        // get GPCRdb generic number from <text id="XXg">
        const gpcrdbElem = container.querySelector<SVGTextElement>(`text[id="${pos}t"]`);
        const gpcrdb   = gpcrdbElem?.textContent?.trim() || '';
        const aa    = showReceptor === 1 ? row.aa1 : row.aa2;
        const perc  = ((showReceptor === 1 ? row.perc1 : row.perc2)).toFixed(1) + '%';
        const label = categoryLabels[row.category as keyof typeof categoryLabels];

        circle.addEventListener('mouseenter', (e: MouseEvent) => {
          setTooltip({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            lines: [
              `${gpcrdb}${pos}`,
              `Category: ${label}`,
            ],
          });
        });
        circle.addEventListener('mousemove', (e: MouseEvent) => {
          setTooltip(t => ({ ...t, x: e.clientX, y: e.clientY }));
        });
        circle.addEventListener('mouseleave', () => {
          setTooltip(t => ({ ...t, visible: false }));
        });
      });
    })
    
    .catch(err => {
      console.error(err);
      container.innerHTML = '<p class="text-red-500">Failed to load snake plot.</p>';
    });
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

      

      <h2 className="text-xl font-semibold mb-2 pt-4">Snake Plot Visualization</h2>
      
            {/* ─── Toggle receptor ───────────────────────────── */}
      <div className="flex space-x-4 mb-4">
        <Button
          variant={showReceptor === 1 ? 'default' : 'secondary'}
          onClick={() => setShowReceptor(1)}
        >
          Show Snake Plot for {result?.receptor1.geneName}
        </Button>
        <Button
          variant={showReceptor === 2 ? 'default' : 'secondary'}
          onClick={() => setShowReceptor(2)}
        >
          Show Snake Plot for {result?.receptor2.geneName}
        </Button>
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


      {/* ─── Tooltip overlay ──────────────────────────────────────── */}
      {tooltip.visible && (
        <div
          style={{
            position: 'fixed',
            top: tooltip.y + 8,
            left: tooltip.x + 8,
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '6px 10px',
            borderRadius: 4,
            pointerEvents: 'none',
            whiteSpace: 'pre',
            fontSize: 12,
            zIndex: 2000,
          }}
        >
          {tooltip.lines.join('\n')}
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
    const results = receptors
      .filter((receptor: Receptor) => receptor.geneName.toLowerCase().includes(value.toLowerCase()))
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
    const results = receptors
      .filter((receptor: Receptor) => receptor.geneName.toLowerCase().includes(value.toLowerCase()))
      .slice(0, 10);

    setSearchResults2(results);
  };

  async function fetchData(values: z.infer<typeof formSchema>, showLoading = true) {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await fetch('/api/receptor-comparison', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to compare receptors');
      }

      const data = await response.json();
      setInitialResult(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
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
                    <Command className="rounded-lg border shadow-md">
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
                                  value={receptor.geneName}
                                  className="cursor-pointer"
                                  onSelect={() => {
                                    field.onChange(receptor.geneName);
                                    setSearchResults1([]);
                                    setHasSearched1(false);
                                  }}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-medium">{receptor.geneName}</span>
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
                    <Command className="rounded-lg border shadow-md">
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
                                  value={receptor.geneName}
                                  className="cursor-pointer"
                                  onSelect={() => {
                                    field.onChange(receptor.geneName);
                                    setSearchResults2([]);
                                    setHasSearched2(false);
                                  }}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-medium">{receptor.geneName}</span>
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
