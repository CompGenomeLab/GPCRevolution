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
  const [isConservationLoading, setIsConservationLoading] = useState(false);

  useEffect(() => {
    setConservationData(null);

    if (!conservationFile) return;

    setIsConservationLoading(true);

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
      .finally(() => {
        setIsConservationLoading(false);
      });
  }, [conservationFile]);

  const columns = React.useMemo(() => {
    if (!sequences.length) return [];

    const maxLength = Math.max(...sequences.map(s => s.sequence.length));

    const positionColumns = Array.from({ length: maxLength }, (_, i) =>
      columnHelper.accessor(row => row.sequence[i] || '-', {
        id: `pos${i + 1}`,
        header: () => (
          <div className="text-xs text-black text-center w-[4px] -rotate-90 h-fit relative top-3.5 left-1">
            {conservationData?.[i]?.gpcrdb}
          </div>
        ),
        cell: info => (
          <div className="min-w-[1em] text-center text-xs leading-none">
            <ColoredResidue residue={info.getValue()} />
          </div>
        ),
      })
    );

    return [
      columnHelper.accessor('header', {
        id: 'header',
        header: () => (
          <div className="px-2 py-0 text-xs leading-tight text-black font-bold text-right">GPCRdb #</div>
        ),
        cell: info => <div className="px-2 py-0 text-xs text-right leading-tight font-semibold text-black">{info.getValue()}</div>,
      }),
      ...positionColumns,
    ];
  }, [sequences, columnHelper, conservationData]);

  const table = useReactTable({
    data: sequences,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (conservationFile && (isConservationLoading || !conservationData)) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 p-8 ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className={`w-full rounded-md ${className}`}>
      <div className="h-[640px] overflow-y-scroll relative">
        <table className="text-black bg-white dark:bg-white">
          <TableHeader>
            <TableRow className="sticky top-0 z-40 h-12 bg-gray-100 dark:bg-gray-100 border-0">
              {table.getFlatHeaders().map(header => {
                const isHeaderCol = header.column.id === 'header';
                if (isHeaderCol) {
                  return (
                    <TableHead
                      key={header.id}
                      className="sticky left-0 top-0 z-30 w-[200px] h-12 p-0 bg-white dark:bg-white"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                }

                const colIndex = parseInt(header.column.id.slice(3), 10);
                const bgClass = colIndex % 2 === 0 ? 'bg-white' : 'bg-gray-100';

                return (
                  <TableHead
                    key={header.id}
                    className={`sticky top-0 z-20 w-[4px] h-12 p-0 ${bgClass}`}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row, rowIndex) => (
              <TableRow
                key={row.id}
                className={
                  rowIndex === 0
                    ? 'sticky top-[48px] z-15 font-semibold h-6 bg-white dark:bg-white border-0 hover:bg-transparent'
                    : 'font-semibold border-0 h-6 hover:bg-transparent'
                }
              >
                {row.getVisibleCells().map(cell => {
                  const isHeaderCol = cell.column.id === 'header';
                  if (isHeaderCol) {
                    return (
                      <TableCell
                        key={cell.id}
                        className="sticky left-0 w-[200px] p-0 bg-white dark:bg-white"
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
            ))}
          </TableBody>
        </table>
      </div>
    </div>
  );
}
