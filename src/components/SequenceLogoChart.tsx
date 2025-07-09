'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import * as d3 from 'd3';
import useCleanedSequences from '@/hooks/useCleanedSequence';
import { Button } from '@/components/ui/button';

interface Sequence {
  header: string;
  sequence: string;
}

interface PositionLogoData {
  position: number;
  residueCounts: Record<string, number>;
  totalSequences: number;
  informationContent: number;
  letterHeights: Record<string, number>;
  humanAA: string;
  gpcrdb: string;
  region: string;
}

interface SequenceLogoChartProps {
  sequences?: Sequence[];
  conservationFile?: string | null;
  alignmentPath?: string;
  onLoaded?: () => void;
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

type RegionGroup = { region: string; startResidue: number; endResidue: number };

const SequenceLogoChart: React.FC<SequenceLogoChartProps> = ({ sequences, conservationFile, alignmentPath, onLoaded, height = 242 }) => {
  const yAxisContainerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [loadedSequences, setLoadedSequences] = useState<Sequence[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // State for tooltip
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    content: string;
  }>({ visible: false, x: 0, y: 0, content: '' });

  // Function to parse FASTA content
  const parseFasta = (fastaText: string): Sequence[] => {
    const lines = fastaText.split('\n').filter(line => line.trim());
    const sequences: Sequence[] = [];
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

  // Load sequences from alignmentPath if provided
  useEffect(() => {
    if (alignmentPath) {
      fetch(alignmentPath)
        .then(response => response.text())
        .then(fastaContent => {
          const parsedSequences = parseFasta(fastaContent);
          setLoadedSequences(parsedSequences);
          if (onLoaded) {
            onLoaded();
          }
        })
        .catch(error => {
          console.error('Error loading alignment:', error);
          if (onLoaded) {
            onLoaded();
          }
        });
    } else if (sequences) {
      setLoadedSequences(sequences);
      if (onLoaded) {
        onLoaded();
      }
    }
  }, [alignmentPath, sequences, onLoaded]);

  // Track theme changes
  useEffect(() => {
    const updateTheme = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    
    // Initial check
    updateTheme();
    
    // Watch for theme changes
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    return () => observer.disconnect();
  }, []);
  
  // Use the same filtering logic as MSAVisualization
  const cleanedSequences = useCleanedSequences(loadedSequences);
  
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
        // Special handling for small group (PGA) - make white in dark mode
        if (groupKey === 'small' && groupColors[groupKey] === '#231F20') {
          return isDarkMode ? '#FFFFFF' : '#231F20';
        }
        return groupColors[groupKey];
      }
    }
    return '#000000'; // Default black
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
    const totalHeight = parseInt(chartSvg.getAttribute('height') || '280');

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

