'use client';

import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle, useMemo } from 'react';
import * as d3 from 'd3';
// Colors are inlined below; no external color module imports
import { Upload, Database, MousePointer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatPhyleticGeneLabel } from '@/lib/phyletic-distribution-families';
import { Badge } from '@/components/ui/badge';
import type { TaxonomyRecord, TaxonomicLevel } from '@/types/phyletic-distribution';

interface VisualizationCanvasProps {
  data: TaxonomyRecord[];
  selectedLevels: TaxonomicLevel[];
  activeGenes: string[];
  coordMap: Map<string, number>;
  widthMap: Map<string, number>;
  countMap: Map<string, Record<string, number>>;
  onLineageClick: (level: TaxonomicLevel, category: string, range?: { start: number; end: number }) => void;
  onWidthChange?: (width: number) => void;
  rugMode?: 'binary' | 'normalized' | 'heatmap';
  onLoadTSV: () => void;
  showTaxonomyTree?: boolean;
  taxonomyTreeNewick?: string | null;
}

export type VisualizationCanvasHandle = {
  downloadSVG: () => void;
};

// Tooltip component
interface TooltipProps {
  isVisible: boolean;
  x: number;
  y: number;
  label: string;
  category: string;
  count: number;
}

function Tooltip({ isVisible, x, y, label, category, count }: TooltipProps) {
  if (!isVisible) return null;
  
  return (
    <div 
      className="absolute pointer-events-none bg-foreground text-background text-xs rounded px-2 py-1 shadow-lg z-20 whitespace-nowrap"
      style={{ 
        left: `${x - 12}px`, 
        top: `${y + 12}px`,
        transform: 'translate(-100%, 0)' // Position to the left of cursor
      }}
    >
      <div className="font-semibold">{category}</div>
      <div>{label}: {count.toLocaleString()}</div>
    </div>
  );
}

// Utility: parse color strings and select contrasting text (black/white)
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function parseColorToRgb(color: string): { r: number; g: number; b: number } | null {
  if (!color) return null;
  const c = color.trim().toLowerCase();
  // Hex formats
  if (c[0] === '#') {
    const hex = c.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b };
    }
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return { r, g, b };
    }
    return null;
  }
  // rgb/rgba
  if (c.startsWith('rgb')) {
    const match = c.match(/rgba?\(([^)]+)\)/);
    if (match) {
      const parts = match[1].split(',').map(p => p.trim());
      const r = Math.round(parseFloat(parts[0]));
      const g = Math.round(parseFloat(parts[1]));
      const b = Math.round(parseFloat(parts[2]));
      return { r, g, b };
    }
  }
  // hsl/hsla
  if (c.startsWith('hsl')) {
    const match = c.match(/hsla?\(([^)]+)\)/);
    if (match) {
      const parts = match[1].split(',').map(p => p.trim());
      const h = parseFloat(parts[0]);
      const s = parseFloat(parts[1].replace('%', '')) / 100;
      const l = parseFloat(parts[2].replace('%', '')) / 100;
      return hslToRgb(h, s, l);
    }
  }
  return null;
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const srgb = [r / 255, g / 255, b / 255].map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function getContrastingTextColor(bgColor: string): string {
  const rgb = parseColorToRgb(bgColor);
  if (!rgb) return '#000000';
  const L = relativeLuminance(rgb);
  // Contrast ratio with white and black; choose higher contrast
  const contrastWithWhite = (1.0 + 0.05) / (L + 0.05);
  const contrastWithBlack = (L + 0.05) / (0.0 + 0.05);
  return contrastWithWhite >= contrastWithBlack ? '#FFFFFF' : '#000000';
}

//

// Website colors (no greens), alternating sequence starting black, yellow, blue, orange, purple, gray
const WEBSITE_CATEGORY_COLORS: string[] = [
  '#FCB315', // yellow
  '#7CAEC4', // blue
  '#DD6030', // orange
  '#231F20', // black (moved out of first three)
  '#7D2985', // purple
  '#B4B4B4', // gray
];

// Heatmap colors (fixed): gray → pale yellow (wheat) → red
const HEAT_LOW_GRAY = '#9CA3AF';
const HEAT_MID_YELLOW = '#F5DEB3';
const HEAT_HIGH_RED = '#DC2626';
const HEATMAP_MIDPOINT = 50;
const HEATMAP_MAX_COUNT = 1000;

// The SVG lineage bands and the canvas rugs occupy the same horizontal plot
// span. Keep this definition shared so a resize cannot leave one layer using
// a slightly different gutter than the other.
const PLOT_MARGINS = { right: 24, left: 112 };

const EXPORTED_STYLE_PROPERTIES = [
  'color',
  'display',
  'visibility',
  'opacity',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'paint-order',
  'shape-rendering',
  'vector-effect',
  'font-family',
  'font-size',
  'font-style',
  'font-variant',
  'font-weight',
  'letter-spacing',
  'word-spacing',
  'text-anchor',
  'dominant-baseline',
] as const;

