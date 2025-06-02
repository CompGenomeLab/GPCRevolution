'use client';

import React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  getPaginationRowModel,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

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
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  return (
    <div className={`w-full rounded-md border ${className}`}>
      <div className="max-h-[600px] overflow-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <TableHead
                    key={header.id}
                    className={
                      header.column.id === 'header'
                        ? 'sticky left-0 top-0 z-30 bg-muted border-r'
                        : 'sticky top-0 z-20 bg-muted'
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map(row => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map(cell => (
                  <TableCell
                    key={cell.id}
                    className={
                      cell.column.id === 'header' ? 'sticky left-0 z-10 bg-background border-r' : ''
                    }
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between space-x-2 py-4 px-4 border-t">
        <div className="flex-1 text-sm text-muted-foreground">
          Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}{' '}
          to{' '}
          {Math.min(
            (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
            sequences.length
          )}{' '}
          of {sequences.length} sequences
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
