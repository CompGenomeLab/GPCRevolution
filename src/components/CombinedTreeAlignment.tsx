'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import useCleanedSequences from '@/hooks/useCleanedSequence';

type NewickNode = {
  name?: string;
  length?: number;
  support?: number;
  children: NewickNode[];
  // layout fields
  x?: number;
  y?: number;
  dist?: number;
  // identity path for collapse toggling
  idPath?: number[];
  idStr?: string;
};

// 200-character test alignment string (placeholder until real MSA is wired)
const DEFAULT_TEST_ALIGNMENT = 'ACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWY';

// Letter spacing applied to alignment characters (in em units)
const LETTER_SPACING_EM = 0.24;

export type CombinedTreeAlignmentProps = {
  // Required tree input as Newick string
  newick: string;
  // Optional FASTA alignment string
  alignmentFasta?: string;
  // Fixed alignment panel width (scrolls horizontally if sequences overflow)
  alignmentBoxWidthPx?: number;
  // Optional: alignment placeholder text rendering
  alignmentText?: string; // identical text per sequence row
  // Dimensions; if undefined, component will autosize to parent
  width?: number;
  height?: number;
  // Fixed tree width in pixels (from root to furthest leaf)
  treeWidthPx?: number;
  // Visual toggles
  showSupportOnBranches?: boolean;
  mirrorRightToLeft?: boolean;
  // Style
  fontSize?: number;
  leafRowSpacing?: number;
  // Sequence area padding
  sequenceTopPadding?: number;
  sequenceBottomPadding?: number;
  // Overall container padding
  containerTopPadding?: number;
  containerBottomPadding?: number;
  // Alignment area padding
  alignmentRightPadding?: number;
  // Dark mode
  isDarkMode?: boolean;
  // Receptor data for GPCRdb numbering (will use conservationFile from receptor object)
  receptor?: { conservationFile?: string } | null;
};

/**
 * Parse a Newick string into a tree of NewickNode.
 * Supports quoted names, support values on internal nodes, and branch lengths.
 */
function parseNewick(newickString: string): NewickNode {
  const s = newickString.trim();
  let i = 0;

  function parseName(): string {
    if (s[i] === "'") {
      i++;
      let out = '';
      while (i < s.length && s[i] !== "'") out += s[i++];
      i++;
      return out;
    }
    const start = i;
    while (i < s.length && !/,|\(|\)|:|;/.test(s[i])) i++;
    return s.slice(start, i).trim();
  }

  function parseNumber(): number | null {
    const match = s.slice(i).match(/^[+-]?(?:\d+\.?\d*|\d*\.\d+)(?:[eE][+-]?\d+)?/);
    if (!match) return null;
    i += match[0].length;
    return parseFloat(match[0]);
  }

  function parseLength(n: NewickNode) {
    if (s[i] === ':') {
      i++;
      n.length = parseNumber() ?? 0;
    }
  }

  function parseSubtree(): NewickNode {
    if (s[i] === '(') {
      i++;
      const node: NewickNode = { children: [], length: 0 };
      while (true) {
        const child = parseSubtree();
        parseLength(child);
        node.children.push(child);
        if (s[i] === ',') {
          i++;
          continue;
        }
        if (s[i] === ')') {
          i++;
          break;
        }
      }
      // Optional label or support after closing paren
      if (/[^,:);]/.test(s[i] || '')) {
        const label = parseName();
        const numeric = Number(label);
        if (!Number.isNaN(numeric)) node.support = numeric;
        else node.name = label;
      }
      return node;
    }
    // Leaf
    return { name: parseName(), children: [], length: 0 };
  }

  const root = parseSubtree();
  parseLength(root);
  if (s[i] !== ';') throw new Error('Invalid Newick: missing ;');
  return root;
}

type LaidOut = {
  tree: NewickNode;
  totalHeight: number;
  maxDistance: number;
  // Visible row endpoints (either leaves or collapsed internal nodes)
  rowNodes: NewickNode[];
  // Only the leaves that are not hidden by collapse
  visibleLeaves: NewickNode[];
};

/**
 * Compute x/y coordinates for each node based on cumulative branch length (x)
 * and leaf order with uniform spacing (y).
 */
function layoutTree(
  tree: NewickNode,
  leafRowSpacing: number,
  collapsed: Set<string>,
): LaidOut {
  const visibleLeaves: NewickNode[] = [];
  const rowNodes: NewickNode[] = [];
  let maxDist = 0;

  function dfsDistance(node: NewickNode, accumulated: number, path: number[]) {
    const next = accumulated + (node.length || 0);
    node.dist = next;
    node.idPath = path;
    node.idStr = path.join('.') || 'root';
    if (next > maxDist) maxDist = next;
    for (let c = 0; c < node.children.length; c++) {
      dfsDistance(node.children[c], next, [...path, c]);
    }
  }
  dfsDistance(tree, 0, []);

  let yCursor = 0;
  function assignY(node: NewickNode) {
    const isCollapsedHere = node.idStr ? collapsed.has(node.idStr) : false;
    if (isCollapsedHere || !node.children.length) {
      node.y = yCursor;
      yCursor += leafRowSpacing;
      if (!node.children.length) visibleLeaves.push(node);
      rowNodes.push(node);
      return;
    }
    node.children.forEach(assignY);
    node.y = node.children.reduce((sum, child) => sum + (child.y || 0), 0) / node.children.length;
  }
  assignY(tree);

  return {
    tree,
    totalHeight: rowNodes.length > 0 ? yCursor - leafRowSpacing / 2 : 0,
    maxDistance: maxDist,
    rowNodes,
    visibleLeaves,
  };
}