function inlineSvgComputedStyles(source: SVGSVGElement, clone: SVGSVGElement) {
  const sourceElements = [source, ...Array.from(source.querySelectorAll<SVGElement>('*'))];
  const cloneElements = [clone, ...Array.from(clone.querySelectorAll<SVGElement>('*'))];

  sourceElements.forEach((sourceElement, index) => {
    const cloneElement = cloneElements[index];
    if (!cloneElement) return;

    const computed = window.getComputedStyle(sourceElement);
    EXPORTED_STYLE_PROPERTIES.forEach(property => {
      const value = computed.getPropertyValue(property);
      if (value) cloneElement.style.setProperty(property, value);
    });

    // Presentation attributes can otherwise retain literal var(--token)
    // values even though the resolved inline style wins in browsers. Replace
    // them as well for strict SVG editors that prioritize attributes.
    (['color', 'fill', 'stroke'] as const).forEach(attribute => {
      if (!cloneElement.hasAttribute(attribute)) return;
      const value = computed.getPropertyValue(attribute);
      if (value) cloneElement.setAttribute(attribute, value);
    });
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function fontFaceSupportsUsedWeight(faceWeight: string, usedWeights: Set<number>) {
  const normalized = faceWeight.trim().toLowerCase();
  if (!normalized || normalized === 'normal') return usedWeights.has(400);
  if (normalized === 'bold') return usedWeights.has(700);

  const numericWeights = normalized.match(/\d+/g)?.map(Number) || [];
  if (numericWeights.length === 1) return usedWeights.has(numericWeights[0]);
  if (numericWeights.length >= 2) {
    const minimum = Math.min(numericWeights[0], numericWeights[1]);
    const maximum = Math.max(numericWeights[0], numericWeights[1]);
    return Array.from(usedWeights).some(weight => weight >= minimum && weight <= maximum);
  }

  return true;
}

async function createEmbeddedFontCss(fontFamily: string, usedWeights: Set<number>) {
  const families = new Set(
    fontFamily
      .split(',')
      .map(family => family.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  );
  const fontRules: Array<{ cssText: string; baseUrl: string }> = [];

  const collectRules = (rules: CSSRuleList, baseUrl: string) => {
    Array.from(rules).forEach(rule => {
      if (rule.type === CSSRule.FONT_FACE_RULE) {
        const fontRule = rule as CSSFontFaceRule;
        const ruleFamily = fontRule.style
          .getPropertyValue('font-family')
          .trim()
          .replace(/^['"]|['"]$/g, '');
        const ruleWeight = fontRule.style.getPropertyValue('font-weight');
        if (
          families.has(ruleFamily) &&
          fontFaceSupportsUsedWeight(ruleWeight, usedWeights)
        ) {
          fontRules.push({ cssText: rule.cssText, baseUrl });
        }
        return;
      }

      const nestedRules = (rule as CSSGroupingRule).cssRules;
      if (nestedRules) collectRules(nestedRules, baseUrl);
    });
  };

  Array.from(document.styleSheets).forEach(styleSheet => {
    try {
      collectRules(styleSheet.cssRules, styleSheet.href || document.baseURI);
    } catch {
      // Cross-origin stylesheets cannot be inspected; the computed fallback
      // font stack is still preserved on every exported text element.
    }
  });

  const embeddedRules = await Promise.all(fontRules.map(async ({ cssText, baseUrl }) => {
    let embedded = cssText;
    const urls = Array.from(cssText.matchAll(/url\((['"]?)([^'")]+)\1\)/g));

    for (const match of urls) {
      const originalUrl = match[2];
      if (originalUrl.startsWith('data:')) continue;

      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 4000);
        const response = await fetch(new URL(originalUrl, baseUrl), {
          signal: controller.signal,
        }).finally(() => window.clearTimeout(timeout));
        if (!response.ok) continue;
        const dataUrl = await blobToDataUrl(await response.blob());
        embedded = embedded.replace(match[0], `url("${dataUrl}")`);
      } catch {
        // Retain the original source and computed fallback if embedding fails.
      }
    }

    return embedded;
  }));

  return embeddedRules.join('\n');
}

export const VisualizationCanvas = forwardRef<VisualizationCanvasHandle, VisualizationCanvasProps>(function VisualizationCanvas(
{
  data,
  selectedLevels,
  activeGenes,
  coordMap,
  widthMap,
  countMap,
  onLineageClick,
  onWidthChange,
  rugMode = 'normalized',
  onLoadTSV,
  showTaxonomyTree = false,
  taxonomyTreeNewick = null,
}: VisualizationCanvasProps,
ref
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [lastSvgHeight, setLastSvgHeight] = useState(0);
  const TREE_PANEL_HEIGHT = 180;
  const TREE_PANEL_GAP = 8;
  const parsedTaxonomyTree = useMemo(() => {
    if (!taxonomyTreeNewick) return null;
    try {
      return parseNewick(taxonomyTreeNewick);
    } catch {
      return null;
    }
  }, [taxonomyTreeNewick]);
  const hierarchyGroupMap = useMemo(
    () => parsedTaxonomyTree ? buildHierarchyGroupMap(parsedTaxonomyTree) : new Map(),
    [parsedTaxonomyTree]
  );
  const topTreeOffset = showTaxonomyTree && parsedTaxonomyTree
    ? TREE_PANEL_HEIGHT + TREE_PANEL_GAP
    : 0;

  // Persistent rectangle color assignment per level/category
  const levelCategoryColorMapRef = useRef<Map<string, Map<string, string>>>(new Map());
  const levelNextIndexRef = useRef<Map<string, number>>(new Map());
  const prevLevelsCountRef = useRef<number>(selectedLevels.length);

  const downloadSVG = useCallback(async () => {
    if (!svgRef.current) return;
    const original = svgRef.current;
    const clone = original.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // Add xlink namespace and SVG version for better Adobe Illustrator compatibility
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clone.setAttribute('version', '1.1');
    // Ensure a viewBox is present so width/height scale correctly in editors
    const vbWidth = containerWidth;
    const vbHeight = (lastSvgHeight && lastSvgHeight > 0) ? lastSvgHeight : (canvasRef.current ? Math.round((canvasRef.current.height || 0) / (window.devicePixelRatio || 1)) : 0);
    if (vbWidth && vbHeight) {
      clone.setAttribute('viewBox', `0 0 ${vbWidth} ${vbHeight}`);
      clone.setAttribute('width', String(vbWidth));
      clone.setAttribute('height', String(vbHeight));
      clone.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    }

    // Resolve theme variables and inherited typography while the source SVG is
    // still attached to the document. The exported file then renders the same
    // in browsers, vector editors, light mode, and dark mode.
    inlineSvgComputedStyles(original, clone);

    const fontFamily = window.getComputedStyle(original).fontFamily;
    const usedFontWeights = new Set(
      Array.from(original.querySelectorAll('text')).map(text => {
        const weight = window.getComputedStyle(text).fontWeight;
        if (weight === 'normal') return 400;
        if (weight === 'bold') return 700;
        return Number(weight) || 400;
      })
    );
    const embeddedFontCss = await createEmbeddedFontCss(fontFamily, usedFontWeights);
    if (embeddedFontCss) {
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.setAttribute('type', 'text/css');
      style.textContent = embeddedFontCss;
      defs.appendChild(style);
      clone.insertBefore(defs, clone.firstChild);
    }

    const canvas = canvasRef.current;
    if (activeGenes.length > 0 && canvas && canvas.width > 0 && canvas.height > 0) {
      // Embed only the rug rows. The canvas itself covers the full chart, so
      // exporting it wholesale creates an oversized transparent image layer.
      const RUG_HEIGHT = 14;
      const RUG_PAD = 1;
      const BASE_GAP = 15;
      const LEVEL_HEIGHT = 21;
      const rugTop = 20 + topTreeOffset + (selectedLevels.length + 1) * LEVEL_HEIGHT + BASE_GAP;
      const rugHeight = activeGenes.length * RUG_HEIGHT + (activeGenes.length - 1) * RUG_PAD;
      const rugWidth = containerWidth - PLOT_MARGINS.left - PLOT_MARGINS.right;
      const pixelScale = canvas.width / containerWidth;
      const crop = document.createElement('canvas');
      crop.width = Math.round(rugWidth * pixelScale);
      crop.height = Math.round(rugHeight * pixelScale);
      const cropContext = crop.getContext('2d');
      if (!cropContext) return;
      cropContext.drawImage(
        canvas,
        Math.round(PLOT_MARGINS.left * pixelScale),
        Math.round(rugTop * pixelScale),
        crop.width,
        crop.height,
        0,
        0,
        crop.width,
        crop.height,
      );
      const dataUrl = crop.toDataURL('image/png');
      const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      // Set both href (SVG2) and xlink:href (legacy) for Illustrator support
      try { img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', dataUrl); } catch {}
      img.setAttribute('href', dataUrl);
      img.setAttribute('x', String(PLOT_MARGINS.left));
      img.setAttribute('y', String(rugTop));
      img.setAttribute('width', String(rugWidth));
      img.setAttribute('height', String(rugHeight));
      img.setAttribute('preserveAspectRatio', 'none');
      img.setAttribute('data-export-layer', 'full-resolution-rugs');
      // Hint raster rendering; some editors respect this
      img.setAttribute('style', 'image-rendering: optimizeQuality');
      clone.insertBefore(img, clone.querySelector('defs')?.nextSibling || clone.firstChild);
    }
    const serializer = new XMLSerializer();
    const svgString = `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(clone)}`;
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'phyletic-distribution.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [activeGenes.length, containerWidth, lastSvgHeight, selectedLevels.length, topTreeOffset]);
  
  const [tooltip, setTooltip] = useState<{
    isVisible: boolean;
    x: number;
    y: number;
    level: string;
    category: string;
    count: number;
    label?: string;
  }>({
    isVisible: false,
    x: 0,
    y: 0,
    level: '',
    category: '',
    count: 0,
  });

  const [highlightedRect, setHighlightedRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // Enhanced ResizeObserver with improved responsiveness
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    
    const updateWidth = (newWidth: number) => {
      if (newWidth > 0 && Math.abs(newWidth - containerWidth) > 1) { // Only update if significant change
        setContainerWidth(newWidth);
        onWidthChange?.(newWidth);
      }
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use borderBoxSize if available for more accurate measurements
        let newWidth: number;
        if (entry.borderBoxSize && entry.borderBoxSize.length > 0) {
          newWidth = entry.borderBoxSize[0].inlineSize;
        } else {
          newWidth = entry.contentRect.width;
        }
        updateWidth(newWidth);
      }
    });

    resizeObserver.observe(container);

    // Also listen to window resize as a fallback
    const handleWindowResize = () => {
      const rect = container.getBoundingClientRect();
      updateWidth(rect.width);
    };
    
    window.addEventListener('resize', handleWindowResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [containerWidth, onWidthChange]);

  // Enhanced initial width detection with better timing
  useEffect(() => {
    const detectWidth = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0) {
          setContainerWidth(rect.width);
          onWidthChange?.(rect.width);
          return true;
        }
      }
      return false;
    };

    // Multiple detection attempts with different timing strategies
    const timeouts: NodeJS.Timeout[] = [];
    
    // Immediate attempt
    if (!detectWidth()) {
      // Quick retry (useful for initial render)
      timeouts.push(setTimeout(() => {
        if (!detectWidth()) {
          // Medium delay (useful after DOM updates)
          timeouts.push(setTimeout(() => {
            if (!detectWidth()) {
              // Longer delay (fallback for slow rendering)
              timeouts.push(setTimeout(() => {
                detectWidth();
              }, 1000));
            }
          }, 200));
        }
      }, 50));
    }

    // Also detect width on next animation frame (good for React rendering)
    const rafId = requestAnimationFrame(() => {
      detectWidth();
    });

    return () => {
      timeouts.forEach(clearTimeout);
      cancelAnimationFrame(rafId);
    };
  }, [onWidthChange]);

  useEffect(() => {
    if (!svgRef.current || !data.length || containerWidth <= 0 || coordMap.size === 0 || widthMap.size === 0) {
      return;
    }

    const svg = d3.select(svgRef.current);

    // Clear previous visualization
    svg.selectAll('*').remove();

    // Constants - use consistent margins with buildLayout (tighter)
    const MARGINS = { top: 20 + topTreeOffset, bottom: 40, ...PLOT_MARGINS };
    
    // Use the full container width minus only the left margin for the plot area
    // The coordMap and widthMap already account for the proper spacing
    const AVAILABLE_WIDTH = containerWidth - MARGINS.left - MARGINS.right;
    
    // Ensure we have reasonable available width
    if (AVAILABLE_WIDTH <= 100) {
      return;
    }

    const LEVEL_HEIGHT = 21; // ~25% smaller
    const INNER_PAD = 2;
    const RUG_HEIGHT = 14;
    const RUG_PAD = 1;
    const BASE_GAP = 15; // ~25% smaller

    // Use the color scale function passed as prop (already has pastel colors and stable mapping)

    // Set up SVG dimensions
    const svgHeight = MARGINS.top + 
                      (selectedLevels.length + 1) * LEVEL_HEIGHT + 
                      (activeGenes.length ? BASE_GAP + activeGenes.length * (RUG_HEIGHT + RUG_PAD) : 0) + 
                      MARGINS.bottom;

    // Set SVG dimensions to use full container width
    svg.attr('width', containerWidth)
       .attr('height', svgHeight);
    
    setLastSvgHeight(svgHeight);

    const plot = svg.append('g')
      .attr('transform', `translate(${MARGINS.left},${MARGINS.top})`);

    // Precompute taxa array for use across levels and domain band
    const taxa = data.map(d => String(d.taxID));

    if (showTaxonomyTree && parsedTaxonomyTree) {
      const treeTopY = 10;
      const treeBottomY = MARGINS.top - 4;
      const treeGroup = svg.append('g')
        .attr('class', 'taxonomy-tree')
        .attr('transform', `translate(${MARGINS.left},${treeTopY})`);
      drawTaxonomyTree({
        group: treeGroup,
        root: parsedTaxonomyTree,
        visibleTaxIDs: new Set(taxa),
        coordMap,
        widthMap,
        treeHeight: treeBottomY - treeTopY,
      });
    }

    const counts: Record<string, Map<string, number>> = {};
    
    selectedLevels.forEach(level => {
      counts[level] = d3.rollup(data, v => v.length, d => String(d[level]));
    });

    // Domain band (zoom out)
    (function drawDomainBand() {
      if (taxa.length === 0) return;
      // Span the same fixed plot extent as the canvas rugs. Deriving this
      // from taxon rectangles can leave a narrow mismatch after a resize.
      const startX = 0;
      const rectWidth = AVAILABLE_WIDTH;
      const y = 0;

      const g = plot.append('g')
        .attr('class', 'level domain')
        .attr('transform', `translate(0,${y})`);

      g.append('rect')
        .attr('x', startX)
        .attr('y', 0)
        .attr('width', rectWidth)
        .attr('height', LEVEL_HEIGHT - INNER_PAD)
        .attr('fill', 'var(--muted)')
        .attr('stroke', 'var(--card)')
        .attr('stroke-width', 0.5)
        .style('cursor', 'pointer')
        .on('click', () => {
          // Pass 'Eukaryota' for user-facing text while level 'domain' triggers reset
          onLineageClick('domain', 'Eukaryota');
        })
        .on('mouseover', (e: MouseEvent) => {
          setHighlightedRect({ x: startX, y, width: rectWidth, height: LEVEL_HEIGHT - INNER_PAD });
          const containerRect = containerRef.current?.getBoundingClientRect();
          if (containerRect) {
            setTooltip({
              isVisible: true,
              x: e.clientX - containerRect.left,
              y: e.clientY - containerRect.top,
              level: 'domain',
              label: '#',
              category: 'Eukaryota',
              count: data.length,
            });
          }
        })
        .on('mousemove', (evt: MouseEvent) => {
          const containerRect = containerRef.current?.getBoundingClientRect();
          if (containerRect) {
            setTooltip(prev => ({ ...prev, x: evt.clientX - containerRect.left, y: evt.clientY - containerRect.top }));
          }
        })
        .on('mouseout', () => {
          setHighlightedRect(null);
          setTooltip(prev => ({ ...prev, isVisible: false }));
        });

      // Inner label inside the domain rectangle
      g.append('text')
        .attr('x', startX + rectWidth / 2)
        .attr('y', (LEVEL_HEIGHT - INNER_PAD) / 2)
        .attr('dy', '.35em')
        .attr('text-anchor', 'middle')
        .text('Eukaryota')
        .style('font-size', '14px')
        .style('font-weight', '500')
        .style('pointer-events', 'none')
        .style('fill', 'var(--foreground)');

      // Level label for domain
      g.append('text')
        .attr('x', -6)
        .attr('y', LEVEL_HEIGHT / 2)
        .attr('dy', '.35em')
        .attr('text-anchor', 'end')
        .text('domain')
        .style('font-size', '16px')
        .style('font-weight', '500')
        .style('fill', 'var(--muted-foreground)');
    })();

    // Draw lineage levels
    // taxa already computed above
    
    const countsLocal: Record<string, Map<string, number>> = counts;
    
  // Keep palette order fixed (no automatic reversing)
  if (prevLevelsCountRef.current !== selectedLevels.length) {
    prevLevelsCountRef.current = selectedLevels.length;
    // Do not reset existing assignments; keep next indices as-is
  }

    selectedLevels.forEach((level, i) => {
      const y = (i + 1) * LEVEL_HEIGHT;
      const g = plot.append('g')
        .attr('class', 'level')
        .attr('transform', `translate(0,${y})`);

      // Create runs for this level
      // Special handling for NA: do not merge consecutive NA segments if their
      // parent taxonomy grouping differs. Grouping is derived from higher
      // ranks currently selected for display (those before this level).
      const runs: Array<{cat: string, start: number, end: number}> = [];
      const parentLevels = selectedLevels.slice(0, i);
      const getGroupKey = (rowIndex: number): string => {
        const taxID = String(data[rowIndex]?.taxID || '');
        const hierarchyKey = hierarchyGroupMap.get(taxID)?.get(level);
        if (hierarchyKey) return hierarchyKey;
        if (parentLevels.length === 0) return '';
        return parentLevels
          .map(parentLevel => String(data[rowIndex]?.[parentLevel] ?? 'NA'))
          .join('|');
      };

      let start = 0;
      let currentCat = ((data[0]?.[level] as string) || 'Unknown');
      let currentGroupKey = getGroupKey(0);

      for (let k = 1; k < taxa.length; k++) {
        const nextCat = ((data[k]?.[level] as string) || 'Unknown');
        const nextGroupKey = getGroupKey(k);

        if (nextCat !== currentCat || nextGroupKey !== currentGroupKey) {
          runs.push({ cat: currentCat, start, end: k - 1 });
          currentCat = nextCat;
          currentGroupKey = nextGroupKey;
          start = k;
        }
      }
      runs.push({ cat: currentCat, start, end: taxa.length - 1 });

      // Draw rectangles using full calculated coordinates
      const rects = g.selectAll('rect')
        .data(runs.map((r, idx) => ({ ...r, __runIndex: idx })))
        .join('rect')
        .attr('x', d => {
          const taxonKey = taxa[d.start];
          const x = coordMap.get(taxonKey) || 0;
          return x;
        })
        .attr('y', 0)
        .attr('width', d => {
          const startKey = taxa[d.start];
          const endKey = taxa[d.end];
          const startX = coordMap.get(startKey) || 0;
          const endX = coordMap.get(endKey) || 0;
          const endW = widthMap.get(endKey) || 0;
          const width = endX + endW - startX;
          return width;
        })
        .attr('height', LEVEL_HEIGHT - INNER_PAD)
        .attr('fill', (d) => {
          const isNA = String(d.cat).toUpperCase() === 'NA';
          if (isNA) return 'var(--muted)';
          // Stable per-category color assignment within each level
          let levelMap = levelCategoryColorMapRef.current.get(level);
          if (!levelMap) {
            levelMap = new Map();
            levelCategoryColorMapRef.current.set(level, levelMap);
          }
          if (!levelMap.has(d.cat)) {
            // Determine next index for this level, reversing palette when toggled
            const currentIndex = levelNextIndexRef.current.get(level) ?? 0;
            const palette = WEBSITE_CATEGORY_COLORS;
            const assignedColor = palette[currentIndex % palette.length];
            levelMap.set(d.cat, assignedColor);
            levelNextIndexRef.current.set(level, currentIndex + 1);
          }
          const color = levelMap.get(d.cat)!;
          return color;
        })
        .attr('stroke', 'var(--card)')
        .attr('stroke-width', 0.5)
        .style('cursor', 'pointer')
        .style('pointer-events', 'auto')
        // Assign unique id per rectangle to support NA run-specific filtering
        .attr('data-run-id', d => `${level}:${d.start}-${d.end}`)
        // Store tooltip metadata on the SVG element so taxonomy hover remains
        // independent from the optional canvas-based gene rugs.
        .attr('data-taxonomy-level', level)
        .attr('data-category', d => String(d.cat).toUpperCase() === 'NA' ? 'NA' : String(d.cat))
        .attr('data-count', d => String(d.cat).toUpperCase() === 'NA'
          ? d.end - d.start + 1
          : (countsLocal[level].get(String(d.cat)) || 0))
        .attr('data-plot-y', y);
      
      
      rects
        .on('click', (_event, d) => {
          const isNA = String(d.cat).toUpperCase() === 'NA';
          const category = isNA ? 'NA' : d.cat;
          // Always pass the specific run range so each NA block filters only its segment
          onLineageClick(level, category, { start: d.start, end: d.end });
        });

      // Add taxonomy labels inside rectangles
      g.selectAll('text.taxonomy-label')
        .data(runs.map((r, idx) => ({ ...r, __runIndex: idx })))
        .join('text')
        .attr('class', 'taxonomy-label')
        .attr('x', d => {
          const startKey = taxa[d.start];
          const endKey = taxa[d.end];
          const startX = coordMap.get(startKey) || 0;
          const endX = coordMap.get(endKey) || 0;
          const endW = widthMap.get(endKey) || 0;
          const width = endX + endW - startX;
          return startX + width / 2; // Center of rectangle
        })
        .attr('y', (LEVEL_HEIGHT - INNER_PAD) / 2)
        .attr('dy', '.35em')
        .attr('text-anchor', 'middle')
        .text(d => String(d.cat).toUpperCase() === 'NA' ? '' : String(d.cat))
        .style('font-size', '14px')
        .style('font-weight', '500')
        .style('pointer-events', 'none') // Don't interfere with rectangle clicks
        .style('fill', d => {
          const isNA = String(d.cat).toUpperCase() === 'NA';
          // Match the rectangle color chosen for this level/category
          const levelMap = levelCategoryColorMapRef.current.get(level);
          if (isNA) return 'var(--foreground)';
          const bgColor = levelMap?.get(d.cat) || WEBSITE_CATEGORY_COLORS[0];
          return getContrastingTextColor(bgColor);
        })
        .each(function(d) {
          // Hide text if it doesn't fit in the rectangle
          const textElement = this as SVGTextElement;
          if (!textElement) return;
          
          const textWidth = textElement.getBBox().width;
          const startKey = taxa[d.start];
          const endKey = taxa[d.end];
          const startX = coordMap.get(startKey) || 0;
          const endX = coordMap.get(endKey) || 0;
          const endW = widthMap.get(endKey) || 0;
          const rectWidth = endX + endW - startX;
          
          if (textWidth + 8 > rectWidth) { // 8px padding
            textElement.style.display = 'none';
          }
        });

      // Add level label
      g.append('text')
        .attr('x', -6)
        .attr('y', LEVEL_HEIGHT / 2)
        .attr('dy', '.35em')
        .attr('text-anchor', 'end')
        .text(level)
        .style('font-size', '16px')
        .style('font-weight', '500')
        .style('fill', 'var(--muted-foreground)');
    });

    // Heatmap legend removed

    // Keep SVG labels for gene rugs - they're not the performance bottleneck
    if (activeGenes.length > 0) {
      const rugLabels = plot.append('g').attr('class', 'rug-labels');
      const baseY = (selectedLevels.length + 1) * LEVEL_HEIGHT + BASE_GAP;

      activeGenes.forEach((gene, geneIdx) => {
        const y = baseY + geneIdx * (RUG_HEIGHT + RUG_PAD);
        
        // Add gene label (keep in SVG for easy text rendering)
        rugLabels.append('text')
          .attr('x', -6)
          .attr('y', y + RUG_HEIGHT / 2 + 1)
          .attr('dominant-baseline', 'central')
          .attr('text-anchor', 'end')
          .text(formatPhyleticGeneLabel(gene))
          .style('font-size', '14px')
          .style('font-weight', '500')
          .style('fill', gene.includes('-') || gene.includes('>') ? 'var(--primary)' : 'var(--foreground)');
      });
    }

    // Add highlight layer on top of everything
    plot.append('g').attr('class', 'highlight-layer');

      }, [data, selectedLevels, activeGenes, coordMap, widthMap, onLineageClick, containerWidth, rugMode, parsedTaxonomyTree, hierarchyGroupMap, showTaxonomyTree, topTreeOffset]);

  // Separate effect for Canvas-based gene rug rendering
  useEffect(() => {
    if (!canvasRef.current || containerWidth <= 0) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    // Constants matching SVG version
    const MARGINS = { top: 20 + topTreeOffset, bottom: 40, ...PLOT_MARGINS }; // keep in sync with SVG
    const LEVEL_HEIGHT = 21; // ~25% smaller
    const RUG_HEIGHT = 14;
    const RUG_PAD = 1;
    const BASE_GAP = 15; // ~25% smaller

    // Calculate canvas dimensions to match SVG exactly
    const svgHeight = MARGINS.top + 
                      (selectedLevels.length + 1) * LEVEL_HEIGHT + 
                      (activeGenes.length ? BASE_GAP + activeGenes.length * (RUG_HEIGHT + RUG_PAD) : 0) + 
                      MARGINS.bottom;

    // Set canvas dimensions with device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = containerWidth * dpr;
    canvas.height = svgHeight * dpr;
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${svgHeight}px`;
    // Reset any previous transforms before scaling
    // so repeated renders don't compound the scale
    // Then apply the DPR scale for crisp lines
    const anyContext = context as unknown as { setTransform?: (a: number, b: number, c: number, d: number, e: number, f: number) => void };
    if (typeof anyContext.setTransform === 'function') {
      anyContext.setTransform(1, 0, 0, 1, 0, 0);
    }
    context.scale(dpr, dpr);
    

    // Clear canvas
    context.clearRect(0, 0, canvas.width, canvas.height);

    // If there are no active genes, we've already cleared and resized
    // the canvas, so we can stop here to ensure no stale rugs remain visible
    if (activeGenes.length === 0) {
      return;
    }

    // Draw gene rugs using Canvas with black-white heatmap based on counts
    const taxa = data.map(d => String(d.taxID));
    const baseY = MARGINS.top + (selectedLevels.length + 1) * LEVEL_HEIGHT + BASE_GAP;

    // Calculate normalization values based on mode
    const geneMaxCounts: Map<string, number> = new Map();
    let globalMaxCount = 0;
    
    activeGenes.forEach((gene) => {
      let maxCount = 0;
      taxa.forEach((taxon) => {
        const cm = countMap.get(taxon);
        const cnt = cm ? (cm[gene] || 0) : 0;
        if (cnt > maxCount) maxCount = cnt;
        if (cnt > globalMaxCount) globalMaxCount = cnt;
      });
      geneMaxCounts.set(gene, maxCount);
    });

    // draw rugs per gene with color based on normalized counts
    activeGenes.forEach((gene, geneIdx) => {
      const y = baseY + geneIdx * (RUG_HEIGHT + RUG_PAD);
      const maxCount = geneMaxCounts.get(gene) || 0;
      
      taxa.forEach((taxon) => {
        // Canvas coordinate system - need to add MARGINS.left since Canvas is absolute
        const x = (coordMap.get(taxon) || 0) + MARGINS.left;
        const width = widthMap.get(taxon) || 0;

        const cm = countMap.get(taxon);
        const count = cm ? (cm[gene] || 0) : 0;

        // Normalize the count (0 to 1) based on mode
        let normalizedValue: number;
        if (rugMode === 'heatmap') {
          // Global normalization: normalize against maximum across all genes, capped at 1,000
          const cappedCount = Math.min(count, HEATMAP_MAX_COUNT);
          const cappedGlobalMax = Math.min(globalMaxCount, HEATMAP_MAX_COUNT);
          normalizedValue = cappedGlobalMax > 0 ? (cappedCount / cappedGlobalMax) : 0;
        } else {
          // Per-gene normalization: normalize against maximum for this gene
          normalizedValue = maxCount > 0 ? (count / maxCount) : 0;
        }

        let color: string;
        if (rugMode === 'binary') {
          color = count > 0 ? 'rgb(0,0,0)' : 'rgb(255,255,255)';
        } else if (rugMode === 'heatmap') {
          // Linear 3-color heatmap with requested ranges:
          // gray (1..50) → wheat (51..1,000) → red (>1,000 capped to 1,000)
          if (count <= 0) {
            color = 'rgb(255,255,255)';
          } else if (count <= HEATMAP_MIDPOINT) {
            // Linear interpolation: gray -> wheat (1 to 50)
            const t = (count - 1) / (HEATMAP_MIDPOINT - 1);
            const c1 = d3.rgb(HEAT_LOW_GRAY);
            const c2 = d3.rgb(HEAT_MID_YELLOW);
            const r = Math.round(c1.r + (c2.r - c1.r) * t);
            const g = Math.round(c1.g + (c2.g - c1.g) * t);
            const b = Math.round(c1.b + (c2.b - c1.b) * t);
            color = `rgb(${r}, ${g}, ${b})`;
          } else {
            // Linear interpolation: wheat -> red (50 to 1,000)
            const t = (Math.min(count, HEATMAP_MAX_COUNT) - HEATMAP_MIDPOINT) / (HEATMAP_MAX_COUNT - HEATMAP_MIDPOINT);
            const c1 = d3.rgb(HEAT_MID_YELLOW);
            const c2 = d3.rgb(HEAT_HIGH_RED);
            const r = Math.round(c1.r + (c2.r - c1.r) * t);
            const g = Math.round(c1.g + (c2.g - c1.g) * t);
            const b = Math.round(c1.b + (c2.b - c1.b) * t);
            color = `rgb(${r}, ${g}, ${b})`;
          }
        } else {
          // Normalized (grayscale): white (255,255,255) at 0 → black (0,0,0) at max
          const intensity = Math.round(255 * (1 - normalizedValue));
          color = `rgb(${intensity}, ${intensity}, ${intensity})`;
        }
        context.fillStyle = color;
        context.globalAlpha = 1.0;
        context.fillRect(x, y, width, RUG_HEIGHT);
      });
      
      context.globalAlpha = 1.0;
    });
    
  }, [data, selectedLevels, activeGenes, coordMap, widthMap, countMap, containerWidth, rugMode, topTreeOffset]);

  // Expose a method to download current visualization as an SVG (embedding canvas as an image)
  useImperativeHandle(ref, () => ({
    downloadSVG,
  }), [downloadSVG]);

  // Taxonomy rectangles are SVG while gene rugs are Canvas. Delegate taxonomy
  // hover from the shared container so its tooltip works with or without rugs.
  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;
    const container = containerRef.current;

    const getTaxonomyRect = (target: EventTarget | null): SVGRectElement | null => {
      if (!(target instanceof Element)) return null;
      const rectangle = target.closest('rect[data-run-id]');
      return rectangle instanceof SVGRectElement && container.contains(rectangle)
        ? rectangle
        : null;
    };

    const handleTaxonomyMouseMove = (event: MouseEvent) => {
      const rectangle = getTaxonomyRect(event.target);
      if (!rectangle) return;

      const containerRect = container.getBoundingClientRect();
      setHighlightedRect({
        x: Number(rectangle.getAttribute('x')) || 0,
        y: Number(rectangle.dataset.plotY) || 0,
        width: Number(rectangle.getAttribute('width')) || 0,
        height: Number(rectangle.getAttribute('height')) || 0,
      });
      setTooltip({
        isVisible: true,
        x: event.clientX - containerRect.left,
        y: event.clientY - containerRect.top,
        level: rectangle.dataset.taxonomyLevel || '',
        label: '#',
        category: rectangle.dataset.category || '',
        count: Number(rectangle.dataset.count) || 0,
      });
    };

    const handleTaxonomyMouseOut = (event: MouseEvent) => {
      const rectangle = getTaxonomyRect(event.target);
      if (!rectangle) return;

      const nextRectangle = getTaxonomyRect(event.relatedTarget);
      if (nextRectangle === rectangle) return;
      setHighlightedRect(null);
      setTooltip(previous => ({ ...previous, isVisible: false }));
    };

    container.addEventListener('mousemove', handleTaxonomyMouseMove);
    container.addEventListener('mouseout', handleTaxonomyMouseOut);
    return () => {
      container.removeEventListener('mousemove', handleTaxonomyMouseMove);
      container.removeEventListener('mouseout', handleTaxonomyMouseOut);
    };
  }, [data.length]);

  // Container-level hover for canvas rugs: show family name and count
  useEffect(() => {
    if (!containerRef.current || activeGenes.length === 0) return;
    const container = containerRef.current;

    const MARGINS = { top: 20 + topTreeOffset, bottom: 40, ...PLOT_MARGINS }; // keep in sync
    const LEVEL_HEIGHT = 21;
    const RUG_HEIGHT = 14;
    const RUG_PAD = 1;
    const BASE_GAP = 15;

    const taxa = data.map(d => String(d.taxID));

    const handleMouseMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      const baseY = MARGINS.top + (selectedLevels.length + 1) * LEVEL_HEIGHT + BASE_GAP;
      const lineageAreaMaxY = MARGINS.top + (selectedLevels.length + 1) * LEVEL_HEIGHT;
      if (mouseY < lineageAreaMaxY) {
        // Cursor is in lineage SVG area; let rectangle handlers manage tooltip
        return;
      }

      let hoveredFamily: string | null = null;
      let hoveredTaxon: string | null = null;

      for (let geneIdx = 0; geneIdx < activeGenes.length; geneIdx++) {
        const family = activeGenes[geneIdx];
        const rugY = baseY + geneIdx * (RUG_HEIGHT + RUG_PAD);
        if (mouseY >= rugY && mouseY <= rugY + RUG_HEIGHT) {
          for (const taxon of taxa) {
            const taxonX = (coordMap.get(taxon) || 0) + MARGINS.left;
            const taxonW = widthMap.get(taxon) || 0;
            if (mouseX >= taxonX && mouseX <= taxonX + taxonW) {
              hoveredFamily = family;
              hoveredTaxon = taxon;
              break;
            }
          }
          break;
        }
      }

      if (hoveredFamily && hoveredTaxon) {
        const cm = countMap.get(hoveredTaxon);
        const count = cm ? (cm[hoveredFamily] || 0) : 0;
        setTooltip({
          isVisible: true,
          x: mouseX,
          y: mouseY,
          level: 'Family',
          label: '#',
          category: formatPhyleticGeneLabel(hoveredFamily),
          count,
        });
      } else {
        setTooltip(prev => ({ ...prev, isVisible: false }));
      }
    };

    const handleMouseLeave = () => {
      setTooltip(prev => ({ ...prev, isVisible: false }));
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [data, selectedLevels, activeGenes, coordMap, widthMap, countMap, topTreeOffset]);

  // Separate effect to handle highlight updates
  useEffect(() => {
    if (!svgRef.current) return;
    
    const svg = d3.select(svgRef.current);
    const highlightLayer = svg.select('.highlight-layer');
    
    if (highlightLayer.empty()) return;
    
    // Clear existing highlight
    highlightLayer.selectAll('.highlight-rect').remove();
    
    // Add new highlight if needed
    if (highlightedRect) {
      highlightLayer.append('rect')
        .attr('class', 'highlight-rect')
        .attr('x', highlightedRect.x)
        .attr('y', highlightedRect.y)
        .attr('width', highlightedRect.width)
        .attr('height', highlightedRect.height)
        .attr('fill', 'none')
        .attr('stroke', 'var(--foreground)')
        .attr('stroke-width', 2)
        .attr('pointer-events', 'none');
    }
  }, [highlightedRect]);

  if (!data.length) {
    return (
      <Card className="border-dashed border-2 border-border">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Database className="w-16 h-16 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No Family Data Loaded</h3>
          <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
            Upload a TSV file containing gene-family counts keyed by taxID to visualize their distribution across eukaryotic lineages
          </p>
          <Button onClick={onLoadTSV} size="lg" className="mb-4">
            <Upload className="w-5 h-5 mr-2" />
            Load TSV File
          </Button>
          <div className="text-xs text-muted-foreground text-center">
            <p>Expected format: taxID column for taxonomy mapping, family counts in subsequent columns</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Visualization Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Badge variant="outline" className="flex items-center gap-2">
            <Database className="w-3 h-3" />
            {data.length.toLocaleString()} taxa
          </Badge>
          <Badge variant="outline" className="flex items-center gap-2">
            <MousePointer className="w-3 h-3" />
            Click blocks to filter
          </Badge>
        </div>
        <div className="flex items-center space-x-2">
          <Button size="sm" onClick={downloadSVG}>
            Download SVG
          </Button>
          {activeGenes.length > 0 && (
            <Badge variant="secondary">
              {activeGenes.length} families visualized
            </Badge>
          )}
        </div>
      </div>

      {/* Visualization */}
      <Card className="w-full">
        <CardContent className="p-0 w-full">
          <div 
            ref={containerRef}
            className="relative bg-card rounded-lg overflow-hidden w-full min-h-[200px] flex-1"
            style={{ maxWidth: '100%' }}
          >
            <canvas 
              ref={canvasRef} 
              className="absolute top-0 left-0 max-w-full"
              style={{ width: '100%', height: 'auto', pointerEvents: 'none', maxWidth: '100%' }}
            />
            <svg 
              ref={svgRef} 
              className="relative w-full h-auto block min-h-[200px] max-w-full"
              style={{ background: 'transparent', width: '100%', height: 'auto' }}
            />
            <Tooltip 
              isVisible={tooltip.isVisible}
              x={tooltip.x}
              y={tooltip.y}
              label={tooltip.label || '#'}
              category={tooltip.category}
              count={tooltip.count}
            />
          </div>
        </CardContent>
      </Card>

    </div>
  );
});

type NewickNode = {
  id: number;
  name?: string;
  taxonomyRank?: string;
  length?: number;
  children: NewickNode[];
  x?: number;
  distance?: number;
};

function parseNewick(newickString: string): NewickNode {
  const source = newickString.trim();
  let index = 0;
  let nextNodeID = 0;

  const parseName = () => {
    if (source[index] === "'") {
      index += 1;
      let name = '';
      while (index < source.length && source[index] !== "'") name += source[index++];
      index += 1;
      return name;
    }
    const start = index;
    while (index < source.length && !/[,():;]/.test(source[index])) index += 1;
    return source.slice(start, index).trim();
  };

  const parseLength = (node: NewickNode) => {
    if (source[index] !== ':') return;
    index += 1;
    const start = index;
    while (index < source.length && !/[,();]/.test(source[index])) index += 1;
    const length = Number(source.slice(start, index));
    node.length = Number.isFinite(length) ? length : 0;
  };

  const parseSubtree = (): NewickNode => {
    if (source[index] !== '(') {
      const leaf: NewickNode = { id: nextNodeID++, name: parseName(), children: [] };
      parseLength(leaf);
      return leaf;
    }

    index += 1;
    const node: NewickNode = { id: nextNodeID++, children: [] };
    while (true) {
      node.children.push(parseSubtree());
      if (source[index] === ',') {
        index += 1;
        continue;
      }
      if (source[index] !== ')') throw new Error('Invalid Newick hierarchy');
      index += 1;
      break;
    }
    if (index < source.length && !/[,):;]/.test(source[index])) {
      node.name = parseName();
      const separatorIndex = node.name.indexOf('__');
      if (separatorIndex > 0) node.taxonomyRank = node.name.slice(0, separatorIndex);
    }
    parseLength(node);
    return node;
  };

  const root = parseSubtree();
  if (source[index] !== ';') throw new Error('Invalid Newick hierarchy: missing semicolon');
  return root;
}

const BOX_RANK_ORDER = [
  'domain',
  'kingdom',
  'subkingdom',
  'phylum',
  'subphylum',
  'superclass',
  'class',
  'subclass',
  'infraclass',
  'cohort',
  'subcohort',
  'superorder',
  'order',
  'suborder',
  'infraorder',
  'parvorder',
  'superfamily',
  'family',
  'subfamily',
  'tribe',
  'subtribe',
  'genus',
  'subgenus',
  'section',
  'series',
  'species group',
  'species subgroup',
  'species',
  'subspecies',
  'varietas',
  'forma',
  'forma specialis',
  'strain',
  'isolate',
] as const;

function buildHierarchyGroupMap(root: NewickNode): Map<string, Map<string, string>> {
  const groupsByTaxID = new Map<string, Map<string, string>>();
  const rankIndex = new Map<string, number>();
  BOX_RANK_ORDER.forEach((rank, index) => rankIndex.set(rank, index));

  const visit = (node: NewickNode, ancestorPath: NewickNode[]) => {
    const path = node.children.length ? [...ancestorPath, node] : ancestorPath;
    if (!node.children.length) {
      if (!node.name) return;
      const groups = new Map<string, string>();

      BOX_RANK_ORDER.forEach((rank, targetIndex) => {
        const exactNode = [...path].reverse().find(ancestor => ancestor.taxonomyRank === rank);
        if (exactNode) {
          groups.set(rank, `node:${exactNode.id}`);
          return;
        }

        const firstNarrowerIndex = path.findIndex(ancestor => {
          const ancestorRankIndex = ancestor.taxonomyRank
            ? rankIndex.get(ancestor.taxonomyRank)
            : undefined;
          return ancestorRankIndex !== undefined && ancestorRankIndex > targetIndex;
        });
        const anchor = firstNarrowerIndex > 0
          ? path[firstNarrowerIndex - 1]
          : path[path.length - 1] || root;
        groups.set(rank, `missing:${rank}:${anchor.id}`);
      });

      groupsByTaxID.set(node.name, groups);
      return;
    }
    node.children.forEach(child => visit(child, path));
  };

  visit(root, []);
  return groupsByTaxID;
}

function pruneTaxonomyTree(node: NewickNode, visibleTaxIDs: Set<string>): NewickNode | null {
  if (!node.children.length) {
    return node.name && visibleTaxIDs.has(node.name)
      ? { id: node.id, name: node.name, length: node.length, children: [] }
      : null;
  }

  const children = node.children
    .map(child => pruneTaxonomyTree(child, visibleTaxIDs))
    .filter((child): child is NewickNode => child !== null);
  return children.length
    ? {
        id: node.id,
        name: node.name,
        taxonomyRank: node.taxonomyRank,
        length: node.length,
        children,
      }
    : null;
}

function positionTaxonomyTree(
  node: NewickNode,
  distance: number,
  leafCenters: Map<string, number>,
): { x: number; maxDistance: number } {
  node.distance = distance;
  if (!node.children.length) {
    node.x = leafCenters.get(node.name || '') ?? 0;
    return { x: node.x, maxDistance: distance };
  }

  const childPositions = node.children.map(child =>
    positionTaxonomyTree(child, distance + (child.length || 0), leafCenters)
  );
  node.x = childPositions.reduce((sum, child) => sum + child.x, 0) / childPositions.length;
  return {
    x: node.x,
    maxDistance: Math.max(...childPositions.map(child => child.maxDistance)),
  };
}

function drawTaxonomyTree({
  group,
  root,
  visibleTaxIDs,
  coordMap,
  widthMap,
  treeHeight,
}: {
  group: d3.Selection<SVGGElement, unknown, null, undefined>;
  root: NewickNode;
  visibleTaxIDs: Set<string>;
  coordMap: Map<string, number>;
  widthMap: Map<string, number>;
  treeHeight: number;
}) {
  const pruned = pruneTaxonomyTree(root, visibleTaxIDs);
  if (!pruned) return;

  const leafCenters = new Map<string, number>();
  visibleTaxIDs.forEach(taxID => {
    const x = coordMap.get(taxID);
    const width = widthMap.get(taxID);
    if (x !== undefined && width !== undefined) leafCenters.set(taxID, x + width / 2);
  });

  const { maxDistance } = positionTaxonomyTree(pruned, 0, leafCenters);
  const yScale = Math.max(treeHeight - 4, 1) / Math.max(maxDistance, 1);
  const segments: string[] = [];

  const walk = (node: NewickNode) => {
    if (!node.children.length) return;
    const parentY = (node.distance || 0) * yScale;
    const childXs = node.children.map(child => child.x || 0);

    segments.push(`M${d3.min(childXs) ?? 0},${parentY}H${d3.max(childXs) ?? 0}`);

    node.children.forEach(child => {
      segments.push(`M${child.x || 0},${parentY}V${(child.distance || 0) * yScale}`);
      walk(child);
    });
  };

  walk(pruned);
  group.append('path')
    .attr('d', segments.join(''))
    .attr('fill', 'none')
    .attr('stroke', 'var(--muted-foreground)')
    .attr('stroke-width', 0.8)
    .attr('vector-effect', 'non-scaling-stroke');
}
