'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Sequence {
  header: string;
  sequence: string;
}

interface Props {
  /** Names without extension, located under folder (e.g., /custom_msa) */
  customFastaNames: string[];
  /** Public folder for the custom fastas (e.g., '/custom_msa') */
  customFolder: string;
}

const CLASS_ALIGNMENTS: { label: string; filename: string }[] = [
  { label: 'Class A (humans)', filename: 'classA_humans_MSA' },
  { label: 'Class B1 (humans)', filename: 'classB1_humans_MSA' },
  { label: 'Class B2 (humans)', filename: 'classB2_humans_MSA' },
  { label: 'Class C (humans)', filename: 'classC_humans_MSA' },
  { label: 'Class F (humans)', filename: 'classF_humans_MSA' },
  { label: 'Class T (humans)', filename: 'classT_humans_MSA' },
  { label: 'Olfactory (humans)', filename: 'classOlfactory_humans_MSA' },
];

// Map class alignment filename → representative gene symbol (used to derive GPCRdb mapping via conservation file)
const FILENAME_TO_REP: Record<string, string> = {
  classA_humans_MSA: 'HRH2',
  classB1_humans_MSA: 'PTH1R',
  classB2_humans_MSA: 'AGRL3',
  classC_humans_MSA: 'CASR',
  classF_humans_MSA: 'FZD7',
  classT_humans_MSA: 'T2R39',
  classOlfactory_humans_MSA: 'O52I2',
};

function parseFasta(text: string): Sequence[] {
  const lines = text.split(/\r?\n/);
  const seqs: Sequence[] = [];
  let header = '';
  let seq = '';
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('>')) {
      if (header) {
        seqs.push({ header, sequence: seq });
      }
      header = line.substring(1).trim();
      seq = '';
    } else {
      seq += line.trim().toUpperCase().replace(/[^A-Z\-]/g, '');
    }
  }
  if (header) seqs.push({ header, sequence: seq });
  return seqs;
}


