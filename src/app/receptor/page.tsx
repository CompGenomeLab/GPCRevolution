'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import receptors from '../../../public/receptors.json';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import RootContainer from '@/components/RootContainer';
import type { ConservationDatum } from '@/components/ConservationChart';
import ConservationChart from '@/components/ConservationChart';
import SnakePlot from '@/components/SnakePlot';
import { MSAViewer } from '@/components/MSAViewer';
import SVGTree from '@/components/SVGTree';
import DownloadableFiles from '@/components/DownloadableFiles';

interface Receptor {
  geneName: string;
  class: string;
  numOrthologs: number;
  lca: string;
  gpcrdbId: string;
  tree: string;
  alignment: string;
  conservationFile: string;
  snakePlot: string;
  svgTree: string;
}

export default function ReceptorPage() {
  return (
    <Suspense
      fallback={
        <RootContainer>
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-muted rounded mb-4"></div>
            <div className="space-y-4">
              <div className="h-4 w-32 bg-muted rounded"></div>
              <div className="h-4 w-64 bg-muted rounded"></div>
            </div>
          </div>
        </RootContainer>
      }
    >
      <ReceptorContent />
    </Suspense>
  );
}

function ReceptorContent() {
  const searchParams = useSearchParams();
  const gene = searchParams.get('gene');
  const [receptor, setReceptor] = useState<Receptor | null>(null);
  const [conservationData, setConservationData] = useState<ConservationDatum[] | null>(null);

  useEffect(() => {
    if (gene) {
      const found = receptors.find((r: Receptor) => r.geneName === gene);
      setReceptor(found || null);
    }
  }, [gene]);

  useEffect(() => {
    setConservationData(null);
    if (receptor?.conservationFile) {
      fetch(`/${receptor.conservationFile}`)
        .then(res => res.text())
        .then(text => {
          const lines = text.split(/\r?\n/).filter(d => d.trim() && !d.startsWith('residue'));
          const data = lines.map(line => {
            const [resStr, consStr, conservedAA, humanAA, region, gpcrdb] = line
              .trim()
              .split(/\s+/);
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
        });
    }
  }, [receptor?.conservationFile]);

  if (!gene) {
    return (
      <RootContainer>
        <h1 className="text-3xl font-bold text-foreground">Receptor Details</h1>
        <p className="text-lg text-muted-foreground">
          Please select a receptor from the{' '}
          <Link href="/" className="text-foreground hover:text-foreground/80 underline">
            search page
          </Link>
          .
        </p>
      </RootContainer>
    );
  }

  if (!receptor) {
    return (
      <RootContainer>
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
        </div>
      </RootContainer>
    );
  }

  return (
    <>
      <RootContainer>
        <div className="flex flex-col items-start justify-start">
          <Link
            href="/"
            className="text-foreground hover:text-foreground/80  flex items-center gap-0.5"
          >
            <ChevronLeft className="w-8 h-8" />
            <h1 className="text-3xl font-bold text-foreground hover:text-foreground/80">
              {receptor.geneName}
            </h1>
          </Link>
        </div>

        <div className="grid gap-6">
          <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Receptor Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Class</p>
                <p className="font-medium text-foreground">{receptor.class}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Number of Orthologs</p>
                <p className="font-medium text-foreground">{receptor.numOrthologs}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Common Ancestor</p>
                <p className="font-medium text-foreground">{receptor.lca}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">GPCRdb ID</p>
                <p className="font-medium text-foreground">{receptor.gpcrdbId}</p>
              </div>
            </div>
          </div>
        </div>

        {conservationData && <ConservationChart data={conservationData} />}

        <SnakePlot svgPath={receptor?.snakePlot || null} />

        <SVGTree svgPath={receptor?.svgTree || null} />

        <MSAViewer alignmentPath={receptor?.alignment || null} />

        <DownloadableFiles
          tree={receptor.tree}
          alignment={receptor.alignment}
          conservationFile={receptor.conservationFile}
        />
      </RootContainer>
    </>
  );
}
