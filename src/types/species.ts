/** Data of the per-species page, written by build_species_data.py
 * (GPCR_Superfamily, 04_overlap_assignment/website) into public/species/. */

/** 'control': a control sequence (G protein, TBP, RPB1); the GPCR filters do not apply to it */
export type SequenceStatus = 'kept' | 'core' | 'topology' | 'overlap' | 'dikarya' | 'control';

export interface SpeciesEntry {
  taxID: string;
  name: string;
  /** Figure 2 lineage of the genome, and its sub-lineage where Figure 2 gives one */
  lineage: string;
  sublineage: string;
  /** distinct sequences in any extracted family clade */
  candidates: number;
  /** final GPCR family members (after the GPR1 reassignment) */
  total: number;
  counts: Record<string, number>;
  controls: Record<string, number>;
}

export interface SpeciesIndex {
  families: { key: string; display: string; lineage: string }[];
  controls: { key: string; display: string }[];
  lineages: string[];
  speciesLineages: string[];
  species: SpeciesEntry[];
}

/** accession, family clade, E-value, topology score, status, final family, description, gene,
 * the other families whose topology-filtered clade also held it */
export type GpcrRow = [string, string, string, number | null, SequenceStatus, string, string, string, string[]];
/** accession, control, E-value, description, gene */
export type ControlRow = [string, string, string, string, string];

/** taxID, name, rank; a negative taxID is a grouping added in the study, not an NCBI node */
export type TaxonomyNode = [number, string, string];

export interface SpeciesPayload extends SpeciesEntry {
  /** from Eukaryota down to the genome */
  taxonomy: TaxonomyNode[];
  gpcr: GpcrRow[];
  controlRows: ControlRow[];
}
