'use client';

import { useEffect, useState, useRef } from 'react';
import ConservationChart, { ConservationDatum } from './ConservationChart';

interface ConservationChartAsyncProps {
  conservationFile: string | null;
  /** Callback fired once the chart data has loaded (success or error). */
  onLoaded?: () => void;
  height?: number;
}

export default function ConservationChartAsync({ conservationFile, onLoaded, height }: ConservationChartAsyncProps) {
  const [conservationData, setConservationData] = useState<ConservationDatum[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasCalledLoadedRef = useRef(false);
  const loadStartRef = useRef<number | null>(null);

  useEffect(() => {
    setConservationData(null);
    setError(null);
    hasCalledLoadedRef.current = false;
    loadStartRef.current = Date.now();

    if (!conservationFile) return;

    setIsLoading(true);

    fetch(`/${conservationFile}`)
      .then(res => {
        if (!res.ok) {
          throw new Error(`Failed to fetch conservation data: ${res.status}`);
        }
        return res.text();
      })
      .then(text => {
        const lines = text.split(/\r?\n/).filter(d => d.trim() && !d.startsWith('residue'));
        const data = lines.map(line => {
          const [resStr, consStr, conservedAA, humanAA, region, gpcrdb] = line.trim().split(/\s+/);
          return {
            residue: +resStr,
            conservation: +consStr,
            conservedAA,
            humanAA,
            region,
            gpcrdb,
          };
        });

        setConservationData(data);
      })
      .catch(err => {
        console.error('Error loading conservation data:', err);
        setError(err.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [conservationFile]);

  // Notify parent when loading completes (either data or error).
  useEffect(() => {
    if (hasCalledLoadedRef.current) return;
    const done = !isLoading && conservationFile && (conservationData !== null || error !== null);
    if (done) {
      const elapsed = loadStartRef.current ? Date.now() - loadStartRef.current : 0;
      const remaining = Math.max(0, 1000 - elapsed);
      hasCalledLoadedRef.current = true;
      window.setTimeout(() => onLoaded?.(), remaining);
    }
  }, [isLoading, conservationData, error, conservationFile, onLoaded]);

  if (!conservationFile) return null;

  if (isLoading) {
    return (
      <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-muted rounded"></div>
          <div className="h-64 w-full bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
        <h2 className="text-xl font-semibold text-foreground mb-4">Conservation Chart</h2>
        <div className="text-center text-muted-foreground p-4">
          Failed to load conservation data: {error}
        </div>
      </div>
    );
  }

  if (!conservationData || conservationData.length === 0) {
    return (
      <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
        <h2 className="text-xl font-semibold text-foreground mb-4">Conservation Chart</h2>
        <div className="text-center text-muted-foreground p-4">No conservation data available</div>
      </div>
    );
  }

  return <ConservationChart data={conservationData} height={height} />;
}