const ConsensusEmitter: React.FC<Props> = ({ customFastaNames, customFolder }) => {
  const [selectedCustom, setSelectedCustom] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState<string[]>([]);
  const [customCounts, setCustomCounts] = useState<Record<string, number>>({});
  const [classCounts, setClassCounts] = useState<Record<string, number>>({});
  const [isGenerating, setIsGenerating] = useState(false);

  const hasSelection = useMemo(() => selectedCustom.length + selectedClass.length > 0, [selectedCustom, selectedClass]);

  const toggleCustom = (name: string) => {
    setSelectedCustom(prev => {
      const exists = prev.includes(name);
      const next = exists ? prev.filter(n => n !== name) : [...prev, name];
      if (!exists) {
        setCustomCounts(cc => (cc[name] ? cc : { ...cc, [name]: 1 }));
      }
      return next;
    });
  };

  const toggleClass = (filename: string) => {
    setSelectedClass(prev => {
      const exists = prev.includes(filename);
      const next = exists ? prev.filter(n => n !== filename) : [...prev, filename];
      if (!exists) {
        setClassCounts(cc => (cc[filename] ? cc : { ...cc, [filename]: 1 }));
      }
      return next;
    });
  };

  const setCustomCount = (name: string, value: number) => {
    const v = Math.max(1, Math.floor(value || 1));
    setCustomCounts(prev => ({ ...prev, [name]: v }));
  };

  const setClassCount = (filename: string, value: number) => {
    const v = Math.max(1, Math.floor(value || 1));
    setClassCounts(prev => ({ ...prev, [filename]: v }));
  };

  const downloadText = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // (unused helper removed)

  // (Removed GPCRdb-based union logic; emission is strictly cropped by custom-MSA-derived positions.)

  const handleGenerate = useCallback(async () => {
    if (!hasSelection) return;
    setIsGenerating(true);
    try {
      const fastaChunks: string[] = [];

      // Helper: load FASTA
      const loadFasta = async (path: string) => parseFasta(await (await fetch(path)).text());

      // 1) Build cropped display positions from ALL custom MSAs provided (union of columns with any AA)
      const posSet = new Set<number>();
      const customSequencesByName: Record<string, Sequence[]> = {};
      for (const name of customFastaNames) {
        try {
          const seqs = await loadFasta(`${customFolder}/${name}.fasta`);
          customSequencesByName[name] = seqs;
          const maxLen = seqs.reduce((m, s) => Math.max(m, s.sequence.length), 0);
          for (let col = 0; col < maxLen; col++) {
            let hasAA = false;
            for (const s of seqs) {
              const c = col < s.sequence.length ? s.sequence[col] : '-';
              if (c && c !== '-') { hasAA = true; break; }
            }
            if (hasAA) posSet.add(col);
          }
        } catch {
          // skip failed custom
        }
      }
      // Convert to a continuous range [minCol, maxCol]
      let displayPositions: number[] = [];
      if (posSet.size > 0) {
        const sorted = Array.from(posSet).sort((a, b) => a - b);
        const minCol = sorted[0];
        const maxCol = sorted[sorted.length - 1];
        displayPositions = Array.from({ length: maxCol - minCol + 1 }, (_, i) => minCol + i);
      }

      // Process custom MSAs
      for (const name of selectedCustom) {
        try {
          const sequences = customSequencesByName[name] || await loadFasta(`${customFolder}/${name}.fasta`);
          const n = customCounts[name] || 1;
          const results: string[] = new Array(n).fill('');
          for (const col of displayPositions) {
            const counts: Record<string, number> = {};
            for (const s of sequences) {
              const c = col < s.sequence.length ? s.sequence[col]?.toUpperCase() : '-';
              if (c && c !== '-') counts[c] = (counts[c] || 0) + 1;
            }
            const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            if (entries.length === 0) {
              for (let k = 0; k < n; k++) results[k] += '-';
            } else {
              const ranked: string[] = [];
              for (let i = 0; i < Math.min(entries.length, n); i++) ranked.push(entries[i][0]);
              while (ranked.length < n) ranked.push(entries[0][0]);
              for (let k = 0; k < n; k++) results[k] += ranked[k];
            }
          }
          results.forEach((seq, idx) => {
            fastaChunks.push(`>${name}|consensus_rank:${idx + 1}/${n}|source:custom_msa|aligned:custom\n${seq}`);
          });
        } catch (err) {
          console.error('Error processing custom MSA', name, err);
        }
      }

      // Process class MSAs (from /alignments)
      for (const filename of selectedClass) {
        try {
          const res = await fetch(`/alignments/${filename}.fasta`);
          if (!res.ok) {
            console.warn(`Failed to load ${filename}.fasta: ${res.status}`);
            continue;
          }
          const text = await res.text();
          const sequences = parseFasta(text);
          const n = classCounts[filename] || 1;
          // Map custom display positions -> residue numbers in human_refs rep -> class family columns
          let humanRefs: Sequence[] = [];
          try { humanRefs = await loadFasta(`/custom_msa/human_refs.fasta`); } catch {}
          const rep = FILENAME_TO_REP[filename];
          const humanRep = rep ? (humanRefs.find(s => s.header.includes(`${rep}_HUMAN`)) || humanRefs.find(s => s.header.toUpperCase().includes(rep.toUpperCase()))) : undefined;
          const familyRep = rep ? (sequences.find(s => s.header.includes(`${rep}_HUMAN`)) || sequences.find(s => s.header.toUpperCase().includes(rep.toUpperCase()))) : undefined;

          const results: string[] = new Array(n).fill('');
          // Precompute running residue counts for humanRep
          let humanRunning: number[] = [];
          if (humanRep) {
            humanRunning = new Array(humanRep.sequence.length).fill(0);
            let cnt = 0;
            for (let i = 0; i < humanRep.sequence.length; i++) { if (humanRep.sequence[i] !== '-') cnt++; humanRunning[i] = cnt; }
          }
          for (const disp of displayPositions) {
            // if no valid mapping, emit '-'
            if (!humanRep || !familyRep || disp >= humanRep.sequence.length || humanRep.sequence[disp] === '-') {
              for (let k = 0; k < n; k++) results[k] += '-';
              continue;
            }
            const residueNumber = humanRunning[disp];
            // find column in familyRep with same running residue count
            let famCol = -1; let cnt = 0;
            for (let i = 0; i < familyRep.sequence.length; i++) { if (familyRep.sequence[i] !== '-') { cnt++; if (cnt === residueNumber) { famCol = i; break; } } }
            if (famCol === -1) { for (let k = 0; k < n; k++) results[k] += '-'; continue; }

            const counts: Record<string, number> = {};
            for (const s of sequences) {
              const c = famCol < s.sequence.length ? s.sequence[famCol]?.toUpperCase() : '-';
              if (c && c !== '-') counts[c] = (counts[c] || 0) + 1;
            }
            const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            if (entries.length === 0) {
              for (let k = 0; k < n; k++) results[k] += '-';
            } else {
              const ranked: string[] = [];
              for (let i = 0; i < Math.min(entries.length, n); i++) ranked.push(entries[i][0]);
              while (ranked.length < n) ranked.push(entries[0][0]);
              for (let k = 0; k < n; k++) results[k] += ranked[k];
            }
          }
          results.forEach((seq, idx) => {
            fastaChunks.push(`>${filename}|consensus_rank:${idx + 1}/${n}|source:alignments|aligned:custom\n${seq}`);
          });
        } catch (err) {
          console.error('Error processing class MSA', filename, err);
        }
      }

      if (fastaChunks.length === 0) return;
      const combined = fastaChunks.join('\n');
      downloadText(combined, `consensus_per_alignment.fasta`);
    } finally {
      setIsGenerating(false);
    }
  }, [hasSelection, selectedCustom, selectedClass, customFolder, customCounts, classCounts, customFastaNames]);

  const selectAllCustom = () => {
    setSelectedCustom([...customFastaNames]);
    setCustomCounts(prev => {
      const next = { ...prev };
      customFastaNames.forEach(name => { if (!next[name]) next[name] = 1; });
      return next;
    });
  };
  const clearAllCustom = () => setSelectedCustom([]);
  const selectAllClass = () => {
    const all = CLASS_ALIGNMENTS.map(a => a.filename);
    setSelectedClass(all);
    setClassCounts(prev => {
      const next = { ...prev };
      all.forEach(fn => { if (!next[fn]) next[fn] = 1; });
      return next;
    });
  };
  const clearAllClass = () => setSelectedClass([]);

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Consensus Emitter</CardTitle>
        <CardDescription>
          Emit top-N consensus sequences per selected alignment and download as a combined FASTA.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Custom MSAs */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-sm font-semibold">Custom MSAs ({customFastaNames.length})</h3>
              <Button variant="outline" size="sm" onClick={selectAllCustom}>Select All</Button>
              <Button variant="outline" size="sm" onClick={clearAllCustom}>Clear</Button>
            </div>
            <div className="border rounded-md p-3 max-h-56 overflow-y-auto">
              {customFastaNames.map(name => (
                <div key={name} className="flex items-center gap-2 py-0.5">
                  <input
                    type="checkbox"
                    checked={selectedCustom.includes(name)}
                    onChange={() => toggleCustom(name)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm font-mono flex-1 truncate" title={name}>{name}</span>
                  <input
                    type="number"
                    min={1}
                    value={customCounts[name] || 1}
                    onChange={(e) => setCustomCount(name, Number(e.target.value))}
                    disabled={!selectedCustom.includes(name)}
                    className="w-16 border rounded px-2 py-0.5 text-sm"
                    title="Top N for this alignment"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Class MSAs */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-sm font-semibold">Class MSAs</h3>
              <Button variant="outline" size="sm" onClick={selectAllClass}>Select All</Button>
              <Button variant="outline" size="sm" onClick={clearAllClass}>Clear</Button>
            </div>
            <div className="border rounded-md p-3 max-h-56 overflow-y-auto">
              {CLASS_ALIGNMENTS.map(({ label, filename }) => (
                <div key={filename} className="flex items-center gap-2 py-0.5">
                  <input
                    type="checkbox"
                    checked={selectedClass.includes(filename)}
                    onChange={() => toggleClass(filename)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm flex-1 truncate" title={`${label} (${filename}.fasta)`}>{label} <span className="text-xs text-gray-500">({filename}.fasta)</span></span>
                  <input
                    type="number"
                    min={1}
                    value={classCounts[filename] || 1}
                    onChange={(e) => setClassCount(filename, Number(e.target.value))}
                    disabled={!selectedClass.includes(filename)}
                    className="w-16 border rounded px-2 py-0.5 text-sm"
                    title="Top N for this alignment"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-6 flex items-center gap-4 flex-wrap">
          <Button onClick={handleGenerate} disabled={!hasSelection || isGenerating}>
            {isGenerating ? 'Generating…' : 'Generate FASTA'}
          </Button>
          {!hasSelection && (
            <span className="text-xs text-gray-500">Select at least one alignment</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ConsensusEmitter;


