import { zip } from 'fflate';

/**
 * FASTA downloads (public/sequences/, README "Sequence downloads"): the final family members, and in removed/ and
 * controls/ the sequences the filters removed and the control clades. Each file set's index
 * (scripts/index-sequence-fasta.mjs) gives, per taxID, the file, byte offset, byte length and number of sequences
 * of that genome's block, so only the requested genomes are fetched (HTTP range requests).
 */
const DIR = '/sequences';
const PARALLEL = 6;

/** file, byte offset, byte length, number of sequences */
type Block = [string, number, number, number];
type FamilyIndex = Record<string, Block>;
/** '' the final members, 'removed' the sequences removed by the filters, 'controls' the control clades */
export type SequenceSet = '' | 'removed' | 'controls';
const setDir = (set: SequenceSet) => (set ? `${DIR}/${set}` : DIR);

const indexes = new Map<string, Promise<FamilyIndex>>();

/** The families that have sequence files (the GPCR families of the study). */
export const SEQUENCE_FAMILIES = new Set([
  'classA', 'Olfactory', 'Vomeronasal1', 'classT', 'Nematode', 'GPR1', 'cAMP', 'classB1', 'classB2', 'Mth',
  'classF', 'FSLB', 'GP143', 'TM116', 'GP157', 'STE3', 'classC', 'Vomeronasal2', 'STE2',
]);

function familyIndex(family: string, set: SequenceSet = '') {
  const key = `${set}/${family}`;
  if (!indexes.has(key)) {
    indexes.set(key, fetch(`${setDir(set)}/${family}.index.json`)
      .then(r => { if (!r.ok) throw new Error(`${key} index: HTTP ${r.status}`); return r.json(); })
      .catch(e => { indexes.delete(key); throw e; }));
  }
  return indexes.get(key)!;
}

/** Number of sequences of these families in these genomes (taxIDs as strings). */
export async function countSequences(families: string[], taxids: Iterable<string>) {
  const ids = [...taxids];
  const all = await Promise.all(families.map(f => familyIndex(f)));
  return all.reduce((sum, idx) => sum + ids.reduce((s, t) => s + (idx[t]?.[3] ?? 0), 0), 0);
}

/** Byte ranges per file for these genomes, adjacent blocks merged into one range. */
function ranges(index: FamilyIndex, taxids: string[]) {
  const byFile = new Map<string, [number, number][]>();
  for (const t of taxids) {
    const b = index[t];
    if (!b) continue;
    if (!byFile.has(b[0])) byFile.set(b[0], []);
    byFile.get(b[0])!.push([b[1], b[1] + b[2]]);
  }
  const out: { file: string; start: number; end: number }[] = [];
  for (const [file, list] of byFile) {
    list.sort((a, b) => a[0] - b[0]);
    let [s, e] = list[0];
    for (const [a, b] of list.slice(1)) {
      if (a === e) e = b;
      else { out.push({ file, start: s, end: e }); [s, e] = [a, b]; }
    }
    out.push({ file, start: s, end: e });
  }
  // file order, then offset: the FASTA keeps the order of the files
  return out.sort((a, b) => a.file.localeCompare(b.file, undefined, { numeric: true }) || a.start - b.start);
}

async function fetchRange(file: string, start: number, end: number, set: SequenceSet = '') {
  // no-store: Chrome cannot answer range requests from its HTTP cache (ERR_CACHE_OPERATION_NOT_SUPPORTED when
  // several hit one file), so they always go to the server
  const res = await fetch(`${setDir(set)}/${file}`, { cache: 'no-store', headers: { Range: `bytes=${start}-${end - 1}` } });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  // a server that ignores Range sends the whole file (200): cut the block out of it
  return res.status === 206 ? bytes : bytes.slice(start, end);
}

/** Runs the tasks, at most `limit` at a time, keeping their order in the result. */
async function inBatches<T>(tasks: (() => Promise<T>)[], limit: number, onDone: () => void) {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
      onDone();
    }
  }));
  return results;
}

