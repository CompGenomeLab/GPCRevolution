import fs from 'fs';
import path from 'path';

// Writes the byte-position index of every family FASTA in public/sequences/, which the FASTA downloads of the
// species and taxonomic-distribution pages read, so they fetch only the genomes requested (HTTP range requests)
// instead of whole files.
//
// A family is <family>.fasta, or <family>_1.fasta, <family>_2.fasta, ... when it is split (GitHub refuses files
// over 100 MB). In each file the sequences of one genome (the OX= taxID of the UniProt header) must be one
// contiguous block, as build_family_fasta.py of the GPCR_Superfamily repository writes them. For each family this
// writes <family>.index.json: { taxID: [file, byte offset, byte length, number of sequences] }.
//
// The subfolders (removed/, controls/) are indexed the same way, each index next to its files.
//
// Run it after replacing any FASTA in public/sequences/:
//   node scripts/index-sequence-fasta.mjs [directory, default public/sequences]

const ROOT = path.resolve(process.argv[2] || path.join('public', 'sequences'));
const OX = /\sOX=(\d+)/;
let problems = 0;

const dirs = [ROOT, ...fs.readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => path.join(ROOT, d.name))];
for (const DIR of dirs) {
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.fasta')).sort();
if (!files.length) continue;
console.log(`-- ${path.relative(ROOT, DIR) || '.'}`);
const byFamily = new Map();
for (const file of files) {
  const family = file.replace(/(_\d+)?\.fasta$/, '');
  if (!byFamily.has(family)) byFamily.set(family, []);
  byFamily.get(family).push(file);
}

for (const [family, parts] of byFamily) {
  // numbered parts in their number order (_2 before _10)
  parts.sort((a, b) => (+(a.match(/_(\d+)\.fasta$/)?.[1] ?? 0)) - (+(b.match(/_(\d+)\.fasta$/)?.[1] ?? 0)));
  const index = {};
  let sequences = 0;
  for (const file of parts) {
    const buf = fs.readFileSync(path.join(DIR, file));
    let taxid = null, start = 0, count = 0, lineStart = 0;
    const close = end => {
      if (taxid === null) return;
      if (index[taxid]) {
        console.error(`${file}: the sequences of taxID ${taxid} are not one contiguous block`);
        problems++;
      }
      index[taxid] = [file, start, end - start, count];
    };
    // walk the lines; only header lines (">") matter, so the bytes are not decoded as a whole
    for (let i = 0; i <= buf.length; i++) {
      if (i < buf.length && buf[i] !== 0x0a) continue;
      if (buf[lineStart] === 0x3e) {                     // '>'
        const header = buf.toString('utf8', lineStart, i);
        const m = OX.exec(header);
        if (!m) { console.error(`${file}: no OX= taxID in ${header.slice(0, 80)}`); problems++; }
        const t = m ? m[1] : 'unknown';
        if (t !== taxid) { close(lineStart); taxid = t; start = lineStart; count = 0; }
        count++;
        sequences++;
      }
      lineStart = i + 1;
    }
    close(buf.length);
  }
  fs.writeFileSync(path.join(DIR, `${family}.index.json`), JSON.stringify(index));
  console.log(`${family.padEnd(13)} ${String(sequences).padStart(7)} sequences, ${String(Object.keys(index).length).padStart(5)} genomes, ${parts.join(' + ')}`);
}
}
if (problems) {
  console.error(`${problems} problem(s); fix the FASTA files and run again`);
  process.exit(1);
}
