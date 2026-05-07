'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as d3 from 'd3';
import { Download } from 'lucide-react';
import { readConservationData } from '@/lib/receptorComparison';

interface Sequence {
  header: string;
  sequence: string;
}

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

// Subset of receptor metadata used for reference annotation
type ReceptorEntry = {
  geneName: string;
  conservationFile: string;
};

interface Props {
  /** List of FASTA file base names (without extension) */
  fastaNames: string[];
  /** Public folder path where FASTA files live */
  folder: string;
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

// Map custom family FASTA base names -> family keys used in trim_info.tsv
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

// Map class-wide keys to family names in trim_info
const classToFamilyKey: Record<string, string> = {
  'ClassA': 'classA',
  'ClassB1': 'classB1',
  'ClassB2': 'classB2',
  'ClassC': 'classC',
  'ClassF': 'classF',
  'ClassT': 'classT',
  'ClassOlf': 'Olfactory',
  'GP157': 'GP157',
  'GP143': 'GP143'
};

// Removed unused inverse map
// const familyKeyToClass: Record<string, string> = Object.entries(classToFamilyKey)
//   .reduce((acc, [cls, fam]) => { acc[fam] = cls; return acc; }, {} as Record<string, string>);

const CustomSequenceLogo: React.FC<Props> = ({ fastaNames, folder, getDisplayName, getPlotDisplayName, filteredPositions, onSelectedAlignmentsChange, selectedAlignmentsExternal, showReferenceRowsExternal, showProteinRegionsExternal, rowHeightExternal, minConservationThresholdExternal, minFamiliesCountExternal }) => {
  const yAxisContainerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [allData, setAllData] = useState<{
    name: string;
    sequences: Sequence[];
  }[]>([]);
  
  // Sup-representatives sequences (from sup_reps*.fasta)
  const [supRepSequences, setSupRepSequences] = useState<Sequence[]>([]);
  
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

  // Load trim_info.tsv → maps of family -> acc1 and acc2 accessions (if present)
  const [familyToAcc2, setFamilyToAcc2] = useState<Record<string, string>>({});
  const [familyToAcc1, setFamilyToAcc1] = useState<Record<string, string>>({});
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/custom_msa/trim_info.tsv');
        if (!res.ok) return;
        const text = await res.text();
        const lines = text.trim().split(/\r?\n/);
        const map2: Record<string, string> = {};
        const map1: Record<string, string> = {};
        for (let i = 1; i < lines.length; i++) { // skip header
          const parts = lines[i].split('\t');
          if (parts.length < 2) continue;
          const acc1 = (parts[0] || '').trim();
          const family = (parts[1] || '').trim();
          const acc2 = (parts[2] || '').trim();
          if (family) {
            if (acc1) map1[family] = acc1;
            if (acc2) map2[family] = acc2;
          }
        }
        setFamilyToAcc1(map1);
        setFamilyToAcc2(map2);
      } catch {}
    })();
  }, []);
  
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

  // State for gap between receptor rows
  const [gapBetweenReceptors] = useState(10);

  // State for class-wide alignments
  const [selectedClassAlignments] = useState<string[]>([]);
  const [humanRefSequences, setHumanRefSequences] = useState<Sequence[]>([]);
  
  // Pre-loaded class-wide alignment data (similar to allData for custom alignments)
  const [classWideData, setClassWideData] = useState<Record<string, {
    familySequences: Sequence[];
    conservationData: Record<string, {
      conservation: number;
      conservedAA: string;
      aa: string;
      region: string;
      gpcrdb: string;
    }>;
  }>>({});
  const [classDataLoaded, setClassDataLoaded] = useState(false);


  // Available class-wide alignments (moved outside component to prevent re-creation)
  const availableClassAlignments = useMemo(() => ['ClassA', 'ClassB1', 'ClassB2', 'ClassC', 'ClassF', 'ClassT', 'ClassOlf', 'GP157', 'GP143'], []);
  
  // Selection order tracking removed - now handled by parent

  // HRH2 residue filter removed

  /* ─── Reference GPCRdb info rows ─────────────────────────────── */
  const [showReferenceRows, setShowReferenceRows] = useState(false);
  const [showProteinRegions, setShowProteinRegions] = useState(false);
  
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
  
  const [referenceDataLoaded, setReferenceDataLoaded] = useState(false);
  // Map geneName → gpcrdb string array (indexed by alignment column, 0-based)
  const [referenceMaps, setReferenceMaps] = useState<Record<string, string[]>>({});

  // Computed array for current selection (order fixed by class mapping) – memoized so identity never changes  
  // type ClassKey = 'ClassA' | 'ClassT' | 'ClassB1' | 'ClassB2' | 'ClassC' | 'ClassF' | 'ClassOlf' | 'GP157' | 'GP143';
  // Removed unused map (we now use familyToAcc1 acc1 names directly)
  // const classToGene: Record<ClassKey, string> = useMemo(() => ({
  //   ClassA: 'HRH2',
  //   ClassT: 'T2R39',
  //   ClassB1: 'PTH1R',
  //   ClassB2: 'AGRL3',
  //   ClassC: 'CASR',
  //   ClassF: 'FZD7',
  //   ClassOlf: 'O52I2',
  //   GP157: 'GP157',
  //   GP143: 'GP143'
  // }), []);
  const [referenceInfo, setReferenceInfo] = useState<{ label: string; gpcrdbMap: string[] }[]>([]);

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

  // Basic FASTA parser
  function parseFasta(text: string): Sequence[] {
    const lines = text.trim().split(/\r?\n/);
    const seqs: Sequence[] = [];
    let header = '';
    let seq = '';
    for (const line of lines) {
      if (line.startsWith('>')) {
        if (header) {
          seqs.push({ header, sequence: seq });
        }
        header = line.substring(1).trim();
        seq = '';
      } else {
        seq += line.trim();
      }
    }
    if (header) seqs.push({ header, sequence: seq });
    return seqs;
  }

  // Extract sequence range from header (e.g., "/27-335" -> {start: 27, end: 335})
  function extractSeqRange(header: string): { start: number; end: number } | null {
    const match = header.match(/\/(\d+)-(\d+)/);
    if (match) {
      return { start: parseInt(match[1]), end: parseInt(match[2]) };
    }
    return null;
  }

  // Removed unused helper to satisfy linter
  // function getRealResidueNumber(msaColumn: number, sequence: string, header: string): number | null { return null; }

  // Load all FASTA files once
  useEffect(() => {
    async function loadAll() {
      const results = await Promise.all(
        fastaNames.map(async (name) => {
          try {
            const res = await fetch(`${folder}/${name}.fasta`);
            if (!res.ok) {
              console.warn(`Failed to load ${name}.fasta: ${res.status}`);
              return { name, sequences: [] };
            }
            const text = await res.text();
            return { name, sequences: parseFasta(text) };
          } catch (error) {
            console.error(`Error loading ${name}.fasta:`, error);
            return { name, sequences: [] };
          }
        })
      );
      setAllData(results);
      setDataLoaded(true);
    }
    loadAll();
  }, [fastaNames, folder]);

  /* ─── Initial load of reference sequences & receptor metadata ─── */
  useEffect(() => {
    (async () => {
      try {
        // Load sup_reps sequences instead of human_refs
        const fastaRes = await fetch('/custom_msa/sup_reps_noClassC_noSTE3_linsi_trimends_treein_einsi_ep0.123_missing_added_reps_only.fasta');
        if (!fastaRes.ok) {
          console.warn('Failed to load sup_reps alignment:', fastaRes.status);
          return;
        }
        const fastaText = await fastaRes.text();
        const refSeqsArr = parseFasta(fastaText);
        setSupRepSequences(refSeqsArr);
        
        // Build map: accession (from sup_reps header) → sequence
        const acc1ToSeq: Record<string, Sequence> = {};
        refSeqsArr.forEach(seqObj => {
          // Extract accession: split by | or _ and get second element
          const parts1 = seqObj.header.split('|');
          const acc = parts1.length > 1 ? parts1[1].trim() : seqObj.header.split('_')[1]?.trim();
          if (acc) {
            acc1ToSeq[acc] = seqObj;
          }
        });

        // Wait for trim_info to load
        // We'll trigger GPCRdb mapping computation in a separate effect after both are ready
        console.log('Sup_reps sequences loaded:', Object.keys(acc1ToSeq));
      } catch (err) {
        console.error('Error loading sup_reps:', err);
      }
    })();
  }, []);

  // Build GPCRdb mapping after trim_info and sup_reps are loaded
  useEffect(() => {
    if (supRepSequences.length === 0 || Object.keys(familyToAcc1).length === 0) return;
    
    (async () => {
      try {
        // Build acc1 -> sup_reps sequence map
        const acc1ToSupSeq: Record<string, Sequence> = {};
        supRepSequences.forEach(seqObj => {
          const parts1 = seqObj.header.split('|');
          const acc = parts1.length > 1 ? parts1[1].trim() : seqObj.header.split('_')[1]?.trim();
          if (acc) {
            acc1ToSupSeq[acc] = seqObj;
          }
        });

        // Load receptors metadata
        const recRes = await fetch('/receptors.json');
        if (!recRes.ok) {
          console.warn('Failed to load receptors.json:', recRes.status);
          return;
        }
        const receptorsList: ReceptorEntry[] = await recRes.json();
        const geneToConsFile: Record<string, string> = {};
        receptorsList.forEach(rec => {
          geneToConsFile[rec.geneName.toUpperCase()] = rec.conservationFile;
        });

        // For each family, create acc1→acc2 mapping and build GPCRdb maps
        const maps: Record<string, string[]> = {};
        
        for (const [family, acc1] of Object.entries(familyToAcc1)) {
          const acc2 = familyToAcc2[family];
          const supSeq = acc1ToSupSeq[acc1];
          if (!supSeq) continue;

          // Load family alignment to map acc1 columns to acc2 residue numbers
            const familyFile = Object.entries(fileBaseToFamily).find((entry) => entry[1] === family)?.[0];
          if (!familyFile) continue;

          try {
            const famRes = await fetch(`${folder}/${familyFile}.fasta`);
            if (!famRes.ok) continue;
            const famText = await famRes.text();
            const famSeqs = parseFasta(famText);

            // Find acc1 and acc2 sequences in family alignment
            const findByAcc = (acc: string) => famSeqs.find(s => {
              if (s.header.includes(acc)) return true;
              const p = s.header.split('|');
              if (p.length > 1 && p[1].trim() === acc) return true;
              const u = s.header.split('_');
              if (u.length > 1 && u[1].trim() === acc) return true;
              return false;
            });

            const famAcc1Seq = findByAcc(acc1);
            const famAcc2Seq = acc2 ? findByAcc(acc2) : null;

            // If we have acc2, create mapping acc1_supCol → acc2_residueNum
            const acc1ToAcc2ResMap: Record<number, number> = {};
            let geneName: string | null = null;

            if (famAcc2Seq && acc2) {
              // Extract gene name from acc2 sequence header: split by | get 3rd, split by _ get 1st
              const parts = famAcc2Seq.header.split('|');
              if (parts.length > 2) {
                const geneToken = parts[2].trim().split('_')[0];
                geneName = geneToken;
              }

              // Build acc1→acc2 residue mapping via family alignment
              // Extract sequence ranges to get real residue numbers
              const acc1Range = famAcc1Seq ? extractSeqRange(famAcc1Seq.header) : null;
              const acc2Range = extractSeqRange(famAcc2Seq.header);
              const acc1Offset = acc1Range ? acc1Range.start - 1 : 0;
              const acc2Offset = acc2Range ? acc2Range.start - 1 : 0;
              
              let acc1Running = 0;
              let acc2Running = 0;
              const familyLen = Math.max(famAcc1Seq?.sequence.length || 0, famAcc2Seq.sequence.length);
              
              for (let famCol = 0; famCol < familyLen; famCol++) {
                const aa1 = famAcc1Seq?.sequence[famCol] || '-';
                const aa2 = famAcc2Seq.sequence[famCol] || '-';
                
                if (aa1 !== '-') acc1Running++;
                if (aa2 !== '-') acc2Running++;
                
                // Map acc1 REAL residue number to acc2 REAL residue number
                if (aa1 !== '-' && aa2 !== '-') {
                  const realAcc1Res = acc1Offset + acc1Running;
                  const realAcc2Res = acc2Offset + acc2Running;
                  acc1ToAcc2ResMap[realAcc1Res] = realAcc2Res;
                }
              }
            }

            // Now map sup_reps columns to GPCRdb
            const gpcrdbMap: string[] = new Array(supSeq.sequence.length).fill('');
            
            if (geneName && acc1ToAcc2ResMap && Object.keys(acc1ToAcc2ResMap).length > 0) {
              // Load conservation data for the gene
              const consFile = geneToConsFile[geneName.toUpperCase()];
              if (consFile) {
                const consData = await readConservationData(`/${consFile}`);
                
                // Extract sup_reps acc1 sequence range offset
                const supRange = extractSeqRange(supSeq.header);
                const supOffset = supRange ? supRange.start - 1 : 0;
                
                // For each column in sup_reps (acc1 alignment)
                let acc1ResCount = 0;
                for (let supCol = 0; supCol < supSeq.sequence.length; supCol++) {
                  const aa = supSeq.sequence[supCol];
                  if (aa !== '-') {
                    acc1ResCount++;
                    const realAcc1Res = supOffset + acc1ResCount;
                    
                    // Map to acc2 REAL residue number
                    const acc2ResNum = acc1ToAcc2ResMap[realAcc1Res];
                    if (acc2ResNum) {
                      // Get GPCRdb from conservation data using acc2's real residue number
                      const residueData = consData[acc2ResNum.toString()];
                      gpcrdbMap[supCol] = residueData?.gpcrdb || acc2ResNum.toString();
                    }
                  }
                }
              }
            }

            // Store the map using acc1 as key (since that's what sup_reps uses)
            maps[acc1.toUpperCase()] = gpcrdbMap;
            
            } catch (err) {
            console.warn(`Error processing family ${family}:`, err);
            }
          }

        setReferenceMaps(maps);
        setReferenceDataLoaded(true);
      } catch (err) {
        console.error('Error building GPCRdb maps:', err);
      }
    })();
  }, [supRepSequences, familyToAcc1, familyToAcc2, folder]);

  /* ─── Compute referenceInfo based on selected alignments ───────── */
  useEffect(() => {
    if (!referenceDataLoaded) return;

    // Determine reference rows needed based on selected alignments using acc1 representatives
    const neededGenes: string[] = [];

    // From custom alignments
    selectedAlignments.forEach(name => {
      const familyKey = fileBaseToFamily[name];
      if (!familyKey) return;
      const acc1 = familyToAcc1[familyKey];
      if (acc1) {
        const geneKey = acc1.toUpperCase();
        if (!neededGenes.includes(geneKey)) neededGenes.push(geneKey);
      }
    });

    // From any class-wide selections (if any remain)
    selectedClassAlignments.forEach(className => {
      const familyKey = classToFamilyKey[className];
      if (!familyKey) return;
      const acc1 = familyToAcc1[familyKey];
      if (acc1) {
        const geneKey = acc1.toUpperCase();
        if (!neededGenes.includes(geneKey)) neededGenes.push(geneKey);
      }
    });

    const newRefInfo: { label: string; gpcrdbMap: string[] }[] = [];
    neededGenes.forEach(gene => {
      const famKey = Object.entries(familyToAcc1).find(([, acc1]) => acc1.toUpperCase() === gene)?.[0];
      const familyLabel = famKey || gene; // Prefer family name label if available
      const map = referenceMaps[gene];
      if (map && map.some(v => !!v)) { // only include rows that have any gpcrdb labels
        newRefInfo.push({ label: familyLabel, gpcrdbMap: map });
      }
    });

    setReferenceInfo(newRefInfo);
  }, [selectedAlignments, selectedClassAlignments, referenceDataLoaded, referenceMaps, familyToAcc1]);

  // Load sup_reps sequences and pre-load all class-wide alignment data (runs only once)
  useEffect(() => {
    console.log('🔄 useEffect for class-wide data loading triggered - should only run once!');
    const loadAllClassWideData = async () => {
      try {
        console.log('🚀 Pre-loading all class-wide alignment data...');
        
        // Wait for sup_reps to be loaded (from previous effect)
        if (supRepSequences.length === 0) {
          console.log('Waiting for sup_reps to load...');
          return;
        }
        setHumanRefSequences(supRepSequences);

                 // Pre-load all class-wide alignments and their conservation data
         const classData: Record<string, {
           familySequences: Sequence[];
           conservationData: Record<string, {
             conservation: number;
             conservedAA: string;
             aa: string;
             region: string;
             gpcrdb: string;
           }>;
         }> = {};
         
         await Promise.all(availableClassAlignments.map(async (className: string) => {
           try {
             const familyKey = classToFamilyKey[className];
             const acc2 = familyKey ? familyToAcc2[familyKey] : undefined;
             
             // Load family alignment from custom_msa
             const familyFile = Object.entries(fileBaseToFamily).find((entry) => entry[1] === familyKey)?.[0];
             if (!familyFile) {
               console.warn(`No family file mapping for ${className}`);
               return;
             }
             
             const familyResponse = await fetch(`${folder}/${familyFile}.fasta`);
             
             if (!familyResponse.ok) {
               console.warn(`Failed to pre-load ${className} family alignment: ${familyResponse.status}`);
               return;
             }
             
             const familyFastaText = await familyResponse.text();
             const familySequences = parseFasta(familyFastaText);
             
             // Load conservation data using acc2's gene name
             const conservationData: Record<string, {
               conservation: number;
               conservedAA: string;
               aa: string;
               region: string;
               gpcrdb: string;
             }> = {};
            
            if (acc2) {
              // Find acc2 sequence to extract gene name
              const acc2Seq = familySequences.find(s => {
                if (s.header.includes(acc2)) return true;
                const p = s.header.split('|');
                if (p.length > 1 && p[1].trim() === acc2) return true;
                const u = s.header.split('_');
                if (u.length > 1 && u[1].trim() === acc2) return true;
                return false;
              });
              
              if (acc2Seq) {
                const parts = acc2Seq.header.split('|');
                if (parts.length > 2) {
                  const geneName = parts[2].trim().split('_')[0];
                  
                  try {
                    const conservationResponse = await fetch(`/conservation_files/${geneName}_conservation.txt`);
              if (conservationResponse.ok) {
                const conservationText = await conservationResponse.text();
                conservationText.split('\n').forEach(line => {
                  const parts = line.split('\t');
                  if (parts[0] && parts[0].trim().toLowerCase() !== 'residue_number' && parts.length >= 6) {
                    const resNum = parts[0].trim();
                    conservationData[resNum] = {
                      conservation: parseFloat(parts[1].trim()),
                      conservedAA: parts[2].trim(),
                      aa: parts[3].trim(),
                      region: parts[4].trim(),
                      gpcrdb: parts[5].trim(),
                    };
                  }
                });
              }
            } catch (error) {
                    console.warn(`Could not pre-load conservation data for ${geneName}:`, error);
                  }
                }
              }
            }
            
            classData[className] = {
              familySequences,
              conservationData
            };
            
            console.log(`✅ Pre-loaded ${className} data (${familySequences.length} sequences)`);
          } catch (error) {
            console.error(`Error pre-loading ${className}:`, error);
          }
        }));

        setClassWideData(classData);
        setClassDataLoaded(true);
        console.log('🎉 All class-wide alignment data pre-loaded!');
        
      } catch (error) {
        console.error('Error loading class-wide alignment data:', error);
      }
    };

         loadAllClassWideData();
  }, [availableClassAlignments, supRepSequences, familyToAcc1, familyToAcc2, folder]);

  // Class alignment selection disabled – using mapping files via top checkboxes only
  // Remove unused handlers to satisfy linter

  // Function to calculate position logo data
  const calculatePositionLogoData = useCallback((position: number, sequences: string[]): {
    informationContent: number;
    letterHeights: Record<string, number>;
    residueCounts: Record<string, number>;
    totalSequences: number;
  } => {
    const residueCounts: Record<string, number> = {};
    let nonGapSequences = 0;
    const totalSequencesInAlignment = sequences.length; // Include gaps in total
    
    const standardAA = 'ACDEFGHIKLMNPQRSTVWY';
    sequences.forEach(seq => {
      const residue = seq[position]?.toUpperCase();
      if (residue && standardAA.includes(residue)) {
        residueCounts[residue] = (residueCounts[residue] || 0) + 1;
        nonGapSequences++;
      }
      // Gaps are implicitly counted as reducing conservation
    });
    
    // Skip positions with no amino acids at all
    if (nonGapSequences === 0) {
      return { 
        informationContent: 0, 
        letterHeights: {}, 
        residueCounts: {},
        totalSequences: totalSequencesInAlignment
      };
    }
    
    // Calculate frequencies against ALL sequences (including gaps)
    const frequencies: Record<string, number> = {};
    Object.keys(residueCounts).forEach(residue => {
      frequencies[residue] = residueCounts[residue] / totalSequencesInAlignment; // Changed to include gaps
    });
    
    // Add gap frequency for entropy calculation
    const gapFrequency = (totalSequencesInAlignment - nonGapSequences) / totalSequencesInAlignment;
    
    let entropy = 0;
    Object.values(frequencies).forEach(freq => {
      if (freq > 0) {
        entropy -= freq * Math.log2(freq);
      }
    });
    
    // Include gap contribution to entropy
    if (gapFrequency > 0) {
      entropy -= gapFrequency * Math.log2(gapFrequency);
    }
    
    const maxBits = Math.log2(21); // 20 amino acids + gaps
    const informationContent = Math.max(0, maxBits - entropy);
    
    const letterHeights: Record<string, number> = {};
    Object.keys(residueCounts).forEach(residue => {
      letterHeights[residue] = frequencies[residue] * informationContent;
    });
    
    return { informationContent, letterHeights, residueCounts, totalSequences: totalSequencesInAlignment };
  }, []);

  // Simple conservation calculation removed - DISABLED
  // const calculateSimpleConservation = useCallback((position: number, sequences: string[]): { ... } => { ... }, []);

  // Enhanced position logo data calculation (entropy-based only)
  const calculateEnhancedPositionLogoData = useCallback((position: number, sequences: string[]): {
    informationContent: number;
    letterHeights: Record<string, number>;
    residueCounts: Record<string, number>;
    totalSequences: number;
    matchPercentage?: number;
    mostConservedAA?: string;
    matchCounts?: Record<string, number>;
  } => {
    return calculatePositionLogoData(position, sequences);
  }, [calculatePositionLogoData]);

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

    // Process both custom and class-wide alignments
    const allSelectedAlignments = [...selectedAlignments, ...selectedClassAlignments];
    allSelectedAlignments.forEach(alignmentName => {
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
    const totalSelectedAlignments = allSelectedAlignments.length;
    const matchPercentage = totalSelectedAlignments > 0 ? (matchCount / totalSelectedAlignments) * 100 : 0;

    return {
      matchPercentage,
      mostConservedAA,
      alignmentAAs,
      matchCount,
      totalAlignments: totalSelectedAlignments
    };
  }, [selectedAlignments, selectedClassAlignments]);



  // Async processing of receptor data
  useEffect(() => {
    if (!dataLoaded || !allData.length) {
      setProcessedReceptorData([]);
      return;
    }

    // If class-wide alignments are selected, ensure class-wide data is pre-loaded
    if (selectedClassAlignments.length > 0 && (!classDataLoaded || humanRefSequences.length === 0)) {
      console.log('Waiting for class-wide alignment data to load...');
      setProcessedReceptorData([]);
      return;
    }

    const processData = async () => {
      console.log('🔄 Processing data for alignments:', [...selectedAlignments, ...selectedClassAlignments]);
      
      // HRH2-based filtering removed

      // First pass: collect all possible positions and their data for each alignment
      const alignmentPositionData: Record<string, Record<number, PositionLogoData>> = {};
      let globalMaxPosition = 0;

      // Process custom alignments - map to acc1 residue coordinate system
        const processAlignment = async (name: string) => {
          const entry = allData.find(d => d.name === name);
          if (!entry || !entry.sequences.length) {
            alignmentPositionData[name] = {};
            return;
          }

        // Determine if this alignment has an acc1 to define coordinate system
        const familyKey = fileBaseToFamily[name];
        const acc1 = familyKey ? familyToAcc1[familyKey] : undefined;
        const acc2 = familyKey ? familyToAcc2[familyKey] : undefined;

        // Prefer precomputed mapping JSON to avoid runtime MSA parsing
        try {
          if (familyKey) {
            const resp = await fetch(`/mappings/${familyKey}.json`);
            if (resp.ok) {
              const mapping = await resp.json();
              const posData: Record<number, PositionLogoData> = {};
              const positions = mapping.positions || [];
              for (let supCol = 0; supCol < positions.length; supCol++) {
                const p = positions[supCol] || null;
                if (!p) continue;
                posData[supCol] = {
                  position: supCol + 1,
                  msaColumn: supCol,
                  residueCounts: p.residueCounts || {},
                  totalSequences: p.totalSequences || 0,
                  informationContent: p.informationContent || 0,
                  letterHeights: p.letterHeights || {},
                  gpcrdb: p.gpcrdb || undefined
                };
              }
              alignmentPositionData[name] = posData;
              if (positions.length > 0) {
                globalMaxPosition = Math.max(globalMaxPosition, positions.length - 1);
              }
              return;
            }
          }
        } catch (e) {
          console.warn('Failed to load mapping JSON for', name, e);
        }
        
        // Find acc1 in sup_reps to get the reference sequence
        let supRepSeq: Sequence | undefined;
        if (acc1 && supRepSequences.length > 0) {
          supRepSeq = supRepSequences.find(seq => {
            const parts1 = seq.header.split('|');
            const seqAcc = parts1.length > 1 ? parts1[1].trim() : seq.header.split('_')[1]?.trim();
            return seqAcc === acc1;
          });
        }

        // Find acc1 and acc2 in family alignment
        const findByAcc = (acc: string) => entry.sequences.find(s => {
          if (s.header.includes(acc)) return true;
          const p = s.header.split('|');
          if (p.length > 1 && p[1].trim() === acc) return true;
          const u = s.header.split('_');
          if (u.length > 1 && u[1].trim() === acc) return true;
          return false;
        });
        
        const famAcc1Seq = acc1 ? findByAcc(acc1) : undefined;
        const famAcc2Seq = acc2 ? findByAcc(acc2) : undefined;
        
        // Load conservation data for GPCRdb mapping (if acc2 exists)
        const conservationData: Record<string, string> = {}; // residue_number -> gpcrdb_number
        if (famAcc2Seq) {
          try {
            const parts = famAcc2Seq.header.split('|');
            if (parts.length > 2) {
              const geneName = parts[2].trim().split('_')[0];
              const conservationResponse = await fetch(`/conservation_files/${geneName}_conservation.txt`);
              if (conservationResponse.ok) {
                const conservationText = await conservationResponse.text();
                conservationText.split('\n').forEach(line => {
                  const parts = line.split('\t');
                  if (parts[0] && parts[0].trim().toLowerCase() !== 'residue_number' && parts.length >= 6) {
                    const resNum = parts[0].trim();
                    const gpcrdb = parts[5].trim();
                    conservationData[resNum] = gpcrdb;
                  }
                });
              }
            }
          } catch (error) {
            console.warn(`Could not load conservation data for ${name}:`, error);
          }
        }
        
        // Build mapping: acc1_residue_position → family_alignment_column
        // This maps which family column corresponds to each acc1 residue position
        const acc1ResiduePosToFamCol: Record<number, number> = {};
        
        if (supRepSeq && famAcc1Seq) {
          // Extract ranges for both acc1 sequences
          const famRange = extractSeqRange(famAcc1Seq.header);
          const famOffset = famRange ? famRange.start - 1 : 0;
          
          // For each column in family alignment, track which real residue it corresponds to
          let famResCount = 0;
          for (let famCol = 0; famCol < famAcc1Seq.sequence.length; famCol++) {
            if (famAcc1Seq.sequence[famCol] !== '-') {
              famResCount++;
              const realRes = famOffset + famResCount;
              // Store: real residue number → family column
              acc1ResiduePosToFamCol[realRes] = famCol;
            }
          }
        }

        // Build acc2 residue map for GPCRdb labels
        let acc2ResidueMap: Record<number, number> | null = null;
        if (famAcc2Seq) {
          const acc2Range = extractSeqRange(famAcc2Seq.header);
          const acc2Offset = acc2Range ? acc2Range.start - 1 : 0;
          
          acc2ResidueMap = {};
          let running = 0;
          for (let i = 0; i < famAcc2Seq.sequence.length; i++) {
            const aa = famAcc2Seq.sequence[i];
            if (aa !== '-') {
              running++;
              acc2ResidueMap[i] = acc2Offset + running;
            } else {
              acc2ResidueMap[i] = 0;
            }
          }
        }

        // Process based on acc1 positions (from sup_reps) - include ALL columns even gaps
        const sequences = entry.sequences.map(s => s.sequence);
          const positionData: Record<number, PositionLogoData> = {};

        if (supRepSeq) {
          // Walk through ENTIRE sup_reps acc1 sequence (including gaps)
          const supRange = extractSeqRange(supRepSeq.header);
          const supOffset = supRange ? supRange.start - 1 : 0;
          
          let resCount = 0;
          for (let supCol = 0; supCol < supRepSeq.sequence.length; supCol++) {
            const aa = supRepSeq.sequence[supCol];
            
            if (aa === '-') {
              // Gap in acc1 - store empty position data to maintain alignment
              positionData[supCol] = {
                position: supCol + 1,
                msaColumn: supCol,
                residueCounts: {},
                totalSequences: 0,
                informationContent: 0,
                letterHeights: {},
                matchPercentage: 0,
                mostConservedAA: '-',
                matchCounts: {}
              };
            } else {
              // Residue in acc1
              resCount++;
              const realResNum = supOffset + resCount;
              
              // Find corresponding family column
              const famCol = acc1ResiduePosToFamCol[realResNum];
              
              if (famCol !== undefined) {
                // Calculate logo from family alignment at this column
                const calculatedData = calculateEnhancedPositionLogoData(famCol, sequences);
                
                // Get GPCRdb label: acc2 residue number -> conservation data lookup
                let gpcrFromAcc2: string | undefined = undefined;
                if (acc2ResidueMap && acc2ResidueMap[famCol]) {
                  const acc2ResNum = String(acc2ResidueMap[famCol]);
                  gpcrFromAcc2 = conservationData[acc2ResNum] || undefined;
                }
                
                // Store at sup_reps column position
                positionData[supCol] = {
                  position: supCol + 1,
                  msaColumn: supCol,
                residueCounts: calculatedData.residueCounts,
                totalSequences: calculatedData.totalSequences,
                informationContent: calculatedData.informationContent,
                letterHeights: calculatedData.letterHeights,
                matchPercentage: calculatedData.matchPercentage,
                mostConservedAA: calculatedData.mostConservedAA,
                  matchCounts: calculatedData.matchCounts,
                  gpcrdb: gpcrFromAcc2 || undefined
                };
              } else {
                // No family data for this acc1 position - store empty
                positionData[supCol] = {
                  position: supCol + 1,
                  msaColumn: supCol,
                  residueCounts: {},
                  totalSequences: 0,
                  informationContent: 0,
                  letterHeights: {},
                  matchPercentage: 0,
                  mostConservedAA: '-',
                  matchCounts: {}
                };
              }
            }
            
            globalMaxPosition = Math.max(globalMaxPosition, supCol);
            }
          }

          alignmentPositionData[name] = positionData;
        };

      // Process all alignments
      for (const name of selectedAlignments) {
        await processAlignment(name);
      }
      
      // Process class-wide alignments using pre-loaded data (same as custom alignments)
      const processClassAlignment = async (className: string) => {
        try {
          // Use pre-loaded data instead of fetching
          const classData = classWideData[className];
          if (!classData) {
            console.warn(`Pre-loaded data not found for ${className}`);
            return;
          }

          // Find representative sequence from sup_reps using acc1
          const familyKey = classToFamilyKey[className];
          const acc1 = familyKey ? familyToAcc1[familyKey] : undefined;
          
          if (!acc1) {
            console.warn(`No acc1 mapping found for ${className}`);
            return;
          }
          
          // Find sequence by acc1 accession
          const representativeSeq = humanRefSequences.find(seq => {
            const parts1 = seq.header.split('|');
            const seqAcc = parts1.length > 1 ? parts1[1].trim() : seq.header.split('_')[1]?.trim();
            return seqAcc === acc1;
          });
          
          if (!representativeSeq) {
            console.warn(`Representative sequence with acc1=${acc1} not found in sup_reps for ${className}`);
            return;
          }

          // Use pre-loaded family sequences
          const familySequences = classData.familySequences;
          
          // Find representative sequence in family alignment by acc1
          const familyRepSeq = familySequences.find(seq => {
            if (seq.header.includes(acc1)) return true;
            const p = seq.header.split('|');
            if (p.length > 1 && p[1].trim() === acc1) return true;
            const u = seq.header.split('_');
            if (u.length > 1 && u[1].trim() === acc1) return true;
            return false;
          });
          
          if (!familyRepSeq) {
            console.warn(`Representative sequence with acc1=${acc1} not found in family alignment`);
            return;
          }

          // Use pre-loaded conservation data
          const conservationData = classData.conservationData;

          // Build acc1→acc2 residue mapping for GPCRdb lookups
          const acc2 = familyKey ? familyToAcc2[familyKey] : undefined;
          const acc1ToAcc2ResMap: Record<number, number> = {};
          
          if (acc2) {
            const findByAcc = (acc: string) => familySequences.find(s => {
              if (s.header.includes(acc)) return true;
              const p = s.header.split('|');
              if (p.length > 1 && p[1].trim() === acc) return true;
              const u = s.header.split('_');
              if (u.length > 1 && u[1].trim() === acc) return true;
              return false;
            });
            
            const famAcc2Seq = findByAcc(acc2);
            
            if (famAcc2Seq && familyRepSeq) {
              const acc1Range = extractSeqRange(familyRepSeq.header);
              const acc2Range = extractSeqRange(famAcc2Seq.header);
              const acc1Offset = acc1Range ? acc1Range.start - 1 : 0;
              const acc2Offset = acc2Range ? acc2Range.start - 1 : 0;
              
              let acc1Running = 0;
              let acc2Running = 0;
              const familyLen = Math.max(familyRepSeq.sequence.length, famAcc2Seq.sequence.length);
              
              for (let famCol = 0; famCol < familyLen; famCol++) {
                const aa1 = familyRepSeq.sequence[famCol] || '-';
                const aa2 = famAcc2Seq.sequence[famCol] || '-';
                
                if (aa1 !== '-') acc1Running++;
                if (aa2 !== '-') acc2Running++;
                
                if (aa1 !== '-' && aa2 !== '-') {
                  const realAcc1Res = acc1Offset + acc1Running;
                  const realAcc2Res = acc2Offset + acc2Running;
                  acc1ToAcc2ResMap[realAcc1Res] = realAcc2Res;
                }
              }
            }
          }

          console.log(`\n=== Processing ${className} alignment ===`);
          console.log(`Representative acc1: ${acc1}`);
          console.log(`Sup_reps sequence length: ${representativeSeq.sequence.length}`);
          console.log(`Family alignment sequence length: ${familyRepSeq.sequence.length}`);
          
          // For class-wide alignments, use sup_reps positions directly
          const visualizedDisplayPositions: Record<number, number> = {}; // supRepCol -> residueNumber
          
          console.log('\n--- Generating positions from sup_reps for class-wide alignment ---');
          
          // Generate positions from sup_reps (our universal coordinate system)
          // Extract sup_reps range offset
          const supRange = extractSeqRange(representativeSeq.header);
          const supOffset = supRange ? supRange.start - 1 : 0;
          
          let supResCount = 0;
          for (let supCol = 0; supCol < representativeSeq.sequence.length; supCol++) {
            if (representativeSeq.sequence[supCol] !== '-') {
              supResCount++;
              const realResidueNum = supOffset + supResCount;
              visualizedDisplayPositions[supCol] = realResidueNum;
              console.log(`  Sup_reps col ${supCol} → real residue #${realResidueNum} (AA: ${representativeSeq.sequence[supCol]})`);
            }
          }

          console.log(`\nVisualized positions:`, Object.entries(visualizedDisplayPositions).map(([pos, res]) => `pos${pos}→res#${res}`).join(', '));

          // Use family alignment sequences for logo generation
          const sequences = familySequences.map(s => s.sequence);
          const positionData: Record<number, PositionLogoData> = {};

          console.log('\n--- Mapping to family alignment columns ---');
          
          // For each sup_reps position that will be visualized
          Object.entries(visualizedDisplayPositions).forEach(([supColStr, realResidueNum]) => {
            const supCol = parseInt(supColStr);
            console.log(`\nMapping sup_reps col ${supCol} (real residue #${realResidueNum}):`);
            
            // Find the family alignment column for this REAL residue number
            // Extract family acc1 range offset
            const famRange = extractSeqRange(familyRepSeq.header);
            const famOffset = famRange ? famRange.start - 1 : 0;
            
            let familyCol = -1;
            let famResCount = 0;
            
            for (let i = 0; i < familyRepSeq.sequence.length; i++) {
              if (familyRepSeq.sequence[i] !== '-') {
                famResCount++;
                const famRealRes = famOffset + famResCount;
                if (famRealRes === realResidueNum) {
                  familyCol = i;
                  console.log(`  Found real residue #${realResidueNum} at family col ${familyCol} (AA: ${familyRepSeq.sequence[i]})`);
                  break;
                }
              }
            }

            if (familyCol === -1) {
              console.warn(`  ❌ Could not find family alignment column for real residue ${realResidueNum}`);
              return;
            }

            // Extract column from family alignment
            const familyColumnSequences = sequences.map(seq => seq[familyCol] || '-');
            const uniqueAAs = [...new Set(familyColumnSequences.filter(aa => aa !== '-'))];
            console.log(`  Family col ${familyCol} diversity: [${uniqueAAs.join(', ')}] (${familyColumnSequences.filter(aa => aa !== '-').length}/${familyColumnSequences.length} non-gaps)`);
            
            // Since familyColumnSequences is already extracted column data, use position 0
            const calculatedData = calculateEnhancedPositionLogoData(0, familyColumnSequences);
            
            const hasMeaningfulData = calculatedData.informationContent > 0 || 
                                     (calculatedData.matchPercentage && calculatedData.matchPercentage > 0) ||
                                     Object.keys(calculatedData.letterHeights).length > 0;
            
            console.log(`  Logo data - IC: ${calculatedData.informationContent.toFixed(3)}, meaningful: ${hasMeaningfulData}`);
            
            if (calculatedData.totalSequences > 0 && hasMeaningfulData) {
              // Get GPCRdb number from conservation data
              // Map acc1 real residue to acc2 real residue, then look up conservation
              const acc2ResNum = acc1ToAcc2ResMap[realResidueNum] || realResidueNum;
              const consData = conservationData[acc2ResNum.toString()];
              const gpcrdb = consData?.gpcrdb || acc2ResNum.toString();
              
              console.log(`  GPCRdb: acc1 real res #${realResidueNum} → acc2 real res #${acc2ResNum} → "${gpcrdb}"`);
              
              // Store at sup_reps column position for aligned visualization
              positionData[supCol] = {
                position: supCol + 1,
                msaColumn: supCol,
                residueCounts: calculatedData.residueCounts,
                totalSequences: calculatedData.totalSequences,
                informationContent: calculatedData.informationContent,
                letterHeights: calculatedData.letterHeights,
                matchPercentage: calculatedData.matchPercentage,
                mostConservedAA: calculatedData.mostConservedAA,
                matchCounts: calculatedData.matchCounts,
                gpcrdb: gpcrdb
              };
              
              console.log(`  ✅ Created logo for sup_reps col ${supCol} (was family col ${familyCol})`);
            } else {
              console.log(`  ⚠️ Skipping - no meaningful data`);
            }
          });

          console.log(`\n${className} final position data keys: [${Object.keys(positionData).join(', ')}]`);
          console.log(`=== End ${className} processing ===\n`);

          alignmentPositionData[className] = positionData;
          
          // Update globalMaxPosition for class-wide alignments
          if (Object.keys(positionData).length > 0) {
            const maxPos = Math.max(...Object.keys(positionData).map(Number));
            globalMaxPosition = Math.max(globalMaxPosition, maxPos + 1); // +1 because positions are 0-based
            console.log(`Updated globalMaxPosition to ${globalMaxPosition} for ${className}`);
          }
        } catch (error) {
          console.error(`Error processing class alignment ${className}:`, error);
        }
      };

      // Process all class-wide alignments
      for (const className of selectedClassAlignments) {
        await processClassAlignment(className);
      }
      
      // Continue with existing cross-alignment conservation logic...
      // Calculate cross-alignment conservation for all positions
      const crossAlignmentConservation: Record<number, { 
        matchPercentage: number; 
        data: {
          matchPercentage: number;
          mostConservedAA: string;
          alignmentAAs: Record<string, string>;
          matchCount: number;
          totalAlignments: number;
        };
      }> = {};
      
      for (let pos = 0; pos < globalMaxPosition; pos++) {
        const crossConservation = calculateCrossAlignmentConservation(pos, alignmentPositionData);
        crossAlignmentConservation[pos] = {
          matchPercentage: crossConservation.matchPercentage,
          data: crossConservation
        };
      }

      // Build final data with all positions, marking those below threshold for blurring
      const processedAlignmentData: Record<string, Record<number, PositionLogoData>> = {};
      // Use selection order to maintain user's preferred ordering, but ensure all selected alignments are included
      const allSelected = [...selectedAlignments, ...selectedClassAlignments];
      const allSelectedAlignments = allSelected; // Order maintained by parent
      
      // Pre-filter positions based on conservation criteria
      let allowedPositions = new Set<number>();
      for (let pos = 0; pos < globalMaxPosition; pos++) {
        // Check if all alignments have gaps at this position
        const allGaps = allSelectedAlignments.every(alignmentName => {
          const d = alignmentPositionData[alignmentName]?.[pos];
          if (!d) return true;
          const counts = d.residueCounts || {};
          return Object.keys(counts).length === 0;
        });
        
        if (allGaps) {
          continue; // Skip gap-only columns
        }
        
        // Conservation filtering: Check if enough families meet the conservation threshold
        if (minConservationThreshold > 0 && minFamiliesCount > 0) {
          let familiesAboveThreshold = 0;
          
          allSelectedAlignments.forEach(alignmentName => {
            const posData = alignmentPositionData[alignmentName]?.[pos];
            if (posData && posData.residueCounts) {
              const totalSequences = posData.totalSequences || 0;
              if (totalSequences > 0) {
                const maxCount = Math.max(...Object.values(posData.residueCounts));
                const conservationPercentage = (maxCount / totalSequences) * 100;
                
                if (conservationPercentage >= minConservationThreshold) {
                  familiesAboveThreshold++;
                }
              }
            }
          });
          
          // Only allow this position if enough families meet the conservation threshold
          if (familiesAboveThreshold >= minFamiliesCount) {
            allowedPositions.add(pos);
          }
        } else {
          // No conservation filtering, allow all non-gap positions
          allowedPositions.add(pos);
        }
      }
      // If external filteredPositions provided, intersect to only those positions
      if (filteredPositions && filteredPositions.length > 0) {
        const externalSet = new Set<number>(filteredPositions);
        allowedPositions = new Set(Array.from(allowedPositions).filter(p => externalSet.has(p)));
      }

      allSelectedAlignments.forEach(name => {
        const positionData = alignmentPositionData[name] || {};
        const processedPositions: Record<number, PositionLogoData> = {};
        
        // Include only pre-filtered positions
        for (const pos of allowedPositions) {
          // Check if this position has data in any alignment
          const hasDataInAnyAlignment = allSelectedAlignments.some(alignmentName => 
            alignmentPositionData[alignmentName]?.[pos]
          );
          
          if (hasDataInAnyAlignment) {
            const currentPositionData = positionData[pos];
            const crossConservation = crossAlignmentConservation[pos];
            
            if (currentPositionData) {
              // Position has data in this alignment
              const shouldBlur = useSimpleConservation ? 
                crossConservation.matchPercentage < conservationThreshold :
                false; // For entropy method, we could add similar logic if needed
              
              processedPositions[pos] = {
                ...currentPositionData,
                msaColumn: pos, // Ensure MSA column is preserved
                crossAlignmentData: {
                  alignmentAAs: crossConservation.data.alignmentAAs,
                  matchCount: crossConservation.data.matchCount,
                  totalAlignments: crossConservation.data.totalAlignments,
                  conservationPercentage: crossConservation.matchPercentage,
                  shouldBlur
                }
              };
            } else {
              // Position doesn't have data in this alignment, create empty placeholder
              processedPositions[pos] = {
                position: pos + 1,
                msaColumn: pos, // Original MSA column position (0-based)
                residueCounts: {},
                totalSequences: 0,
                informationContent: 0,
                letterHeights: {},
                crossAlignmentData: {
                  alignmentAAs: crossConservation.data.alignmentAAs,
                  matchCount: crossConservation.data.matchCount,
                  totalAlignments: crossConservation.data.totalAlignments,
                  conservationPercentage: crossConservation.matchPercentage,
                  shouldBlur: useSimpleConservation ? 
                    crossConservation.matchPercentage < conservationThreshold : false
                }
              };
            }
          }
        }
        
        processedAlignmentData[name] = processedPositions;
      });

      // Build final logo data
      const finalData = allSelectedAlignments.map(name => {
        const positionData = processedAlignmentData[name] || {};
        const logoData: PositionLogoData[] = [];

        // Get all positions and sort them
        const allPositions = Object.keys(positionData).map(Number).sort((a, b) => a - b);

        const positionsToInclude = allPositions;
        
        positionsToInclude.forEach((pos, index) => {
          const data = positionData[pos];
          logoData.push({
            ...data,
            position: index + 1 // Consecutive numbering for display
          });
        });

        return { receptorName: name, logoData };
      });

      setProcessedReceptorData(finalData);
      console.log('✅ Data processing complete:', finalData.length, 'alignments processed');
    };

    processData();
  }, [
    dataLoaded, 
    allData, 
    selectedAlignments, 
    selectedClassAlignments, 
    calculateEnhancedPositionLogoData, 
    conservationThreshold, 
    useSimpleConservation, 
    calculateCrossAlignmentConservation, 
    minConservationThreshold,
    minFamiliesCount,
    referenceMaps, 
    humanRefSequences,
    classWideData,
    classDataLoaded,
    familyToAcc1,
    familyToAcc2,
    supRepSequences,
    folder
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

    const fileName = `custom_sequence_logo.svg`;
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
    a.download = 'custom_sequence_logo.eps';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Track previous data to avoid unnecessary rebuilds
  const [previousDataHash, setPreviousDataHash] = useState<string>('');

  // Render chart
  useEffect(() => {
    const yAxisContainer = yAxisContainerRef.current;
    const chartContainer = chartContainerRef.current;

    if (!yAxisContainer || !chartContainer) return;

    if (!dataLoaded || (selectedAlignments.length === 0 && selectedClassAlignments.length === 0)) {
      // Clear chart when no selections
      const oldTooltips = document.querySelectorAll('.logo-tooltip');
      oldTooltips.forEach(tooltip => tooltip.remove());
      yAxisContainer.innerHTML = '';
      chartContainer.innerHTML = '';
      setPreviousDataHash('');
      return;
    }

    const receptorData = processedReceptorData;
    if (!receptorData.length || !receptorData.some(d => d.logoData.length > 0)) return;

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
    if (currentDataHash !== previousDataHash) {
      console.log('Data changed, rebuilding chart...');
      
      // Clean up
      const oldTooltips = document.querySelectorAll('.logo-tooltip');
      oldTooltips.forEach(tooltip => tooltip.remove());

      yAxisContainer.innerHTML = '';
      chartContainer.innerHTML = '';

      renderChart(receptorData);
      setPreviousDataHash(currentDataHash);
    } else {
      console.log('Data unchanged, skipping chart rebuild');
    }

    function renderChart(data: ReceptorLogoData[]) {
      if (!yAxisContainer || !chartContainer) return;

      const margin = { top: 20, right: 20, bottom: 20, left: 20 };
      const groupLabelWidth = 50; // Space for group labels on the left
      const yAxisWidth = 120 + groupLabelWidth; // Increased to accommodate group labels
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
        // Detect protein regions based on GPCRdb numbering
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
        
        let currentRegion: string | null = null;
        let regionStart = -1;
        
        positionsWithData.forEach((pos, index) => {
          // Get the MSA column for this display position
          const msaCol = allPositionsWithMsa.get(pos);
          if (msaCol === undefined) return;
          
          // Get GPCRdb numbers for this MSA column across all reference rows
          const gpcrdbNumbers = referenceInfo.map(ref => ref.gpcrdbMap[msaCol] || '').filter(n => n && n.includes('x'));
          
          if (gpcrdbNumbers.length === 0) {
            // No GPCRdb numbers, end current region
            if (currentRegion && regionStart >= 0) {
              proteinRegions.push({start: regionStart, end: index - 1, label: currentRegion});
            }
            currentRegion = null;
            regionStart = -1;
            return;
          }
          
          // Extract the region prefix (before 'x') from all GPCRdb numbers
          const regionPrefixes = gpcrdbNumbers.map(n => n.split('x')[0]).filter(p => p);
          
          if (regionPrefixes.length === 0) {
            // No valid prefixes, end current region
            if (currentRegion && regionStart >= 0) {
              proteinRegions.push({start: regionStart, end: index - 1, label: currentRegion});
            }
            currentRegion = null;
            regionStart = -1;
            return;
          }
          
          // Check if all prefixes are the same
          const allSame = regionPrefixes.every(p => p === regionPrefixes[0]);
          
          if (!allSame) {
            // Conflicting regions, end current region
            if (currentRegion && regionStart >= 0) {
              proteinRegions.push({start: regionStart, end: index - 1, label: currentRegion});
            }
            currentRegion = null;
            regionStart = -1;
            return;
          }
          
          // All agree on the same region prefix
          const prefix = regionPrefixes[0];
          const regionLabel = regionMap[prefix];
          
          if (!regionLabel) {
            // Unknown region, end current region
            if (currentRegion && regionStart >= 0) {
              proteinRegions.push({start: regionStart, end: index - 1, label: currentRegion});
            }
            currentRegion = null;
            regionStart = -1;
            return;
          }
          
          if (currentRegion === regionLabel) {
            // Continue current region
            return;
          } else {
            // New region starts
            if (currentRegion && regionStart >= 0) {
              proteinRegions.push({start: regionStart, end: index - 1, label: currentRegion});
            }
            currentRegion = regionLabel;
            regionStart = index;
          }
        });
        
        // Close any remaining region
        if (currentRegion && regionStart >= 0) {
          proteinRegions.push({start: regionStart, end: positionsWithData.length - 1, label: currentRegion});
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
          .attr('x', yAxisWidth - 10) // Position after group labels
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
          .attr('transform', `translate(${yAxisWidth - 1}, ${receptorY})`)
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
          const firstIndex = Math.min(...groupReceptorIndices);
          const lastIndex = Math.max(...groupReceptorIndices);
          
          // Calculate Y positions to span the full height of the group rows
          const groupStartY = margin.top + firstIndex * (logoAreaHeight + gapBetweenReceptors);
          const groupEndY = margin.top + lastIndex * (logoAreaHeight + gapBetweenReceptors) + logoAreaHeight;
          const groupCenterY = (groupStartY + groupEndY) / 2;
          
          // Draw vertical line spanning the full height of the group rows
          const lineX = yAxisWidth - 80; // Position line closer to row labels
          yAxisSvg.append('line')
            .attr('x1', lineX)
            .attr('y1', groupStartY)
            .attr('x2', lineX)
            .attr('y2', groupEndY)
            .attr('stroke', '#666')
            .attr('stroke-width', 2)
            .attr('class', 'text-foreground stroke-current');
          
          // Draw vertical text label (larger than row labels, positioned near the line)
          const textX = lineX - 20;
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
                  // Fallback to text
                  chartSvg
                    .append('text')
                    .attr('x', letterX)
                    .attr('y', letterBaselineY)
                    .attr('text-anchor', 'middle')
                    .attr('font-family', 'Helvetica')
                    .attr('font-weight', 'bold')
                    .attr('font-size', 12)
                    .attr('transform', `scale(1, ${letterHeightPx / 16}) translate(0, -1)`)
                    .attr('fill', getResidueColor(residue))
                    .text(residue)
                    .style('cursor', 'pointer')
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
      setTooltip(prev => ({ ...prev, visible: false }));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dataLoaded, 
    selectedAlignments, 
    selectedClassAlignments, 
    processedReceptorData, 
    rowHeight, 
    gapBetweenReceptors,
    minConservationThreshold,
    minFamiliesCount,
    showReferenceRows,
    showProteinRegions,
    referenceDataLoaded,
    referenceInfo,
    referenceMaps,
    previousDataHash,
    // Stable function references - these rarely change
    getResidueColor, 
    loadCustomSvgLetter, 
    showTooltip, 
    hideTooltip, 
    updateTooltipPosition,
    getDisplayName,
    getPlotDisplayName,
    receptorGroups
    // Note: manualClassifications is tracked via the hash (previousDataHash) to avoid reference issues
  ]);

  // Keep chart mounted during loading/processing; show non-blocking overlay instead

  return (
    <div className="max-w-7xl mx-auto">
      {/* Controls - simplified, main controls moved to parent */}
      <div className="flex items-center gap-2 mb-6">
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

      {/* Chart container placeholder (SVGs rendered via d3) */}
      <div className="relative w-full overflow-hidden mb-4 rounded-md bg-transparent">
        {selectedAlignments.length === 0 && selectedClassAlignments.length === 0 && (
          <div className="w-full text-center py-12 text-muted-foreground">
            <p className="text-lg">Select families from the controls above to generate sequence logos</p>
          </div>
        )}
        <div ref={yAxisContainerRef} className="absolute left-0 top-0 z-10 bg-transparent" />
        <div className="overflow-x-auto overflow-y-hidden pl-[80px]">
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

export default CustomSequenceLogo; 