'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { Button } from '@/components/ui/button';
import useCleanedSequences from '@/hooks/useCleanedSequence';

interface CategorizedResidue {
  category: string;
  resNum1: string;
  humanAa1: string;
  conservedAa1: string;
  perc1: number;
  resNum2: string;
  humanAa2: string;
  conservedAa2: string;
  perc2: number;
  region1: string;
  region2: string;
  gpcrdb1: string;
  gpcrdb2: string;
}

interface Position {
  residue1: CategorizedResidue | null;
  residue2: CategorizedResidue | null;
  category: string;
  gpcrdb1: string;
  gpcrdb2: string;
  receptor1Column: number;
  receptor2Column: number;
}

interface LogoData {
  informationContent: number;
  letterHeights: Record<string, number>;
  residueCounts: Record<string, number>;
  totalSequences: number;
}

interface DualSequenceLogoChartProps {
  categorizedResidues: CategorizedResidue[];
  receptor1Name: string;
  receptor2Name: string;
  receptor1Alignment: string; // Path to receptor 1's ortholog MSA
  receptor2Alignment: string; // Path to receptor 2's ortholog MSA
  colorMap: Record<string, string>;
  height?: number;
  onLoaded?: () => void;
  onColorMapChange?: (newColorMap: Record<string, string>) => void;
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

const getCategoryLabels = (receptor1Name?: string, receptor2Name?: string) => ({
  common: 'Common Residues',
  specific_both: 'Specifically Conserved for Both',
  specific1: `Specifically Conserved for ${receptor1Name || 'Receptor 1'}`,
  specific2: `Specifically Conserved for ${receptor2Name || 'Receptor 2'}`,
});

const DualSequenceLogoChart: React.FC<DualSequenceLogoChartProps> = ({ 
  categorizedResidues, 
  receptor1Name, 
  receptor2Name, 
  receptor1Alignment,
  receptor2Alignment,
  colorMap, 
  height = 400,
  onLoaded,
  onColorMapChange
}) => {
  const yAxisContainerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // State for customizable amino acid colors
  const [groupColors, setGroupColors] = useState(() => {
    const colors: Record<string, string> = {};
    Object.entries(aminoAcidGroups).forEach(([key, group]) => {
      colors[key] = group.color;
    });
    return colors;
  });
  
  // State for loaded sequences
  const [receptor1Sequences, setReceptor1Sequences] = useState<{ header: string; sequence: string }[]>([]);
  const [receptor2Sequences, setReceptor2Sequences] = useState<{ header: string; sequence: string }[]>([]);
  
  // State for tooltip
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    content: string;
  }>({ visible: false, x: 0, y: 0, content: '' });
  
  // Cleaned sequences using the hook
  const cleanedReceptor1Sequences = useCleanedSequences(receptor1Sequences);
  const cleanedReceptor2Sequences = useCleanedSequences(receptor2Sequences);

  // Function to parse FASTA content
  const parseFasta = (fastaText: string): { header: string; sequence: string }[] => {
    const lines = fastaText.split('\n').filter(line => line.trim());
    const sequences: { header: string; sequence: string }[] = [];
    let currentHeader = '';
    let currentSequence = '';

    for (const line of lines) {
      if (line.startsWith('>')) {
        if (currentHeader && currentSequence) {
          sequences.push({
            header: currentHeader.substring(1), // Remove '>'
            sequence: currentSequence
          });
        }
        currentHeader = line;
        currentSequence = '';
      } else {
        currentSequence += line.trim();
      }
    }

    // Add the last sequence
    if (currentHeader && currentSequence) {
      sequences.push({
        header: currentHeader.substring(1),
        sequence: currentSequence
      });
    }

    return sequences;
  };

