'use client';

import { useEffect, useState, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';
import { toast } from 'sonner';

interface Sequence {
  header: string;
  sequence: string;
}

interface VirtualizedMSAViewerProps {
  alignmentPath: string | null;
}

const ITEM_HEIGHT = 40;
const MAX_SEQUENCES_INITIAL = 50;

export function VirtualizedMSAViewer({ alignmentPath }: VirtualizedMSAViewerProps) {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [allSequences, setAllSequences] = useState<Sequence[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSequencesInChunks = useCallback(async (text: string) => {
    return new Promise<Sequence[]>(resolve => {
      const fastaSequences = text.split('>').filter(Boolean);
      const totalSequences = fastaSequences.length;
      const sequences: Sequence[] = [];
      let processed = 0;

      const processChunk = () => {
        const chunkSize = 10;
        const endIndex = Math.min(processed + chunkSize, totalSequences);

        for (let i = processed; i < endIndex; i++) {
          const seq = fastaSequences[i];
          const [header, ...sequenceParts] = seq.split('\n');
          const sequence = sequenceParts.join('').trim();
          sequences.push({
            header: header.trim(),
            sequence,
          });
        }

        processed = endIndex;
        const progress = Math.round((processed / totalSequences) * 100);
        setLoadingProgress(progress);

        if (processed < totalSequences) {
          requestAnimationFrame(processChunk);
        } else {
          resolve(sequences);
        }
      };

      processChunk();
    });
  }, []);

  useEffect(() => {
    if (!alignmentPath) return;

    const abortController = new AbortController();
    setIsLoading(true);
    setError(null);
    setLoadingProgress(0);

    fetch(`/alignments/${alignmentPath.split('/').pop()}`, {
      signal: abortController.signal,
    })
      .then(res => {
        if (!res.ok) {
          throw new Error(`Failed to fetch alignment: ${res.status}`);
        }
        return res.text();
      })
      .then(async text => {
        const allSeqs = await loadSequencesInChunks(text);
        setAllSequences(allSeqs);
        setSequences(allSeqs.slice(0, MAX_SEQUENCES_INITIAL));
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          toast.error('Error loading alignment data');
          setError(err instanceof Error ? err.message : 'An unknown error occurred');
        }
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => {
      abortController.abort();
    };
  }, [alignmentPath, loadSequencesInChunks]);

  const loadAllSequences = useCallback(() => {
    setSequences(allSequences);
    setShowAll(true);
  }, [allSequences]);

  const SequenceRow = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const sequence = sequences[index];
      if (!sequence) return null;

      return (
        <div style={style} className="flex items-center border-b border-border/30 px-2">
          <div className="w-48 truncate text-xs font-mono mr-4 text-muted-foreground">
            {sequence.header}
          </div>
          <div className="flex-1 font-mono text-xs whitespace-nowrap overflow-x-auto">
            {sequence.sequence.split('').map((aa, i) => (
              <span
                key={i}
                className={`inline-block w-4 text-center leading-none ${
                  aa === '-' ? 'text-muted-foreground' : 'text-foreground'
                }`}
              >
                {aa}
              </span>
            ))}
          </div>
        </div>
      );
    },
    [sequences]
  );

  if (!alignmentPath) return null;

  if (error) {
    return (
      <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
        <h2 className="text-lg font-medium mb-4">Multiple Sequence Alignment of Orthologs</h2>
        <div className="text-center text-destructive p-4">
          Failed to load alignment data: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md select-none">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Multiple Sequence Alignment of Orthologs</h2>
        {allSequences.length > MAX_SEQUENCES_INITIAL && !showAll && (
          <button
            onClick={loadAllSequences}
            className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            Show All {allSequences.length} Sequences
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground mr-4"></div>
            <span>Loading sequences... {loadingProgress}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${loadingProgress}%` }}
            ></div>
          </div>
        </div>
      ) : sequences.length === 0 ? (
        <div className="text-center text-muted-foreground p-4">No alignment data available</div>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Showing {sequences.length} of {allSequences.length} sequences
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <List
              height={Math.min(sequences.length * ITEM_HEIGHT, 400)}
              itemCount={sequences.length}
              itemSize={ITEM_HEIGHT}
              width="100%"
            >
              {SequenceRow}
            </List>
          </div>
        </div>
      )}
    </div>
  );
}
