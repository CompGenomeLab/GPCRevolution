'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import type { NumberValue } from 'd3';

export interface ConservationDatum {
  residue: number;
  conservation: number;
  conservedAA: string;
  humanAA: string;
  region: string;
  gpcrdb: string;
}

type RegionGroup = { region: string; startResidue: number; endResidue: number };

interface ConservationChartProps {
  conservationFile: string | null;
  /** Callback fired once the chart data has loaded (success or error). */
  onLoaded?: () => void;
  /** Height of the overall card (px). Default 242. */
  height?: number;
}

/**
 * Single self-contained component that fetches conservation data and renders the
 * residue conservation bar plot. It replaces the previous two-component
 * (ConservationChart + ConservationChartAsync) architecture.
 */
const ConservationChart: React.FC<ConservationChartProps> = ({ conservationFile, onLoaded, height = 242 }) => {
  /* ----------------------------------------------------------------------- */
  /* 1. Data loading state                                                   */
  /* ----------------------------------------------------------------------- */
  const [conservationData, setConservationData] = useState<ConservationDatum[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasCalledLoadedRef = useRef(false);
  const loadStartRef = useRef<number | null>(null);

  useEffect(() => {
    // Reset state whenever a new file is supplied
    setConservationData(null);
    setError(null);
    hasCalledLoadedRef.current = false;
    loadStartRef.current = Date.now();

    if (!conservationFile) return;

    setIsLoading(true);

    fetch(`/${conservationFile}`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to fetch conservation data: ${res.status}`);
        return res.text();
      })
      .then(text => {
        const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('residue'));
        const parsed: ConservationDatum[] = lines.map(line => {
          const [resStr, consStr, conservedAA, humanAA, region, gpcrdb] = line.trim().split(/\s+/);
          return {
            residue: +resStr,
            conservation: +consStr,
            conservedAA,
            humanAA,
            region,
            gpcrdb,
          };
        });
        setConservationData(parsed);
      })
      .catch(err => {
        console.error('Error loading conservation data:', err);
        setError(err.message);
      })
      .finally(() => setIsLoading(false));
  }, [conservationFile]);

  /* Notify parent once loading completes (success or failure) ------------- */
  useEffect(() => {
    if (hasCalledLoadedRef.current) return;
    const done = !isLoading && conservationFile && (conservationData !== null || error !== null);
    if (done) {
      // Ensure at least 1 s loading time so skeleton does not flicker
      const elapsed = loadStartRef.current ? Date.now() - loadStartRef.current : 0;
      const remaining = Math.max(0, 1000 - elapsed);
      hasCalledLoadedRef.current = true;
      window.setTimeout(() => onLoaded?.(), remaining);
    }
  }, [isLoading, conservationData, error, conservationFile, onLoaded]);

  /* ----------------------------------------------------------------------- */
  /* 2. Tooltip helpers                                                      */
  /* ----------------------------------------------------------------------- */
  const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; content: string }>({
    visible: false,
    x: 0,
    y: 0,
    content: '',
  });

  const showTooltip = useCallback((event: PointerEvent, content: string) => {
    setTooltip({ visible: true, x: event.clientX, y: event.clientY, content });
  }, []);

  const hideTooltip = useCallback(() => setTooltip(prev => ({ ...prev, visible: false })), []);
  const updateTooltipPosition = useCallback((event: PointerEvent) => {
    setTooltip(prev => ({ ...prev, x: event.clientX, y: event.clientY }));
  }, []);

  /* ----------------------------------------------------------------------- */
  /* 3. Refs for D3 drawing containers                                       */
  /* ----------------------------------------------------------------------- */
  const yAxisContainerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  /* ----------------------------------------------------------------------- */
  /* 4. D3 rendering                                                         */
  /* ----------------------------------------------------------------------- */
  useEffect(() => {
    const yAxisContainer = yAxisContainerRef.current;
    const chartContainer = chartContainerRef.current;
    if (!yAxisContainer || !chartContainer) return;

    // Clear old content / tooltips
    yAxisContainer.innerHTML = '';
    chartContainer.innerHTML = '';
    const oldTooltips = document.querySelectorAll('.logo-tooltip, .conservation-tooltip');
    oldTooltips.forEach(t => t.remove());

    if (!conservationData || conservationData.length === 0) return;

    /* ---------- Layout constants ---------- */
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const yAxisWidth = 80;
    const totalHeight = height;
    const barWidthEstimate = 12.35;
    const totalWidth = conservationData.length * barWidthEstimate + margin.left + margin.right;
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
    let colorIdx = 0;
    conservationData.forEach(d => {
      if (!(d.region in regionColorMapping)) {
        regionColorMapping[d.region] = pastelColors[colorIdx % pastelColors.length];
        colorIdx += 1;
      }
    });

    /* ---------- SVG containers ---------- */
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

    /* ---------- Scales ---------- */
    const x = d3
      .scaleBand<string>()
      .domain(conservationData.map(d => d.residue.toString()))
      .range([0, totalWidth])
      .paddingInner(0.05);

    const y = d3.scaleLinear().domain([0, 100]).range([margin.top + chartAreaHeight, margin.top]);

    /* ---------- Y-axis ---------- */
    const yAxis = d3.axisLeft(y).ticks(5).tickFormat((d: NumberValue) => `${d}%`);
    yAxisSvg
      .append('g')
      .attr('transform', `translate(${yAxisWidth - 1},0)`) // +1 to cover bar edge
      .attr('class', 'axis text-foreground')
      .call(yAxis)
      .selectAll('text')
      .style('font-size', '12px');

    const yLabel = yAxisSvg
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('transform', `translate(${yAxisWidth - 65},${margin.top + chartAreaHeight / 2}) rotate(-90)`)
      .attr('class', 'text-foreground fill-current')
      .style('font-size', '14px');
    yLabel.append('tspan').attr('x', 0).text('Orthologous');
    yLabel.append('tspan').attr('x', 0).attr('dy', '1.2em').text('Conservation');

    /* ---------- Bars ---------- */
    chartSvg
      .selectAll('rect.bar')
      .data(conservationData)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('fill', '#424874')
      .attr('x', d => x(d.residue.toString())!)
      .attr('y', d => y(d.conservation))
      .attr('width', x.bandwidth())
      .attr('height', d => y(0) - y(d.conservation))
      .on('mouseover', (event, d) => {
        showTooltip(event as unknown as PointerEvent,
          `<strong>Residue #:</strong> ${d.residue}<br/>` +
            `<strong>Conservation %:</strong> ${d.conservation}%<br/>` +
            `<strong>Conserved AA:</strong> ${d.conservedAA}<br/>` +
            `<strong>Human AA:</strong> ${d.humanAA}<br/>` +
            `<strong>Region:</strong> ${d.region}<br/>` +
            `<strong>GPCRdb #:</strong> ${d.gpcrdb}`
        );
      })
      .on('mousemove', event => updateTooltipPosition(event as unknown as PointerEvent))
      .on('mouseout', hideTooltip);

    /* ---------- Bar outlines (for dark mode) ---------- */
    chartSvg
      .selectAll('path.bar-outline')
      .data(conservationData)
      .enter()
      .append('path')
      .attr('class', 'bar-outline')
      .attr('fill', 'none')
      .attr('stroke', '#FFFFFF')
      .attr('stroke-width', 1)
      .attr('d', d => {
        if (d.conservation === 0) return '';
        const barX = x(d.residue.toString())!;
        const barY = y(d.conservation);
        const barW = x.bandwidth();
        const barH = y(0) - y(d.conservation);
        return `M ${barX} ${barY + barH} L ${barX} ${barY} L ${barX + barW} ${barY} L ${barX + barW} ${barY + barH}`;
      })
      .attr('pointer-events', 'none');

    /* ---------- Info rows ---------- */
    const humanRowY = margin.top + chartAreaHeight + 4;
    chartSvg
      .selectAll('text.human-aa')
      .data(conservationData)
      .enter()
      .append('text')
      .attr('class', 'human-aa text-foreground fill-current')
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .attr('x', d => x(d.residue.toString())! + x.bandwidth() / 2)
      .attr('y', humanRowY + infoRowHeight / 2)
      .attr('dominant-baseline', 'middle')
      .text(d => d.humanAA);

    const gpcrRowY = humanRowY + infoRowHeight + gapBetweenInfoRows;
    const regionRowY = gpcrRowY + infoRowHeight + gapBeforeRegion;

    /* ---------- Region grouping ---------- */
    const regionGroups: RegionGroup[] = [];
    if (conservationData.length) {
      let startResidue = conservationData[0].residue;
      let currentRegion = conservationData[0].region;
      for (let i = 1; i < conservationData.length; i++) {
        const prev = conservationData[i - 1];
        const cur = conservationData[i];
        if (cur.region !== prev.region) {
          regionGroups.push({ region: prev.region, startResidue, endResidue: prev.residue });
          startResidue = cur.residue;
          currentRegion = cur.region;
        }
      }
      regionGroups.push({ region: currentRegion, startResidue, endResidue: conservationData[conservationData.length - 1].residue });
    }

    /* ---------- Region blocks ---------- */
    chartSvg
      .selectAll('rect.region-block')
      .data(regionGroups)
      .enter()
      .append('rect')
      .attr('class', 'region-block')
      .attr('x', d => x(d.startResidue.toString())!)
      .attr('y', regionRowY)
      .attr('width', d => x(d.endResidue.toString())! + x.bandwidth() - x(d.startResidue.toString())!)
      .attr('height', regionBlockHeight)
      .attr('fill', d => regionColorMapping[d.region])
      .on('mouseover', (event, d) => {
        d3.select(event.currentTarget as SVGRectElement).style('stroke', '#000').style('stroke-width', 1);
        showTooltip(event as unknown as PointerEvent, `<strong>Region:</strong> ${d.region}<br/>Residues ${d.startResidue} – ${d.endResidue}`);
      })
      .on('mousemove', event => updateTooltipPosition(event as unknown as PointerEvent))
      .on('mouseout', event => {
        d3.select(event.currentTarget as SVGRectElement).style('stroke', 'none');
        hideTooltip();
      });

    /* ---------- Region labels ---------- */
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
        const left = x(d.startResidue.toString())!;
        const right = x(d.endResidue.toString())! + x.bandwidth();
        return (left + right) / 2;
      })
      .attr('y', regionRowY + regionBlockHeight / 2)
      .attr('dominant-baseline', 'middle')
      .text(d => d.region);

    /* ---------- GPCRdb row (drawn last for stacking) ---------- */
    chartSvg
      .selectAll('text.gpcrdb')
      .data(conservationData)
      .enter()
      .append('text')
      .attr('class', 'gpcrdb text-foreground fill-current')
      .style('font-size', '12px')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('transform', d => {
        const cx = x(d.residue.toString())! + x.bandwidth() / 2;
        const cy = gpcrRowY + infoRowHeight / 2;
        return `translate(${cx}, ${cy}) rotate(-90)`;
      })
      .text(d => d.gpcrdb);

    /* Cleanup on unmount -------------------------------------------------- */
    return () => {
      setTooltip(prev => ({ ...prev, visible: false }));
    };
  }, [conservationData, height, showTooltip, hideTooltip, updateTooltipPosition]);

  /* Remove lingering tooltips when component unmounts --------------------- */
  useEffect(() => () => {
    document.querySelectorAll('.logo-tooltip, .conservation-tooltip').forEach(t => t.remove());
  }, []);

  /* ----------------------------------------------------------------------- */
  /* 5. Render states                                                        */
  /* ----------------------------------------------------------------------- */
  if (!conservationFile) return null;

  if (isLoading) {
    return (
      <div className="rounded-lg bg-card p-6 shadow-md">
        <div className="space-y-4 animate-pulse">
          <div className="h-6 w-48 rounded bg-muted" />
          <div className="h-64 w-full rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-card p-6 shadow-md">
        <h2 className="mb-4 text-xl font-semibold text-foreground">Conservation Chart</h2>
        <div className="p-4 text-center text-muted-foreground">Failed to load conservation data: {error}</div>
      </div>
    );
  }

  if (!conservationData || conservationData.length === 0) {
    return (
      <div className="rounded-lg bg-card p-6 shadow-md">
        <h2 className="mb-4 text-xl font-semibold text-foreground">Conservation Chart</h2>
        <div className="p-4 text-center text-muted-foreground">No conservation data available</div>
      </div>
    );
  }

  /* ----------------------------------------------------------------------- */
  /* 6. Main rendered chart ------------------------------------------------- */
  /* ----------------------------------------------------------------------- */
  return (
    <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
      <h2 className="mb-4 text-xl font-semibold text-foreground">Residue Conservation Bar Plot</h2>
      <div className="relative flex h-[300px] w-full overflow-hidden">
        <div ref={yAxisContainerRef} className="z-10 flex-shrink-0 bg-card" />
        <div className="flex-grow overflow-x-auto">
          <div ref={chartContainerRef} className="h-full" />
        </div>
      </div>

      {/* Tooltip */}
      {tooltip.visible && (
        <div
          className="fixed z-40 pointer-events-none break-words rounded border border-gray-300 bg-white px-2 py-1 text-xs leading-tight shadow-lg dark:border-gray-600 dark:bg-black dark:text-white sm:max-w-sm sm:text-sm"
          style={{
            left: Math.min(tooltip.x + 10, window.innerWidth - 200),
            top: Math.max(tooltip.y - 40, 10),
          }}
          dangerouslySetInnerHTML={{ __html: tooltip.content }}
        />
      )}
    </div>
  );
};

export default ConservationChart;
