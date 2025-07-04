'use client';

import { useEffect, useState, useRef } from 'react';
import { Parser as HtmlToReactParser } from 'html-to-react';
import { useSnakePlotTooltip } from '../hooks/useSnakePlotTooltip';
import { Button } from './ui/button';

/**
 * SnakePlot component — revised to ensure **all** original
 * functionality is retained while keeping the transparent‑background
 * fix and dark/light‑theme support.
 */
export default function SnakePlot({
  svgPath,
  conservationFile,
}: {
  svgPath: string | null;
  conservationFile?: string | null;
}) {
  // ——————————————————————————— state & refs ——————————————————————————
  const [svgContent, setSvgContent] = useState<React.ReactNode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const svgLoadedRef = useRef(false);

  /**
   * Tooltip + conservation hook gives us:
   *   • attachTooltip                – (adds residue tooltips)
   *   • updateSnakeplotConservation – (colours circles by conservation)
   *   • fillColor / textColor        – colour‑picker state
   */
  const {
    attachTooltip,
    updateSnakeplotConservation,
    fillColor,
    setFillColor,
    textColor,
    setTextColor,
  } = useSnakePlotTooltip();

  // ——————————————————————— SVG download helper —————————————————————
  const downloadSVG = () => {
    const svgElement = document.getElementById('snakeplot');
    if (!svgElement) {
      console.error('SVG element not found');
      return;
    }

    // clone so we don’t mutate what the user is seeing
    const clonedSvg = svgElement.cloneNode(true) as SVGElement;

    // make gradient + text colours match the current pickers
    const defs = clonedSvg.querySelector('defs');
    if (defs) {
      defs.querySelectorAll('linearGradient stop').forEach(stop => {
        const stopColor = stop.getAttribute('stop-color');
        if (stopColor && stopColor !== 'white') {
          stop.setAttribute('stop-color', fillColor);
        }
      });
    }

    clonedSvg.querySelectorAll('text.rtext').forEach(text => {
      text.setAttribute('style', `fill: ${textColor};`);
    });

    // serialise & trigger download
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clonedSvg);
    const svgWithDeclaration = `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;

    const blob = new Blob([svgWithDeclaration], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const baseName = svgPath ? svgPath.split('/').pop()?.replace('.html', '') : 'snakeplot';
    const fileName = `${baseName}_conservation.svg`;

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ————————————————————— fetch + prepare SVG ——————————————————————
  useEffect(() => {
    if (!svgPath) return;

    const htmlToReactParser = new HtmlToReactParser();

    setIsLoading(true);
    setError(false);

    fetch(`/snakeplots/${svgPath.split('/').pop()}`)
      .then(async res => {
        if (!res.ok) {
          setError(true);
          return null;
        }
        return res.text();
      })
      .then(text => {
        if (!text) return;

        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, 'text/html');
          const isDarkMode = document.documentElement.classList.contains('dark');
          const themeColor = isDarkMode ? 'white' : 'black';

          /**
           * Clean up GPCRdb SVGs:
           *   • strip inline <svg style="…">
           *   • recolour any hard‑coded black strokes/fills
           *   • remove/neutralise background rects
           *   • force transparent background so card shines through
           */
          const applyTheme = (svg: SVGElement) => {
            svg.removeAttribute('style');
            svg.style.backgroundColor = 'transparent';
            svg.querySelectorAll('[stroke="black"]').forEach(el => el.setAttribute('stroke', themeColor));
            svg.querySelectorAll('[fill="black"]').forEach(el => el.setAttribute('fill', themeColor));
            svg.querySelectorAll('rect').forEach(rect => {
              const fill = rect.getAttribute('fill')?.toLowerCase();
              const id = rect.getAttribute('id')?.toLowerCase();
              const looksLikeBg =
                (id && id.includes('background')) ||
                (fill && (fill === '#000000' || fill === '#000' || fill === 'black'));
              if (looksLikeBg) rect.setAttribute('fill', 'transparent');
            });
          };

          // GPCRdb sometimes wraps the plot in a #snakeplot-container div
          const container = doc.getElementById('snakeplot-container');
          if (container) {
            container.removeAttribute('style');
            const svgInContainer = container.querySelector('svg');
            if (svgInContainer) applyTheme(svgInContainer);
            setSvgContent(htmlToReactParser.parse(container.outerHTML));
          } else {
            const svgElement = doc.querySelector('svg');
            if (svgElement) {
              applyTheme(svgElement);
              setSvgContent(htmlToReactParser.parse(svgElement.outerHTML));
            } else {
              console.warn('SVG or container not found');
            }
          }
          svgLoadedRef.current = true;
        } catch (err) {
          console.error('Error parsing SVG:', err);
        }
      })
      .catch(err => {
        console.error('Error loading SVG:', err);
        setError(true);
      })
      .finally(() => setIsLoading(false));
  }, [svgPath]);

  // —————————————————— recolour circles/text live ————————————————————
  useEffect(() => {
    if (!svgContent) return;

    requestAnimationFrame(() => {
      const svg =
        (document.getElementById('snakeplot') as SVGElement) ||
        (document.querySelector('#snakeplot-container svg') as SVGElement) ||
        (document.querySelector('svg') as SVGElement);
      if (!svg) return;

      svg.querySelectorAll('ellipse,circle').forEach(el => el.setAttribute('fill', fillColor));
      svg.querySelectorAll('text').forEach(el => el.setAttribute('fill', textColor));
      attachTooltip(svg); // (re)‑attach residue tooltips
    });
  }, [svgContent, fillColor, textColor, attachTooltip]);

  // ———————————————— apply conservation colours ————————————————
  useEffect(() => {
    if (!svgLoadedRef.current || !conservationFile) return;

    const applyConservation = async () => {
      try {
        const conservationPath = `/conservation_files/${conservationFile.split('/').pop()}`;
        await updateSnakeplotConservation(conservationPath);
      } catch (err) {
        console.error('Error applying conservation:', err);
      }
    };

    // initial run (give DOM a moment to settle)
    const timer = setTimeout(applyConservation, 1000);
    return () => clearTimeout(timer);
  }, [conservationFile, updateSnakeplotConservation]);

  useEffect(() => {
    if (!svgLoadedRef.current || !conservationFile) return;

    const applyConservation = async () => {
      try {
        const conservationPath = `/conservation_files/${conservationFile.split('/').pop()}`;
        await updateSnakeplotConservation(conservationPath);
      } catch (err) {
        console.error('Error applying conservation:', err);
      }
    };

    // quick re‑apply after user tweaks colours so gradient updates too
    const timer = setTimeout(applyConservation, 100);
    return () => clearTimeout(timer);
  }, [fillColor, textColor, conservationFile, updateSnakeplotConservation]);

  // —————————————————————————— RENDER ————————————————————————————
  if (!svgPath) return null;

  return (
    <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md select-none">
      {/* — Header — */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground mb-4">
          Residue Conservation Snake Plot
        </h2>

        {svgContent && !isLoading && !error && (
          <div className="flex justify-end gap-4 items-center">
            {/* colour pickers + download */}
            <div className="flex flex-wrap gap-4 p-4 rounded-lg">
              <div className="flex items-center gap-2">
                <label htmlFor="fillColor" className="text-sm font-medium">
                  Circle Fill Color:
                </label>
                <input
                  type="color"
                  id="fillColor"
                  value={fillColor}
                  onChange={e => setFillColor(e.target.value)}
                  className="w-8 h-6 rounded-xl cursor-pointer"
                  title="Circle Fill Color"
                />
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="textColor" className="text-sm font-medium">
                  Text Color:
                </label>
                <input
                  type="color"
                  id="textColor"
                  value={textColor}
                  onChange={e => setTextColor(e.target.value)}
                  className="w-8 h-6 rounded-xl cursor-pointer"
                  title="Text Color"
                />
              </div>

              <Button onClick={downloadSVG}>Download SVG</Button>
            </div>
          </div>
        )}
      </div>

      {/* — Body — */}
      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
        </div>
      ) : error ? (
        <div className="text-center text-muted-foreground p-4">Not found</div>
      ) : !svgContent ? (
        <div className="text-center text-muted-foreground p-4">No snake‑plot data available</div>
      ) : (
        <div className="w-full overflow-auto border border-border rounded-lg flex justify-center items-center">
          {svgContent}
        </div>
      )}
    </div>
  );
}
