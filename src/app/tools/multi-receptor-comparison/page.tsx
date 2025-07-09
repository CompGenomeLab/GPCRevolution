'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useState, useRef } from 'react';
import receptors from '../../../../public/receptors.json';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import React from 'react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';

const MultiReceptorLogoChart = dynamic(
  () => import('@/components/MultiReceptorLogoChart'),
  { ssr: false }
);

const formSchema = z.object({
  receptorClass: z.string().min(1, 'Required'),
  minOrthologs: z.array(z.string()).min(1, 'Required'),
  maxOrthologs: z.string().optional(),
});

interface Receptor {
  geneName: string;
  class: string;
  numOrthologs: number;
  lca: string;
  gpcrdbId: string;
  name: string;
}

interface ConservationData {
  conservation: number;
  conservedAA: string;
  aa: string;
  region: string;
  gpcrdb: string;
}

interface ResidueMapping {
  [key: string]: string;
}

interface ColumnMeta {
  parentColumn?: string;
}

const columnHelper = createColumnHelper<ResidueMapping>();

export default function ReceptorTablePage() {
  const [referenceResults, setReferenceResults] = useState<Receptor[]>([]);
  const [hasSearchedReference, setHasSearchedReference] = useState(false);

  const [resultData, setResultData] = useState<ResidueMapping[]>([]);
  const [resultColumns, setResultColumns] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processedReceptorNames, setProcessedReceptorNames] = useState<string[]>([]);
  const [processedReferenceReceptor, setProcessedReferenceReceptor] = useState<string>('');
  const resultRef = useRef<HTMLDivElement>(null);
  const [sorting, setSorting] = useState<SortingState>([]);

  const [targetInputValue, setTargetInputValue] = useState('');
  const [targetSuggestions, setTargetSuggestions] = useState<Receptor[]>([]);
  const [showTargetSuggestions, setShowTargetSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState<number>(-1);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      receptorClass: '',
      minOrthologs: [],
      maxOrthologs: '',
    },
  });

  const handleReferenceSearch = (value: string) => {
    if (!value.trim()) {
      setReferenceResults([]);
      setHasSearchedReference(false);
      return;
    }

    setHasSearchedReference(true);
    const term = value.toLowerCase();
    const results = receptors
      .filter(
        (receptor: Receptor) =>
          receptor.geneName.toLowerCase().includes(term) || receptor.name.toLowerCase().includes(term)
      )
      .slice(0, 10);

    setReferenceResults(results);
  };

  const filterTargetSuggestions = (query: string) => {
    if (!query.trim()) {
      setTargetSuggestions([]);
      setShowTargetSuggestions(false);
      return;
    }

    const currentValues = query
      .split(',')
      .map(v => v.trim())
      .filter(v => v);
    const lastValue = currentValues[currentValues.length - 1] || '';

    const filtered = receptors
      .filter((receptor: Receptor) => {
        const low = lastValue.toLowerCase();
        return (
          receptor.geneName.toLowerCase().includes(low) || receptor.name.toLowerCase().includes(low)
        );
      })
      .slice(0, 10);

    setTargetSuggestions(filtered);
    setShowTargetSuggestions(filtered.length > 0);
    setHighlightIndex(filtered.length > 0 ? 0 : -1);
  };

  const handleTargetInputChange = (value: string) => {
    setTargetInputValue(value);
    filterTargetSuggestions(value);

    const receptorNames = value
      .split(',')
      .map(name => name.trim())
      .filter(name => name && receptors.some((r: Receptor) => r.geneName === name));

    form.setValue('minOrthologs', receptorNames);
    setHighlightIndex(showTargetSuggestions && targetSuggestions.length>0 ? 0 : -1);
  };

  const handleTargetSuggestionClick = (receptor: Receptor) => {
    const currentValues = targetInputValue
      .split(',')
      .map(v => v.trim())
      .filter(v => v);
    currentValues[currentValues.length - 1] = receptor.geneName;
    const newValue = currentValues.join(', ') + ', ';

    setTargetInputValue(newValue);
    setShowTargetSuggestions(false);

    const receptorNames = newValue
      .split(',')
      .map(name => name.trim())
      .filter(name => name && receptors.some((r: Receptor) => r.geneName === name));

    form.setValue('minOrthologs', receptorNames);
  };

  async function readFastaFile(fastaFilePath: string) {
    try {
      const response = await fetch(fastaFilePath);
      if (!response.ok) throw new Error(`Failed to load FASTA file: ${fastaFilePath}`);
      const fastaData = await response.text();

      const sequences: { [key: string]: string } = {};
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
    } catch (error) {
      toast.error('Failed to read FASTA file');
      throw error;
    }
  }

  async function readConservationData(conservationFilePath: string) {
    try {
      const response = await fetch(conservationFilePath);
      if (!response.ok) return {};

      const data = await response.text();
      const conservationData: { [key: string]: ConservationData } = {};

      data.split('\n').forEach(line => {
        const parts = line.split('\t');
        if (parts[0] && parts[0].trim().toLowerCase() === 'residue_number') return;

        if (parts.length >= 6) {
          const resNum = parts[0].trim();
          conservationData[resNum] = {
            conservation: parseFloat(parts[1].trim()),
            conservedAA: parts[2],
            aa: parts[3].trim(),
            region: parts[4].trim(),
            gpcrdb: parts[5].trim(),
          };
        }
      });

      return conservationData;
    } catch (error) {
      toast.error('Failed to read conservation data', {
        description: error instanceof Error ? error.message : 'An unknown error occurred',
      });
      return {};
    }
  }

  function mapResiduesAllReceptors(
    receptorSequences: { geneName: string; sequence: string }[],
    conservationDataMap: { [key: string]: { [key: string]: ConservationData } } = {}
  ) {
    const sequenceLength = receptorSequences[0].sequence.length;
    const residueCounters: { [key: string]: number } = {};

    receptorSequences.forEach(receptor => {
      residueCounters[receptor.geneName] = 0;
    });

    const accumulatedMappings: ResidueMapping[] = [];
    const referenceGeneName = receptorSequences[0].geneName;

    for (let i = 0; i < sequenceLength; i++) {
      const mapping: ResidueMapping = {};

      receptorSequences.forEach(receptor => {
        const aa = receptor.sequence[i];
        if (aa !== '-') {
          residueCounters[receptor.geneName] += 1;
          mapping[`${receptor.geneName}_resNum`] = residueCounters[receptor.geneName].toString();
          mapping[`${receptor.geneName}_AA`] = aa;

          if (
            conservationDataMap[receptor.geneName] &&
            conservationDataMap[receptor.geneName][residueCounters[receptor.geneName].toString()]
          ) {
            const conservationData =
              conservationDataMap[receptor.geneName][residueCounters[receptor.geneName].toString()];
            mapping[`${receptor.geneName}_Conservation`] =
              conservationData.conservation.toFixed(2) + '%';
            mapping[`${receptor.geneName}_Conserved_AA`] = conservationData.conservedAA;

            if (receptor.geneName === referenceGeneName) {
              mapping[`${receptor.geneName}_region`] = conservationData.region;
              mapping[`${receptor.geneName}_gpcrdb`] = conservationData.gpcrdb;
            }
          } else {
            mapping[`${receptor.geneName}_Conservation`] = '-';
            mapping[`${receptor.geneName}_Conserved_AA`] = '-';

            if (receptor.geneName === referenceGeneName) {
              mapping[`${receptor.geneName}_region`] = '-';
              mapping[`${receptor.geneName}_gpcrdb`] = '-';
            }
          }
        } else {
          mapping[`${receptor.geneName}_resNum`] = '-';
          mapping[`${receptor.geneName}_AA`] = '-';
          mapping[`${receptor.geneName}_Conservation`] = '-';
          mapping[`${receptor.geneName}_Conserved_AA`] = '-';

          if (receptor.geneName === referenceGeneName) {
            mapping[`${receptor.geneName}_region`] = '-';
            mapping[`${receptor.geneName}_gpcrdb`] = '-';
          }
        }
      });

      if (mapping[`${referenceGeneName}_resNum`] !== '-') {
        accumulatedMappings.push(mapping);
      }
    }

    return accumulatedMappings;
  }

  function filterByResidueNumbers(
    data: ResidueMapping[],
    referenceGeneName: string,
    residueNumbers: number[]
  ) {
    if (residueNumbers.length === 0) return data;

    return data.filter(row => {
      const refResNum = parseInt(row[`${referenceGeneName}_resNum`], 10);
      return residueNumbers.includes(refResNum);
    });
  }

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setError(null);
    
    // Clear previous results to ensure proper re-rendering
    setResultData([]);
    setResultColumns([]);
    setProcessedReceptorNames([]);
    setProcessedReferenceReceptor('');

    try {
      const referenceGene = values.receptorClass.trim();
      const targetGenes = values.minOrthologs;

      const residueNumbersInput = values.maxOrthologs?.trim() || '';
      const includeConservation = true; // Always include conservation data

      let residueNumbers: number[] = [];
      if (residueNumbersInput) {
        residueNumbers = residueNumbersInput
          .split(',')
          .map(num => num.trim())
          .filter(Boolean)
          .map(num => parseInt(num, 10))
          .filter(num => !isNaN(num) && num > 0);
      }

      if (!referenceGene) {
        throw new Error('Please select a reference receptor');
      }
      if (targetGenes.length === 0) {
        throw new Error('Please select at least one target receptor');
      }
      if (targetGenes.includes(referenceGene)) {
        throw new Error('Target receptors must be different from the reference receptor');
      }

      const referenceReceptor = receptors.find(
        (r: Receptor) => r.geneName.toLowerCase() === referenceGene.toLowerCase()
      );
      const targetReceptors = targetGenes.map(name =>
        receptors.find((r: Receptor) => r.geneName.toLowerCase() === name.toLowerCase())
      );

      if (!referenceReceptor) {
        throw new Error('Reference receptor not found');
      }
      if (targetReceptors.includes(undefined)) {
        throw new Error('One or more target receptors not found');
      }

      const receptorClass = referenceReceptor.class;
      const allSameClass = targetReceptors.every(
        (r: Receptor | undefined) => r && r.class === receptorClass
      );

      if (!allSameClass) {
        throw new Error('All receptors must be in the same class as the reference receptor');
      }

      const fastaFilePath = `/alignments/class${receptorClass}_humans_MSA.fasta`;
      const sequences = await readFastaFile(fastaFilePath);

      const allReceptors = [referenceReceptor, ...(targetReceptors as Receptor[])];
      const receptorSequences = allReceptors.map(r => {
        const seq = sequences[r.geneName];
        if (!seq) {
          throw new Error(`Sequence not found in FASTA file for ${r.geneName}.`);
        }
        return {
          geneName: r.geneName,
          sequence: seq,
        };
      });

      const conservationDataMap: { [key: string]: { [key: string]: ConservationData } } = {};
      if (includeConservation) {
        const conservationPromises = allReceptors.map(receptor => {
          if (!receptor.gpcrdbId) return Promise.resolve(null);

          const conservationFilePath = `/conservation_files/${receptor.geneName}_conservation.txt`;
          return readConservationData(conservationFilePath)
            .then(data => ({ geneName: receptor.geneName, data }))
            .catch(() => ({ geneName: receptor.geneName, data: {} }));
        });

        const conservationResults = await Promise.all(conservationPromises);
        conservationResults.forEach(result => {
          if (result) conservationDataMap[result.geneName] = result.data;
        });
      }

      const receptorNames = allReceptors.map(r => r.geneName);
      let mappingData = mapResiduesAllReceptors(receptorSequences, conservationDataMap);

      if (residueNumbers.length > 0) {
        mappingData = filterByResidueNumbers(mappingData, referenceGene, residueNumbers);
      }

      const columns: string[] = [];

      if (includeConservation) {
        columns.push(`${referenceGene}_region`);
        columns.push(`${referenceGene}_gpcrdb`);
      }

      receptorNames.forEach(receptor => {
        columns.push(`${receptor}_resNum`);
        columns.push(`${receptor}_AA`);

        if (includeConservation) {
          columns.push(`${receptor}_Conservation`);
          columns.push(`${receptor}_Conserved_AA`);
        }
      });

      setResultData(mappingData);
      setResultColumns(columns);
      setProcessedReceptorNames(receptorNames);
      setProcessedReferenceReceptor(referenceGene);

      if (resultRef.current) {
        resultRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  }

  const columns = React.useMemo(() => {
    if (resultColumns.length === 0) return [];

    const getColumnLabel = (colType: string) => {
      const labelMap: Record<string, string> = {
        resNum: 'Residue #',
        AA: 'Amino Acid',
        Conservation: 'Conservation %',
        Conserved_AA: 'Conserved AA',
        region: 'Region',
        gpcrdb: 'GPCRdb #'
      };
      return labelMap[colType] || colType;
    };

    return resultColumns.map(colKey => {
      const [receptorName, colType] = colKey.split('_');

      return columnHelper.accessor(colKey, {
        id: colKey,
        header: () => (
          <div className="flex flex-col items-center gap-1">
            <div className="text-xs text-muted-foreground">{receptorName}</div>
            <div className="text-center font-medium">
              {getColumnLabel(colType)}
            </div>
          </div>
        ),
        cell: info => {
          const value = info.getValue();
          return <div className="text-center font-mono">{value}</div>;
        },
        meta: { parentColumn: receptorName } as ColumnMeta,
      });
    });
  }, [resultColumns]);

  const table = useReactTable({
    data: resultData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="max-w-7xl mx-auto space-y-8 py-4 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-3xl font-bold text-left">Multi-Receptor Comparison</h1>
        <p className="text-base text-muted-foreground text-left">
          Compare multiple receptors side-by-side with detailed residue-level analysis. Enter a reference receptor and one or more target receptors from the same class to generate a comprehensive comparison table. Optionally specify specific residue numbers to focus your analysis. The results include conservation data, amino acid sequences, receptor regions, GPCRdb numbering, and interactive sequence logos for each receptor.
        </p>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="receptorClass"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference Receptor</FormLabel>
                    <FormControl>
                      <Command shouldFilter={false} className="rounded-lg border shadow-none">
                        <CommandInput
                          placeholder="Search for receptor..."
                          onValueChange={value => {
                            handleReferenceSearch(value);
                            field.onChange(value);
                          }}
                          value={field.value}
                        />
                        {hasSearchedReference && (
                          <CommandList
                            className={
                              referenceResults.length > 5 ? 'max-h-[300px] overflow-y-auto' : ''
                            }
                          >
                            {referenceResults.length === 0 ? (
                              <CommandEmpty>No results found.</CommandEmpty>
                            ) : (
                              <CommandGroup>
                                {referenceResults.map((receptor, index) => (
                                  <CommandItem
                                    key={index}
                                    value={`${receptor.geneName} ${receptor.name}`}
                                    className="cursor-pointer"
                                    onSelect={() => {
                                      field.onChange(receptor.geneName);
                                      setReferenceResults([]);
                                      setHasSearchedReference(false);
                                    }}
                                  >
                                    <div className="flex flex-col">
                                      <span className="font-medium">{`${receptor.geneName} - ${receptor.name}`}</span>
                                      <span className="text-sm text-muted-foreground">
                                        Class: {receptor.class} | Orthologs: {receptor.numOrthologs}{' '}
                                        | LCA: {receptor.lca}
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
                name="minOrthologs"
                render={() => (
                  <FormItem>
                    <FormLabel>Target Receptor(s)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder="Type receptor names (comma-separated)..."
                          value={targetInputValue}
                          onChange={e => handleTargetInputChange(e.target.value)}
                          onFocus={() => {
                            setTargetSuggestions([]);
                            setShowTargetSuggestions(false);
                          }}
                          onBlur={() => setTimeout(() => setShowTargetSuggestions(false), 200)}
                          onKeyDown={e=>{
                            if(showTargetSuggestions && targetSuggestions.length>0){
                              if(e.key==='ArrowDown'){
                                e.preventDefault();
                                setHighlightIndex((prev)=> (prev+1)%targetSuggestions.length);
                              }else if(e.key==='ArrowUp'){
                                e.preventDefault();
                                setHighlightIndex((prev)=> (prev-1+targetSuggestions.length)%targetSuggestions.length);
                              }else if(e.key==='Enter'){
                                e.preventDefault();
                                if(highlightIndex>=0 && highlightIndex<targetSuggestions.length){
                                  handleTargetSuggestionClick(targetSuggestions[highlightIndex]);
                                }
                              }
                            }
                          }}
                          className="w-full"
                        />
                        {showTargetSuggestions && targetSuggestions.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                            {targetSuggestions.map((receptor, index) => (
                              <div
                                key={receptor.geneName}
                                className={`px-4 py-2 cursor-pointer text-sm ${index===highlightIndex?'bg-accent':'hover:bg-accent'}`}
                                onMouseDown={() => handleTargetSuggestionClick(receptor)}
                              >
                                <div className="font-medium">{`${receptor.geneName} - ${receptor.name}`}</div>
                                <div className="text-muted-foreground text-xs">
                                  Class: {receptor.class} | Orthologs: {receptor.numOrthologs}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxOrthologs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Residue Numbers (comma-separated, optional)</FormLabel>
                    <FormControl>
                      <Command className="rounded-lg border shadow-none">
                        <CommandInput
                          placeholder="Enter residue numbers..."
                          onValueChange={value => {
                            field.onChange(value);
                          }}
                          value={field.value}
                        />
                      </Command>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Processing...' : 'Map Residues'}
              </Button>
            </form>
          </Form>
        </div>
      </div>

      {resultData.length > 0 && (
        <div ref={resultRef} className="mt-8 space-y-4">
          <h2 className="text-2xl font-bold">Mapping Results</h2>

          <div className="flex justify-between">
            <div>
              <span className="text-sm text-muted-foreground">
                Showing{' '}
                {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}{' '}
                to{' '}
                {Math.min(
                  (table.getState().pagination.pageIndex + 1) *
                    table.getState().pagination.pageSize,
                  table.getFilteredRowModel().rows.length
                )}{' '}
                of {table.getFilteredRowModel().rows.length} entries
              </span>
            </div>
            <Button
              onClick={() => {
                const headers = resultColumns.join('\t');
                const rows = resultData.map(row =>
                  resultColumns.map(col => row[col] || '-').join('\t')
                );
                const tsvContent = [headers, ...rows].join('\n');
                const blob = new Blob([tsvContent], { type: 'text/tab-separated-values' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'residue_mapping.tsv';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              variant="outline"
              size="sm"
            >
              Download TSV
            </Button>
          </div>

          <div className="border rounded-lg max-h-[600px] overflow-y-auto overflow-x-scroll scrollbar-thin">
            <Table className="min-w-max">
              <TableHeader>
                <TableRow>
                  {table.getHeaderGroups()[0].headers.map(header => (
                    <TableHead
                      key={header.id}
                      className={header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{
                        asc: ' 🔼',
                        desc: ' 🔽',
                      }[header.column.getIsSorted() as string] ?? null}
                    </TableHead>
                  ))}
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

          {/* Multi-Receptor Logo Chart */}
          <div className="mt-8">
            {processedReceptorNames.length > 0 && (
              <MultiReceptorLogoChart
                resultData={resultData}
                receptorNames={processedReceptorNames}
                referenceReceptor={processedReferenceReceptor}
                height={200}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
