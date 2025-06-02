'use client';

import React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';

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
        header: () => <div className="text-xs text-muted-foreground">{i + 1}</div>,
        cell: info => (
          <div className="min-w-[1em] text-center font-mono">
            <ColoredResidue residue={info.getValue()} />
          </div>
        ),
      })
    );

    return [
      columnHelper.accessor('header', {
        id: 'header',
        header: () => <div className="px-2 py-1 text-xs text-muted-foreground">Sequence</div>,
        cell: info => <div className="px-2 py-1 font-mono text-sm">{info.getValue()}</div>,
      }),
      ...positionColumns,
    ];
  }, [sequences, columnHelper]);

  const table = useReactTable({
    data: sequences,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const [scrollTop, setScrollTop] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rowHeight = 32;
  const visibleRows = Math.ceil(600 / rowHeight);
  const startIndex = Math.floor(scrollTop / rowHeight);
  const endIndex = Math.min(startIndex + visibleRows + 1, sequences.length);

  const handleScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return (
    <div className={`w-full rounded-md border ${className}`}>
      <div ref={containerRef} className="max-h-[600px] overflow-auto" onScroll={handleScroll}>
        <table className="w-full border-collapse font-mono text-sm">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    className={`border-b border-border px-1 py-2 text-center ${
                      header.column.id === 'header'
                        ? 'sticky left-0 top-0 z-30 bg-muted border-r border-border'
                        : 'sticky top-0 z-20 bg-muted'
                    }`}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table
              .getRowModel()
              .rows.slice(startIndex, endIndex)
              .map(row => (
                <tr key={row.id} className="hover:bg-muted/50">
                  {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      className={`border-b border-border px-1 py-0.5 ${
                        cell.column.id === 'header'
                          ? 'sticky left-0 z-30 bg-background border-r border-border'
                          : ''
                      }`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
