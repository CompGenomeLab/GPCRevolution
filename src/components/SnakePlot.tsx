'use client';

import { useEffect, useState, useRef } from 'react';
import { Parser as HtmlToReactParser } from 'html-to-react';
import { useSnakePlotTooltip } from '../hooks/useSnakePlotTooltip';
import { Button } from './ui/button';

export default function SnakePlot({
  svgPath,
  conservationFile,
}: {
  svgPath: string | null;
  conservationFile?: string | null;
}) {
  const [svgContent, setSvgContent] = useState<React.ReactNode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<boolean>(false);
  const svgLoadedRef = useRef(false);

  const { updateSnakeplotConservation, fillColor, setFillColor, textColor, setTextColor } =
    useSnakePlotTooltip();

  const downloadSVG = () => {
    const svgElement = document.getElementById('snakeplot');
    if (!svgElement) {
      console.error('SVG element not found');
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

    const htmlToReactParser = HtmlToReactParser();

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

          const container = doc.getElementById('snakeplot-container');

          if (container) {
            container.style.backgroundColor = '#FDFBF7';

            const svgInContainer = container.querySelector('svg');
            if (svgInContainer) {
              svgInContainer.style.backgroundColor = '#FDFBF7';
            }

            const reactElement = htmlToReactParser.parse(container.outerHTML);

            console.log('SVG content:', reactElement);
            setSvgContent(reactElement);
            svgLoadedRef.current = true;
          } else {
            const svgElement = doc.querySelector('svg');
            if (svgElement) {
              svgElement.setAttribute('style', 'background-color: #FDFBF7');

              const reactElement = htmlToReactParser.parse(svgElement.outerHTML);
              setSvgContent(reactElement);
              svgLoadedRef.current = true;
            } else {
              console.warn('SVG veya container bulunamadı');
            }
          }
        } catch (err) {
          console.error('SVG parse edilirken hata:', err);
        }
      })
      .catch(err => {
        console.error('Error loading SVG tree:', err);
        setError(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [svgPath]);

  useEffect(() => {
    if (!svgLoadedRef.current || !conservationFile) return;

    const applyConservation = async () => {
      try {
        console.log('Original conservation file path:', conservationFile);
        const conservationPath = `/conservation_files/${conservationFile.split('/').pop()}`;
        console.log('Processed conservation path:', conservationPath);
        await updateSnakeplotConservation(conservationPath);
        console.log('Conservation data applied to snakeplot');
      } catch (err) {
        console.error('Conservation verisi uygulanırken hata:', err);
      }
    };

    const timer = setTimeout(() => {
      applyConservation();
    }, 1000);

    return () => clearTimeout(timer);
  }, [conservationFile, updateSnakeplotConservation]);

  useEffect(() => {
    if (!svgLoadedRef.current || !conservationFile) return;

    const applyConservation = async () => {
      try {
        const conservationPath = `/conservation_files/${conservationFile.split('/').pop()}`;
        await updateSnakeplotConservation(conservationPath);
      } catch (err) {
        console.error('Conservation verisi uygulanırken hata:', err);
      }
    };

    const timer = setTimeout(() => {
      applyConservation();
    }, 100);

    return () => clearTimeout(timer);
  }, [fillColor, textColor, conservationFile, updateSnakeplotConservation]);

  if (!svgPath) return null;

  return (
    <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md select-none">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground mb-4">Residue Conservation Snake Plot</h2>

        {svgContent && !isLoading && !error && (
          <div className="flex justify-end gap-4 items-center">
            <div className="flex flex-wrap gap-4  p-4  rounded-lg">
              <div className="flex items-center gap-2">
                <label htmlFor="fillColor" className="text-sm font-medium">
                  Circle Fill Color:
                </label>
                <input
                  type="color"
                  id="fillColor"
                  value={fillColor}
                  onChange={e => setFillColor(e.target.value)}
                  className="w-8 h-6  rounded-xl cursor-pointer"
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
                  className="w-8 h-6  rounded-xl cursor-pointer"
                  title="Text Color"
                />
              </div>
            </div>

            <Button onClick={downloadSVG}>Download SVG</Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
        </div>
      ) : error ? (
        <div className="text-center text-muted-foreground p-4">Not found</div>
      ) : !svgContent ? (
        <div className="text-center text-muted-foreground p-4">No tree data available</div>
      ) : (
        <div className="flex flex-row justify-center items-center mx-auto">
          <div className="flex justify-center">
            <div className="w-full overflow-auto p-2 rounded">{svgContent}</div>
          </div>
        </div>
      )}
    </div>
  );
}