    const fileName = `sequence_logo.svg`;
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };
  
  // Cache for loaded SVG paths to avoid repeated fetches
  const svgPathCache = useRef<Record<string, { path: string; viewBox: string; transformAttr?: string }>>({});

  interface LetterSvgData { path: string; viewBox: string; transformAttr?: string }

  // Function to load custom SVG letter and return path data
  const loadCustomSvgLetter = useCallback(async (letter: string): Promise<LetterSvgData | null> => {
    // Check cache first
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
      
      // Check for parsing errors
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

      // Cache the result
      const result: LetterSvgData = { path: pathData, viewBox, transformAttr };
      svgPathCache.current[letter] = result;
      return result;
    } catch (error) {
      console.warn(`Error loading custom SVG for ${letter}:`, error);
      return null;
    }
  }, []);

  const calculateLogoData = (cleanedSeqs: Sequence[]): PositionLogoData[] => {
    if (!cleanedSeqs.length) return [];

    const logoData: PositionLogoData[] = [];
    const humanSequence = cleanedSeqs[0]?.sequence || '';

    // Process all positions in cleaned sequences (gaps already filtered out)
    for (let pos = 0; pos < humanSequence.length; pos++) {
      const humanResidue = humanSequence[pos]?.toUpperCase();
      if (!humanResidue) continue;

      const residueCounts: Record<string, number> = {};
      let totalSequences = 0;

      // Count residues at this position (only standard amino acids)
      const standardAA = 'ACDEFGHIKLMNPQRSTVWY';
      cleanedSeqs.forEach(seq => {
        const residue = seq.sequence[pos]?.toUpperCase();
        if (residue && standardAA.includes(residue)) {
          residueCounts[residue] = (residueCounts[residue] || 0) + 1;
          totalSequences++;
        }
      });

      if (totalSequences === 0) continue;

      // Calculate frequencies
      const frequencies: Record<string, number> = {};
      Object.keys(residueCounts).forEach(residue => {
        frequencies[residue] = residueCounts[residue] / totalSequences;
      });

      // Calculate Shannon entropy
      let entropy = 0;
      Object.values(frequencies).forEach(freq => {
        if (freq > 0) {
          entropy -= freq * Math.log2(freq);
        }
      });

      // Calculate information content (max 4.32 bits for 20 amino acids)
      const maxBits = Math.log2(20);
      const informationContent = Math.max(0, maxBits - entropy);

      // Calculate letter heights
      const letterHeights: Record<string, number> = {};
      Object.keys(frequencies).forEach(residue => {
        letterHeights[residue] = frequencies[residue] * informationContent;
      });

      logoData.push({
        position: pos + 1,
        residueCounts,
        totalSequences,
        informationContent,
        letterHeights,
        humanAA: humanResidue,
        gpcrdb: `${pos + 1}`, // Will be updated with conservation file
        region: 'Unknown' // Will be updated with conservation file
      });
    }

    return logoData;
  };

  useEffect(() => {
    const yAxisContainer = yAxisContainerRef.current;
    const chartContainer = chartContainerRef.current;

    if (!yAxisContainer || !chartContainer) return;

    // Clean up any old D3 tooltips that might be lingering in the DOM
    const oldTooltips = document.querySelectorAll('.logo-tooltip, .conservation-tooltip');
    oldTooltips.forEach(tooltip => tooltip.remove());

    // Clear any previous SVG content
    yAxisContainer.innerHTML = '';
    chartContainer.innerHTML = '';
    
    const logoData = calculateLogoData(cleanedSequences);
    if (!logoData.length) return;

    // Update with conservation file data if available
    if (conservationFile) {
      fetch(`/${conservationFile}`)
        .then(res => res.text())
        .then(text => {
          const lines = text.split(/\r?\n/).filter(d => d.trim() && !d.startsWith('residue'));
          const conservationMap: Record<number, {gpcrdb: string, region: string}> = {};
          
          lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 6) {
              const residueNum = parseInt(parts[0]);
              conservationMap[residueNum] = {
                gpcrdb: parts[5],
                region: parts[4]
              };
            }
          });
          
          // Update logoData with conservation info
          logoData.forEach(item => {
            if (conservationMap[item.position]) {
              item.gpcrdb = conservationMap[item.position].gpcrdb;
              item.region = conservationMap[item.position].region;
            }
          });
          
          renderChart(logoData);
        })
        .catch(err => {
          console.error('Error loading conservation data:', err);
          renderChart(logoData);
        });
    } else {
      renderChart(logoData);
    }

    function renderChart(data: PositionLogoData[]) {
      if (!yAxisContainer || !chartContainer) return;

      /* ---------- Layout constants ---------- */
      const margin = { top: 20, right: 20, bottom: 20, left: 20 };
      const yAxisWidth = 80;
      const totalHeight = height;
      const barWidthEstimate = 18; // Slightly wider for letters
      const totalWidth = data.length * barWidthEstimate + margin.left + margin.right;
      const infoRowHeight = 20;
      const gapBetweenInfoRows = 8;
      const gapBeforeRegion = 12;
      const regionBlockHeight = 22;
      const chartAreaHeight =
        totalHeight -
        margin.top -
        margin.bottom -
        infoRowHeight * 2 -
        gapBetweenInfoRows -
        gapBeforeRegion -
        regionBlockHeight;

      const pastelColors = ['#FFFACD', '#E6E6FA'];

      /* ---------- Color mapping for regions ---------- */
      const regionColorMapping: Record<string, string> = {};
      let colorIndex = 0;
      data.forEach(d => {
        if (!(d.region in regionColorMapping)) {
          regionColorMapping[d.region] = pastelColors[colorIndex % pastelColors.length];
          colorIndex += 1;
        }
      });

      /* ---------- SVGs for Axis and Chart ---------- */
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

      /* ---------- Tooltip ---------- */
      // The tooltip element is now managed by React state

      /* ---------- Scales ---------- */
      const x = d3
        .scaleBand<string>()
        .domain(data.map(d => d.position.toString()))
        .range([0, totalWidth])
        .paddingInner(0.01);

      // Calculate actual maximum information content from the data
      const maxInformationContent = Math.max(...data.map(d => d.informationContent));
      const yDomainMax = Math.max(maxInformationContent, 1); // Ensure minimum of 1 for scale
      
      const y = d3.scaleLinear().domain([0, yDomainMax]).range([margin.top + chartAreaHeight, margin.top]);

      /* ---------- Y-Axis ---------- */
      const yAxis = d3.axisLeft(y).ticks(5).tickFormat(d => `${Number(d).toFixed(1)}`);
      yAxisSvg
        .append('g')
        .attr('transform', `translate(${yAxisWidth - 1},0)`)
        .attr('class', 'axis text-foreground')
        .call(yAxis)
        .selectAll('text')
        .style('font-size', '12px');

      const yLabel = yAxisSvg
        .append('text')
        .attr('text-anchor', 'middle')
        .attr(
          'transform',
          `translate(${yAxisWidth - 65},${margin.top + chartAreaHeight / 2}) rotate(-90)`
        )
        .attr('class', 'text-foreground fill-current')
        .style('font-size', '14px');

      yLabel.append('tspan').attr('x', 0).text('Information');
      yLabel.append('tspan').attr('x', 0).attr('dy', '1.2em').text('Content (bits)');

      /* ---------- Sequence Logos ---------- */
      data.forEach((d) => {
        const positionX = x(d.position.toString())!;
        const positionWidth = x.bandwidth();
        
        // Sort residues by frequency (smallest to largest for stacking)
        const sortedResidues = Object.entries(d.letterHeights)
          .sort(([,a], [,b]) => a - b);

        let stackY = y(0); // Start from bottom

        // Create custom SVG letters asynchronously
        const createCustomSvgLetters = async () => {
          for (const [residue, height] of sortedResidues) {
            if (height > 0) {
              // Pixel height of this letter based on information content
              const letterHeightPx = y(0) - y(height);
              const letterBaselineY = stackY; // current baseline position (bottom of letter)
              const letterX = positionX + positionWidth / 2;

              // Attempt to load custom SVG path for this residue
              let svgData = null;
              try {
                svgData = await loadCustomSvgLetter(residue);
              } catch (error) {
                console.error(`Error loading SVG for ${residue}:`, error);
                svgData = null;
              }

              if (svgData) {
                                 /* ------- Use nested SVG with smart width scaling ------- */
                 const vbParts = svgData.viewBox.split(" ").map(Number);
                 const [, , vbWidth, vbHeight] = vbParts;

                 // Special handling for narrow letters like "I" - preserve natural width
                 let targetWidth;
                 let preserveAspectRatio;
                 
                 if (residue === 'I') {
                   // For "I", use narrow width but force exact height scaling
                   targetWidth = positionWidth * 0.2; // Much narrower - only 20% of column
                   preserveAspectRatio = 'none'; // force exact scaling for both width and height
                 } else {
                   // For other letters, use full column width
                   targetWidth = positionWidth * 0.9;
                   preserveAspectRatio = 'none'; // force exact scaling
                 }

                 // Append nested svg with calculated dimensions
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

                // Add the path inside nested SVG
                const path = nestedSvg
                  .append('path')
                  .attr('d', svgData.path)
                  .attr('fill', getResidueColor(residue));

                // If original path had transform (e.g., flip), keep it
                if (svgData.transformAttr) {
                  path.attr('transform', svgData.transformAttr);
                }

                // Hover interactions on nestedSVG
                nestedSvg
                  .on('mouseover', (event) => {
                    const frequency = d.residueCounts[residue] / d.totalSequences;
                    showTooltip(event,
                      `<strong>Position:</strong> ${d.position}<br/>` +
                        `<strong>Residue:</strong> ${residue}<br/>` +
                        `<strong>Frequency:</strong> ${(frequency * 100).toFixed(1)}%<br/>` +
                        `<strong>Information:</strong> ${height.toFixed(2)} bits<br/>` +
                        `<strong>Human AA:</strong> ${d.humanAA}<br/>` +
                        `<strong>GPCRdb #:</strong> ${d.gpcrdb}<br/>` +
                        `<strong>Region:</strong> ${d.region}`
                    );
                  })
                  .on('mousemove', (event) => {
                    updateTooltipPosition(event);
                  })
                  .on('mouseout', () => hideTooltip());

              } else {
                /* ------- SVG failed, fallback to text ------- */
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
                  .style('cursor', 'pointer');
              }

              /* ------- Update stack position for next letter ------- */
              stackY -= letterHeightPx;
            }
          }
        };
        
        // Execute async stacking function
        createCustomSvgLetters().catch(error => {
          console.error('Error in createCustomSvgLetters:', error);
        });
      });

      /* ---------- Information rows ---------- */
      const humanRowY = margin.top + chartAreaHeight + 4;
      chartSvg
        .selectAll('text.human-aa')
        .data(data)
        .enter()
        .append('text')
        .attr('class', 'human-aa text-foreground fill-current')
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .attr('x', d => x(d.position.toString())! + x.bandwidth() / 2)
        .attr('y', humanRowY + infoRowHeight / 2)
        .attr('dominant-baseline', 'middle')
        .text(d => d.humanAA);

      const gpcrRowY = humanRowY + infoRowHeight + gapBetweenInfoRows;
      const regionRowY = gpcrRowY + infoRowHeight + gapBeforeRegion;

      /* ---------- Region blocks ---------- */
      const regionGroups: RegionGroup[] = [];
      if (data.length > 0) {
        let startResidue = data[0].position;
        let currentRegion = data[0].region;
        for (let i = 1; i < data.length; i++) {
          const prev = data[i - 1];
          const cur = data[i];
          if (cur.region !== prev.region) {
            regionGroups.push({ region: prev.region, startResidue, endResidue: prev.position });
            startResidue = cur.position;
            currentRegion = cur.region;
          }
        }
        regionGroups.push({
          region: currentRegion,
          startResidue,
          endResidue: data[data.length - 1].position,
        });
      }

      chartSvg
        .selectAll('rect.region-block')
        .data(regionGroups)
        .enter()
        .append('rect')
        .attr('class', 'region-block')
        .attr('x', d => x(d.startResidue.toString())!)
        .attr('y', regionRowY)
        .attr(
          'width',
          d => x(d.endResidue.toString())! + x.bandwidth() - x(d.startResidue.toString())!
        )
        .attr('height', regionBlockHeight)
        .attr('fill', d => regionColorMapping[d.region])
        .on('mouseover', (event, d) => {
          d3.select(event.currentTarget as SVGRectElement)
            .style('stroke', '#000')
            .style('stroke-width', 1);
          showTooltip(event,
            `<strong>Region:</strong> ${d.region}<br/>Positions ${d.startResidue} - ${d.endResidue}`
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
          const leftX = x(d.startResidue.toString())!;
          const rightX = x(d.endResidue.toString())! + x.bandwidth();
          return (leftX + rightX) / 2;
        })
        .attr('y', regionRowY + regionBlockHeight / 2)
        .attr('dominant-baseline', 'middle')
        .text(d => d.region);

      /* ---------- GPCRdb row ---------- */
      chartSvg
        .selectAll('text.gpcrdb')
        .data(data)
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
    }

    return () => {
      // Hide tooltip when component unmounts or data changes
      setTooltip(prev => ({ ...prev, visible: false }));
    };
  }, [cleanedSequences, conservationFile, groupColors, isDarkMode, getResidueColor, height, loadCustomSvgLetter, showTooltip, hideTooltip, updateTooltipPosition]);

  // Additional cleanup effect to remove any lingering tooltips on unmount
  useEffect(() => {
    return () => {
      const oldTooltips = document.querySelectorAll('.logo-tooltip, .conservation-tooltip');
      oldTooltips.forEach(tooltip => tooltip.remove());
    };
  }, []);

  return (
    <div className="bg-card text-card-foreground rounded-lg shadow-md">
      <div className="p-6 border-b border-border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h2 className="text-xl font-semibold text-foreground">Sequence Logo</h2>
          <div className="flex items-center gap-2 mt-2 sm:mt-0">
            {cleanedSequences.length > 0 && (
              <Button onClick={downloadSVG} variant="outline" size="sm">
                Download SVG
              </Button>
            )}
          </div>
        </div>
      </div>
      
      <div className="p-6">
        <div className="relative w-full h-[300px] flex overflow-hidden">
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
  );
};

export default SequenceLogoChart; 