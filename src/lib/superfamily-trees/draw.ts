/**
 * Circular drawing of one superfamily tree, as an SVG string.
 *
 * Ported from the archive's ml_tree_viewer.html (09_superfamily_phylogeny/tree_viewer): the tree is
 * drawn rooted, as in Figure 3, with leaves going round in the node table's order, each internal node
 * midway between its first and last child, and each branch an arc along the parent's radius followed by
 * a radial line out to the node (radius = root-to-node distance). Two views:
 *  - families: the tree alone, each single-family clade shaded and named, leaf tips coloured by lineage;
 *  - detailed: a family ring and a lineage ring around the tree, a label per leaf, and family names.
 * Every element tied to a node carries data-n, which the viewer uses for hovering, search and dimming.
 */
import type { TreeData, TreeNode } from '@/types/superfamily-trees';

export type TreeView = 'families' | 'detailed';

const FAMILY_NAMES: Record<string, string> = {
  classA: 'Class A', classB1: 'Class B1', classB2: 'Class B2', classC: 'Class C', classF: 'Class F',
  classT: 'Taste-2', Vomeronasal1: 'Vomeronasal 1', Vomeronasal2: 'Vomeronasal 2', FSLB: 'FSL',
  GPR1like: 'GPR1-like',
};
export const familyName = (f: string) => FAMILY_NAMES[f] || f;
/** a literature sequence's family is the one its study reported: LIT_GP157 reads "GP157 (literature)" */
export const familyLabel = (f: string) => (f.startsWith('LIT_') ? `${familyName(f.slice(4))} (literature)` : familyName(f));

/** the five lineage groups of the Figure 3 legend */
export const GROUP_COLORS: Record<string, string> = {
  Metazoa: '#4477aa',
  Fungi: '#8e5ea2',
  'Amoebozoa and unicellular holozoans': '#33bbee',
  Viridiplantae: '#228833',
  'SAR and other eukaryotes': '#ee3377',
};

export interface Palette {
  bg: string; ink: string; muted: string; branch: string; s8: string; s9: string; guide: string;
  shades: [string, string, string]; hl: string; sub: string; frame: string;
}
const LIGHT: Palette = {
  bg: '#ffffff', ink: '#1f2328', muted: '#6b7280', branch: '#8a8f98', s8: '#e8a33d', s9: '#d1495b',
  guide: '#e3e5e8', shades: ['#dcdfe3', '#f1f2f4', '#e7e9ec'], hl: '#c2185b', sub: '#1d6fd6', frame: '#d0d4da',
};
const DARK: Palette = {
  bg: '#0b0d10', ink: '#e6e8eb', muted: '#9aa1ab', branch: '#7d838c', s8: '#e8a33d', s9: '#ef6a7b',
  guide: '#2a2e35', shades: ['#262a31', '#16191e', '#1e2228'], hl: '#ff4f9a', sub: '#5aa2ff', frame: '#3a3f47',
};
export const palette = (dark: boolean): Palette => (dark ? DARK : LIGHT);

export const W = 2600, H = 2600;
const CX = 1300, CY = 1300, TREE_R = 760;
const FAM: [number, number] = [6, 38], LIN: [number, number] = [42, 74];
const ACC = 82, NAME = 230, HUG = 6, MIN_UNIT = 5;
/** GPR1 nested in Class A gets one two-line name in the families view */
const MIXED = ['GPR1', 'classA'];

const f2 = (v: number) => v.toFixed(2);
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export interface DrawnTree {
  svg: string;
  kids: number[][];
  /** leaves under each node */
  below: number[][];
  /** leaves in drawing order */
  order: number[];
}

function starPath(cx: number, cy: number, r: number) {
  const p: string[] = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r;
    p.push(f2(cx + rr * Math.cos(a)) + ',' + f2(cy + rr * Math.sin(a)));
  }
  return 'M' + p.join(' L') + ' Z';
}