function assignXPositions(node: NewickNode, scaleX: number) {
  node.x = (node.dist || 0) * scaleX;
  node.children.forEach(child => assignXPositions(child, scaleX));
}

/**
 * A combined viewer showing a phylogenetic tree (left) and a placeholder grid
 * for an alignment (right). The alignment portion is intentionally a stub now
 * and will be filled in a subsequent step.
 */
export function CombinedTreeAlignment({
  newick,
  alignmentFasta,
  alignmentText = DEFAULT_TEST_ALIGNMENT,
  width,
  height,
  treeWidthPx = 175,
  showSupportOnBranches = true,
  mirrorRightToLeft = false,
  fontSize = 12,
  leafRowSpacing = 28,
  sequenceTopPadding = 4,
  sequenceBottomPadding = 4,
  containerTopPadding = 0,
  containerBottomPadding = 0,
  alignmentRightPadding = 4,
  isDarkMode,
  receptor,
}: CombinedTreeAlignmentProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Mirror site-wide dark mode like other components (SequenceLogoChart, etc.)
  // Initialize synchronously from document to avoid a light→dark flash on first paint
  const [detectedDarkMode, setDetectedDarkMode] = useState<boolean>(() => {
    try {
      const html = typeof document !== 'undefined' ? document.documentElement : null;
      const body = typeof document !== 'undefined' ? document.body : null;
      if (!html || !body) return false;
      const hasDarkClass = html.classList.contains('dark') || body.classList.contains('dark');
      const hasDarkData = html.getAttribute('data-theme') === 'dark' || body.getAttribute('data-theme') === 'dark';
      return hasDarkClass || hasDarkData;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const updateTheme = () => {
      try {
        const html = document.documentElement;
        const body = document.body;
        const hasDarkClass = html.classList.contains('dark') || body.classList.contains('dark');
        const hasDarkData = html.getAttribute('data-theme') === 'dark' || body.getAttribute('data-theme') === 'dark';
        setDetectedDarkMode(hasDarkClass || hasDarkData);
      } catch {
        setDetectedDarkMode(false);
      }
    };
    updateTheme();
    const htmlObserver = new MutationObserver(updateTheme);
    const bodyObserver = new MutationObserver(updateTheme);
    htmlObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    if (document.body) bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => {
      htmlObserver.disconnect();
      bodyObserver.disconnect();
    };
  }, []);
  // Effective dark mode: explicit prop wins when provided; otherwise use detected
  const effectiveDarkMode = typeof isDarkMode === 'boolean' ? isDarkMode : detectedDarkMode;
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: width || 800, h: height || 500 });

  // Parse FASTA and use the cleaning hook
  const parsedSequences = useMemo(() => {
    if (!alignmentFasta) return [];
    const lines = alignmentFasta.split('\n');
    const sequences: { header: string; sequence: string }[] = [];
    let currentHeader = '';
    let currentSequence = '';
    
    for (const line of lines) {
      if (line.startsWith('>')) {
        if (currentHeader) sequences.push({ header: currentHeader, sequence: currentSequence });
        currentHeader = line.substring(1);
        currentSequence = '';
      } else {
        currentSequence += line.trim();
      }
    }
    if (currentHeader) sequences.push({ header: currentHeader, sequence: currentSequence });
    return sequences;
  }, [alignmentFasta]);

  const cleanedSequences = useCleanedSequences(parsedSequences);

  // Load conservation data for GPCRdb numbering
  const [gpcrdbNumbers, setGpcrdbNumbers] = useState<string[]>([]);
  
  useEffect(() => {
    const conservationFile = receptor?.conservationFile;
    if (!conservationFile) {
      setGpcrdbNumbers([]);
      return;
    }
    
    fetch(`/${conservationFile}`)
      .then(response => response.text())
      .then(data => {
        const lines = data.split('\n');
        const numbers: string[] = [];
        
        if (lines.length === 0) return;
        
        // Parse header to find gpcrdb column index
        const headerColumns = lines[0].split('\t');
        const gpcrdbColumnIndex = headerColumns.findIndex(col => col.trim().toLowerCase() === 'gpcrdb');
        
        if (gpcrdbColumnIndex === -1) {
          console.error('GPCRdb column not found in conservation file');
          return;
        }
        
        console.log('Found GPCRdb column at index:', gpcrdbColumnIndex);
        
        // Parse each data line
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const columns = line.split('\t');
          if (columns.length > gpcrdbColumnIndex) {
            const gpcrdbNumber = columns[gpcrdbColumnIndex].trim();
            numbers.push(gpcrdbNumber);
          }
        }
        
        console.log('Loaded GPCRdb numbers (first 10):', numbers.slice(0, 10));
        console.log('GPCRdb numbers (positions 45-55):', numbers.slice(44, 55));
        console.log('Total GPCRdb numbers loaded:', numbers.length);
        setGpcrdbNumbers(numbers);
      })
      .catch(error => {
        console.error('Error loading conservation file:', error);
        setGpcrdbNumbers([]);
      });
  }, [receptor?.conservationFile]);

  // Only autosize width if not provided (height is now calculated based on content)
  useEffect(() => {
    if (width) return;
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerSize({ w: el.clientWidth || 800, h: containerSize.h });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, containerSize.h]);

  const parsedTree = useMemo(() => {
    try {
      return parseNewick(newick);
    } catch {
      return null;
    }
  }, [newick]);

  // Collapsed node state keyed by idStr
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Derived drawing metrics
  const treePadding = 16; // left padding and bottom padding
  // Compact header height for rotated GPCRdb numbers
  // alignmentHeaderHeight will be computed dynamically below based on widest label
  
  // Fine-tune vertical gaps relative to the header bottom
  const headerToSeqGapPx = Math.max(2, Math.round(fontSize * 0.5)); // slightly larger gap for sequences

  // Use fixed row spacing - no dynamic calculation based on container
  const dynamicRowSpacing = leafRowSpacing;

  const laidOut = useMemo(() => {
    if (!parsedTree) return null;
    return layoutTree(parsedTree, dynamicRowSpacing, collapsed);
  }, [parsedTree, dynamicRowSpacing, collapsed]);

  // Establish a fixed x-scale from root-to-tip distance so tree width is constant
  const scaleX = useMemo(() => {
    if (!laidOut) return 1;
    const maxDist = Math.max(laidOut.maxDistance, 1e-6);
    return treeWidthPx / maxDist;
  }, [laidOut, treeWidthPx]);

  // Assign x positions using the fixed scale each render
  useMemo(() => {
    if (!laidOut) return;
    assignXPositions(laidOut.tree, scaleX);
  }, [laidOut, scaleX]);

  // Zoom/Pan disabled by request

  // Calculate actual text width using canvas measurement for precision
  const alignmentContentWidth = useMemo(() => {
    // Only calculate width if we have actual sequences to avoid showing placeholder width
    if (cleanedSequences.length === 0) return 0;
    const sampleText = cleanedSequences[0].sequence;
    if (!sampleText.length) return 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return sampleText.length * fontSize * (0.6 + LETTER_SPACING_EM); // fallback adjusted for letter spacing
    const monoFont = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
    ctx.font = `bold ${fontSize}px ${monoFont}`;
    const baseCharWidth = ctx.measureText('M').width;
    const charWidthWithSpacing = baseCharWidth + fontSize * LETTER_SPACING_EM;
    // Calculate width as: (n-1) * charWidthWithSpacing + baseCharWidth
    // This accounts for letter spacing between characters but not after the last one
    return sampleText.length > 0 ? (sampleText.length - 1) * charWidthWithSpacing + baseCharWidth : 0;
  }, [cleanedSequences, fontSize]);

  // Number of columns (characters) to render in the alignment/header
  const numColumns = useMemo(() => {
    const sampleText = cleanedSequences.length > 0 ? cleanedSequences[0].sequence : alignmentText;
    return sampleText.length;
  }, [cleanedSequences, alignmentText]);

  // Dynamic header height based on widest GPCRdb label (after rotation)
  const alignmentHeaderHeight = useMemo(() => {
    if (cleanedSequences.length === 0) return 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const monoFont = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
    const fallbackCharWidth = fontSize * 0.62;
    if (ctx) ctx.font = `bold ${fontSize}px ${monoFont}`;
    let maxLabelWidth = 0;
    for (let i = 0; i < numColumns; i++) {
      const label = gpcrdbNumbers.length > i ? gpcrdbNumbers[i] : String(i + 1);
      const widthPx = ctx ? ctx.measureText(label).width : label.length * fallbackCharWidth;
      if (widthPx > maxLabelWidth) maxLabelWidth = widthPx;
    }
    const verticalPadding = Math.ceil(fontSize * 0.5); // space above/below
    // Minimum height guard for readability and to avoid clipping after rotation
    return Math.max(40, Math.ceil(maxLabelWidth) + verticalPadding);
  }, [cleanedSequences.length, gpcrdbNumbers, fontSize, numColumns]);

  // container measured, but SVG uses its intrinsic content size with overflow scrolling

  // Compute text widths for each leaf label to right-align them to the furthest right boundary
  const labelWidths = useMemo(() => {
    if (!laidOut) return [] as number[];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return laidOut.visibleLeaves.map(() => 0);
    ctx.font = `${fontSize}px Arial, sans-serif`;
    return laidOut.visibleLeaves.map(leaf => {
      const name = leaf.name || '';
      const parts = name.split('|');
      const display = parts.length >= 3 ? parts[2] : name;
      return ctx.measureText(display).width;
    });
  }, [laidOut, fontSize]);

  const labelsRightX = useMemo(() => {
    if (!laidOut) return 0;
    // Use a global end computed from the leaf whose label text reaches the furthest right:
    // max over leaves of (leaf.x + labelWidth). Then add a small connector gap so that
    // the row achieving this max has zero-length dashed connector.
    const connectorGap = 8;
    let maxXPlusWidth = 0;
    for (let i = 0; i < laidOut.visibleLeaves.length; i++) {
      const leaf = laidOut.visibleLeaves[i];
      const x = leaf.x || 0;
      const lw = labelWidths[i] || 0;
      const sum = x + lw;
      if (sum > maxXPlusWidth) maxXPlusWidth = sum;
    }
    return maxXPlusWidth + connectorGap;
  }, [laidOut, labelWidths]);

  const contentHeight = useMemo(() => {
    if (width && height) return height;
    if (!laidOut) return 400; // fallback minimum height
    
    // Calculate height based purely on number of sequences/rows
    const numSequenceRows = laidOut.visibleLeaves.length;
    const headerPx = cleanedSequences.length > 0 ? alignmentHeaderHeight : 0;
    const sequenceAreaHeight = numSequenceRows * leafRowSpacing;
    
    // Total: header + gap + top padding + sequence area + bottom padding + container padding
    const totalHeight = headerPx + 
                       headerToSeqGapPx + 
                       sequenceTopPadding + 
                       sequenceAreaHeight + 
                       sequenceBottomPadding + 
                       containerTopPadding + 
                       containerBottomPadding;
    
    return Math.max(totalHeight, 200); // ensure minimum reasonable height
  }, [laidOut, cleanedSequences.length, alignmentHeaderHeight, leafRowSpacing, headerToSeqGapPx, sequenceTopPadding, sequenceBottomPadding, containerTopPadding, containerBottomPadding, width, height]);

  // Height of just the alignment body (rows area) excluding header and external paddings
  const alignmentBodyHeight = useMemo(() => {
    if (!laidOut) return 0;
    const leaves = laidOut.visibleLeaves;
    if (leaves.length === 0) return 0;
    const maxY = Math.max(...leaves.map(l => l.y || 0));
    return Math.max(0, maxY + dynamicRowSpacing / 2 + sequenceTopPadding + sequenceBottomPadding);
  }, [laidOut, dynamicRowSpacing, sequenceTopPadding, sequenceBottomPadding]);

  // Consistent character width used for both headers and background stripes
  const columnCharWidth = useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return fontSize * (0.6 + LETTER_SPACING_EM);
    const monoFont = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
    ctx.font = `bold ${fontSize}px ${monoFont}`;
    const baseWidth = ctx.measureText('M').width;
    // Add half-letter-spacing on both sides so column centers align with character centers
    return baseWidth + fontSize * LETTER_SPACING_EM;
  }, [fontSize]);

  // Colors: responsive to dark mode - use CSS variables to match other components
  const backgroundColor = useMemo(() => {
    if (typeof document === 'undefined') return effectiveDarkMode ? '#2A2A2A' : '#FDFBF7';
    const computedStyle = getComputedStyle(document.documentElement);
    return computedStyle.getPropertyValue('--card').trim() || (effectiveDarkMode ? '#2A2A2A' : '#FDFBF7');
  }, [effectiveDarkMode]);
  
  const strokeColor = effectiveDarkMode ? '#9ca3af' : '#333333'; // gray-400 : dark gray
  const textColor = effectiveDarkMode ? '#f9fafb' : '#111111'; // gray-50 : almost black
  const leafGuideColor = effectiveDarkMode ? '#6b7280' : '#bdbdbd'; // gray-500 : light gray
  const connectorColor = effectiveDarkMode ? '#9ca3af' : '#9e9e9e'; // gray-400 : medium gray
  const alternatingStripeColor = effectiveDarkMode ? '#4b5563' : '#cbd5e1'; // dark: gray-600, light: slate-300
  const errorBgColor = backgroundColor;
  const errorTextColor = effectiveDarkMode ? '#ef4444' : '#b91c1c'; // red-500 : red-700

  // Note: headerToTreeGapPx was removed after aligning tree to sequences

  if (!parsedTree) {
    return (
      <div ref={containerRef} style={{ width: width ? `${width}px` : '100%', height: height ? `${height}px` : '420px' }}>
        <div style={{ background: errorBgColor, color: errorTextColor, padding: 8, border: `1px solid ${isDarkMode ? '#4b5563' : '#e5e7eb'}` }}>
          Invalid Newick provided.
        </div>
      </div>
    );
  }

  const leftWidth = treeWidthPx + Math.max(0, labelsRightX - treeWidthPx) + treePadding * 2;
  // Use precise measured content width plus right padding for better visibility
  const alignmentTotalWidth = alignmentContentWidth + alignmentRightPadding;
  const totalWidth = leftWidth + alignmentTotalWidth;

  return (
    <div ref={containerRef} style={{ width: width ? `${width}px` : '100%', height: height ? `${height}px` : 'auto', overflow: 'auto', position: 'relative', background: backgroundColor }}>
      {/* Content area with proper width to avoid empty space on right */}
      <div style={{ position: 'relative', width: totalWidth, height: contentHeight, background: backgroundColor }}>
        {/* Sticky header overlay: GPCRdb column numbers (placed before tree SVG to avoid being pushed down). */}
        {laidOut && (
          // Make the header sticky without affecting flow: height 0 + overflow visible prevents pushing tree down
          <div style={{ position: 'sticky', top: 0, left: leftWidth, zIndex: 15, width: alignmentTotalWidth, height: 0, pointerEvents: 'none', overflow: 'visible' }}>
            <svg width={alignmentTotalWidth} height={alignmentHeaderHeight} viewBox={`0 0 ${alignmentTotalWidth} ${alignmentHeaderHeight}`} style={{ display: 'block' }}>
              {/* Solid background to ensure header is opaque */}
              <rect x={0} y={0} width={alignmentTotalWidth} height={alignmentHeaderHeight} fill={backgroundColor} />
              {/* Alternating background stripes behind GPCRdb header */}
              <g>
                {Array.from({ length: numColumns }).map((_, i) => (
                  i % 2 === 1 ? (
                    <rect
                      key={`hbg-${i}`}
                      x={i * columnCharWidth}
                      y={0}
                      width={columnCharWidth}
                      height={alignmentHeaderHeight}
                      fill={alternatingStripeColor}
                    />
                  ) : null
                ))}
              </g>
              <g transform={`translate(0, 0)`}>
                <AlignmentColumnHeaders
                  sequences={cleanedSequences}
                  fallbackText={alignmentText}
                  fontSize={fontSize}
                  textColor={textColor}
                  gpcrdbNumbers={gpcrdbNumbers}
                  charWidth={columnCharWidth}
                  headerHeight={alignmentHeaderHeight}
                  xOffset={0}
                />
              </g>
            </svg>
          </div>
        )}

        {/* Left SVG: tree + labels; sticky to left while scrolling */}
        <svg
          width={leftWidth}
          height={contentHeight}
          viewBox={`0 0 ${leftWidth} ${Math.max(contentHeight, 10)}`}
          style={{ position: 'sticky', left: 0, top: 0, zIndex: 20, background: backgroundColor }}
        >
        {/* Background for entire tree column (also covers the sticky header area above content) */}
        <rect x={0} y={0} width={leftWidth} height={Math.max(contentHeight, 10)} fill={backgroundColor} />
        {/* Top cap to ensure header disappears behind tree when scrolling right */}
        <rect x={0} y={0} width={leftWidth} height={alignmentHeaderHeight} fill={backgroundColor} />
        {/* Scale bar (top-left) */}
        {laidOut && (
          <SimpleScaleBar
            x={12}
            y={12}
            fontSize={fontSize}
            textColor={textColor}
            strokeColor={strokeColor}
            pixelsPerUnit={scaleX}
          />
        )}

        {/* Static group (no pan/zoom) */}
        <g>
          {/* Optional mirror for RTL */}
          <g transform={mirrorRightToLeft ? `translate(${leftWidth},0) scale(-1,1)` : undefined}>
            {/* Tree drawing origin padding: align directly under header to match sequence start offset. */}
            <g transform={`translate(${treePadding}, ${alignmentHeaderHeight + headerToSeqGapPx + sequenceTopPadding})`}>
              {/* Draw branches */}
              {laidOut && (
                <TreeBranches
                  node={laidOut.tree}
                  strokeColor={strokeColor}
                  fontSize={fontSize}
                  showSupport={showSupportOnBranches}
                  textColor={textColor}
                  collapsed={collapsed}
                  backgroundColor={backgroundColor}
                />
              )}

              {/* Inner node circles (click to toggle collapse) */}
              {laidOut && (
                <NodeCircles
                  node={laidOut.tree}
                  radius={4}
                  strokeColor={strokeColor}
                  collapsed={collapsed}
                  onToggle={id =>
                    setCollapsed(prev => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id); else next.add(id);
                      return next;
                    })
                  }
                  backgroundColor={backgroundColor}
                />
              )}

              {/* Leaf labels with dotted connectors to a right-aligned rail */}
              {laidOut && (
                <LeafLabels
                  leaves={laidOut.visibleLeaves}
                  fontSize={fontSize}
                  textColor={textColor}
                  mirror={mirrorRightToLeft}
                  rightRailX={labelsRightX}
                  labelWidths={labelWidths}
                  connectorColor={connectorColor}
                  rightGap={8}
                />
              )}

            </g>
          </g>
        </g>
        </svg>

        

        {/* Right SVG: alignment; positioned directly adjacent to tree with no gap */}
        {laidOut && (
          <svg
            width={alignmentTotalWidth}
            height={contentHeight}
            viewBox={`0 0 ${alignmentTotalWidth} ${Math.max(contentHeight, 10)}`}
            style={{ position: 'absolute', left: leftWidth, top: 0 }}
          >
            {/* Alignment content: start under header with adjustable gap */}
            <g transform={`translate(0, ${alignmentHeaderHeight + headerToSeqGapPx})`}>
              {/* Background behind sequences to ensure header overlap looks clean */}
              <rect
                x={0}
                y={-sequenceTopPadding}
                width={alignmentTotalWidth}
                height={alignmentBodyHeight}
                fill={backgroundColor}
              />
              {/* Alternating column background stripes */}
              <g>
                {Array.from({ length: numColumns }).map((_, i) => (
                  i % 2 === 1 ? (
                    <rect
                      key={`bg-${i}`}
                      x={i * columnCharWidth}
                      y={-sequenceTopPadding}
                      width={columnCharWidth}
                      height={alignmentBodyHeight}
                      fill={alternatingStripeColor} /* Stripe fill */
                    />
                  ) : null
                ))}
              </g>
              <AlignmentOnly
                rowNodes={laidOut.rowNodes}
                leaves={laidOut.visibleLeaves}
                width={alignmentTotalWidth}
                guideColor={leafGuideColor}
                textColor={textColor}
                fontSize={fontSize}
                sequences={cleanedSequences}
                fallbackText={alignmentText}
                isDarkMode={effectiveDarkMode}
                topPadding={sequenceTopPadding}
              />
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}

function TreeBranches({
  node,
  strokeColor,
  fontSize,
  showSupport,
  textColor,
  collapsed,
  backgroundColor,
}: {
  node: NewickNode;
  strokeColor: string;
  fontSize: number;
  showSupport: boolean;
  textColor: string;
  collapsed: Set<string>;
  backgroundColor: string;
}) {
  const elements: React.ReactNode[] = [];

  function walk(n: NewickNode) {
    if (!n.children.length) return;
    if (n.idStr && collapsed.has(n.idStr)) return; // stop at collapsed node
    const childYs = n.children.map(c => c.y || 0);
    const x = n.x || 0;
    const yTop = Math.min(...childYs);
    const yBottom = Math.max(...childYs);

    // Vertical connector at parent x spanning children y-range
    elements.push(
      <line key={`v-${x}-${yTop}-${yBottom}`} x1={x} y1={yTop} x2={x} y2={yBottom} stroke={strokeColor} strokeWidth={1} />,
    );

    for (const child of n.children) {
      const cx = child.x || 0;
      const cy = child.y || 0;
      // Horizontal branch
      elements.push(
        <line key={`h-${x}-${cx}-${cy}`} x1={x} y1={cy} x2={cx} y2={cy} stroke={strokeColor} strokeWidth={1} />,
      );

      // Support values: render near the child's inner node circle (if child is internal)
      if (showSupport && typeof child.support === 'number' && child.children.length) {
        const supportStr = String(child.support);
        const charW = fontSize * 0.62;
        const pad = 3;
        const gap = 6; // gap before the circle
        const textW = supportStr.length * charW;
        const rectH = fontSize + 6;
        const rectX = cx - gap - textW - pad * 2;
        const rectY = cy - rectH / 2;

        elements.push(
          <rect
            key={`supbg-${cx}-${cy}`}
            x={rectX}
            y={rectY}
            width={textW + pad * 2}
            height={rectH}
            rx={3}
            ry={3}
            fill={backgroundColor}
            opacity={0.90}
          />,
        );
        elements.push(
          <text
            key={`sup-${cx}-${cy}`}
            x={cx - gap - pad}
            y={cy}
            fontSize={fontSize}
            fill={textColor}
            textAnchor="end"
            dominantBaseline="middle"
          >
            {supportStr}
          </text>,
        );
      }
      walk(child);
    }
  }

  walk(node);
  return <g>{elements}</g>;
}

function LeafLabels({
  leaves,
  fontSize,
  textColor,
  mirror,
  rightRailX,
  labelWidths,
  connectorColor,
  rightGap,
}: {
  leaves: NewickNode[];
  fontSize: number;
  textColor: string;
  mirror: boolean;
  rightRailX: number;
  labelWidths: number[];
  connectorColor: string;
  rightGap: number;
}) {
  const labels: React.ReactNode[] = [];
  const connectors: React.ReactNode[] = [];

  for (let i = 0; i < leaves.length; i++) {
    const n = leaves[i];
    const xTip = n.x || 0;
    const y = n.y || 0;
    const labelWidth = labelWidths[i] || 0;
    const connectorEndX = Math.max(xTip, rightRailX - labelWidth - rightGap);

    connectors.push(
      <line
        key={`conn-${xTip}-${y}`}
        x1={xTip}
        y1={y}
        x2={connectorEndX}
        y2={y}
        stroke={connectorColor}
        strokeWidth={1}
        strokeDasharray="3 3"
      />,
    );

    labels.push(
      <text
        key={`label-${i}-${y}`}
        x={rightRailX}
        y={y}
        fontSize={fontSize}
        fill={textColor}
        fontFamily="Arial, sans-serif"
        textAnchor="end"
        dominantBaseline="middle"
        transform={mirror ? `scale(-1,1) translate(${-2 * rightRailX},0)` : undefined}
      >
        {(() => {
          const name = n.name || '';
          const parts = name.split('|');
          return parts.length >= 3 ? parts[2] : name;
        })()}
      </text>,
    );
  }
  return (
    <g>
      {connectors}
      {labels}
    </g>
  );
}

function NodeCircles({
  node,
  radius,
  strokeColor,
  collapsed,
  onToggle,
  backgroundColor,
}: {
  node: NewickNode;
  radius: number;
  strokeColor: string;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  backgroundColor: string;
}) {
  const elements: React.ReactNode[] = [];

  function walk(n: NewickNode) {
    if (n.children.length) {
      const id = n.idStr || '';
      const cx = n.x || 0;
      const cy = n.y || 0;
      const isCollapsed = id && collapsed.has(id);
      const tooltipText = isCollapsed ? 'Expand' : 'Collapse';
      elements.push(
        <g key={`node-group-${id}`}>
          <title>{tooltipText}</title>
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill={isCollapsed ? strokeColor : backgroundColor}
            stroke={strokeColor}
            strokeWidth={1}
            style={{ cursor: 'pointer' }}
            onClick={e => {
              e.stopPropagation();
              if (id) onToggle(id);
            }}
          />
        </g>,
      );
      // Continue walking only if not collapsed
      if (!isCollapsed) n.children.forEach(walk);
    }
  }

  walk(node);
  return <g>{elements}</g>;
}

// Removed AlignmentPanel (replaced with AlignmentOnly + tree labels to avoid duplication)

function AlignmentColumnHeaders({
  sequences,
  fallbackText,
  fontSize,
  textColor,
  gpcrdbNumbers,
  charWidth,
  headerHeight,
  xOffset = 0,
}: {
  sequences: { header: string; sequence: string }[];
  fallbackText: string;
  fontSize: number;
  textColor: string;
  gpcrdbNumbers: string[];
  charWidth: number;
  headerHeight: number;
  xOffset?: number;
}) {
  // Get the sequence length to determine number of columns
  const sequenceLength = useMemo(() => {
    if (sequences.length > 0) {
      return sequences[0].sequence.length;
    }
    return fallbackText.length;
  }, [sequences, fallbackText]);

  // charWidth provided by parent for consistency with backgrounds

  const headerFont = "Arial, sans-serif";
  // Anchor labels to the bottom of the header so rotation doesn't clip at the top
  const yAnchor = Math.max(2, headerHeight - 2);
  
  // Only render if we have sequences
  if (sequences.length === 0) return null;

  // Create individual text elements for each column position; left-align each label within its column
  const headers = [];
  for (let i = 0; i < sequenceLength; i++) {
    const x = i * charWidth + xOffset; // adjustable padding inside each column cell
    
    // Use GPCRdb number if available, otherwise fall back to sequential numbering
    const displayNumber = gpcrdbNumbers.length > i ? gpcrdbNumbers[i] : (i + 1).toString();
    
    // Debug: log first few numbers
    if (i < 5) {
      console.log(`Column ${i}: GPCRdb available: ${gpcrdbNumbers.length > i}, using: ${displayNumber}`);
    }
    
    headers.push(
      <text
        key={i}
        x={x}
        y={yAnchor}
        fontSize={fontSize}
        fill={textColor}
        fontFamily={headerFont}
        textAnchor="start"
        dominantBaseline="hanging"
        transform={`rotate(-90, ${x}, ${yAnchor})`}
      >
        {displayNumber}
      </text>
    );
  }

  // No bottom border; keep header clean with no shadow/line
  return <g>{headers}</g>;
}

function AlignmentOnly({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  rowNodes,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  width,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  guideColor,
  leaves,
  textColor,
  fontSize,
  sequences,
  fallbackText,
  isDarkMode,
  topPadding = 0,
}: {
  rowNodes: NewickNode[];
  leaves: NewickNode[];
  width: number;
  guideColor: string;
  textColor: string;
  fontSize: number;
  sequences: { header: string; sequence: string }[];
  fallbackText: string;
  isDarkMode: boolean;
  topPadding?: number;
}) {
  const monoFont = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
  const rows: React.ReactNode[] = [];

  // Center sequences within columns using tspans with explicit x positions
  const charWidth = React.useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return fontSize * (0.6 + LETTER_SPACING_EM);
    ctx.font = `bold ${fontSize}px ${monoFont}`;
    const baseWidth = ctx.measureText('M').width;
    return baseWidth + fontSize * LETTER_SPACING_EM;
  }, [fontSize, monoFont]);

  // Function to match leaf name to sequence
  const getSequenceForLeaf = (leafName: string): string | null => {
    if (sequences.length === 0) return null; // Don't show fallback while loading
    
    // Extract species name (third part after splitting by |)
    const leafSpecies = leafName.split('|')[2] || leafName;
    
    // Try to find matching sequence by species name in header
    const matchingSequence = sequences.find(seq => {
      const headerLower = seq.header.toLowerCase();
      const speciesLower = leafSpecies.toLowerCase();
      return headerLower.includes(speciesLower) || 
             headerLower.includes(speciesLower.replace('_', ' ')) ||
             headerLower.includes(speciesLower.replace(' ', '_'));
    });
    
    return matchingSequence ? matchingSequence.sequence : fallbackText;
  };

  leaves.forEach((leaf, idx) => {
    const y = (leaf.y || 0) + topPadding;
    const sequence = getSequenceForLeaf(leaf.name || '');
    
    // Only render if we have a sequence (not null while loading)
    if (sequence !== null) {
      const chars = sequence.split('');
      const xStart = 0;
      rows.push(
        <text
          key={`seq-${idx}`}
          x={xStart}
          y={y}
          fontSize={fontSize}
          fill={textColor}
          dominantBaseline="middle"
          fontFamily={monoFont}
          fontWeight={600}
        >
          {chars.map((residue, i) => (
            <tspan
              key={i}
              x={xStart + i * charWidth + charWidth / 2}
              dy={0}
              textAnchor="middle"
              fill={residueColor(residue, isDarkMode)}
            >
              {residue}
            </tspan>
          ))}
        </text>,
      );
    }
  });

  return <g>{rows}</g>;
}
function residueColor(residue: string, isDarkMode: boolean = false): string | undefined {
  // Light mode colors
  const lightMapping: Record<string, string> = {
    FCB315: 'WYHF',
    '7D2985': 'STQN',
    '231F20': 'PGA',
    DD6030: 'ED',
    '7CAEC4': 'RK',
    B4B4B4: 'VCIML',
  };
  
  // Dark mode colors (adjusted for better contrast)
  const darkMapping: Record<string, string> = {
    'FFD700': 'WYHF', // Gold for aromatic
    'DA70D6': 'STQN', // Orchid for polar
    'F0F0F0': 'PGA',  // Light gray for small (inverted)
    'FF6347': 'ED',   // Tomato for acidic
    '87CEEB': 'RK',   // Sky blue for basic
    'C0C0C0': 'VCIML', // Silver for hydrophobic
  };
  
  const mapping = isDarkMode ? darkMapping : lightMapping;
  const ch = residue.toUpperCase();
  for (const [hex, acids] of Object.entries(mapping)) {
    if (acids.includes(ch)) return `#${hex}`;
  }
  return undefined;
}

