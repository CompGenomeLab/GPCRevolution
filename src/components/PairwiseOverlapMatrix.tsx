'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Sequence {
  header: string;
  sequence: string;
}

interface PositionData {
  position: number;
  mostConservedAA: string;
  conservationFrequency: number;
  residueCounts: Record<string, number>;
  totalSequences: number;
}

interface AlignmentData {
  name: string;
  sequences: Sequence[];
  positionData: PositionData[];
}

interface PairwiseOverlapProps {
  fastaNames: string[];
  folder: string;
}

// Define amino acid matching groups (same as CustomSequenceLogo)
const matchingGroups = {
  'acidic': ['E', 'D'],
  'aromatic': ['W', 'Y', 'H', 'F'],
  'basic': ['R', 'K'],
  'polar': ['Q', 'N'],
  'hydrophobic_vi': ['V', 'I'],
  'hydrophobic_ml': ['M', 'L']
};

const PairwiseOverlapMatrix: React.FC<PairwiseOverlapProps> = ({ fastaNames, folder }) => {
  const [selectedAlignments, setSelectedAlignments] = useState<string[]>([]);
  const [alignmentData, setAlignmentData] = useState<AlignmentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [overlapMatrix, setOverlapMatrix] = useState<number[][]>([]);
  const [conservationThreshold, setConservationThreshold] = useState(50); // minimum conservation percentage
  const [totalPositions, setTotalPositions] = useState(0);

  // Function to parse FASTA content
  function parseFasta(text: string): Sequence[] {
    const lines = text.trim().split(/\r?\n/);
    const seqs: Sequence[] = [];
    let header = '';
    let seq = '';
    for (const line of lines) {
      if (line.startsWith('>')) {
        if (header) {
          seqs.push({ header, sequence: seq });
        }
        header = line.substring(1).trim();
        seq = '';
      } else {
        seq += line.trim();
      }
    }
    if (header) seqs.push({ header, sequence: seq });
    return seqs;
  }

  // Calculate position data for an alignment (similar to CustomSequenceLogo logic)
  const calculatePositionData = (sequences: Sequence[]): PositionData[] => {
    if (!sequences.length) return [];
    
    const maxLength = Math.max(...sequences.map(s => s.sequence.length));
    const positionData: PositionData[] = [];
    const totalSequencesInAlignment = sequences.length; // Total sequences including those with gaps
    
    for (let pos = 0; pos < maxLength; pos++) {
      const residueCounts: Record<string, number> = {};
      let nonGapSequences = 0;
      
      const standardAA = 'ACDEFGHIKLMNPQRSTVWY';
      sequences.forEach(seq => {
        const residue = seq.sequence[pos]?.toUpperCase();
        if (residue && standardAA.includes(residue)) {
          residueCounts[residue] = (residueCounts[residue] || 0) + 1;
          nonGapSequences++;
        }
        // Note: gaps are now implicitly counted as reducing conservation
      });
      
      // Skip positions with very few non-gap sequences (less than 10% of total)
      const minNonGapThreshold = Math.max(1, Math.floor(totalSequencesInAlignment * 0.1));
      if (nonGapSequences < minNonGapThreshold) continue;
      
      // Find most conserved amino acid
      let mostConservedAA = '';
      let maxCount = 0;
      Object.entries(residueCounts).forEach(([residue, count]) => {
        if (count > maxCount) {
          maxCount = count;
          mostConservedAA = residue;
        }
      });
      
      // Calculate conservation frequency including similar amino acids
      // IMPORTANT: Calculate against ALL sequences, not just non-gap sequences
      let similarCount = maxCount; // Start with exact matches
      const group = Object.values(matchingGroups).find(g => g.includes(mostConservedAA));
      if (group) {
        group.forEach(aa => {
          if (aa !== mostConservedAA && residueCounts[aa]) {
            similarCount += residueCounts[aa];
          }
        });
      }
      
      // Conservation frequency is now calculated against ALL sequences including gaps
      const conservationFrequency = (similarCount / totalSequencesInAlignment) * 100;
      
      positionData.push({
        position: pos,
        mostConservedAA,
        conservationFrequency,
        residueCounts,
        totalSequences: totalSequencesInAlignment // This now represents all sequences
      });
    }
    
    return positionData;
  };

  // Load alignment data for selected alignments
  const loadAlignmentData = async () => {
    if (selectedAlignments.length === 0) {
      setAlignmentData([]);
      setOverlapMatrix([]);
      setTotalPositions(0);
      return;
    }

    setLoading(true);
    try {
      const loadPromises = selectedAlignments.map(async (name) => {
        const response = await fetch(`${folder}/${name}.fasta`);
        if (!response.ok) {
          throw new Error(`Failed to load ${name}.fasta`);
        }
        const text = await response.text();
        const sequences = parseFasta(text);
        const positionData = calculatePositionData(sequences);
        
        return {
          name,
          sequences,
          positionData
        };
      });

      const loadedData = await Promise.all(loadPromises);
      setAlignmentData(loadedData);
      calculateOverlapMatrix(loadedData);
    } catch (error) {
      console.error('Error loading alignment data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Check if two amino acids are similar based on matching groups
  const areSimilar = (aa1: string, aa2: string): boolean => {
    if (aa1 === aa2) return true;
    
    for (const group of Object.values(matchingGroups)) {
      if (group.includes(aa1) && group.includes(aa2)) {
        return true;
      }
    }
    return false;
  };

  // Calculate pairwise overlap matrix based on amino acid conservation
  const calculateOverlapMatrix = (data: AlignmentData[]) => {
    const n = data.length;
    const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    
    // Find the maximum position across all alignments
    const maxPos = Math.max(...data.map(d => 
      d.positionData.length > 0 ? Math.max(...d.positionData.map(p => p.position)) : 0
    ));
    setTotalPositions(maxPos + 1);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          // Diagonal: count positions that meet conservation threshold
          const conservedPositions = data[i].positionData.filter(
            pos => pos.conservationFrequency >= conservationThreshold
          ).length;
          matrix[i][j] = conservedPositions;
        } else {
          // Off-diagonal: count positions where both alignments have similar conserved amino acids
          let sharedPositions = 0;
          
          // Create position maps for quick lookup
          const posMapI = new Map<number, PositionData>();
          const posMapJ = new Map<number, PositionData>();
          
          data[i].positionData.forEach(pos => posMapI.set(pos.position, pos));
          data[j].positionData.forEach(pos => posMapJ.set(pos.position, pos));
          
          // Check all positions that exist in both alignments
          for (let pos = 0; pos <= maxPos; pos++) {
            const posDataI = posMapI.get(pos);
            const posDataJ = posMapJ.get(pos);
            
            if (posDataI && posDataJ) {
              // Both alignments have data at this position
              const meetsThresholdI = posDataI.conservationFrequency >= conservationThreshold;
              const meetsThresholdJ = posDataJ.conservationFrequency >= conservationThreshold;
              
              if (meetsThresholdI && meetsThresholdJ) {
                // Check if the most conserved amino acids are similar
                if (areSimilar(posDataI.mostConservedAA, posDataJ.mostConservedAA)) {
                  sharedPositions++;
                }
              }
            }
          }
          
          matrix[i][j] = sharedPositions;
        }
      }
    }

    setOverlapMatrix(matrix);
  };

  // Load data when selected alignments or threshold changes
  useEffect(() => {
    loadAlignmentData();
  }, [selectedAlignments, conservationThreshold]);

  // Handle alignment selection
  const handleAlignmentToggle = (alignmentName: string) => {
    setSelectedAlignments(prev => {
      if (prev.includes(alignmentName)) {
        return prev.filter(name => name !== alignmentName);
      } else {
        return [...prev, alignmentName];
      }
    });
  };

  const selectAll = () => {
    setSelectedAlignments([...fastaNames]);
  };

  const selectNone = () => {
    setSelectedAlignments([]);
  };

  const maxOverlap = Math.max(...overlapMatrix.flat());

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Amino Acid Conservation Overlap Matrix</CardTitle>
        <CardDescription>
          Shows the number of positions where each pair of alignments have similar conserved amino acids.
          Uses the same similarity groups as the sequence logo (E-D, W-Y-H-F, R-K, Q-N, V-I, M-L).
          Diagonal shows positions meeting conservation threshold within each alignment.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Controls */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <h4 className="font-semibold">Select Alignments:</h4>
            <Button variant="outline" size="sm" onClick={selectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={selectNone}>
              Clear All
            </Button>
            <span className="text-sm text-gray-600">
              {selectedAlignments.length} of {fastaNames.length} selected
            </span>
          </div>
          
          {/* Conservation threshold control */}
          <div className="flex items-center gap-4 mb-4">
            <label className="text-sm font-medium">Conservation Threshold:</label>
            <input
              type="range"
              min="0"
              max="100"
              value={conservationThreshold}
              onChange={(e) => setConservationThreshold(Number(e.target.value))}
              className="w-32"
            />
            <span className="text-sm text-gray-600">{conservationThreshold}%</span>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto border rounded-lg p-4">
            {fastaNames.map((name) => (
              <div key={name} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id={name}
                  checked={selectedAlignments.includes(name)}
                  onChange={() => handleAlignmentToggle(name)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label
                  htmlFor={name}
                  className="text-sm font-mono cursor-pointer truncate"
                  title={name}
                >
                  {name}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-8">
            <div className="animate-spin inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full" />
            <p className="mt-2 text-gray-600">Loading alignment data...</p>
          </div>
        )}

        {/* Overlap Matrix */}
        {!loading && selectedAlignments.length > 0 && overlapMatrix.length > 0 && (
          <div className="overflow-auto">
            <div className="inline-block min-w-full">
              <table className="border-collapse border">
                <thead>
                  <tr>
                    <th className="border bg-gray-100 p-2 text-xs font-semibold min-w-24"></th>
                    {alignmentData.map((alignment, index) => (
                      <th
                        key={index}
                        className="border bg-gray-100 p-2 text-xs font-semibold min-w-20 max-w-32"
                        title={alignment.name}
                      >
                        <div className="transform -rotate-45 origin-center whitespace-nowrap">
                          {alignment.name}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {alignmentData.map((alignment, i) => (
                    <tr key={i}>
                      <td
                        className="border bg-gray-100 p-2 text-xs font-semibold max-w-32"
                        title={alignment.name}
                      >
                        <div className="truncate">{alignment.name}</div>
                      </td>
                      {overlapMatrix[i]?.map((overlap, j) => {
                        const isDiagonal = i === j;
                        return (
                          <td
                            key={j}
                            className={`border p-2 text-center text-sm font-mono ${
                              isDiagonal 
                                ? 'bg-blue-100 border-blue-300 font-bold' 
                                : overlap > 0 
                                ? `bg-green-500 bg-opacity-${Math.round((overlap / maxOverlap) * 50) + 20}` 
                                : 'bg-gray-50'
                            }`}
                            title={
                              isDiagonal 
                                ? `Conserved positions in ${alignment.name}: ${overlap} (≥${conservationThreshold}% conservation)`
                                : `Shared conserved positions between ${alignmentData[i]?.name} and ${alignmentData[j]?.name}: ${overlap}`
                            }
                          >
                            {overlap}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Legend */}
            <div className="mt-4 text-sm text-gray-600">
              <p><strong>Legend:</strong></p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Diagonal (blue): Positions with ≥{conservationThreshold}% conservation in each alignment</li>
                <li>Off-diagonal (green): Positions where both alignments have similar conserved amino acids</li>
                <li>Similarity groups: Acidic (E,D), Aromatic (W,Y,H,F), Basic (R,K), Polar (Q,N), Hydrophobic (V,I), (M,L)</li>
                <li>Only positions with ≥10% non-gap sequences are analyzed</li>
                <li>Total positions analyzed: {totalPositions}</li>
              </ul>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && selectedAlignments.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>Select at least one alignment to view the overlap matrix.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PairwiseOverlapMatrix; 