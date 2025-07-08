// Data processing utilities for receptor comparison

interface ConservationData {
  conservation: number;
  conservedAA: string;
  aa: string;
  region: string;
  gpcrdb: string;
}

interface CategorizedResidue {
  category: string;
  resNum1: string;
  humanAa1: string;
  conservedAa1: string;
  perc1: number;
  resNum2: string;
  humanAa2: string;
  conservedAa2: string;
  perc2: number;
  region1: string;
  region2: string;
  gpcrdb1: string;
  gpcrdb2: string;
}

// High-scoring amino acid pairs for BLOSUM80 scoring
const highScorePairs = new Set([
  'R-K',
  'N-B',
  'D-B',
  'Q-E',
  'Q-Z',
  'E-Z',
  'H-Y',
  'I-V',
  'I-J',
  'L-M',
  'L-J',
  'M-J',
  'F-Y',
  'W-Y',
  'V-J',
]);

export function blosum80Score(aa1: string, aa2: string): number {
  if (!aa1 || !aa2 || aa1 === '-' || aa2 === '-') {
    return -1;
  }
  const processedAa1 = aa1.includes('/') ? aa1.split('/')[0] : aa1;
  const processedAa2 = aa2.includes('/') ? aa2.split('/')[0] : aa2;
  if (processedAa1 === processedAa2) return 3;
  const pair = `${processedAa1}-${processedAa2}`;
  const reversePair = `${processedAa2}-${processedAa1}`;
  if (highScorePairs.has(pair) || highScorePairs.has(reversePair)) return 2;
  return 1;
}

export async function readFastaFile(fastaFilePath: string): Promise<Record<string, string>> {
  const response = await fetch(fastaFilePath);
  if (!response.ok) {
    throw new Error(`Failed to fetch FASTA file: ${response.status}`);
  }
  
  const fastaData = await response.text();
  const sequences: Record<string, string> = {};
  let currentHeader: string | null = null;

  fastaData.split('\n').forEach(line => {
    if (line.startsWith('>')) {
      const parts = line.slice(1).trim().split('|');
      if (parts.length >= 3) {
        const genePart = parts[2].split('_')[0];
        currentHeader = genePart;
        sequences[currentHeader] = '';
      } else {
        console.warn(`Unexpected FASTA header format: ${line}`);
        currentHeader = null;
      }
    } else if (currentHeader) {
      sequences[currentHeader] += line.trim();
    }
  });

  return sequences;
}

export async function readConservationData(
  conservationFilePath: string
): Promise<Record<string, ConservationData>> {
  const response = await fetch(conservationFilePath);
  if (!response.ok) {
    throw new Error(`Failed to fetch conservation file: ${response.status}`);
  }
  
  const data = await response.text();
  const conservationData: Record<string, ConservationData> = {};

  data.split('\n').forEach(line => {
    const parts = line.split('\t');
    if (parts[0] && parts[0].trim().toLowerCase() === 'residue_number') return;

    if (parts.length >= 6) {
      const resNum = parts[0].trim();
      conservationData[resNum] = {
        conservation: parseFloat(parts[1].trim()),
        conservedAA: parts[2].trim(),
        aa: parts[3].trim(),
        region: parts[4].trim(),
        gpcrdb: parts[5].trim(),
      };
    }
  });

  return conservationData;
}

export function mapResidues(seq1: string, seq2: string): Array<{ resNum1: string; resNum2: string }> {
  const mappedResidues: Array<{ resNum1: string; resNum2: string }> = [];
  let resNum1 = 0;
  let resNum2 = 0;

  for (let i = 0; i < seq1.length; i++) {
    const aa1 = seq1[i];
    const aa2 = seq2[i];
    let currentResNum1 = 'gap';
    let currentResNum2 = 'gap';

    if (aa1 !== '-') {
      resNum1 += 1;
      currentResNum1 = resNum1.toString();
    }
    if (aa2 !== '-') {
      resNum2 += 1;
      currentResNum2 = resNum2.toString();
    }

    if (aa1 !== '-' || aa2 !== '-') {
      mappedResidues.push({
        resNum1: currentResNum1,
        resNum2: currentResNum2,
      });
    }
  }

  return mappedResidues;
}

export function mapAllData(
  gene1Data: Record<string, ConservationData>,
  gene2Data: Record<string, ConservationData>,
  seq1: string,
  seq2: string
) {
  const mappedResidues = mapResidues(seq1, seq2);
  const resNums1: string[] = [];
  const resNums2: string[] = [];
  const percList1: number[] = [];
  const percList2: number[] = [];
  const humanAaList1: string[] = [];
  const humanAaList2: string[] = [];
  const conservedAaList1: string[] = [];
  const conservedAaList2: string[] = [];
  const regionList1: string[] = [];
  const regionList2: string[] = [];
  const gpcrdbList1: string[] = [];
  const gpcrdbList2: string[] = [];

  mappedResidues.forEach(({ resNum1, resNum2 }) => {
    let perc1 = 0;
    let perc2 = 0;
    let humanAa1 = '-';
    let humanAa2 = '-';
    let conservedAa1 = '-';
    let conservedAa2 = '-';
    let region1 = '-';
    let region2 = '-';
    let gpcrdb1 = '-';
    let gpcrdb2 = '-';

    if (resNum1 !== 'gap') {
      const data1 = gene1Data[resNum1];
      if (data1) {
        perc1 = data1.conservation;
        humanAa1 = data1.aa;
        conservedAa1 = data1.conservedAA;
        region1 = data1.region;
        gpcrdb1 = data1.gpcrdb;
      }
    }
    if (resNum2 !== 'gap') {
      const data2 = gene2Data[resNum2];
      if (data2) {
        perc2 = data2.conservation;
        humanAa2 = data2.aa;
        conservedAa2 = data2.conservedAA;
        region2 = data2.region;
        gpcrdb2 = data2.gpcrdb;
      }
    }

    resNums1.push(resNum1);
    resNums2.push(resNum2);
    percList1.push(perc1);
    percList2.push(perc2);
    humanAaList1.push(humanAa1);
    humanAaList2.push(humanAa2);
    conservedAaList1.push(conservedAa1);
    conservedAaList2.push(conservedAa2);
    regionList1.push(region1);
    regionList2.push(region2);
    gpcrdbList1.push(gpcrdb1);
    gpcrdbList2.push(gpcrdb2);
  });

  return { 
    resNums1, 
    resNums2, 
    percList1, 
    percList2, 
    humanAaList1, 
    humanAaList2, 
    conservedAaList1, 
    conservedAaList2, 
    regionList1, 
    regionList2, 
    gpcrdbList1, 
    gpcrdbList2 
  };
}

