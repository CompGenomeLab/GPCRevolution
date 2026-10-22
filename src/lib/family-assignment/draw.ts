/**
 * Canvas drawing of the family-assignment figure: one shared x-axis (leaf order of the
 * score-ordered search tree, highest-scoring sequences to the left) carrying the other
 * families' clades, the human sequences, the binned MSA, the search score and index and
 * the tree, with the extracted clade tinted across every track. Ported from the standalone
 * clade-extraction figure of the analysis; the drawing is unchanged.
 */
import type { CrossBlock, FamilyBundle, HighlightSet, Marker, StageKey } from '@/types/family-assignment';

export interface FigureOptions {
  mode: StageKey;
  showHuman: boolean;
  swapped: boolean;
  /** Dark site theme; the SVG export is always drawn light. */
  dark?: boolean;
}

/** Canvas colours that depend on the site theme. */
const LIGHT = {
  bg: 255, ink: '#1c1c1c', inkSoft: '#6f6f69', absent: '#b3b3ac', tick: 'rgba(28,28,28,0.38)',
  baseline: '#bdbdb6', legendBox: 'rgba(255,255,255,0.78)', tree: '#5b5b56', rule: '#c9c9c2',
  highlight: [115, 115, 115] as [number, number, number],
};
const DARK = {
  bg: 26, ink: '#ededea', inkSoft: '#a3a29b', absent: '#5f5e59', tick: 'rgba(230,230,225,0.45)',
  baseline: '#4a4a46', legendBox: 'rgba(24,24,23,0.8)', tree: '#b8b7b0', rule: '#3a3a36',
  highlight: [200, 200, 200] as [number, number, number],
};

type RGB = [number, number, number];

const FONT = '"Open Sans", "Segoe UI", Helvetica, Arial, sans-serif';
const CROSS_STOPS = ['#9e0142', '#d53e4f', '#f46d43', '#e39a2c', '#b09407',
                     '#6fa543', '#2f9e8f', '#3288bd', '#5e4fa2'];
const CROSS_PAD = 4;
const CROSS_ROW_H = 20;
const CROSS_NAME_FONT = '600 15px ' + FONT;
const CROSS_BLOCK_H = 11;
const GUTTER_MIN = 95;
const GUTTER_MAX = 260;
const HUMAN_HEIGHT = 170;
const HUMAN_TICK_H = 9;
const HUMAN_FONT_PX = 11.5;
const HUMAN_MIN_GAP = 13;
const GUIDE_PRIORITY = 2;
const MSA_HEIGHT = 240;
const SCORE_HEIGHT = 200;
const TREE_HEIGHT = 260;
const SCORE_COLOR = '#2f5d8a';
const INDEX_COLOR = '#b7b0a2';
const EXPORT_SCALE = 4;

export const STAGES: StageKey[] = ['initial', 'after_7tm', 'after_topology', 'after_assignment',
                                   'after_reassignment'];

