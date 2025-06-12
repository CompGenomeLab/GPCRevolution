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

    const firstSequence = initialData[0].sequence;
    const dashIndices: number[] = [];

    for (let i = 0; i < firstSequence.length; i++) {
      if (firstSequence[i] === '-') {
        dashIndices.push(i);
      }
    }

    const newProcessedData: ProteinData[] = initialData.map(item => {
      const currentSequence = item.sequence;
      let newSequence = '';

      for (let i = 0; i < currentSequence.length; i++) {
        if (!dashIndices.includes(i)) {
          newSequence += currentSequence[i];
        }
      }
      return {
        ...item,
        sequence: newSequence,
      };
    });

    setCleanedData(newProcessedData);
  }, [initialData]);

  return cleanedData;
}

export default useCleanedSequences;
