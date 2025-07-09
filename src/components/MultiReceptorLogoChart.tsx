'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as d3 from 'd3';
import { Button } from '@/components/ui/button';


interface ResidueMapping {
  [key: string]: string;
}

interface ConservationData {
  conservation: number;
  conservedAA: string;
  aa: string;
  region: string;
  gpcrdb: string;
}

interface PositionLogoData {
  position: number; // Reference receptor position for alignment
  receptorPosition: number; // Current receptor's position for tooltip
  residueCounts: Record<string, number>;
  totalSequences: number;
  informationContent: number;
  letterHeights: Record<string, number>;
  humanAA: string;
  gpcrdb: string; // Reference receptor's gpcrdb for info rows
  receptorGpcrdb: string; // Current receptor's gpcrdb for tooltip
  region: string;
}

interface ReceptorLogoData {
  receptorName: string;
  logoData: PositionLogoData[];
}

interface MultiReceptorLogoChartProps {
  resultData: ResidueMapping[];
  receptorNames: string[];
  referenceReceptor: string;
  height?: number;
}

// Define amino acid groups and their default colors
const aminoAcidGroups = {
  aromatic: { residues: ['W', 'Y', 'H', 'F'], color: '#FCB315', label: 'Aromatic (WYHF)' },
  polar: { residues: ['S', 'T', 'Q', 'N'], color: '#7D2985', label: 'Polar (STQN)' },
  small: { residues: ['P', 'G', 'A'], color: '#231F20', label: 'Small (PGA)' },
  acidic: { residues: ['E', 'D'], color: '#DD6030', label: 'Acidic (ED)' },
  basic: { residues: ['R', 'K'], color: '#7CAEC4', label: 'Basic (RK)' },
  hydrophobic: { residues: ['V', 'C', 'I', 'M', 'L'], color: '#B4B4B4', label: 'Hydrophobic (VCIML)' }
};

type RegionGroup = { region: string; startPosition: number; endPosition: number };

