import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

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

function blosum80Score(aa1: string, aa2: string): number {
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

async function readFastaFile(fastaFilePath: string): Promise<Record<string, string>> {
  const filePath = path.join(process.cwd(), 'public', fastaFilePath);
  const fastaData = await fs.readFile(filePath, 'utf-8');
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

async function readConservationData(
  conservationFilePath: string
): Promise<Record<string, { conservation: number; aa: string }>> {
  const filePath = path.join(process.cwd(), 'public', conservationFilePath);
  const data = await fs.readFile(filePath, 'utf-8');
  const conservationData: Record<string, { conservation: number; aa: string }> = {};

  data.split('\n').forEach(line => {
    const [resNum, conservation, aa] = line.split('\t');
    if (resNum && conservation && aa) {
      conservationData[resNum.trim()] = {
        conservation: parseFloat(conservation.trim()),
        aa: aa.trim(),
      };
    }
  });

  return conservationData;
}

function mapResidues(seq1: string, seq2: string): Array<{ resNum1: string; resNum2: string }> {
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

function mapAllData(
  gene1Data: Record<string, { conservation: number; aa: string }>,
  gene2Data: Record<string, { conservation: number; aa: string }>,
  seq1: string,
  seq2: string
) {
  const mappedResidues = mapResidues(seq1, seq2);
  const resNums1: string[] = [];
  const resNums2: string[] = [];
  const percList1: number[] = [];
  const percList2: number[] = [];
  const aaList1: string[] = [];
  const aaList2: string[] = [];

  mappedResidues.forEach(({ resNum1, resNum2 }) => {
    let perc1 = 0;
    let perc2 = 0;
    let aa1 = '-';
    let aa2 = '-';

    if (resNum1 !== 'gap') {
      const data1 = gene1Data[resNum1];
      if (data1) {
        perc1 = data1.conservation;
        aa1 = data1.aa;
      }
    }
    if (resNum2 !== 'gap') {
      const data2 = gene2Data[resNum2];
      if (data2) {
        perc2 = data2.conservation;
        aa2 = data2.aa;
      }
    }

    resNums1.push(resNum1);
    resNums2.push(resNum2);
    percList1.push(perc1);
    percList2.push(perc2);
    aaList1.push(aa1);
    aaList2.push(aa2);
  });

  return { resNums1, resNums2, percList1, percList2, aaList1, aaList2 };
}

function categorizeResidues(
  resNums1: string[],
  resNums2: string[],
  percList1: number[],
  percList2: number[],
  aaList1: string[],
  aaList2: string[],
  threshold: number
) {
  const categorizedResidues: Array<{
    category: string;
    resNum1: string;
    aa1: string;
    perc1: number;
    resNum2: string;
    aa2: string;
    perc2: number;
  }> = [];

  for (let i = 0; i < percList1.length; i++) {
    const isGap1 = resNums1[i] === 'gap';
    const isGap2 = resNums2[i] === 'gap';

    if (isGap1 && isGap2) continue;

    if (!isGap1 && !isGap2) {
      const conserved1 = percList1[i] >= threshold;
      const conserved2 = percList2[i] >= threshold;

      if (conserved1 && conserved2) {
        const similarity = blosum80Score(aaList1[i], aaList2[i]);
        if (similarity > 1) {
          categorizedResidues.push({
            category: 'common',
            resNum1: resNums1[i],
            aa1: aaList1[i],
            perc1: percList1[i],
            resNum2: resNums2[i],
            aa2: aaList2[i],
            perc2: percList2[i],
          });
        } else {
          categorizedResidues.push({
            category: 'specific_both',
            resNum1: resNums1[i],
            aa1: aaList1[i],
            perc1: percList1[i],
            resNum2: resNums2[i],
            aa2: aaList2[i],
            perc2: percList2[i],
          });
        }
      } else if (conserved1 && !conserved2) {
        categorizedResidues.push({
          category: 'specific1',
          resNum1: resNums1[i],
          aa1: aaList1[i],
          perc1: percList1[i],
          resNum2: resNums2[i],
          aa2: aaList2[i],
          perc2: percList2[i],
        });
      } else if (!conserved1 && conserved2) {
        categorizedResidues.push({
          category: 'specific2',
          resNum1: resNums1[i],
          aa1: aaList1[i],
          perc1: percList1[i],
          resNum2: resNums2[i],
          aa2: aaList2[i],
          perc2: percList2[i],
        });
      }
    } else if (!isGap1 && isGap2) {
      if (percList1[i] >= threshold) {
        categorizedResidues.push({
          category: 'specific1',
          resNum1: resNums1[i],
          aa1: aaList1[i],
          perc1: percList1[i],
          resNum2: 'gap',
          aa2: '-',
          perc2: 0,
        });
      }
    } else if (isGap1 && !isGap2) {
      if (percList2[i] >= threshold) {
        categorizedResidues.push({
          category: 'specific2',
          resNum1: 'gap',
          aa1: '-',
          perc1: 0,
          resNum2: resNums2[i],
          aa2: aaList2[i],
          perc2: percList2[i],
        });
      }
    }
  }

  return categorizedResidues;
}

interface Receptor {
  geneName: string;
  class: string;
  numOrthologs: number;
  lca: string;
  gpcrdbId: string;
  conservationFile: string;
}

export async function POST(request: Request) {
  try {
    const { gene1, gene2, threshold } = await request.json();

    if (!gene1 || !gene2) {
      return NextResponse.json(
        { error: 'Both gene1 and gene2 parameters are required' },
        { status: 400 }
      );
    }

    const receptors = JSON.parse(
      await fs.readFile(path.join(process.cwd(), 'src/data/receptors.json'), 'utf-8')
    ) as Receptor[];

    const receptor1 = receptors.find(r => r.geneName.toLowerCase() === gene1.toLowerCase());
    const receptor2 = receptors.find(r => r.geneName.toLowerCase() === gene2.toLowerCase());

    if (!receptor1 || !receptor2) {
      return NextResponse.json(
        { error: 'One or both receptors not found in the database' },
        { status: 404 }
      );
    }

    if (receptor1.class !== receptor2.class) {
      return NextResponse.json(
        { error: 'Receptors must belong to the same class' },
        { status: 400 }
      );
    }

    const fastaFilePath = `/alignments/class${receptor1.class}_humans_MSA.fasta`;
    const sequences = await readFastaFile(fastaFilePath);

    const seq1 = sequences[receptor1.geneName];
    const seq2 = sequences[receptor2.geneName];

    if (!seq1 || !seq2) {
      return NextResponse.json(
        { error: 'Could not find sequences for one or both receptors' },
        { status: 404 }
      );
    }

    const gene1Data = await readConservationData(receptor1.conservationFile);
    const gene2Data = await readConservationData(receptor2.conservationFile);

    const { resNums1, resNums2, percList1, percList2, aaList1, aaList2 } = mapAllData(
      gene1Data,
      gene2Data,
      seq1,
      seq2
    );

    const categorizedResidues = categorizeResidues(
      resNums1,
      resNums2,
      percList1,
      percList2,
      aaList1,
      aaList2,
      threshold || 0.8
    );

    return NextResponse.json({
      gene1: receptor1.geneName,
      gene2: receptor2.geneName,
      categorizedResidues,
    });
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
