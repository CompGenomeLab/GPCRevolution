/**
 * Transparency pages: hidden pages (not in the header, not indexed) that show how the data of the
 * site were produced. Each entry becomes a question on the FAQ page, which is how readers reach it.
 *
 * To add a page, create it under src/app/transparency/<slug>/page.tsx and add an entry here:
 *   {
 *     question: 'The question a reader would ask?',
 *     answer: 'One or two sentences on what was done.',
 *     href: '/transparency/<slug>',
 *     linkText: 'Page title',
 *     linkNote: 'what the page lets the reader inspect',
 *   },
 */
export interface TransparencyPage {
  question: string;
  answer: string;
  href: string;
  linkText: string;
  linkNote: string;
}

export const TRANSPARENCY_PAGES: TransparencyPage[] = [
  {
    question: 'How were sequences assigned to GPCR families?',
    answer:
      'The members of each family were taken as one or more clades of its search tree, after ordering ' +
      'the tree by search score. They were then kept only with a single GPCR-like 7TM core and a ' +
      'topology score of at least 0.8, and sequences claimed by two families were assigned to one of them.',
    href: '/transparency/family-assignment',
    linkText: 'Family Assignment',
    linkNote:
      'shows the search tree, the tree-ordered alignment, the search scores and the extracted clade of ' +
      'every family after each of these steps',
  },
  {
    question: 'How was the topology of the sequences used to filter them?',
    answer:
      "Every residue of each family's alignment was replaced by its predicted topology state, and each " +
      'sequence was scored by how well its transmembrane helices line up with the seven consensus helices of ' +
      'its family. Sequences scoring below 0.8 were removed.',
    href: '/transparency/topology-filter',
    linkText: 'Topology Filter',
    linkNote:
      'shows how many sequences the filter removed from each family and the topology alignment of every ' +
      'family, with the removed sequences marked',
  },
];
