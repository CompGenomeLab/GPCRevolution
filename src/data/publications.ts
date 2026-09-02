import type { Publication } from '@/types/publication';

/**
 * References for GPCRevolution, grouped by year on the page. Within a year,
 * unpublished manuscripts (those with a `status`) come first.
 */
export const publications: Publication[] = [
  {
    // TODO: on publication, replace the title with the final one and add
    // `authors`, `journal`, `year`, `doi` and `pmid`. Delete `status` once
    // `year` is set — the card then shows the full citation formats
    // automatically.
    id: 'gpcrevolution-database',
    title: 'GPCR Evolution Database Manuscript',
    year: 2026,
    status: 'In preparation',
    note: 'Primary publication for this database. Cite it whenever you use the database as a resource.',
  },
  {
    id: 'selcuk-2026-residue-profiling',
    title:
      'Decoding functional specialization in G protein-coupled receptors (GPCRs) through evolution-guided residue profiling',
    authors: ['Berkay Selçuk', 'Gunnar Schulte', 'Igor B. Zhulin', 'Ogün Adebali'],
    journal: 'British Journal of Pharmacology',
    year: 2026,
    doi: '10.1111/bph.70538',
    pmid: '42464499',
    citeFor: {
      data: [
        { label: 'Ortholog sequence sets', href: '/receptor' },
        { label: 'Orthologous multiple sequence alignments', href: '/receptor' },
        { label: 'Residue conservation scores', href: '/receptor' },
        { label: 'Ortholog trees', href: '/receptor' },
        { label: 'Sequence logos', href: '/receptor' },
        { label: 'Residue conservation snake plots', href: '/receptor' },
      ],
      tools: [
        { label: 'Differential Residue Conservation', href: '/tools/receptor-comparison' },
        { label: 'Multi-Receptor Comparison', href: '/tools/multi-receptor-comparison' },
        { label: 'Combine Orthologs', href: '/tools/combine-orthologs' },
      ],
    },
  },
];
