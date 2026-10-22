/**
 * Read-only topology map of one family's single-core alignment, with every residue replaced by its
 * DeepTMHMM topology state. Ported from the analysis' topology viewer (build_topology_viewer.py); the
 * scoring and the drawing are unchanged, the curation tools are left out and the cutoff is the 0.8
 * that was applied.
 *
 * A sequence's score is the mean, over the family's consensus helices, of the Jaccard similarity
 * between the consensus helix columns and the columns where the sequence has the same helix state,
 * computed over the columns occupied in at least 30% of the sequences whatever the display shows,
 * so it equals the score the filter used.
 */
import type { TopologyPayload } from '@/types/topology-filter';

export const CUTOFF = 0.8;
export type SortMode = 'score_desc' | 'score' | 'file' | 'coverage';
export type RowView = 'all' | 'kept' | 'removed';
type RGB = [number, number, number];

export const STATE_NAMES: Record<string, string> = {
  M: 'Membrane, inside to outside', W: 'Membrane, outside to inside',
  I: 'Inside (cytoplasmic)', O: 'Outside (extracellular)',
  S: 'Signal peptide', B: 'Beta barrel', P: 'Periplasm',
};
// Helices as in Figure 1 (M dark grey, W light grey); loops in pale tints that stay behind them.
const LIGHT = {
  states: { M: '#858585', W: '#c8c8c8', I: '#cfdeee', O: '#efe1c8', S: '#c1688d', B: '#b39ddb', P: '#ef9a9a' },
  gap: '#ffffff', hist: '#7fb3e8', ink: '#52514e', muted: '#86847d', text: '#0b0b0b', border: '#d8d5ce',
  grid: '#f4f3f0',
};
const DARK = {
  states: { M: '#858585', W: '#c8c8c8', I: '#2f4357', O: '#54452c', S: '#c1688d', B: '#9c86c9', P: '#e07b7b' },
  gap: '#1c1c1b', hist: '#6da7ec', ink: '#c3c2b7', muted: '#8d8b82', text: '#ffffff', border: '#3a3a36',
  grid: '#121211',
};
export type Palette = typeof LIGHT;
export const palette = (dark: boolean): Palette => (dark ? DARK : LIGHT);
export const REMOVED_COLOR = '#b3261e';   // as for removed sequences in Figure 1
const OUTLIER = REMOVED_COLOR;

export const VIEW_HEIGHT = 620;
const TILE_ROWS = 8192;
const TINT = 0.45;
const SCORE_MAX_GAP = 0.70;

function hexRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbCss = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
export const fmtInt = (n: number) => n.toLocaleString('en-US');
export const pct = (x: number) => (100 * x).toFixed(1) + '%';
export const fmtScore = (v: number) => (100 * v).toFixed(1) + '%';

export async function decodePayload(buffer: ArrayBuffer): Promise<TopologyPayload> {
  const bytes = new Uint8Array(buffer);
  // A server may already have undone the gzip (Content-Encoding); only decompress raw gzip.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function helixBlocksFor(consIsHelix: boolean[]) {
  const vn = consIsHelix.length, blocks: [number, number][] = [];
  for (let k = 0, start = -1; k <= vn; k++) {
    const on = k < vn && consIsHelix[k];
    if (on && start < 0) start = k;
    else if (!on && start >= 0) { if (k - start >= 8) blocks.push([start, k]); start = -1; }
  }
  return blocks;
}

export interface Elements {
  occupancy: HTMLCanvasElement;
  consensus: HTMLCanvasElement;
  heat: HTMLCanvasElement;
  side: HTMLCanvasElement;
  tip: HTMLDivElement;
}

export class TopologyMap {
  readonly D: TopologyPayload;
  readonly scores: Float32Array;
  readonly coverage: Float32Array;
  readonly residues: Int32Array;
  readonly comps: Record<string, number>[];
  readonly helixScores: Float32Array[];
  private colGap: number[];
  private rgb: Record<string, RGB> = {};
  visible: number[] = [];
  private blocks: [number, number][] = [];
  order: number[] = [];
  private base: { width: number; height: number; tiles: { y0: number; rows: number; canvas: HTMLCanvasElement }[] } | null = null;
  view: { x: number; y: number; w: number; h: number } | null = null;
  private el: Elements | null = null;
  rowView: RowView = 'all';
  sortMode: SortMode = 'score_desc';
  helix: number | 'all' = 'all';
  onViewChange: (() => void) | null = null;

