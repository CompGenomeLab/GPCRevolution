'use client';

import React from 'react';
import { TableBody, TableCell, TableRow } from '@/components/ui/table';

interface Sequence {
  header: string;
  sequence: string;
}

interface MSAVisualizationProps {
  sequences: Sequence[];
  className?: string;
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

const ColoredSequence = React.memo(({ sequence }: { sequence: string }) => {
  return (
    <span 
      className="text-sm leading-none tracking-normal" 
      style={{ 
        fontFamily: "'Consolas', 'Monaco', 'Courier New', 'Lucida Console', monospace",
        fontSize: '13px',
        letterSpacing: '0px',
        lineHeight: '1'
      }}
    >
      {sequence.split('').map((residue, index) => (
        <ColoredResidue key={index} residue={residue} />
      ))}
    </span>
  );
});

ColoredSequence.displayName = 'ColoredSequence';

export default function MSAVisualization({ sequences, className }: MSAVisualizationProps) {
  const getShortHeader = (hdr: string) => {
    const parts = hdr.split('|');
    return parts.length >= 3 ? parts[2] : hdr;
  };

  return (
    <div className={`w-full rounded-md ${className}`}>
      <div className="h-[360px] sm:h-[640px] overflow-y-scroll overflow-x-auto relative">
        <table className="text-black bg-white dark:bg-white w-full">
          <TableBody>
            {sequences.map((sequence, index) => (
              <TableRow
                key={index}
                className="font-semibold border-0 h-4 hover:bg-transparent"
              >
                <TableCell className="sticky left-0 w-[120px] sm:w-[200px] p-0 px-1 bg-white dark:bg-white z-30 border-r">
                  <div className="text-xs text-right leading-none font-semibold text-black py-0.5">
                    <span className="sm:hidden">{getShortHeader(sequence.header)}</span>
                    <span className="hidden sm:inline">{sequence.header}</span>
                  </div>
                </TableCell>
                <TableCell className="p-0 px-1 bg-white dark:bg-white">
                  <div className="py-0.5">
                    <ColoredSequence sequence={sequence.sequence} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>
    </div>
  );
}