  // Load alignment sequences
  useEffect(() => {
    if (receptor1Alignment && receptor2Alignment) {
      // Load receptor 1 alignment
      fetch(receptor1Alignment)
        .then(response => response.text())
        .then(fastaContent => {
          const parsedSequences = parseFasta(fastaContent);
          setReceptor1Sequences(parsedSequences);
        })
        .catch(error => {
          console.error('Error loading receptor 1 alignment:', error);
        });

      // Load receptor 2 alignment
      fetch(receptor2Alignment)
        .then(response => response.text())
        .then(fastaContent => {
          const parsedSequences = parseFasta(fastaContent);
          setReceptor2Sequences(parsedSequences);
        })
        .catch(error => {
          console.error('Error loading receptor 2 alignment:', error);
        });
    }
  }, [receptor1Alignment, receptor2Alignment]);

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

  // Cache for loaded SVG paths
  const svgPathCache = useRef<Record<string, { path: string; viewBox: string; transformAttr?: string }>>({});

  // Function to get residue color based on amino acid groups
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

  // Function to reset category colors to defaults
  const resetCategoryColors = () => {
    if (onColorMapChange) {
      const categoryLabels = getCategoryLabels(receptor1Name, receptor2Name);
      const defaultCategoryColors = {
        [categoryLabels.common]: '#E6E6FA',
        [categoryLabels.specific_both]: '#A85638',
        [categoryLabels.specific1]: '#FFF9C2',
        [categoryLabels.specific2]: '#8F9871',
      };
      onColorMapChange(defaultCategoryColors);
    }
  };

  // Function to load custom SVG letter
  const loadCustomSvgLetter = async (letter: string) => {
    if (svgPathCache.current[letter]) {
      return svgPathCache.current[letter];
    }

    try {
      const response = await fetch(`/tight_caps/${letter}.svg`);
      if (!response.ok) throw new Error(`Failed to load ${letter}.svg`);

      const svgContent = await response.text();
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
      const originalSvg = svgDoc.querySelector('svg');
      const pathElement = svgDoc.querySelector('path');

      if (!originalSvg || !pathElement) throw new Error(`Invalid SVG structure for ${letter}.svg`);

      const viewBox = originalSvg.getAttribute('viewBox') || '0 0 100 100';
      const pathData = pathElement.getAttribute('d') || '';
      const transformAttr = pathElement.getAttribute('transform') || undefined;

      const result = { path: pathData, viewBox, transformAttr };
      svgPathCache.current[letter] = result;
      return result;
    } catch (error) {
      console.error(`Error loading custom SVG for ${letter}:`, error);
      return null;
    }
  };

  // Calculate logo data for a position (similar to original SequenceLogoChart)
  const calculatePositionLogoData = (position: number, sequences: string[]): {
    informationContent: number;
    letterHeights: Record<string, number>;
    residueCounts: Record<string, number>;
    totalSequences: number;
  } => {
    const residueCounts: Record<string, number> = {};
    let gapCount = 0;
    let nonGapSequences = 0;
    
    // Count residues at this position (including gaps)
    const standardAA = 'ACDEFGHIKLMNPQRSTVWY';
    const totalSequencesInAlignment = sequences.length;
    
    sequences.forEach(seq => {
      const residue = seq[position]?.toUpperCase();
      if (residue && standardAA.includes(residue)) {
        residueCounts[residue] = (residueCounts[residue] || 0) + 1;
        nonGapSequences++;
      } else {
        // Count as gap (dash, missing, or non-standard)
        gapCount++;
      }
    });
    
    // Skip positions with no amino acids at all
    if (nonGapSequences === 0) return { 
      informationContent: 0, 
      letterHeights: {}, 
      residueCounts: {},
      totalSequences: totalSequencesInAlignment
    };
    
    // Calculate frequencies against ALL sequences (including gaps)
    const frequencies: Record<string, number> = {};
    Object.keys(residueCounts).forEach(residue => {
      frequencies[residue] = residueCounts[residue] / totalSequencesInAlignment;
    });
    
    // Add gap frequency for entropy calculation (but don't render gaps)
    if (gapCount > 0) {
      frequencies['-'] = gapCount / totalSequencesInAlignment;
    }
    
    // Calculate Shannon entropy (including gaps)
    let entropy = 0;
    Object.values(frequencies).forEach(freq => {
      if (freq > 0) {
        entropy -= freq * Math.log2(freq);
      }
    });
    
    // Calculate information content (max bits for 21 characters: 20 AA + gaps)
    const maxBits = Math.log2(21);
    const informationContent = Math.max(0, maxBits - entropy);
    
    // Calculate letter heights (only for amino acids, not gaps)
    const letterHeights: Record<string, number> = {};
    Object.keys(residueCounts).forEach(residue => {
      letterHeights[residue] = frequencies[residue] * informationContent;
    });
    
    return { informationContent, letterHeights, residueCounts, totalSequences: totalSequencesInAlignment };
  };

