import { useState, useCallback } from 'react';

interface Sequence {
  id: string;
  header: string;
  sequence: string;
}

interface Receptor extends Sequence {
  geneName: string;
}

interface OrthologSequence extends Sequence {
  id: string;
}

interface FastaSequences {
  [geneName: string]: {
    header: string;
    sequence: string;
  };
}

export function useFastaSequences() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [filteredSequences, setFilteredSequences] = useState<FastaSequences>({});

  const trimGapsInAllSequences = useCallback((receptors: Receptor[]) => {
    if (receptors.length === 0) return receptors;

    const sequenceLength = receptors[0].sequence.length;

    for (const receptor of receptors) {
      if (receptor.sequence.length !== sequenceLength) {
        throw new Error(`Sequence length mismatch for receptor ${receptor.geneName}.`);
      }
    }

    const positionsToKeep: number[] = [];

    for (let i = 0; i < sequenceLength; i++) {
      const allGaps = receptors.every(receptor => receptor.sequence[i] === '-');
      if (!allGaps) {
        positionsToKeep.push(i);
      }
    }

    const trimmedReceptors = receptors.map(receptor => {
      const trimmedSeq = positionsToKeep.map(pos => receptor.sequence[pos]).join('');
      return { ...receptor, sequence: trimmedSeq };
    });

    return trimmedReceptors;
  }, []);

  const adjustOrthologSequences = useCallback(
    (mainTrimmedSeq: string, orthologSequences: OrthologSequence[]) => {
      return orthologSequences.map(ortholog => {
        let adjustedSeq = '';
        let orthologIndex = 0;

        for (let i = 0; i < mainTrimmedSeq.length; i++) {
          if (mainTrimmedSeq[i] === '-') {
            adjustedSeq += '-';
          } else {
            adjustedSeq += ortholog.sequence[orthologIndex] || '-';
            orthologIndex++;
          }
        }

        return { ...ortholog, sequence: adjustedSeq };
      });
    },
    []
  );

  const generateFastaString = useCallback((sequences: Sequence[]) => {
    return sequences.map(seq => `>${seq.header}\n${seq.sequence}`).join('\n');
  }, []);

  const parseFastaContent = useCallback((fastaData: string) => {
    const parsedSequences: Sequence[] = [];
    let currentId = '';
    let currentHeader = '';
    let currentSeq = '';

    fastaData.split('\n').forEach(line => {
      if (line.startsWith('>')) {
        if (currentId) {
          parsedSequences.push({ id: currentId, header: currentHeader, sequence: currentSeq });
        }
        currentHeader = line.slice(1).trim();
        currentId = currentHeader.split(/\s+/)[0];
        currentSeq = '';
      } else {
        const cleanLine = line
          .trim()
          .toUpperCase()
          .replace(/[^A-Z\-]/g, '');
        currentSeq += cleanLine;
      }
    });

    if (currentId) {
      parsedSequences.push({ id: currentId, header: currentHeader, sequence: currentSeq });
    }

    setSequences(parsedSequences);
    return parsedSequences;
  }, []);

  const filterFastaByGenes = useCallback((fastaData: string, receptorList: string[]) => {
    const filtered: FastaSequences = {};
    let currentGeneName: string | null = null;
    let fullHeader = '';

    fastaData.split('\n').forEach(line => {
      if (line.startsWith('>')) {
        fullHeader = line.slice(1).trim();
        const parts = fullHeader.split('|');
        if (parts.length >= 3) {
          const genePart = parts[2].split('_')[0];
          if (receptorList.includes(genePart)) {
            currentGeneName = genePart;
            filtered[currentGeneName] = {
              header: fullHeader.split('/')[0],
              sequence: '',
            };
          } else {
            currentGeneName = null;
          }
        } else {
          console.warn(`Unexpected FASTA header format: ${line}`);
          currentGeneName = null;
        }
      } else if (currentGeneName) {
        const cleanLine = line
          .trim()
          .toUpperCase()
          .replace(/[^A-Z\-]/g, '');
        filtered[currentGeneName].sequence += cleanLine;
      }
    });

    setFilteredSequences(filtered);
    return filtered;
  }, []);

  return {
    sequences,
    filteredSequences,
    trimGapsInAllSequences,
    adjustOrthologSequences,
    generateFastaString,
    parseFastaContent,
    filterFastaByGenes,
  };
}
