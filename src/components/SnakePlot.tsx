'use client';

import { useEffect, useState, useRef } from 'react';
import { Parser as HtmlToReactParser } from 'html-to-react';
import { useSnakePlotTooltip } from '../hooks/useSnakePlotTooltip';

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

  // Tooltip ve conservation update hook'unu kullanıyoruz
  const { updateSnakeplotConservation } = useSnakePlotTooltip();

  useEffect(() => {
    if (!svgPath) return;

    // html-to-react parser oluştur
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
          // HTML içeriği parse et
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, 'text/html');

          // SVG container elementini bul
          const container = doc.getElementById('snakeplot-container');

          if (container) {
            // HTML'i React elementi olarak dönüştür
            // Container'a style ekle (arkaplan için)
            container.style.backgroundColor = '#FDFBF7';

            // container içindeki SVG'ye de arkaplan ekleyelim
            const svgInContainer = container.querySelector('svg');
            if (svgInContainer) {
              svgInContainer.style.backgroundColor = '#FDFBF7';
            }

            // HTML'i React elementi olarak dönüştür
            const reactElement = htmlToReactParser.parse(container.outerHTML);

            // NOT: React elementinin props'larını doğrudan değiştiremeyiz
            // Stillendirilmiş elementi direkt olarak kullanacağız

            console.log('SVG content:', reactElement);
            setSvgContent(reactElement);
            svgLoadedRef.current = true;
          } else {
            // SVG doğrudan varsa
            const svgElement = doc.querySelector('svg');
            if (svgElement) {
              // SVG'ye arkaplan ekle
              svgElement.setAttribute('style', 'background-color: #FDFBF7');

              // HTML'i React elementi olarak dönüştür
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

  // Conservation verisi yüklendiğinde SVG'yi güncelle
  useEffect(() => {
    if (!svgLoadedRef.current || !conservationFile) return;

    // SVG yüklendiğinde ve conservation dosyası belirtildiğinde çalışır
    const applyConservation = async () => {
      try {
        // Conservation dosyasının yolunu oluştur
        const conservationPath = `/conservation_files/${conservationFile.split('/').pop()}`;
        await updateSnakeplotConservation(conservationPath);
        console.log('Conservation data applied to snakeplot');
      } catch (err) {
        console.error('Conservation verisi uygulanırken hata:', err);
      }
    };

    // SVG yüklendikten sonra kısa bir gecikme ile conservation verilerini uygula
    const timer = setTimeout(() => {
      applyConservation();
    }, 500);

    return () => clearTimeout(timer);
  }, [conservationFile, updateSnakeplotConservation]);

  if (!svgPath) return null;

  return (
    <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
      <h2 className="text-xl font-semibold text-foreground mb-4">Snake Plot</h2>
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
            <div
              className="w-full overflow-auto p-2 rounded"
              style={{
                backgroundColor: '#FDFBF7',
                padding: '10px',
                borderRadius: '8px',
              }}
            >
              {svgContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