  // Download SVG function
  const downloadSVG = () => {
    const yAxisContainer = yAxisContainerRef.current;
    const chartContainer = chartContainerRef.current;
    
    if (!yAxisContainer || !chartContainer) return;

    const yAxisSvg = yAxisContainer.querySelector('svg');
    const chartSvg = chartContainer.querySelector('svg');
    
    if (!yAxisSvg || !chartSvg) return;

    const yAxisWidth = parseInt(yAxisSvg.getAttribute('width') || '80');
    const chartWidth = parseInt(chartSvg.getAttribute('width') || '800');
    const totalWidth = yAxisWidth + chartWidth;
    const totalHeight = parseInt(chartSvg.getAttribute('height') || '400');

    const combinedSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    combinedSvg.setAttribute('width', totalWidth.toString());
    combinedSvg.setAttribute('height', totalHeight.toString());
    combinedSvg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
    combinedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const yAxisClone = yAxisSvg.cloneNode(true) as SVGElement;
    yAxisClone.setAttribute('x', '0');
    yAxisClone.setAttribute('y', '0');
    combinedSvg.appendChild(yAxisClone);

    const chartClone = chartSvg.cloneNode(true) as SVGElement;
    chartClone.setAttribute('x', yAxisWidth.toString());
    chartClone.setAttribute('y', '0');
    combinedSvg.appendChild(chartClone);

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(combinedSvg);
    const svgWithDeclaration = `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;

    const blob = new Blob([svgWithDeclaration], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const fileName = `dual_sequence_logo_${receptor1Name}_${receptor2Name}.svg`;
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
    if (!categorizedResidues.length) return;
    if (!cleanedReceptor1Sequences.length || !cleanedReceptor2Sequences.length) return;

    // Call onLoaded when component mounts
    if (onLoaded) {
      onLoaded();
    }

    yAxisContainer.innerHTML = '';
    chartContainer.innerHTML = '';

    // Create positions array with proper mapping to cleaned sequence columns
    const positions = categorizedResidues.map((residue, index) => ({
      index,
      residue1: residue.resNum1 !== 'gap' ? residue : null,
      residue2: residue.resNum2 !== 'gap' ? residue : null,
      category: residue.category,
      gpcrdb1: residue.gpcrdb1,
      gpcrdb2: residue.gpcrdb2,
      // Map residue numbers to cleaned sequence positions (1-indexed to 0-indexed)
      receptor1Column: residue.resNum1 !== 'gap' ? parseInt(residue.resNum1) - 1 : -1,
      receptor2Column: residue.resNum2 !== 'gap' ? parseInt(residue.resNum2) - 1 : -1
    }));

    renderChart(positions);

    function renderChart(positions: Position[]) {
      if (!yAxisContainer || !chartContainer) return;

      // Layout constants
      const margin = { top: 20, right: 20, bottom: 80, left: 20 };
      const yAxisWidth = 120; // Increased for labels
      const totalHeight = height;
      const barWidthEstimate = 18;
      const totalWidth = positions.length * barWidthEstimate + margin.left + margin.right;
      
      // Heights for different sections
      const infoRowHeight = 20;
      const gapBetweenRows = 8;
      const categoryRowHeight = 18;
      const logoAreaHeight = (totalHeight - margin.top - margin.bottom - infoRowHeight * 2 - gapBetweenRows * 2 - categoryRowHeight) / 2;

      // Create SVGs
      const yAxisSvg = d3.select(yAxisContainer)
        .append('svg')
        .attr('width', yAxisWidth)
        .attr('height', totalHeight)
        .attr('viewBox', `0 0 ${yAxisWidth} ${totalHeight}`)
        .style('max-height', `${totalHeight}px`);

      const chartSvg = d3.select(chartContainer)
        .append('svg')
        .attr('width', totalWidth)
        .attr('height', totalHeight)
        .attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`)
        .style('max-height', `${totalHeight}px`);

