'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';

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

interface Receptor {
  geneName: string;
  class: string;
  numOrthologs: number;
  lca: string;
  gpcrdbId: string;
  snakePlot: string;
  name: string;
  conservationFile: string;
}

interface ComparisonResult {
  receptor1: Receptor;
  receptor2: Receptor;
  categorizedResidues: CategorizedResidue[];
}

const getCategoryLabels = (receptor1Name?: string, receptor2Name?: string) => ({
  common: 'Common Residues',
  specific_both: 'Specifically Conserved for Both',
  specific1: `Specifically Conserved for ${receptor1Name || 'Receptor 1'}`,
  specific2: `Specifically Conserved for ${receptor2Name || 'Receptor 2'}`,
});

interface SnakePlotVisualizationProps {
  result: ComparisonResult;
  colorMap: Record<string, string>;
  setColorMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

// Function to reset category colors to defaults
const resetCategoryColors = (setColorMap: React.Dispatch<React.SetStateAction<Record<string, string>>>) => {
  const defaultCategoryColors = {
    'Common Residues': '#E6E6FA',
    'Specifically Conserved for Both': '#A85638',
    'Specifically Conserved for Receptor 1': '#FFF9C2',
    'Specifically Conserved for Receptor 2': '#8F9871',
  };
  setColorMap(defaultCategoryColors);
};

export default function SnakePlotVisualization({ 
  result, 
  colorMap, 
  setColorMap 
}: SnakePlotVisualizationProps) {
  const [showReceptor, setShowReceptor] = useState<1 | 2>(1);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    lines: string[];
  }>({ visible: false, x: 0, y: 0, lines: [] });
  
  const snakeWrapperRef = useRef<HTMLDivElement>(null);

  // Helper function to adapt text for tooltip
  const adaptBaseText = (raw: string): string => {
    if (!raw) return '';
    let txt = raw.trim().replace(/\s+/g, ' ');
    txt = txt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return txt.replace(/\|/g, '<br>');
  };