export default CombinedTreeAlignment;

function SimpleScaleBar({
  x,
  y,
  fontSize,
  textColor,
  strokeColor,
  pixelsPerUnit,
}: {
  x: number;
  y: number;
  fontSize: number;
  textColor: string;
  strokeColor: string;
  pixelsPerUnit: number;
}) {
  // Use a fixed width for the scale bar and calculate the unit length
  const scaleBarWidthPx = 80; // Fixed width in pixels
  const unit = scaleBarWidthPx / Math.max(1e-6, pixelsPerUnit);
  
  // Format the unit appropriately based on magnitude
  let unitLabel: string;
  if (unit >= 1) {
    // For values >= 1, show with appropriate decimal places
    if (unit >= 100) {
      unitLabel = Math.round(unit).toString();
    } else if (unit >= 10) {
      unitLabel = unit.toFixed(1);
    } else {
      unitLabel = unit.toFixed(2);
    }
  } else {
    // For values < 1, use scientific notation or appropriate decimal places
    if (unit >= 0.01) {
      unitLabel = unit.toFixed(3);
    } else if (unit >= 0.001) {
      unitLabel = unit.toFixed(4);
    } else {
      unitLabel = unit.toExponential(2);
    }
  }

  const cap = 8; // end cap height
  const lineY = y;
  const textY = y + cap + fontSize + 2;
  const textX = x + scaleBarWidthPx / 2;

  return (
    <g>
      {/* end caps */}
      <line x1={x} y1={lineY - cap / 2} x2={x} y2={lineY + cap / 2} stroke={strokeColor} strokeWidth={2} />
      <line x1={x + scaleBarWidthPx} y1={lineY - cap / 2} x2={x + scaleBarWidthPx} y2={lineY + cap / 2} stroke={strokeColor} strokeWidth={2} />
      {/* main line */}
      <line x1={x} y1={lineY} x2={x + scaleBarWidthPx} y2={lineY} stroke={strokeColor} strokeWidth={2} />
      {/* label below */}
      <text x={textX} y={textY} fontSize={fontSize} fill={textColor} textAnchor="middle">
        {unitLabel}
      </text>
    </g>
  );
}


