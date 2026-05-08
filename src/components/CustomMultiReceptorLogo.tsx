'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as d3 from 'd3';
import { Download } from 'lucide-react';

interface ResidueMapping {
  [key: string]: string;
}

interface PositionLogoData {
  position: number;
  receptorPosition: number;
  residueCounts: Record<string, number>;
  totalSequences: number;
  informationContent: number;
  letterHeights: Record<string, number>;
  humanAA: string;
  gpcrdb: string;
  receptorGpcrdb: string;
  region: string;
}

interface ReceptorLogoData {
  receptorName: string;
  logoData: PositionLogoData[];
}

interface CustomMultiReceptorLogoProps {
  resultData: ResidueMapping[];
  receptorNames: string[];
  referenceReceptor: string;
  alignmentData: Record<string, { header: string; sequence: string }[]>; // In-memory alignment data
}

const aminoAcidGroups = {
  aromatic: { residues: ['W', 'Y', 'H', 'F'], color: '#FCB315', label: 'Aromatic (WYHF)' },
  polar: { residues: ['S', 'T', 'Q', 'N'], color: '#7D2985', label: 'Polar (STQN)' },
  small: { residues: ['P', 'G', 'A'], color: '#231F20', label: 'Small (PGA)' },
  acidic: { residues: ['E', 'D'], color: '#DD6030', label: 'Acidic (ED)' },
  basic: { residues: ['R', 'K'], color: '#7CAEC4', label: 'Basic (RK)' },
  hydrophobic: { residues: ['V', 'C', 'I', 'M', 'L'], color: '#B4B4B4', label: 'Hydrophobic (VCIML)' }
};

type RegionGroup = { region: string; startPosition: number; endPosition: number };

