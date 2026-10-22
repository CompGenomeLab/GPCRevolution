/** Data of the family-assignment page, written by build_family_assignment_data.py
 * (GPCR_Superfamily, 02_clade_extraction/website) into public/family-assignment/. */

export type StageKey =
  | 'initial'
  | 'after_7tm'
  | 'after_topology'
  | 'after_assignment'
  | 'after_reassignment';

export interface HighlightSet {
  label: string;
  n: number;
  /** Count over the complete membership, for families sampled into their own tree. */
  n_complete?: number;
  /** [startBin, endBin) on the binned x-axis. */
  ranges: [number, number][];
  depths: number[];
  no_data: boolean;
}

export interface CrossBlock {
  gene: string;
  bin_start: number;
  bin_end: number;
  leaf_start: number;
  leaf_end: number;
  n: number;
  sparse: boolean;
  purity: number;
  coverage: number;
  complete_set: boolean;
  extra_set: boolean;
  positions?: number[];
}

/** [leaf index, UniProt entry name, 1 if reviewed (2 for a guide sequence)] */
export type Marker = [number, string, number];

export interface FamilyBundle {
  gene: string;
  search_name: string;
  hmmregion: number | string;
  n_leaves: number;
  n_clade_leaves: number;
  pending: boolean;
  bin_size: number;
  n_bins: number;
  aln_len: number;
  highlight_sets: Partial<Record<StageKey, HighlightSet>>;
  msa: { categories: string[]; colors: string[]; cat_rows: string[]; frac_rows: string[] };
  score: {
    score_smoothed_mean: (number | null)[];
    index_smoothed_mean: (number | null)[];
    score_raw_leaf: (number | null)[];
    index_raw_leaf: (number | null)[];
  } | null;
  /** h: [x0Bin, x1Bin, depth], v: [xBin, depth0, depth1] */
  tree: { max_depth: number; h: [number, number, number][]; v: [number, number, number][] };
  sources: { tree: string; msa_fasta: string; lineplot: string | null; lineplot_expected: string };
  cross_sets?: Partial<Record<StageKey, CrossBlock[]>>;
  human?: Marker[];
  human_sets?: Partial<Record<StageKey, Marker[]>>;
  human_noun?: string;
  human_group_title?: string;
  human_track_label?: string;
  complete_set?: { file: string; n: number };
}

export interface FamilyIndexEntry {
  gene: string;
  display: string;
  control: boolean;
  n_leaves: number;
  n_clade_leaves: number;
  aln_len: number;
}