export function drawTree(T: TreeData, view: TreeView, pal: Palette,
                         measure: (text: string, px: number) => number): DrawnTree {
  const D: TreeNode[] = T.nodes, n = D.length, SIMPLE = view === 'families';
  const kids: number[][] = D.map(() => []);
  D.forEach((d, i) => { if (d.p >= 0) kids[d.p].push(i); });
  const order: number[] = [];
  (function walk(v: number) { if (D[v].leaf) order.push(v); else kids[v].forEach(walk); })(0);
  const below: number[][] = D.map(() => []);
  for (let i = n - 1; i >= 0; i--) {
    if (D[i].leaf) below[i] = [i];
    if (D[i].p >= 0) below[D[i].p] = below[D[i].p].concat(below[i]);
  }

  // layout
  const NL = order.length, step = (2 * Math.PI) / NL, off = -Math.PI / 2;
  const scale = TREE_R / Math.max(...order.map(v => D[v].rt));
  const ang: number[] = new Array(n), rad: number[] = new Array(n);
  order.forEach((v, i) => { ang[v] = off + (i + 0.5) * step; });
  for (let i = n - 1; i >= 0; i--) if (!D[i].leaf) ang[i] = (ang[kids[i][0]] + ang[kids[i][kids[i].length - 1]]) / 2;
  const pos: [number, number][] = D.map((d, i) => {
    rad[i] = d.rt * scale;
    return [CX + rad[i] * Math.cos(ang[i]), CY + rad[i] * Math.sin(ang[i])];
  });
  const edgePath = (v: number) => {
    const p = D[v].p, r = rad[p], a0 = ang[p], a1 = ang[v];
    const x0 = CX + r * Math.cos(a0), y0 = CY + r * Math.sin(a0), x1 = CX + r * Math.cos(a1), y1 = CY + r * Math.sin(a1);
    return `M${f2(x0)},${f2(y0)} A${f2(r)},${f2(r)} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} ${a1 >= a0 ? 1 : 0} `
      + `${f2(x1)},${f2(y1)} L${f2(pos[v][0])},${f2(pos[v][1])}`;
  };
  const E = (t: number, r: number): [number, number] => [CX + (TREE_R + r) * Math.cos(t), CY + (TREE_R + r) * Math.sin(t)];
  const at = (t: number, R: number) => E(t, R - TREE_R);       // absolute radius
  const tOf = (i: number) => off + (i + 0.5) * step;
  const tipR = order.map(v => rad[v]);

  function radialText(t: number, r: number, text: string | string[], size: number, weight: string, attr = '') {
    const [x, y] = E(t, r);
    const deg = (t * 180) / Math.PI, m = ((deg % 360) + 360) % 360, flip = m > 90 && m < 270;
    const body = Array.isArray(text)
      ? text.map((l, k) => `<tspan x="${f2(x)}" dy="${k ? 1.1 : -0.55 * (text.length - 1)}em">${l}</tspan>`).join('') : text;
    return `<text ${attr} x="${f2(x)}" y="${f2(y)}" font-size="${size}" font-weight="${weight}" `
      + `text-anchor="${flip ? 'end' : 'start'}" dominant-baseline="central" `
      + `transform="rotate(${f2(flip ? deg + 180 : deg)} ${f2(x)} ${f2(y)})">${body}</text>`;
  }
  function tangentText(t: number, R: number, text: string | string[], size: number) {
    const [x, y] = at(t, R);
    let deg = (t * 180) / Math.PI + 90;
    const m = ((deg % 360) + 540) % 360 - 180;
    if (m > 90 || m < -90) deg -= 180;                       // keep it upright
    const body = Array.isArray(text)
      ? text.map((l, k) => `<tspan x="${f2(x)}" dy="${k ? 1.1 : -0.55 * (text.length - 1)}em">${l}</tspan>`).join('') : text;
    return `<text x="${f2(x)}" y="${f2(y)}" font-size="${size}" font-weight="bold" text-anchor="middle" `
      + `dominant-baseline="central" transform="rotate(${f2(deg)} ${f2(x)} ${f2(y)})">${body}</text>`;
  }

  const supClass = (s?: number | null) => (s == null ? '' : s >= 0.9 ? 's9' : s >= 0.8 ? 's8' : '');
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">`,
    `<style>
      text { fill: ${pal.ink}; }
      .edges path { stroke: ${pal.branch}; fill: none; stroke-linecap: round; }
      .edges path.s8 { stroke: ${pal.s8}; } .edges path.s9 { stroke: ${pal.s9}; }
      .edges path.sub { stroke: ${pal.sub}; } .edges path.hl { stroke: ${pal.hl}; stroke-width: 4; }
      .hit path { stroke: transparent; stroke-width: 9; fill: none; pointer-events: stroke; cursor: pointer; }
      .ring path.hl { stroke: ${pal.ink}; stroke-width: 1.5; }
      .labels text { fill: ${pal.muted}; } .labels text.hl { fill: ${pal.hl}; font-weight: bold; }
      .tips circle.hl { stroke: ${pal.hl}; stroke-width: 3; }
      .stars path { cursor: pointer; } .stars path.hl { stroke: ${pal.hl}; stroke-width: 2; }
      .dim { opacity: 0.1; } .unst { opacity: 0.15; }
    </style>`,
  ];
  if (!SIMPLE) {
    out.push(`<g class="guides" stroke="${pal.guide}" stroke-width="0.5">`
      + order.map((v, i) => { const [x, y] = E(tOf(i), FAM[0]); return `<line x1="${f2(pos[v][0])}" y1="${f2(pos[v][1])}" x2="${f2(x)}" y2="${f2(y)}"/>`; }).join('')
      + '</g>');
  }
  const shadeAt = out.length; out.push('');
  const branches = D.map((_, v) => v).filter(v => v > 0);
  out.push('<g class="edges">' + branches.map(v => {
    const c = supClass(D[v].leaf ? null : D[v].s);
    return `<path data-n="${v}" class="${c}" stroke-width="${c ? 2.6 : 1.3}" d="${edgePath(v)}"/>`;
  }).join('') + '</g>');
  out.push('<g class="hit">' + branches.map(v => `<path data-n="${v}" d="${edgePath(v)}"/>`).join('') + '</g>');

  const color = (f: string) => T.colors[f] || '#999';
  const litLeaves = order.filter(v => D[v].lit);
  if (SIMPLE) {
    out.push('<g class="tips">' + order.filter(v => !D[v].lit).map(v =>
      `<circle data-n="${v}" cx="${f2(pos[v][0])}" cy="${f2(pos[v][1])}" r="4.5" fill="${GROUP_COLORS[D[v].grp!] || '#999'}"/>`).join('') + '</g>');
  } else {
    const cell = (i: number, [r0, r1]: [number, number], fill: string, attr: string) => {
      const t0 = off + i * step, t1 = t0 + step, p = [E(t0, r0), E(t0, r1), E(t1, r1), E(t1, r0)];
      return `<path ${attr} d="M${p.map(q => f2(q[0]) + ',' + f2(q[1])).join(' L')} Z" fill="${fill}"/>`;
    };
    const ring: string[] = [], text: string[] = [];
    order.forEach((v, i) => {
      const d = D[v], attr = `data-n="${v}"`;
      const edge = d.lit ? ` stroke="${pal.ink}" stroke-width="1.2"` : '';
      ring.push(cell(i, FAM, color(d.fam!), attr + edge), cell(i, LIN, GROUP_COLORS[d.grp!] || '#999', attr + edge));
      const species = d.lit ? d.sp : (d.tax || []).find(x => x[0] === 'species')?.[1];
      text.push(radialText(tOf(i), ACC, `${d.lit ? '★ ' : ''}${esc(d.acc!)}${species ? ' · ' + esc(species) : ''}`,
        7, d.lit ? 'bold' : 'normal', attr));
    });
    out.push(`<g class="ring" stroke="${pal.bg}" stroke-width="0.15">` + ring.join('') + '</g>');
    out.push('<g class="labels">' + text.join('') + '</g>');
  }
  // a star on the leaf's tip, hoverable like the leaf
  if (litLeaves.length) out.push('<g class="stars">' + litLeaves.map(v =>
    `<path data-n="${v}" d="${starPath(pos[v][0], pos[v][1], SIMPLE ? 8 : 6)}" fill="${SIMPLE ? pal.bg : color(D[v].fam!)}" stroke="${pal.ink}" stroke-width="1"/>`).join('') + '</g>');

  const names: string[] = ['<g class="names">'];
  const shades: string[] = [];
  const fams = order.map(v => D[v].fam!);
  if (!SIMPLE) {
    // detailed view: a coloured arc and the name for runs of three or more leaves of one family;
    // shorter runs get the name alone
    let s0 = fams.findIndex((f, i) => f !== fams[(i + NL - 1) % NL]);
    if (s0 < 0) s0 = 0;
    for (let k = 0; k < NL;) {
      const i = (s0 + k) % NL; let len = 1;
      while (k + len < NL && fams[(s0 + k + len) % NL] === fams[i]) len++;
      const ta = off + (s0 + k) * step, tb = ta + len * step, tm = (ta + tb) / 2;
      if (!fams[i].startsWith('LIT_')) {
        if (len >= 3) {
          const pts: [number, number][] = [], m = Math.max(2, Math.ceil(len * 2));
          for (let j = 0; j <= m; j++) pts.push(E(ta + step * 0.2 + ((tb - ta - step * 0.4) * j) / m, NAME - 10));
          names.push(`<polyline points="${pts.map(p => f2(p[0]) + ',' + f2(p[1])).join(' ')}" stroke="${color(fams[i])}" stroke-width="4" fill="none"/>`);
          names.push(radialText(tm, NAME, `${esc(familyLabel(fams[i]))} (${len})`, 16, 'bold'));
        } else {
          names.push(radialText(tm, NAME, esc(familyLabel(fams[i])), 13, 'bold'));
        }
      }
      k += len;
    }
  } else {
    // families view: units are the largest clades whose leaves all belong to one family (GPR1 and
    // Class A counted together); literature leaves fit any family, so they neither split nor join a clade
    const key = (f: string) => (MIXED.includes(f) ? MIXED.join('+') : f);
    const idx: Record<number, number> = {}; order.forEach((v, i) => { idx[v] = i; });
    const ANY = '*';
    const fk: (string | null)[] = [], lo: number[] = [], hi: number[] = [], has: Set<string>[] = [];
    for (let v = n - 1; v >= 0; v--) {
      if (D[v].leaf) {
        fk[v] = D[v].lit ? ANY : key(D[v].fam!); lo[v] = hi[v] = idx[v];
        has[v] = new Set(D[v].lit ? [] : [D[v].fam!]); continue;
      }
      const ks = kids[v], real = [...new Set(ks.map(c => fk[c]).filter(f => f !== ANY))];
      fk[v] = ks.some(c => fk[c] == null) || real.length > 1 ? null : real.length ? real[0] : ANY;
      lo[v] = Math.min(...ks.map(c => lo[c])); hi[v] = Math.max(...ks.map(c => hi[c]));
      has[v] = new Set(ks.flatMap(c => [...has[c]]));
    }
    interface Unit { first: number; len: number; label: string; lines: string[] | null; twin?: boolean }
    const units: Unit[] = [];
    D.forEach((d, v) => {
      if (fk[v] == null || fk[v] === ANY || (d.p >= 0 && fk[d.p] != null)) return;
      const both = MIXED.every(f => has[v].has(f));
      units.push({ first: lo[v], len: hi[v] - lo[v] + 1, label: both ? MIXED[0] : [...has[v]][0],
                   lines: both ? MIXED.map(f => esc(familyName(f))) : null });
    });
    units.sort((x, y) => x.first - y.first);

    function lca(vs: number[]) {
      let anc = new Set<number>(); for (let k = vs[0]; k >= 0; k = D[k].p) anc.add(k);
      let best = vs[0];
      for (const v of vs.slice(1)) {
        let k = v; while (!anc.has(k)) k = D[k].p;
        best = k; anc = new Set(); for (let a = k; a >= 0; a = D[a].p) anc.add(a);
      }
      return best;
    }
    function shade(first: number, len: number, fill: string) {
      const run = [...Array(len).keys()].map(jj => (first + jj) % NL);
      const Rin = rad[lca(run.map(j => order[j]))];
      const pts: [number, number][] = [];
      const ta = off + (first + 0.15) * step, tb = off + (first + len - 0.15) * step;
      run.forEach((j, jj) => {
        const t0 = off + (first + jj) * step;
        pts.push(at(Math.max(t0, ta), tipR[j] + HUG), at(Math.min(t0 + step, tb), tipR[j] + HUG));
      });
      const m = Math.max(2, len * 2);
      for (let q = m; q >= 0; q--) pts.push(at(ta + ((tb - ta) * q) / m, Rin));
      return `<polygon points="${pts.map(p => f2(p[0]) + ',' + f2(p[1])).join(' ')}" fill="${fill}"/>`;
    }

    // Each name is centred on its clade, at the lowest radius where its box starts past every leaf tip
    // it spans and touches no branch and no name already placed; larger clades go first.
    const FS = 26, PAD = 3, FAR = 30;
    const pts: [number, number][] = [];
    branches.forEach(v => {
      const p = D[v].p, r0 = rad[p], a0 = ang[p], a1 = ang[v];
      const na = Math.ceil((r0 * Math.abs(a1 - a0)) / 3);
      for (let q = 0; q <= na; q++) pts.push([r0, a0 + ((a1 - a0) * q) / Math.max(na, 1)]);
      const nr = Math.ceil((rad[v] - r0) / 3);
      for (let q = 0; q <= nr; q++) pts.push([r0 + ((rad[v] - r0) * q) / Math.max(nr, 1), a1]);
    });
    const textW = (t: string) => measure(t.replace(/&amp;/g, '&'), FS);
    const boxOf = (text: string | string[], outward: boolean) => {
      const lines = Array.isArray(text) ? text : [text];
      const w = Math.max(...lines.map(textW)), h = lines.length * FS * 1.1;
      return outward ? { depth: w + PAD, half: h / 2 + PAD } : { depth: h + PAD, half: w / 2 + PAD };
    };
    function innerR(t: number, { depth, half }: { depth: number; half: number }) {
      const blocked: number[] = [];
      for (const [r, th] of pts) {
        const d = ((((th - t) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
        if (Math.abs(d) > 1.2) continue;
        const uu = r * Math.cos(d), vv = r * Math.sin(d);
        if (Math.abs(vv) <= half && uu > 0) blocked.push(uu);
      }
      blocked.sort((x, y) => x - y);
      let R = 60;
      tipR.forEach((r, j) => {
        const d = tOf(j) - t, ro = r + HUG;
        if (Math.abs(Math.sin(d)) * ro <= half + (ro * step) / 2 && Math.cos(d) > 0) R = Math.max(R, ro * Math.cos(d) + PAD);
      });
      for (const b of blocked) { if (b < R) continue; if (b <= R + depth) R = b + PAD; else break; }
      return R;
    }
    function occupy(t: number, R: number, { depth, half }: { depth: number; half: number }) {
      const c = Math.cos(t), sn = Math.sin(t);
      const nu = Math.ceil((depth + 2 * PAD) / 4), nv = Math.ceil((2 * half + 2 * PAD) / 4);
      for (let i = 0; i <= nu; i++) for (let k = 0; k <= nv; k++) {
        const du = -PAD + ((depth + 2 * PAD) * i) / nu, dv = -half - PAD + ((2 * half + 2 * PAD) * k) / nv;
        const x = (R + du) * c - dv * sn, y = (R + du) * sn + dv * c;
        pts.push([Math.hypot(x, y), Math.atan2(y, x)]);
      }
    }
    // names run along the circle unless that leaves them far past their own clade's tips; then they
    // point outward, which sits closer. A clade next to one of the same name always runs along.
    function place(u: Unit, text: string | string[]) {
      const t = off + (u.first + u.len / 2) * step;
      const own = Math.max(...[...Array(u.len).keys()].map(jj => tipR[(u.first + jj) % NL])) + HUG;
      const along = boxOf(text, false), R1 = innerR(t, along);
      if (R1 - own > FAR && !u.twin) {
        const outw = boxOf(text, true), R2 = innerR(t, outw);
        if (R2 < R1) { occupy(t, R2, outw); return radialText(t, R2 - TREE_R, text, FS, 'bold'); }
      }
      occupy(t, R1, along);
      return tangentText(t, R1 + along.depth / 2, text, FS);
    }
    const shown = units.filter(u => u.len >= MIN_UNIT);
    shown.forEach((u, k) => {
      const nb = [shown[(k + shown.length - 1) % shown.length], shown[(k + 1) % shown.length]];
      u.twin = shown.length > 1 && nb.some(o => o !== u && o.label === u.label);
    });
    shown.forEach((u, k) => shades.push(shade(u.first, u.len,
      shown.length % 2 && k === shown.length - 1 && k > 0 ? pal.shades[2] : pal.shades[k % 2])));
    [...shown].sort((x, y) => y.len - x.len).forEach(u => names.push(place(u, u.lines || esc(familyLabel(u.label)))));
  }
  names.push('</g>');
  out.push(names.join(''));
  out[shadeAt] = '<g class="shades" pointer-events="none">' + shades.join('') + '</g>';

  // scale bar: a round value near a fifth of the deepest root-to-tip distance, drawn with its right end
  // at the origin; the viewer moves it into the top-right corner of the drawn tree
  const raw = TREE_R / scale / 5, mag = 10 ** Math.floor(Math.log10(raw));
  const val = [1, 2, 5, 10].map(m => m * mag).reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
  const len = val * scale;
  out.push(`<g id="scalebar"><g stroke="${pal.ink}" stroke-width="2.5"><line x1="${f2(-len)}" y1="0" x2="0" y2="0"/>`
    + `<line x1="${f2(-len)}" y1="-8" x2="${f2(-len)}" y2="8"/><line x1="0" y1="-8" x2="0" y2="8"/></g>`
    + `<text x="${f2(-len / 2)}" y="-18" font-size="22" text-anchor="middle">${+val.toPrecision(2)} substitutions/site</text></g>`);
  out.push('</svg>');
  return { svg: out.join('\n'), kids, below, order };
}