      // Tooltip helper functions
      const showTooltip = (event: MouseEvent, content: string) => {
        setTooltip({
          visible: true,
          x: event.clientX,
          y: event.clientY,
          content
        });
      };

      const hideTooltip = () => {
        setTooltip(prev => ({ ...prev, visible: false }));
      };

      const updateTooltipPosition = (event: MouseEvent) => {
        setTooltip(prev => ({ ...prev, x: event.clientX, y: event.clientY }));
      };

      // Scales
      const x = d3.scaleBand<string>()
        .domain(positions.map((_, i) => i.toString()))
        .range([0, totalWidth])
        .paddingInner(0.01);

      const maxInformationContent = 4.32; // log2(20) for amino acids
      const y1 = d3.scaleLinear()
        .domain([0, maxInformationContent])
        .range([margin.top + logoAreaHeight, margin.top]);

      const y2 = d3.scaleLinear()
        .domain([0, maxInformationContent])
        .range([margin.top + logoAreaHeight * 2 + gapBetweenRows, margin.top + logoAreaHeight + gapBetweenRows]);

      // Y-Axis labels
      const yAxis1 = d3.axisLeft(y1).ticks(3).tickFormat(d => `${Number(d).toFixed(1)}`);
      const yAxis2 = d3.axisLeft(y2).ticks(3).tickFormat(d => `${Number(d).toFixed(1)}`);

      yAxisSvg.append('g')
        .attr('transform', `translate(${yAxisWidth - 1},0)`)
        .attr('class', 'axis text-foreground')
        .call(yAxis1);

      yAxisSvg.append('g')
        .attr('transform', `translate(${yAxisWidth - 1},0)`)
        .attr('class', 'axis text-foreground')
        .call(yAxis2);

      // Y-axis labels (moved slightly to the right)
      const yLabel1 = yAxisSvg.append('text')
        .attr('text-anchor', 'middle')
        .attr('transform', `translate(${yAxisWidth - 75},${margin.top + logoAreaHeight / 2}) rotate(-90)`)
        .attr('class', 'text-foreground fill-current')
        .style('font-size', '12px');

      yLabel1.append('tspan').attr('x', 0).text(`${receptor1Name}`);
      yLabel1.append('tspan').attr('x', 0).attr('dy', '1.2em').text('Information');
      yLabel1.append('tspan').attr('x', 0).attr('dy', '1.2em').text('Content (bits)');

      const yLabel2 = yAxisSvg.append('text')
        .attr('text-anchor', 'middle')
        .attr('transform', `translate(${yAxisWidth - 75},${margin.top + logoAreaHeight * 1.5 + gapBetweenRows}) rotate(-90)`)
        .attr('class', 'text-foreground fill-current')
        .style('font-size', '12px');

      yLabel2.append('tspan').attr('x', 0).text(`${receptor2Name}`);
      yLabel2.append('tspan').attr('x', 0).attr('dy', '1.2em').text('Information');
      yLabel2.append('tspan').attr('x', 0).attr('dy', '1.2em').text('Content (bits)');

      // GPCRdb row labels
      const gpcrdb1Y = margin.top + logoAreaHeight * 2 + gapBetweenRows * 2 + 4;
      const gpcrdb2Y = gpcrdb1Y + infoRowHeight + gapBetweenRows + 8; // Added 8px extra space
      const categoryY = gpcrdb2Y + infoRowHeight + gapBetweenRows;

