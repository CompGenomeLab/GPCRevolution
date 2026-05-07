import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
const CONSERVATION_DIR = path.join(ROOT, 'public', 'conservation_files');
const MANUAL_CURATION_FILE = path.join(ROOT, 'public', 'manual_curation.json');
const AUTO_NOTE_MARKER = '[[AUTO_IDENTICAL_SEQUENCE_NOTE]]';

function parseTsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/\r/g, '');
  const lines = raw.split('\n').filter(Boolean);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = lines[0].split('\t');
  const rows = lines.slice(1).map(line => line.split('\t'));
  return { header, rows };
}

function writeTsv(filePath, header, rows) {
  const lines = [header.join('\t'), ...rows.map(row => row.join('\t'))];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function getColumnIndex(header, columnName) {
  return header.findIndex(col => col.trim().toLowerCase() === columnName.toLowerCase());
}

function inferGeneNameFromFile(fileName) {
  return fileName.replace(/_conservation\.txt$/i, '');
}

function readConservationSummary(fileName) {
  const filePath = path.join(CONSERVATION_DIR, fileName);
  const { header, rows } = parseTsv(filePath);

  const aaIndex = getColumnIndex(header, 'aa');
  const gpcrdbIndex = getColumnIndex(header, 'gpcrdb');
  if (aaIndex === -1) return null;

  const aaChars = [];
  let nonEmptyGpcrdbCount = 0;
  for (const row of rows) {
    const aa = (row[aaIndex] ?? '').trim();
    aaChars.push(aa || '-');

    if (gpcrdbIndex !== -1) {
      const gpcrdb = (row[gpcrdbIndex] ?? '').trim();
      if (gpcrdb && gpcrdb !== '-') nonEmptyGpcrdbCount += 1;
    }
  }

  const totalPositions = aaChars.length;
  const hasGpcrdbNumbering = nonEmptyGpcrdbCount > 0;

  return {
    geneName: inferGeneNameFromFile(fileName),
    fileName,
    sequence: aaChars.join(''),
    sequenceLength: totalPositions,
    totalPositions,
    nonEmptyGpcrdbCount,
    hasGpcrdbNumbering,
  };
}

function buildSuggestedNote(groupMembers) {
  if (groupMembers.length < 2) return null;
  return `Receptors ${groupMembers.join(', ')} are identical in amino acid sequence.`;
}

function applyGpcrdbFromDonor(donorFileName, targetFileName) {
  const donorPath = path.join(CONSERVATION_DIR, donorFileName);
  const targetPath = path.join(CONSERVATION_DIR, targetFileName);

  const donor = parseTsv(donorPath);
  const target = parseTsv(targetPath);
  const donorGpcrdbIndex = getColumnIndex(donor.header, 'gpcrdb');
  const targetGpcrdbIndex = getColumnIndex(target.header, 'gpcrdb');

  if (donorGpcrdbIndex === -1 || targetGpcrdbIndex === -1) return false;
  if (donor.rows.length !== target.rows.length) return false;

  let changed = false;
  for (let i = 0; i < target.rows.length; i++) {
    const donorVal = (donor.rows[i][donorGpcrdbIndex] ?? '').trim();
    const nextVal = donorVal || '-';
    if ((target.rows[i][targetGpcrdbIndex] ?? '') !== nextVal) {
      target.rows[i][targetGpcrdbIndex] = nextVal;
      changed = true;
    }
  }

  if (changed) writeTsv(targetPath, target.header, target.rows);
  return changed;
}

function stripAutoNote(note) {
  const text = typeof note === 'string' ? note : '';
  const markerIndex = text.indexOf(AUTO_NOTE_MARKER);
  if (markerIndex === -1) return text.trim();
  return text.slice(0, markerIndex).trim();
}

function mergeAutoNote(existingNote, autoNote) {
  const userPart = stripAutoNote(existingNote);
  if (!autoNote) return userPart;
  if (!userPart) return `${AUTO_NOTE_MARKER} ${autoNote}`;
  return `${userPart}\n\n${AUTO_NOTE_MARKER} ${autoNote}`;
}

function main() {
  if (!fs.existsSync(CONSERVATION_DIR)) {
    throw new Error(`Missing directory: ${path.relative(ROOT, CONSERVATION_DIR)}`);
  }
  if (!fs.existsSync(MANUAL_CURATION_FILE)) {
    throw new Error(`Missing file: ${path.relative(ROOT, MANUAL_CURATION_FILE)}`);
  }

  const files = fs
    .readdirSync(CONSERVATION_DIR)
    .filter(name => /_conservation\.txt$/i.test(name))
    .sort((a, b) => a.localeCompare(b));

  const receptorSummaries = files
    .map(fileName => readConservationSummary(fileName))
    .filter(Boolean);

  const sequenceToMembers = new Map();
  for (const receptor of receptorSummaries) {
    const bucket = sequenceToMembers.get(receptor.sequence) ?? [];
    bucket.push(receptor);
    sequenceToMembers.set(receptor.sequence, bucket);
  }

  const grouped = Array.from(sequenceToMembers.values())
    .filter(members => members.length > 1)
    .map((members, idx) => {
      const sortedMembers = [...members].sort((a, b) => a.geneName.localeCompare(b.geneName));
      const membersWithGpcrdb = sortedMembers.filter(m => m.hasGpcrdbNumbering).map(m => m.geneName);
      const membersWithoutGpcrdb = sortedMembers.filter(m => !m.hasGpcrdbNumbering).map(m => m.geneName);

      return {
        groupId: `grp_${String(idx + 1).padStart(4, '0')}`,
        sequenceLength: sortedMembers[0]?.sequenceLength ?? 0,
        members: sortedMembers.map(m => ({
          geneName: m.geneName,
          fileName: m.fileName,
          hasGpcrdbNumbering: m.hasGpcrdbNumbering,
          nonEmptyGpcrdbCount: m.nonEmptyGpcrdbCount,
          totalPositions: m.totalPositions,
        })),
        membersWithGpcrdb,
        membersWithoutGpcrdb,
      };
    });

  const perReceptor = {};
  for (const receptor of receptorSummaries) {
    perReceptor[receptor.geneName] = {
      suggestedCurationNote: null,
    };
  }

  let gpcrdbFixedFiles = 0;
  for (const group of grouped) {
    const memberNames = group.members.map(m => m.geneName);
    const note = buildSuggestedNote(memberNames);
    const donor = group.members
      .filter(m => m.hasGpcrdbNumbering)
      .sort((a, b) => b.nonEmptyGpcrdbCount - a.nonEmptyGpcrdbCount)[0];

    if (donor) {
      for (const member of group.members) {
        if (member.geneName === donor.geneName) continue;
        if (member.hasGpcrdbNumbering) continue;
        const changed = applyGpcrdbFromDonor(donor.fileName, member.fileName);
        if (changed) gpcrdbFixedFiles += 1;
      }
    }

    for (const geneName of memberNames) {
      perReceptor[geneName] = {
        suggestedCurationNote: note,
      };
    }
  }

  const curationPayload = JSON.parse(fs.readFileSync(MANUAL_CURATION_FILE, 'utf8'));
  if (!curationPayload || !Array.isArray(curationPayload.receptors)) {
    throw new Error('Invalid public/manual_curation.json: missing receptors array.');
  }

  let updatedCount = 0;
  for (const receptorEntry of curationPayload.receptors) {
    const geneName = receptorEntry?.geneName;
    if (!geneName || typeof geneName !== 'string') continue;

    const autoNote = perReceptor[geneName]?.suggestedCurationNote ?? null;
    const before = typeof receptorEntry.curationNote === 'string' ? receptorEntry.curationNote : '';
    const after = mergeAutoNote(before, autoNote);
    if (after !== before) updatedCount += 1;
    receptorEntry.curationNote = after || null;
  }

  curationPayload.generatedAt = new Date().toISOString();
  fs.writeFileSync(MANUAL_CURATION_FILE, JSON.stringify(curationPayload, null, 2), 'utf8');
  console.log(
    `Updated ${path.relative(ROOT, MANUAL_CURATION_FILE)}: ${updatedCount} notes changed, ${grouped.length} identical-sequence groups detected, ${gpcrdbFixedFiles} conservation files had GPCRdb column auto-filled.`
  );
}

main();
