'use client';

import { useEffect, useState } from 'react';
import MSAVisualization from '@/components/MSAVisualization';
import useCleanedSequences from '@/hooks/useCleanedSequence';

interface Sequence {
  header: string;
  sequence: string;
}

export function MSAViewer({ alignmentPath }: { alignmentPath: string | null }) {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const cleanedSequences = useCleanedSequences(sequences);
  useEffect(() => {
    if (!alignmentPath) return;

    setIsLoading(true);
    fetch(`/alignments/${alignmentPath.split('/').pop()}`)
      .then(res => res.text())
      .then(text => {
        const fastaSequences = text.split('>').filter(Boolean);
        const parsedSequences = fastaSequences.map(seq => {
          const [header, ...sequenceParts] = seq.split('\n');
          const sequence = sequenceParts.join('').trim();
          return {
            header: header.trim(),
            sequence,
          };
        });
        setSequences(parsedSequences);
      })
      .catch(err => {
        console.error('Error loading alignment data:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [alignmentPath]);

  if (!alignmentPath) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Multiple Sequence Alignment of Orthologs</h3>
      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
        </div>
      ) : sequences.length === 0 ? (
        <div className="text-center text-muted-foreground p-4">No alignment data available</div>
      ) : (
        <div className="border rounded-lg p-4">
          <MSAVisualization sequences={cleanedSequences} className="border-0" />
        </div>
      )}
    </div>
  );
}
