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
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import receptors from '../../../../public/receptors.json';

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
  getPaginationRowModel,
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
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setResult(initialResult);
  }, [initialResult]);

  const columns = [
    columnHelper.accessor('resNum1', {
      header: () => <div className="text-center font-medium">Residue</div>,
      cell: info => (
        <div className="font-mono">
          {info.row.original.resNum1 !== 'gap'
            ? `${info.row.original.resNum1} (${info.row.original.aa1})`
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
      cell: info => <div className="text-right">{info.getValue().toFixed(2)}%</div>,
      meta: {
        parentColumn: result?.receptor1.geneName,
      } as ColumnMeta,
    }),
    columnHelper.accessor('resNum2', {
      header: () => <div className="text-center font-medium">Residue</div>,
      cell: info => (
        <div className="font-mono">
          {info.row.original.resNum2 !== 'gap'
            ? `${info.row.original.resNum2} (${info.row.original.aa2})`
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
      cell: info => <div className="text-right">{info.getValue().toFixed(2)}%</div>,
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
      pagination: {
        pageIndex,
        pageSize,
      },
    },
    onSortingChange: setSorting,
    onPaginationChange: updater => {
      if (typeof updater === 'function') {
        const newState = updater({
          pageIndex,
          pageSize,
        });
        setPageIndex(newState.pageIndex);
        setPageSize(newState.pageSize);
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
      <h2 className="text-xl font-semibold mb-4">Results</h2>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {table.getHeaderGroups()[0].headers.map(header => {
                const parentColumn = (header.column.columnDef.meta as ColumnMeta)?.parentColumn;
                if (parentColumn) {
                  return (
                    <TableHead
                      key={header.id}
                      className={header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
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
                      className={header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
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
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-muted-foreground">
          Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}{' '}
          to{' '}
          {Math.min(
            (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
            table.getFilteredRowModel().rows.length
          )}{' '}
          of {table.getFilteredRowModel().rows.length} entries
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
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
