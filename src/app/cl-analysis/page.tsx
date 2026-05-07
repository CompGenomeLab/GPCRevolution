'use client';

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';

const CustomMultiReceptorLogo = dynamic(
  () => import('@/components/CustomMultiReceptorLogo'),
  { ssr: false }
);

interface ResidueMapping {
  [key: string]: string;
}

interface ParsedAlignment {
  receptorName: string;
  sequences: { header: string; sequence: string }[];
}

export default function CustomLogoAnalysisPage() {
  const [alignmentFile, setAlignmentFile] = useState<File | null>(null);
  const [receptor1, setReceptor1] = useState('');
  const [receptor2, setReceptor2] = useState('');
  const [receptor3, setReceptor3] = useState('');
  const [referenceSequenceId, setReferenceSequenceId] = useState('');
  const [residueNumbers, setResidueNumbers] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [resultData, setResultData] = useState<ResidueMapping[]>([]);
  const [receptorNames, setReceptorNames] = useState<string[]>([]);
  const [referenceReceptor, setReferenceReceptor] = useState('');
  const [alignmentDataState, setAlignmentDataState] = useState<Record<string, { header: string; sequence: string }[]>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse FASTA content into individual receptors and their orthologs
  const parseFastaByReceptor = useCallback((fastaText: string, refSeqId: string): ParsedAlignment[] => {
    const lines = fastaText.split('\n').filter(line => line.trim());
    const receptorGroups: Map<string, { header: string; sequence: string }[]> = new Map();
    
    let currentReceptor: string | null = null;
    let currentHeader = '';
    let currentSequence = '';

    const finishCurrentSequence = () => {
      if (currentHeader && currentSequence && currentReceptor) {
        const sequences = receptorGroups.get(currentReceptor) || [];
        sequences.push({ header: currentHeader, sequence: currentSequence });
        receptorGroups.set(currentReceptor, sequences);
      }
    };

    for (const line of lines) {
      if (line.startsWith('>')) {
        // Finish previous sequence
        finishCurrentSequence();
        
        currentHeader = line.substring(1);
        currentSequence = '';
        
        // Check if this header matches the pattern for a new receptor group
        // Look for _HUMAN or the specific reference sequence ID
        if (currentHeader.includes('_HUMAN') || (refSeqId && currentHeader.includes(refSeqId))) {
          // Extract receptor name (e.g., "ADRB2" from "ADRB2_HUMAN" or "ADRB1_MELGA")
          const humanMatch = currentHeader.match(/([A-Z0-9]+)_HUMAN/);
          const refMatch = refSeqId ? currentHeader.match(new RegExp(`([A-Z0-9]+)_${refSeqId.split('_').pop()}`)) : null;
          
          if (humanMatch) {
            currentReceptor = humanMatch[1];
          } else if (refMatch) {
            currentReceptor = refMatch[1];
          }
        }
        // If not a reference sequence, it belongs to the current receptor group
      } else {
        currentSequence += line.trim();
      }
    }

    // Finish last sequence
    finishCurrentSequence();

    // Convert Map to array
    const result: ParsedAlignment[] = [];
    receptorGroups.forEach((sequences, receptorName) => {
      result.push({ receptorName, sequences });
    });

    return result;
  }, []);

  // Process the alignment file
  const processAlignment = useCallback(async () => {
    if (!alignmentFile) {
      toast.error('Please upload an alignment file');
      return;
    }

    const receptors = [receptor1, receptor2, receptor3].filter(r => r.trim());
    if (receptors.length === 0) {
      toast.error('Please enter at least one receptor name');
      return;
    }

    setIsProcessing(true);
    
    try {
      // Read file
      const fileContent = await alignmentFile.text();
      
      // Parse into receptor groups
      const parsedAlignments = parseFastaByReceptor(fileContent, referenceSequenceId.trim());
      
      // Filter to only requested receptors
      const filteredAlignments = parsedAlignments.filter(
        alignment => receptors.includes(alignment.receptorName)
      );

      if (filteredAlignments.length === 0) {
        toast.error('None of the specified receptors were found in the alignment file');
        setIsProcessing(false);
        return;
      }

      // Validate that all receptors have the same alignment length
      const alignmentLength = filteredAlignments[0].sequences[0].sequence.length;
      const allSameLength = filteredAlignments.every(
        alignment => alignment.sequences.every(seq => seq.sequence.length === alignmentLength)
      );

      if (!allSameLength) {
        toast.error('All sequences must have the same alignment length');
        setIsProcessing(false);
        return;
      }

      // Create alignment data for the logo component
      const alignmentData: Record<string, { header: string; sequence: string }[]> = {};
      
      // Find and reorder sequences to put the reference sequence first
      filteredAlignments.forEach(alignment => {
        const sequences = alignment.sequences;
        let referenceSeq = sequences[0]; // Default to first sequence
        
        // If a reference sequence ID is specified, find it
        if (referenceSequenceId.trim()) {
          const foundRefSeq = sequences.find(seq => seq.header.includes(referenceSequenceId.trim()));
          if (foundRefSeq) {
            referenceSeq = foundRefSeq;
            // Reorder to put reference sequence first
            const reorderedSequences = [
              referenceSeq,
              ...sequences.filter(seq => seq.header !== referenceSeq.header)
            ];
            alignmentData[alignment.receptorName] = reorderedSequences;
          } else {
            alignmentData[alignment.receptorName] = sequences;
          }
        } else {
          alignmentData[alignment.receptorName] = sequences;
        }
      });

      // Build resultData for logo chart
      const receptorNamesList = filteredAlignments.map(a => a.receptorName);
      const referenceReceptorName = receptorNamesList[0];
      
      // Parse residue numbers filter
      let residueNumbersFilter: number[] = [];
      if (residueNumbers.trim()) {
        residueNumbersFilter = residueNumbers
          .split(',')
          .map(n => parseInt(n.trim()))
          .filter(n => !isNaN(n) && n > 0);
      }

      // Map residues across all receptors
      const mappingData: ResidueMapping[] = [];
      const residueCounters: Record<string, number> = {};
      
      receptorNamesList.forEach(name => {
        residueCounters[name] = 0;
      });

      for (let i = 0; i < alignmentLength; i++) {
        const mapping: ResidueMapping = {};
        
        filteredAlignments.forEach(alignment => {
          const receptorName = alignment.receptorName;
          const refSeq = alignmentData[receptorName][0]; // First sequence (reference or human)
          const aa = refSeq.sequence[i];
          
          if (aa !== '-') {
            residueCounters[receptorName] += 1;
            mapping[`${receptorName}_resNum`] = residueCounters[receptorName].toString();
            mapping[`${receptorName}_AA`] = aa;
            mapping[`${receptorName}_region`] = 'N/A';
            mapping[`${receptorName}_gpcrdb`] = residueCounters[receptorName].toString();
          } else {
            mapping[`${receptorName}_resNum`] = '-';
            mapping[`${receptorName}_AA`] = '-';
            mapping[`${receptorName}_region`] = 'N/A';
            mapping[`${receptorName}_gpcrdb`] = '-';
          }
        });

        // Only add rows where reference receptor has a residue
        if (mapping[`${referenceReceptorName}_resNum`] !== '-') {
          // Apply residue number filter if provided
          if (residueNumbersFilter.length === 0) {
            mappingData.push(mapping);
          } else {
            const refResNum = parseInt(mapping[`${referenceReceptorName}_resNum`]);
            if (residueNumbersFilter.includes(refResNum)) {
              mappingData.push(mapping);
            }
          }
        }
      }

      if (mappingData.length === 0) {
        toast.error('No data to display after filtering');
        setIsProcessing(false);
        return;
      }

      setResultData(mappingData);
      setReceptorNames(receptorNamesList);
      setReferenceReceptor(referenceReceptorName);
      setAlignmentDataState(alignmentData);
      
      toast.success(`Successfully processed ${filteredAlignments.length} receptor(s)`);
    } catch (error) {
      console.error('Error processing alignment:', error);
      toast.error('Error processing alignment file');
    } finally {
      setIsProcessing(false);
    }
  }, [alignmentFile, receptor1, receptor2, receptor3, referenceSequenceId, residueNumbers, parseFastaByReceptor]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAlignmentFile(file);
      // Clear previous results
      setResultData([]);
      setReceptorNames([]);
      setReferenceReceptor('');
      setAlignmentDataState({});
    }
  };

  const handleReset = () => {
    setAlignmentFile(null);
    setReceptor1('');
    setReceptor2('');
    setReceptor3('');
    setReferenceSequenceId('');
    setResidueNumbers('');
    setResultData([]);
    setReceptorNames([]);
    setReferenceReceptor('');
    setAlignmentDataState({});
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-3xl font-bold">Custom Logo Analysis</h1>
        <p className="text-base text-muted-foreground">
          Upload your custom alignment file containing multiple human receptors and their orthologs. 
          Each human sequence (containing _HUMAN) should be followed by its orthologs in the alignment.
        </p>

        <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md space-y-6">
          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="alignment-file">Alignment File (FASTA format)</Label>
            <Input
              ref={fileInputRef}
              id="alignment-file"
              type="file"
              accept=".fasta,.fa,.txt"
              onChange={handleFileChange}
              className="cursor-pointer"
            />
            {alignmentFile && (
              <p className="text-sm text-muted-foreground">
                Selected: {alignmentFile.name} ({(alignmentFile.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>

          {/* Receptor Names */}
          <div className="space-y-4">
            <Label>Receptor Names (must match names in FASTA headers)</Label>
            
            <div className="space-y-2">
              <Input
                placeholder="Receptor 1 (e.g., ADRB2)"
                value={receptor1}
                onChange={(e) => setReceptor1(e.target.value.toUpperCase())}
              />
              
              <Input
                placeholder="Receptor 2 (optional)"
                value={receptor2}
                onChange={(e) => setReceptor2(e.target.value.toUpperCase())}
              />
              
              <Input
                placeholder="Receptor 3 (optional)"
                value={receptor3}
                onChange={(e) => setReceptor3(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          {/* Reference Sequence ID */}
          <div className="space-y-2">
            <Label htmlFor="reference-sequence">
              Reference Sequence Identifier (optional)
            </Label>
            <Input
              id="reference-sequence"
              placeholder="e.g., ADRB1_MELGA or leave empty for _HUMAN sequences"
              value={referenceSequenceId}
              onChange={(e) => setReferenceSequenceId(e.target.value.toUpperCase())}
            />
            <p className="text-sm text-muted-foreground">
              Specify a sequence identifier to use as reference (e.g., ADRB1_MELGA). 
              If empty, will use _HUMAN sequences. This sequence will be used for residue numbering and filtering.
            </p>
          </div>

          {/* Residue Numbers Filter */}
          <div className="space-y-2">
            <Label htmlFor="residue-numbers">
              Filter by Residue Numbers (comma-separated, from first receptor)
            </Label>
            <Input
              id="residue-numbers"
              placeholder="e.g., 10, 25, 50, 100, 150"
              value={residueNumbers}
              onChange={(e) => setResidueNumbers(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Optional: Enter specific residue numbers from the first receptor to include in the analysis. 
              Leave empty to include all positions.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={processAlignment}
              disabled={isProcessing || !alignmentFile}
              className="flex-1"
            >
              {isProcessing ? 'Processing...' : 'Generate Logos'}
            </Button>
            
            <Button
              onClick={handleReset}
              variant="outline"
              disabled={isProcessing}
            >
              Reset
            </Button>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
          <h3 className="font-semibold">Instructions:</h3>
          <ol className="list-decimal list-inside space-y-1">
            <li>Upload a FASTA alignment file containing your sequences</li>
            <li>By default, sequences with "_HUMAN" in headers mark new receptor groups</li>
            <li>Alternatively, specify a reference sequence ID (e.g., ADRB1_MELGA) to use instead</li>
            <li>Enter 1-3 receptor names (the part before the species identifier)</li>
            <li>Optionally filter by specific residue numbers from the reference sequence</li>
            <li>Click "Generate Logos" to create the visualization</li>
            <li>Use the download button in the results to save the SVG</li>
          </ol>
          
          <div className="mt-4 pt-3 border-t border-border">
            <p className="font-medium mb-1">Example with custom reference:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Header: <code className="text-xs bg-muted px-1 py-0.5 rounded">ADRB1_MELGA</code></li>
              <li>Receptor name: <code className="text-xs bg-muted px-1 py-0.5 rounded">ADRB1</code></li>
              <li>Reference ID: <code className="text-xs bg-muted px-1 py-0.5 rounded">ADRB1_MELGA</code></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Results */}
      {resultData.length > 0 && receptorNames.length > 0 && Object.keys(alignmentDataState).length > 0 && (
        <div className="mt-8">
          <CustomMultiReceptorLogo
            resultData={resultData}
            receptorNames={receptorNames}
            referenceReceptor={referenceReceptor}
            alignmentData={alignmentDataState}
          />
        </div>
      )}
    </div>
  );
}