  // Download SVG function
  const downloadSVG = () => {
    const svgElement = snakeWrapperRef.current?.querySelector('svg');
    if (!svgElement) {
      console.error('SVG element not found');
      return;
    }

    const clonedSvg = svgElement.cloneNode(true) as SVGElement;
    
    // Apply current category colors to the cloned SVG
    const categoryLabels = getCategoryLabels(result.receptor1.geneName, result.receptor2.geneName);
    result.categorizedResidues.forEach(row => {
      const pos = showReceptor === 1 ? row.resNum1 : row.resNum2;
      if (pos === 'gap') return;
      const label = categoryLabels[row.category as keyof typeof categoryLabels];
      const fill = colorMap[label];
      const circle = clonedSvg.querySelector<SVGCircleElement>(`circle[id="${pos}"]`);
      if (circle) {
        circle.setAttribute('fill', fill);
      }
    });

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clonedSvg);
    const svgWithDeclaration = `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;

    const blob = new Blob([svgWithDeclaration], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const receptorName = showReceptor === 1 ? result.receptor1.geneName : result.receptor2.geneName;
    const fileName = `${receptorName}_comparison_snakeplot.svg`;

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  // Re-fetch / recolour plot whenever inputs change
  useEffect(() => {
    const receptor = showReceptor === 1 ? result.receptor1 : result.receptor2;
    if (!receptor.snakePlot) return;

    const container = snakeWrapperRef.current!;
    container.innerHTML = '';

    // normalise URL (works inside /public)
    let url = receptor.snakePlot.replace('/tools/snakeplots/', '/snakeplots/');
    if (!url.startsWith('/')) url = '/' + url;

    // AbortController lets us cancel this fetch if the effect re-runs
    const ctrl = new AbortController();

    fetch(url, { signal: ctrl.signal })
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load SVG (${r.status})`);
        return r.text();
      })
      .then(svg => {
        container.innerHTML = svg;

        // Strip stray elements
        container.querySelector(':scope > title')?.remove();
        container.querySelector(':scope > meta[charset]')?.remove();
        container.querySelector(':scope > h2')?.remove();
        container.querySelectorAll('text')
                 .forEach(t => t.setAttribute('pointer-events', 'none'));

        // Make SVG background transparent to inherit card color and improve mobile responsiveness
        const svgElement = container.querySelector('svg');
        if (svgElement) {
          svgElement.removeAttribute('style');
          
          // Add responsive attributes for better mobile scaling
          const widthAttr = svgElement.getAttribute('width');
          const heightAttr = svgElement.getAttribute('height');
          
          if (!svgElement.hasAttribute('viewBox') && widthAttr && heightAttr) {
            svgElement.setAttribute('viewBox', `0 0 ${widthAttr} ${heightAttr}`);
          }
          
          svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          svgElement.classList.add('w-full', 'sm:w-auto', 'h-auto');
          
          if (widthAttr) {
            svgElement.style.maxWidth = `${widthAttr}px`;
          }
          svgElement.style.height = 'auto';
          svgElement.style.backgroundColor = 'transparent';
        }

        // Color circles by category
        const categoryLabels = getCategoryLabels(result.receptor1.geneName, result.receptor2.geneName);
        result.categorizedResidues.forEach(row => {
          const pos = showReceptor === 1 ? row.resNum1 : row.resNum2;
          if (pos === 'gap') return;
          const label = categoryLabels[row.category as keyof typeof categoryLabels];
          const fill = colorMap[label];
          const circle = container.querySelector<SVGCircleElement>(`circle[id="${pos}"]`);
          if (circle) {
            circle.setAttribute('fill', fill);
            circle.setAttribute('data-snake-category', label);
          }
        });

        // Wire tool-tips
        const circles = Array.from(container.querySelectorAll<SVGCircleElement>('circle[id]'));

        const onOver = (e: MouseEvent) => {
          const c = e.currentTarget as SVGCircleElement;
          const rawText = c.getAttribute('data-original-title') ?? c.getAttribute('title') ?? '';
          const baseText = adaptBaseText(rawText);
          const label = c.getAttribute('data-snake-category') ?? '';
          setTooltip({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            lines: label ? [baseText, `Category: ${label}`] : [baseText],
          });
        };
        const onMove = (e: MouseEvent) =>
          setTooltip(t => ({ ...t, x: e.clientX, y: e.clientY }));
        const onLeave = () => setTooltip(t => ({ ...t, visible: false }));

        circles.forEach(c => {
          c.addEventListener('mouseover', onOver);
          c.addEventListener('mousemove', onMove);
          c.addEventListener('mouseleave', onLeave);
        });

        // Clean-up when effect re-runs or component unmounts
        return () => {
          ctrl.abort();
          container.innerHTML = '';
          circles.forEach(c => {
            c.removeEventListener('mouseover', onOver);
            c.removeEventListener('mousemove', onMove);
            c.removeEventListener('mouseleave', onLeave);
          });
        };
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        console.error(err);
        container.innerHTML =
          '<p class="text-red-500">Failed to load snake plot.</p>';
      });

    return () => {
      ctrl.abort();
      container.innerHTML = '';
    };
  }, [result, showReceptor, colorMap]);

  return (
    <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
      {/* Snake-plot title + toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
        <h2 className="text-xl font-semibold">Snake Plot Visualization</h2>

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {/* Download SVG button */}
          <Button onClick={downloadSVG} variant="outline" size="sm" className="w-full sm:w-auto">
            Download SVG
          </Button>

          {/* Receptor toggle buttons */}
          <div className="flex gap-1 sm:gap-2">
            {/* Receptor 1 toggle */}
            <Button
              variant={showReceptor === 1 ? 'secondary' : 'default'}
              onClick={() => setShowReceptor(1)}
              size="sm"
              className="flex-1 sm:flex-none text-xs sm:text-sm px-2 sm:px-3"
            >
              <span className="sm:hidden">{result.receptor1.geneName}</span>
              <span className="hidden sm:inline">Show Snake Plot for {result.receptor1.geneName}</span>
            </Button>

            {/* Receptor 2 toggle */}
            <Button
              variant={showReceptor === 2 ? 'secondary' : 'default'}
              onClick={() => setShowReceptor(2)}
              size="sm"
              className="flex-1 sm:flex-none text-xs sm:text-sm px-2 sm:px-3"
            >
              <span className="sm:hidden">{result.receptor2.geneName}</span>
              <span className="hidden sm:inline">Show Snake Plot for {result.receptor2.geneName}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Snake‐plot container */}
      <div className="w-full max-w-full mx-auto rounded-lg bg-card overflow-x-auto text-center mb-6">
        <div className="w-full sm:w-auto sm:max-w-none sm:inline-block">
          <div ref={snakeWrapperRef} className="w-full">
            {/* The fetched SVG/HTML will appear here */}
          </div>
        </div>
      </div>

      {/* Color controls section */}
      <div className="p-6 pt-0">
        <div className="space-y-4">
          {/* Category colors */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-base font-semibold text-foreground">Category Colors</h3>
              <button
                onClick={() => resetCategoryColors(setColorMap)}
                className="px-3 py-1 text-xs bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded border transition-colors"
                title="Reset category colors to default"
              >
                Reset
              </button>
            </div>
            <div className="flex flex-wrap gap-4 items-center justify-center">
              {Object.entries(getCategoryLabels(result.receptor1.geneName, result.receptor2.geneName)).map(([categoryKey, categoryLabel]) => (
                <div key={categoryKey} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colorMap[categoryLabel] || '#000000'}
                    onChange={(e) => {
                      const newColorMap = { ...colorMap, [categoryLabel]: e.target.value };
                      setColorMap(newColorMap);
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
          {tooltip.lines.map((line, i) => (
            <div key={i} dangerouslySetInnerHTML={{ __html: line }} />
          ))}
        </div>
      )}
    </div>
  );
} 