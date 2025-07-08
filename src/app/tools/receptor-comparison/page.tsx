'use client';

import { useState, useRef, useEffect, memo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import receptors from '../../../../public/receptors.json';

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
} from '@tanstack/react-table';

// Import our new components and utilities
import DualSequenceLogoChart from '@/components/DualSequenceLogoChart';
import ReceptorSelectionForm from '@/components/ReceptorSelectionForm';
import SnakePlotVisualization from '@/components/SnakePlotVisualization';
import { 
  readFastaFile, 
  readConservationData, 
  mapAllData, 
  categorizeResidues 
} from '@/lib/receptorComparison';

// Form schema type for compatibility
interface FormData {
  receptor1: string;
  receptor2: string;
  threshold: number;
}

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
  humanAa1: string;
  conservedAa1: string;
  perc1: number;
  resNum2: string;
  humanAa2: string;
  conservedAa2: string;
  perc2: number;
  region1: string;
  region2: string;
  gpcrdb1: string;
  gpcrdb2: string;
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
  fetchData: (values: FormData) => Promise<void>;
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

  const columns = [
    columnHelper.accessor('region1', {
      header: () => <div className="text-center font-medium">Region</div>,
      cell: info => (
        <div className="font-mono text-center">
          {info.row.original.resNum1 !== 'gap' ? info.getValue() : '-'}
        </div>
      ),
      meta: {
        parentColumn: result?.receptor1.geneName,
      } as ColumnMeta,
    }),
    columnHelper.accessor('gpcrdb1', {
      header: () => <div className="text-center font-medium">GPCRdb #</div>,
      cell: info => (
        <div className="font-mono text-center">
          {info.row.original.resNum1 !== 'gap' ? info.getValue() : '-'}
        </div>
      ),
      meta: {
        parentColumn: result?.receptor1.geneName,
      } as ColumnMeta,
    }),
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
    columnHelper.accessor('humanAa1', {
      header: () => <div className="text-center font-medium">Human AA</div>,
      cell: info => (
        <div className="font-mono text-center">
          {info.row.original.resNum1 !== 'gap' ? info.getValue() : '-'}
        </div>
      ),
      meta: {
        parentColumn: result?.receptor1.geneName,
      } as ColumnMeta,
    }),
    columnHelper.accessor('conservedAa1', {
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
    columnHelper.accessor('region2', {
      header: () => <div className="text-center font-medium">Region</div>,
      cell: info => (
        <div className="font-mono text-center">
          {info.row.original.resNum2 !== 'gap' ? info.getValue() : '-'}
        </div>
      ),
      meta: {
        parentColumn: result?.receptor2.geneName,
      } as ColumnMeta,
    }),
    columnHelper.accessor('gpcrdb2', {
      header: () => <div className="text-center font-medium">GPCRdb #</div>,
      cell: info => (
        <div className="font-mono text-center">
          {info.row.original.resNum2 !== 'gap' ? info.getValue() : '-'}
        </div>
      ),
      meta: {
        parentColumn: result?.receptor2.geneName,
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
    columnHelper.accessor('humanAa2', {
      header: () => <div className="text-center font-medium">Human AA</div>,
      cell: info => (
        <div className="font-mono text-center">
          {info.row.original.resNum2 !== 'gap' ? info.getValue() : '-'}
        </div>
      ),
      meta: {
        parentColumn: result?.receptor2.geneName,
      } as ColumnMeta,
    }),
    columnHelper.accessor('conservedAa2', {
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
    <div className="space-y-6">
      {/* ─── Card 1: Results Table ─────────────────────────────────── */}
      <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Comparison Results</h2>
          {/* ─── Export buttons ───────────────── */}
          <div className="flex gap-2">
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
                  'Region1',
                  'GPCRdb1',
                  'Residue1',
                  'HumanAA1',
                  'ConservedAA1',
                  'Perc1',
                  'Region2',
                  'GPCRdb2',
                  'Residue2',
                  'HumanAA2',
                  'ConservedAA2',
                  'Perc2',
                  'Category',
                ];

                // Body rows
                const rows = result.categorizedResidues.map(r => [
                  r.region1,
                  r.gpcrdb1,
                  r.resNum1,
                  r.humanAa1,
                  r.conservedAa1,
                  r.perc1.toFixed(2),
                  r.region2,
                  r.gpcrdb2,
                  r.resNum2,
                  r.humanAa2,
                  r.conservedAa2,
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
      </div>
    </div>

  );
});

export default function ReceptorComparisonPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialResult, setInitialResult] = useState<ComparisonResult | null>(null);
  const [colorMap, setColorMap] = useState<Record<string, string>>({
    'Common Residues': '#E6E6FA',
    'Specifically Conserved for Both': '#A85638',
    'Specifically Conserved for Receptor 1': '#FFF9C2',
    'Specifically Conserved for Receptor 2': '#8F9871',
  });
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

  async function fetchData(values: FormData, showLoading = true) {
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
      const gene1Data = await readConservationData(`/${rec1.conservationFile}`);
      const gene2Data = await readConservationData(`/${rec2.conservationFile}`);

      // Map and categorize
      const { resNums1, resNums2, percList1, percList2, humanAaList1, humanAaList2, conservedAaList1, conservedAaList2, regionList1, regionList2, gpcrdbList1, gpcrdbList2 } = mapAllData(
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
        humanAaList1,
        humanAaList2,
        conservedAaList1,
        conservedAaList2,
        regionList1,
        regionList2,
        gpcrdbList1,
        gpcrdbList2,
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

  async function onSubmit(values: FormData) {
    await fetchData(values, true);
  }

  async function updateThreshold(values: FormData) {
    scrollPositionRef.current = window.scrollY;
    await fetchData(values, false);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 py-4">
      <h1 className="text-3xl font-bold text-left">Differential Residue Conservation</h1>
      <p className="text-lg text-muted-foreground text-left">
        Enter two GPCR gene names from the same class and set a conservation threshold (0–100%).
        This tool will identify residues that are commonly and specifically conserved in each
        receptor, and render both an interactive results table (including receptor region and GPCRdb numbering) and a snake plot visualization.
      </p>
      
      <ReceptorSelectionForm 
        onSubmit={onSubmit}
        onThresholdChange={updateThreshold}
        isLoading={isLoading}
      />
      
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {initialResult && (
        <div className="space-y-6">
          <ResultsTable fetchData={fetchData} initialResult={initialResult} />
          
          <div className="bg-card text-card-foreground rounded-lg shadow-md">
            <DualSequenceLogoChart
              categorizedResidues={initialResult.categorizedResidues}
              receptor1Name={initialResult.receptor1.geneName}
              receptor2Name={initialResult.receptor2.geneName}
              receptor1Alignment={`/alignments/${initialResult.receptor1.geneName}_orthologs_MSA.fasta`}
              receptor2Alignment={`/alignments/${initialResult.receptor2.geneName}_orthologs_MSA.fasta`}
              colorMap={colorMap}
              height={400}
              onColorMapChange={setColorMap}
            />
          </div>
          
          <SnakePlotVisualization 
            result={initialResult}
            colorMap={colorMap}
            setColorMap={setColorMap}
          />
        </div>
      )}
    </div>
  );
}
