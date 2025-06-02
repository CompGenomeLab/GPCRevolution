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
import { useState } from 'react';
import receptors from '../../../../public/receptors.json';
import { useFastaSequences } from '@/hooks/useFastaSequences';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download } from 'lucide-react';
import MSAVisualization from '@/components/MSAVisualization';

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

export default function CombineOrthologsPage() {
  const [searchResults, setSearchResults] = useState<Receptor[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedReceptors, setSelectedReceptors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string | null>(null);
  const [visualizationSequences, setVisualizationSequences] = useState<VisualizationSequence[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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

  const handleSearch = (value: string) => {
    if (!value.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setHasSearched(true);
    const results = receptors
      .filter(
        (receptor: Receptor) =>
          receptor.geneName.toLowerCase().includes(value.toLowerCase()) &&
          !selectedReceptors.includes(receptor.geneName)
      )
      .slice(0, 10);

    setSearchResults(results);
  };

  const handleSelect = (receptorName: string) => {
    const newSelected = [...selectedReceptors, receptorName];
    setSelectedReceptors(newSelected);
    form.setValue('receptorNames', newSelected);
    setSearchResults([]);
    setHasSearched(false);
  };

  const removeReceptor = (receptorName: string) => {
    const newSelected = selectedReceptors.filter(name => name !== receptorName);
    setSelectedReceptors(newSelected);
    form.setValue('receptorNames', newSelected);
  };

  async function onSubmit(values: FormValues) {
    try {
      setIsLoading(true);
      setError(null);
      setDownloadUrl(null);
      setDownloadFilename(null);
      setVisualizationSequences([]);

      const selectedReceptorData = values.receptorNames.map(name =>
        receptors.find(r => r.geneName.toLowerCase() === name.toLowerCase())
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
      console.log('Fetching class MSA from:', fastaFilePath);
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
        console.log('Fetching orthologs from:', orthologPath);
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

      console.log('Combined Sequences:', combinedSequences);
      const visualizationData = combinedSequences.map(seq => ({
        header: seq.header,
        sequence: seq.sequence,
      }));
      console.log('Visualization Data:', visualizationData);
      setVisualizationSequences(visualizationData);

      const fastaString = generateFastaString(combinedSequences);
      const filename = `${values.receptorNames.join('-')}_orthologs_combined.fasta`;

      const blob = new Blob([fastaString], { type: 'text/fasta' });
      const url = URL.createObjectURL(blob);

      setDownloadUrl(url);
      setDownloadFilename(filename);

      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An error occurred while processing the sequences.'
      );
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 py-4">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-left">Combine Orthologs</h1>
        {downloadUrl && downloadFilename && (
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              const link = document.createElement('a');
              link.href = downloadUrl;
              link.download = downloadFilename;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
          >
            <Download className="h-4 w-4" />
            Download Combined Alignment
          </Button>
        )}
      </div>
      <p className="text-lg text-muted-foreground text-left">
        Select one or more receptor gene names from the same class to fetch and merge their
        orthologous alignments. Columns that human sequences contain gaps are not included. You can
        preview the combined alignment and download as a FASTA file.
      </p>

      <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md max-w-2xl mx-auto">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="receptorNames"
              render={() => (
                <FormItem>
                  <FormLabel>Select Receptors</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <div className="flex flex-col flex-wrap gap-1.5 p-2 rounded-lg shadow-none bg-background">
                        <div className="flex flex-row gap-2 flex-wrap">
                          {selectedReceptors.map(name => (
                            <div
                              key={name}
                              className="flex flex-row items-center gap-1 bg-secondary px-2 py-0.5 rounded-md text-sm w-fit"
                            >
                              <span>{name}</span>
                              <button
                                type="button"
                                onClick={() => removeReceptor(name)}
                                className="text-muted-foreground hover:text-foreground text-sm"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                        <Command className="flex-1 min-w-[200px] border-border border-2">
                          <CommandInput
                            placeholder={
                              selectedReceptors.length === 0 ? 'Search for receptor...' : ''
                            }
                            onValueChange={handleSearch}
                            className="h-8"
                          />
                          {hasSearched && (
                            <CommandList className="absolute top-full left-0 right-0  rounded-lg shadow-none bg-background">
                              {searchResults.length === 0 ? (
                                <CommandEmpty>No results found.</CommandEmpty>
                              ) : (
                                <CommandGroup>
                                  {searchResults.map((receptor, index) => (
                                    <CommandItem
                                      key={index}
                                      value={receptor.geneName}
                                      className="cursor-pointer"
                                      onSelect={() => handleSelect(receptor.geneName)}
                                    >
                                      <div className="flex flex-col">
                                        <span className="font-medium">{receptor.geneName}</span>
                                        <span className="text-sm text-muted-foreground">
                                          Class: {receptor.class} | Orthologs:{' '}
                                          {receptor.numOrthologs} | LCA: {receptor.lca}
                                        </span>
                                      </div>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                            </CommandList>
                          )}
                        </Command>
                      </div>
                    </div>
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
          <h3 className="text-lg font-medium">Combined Alignment Preview</h3>
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
