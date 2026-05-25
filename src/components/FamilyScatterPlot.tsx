'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { Axis, BrushBehavior, D3BrushEvent, NumberValue, Selection } from 'd3';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

type MappingPosition = {
  residueCounts?: Record<string, number>;
  totalSequences?: number;
};

type FamilyMapping = {
  positions: Array<MappingPosition | null>;
};

interface Props {
  fastaNames: string[];
  getDisplayName?: (fileName: string) => string;
  onSelectionChange?: (positions: number[]) => void; // 0-based supRep columns
  height?: number;
  selectedFamilies?: string[]; // file base names matching fastaNames; if provided, limit data to these
  minConservationThreshold?: number; // Filter threshold from parent
  minFamiliesCount?: number; // Minimum families count from parent
}

// Map file base to family key used by public/mappings/*.json
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
  'STE3_genes_filtered_db_FAMSA.ref_trimmed': 'STE3',
  'Vomeronasal1_genes_filtered_db_FAMSA.ref_trimmed': 'Vomeronasal1',
  'Vomeronasal2_genes_filtered_db_FAMSA.ref_trimmed': 'Vomeronasal2',
  'Mth_genes_filtered_db_FAMSA.ref_trimmed': 'Mth',
  'Nematode_genes_filtered_db_FAMSA.ref_trimmed': 'Nematode'
};

// Similarity groups (match logic consistent with PairwiseOverlap)
const matchingGroups: Record<string, string[]> = {
  acidic: ['E', 'D'],
  aromatic: ['W', 'Y', 'H', 'F'],
  basic: ['R', 'K'],
  polar: ['Q', 'N'],
  hydrophobic_vi: ['V', 'I'],
  hydrophobic_ml: ['M', 'L']
};

type ScatterPoint = {
  pos: number; // 0-based supRep column
  entropy: number; // x-axis
  avgConservation: number; // y-axis, percent 0..100
  familiesUsed: number;
};

type AxisGroupSelection = Selection<SVGGElement, unknown, null, undefined>;

