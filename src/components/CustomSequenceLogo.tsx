'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as d3 from 'd3';
import { Button } from '@/components/ui/button';
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
const classToRepresentative: Record<string, string> = {
  'ClassA': 'HRH2',
  'ClassB1': 'PTH1R',
  'ClassB2': 'AGRL3', 
  'ClassC': 'CASR',
  'ClassF': 'FZD7',
  'ClassT': 'T2R39',
  'ClassOlf': 'O52I2',
  'GP157': 'GP157',
  'GP143': 'GP143'
};



const CustomSequenceLogo: React.FC<Props> = ({ fastaNames, folder }) => {
  const yAxisContainerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [allData, setAllData] = useState<{
    name: string;
    sequences: Sequence[];
  }[]>([]);
  
  // State for selected alignments (maintains order of selection)
  const [selectedAlignments, setSelectedAlignments] = useState<string[]>([]);
  
  // State for row height control
  const [rowHeight, setRowHeight] = useState(120);
  
  // State for conservation threshold (as percentage)
  const [conservationThreshold, setConservationThreshold] = useState(0);

  // State for dot-plot (UpSet) per-row minimum conservation (% frequency of top AA)
  const [dotMinConservation, setDotMinConservation] = useState(0);

  // State: minimum number of overlapping rows required to keep a column visible
  const [overlapMinRows, setOverlapMinRows] = useState(1);

  // State: hide masked columns completely
  const [hideMaskedColumns, setHideMaskedColumns] = useState(false);

  // State for gap between receptor rows
  const [gapBetweenReceptors, setGapBetweenReceptors] = useState(10);

  // State for class-wide alignments
  const [selectedClassAlignments, setSelectedClassAlignments] = useState<string[]>([]);
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
  
  // State to track selection order (both custom and class-wide)
  const [selectionOrder, setSelectionOrder] = useState<string[]>([]);

  /* ─── NEW: HRH2 residue filter ──────────────────────────────── */
  // Raw text entered by the user
  const [filterInput, setFilterInput] = useState('');
  // Parsed, active tokens (upper-cased) used for filtering
  const [filterTokens, setFilterTokens] = useState<string[]>([]);
  // Mapping residue number → GPCRdb number for HRH2
  const [hrh2ResToGpcrdb, setHrh2ResToGpcrdb] = useState<Record<string, string>>({});

  // Apply the filter whenever the user presses Enter / clicks the button
  const applyFilter = useCallback(() => {
    const inputTokens = filterInput
      .split(',')
      .map(t => t.trim().toUpperCase())
      .filter(t => t.length > 0);

    const combined: string[] = [];
    inputTokens.forEach(tok => {
      combined.push(tok); // original residue number
      const gpcr = hrh2ResToGpcrdb[tok];
      if (gpcr) {
        combined.push(gpcr.toUpperCase());
      }
    });

    // Deduplicate
    const unique = Array.from(new Set(combined));
    setFilterTokens(unique);
  }, [filterInput, hrh2ResToGpcrdb]);

  // Clear the current filter
  const clearFilter = () => {
    setFilterInput('');
    setFilterTokens([]);
  };

  /* ─── Reference GPCRdb info rows ─────────────────────────────── */
  const [showReferenceRows, setShowReferenceRows] = useState(false);
  const [referenceDataLoaded, setReferenceDataLoaded] = useState(false);
  // Map geneName → gpcrdb string array (indexed by alignment column, 0-based)
  const [referenceMaps, setReferenceMaps] = useState<Record<string, string[]>>({});

  // Computed array for current selection (order fixed by class mapping)
  const classReferenceOrder = ['ClassA', 'ClassT', 'ClassB1', 'ClassB2', 'ClassC', 'ClassF', 'ClassOlf', 'GP157', 'GP143'] as const;
  type ClassKey = typeof classReferenceOrder[number];
  const classToGene: Record<ClassKey, string> = {
    ClassA: 'HRH2',
    ClassT: 'T2R39',
    ClassB1: 'PTH1R',
    ClassB2: 'AGRL3',
    ClassC: 'CASR',
    ClassF: 'FZD7',
    ClassOlf: 'O52I2',
    GP157: 'GP157',
    GP143: 'GP143',
  };
  const [referenceInfo, setReferenceInfo] = useState<{ geneName: string; gpcrdbMap: string[] }[]>([]);

  // (Column width slider removed – fixed width used)
  
  // State for conservation method
  const [useSimpleConservation, setUseSimpleConservation] = useState(false);
  
  // State for tooltip
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    content: string;
  }>({ visible: false, x: 0, y: 0, content: '' });

  // State for processed receptor data
  const [processedReceptorData, setProcessedReceptorData] = useState<ReceptorLogoData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

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

  // Checkbox selection functions
  const handleAlignmentToggle = (alignmentName: string) => {
    setSelectedAlignments(prev => {
      if (prev.includes(alignmentName)) {
        // Remove from selection
        return prev.filter(name => name !== alignmentName);
      } else {
        // Add to selection in order
        return [...prev, alignmentName];
      }
    });
    
    // Update selection order
    setSelectionOrder(prev => {
      if (prev.includes(alignmentName)) {
        // Remove from selection order
        return prev.filter(name => name !== alignmentName);
      } else {
        // Add to selection order
        return [...prev, alignmentName];
      }
    });
  };

  const selectAll = () => {
    setSelectedAlignments([...fastaNames]);
    setSelectionOrder(prev => [...prev.filter(name => !fastaNames.includes(name)), ...fastaNames]);
  };

  const selectNone = () => {
    setSelectedAlignments([]);
    setSelectionOrder(prev => prev.filter(name => !fastaNames.includes(name)));
  };

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
        // Load sequences
        const fastaRes = await fetch('/custom_msa/human_refs.fasta');
        if (!fastaRes.ok) {
          console.warn('Failed to load human_refs.fasta:', fastaRes.status);
          return;
        }
        const fastaText = await fastaRes.text();
        const refSeqsArr = parseFasta(fastaText);
        const seqMap: Record<string, Sequence> = {};
        refSeqsArr.forEach(seqObj => {
          const headerPart = seqObj.header.split('|')[2] || seqObj.header;
          const geneNameToken = headerPart.trim().split(' ')[0];
          const geneName = geneNameToken.split('_')[0];
          seqMap[geneName.toUpperCase()] = seqObj;
        });

        // Load receptors metadata
        const recRes = await fetch('/receptors.json');
        if (!recRes.ok) {
          console.warn('Failed to load receptors.json:', recRes.status);
          return;
        }
        const receptorsList: ReceptorEntry[] = await recRes.json();

        // Build mapping of geneName → conservation file path
        const geneToConsFile: Record<string, string> = {};
        receptorsList.forEach(rec => {
          geneToConsFile[rec.geneName.toUpperCase()] = rec.conservationFile;
        });

        // For every reference gene we have sequence for, load conservation data once
        const maps: Record<string, string[]> = {};
        await Promise.all(Object.keys(seqMap).map(async gene => {
          const seqObj = seqMap[gene];
          const consFile = geneToConsFile[gene];
          const seq = seqObj.sequence;
          
          if (consFile) {
            try {
              const consData = await readConservationData(`/${consFile}`);
              
              // Create GPCRdb map for this gene's sequence
              // The map should be indexed by MSA column position (0-based)
              const gpcrdbMap: string[] = new Array(seq.length).fill('');
              
              // For each MSA column, determine the corresponding GPCRdb number
              for (let msaCol = 0; msaCol < seq.length; msaCol++) {
                const aa = seq[msaCol];
                if (aa !== '-') {
                  // This is a real residue, calculate its position in the ungapped sequence
                  let residueNumber = 0;
                  for (let i = 0; i <= msaCol; i++) {
                    if (seq[i] !== '-') {
                      residueNumber++;
                    }
                  }
                  
                  // Get GPCRdb number from conservation data
                  const residueData = consData[residueNumber.toString()];
                  if (residueData && residueData.gpcrdb) {
                    gpcrdbMap[msaCol] = residueData.gpcrdb;
                  } else {
                    // Fallback to residue number if GPCRdb not found
                    gpcrdbMap[msaCol] = residueNumber.toString();
                  }
                } else {
                  // Gap in alignment - no GPCRdb number
                  gpcrdbMap[msaCol] = '';
                }
              }
              
              maps[gene] = gpcrdbMap;

              // Store HRH2 residue→gpcrdb mapping for filter use
              if (gene === 'HRH2') {
                const mapping: Record<string, string> = {};
                type ConsEntry = { gpcrdb?: string };
                const typedCons = consData as Record<string, ConsEntry>;
                Object.entries(typedCons).forEach(([resNum, d]) => {
                  const gpcr = d.gpcrdb || '';
                  if (gpcr) {
                    mapping[resNum.toUpperCase()] = gpcr.toUpperCase();
                  }
                });
                setHrh2ResToGpcrdb(mapping);
              }
            } catch (err) {
              console.warn('Error loading conservation data for', gene, err);
              // Create empty map as fallback
              maps[gene] = new Array(seq.length).fill('');
            }
          } else {
            // No conservation file found, create empty map
            maps[gene] = new Array(seq.length).fill('');
          }
        }));

        setReferenceMaps(maps);
        setReferenceDataLoaded(true);
      } catch (err) {
        console.error('Error loading references:', err);
      }
    })();
  }, []);

  /* ─── Compute referenceInfo based on selected alignments ───────── */
  useEffect(() => {
    if (!referenceDataLoaded) return;

    // Determine classes present in selected alignments AND selected class-wide alignments
    const neededGenes: string[] = [];
    
    // Check custom alignments
    selectedAlignments.forEach(name => {
      const match = classReferenceOrder.find(cls => name.startsWith(cls));
      if (match) {
        const gene = classToGene[match];
        if (gene && !neededGenes.includes(gene.toUpperCase())) {
          neededGenes.push(gene.toUpperCase());
        }
      }
    });

    // Check class-wide alignments
    selectedClassAlignments.forEach(className => {
      const match = classReferenceOrder.find(cls => className === cls);
      if (match) {
        const gene = classToGene[match];
        if (gene && !neededGenes.includes(gene.toUpperCase())) {
          neededGenes.push(gene.toUpperCase());
        }
      }
    });

    const newRefInfo: { geneName: string; gpcrdbMap: string[] }[] = [];
    neededGenes.forEach(gene => {
      if (referenceMaps[gene]) {
        newRefInfo.push({ geneName: gene, gpcrdbMap: referenceMaps[gene] });
      }
    });

    setReferenceInfo(newRefInfo);
  }, [selectedAlignments, selectedClassAlignments, referenceDataLoaded, referenceMaps]);

  // Load human reference sequences and pre-load all class-wide alignment data (runs only once)
  useEffect(() => {
    console.log('🔄 useEffect for class-wide data loading triggered - should only run once!');
    const loadAllClassWideData = async () => {
      try {
        console.log('🚀 Pre-loading all class-wide alignment data...');
        
        // Load human reference sequences
        const humanRefResponse = await fetch('/custom_msa/human_refs.fasta');
        if (!humanRefResponse.ok) {
          console.warn('Failed to load human_refs.fasta:', humanRefResponse.status);
          return;
        }
        const humanRefText = await humanRefResponse.text();
        const humanRefSeqs = parseFasta(humanRefText);
        setHumanRefSequences(humanRefSeqs);

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
             const representativeName = classToRepresentative[className];
             const classIdentifier = className.replace('Class', '');
             
             // Load family alignment
             let familyAlignmentPath: string;
             if (className === 'GP157' || className === 'GP143') {
               // Use ortholog alignment files for individual receptors
               familyAlignmentPath = `/alignments/${className}_orthologs_MSA.fasta`;
             } else if (className === 'ClassOlf') {
               // Use olfactory class-wide alignment file
               familyAlignmentPath = `/alignments/classOlfactory_humans_MSA.fasta`;
             } else {
               // Use class-wide alignment files for classes
               familyAlignmentPath = `/alignments/class${classIdentifier}_humans_MSA.fasta`;
             }
             const familyResponse = await fetch(familyAlignmentPath);
             
             if (!familyResponse.ok) {
               console.warn(`Failed to pre-load ${className} family alignment: ${familyResponse.status}`);
               return;
             }
             
             const familyFastaText = await familyResponse.text();
             const familySequences = parseFasta(familyFastaText);
             
             // Load conservation data
             const conservationData: Record<string, {
               conservation: number;
               conservedAA: string;
               aa: string;
               region: string;
               gpcrdb: string;
             }> = {};
            try {
              const conservationResponse = await fetch(`/conservation_files/${representativeName}_conservation.txt`);
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
              console.warn(`Could not pre-load conservation data for ${representativeName}:`, error);
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
   }, []); // Empty dependency array since availableClassAlignments never changes

  // Class alignment selection functions
  const handleClassAlignmentToggle = (className: string) => {
    setSelectedClassAlignments(prev => {
      if (prev.includes(className)) {
        return prev.filter(name => name !== className);
      } else {
        return [...prev, className];
      }
    });
    
    // Update selection order
    setSelectionOrder(prev => {
      if (prev.includes(className)) {
        // Remove from selection order
        return prev.filter(name => name !== className);
      } else {
        // Add to selection order
        return [...prev, className];
      }
    });
  };

  const selectAllClassAlignments = () => {
    setSelectedClassAlignments([...availableClassAlignments]);
    setSelectionOrder(prev => [...prev.filter(name => !availableClassAlignments.includes(name)), ...availableClassAlignments]);
  };

  const selectNoClassAlignments = () => {
    setSelectedClassAlignments([]);
    setSelectionOrder(prev => prev.filter(name => !availableClassAlignments.includes(name)));
  };

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

  // Simple conservation calculation with enhanced matching rules
  const calculateSimpleConservation = useCallback((position: number, sequences: string[]): {
    matchPercentage: number;
    residueCounts: Record<string, number>;
    totalSequences: number;
    mostConservedAA: string;
    matchCounts: Record<string, number>;
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
    if (nonGapSequences === 0) return { 
      matchPercentage: 0, 
      residueCounts: {},
      totalSequences: totalSequencesInAlignment,
      mostConservedAA: '',
      matchCounts: {}
    };

    // Define matching groups
    const matchingGroups = {
      'acidic': ['E', 'D'],
      'aromatic': ['W', 'Y', 'H', 'F'],
      'basic': ['R', 'K'],
      'polar': ['Q', 'N'],
      'hydrophobic_vi': ['V', 'I'],
      'hydrophobic_ml': ['M', 'L']
    };

    // Find the most conserved amino acid
    let mostConservedAA = '';
    let maxCount = 0;
    Object.entries(residueCounts).forEach(([residue, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mostConservedAA = residue;
      }
    });

    // Calculate matches for each amino acid
    const matchCounts: Record<string, number> = {};
    Object.keys(residueCounts).forEach(residue => {
      matchCounts[residue] = residueCounts[residue]; // Exact matches
      
      // Add similar amino acid matches
      for (const [, groupResidues] of Object.entries(matchingGroups)) {
        if (groupResidues.includes(residue)) {
          // Add counts from other residues in the same group
          groupResidues.forEach(otherResidue => {
            if (otherResidue !== residue && residueCounts[otherResidue]) {
              matchCounts[residue] = (matchCounts[residue] || 0) + residueCounts[otherResidue];
            }
          });
          break;
        }
      }
    });

    // Calculate match percentage based on ALL sequences (including gaps)
    const totalMatches = matchCounts[mostConservedAA] || residueCounts[mostConservedAA] || 0;
    const matchPercentage = totalSequencesInAlignment > 0 ? (totalMatches / totalSequencesInAlignment) * 100 : 0;

    return {
      matchPercentage,
      residueCounts,
      totalSequences: totalSequencesInAlignment,
      mostConservedAA,
      matchCounts
    };
  }, []);

  // Enhanced position logo data calculation
  const calculateEnhancedPositionLogoData = useCallback((position: number, sequences: string[]): {
    informationContent: number;
    letterHeights: Record<string, number>;
    residueCounts: Record<string, number>;
    totalSequences: number;
    matchPercentage?: number;
    mostConservedAA?: string;
    matchCounts?: Record<string, number>;
  } => {
    if (useSimpleConservation) {
      const simpleResult = calculateSimpleConservation(position, sequences);
      
      // Create letter heights based on match percentage
      const letterHeights: Record<string, number> = {};
      Object.keys(simpleResult.residueCounts).forEach(residue => {
        const frequency = simpleResult.residueCounts[residue] / simpleResult.totalSequences;
        // Scale height by match percentage (normalized to 0-4.32 range)
        letterHeights[residue] = frequency * (simpleResult.matchPercentage / 100) * 4.32;
      });
      
      return {
        informationContent: (simpleResult.matchPercentage / 100) * 4.32,
        letterHeights,
        residueCounts: simpleResult.residueCounts,
        totalSequences: simpleResult.totalSequences,
        matchPercentage: simpleResult.matchPercentage,
        mostConservedAA: simpleResult.mostConservedAA,
        matchCounts: simpleResult.matchCounts
      };
    } else {
      return calculatePositionLogoData(position, sequences);
    }
  }, [useSimpleConservation, calculatePositionLogoData, calculateSimpleConservation]);

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
      setIsProcessing(true);
      
      /* ── Build HRH2-based filter set, if any ── */
      const filterActive = filterTokens.length > 0 && !!referenceMaps['HRH2'];
      const filterMsaColumns = new Set<number>();
      if (filterActive) {
        const hrh2Map = referenceMaps['HRH2']; // msaCol -> gpcrdb or residue number string
        hrh2Map.forEach((val: string, colIdx: number) => {
          if (!val) return;
          if (filterTokens.includes(val.toUpperCase())) {
            filterMsaColumns.add(colIdx);
          }
        });
      }

      // First pass: collect all possible positions and their data for each alignment
      const alignmentPositionData: Record<string, Record<number, PositionLogoData>> = {};
      let globalMaxPosition = 0;

              // Process custom alignments (existing logic)
        const processAlignment = async (name: string) => {
          const entry = allData.find(d => d.name === name);
          if (!entry || !entry.sequences.length) {
            alignmentPositionData[name] = {};
            return;
          }

          // Use existing logic for custom alignments (no class detection)
          const sequences = entry.sequences.map(s => s.sequence);
          const maxLength = Math.max(...sequences.map(s => s.length));
          globalMaxPosition = Math.max(globalMaxPosition, maxLength);
          
          const positionData: Record<number, PositionLogoData> = {};

          for (let pos = 0; pos < maxLength; pos++) {
            const calculatedData = calculateEnhancedPositionLogoData(pos, sequences);
            
            // Only include positions that have meaningful data
            const hasMeaningfulData = calculatedData.informationContent > 0 || 
                                     (calculatedData.matchPercentage && calculatedData.matchPercentage > 0) ||
                                     Object.keys(calculatedData.letterHeights).length > 0;
            
            if (calculatedData.totalSequences > 0 && hasMeaningfulData) {
              positionData[pos] = {
                position: pos + 1, // 1-based position (will be renumbered later)
                msaColumn: pos, // Original MSA column position (0-based)
                residueCounts: calculatedData.residueCounts,
                totalSequences: calculatedData.totalSequences,
                informationContent: calculatedData.informationContent,
                letterHeights: calculatedData.letterHeights,
                matchPercentage: calculatedData.matchPercentage,
                mostConservedAA: calculatedData.mostConservedAA,
                matchCounts: calculatedData.matchCounts
              };
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

          // Find representative sequence from human refs
          const representativeName = classToRepresentative[className];
          const representativeSeq = humanRefSequences.find(seq => 
            seq.header.includes(`${representativeName}_HUMAN`)
          );
          
          if (!representativeSeq) {
            console.warn(`Representative sequence ${representativeName}_HUMAN not found in human refs`);
            return;
          }

          // Use pre-loaded family sequences
          const familySequences = classData.familySequences;
          
          // Find representative sequence in family alignment
          const familyRepSeq = familySequences.find(seq => 
            seq.header.includes(`${representativeName}_HUMAN`)
          );
          
          if (!familyRepSeq) {
            console.warn(`Representative sequence ${representativeName}_HUMAN not found in family alignment`);
            return;
          }

          // Use pre-loaded conservation data
          const conservationData = classData.conservationData;

          console.log(`\n=== Processing ${className} alignment ===`);
          console.log(`Representative: ${representativeName}_HUMAN`);
          console.log(`Human refs sequence length: ${representativeSeq.sequence.length}`);
          console.log(`Family alignment sequence length: ${familyRepSeq.sequence.length}`);
          
          // For class-wide alignments, generate ALL positions with data (independent of custom alignments)
          const visualizedDisplayPositions: Record<number, number> = {}; // displayPos -> residueNumber
          
          console.log('\n--- Generating all meaningful positions for class-wide alignment ---');
          
          // If there are custom alignments, use their positions
          if (Object.keys(alignmentPositionData).length > 0) {
            console.log('Using positions from existing custom alignments:');
            Object.entries(alignmentPositionData).forEach(([alignmentName, posData]) => {
              console.log(`Checking alignment: ${alignmentName}`);
              Object.keys(posData).forEach(msaColStr => {
                const displayPos = parseInt(msaColStr);
                
                // Find corresponding residue number in human_refs
                let residueNumber = 0;
                for (let i = 0; i <= displayPos && i < representativeSeq.sequence.length; i++) {
                  if (representativeSeq.sequence[i] !== '-') {
                    residueNumber++;
                  }
                }
                
                if (displayPos < representativeSeq.sequence.length && representativeSeq.sequence[displayPos] !== '-') {
                  visualizedDisplayPositions[displayPos] = residueNumber;
                  console.log(`  Display pos ${displayPos} → residue #${residueNumber} (AA: ${representativeSeq.sequence[displayPos]})`);
                }
              });
            });
          } else {
            // No custom alignments - generate ALL meaningful positions from human_refs
            console.log('No custom alignments, generating all positions from human_refs:');
            for (let displayPos = 0; displayPos < representativeSeq.sequence.length; displayPos++) {
              if (representativeSeq.sequence[displayPos] !== '-') {
                let residueNumber = 0;
                for (let i = 0; i <= displayPos; i++) {
                  if (representativeSeq.sequence[i] !== '-') {
                    residueNumber++;
                  }
                }
                visualizedDisplayPositions[displayPos] = residueNumber;
                console.log(`  Display pos ${displayPos} → residue #${residueNumber} (AA: ${representativeSeq.sequence[displayPos]})`);
              }
            }
          }

          console.log(`\nVisualized positions:`, Object.entries(visualizedDisplayPositions).map(([pos, res]) => `pos${pos}→res#${res}`).join(', '));

          // Use family alignment sequences for logo generation
          const sequences = familySequences.map(s => s.sequence);
          const positionData: Record<number, PositionLogoData> = {};

          console.log('\n--- Mapping to family alignment columns ---');
          
          // For each display position that will be visualized
          Object.entries(visualizedDisplayPositions).forEach(([displayPosStr, residueNumber]) => {
            const displayPos = parseInt(displayPosStr);
            console.log(`\nMapping display pos ${displayPos} (residue #${residueNumber}):`);
            
            // Find the MSA column in family alignment for this residue number
            let familyCol = -1;
            let familyResidueCount = 0;
            
            for (let i = 0; i < familyRepSeq.sequence.length; i++) {
              if (familyRepSeq.sequence[i] !== '-') {
                familyResidueCount++;
                if (familyResidueCount === residueNumber) {
                  familyCol = i;
                  console.log(`  Found residue #${residueNumber} at family col ${familyCol} (AA: ${familyRepSeq.sequence[i]})`);
                  break;
                }
              }
            }

            if (familyCol === -1) {
              console.warn(`  ❌ Could not find family alignment column for residue ${residueNumber}`);
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
              const consData = conservationData[residueNumber.toString()];
              const gpcrdb = consData?.gpcrdb || residueNumber.toString();
              
              console.log(`  GPCRdb: residue #${residueNumber} → "${gpcrdb}"`);
              
              // Use SAME display position key as custom alignments for consistent visualization
              positionData[displayPos] = {
                position: displayPos + 1, // 1-based position (will be renumbered during display)
                msaColumn: displayPos, // Use display position for consistent alignment
                residueCounts: calculatedData.residueCounts,
                totalSequences: calculatedData.totalSequences,
                informationContent: calculatedData.informationContent,
                letterHeights: calculatedData.letterHeights,
                matchPercentage: calculatedData.matchPercentage,
                mostConservedAA: calculatedData.mostConservedAA,
                matchCounts: calculatedData.matchCounts,
                gpcrdb: gpcrdb // Add GPCRdb numbering
              };
              
              console.log(`  ✅ Created logo for display pos ${displayPos} (was family col ${familyCol})`);
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
      const allSelectedAlignments = [
        ...selectionOrder.filter(name => allSelected.includes(name)), // Ordered selections
        ...allSelected.filter(name => !selectionOrder.includes(name))  // New selections not yet in order
      ];
      
      allSelectedAlignments.forEach(name => {
        const positionData = alignmentPositionData[name] || {};
        const processedPositions: Record<number, PositionLogoData> = {};
        
        // Include all positions that have data in any alignment
        for (let pos = 0; pos < globalMaxPosition; pos++) {
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

        // Apply HRH2 filter if active
        const positionsToInclude = filterActive
          ? allPositions.filter(pos => filterMsaColumns.has(pos))
          : allPositions;
        
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
      setIsProcessing(false);
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
    filterTokens, 
    referenceMaps, 
    humanRefSequences,
    classWideData,
    classDataLoaded
  ]);

  // Calculate display statistics
  const getDisplayStats = useCallback(() => {
    if (!dataLoaded || !allData.length || (!selectedAlignments.length && !selectedClassAlignments.length)) {
      return { totalPositions: 0, displayedPositions: 0, blurredPositions: 0 };
    }

    const receptorData = processedReceptorData;
    if (!receptorData.length || !receptorData[0].logoData.length) {
      return { totalPositions: 0, displayedPositions: 0, blurredPositions: 0 };
    }

    const totalPositions = receptorData[0].logoData.length;
    let blurredPositions = 0;

    if (useSimpleConservation) {
      receptorData.forEach(d => {
        d.logoData.forEach(position => {
          if (position.crossAlignmentData?.shouldBlur) {
            blurredPositions++;
          }
        });
      });
    }

    const displayedPositions = totalPositions;

    return { totalPositions, displayedPositions, blurredPositions };
  }, [dataLoaded, allData, selectedAlignments, selectedClassAlignments, processedReceptorData, useSimpleConservation]);

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
      useSimpleConservation,
      conservationThreshold,
      rowHeight,
      hideMaskedColumns,
      overlapMinRows,
      dotMinConservation
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
      const yAxisWidth = 120;
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
      // Determine which positions will be masked (insufficient overlap)
      const maskedSet = new Set<number>();

      // Collect all alignment positions across data
      const allPositions = new Set<number>();
      data.forEach((d) => {
        d.logoData.forEach((p) => allPositions.add(p.position));
      });

      if (overlapMinRows > 1) {
        allPositions.forEach((pos:number) => {
          // Gather representative residue for each row at this position
          const rowReps: { aa: string; rowData: PositionLogoData }[] = [];
          data.forEach(row => {
            const rowData = row.logoData.find(p => p.position === pos);
            if (!rowData) return;
            let rowAA = rowData.mostConservedAA;
            if (!rowAA) {
              const entries = Object.entries(rowData.residueCounts).sort(([, a], [, b]) => (b as number) - (a as number));
              if (entries.length === 0) return;
              rowAA = entries[0][0] as string;
            }
            rowReps.push({ aa: rowAA, rowData });
          });

          if (rowReps.length === 0) return;

          // Determine top AA across rows
          const counts: Record<string, number> = {};
          rowReps.forEach(({ aa }) => {
            counts[aa] = (counts[aa] || 0) + 1;
          });
          let topAA = Object.keys(counts)[0];
          let maxC = counts[topAA];
          Object.entries(counts).forEach(([aa, c]) => {
            if (c > maxC) { topAA = aa; maxC = c; }
          });

          // Build similarity group for topAA
          const group = Object.values(matchingGroups).find(g => g.includes(topAA));

          // Count qualifying rows
          let qualCount = 0;
          rowReps.forEach(({ aa, rowData }) => {
            const similar = group ? group.includes(aa) : aa === topAA;
            if (!similar) return;
            let simCount = 0;
            if (group) {
              group.forEach(res => { simCount += rowData.residueCounts[res] || 0; });
            } else {
              simCount = rowData.residueCounts[topAA] || 0;
            }
            const freq = simCount / rowData.totalSequences;
            if (freq * 100 >= dotMinConservation) qualCount++;
          });

          if (qualCount < overlapMinRows) maskedSet.add(pos);
        });
      }

      // Apply overlap filtering: always calculate maskedSet, but only hide columns if hideMaskedColumns is true
      const positionsWithData = Array.from(allPositions).filter((pos:number) => {
        if (hideMaskedColumns && maskedSet.has(pos)) {
          return false; // Hide masked columns when hideMaskedColumns is true
        }
        return true; // Show all columns when hideMaskedColumns is false (but apply visual indicators)
      }).sort((a:number, b:number) => a - b);
      
      // Create mapping from display position to original alignment position
      const displayToOriginalPos: Record<number, number> = {};
      positionsWithData.forEach((originalPos, displayIndex) => {
        displayToOriginalPos[displayIndex + 1] = originalPos; // displayIndex + 1 because positions are 1-based
      });

      const maxPositions = positionsWithData.length;

      // Total width based on constant column width; masked columns appear narrow visually via mask overlay
      const totalWidth = maxPositions * barWidthEstimate + margin.left + margin.right;
      
      const gapBetweenReceptors = 5; // No gap between rows to eliminate unwanted spacing
      const logoAreaHeight = rowHeight;
      const conservationBarHeight = useSimpleConservation ? 60 : 0; // Only show if using simple conservation
      // UpSet-style dot plot settings
      const dotTopPadding = 5; // reduced from 10
      const dotRowHeight = 16;
      const dotPlotHeight = dotTopPadding + (dotRowHeight * data.length) + (gapBetweenReceptors * (data.length - 1)) + 8; // reduced buffer for tighter spacing

      // Reference gpcrdb rows (optional)
      const referenceRowHeight = 30; // Increased from 16 to better fit GPCRdb numbers
      const referenceAreaHeight = (showReferenceRows && referenceDataLoaded) ? (referenceInfo.length * referenceRowHeight + 4) : 0; // tighter padding

      // Total chart height: logos + dot plot + optional reference rows + conservation bar + margins
      const totalHeight = (logoAreaHeight * data.length) + (gapBetweenReceptors * (data.length - 1)) + dotPlotHeight + referenceAreaHeight + conservationBarHeight + margin.top + margin.bottom + 20;

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

      // x scale uses filtered positions
      const x = d3
        .scaleBand<string>()
        .domain(positionsWithData.map(p => p.toString()))
        .range([0, totalWidth])
        .paddingInner(0.05);

      const yDomainMax = 4.32;
      const y = d3.scaleLinear().domain([0, yDomainMax]).range([logoAreaHeight, 0]);

      // Create Y-axes for each receptor
      data.forEach((receptorData, receptorIndex) => {
        const receptorY = margin.top + receptorIndex * (logoAreaHeight + gapBetweenReceptors);
        


        const yLabel = yAxisSvg
          .append('text')
          .attr('text-anchor', 'end')
          .attr('x', yAxisWidth - 10)
          .attr('y', receptorY + logoAreaHeight / 2 + 5)
          .attr('class', 'text-foreground fill-current')
          .style('font-size', '12px')
          .style('font-family', 'Helvetica');

        // Format receptor name: ClassX -> Class X, except ClassOlf -> Olfactory
        const formatReceptorName = (name: string) => {
          if (name === 'ClassOlf') return 'Olfactory';
          if (name.startsWith('Class') && name.length > 5) {
            return 'Class ' + name.substring(5);
          }
          return name;
        };
        
        yLabel.append('tspan').text(formatReceptorName(receptorData.receptorName.split('_')[0]));
        // yLabel.append('tspan').attr('x', 0).attr('dy', '1.2em').text('Information');
        // yLabel.append('tspan').attr('x', 0).attr('dy', '1.2em').text('Content (bits)');
        
        // Create individual y-scale for this receptor to avoid continuous lines
        const receptorY_scale = d3.scaleLinear().domain([0, yDomainMax]).range([logoAreaHeight, 0]);
        
        // Add y-axis line with tick marks but no labels
        const yAxis = d3.axisLeft(receptorY_scale).ticks(4).tickFormat(() => '');
        yAxisSvg
          .append('g')
          .attr('transform', `translate(${yAxisWidth - 1}, ${receptorY})`)
          .attr('class', 'axis text-foreground')
          .call(yAxis);
      });

      const letterPromises: Promise<void>[] = [];

      // Render each receptor row
      data.forEach((receptorData, receptorIndex) => {
        const receptorY = margin.top + receptorIndex * (logoAreaHeight + gapBetweenReceptors);
        
        receptorData.logoData.forEach((d) => {
          if (hideMaskedColumns && maskedSet.has(d.position)) return; // skip
          const positionX = x(d.position.toString());
          if (positionX === undefined) return;
          const positionWidth = x.bandwidth();
          
          // Add visual indicator for masked columns when not hiding them
          const isMasked = maskedSet.has(d.position);
          if (!hideMaskedColumns && isMasked) {
            // Add a subtle overlay to indicate this column doesn't meet overlap criteria
            chartSvg
              .append('rect')
              .attr('x', positionX)
              .attr('y', receptorY)
              .attr('width', positionWidth)
              .attr('height', logoAreaHeight)
              .attr('fill', 'rgba(255, 0, 0, 0.1)')
              .attr('stroke', 'rgba(255, 0, 0, 0.3)')
              .attr('stroke-width', 1)
              .attr('pointer-events', 'none')
              .style('mix-blend-mode', 'multiply');
          }
          
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
                      let tooltipContent = `<strong>Alignment:</strong> ${receptorData.receptorName}<br/>` +
                        `<strong>Position:</strong> ${d.position}<br/>` +
                        `<strong>Residue:</strong> ${residue}<br/>` +
                        `<strong>Count:</strong> ${d.residueCounts[residue]} / ${d.totalSequences}<br/>` +
                        `<strong>Frequency:</strong> ${((d.residueCounts[residue] / d.totalSequences) * 100).toFixed(1)}%<br/>`;
                      
                      if (useSimpleConservation && d.crossAlignmentData) {
                        tooltipContent += `<strong>Cross-Alignment Conservation:</strong> ${d.matchPercentage!.toFixed(1)}%<br/>`;
                        tooltipContent += `<strong>Most Conserved Across Alignments:</strong> ${d.mostConservedAA}<br/>`;
                        tooltipContent += `<strong>Match Count:</strong> ${d.crossAlignmentData.matchCount} / ${d.crossAlignmentData.totalAlignments} alignments<br/>`;
                        
                        // Show amino acids from each alignment
                        tooltipContent += `<strong>Alignment AAs:</strong><br/>`;
                        Object.entries(d.crossAlignmentData.alignmentAAs).forEach(([alignment, aa]) => {
                          const isMatch = aa === d.mostConservedAA || 
                            (d.mostConservedAA && ['E','D'].includes(d.mostConservedAA) && ['E','D'].includes(aa)) ||
                            (d.mostConservedAA && ['W','Y','H','F'].includes(d.mostConservedAA) && ['W','Y','H','F'].includes(aa)) ||
                            (d.mostConservedAA && ['R','K'].includes(d.mostConservedAA) && ['R','K'].includes(aa)) ||
                            (d.mostConservedAA && ['Q','N'].includes(d.mostConservedAA) && ['Q','N'].includes(aa)) ||
                            (d.mostConservedAA && ['V','I'].includes(d.mostConservedAA) && ['V','I'].includes(aa)) ||
                            (d.mostConservedAA && ['M','L'].includes(d.mostConservedAA) && ['M','L'].includes(aa));
                          tooltipContent += `&nbsp;&nbsp;${alignment}: <span style="color: ${isMatch ? '#22c55e' : '#ef4444'}">${aa}</span><br/>`;
                        });
                      } else if (useSimpleConservation && d.matchPercentage !== undefined) {
                        tooltipContent += `<strong>Within-Alignment Match %:</strong> ${d.matchPercentage.toFixed(1)}%<br/>`;
                        if (d.mostConservedAA) {
                          tooltipContent += `<strong>Most Conserved:</strong> ${d.mostConservedAA}<br/>`;
                        }
                        if (d.matchCounts && d.matchCounts[residue]) {
                          tooltipContent += `<strong>Match Count:</strong> ${d.matchCounts[residue]} / ${d.totalSequences}<br/>`;
                        }
                      }
                      
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
                      let tooltipContent = `<strong>Alignment:</strong> ${receptorData.receptorName}<br/>` +
                        `<strong>Position:</strong> ${d.position}<br/>` +
                        `<strong>Residue:</strong> ${residue}<br/>` +
                        `<strong>Count:</strong> ${d.residueCounts[residue]} / ${d.totalSequences}<br/>` +
                        `<strong>Frequency:</strong> ${((d.residueCounts[residue] / d.totalSequences) * 100).toFixed(1)}%<br/>`;
                      
                      if (useSimpleConservation && d.crossAlignmentData) {
                        tooltipContent += `<strong>Cross-Alignment Conservation:</strong> ${d.crossAlignmentData.conservationPercentage.toFixed(1)}%<br/>`;
                        tooltipContent += `<strong>Most Conserved Across Alignments:</strong> ${d.mostConservedAA}<br/>`;
                        tooltipContent += `<strong>Match Count:</strong> ${d.crossAlignmentData.matchCount} / ${d.crossAlignmentData.totalAlignments} alignments<br/>`;
                        
                        // Show amino acids from each alignment
                        tooltipContent += `<strong>Alignment AAs:</strong><br/>`;
                        Object.entries(d.crossAlignmentData.alignmentAAs).forEach(([alignment, aa]) => {
                          const isMatch = aa === d.mostConservedAA || 
                            (d.mostConservedAA && ['E','D'].includes(d.mostConservedAA) && ['E','D'].includes(aa)) ||
                            (d.mostConservedAA && ['W','Y','H','F'].includes(d.mostConservedAA) && ['W','Y','H','F'].includes(aa)) ||
                            (d.mostConservedAA && ['R','K'].includes(d.mostConservedAA) && ['R','K'].includes(aa)) ||
                            (d.mostConservedAA && ['Q','N'].includes(d.mostConservedAA) && ['Q','N'].includes(aa)) ||
                            (d.mostConservedAA && ['V','I'].includes(d.mostConservedAA) && ['V','I'].includes(aa)) ||
                            (d.mostConservedAA && ['M','L'].includes(d.mostConservedAA) && ['M','L'].includes(aa));
                          tooltipContent += `&nbsp;&nbsp;${alignment}: <span style="color: ${isMatch ? '#22c55e' : '#ef4444'}">${aa}</span><br/>`;
                        });
                      } else if (useSimpleConservation && d.matchPercentage !== undefined) {
                        tooltipContent += `<strong>Within-Alignment Match %:</strong> ${d.matchPercentage.toFixed(1)}%<br/>`;
                        if (d.mostConservedAA) {
                          tooltipContent += `<strong>Most Conserved:</strong> ${d.mostConservedAA}<br/>`;
                        }
                        if (d.matchCounts && d.matchCounts[residue]) {
                          tooltipContent += `<strong>Match Count:</strong> ${d.matchCounts[residue]} / ${d.totalSequences}<br/>`;
                        }
                      }
                      
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

      // === After logos are rendered, draw separate overlap dot plot ===
      const dotGap = gapBetweenReceptors;
      const overlapPlotOffset = margin.top + logoAreaHeight * data.length + dotGap * (data.length - 1) + dotTopPadding;

      // expand chartSvg height to accommodate dot plot (already accounted for in totalHeight below)

      // For each receptor row, draw a grey background guideline
      data.forEach((_, rIdx) => {
        chartSvg.append('rect')
          .attr('x', 0)
          .attr('y', overlapPlotOffset + rIdx * (dotRowHeight + dotGap))
          .attr('width', totalWidth)
          .attr('height', dotRowHeight)
          .attr('fill', rIdx % 2 ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.06)');
      });

      // Determine top variant per position (most abundant across rows)
      const positionTopAA: Record<number, { aa: string; rows: number[] }> = {};
      Object.entries(overlapMap).forEach(([posStr, posMap]) => {
        let bestAA = '';
        let bestRows: number[] = [];
        Object.entries(posMap).forEach(([aa, rows]) => {
          if (rows.length > bestRows.length) {
            bestAA = aa;
            bestRows = rows;
          }
        });
        positionTopAA[Number(posStr)] = { aa: bestAA, rows: bestRows };
      });

      // Determine all overlaps per position (not just the most frequent)
      // Map: position -> sorted list of [amino acid, rows[]] by overlap size (desc)
      const positionOverlapAAs: Record<number, Array<{ aa: string, rows: number[] }>> = {};
      Object.entries(overlapMap).forEach(([posStr, posMap]) => {
        // Only keep AAs that occur in more than one row (overlap)
        const aaRows = Object.entries(posMap)
          .filter(([, rows]) => rows.length > 1)
          .map(([aa, rows]) => ({ aa, rows }));
        // Sort by overlap size descending
        aaRows.sort((a, b) => b.rows.length - a.rows.length);
        positionOverlapAAs[Number(posStr)] = aaRows;
      });

      // Define colors for primary, secondary, tertiary overlaps
      const overlapColors = ['#475c6c', '#8a8583', '#eed7a1']; // user-provided palette

      // Draw dots per receptor/position, coloring by overlap rank if present
      data.forEach((receptorData, rIdx) => {
        receptorData.logoData.forEach(d => {
          if (hideMaskedColumns && maskedSet.has(d.position)) return;
          const posX = x(d.position.toString())! + x.bandwidth() / 2;
          const posY = overlapPlotOffset + rIdx * (dotRowHeight + dotGap) + dotRowHeight / 2;
          
          const isMasked = maskedSet.has(d.position);

          // Find which overlap group (if any) this dot belongs to
          let dotColor = '#a3a3a3'; // default gray
          let strokeColor = 'none';
          const overlapAAs = positionOverlapAAs[d.position] || [];
          let found = false;
          let freq = 0;
          for (let i = 0; i < overlapAAs.length && i < overlapColors.length; ++i) {
            const { aa: groupKey, rows } = overlapAAs[i];
            // Find the most-conserved AA for this row at this position
            let rowAA = d.mostConservedAA;
            if (!rowAA) {
              const entries = Object.entries(d.residueCounts).sort(([,a],[,b]) => (b as number) - (a as number));
              rowAA = entries.length > 0 ? (entries[0][0] as string) : '';
            }
            // Check if rowAA belongs to the same similarity group as the overlap group
            let belongsToGroup = false;
            if (matchingGroups[groupKey]) {
              // groupKey is a similarity group name
              belongsToGroup = matchingGroups[groupKey].includes(rowAA);
            } else {
              // groupKey is an individual amino acid (not in any group)
              belongsToGroup = rowAA === groupKey;
            }
            
            if (belongsToGroup && rows.includes(rIdx)) {
              dotColor = overlapColors[i];
              // Calculate frequency for this AA in this row
              if (matchingGroups[groupKey]) {
                // Sum frequencies for all amino acids in this group
                let groupCount = 0;
                matchingGroups[groupKey].forEach(res => {
                  groupCount += d.residueCounts[res] || 0;
                });
                freq = groupCount / d.totalSequences;
              } else {
                // Individual amino acid
                freq = d.residueCounts[groupKey] ? d.residueCounts[groupKey] / d.totalSequences : 0;
              }
              found = true;
              break;
            }
          }
          // Add visual indication for masked positions
          if (!hideMaskedColumns && isMasked) {
            dotColor = found ? '#ff0000' : '#ff6666'; // Red tint for masked
            strokeColor = '#ff0000';
          }

          // Only color if part of an overlap (otherwise keep gray)
          let radius, fill, stroke, strokeWidth;
          if (found) {
            radius = 5 * Math.max(0.2, freq);
            fill = dotColor;
            stroke = strokeColor;
            strokeWidth = strokeColor !== 'none' ? 1 : 0;
            chartSvg.append('circle')
              .attr('cx', posX)
              .attr('cy', posY)
              .attr('r', radius)
              .attr('fill', fill)
              .attr('stroke', stroke)
              .attr('stroke-width', strokeWidth);
          }
        });
      });


      // === Column masking based on overlap count ===
      const drawMasks = () => {
        if (!hideMaskedColumns && overlapMinRows <= 1) return;

        const logosHeight = logoAreaHeight * data.length + gapBetweenReceptors * (data.length - 1);

        Object.entries(positionTopAA).forEach(([posStr, info]) => {
          const pos = Number(posStr);
          // Build list of rows that share similar residue and meet conservation threshold
          const qualifyingRows: number[] = [];
          data.forEach((row, rIdx) => {
            const rowData = row.logoData.find(p => p.position === pos);
            if (!rowData) return;
            // Determine row's representative residue (top)
            let rowAA = rowData.mostConservedAA;
            if (!rowAA) {
              const entries = Object.entries(rowData.residueCounts).sort(([,a],[,b]) => (b as number)-(a as number));
              rowAA = entries.length > 0 ? (entries[0][0] as string) : '';
            }
            if (!rowAA) return;
            const group = Object.values(matchingGroups).find(g => g.includes(info.aa));
            const isSimilar = group ? group.includes(rowAA) : rowAA === info.aa;
            if (!isSimilar) return;
            // similarity frequency
            let simCount = 0;
            if (group) {
              group.forEach(res => { simCount += rowData.residueCounts[res] || 0; });
            } else {
              simCount = rowData.residueCounts[info.aa] || 0;
            }
            const freq = simCount / rowData.totalSequences;
            if (freq * 100 >= dotMinConservation) {
              qualifyingRows.push(rIdx);
            }
          });

          if (qualifyingRows.length < overlapMinRows) {
            // mask this column over logo area only
            const bw = x.bandwidth();
            const maskW = bw; // full column width
            const posX = x(pos.toString())!;
            // blank out full column
            chartSvg.append('rect')
              .attr('x', x(pos.toString())!)
              .attr('y', margin.top)
              .attr('width', bw)
              .attr('height', logosHeight)
              .attr('fill', '#ffffff')
              .attr('opacity', 1)
              .attr('pointer-events', 'none');

            // overlay narrow grey bar
            chartSvg.append('rect')
              .attr('x', posX)
              .attr('y', margin.top)
              .attr('width', maskW)
              .attr('height', logosHeight)
              .attr('fill', '#808080')
              .attr('opacity', 0.95)
              .attr('pointer-events', 'none');
          }
        });
      };

      // Wait until all letters are rendered then draw masks to ensure overlay
      if (!hideMaskedColumns) {
        Promise.all(letterPromises).then(drawMasks);
      }

      // Y-axis labels for dot plot
      data.forEach((receptorData, rIdx) => {
        const labelY = overlapPlotOffset + rIdx * (dotRowHeight + dotGap) + dotRowHeight / 2 + 4; // small vertical offset
        yAxisSvg.append('text')
          .attr('text-anchor', 'end')
          .attr('x', yAxisWidth - 10)
          .attr('y', labelY)
          .attr('class', 'text-foreground fill-current')
          .style('font-size', '12px')
          .style('font-family', 'Helvetica')
          .text((() => {
            const name = receptorData.receptorName.split('_')[0];
            if (name === 'ClassOlf') return 'Olfactory';
            if (name.startsWith('Class') && name.length > 5) {
              return 'Class ' + name.substring(5);
            }
            return name;
          })());
      });

      /* ─── Reference GPCRdb rows ───────────────────────────── */
      if (showReferenceRows && referenceDataLoaded) {
        const referencePlotOffset = margin.top + (logoAreaHeight * data.length) + (gapBetweenReceptors * (data.length - 1)) + dotPlotHeight + 2; // tighter padding

        // Background stripes for readability
        referenceInfo.forEach((_, idx) => {
          chartSvg.append('rect')
            .attr('x', 0)
            .attr('y', referencePlotOffset + idx * referenceRowHeight)
            .attr('width', totalWidth)
            .attr('height', referenceRowHeight)
            .attr('fill', idx % 2 ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.06)');
        });

        referenceInfo.forEach((ref, refIdx) => {
          const rowCenterY = referencePlotOffset + refIdx * referenceRowHeight + referenceRowHeight / 2;

          // Y-axis label for the reference gene
          yAxisSvg.append('text')
            .attr('text-anchor', 'end')
            .attr('x', yAxisWidth - 10)
            .attr('y', rowCenterY + 4)
            .attr('class', 'text-foreground fill-current')
            .style('font-size', '12px')
            .style('font-family', 'Helvetica')
            .text(ref.geneName);

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
                const cx = x(displayPos.toString())! + x.bandwidth() / 2;
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
      
      // Add conservation bar plot below the logos if using simple conservation
      if (useSimpleConservation && data.length > 0 && data[0].logoData.length > 0) {
        const conservationBarHeight = 60;
        const barChartY = totalHeight - conservationBarHeight;
        
        // Add conservation bar chart background
        chartSvg
          .append('rect')
          .attr('x', 0)
          .attr('y', barChartY)
          .attr('width', totalWidth)
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
            const barX = x(d.position.toString())!;
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
            .attr('x2', totalWidth)
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
          .ticks(5)
          .tickFormat(d => `${d}%`);
        
        yAxisSvg
          .append('g')
          .attr('transform', `translate(${yAxisWidth - 1}, ${barChartY})`)
          .attr('class', 'axis text-foreground')
          .call(conservationAxis)
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
    }

    return () => {
      setTooltip(prev => ({ ...prev, visible: false }));
    };
  }, [
    dataLoaded, 
    selectedAlignments, 
    selectedClassAlignments, 
    processedReceptorData, 
    useSimpleConservation, 
    conservationThreshold, 
    rowHeight, 
    gapBetweenReceptors,
    hideMaskedColumns, 
    overlapMinRows, 
    dotMinConservation,
    showReferenceRows,
    referenceDataLoaded,
    referenceInfo,
    // Stable function references - these rarely change
    getResidueColor, 
    loadCustomSvgLetter, 
    showTooltip, 
    hideTooltip, 
    updateTooltipPosition
  ]);

  if (!dataLoaded) return <div>Loading custom alignments...</div>;
  
  if (!classDataLoaded) return <div>Loading class-wide alignments...</div>;

  if (isProcessing) return <div>Processing receptor data...</div>;

  return (
    <div className="max-w-7xl mx-auto bg-card text-card-foreground rounded-lg p-6 shadow-md">
      <h2 className="text-2xl font-bold mb-4">Custom Sequence Logos</h2>

      {/* Controls */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button onClick={downloadSVG} variant="outline" size="sm">
              Download SVG
            </Button>
          </div>

          {/* Alignment selection controls */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-medium">Select Alignments:</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAll}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={selectNone}>
                Select None
              </Button>
            </div>
          </div>
        </div>

        {/* Display controls */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Row Height:</label>
            <input
              type="range"
              min="20"
              max="200"
              value={rowHeight}
              onChange={(e) => setRowHeight(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">{rowHeight}px</span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Min Conservation:</label>
            <input
              type="range"
              min="0"
              max="100"
              value={conservationThreshold}
              onChange={(e) => setConservationThreshold(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">{conservationThreshold}%</span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Dot Plot Min %:</label>
            <input
              type="range"
              min="0"
              max="100"
              value={dotMinConservation}
              onChange={(e) => setDotMinConservation(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">{dotMinConservation}%</span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Min Overlap Rows:</label>
            <input
              type="range"
              min="1"
              max={Math.max(1, selectedAlignments.length + selectedClassAlignments.length)}
              value={overlapMinRows}
              onChange={(e) => setOverlapMinRows(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">{overlapMinRows}</span>
          </div>

          {/* Mask width control removed */}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="use-simple-conservation"
              checked={useSimpleConservation}
              onChange={(e) => setUseSimpleConservation(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-gray-300"
            />
            <label htmlFor="use-simple-conservation" className="text-sm font-medium cursor-pointer">
              Use Simple Conservation
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="hide-masked"
              checked={hideMaskedColumns}
              onChange={(e)=>setHideMaskedColumns(e.target.checked)}
            />
            <label htmlFor="hide-masked" className="text-sm font-medium cursor-pointer">Hide Masked Columns</label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="show-reference"
              checked={showReferenceRows}
              onChange={(e)=>setShowReferenceRows(e.target.checked)}
            />
            <label htmlFor="show-reference" className="text-sm font-medium cursor-pointer">Show Reference GPCRdb</label>
          </div>
        </div>
      </div>

      {/* Checkbox selection grid */}
      <div className="mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {fastaNames.map((name) => (
            <div key={name} className="flex items-center gap-2 bg-muted rounded px-3 py-2">
              <input
                type="checkbox"
                id={`alignment-${name}`}
                checked={selectedAlignments.includes(name)}
                onChange={() => handleAlignmentToggle(name)}
                className="w-4 h-4 text-blue-600 rounded border-gray-300"
              />
              <label htmlFor={`alignment-${name}`} className="text-sm font-medium cursor-pointer">
                {name}
              </label>
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm text-muted-foreground">
          Selected: {selectedAlignments.length} / {fastaNames.length} alignments
        </div>

        {/* Class-wide Alignments Section */}
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-4">Class-wide Alignments</h3>
          <div className="flex flex-wrap gap-2 items-center mb-4">
            <span className="text-sm font-medium">Select Class Alignments:</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAllClassAlignments}>
                Select All Classes
              </Button>
              <Button variant="outline" size="sm" onClick={selectNoClassAlignments}>
                Select None
              </Button>
            </div>
          </div>
          
          {/* GPCR Classes */}
          <div className="mb-4">
            <h4 className="text-md font-medium mb-2">GPCR Classes</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {['ClassA', 'ClassB1', 'ClassB2', 'ClassC', 'ClassF', 'ClassT', 'ClassOlf'].map((className: string) => (
                <div key={className} className="flex items-center gap-2 bg-blue-50 rounded px-3 py-2">
                  <input
                    type="checkbox"
                    id={`class-${className}`}
                    checked={selectedClassAlignments.includes(className)}
                    onChange={() => handleClassAlignmentToggle(className)}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300"
                  />
                  <label htmlFor={`class-${className}`} className="text-sm font-medium cursor-pointer">
                    {className === 'ClassOlf' ? 'ClassOlf' : className}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Individual Receptor Orthologs */}
          <div className="mb-4">
            <h4 className="text-md font-medium mb-2">Individual Receptor Orthologs</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {['GP157', 'GP143'].map((className: string) => (
                <div key={className} className="flex items-center gap-2 bg-purple-50 rounded px-3 py-2">
                  <input
                    type="checkbox"
                    id={`class-${className}`}
                    checked={selectedClassAlignments.includes(className)}
                    onChange={() => handleClassAlignmentToggle(className)}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300"
                  />
                  <label htmlFor={`class-${className}`} className="text-sm font-medium cursor-pointer">
                    {className}
                  </label>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            Selected: {selectedClassAlignments.length} / {availableClassAlignments.length} class alignments
            {selectedClassAlignments.length > 0 && (
              <span className="ml-2 text-blue-600">
                (Using family-wide human sequences: {selectedClassAlignments.map(c => classToRepresentative[c]).join(', ')})
              </span>
            )}
          </div>
        </div>

        {/* HRH2 filter input on its own line below checkboxes */}
        <div className="flex items-center gap-2 mt-4">
          <label className="text-sm font-medium">Filter HRH2 Residues:</label>
          <input
            type="text"
            value={filterInput}
            onChange={(e) => setFilterInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                applyFilter();
              }
            }}
            placeholder="e.g. 45, 49, 110"
            className="border rounded px-2 py-1 text-sm"
          />
          <Button variant="outline" size="sm" onClick={applyFilter}>
            Apply
          </Button>
          {filterTokens.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearFilter}>
              Clear
            </Button>
          )}
        </div>

        {/* Display statistics */}
        {(selectedAlignments.length > 0 || selectedClassAlignments.length > 0) && (() => {
          const stats = getDisplayStats();
          return (
            <div className="mt-2 text-sm text-muted-foreground">
              <div>
                Positions: {stats.displayedPositions} displayed
                {stats.blurredPositions > 0 && useSimpleConservation && (
                  <span> • {stats.blurredPositions} columns blurred (below {conservationThreshold}% conservation)</span>
                )}
                {conservationThreshold > 0 && !useSimpleConservation && (
                  <span> • Conservation ≥ {conservationThreshold}%</span>
                )}
              </div>

              <div className="mt-1">
                <span className="font-medium">
                  Conservation Method: {useSimpleConservation ? 'Cross-Alignment Match-based' : 'Shannon Entropy (Within-Alignment)'}
                </span>
                {useSimpleConservation && (
                  <span className="text-xs ml-2">
                    (Conserved across alignments: E-D matches, aromatic W-Y-H-F, basic R-K, polar Q-N, V-I, M-L)
                  </span>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Chart container placeholder (SVGs rendered via d3) */}
      <div className="relative w-full flex overflow-x-hidden mb-4">
        <div ref={yAxisContainerRef} className="flex-shrink-0 z-10 bg-card" />
        <div className="flex-grow overflow-x-auto">
          <div ref={chartContainerRef} className="h-full" />
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