export function categorizeResidues(
  resNums1: string[],
  resNums2: string[],
  percList1: number[],
  percList2: number[],
  humanAaList1: string[],
  humanAaList2: string[],
  conservedAaList1: string[],
  conservedAaList2: string[],
  regionList1: string[],
  regionList2: string[],
  gpcrdbList1: string[],
  gpcrdbList2: string[],
  threshold: number
): CategorizedResidue[] {
  const categorizedResidues: CategorizedResidue[] = [];

  for (let i = 0; i < percList1.length; i++) {
    const isGap1 = resNums1[i] === 'gap';
    const isGap2 = resNums2[i] === 'gap';

    if (isGap1 && isGap2) continue;

    if (!isGap1 && !isGap2) {
      const conserved1 = percList1[i] >= threshold;
      const conserved2 = percList2[i] >= threshold;

      if (conserved1 && conserved2) {
        const similarity = blosum80Score(conservedAaList1[i], conservedAaList2[i]);
        if (similarity > 1) {
          categorizedResidues.push({
            category: 'common',
            resNum1: resNums1[i],
            humanAa1: humanAaList1[i],
            conservedAa1: conservedAaList1[i],
            perc1: percList1[i],
            resNum2: resNums2[i],
            humanAa2: humanAaList2[i],
            conservedAa2: conservedAaList2[i],
            perc2: percList2[i],
            region1: regionList1[i],
            region2: regionList2[i],
            gpcrdb1: gpcrdbList1[i],
            gpcrdb2: gpcrdbList2[i],
          });
        } else {
          categorizedResidues.push({
            category: 'specific_both',
            resNum1: resNums1[i],
            humanAa1: humanAaList1[i],
            conservedAa1: conservedAaList1[i],
            perc1: percList1[i],
            resNum2: resNums2[i],
            humanAa2: humanAaList2[i],
            conservedAa2: conservedAaList2[i],
            perc2: percList2[i],
            region1: regionList1[i],
            region2: regionList2[i],
            gpcrdb1: gpcrdbList1[i],
            gpcrdb2: gpcrdbList2[i],
          });
        }
      } else if (conserved1 && !conserved2) {
        categorizedResidues.push({
          category: 'specific1',
          resNum1: resNums1[i],
          humanAa1: humanAaList1[i],
          conservedAa1: conservedAaList1[i],
          perc1: percList1[i],
          resNum2: resNums2[i],
          humanAa2: humanAaList2[i],
          conservedAa2: conservedAaList2[i],
          perc2: percList2[i],
          region1: regionList1[i],
          region2: regionList2[i],
          gpcrdb1: gpcrdbList1[i],
          gpcrdb2: gpcrdbList2[i],
        });
      } else if (!conserved1 && conserved2) {
        categorizedResidues.push({
          category: 'specific2',
          resNum1: resNums1[i],
          humanAa1: humanAaList1[i],
          conservedAa1: conservedAaList1[i],
          perc1: percList1[i],
          resNum2: resNums2[i],
          humanAa2: humanAaList2[i],
          conservedAa2: conservedAaList2[i],
          perc2: percList2[i],
          region1: regionList1[i],
          region2: regionList2[i],
          gpcrdb1: gpcrdbList1[i],
          gpcrdb2: gpcrdbList2[i],
        });
      }
    } else if (!isGap1 && isGap2) {
      if (percList1[i] >= threshold) {
        categorizedResidues.push({
          category: 'specific1',
          resNum1: resNums1[i],
          humanAa1: humanAaList1[i],
          conservedAa1: conservedAaList1[i],
          perc1: percList1[i],
          resNum2: 'gap',
          humanAa2: '-',
          conservedAa2: '-',
          perc2: 0,
          region1: regionList1[i],
          region2: '-',
          gpcrdb1: gpcrdbList1[i],
          gpcrdb2: '-',
        });
      }
    } else if (isGap1 && !isGap2) {
      if (percList2[i] >= threshold) {
        categorizedResidues.push({
          category: 'specific2',
          resNum1: 'gap',
          humanAa1: '-',
          conservedAa1: '-',
          perc1: 0,
          resNum2: resNums2[i],
          humanAa2: humanAaList2[i],
          conservedAa2: conservedAaList2[i],
          perc2: percList2[i],
          region1: '-',
          region2: regionList2[i],
          gpcrdb1: '-',
          gpcrdb2: gpcrdbList2[i],
        });
      }
    }
  }

  return categorizedResidues;
} 