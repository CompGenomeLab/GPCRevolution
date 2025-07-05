'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Parser as HtmlToReactParser } from 'html-to-react';
import { useSnakePlotTooltip } from '../hooks/useSnakePlotTooltip';
import { Button } from './ui/button';
import { toast } from 'sonner';

interface OptimizedSnakePlotProps {
  svgPath: string | null;
  conservationFile?: string | null;
  /** Callback fired once the snake plot finishes loading (success or error). */
  onLoaded?: () => void;
}

export default function OptimizedSnakePlot({ svgPath, conservationFile, onLoaded }: OptimizedSnakePlotProps) {
  const [svgContent, setSvgContent] = useState<React.ReactNode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<boolean>(false);
  const [isMinimized] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const svgLoadedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasCalledLoadedRef = useRef(false);

  const { updateSnakeplotConservation, fillColor, setFillColor, textColor, setTextColor } =
    useSnakePlotTooltip();

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
          (container as HTMLElement).style.width = '100%';
          (container as HTMLElement).style.overflowX = 'auto';

          const svgInContainer = container.querySelector('svg');
          if (svgInContainer) {
            const widthAttr = svgInContainer.getAttribute('width');
            const heightAttr = svgInContainer.getAttribute('height');
            if (!svgInContainer.hasAttribute('viewBox') && widthAttr && heightAttr) {
              svgInContainer.setAttribute('viewBox', `0 0 ${widthAttr} ${heightAttr}`);
            }

            svgInContainer.removeAttribute('width');
            svgInContainer.removeAttribute('height');
            svgInContainer.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            svgInContainer.style.width = '100%';
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

            svgElement.removeAttribute('width');
            svgElement.removeAttribute('height');
            svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            svgElement.style.width = '100%';
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
    if (!svgElement) {
      toast.error('SVG element not found');
      return;
    }

    const clonedSvg = svgElement.cloneNode(true) as SVGElement;
    const currentFillColor = fillColor;
    const currentTextColor = textColor;

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
      text.setAttribute('style', `fill: ${currentTextColor};`);
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
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">Residue Conservation Snake Plot</h2>
          <div className="flex items-center gap-2 pr-10">
            {svgContent && !isLoading && !error && (
              <Button onClick={downloadSVG} variant="outline" size="sm">
                Download SVG
              </Button>
            )}
          </div>
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
            <div className="flex flex-wrap gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <label htmlFor="fillColor" className="text-sm font-medium">
                  Circle Fill Color:
                </label>
                <input
                  type="color"
                  id="fillColor"
                  value={fillColor}
                  onChange={e => setFillColor(e.target.value)}
                  className="w-8 h-6 rounded cursor-pointer"
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
                  className="w-8 h-6 rounded cursor-pointer"
                  title="Text Color"
                />
              </div>
            </div>
            <div className="min-w-full rounded-lg bg-card">
              {svgContent}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
