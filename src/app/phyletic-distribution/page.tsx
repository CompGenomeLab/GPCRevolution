import type { Metadata } from 'next';
import { GeneVisualization } from '@/components/phyletic-distribution/GeneVisualization';

export const metadata: Metadata = {
  description: 'Explore gene-family distributions across eukaryotic NCBI taxa.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function PhyleticDistributionPage() {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-3 py-6 sm:px-5 lg:px-6">
      <div className="mb-6 max-w-4xl space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Eukaryotic Phyletic Distribution</h1>
        <p className="text-muted-foreground">
          Upload taxID-indexed family counts to explore their distribution across eukaryotic
          lineages in the NCBI Taxonomy.
        </p>
      </div>

      <GeneVisualization />
    </div>
  );
}
