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

    // Determine alignment length based on the first sequence (reference/human)
    const reference = initialData[0]?.sequence || '';
    const maxLength = Math.max(reference.length, ...initialData.map(item => item.sequence.length));

    // Keep columns where the first sequence has an amino acid (non-gap)
    const standardAA = 'ACDEFGHIKLMNPQRSTVWY';
    const keepColumn: boolean[] = new Array(maxLength).fill(false);
    for (let i = 0; i < maxLength; i++) {
      const refChar = i < reference.length ? reference[i].toUpperCase() : '-';
      keepColumn[i] = !!refChar && standardAA.includes(refChar);
    }

    // Build cleaned sequences by keeping only the selected columns
    const newProcessedData: ProteinData[] = initialData.map(item => {
      const seq = item.sequence;
      let newSequence = '';
      for (let i = 0; i < maxLength; i++) {
        if (keepColumn[i]) {
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
