/** Data of the topology-filter page, written by build_topology_filter_data.py
 * (GPCR_Superfamily, 03_topology_filter/website) into public/topology-filter/. */

export interface TopologyColumn {
  /** index in the full alignment */
  i: number;
  gap: number;
  cons: string;
  consFrac: number;
  counts: Record<string, number>;
}

export interface TopologyPayload {
  nSeq: number;
  nCol: number;
  alignmentWidth: number;
  alphabet: string;
  labels: string[];
  columns: TopologyColumn[];
  ids: string[];
  descriptions: string[];
  genes: (string | null)[];
  /** nSeq rows of nCol topology states, concatenated */
  matrix: string;
}

export interface TopologyFamilyEntry {
  family: string;
  display: string;
  single_core: number;
  kept: number;
  removed: number;
  bin_width: number;
  histogram: number[];
}

export interface TopologyIndex {
  cutoff: number;
  families: TopologyFamilyEntry[];
}
