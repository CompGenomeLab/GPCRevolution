import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SpeciesViewer } from '@/components/species/SpeciesViewer';

export const metadata: Metadata = {
  title: 'GPCRs per species | GPCR Evolution DB',
  description: 'Every potential GPCR of each searched eukaryotic genome, with the filtering step that kept or removed it.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function SpeciesPage() {
  return (
    // Darker frames than the site's light-mode border, on this page only; dark mode keeps its own. Cursors: a hand
    // on everything clickable (Tailwind v4 gives buttons the default arrow), a help cursor on the info icons.
    <div className="max-w-7xl mx-auto space-y-8 py-4 px-4 sm:px-6 lg:px-8 [--border:#CFC8BD] [--input:#CFC8BD] dark:[--border:#3A3A3A] dark:[--input:#3A3A3A] [&_button:not(:disabled)]:cursor-pointer [&_summary]:cursor-pointer [&_button[aria-label^=About][type=button]]:cursor-help">
      <Suspense fallback={null}>
        <SpeciesViewer />
      </Suspense>
    </div>
  );
}
