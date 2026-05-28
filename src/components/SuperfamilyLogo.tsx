'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as d3 from 'd3';
import { Download } from 'lucide-react';

interface PositionLogoData {
  position: number;
  msaColumn: number; // Original MSA column position (0-based)
  residueCounts: Record<string, number>;
  totalSequences: number;
  informationContent: number;
  letterHeights: Record<string, number>;
  matchPercentage?: number;
  mostConservedAA?: string;
  matchCounts?: Record<string, number>;
  gpcrdb?: string; // GPCRdb numbering for class-wide alignments
  crossAlignmentData?: {
    alignmentAAs: Record<string, string>;
    matchCount: number;
    totalAlignments: number;
    conservationPercentage: number;
    shouldBlur: boolean;
  };
}

interface ReceptorLogoData {
  receptorName: string;
  logoData: PositionLogoData[];
}

interface MappingPositionData {
  residueCounts?: Record<string, number>;
  totalSequences?: number;
  informationContent?: number;
  letterHeights?: Record<string, number>;
  gpcrdb?: string;
}

interface FamilyMappingData {
  familyKey?: string;
  positions?: Array<MappingPositionData | null>;
}

interface Props {
  /** List of FASTA file base names (without extension) */
  fastaNames: string[];
  /** Optional function to get display name for a file (for UI elements) */
  getDisplayName?: (fileName: string) => string;
  /** Optional function to get display name for plot labels (shorter form) */
  getPlotDisplayName?: (fileName: string) => string;
  /** Optional external filter of positions (0-based supRep columns). If provided, only these positions will be visualized. */
  filteredPositions?: number[] | null;
  /** Notify parent when alignment selection changes (file base names). */
  onSelectedAlignmentsChange?: (selected: string[]) => void;
  /** Optional external control of selected alignments */
  selectedAlignmentsExternal?: string[];
  /** Optional external control of showReferenceRows */
  showReferenceRowsExternal?: boolean;
  /** Optional external control of showProteinRegions */
  showProteinRegionsExternal?: boolean;
  /** Optional external control of which family's GPCRdb row drives protein region blocks */
  regionSourceAlignmentExternal?: string | null;
  /** Optional external control of row height */
  rowHeightExternal?: number;
  /** Optional external control of min conservation threshold */
  minConservationThresholdExternal?: number;
  /** Optional external control of min families count */
  minFamiliesCountExternal?: number;
}

// Define amino acid groups and their default colors (same as MultiReceptorLogoChart)
const aminoAcidGroups = {
  aromatic: { residues: ['W', 'Y', 'H', 'F'], color: '#FCB315', label: 'Aromatic (WYHF)' },
  polar: { residues: ['S', 'T', 'Q', 'N'], color: '#7D2985', label: 'Polar (STQN)' },
  small: { residues: ['P', 'G', 'A'], color: '#231F20', label: 'Small (PGA)' },
  acidic: { residues: ['E', 'D'], color: '#DD6030', label: 'Acidic (ED)' },
  basic: { residues: ['R', 'K'], color: '#7CAEC4', label: 'Basic (RK)' },
  hydrophobic: { residues: ['V', 'C', 'I', 'M', 'L'], color: '#B4B4B4', label: 'Hydrophobic (VCIML)' }
};

// Class to representative sequence mapping
// Representative mapping retained in case of future use
// const classToRepresentative: Record<string, string> = {
//   'ClassA': 'HRH2',
//   'ClassB1': 'PTH1R',
//   'ClassB2': 'AGRL3', 
//   'ClassC': 'CASR',
//   'ClassF': 'FZD7',
//   'ClassT': 'T2R39',
//   'ClassOlf': 'O52I2',
//   'GP157': 'GP157',
//   'GP143': 'GP143'
// };

// Map family selection IDs to precomputed mapping JSON keys.
const fileBaseToFamily: Record<string, string> = {
  'classA_genes_filtered_db_FAMSA.ref_trimmed': 'classA',
  'classB1_genes_filtered_db_FAMSA.ref_trimmed': 'classB1',
  'classB2_genes_filtered_db_FAMSA.ref_trimmed': 'classB2',
  'classC_genes_filtered_db_FAMSA.ref_trimmed': 'classC',
  'classF_genes_filtered_db_FAMSA.ref_trimmed': 'classF',
  'FSLB_genes_filtered_db_FAMSA.ref_trimmed': 'FSLB',
  'classT_genes_filtered_db_FAMSA.ref_trimmed': 'classT',
  'Olfactory_genes_filtered_db_FAMSA.ref_trimmed': 'Olfactory',
  'GPR1_genes_filtered_db_FAMSA.ref_trimmed': 'GPR1',
  'GP143_genes_filtered_db_FAMSA.ref_trimmed': 'GP143',
  'GP157_genes_filtered_db_FAMSA.ref_trimmed': 'GP157',
  'cAMP_genes_filtered_db_FAMSA.ref_trimmed': 'cAMP',
  'STE2_genes_filtered_db_FAMSA.ref_trimmed': 'STE2',
  'STE3_genes_filtered_db_FAMSA.ref_trimmed': 'STE3',
  'Vomeronasal1_genes_filtered_db_FAMSA.ref_trimmed': 'Vomeronasal1',
  'Vomeronasal2_genes_filtered_db_FAMSA.ref_trimmed': 'Vomeronasal2',
  'Mth_genes_filtered_db_FAMSA.ref_trimmed': 'Mth',
  'Nematode_genes_filtered_db_FAMSA.ref_trimmed': 'Nematode'
};