      yAxisSvg.append('text')
        .attr('text-anchor', 'end')
        .attr('x', yAxisWidth - 10)
        .attr('y', gpcrdb1Y + infoRowHeight / 2)
        .attr('class', 'text-foreground fill-current')
        .style('font-size', '12px')
        .attr('dominant-baseline', 'middle')
        .text(`${receptor1Name} GPCRdb #:`);

      yAxisSvg.append('text')
        .attr('text-anchor', 'end')
        .attr('x', yAxisWidth - 10)
        .attr('y', gpcrdb2Y + infoRowHeight / 2)
        .attr('class', 'text-foreground fill-current')
        .style('font-size', '12px')
        .attr('dominant-baseline', 'middle')
        .text(`${receptor2Name} GPCRdb #:`);

      // Category label
      yAxisSvg.append('text')
        .attr('text-anchor', 'end')
        .attr('x', yAxisWidth - 10)
        .attr('y', categoryY + categoryRowHeight / 2)
        .attr('class', 'text-foreground fill-current')
        .style('font-size', '12px')
        .attr('dominant-baseline', 'middle')
        .text('Category:');

      // Render sequence logos
      positions.forEach((pos, index) => {
        const positionX = x(index.toString())!;
        const positionWidth = x.bandwidth();

        // Calculate logo data for receptor 1 and receptor 2 separately
        let receptor1LogoData = null;
        let receptor2LogoData = null;

        if (pos.receptor1Column >= 0 && pos.receptor1Column < cleanedReceptor1Sequences[0]?.sequence.length) {
          receptor1LogoData = calculatePositionLogoData(pos.receptor1Column, cleanedReceptor1Sequences.map(s => s.sequence));
        }

        if (pos.receptor2Column >= 0 && pos.receptor2Column < cleanedReceptor2Sequences[0]?.sequence.length) {
          receptor2LogoData = calculatePositionLogoData(pos.receptor2Column, cleanedReceptor2Sequences.map(s => s.sequence));
        }
        
        // Render receptor 1 logo (all residues stacked) - only if this position is relevant
        if (pos.residue1 && pos.residue1.humanAa1 !== '-' && receptor1LogoData) {
          renderPositionLogo(
            receptor1LogoData,
            positionX + positionWidth / 2,
            y1(0),
            positionWidth * 0.9,
            y1,
            pos.residue1,
            'receptor1'
          );
        }

        // Render receptor 2 logo (all residues stacked) - only if this position is relevant  
        if (pos.residue2 && pos.residue2.humanAa2 !== '-' && receptor2LogoData) {
          renderPositionLogo(
            receptor2LogoData,
            positionX + positionWidth / 2,
            y2(0),
            positionWidth * 0.9,
            y2,
            pos.residue2,
            'receptor2'
          );
        }
      });