/**
 * Downloads one FASTA per family for these genomes, zipped as <name>.zip. Families without a sequence in any
 * of the genomes are left out. onProgress gets the downloaded and total number of byte ranges.
 */
export async function downloadFastaZip({ families, taxids, name, onProgress }: {
  families: string[];
  taxids: Iterable<string>;
  name: string;
  onProgress?: (done: number, total: number) => void;
}) {
  const ids = [...new Set(taxids)];
  const fams = families.filter(f => SEQUENCE_FAMILIES.has(f));
  const plans = await Promise.all(fams.map(async f => ({ family: f, ranges: ranges(await familyIndex(f), ids) })));
  const total = plans.reduce((n, p) => n + p.ranges.length, 0);
  let done = 0;
  onProgress?.(0, total);
  const files: Record<string, Uint8Array> = {};
  for (const { family, ranges: rs } of plans) {
    if (!rs.length) continue;
    const parts = await inBatches(rs.map(r => () => fetchRange(r.file, r.start, r.end)), PARALLEL,
      () => onProgress?.(++done, total));
    const joined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { joined.set(p, at); at += p.length; }
    files[`${name}_${family}.fasta`] = joined;
  }
  await saveZip(files, name);
}

async function saveZip(files: Record<string, Uint8Array>, name: string) {
  if (!Object.keys(files).length) throw new Error('no sequences for this selection');
  const zipped = await new Promise<Uint8Array>((resolve, reject) =>
    zip(files, { level: 6 }, (err, data) => (err ? reject(err) : resolve(data))));
  const url = URL.createObjectURL(new Blob([zipped as BlobPart], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One sequence: the file set and family it is stored under, and its accession. */
export interface SequenceRef { set: SequenceSet; family: string; accession: string }

/**
 * Downloads exactly these sequences of one genome, as one FASTA per group (e.g. per family of a table), in the
 * groups' order and in each group the order given, zipped as <name>.zip. A sequence listed twice is written twice.
 */
export async function downloadSequencesZip({ taxid, groups, name, onProgress }: {
  taxid: string;
  groups: { label: string; sequences: SequenceRef[] }[];
  name: string;
  onProgress?: (done: number, total: number) => void;
}) {
  // the genome's block of every file set and family the sequences are stored under
  const needed = [...new Map(groups.flatMap(g => g.sequences).map(r => [`${r.set}/${r.family}`, r])).values()];
  const blocks = await Promise.all(needed.map(async r => ({ ref: r, block: (await familyIndex(r.family, r.set))[taxid] })));
  const total = blocks.filter(b => b.block).length;
  let done = 0;
  onProgress?.(0, total);
  const texts = await inBatches(blocks.map(({ ref, block }) => async () => {
    if (!block) return { ref, text: '' };
    const bytes = await fetchRange(block[0], block[1], block[1] + block[2], ref.set);
    return { ref, text: new TextDecoder().decode(bytes) };
  }), PARALLEL, () => onProgress?.(++done, total));
  // accession -> its FASTA record, per file set and family
  const records = new Map<string, Map<string, string>>();
  for (const { ref, text } of texts) {
    const m = new Map<string, string>();
    for (const rec of text.split(/^(?=>)/m)) {
      if (rec.startsWith('>')) m.set(rec.slice(1).split(/\s/, 1)[0].split('|')[1], rec.endsWith('\n') ? rec : rec + '\n');
    }
    records.set(`${ref.set}/${ref.family}`, m);
  }
  const files: Record<string, Uint8Array> = {};
  const missing: string[] = [];
  const enc = new TextEncoder();
  for (const g of groups) {
    const parts: string[] = [];
    for (const r of g.sequences) {
      const rec = records.get(`${r.set}/${r.family}`)?.get(r.accession);
      if (rec) parts.push(rec); else missing.push(r.accession);
    }
    if (parts.length) files[`${name}_${g.label.replace(/\W+/g, '_')}.fasta`] = enc.encode(parts.join(''));
  }
  if (missing.length) throw new Error(`${missing.length} sequences not found (e.g. ${missing[0]})`);
  await saveZip(files, name);
}
