'use client';

import React, { useMemo, useEffect, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { TableBody, TableCell, TableRow } from '@/components/ui/table';

interface Sequence {
  header: string;
  sequence: string;
}

interface MSAVisualizationProps {
  sequences: Sequence[];
  className?: string;
}

interface ConservationDatum {
  residue: number;
  conservation: number;
  conservedAA: string;
  humanAA: string;
  region: string;
  gpcrdb: string;
}

interface Receptor {
  geneName: string;
  class: string;
  numOrthologs: number;
  lca: string;
  gpcrdbId: string;
  conservationFile: string;
}

const colorMapping: Record<string, string> = {
  FCB315: 'WYHF',
  '7D2985': 'STQN',
  '231F20': 'PGA',
  DD6030: 'ED',
  '7CAEC4': 'RK',
  B4B4B4: 'VCIML',
};

const ColoredResidue = React.memo(({ residue }: { residue: string }) => {
  const char = residue.toUpperCase();
  for (const [color, acids] of Object.entries(colorMapping)) {
    if (acids.includes(char)) {
      return <span style={{ color: `#${color}` }}>{char}</span>;
    }
  }
  return <>{char}</>;
});

ColoredResidue.displayName = 'ColoredResidue';

export default function MSAVisualization({ sequences, className }: MSAVisualizationProps) {
  const columnHelper = createColumnHelper<Sequence>();
  const [conservationData, setConservationData] = useState<{ [geneName: string]: ConservationDatum[] }>({});
  const [isLoading, setIsLoading] = useState(false);

  const getShortHeader = (hdr: string) => {
    const parts = hdr.split('|');
    return parts.length >= 3 ? parts[2] : hdr;
  };

  // Find human sequences and get their gene names
  const humanSequences = useMemo(() => {
    return sequences.filter(seq => {
      const parts = seq.header.split('|');
      return parts.length >= 3 && parts[2].includes('_HUMAN');
    });
  }, [sequences]);

  // Extract gene names from human sequences
  const humanGeneNames = useMemo(() => {
    return humanSequences.map(seq => {
      const parts = seq.header.split('|');
      if (parts.length >= 3) {
        const genePart = parts[2];
        return genePart.replace('_HUMAN', '');
      }
      return '';
    }).filter(name => name);
  }, [humanSequences]);

  // Load receptors data and conservation data
  useEffect(() => {
    if (humanGeneNames.length === 0) return;

    setIsLoading(true);
    
    // First load receptors.json
    fetch('/receptors.json')
      .then(response => response.json())
      .then((receptors: Receptor[]) => {
        // Load conservation data for each human receptor
        const promises = humanGeneNames.map(async (geneName) => {
          try {
            const receptor = receptors.find(r => r.geneName === geneName);
            if (!receptor?.conservationFile) return null;

            const response = await fetch(`/${receptor.conservationFile}`);
            if (!response.ok) throw new Error(`Failed to fetch conservation data for ${geneName}`);
            
            const text = await response.text();
            const lines = text.split(/\r?\n/).filter(d => d.trim() && !d.startsWith('residue'));
            const data = lines.map(line => {
              const [resStr, consStr, conservedAA, humanAA, region, gpcrdb] = line.trim().split(/\s+/);
              return {
                residue: +resStr,
                conservation: +consStr,
                conservedAA,
                humanAA,
                region,
                gpcrdb,
              };
            });

            return { geneName, data };
          } catch (error) {
            console.error(`Error loading conservation data for ${geneName}:`, error);
            return null;
          }
        });

        return Promise.all(promises);
      })
      .then(results => {
        const conservationMap: { [geneName: string]: ConservationDatum[] } = {};
        results.forEach(result => {
          if (result) {
            conservationMap[result.geneName] = result.data;
          }
        });
        setConservationData(conservationMap);
        setIsLoading(false);
      })
      .catch(error => {
        console.error('Error loading receptor data:', error);
        setIsLoading(false);
      });
  }, [humanGeneNames]);

  // Create GPCRdb numbering rows
  const gpcrdbRows = useMemo(() => {
    if (humanGeneNames.length === 0 || Object.keys(conservationData).length === 0) return [];

    const rows: Sequence[] = [];
    const humanSequencesForGenes: { [geneName: string]: Sequence } = {};
    
    humanGeneNames.forEach(geneName => {
      // Find the specific human sequence for this receptor
      const humanSeq = sequences.find(seq => {
        const parts = seq.header.split('|');
        return parts.length >= 3 && parts[2].includes(`${geneName}_HUMAN`);
      });
      
      if (humanSeq) {
        humanSequencesForGenes[geneName] = humanSeq;
      }
    });

    // Find positions where both human sequences have gaps
    const maxLength = Math.max(...Object.values(humanSequencesForGenes).map(seq => seq.sequence.length));
    const positionsToKeep: number[] = [];
    
    for (let i = 0; i < maxLength; i++) {
      const allHumansHaveGaps = Object.values(humanSequencesForGenes).every(seq => seq.sequence[i] === '-');
      if (!allHumansHaveGaps) {
        positionsToKeep.push(i);
      }
    }

    humanGeneNames.forEach(geneName => {
      const humanSeq = humanSequencesForGenes[geneName];
      
      if (humanSeq && conservationData[geneName]) {
        const conservation = conservationData[geneName];
        
        // Create GPCRdb numbering based on human sequence gaps
        const gpcrdbNumbers: string[] = [];
        let conservationIndex = 0;
        
        for (const i of positionsToKeep) {
          if (humanSeq.sequence[i] === '-') {
            gpcrdbNumbers.push('-');
          } else {
            const gpcrdbNumber = conservation[conservationIndex]?.gpcrdb || '-';
            gpcrdbNumbers.push(gpcrdbNumber);
            conservationIndex++;
          }
        }
        
        rows.push({
          header: `${geneName} GPCRdb #`,
          sequence: gpcrdbNumbers.join('|'), // Use | as separator for complete numbers
        });
      }
    });

    return rows;
  }, [humanGeneNames, conservationData, sequences]);

  // Add GPCRdb numbering rows to the displayed data
  const displayData = useMemo(() => {
    if (gpcrdbRows.length === 0) return sequences;
    
    // Find positions to keep based on GPCRdb rows having values
    const maxLength = Math.max(...gpcrdbRows.map(row => row.sequence.split('|').length));
    const positionsToKeep: number[] = [];
    
    console.log('=== GPCRdb Filtering Debug ===');
    console.log('Original GPCRdb rows:', gpcrdbRows);
    console.log('Max length:', maxLength);
    
    for (let i = 0; i < maxLength; i++) {
      const allGpcrdbHaveGaps = gpcrdbRows.every(row => {
        const gpcrdbNumbers = row.sequence.split('|');
        return gpcrdbNumbers[i] === '-';
      });
      console.log(`Position ${i}:`, gpcrdbRows.map(row => row.sequence.split('|')[i]), 'All gaps?', allGpcrdbHaveGaps);
      if (!allGpcrdbHaveGaps) {
        positionsToKeep.push(i);
      }
    }
    
    console.log('Positions to keep:', positionsToKeep);
    
    // Filter all sequences to remove columns where both GPCRdb rows have gaps
    const filteredSequences = sequences.map(seq => ({
      ...seq,
      sequence: positionsToKeep.map(i => seq.sequence[i] || '-').join('')
    }));
    
    // Also filter GPCRdb rows to remove the same columns
    const filteredGpcrdbRows = gpcrdbRows.map(row => {
      const gpcrdbNumbers = row.sequence.split('|');
      const filteredGpcrdbNumbers = positionsToKeep.map(i => gpcrdbNumbers[i] || '-');
      console.log(`Filtering ${row.header}:`, gpcrdbNumbers, '->', filteredGpcrdbNumbers);
      return {
        ...row,
        sequence: filteredGpcrdbNumbers.join('|')
      };
    });
    
    console.log('Filtered GPCRdb rows:', filteredGpcrdbRows);
    console.log('Original sequences (first 5):', sequences.slice(0, 5));
    console.log('Filtered sequences (first 5):', filteredSequences.slice(0, 5));
    console.log('Final displayData:', [...filteredGpcrdbRows, ...filteredSequences]);
    console.log('=== End Debug ===');
    
    return [...filteredGpcrdbRows, ...filteredSequences];
  }, [gpcrdbRows, sequences]);

  const columns = React.useMemo(() => {
    if (!displayData.length) return [];

    // Calculate maxLength properly for GPCRdb rows (split by |) and regular sequences
    const maxLength = Math.max(...displayData.map(s => {
      if (s.header.includes('GPCRdb #')) {
        return s.sequence.split('|').length;
      }
      return s.sequence.length;
    }));
    
    console.log('=== Column Length Debug ===');
    console.log('Sequence lengths in displayData:');
    displayData.forEach((seq, i) => {
      if (i < 10) { // Show first 10
        const actualLength = seq.header.includes('GPCRdb #') ? seq.sequence.split('|').length : seq.sequence.length;
        console.log(`${seq.header}: ${seq.sequence.length} chars, actual positions: ${actualLength}`);
      }
    });
    console.log('Calculated maxLength:', maxLength);
    console.log('=== End Column Debug ===');

    const positionColumns = Array.from({ length: maxLength }, (_, i) =>
      columnHelper.accessor(row => row.sequence[i] || '-', {
        id: `pos${i + 1}`,
        header: () => <div className="w-[4px] h-6" />,
        cell: info => {
          const isGpcrdbRow = info.row.original.header.includes('GPCRdb #');
          if (isGpcrdbRow) {
            // Split GPCRdb sequence and get the complete number for this position
            const gpcrdbNumbers = info.row.original.sequence.split('|');
            const gpcrdbValue = gpcrdbNumbers[i] || '-';
            return (
              <div className="text-xs text-black text-center w-[4px] -rotate-90 h-fit relative top-3.5 left-1 font-bold">
                {gpcrdbValue}
              </div>
            );
          }
          return (
            <div className="min-w-[1em] text-center text-xs leading-none">
              <ColoredResidue residue={info.getValue()} />
            </div>
          );
        },
      }));

    return [
      columnHelper.accessor('header', {
        id: 'header',
        header: () => <div className="px-2 py-0 text-xs leading-tight" />,
        cell: info => (
          <div className="px-2 py-0 text-xs text-right leading-tight font-semibold text-black">
            <span className="sm:hidden">{getShortHeader(info.getValue())}</span>
            <span className="hidden sm:inline">{info.getValue()}</span>
          </div>
        ),
      }),
      ...positionColumns,
    ];
  }, [displayData, columnHelper, gpcrdbRows]);

  const table = useReactTable({
    data: displayData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading || (humanGeneNames.length > 0 && Object.keys(conservationData).length === 0)) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 p-8 ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
        <p className="text-sm text-muted-foreground">Loading conservation data...</p>
      </div>
    );
  }

  return (
    <div className={`w-full rounded-md ${className}`}>
      <div className="h-[360px] sm:h-[640px] overflow-y-scroll overflow-x-auto relative transform-gpu scale-100 origin-top">
        <table className="text-black bg-white dark:bg-white">
          <TableBody>
            {table.getRowModel().rows.map((row, rowIndex) => {
              const isGpcrdbRow = row.original.header.includes('GPCRdb #');
              const gpcrdbRowIndex = isGpcrdbRow ? 
                table.getRowModel().rows.slice(0, rowIndex).filter(r => r.original.header.includes('GPCRdb #')).length : -1;
              
              // Calculate sticky positioning for GPCRdb rows
              let stickyStyle = {};
              let className = 'font-semibold border-0 h-6 hover:bg-transparent';
              
              if (isGpcrdbRow && gpcrdbRowIndex < 2) {
                // First two GPCRdb rows are sticky headers
                stickyStyle = { top: `${gpcrdbRowIndex * 36}px` };
                className = 'sticky z-40 font-semibold h-9 bg-gray-100 dark:bg-gray-100 border-0 hover:bg-transparent';
              } else if (!isGpcrdbRow && rowIndex === table.getRowModel().rows.findIndex(r => !r.original.header.includes('GPCRdb #'))) {
                // First sequence row is sticky below GPCRdb rows
                stickyStyle = { top: '72px' };
                className = 'sticky z-15 font-semibold h-6 bg-white dark:bg-white border-0 hover:bg-transparent';
              }
              
              return (
                <TableRow
                  key={row.id}
                  style={stickyStyle}
                  className={className}
                >
                  {row.getVisibleCells().map(cell => {
                    const isHeaderCol = cell.column.id === 'header';
                    const isGpcrdbRowForSticky = row.original.header.includes('GPCRdb #');
                    if (isHeaderCol) {
                      return (
                        <TableCell
                          key={cell.id}
                          className={`sticky left-0 w-[120px] sm:w-[200px] p-0 ${
                            isGpcrdbRowForSticky ? 'bg-gray-100 dark:bg-gray-100' : 'bg-white dark:bg-white'
                          } ${isGpcrdbRowForSticky ? 'z-50' : 'z-30'}`}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    }

                    const colIndex = parseInt(cell.column.id.slice(3), 10);
                    const bgClass = colIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50';

                    return (
                      <TableCell key={cell.id} className={`w-[4px] p-0 ${bgClass}`}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </table>
      </div>
    </div>
  );
}