      async function renderPositionLogo(
        logoData: LogoData,
        centerX: number,
        baselineY: number,
        width: number,
        yScale: d3.ScaleLinear<number, number>,
        residueData: CategorizedResidue,
        receptor: string
      ) {
        // Sort residues by frequency (smallest to largest for stacking)
        const sortedResidues = Object.entries(logoData.letterHeights)
          .sort(([,a], [,b]) => (a as number) - (b as number));

        let stackY = baselineY; // Start from bottom

        for (const [residue, heightValue] of sortedResidues) {
          const height = heightValue as number;
          if (height > 0) {
            const letterHeightPx = baselineY - yScale(height);
            const svgData = await loadCustomSvgLetter(residue);
            
            if (svgData) {
              const vbParts = svgData.viewBox.split(" ").map(Number);
              const [, , vbWidth, vbHeight] = vbParts;

              let targetWidth = width;
              let preserveAspectRatio = 'none';
              
              if (residue === 'I') {
                targetWidth = width * 0.2;
                preserveAspectRatio = 'none';
              }

              const nestedSvg = chartSvg
                .append('svg')
                .attr('x', centerX - targetWidth / 2)
                .attr('y', stackY - letterHeightPx)
                .attr('width', targetWidth)
                .attr('height', letterHeightPx)
                .attr('viewBox', `0 0 ${vbWidth} ${vbHeight}`)
                .attr('preserveAspectRatio', preserveAspectRatio)
                .style('cursor', 'pointer');

              const path = nestedSvg
                .append('path')
                .attr('d', svgData.path)
                .attr('fill', getResidueColor(residue));

              if (svgData.transformAttr) {
                path.attr('transform', svgData.transformAttr);
              }

              // Add hover interactions with React state-based tooltip
              const createTooltipContent = () => {
                const frequency = logoData.residueCounts[residue] / logoData.totalSequences;
                const resNum = receptor === 'receptor1' ? residueData.resNum1 : residueData.resNum2;
                const gpcrdb = receptor === 'receptor1' ? residueData.gpcrdb1 : residueData.gpcrdb2;
                
                return `<strong>${receptor === 'receptor1' ? receptor1Name : receptor2Name}</strong><br/>` +
                       `<strong>Position:</strong> ${resNum}<br/>` +
                       `<strong>Residue:</strong> ${residue}<br/>` +
                       `<strong>Frequency:</strong> ${(frequency * 100).toFixed(1)}%<br/>` +
                       `<strong>Information:</strong> ${height.toFixed(2)} bits<br/>` +
                       `<strong>GPCRdb #:</strong> ${gpcrdb}`;
              };

              nestedSvg
                .on('mouseover', (event) => {
                  showTooltip(event, createTooltipContent());
                })
                .on('mousemove', updateTooltipPosition)
                .on('mouseout', hideTooltip);
            }

            // Update stack position for next letter
            stackY -= letterHeightPx;
          }
        }
      }

      // GPCRdb numbering rows (reuse variables from above)

      // GPCRdb numbers for receptor 1
      chartSvg.selectAll('text.gpcrdb1')
        .data(positions)
        .enter()
        .append('text')
        .attr('class', 'gpcrdb1 text-foreground fill-current')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .style('font-size', '10px')
        .attr('transform', (d, i) => {
          const cx = x(i.toString())! + x.bandwidth() / 2;
          const cy = gpcrdb1Y + infoRowHeight / 2;
          return `translate(${cx}, ${cy}) rotate(-90)`;
        })
        .text(d => d.gpcrdb1 !== '-' ? d.gpcrdb1 : '');

      // GPCRdb numbers for receptor 2
      chartSvg.selectAll('text.gpcrdb2')
        .data(positions)
        .enter()
        .append('text')
        .attr('class', 'gpcrdb2 text-foreground fill-current')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .style('font-size', '10px')
        .attr('transform', (d, i) => {
          const cx = x(i.toString())! + x.bandwidth() / 2;
          const cy = gpcrdb2Y + infoRowHeight / 2;
          return `translate(${cx}, ${cy}) rotate(-90)`;
        })
        .text(d => d.gpcrdb2 !== '-' ? d.gpcrdb2 : '');

      // Category blocks
      const categoryGroups: Array<{category: string, start: number, end: number}> = [];
      if (positions.length > 0) {
        let currentCategory = positions[0].category;
        let start = 0;
        
        for (let i = 1; i < positions.length; i++) {
          if (positions[i].category !== currentCategory) {
            categoryGroups.push({
              category: currentCategory,
              start,
              end: i - 1
            });
            currentCategory = positions[i].category;
            start = i;
          }
        }
        categoryGroups.push({
          category: currentCategory,
          start,
          end: positions.length - 1
        });
      }

