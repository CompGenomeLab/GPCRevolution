'use client';

import React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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

export default function MSAVisualization({ sequences, className }: MSAVisualizationProps) {
  const columnHelper = createColumnHelper<Sequence>();

  const columns = React.useMemo(() => {
    if (!sequences.length) return [];

    const maxLength = Math.max(...sequences.map(s => s.sequence.length));

    const positionColumns = Array.from({ length: maxLength }, (_, i) =>
      columnHelper.accessor(row => row.sequence[i] || '-', {
        id: `pos${i + 1}`,
        header: () => <div className="text-xs text-muted-foreground text-center">{i + 1}</div>,
        cell: info => (
          <div className="min-w-[1em] text-center  text-xs">
            <ColoredResidue residue={info.getValue()} />
          </div>
        ),
      })
    );

    return [
      columnHelper.accessor('header', {
        id: 'header',
        header: () => <div className="px-2 py-1 text-xs text-muted-foreground"></div>,
        cell: info => <div className="px-2 py-1  text-xs">{info.getValue()}</div>,
      }),
      ...positionColumns,
    ];
  }, [sequences, columnHelper]);

  const table = useReactTable({
    data: sequences,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const getShortHeader = (hdr: string) => {
    const parts = hdr.split('|');
    return parts.length >= 3 ? parts[2] : hdr;
  };

  return (
    <div className={`w-full rounded-md border ${className}`}>
      <div className="h-[360px] sm:h-[640px] overflow-y-scroll overflow-x-auto relative transform-gpu scale-100 origin-top">
        <table>
          <TableHeader>
            <TableRow className="sticky top-0 bg-muted z-40">
              {table.getFlatHeaders().map(header => (
                <TableHead
                  key={header.id}
                  className={
                    header.column.id === 'header'
                      ? 'sticky left-0 top-0 z-30 bg-muted border-r w-[120px] sm:w-[200px]'
                      : 'sticky top-0 z-20 bg-muted w-[20px]'
                  }
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row, rowIndex) => (
              <TableRow
                key={row.id}
                className={rowIndex === 0 ? 'sticky top-[39px] z-15 bg-background border-b' : ''}
              >
                {row.getVisibleCells().map(cell => (
                  <TableCell
                    key={cell.id}
                    className={
                      cell.column.id === 'header'
                        ? 'sticky left-0 z-10 bg-background border-r w-[120px] sm:w-[200px]'
                        : 'w-[30px]'
                    }
                  >
                    <span className="sm:hidden">{getShortHeader(String(cell.getValue()))}</span>
                    <span className="hidden sm:inline">{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>
    </div>
  );
}
