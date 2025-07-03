'use client';

import React, { useEffect, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConservationDatum } from './ConservationChart';

interface Sequence {
  header: string;
  sequence: string;
}

interface MSAVisualizationProps {
  sequences: Sequence[];
  className?: string;
  conservationFile?: string | null;
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

export default function MSAVisualization({
  sequences,
  className,
  conservationFile,
}: MSAVisualizationProps) {
  const columnHelper = createColumnHelper<Sequence>();
  const [conservationData, setConservationData] = useState<ConservationDatum[] | null>(null);

  useEffect(() => {
    setConservationData(null);

    if (!conservationFile) return;

    fetch(`/${conservationFile}`)
      .then(res => {
        if (!res.ok) {
          throw new Error(`Failed to fetch conservation data: ${res.status}`);
        }
        return res.text();
      })
      .then(text => {
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

        setConservationData(data);
      })
      .catch(err => {
        console.error('Error loading conservation data:', err);
      })
      .finally(() => {});
  }, [conservationFile]);

  const columns = React.useMemo(() => {
    if (!sequences.length) return [];

    const maxLength = Math.max(...sequences.map(s => s.sequence.length));

    const positionColumns = Array.from({ length: maxLength }, (_, i) =>
      columnHelper.accessor(row => row.sequence[i] || '-', {
        id: `pos${i + 1}`,
        header: () => (
          <div className="text-xs text-muted-foreground text-center w-[4px] -rotate-90 h-fit">
            {conservationData?.[i]?.gpcrdb}
          </div>
        ),
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
        header: () => (
          <div className="px-2 py-1 text-xs text-muted-foreground text-right">GPCRdb#</div>
        ),
        cell: info => <div className="px-2 py-1 text-xs text-right">{info.getValue()}</div>,
      }),
      ...positionColumns,
    ];
  }, [sequences, columnHelper]);

  const table = useReactTable({
    data: sequences,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className={`w-full rounded-md border ${className}`}>
      <div className="h-[640px] overflow-y-scroll relative">
        <table>
          <TableHeader>
            <TableRow className="sticky top-0 bg-muted z-40 ">
              {table.getFlatHeaders().map(header => (
                <TableHead
                  key={header.id}
                  className={
                    header.column.id === 'header'
                      ? 'sticky left-0 top-0 z-30 bg-muted border-r w-[200px] h-16'
                      : 'sticky top-0 z-20 bg-muted w-[4px]  h-16'
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
                        ? 'sticky left-0 z-10 bg-background border-r w-[200px]'
                        : 'w-[4px] p-0'
                    }
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
