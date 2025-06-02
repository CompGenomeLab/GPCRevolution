'use client';

import { useEffect, useState } from 'react';
import MSAVisualization from '@/components/MSAVisualization';

interface Sequence {
  header: string;
  sequence: string;
}

export function MSAViewer({ alignmentPath }: { alignmentPath: string | null }) {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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
    <div className="text-card-foreground rounded-lg p-4 shadow-md">
      <h2 className="text-xl font-semibold text-foreground mb-4">Multiple Sequence Alignment</h2>
      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
        </div>
      ) : sequences.length === 0 ? (
        <div className="text-center text-muted-foreground p-4">No alignment data available</div>
      ) : (
        <div className="w-full overflow-x-auto" style={{ maxWidth: '100vw' }}>
          <div style={{ minWidth: 'max-content' }}>
            <MSAVisualization sequences={sequences} />
          </div>
        </div>
      )}
    </div>
  );
}