  private pal: Palette = LIGHT;
  /** Switch the canvas palette; redraw afterwards. */
  setTheme(dark: boolean) {
    this.pal = palette(dark);
    this.rgb = {};
    for (const [label, hex] of Object.entries(this.pal.states)) this.rgb[label] = hexRgb(hex);
    this.rgb['-'] = hexRgb(this.pal.gap);
  }

  constructor(D: TopologyPayload) {
    this.D = D;
    this.colGap = D.columns.map(c => c.gap);
    this.setTheme(false);
    // Scores over the columns occupied in at least 30% of the sequences, as the filter used.
    const vis: number[] = [];
    for (let c = 0; c < D.nCol; c++) if (D.columns[c].gap <= SCORE_MAX_GAP + 1e-9) vis.push(c);
    const n = D.nSeq, w = D.nCol, m = D.matrix;
    this.scores = new Float32Array(n);
    this.coverage = new Float32Array(n);
    this.residues = new Int32Array(n);
    this.comps = [];
    const cons = vis.map(c => D.columns[c].cons);
    const consIsHelix = cons.map(c => c === 'M' || c === 'W');
    const vn = vis.length;
    const blocks = helixBlocksFor(consIsHelix);
    const edges = [0];
    for (let b = 0; b + 1 < blocks.length; b++) edges.push(Math.floor((blocks[b][1] + blocks[b + 1][0]) / 2));
    edges.push(vn);
    const windows = blocks.map((_, b) => [edges[b], edges[b + 1]] as [number, number]);
    this.helixScores = windows.map(() => new Float32Array(n));
    for (let s = 0; s < n; s++) {
      const base = s * w;
      let present = 0, both = 0, helixOnly = 0, consensusOnly = 0;
      const comp: Record<string, number> = {};
      for (let k = 0; k < vn; k++) {
        const ch = m[base + vis[k]];
        if (ch === '-') continue;
        present++;
        comp[ch] = (comp[ch] || 0) + 1;
        const isHelix = ch === 'M' || ch === 'W';
        if (isHelix && ch === cons[k]) both++;
        else if (isHelix) helixOnly++;
        else if (consIsHelix[k]) consensusOnly++;
      }
      this.residues[s] = present;
      this.coverage[s] = vn ? present / vn : 0;
      this.comps.push(comp);
      let sum = 0;
      for (let b = 0; b < windows.length; b++) {
        const [a, e] = windows[b];
        let hb = 0, ho = 0, hc = 0;
        for (let k = a; k < e; k++) {
          const ch = m[base + vis[k]];
          if (ch === '-') continue;
          const isHelix = ch === 'M' || ch === 'W';
          if (isHelix && ch === cons[k]) hb++;
          else if (isHelix) ho++;
          else if (consIsHelix[k]) hc++;
        }
        const u = hb + ho + hc;
        const j = u ? hb / u : 0;
        this.helixScores[b][s] = j;
        sum += j;
      }
      if (windows.length) this.scores[s] = sum / windows.length;
      else { const u = both + helixOnly + consensusOnly; this.scores[s] = u ? both / u : 0; }
    }
  }

  // ---------------------------------------------------------------- state
  isRemoved(s: number) { return this.scores[s] < CUTOFF; }
  nRows() { return this.order.length; }
  get nHelices() { return this.helixScores.length; }
  counts() {
    let removed = 0;
    for (let s = 0; s < this.D.nSeq; s++) if (this.isRemoved(s)) removed++;
    return { all: this.D.nSeq, kept: this.D.nSeq - removed, removed };
  }
  visibleCount(maxGap: number) {
    let n = 0;
    for (let c = 0; c < this.D.nCol; c++) if (this.colGap[c] <= maxGap + 1e-9) n++;
    return n;
  }

  setMaxGap(maxGap: number) {
    this.visible = [];
    for (let c = 0; c < this.D.nCol; c++) if (this.colGap[c] <= maxGap + 1e-9) this.visible.push(c);
    this.blocks = helixBlocksFor(this.visible.map(c => {
      const ch = this.D.columns[c].cons; return ch === 'M' || ch === 'W';
    }));
  }

