'use client';

import SequenceLogoChart from '@/components/SequenceLogoChart';
import { useFastaParser } from '@/hooks/useFastaParser';

export default function LogoExamplePage() {
  const { sequences, loading, error } = useFastaParser({
    filePath: '/alignments/5HT1A_orthologs_MSA.fasta'
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground"></div>
            <p className="text-lg text-muted-foreground">Loading FASTA alignment...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <h1 className="text-3xl font-bold text-destructive mb-4">Error Loading Alignment</h1>
            <p className="text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-4">
            Sequence Logo Example
          </h1>
          <p className="text-muted-foreground mb-2">
            5HT1A Receptor Ortholog Alignment
          </p>
          <p className="text-sm text-muted-foreground">
            Total sequences loaded: {sequences.length}
          </p>
        </div>

                <SequenceLogoChart
          sequences={sequences}
          conservationFile="conservation_files/5HT1A_conservation.txt"
        />
      </div>
    </div>
  );
} 