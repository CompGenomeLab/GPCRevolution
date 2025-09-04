import { useState, useEffect } from 'react';

interface ProteinData {
  header: string;
  sequence: string;
}

function useCleanedSequences(initialData: ProteinData[]): ProteinData[] {
  const [cleanedData, setCleanedData] = useState<ProteinData[]>([]);

  useEffect(() => {
    if (!initialData || initialData.length === 0) {
      setCleanedData([]);
      return;
    }

    // Determine the maximum alignment length across sequences
    const maxLength = initialData.reduce((max, item) => Math.max(max, item.sequence.length), 0);

    // Identify columns that are gap-only across ALL sequences
    const gapOnlyIndices: boolean[] = new Array(maxLength).fill(false);
    for (let i = 0; i < maxLength; i++) {
      let allGapsAtColumn = true;
      for (let s = 0; s < initialData.length; s++) {
        const seq = initialData[s].sequence;
        const char = i < seq.length ? seq[i] : '-';
        if (char !== '-') {
          allGapsAtColumn = false;
          break;
        }
      }
      gapOnlyIndices[i] = allGapsAtColumn;
    }

    // Build cleaned sequences by removing gap-only columns
    const newProcessedData: ProteinData[] = initialData.map(item => {
      const seq = item.sequence;
      let newSequence = '';
      for (let i = 0; i < maxLength; i++) {
        if (!gapOnlyIndices[i]) {
          newSequence += i < seq.length ? seq[i] : '-';
        }
      }
      return { ...item, sequence: newSequence };
    });

    setCleanedData(newProcessedData);
  }, [initialData]);

  return cleanedData;
}

export default useCleanedSequences;
