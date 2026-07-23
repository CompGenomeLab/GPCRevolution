// Types for the Gene Visualization Tool
// Flexible taxonomy record supporting dynamic rank keys (e.g., kingdom, subphylum, species)
export interface TaxonomyRecord {
  taxID: string | number;
  [rank: string]: string | number;
}

export interface GeneCountData {
  [geneId: string]: number;
}

export interface TaxonData {
  taxID: string;
  counts: GeneCountData;
}

export interface VisualizationState {
  originalRaw: TaxonomyRecord[];
  raw: TaxonomyRecord[];
  taxa: string[];
  selectedLevels: TaxonomicLevel[];
  availableLevels: TaxonomicLevel[];
  totalInput: number;
  /** Number of input rows that have at least one family count > 0 */
  totalInputWithAnyCount?: number;
  geneNames: string[];
  defaultGeneNames: string[];
  customGeneNames: string[];
  customTsvLabel: string | null;
  matrix: Uint8Array | null;
  taxonCount: number;
  countMap: Map<string, GeneCountData>;
  /** Number of matched input rows that have any family count > 0 */
  matchedWithAnyCount?: number;
  /** Number of unique matched taxa (taxIDs) that have any family count > 0 */
  uniqueMatchedTaxaWithAnyCount?: number;
  taxIDIndex: Map<string, number>;
  geneIndex: Map<string, number>;
  coordMap: Map<string, number>;
  widthMap: Map<string, number>;
  normalizeLevel: TaxonomicLevel | '__ALL__' | null;
  activeGenes: string[];
  isLoading: boolean;
  loadingMessage: string;
  /** Current focused lineage (if any), to allow expanding to higher ranks */
  focusLevel?: TaxonomicLevel | null;
  focusCategory?: string | null;
  focusLevelIndex?: number | null;
}

// Allow dynamic ranks; we still recommend using a canonical order for display
export type TaxonomicLevel = string;

export interface ColorScale {
  (value: string): string;
}

export interface VisualizationConstants {
  FIXED_WIDTH: number;
  MARGINS: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  LEVEL_HEIGHT: number;
  INNER_PAD: number;
  RUG_HEIGHT: number;
  RUG_PAD: number;
  BASE_GAP: number;
  GOLDEN: number;
}

export interface FilterOptions {
  sizeFilterLevel: TaxonomicLevel | '';
  sizeFilterThreshold: number;
  searchTerm: string;
  lineageFilter: {
    level: TaxonomicLevel;
    category: string;
  } | null;
}

export interface DifferenceOptions {
  gene1: string;
  gene2: string;
  useCounts: boolean;
}

export interface RugPlotData {
  gene: string;
  index: number;
  baseY: number;
  active: boolean;
}

export interface LineageRun {
  cat: string;
  start: number;
  end: number;
}

export interface TooltipData {
  level: TaxonomicLevel;
  category: string;
  count: number;
  x: number;
  y: number;
} 

// ---------------------------------------------
// Legacy / utility types used by DataProcessor
// ---------------------------------------------

// Legacy alias retained for the older DataProcessor utility.
export type Taxon = TaxonomyRecord;

// Map of gene → count for a single taxon
export interface GeneData {
  [geneName: string]: number;
}

// Processed structure produced by DataProcessor
export interface ProcessedData {
  taxa: Taxon[];
  geneNames: string[];
  matrix: number[][];
  countMap: Map<string, GeneData>;
  taxonIndex: Map<string, number>;
  geneIndex: Map<string, number>;
}

export interface CoordinateMap {
  coordMap: Map<string, number>;
  widthMap: Map<string, number>;
}

// Alias for backwards-compatibility: a taxonomic level string
export type LineageLevel = TaxonomicLevel; 
