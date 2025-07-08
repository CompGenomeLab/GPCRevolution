'use client';

import React, { useRef, useEffect } from 'react';
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
  data: ConservationDatum[];
  height?: number;
}

const ConservationChart: React.FC<ConservationChartProps> = ({ data, height = 242 }) => {
  const yAxisContainerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const yAxisContainer = yAxisContainerRef.current;
    const chartContainer = chartContainerRef.current;

    if (!yAxisContainer || !chartContainer) return;

    // Clear any previous SVG content
    yAxisContainer.innerHTML = '';
    chartContainer.innerHTML = '';
    if (!data || data.length === 0) return;

    /* ---------- Layout constants ---------- */
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const yAxisWidth = 80;
    const totalHeight = height;
    const barWidthEstimate = 12.35;
    const totalWidth = data.length * barWidthEstimate + margin.left + margin.right;
    const infoRowHeight = 20;
    const gapBetweenInfoRows = 8;
    const gapBeforeRegion = 12;
    const regionBlockHeight = 22;
    const chartAreaHeight =
      totalHeight -
      margin.top -
      margin.bottom -
      infoRowHeight * 2 - // For humanAA and GPCRdb rows
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
    let tooltip = d3.select('body').select<HTMLDivElement>('.conservation-tooltip');
    if (tooltip.empty()) {
      tooltip = d3
        .select('body')
        .append('div')
        .attr(
          'class',
          'conservation-tooltip pointer-events-none bg-white dark:bg-black dark:text-white text-xs sm:text-sm rounded border border-gray-300 px-1 py-0.5 sm:px-2 sm:py-1 absolute opacity-0 z-40 max-w-xs sm:max-w-sm break-words leading-tight sm:leading-normal'
        );
    }

    /* ---------- Scales ---------- */
    const x = d3
      .scaleBand<string>()
      .domain(data.map(d => d.residue.toString()))
      .range([0, totalWidth])
      .paddingInner(0.05);

    const y = d3.scaleLinear().domain([0, 100]).range([margin.top + chartAreaHeight, margin.top]);

    /* ---------- Y-Axis (in its own SVG) ---------- */
    const yAxis = d3.axisLeft(y).ticks(5).tickFormat((d: NumberValue) => `${d}%`);
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

    yLabel.append('tspan').attr('x', 0).text('Orthologous');
    yLabel.append('tspan').attr('x', 0).attr('dy', '1.2em').text('Conservation');

    /* ---------- Bars (in Chart SVG) ---------- */
    chartSvg
      .selectAll('rect.bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('fill', '#424874')
      .attr('x', (d: ConservationDatum) => x(d.residue.toString())!)
      .attr('y', (d: ConservationDatum) => y(d.conservation))
      .attr('width', x.bandwidth())
      .attr('height', (d: ConservationDatum) => y(0) - y(d.conservation))
      .on('mouseover', (event: PointerEvent, d: ConservationDatum) => {
        tooltip
          .html(
            `<strong>Residue #:</strong> ${d.residue}<br/>` +
              `<strong>Conservation %:</strong> ${d.conservation}%<br/>` +
              `<strong>Conserved AA:</strong> ${d.conservedAA}<br/>` +
              `<strong>Human AA:</strong> ${d.humanAA}<br/>` +
              `<strong>Region:</strong> ${d.region}<br/>` +
              `<strong>GPCRdb #:</strong> ${d.gpcrdb}`
          )
          .style('opacity', 1);
      })
      .on('mousemove', (event: PointerEvent) => {
        const tooltipWidth = 200; // Estimated tooltip width
        const tooltipHeight = 120; // Estimated tooltip height
        const x = Math.min(event.pageX + 10, window.innerWidth - tooltipWidth);
        const y = Math.min(Math.max(event.pageY - 40, 10), window.innerHeight - tooltipHeight);
        tooltip.style('left', `${x}px`).style('top', `${y}px`);
      })
      .on('mouseout', () => {
        tooltip.style('opacity', 0);
      });

    /* ---------- Bar Outlines for Dark Mode Visibility ---------- */
    chartSvg
      .selectAll('path.bar-outline')
      .data(data)
      .enter()
      .append('path')
      .attr('class', 'bar-outline')
      .attr('fill', 'none')
      .attr('stroke', '#FFFFFF')
      .attr('stroke-width', 1)
      .attr('d', (d: ConservationDatum) => {
        if (d.conservation === 0) return '';
        const barX = x(d.residue.toString())!;
        const barY = y(d.conservation);
        const barW = x.bandwidth();
        const barH = y(0) - y(d.conservation);
        // Path: Move to bottom-left, line to top-left, line to top-right, line to bottom-right
        return `M ${barX} ${barY + barH} L ${barX} ${barY} L ${barX + barW} ${barY} L ${barX + barW} ${barY + barH}`;
      })
      .attr('pointer-events', 'none');

    /* ---------- Information rows (in Chart SVG) ---------- */
    const humanRowY = margin.top + chartAreaHeight + 4;
    chartSvg
      .selectAll('text.human-aa')
      .data(data)
      .enter()
      .append('text')
      .attr('class', 'human-aa text-foreground fill-current')
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .attr('x', (d: ConservationDatum) => x(d.residue.toString())! + x.bandwidth() / 2)
      .attr('y', humanRowY + infoRowHeight / 2)
      .attr('dominant-baseline', 'middle')
      .text((d: ConservationDatum) => d.humanAA);

    const gpcrRowY = humanRowY + infoRowHeight + gapBetweenInfoRows;
    const regionRowY = gpcrRowY + infoRowHeight + gapBeforeRegion;

    /* ---------- Region blocks (in Chart SVG) ---------- */
    const regionGroups: RegionGroup[] = [];
    if (data.length > 0) {
      let startResidue = data[0].residue;
      let currentRegion = data[0].region;
      for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1];
        const cur = data[i];
        if (cur.region !== prev.region) {
          regionGroups.push({ region: prev.region, startResidue, endResidue: prev.residue });
          startResidue = cur.residue;
          currentRegion = cur.region;
        }
      }
      regionGroups.push({
        region: currentRegion,
        startResidue,
        endResidue: data[data.length - 1].residue,
      });
    }

    chartSvg
      .selectAll('rect.region-block')
      .data(regionGroups)
      .enter()
      .append('rect')
      .attr('class', 'region-block')
      .attr('x', (d: RegionGroup) => x(d.startResidue.toString())!)
      .attr('y', regionRowY)
      .attr(
        'width',
        (d: RegionGroup) =>
          x(d.endResidue.toString())! + x.bandwidth() - x(d.startResidue.toString())!
      )
      .attr('height', regionBlockHeight)
      .attr('fill', (d: RegionGroup) => regionColorMapping[d.region])
      .on('mouseover', (event: PointerEvent, d: RegionGroup) => {
        d3.select(event.currentTarget as SVGRectElement)
          .style('stroke', '#000')
          .style('stroke-width', 1);
        tooltip
          .html(
            `<strong>Region:</strong> ${d.region}<br/>Residues ${d.startResidue} - ${d.endResidue}`
          )
          .style('opacity', 1);
      })
      .on('mousemove', (event: PointerEvent) => {
        const tooltipWidth = 200; // Estimated tooltip width
        const tooltipHeight = 120; // Estimated tooltip height
        const x = Math.min(event.pageX + 10, window.innerWidth - tooltipWidth);
        const y = Math.min(Math.max(event.pageY - 40, 10), window.innerHeight - tooltipHeight);
        tooltip.style('left', `${x}px`).style('top', `${y}px`);
      })
      .on('mouseout', (event: PointerEvent) => {
        d3.select(event.currentTarget as SVGRectElement).style('stroke', 'none');
        tooltip.style('opacity', 0);
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
      .attr('x', (d: RegionGroup) => {
        const leftX = x(d.startResidue.toString())!;
        const rightX = x(d.endResidue.toString())! + x.bandwidth();
        return (leftX + rightX) / 2;
      })
      .attr('y', regionRowY + regionBlockHeight / 2)
      .attr('dominant-baseline', 'middle')
      .text((d: RegionGroup) => d.region);

    /* ---------- GPCRdb row (drawn last to be on top) ---------- */
    chartSvg
      .selectAll('text.gpcrdb')
      .data(data)
      .enter()
      .append('text')
      .attr('class', 'gpcrdb text-foreground fill-current')
      .style('font-size', '12px')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('transform', (d: ConservationDatum) => {
        const cx = x(d.residue.toString())! + x.bandwidth() / 2;
        const cy = gpcrRowY + infoRowHeight / 2;
        return `translate(${cx}, ${cy}) rotate(-90)`;
      })
      .text((d: ConservationDatum) => d.gpcrdb);

    return () => {
      tooltip.remove();
    };
  }, [data, height]);

  return (
    <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
      <h2 className="text-xl font-semibold text-foreground mb-4">Residue Conservation Bar Plot</h2>
      <div className="relative w-full h-[300px] flex overflow-hidden">
        <div ref={yAxisContainerRef} className="flex-shrink-0 z-10 bg-card" />
        <div className="flex-grow overflow-x-auto">
          <div ref={chartContainerRef} className="h-full" />
        </div>
      </div>
    </div>
  );
};

export default ConservationChart;
