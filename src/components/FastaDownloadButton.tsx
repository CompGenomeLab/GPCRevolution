'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const fmtInt = (n: number) => n.toLocaleString('en-US');

/**
 * "Download FASTA" with the number of sequences on the button and what they are in its hover text. `download`
 * does the work (src/lib/sequence-download.ts) and reports how many byte ranges are fetched.
 */
export function FastaDownloadButton({ count, detail, download, unavailable }: {
  /** sequences the download holds; null while it is being worked out */
  count: number | null;
  /** hover text: what the sequences are */
  detail: string;
  download: (onProgress: (done: number, total: number) => void) => Promise<void>;
  /** when set, the button is disabled and this is its hover text */
  unavailable?: string;
}) {
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null;
  const empty = count === 0;

  const run = () => {
    setError(null);
    setProgress([0, 0]);
    download((d, t) => setProgress([d, t]))
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setProgress(null));
  };

  return (
    <span className="inline-flex items-center gap-2" title={unavailable || (empty ? 'No sequences in this selection' : detail)}>
      <Button variant="outline" size="sm" onClick={run} disabled={busy || empty || !!unavailable}>
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
        {busy ? `Preparing${progress[1] ? ` ${progress[0]}/${progress[1]}` : ''}…` : 'Download FASTA'}
        {!busy && !unavailable && count !== null && !empty && (
          <span className="ml-1 text-xs text-muted-foreground">({fmtInt(count)})</span>
        )}
      </Button>
      {error && <span className="text-xs text-destructive">Download failed: {error}</span>}
    </span>
  );
}
