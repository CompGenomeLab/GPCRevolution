'use client';

import { useEffect, useState } from 'react';
import ConservationChart, { ConservationDatum } from './ConservationChart';

interface ConservationChartAsyncProps {
  conservationFile: string | null;
}

export default function ConservationChartAsync({ conservationFile }: ConservationChartAsyncProps) {
  const [conservationData, setConservationData] = useState<ConservationDatum[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setConservationData(null);
    setError(null);

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

  return <ConservationChart data={conservationData} />;
}
