'use client';

import { useEffect, useState, useRef } from 'react';
import MSAVisualization from '@/components/MSAVisualization';
import useCleanedSequences from '@/hooks/useCleanedSequence';

interface Sequence {
  header: string;
  sequence: string;
}

// Simple in-memory cache to avoid re-fetching alignments
const alignmentCache: Map<string, Sequence[]> = new Map();

export function MSAViewer({
  alignmentPath,
  conservationFile,
  onLoaded,
}: {
  alignmentPath: string | null;
  conservationFile: string | null;
  onLoaded?: () => void;
}) {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const hasCalledLoadedRef = useRef(false);
  const cleanedSequences = useCleanedSequences(sequences);

  useEffect(() => {
    if (!alignmentPath) return;

    const cacheKey = alignmentPath;
    if (alignmentCache.has(cacheKey)) {
      setSequences(alignmentCache.get(cacheKey)!);
      setIsLoading(false);
    } else {
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
          alignmentCache.set(cacheKey, parsedSequences);
        })
        .catch(err => {
          console.error('Error loading alignment data:', err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [alignmentPath, conservationFile]);

  // Notify parent when loading completes (either data fetched or error).
  useEffect(() => {
    if (hasCalledLoadedRef.current) return;

    const done = !isLoading && (sequences.length > 0 || alignmentPath === null);

    if (done) {
      hasCalledLoadedRef.current = true;
      onLoaded?.();
    }
  }, [isLoading, sequences.length, alignmentPath, onLoaded]);

  if (!alignmentPath) return null;

  return (
    <div className="bg-card text-card-foreground rounded-lg shadow-md select-none overflow-x-auto">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <h2 className="text-lg font-medium">Multiple Sequence Alignment of Orthologs</h2>
      </div>

      {/* Body */}
      <div className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-foreground"></div>
          </div>
        ) : sequences.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">No alignment data available</div>
        ) : (
          <MSAVisualization
            sequences={cleanedSequences}
            className="border-0"
            conservationFile={conservationFile}
          />
        )}
      </div>
    </div>
  );
}
