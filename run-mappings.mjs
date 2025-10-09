import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
const CUSTOM_MSA_DIR = path.join(ROOT, 'public', 'custom_msa');
const CONSERVATION_DIR = path.join(ROOT, 'public', 'conservation_files');
const OUTPUT_DIR = path.join(ROOT, 'public', 'mappings');

// Families to process are driven by trim_info.tsv
const TRIM_INFO = path.join(CUSTOM_MSA_DIR, 'trim_info.tsv');
const SUP_REPS = path.join(CUSTOM_MSA_DIR, 'sup_reps_noClassC_noSTE3_linsi_trimends_treein_einsi_ep0.123_missing_added_reps_only.fasta');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function parseFasta(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const seqs = [];
  let header = '';
  let seq = '';
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('>')) {
      if (header) seqs.push({ header, sequence: seq });
      header = line.substring(1).trim();
      seq = '';
    } else {
      seq += line.trim();
    }
  }
  if (header) seqs.push({ header, sequence: seq });
  return seqs;
}

function extractAccFromHeader(header) {
  // Supports both | and _ split patterns, prefer second token
  const partsPipe = header.split('|');
  if (partsPipe.length > 1) return partsPipe[1].trim();
  const partsUnd = header.split('_');
  if (partsUnd.length > 1) return partsUnd[1].trim();
  return header.trim();
}

function extractSeqRange(header) {
  const m = header.match(/\/(\d+)-(\d+)/);
  if (m) return { start: parseInt(m[1], 10), end: parseInt(m[2], 10) };
  return null;
}

function loadConservationForAcc2Header(acc2Header) {
  const parts = acc2Header.split('|');
  if (parts.length < 3) return {};
  const gene = parts[2].trim().split('_')[0];
  const file = path.join(CONSERVATION_DIR, `${gene}_conservation.txt`);
  if (!fs.existsSync(file)) return {};
  const txt = readText(file);
  const map = {};
  txt.replace(/\r/g, '').split('\n').forEach(line => {
    const cols = line.split('\t');
    if (!cols[0] || cols[0].toLowerCase() === 'residue_number') return;
    if (cols.length < 6) return;
    const residue = cols[0].trim();
    const gpcrdb = cols[5].trim();
    if (residue) map[residue] = gpcrdb;
  });
  return map;
}

function computeInformationContent(columnResidues) {
  // columnResidues: array of single-character residues across all sequences at this column
  const total = columnResidues.length;
  const standardAA = 'ACDEFGHIKLMNPQRSTVWY';
  const counts = {};
  let nonGap = 0;
  for (const aa of columnResidues) {
    const r = (aa || '-').toUpperCase();
    if (standardAA.includes(r)) {
      counts[r] = (counts[r] || 0) + 1;
      nonGap++;
    }
  }
  if (nonGap === 0) {
    return { informationContent: 0, letterHeights: {}, residueCounts: {}, totalSequences: total };
  }
  // Frequencies and entropy computed over non-gap residues only
  const frequencies = {};
  Object.keys(counts).forEach(k => { frequencies[k] = counts[k] / nonGap; });
  let entropy = 0;
  Object.values(frequencies).forEach(f => { if (f > 0) entropy -= f * Math.log2(f); });
  const maxBits = Math.log2(20); // 20 amino acids, gaps excluded
  const informationContent = Math.max(0, maxBits - entropy);
  const letterHeights = {};
  Object.keys(counts).forEach(k => { letterHeights[k] = frequencies[k] * informationContent; });
  return { informationContent, letterHeights, residueCounts: counts, totalSequences: total };
}

function findSequenceByAcc(sequences, acc) {
  return sequences.find(s => {
    if (s.header.includes(acc)) return true;
    const p = s.header.split('|');
    if (p.length > 1 && p[1].trim() === acc) return true;
    const u = s.header.split('_');
    if (u.length > 1 && u[1].trim() === acc) return true;
    return false;
  });
}

