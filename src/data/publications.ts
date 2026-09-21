import type { Publication } from '@/types/publication';

/**
 * References for the GPCR Evolution Database, grouped by year on the page.
 * Within a year,
 * unpublished manuscripts (those with a `status`) come first.
 */
export const publications: Publication[] = [
  {
    // TODO: on journal publication, replace `journal` with the final venue and
    // add `volume`, `issue`, `pages`, the journal `doi` and `pmid`.
    id: 'gpcrevolution-database',
    title: 'GPCR Evolution Database',
    authors: ['Berkay Selçuk', 'Ogün Adebali'],
    journal: 'bioRxiv',
    year: 2026,
    doi: '10.64898/2026.09.08.750181',
    note: 'Primary publication for this database, currently a preprint. Cite it whenever you use the database as a resource.',
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