      chartSvg.selectAll('rect.category-block')
        .data(categoryGroups)
        .enter()
        .append('rect')
        .attr('class', 'category-block')
        .attr('x', d => x(d.start.toString())!)
        .attr('y', categoryY)
        .attr('width', d => x(d.end.toString())! + x.bandwidth() - x(d.start.toString())!)
        .attr('height', categoryRowHeight)
        .attr('fill', d => {
          const categoryLabels = getCategoryLabels(receptor1Name, receptor2Name);
          return colorMap[categoryLabels[d.category as keyof typeof categoryLabels]];
        })
        .style('cursor', 'pointer')
        .on('mouseover', (event, d) => {
          const categoryLabels = getCategoryLabels(receptor1Name, receptor2Name);
          const content = `<strong>Category:</strong> ${categoryLabels[d.category as keyof typeof categoryLabels]}`;
          showTooltip(event, content);
        })
        .on('mousemove', updateTooltipPosition)
        .on('mouseout', hideTooltip);


    }

    return () => {
      // Cleanup - hide tooltip if component unmounts
      setTooltip(prev => ({ ...prev, visible: false }));
    };
  }, [categorizedResidues, receptor1Name, receptor2Name, colorMap, cleanedReceptor1Sequences, cleanedReceptor2Sequences, isDarkMode, groupColors, getResidueColor, height, onLoaded]);

  return (
    <div className="bg-card text-card-foreground rounded-lg shadow-md">
      <div className="p-6 border-b border-border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h2 className="text-xl font-semibold text-foreground">Dual Sequence Logo Comparison</h2>
          <div className="flex items-center gap-2 mt-2 sm:mt-0">
            {categorizedResidues.length > 0 && (
              <Button onClick={downloadSVG} variant="outline" size="sm">
                Download SVG
              </Button>
            )}
          </div>
        </div>
      </div>
      
      <div className="p-6">
        <div className="relative w-full flex overflow-hidden" style={{ height: `${height}px`, maxHeight: `${height}px` }}>
          <div ref={yAxisContainerRef} className="flex-shrink-0 z-10 bg-card" style={{ maxHeight: `${height}px` }} />
          <div className="flex-grow overflow-x-auto overflow-y-hidden" style={{ maxHeight: `${height}px` }}>
            <div ref={chartContainerRef} className="h-full" style={{ maxHeight: `${height}px` }} />
          </div>
        </div>
      </div>
      
            {/* Color controls section */}
      <div className="p-6 pt-0">
        <div className="space-y-4">
          {/* Amino acid group colors */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-base font-semibold text-foreground">Amino Acid Group Colors</h3>
              <button
                onClick={resetColors}
                className="px-3 py-1 text-xs bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded border transition-colors"
                title="Reset amino acid colors to default"
              >
                Reset
              </button>
            </div>
            <div className="flex flex-wrap gap-4 items-center justify-center">
              {Object.entries(aminoAcidGroups).map(([groupKey, group]) => {
                // Get the actual display color (considering dark mode for small group)
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
            </div>
          </div>
          
          {/* Category colors */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-base font-semibold text-foreground">Category Colors</h3>
              <button
                onClick={resetCategoryColors}
                className="px-3 py-1 text-xs bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded border transition-colors"
                title="Reset category colors to default"
              >
                Reset
              </button>
            </div>
            <div className="flex flex-wrap gap-4 items-center justify-center">
              {Object.entries(getCategoryLabels(receptor1Name, receptor2Name)).map(([categoryKey, categoryLabel]) => (
                <div key={categoryKey} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colorMap[categoryLabel] || '#000000'}
                    onChange={(e) => {
                      if (onColorMapChange) {
                        const newColorMap = { ...colorMap, [categoryLabel]: e.target.value };
                        onColorMapChange(newColorMap);
                      }
                    }}
                    className="w-5 h-5 rounded cursor-pointer border"
                    title={`Color for ${categoryLabel}`}
                  />
                  <span className="text-base text-foreground">{categoryLabel}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip overlay */}
      {tooltip.visible && (
        <div
          className="fixed z-40 pointer-events-none bg-white text-black dark:bg-black dark:text-white text-xs sm:text-sm rounded border border-gray-300 dark:border-gray-600 px-1 py-0.5 sm:px-2 sm:py-1 max-w-xs sm:max-w-sm break-words leading-tight sm:leading-normal shadow-lg"
          style={{
            left: Math.min(tooltip.x + 10, window.innerWidth - 200),
            top: Math.max(tooltip.y - 40, 10),
          }}
        >
          <div dangerouslySetInnerHTML={{ __html: tooltip.content }} />
        </div>
      )}
    </div>
  );
};

export default DualSequenceLogoChart; 