function precomputeForFamily({ familyKey, acc1, acc2, supRepMap, supRepSeqs }) {
  const familyFasta = path.join(CUSTOM_MSA_DIR, `${familyKey}_genes_filtered_db_FAMSA.ref_trimmed.fasta`);
  if (!fs.existsSync(familyFasta)) {
    console.warn(`Skipping ${familyKey}: missing ${path.basename(familyFasta)}`);
    return null;
  }

  const familySeqs = parseFasta(readText(familyFasta));
  const famAcc1 = findSequenceByAcc(familySeqs, acc1);
  if (!famAcc1) {
    console.warn(`Skipping ${familyKey}: acc1 ${acc1} not found in family alignment`);
    return null;
  }
  const famAcc2 = acc2 ? findSequenceByAcc(familySeqs, acc2) : null;

  // Build acc1 real residue -> family column map
  const famRange = extractSeqRange(famAcc1.header);
  const famOffset = famRange ? famRange.start - 1 : 0;
  const acc1ResiduePosToFamCol = {};
  {
    let famResCount = 0;
    for (let i = 0; i < famAcc1.sequence.length; i++) {
      const aa = famAcc1.sequence[i];
      if (aa !== '-') {
        famResCount++;
        const realRes = famOffset + famResCount;
        acc1ResiduePosToFamCol[realRes] = i;
      }
    }
  }

  // Build acc1 real residue -> acc2 real residue map (if acc2 exists)
  const acc1ToAcc2ResMap = {};
  if (famAcc2) {
    const acc2Range = extractSeqRange(famAcc2.header);
    const acc2Offset = acc2Range ? acc2Range.start - 1 : 0;
    let acc1Run = 0;
    let acc2Run = 0;
    const maxLen = Math.max(famAcc1.sequence.length, famAcc2.sequence.length);
    for (let i = 0; i < maxLen; i++) {
      const a1 = famAcc1.sequence[i] || '-';
      const a2 = famAcc2.sequence[i] || '-';
      if (a1 !== '-') acc1Run++;
      if (a2 !== '-') acc2Run++;
      if (a1 !== '-' && a2 !== '-') {
        const r1 = famOffset + acc1Run;
        const r2 = acc2Offset + acc2Run;
        acc1ToAcc2ResMap[r1] = r2;
      }
    }
  }

  const conservationMap = famAcc2 ? loadConservationForAcc2Header(famAcc2.header) : {};

  // Sup_reps sequence for this acc1
  const supSeq = supRepMap[acc1];
  if (!supSeq) {
    console.warn(`Skipping ${familyKey}: acc1 ${acc1} not found in sup_reps`);
    return null;
  }
  const supRange = extractSeqRange(supSeq.header);
  const supOffset = supRange ? supRange.start - 1 : 0;

  // Build per sup_reps column logo and gpcrdb
  const positions = [];
  // Prepare family column cache per column to speed repeated reads
  const allFamilySeqStrings = familySeqs.map(s => s.sequence);

  let supResCount = 0;
  for (let supCol = 0; supCol < supSeq.sequence.length; supCol++) {
    const aa = supSeq.sequence[supCol];
    if (aa === '-') {
      positions[supCol] = {
        residueCounts: {},
        totalSequences: allFamilySeqStrings.length,
        informationContent: 0,
        letterHeights: {},
        gpcrdb: undefined
      };
      continue;
    }
    supResCount++;
    const realResAcc1 = supOffset + supResCount;
    const famCol = acc1ResiduePosToFamCol[realResAcc1];
    if (famCol === undefined) {
      // According to user: this should not happen; still guard
      positions[supCol] = {
        residueCounts: {},
        totalSequences: allFamilySeqStrings.length,
        informationContent: 0,
        letterHeights: {},
        gpcrdb: undefined
      };
      continue;
    }

    const columnResidues = allFamilySeqStrings.map(seq => seq[famCol] || '-');
    const ic = computeInformationContent(columnResidues);

    // GPCRdb lookup via acc1->acc2 map (preferred) or direct acc2 real residue at column
    let gpcrdb;
    if (famAcc2) {
      const acc2Real = acc1ToAcc2ResMap[realResAcc1];
      if (acc2Real !== undefined) {
        gpcrdb = conservationMap[String(acc2Real)];
      }
    }

    positions[supCol] = {
      residueCounts: ic.residueCounts,
      totalSequences: ic.totalSequences,
      informationContent: ic.informationContent,
      letterHeights: ic.letterHeights,
      gpcrdb: gpcrdb
    };
  }

  return {
    familyKey,
    acc1,
    acc2: acc2 || null,
    supHeader: supSeq.header,
    length: supSeq.sequence.length,
    positions
  };
}

function main() {
  console.log('Starting mapping generation...');
  console.log('ROOT:', ROOT);
  console.log('CUSTOM_MSA_DIR:', CUSTOM_MSA_DIR);
  console.log('OUTPUT_DIR:', OUTPUT_DIR);
  
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const supSeqs = parseFasta(readText(SUP_REPS));
  const supRepMap = {};
  for (const s of supSeqs) {
    const acc = extractAccFromHeader(s.header);
    if (acc) supRepMap[acc] = s;
  }

  const lines = readText(TRIM_INFO).replace(/\r/g, '').split('\n').filter(l => l.trim());
  const header = lines.shift();
  const outSummaries = [];
  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length < 2) continue;
    const acc1 = cols[0].trim();
    const familyKey = cols[1].trim();
    const acc2 = (cols[2] || '').trim() || null;
    if (!acc1 || !familyKey) continue;

    console.log(`Processing ${familyKey}...`);
    const result = precomputeForFamily({ familyKey, acc1, acc2, supRepMap, supRepSeqs: supSeqs });
    if (!result) continue;

    const outFile = path.join(OUTPUT_DIR, `${familyKey}.json`);
    fs.writeFileSync(outFile, JSON.stringify(result));
    outSummaries.push({ familyKey, length: result.length, acc1 });
    console.log(`Wrote ${path.relative(ROOT, outFile)} (len=${result.length})`);
  }

  // Write an index file
  const indexFile = path.join(OUTPUT_DIR, 'index.json');
  fs.writeFileSync(indexFile, JSON.stringify(outSummaries));
  console.log(`Wrote ${path.relative(ROOT, indexFile)} with ${outSummaries.length} entries`);
  console.log('✅ All mappings generated successfully!');
}

main();