const CustomMultiReceptorLogo: React.FC<CustomMultiReceptorLogoProps> = ({ 
  resultData, 
  receptorNames, 
  referenceReceptor,
  alignmentData
}) => {
  const yAxisContainerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    content: string;
  }>({ visible: false, x: 0, y: 0, content: '' });

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

  const [groupColors, setGroupColors] = useState(() => {
    const colors: Record<string, string> = {};
    Object.entries(aminoAcidGroups).forEach(([key, group]) => {
      colors[key] = group.color;
    });
    return colors;
  });

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

  const handleColorChange = (groupKey: string, newColor: string) => {
    setGroupColors(prev => ({ ...prev, [groupKey]: newColor }));
  };

  const resetColors = () => {
    const defaultColors: Record<string, string> = {};
    Object.entries(aminoAcidGroups).forEach(([key, group]) => {
      defaultColors[key] = group.color;
    });
    setGroupColors(defaultColors);
  };

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

  const svgPathCache = useRef<Record<string, { path: string; viewBox: string; transformAttr?: string }>>({});

  interface LetterSvgData { path: string; viewBox: string; transformAttr?: string }

  const loadCustomSvgLetter = useCallback(async (letter: string): Promise<LetterSvgData | null> => {
    if (svgPathCache.current[letter]) {
      return svgPathCache.current[letter];
    }

    try {
      const response = await fetch(`/tight_caps/${letter}.svg`);
      if (!response.ok) return null;

      const svgContent = await response.text();
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
      
      if (svgDoc.querySelector('parsererror')) return null;

      const originalSvg = svgDoc.querySelector('svg');
      const pathElement = svgDoc.querySelector('path');

      if (!originalSvg || !pathElement) return null;

      const viewBox = originalSvg.getAttribute('viewBox') || '0 0 100 100';
      const pathData = pathElement.getAttribute('d') || '';
      const transformAttr = pathElement.getAttribute('transform') || undefined;

      const result: LetterSvgData = { path: pathData, viewBox, transformAttr };
      svgPathCache.current[letter] = result;
      return result;
    } catch {
      return null;
    }
  }, []);

  // Clean alignment data (remove gaps from human sequence)
  const cleanedAlignmentData = useMemo(() => {
    const cleaned: Record<string, { header: string; sequence: string }[]> = {};
    
    Object.entries(alignmentData).forEach(([receptorName, sequences]) => {
      if (sequences.length > 0) {
        const humanSequence = sequences[0].sequence;
        const gapPositions = new Set<number>();
        
        for (let i = 0; i < humanSequence.length; i++) {
          if (humanSequence[i] === '-') {
            gapPositions.add(i);
          }
        }
        
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

  const calculatePositionLogoData = useCallback((position: number, sequences: string[]): {
    informationContent: number;
    letterHeights: Record<string, number>;
    residueCounts: Record<string, number>;
    totalSequences: number;
  } => {
    const residueCounts: Record<string, number> = {};
    let gapCount = 0;
    let nonGapSequences = 0;
    
    const standardAA = 'ACDEFGHIKLMNPQRSTVWY';
    const totalSequencesInAlignment = sequences.length;
    
    sequences.forEach(seq => {
      const residue = seq[position]?.toUpperCase();
      if (residue && standardAA.includes(residue)) {
        residueCounts[residue] = (residueCounts[residue] || 0) + 1;
        nonGapSequences++;
      } else {
        gapCount++;
      }
    });
    
    if (nonGapSequences === 0) return { 
      informationContent: 0, 
      letterHeights: {}, 
      residueCounts: {},
      totalSequences: totalSequencesInAlignment
    };
    
    const frequencies: Record<string, number> = {};
    Object.keys(residueCounts).forEach(residue => {
      frequencies[residue] = residueCounts[residue] / totalSequencesInAlignment;
    });
    
    if (gapCount > 0) {
      frequencies['-'] = gapCount / totalSequencesInAlignment;
    }
    
    let entropy = 0;
    Object.values(frequencies).forEach(freq => {
      if (freq > 0) {
        entropy -= freq * Math.log2(freq);
      }
    });
    
    const maxBits = Math.log2(21);
    const informationContent = Math.max(0, maxBits - entropy);
    
    const letterHeights: Record<string, number> = {};
    Object.keys(residueCounts).forEach(residue => {
      letterHeights[residue] = frequencies[residue] * informationContent;
    });
    
    return { informationContent, letterHeights, residueCounts, totalSequences: totalSequencesInAlignment };
  }, []);

  const processReceptorData = useCallback((): ReceptorLogoData[] => {
    if (!resultData.length || !receptorNames.length) return [];

    return receptorNames.map(receptorName => {
      const cleanedSequences = cleanedAlignmentData[receptorName] || [];
      
      if (!cleanedSequences.length) {
        return { receptorName, logoData: [] };
      }

      const logoData: PositionLogoData[] = [];
      
      resultData.forEach((row) => {
        const resNum = row[`${receptorName}_resNum`];
        const receptorAA = row[`${receptorName}_AA`];
        const referenceResNum = row[`${referenceReceptor}_resNum`];
        const referenceAA = row[`${referenceReceptor}_AA`];
        
        if (!resNum || resNum === '-' || !receptorAA || receptorAA === '-') return;
        if (!referenceResNum || referenceResNum === '-' || !referenceAA || referenceAA === '-') return;

        const referencePosition = parseInt(referenceResNum);
        const receptorPosition = parseInt(resNum);
        
        const seqIndex = receptorPosition - 1;
        
        if (seqIndex < 0 || seqIndex >= cleanedSequences[0]?.sequence.length) return;

        const positionLogoData = calculatePositionLogoData(
          seqIndex, 
          cleanedSequences.map((s: { header: string; sequence: string }) => s.sequence)
        );

        const receptorGpcrdb = row[`${receptorName}_gpcrdb`] || `${receptorPosition}`;
        const region = row[`${receptorName}_region`] || 'N/A';
        const gpcrdb = row[`${referenceReceptor}_gpcrdb`] || `${referencePosition}`;
        const humanAA = cleanedSequences[0]?.sequence[seqIndex]?.toUpperCase() || receptorAA;

        logoData.push({
          position: referencePosition,
          receptorPosition: receptorPosition,
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

      return { receptorName, logoData };
    });
  }, [resultData, receptorNames, cleanedAlignmentData, referenceReceptor, calculatePositionLogoData]);

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

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(combinedSvg);
    const svgWithDeclaration = `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;

    const blob = new Blob([svgWithDeclaration], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const fileName = `custom_multi_receptor_logo.svg`;
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
    let cancelled = false;

    const oldTooltips = document.querySelectorAll('.logo-tooltip, .conservation-tooltip');
    oldTooltips.forEach(tooltip => tooltip.remove());

    yAxisContainer.innerHTML = '';
    chartContainer.innerHTML = '';

    if (!resultData.length || !receptorNames.length) {
      return;
    }

    const receptorData = processReceptorData();
    if (!receptorData.length || !receptorData[0].logoData.length) return;

    const residuesToPreload = Array.from(
      new Set(
        receptorData.flatMap(data =>
          data.logoData.flatMap(positionData => Object.keys(positionData.letterHeights))
        )
      )
    );

    Promise.all(residuesToPreload.map(residue => loadCustomSvgLetter(residue))).then(() => {
      if (cancelled) return;
      renderChart(receptorData);
    });

    function renderChart(data: ReceptorLogoData[]) {
      if (cancelled) return;
      if (!yAxisContainer || !chartContainer) return;

      const margin = { top: 20, right: 20, bottom: 20, left: 20 };
      const yAxisWidth = 120;
      const barWidthEstimate = 18;
      const maxPositions = Math.max(...data.map(d => d.logoData.length));
      const totalWidth = maxPositions * barWidthEstimate + margin.left + margin.right;
      
      const infoRowHeight = 20;
      const regionBlockHeight = 22;
      const gapBetweenReceptors = 15;
      
      const logoAreaHeight = 150;
      const totalHeight = (logoAreaHeight + gapBetweenReceptors) * data.length - gapBetweenReceptors + 
                         infoRowHeight + regionBlockHeight + margin.top + margin.bottom + 8;

      const pastelColors = ['#FFFACD', '#E6E6FA'];

      const referenceData = data.find(d => d.receptorName === referenceReceptor) || data[0];
      const regionColorMapping: Record<string, string> = {};
      let colorIndex = 0;
      referenceData.logoData.forEach(d => {
        if (!(d.region in regionColorMapping)) {
          regionColorMapping[d.region] = pastelColors[colorIndex % pastelColors.length];
          colorIndex += 1;
        }
      });

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

      const positions = referenceData.logoData.map(d => d.position.toString());
      const x = d3
        .scaleBand<string>()
        .domain(positions)
        .range([0, totalWidth])
        .paddingInner(0.05);

      const yDomainMax = 4.32;
      const y = d3.scaleLinear().domain([0, yDomainMax]).range([logoAreaHeight, 0]);

      data.forEach((receptorData, receptorIndex) => {
        const receptorY = margin.top + receptorIndex * (logoAreaHeight + gapBetweenReceptors);
        
        const yAxis = d3.axisLeft(y).ticks(5).tickFormat(d => `${Number(d).toFixed(1)}`);
        yAxisSvg
          .append('g')
          .attr('transform', `translate(${yAxisWidth - 1}, ${receptorY})`)
          .attr('class', 'axis text-foreground')
          .call(yAxis)
          .selectAll('text')
          .style('font-size', '12px');

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

      data.forEach((receptorData, receptorIndex) => {
        const receptorY = margin.top + receptorIndex * (logoAreaHeight + gapBetweenReceptors);
        
        receptorData.logoData.forEach((d) => {
          const positionX = x(d.position.toString())!;
          const positionWidth = x.bandwidth();
          
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
                } catch {
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

      const infoStartY = margin.top + data.length * (logoAreaHeight + gapBetweenReceptors) - gapBetweenReceptors;
      
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
      cancelled = true;
      yAxisContainer.innerHTML = '';
      chartContainer.innerHTML = '';
      setTooltip(prev => ({ ...prev, visible: false }));
    };
  }, [resultData, receptorNames, referenceReceptor, groupColors, isDarkMode, processReceptorData, getResidueColor, loadCustomSvgLetter, showTooltip, hideTooltip, updateTooltipPosition]);

  if (!resultData.length || !receptorNames.length) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto bg-card text-card-foreground rounded-lg p-6 shadow-md">
      <h2 className="text-2xl font-bold mb-4">Multi-Receptor Sequence Logos</h2>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <button
            type="button"
            onClick={downloadSVG}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm hover:bg-accent"
          >
            <Download className="h-4 w-4" />
            Download SVG
          </button>
        </div>
      </div>
    
      <div 
        className="relative w-full flex overflow-hidden mb-4" 
        style={{ 
          height: `${(150 + 15) * receptorNames.length - 15 + 40 + 22 + 40 + 8}px`,
          opacity: 1,
        }}
      >
        <div ref={yAxisContainerRef} className="flex-shrink-0 z-10 bg-card" />
        <div className="flex-grow overflow-x-auto">
          <div ref={chartContainerRef} className="h-full" />
        </div>
      </div>
    
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

export default CustomMultiReceptorLogo;







