/** Data of the superfamily-trees page, written by build_superfamily_trees_data.py
 * (GPCR_Superfamily, 09_superfamily_phylogeny/website) into public/superfamily-trees/. */

export interface TreeNode {
  /** parent index, -1 for the root; nodes are in preorder */
  p: number;
  /** root-to-node distance (substitutions per site) */
  rt: number;
  /** TBE of the branch above an internal node */
  s?: number | null;
  leaf?: 1;
  acc?: string;
  /** family key (classA, GP157, ...; LIT_<family> for a literature sequence) */
  fam?: string;
  /** family after the phylogeny-based reassignment, where it differs (Dikarya Class A -> GPR1) */
  fam2?: string;
  /** family as labelled in the trees, kept when the page shows the reassigned families */
  famTree?: string;
  /** one of the five lineage groups of the index */
  grp?: string;
  /** the taxon the lineage group was read from */
  lin?: string;
  /** transfer index in this tree, and its mean over the final trees holding the sequence */
  ti?: number | null;
  mti?: number | null;
  /** [rank, name] pairs, kingdom to species */
  tax?: [string, string][];
  /** literature sequences */
  lit?: 1;
  sp?: string;
  claimed?: string;
  study?: string;
  closest?: string;
}

export interface TreeData {
  name: string;
  /** mean transfer index of the most stable STE2 sequence */
  ste2Cut: number;
  colors: Record<string, string>;
  nodes: TreeNode[];
}

export interface TreeIndexEntry {
  file: string;
  set: string;
  setName: string;
  setNote: string;
  alignment: string;
  alignmentName: string;
  alignmentNote: string;
  leaves: number;
}

export interface TreeIndex {
  groups: string[];
  trees: TreeIndexEntry[];
}
