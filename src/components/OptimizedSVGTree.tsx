'use client';

import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';

interface OptimizedSVGTreeProps {
  svgPath: string | null;
  /** Callback fired once the tree finishes loading (success or error). */
  onLoaded?: () => void;
}

export default function OptimizedSVGTree({ svgPath, onLoaded }: OptimizedSVGTreeProps) {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMinimized] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasCalledLoadedRef = useRef(false);

  const loadSVGContent = async () => {
    if (!svgPath) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsLoading(true);
    setError(null);
    setLoadingProgress(0);

    try {
      const response = await fetch(`/receptor_trees/${svgPath.split('/').pop()}`, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch SVG: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;
      let content = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        loaded += value.length;
        content += new TextDecoder().decode(value);

        if (total > 0) {
          setLoadingProgress(Math.round((loaded / total) * 100));
        }
      }

      const optimizedContent = optimizeSVGContent(content);
      setSvgContent(optimizedContent);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        toast.error('Error loading SVG tree');
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      }
    } finally {
      setIsLoading(false);
      setLoadingProgress(0);
    }
  };

  const optimizeSVGContent = (content: string): string => {
    return content
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .replace(/<g[^>]*>\s*<\/g>/g, '')
      .trim();
  };

  useEffect(() => {
    if (!svgPath) return;

    if (!isMinimized) {
      loadSVGContent();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [svgPath, isMinimized]);

  useEffect(() => {
    if (hasCalledLoadedRef.current) return;

    const done = !isLoading && (svgContent !== null || error !== null);

    if (done) {
      hasCalledLoadedRef.current = true;
      onLoaded?.();
    }
  }, [isLoading, svgContent, error, onLoaded]);

  if (!svgPath) return null;

  return (
    <div className="bg-card text-card-foreground rounded-lg shadow-md overflow-hidden">
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">Phylogenetic Tree of Orthologs</h2>
          <div className="pr-10"></div>
        </div>
      </div>

      {!isMinimized && (
        <div className="p-6">
          {isLoading ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground mr-4"></div>
                <span>Loading phylogenetic tree... {loadingProgress}%</span>
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
              Failed to load tree: {error}
              <button
                onClick={loadSVGContent}
                className="block mx-auto mt-2 px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Retry
              </button>
            </div>
          ) : !svgContent ? (
            <div className="text-center text-muted-foreground p-4">
              Click Load Tree to view the phylogenetic tree
            </div>
          ) : (
            <div className="space-y-4">
              <div
                ref={svgContainerRef}
                className="w-full overflow-auto h-[640px] border border-border rounded-lg bg-background"
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