  computeOrder() {
    const idx = Array.from({ length: this.D.nSeq }, (_, i) => i);
    const sc = this.scores, cov = this.coverage;
    if (this.sortMode === 'score') idx.sort((a, b) => sc[a] - sc[b] || a - b);
    else if (this.sortMode === 'score_desc') idx.sort((a, b) => sc[b] - sc[a] || a - b);
    else if (this.sortMode === 'coverage') idx.sort((a, b) => cov[a] - cov[b] || a - b);
    this.order = this.rowView === 'all' ? idx
      : this.rowView === 'kept' ? idx.filter(s => !this.isRemoved(s)) : idx.filter(s => this.isRemoved(s));
  }

  attach(el: Elements) { this.el = el; }

  // ---------------------------------------------------------------- heat map
  drawHeat(keepView = false) {
    if (!this.el) return;
    const w = Math.max(1, this.visible.length), h = this.nRows();
    const m = this.D.matrix, stride = this.D.nCol;
    const tintRemoved = this.rowView === 'all';
    const cut = hexRgb(OUTLIER);
    if (!h) {
      this.base = null; this.view = null;
      for (const cv of [this.el.heat, this.el.side]) cv.getContext('2d')!.clearRect(0, 0, cv.width, cv.height);
      this.onViewChange?.();
      return;
    }
    this.base = { width: w, height: h, tiles: [] };
    for (let y0 = 0; y0 < h; y0 += TILE_ROWS) {
      const rows = Math.min(TILE_ROWS, h - y0);
      const tile = document.createElement('canvas');
      tile.width = w; tile.height = rows;
      const tctx = tile.getContext('2d')!;
      const img = tctx.createImageData(w, rows);
      const data = img.data;
      for (let r = 0; r < rows; r++) {
        const s = this.order[y0 + r], from = s * stride, out = r * w * 4;
        const wash = tintRemoved && this.isRemoved(s);
        for (let k = 0; k < this.visible.length; k++) {
          const c = this.rgb[m[from + this.visible[k]]] || this.rgb['-'];
          const o = out + k * 4;
          if (wash) {
            data[o] = c[0] + (cut[0] - c[0]) * TINT;
            data[o + 1] = c[1] + (cut[1] - c[1]) * TINT;
            data[o + 2] = c[2] + (cut[2] - c[2]) * TINT;
          } else { data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; }
          data[o + 3] = 255;
        }
      }
      tctx.putImageData(img, 0, 0);
      this.base.tiles.push({ y0, rows, canvas: tile });
    }
    if (!keepView || !this.view) this.view = { x: 0, y: 0, w: this.base.width, h: this.base.height };
    this.clampView();
    this.renderView();
  }

  resetZoom() {
    if (!this.base) return;
    this.view = { x: 0, y: 0, w: this.base.width, h: this.base.height };
    this.renderView();
  }

  private clampView() {
    const v = this.view, b = this.base;
    if (!v || !b) return;
    v.w = Math.min(b.width, Math.max(2, v.w));
    v.h = Math.min(b.height, Math.max(2, v.h));
    v.x = Math.min(b.width - v.w, Math.max(0, v.x));
    v.y = Math.min(b.height - v.h, Math.max(0, v.y));
  }