function hexToRgb(hex: string): RGB {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
export function css(rgb: RGB, alpha = 1) {
  return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
}
function darken(rgb: RGB, amount: number): RGB {
  return rgb.map(c => Math.round(c * (1 - amount))) as RGB;
}
function rampRgb(i: number, n: number): RGB {
  const stops = CROSS_STOPS.map(hexToRgb);
  if (n <= 1) return stops[0];
  const t = (i / (n - 1)) * (stops.length - 1);
  const k = Math.min(stops.length - 2, Math.floor(t));
  const f = t - k;
  return [0, 1, 2].map(c => Math.round(stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f)) as RGB;
}
export function fmt(n: number) { return n.toLocaleString('en-US'); }

interface TrackDef {
  label: string[];
  labelSize?: number;
  gutter?: () => HTMLElement;
  height: number;
  draw: (canvas: HTMLCanvasElement, w: number, h: number) => void;
}

export class FamilyFigure {
  readonly data: FamilyBundle;
  readonly disp: (gene: string) => string;
  readonly crossFamilies: string[];
  readonly crossColors: RGB[];
  readonly crossInk: RGB[];
  readonly gutterWidth: number;
  private crossRowOf: Record<string, number> = {};
  private crossHeight: number;
  private msaBitmap: HTMLCanvasElement | null = null;
  private dpr = 1;
  private opts: FigureOptions = { mode: 'initial', showHuman: false, swapped: false };
  labelledHuman = 0;
  private msaBitmapDark = false;

  private get T() { return this.opts.dark ? DARK : LIGHT; }

  constructor(data: FamilyBundle, disp: (gene: string) => string) {
    this.data = data;
    this.disp = disp;
    const sets = data.cross_sets || {};
    const all: CrossBlock[] = ([] as CrossBlock[]).concat(...Object.values(sets).map(s => s || []));
    // One row per family, ordered by where it first appears and coloured by that order,
    // over the union of all stages so rows and colours stay put when the stage changes.
    const first: Record<string, number> = {};
    all.forEach(b => {
      if (!(b.gene in first) || b.bin_start < first[b.gene]) first[b.gene] = b.bin_start;
    });
    this.crossFamilies = Object.keys(first).sort((a, b) => first[a] - first[b] || (a < b ? -1 : 1));
    this.crossFamilies.forEach((g, i) => { this.crossRowOf[g] = i; });
    this.crossColors = this.crossFamilies.map((_, i) => rampRgb(i, this.crossFamilies.length));
    this.crossInk = this.crossColors.map(c => darken(c, 0.32));
    this.crossHeight = this.crossFamilies.length
      ? CROSS_PAD * 2 + this.crossFamilies.length * CROSS_ROW_H : 0;
    if (!this.crossFamilies.length) {
      this.gutterWidth = GUTTER_MIN;
    } else {
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = CROSS_NAME_FONT;
      const widest = this.crossFamilies.reduce((m, g) => Math.max(m, ctx.measureText(disp(g)).width), 0);
      this.gutterWidth = Math.min(GUTTER_MAX, Math.max(GUTTER_MIN, Math.ceil(widest) + 22));
    }
  }

  // ------------------------------------------------------------------ state
  get nBins() { return this.data.n_bins; }
  initialSet(): HighlightSet {
    return this.data.highlight_sets.initial || {
      label: 'Retained clade', n: this.data.n_clade_leaves, ranges: [], depths: [], no_data: false,
    };
  }
  currentHighlight(): HighlightSet {
    return this.data.highlight_sets[this.opts.mode] || this.initialSet();
  }
  currentCross(mode = this.opts.mode): CrossBlock[] {
    const sets = this.data.cross_sets || {};
    return sets[mode] || sets.initial || [];
  }
  humanAll(): Marker[] { return this.data.human || []; }
  /** Human and reference sequences are landmarks of the tree, shown at every step. */
  currentHuman(): Marker[] { return this.humanAll(); }
  crossRow(gene: string) { return this.crossRowOf[gene]; }

  // ------------------------------------------------------------------ helpers
  private setupCanvas(canvas: HTMLCanvasElement, w: number, h: number) {
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * this.dpr);
    canvas.height = Math.round(h * this.dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return ctx;
  }

  private initialSegmentOf(r: [number, number]) {
    const init = this.initialSet().ranges;
    for (let i = 0; i < init.length; i++) {
      if (r[0] >= init[i][0] && r[0] < init[i][1]) return i;
    }
    return -1;
  }

  /** The clade tint; in the tree it stops at the node each initial segment hangs from. */
  private paintHighlight(ctx: CanvasRenderingContext2D, w: number, h: number,
                         bottomOf?: (i: number) => number) {
    const ranges = this.currentHighlight().ranges;
    const floor = ranges.length > 8 ? 0 : 1;
    const nBins = this.nBins;
    ctx.save();
    ctx.fillStyle = 'rgba(' + this.T.highlight.join(',') + ',0.16)';
    ranges.forEach(r => {
      const x0 = (r[0] / nBins) * w;
      const x1 = (r[1] / nBins) * w;
      const y1 = bottomOf ? bottomOf(this.initialSegmentOf(r)) : h;
      ctx.fillRect(x0, 0, Math.max(floor, x1 - x0), y1);
    });
    ctx.strokeStyle = 'rgba(' + this.T.highlight.join(',') + ',0.55)';
    ctx.lineWidth = 1;
    this.initialSet().ranges.forEach((r, i) => {
      const x0 = (r[0] / nBins) * w;
      const x1 = (r[1] / nBins) * w;
      const y1 = bottomOf ? bottomOf(i) : h;
      ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
    });
    ctx.restore();
  }

  // ------------------------------------------------------------------ cross strip
  private crossRowMid(i: number) { return CROSS_PAD + i * CROSS_ROW_H + CROSS_ROW_H / 2; }

  private buildCrossGutter = () => {
    const wrap = document.createElement('div');
    wrap.style.paddingTop = CROSS_PAD + 'px';
    const present: Record<string, boolean> = {};
    this.currentCross().forEach(b => { present[b.gene] = true; });
    this.crossFamilies.forEach((gene, i) => {
      const row = document.createElement('div');
      Object.assign(row.style, {
        height: CROSS_ROW_H + 'px', fontSize: '15px', fontWeight: '600', textAlign: 'right',
        padding: '0 10px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        whiteSpace: 'nowrap', overflow: 'hidden',
        color: present[gene] ? css(this.crossInk[i]) : this.T.absent,
      });
      row.className = 'crossname';
      row.dataset.crossName = this.disp(gene);
      row.textContent = this.disp(gene);
      wrap.appendChild(row);
    });
    return wrap;
  };

  private drawCross = (canvas: HTMLCanvasElement, w: number, h: number) => {
    const ctx = this.setupCanvas(canvas, w, h);
    if (!this.crossFamilies.length) return;
    ctx.save();
    this.crossFamilies.forEach((_, i) => {
      const y = this.crossRowMid(i);
      ctx.strokeStyle = css(this.crossColors[i], 0.28);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
      ctx.setLineDash([]);
    });
    this.paintHighlight(ctx, w, h);
    this.currentCross().forEach(b => {
      const i = this.crossRowOf[b.gene];
      const y = this.crossRowMid(i) - CROSS_BLOCK_H / 2;
      if (b.sparse && b.positions) {
        ctx.strokeStyle = css(this.crossColors[i], 1);
        ctx.lineWidth = 1;
        ctx.beginPath();
        b.positions.forEach(p => {
          const x = Math.round(((p + 0.5) / this.data.n_leaves) * w) + 0.5;
          ctx.moveTo(x, y); ctx.lineTo(x, y + CROSS_BLOCK_H);
        });
        ctx.stroke();
        return;
      }
      const x0 = (b.bin_start / this.nBins) * w;
      const x1 = (b.bin_end / this.nBins) * w;
      ctx.fillStyle = css(this.crossColors[i], 0.55);
      ctx.fillRect(x0, y, Math.max(2, x1 - x0), CROSS_BLOCK_H);
    });
    ctx.restore();
  };

  // ------------------------------------------------------------------ human track
  private humanX(leaf: number, w: number) { return ((leaf + 0.5) / this.data.n_leaves) * w; }

  private selectHumanLabels(w: number) {
    const out: Marker[] = [];
    let lastX = -Infinity;
    this.currentHuman().forEach(m => {
      const x = this.humanX(m[0], w);
      if (m[2] >= GUIDE_PRIORITY) {
        const prev = out[out.length - 1];
        if (prev && x - lastX < HUMAN_MIN_GAP && prev[2] < GUIDE_PRIORITY) out.pop();
        out.push(m); lastX = x; return;
      }
      if (x - lastX >= HUMAN_MIN_GAP) { out.push(m); lastX = x; return; }
      const prev = out[out.length - 1];
      if (prev && m[2] && !prev[2]) { out[out.length - 1] = m; lastX = x; }
    });
    return out;
  }

  private drawHuman = (canvas: HTMLCanvasElement, w: number, h: number) => {
    const ctx = this.setupCanvas(canvas, w, h);
    this.paintHighlight(ctx, w, h);
    const shown = this.currentHuman();
    if (!shown.length) { this.labelledHuman = 0; return; }
    const tickTop = h - HUMAN_TICK_H;
    ctx.save();
    ctx.strokeStyle = this.T.tick;
    ctx.lineWidth = 1;
    ctx.beginPath();
    shown.forEach(m => {
      const x = Math.round(this.humanX(m[0], w)) + 0.5;
      ctx.moveTo(x, tickTop); ctx.lineTo(x, h);
    });
    ctx.stroke();
    const labelled = this.selectHumanLabels(w);
    ctx.font = '600 ' + HUMAN_FONT_PX + 'px ' + FONT;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const foot = tickTop - 4;
    labelled.forEach(m => {
      const x = Math.round(this.humanX(m[0], w)) + 0.5;
      ctx.save();
      ctx.translate(x, foot);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = m[2] ? this.T.ink : this.T.inkSoft;
      ctx.fillText(m[1], 0, 0);
      ctx.restore();
    });
    ctx.restore();
    this.labelledHuman = labelled.length;
  };

  // ------------------------------------------------------------------ MSA track
  private buildMsaBitmap() {
    if (this.msaBitmap && this.msaBitmapDark === !!this.opts.dark) return this.msaBitmap;
    const bg = this.T.bg;
    const { cat_rows: catRows, frac_rows: fracRows } = this.data.msa;
    const alnLen = this.data.aln_len;
    const nBins = this.nBins;
    const colors = this.data.msa.colors.map(hexToRgb);
    const off = document.createElement('canvas');
    off.width = nBins;
    off.height = alnLen;
    const octx = off.getContext('2d')!;
    const img = octx.createImageData(nBins, alnLen);
    // N-terminus at the bottom, reading upward to the C-terminus.
    for (let row = 0; row < alnLen; row++) {
      const catRow = catRows[row];
      const fracRow = fracRows[row];
      const rowOff = (alnLen - 1 - row) * nBins * 4;
      for (let col = 0; col < nBins; col++) {
        const cat = catRow.charCodeAt(col) - 48;
        const frac = parseInt(fracRow[col], 16) / 15;
        const base = colors[cat];
        const idx = rowOff + col * 4;
        img.data[idx] = Math.round(bg + (base[0] - bg) * frac);
        img.data[idx + 1] = Math.round(bg + (base[1] - bg) * frac);
        img.data[idx + 2] = Math.round(bg + (base[2] - bg) * frac);
        img.data[idx + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    this.msaBitmap = off;
    this.msaBitmapDark = !!this.opts.dark;
    return off;
  }

  private drawMsa = (canvas: HTMLCanvasElement, w: number, h: number) => {
    const ctx = this.setupCanvas(canvas, w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buildMsaBitmap(), 0, 0, this.nBins, this.data.aln_len, 0, 0, w, h);
    this.paintHighlight(ctx, w, h);
  };

  // ------------------------------------------------------------------ score track
  private drawBaseline(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.save();
    ctx.strokeStyle = this.T.baseline;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h - 0.5); ctx.lineTo(w, h - 0.5); ctx.stroke();
    ctx.restore();
  }

  private drawRightMiddleLegend(ctx: CanvasRenderingContext2D, w: number, h: number,
                                items: { label: string; color: string; alpha?: number }[]) {
    const fontPx = 31.5 * 0.75;
    const lineHeight = fontPx * 1.2;
    const padX = 12;
    const padY = 10;
    const right = w - 16;
    ctx.save();
    ctx.font = '600 ' + fontPx + 'px ' + FONT;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    let maxWidth = 0;
    items.forEach(it => { maxWidth = Math.max(maxWidth, ctx.measureText(it.label).width); });
    const blockHeight = items.length * lineHeight;
    const startY = h / 2 - blockHeight / 2 + lineHeight / 2;
    const boxL = right - maxWidth - padX;
    const boxR = right + padX * 0.6;
    const boxT = h / 2 - blockHeight / 2 - padY;
    const boxB = h / 2 + blockHeight / 2 + padY;
    ctx.fillStyle = this.T.legendBox;
    ctx.beginPath();
    ctx.roundRect(boxL, boxT, boxR - boxL, boxB - boxT, 7);
    ctx.fill();
    items.forEach((it, i) => {
      ctx.globalAlpha = it.alpha === undefined ? 1 : it.alpha;
      ctx.fillStyle = it.color;
      ctx.fillText(it.label, right, startY + i * lineHeight);
    });
    ctx.restore();
  }

  private drawLineSeries(ctx: CanvasRenderingContext2D, w: number, h: number,
                         series: { values: (number | null)[]; color: string; width?: number; alpha?: number }[],
                         yMax: number, yMin: number) {
    ctx.save();
    series.forEach(s => {
      const vals = s.values;
      if (!vals) return;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < vals.length; i++) {
        const v = vals[i];
        if (v === null || v === undefined || Number.isNaN(v)) { started = false; continue; }
        const x = ((i + 0.5) / vals.length) * w;
        const y = h - ((v - yMin) / (yMax - yMin)) * h;
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.globalAlpha = s.alpha === undefined ? 1 : s.alpha;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width === undefined ? 1.6 : s.width;
      ctx.stroke();
    });
    ctx.restore();
  }

  private drawMetricRow(ctx: CanvasRenderingContext2D, w: number, h: number,
                        raw: (number | null)[], smoothed: (number | null)[], color: string,
                        rawLabel: string, smoothLabel: string) {
    let lo = Infinity, hi = -Infinity;
    [raw, smoothed].forEach(vals => vals && vals.forEach(v => {
      if (v === null || v === undefined || Number.isNaN(v)) return;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }));
    if (!(lo < hi)) { lo = 0; hi = 1; }
    this.drawLineSeries(ctx, w, h, [
      { values: raw, color, width: 0.5, alpha: 0.30 },
      { values: smoothed, color, width: 1.8 },
    ], hi, lo);
    this.paintHighlight(ctx, w, h);
    this.drawBaseline(ctx, w, h);
    this.drawRightMiddleLegend(ctx, w, h, [
      { label: smoothLabel, color },
      { label: rawLabel, color, alpha: 0.45 },
    ]);
  }

  private drawScore = (canvas: HTMLCanvasElement, w: number, h: number) => {
    const ctx = this.setupCanvas(canvas, w, h);
    const s = this.data.score!;
    const rowH = h / 2;
    this.drawMetricRow(ctx, w, rowH, s.score_raw_leaf, s.score_smoothed_mean, SCORE_COLOR,
                       'Raw Score', 'Smoothed Score');
    ctx.save();
    ctx.translate(0, rowH);
    this.drawMetricRow(ctx, w, rowH, s.index_raw_leaf, s.index_smoothed_mean, INDEX_COLOR,
                       'Raw Index', 'Smoothed Index');
    ctx.restore();
  };

  // ------------------------------------------------------------------ tree track
  private drawTree = (canvas: HTMLCanvasElement, w: number, h: number) => {
    const ctx = this.setupCanvas(canvas, w, h);
    const maxDepth = this.data.tree.max_depth || 1;
    const nBins = this.nBins;
    const xPix = (binX: number) => (binX / nBins) * w;
    const yPix = (depth: number) => h - (depth / maxDepth) * h;
    const depths = this.initialSet().depths || [];
    this.paintHighlight(ctx, w, h, i => {
      const d = i < 0 ? undefined : depths[i];
      return d === undefined ? h : yPix(d);
    });
    ctx.strokeStyle = this.T.tree;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    this.data.tree.h.forEach(seg => {
      const py = yPix(seg[2]);
      ctx.moveTo(xPix(seg[0]), py); ctx.lineTo(xPix(seg[1]), py);
    });
    this.data.tree.v.forEach(seg => {
      const px = xPix(seg[0]);
      ctx.moveTo(px, yPix(seg[1])); ctx.lineTo(px, yPix(seg[2]));
    });
    ctx.stroke();
  };

  // ------------------------------------------------------------------ assembly
  private trackDefs(): TrackDef[] {
    const msa: TrackDef = { label: ['MSA'], height: MSA_HEIGHT, draw: this.drawMsa };
    const tree: TrackDef = { label: ['Ordered Tree'], height: TREE_HEIGHT, draw: this.drawTree };
    const metrics: TrackDef = { label: ['Search', 'Metrics'], height: SCORE_HEIGHT, draw: this.drawScore };
    const upper = !this.data.score ? [msa] : (this.opts.swapped ? [metrics, msa] : [msa, metrics]);
    const top: TrackDef[] = [];
    if (this.opts.showHuman && this.humanAll().length) {
      top.push({ label: [this.data.human_track_label || 'Human'], labelSize: 22,
                 height: HUMAN_HEIGHT, draw: this.drawHuman });
    }
    if (this.crossHeight) {
      top.push({ label: [], gutter: this.buildCrossGutter, height: this.crossHeight, draw: this.drawCross });
    }
    return top.concat(upper, [tree]);
  }

  /** Draw every track into the label column and the canvas column. */
  render(labelCol: HTMLElement, canvasCol: HTMLElement, panelWidth: number, opts: FigureOptions) {
    this.opts = opts;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    labelCol.innerHTML = '';
    canvasCol.innerHTML = '';
    let drawn = 0;
    this.trackDefs().forEach(t => {
      const lbl = document.createElement('div');
      lbl.style.height = t.height + 'px';
      if (t.gutter) {
        lbl.className = 'hlabel';
        Object.assign(lbl.style, { display: 'flex', flexDirection: 'column', overflow: 'hidden' });
        lbl.appendChild(t.gutter());
      } else {
        lbl.className = 'vlabel';
        Object.assign(lbl.style, { display: 'flex', alignItems: 'center', justifyContent: 'center',
                                   gap: '3px', color: this.T.ink });
        if (t.labelSize) lbl.dataset.labelSize = String(t.labelSize);
        t.label.forEach(line => {
          const span = document.createElement('span');
          span.className = 'vline';
          Object.assign(span.style, { writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                                      fontSize: (t.labelSize || 31.5) + 'px', fontWeight: '600',
                                      letterSpacing: '0.3px', whiteSpace: 'nowrap' });
          span.textContent = line;
          lbl.appendChild(span);
        });
      }
      labelCol.appendChild(lbl);
      const canvas = document.createElement('canvas');
      Object.assign(canvas.style, { display: 'block', width: '100%' });
      canvasCol.appendChild(canvas);
      t.draw(canvas, panelWidth, t.height);
      if (drawn++) {
        const ctx = canvas.getContext('2d')!;
        ctx.save();
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.strokeStyle = this.T.rule;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, 0.5); ctx.lineTo(panelWidth, 0.5); ctx.stroke();
        ctx.restore();
        lbl.style.borderTop = '1px solid ' + this.T.rule;
      }
    });
  }

  /** SVG with every track redrawn at a fixed pixel density and the labels as text. */
  toSvg(labelCol: HTMLElement, canvasCol: HTMLElement): string | null {
    const live = Array.from(canvasCol.querySelectorAll('canvas'));
    const labelDivs = Array.from(labelCol.querySelectorAll<HTMLElement>('.vlabel, .hlabel'));
    if (!live.length) return null;
    const labelColWidth = labelCol.getBoundingClientRect().width;
    const panelWidth = labelColWidth + live[0].getBoundingClientRect().width;
    const totalHeight = live.reduce((sum, c) => sum + c.getBoundingClientRect().height, 0);
    const savedDark = this.opts.dark;
    this.opts = { ...this.opts, dark: false };
    const defs = this.trackDefs();
    const saved = this.dpr;
    this.dpr = EXPORT_SCALE;
    const exported = defs.map((t, i) => {
      const cssW = live[i].getBoundingClientRect().width;
      const c = document.createElement('canvas');
      t.draw(c, cssW, t.height);
      return { canvas: c, cssW, cssH: t.height };
    });
    this.dpr = saved;
    this.opts = { ...this.opts, dark: savedDark };

    const metrics = document.createElement('canvas').getContext('2d')!;
    const centerOffset = (size: number, weight: number) => {
      metrics.font = weight + ' ' + size + 'px ' + FONT;
      const m = metrics.measureText('Hg');
      return (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    };
    const esc = (s: string) => s.replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' } as Record<string, string>)[c]);
    const text = (x: number, yc: number, size: number, o: { anchor: string; weight: number; fill: string;
                  transform?: string }, s: string) =>
      '<text x="' + x + '" y="' + (yc + centerOffset(size, o.weight)) + '"' +
      (o.transform ? ' transform="' + o.transform + '"' : '') + ' text-anchor="' + o.anchor +
      '" font-family=\'' + FONT + '\' font-size="' + size + '" font-weight="' + o.weight +
      '" fill="' + o.fill + '">' + esc(s) + '</text>\n';

    let y = 0;
    let images = '';
    let labels = '';
    exported.forEach((e, i) => {
      const url = e.canvas.toDataURL('image/png');
      images += '<image x="' + labelColWidth + '" y="' + y + '" width="' + e.cssW + '" height="' +
        e.cssH + '" href="' + url + '" xlink:href="' + url + '" preserveAspectRatio="none"/>\n';
      const div = labelDivs[i];
      if (div && div.classList.contains('hlabel')) {
        const base = div.getBoundingClientRect();
        Array.from(div.querySelectorAll<HTMLElement>('.crossname')).forEach(row => {
          const r = row.getBoundingClientRect();
          labels += text(labelColWidth - 10, y + (r.top - base.top) + r.height / 2, 15,
            { anchor: 'end', weight: 600, fill: getComputedStyle(row).color }, row.dataset.crossName || '');
        });
      } else if (div) {
        const parts = Array.from(div.querySelectorAll('.vline')).map(s => (s.textContent || '').trim())
          .filter(Boolean);
        const size = Number(div.dataset.labelSize || 31.5);
        const cy = y + e.cssH / 2;
        const rowWidth = size + 3;
        const totalWidth = rowWidth * parts.length;
        parts.forEach((t, idx) => {
          const cx = labelColWidth / 2 - totalWidth / 2 + rowWidth * (idx + 0.5);
          labels += text(cx, cy, size, { anchor: 'middle', weight: 600, fill: '#1c1c1c',
                         transform: 'rotate(-90 ' + cx + ' ' + cy + ')' }, t);
        });
      }
      y += e.cssH;
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' +
      panelWidth + '" height="' + totalHeight + '" viewBox="0 0 ' + panelWidth + ' ' + totalHeight + '">\n' +
      '<rect x="0" y="0" width="' + panelWidth + '" height="' + totalHeight + '" fill="#ffffff"/>\n' +
      images + labels + '</svg>';
  }
}
