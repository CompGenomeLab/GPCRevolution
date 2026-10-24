'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SortTh, downloadTsv } from '@/components/species/SpeciesViewer'
import { ControlHint } from './ControlPanel'
import { formatPhyleticGeneLabel } from '@/lib/phyletic-distribution-families'
import type { GeneCountData, TaxonomicLevel, TaxonomyRecord } from '@/types/phyletic-distribution'

const fmtInt = (n: number) => n.toLocaleString('en-US')

/** The genome's name as in the plot: the strain if there is one, otherwise the species. */
function genomeName(row: TaxonomyRecord) {
  const strain = String(row.Strain ?? 'NA')
  const species = String(row.species ?? row.Species ?? 'NA')
  return strain !== 'NA' ? strain : species !== 'NA' ? species : String(row.taxID)
}

const lineageValue = (row: TaxonomyRecord, level: string) => {
  const v = String(row[level] ?? '')
  return v === 'NA' ? '' : v
}

/** The genomes in view with their lineages and their counts for the shown families, in the order of the plot. */
export function CountTable({ data, selectedLevels, activeGenes, countMap }: {
  data: TaxonomyRecord[]
  selectedLevels: TaxonomicLevel[]
  activeGenes: string[]
  countMap: Map<string, GeneCountData>
}) {
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null)
  const onSort = (col: string) => setSort(cur =>
    !cur || cur.col !== col ? { col, dir: -1 } : cur.dir === -1 ? { col, dir: 1 } : null)
  // the species column is always shown, so the species rank is not repeated as a lineage column
  const levels = selectedLevels.filter(l => l !== 'species')

  // Rows in the order of the clicked column; without one, in the order of the plot.
  const rows = useMemo(() => {
    if (!sort) return data
    const key = (r: TaxonomyRecord): string | number => {
      if (sort.col === 'species') return genomeName(r).toLowerCase()
      if (sort.col.startsWith('lin:')) return lineageValue(r, sort.col.slice(4)).toLowerCase()
      return countMap.get(String(r.taxID))?.[sort.col.slice(4)] ?? 0
    }
    return [...data].sort((a, b) => {
      const ka = key(a), kb = key(b)
      // empty values stay at the end in both directions
      if ((ka === '') !== (kb === '')) return ka === '' ? 1 : -1
      return (ka < kb ? -1 : ka > kb ? 1 : 0) * sort.dir
    })
  }, [data, sort, countMap])

  if (!data.length) return null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">
          Counts per family{' '}
          <ControlHint id="hint-count-table" label="About the count table">
            The genomes shown in the plot, with the lineages and families selected above, at the Source Data step
            selected. Clicking a lineage in the plot narrows the table to it. Click a column header to sort.
          </ControlHint>{' '}
          <span className="text-sm font-normal text-muted-foreground">{fmtInt(data.length)} genomes</span>
        </h2>
        <Button variant="outline" size="sm" onClick={() => downloadTsv(
          'phyletic_distribution_counts.tsv',
          ['taxID', 'species', ...levels, ...activeGenes.map(formatPhyleticGeneLabel)],
          rows.map(r => {
            const counts = countMap.get(String(r.taxID))
            return [String(r.taxID), genomeName(r), ...levels.map(l => lineageValue(r, l)),
                    ...activeGenes.map(g => counts?.[g] ?? 0)]
          }))}>
          <Download className="mr-1 h-4 w-4" /> TSV
        </Button>
      </div>
      <div className="max-h-[640px] w-fit max-w-full overflow-auto rounded-lg border">
        <table className="whitespace-nowrap text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {levels.map(l => (
                <SortTh key={l} col={'lin:' + l} sort={sort} onSort={onSort}>{l}</SortTh>
              ))}
              <SortTh col="species" sort={sort} onSort={onSort}>Species</SortTh>
              {activeGenes.map(g => (
                <SortTh key={g} col={'fam:' + g} sort={sort} onSort={onSort} className="text-right">
                  {formatPhyleticGeneLabel(g)}
                </SortTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const taxID = String(r.taxID)
              const counts = countMap.get(taxID)
              return (
                <tr key={taxID} className="border-t">
                  {levels.map(l => (
                    <td key={l} className="px-3 py-1 text-xs">{lineageValue(r, l) || <span className="text-muted-foreground">–</span>}</td>
                  ))}
                  <td className="px-3 py-1 text-xs italic">
                    <Link className="underline decoration-dotted" href={`/species?taxid=${encodeURIComponent(taxID)}`}>
                      {genomeName(r)}
                    </Link>
                  </td>
                  {activeGenes.map(g => {
                    const c = counts?.[g] ?? 0
                    return <td key={g} className={`px-3 py-1 text-right tabular-nums ${c ? '' : 'text-muted-foreground'}`}>{fmtInt(c)}</td>
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
