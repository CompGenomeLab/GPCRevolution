import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SuperfamilyTreeViewer } from '@/components/superfamily-trees/SuperfamilyTreeViewer';

export const metadata: Metadata = {
  title: 'Superfamily trees | GPCR Evolution DB',
  description: 'Maximum likelihood trees of representative sequences from the GPCR families of the superfamily study.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function SuperfamilyTreesPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-8 py-4 px-4 sm:px-6 lg:px-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-left">GPCR Superfamily Trees</h1>
        <p className="text-base text-muted-foreground text-left">
          Maximum likelihood trees of representative sequences from the GPCR families of the superfamily study.
          Representatives were chosen to cover the taxonomic range of each family (up to 100 for Class A and cAMP,
          50 for Class C, 25 for GP143, GP157, GPR1 and STE3, and 20 for the other families). Four sequence sets
          were each aligned in two ways, giving eight trees: all 19 families, all families but STE2, a core set
          without STE2, STE3, Class C and Vomeronasal 2, and the core set with 18 sequences reported in earlier
          studies from lineages that our genomes do not sample. The core tree from the alignment with the higher
          gap penalty is the one shown in Figure 3 of the paper, and it opens by default. When the trees were built,
          the Dikarya (fungal) sequences of the GPR1 clade were still assigned to Class A. Because they fall within
          GPR1 in the trees, they were later reassigned to GPR1, and the trees label them as GPR1 by default. Choose
          &ldquo;As labelled in the trees&rdquo; under family labels to see their original Class A label.
        </p>
      </div>

      <Suspense fallback={null}>
        <SuperfamilyTreeViewer />
      </Suspense>

      <div className="grid gap-6 md:grid-cols-2 text-sm text-muted-foreground">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">How the trees were made</h2>
          <p>
            The 7TM core of each representative (first to seventh transmembrane helix, with five flanking residues)
            was aligned with MAFFT G-INS-i, once with a higher gap extension penalty (--ep 0.123, used for the main
            results) and once with the default penalty, and trimmed with ClipKIT (kpic-gappy). The substitution
            model was selected with IQ-TREE ModelFinder (JTT+FO with eight or nine free-rate categories in every
            case), and the best tree of 100 maximum likelihood searches was inferred with RAxML-NG. Branch support
            is the transfer bootstrap expectation (TBE) from up to 500 bootstrap trees.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">How to read them</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              The trees are rooted for display between the clade holding Class A, its nested families, GPR1 and the
              fungal cAMP sequences, and the remaining families. Branch lengths are in substitutions per site.
            </li>
            <li>
              In the simplified view, each shaded area is a clade whose sequences all belong to one family; clades of
              fewer than five sequences are not shaded. GPR1 nested within Class A shares one label.
            </li>
            <li>
              Literature sequences are marked with a star; in the circular view their star and ring cells take the
              colour of the family their study reported. The tooltip also gives the family of their closest
              sequence among our family members.
            </li>
            <li>
              The transfer index of a sequence, computed per sequence with{' '}
              <a href="https://github.com/evolbioinfo/booster" target="_blank" rel="noopener noreferrer"
                 className="underline hover:text-foreground">booster</a>{' '}
              (Lemoine et al. 2018,{' '}
              <a href="https://doi.org/10.1038/s41586-018-0043-0" target="_blank" rel="noopener noreferrer"
                 className="underline hover:text-foreground">Nature 556, 452–456</a>),
              measures how confidently it is placed; higher values mean a less stable placement. Sequences whose mean transfer index over the trees is at or above that of the most stable STE2
              sequence are considered unstable and can be faded, as in Figure 3.
            </li>
          </ul>
        </section>
      </div>

      <section className="space-y-2 text-sm text-muted-foreground">
        <h2 className="text-base font-semibold text-foreground">Literature sequences</h2>
        <p>The 18 literature sequences of the Core families + literature trees come from these studies.</p>
        <ul className="list-disc space-y-1 pl-5">
          {LITERATURE.map(({ text, doi, n }) => (
            <li key={doi}>
              {text}{' '}
              <a href={`https://doi.org/${doi}`} target="_blank" rel="noopener noreferrer"
                 className="underline hover:text-foreground">https://doi.org/{doi}</a>{' '}
              ({n} {n === 1 ? 'sequence' : 'sequences'})
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// the studies of the 18 literature sequences in the trees, with the number taken from each
const LITERATURE = [
  { n: 2, doi: '10.1073/pnas.2310347120',
    text: 'Behrens, M., Lang, T. & Korsching, S. I. A singular shark bitter taste receptor provides insights into the evolution of bitter taste perception. Proceedings of the National Academy of Sciences 120 (2023).' },
  { n: 14, doi: '10.7554/eLife.107467',
    text: 'Garcia De Las Bayonas, A. & King, N. G-protein-coupled receptor diversity and evolution in the closest living relatives of Metazoa. eLife 14 (2025).' },
  { n: 1, doi: '10.1093/molbev/msn262',
    text: 'Grus, W. E. & Zhang, J. Origin of the genetic components of the vomeronasal system in the common ancestor of all extant vertebrates. Molecular Biology and Evolution 26, 407–419 (2009).' },
  { n: 1, doi: '10.1093/chemse/bjac007',
    text: 'Kowatschew, D. & Korsching, S. I. Lamprey possess both V1R and V2R olfactory receptors, but only V1Rs are expressed in olfactory sensory neurons. Chemical Senses 47 (2022).' },
];
