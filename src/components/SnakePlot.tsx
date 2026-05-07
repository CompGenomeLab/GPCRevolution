'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Parser as HtmlToReactParser } from 'html-to-react';
import { createPortal } from 'react-dom';
import { useSnakePlotTooltip } from '../hooks/useSnakePlotTooltip';
// Removed Button usage in favor of unified styled buttons
import { toast } from 'sonner';

interface SnakePlotProps {
  svgPath: string | null;
  conservationFile?: string | null;
  /** Callback fired once the snake plot finishes loading (success or error). */
  onLoaded?: () => void;
}

export default function SnakePlot({ svgPath, conservationFile, onLoaded }: SnakePlotProps) {
  const [svgContent, setSvgContent] = useState<React.ReactNode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<boolean>(false);
  const [isMinimized] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const svgLoadedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasCalledLoadedRef = useRef(false);

  const { 
    updateSnakeplotConservation, 
    fillColor, 
    setFillColor, 
    textColor, 
    setTextColor,
    tooltip
  } = useSnakePlotTooltip();

  // Reset function for colors
  const resetColors = () => {
    setFillColor('#B7B7EB');
    setTextColor('#000000');
  };

  const loadSnakePlotContent = useCallback(async () => {
    if (!svgPath) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    const htmlToReactParser = HtmlToReactParser();

    setIsLoading(true);
    setError(false);
    setLoadingProgress(0);
    svgLoadedRef.current = false;

    try {
      const response = await fetch(`/snakeplots/${svgPath.split('/').pop()}`, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        setError(true);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;
      let htmlContent = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        loaded += value.length;
        htmlContent += new TextDecoder().decode(value);

        if (total > 0) {
          setLoadingProgress(Math.round((loaded / total) * 100));
        }
      }

      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');

        const container = doc.getElementById('snakeplot-container');

        if (container) {
          container.classList.add('bg-card');
          (container as HTMLElement).style.maxWidth = '100%';
          (container as HTMLElement).style.overflowX = 'auto';

          const svgInContainer = container.querySelector('svg');
          if (svgInContainer) {
            const widthAttr = svgInContainer.getAttribute('width');
            const heightAttr = svgInContainer.getAttribute('height');
            if (!svgInContainer.hasAttribute('viewBox') && widthAttr && heightAttr) {
              svgInContainer.setAttribute('viewBox', `0 0 ${widthAttr} ${heightAttr}`);
            }

            svgInContainer.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            svgInContainer.classList.add('w-full', 'sm:w-auto', 'h-auto');
            if (widthAttr) svgInContainer.style.maxWidth = `${widthAttr}px`;
            svgInContainer.style.height = 'auto';

            svgInContainer.style.backgroundColor = '#FDFBF7';
          }

          const reactElement = htmlToReactParser.parse(container.outerHTML);
          setSvgContent(reactElement);
          svgLoadedRef.current = true;
        } else {
          const svgElement = doc.querySelector('svg');
          if (svgElement) {
            const widthAttr2 = svgElement.getAttribute('width');
            const heightAttr2 = svgElement.getAttribute('height');
            if (!svgElement.hasAttribute('viewBox') && widthAttr2 && heightAttr2) {
              svgElement.setAttribute('viewBox', `0 0 ${widthAttr2} ${heightAttr2}`);
            }

            svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            svgElement.classList.add('w-full', 'sm:w-auto', 'h-auto');
            if (widthAttr2) svgElement.style.maxWidth = `${widthAttr2}px`;
            svgElement.style.height = 'auto';

            svgElement.setAttribute('style', 'background-color: #FDFBF7');
            const reactElement = htmlToReactParser.parse(svgElement.outerHTML);
            setSvgContent(reactElement);
            svgLoadedRef.current = true;
          } else {
            console.warn('SVG or container not found');
            setError(true);
          }
        }
      } catch (err) {
        toast.error('Error parsing SVG', {
          description: err instanceof Error ? err.message : 'An unknown error occurred',
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        toast.error('Error loading SVG');
        setError(true);
      }
    } finally {
      setIsLoading(false);
      setLoadingProgress(0);
    }
  }, [svgPath]);

  useEffect(() => {
    if (!svgLoadedRef.current || !conservationFile || isMinimized) return;

    const applyConservation = async () => {
      try {
        const conservationPath = `/conservation_files/${conservationFile.split('/').pop()}`;
        await updateSnakeplotConservation(conservationPath);
      } catch (err) {
        toast.error('Error applying conservation data', {
          description: err instanceof Error ? err.message : 'An unknown error occurred',
        });
      }
    };

    const timer = setTimeout(applyConservation, 1000);
    return () => clearTimeout(timer);
  }, [conservationFile, updateSnakeplotConservation, isMinimized]);

  useEffect(() => {
    if (!svgLoadedRef.current || !conservationFile || isMinimized) return;

    const applyConservation = async () => {
      try {
        const conservationPath = `/conservation_files/${conservationFile.split('/').pop()}`;
        await updateSnakeplotConservation(conservationPath);
      } catch (err) {
        toast.error('Error applying conservation data', {
          description: err instanceof Error ? err.message : 'An unknown error occurred',
        });
      }
    };

    const timer = setTimeout(applyConservation, 100);
    return () => clearTimeout(timer);
  }, [fillColor, textColor, conservationFile, updateSnakeplotConservation, isMinimized]);

  const downloadSVG = () => {
    const svgElement = document.getElementById('snakeplot');
    if (!svgElement || !(svgElement instanceof SVGElement)) {
      toast.error('SVG element not found');
      return;
    }

    const sourceSvg = svgElement;
    const clonedSvg = sourceSvg.cloneNode(true) as SVGElement;
    const currentFillColor = fillColor;
    const currentTextColor = textColor;

    // Ensure standalone SVG has namespaces when opened outside the app
    if (!clonedSvg.getAttribute('xmlns')) {
      clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    if (!clonedSvg.getAttribute('xmlns:xlink')) {
      clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    }

    /**
     * IMPORTANT: The on-screen snakeplot relies on page CSS/fonts.
     * When we export, external viewers won't have that CSS, so <text> can reflow.
     * Fix by inlining the computed text styling into the exported SVG.
     */
    const bakeResidueTextCenteringForIllustrator = (svg: SVGSVGElement) => {
      // The GPCRdb snakeplot uses circle ids like "83" and matching residue text ids like "83t".
      // Illustrator ignores dominant-baseline, so we:
      // - remove dominant-baseline/alignment-baseline on those texts
      // - measure where they render with default baseline
      // - translate them so their bbox center matches the circle center
      const host = document.createElement('div');
      host.style.position = 'fixed';
      host.style.left = '-10000px';
      host.style.top = '-10000px';
      host.style.width = '1px';
      host.style.height = '1px';
      host.style.overflow = 'hidden';
      host.style.visibility = 'hidden';

      document.body.appendChild(host);
      host.appendChild(svg);

      try {
        const texts = Array.from(svg.querySelectorAll<SVGTextElement>('text.rtext[id$="t"]'));
        for (const t of texts) {
          const id = t.getAttribute('id') ?? '';
          if (!id.endsWith('t')) continue;
          const circleId = id.slice(0, -1);
          const circle = svg.querySelector<SVGCircleElement>(`circle[id="${circleId}"]`);
          if (!circle) continue;

          const cx = Number(circle.getAttribute('cx'));
          const cy = Number(circle.getAttribute('cy'));
          if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;

          // Remove baseline attributes that Illustrator ignores
          t.removeAttribute('dominant-baseline');
          t.removeAttribute('alignment-baseline');
          t.removeAttribute('baseline-shift');
          t.removeAttribute('dy');

          // Measure rendered bbox (with default baseline) and translate to circle center
          const bb = t.getBBox();
          if (!Number.isFinite(bb.x) || !Number.isFinite(bb.y) || bb.width === 0 || bb.height === 0) continue;
          const bbCx = bb.x + bb.width / 2;
          const bbCy = bb.y + bb.height / 2;
          const dx = cx - bbCx;
          const dy = cy - bbCy;

          if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
          const existing = t.getAttribute('transform');
          t.setAttribute('transform', `${existing ? `${existing} ` : ''}translate(${dx} ${dy})`);
        }
      } finally {
        host.remove();
      }
    };

    const inlineComputedTextStyles = (src: SVGElement, dst: SVGElement) => {
      const srcTexts = Array.from(src.querySelectorAll('text'));
      const dstTexts = Array.from(dst.querySelectorAll('text'));

      // Inline computed font/text properties as SVG presentation attributes.
      // Don't try to "fix" baseline here; we bake exact residue text transforms below.
      const propsToInline = [
        'font-family',
        'font-size',
        'font-weight',
        'font-style',
        'letter-spacing',
        'word-spacing',
        'text-anchor',
        'fill',
        'text-rendering',
      ] as const;

      const n = Math.min(srcTexts.length, dstTexts.length);
      for (let i = 0; i < n; i++) {
        const s = srcTexts[i];
        const d = dstTexts[i];
        const cs = window.getComputedStyle(s);

        // Inline computed font styles as attributes
        for (const p of propsToInline) {
          const v = cs.getPropertyValue(p);
          if (v && v.trim()) {
            d.setAttribute(p, v.trim());
          }
        }

        // Preserve any per-node transforms that affect final placement.
        const transform = s.getAttribute('transform');
        if (transform && !d.getAttribute('transform')) {
          d.setAttribute('transform', transform);
        }
      }
    };

    inlineComputedTextStyles(sourceSvg, clonedSvg);

    // Bake residue letter centering into explicit transforms for Illustrator
    if (clonedSvg instanceof SVGSVGElement) {
      bakeResidueTextCenteringForIllustrator(clonedSvg);
    }

    const defs = clonedSvg.querySelector('defs');
    if (defs) {
      const gradients = defs.querySelectorAll('linearGradient');
      gradients.forEach(gradient => {
        const stops = gradient.querySelectorAll('stop');
        stops.forEach(stop => {
          const stopColor = stop.getAttribute('stop-color');
          if (stopColor && stopColor !== 'white') {
            stop.setAttribute('stop-color', currentFillColor);
          }
        });
      });
    }

    const textElements = clonedSvg.querySelectorAll('text.rtext');
    textElements.forEach(text => {
      // Prefer presentation attribute for portability across SVG viewers.
      text.setAttribute('fill', currentTextColor);
    });

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
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!svgPath) return;

    if (!isMinimized) {
      loadSnakePlotContent();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [svgPath, isMinimized, loadSnakePlotContent]);

  useEffect(() => {
    if (hasCalledLoadedRef.current) return;

    const done = !isLoading && (svgContent || error);

    if (done) {
      hasCalledLoadedRef.current = true;
      onLoaded?.();
    }
  }, [isLoading, svgContent, error, onLoaded]);

  if (!svgPath) return null;

  return (
    <div className="bg-card text-card-foreground rounded-lg shadow-md select-none overflow-x-auto">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Residue Conservation Snake Plot</h2>
        <div className="flex items-center gap-2">
          {svgContent && !isLoading && !error && (
            <button
              type="button"
              onClick={downloadSVG}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm hover:bg-accent"
              data-action="download-snakeplot"
            >
              <span className="sr-only">Download Snake Plot SVG</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M12 16l4-5h-3V4h-2v7H8l4 5z" />
                <path d="M4 18h16v2H4z" />
              </svg>
              Download SVG
            </button>
          )}
        </div>
      </div>
      <div className="p-6">
        {isLoading ? (
          <div className="space-y-4">
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground mr-4"></div>
              <span>Loading snake plot... {loadingProgress}%</span>
            </div>
            {loadingProgress > 0 && (
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${loadingProgress}%` }}
                ></div>
              </div>
            )}
          </div>
        ) : error ? (
          <div className="text-center text-destructive p-4">
            Failed to load snake plot
            <button
              onClick={loadSnakePlotContent}
              className="block mx-auto mt-2 px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              Retry
            </button>
          </div>
        ) : !svgContent ? (
          <div className="text-center text-muted-foreground p-4">
            Click Load Snake Plot to view the conservation visualization
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-full max-w-full mx-auto rounded-lg bg-card overflow-x-auto text-center">
              <div className="w-full sm:w-auto sm:max-w-none sm:inline-block">
                {svgContent}
              </div>
            </div>
            {/* Color controls section */}
            <div className="flex flex-wrap gap-4 items-center justify-center pt-4">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={fillColor}
                  onChange={e => setFillColor(e.target.value)}
                  className="w-5 h-5 rounded cursor-pointer border"
                  title="Circle Fill Color"
                />
                <span className="text-base text-foreground">Circle Fill Color</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={textColor}
                  onChange={e => setTextColor(e.target.value)}
                  className="w-5 h-5 rounded cursor-pointer border"
                  title="Text Color"
                />
                <span className="text-base text-foreground">Text Color</span>
              </div>
              <button
                onClick={resetColors}
                className="ml-2 px-3 py-1 text-xs bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded border transition-colors"
                title="Reset colors to default"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>

      {/* React-based tooltip rendered using portal */}
      {tooltip.visible && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-50 bg-white dark:bg-black text-black dark:text-white text-xs sm:text-sm rounded border border-gray-300 dark:border-gray-600 px-1 py-0.5 sm:px-2 sm:py-1 max-w-[250px] sm:max-w-sm break-words leading-tight sm:leading-normal shadow-lg pointer-events-none"
          style={{
            left: Math.min(tooltip.x + 10, window.innerWidth - 260),
            top: Math.max(tooltip.y - 50, 10),
          }}
          dangerouslySetInnerHTML={{ __html: tooltip.content }}
        />,
        document.body
      )}
    </div>
  );
}