  renderView() {
    const el = this.el, v = this.view, b = this.base;
    if (!el || !v || !b) return;
    const cv = el.heat;
    const dpr = window.devicePixelRatio || 1;
    const cssW = cv.clientWidth || 900;
    cv.style.height = VIEW_HEIGHT + 'px';
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(VIEW_HEIGHT * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const yScale = cv.height / v.h;
    for (const t of b.tiles) {
      const top = Math.max(v.y, t.y0), bottom = Math.min(v.y + v.h, t.y0 + t.rows);
      if (bottom <= top) continue;
      ctx.drawImage(t.canvas, v.x, top - t.y0, v.w, bottom - top, 0, (top - v.y) * yScale, cv.width,
                    (bottom - top) * yScale);
    }
    // Cells a few pixels across get a grid, and larger ones their topology letter.
    const pxCol = cssW / v.w, pxRow = VIEW_HEIGHT / v.h;
    if (pxCol >= 6 && pxRow >= 6) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const first = Math.max(0, Math.floor(v.x)), lastC = Math.min(this.visible.length, Math.ceil(v.x + v.w));
      const firstR = Math.max(0, Math.floor(v.y)), lastR = Math.min(this.nRows(), Math.ceil(v.y + v.h));
      ctx.strokeStyle = rgbCss(hexRgb(this.pal.grid), 0.85);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = first; c <= lastC; c++) {
        const x = Math.round((c - v.x) * pxCol) + 0.5;
        ctx.moveTo(x, 0); ctx.lineTo(x, VIEW_HEIGHT);
      }
      for (let r = firstR; r <= lastR; r++) {
        const y = Math.round((r - v.y) * pxRow) + 0.5;
        ctx.moveTo(0, y); ctx.lineTo(cssW, y);
      }
      ctx.stroke();
      if (pxCol >= 11 && pxRow >= 11) {
        const size = Math.min(pxCol, pxRow) * 0.62;
        ctx.font = `600 ${size.toFixed(1)}px ui-monospace, "Cascadia Mono", Menlo, monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = rgbCss(hexRgb(this.pal.text), 0.92);
        for (let r = firstR; r < lastR; r++) {
          const s = this.order[r], from = s * this.D.nCol;
          const y = (r - v.y) * pxRow + pxRow / 2;
          for (let c = first; c < lastC; c++) {
            const ch = this.D.matrix[from + this.visible[c]];
            if (ch === '-') continue;
            ctx.fillText(ch, (c - v.x) * pxCol + pxCol / 2, y);
          }
        }
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    this.renderSide();
    this.drawTracks();
    this.onViewChange?.();
  }

  // ---------------------------------------------------------------- side panel
  private cutoffRow() {
    let previous = Infinity, crossing = -1;
    for (let row = 0; row < this.order.length; row++) {
      const val = this.scores[this.order[row]];
      if (val > previous + 1e-9) return null;               // rows not ranked by score
      previous = val;
      if (crossing < 0 && val < CUTOFF) crossing = row;
    }
    return crossing > 0 ? crossing : null;
  }

  renderSide() {
    const el = this.el, v = this.view;
    if (!el || !v) return;
    const cv = el.side;
    const dpr = window.devicePixelRatio || 1;
    const cssW = cv.parentElement?.clientWidth || 360;
    cv.style.width = cssW + 'px'; cv.style.height = VIEW_HEIGHT + 'px';
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(VIEW_HEIGHT * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, VIEW_HEIGHT);
    const values = this.helix === 'all' || !this.helixScores.length
      ? this.scores : this.helixScores[Math.min(this.helixScores.length - 1, this.helix)];
    const label = this.helix === 'all' || !this.helixScores.length ? 'mean Jaccard' : `TM${(this.helix as number) + 1}`;
    const barW = Math.min(110, Math.max(60, cssW * 0.3));
    const pxPerRow = VIEW_HEIGHT / v.h;
    const n = this.nRows();
    ctx.strokeStyle = this.pal.muted; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0.5, 0); ctx.lineTo(0.5, VIEW_HEIGHT); ctx.stroke();
    const first = Math.max(0, Math.floor(v.y)), last = Math.min(n, Math.ceil(v.y + v.h));
    const labelled = pxPerRow >= 9;
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = this.pal.hist; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    let started = false;
    if (pxPerRow >= 1) {
      for (let row = first; row < last; row++) {
        const y = (row - v.y) * pxPerRow + pxPerRow / 2, x = 1 + barW * values[this.order[row]];
        if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; }
      }
    } else {
      for (let py = 0; py < VIEW_HEIGHT; py++) {
        const a = Math.floor(v.y + py * v.h / VIEW_HEIGHT);
        const b = Math.max(a + 1, Math.floor(v.y + (py + 1) * v.h / VIEW_HEIGHT));
        let sum = 0, k = 0;
        for (let row = a; row < b && row < n; row++) { sum += values[this.order[row]]; k++; }
        if (!k) continue;
        const x = 1 + barW * (sum / k);
        if (started) ctx.lineTo(x, py + 0.5); else { ctx.moveTo(x, py + 0.5); started = true; }
      }
    }
    ctx.stroke();
    const cutRow = this.cutoffRow();
    if (cutRow !== null) {
      const cy = (cutRow - v.y) * pxPerRow;
      if (cy >= -1 && cy <= VIEW_HEIGHT + 1) {
        ctx.strokeStyle = this.pal.ink; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(0, cy + 0.5); ctx.lineTo(cssW, cy + 0.5); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = this.pal.ink; ctx.textAlign = 'right';
        ctx.fillText(fmtScore(CUTOFF), cssW - 4, cy - 7);
        ctx.textAlign = 'left';
      }
    }
    if (pxPerRow >= 3) {
      for (let row = first; row < last; row++) {
        const val = values[this.order[row]];
        if (val >= CUTOFF) continue;
        const y = (row - v.y) * pxPerRow + pxPerRow / 2;
        ctx.fillStyle = OUTLIER;
        ctx.beginPath();
        ctx.arc(1 + barW * val, y, Math.min(3, Math.max(1.5, pxPerRow / 3)), 0, 6.284);
        ctx.fill();
      }
    }
    if (labelled) {
      for (let row = first; row < last; row++) {
        const s = this.order[row], val = values[s];
        const y = (row - v.y) * pxPerRow + pxPerRow / 2;
        ctx.fillStyle = val < CUTOFF ? OUTLIER : this.pal.ink;
        const gene = this.D.genes && this.D.genes[s] ? ' ' + this.D.genes[s] : '';
        const name = (this.D.descriptions[s].split(/\s+/).slice(1).join(' ') || '')
          .replace(/ (OS|OX|GN|PE|SV)=.*$/, '');
        ctx.fillText(`${fmtScore(val)}  ${this.D.ids[s]}${gene}  ${name}`.slice(0, 64), barW + 8, y);
      }
    }
    ctx.fillStyle = this.pal.muted; ctx.textBaseline = 'top';
    ctx.fillText(`${label}  0`, 2, 2);
    ctx.fillText(fmtScore(1), barW - 16, 2);
    if (!labelled) ctx.fillText('zoom in for gene names', barW + 8, 2);
  }

  // ---------------------------------------------------------------- tracks
  drawTracks() {
    const el = this.el;
    if (!el) return;
    const { occupancy: occ, consensus: cons, heat } = el;
    const dpr = window.devicePixelRatio || 1;
    const boxW = heat.clientWidth || 900;
    for (const cv of [occ, cons]) cv.style.width = boxW + 'px';
    const x0 = this.view ? this.view.x : 0, span = this.view ? this.view.w : Math.max(1, this.visible.length);
    const bw = boxW / span;
    const first = Math.max(0, Math.floor(x0)), last = Math.min(this.visible.length, Math.ceil(x0 + span));
    occ.width = boxW * dpr; occ.height = 44 * dpr;
    const octx = occ.getContext('2d')!; octx.scale(dpr, dpr); octx.clearRect(0, 0, boxW, 44);
    cons.width = boxW * dpr; cons.height = 34 * dpr;
    const cctx = cons.getContext('2d')!; cctx.scale(dpr, dpr); cctx.clearRect(0, 0, boxW, 34);
    for (let k = first; k < last; k++) {
      const col = this.D.columns[this.visible[k]];
      const c = this.rgb[col.cons] || this.rgb['-'];
      const x = (k - x0) * bw;
      octx.fillStyle = cctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      const bh = Math.max(1, (1 - col.gap) * 40);
      octx.fillRect(x, 44 - bh, Math.max(0.5, bw - 0.4), bh);
      cctx.fillRect(x, 0, Math.max(0.5, bw + 0.2), 18);
    }
    this.drawSegmentNames(cctx, boxW, x0, bw, first, last);
  }

  private consensusSegments() {
    const blocks = this.blocks;
    if (!blocks.length) return [] as [number, number, string][];
    const sideOf = (a: number, b: number) => {
      let inside = 0, outside = 0;
      for (let k = a; k < b; k++) {
        const c = this.D.columns[this.visible[k]].cons;
        if (c === 'I') inside++; else if (c === 'O') outside++;
      }
      return inside === 0 && outside === 0 ? null : (inside >= outside ? 'I' : 'O');
    };
    const segs: [number, number, string][] = [];
    let icl = 0, ecl = 0;
    if (blocks[0][0] > 0) segs.push([0, blocks[0][0], sideOf(0, blocks[0][0]) === 'I' ? 'N-term in' : 'N-term']);
    blocks.forEach(([a, b], i) => {
      segs.push([a, b, `TM${i + 1}`]);
      const next = i + 1 < blocks.length ? blocks[i + 1][0] : this.visible.length;
      if (next > b) {
        const side = sideOf(b, next);
        const isLast = i + 1 === blocks.length;
        if (side === null) segs.push([b, next, '']);
        else if (isLast) segs.push([b, next, side === 'I' ? 'C-term in' : 'C-term out']);
        else segs.push([b, next, side === 'I' ? `ICL${++icl}` : `ECL${++ecl}`]);
      }
    });
    return segs;
  }

  private drawSegmentNames(ctx: CanvasRenderingContext2D, boxW: number, x0: number, bw: number,
                           first: number, last: number) {
    const segs = this.consensusSegments();
    if (!segs.length) return;
    ctx.save();
    ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    for (const [a, b, name] of segs) {
      if (!name || b <= first || a >= last) continue;
      const xa = (a - x0) * bw, xb = (b - x0) * bw;
      ctx.strokeStyle = this.pal.border;
      ctx.beginPath(); ctx.moveTo(xa, 18); ctx.lineTo(xa, 22); ctx.stroke();
      const tw = ctx.measureText(name).width;
      if (xb - xa < tw + 6) continue;
      ctx.fillStyle = this.pal.ink;
      ctx.fillText(name, Math.max(tw / 2 + 1, Math.min(boxW - tw / 2 - 1, (xa + xb) / 2)), 27);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- histogram
  drawHist(cv: HTMLCanvasElement) {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth || 900, h = 120;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext('2d')!; ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
    const bins = new Array(50).fill(0);
    for (let i = 0; i < this.scores.length; i++) bins[Math.min(49, Math.floor(this.scores[i] * 50))]++;
    const max = Math.max(...bins);
    const bw = w / bins.length;
    for (let i = 0; i < bins.length; i++) {
      const bh = max ? (bins[i] / max) * (h - 22) : 0;
      ctx.fillStyle = (i + 1) / 50 <= CUTOFF ? OUTLIER : this.pal.hist;
      const r = Math.min(4, bw / 2, bh);
      ctx.beginPath();
      ctx.roundRect(i * bw + 1, h - 18 - bh, Math.max(1, bw - 2), bh, [r, r, 0, 0]);
      ctx.fill();
    }
    ctx.fillStyle = this.pal.muted; ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('0', 2, h - 4);
    ctx.textAlign = 'center'; ctx.fillText('topology score (mean helix Jaccard)', w / 2, h - 4);
    ctx.textAlign = 'right'; ctx.fillText(fmtScore(1), w - 2, h - 4);
    ctx.textAlign = 'left';
  }

  // ---------------------------------------------------------------- interaction
  cellAt(clientX: number, clientY: number) {
    if (!this.el || !this.view) return null;
    const r = this.el.heat.getBoundingClientRect();
    const fx = (clientX - r.left) / r.width, fy = (clientY - r.top) / r.height;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
    return { col: Math.floor(this.view.x + fx * this.view.w), row: Math.floor(this.view.y + fy * this.view.h) };
  }

  /** Wheel zoom (pulling cells towards square) and drag to pan; returns a cleanup function. */
  bindInteraction(): () => void {
    const el = this.el;
    if (!el) return () => {};
    const cv = el.heat, tip = el.tip, side = el.side;
    const onWheel = (event: WheelEvent) => {
      const v = this.view;
      if (!v || !this.base) return;
      event.preventDefault();
      const r = cv.getBoundingClientRect();
      const fx = (event.clientX - r.left) / r.width, fy = (event.clientY - r.top) / r.height;
      const ax = v.x + fx * v.w, ay = v.y + fy * v.h;
      const factor = event.deltaY < 0 ? 1 / 1.2 : 1.2;
      v.w *= factor;
      const squareRows = VIEW_HEIGHT * v.w / (cv.clientWidth || 900);
      const PULL = 0.55;
      const scaled = v.h * factor;
      v.h = factor < 1 ? squareRows + (scaled - squareRows) * PULL : squareRows + (scaled - squareRows) / PULL;
      this.clampView();
      v.x = ax - fx * v.w; v.y = ay - fy * v.h;
      this.clampView();
      this.renderView();
    };
    const onSideWheel = (event: WheelEvent) => {
      event.preventDefault();
      const r = cv.getBoundingClientRect();
      onWheel(new WheelEvent('wheel', { deltaY: event.deltaY, clientX: r.left + 10, clientY: event.clientY }));
    };
    let drag: { x: number; y: number; vx: number; vy: number } | null = null;
    const onDown = (event: MouseEvent) => {
      if (!this.view) return;
      drag = { x: event.clientX, y: event.clientY, vx: this.view.x, vy: this.view.y };
      cv.style.cursor = 'grabbing';
      event.preventDefault();
    };
    const onMove = (event: MouseEvent) => {
      if (!drag || !this.view) return;
      const r = cv.getBoundingClientRect();
      this.view.x = drag.vx - (event.clientX - drag.x) / r.width * this.view.w;
      this.view.y = drag.vy - (event.clientY - drag.y) / r.height * this.view.h;
      this.clampView(); this.renderView();
    };
    const onUp = () => { drag = null; cv.style.cursor = 'grab'; };
    const onHover = (e: MouseEvent) => {
      const at = this.cellAt(e.clientX, e.clientY);
      if (!at || at.row < 0 || at.row >= this.nRows() || at.col < 0 || at.col >= this.visible.length) {
        tip.style.display = 'none'; return;
      }
      const s = this.order[at.row], column = this.D.columns[this.visible[at.col]];
      const ch = this.D.matrix[s * this.D.nCol + this.visible[at.col]];
      const esc = (x: string) => x.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as Record<string, string>)[c]);
      tip.innerHTML =
        `<div style="font-weight:600;margin-bottom:3px">${esc(this.D.ids[s])}${this.isRemoved(s) ? ' · filtered out' : ''}</div>` +
        `<div>${esc(this.D.descriptions[s].split(' ').slice(1).join(' ').slice(0, 90)) || '&mdash;'}</div>` +
        `<div>topology score <b>${fmtScore(this.scores[s])}</b> · coverage ${pct(this.coverage[s])} · ${fmtInt(this.residues[s])} residues</div>` +
        `<div>alignment column ${fmtInt(column.i + 1)} · this sequence ${ch === '-' ? 'gap' : (STATE_NAMES[ch] || ch)}</div>` +
        `<div>column consensus ${STATE_NAMES[column.cons] || column.cons} (${pct(column.consFrac)}) · occupancy ${pct(1 - column.gap)}</div>`;
      tip.style.display = 'block';
      tip.style.left = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 10) + 'px';
      tip.style.top = Math.min(e.clientY + 14, window.innerHeight - tip.offsetHeight - 10) + 'px';
    };
    const onLeave = () => { tip.style.display = 'none'; };
    cv.style.cursor = 'grab';
    cv.addEventListener('wheel', onWheel, { passive: false });
    side.addEventListener('wheel', onSideWheel, { passive: false });
    cv.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    cv.addEventListener('mousemove', onHover);
    cv.addEventListener('mouseleave', onLeave);
    return () => {
      cv.removeEventListener('wheel', onWheel);
      side.removeEventListener('wheel', onSideWheel);
      cv.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      cv.removeEventListener('mousemove', onHover);
      cv.removeEventListener('mouseleave', onLeave);
    };
  }

  // ---------------------------------------------------------------- summaries
  summary() {
    const sorted = Array.from(this.scores).sort((a, b) => a - b);
    const mean = sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1);
    return {
      median: sorted[Math.floor(sorted.length / 2)] ?? 0,
      mean,
      p01: sorted[Math.floor(sorted.length * 0.01)] ?? 0,
    };
  }

  lowest(n = 100) {
    return Array.from({ length: this.D.nSeq }, (_, i) => i)
      .sort((a, b) => this.scores[a] - this.scores[b] || a - b).slice(0, n);
  }
}
