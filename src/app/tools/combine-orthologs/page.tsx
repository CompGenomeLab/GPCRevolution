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
import { useState } from 'react';
import receptors from '../../../../public/receptors.json';
import { useFastaSequences } from '@/hooks/useFastaSequences';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download } from 'lucide-react';
import MSAVisualization from '@/components/MSAVisualization';
import { MultiSelect } from '@/components/MultiSelect';

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

  async function onSubmit(values: FormValues) {
    try {
      setIsLoading(true);
      setError(null);
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
      <div className="flex justify-between items-center max-w-2xl mx-auto">
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
      <p className="text-lg text-muted-foreground text-left max-w-2xl mx-auto">
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
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Select Receptors</FormLabel>
                  <FormControl>
                    <MultiSelect
                      placeholder="Search for receptors..."
                      options={receptors.map((receptor: Receptor) => ({
                        label: `${receptor.geneName} (Class: ${receptor.class}, Orthologs: ${receptor.numOrthologs})`,
                        value: receptor.geneName,
                      }))}
                      onValueChange={values => {
                        field.onChange(values);
                        setSelectedReceptors(values);
                      }}
                      defaultValue={selectedReceptors}
                      variant="secondary"
                      animation={0.3}
                      maxCount={5}
                      className="w-full"
                    />
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
