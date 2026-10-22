import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FamilyAssignmentViewer } from '@/components/family-assignment/FamilyAssignmentViewer';

export const metadata: Metadata = {
  title: 'Family assignment | GPCR Evolution DB',
  description: 'How the members of each GPCR family were extracted from their search trees and filtered.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function FamilyAssignmentPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-8 py-4 px-4 sm:px-6 lg:px-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-left">Family Assignment</h1>
        <p className="text-base text-muted-foreground text-left">
          How the members of each family were taken from its homology search. Every track shares one
          x-axis, the leaf order of the score-ordered search tree, with the highest-scoring sequences on
          the left. The extracted clade is tinted across all tracks, and the step buttons re-tint it for
          the members left after each filter: a single GPCR-like 7TM core, a topology score of at least
          0.8 and the assignment of sequences claimed by two families. For Class A, a last step shows
          the reassignment of Dikarya Class A sequences to GPR1.
        </p>
      </div>
      <Suspense fallback={null}>
        <FamilyAssignmentViewer />
      </Suspense>
    </div>
  );
}