const FamilyScatterPlot: React.FC<Props> = ({ fastaNames, onSelectionChange, height = 260, selectedFamilies, minConservationThreshold = 0, minFamiliesCount = 0 }) => {
  const [mappings, setMappings] = useState<Record<string, FamilyMapping>>({});
  const [selectedPositions, setSelectedPositions] = useState<Set<number>>(new Set());
  const [useThresholdMode, setUseThresholdMode] = useState(false);
  const [threshold, setThreshold] = useState<number>(70);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Detect dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    checkDarkMode();
    
    // Watch for dark mode changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    
    return () => observer.disconnect();
  }, []);

  // Load mapping JSONs for included families
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const entries = await Promise.all(
          fastaNames.map(async (fileBase) => {
            const fam = fileBaseToFamily[fileBase];
            if (!fam) return null;
            try {
              const res = await fetch(`/mappings/${fam}.json`);
              if (!res.ok) return null;
              const data = (await res.json()) as FamilyMapping;
              return [fam, data] as const;
            } catch {
              return null;
            }
          })
        );
        if (cancelled) return;
        const map: Record<string, FamilyMapping> = {};
        entries.forEach((e) => {
          if (e) map[e[0]] = e[1];
        });
        setMappings(map);
      } catch {
        if (!cancelled) setMappings({});
      }
    };
    load();
    return () => { cancelled = true; };
  }, [fastaNames]);

  // Compute scatter data
  const points: ScatterPoint[] = useMemo(() => {
    // Derive which family keys to use based on optional selection
    let families = Object.keys(mappings);
    if (selectedFamilies && selectedFamilies.length > 0) {
      const selectedFamilyKeys = new Set(
        selectedFamilies
          .map((f) => fileBaseToFamily[f])
          .filter((v): v is string => Boolean(v))
      );
      families = families.filter((fam) => selectedFamilyKeys.has(fam));
    }
    if (families.length === 0) return [];

    // Determine max positions across mappings
    const maxLen = Math.max(
      ...families.map((fam) => (mappings[fam]?.positions?.length || 0))
    );

    const out: ScatterPoint[] = [];
    for (let pos = 0; pos < maxLen; pos++) {
      const modeSymbols: string[] = [];
      const familyConservations: number[] = [];

      families.forEach((fam) => {
        const p = mappings[fam]?.positions?.[pos] || null;
        if (!p) return;
        const residueCounts = p.residueCounts || {};
        const total = p.totalSequences || 0;
        if (total <= 0) return;

        // Compute gap count (gaps are not in residueCounts)
        const aaSum = Object.values(residueCounts).reduce((a, b) => a + b, 0);
        const gapCount = Math.max(0, total - aaSum);

        // Find most conserved amino acid among AAs
        let topAA = '';
        let topAACount = 0;
        Object.entries(residueCounts).forEach(([aa, cnt]) => {
          if (cnt > topAACount) {
            topAA = aa;
            topAACount = cnt;
          }
        });

        // Similarity-aware conservation frequency (percent) using topAA's group
        let similarCount = topAACount;
        const group = Object.values(matchingGroups).find((g) => g.includes(topAA));
        if (group) {
          group.forEach((aa) => {
            if (aa !== topAA && residueCounts[aa]) similarCount += residueCounts[aa];
          });
        }
        const conservationPercent = (similarCount / total) * 100;
        familyConservations.push(conservationPercent);

        // Mode including gap symbol '-'
        const modeIsGap = gapCount >= topAACount;
        modeSymbols.push(modeIsGap ? '-' : topAA);
      });

      const n = familyConservations.length;
      if (n === 0) continue;

      let avgCons: number;
      if (useThresholdMode) {
        // Return actual count of conserved families, not percentage
        const conservedCount = familyConservations.filter((v) => v >= threshold).length;
        avgCons = conservedCount;
      } else {
        avgCons = familyConservations.reduce((a, b) => a + b, 0) / n;
      }

      // Shannon entropy on the distribution of modeSymbols across families
      const counts: Record<string, number> = {};
      modeSymbols.forEach((s) => { counts[s] = (counts[s] || 0) + 1; });
      let entropy = 0;
      Object.values(counts).forEach((c) => {
        const p = c / modeSymbols.length;
        if (p > 0) entropy -= p * Math.log2(p);
      });

      out.push({ pos, entropy, avgConservation: avgCons, familiesUsed: n });
    }

    return out;
  }, [mappings, selectedFamilies, useThresholdMode, threshold]);

  // Compute which points meet the filter criteria from parent
  const filteredPointsSet = useMemo(() => {
    const filtered = new Set<number>();
    points.forEach((point) => {
      // Check min conservation threshold (only for non-threshold mode)
      if (!useThresholdMode && point.avgConservation < minConservationThreshold) {
        return; // Skip this point
      }
      
      // Check min families count
      // In threshold mode, avgConservation is the count of conserved families
      // In regular mode, we need to check if enough families exist
      if (useThresholdMode) {
        if (point.avgConservation < minFamiliesCount) {
          return; // Skip this point
        }
      } else {
        // In regular mode, check if this position has data from enough families
        if (point.familiesUsed < minFamiliesCount) {
          return; // Skip this point
        }
      }
      
      filtered.add(point.pos);
    });
    return filtered;
  }, [points, minConservationThreshold, minFamiliesCount, useThresholdMode]);

  // Render scatter with brush
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    if (points.length === 0) return;

    const margin = { top: 20, right: 20, bottom: 70, left: 56 };
    // Enforce square plotting area: innerWidth == innerHeight
    const innerSide = Math.max(100, Math.min(height - margin.top - margin.bottom, 640));
    const width = innerSide + margin.left + margin.right;
    const innerWidth = innerSide;
    const innerHeight = innerSide;

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const maxEntropy = Math.log2(21); // 20 AA + gap
    const x = d3.scaleLinear().domain([0, maxEntropy]).range([0, innerWidth]).nice();
    
    // Calculate max families from selected families or all families in mappings
    let maxFamilies = Object.keys(mappings).length;
    if (selectedFamilies && selectedFamilies.length > 0) {
      const selectedFamilyKeys = selectedFamilies
        .map((f) => fileBaseToFamily[f])
        .filter((v): v is string => Boolean(v));
      maxFamilies = selectedFamilyKeys.length;
    }
    
    // Y-axis: use actual count range if in threshold mode, else percentage
    const yDomain = useThresholdMode ? [0, maxFamilies] : [0, 100];
    const y = d3.scaleLinear().domain(yDomain).range([innerHeight, 0]).nice();

    const xAxis: Axis<NumberValue> = d3.axisBottom(x).ticks(6);
    const yAxis: Axis<NumberValue> = d3.axisLeft(y).ticks(5);

    const xAxisGroup = g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call((g) => g.select('.domain').attr('stroke-width', 2)) // Thicker axis line
      .call((g) => g.selectAll('.tick line').attr('stroke-width', 1.5)) // Thicker tick lines
      .call((g) => g.selectAll('.tick text').style('font-size', '13px')); // Larger tick labels
    
    // X-axis label (two lines)
    const xLabel = xAxisGroup.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', 38)
      .attr('text-anchor', 'middle')
      .attr('fill', 'currentColor')
      .style('font-size', '14px')
      .style('font-weight', '500');
    
    xLabel.append('tspan')
      .attr('x', innerWidth / 2)
      .attr('dy', 0)
      .text("Shannon's entropy");
    
    xLabel.append('tspan')
      .attr('x', innerWidth / 2)
      .attr('dy', '1.2em')
      .text('(Sequence Divergence Across Families)');

    g.append('g')
      .call(yAxis)
      .call((g) => g.select('.domain').attr('stroke-width', 2)) // Thicker axis line
      .call((g) => g.selectAll('.tick line').attr('stroke-width', 1.5)) // Thicker tick lines
      .call((g) => g.selectAll('.tick text').style('font-size', '13px')) // Larger tick labels
      .call((ay: AxisGroupSelection) => ay.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -innerHeight / 2)
        .attr('y', -44)
        .attr('text-anchor', 'middle')
        .attr('fill', 'currentColor')
        .style('font-size', '14px')
        .style('font-weight', '500')
        .text(useThresholdMode ? '# of Conserved Families' : 'Average Family Conservation (%)'));

    // Points - use different colors for light/dark mode
    const pointColor = isDarkMode ? '#DBD6F9' : '#434E71';
    const greyColor = isDarkMode ? '#6B7280' : '#9CA3AF'; // muted grey color
    
    g.selectAll('circle.point')
      .data(points)
      .enter()
      .append('circle')
      .attr('class', 'point')
      .attr('cx', (d) => x(d.entropy))
      .attr('cy', (d) => y(d.avgConservation))
      .attr('r', 3)
      .attr('fill', (d) => {
        // First check if point passes filter criteria from parent
        const passesFilter = filteredPointsSet.has(d.pos);
        
        // If there's a brush selection, consider both filter and selection
        if (selectedPositions.size > 0) {
          const isSelected = selectedPositions.has(d.pos);
          // Point must pass filter AND be selected to show in color
          return (passesFilter && isSelected) ? pointColor : greyColor;
        }
        
        // Otherwise, show filtered points in color, non-filtered in grey
        return passesFilter ? pointColor : greyColor;
      })
      .attr('opacity', (d) => {
        const passesFilter = filteredPointsSet.has(d.pos);
        
        // If there's a selection, check both filter and selection
        if (selectedPositions.size > 0) {
          const isSelected = selectedPositions.has(d.pos);
          return (passesFilter && isSelected) ? 0.8 : 0.5;
        }
        
        // Otherwise, filtered points are more opaque
        return passesFilter ? 0.8 : 0.5;
      })
      .append('title')
      .text((d) => {
        const consText = useThresholdMode 
          ? `Conserved: ${d.avgConservation}` 
          : `Avg cons: ${d.avgConservation.toFixed(1)}%`;
        return `Position: ${d.pos + 1}\nEntropy: ${d.entropy.toFixed(2)}\n${consText}\nFamilies: ${d.familiesUsed}`;
      });

    // Brush
    const brush: BrushBehavior<unknown> = d3.brush()
      .extent([[0, 0], [innerWidth, innerHeight]])
      .on('end', (event: D3BrushEvent<unknown>) => {
        const sel = event.selection as [[number, number], [number, number]] | null;
        if (!sel) {
          setSelectedPositions(new Set());
          onSelectionChange?.([]);
          return;
        }
        const [[x0, y0], [x1, y1]] = sel;
        const chosen = points
          .filter((d) => {
            const px = x(d.entropy);
            const py = y(d.avgConservation);
            return px >= x0 && px <= x1 && py >= y0 && py <= y1;
          })
          .map((d) => d.pos);
        const set = new Set<number>(chosen);
        setSelectedPositions(set);
        
        // Only pass positions that also meet filter criteria
        const filteredChosen = chosen.filter(pos => filteredPointsSet.has(pos));
        onSelectionChange?.(filteredChosen);
      });

    g.append('g').attr('class', 'brush').call(brush);
  }, [points, height, onSelectionChange, isDarkMode, selectedPositions, useThresholdMode, filteredPointsSet, mappings, selectedFamilies]);

  const clearSelection = () => {
    setSelectedPositions(new Set());
    onSelectionChange?.([]);
  };

  const downloadSVG = () => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    // Clone the SVG
    const svgClone = svgElement.cloneNode(true) as SVGElement;
    
    // Convert to string
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svgClone);
    
    // Add XML declaration
    svgString = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgString;
    
    // Create blob and download
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `scatter-plot-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold mb-1">Sequence Divergence vs Conservation</h3>
        <button
          type="button"
          onClick={downloadSVG}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm hover:bg-accent"
        >
          <Download className="h-4 w-4" />
          Download SVG
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useThresholdMode}
            onChange={(e) => setUseThresholdMode(e.target.checked)}
            className="rounded border-gray-300 text-primary focus:ring-primary"
          />
          Binary conservation
        </label>
        <div className="flex items-center gap-2 text-sm">
          <span>Threshold:</span>
          <input
            type="number"
            min={0}
            max={100}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-20 rounded border px-2 py-1"
          />
          <span>%</span>
        </div>
        <Button variant="outline" size="sm" onClick={clearSelection} disabled={selectedPositions.size === 0}>
          Clear Selection
        </Button>
      </div>
      <div className="mb-2">
        <div className="text-sm text-foreground">
          Selected positions: {selectedPositions.size}
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg ref={svgRef} />
      </div>
    </div>
  );
};

export default FamilyScatterPlot;