const MultiReceptorLogoChart: React.FC<MultiReceptorLogoChartProps> = ({ 
  resultData, 
  receptorNames, 
  referenceReceptor, 
  height = 200 
}) => {
  const yAxisContainerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // State for tooltip
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    content: string;
  }>({ visible: false, x: 0, y: 0, content: '' });

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

  // State for alignment data
  const [alignmentData, setAlignmentData] = useState<Record<string, { header: string; sequence: string }[]>>({});
  const [isLoadingAlignments, setIsLoadingAlignments] = useState(false);
  
  // State for conservation data
  const [conservationData, setConservationData] = useState<Record<string, Record<string, ConservationData>>>({});
  const [isLoadingConservation, setIsLoadingConservation] = useState(false);
  
  // Use cleaned sequences hook for each receptor (call hooks at top level)
  const cleanedAlignmentData = useMemo(() => {
    const cleaned: Record<string, { header: string; sequence: string }[]> = {};
    
    Object.entries(alignmentData).forEach(([receptorName, sequences]) => {
      if (sequences.length > 0) {
        const humanSequence = sequences[0].sequence;
        const gapPositions = new Set<number>();
        
        // Find gap positions in human sequence
        for (let i = 0; i < humanSequence.length; i++) {
          if (humanSequence[i] === '-') {
            gapPositions.add(i);
          }
        }
        
        // Remove gap positions from all sequences
        cleaned[receptorName] = sequences.map(seq => ({
          header: seq.header,
          sequence: seq.sequence
            .split('')
            .filter((_, index) => !gapPositions.has(index))
            .join('')
        }));
      } else {
        cleaned[receptorName] = [];
      }
    });
    
    return cleaned;
  }, [alignmentData]);

  // Function to parse FASTA content
  const parseFasta = useCallback((fastaText: string): { header: string; sequence: string }[] => {
    const lines = fastaText.split('\n').filter(line => line.trim());
    const sequences: { header: string; sequence: string }[] = [];
    let currentHeader = '';
    let currentSequence = '';

    for (const line of lines) {
      if (line.startsWith('>')) {
        if (currentHeader && currentSequence) {
          sequences.push({
            header: currentHeader.substring(1),
            sequence: currentSequence
          });
        }
        currentHeader = line;
        currentSequence = '';
      } else {
        currentSequence += line.trim();
      }
    }

    if (currentHeader && currentSequence) {
      sequences.push({
        header: currentHeader.substring(1),
        sequence: currentSequence
      });
    }

    return sequences;
  }, []);

  // Function to calculate position logo data
  const calculatePositionLogoData = useCallback((position: number, sequences: string[]): {
    informationContent: number;
    letterHeights: Record<string, number>;
    residueCounts: Record<string, number>;
    totalSequences: number;
  } => {
    const residueCounts: Record<string, number> = {};
    let totalSequences = 0;
    
    const standardAA = 'ACDEFGHIKLMNPQRSTVWY';
    sequences.forEach(seq => {
      const residue = seq[position]?.toUpperCase();
      if (residue && standardAA.includes(residue)) {
        residueCounts[residue] = (residueCounts[residue] || 0) + 1;
        totalSequences++;
      }
    });
    
    if (totalSequences === 0) return { 
      informationContent: 0, 
      letterHeights: {}, 
      residueCounts: {},
      totalSequences: 0
    };
    
    const frequencies: Record<string, number> = {};
    Object.keys(residueCounts).forEach(residue => {
      frequencies[residue] = residueCounts[residue] / totalSequences;
    });
    
    let entropy = 0;
    Object.values(frequencies).forEach(freq => {
      if (freq > 0) {
        entropy -= freq * Math.log2(freq);
      }
    });
    
    const maxBits = Math.log2(20);
    const informationContent = Math.max(0, maxBits - entropy);
    
    const letterHeights: Record<string, number> = {};
    Object.keys(frequencies).forEach(residue => {
      letterHeights[residue] = frequencies[residue] * informationContent;
    });
    
    return { informationContent, letterHeights, residueCounts, totalSequences };
  }, []);

  // Function to parse conservation data
  const parseConservationData = useCallback((conservationText: string): Record<string, ConservationData> => {
    const data: Record<string, ConservationData> = {};
    
    conservationText.split('\n').forEach(line => {
      const parts = line.split('\t');
      if (parts[0] && parts[0].trim().toLowerCase() === 'residue_number') return;

      if (parts.length >= 6) {
        const resNum = parts[0].trim();
        data[resNum] = {
          conservation: parseFloat(parts[1].trim()),
          conservedAA: parts[2].trim(),
          aa: parts[3].trim(),
          region: parts[4].trim(),
          gpcrdb: parts[5].trim(),
        };
      }
    });

    return data;
  }, []);

  // Load alignments and conservation data
  useEffect(() => {
    if (!receptorNames.length) return;

    setIsLoadingAlignments(true);
    setIsLoadingConservation(true);

    const loadAlignments = async () => {
      const alignmentPromises = receptorNames.map(async (receptorName) => {
        try {
          const response = await fetch(`/alignments/${receptorName}_orthologs_MSA.fasta`);
          if (!response.ok) {
            console.warn(`Failed to load alignment for ${receptorName}: ${response.status}`);
            return { receptorName, sequences: [] };
          }
          
          const fastaContent = await response.text();
          const sequences = parseFasta(fastaContent);
          return { receptorName, sequences };
        } catch (error) {
          console.error(`Error loading alignment for ${receptorName}:`, error);
          return { receptorName, sequences: [] };
        }
      });

      const results = await Promise.all(alignmentPromises);
      const newAlignmentData: Record<string, { header: string; sequence: string }[]> = {};
      
      results.forEach(({ receptorName, sequences }) => {
        newAlignmentData[receptorName] = sequences;
      });

      setAlignmentData(newAlignmentData);
      setIsLoadingAlignments(false);
    };

    const loadConservation = async () => {
      const conservationPromises = receptorNames.map(async (receptorName) => {
        try {
          const response = await fetch(`/conservation_files/${receptorName}_conservation.txt`);
          if (!response.ok) {
            console.warn(`Failed to load conservation for ${receptorName}: ${response.status}`);
            return { receptorName, data: {} };
          }
          
          const conservationText = await response.text();
          const data = parseConservationData(conservationText);
          return { receptorName, data };
        } catch (error) {
          console.error(`Error loading conservation for ${receptorName}:`, error);
          return { receptorName, data: {} };
        }
      });

      const results = await Promise.all(conservationPromises);
      const newConservationData: Record<string, Record<string, ConservationData>> = {};
      
      results.forEach(({ receptorName, data }) => {
        newConservationData[receptorName] = data;
      });

      setConservationData(newConservationData);
      setIsLoadingConservation(false);
    };

    loadAlignments();
    loadConservation();
  }, [receptorNames, parseFasta, parseConservationData]);

    // Convert alignment data to logo data for each receptor
  const processReceptorData = useCallback((): ReceptorLogoData[] => {
    if (!resultData.length || !receptorNames.length || isLoadingAlignments || isLoadingConservation) return [];

    return receptorNames.map(receptorName => {
      const cleanedSequences = cleanedAlignmentData[receptorName] || [];
      const receptorConservation = conservationData[receptorName] || {};
      
      if (!cleanedSequences.length) {
        return { receptorName, logoData: [] };
      }

      const logoData: PositionLogoData[] = [];
      
      // Process each row in resultData
      resultData.forEach((row, rowIndex) => {
        const resNum = row[`${receptorName}_resNum`];
        const receptorAA = row[`${receptorName}_AA`];
        const referenceResNum = row[`${referenceReceptor}_resNum`];
        const referenceAA = row[`${referenceReceptor}_AA`];
        
        // Skip if receptor doesn't have a valid position or if reference receptor has a gap
        if (!resNum || resNum === '-' || !receptorAA || receptorAA === '-') return;
        if (!referenceResNum || referenceResNum === '-' || !referenceAA || referenceAA === '-') return;

        // Use the reference receptor's position as the alignment position
        const referencePosition = parseInt(referenceResNum);
        const receptorPosition = parseInt(resNum);
        
        // For the sequence index, use the receptor's own residue number
        const seqIndex = receptorPosition - 1; // Convert to 0-based index
        
        // Skip if position is out of bounds
        if (seqIndex < 0 || seqIndex >= cleanedSequences[0]?.sequence.length) return;

        // Calculate logo data for this position
        const positionLogoData = calculatePositionLogoData(
          seqIndex, 
          cleanedSequences.map((s: { header: string; sequence: string }) => s.sequence)
        );

        // Get GPCRdb and region from conservation data, fallback to resultData
        const receptorConservationEntry = receptorConservation[receptorPosition.toString()];
        const referenceConservationEntry = conservationData[referenceReceptor]?.[referencePosition.toString()];
        
        const receptorGpcrdb = receptorConservationEntry?.gpcrdb || row[`${receptorName}_gpcrdb`] || `${receptorPosition}`;
        const region = receptorConservationEntry?.region || referenceConservationEntry?.region || row[`${referenceReceptor}_region`] || 'Unknown';
        const gpcrdb = referenceConservationEntry?.gpcrdb || row[`${referenceReceptor}_gpcrdb`] || `${referencePosition}`;
        
        const humanAA = cleanedSequences[0]?.sequence[seqIndex]?.toUpperCase() || receptorAA;

        logoData.push({
          position: referencePosition, // Use reference position for alignment
          receptorPosition: receptorPosition, // Current receptor's position for tooltip
          residueCounts: positionLogoData.residueCounts,
          totalSequences: positionLogoData.totalSequences,
          informationContent: positionLogoData.informationContent,
          letterHeights: positionLogoData.letterHeights,
          humanAA,
          gpcrdb,
          receptorGpcrdb,
          region
        });
      });

      return {
        receptorName,
        logoData
      };
    });
  }, [resultData, receptorNames, cleanedAlignmentData, conservationData, referenceReceptor, isLoadingAlignments, isLoadingConservation, calculatePositionLogoData]);

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

    const fileName = `multi_receptor_logo.svg`;
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const yAxisContainer = yAxisContainerRef.current;
    const chartContainer = chartContainerRef.current;

    if (!yAxisContainer || !chartContainer) return;

    // Always clean up first
    const oldTooltips = document.querySelectorAll('.logo-tooltip, .conservation-tooltip');
    oldTooltips.forEach(tooltip => tooltip.remove());

    yAxisContainer.innerHTML = '';
    chartContainer.innerHTML = '';

    // Don't render anything if no data or still loading
    if (!resultData.length || !receptorNames.length || isLoadingAlignments || isLoadingConservation) {
      return;
    }

    const receptorData = processReceptorData();
    if (!receptorData.length || !receptorData[0].logoData.length) return;

    renderChart(receptorData);

    function renderChart(data: ReceptorLogoData[]) {
      if (!yAxisContainer || !chartContainer) return;

      const margin = { top: 20, right: 20, bottom: 20, left: 20 };
      const yAxisWidth = 120; // Increased for receptor names
      const barWidthEstimate = 18;
      const maxPositions = Math.max(...data.map(d => d.logoData.length));
      const totalWidth = maxPositions * barWidthEstimate + margin.left + margin.right;
      
      const infoRowHeight = 20;
      const regionBlockHeight = 22;
      const gapBetweenReceptors = 15; // Gap between receptor rows
      
      // Calculate dynamic height based on number of receptors - remove human AA row
      const logoAreaHeight = 150; // Fixed height per receptor logo area
      const totalHeight = (logoAreaHeight + gapBetweenReceptors) * data.length - gapBetweenReceptors + 
                         infoRowHeight + regionBlockHeight + margin.top + margin.bottom + 8;

      const pastelColors = ['#FFFACD', '#E6E6FA'];

      // Get region data from reference receptor
      const referenceData = data.find(d => d.receptorName === referenceReceptor) || data[0];
      const regionColorMapping: Record<string, string> = {};
      let colorIndex = 0;
      referenceData.logoData.forEach(d => {
        if (!(d.region in regionColorMapping)) {
          regionColorMapping[d.region] = pastelColors[colorIndex % pastelColors.length];
          colorIndex += 1;
        }
      });

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

      // Create scales
      const positions = referenceData.logoData.map(d => d.position.toString());
      const x = d3
        .scaleBand<string>()
        .domain(positions)
        .range([0, totalWidth])
        .paddingInner(0.05);

      const yDomainMax = 4.32; // Maximum information content
      const y = d3.scaleLinear().domain([0, yDomainMax]).range([logoAreaHeight, 0]);

      // Create individual Y-axes for each receptor
      data.forEach((receptorData, receptorIndex) => {
        const receptorY = margin.top + receptorIndex * (logoAreaHeight + gapBetweenReceptors);
        
        // Create individual Y-axis for this receptor
        const yAxis = d3.axisLeft(y).ticks(5).tickFormat(d => `${Number(d).toFixed(1)}`);
        yAxisSvg
          .append('g')
          .attr('transform', `translate(${yAxisWidth - 1}, ${receptorY})`)
          .attr('class', 'axis text-foreground')
          .call(yAxis)
          .selectAll('text')
          .style('font-size', '12px');

        // Add Y-axis label for this receptor with receptor name
        const yLabel = yAxisSvg
          .append('text')
          .attr('text-anchor', 'middle')
          .attr('transform', `translate(${yAxisWidth - 75}, ${receptorY + logoAreaHeight / 2}) rotate(-90)`)
          .attr('class', 'text-foreground fill-current')
          .style('font-size', '12px');

        yLabel.append('tspan').attr('x', 0).text(`${receptorData.receptorName}`);
        yLabel.append('tspan').attr('x', 0).attr('dy', '1.2em').text('Information');
        yLabel.append('tspan').attr('x', 0).attr('dy', '1.2em').text('Content (bits)');
      });

      // Render each receptor row
      data.forEach((receptorData, receptorIndex) => {
        const receptorY = margin.top + receptorIndex * (logoAreaHeight + gapBetweenReceptors);
        
        // Render logos for this receptor
        receptorData.logoData.forEach((d) => {
          const positionX = x(d.position.toString())!;
          const positionWidth = x.bandwidth();
          
          // Sort residues by frequency
          const sortedResidues = Object.entries(d.letterHeights)
            .sort(([,a], [,b]) => a - b);

          let stackY = receptorY + y(0); // Start from bottom of this receptor's area

          // Create custom SVG letters asynchronously
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
                      showTooltip(event,
                        `<strong>Receptor:</strong> ${receptorData.receptorName}<br/>` +
                        `<strong>Position:</strong> ${d.receptorPosition}<br/>` +
                        `<strong>Residue:</strong> ${residue}<br/>` +
                        `<strong>Conservation:</strong> ${height.toFixed(2)} bits<br/>` +
                        `<strong>GPCRdb #:</strong> ${d.receptorGpcrdb}<br/>` +
                        `<strong>Region:</strong> ${d.region}`
                      );
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
                    .attr('font-size', 16)
                    .attr('transform', `scale(1, ${letterHeightPx / 16}) translate(0, -1)`)
                    .attr('fill', getResidueColor(residue))
                    .text(residue)
                    .style('cursor', 'pointer')
                    .on('mouseover', (event) => {
                      showTooltip(event,
                        `<strong>Receptor:</strong> ${receptorData.receptorName}<br/>` +
                        `<strong>Position:</strong> ${d.receptorPosition}<br/>` +
                        `<strong>Residue:</strong> ${residue}<br/>` +
                        `<strong>Conservation:</strong> ${height.toFixed(2)} bits<br/>` +
                        `<strong>GPCRdb #:</strong> ${d.receptorGpcrdb}<br/>` +
                        `<strong>Region:</strong> ${d.region}`
                      );
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
          
          createCustomSvgLetters().catch(error => {
            console.error('Error in createCustomSvgLetters:', error);
          });
        });
      });

      // Add region blocks and info rows only once at the bottom
      const infoStartY = margin.top + data.length * (logoAreaHeight + gapBetweenReceptors) - gapBetweenReceptors;
      
      // GPCRdb row (moved directly below logos, removed human AA row)
      const gpcrRowY = infoStartY + 8;
      chartSvg
        .selectAll('text.gpcrdb')
        .data(referenceData.logoData)
        .enter()
        .append('text')
        .attr('class', 'gpcrdb text-foreground fill-current')
        .style('font-size', '12px')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('transform', d => {
          const cx = x(d.position.toString())! + x.bandwidth() / 2;
          const cy = gpcrRowY + infoRowHeight / 2;
          return `translate(${cx}, ${cy}) rotate(-90)`;
        })
        .text(d => d.gpcrdb);

      // Region blocks (moved directly below GPCRdb row)
      const regionRowY = gpcrRowY + infoRowHeight + 8;
      const regionGroups: RegionGroup[] = [];
      if (referenceData.logoData.length > 0) {
        let startPosition = referenceData.logoData[0].position;
        let currentRegion = referenceData.logoData[0].region;
        for (let i = 1; i < referenceData.logoData.length; i++) {
          const prev = referenceData.logoData[i - 1];
          const cur = referenceData.logoData[i];
          if (cur.region !== prev.region) {
            regionGroups.push({ region: prev.region, startPosition, endPosition: prev.position });
            startPosition = cur.position;
            currentRegion = cur.region;
          }
        }
        regionGroups.push({
          region: currentRegion,
          startPosition,
          endPosition: referenceData.logoData[referenceData.logoData.length - 1].position,
        });
      }

      chartSvg
        .selectAll('rect.region-block')
        .data(regionGroups)
        .enter()
        .append('rect')
        .attr('class', 'region-block')
        .attr('x', d => x(d.startPosition.toString())!)
        .attr('y', regionRowY)
        .attr('width', d => x(d.endPosition.toString())! + x.bandwidth() - x(d.startPosition.toString())!)
        .attr('height', regionBlockHeight)
        .attr('fill', d => regionColorMapping[d.region])
        .on('mouseover', (event, d) => {
          d3.select(event.currentTarget as SVGRectElement)
            .style('stroke', '#000')
            .style('stroke-width', 1);
          showTooltip(event,
            `<strong>Region:</strong> ${d.region}<br/>Positions ${d.startPosition} - ${d.endPosition}`
          );
        })
        .on('mousemove', (event) => {
          updateTooltipPosition(event);
        })
        .on('mouseout', (event) => {
          d3.select(event.currentTarget as SVGRectElement).style('stroke', 'none');
          hideTooltip();
        });

      chartSvg
        .selectAll('text.region-label')
        .data(regionGroups)
        .enter()
        .append('text')
        .attr('class', 'region-label')
        .style('fill', 'black')
        .style('font-size', '12px')
        .attr('text-anchor', 'middle')
        .attr('x', d => {
          const leftX = x(d.startPosition.toString())!;
          const rightX = x(d.endPosition.toString())! + x.bandwidth();
          return (leftX + rightX) / 2;
        })
        .attr('y', regionRowY + regionBlockHeight / 2)
        .attr('dominant-baseline', 'middle')
        .text(d => d.region);
    }

    return () => {
      setTooltip(prev => ({ ...prev, visible: false }));
    };
  }, [resultData, receptorNames, referenceReceptor, groupColors, isDarkMode, isLoadingAlignments, isLoadingConservation, processReceptorData, getResidueColor, loadCustomSvgLetter, showTooltip, hideTooltip, updateTooltipPosition]);

  // Don't render anything if no data
  if (!resultData.length || !receptorNames.length) {
    return null;
  }

  // Show loading state while alignments are being fetched
  if (isLoadingAlignments || isLoadingConservation) {
    return null;
  }

  // Check if we have cleaned alignment data
  const hasAlignmentData = receptorNames.some(name => cleanedAlignmentData[name]?.length > 0);
  if (!hasAlignmentData) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="bg-card text-card-foreground rounded-lg shadow-md">
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-semibold text-foreground">Multi-Receptor Conservation Logos</h2>
          </div>
          <div className="p-6 flex items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground">No alignment data available for the selected receptors.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Please ensure that ortholog alignment files are available for: {receptorNames.join(', ')}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-card text-card-foreground rounded-lg shadow-md">
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">Multi-Receptor Conservation Logos</h2>
            <div className="flex items-center gap-2">
              <Button onClick={downloadSVG} variant="outline" size="sm">
                Download SVG
              </Button>
            </div>
          </div>
        </div>
      
      <div className="p-6">
        <div 
          className="relative w-full flex overflow-hidden" 
          style={{ 
            height: `${(150 + 15) * receptorNames.length - 15 + 40 + 22 + 40 + 8}px`,
            visibility: isLoadingAlignments || isLoadingConservation ? 'hidden' : 'visible',
            opacity: 1,
          }}
        >
          <div ref={yAxisContainerRef} className="flex-shrink-0 z-10 bg-card" />
          <div className="flex-grow overflow-x-auto">
            <div ref={chartContainerRef} className="h-full" />
          </div>
        </div>
      </div>
      
      {/* Color legend controls */}
      <div className="p-6 pt-0">
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
      </div>

      {/* Tooltip rendered via portal */}
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
    </div>
  );
};

export default MultiReceptorLogoChart; 