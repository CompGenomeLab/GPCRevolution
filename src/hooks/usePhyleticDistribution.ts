import React, { useState, useCallback, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import LineageAutocomplete from '@/components/phyletic-distribution/LineageAutocomplete';
import { sortPhyleticGenes } from '@/lib/phyletic-distribution-families';
import type { 
  TaxonomyRecord, 
  GeneCountData, 
  VisualizationState, 
  TaxonomicLevel, 
  DifferenceOptions
} from '@/types/phyletic-distribution';

// Hardcoded taxonomy file to use
const TAXONOMY_FILE = '/phyletic-distribution/taxonomy_eukaryotes_filtered.json';
const TAXONOMY_TREE_ORDER_FILE =
  '/phyletic-distribution/taxonomy_eukaryotes_filtered.tree-order.json';
const SOURCE_DATASETS = [
  {
    value: 'unfiltered',
    label: 'Unfiltered',
    file: '/phyletic-distribution/tax_counts_per_family_unfiltered.tsv',
  },
  {
    value: 'best-eval',
    label: 'E≤0.1 BestEval',
    file: '/phyletic-distribution/tax_counts_per_family_e0.1_BestEval.tsv',
  },
  {
    value: 'best-eval-all-controls',
    label: 'E≤0.1 BestEval + all controls',
    file: '/phyletic-distribution/tax_counts_per_family_e0.1_BestEval_allControls.tsv',
  },
] as const;
type SourceDataValue = (typeof SOURCE_DATASETS)[number]['value'];
const DEFAULT_SOURCE_DATA: SourceDataValue = 'best-eval-all-controls';
type TaxonFilterSettings = {
  removeAllZero: boolean;
  family: string | 'ANY';
  familyMinimum: number;
  rank: TaxonomicLevel | null;
  rankMinimum: number;
};

const EMPTY_TAXON_FILTERS: TaxonFilterSettings = {
  removeAllZero: false,
  family: 'ANY',
  familyMinimum: 0,
  rank: null,
  rankMinimum: 0,
};

function applyTaxonFilters(
  records: TaxonomyRecord[],
  state: VisualizationState,
  filters: TaxonFilterSettings,
) {
  let filtered = records;

  if (filters.removeAllZero) {
    filtered = filtered.filter(record => {
      const counts = state.countMap.get(String(record.taxID));
      return !!counts && Object.values(counts).some(count => count > 0);
    });
  }

  if (filters.rank && filters.rankMinimum > 0) {
    const speciesByRank = new Map<string, Set<string>>();
    records.forEach(record => {
      const rankName = String(record[filters.rank!] || '');
      if (!rankName) return;
      const species = String(record.species || record.taxID);
      if (!speciesByRank.has(rankName)) speciesByRank.set(rankName, new Set());
      speciesByRank.get(rankName)!.add(species);
    });
    filtered = filtered.filter(record => {
      const rankName = String(record[filters.rank!] || '');
      return (speciesByRank.get(rankName)?.size || 0) >= filters.rankMinimum;
    });
  }

  if (filters.familyMinimum > 0) {
    const families = filters.family === 'ANY'
      ? (state.activeGenes.length > 0 ? state.activeGenes : state.geneNames)
      : [filters.family];
    filtered = filtered.filter(record => {
      const counts = state.countMap.get(String(record.taxID));
      return !!counts && families.some(family => (counts[family] || 0) >= filters.familyMinimum);
    });
  }

  return filtered;
}
// Taxonomic levels excluding domain (start from kingdom)
const ALL_LEVELS: TaxonomicLevel[] = [
  'kingdom',
  'phylum',
  'subphylum',
  'superclass',
  'class',
  'superorder',
  'order',
  'suborder',
  'infraorder',
  'parvorder',
  'superfamily',
  'family',
  'subfamily',
  'genus',
  'species',
];
const GOLDEN = 0.618033988749895;

// using internal fallback colors for legends only; rectangle colors are inlined in VisualizationCanvas

export function usePhyleticDistribution() {
  const [state, setState] = useState<VisualizationState>({
    originalRaw: [],
    raw: [],
    taxa: [],
    selectedLevels: ['kingdom'],
    availableLevels: ALL_LEVELS,
    totalInput: 0,
    totalInputWithAnyCount: 0,
    geneNames: [],
    defaultGeneNames: [],
    customGeneNames: [],
    customTsvLabel: null,
    matrix: null,
    taxonCount: 0,
    countMap: new Map(),
    matchedWithAnyCount: 0,
    uniqueMatchedTaxaWithAnyCount: 0,
    taxIDIndex: new Map(),
    geneIndex: new Map(),
    coordMap: new Map(),
    widthMap: new Map(),
    normalizeLevel: null,
    activeGenes: [],
    isLoading: true,
    loadingMessage: 'Loading NCBI taxonomy data...',
    focusLevel: null,
    focusCategory: null,
    focusLevelIndex: null,
  });

  const [containerWidth, setContainerWidth] = useState(1200);
  const [sourceData, setSourceData] = useState<SourceDataValue>(DEFAULT_SOURCE_DATA);
  // for our new autocomplete component
  const [lineageOptions, setLineageOptions] = useState<string[]>([]);
  // dynamic set of taxonomy levels available for searching (does not affect visual ranks)
  const [searchableLevels, setSearchableLevels] = useState<TaxonomicLevel[]>(ALL_LEVELS);
  const defaultTSVTextRef = useRef<string | null>(null);
  const customTSVTextRef = useRef<string | null>(null);
  const customTSVLabelRef = useRef<string | null>(null);
  const taxonFilterStateRef = useRef<TaxonFilterSettings>({ ...EMPTY_TAXON_FILTERS });

  // Visualization modes for rug rendering
  const [rugMode, setRugMode] = useState<'normalized' | 'binary' | 'heatmap'>('binary');

  // Global color mapping to ensure consistent colors across all data changes
  const globalColorMapRef = useRef<{ [key: string]: string }>({});
  
  // Soft but visible color generator using HSL color space
  const generatePastelColor = useCallback((index: number): string => {
    // Keep lineage cache stable but unused now for rectangle drawing
    const FALLBACK_COLORS = ['#231F20','#FCB315','#7CAEC4','#DD6030','#7D2985','#B4B4B4'];
    return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
  }, []);
  
  // Get or assign color for a specific lineage
  const getLineageColor = useCallback((lineageName: string): string => {
    if (!globalColorMapRef.current[lineageName]) {
      const existingColors = Object.keys(globalColorMapRef.current).length;
      globalColorMapRef.current[lineageName] = generatePastelColor(existingColors);
    }
    return globalColorMapRef.current[lineageName];
  }, [generatePastelColor]);

  // Load taxonomy data on component mount
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await loadTaxonomyData(TAXONOMY_FILE);

      if (cancelled) return;

      if (!cancelled) await selectSourceData(DEFAULT_SOURCE_DATA);
    };

    run();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onWidthChange = useCallback((width: number) => {
    setContainerWidth(width);
  }, []);

  const loadTaxonomyData = useCallback(async (fileName: string) => {
    try {
      const [response, orderResponse] = await Promise.all([
        fetch(fileName),
        fetch(TAXONOMY_TREE_ORDER_FILE),
      ]);
      if (!response.ok) {
        throw new Error(`Could not load taxonomy data (HTTP ${response.status})`);
      }
      if (!orderResponse.ok) {
        throw new Error(`Could not load taxonomy tree order (HTTP ${orderResponse.status})`);
      }
      const jsonData: TaxonomyRecord[] = await response.json();
      const parsedTreeOrder: unknown = await orderResponse.json();
      if (!Array.isArray(parsedTreeOrder) || !parsedTreeOrder.every(value => typeof value === 'string')) {
        throw new Error('Taxonomy tree order must be an array of taxID strings');
      }
      const treeOrder = parsedTreeOrder as string[];

      // Build a map of lowercase key -> representative actual key across all records
      const lowerToActualKey = new Map<string, string>();
      for (const rec of jsonData) {
        for (const k of Object.keys(rec)) {
          const lower = k.toLowerCase();
          if (!lowerToActualKey.has(lower)) lowerToActualKey.set(lower, k);
        }
      }

      // Detect taxID key case-insensitively and normalize to 'taxID'
      const taxIdActualKey = lowerToActualKey.get('taxid');
      if (!taxIdActualKey) {
        throw new Error('taxID key not found in taxonomy JSON');
      }

      // Normalize canonical visualization ranks to lowercase keys (e.g., 'Kingdom' -> 'kingdom')
      const normalizedRecords: TaxonomyRecord[] = jsonData.map((rec) => {
        const out: TaxonomyRecord = { ...rec };
        // ensure canonical taxID
        out.taxID = String((rec as any)[taxIdActualKey] ?? '');
        for (const level of ALL_LEVELS) {
          const actual = lowerToActualKey.get(level.toLowerCase());
          if (actual && (rec as any)[actual] !== undefined && (rec as any)[actual] !== null && String((rec as any)[actual]).trim() !== '') {
            (out as any)[level] = (rec as any)[actual];
          }
        }
        return out;
      });
      const recordsByTaxID = new Map(
        normalizedRecords.map(record => [String(record.taxID), record])
      );
      if (
        recordsByTaxID.size !== normalizedRecords.length ||
        treeOrder.length !== normalizedRecords.length ||
        new Set(treeOrder).size !== treeOrder.length ||
        treeOrder.some(taxID => !recordsByTaxID.has(taxID))
      ) {
        throw new Error('Taxonomy JSON and Newick tree order contain different taxID sets');
      }
      const normalizedData = treeOrder.map(taxID => recordsByTaxID.get(taxID)!);

      setState(prev => ({
        ...prev,
        originalRaw: normalizedData,
        raw: normalizedData.slice(),
        taxa: normalizedData.map(d => String(d.taxID)),
        taxonCount: normalizedData.length,
        taxIDIndex: new Map(normalizedData.map((d, i) => [String(d.taxID), i])),
        availableLevels: ALL_LEVELS,
        selectedLevels: prev.selectedLevels.every(l => ALL_LEVELS.includes(l)) && prev.selectedLevels.length > 0
          ? prev.selectedLevels
          : ['kingdom'], // Default to kingdom as requested
        focusLevel: null,
        focusCategory: null,
        focusLevelIndex: null,
        isLoading: false,
        loadingMessage: '',
      }));

      // Determine searchable taxonomy levels dynamically (skip taxID case-insensitively)
      const levelHasValue = new Map<string, boolean>();
      for (const record of normalizedData) {
        for (const key of Object.keys(record)) {
          if (key.toLowerCase() === 'taxid') continue;
          const val = (record as any)[key];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            levelHasValue.set(key, true);
          } else if (!levelHasValue.has(key)) {
            levelHasValue.set(key, false);
          }
        }
      }
      const dynamicLevels = Array.from(levelHasValue.entries())
        .filter(([, has]) => has)
        .map(([k]) => k)
        .sort((a, b) => a.localeCompare(b));
      setSearchableLevels(dynamicLevels);

      // Derive unique lineage strings across all searchable taxonomy levels
      const options = Array.from(
        new Set(
          normalizedData
            .flatMap(d => dynamicLevels.map(l => (d as any)[l] as string).filter(Boolean))
            .map(String)
        )
      ).sort();
      setLineageOptions(options);
    } catch (error) {
      console.error('Error loading taxonomy data:', error);
      setState(prev => ({ ...prev, isLoading: false, loadingMessage: '' }));
      alert('Error loading taxonomy data: ' + error);
    }
  }, []);

  const parseTSVCounts = useCallback((tsvText: string, taxIDIndexMap: Map<string, number>) => {
    const lines = tsvText.trim().split(/\r?\n/);
    const header = lines.shift()?.split('\t') || [];
    const rows = lines.filter(Boolean);
    const taxIDColumnIndex = header.findIndex(name => name.trim().toLowerCase() === 'taxid');

    if (taxIDColumnIndex === -1) {
      throw new Error('taxID column not found in TSV file');
    }

    const countColumns = header
      .map((name, index) => ({ name: name.trim(), index }))
      .filter(({ name }) => name.endsWith('_count'));
    const geneNames = countColumns.map(column => column.name);
    const countMap = new Map<string, GeneCountData>();
    let totalInputWithAnyCount = 0;
    let matchedWithAnyCount = 0;
    const uniqueMatchedTaxaWithAnyCount = new Set<string>();

    rows.forEach(rowText => {
      const row = rowText.split('\t');
      const taxID = row[taxIDColumnIndex]?.trim();
      if (!taxID) return;

      const counts: GeneCountData = {};
      let hasPositiveCount = false;
      countColumns.forEach(({ name, index }) => {
        const count = Number(row[index]) || 0;
        counts[name] = count;
        if (count > 0) hasPositiveCount = true;
      });

      if (hasPositiveCount) totalInputWithAnyCount += 1;
      if (!taxIDIndexMap.has(taxID)) return;

      countMap.set(taxID, counts);
      if (hasPositiveCount) {
        matchedWithAnyCount += 1;
        uniqueMatchedTaxaWithAnyCount.add(taxID);
      }
    });

    return {
      totalInput: rows.length,
      totalInputWithAnyCount,
      matchedWithAnyCount,
      uniqueMatchedTaxaWithAnyCount: uniqueMatchedTaxaWithAnyCount.size,
      geneNames,
      countMap,
    };
  }, []);

  const buildMergedCounts = useCallback((
    prev: VisualizationState,
    defaultData: ReturnType<typeof parseTSVCounts>,
    customData?: ReturnType<typeof parseTSVCounts>,
  ) => {
    const customGeneNames = customData?.geneNames || [];
    const geneNames = [...defaultData.geneNames, ...customGeneNames];
    const geneIndex = new Map(geneNames.map((gene, index) => [gene, index]));
    const matrix = new Uint8Array(geneNames.length * prev.taxonCount);
    const countMap = new Map<string, GeneCountData>();

    prev.originalRaw.forEach(record => {
      const taxID = String(record.taxID);
      const taxonIndex = prev.taxIDIndex.get(taxID);
      if (taxonIndex === undefined) return;

      const defaultCounts = defaultData.countMap.get(taxID) || {};
      const customCounts = customData?.countMap.get(taxID) || {};
      const combinedCounts: GeneCountData = { ...defaultCounts, ...customCounts };
      countMap.set(taxID, combinedCounts);

      geneNames.forEach((gene, genePosition) => {
        if ((combinedCounts[gene] || 0) > 0) {
          matrix[genePosition * prev.taxonCount + taxonIndex] = 1;
        }
      });
    });

    return {
      totalInput: defaultData.totalInput,
      totalInputWithAnyCount: defaultData.totalInputWithAnyCount,
      matchedWithAnyCount: defaultData.matchedWithAnyCount,
      uniqueMatchedTaxaWithAnyCount: defaultData.uniqueMatchedTaxaWithAnyCount,
      geneNames,
      defaultGeneNames: defaultData.geneNames,
      customGeneNames,
      customTsvLabel: customData ? customTSVLabelRef.current : null,
      geneIndex,
      matrix,
      countMap,
    };
  }, [parseTSVCounts]);

  const loadTSVData = useCallback((tsvText: string, label = 'source data') => {
    defaultTSVTextRef.current = tsvText;
    taxonFilterStateRef.current = { ...EMPTY_TAXON_FILTERS };
    setState(prev => ({
      ...prev,
      isLoading: true,
      loadingMessage: `Processing ${label}...`,
    }));

    setTimeout(() => {
      setState(prev => {
        try {
          const defaultData = parseTSVCounts(tsvText, prev.taxIDIndex);
          const customData = customTSVTextRef.current
            ? parseTSVCounts(customTSVTextRef.current, prev.taxIDIndex)
            : undefined;
          const merged = buildMergedCounts(prev, defaultData, customData);
          return {
            ...prev,
            ...merged,
            raw: prev.originalRaw.slice(),
            taxa: prev.originalRaw.map(record => String(record.taxID)),
            activeGenes: prev.activeGenes.filter(gene => merged.geneIndex.has(gene)),
            focusLevel: null,
            focusCategory: null,
            focusLevelIndex: null,
            isLoading: false,
            loadingMessage: '',
          };
        } catch (error) {
          return {
            ...prev,
            isLoading: false,
            loadingMessage: error instanceof Error ? error.message : 'Could not process default TSV data',
          };
        }
      });
    }, 10);
  }, [buildMergedCounts, parseTSVCounts]);

  const selectSourceData = useCallback(async (value: string) => {
    const source = SOURCE_DATASETS.find(option => option.value === value);
    if (!source) return;

    setSourceData(source.value);
    setState(prev => ({
      ...prev,
      isLoading: true,
      loadingMessage: `Loading ${source.label}...`,
    }));

    try {
      const response = await fetch(source.file);
      if (!response.ok) {
        throw new Error(`Could not load source data (HTTP ${response.status})`);
      }
      loadTSVData(await response.text(), source.label);
    } catch (error) {
      console.error('Error loading source data:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        loadingMessage: error instanceof Error ? error.message : 'Could not load source data',
      }));
    }
  }, [loadTSVData]);

  const loadCustomTSVData = useCallback((tsvText: string, label = 'User Input') => {
    customTSVTextRef.current = tsvText;
    customTSVLabelRef.current = label;
    setState(prev => ({
      ...prev,
      isLoading: true,
      loadingMessage: `Processing ${label}...`,
    }));

    setTimeout(() => {
      setState(prev => {
        try {
          if (!defaultTSVTextRef.current) {
            throw new Error('Default family counts have not loaded yet');
          }
          const defaultData = parseTSVCounts(defaultTSVTextRef.current, prev.taxIDIndex);
          const customData = parseTSVCounts(tsvText, prev.taxIDIndex);
          const merged = buildMergedCounts(prev, defaultData, customData);
          return {
            ...prev,
            ...merged,
            activeGenes: prev.activeGenes.filter(gene => merged.geneIndex.has(gene)),
            isLoading: false,
            loadingMessage: '',
          };
        } catch (error) {
          return {
            ...prev,
            isLoading: false,
            loadingMessage: error instanceof Error ? error.message : 'Could not process user TSV data',
          };
        }
      });
    }, 10);
  }, [buildMergedCounts, parseTSVCounts]);

  // Removed separate reapply effect; handled inside dataset change effect above to avoid flashes

  // Update layout when the container width or visible taxon set changes.
  useEffect(() => {
    if (state.taxa.length > 0 && containerWidth > 0) {
      setState(prev => {
        if (prev.taxa.length === 0) {
          return prev;
        }
        
        const coordMap = new Map<string, number>();
        const widthMap = new Map<string, number>();
        // Use consistent margins with VisualizationCanvas, including room for 16 px family labels.
        const MARGINS = { left: 112, right: 24 };
        const totalW = containerWidth - MARGINS.left - MARGINS.right;
        
        if (!prev.normalizeLevel) {
          const xBand = d3.scaleBand()
            .domain(prev.taxa)
            .range([0, totalW])
            .paddingInner(0); // No padding for maximum width usage
          
          prev.taxa.forEach(a => {
            coordMap.set(a, xBand(a)!);
            widthMap.set(a, xBand.bandwidth());
          });
        } else if (prev.normalizeLevel === '__ALL__') {
          const w = totalW / prev.taxa.length;
          prev.taxa.forEach((a, i) => {
            coordMap.set(a, i * w);
            widthMap.set(a, w);
          });
        } else {
          // Normalize by level
          const runs: Array<{ cat: string; start: number; end: number }> = [];
          const level = prev.normalizeLevel;
          let start = 0;
          let cat = String(prev.raw[0]?.[level] || '');
          
          for (let k = 1; k < prev.taxa.length; k++) {
            if (String(prev.raw[k]?.[level]) !== cat) {
              runs.push({ cat, start, end: k - 1 });
              cat = String(prev.raw[k]?.[level] || '');
              start = k;
            }
          }
          runs.push({ cat, start, end: prev.taxa.length - 1 });
          
          const segW = totalW / runs.length;
          runs.forEach((run, ri) => {
            const arr = prev.taxa.slice(run.start, run.end + 1);
            const w = segW / arr.length;
            arr.forEach((a, idx) => {
              coordMap.set(a, ri * segW + idx * w);
              widthMap.set(a, w);
            });
          });
        }
        
        return {
          ...prev,
          coordMap,
          widthMap,
        };
      });
    }
  }, [containerWidth, state.taxa.length, state.normalizeLevel]);

  const setSelectedLevels = useCallback((levels: TaxonomicLevel[]) => {
    setState(prev => ({
      ...prev,
      selectedLevels: levels.length > 0 ? levels : ['kingdom'],
    }));
  }, []);

  const setNormalizeLevel = useCallback((level: TaxonomicLevel | '__ALL__' | null) => {
    setState(prev => ({
      ...prev,
      normalizeLevel: level,
    }));
    // Remove immediate buildLayout call - let useEffect handle it
  }, []);

  const filterByLineage = useCallback((level: TaxonomicLevel, category: string, range?: { start: number; end: number }) => {
    setState(prev => ({
      ...prev,
      isLoading: true,
      loadingMessage: `Filtering by ${level}: ${category}...`,
    }));

    setTimeout(() => {
      setState(prev => {
        // Special case: domain means reset/zoom out to full dataset (show 'Eukaryota' in UI)
        const isDomainReset = String(level).toLowerCase() === 'domain';
        if (isDomainReset) {
          const filtered = applyTaxonFilters(
            prev.originalRaw,
            prev,
            taxonFilterStateRef.current,
          );
          return {
            ...prev,
            raw: filtered,
            taxa: filtered.map(d => String(d.taxID)),
            isLoading: false,
            loadingMessage: '',
            focusLevel: null,
            focusCategory: null,
            focusLevelIndex: null,
          };
        }

        // Determine current focus depth and whether this is an expansion to a broader rank
        const currentFocusIndex = prev.focusLevel ? ALL_LEVELS.indexOf(prev.focusLevel) : null;
        const targetIndex = ALL_LEVELS.indexOf(level);
        const isExpand = (currentFocusIndex !== null && targetIndex !== -1 && targetIndex <= currentFocusIndex);

        // Choose base array
        // - Expand to broader rank: use originalRaw to include all members
        // - Otherwise: use current slice when range is provided; fall back to originalRaw for fresh filters
        const baseArray: TaxonomyRecord[] = isExpand ? prev.originalRaw : (range ? prev.raw : prev.originalRaw);

        // Compute filtered set
        const lineageRecords = (isExpand || !range)
          ? baseArray.filter(d => String(d[level]) === category)
          : baseArray.slice(Math.max(0, range.start), Math.min(baseArray.length, range.end + 1));
        const filtered = applyTaxonFilters(
          lineageRecords,
          prev,
          taxonFilterStateRef.current,
        );

        // Always set focus to the clicked lineage
        const nextFocusLevel = level;
        const nextFocusCategory = category;
        const nextFocusLevelIndex = ALL_LEVELS.indexOf(level);

        return {
          ...prev,
          raw: filtered,
          taxa: filtered.map(d => String(d.taxID)),
          isLoading: false,
          loadingMessage: '',
          focusLevel: nextFocusLevel,
          focusCategory: nextFocusCategory,
          focusLevelIndex: nextFocusLevelIndex,
        };
      });
      // Remove immediate buildLayout call - let useEffect handle it
    }, 10);
  }, []);

  const filterByFamilyMin = useCallback((minimum: number, family: string | 'ANY' = 'ANY') => {
    setState(prev => ({
      ...prev,
      isLoading: true,
      loadingMessage: `Filtering taxa by ${family === 'ANY' ? 'any family' : family.replace(/_count$/, '')} count ≥ ${minimum}...`,
    }));

    setTimeout(() => {
      setState(prev => {
        taxonFilterStateRef.current = {
          ...taxonFilterStateRef.current,
          family,
          familyMinimum: Math.max(0, minimum),
        };
        const focusBaseline = prev.focusLevel && prev.focusCategory
          ? prev.originalRaw.filter(record => String(record[prev.focusLevel!]) === prev.focusCategory)
          : prev.originalRaw;
        const filtered = applyTaxonFilters(focusBaseline, prev, taxonFilterStateRef.current);
        
        return {
          ...prev,
          raw: filtered,
          taxa: filtered.map(d => String(d.taxID)),
          isLoading: false,
          loadingMessage: '',
        };
      });
    }, 10);
  }, []);

  const filterAllZeroTaxa = useCallback(() => {
    setState(prev => ({
      ...prev,
      isLoading: true,
      loadingMessage: 'Removing species with all-zero counts...',
    }));

    setTimeout(() => {
      setState(prev => {
        taxonFilterStateRef.current = {
          ...taxonFilterStateRef.current,
          removeAllZero: true,
        };
        const focusBaseline = prev.focusLevel && prev.focusCategory
          ? prev.originalRaw.filter(record => String(record[prev.focusLevel!]) === prev.focusCategory)
          : prev.originalRaw;
        const filtered = applyTaxonFilters(focusBaseline, prev, taxonFilterStateRef.current);

        return {
          ...prev,
          raw: filtered,
          taxa: filtered.map(record => String(record.taxID)),
          isLoading: false,
          loadingMessage: '',
        };
      });
    }, 10);
  }, []);

  const filterByRankSize = useCallback((rank: TaxonomicLevel, minimumSpecies: number) => {
    setState(prev => ({
      ...prev,
      isLoading: true,
      loadingMessage: `Filtering ${rank} groups with fewer than ${minimumSpecies} species...`,
    }));

    setTimeout(() => {
      setState(prev => {
        taxonFilterStateRef.current = {
          ...taxonFilterStateRef.current,
          rank: minimumSpecies > 0 ? rank : null,
          rankMinimum: Math.max(0, minimumSpecies),
        };
        const focusBaseline = prev.focusLevel && prev.focusCategory
          ? prev.originalRaw.filter(record => String(record[prev.focusLevel!]) === prev.focusCategory)
          : prev.originalRaw;
        const filtered = applyTaxonFilters(focusBaseline, prev, taxonFilterStateRef.current);

        return {
          ...prev,
          raw: filtered,
          taxa: filtered.map(record => String(record.taxID)),
          isLoading: false,
          loadingMessage: '',
        };
      });
    }, 10);
  }, []);

  const resetFilters = useCallback(() => {
    taxonFilterStateRef.current = { ...EMPTY_TAXON_FILTERS };
    setState(prev => ({
      ...prev,
      isLoading: true,
      loadingMessage: 'Resetting filters...',
    }));

    setTimeout(() => {
      setState(prev => ({
        ...prev,
        raw: prev.originalRaw.slice(),
        taxa: prev.originalRaw.map(d => String(d.taxID)),
        isLoading: false,
        loadingMessage: '',
        focusLevel: null,
        focusCategory: null,
        focusLevelIndex: null,
      }));
      // Remove immediate buildLayout call - let useEffect handle it
    }, 10);
  }, []);

  const toggleGeneSelection = useCallback((gene: string) => {
    setState(prev => ({
      ...prev,
      isLoading: true,
      loadingMessage: `Processing gene selection...`,
    }));

    // Use setTimeout to allow the loading state to update before heavy computation
    setTimeout(() => {
      setState(prev => {
        const isActive = prev.activeGenes.includes(gene);
        const activeGenes = isActive 
          ? prev.activeGenes.filter(g => g !== gene)
          : sortPhyleticGenes([...prev.activeGenes, gene]);
        
        return {
          ...prev,
          activeGenes,
          isLoading: false,
          loadingMessage: '',
        };
      });
    }, 10);
  }, []);

  const toggleAllGenes = useCallback(() => {
    setState(prev => ({
      ...prev,
      isLoading: true,
      loadingMessage: `Processing ${prev.activeGenes.length > 0 ? 'deselection' : 'selection'} of all genes...`,
    }));

    // Use setTimeout to allow the loading state to update before heavy computation
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        activeGenes: prev.activeGenes.length > 0 ? [] : sortPhyleticGenes(prev.geneNames),
        isLoading: false,
        loadingMessage: '',
      }));
    }, 10);
  }, []);

  const addDifferenceVisualization = useCallback((options: DifferenceOptions) => {
    setState(prev => ({
      ...prev,
      isLoading: true,
      loadingMessage: `Creating gene comparison visualization...`,
    }));

    // Use setTimeout to allow the loading state to update before heavy computation
    setTimeout(() => {
      setState(prev => {
        const { gene1, gene2, useCounts } = options;
        if (!gene1 || !gene2 || gene1 === gene2) {
          return {
            ...prev,
            isLoading: false,
            loadingMessage: '',
          };
        }
        
        const oldN = prev.geneNames.length;
        const label = (a: string, b: string) => 
          `${a.replace(/_count$/, '')}${useCounts ? '>' : '-'}${b.replace(/_count$/, '')}`;
        
        const name1 = label(gene1, gene2);
        const name2 = label(gene2, gene1);
        
        const newGeneNames = [...prev.geneNames, name1, name2];
        const newGeneIndex = new Map(prev.geneIndex);
        newGeneIndex.set(name1, oldN);
        newGeneIndex.set(name2, oldN + 1);
        
        const newMatrix = new Uint8Array(newGeneNames.length * prev.taxonCount);
        newMatrix.set(prev.matrix || new Uint8Array(0));
        
        const newCountMap = new Map(prev.countMap);
        
        prev.taxa.forEach(a => {
          const ai = prev.taxIDIndex.get(a);
          if (ai === undefined) return;
          
          const cm = newCountMap.get(a) || {};
          const c1 = cm[gene1] || 0;
          const c2 = cm[gene2] || 0;
          
          const p1 = useCounts ? (c1 > c2) : (c1 > 0 && c2 === 0);
          const p2 = useCounts ? (c2 > c1) : (c2 > 0 && c1 === 0);
          
          newMatrix[oldN * prev.taxonCount + ai] = p1 ? 1 : 0;
          newMatrix[(oldN + 1) * prev.taxonCount + ai] = p2 ? 1 : 0;
          
          cm[name1] = p1 ? 1 : 0;
          cm[name2] = p2 ? 1 : 0;
          newCountMap.set(a, cm);
        });
        
        return {
          ...prev,
          geneNames: newGeneNames,
          geneIndex: newGeneIndex,
          matrix: newMatrix,
          countMap: newCountMap,
          activeGenes: [...prev.activeGenes, name1, name2],
          isLoading: false,
          loadingMessage: '',
        };
      });
    }, 10);
  }, []);

  const searchLineage = useCallback((searchTerm: string) => {
    if (!searchTerm.trim()) return;
    
    setState(prev => ({
      ...prev,
      isLoading: true,
      loadingMessage: `Searching for lineage: ${searchTerm}...`,
    }));
    
    setTimeout(() => {
      setState(prev => {
        const level = searchableLevels.find(l => prev.originalRaw.some(d => String(d[l]) === searchTerm));
        
        if (!level) {
          alert('No lineage: ' + searchTerm);
          return {
            ...prev,
            isLoading: false,
            loadingMessage: '',
          };
        }
        
        // Always expand to the full species under the found lineage
        const lineageRecords = prev.originalRaw.filter(d => String(d[level]) === searchTerm);
        const filtered = applyTaxonFilters(
          lineageRecords,
          prev,
          taxonFilterStateRef.current,
        );
        return {
          ...prev,
          raw: filtered,
          taxa: filtered.map(d => String(d.taxID)),
          isLoading: false,
          loadingMessage: '',
          focusLevel: level,
          focusCategory: searchTerm,
          focusLevelIndex: ALL_LEVELS.indexOf(level),
        };
      });
      // Remove immediate buildLayout call - let useEffect handle it
    }, 10);
  }, [searchableLevels]);

  return {
    state,
    lineageOptions,            // expose for consumption
    sourceData,
    sourceDataOptions: SOURCE_DATASETS.map(({ value, label }) => ({ value, label })),
    selectSourceData,
    loadCustomTSVData,
    setSelectedLevels,
    setNormalizeLevel,
    filterByLineage,
    filterByFamilyMin,
    filterByRankSize,
    filterAllZeroTaxa,
    resetFilters,
    toggleGeneSelection,
    toggleAllGenes,
    addDifferenceVisualization,
    searchLineage,
    /** A ready‑made React input you can drop into your JSX */
    SearchLineageInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => 
      React.createElement(LineageAutocomplete, {
        suggestions: lineageOptions,
        onSelect: (value: string) => searchLineage(value),
        placeholder: props.placeholder
      }),
    onWidthChange,
    rugMode,
    setRugMode,
  };
} 
