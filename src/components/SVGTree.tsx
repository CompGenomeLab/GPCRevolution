import { useEffect, useState } from 'react';

export default function SVGTree({ svgPath }: { svgPath: string | null }) {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!svgPath) return;

    setIsLoading(true);
    fetch(`/receptor_trees/${svgPath.split('/').pop()}`)
      .then(res => res.text())
      .then(text => {
        setSvgContent(text);
      })
      .catch(err => {
        console.error('Error loading SVG tree:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [svgPath]);

  if (!svgPath) return null;

  return (
    <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
      <h2 className="text-xl font-semibold text-foreground mb-4">Phylogenetic Tree of Orthologs</h2>
      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
        </div>
      ) : !svgContent ? (
        <div className="text-center text-muted-foreground p-4">No tree data available</div>
      ) : (
        <div
          className="w-full overflow-scroll h-96"
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      )}
    </div>
  );
}
