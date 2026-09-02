/** A single item listed under "Cite if you use" on a publication card. */
export interface CiteForItem {
  label: string;
  /** Optional in-site link to the page where the data or tool lives. */
  href?: string;
}

export interface Publication {
  /** Stable slug used as a React key and as the BibTeX key fallback. */
  id: string;
  title: string;
  /**
   * Authors in publication order. Write them as "Given Family" (the last
   * whitespace-separated word is taken as the surname) or, when the surname is
   * more than one word, as "Family, Given" and it is used verbatim.
   *
   * Leave undefined for a manuscript that is not published yet; the card then
   * hides the citation formats until the details are filled in.
   */
  authors?: string[];
  journal?: string;
  /** Omit for an unpublished manuscript and set `status` instead. */
  year?: number;
  /**
   * Shown in place of the year for a manuscript that has no year yet, e.g.
   * "In preparation" or "Under review". Entries without a year sort first.
   */
  status?: string;
  volume?: string;
  issue?: string;
  /** Page range or article number, e.g. "e202201439" or "1234-1245". */
  pages?: string;
  doi?: string;
  pmid?: string;
  /** Link used when there is no DOI, e.g. a preprint URL. */
  url?: string;
  /** Optional one-line context shown under the reference. */
  note?: string;
  /** Which parts of the GPCR Evolution Database this reference should be cited for. */
  citeFor?: {
    data?: CiteForItem[];
    tools?: CiteForItem[];
  };
}
