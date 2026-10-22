import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TopologyFilterViewer } from '@/components/topology-filter/TopologyFilterViewer';

export const metadata: Metadata = {
  title: 'Topology filter | GPCR Evolution DB',
  description: 'The topology alignment of every GPCR family and what the 0.8 topology-score filter removed.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function TopologyFilterPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-8 py-4 px-4 sm:px-6 lg:px-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-left">Topology Filter</h1>
        <p className="text-base text-muted-foreground text-left">
          The sequences of each family with a single GPCR-like 7TM core were aligned, and every residue was replaced
          by its predicted topology state. Over the columns occupied in at least 30% of the sequences, runs of at
          least eight columns with a helix as the consensus state define the family&apos;s consensus helices. A
          sequence&apos;s topology score is the mean, over those helices, of the Jaccard similarity between the
          consensus helix columns and the columns where the sequence carries the same helix state, and sequences
          scoring below 0.8 were removed. Each family is scored in its own alignment, which holds only its own
          members: the sequences shared with a more specific family were assigned to it beforehand (GPR1 and
          Vomeronasal 1 are not in the Class A alignment, nor Vomeronasal 2 in the Class C alignment). The table
          shows what the filter removed from each family; the map below shows the topology alignment of the family
          selected, with the removed sequences tinted.
        </p>
      </div>
      <Suspense fallback={null}>
        <TopologyFilterViewer />
      </Suspense>
    </div>
  );
}
