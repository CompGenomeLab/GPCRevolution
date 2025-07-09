'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';
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
import { useState, useEffect } from 'react';
import receptors from '../../../../public/receptors.json';
import { useFastaSequences } from '@/hooks/useFastaSequences';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download } from 'lucide-react';
import MSAVisualization from '@/components/MSAVisualization_CO';
import { toast } from 'sonner';

const formSchema = z.object({
  receptorNames: z.array(z.string()).min(1, 'At least one receptor is required'),
});

type FormValues = z.infer<typeof formSchema>;

interface Receptor {
  geneName: string;
  class: string;
  numOrthologs: number;
  lca: string;
  gpcrdbId: string;
  name: string;
  alignment?: string;
}

interface Sequence {
  id: string;
  header: string;
  sequence: string;
}

interface VisualizationSequence {
  header: string;
  sequence: string;
}

interface FastaSequences {
  [geneName: string]: {
    header: string;
    sequence: string;
  };
}

interface ReceptorOption {
  geneName: string;
  class: string;
  numOrthologs: number;
  name: string;
  lca: string;
}

export default function CombineOrthologsPage() {
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string | null>(null);
  const [visualizationSequences, setVisualizationSequences] = useState<VisualizationSequence[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<ReceptorOption[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState<number>(-1);

  const {
    trimGapsInAllSequences,
    adjustOrthologSequences,
    generateFastaString,
    parseFastaContent,
    filterFastaByGenes,
  } = useFastaSequences();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      receptorNames: [],
    },
  }) as UseFormReturn<FormValues>;

  // Show success message after visualization is ready
  useEffect(() => {
    if (visualizationSequences.length > 0) {
      const receptorCount = form.getValues('receptorNames').length;
      toast.success(
        `Successfully combined ${visualizationSequences.length} sequences from ${receptorCount} receptors`
      );
    }
  }, [visualizationSequences, form]);

  const filterSuggestions = (query: string) => {
    if (!query.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const currentValues = query
      .split(',')
      .map(v => v.trim())
      .filter(v => v);
    const lastValue = currentValues[currentValues.length - 1] || '';

    const filtered = receptors
      .filter((receptor: Receptor) =>
        receptor.geneName.toLowerCase().includes(lastValue.toLowerCase()) ||
        receptor.name.toLowerCase().includes(lastValue.toLowerCase())
      )
      .slice(0, 10) as ReceptorOption[];

    setSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
    setHighlightIndex(filtered.length>0?0:-1);
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
    filterSuggestions(value);
    setHighlightIndex(0);

    const receptorNames = value
      .split(',')
      .map(name => name.trim())
      .filter(name => name && receptors.some((r: Receptor) => r.geneName === name));

    form.setValue('receptorNames', receptorNames);
  };

  const handleSuggestionClick = (receptor: ReceptorOption) => {
    const currentValues = inputValue
      .split(',')
      .map(v => v.trim())
      .filter(v => v);
    currentValues[currentValues.length - 1] = receptor.geneName;
    const newValue = currentValues.join(', ') + ', ';

    setInputValue(newValue);
    setShowSuggestions(false);

    const receptorNames = newValue
      .split(',')
      .map(name => name.trim())
      .filter(name => name && receptors.some((r: Receptor) => r.geneName === name));

    form.setValue('receptorNames', receptorNames);
  };

  async function onSubmit(values: FormValues) {
    try {
      setIsLoading(true);
      setError(null);

      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
      setDownloadUrl(null);
      setDownloadFilename(null);
      setVisualizationSequences([]);

      if (values.receptorNames.length === 0) {
        throw new Error('Please select at least one receptor.');
      }

      const selectedReceptorData = values.receptorNames.map(name =>
        receptors.find((r: Receptor) => r.geneName === name)
      );

      if (selectedReceptorData.includes(undefined)) {
        throw new Error('One or more receptor names not found.');
      }

      const receptorClass = selectedReceptorData[0]?.class;
      const allSameClass = selectedReceptorData.every(r => r?.class === receptorClass);
      if (!allSameClass) {
        throw new Error('All receptors must belong to the same class.');
      }

      const fastaFilePath = `/alignments/class${receptorClass}_humans_MSA.fasta`;
      const response = await fetch(fastaFilePath);
      if (!response.ok) throw new Error(`Failed to fetch ${fastaFilePath}`);
      const fastaData = await response.text();

      const sequences = filterFastaByGenes(fastaData, values.receptorNames) as FastaSequences;

      const receptorSequences = Object.entries(sequences).map(([geneName, data]) => ({
        id: geneName,
        geneName,
        header: data.header,
        sequence: data.sequence,
      }));

      const trimmedSequences = trimGapsInAllSequences(receptorSequences);

      const combinedSequences: Sequence[] = [];

      for (const receptor of trimmedSequences) {
        const receptorData = receptors.find(r => r.geneName === receptor.geneName);
        if (!receptorData?.alignment) {
          console.warn(`No alignment path found for ${receptor.geneName}`);
          continue;
        }

        const orthologPath = receptorData.alignment.startsWith('/')
          ? receptorData.alignment
          : `/${receptorData.alignment}`;
        const orthologResponse = await fetch(orthologPath);
        if (!orthologResponse.ok) {
          console.warn(
            `Failed to fetch orthologs for ${receptor.geneName}: ${orthologResponse.statusText}`
          );
          continue;
        }

        const orthologData = await orthologResponse.text();
        const orthologSequences = parseFastaContent(orthologData) as Sequence[];

        const humanOrtholog = orthologSequences.find(seq => seq.header === receptor.header);
        if (!humanOrtholog) continue;

        const nonGapPositions = humanOrtholog.sequence
          .split('')
          .map((char: string, i: number) => (char !== '-' ? i : -1))
          .filter((pos: number) => pos !== -1);

        const trimmedOrthologs = orthologSequences.map((seq: Sequence) => ({
          ...seq,
          sequence: nonGapPositions.map((pos: number) => seq.sequence[pos] || '-').join(''),
        }));

        const adjustedOrthologs = adjustOrthologSequences(receptor.sequence, trimmedOrthologs);
        combinedSequences.push(...adjustedOrthologs);
      }

      const visualizationData = combinedSequences.map(seq => ({
        header: seq.header,
        sequence: seq.sequence,
      }));
      setVisualizationSequences(visualizationData);

      const fastaString = generateFastaString(combinedSequences);
      const filename = `${values.receptorNames.join('-')}_orthologs_combined.fasta`;

      try {
        const blob = new Blob([fastaString], {
          type: 'text/plain;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);

        setDownloadUrl(url);
        setDownloadFilename(filename);

        setTimeout(() => {
          URL.revokeObjectURL(url);
          setDownloadUrl(null);
          setDownloadFilename(null);
        }, 60000);
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : 'Failed to create download file');
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'An error occurred while processing the sequences.';
      setError(errorMessage);
      toast.error('Failed to combine alignments');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 py-4 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-2 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-left">Combine Orthologs</h1>
        {downloadUrl && downloadFilename && (
          <Button
            variant="outline"
            className="gap-2 mt-2 sm:mt-0 w-full sm:w-auto"
            onClick={() => {
              try {
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = downloadFilename;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                toast.success('Download started successfully');
              } catch (err) {
                toast.error('Failed to download file', {
                  description: err instanceof Error ? err.message : 'An unknown error occurred',
                });
              }
            }}
          >
            <Download className="h-4 w-4" />
            Download Combined Alignment
          </Button>
        )}
      </div>
      <p className="text-base text-muted-foreground text-left max-w-3xl mx-auto">
        Select one or more receptor gene names from the same class to fetch and merge their
        orthologous alignments. Columns that human sequences contain gaps are not included. You can
        preview the combined alignment and download as a FASTA file.
      </p>

      <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md max-w-3xl mx-auto">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="receptorNames"
              render={() => (
                <FormItem>
                  <FormLabel>Select Receptors</FormLabel>
                  <FormControl>
                    <Command shouldFilter={false} className="rounded-lg border shadow-md">
                      <CommandInput
                        placeholder="Type receptor names (comma-separated)..."
                        value={inputValue}
                        onValueChange={handleInputChange}
                        onKeyDown={e=>{
                          if(showSuggestions && suggestions.length>0){
                           if(e.key==='ArrowDown'){e.preventDefault();setHighlightIndex((prev)=>(prev+1)%suggestions.length);}else if(e.key==='ArrowUp'){e.preventDefault();setHighlightIndex((prev)=>(prev-1+suggestions.length)%suggestions.length);}else if(e.key==='Enter'){e.preventDefault();if(highlightIndex>=0&&highlightIndex<suggestions.length){handleSuggestionClick(suggestions[highlightIndex]);}}
                          }
                        }}
                      />
                      {showSuggestions && (
                        <CommandList
                          className={
                            suggestions.length > 5 ? 'max-h-[300px] overflow-y-auto' : ''
                          }
                        >
                          {suggestions.length === 0 ? (
                            <CommandEmpty>No results found.</CommandEmpty>
                          ) : (
                            <CommandGroup>
                              {suggestions.map((receptor, index) => (
                                <CommandItem
                                  key={receptor.geneName}
                                  value={`${receptor.geneName} ${receptor.name}`}
                                  className={`px-4 py-2 cursor-pointer text-sm ${index===highlightIndex?'bg-accent':'hover:bg-accent'}`}
                                  onSelect={() => handleSuggestionClick(receptor)}
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

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Processing...
                </>
              ) : (
                'Combine Alignments'
              )}
            </Button>
          </form>
        </Form>
      </div>

      {visualizationSequences.length > 0 && (
        <div className="space-y-4">
          <div className="border rounded-lg p-4">
            <p className="text-sm text-muted-foreground mb-2">
              Showing {visualizationSequences.length} sequences
            </p>
            <MSAVisualization sequences={visualizationSequences} className="border-0" />
          </div>
        </div>
      )}
    </div>
  );
}