const SuperfamilyLogo: React.FC<Props> = ({ fastaNames, getDisplayName, getPlotDisplayName, filteredPositions, onSelectedAlignmentsChange, selectedAlignmentsExternal, showReferenceRowsExternal, showProteinRegionsExternal, regionSourceAlignmentExternal, rowHeightExternal, minConservationThresholdExternal, minFamiliesCountExternal }) => {
  const yAxisContainerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [mappingsLoaded, setMappingsLoaded] = useState(false);
  const [mappingData, setMappingData] = useState<Record<string, FamilyMappingData>>({});
  
  // State for selected alignments (maintains order of selection)
  const [selectedAlignments, setSelectedAlignments] = useState<string[]>([]);
  
  // Sync with external selected alignments when provided
  useEffect(() => {
    if (selectedAlignmentsExternal !== undefined) {
      setSelectedAlignments(selectedAlignmentsExternal);
    }
  }, [selectedAlignmentsExternal]);
  
  // State for row height control
  const [rowHeight, setRowHeight] = useState(30);
  
  // Sync with external row height when provided
  useEffect(() => {
    if (rowHeightExternal !== undefined) {
      setRowHeight(rowHeightExternal);
    }
  }, [rowHeightExternal]);
  
  // State for conservation threshold (as percentage) - FIXED VALUE
  const conservationThreshold = 0;
  
  // New conservation filtering controls
  const [minConservationThreshold, setMinConservationThreshold] = useState(0);
  const [minFamiliesCount, setMinFamiliesCount] = useState(0);
  
  // Sync with external conservation thresholds when provided
  useEffect(() => {
    if (minConservationThresholdExternal !== undefined) {
      setMinConservationThreshold(minConservationThresholdExternal);
    }
  }, [minConservationThresholdExternal]);
  
  useEffect(() => {
    if (minFamiliesCountExternal !== undefined) {
      setMinFamiliesCount(minFamiliesCountExternal);
    }
  }, [minFamiliesCountExternal]);
  
  // Text input states removed - now controlled from parent
  
  // Hide masked columns functionality removed (was related to dot plots)

  // Define receptor groupings
  const receptorGroups = useMemo(() => [
    {
      name: 'Class A-like',
      members: [
        'classA_genes_filtered_db_FAMSA.ref_trimmed',
        'Olfactory_genes_filtered_db_FAMSA.ref_trimmed',
        'classT_genes_filtered_db_FAMSA.ref_trimmed',
        'Vomeronasal1_genes_filtered_db_FAMSA.ref_trimmed',
        'Nematode_genes_filtered_db_FAMSA.ref_trimmed'
      ]
    },
    {
      name: 'cAMP-like',
      members: [
        'GPR1_genes_filtered_db_FAMSA.ref_trimmed',
        'cAMP_genes_filtered_db_FAMSA.ref_trimmed',
        'classF_genes_filtered_db_FAMSA.ref_trimmed',
        'FSLB_genes_filtered_db_FAMSA.ref_trimmed',
        'GP143_genes_filtered_db_FAMSA.ref_trimmed',
        'GP157_genes_filtered_db_FAMSA.ref_trimmed',
        'Mth_genes_filtered_db_FAMSA.ref_trimmed',
        'classB2_genes_filtered_db_FAMSA.ref_trimmed',
        'classB1_genes_filtered_db_FAMSA.ref_trimmed',
        'STE3_genes_filtered_db_FAMSA.ref_trimmed'
      ]
    },
    {
      name: 'Class C-like',
      members: [
        'classC_genes_filtered_db_FAMSA.ref_trimmed',
        'Vomeronasal2_genes_filtered_db_FAMSA.ref_trimmed'
      ]
    }
  ], []);

  // Selection order tracking removed - now handled by parent

  // HRH2 residue filter removed

  /* ─── Reference GPCRdb info rows ─────────────────────────────── */
  const [showReferenceRows, setShowReferenceRows] = useState(false);
  const [showProteinRegions, setShowProteinRegions] = useState(false);
  const [regionSourceAlignment, setRegionSourceAlignment] = useState<string | null>(null);
  
  // Sync with external showReferenceRows when provided
  useEffect(() => {
    if (showReferenceRowsExternal !== undefined) {
      setShowReferenceRows(showReferenceRowsExternal);
    }
  }, [showReferenceRowsExternal]);
  
  // Sync with external showProteinRegions when provided
  useEffect(() => {
    if (showProteinRegionsExternal !== undefined) {
      setShowProteinRegions(showProteinRegionsExternal);
    }
  }, [showProteinRegionsExternal]);

  // Sync selected region source alignment when externally controlled
  useEffect(() => {
    if (regionSourceAlignmentExternal !== undefined) {
      setRegionSourceAlignment(regionSourceAlignmentExternal);
    }
  }, [regionSourceAlignmentExternal]);

  // Ensure region source is always a currently selected alignment
  useEffect(() => {
    if (selectedAlignments.length === 0) {
      setRegionSourceAlignment(null);
      return;
    }
    if (!regionSourceAlignment || !selectedAlignments.includes(regionSourceAlignment)) {
      setRegionSourceAlignment(selectedAlignments[0]);
    }
  }, [selectedAlignments, regionSourceAlignment]);
  
  const referenceInfo = useMemo(() => {
    return selectedAlignments
      .map((name) => {
        const positions = mappingData[name]?.positions || [];
        const gpcrdbMap = positions.map((position) => position?.gpcrdb || '');
        if (!gpcrdbMap.some(Boolean)) return null;
        return {
          alignmentName: name,
          label: fileBaseToFamily[name] || name,
          gpcrdbMap
        };
      })
      .filter((item): item is { alignmentName: string; label: string; gpcrdbMap: string[] } => Boolean(item));
  }, [mappingData, selectedAlignments]);

  // (Column width slider removed – fixed width used)
  
  // State for conservation method
  // Use Simple Conservation checkbox - FIXED VALUE
  const useSimpleConservation = false;
  
  // State for tooltip
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    content: string;
  }>({ visible: false, x: 0, y: 0, content: '' });

  // Overlap label functionality removed - hiddenPositions no longer used

  // State for processed receptor data
  const [processedReceptorData, setProcessedReceptorData] = useState<ReceptorLogoData[]>([]);
  // Removed processing flag; we keep the plot mounted during processing
  // const [isProcessing, setIsProcessing] = useState(false);

  // Track theme changes
  useEffect(() => {
    const updateTheme = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    
    updateTheme();
    
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    return () => observer.disconnect();
  }, []);

  // State for customizable colors
  const [groupColors, setGroupColors] = useState(() => {
    const colors: Record<string, string> = {};
    Object.entries(aminoAcidGroups).forEach(([key, group]) => {
      colors[key] = group.color;
    });
    return colors;
  });

  /* ─── HRH2 residue→GPCRdb mapping ─────────────────────────────── */
  // (moved above to avoid forward-reference linting error)

  // Function to get residue color based on current group colors
  const getResidueColor = useCallback((residue: string): string => {
    const char = residue.toUpperCase();
    for (const [groupKey, group] of Object.entries(aminoAcidGroups)) {
      if (group.residues.includes(char)) {
        if (groupKey === 'small' && groupColors[groupKey] === '#231F20') {
          return isDarkMode ? '#FFFFFF' : '#231F20';
        }
        return groupColors[groupKey];
      }
    }
    return '#000000';
  }, [groupColors, isDarkMode]);

  // Function to handle color changes
  const handleColorChange = (groupKey: string, newColor: string) => {
    setGroupColors(prev => ({
      ...prev,
      [groupKey]: newColor
    }));
  };

  // Function to reset colors to defaults
  const resetColors = () => {
    const defaultColors: Record<string, string> = {};
    Object.entries(aminoAcidGroups).forEach(([key, group]) => {
      defaultColors[key] = group.color;
    });
    setGroupColors(defaultColors);
  };

  // Checkbox selection functions removed - now handled by parent

  // Propagate selected alignments to parent (only if not externally controlled)
  useEffect(() => {
    if (onSelectedAlignmentsChange && selectedAlignmentsExternal === undefined) {
      onSelectedAlignmentsChange(selectedAlignments);
    }
  }, [selectedAlignments, onSelectedAlignmentsChange, selectedAlignmentsExternal]);

  // Tooltip helper functions
  const showTooltip = useCallback((event: Event, content: string) => {
    const mouseEvent = event as MouseEvent;
    setTooltip({
      visible: true,
      x: mouseEvent.clientX,
      y: mouseEvent.clientY,
      content
    });
  }, []);

  const hideTooltip = useCallback(() => {
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  const updateTooltipPosition = useCallback((event: Event) => {
    const mouseEvent = event as MouseEvent;
    setTooltip(prev => ({ ...prev, x: mouseEvent.clientX, y: mouseEvent.clientY }));
  }, []);

  // Cache for loaded SVG paths
  const svgPathCache = useRef<Record<string, { path: string; viewBox: string; transformAttr?: string }>>({});

  interface LetterSvgData { path: string; viewBox: string; transformAttr?: string }

  // Function to load custom SVG letter
  const loadCustomSvgLetter = useCallback(async (letter: string): Promise<LetterSvgData | null> => {
    if (svgPathCache.current[letter]) {
      return svgPathCache.current[letter];
    }

    try {
      const response = await fetch(`/tight_caps/${letter}.svg`);
      if (!response.ok) {
        console.warn(`Failed to load ${letter}.svg: ${response.status}`);
        return null;
      }

      const svgContent = await response.text();
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
      
      const parserError = svgDoc.querySelector('parsererror');
      if (parserError) {
        console.warn(`SVG parsing error for ${letter}.svg`);
        return null;
      }

      const originalSvg = svgDoc.querySelector('svg');
      const pathElement = svgDoc.querySelector('path');

      if (!originalSvg || !pathElement) {
        console.warn(`Invalid SVG structure for ${letter}.svg`);
        return null;
      }

      const viewBox = originalSvg.getAttribute('viewBox') || '0 0 100 100';
      const pathData = pathElement.getAttribute('d') || '';
      const transformAttr = pathElement.getAttribute('transform') || undefined;

      const result: LetterSvgData = { path: pathData, viewBox, transformAttr };
      svgPathCache.current[letter] = result;
      return result;
    } catch (error) {
      console.warn(`Error loading custom SVG for ${letter}:`, error);
      return null;
    }
  }, []);

  // Load precomputed mapping JSON files once. Raw alignment FASTAs are build-time inputs only.
  useEffect(() => {
    let cancelled = false;

    async function loadMappings() {
      setMappingsLoaded(false);
      const entries = await Promise.all(
        fastaNames.map(async (name) => {
          const familyKey = fileBaseToFamily[name];
          if (!familyKey) return null;

          const response = await fetch(`/superfamily_logo_mappings/${familyKey}.json`);
          if (!response.ok) {
            console.warn(`Failed to load mapping JSON for ${familyKey}: ${response.status}`);
            return null;
          }

          const mapping = (await response.json()) as FamilyMappingData;
          return [name, mapping] as const;
        })
      );
      if (cancelled) return;

      const nextMappingData: Record<string, FamilyMappingData> = {};
      entries.forEach((entry) => {
        if (entry) nextMappingData[entry[0]] = entry[1];
      });
      setMappingData(nextMappingData);
      setMappingsLoaded(true);
    }

    loadMappings().catch((error) => {
      console.error('Error loading mapping JSONs:', error);
      if (!cancelled) {
        setMappingData({});
        setMappingsLoaded(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fastaNames]);

  // Calculate cross-alignment conservation for a specific position
  const calculateCrossAlignmentConservation = useCallback((position: number, allAlignmentData: Record<string, Record<number, PositionLogoData>>): {
    matchPercentage: number;
    mostConservedAA: string;
    alignmentAAs: Record<string, string>;
    matchCount: number;
    totalAlignments: number;
  } => {
    // Define matching groups
    const matchingGroups = {
      'acidic': ['E', 'D'],
      'aromatic': ['W', 'Y', 'H', 'F'],
      'basic': ['R', 'K'],
      'polar': ['Q', 'N'],
      'hydrophobic_vi': ['V', 'I'],
      'hydrophobic_ml': ['M', 'L']
    };

    // Get amino acids from each alignment at this position
    const alignmentAAs: Record<string, string> = {};
    const aaFrequency: Record<string, number> = {};
    let totalAlignments = 0;

    selectedAlignments.forEach(alignmentName => {
      const positionData = allAlignmentData[alignmentName]?.[position];
      if (positionData && positionData.residueCounts) {
        // Get the most frequent amino acid in this alignment at this position
        let mostFrequentAA = '';
        let maxCount = 0;
        Object.entries(positionData.residueCounts).forEach(([aa, count]) => {
          if (count > maxCount) {
            maxCount = count;
            mostFrequentAA = aa;
          }
        });
        
        if (mostFrequentAA) {
          alignmentAAs[alignmentName] = mostFrequentAA;
          aaFrequency[mostFrequentAA] = (aaFrequency[mostFrequentAA] || 0) + 1;
          totalAlignments++;
        }
      }
    });

    if (totalAlignments === 0) {
      return {
        matchPercentage: 0,
        mostConservedAA: '',
        alignmentAAs: {},
        matchCount: 0,
        totalAlignments: 0
      };
    }

    // Find the most conserved amino acid across alignments
    let mostConservedAA = '';
    let maxFreq = 0;
    Object.entries(aaFrequency).forEach(([aa, freq]) => {
      if (freq > maxFreq) {
        maxFreq = freq;
        mostConservedAA = aa;
      }
    });

    // Calculate matches using enhanced matching rules
    let matchCount = 0;
    const referenceAA = mostConservedAA;
    
    // Find which group the reference AA belongs to
    let referenceGroup: string[] | null = null;
    for (const [, groupResidues] of Object.entries(matchingGroups)) {
      if (groupResidues.includes(referenceAA)) {
        referenceGroup = groupResidues;
        break;
      }
    }

    // Count matches (exact + similar)
    Object.values(alignmentAAs).forEach(aa => {
      if (aa === referenceAA) {
        matchCount++; // Exact match
      } else if (referenceGroup && referenceGroup.includes(aa)) {
        matchCount++; // Similar amino acid match
      }
    });

    // Calculate percentage based on TOTAL selected alignments (including gaps)
    const totalSelectedAlignments = selectedAlignments.length;
    const matchPercentage = totalSelectedAlignments > 0 ? (matchCount / totalSelectedAlignments) * 100 : 0;

    return {
      matchPercentage,
      mostConservedAA,
      alignmentAAs,
      matchCount,
      totalAlignments: totalSelectedAlignments
    };
  }, [selectedAlignments]);



  // Build logo rows from precomputed mapping JSONs.
  useEffect(() => {
    if (!mappingsLoaded || selectedAlignments.length === 0) {
      setProcessedReceptorData([]);
      return;
    }

    const alignmentPositionData: Record<string, Record<number, PositionLogoData>> = {};
    let globalMaxPosition = 0;

    selectedAlignments.forEach((name) => {
      const positions = mappingData[name]?.positions || [];
      const positionData: Record<number, PositionLogoData> = {};

      positions.forEach((position, supCol) => {
        if (!position) return;

        positionData[supCol] = {
          position: supCol + 1,
          msaColumn: supCol,
          residueCounts: position.residueCounts || {},
          totalSequences: position.totalSequences || 0,
          informationContent: position.informationContent || 0,
          letterHeights: position.letterHeights || {},
          gpcrdb: position.gpcrdb || undefined
        };
      });

      alignmentPositionData[name] = positionData;
      globalMaxPosition = Math.max(globalMaxPosition, positions.length);
    });

    const crossAlignmentConservation: Record<number, {
      matchPercentage: number;
      data: ReturnType<typeof calculateCrossAlignmentConservation>;
    }> = {};

    for (let pos = 0; pos < globalMaxPosition; pos++) {
      const crossConservation = calculateCrossAlignmentConservation(pos, alignmentPositionData);
      crossAlignmentConservation[pos] = {
        matchPercentage: crossConservation.matchPercentage,
        data: crossConservation
      };
    }

    let allowedPositions = new Set<number>();
    for (let pos = 0; pos < globalMaxPosition; pos++) {
      const allGaps = selectedAlignments.every((alignmentName) => {
        const position = alignmentPositionData[alignmentName]?.[pos];
        return !position || Object.keys(position.residueCounts || {}).length === 0;
      });

      if (allGaps) continue;

      if (minConservationThreshold > 0 && minFamiliesCount > 0) {
        let familiesAboveThreshold = 0;

        selectedAlignments.forEach((alignmentName) => {
          const position = alignmentPositionData[alignmentName]?.[pos];
          const totalSequences = position?.totalSequences || 0;
          const counts = Object.values(position?.residueCounts || {});
          if (totalSequences === 0 || counts.length === 0) return;

          const conservationPercentage = (Math.max(...counts) / totalSequences) * 100;
          if (conservationPercentage >= minConservationThreshold) {
            familiesAboveThreshold++;
          }
        });

        if (familiesAboveThreshold >= minFamiliesCount) {
          allowedPositions.add(pos);
        }
      } else {
        allowedPositions.add(pos);
      }
    }

    if (filteredPositions && filteredPositions.length > 0) {
      const externalSet = new Set<number>(filteredPositions);
      allowedPositions = new Set(Array.from(allowedPositions).filter((position) => externalSet.has(position)));
    }

    const finalData = selectedAlignments.map((name) => {
      const positionData = alignmentPositionData[name] || {};
      const logoData: PositionLogoData[] = [];

      Array.from(allowedPositions)
        .sort((a, b) => a - b)
        .forEach((pos, index) => {
          const currentPositionData = positionData[pos] || {
            position: pos + 1,
            msaColumn: pos,
            residueCounts: {},
            totalSequences: 0,
            informationContent: 0,
            letterHeights: {}
          };
          const crossConservation = crossAlignmentConservation[pos];
          const shouldBlur = useSimpleConservation
            ? (crossConservation?.matchPercentage || 0) < conservationThreshold
            : false;

          logoData.push({
            ...currentPositionData,
            position: index + 1,
            msaColumn: pos,
            crossAlignmentData: {
              alignmentAAs: crossConservation?.data.alignmentAAs || {},
              matchCount: crossConservation?.data.matchCount || 0,
              totalAlignments: crossConservation?.data.totalAlignments || selectedAlignments.length,
              conservationPercentage: crossConservation?.matchPercentage || 0,
              shouldBlur
            }
          });
        });

      return { receptorName: name, logoData };
    });

    setProcessedReceptorData(finalData);
  }, [
    mappingsLoaded,
    mappingData,
    selectedAlignments,
    conservationThreshold,
    useSimpleConservation,
    calculateCrossAlignmentConservation,
    minConservationThreshold,
    minFamiliesCount,
    filteredPositions
  ]);

  // Display statistics function removed - no longer needed

  // Download SVG function
  const downloadSVG = () => {
    const yAxisContainer = yAxisContainerRef.current;
    const chartContainer = chartContainerRef.current;
    
    if (!yAxisContainer || !chartContainer) {
      console.error('Chart containers not found');
      return;
    }

    const yAxisSvg = yAxisContainer.querySelector('svg');
    const chartSvg = chartContainer.querySelector('svg');
    
    if (!yAxisSvg || !chartSvg) {
      console.error('SVG elements not found');
      return;
    }

    // Get dimensions
    const yAxisWidth = parseInt(yAxisSvg.getAttribute('width') || '80');
    const chartWidth = parseInt(chartSvg.getAttribute('width') || '800');
    const totalWidth = yAxisWidth + chartWidth;
    const totalHeight = parseInt(chartSvg.getAttribute('height') || '400');

    // Create combined SVG
    const combinedSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    combinedSvg.setAttribute('width', totalWidth.toString());
    combinedSvg.setAttribute('height', totalHeight.toString());
    combinedSvg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
    combinedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Clone and add y-axis
    const yAxisClone = yAxisSvg.cloneNode(true) as SVGElement;
    yAxisClone.setAttribute('x', '0');
    yAxisClone.setAttribute('y', '0');
    combinedSvg.appendChild(yAxisClone);

    // Clone and add chart
    const chartClone = chartSvg.cloneNode(true) as SVGElement;
    chartClone.setAttribute('x', yAxisWidth.toString());
    chartClone.setAttribute('y', '0');
    combinedSvg.appendChild(chartClone);

    // Preserve text attributes that don't transfer via cloneNode for external viewers
    const preserveTextAttrs = (srcSvg: Element, dstSvg: Element) => {
      const srcTexts = Array.from(srcSvg.querySelectorAll('text'));
      const dstTexts = Array.from(dstSvg.querySelectorAll('text'));
      const attrsToPreserve = ['dominant-baseline', 'text-anchor', 'font-family', 'font-size', 'font-weight'];
      for (let i = 0; i < Math.min(srcTexts.length, dstTexts.length); i++) {
        for (const attr of attrsToPreserve) {
          const val = srcTexts[i].getAttribute(attr);
          if (val) dstTexts[i].setAttribute(attr, val);
        }
      }
    };
    preserveTextAttrs(yAxisSvg, yAxisClone);
    preserveTextAttrs(chartSvg, chartClone);

    // Serialize to string
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(combinedSvg);
    const svgWithDeclaration = `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;

    // Create download
    const blob = new Blob([svgWithDeclaration], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const fileName = `superfamily_logo.svg`;
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  // Download EPS function
  const downloadEPS = () => {
    const yAxisContainer = yAxisContainerRef.current;
    const chartContainer = chartContainerRef.current;
    if (!yAxisContainer || !chartContainer) return;
    const yAxisSvg = yAxisContainer.querySelector('svg');
    const chartSvg = chartContainer.querySelector('svg');
    if (!yAxisSvg || !chartSvg) return;

    const yAxisW = parseInt(yAxisSvg.getAttribute('width') || '80', 10);
    const chartW = parseInt(chartSvg.getAttribute('width') || '800', 10);
    const totalW = yAxisW + chartW;
    const totalH = parseInt(chartSvg.getAttribute('height') || '400', 10);

    // build combined <svg> exactly as in downloadSVG()
    const combined = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    combined.setAttribute('width', totalW.toString());
    combined.setAttribute('height', totalH.toString());
    combined.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
    combined.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const yClone = yAxisSvg.cloneNode(true) as SVGElement;
    combined.appendChild(yClone);
    const cClone = (chartSvg.cloneNode(true) as SVGElement);
    cClone.setAttribute('x', yAxisW.toString());
    combined.appendChild(cClone);

    const svgStr = new XMLSerializer().serializeToString(combined);

    // simple EPS wrapper
    const header = 
      '%!PS-Adobe-3.0 EPSF-3.0\n' +
      `%%BoundingBox: 0 0 ${totalW} ${totalH}\n`;
    const epsBlob = new Blob([ header + svgStr ], { type: 'application/postscript' });
    const url = URL.createObjectURL(epsBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'superfamily_logo.eps';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Track previous data without triggering a render-effect cleanup cycle.
  const previousDataHashRef = useRef('');

  // Render chart
  useEffect(() => {
    const yAxisContainer = yAxisContainerRef.current;
    const chartContainer = chartContainerRef.current;

    if (!yAxisContainer || !chartContainer) return;
    let cancelled = false;

    if (!mappingsLoaded || selectedAlignments.length === 0) {
      // Clear chart when no selections
      const oldTooltips = document.querySelectorAll('.logo-tooltip');
      oldTooltips.forEach(tooltip => tooltip.remove());
      yAxisContainer.innerHTML = '';
      chartContainer.innerHTML = '';
      previousDataHashRef.current = '';
      return;
    }

    const receptorData = processedReceptorData;
    if (!receptorData.length || !receptorData.some(d => d.logoData.length > 0)) {
      const oldTooltips = document.querySelectorAll('.logo-tooltip');
      oldTooltips.forEach(tooltip => tooltip.remove());
      yAxisContainer.innerHTML = '';
      chartContainer.innerHTML = '';
      previousDataHashRef.current = '';
      return;
    }

    // Create a hash to detect if data actually changed
    const currentDataHash = JSON.stringify({
      receptorNames: receptorData.map(d => d.receptorName).sort(),
      positionCount: receptorData[0]?.logoData.length || 0,
      rowHeight,
      minConservationThreshold,
      minFamiliesCount,
      showReferenceRows,
      showProteinRegions
    });

    // Only rebuild if data actually changed
    if (currentDataHash !== previousDataHashRef.current) {
      console.log('Data changed, rebuilding chart...');
      
      // Clean up
      const oldTooltips = document.querySelectorAll('.logo-tooltip');
      oldTooltips.forEach(tooltip => tooltip.remove());

      yAxisContainer.innerHTML = '';
      chartContainer.innerHTML = '';

      renderChartAfterGlyphPreload(receptorData);
      previousDataHashRef.current = currentDataHash;
    } else {
      console.log('Data unchanged, skipping chart rebuild');
    }

    function renderChartAfterGlyphPreload(data: ReceptorLogoData[]) {
      const residuesToPreload = Array.from(
        new Set(
          data.flatMap(receptorData =>
            receptorData.logoData.flatMap(positionData => Object.keys(positionData.letterHeights))
          )
        )
      );

      Promise.all(residuesToPreload.map(residue => loadCustomSvgLetter(residue))).then(() => {
        if (cancelled) return;
        renderChart(data);
      });
    }

    function renderChart(data: ReceptorLogoData[]) {
      if (cancelled) return;
      if (!yAxisContainer || !chartContainer) return;

      const margin = { top: 20, right: 20, bottom: 20, left: 20 };
      const groupLabelWidth = 56;
      const rowLabelWidth = 92;
      const axisGutter = 24;
      const yAxisWidth = groupLabelWidth + rowLabelWidth + axisGutter;
      // Keep logo row labels and reference row labels aligned to the same right edge.
      const rowLabelX = yAxisWidth - 10;
      // Per-row axis line should sit exactly at the start of the logo chart.
      const axisX = yAxisWidth - 1;
      const barWidthEstimate = 18;

      // Map: position -> amino acid -> array of row indices (which receptor rows share that AA)
      const overlapMap: Record<number, Record<string, number[]>> = {};

      // Amino-acid similarity groups (shared across calculations)
      const matchingGroups: Record<string, string[]> = {
        acidic: ['E', 'D'],
        aromatic: ['W', 'Y', 'H', 'F'],
        basic: ['R', 'K'],
        polar: ['Q', 'N'],
        hydrophobic_vi: ['V', 'I'],
        hydrophobic_ml: ['M', 'L']
      };
      // Collect all positions with their MSA column information
      const allPositionsWithMsa = new Map<number, number>(); // position -> msaColumn
      data.forEach((d) => {
        d.logoData.forEach((p) => {
          allPositionsWithMsa.set(p.position, p.msaColumn);
        });
      });

      // Show all positions (masking disabled)
      const positionsWithData = Array.from(allPositionsWithMsa.keys()).sort((a:number, b:number) => a - b);
      
      // Create mapping from display position to original alignment position
      const displayToOriginalPos: Record<number, number> = {};
      positionsWithData.forEach((originalPos, displayIndex) => {
        displayToOriginalPos[displayIndex + 1] = originalPos; // displayIndex + 1 because positions are 1-based
      });

      // Removed HRH2-specific gap logic; using positional gaps instead

      // Build positions array with gap indicators for non-consecutive MSA columns
      const positionsWithGaps: Array<{ position: number; isGap: boolean }> = [];
      positionsWithData.forEach((pos, index) => {
        if (index === 0) {
          positionsWithGaps.push({ position: pos, isGap: false });
        } else {
          const prevPos = positionsWithData[index - 1];
          const prevMsaCol = allPositionsWithMsa.get(prevPos) || prevPos;
          const currentMsaCol = allPositionsWithMsa.get(pos) || pos;
          // Check if MSA columns are non-consecutive
          if (currentMsaCol - prevMsaCol > 1) {
            console.log(`Gap detected: MSA col ${prevMsaCol} → ${currentMsaCol} (difference: ${currentMsaCol - prevMsaCol})`);
            positionsWithGaps.push({ position: -1, isGap: true }); // small gap separator
          }
          positionsWithGaps.push({ position: pos, isGap: false });
        }
      });

      const gapWidth = barWidthEstimate * 0.5; // Small gap between non-consecutive columns

      // Total width accounting for gaps
      const regularColumns = positionsWithGaps.filter(p => !p.isGap).length;
      const gapColumns = positionsWithGaps.filter(p => p.isGap).length;
      const chartContentWidth = (regularColumns * barWidthEstimate) + (gapColumns * gapWidth);
      const totalWidth = chartContentWidth + margin.left + margin.right;
      
      const gapBetweenReceptors = 5; // No gap between rows to eliminate unwanted spacing
      const logoAreaHeight = rowHeight;
      const conservationBarHeight = 0; // Simple conservation removed
      // Dot plot removed
      const dotPlotHeight = 0;

      // Reference gpcrdb rows (optional)
      const referenceRowHeight = 30; // Increased from 16 to better fit GPCRdb numbers
      const referenceAreaHeight = (showReferenceRows && referenceInfo.length > 0) ? (referenceInfo.length * referenceRowHeight + 4) : 0; // tighter padding

      // Protein region blocks (TM1-TM7, H8, ECL2, etc.)
      const proteinRegionHeight = 25;
      let proteinRegionAreaHeight = 0;
      const proteinRegions: Array<{start: number; end: number; label: string}> = [];
      
      if (showProteinRegions && referenceInfo.length > 0) {
        // Detect protein regions from a single selected family's GPCRdb numbering.
        const regionMap: Record<string, string> = {
          '1': 'TM1',
          '2': 'TM2', 
          '3': 'TM3',
          '4': 'TM4',
          '5': 'TM5',
          '6': 'TM6',
          '7': 'TM7',
          '8': 'H8',
          '45': 'ECL2'
        };
        
        const sourceReference =
          referenceInfo.find((ref) => ref.alignmentName === regionSourceAlignment) ||
          referenceInfo[0];
        const sourceGpcrdbMap = sourceReference?.gpcrdbMap || [];

        // Step 1: explicit labels derived directly from GPCRdb prefixes.
        const explicitLabels: Array<string | null> = new Array(positionsWithData.length).fill(null);
        positionsWithData.forEach((pos, index) => {
          // Get the MSA column for this display position
          const msaCol = allPositionsWithMsa.get(pos);
          if (msaCol === undefined) {
            explicitLabels[index] = null;
            return;
          }

          const gpcrdbNumber = sourceGpcrdbMap[msaCol] || '';
          if (!gpcrdbNumber || !gpcrdbNumber.includes('x')) {
            explicitLabels[index] = null;
            return;
          }

          const prefix = gpcrdbNumber.split('x')[0];
          if (!prefix) {
            explicitLabels[index] = null;
            return;
          }

          const regionLabel = regionMap[prefix];
          if (!regionLabel) {
            explicitLabels[index] = null;
            return;
          }
          explicitLabels[index] = regionLabel;
        });

        // Step 2: infer loop/termini labels in unlabeled stretches based on neighboring anchors.
        const inferredLabels = [...explicitLabels];
        const loopBetween: Record<string, string> = {
          'TM1|TM2': 'ICL1',
          'TM2|TM3': 'ECL1',
          'TM3|TM4': 'ICL2',
          'TM4|TM5': 'ECL2',
          'TM5|TM6': 'ICL3',
          'TM6|TM7': 'ECL3',
          'TM7|H8': 'ICL4'
        };

        let firstTM1Index = -1;
        let lastTM7Index = -1;
        let lastH8Index = -1;
        inferredLabels.forEach((label, idx) => {
          if (label === 'TM1' && firstTM1Index === -1) firstTM1Index = idx;
          if (label === 'TM7') lastTM7Index = idx;
          if (label === 'H8') lastH8Index = idx;
        });

        // N-terminus: before TM1.
        if (firstTM1Index > 0) {
          for (let i = 0; i < firstTM1Index; i++) {
            if (!inferredLabels[i]) inferredLabels[i] = 'N-terminus';
          }
        }

        // C-terminus: after H8 (or after TM7 if H8 is absent).
        const cTermStart = lastH8Index >= 0 ? lastH8Index + 1 : (lastTM7Index >= 0 ? lastTM7Index + 1 : -1);
        if (cTermStart >= 0) {
          for (let i = cTermStart; i < inferredLabels.length; i++) {
            if (!inferredLabels[i]) inferredLabels[i] = 'C-terminus';
          }
        }

        // Fill interior unlabeled stretches with loop labels inferred from surrounding anchors.
        let i = 0;
        while (i < inferredLabels.length) {
          if (inferredLabels[i]) {
            i++;
            continue;
          }
          const start = i;
          while (i < inferredLabels.length && !inferredLabels[i]) i++;
          const end = i - 1;

          const leftLabel = start > 0 ? inferredLabels[start - 1] : null;
          const rightLabel = i < inferredLabels.length ? inferredLabels[i] : null;
          const inferredLoop = leftLabel && rightLabel ? loopBetween[`${leftLabel}|${rightLabel}`] : null;
          const bridgeSameLabel = leftLabel && rightLabel && leftLabel === rightLabel ? leftLabel : null;
          const bridgeECL2 =
            leftLabel && rightLabel &&
            ((leftLabel === 'TM4' && rightLabel === 'ECL2') ||
             (leftLabel === 'ECL2' && rightLabel === 'TM5') ||
             (leftLabel === 'TM4' && rightLabel === 'TM5'))
              ? 'ECL2'
              : null;
          const fillLabel = inferredLoop || bridgeSameLabel || bridgeECL2;
          if (fillLabel) {
            for (let j = start; j <= end; j++) {
              inferredLabels[j] = fillLabel;
            }
          }
        }

        // Step 3: convert labels to contiguous region blocks.
        let currentRegion: string | null = null;
        let regionStart = -1;
        inferredLabels.forEach((label, idx) => {
          if (!label) {
            if (currentRegion && regionStart >= 0) {
              proteinRegions.push({ start: regionStart, end: idx - 1, label: currentRegion });
            }
            currentRegion = null;
            regionStart = -1;
            return;
          }
          if (currentRegion === label) {
            return;
          }
          if (currentRegion && regionStart >= 0) {
            proteinRegions.push({ start: regionStart, end: idx - 1, label: currentRegion });
          }
          currentRegion = label;
          regionStart = idx;
        });
        if (currentRegion && regionStart >= 0) {
          proteinRegions.push({ start: regionStart, end: inferredLabels.length - 1, label: currentRegion });
        }

        // Merge same-label regions even when they were split by unassigned/bridged gaps.
        if (proteinRegions.length > 1) {
          const mergedRegions: Array<{ start: number; end: number; label: string }> = [];
          proteinRegions.forEach((region) => {
            const previous = mergedRegions[mergedRegions.length - 1];
            if (previous && previous.label === region.label) {
              previous.end = Math.max(previous.end, region.end);
            } else {
              mergedRegions.push({ ...region });
            }
          });
          proteinRegions.length = 0;
          proteinRegions.push(...mergedRegions);
        }
        
        proteinRegionAreaHeight = proteinRegions.length > 0 ? proteinRegionHeight + 8 : 0;
      }

      // Evolutionary pattern row removed
      const evolutionaryPatternAreaHeight = 0;

      // Total chart height: logos + dot plot + optional reference rows + evolutionary pattern + protein regions + conservation bar + margins
      const totalHeight = (logoAreaHeight * data.length) + (gapBetweenReceptors * (data.length - 1)) + dotPlotHeight + referenceAreaHeight + proteinRegionAreaHeight + evolutionaryPatternAreaHeight + conservationBarHeight + margin.top + margin.bottom + 20;

      // Create SVGs
      const yAxisSvg = d3
        .select(yAxisContainer)
        .append('svg')
        .attr('width', yAxisWidth)
        .attr('height', totalHeight);

      const chartSvg = d3
        .select(chartContainer)
        .append('svg')
        .attr('width', totalWidth)
        .attr('height', totalHeight);

      // Create custom x scale that handles gaps
      const createXScale = () => {
        let currentX = 0;
        const positionToX: Record<string, number> = {};
        const bandwidth = barWidthEstimate * 0.95; // Account for padding
        
        positionsWithGaps.forEach((item) => { // Removed unused 'index' parameter
          if (item.isGap) {
            currentX += gapWidth;
          } else {
            positionToX[item.position.toString()] = currentX;
            currentX += barWidthEstimate;
          }
        });
        
        return {
          bandwidth: () => bandwidth,
          range: () => [0, totalWidth],
          domain: () => positionsWithData.map(p => p.toString()),
          // Custom function to get x position
          getX: (position: string) => positionToX[position] || 0
        };
      };
      
      const x = createXScale();

      const yDomainMax = 4.32;
      const y = d3.scaleLinear().domain([0, yDomainMax]).range([logoAreaHeight, 0]);

      // Create Y-axes for each receptor
      data.forEach((receptorData, receptorIndex) => {
        const receptorY = margin.top + receptorIndex * (logoAreaHeight + gapBetweenReceptors);
        


        const yLabel = yAxisSvg
          .append('text')
          .attr('text-anchor', 'end')
          .attr('x', rowLabelX)
          .attr('y', receptorY + logoAreaHeight / 2 + 5)
          .attr('class', 'text-foreground fill-current')
          .style('font-size', '12px')
          .style('font-family', 'Helvetica');

        // Format receptor name: ClassX -> Class X, except ClassOlf -> Olfactory
        const displayName = getPlotDisplayName 
          ? getPlotDisplayName(receptorData.receptorName) 
          : receptorData.receptorName.split('_')[0];
        
        yLabel.append('tspan').text(displayName);
        // yLabel.append('tspan').attr('x', 0).attr('dy', '1.2em').text('Information');
        // yLabel.append('tspan').attr('x', 0).attr('dy', '1.2em').text('Content (bits)');
        
        // Create individual y-scale for this receptor to avoid continuous lines
        const receptorY_scale = d3.scaleLinear().domain([0, yDomainMax]).range([logoAreaHeight, 0]);
        
        // Add y-axis line with tick marks only at min and max, no labels
        const yAxis = d3.axisLeft(receptorY_scale)
          .tickValues([0, yDomainMax])
          .tickFormat(() => '')
          .tickSize(0);
        yAxisSvg
          .append('g')
          .attr('transform', `translate(${axisX}, ${receptorY})`)
          .attr('class', 'axis')
          .call(yAxis)
          .call(g => g.select('.domain')
                         .attr('stroke', '#888')
                         .attr('stroke-width', 2));
      });

      // Draw group annotations
      receptorGroups.forEach(group => {
        // Find which selected receptors belong to this group
        const groupReceptorIndices: number[] = [];
        data.forEach((receptorData, index) => {
          if (group.members.includes(receptorData.receptorName)) {
            groupReceptorIndices.push(index);
          }
        });

        // Only draw if group has members in current selection
        if (groupReceptorIndices.length > 0) {
          const sortedIndices = [...groupReceptorIndices].sort((a, b) => a - b);
          const isContiguous = sortedIndices.every((idx, i) => idx === sortedIndices[0] + i);
          // Skip annotation when members are split into interrupted segments.
          if (!isContiguous) {
            return;
          }

          const firstIndex = Math.min(...groupReceptorIndices);
          const lastIndex = Math.max(...groupReceptorIndices);
          
          // Calculate Y positions to span the full height of the group rows
          const groupStartY = margin.top + firstIndex * (logoAreaHeight + gapBetweenReceptors);
          const groupEndY = margin.top + lastIndex * (logoAreaHeight + gapBetweenReceptors) + logoAreaHeight;
          const groupCenterY = (groupStartY + groupEndY) / 2;
          
          // Draw vertical line spanning the full height of the group rows
          // Position group annotation closer to row labels/axis to reduce left whitespace.
          const lineX = groupLabelWidth + 6;
          yAxisSvg.append('line')
            .attr('x1', lineX)
            .attr('y1', groupStartY)
            .attr('x2', lineX)
            .attr('y2', groupEndY)
            .attr('stroke', '#666')
            .attr('stroke-width', 2)
            .attr('class', 'text-foreground stroke-current');
          
          // Draw vertical text label (larger than row labels, positioned near the line)
          const textX = lineX - 14;
          yAxisSvg.append('text')
            .attr('x', textX)
            .attr('y', groupCenterY)
            .attr('text-anchor', 'middle')
            .attr('transform', `rotate(-90, ${textX}, ${groupCenterY})`)
            .attr('class', 'text-foreground fill-current')
            .style('font-size', '14px')
            .style('font-family', 'Helvetica')
            .text(group.name);
        }
      });

      const letterPromises: Promise<void>[] = [];

      // Render each receptor row
      data.forEach((receptorData, receptorIndex) => {
        const receptorY = margin.top + receptorIndex * (logoAreaHeight + gapBetweenReceptors);
        
        receptorData.logoData.forEach((d) => {
          const positionX = x.getX(d.position.toString());
          const positionWidth = x.bandwidth();
          
          
          // Determine most-conserved AA for this row at this position
          let topAA = d.mostConservedAA;
          if (!topAA) {
            // fallback: choose residue with max count
            let maxCount = 0;
            Object.entries(d.residueCounts).forEach(([aa, cnt]) => {
              if (cnt > maxCount) {
                maxCount = cnt;
                topAA = aa;
              }
            });
          }

          // Store into overlap map
          if (topAA) {
            // Find which similarity group this amino acid belongs to
            let groupKey = topAA; // Default to the amino acid itself
            for (const [groupName, groupResidues] of Object.entries(matchingGroups)) {
              if (groupResidues.includes(topAA)) {
                groupKey = groupName; // Use group name as key
                break;
              }
            }
            
            if (!overlapMap[d.position]) overlapMap[d.position] = {};
            if (!overlapMap[d.position][groupKey]) overlapMap[d.position][groupKey] = [];
            overlapMap[d.position][groupKey].push(receptorIndex);
          }

          const sortedResidues = Object.entries(d.letterHeights)
            .sort(([,a], [,b]) => a - b);

          let stackY = receptorY + y(0);

          const createCustomSvgLetters = async () => {
            for (const [residue, height] of sortedResidues) {
              if (cancelled) return;
              if (height > 0) {
                const letterHeightPx = y(0) - y(height);
                const letterBaselineY = stackY;
                const letterX = positionX + positionWidth / 2;

                let svgData = null;
                try {
                  svgData = await loadCustomSvgLetter(residue);
                } catch (error) {
                  console.error(`Error loading SVG for ${residue}:`, error);
                  svgData = null;
                }

                if (svgData) {
                  const vbParts = svgData.viewBox.split(" ").map(Number);
                  const [, , vbWidth, vbHeight] = vbParts;

                  let targetWidth;
                  let preserveAspectRatio;
                  
                  if (residue === 'I') {
                    targetWidth = positionWidth * 0.2;
                    preserveAspectRatio = 'none';
                  } else {
                    targetWidth = positionWidth * 0.9;
                    preserveAspectRatio = 'none';
                  }

                  const nestedSvg = chartSvg
                    .append('svg')
                    .attr('x', letterX - targetWidth / 2)
                    .attr('y', letterBaselineY - letterHeightPx)
                    .attr('width', targetWidth)
                    .attr('height', letterHeightPx)
                    .attr('viewBox', `0 0 ${vbWidth} ${vbHeight}`)
                    .attr('preserveAspectRatio', preserveAspectRatio)
                    .style('overflow', 'visible')
                    .style('cursor', 'pointer');

                  const path = nestedSvg
                    .append('path')
                    .attr('d', svgData.path)
                    .attr('fill', getResidueColor(residue));

                  if (svgData.transformAttr) {
                    path.attr('transform', svgData.transformAttr);
                  }

                  nestedSvg
                    .on('mouseover', (event) => {
                      const alignmentDisplayName = getDisplayName 
                        ? getDisplayName(receptorData.receptorName) 
                        : receptorData.receptorName;
                      let tooltipContent = `<strong>Alignment:</strong> ${alignmentDisplayName}<br/>` +
                        `<strong>Position:</strong> ${d.position}<br/>` +
                        `<strong>Residue:</strong> ${residue}<br/>` +
                        `<strong>Count:</strong> ${d.residueCounts[residue]} / ${d.totalSequences}<br/>` +
                        `<strong>Frequency:</strong> ${((d.residueCounts[residue] / d.totalSequences) * 100).toFixed(1)}%<br/>`;
                      
                      
                      tooltipContent += `<strong>Information:</strong> ${height.toFixed(2)} bits`;
                      
                      showTooltip(event, tooltipContent);
                    })
                    .on('mousemove', (event) => {
                      updateTooltipPosition(event);
                    })
                    .on('mouseout', () => hideTooltip());

                } else {
                  const targetWidth = residue === 'I' ? positionWidth * 0.2 : positionWidth * 0.9;
                  const fallbackSvg = chartSvg
                    .append('svg')
                    .attr('x', letterX - targetWidth / 2)
                    .attr('y', letterBaselineY - letterHeightPx)
                    .attr('width', targetWidth)
                    .attr('height', letterHeightPx)
                    .attr('viewBox', '0 0 100 100')
                    .attr('preserveAspectRatio', 'none')
                    .style('overflow', 'hidden')
                    .style('cursor', 'pointer');

                  fallbackSvg
                    .append('text')
                    .attr('x', 50)
                    .attr('y', 88)
                    .attr('text-anchor', 'middle')
                    .attr('font-family', 'Helvetica')
                    .attr('font-weight', 'bold')
                    .attr('font-size', 100)
                    .attr('fill', getResidueColor(residue))
                    .text(residue);

                  fallbackSvg
                    .on('mouseover', (event) => {
                      const alignmentDisplayName = getDisplayName 
                        ? getDisplayName(receptorData.receptorName) 
                        : receptorData.receptorName;
                      let tooltipContent = `<strong>Alignment:</strong> ${alignmentDisplayName}<br/>` +
                        `<strong>Position:</strong> ${d.position}<br/>` +
                        `<strong>Residue:</strong> ${residue}<br/>` +
                        `<strong>Count:</strong> ${d.residueCounts[residue]} / ${d.totalSequences}<br/>` +
                        `<strong>Frequency:</strong> ${((d.residueCounts[residue] / d.totalSequences) * 100).toFixed(1)}%<br/>`;
                      
                      
                      tooltipContent += `<strong>Information:</strong> ${height.toFixed(2)} bits`;
                      
                      showTooltip(event, tooltipContent);
                    })
                    .on('mousemove', (event) => {
                      updateTooltipPosition(event);
                    })
                    .on('mouseout', () => hideTooltip());
                }

                stackY -= letterHeightPx;
              }
            }
          };
          
          const letterPromise = createCustomSvgLetters().catch(error => {
            console.error('Error in createCustomSvgLetters:', error);
          });
          letterPromises.push(letterPromise);
          
          // Add blur overlay if needed
          if (d.crossAlignmentData?.shouldBlur) {
            chartSvg
              .append('rect')
              .attr('x', positionX)
              .attr('y', receptorY)
              .attr('width', positionWidth)
              .attr('height', logoAreaHeight)
              .attr('fill', 'rgba(128, 128, 128, 0.7)')
              .attr('pointer-events', 'none')
              .style('mix-blend-mode', 'multiply');
          }
        });
      });


      /* ─── Reference GPCRdb rows ───────────────────────────── */
      if (showReferenceRows && referenceInfo.length > 0) {
        const referencePlotOffset = margin.top + (logoAreaHeight * data.length) + (gapBetweenReceptors * (data.length - 1)) + dotPlotHeight + evolutionaryPatternAreaHeight + 2; // tighter padding

        // Background stripes for readability
        referenceInfo.forEach((_, idx) => {
          chartSvg.append('rect')
            .attr('x', 0)
            .attr('y', referencePlotOffset + idx * referenceRowHeight)
            .attr('width', chartContentWidth)
            .attr('height', referenceRowHeight)
            .attr('fill', '#000000')
            .attr('fill-opacity', idx % 2 ? 0.03 : 0.06);
        });

        referenceInfo.forEach((ref, refIdx) => {
          const rowCenterY = referencePlotOffset + refIdx * referenceRowHeight + referenceRowHeight / 2;

          // Y-axis label for the reference gene
          // Convert label to match logo row format (e.g., classA -> Class A)
          const refDisplayName = getPlotDisplayName 
            ? getPlotDisplayName(ref.label + '_genes_filtered_db_FAMSA.ref_trimmed') 
            : ref.label;
          
          yAxisSvg.append('text')
            .attr('text-anchor', 'end')
            .attr('x', yAxisWidth - 10)
            .attr('y', rowCenterY + 4)
            .attr('class', 'text-foreground fill-current')
            .style('font-size', '12px')
            .style('font-family', 'Helvetica')
            .text(refDisplayName);

          // Get the first receptor's logo data to access msaColumn information
          const firstReceptorData = data[0];
          if (firstReceptorData && firstReceptorData.logoData) {
            firstReceptorData.logoData.forEach(logoPos => {
              const displayPos = logoPos.position;
              const msaCol = logoPos.msaColumn;
              
              // Check if this position is in the displayed positions
              if (positionsWithData.includes(displayPos)) {
                const gpcr = ref.gpcrdbMap[msaCol] || '';
                if (!gpcr) return;
                const cx = x.getX(displayPos.toString()) + x.bandwidth() / 2;
                chartSvg.append('text')
                  .attr('class', 'text-foreground fill-current')
                  .style('font-size', '10px')
                  .style('font-family', 'Helvetica')
                  .attr('text-anchor', 'middle')
                  .attr('dominant-baseline', 'middle')
                  .attr('transform', `translate(${cx}, ${rowCenterY}) rotate(-90)`)
                  .text(gpcr);
              }
            });
          }
        });
      }

      /* ─── Protein Region blocks (TM1-TM7, H8, ECL2) ─────────────────────────────────── */
      if (proteinRegions.length > 0) {
        const proteinRegionPlotOffset = margin.top + (logoAreaHeight * data.length) + (gapBetweenReceptors * (data.length - 1)) + dotPlotHeight + referenceAreaHeight + evolutionaryPatternAreaHeight + 4;
        
        // Background stripe for the entire region area
        if (proteinRegions.length > 0) {
          const first = proteinRegions[0];
          const last = proteinRegions[proteinRegions.length - 1];
          const xStart = x.getX(positionsWithData[first.start].toString());
          const xEnd = x.getX(positionsWithData[last.end].toString()) + x.bandwidth();
          
          chartSvg.append('rect')
            .attr('x', xStart)
            .attr('y', proteinRegionPlotOffset)
            .attr('width', xEnd - xStart)
            .attr('height', proteinRegionHeight)
            .attr('fill', isDarkMode ? '#0A0A0B' : '#F7F7F7')
            .attr('fill-opacity', 1);
        }
        
        proteinRegions.forEach((region, regionIndex) => {
          // Calculate x positions for this region
          const startX = x.getX(positionsWithData[region.start].toString());
          const endX = x.getX(positionsWithData[region.end].toString()) + x.bandwidth();
          const blockWidth = endX - startX;
          
          // Alternating fill colors for better distinction - use solid hex colors for SVG export
          // Using lighter grays that are clearly visible
          const fillColor = regionIndex % 2 ? '#E8E8E8' : '#D8D8D8';
          const strokeColor = '#999999';
          const textColor = '#000000';
          
          // Draw region block
          chartSvg
            .append('rect')
            .attr('x', startX)
            .attr('y', proteinRegionPlotOffset)
            .attr('width', blockWidth)
            .attr('height', proteinRegionHeight)
            .attr('fill', fillColor)
            .attr('stroke', strokeColor)
            .attr('stroke-width', 0.5)
            .style('fill', fillColor); // Also set as inline style for better compatibility
          
          // Add region label (only if block is wide enough)
          if (blockWidth > 30) {
            chartSvg
              .append('text')
              .attr('x', startX + blockWidth / 2)
              .attr('y', proteinRegionPlotOffset + proteinRegionHeight / 2)
              .attr('text-anchor', 'middle')
              .attr('dominant-baseline', 'middle')
              .attr('fill', textColor)
              .attr('font-size', '11px')
              .attr('font-family', 'Helvetica')
              .attr('font-weight', 'bold')
              .style('fill', textColor) // Also set as inline style
              .text(region.label);
          }
        });
      }

      // Add conservation bar plot below the logos if using simple conservation
      if (useSimpleConservation && data.length > 0 && data[0].logoData.length > 0) {
        const conservationBarHeight = 60;
        const barChartY = totalHeight - conservationBarHeight - margin.bottom;
        
        // Add conservation bar chart background
        chartSvg
          .append('rect')
          .attr('x', 0)
          .attr('y', barChartY)
          .attr('width', chartContentWidth)
          .attr('height', conservationBarHeight)
          .attr('fill', 'rgba(240, 240, 240, 0.5)')
          .attr('stroke', 'rgba(200, 200, 200, 0.8)')
          .attr('stroke-width', 1);
        
        // Conservation bars
        const maxConservation = 100;
        const barScale = d3.scaleLinear()
          .domain([0, maxConservation])
          .range([0, conservationBarHeight - 20]);
        
        data[0].logoData.forEach((d) => {
          if (d.crossAlignmentData) {
            const barX = x.getX(d.position.toString());
            const barWidth = x.bandwidth();
            const barHeight = barScale(d.crossAlignmentData.conservationPercentage);
            
            // Conservation bar
            chartSvg
              .append('rect')
              .attr('x', barX)
              .attr('y', barChartY + conservationBarHeight - 10 - barHeight)
              .attr('width', barWidth)
              .attr('height', barHeight)
              .attr('fill', d.crossAlignmentData.conservationPercentage >= conservationThreshold ? '#22c55e' : '#ef4444')
              .attr('opacity', 0.8)
              .on('mouseover', (event) => {
                showTooltip(event,
                  `<strong>Position:</strong> ${d.position}<br/>` +
                  `<strong>Conservation:</strong> ${d.crossAlignmentData!.conservationPercentage.toFixed(1)}%<br/>` +
                  `<strong>Threshold:</strong> ${conservationThreshold}%`
                );
              })
              .on('mousemove', (event) => {
                updateTooltipPosition(event);
              })
              .on('mouseout', () => hideTooltip());
          }
        });
        
        // Add threshold line
        if (conservationThreshold > 0) {
          const thresholdY = barChartY + conservationBarHeight - 10 - barScale(conservationThreshold);
          chartSvg
            .append('line')
            .attr('x1', 0)
            .attr('x2', chartContentWidth)
            .attr('y1', thresholdY)
            .attr('y2', thresholdY)
            .attr('stroke', '#dc2626')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5');
          
          // Threshold label
          chartSvg
            .append('text')
            .attr('x', 5)
            .attr('y', thresholdY - 5)
            .attr('class', 'text-foreground fill-current')
            .style('font-size', '12px')
            .style('font-family', 'Helvetica')
            .text(`Threshold: ${conservationThreshold}%`);
        }
        
        // Y-axis for conservation
        const conservationAxis = d3.axisLeft(d3.scaleLinear()
          .domain([0, maxConservation])
          .range([conservationBarHeight - 10, 10]))
          .tickValues([0, maxConservation])
          .tickFormat(d => `${d}%`)
          .tickSize(0);
        
        yAxisSvg
          .append('g')
          .attr('transform', `translate(${yAxisWidth - 1}, ${barChartY})`)
          .attr('class', 'axis')
          .call(conservationAxis)
          .call(g => g.select('.domain')
                         .attr('stroke', '#888')
                         .attr('stroke-width', 2))
          .selectAll('text')
          .style('font-size', '12px')
          .style('font-family', 'Helvetica');
        
        // Conservation chart label
        yAxisSvg
          .append('text')
          .attr('text-anchor', 'middle')
          .attr('transform', `translate(15, ${barChartY + conservationBarHeight / 2}) rotate(-90)`)
          .attr('class', 'text-foreground fill-current')
          .style('font-size', '12px')
          .style('font-family', 'Helvetica')
          .text('Conservation %');
      }

      // Removed column numbering on top
      // ─────────────────────────────────────────────────────────────────────────
    }

    return () => {
      cancelled = true;
      yAxisContainer.innerHTML = '';
      chartContainer.innerHTML = '';
      setTooltip(prev => ({ ...prev, visible: false }));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mappingsLoaded, 
    selectedAlignments, 
    processedReceptorData, 
    rowHeight, 
    minConservationThreshold,
    minFamiliesCount,
    showReferenceRows,
    showProteinRegions,
    referenceInfo,
    // Stable function references - these rarely change
    getResidueColor, 
    loadCustomSvgLetter, 
    showTooltip, 
    hideTooltip, 
    updateTooltipPosition,
    getDisplayName,
    getPlotDisplayName,
    receptorGroups
  ]);

  // Keep chart mounted during loading/processing; show non-blocking overlay instead

  return (
    <div className="max-w-7xl mx-auto">
      {/* Section header + top-right download actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h3 className="text-xl font-semibold">Superfamily Logo</h3>
        <div className="flex items-center gap-2 sm:justify-end">
          <button
            type="button"
            onClick={downloadSVG}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm hover:bg-accent"
          >
            <Download className="h-4 w-4" />
            Download SVG
          </button>
          <button
            type="button"
            onClick={downloadEPS}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm hover:bg-accent"
          >
            <Download className="h-4 w-4" />
            Download EPS
          </button>
        </div>
      </div>

      {/* Chart container placeholder (SVGs rendered via d3) */}
      <div className="relative w-full overflow-hidden mb-4 rounded-md bg-background">
        {selectedAlignments.length === 0 && (
          <div className="w-full text-center py-12 text-muted-foreground">
            <p className="text-lg">Select families from the controls above to generate sequence logos</p>
          </div>
        )}
        <div
          ref={yAxisContainerRef}
          className="absolute left-0 top-0 z-20 h-full w-[172px] overflow-hidden bg-background"
        />
        <div className="overflow-x-auto overflow-y-hidden pl-[172px] bg-background">
          <div ref={chartContainerRef} className="h-full w-max min-w-full" />
        </div>
      </div>

      {/* Color legend controls */}
      <div className="flex flex-wrap gap-4 items-center justify-center">
        {Object.entries(aminoAcidGroups).map(([groupKey, group]) => {
          const getDisplayColor = () => {
            if (groupKey === 'small' && groupColors[groupKey] === '#231F20') {
              return isDarkMode ? '#FFFFFF' : '#231F20';
            }
            return groupColors[groupKey];
          };

          return (
            <div key={groupKey} className="flex items-center gap-2">
              <input
                type="color"
                value={getDisplayColor()}
                onChange={(e) => handleColorChange(groupKey, e.target.value)}
                className="w-5 h-5 rounded cursor-pointer border"
                title={`Color for ${group.label}`}
              />
              <span className="text-base text-foreground">{group.label}</span>
            </div>
          );
        })}
        <button
          onClick={resetColors}
          className="ml-2 px-3 py-1 text-xs bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded border transition-colors"
          title="Reset colors to default"
        >
          Reset
        </button>
      </div>

      {/* Tooltip via portal */}
      {tooltip.visible && typeof window !== 'undefined' && createPortal(
        <div
          className="fixed z-50 pointer-events-none bg-white text-black dark:bg-black dark:text-white text-xs sm:text-sm rounded border border-gray-300 dark:border-gray-600 px-1 py-0.5 sm:px-2 sm:py-1 max-w-xs sm:max-w-sm break-words leading-tight sm:leading-normal shadow-lg"
          style={{
            left: Math.min(tooltip.x + 10, window.innerWidth - 200),
            top: Math.max(tooltip.y - 60, 10),
          }}
        >
          <div dangerouslySetInnerHTML={{ __html: tooltip.content }} />
        </div>,
        document.body
      )}

    </div>
  );
};

export default SuperfamilyLogo;