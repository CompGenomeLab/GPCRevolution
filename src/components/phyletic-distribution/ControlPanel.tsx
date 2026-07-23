'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, Info, RefreshCw } from 'lucide-react'
import type { TaxonomicLevel } from '@/types/phyletic-distribution'
import {
  formatPhyleticGeneLabel,
  sortPhyleticGenes,
} from '@/lib/phyletic-distribution-families'

interface ControlPanelProps {
  onLoadTSV: () => void
  sourceDataOptions: Array<{ value: string; label: string }>
  selectedSourceData: string
  onSourceDataChange: (value: string) => void
  selectedLevels: TaxonomicLevel[]
  onSelectedLevelsChange: (levels: TaxonomicLevel[]) => void
  onResetFilter: () => void
  geneNames: string[]
  onAddDifference: (gene1: string, gene2: string, useCounts: boolean) => void
  normalizeLevel: TaxonomicLevel | '__ALL__' | null
  onNormalizeLevel: (level: TaxonomicLevel | '__ALL__' | null) => void
  onFilterByFamilyMin: (minimum: number, family?: string | 'ANY') => void
  onFilterByRankSize: (rank: TaxonomicLevel, minimumSpecies: number) => void
  onFilterAllZero: () => void
  SearchLineageInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => React.ReactElement
  rugMode: 'normalized' | 'binary' | 'heatmap'
  onRugModeChange: (mode: 'normalized' | 'binary' | 'heatmap') => void
  showTaxonomyTree: boolean
  onShowTaxonomyTreeChange: (show: boolean) => void
  taxonomyTreeAvailable: boolean
}

const allLevels: TaxonomicLevel[] = [
  'kingdom',
  'phylum',
  'subphylum',
  'superclass',
  'class',
  'superorder',
  'order',
  'suborder',
  'infraorder',
  'parvorder',
  'superfamily',
  'family',
  'subfamily',
  'genus',
  'species',
]

const controlClass =
  'flex h-14 min-w-fit flex-col items-start justify-between gap-1 rounded border border-border bg-muted/40 px-2 py-1'
const labelClass =
  'text-[10px] font-semibold uppercase leading-none tracking-wide text-muted-foreground'

const formatRankLabel = (level: string) =>
  level.charAt(0).toUpperCase() + level.slice(1)

function ControlHint({
  id,
  label,
  children,
  maxWidth = 320,
}: {
  id: string
  label: string
  children: React.ReactNode
  maxWidth?: number
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  const updatePosition = useCallback(() => {
    const button = buttonRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const margin = 8
    const viewportWidth = typeof window === 'undefined' ? maxWidth : window.innerWidth
    const width = Math.min(maxWidth, viewportWidth - margin * 2)
    const center = rect.left + rect.width / 2
    const left = Math.min(viewportWidth - margin - width / 2, Math.max(margin + width / 2, center))
    setPosition({ top: Math.round(rect.bottom + 6), left: Math.round(left) })
  }, [maxWidth])

  useEffect(() => {
    if (!open) return
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, updatePosition])

  return (
    <span className="inline-flex shrink-0 align-middle">
      <button
        ref={buttonRef}
        type="button"
        className="rounded-full p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => { setOpen(true); updatePosition() }}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => { setOpen(true); updatePosition() }}
        onBlur={() => setOpen(false)}
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none fixed z-[100110] w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1.5 text-left text-[11px] font-normal leading-snug text-popover-foreground shadow-lg"
          style={{
            top: position.top,
            left: position.left,
            maxWidth: `min(${maxWidth}px, calc(100vw - 1rem))`,
          }}
        >
          {children}
        </span>,
        document.body
      )}
    </span>
  )
}

function ControlHeading({
  title,
  hintId,
  hintLabel,
  children,
}: {
  title: string
  hintId: string
  hintLabel: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-0.5 leading-none">
      <span className={labelClass}>{title}</span>
      <ControlHint id={hintId} label={hintLabel}>{children}</ControlHint>
    </div>
  )
}

export function ControlPanel({
  onLoadTSV,
  sourceDataOptions,
  selectedSourceData,
  onSourceDataChange,
  selectedLevels,
  onSelectedLevelsChange,
  onResetFilter,
  geneNames,
  onAddDifference,
  normalizeLevel,
  onNormalizeLevel,
  onFilterByFamilyMin,
  onFilterByRankSize,
  onFilterAllZero,
  SearchLineageInput,
  rugMode,
  onRugModeChange,
  showTaxonomyTree,
  onShowTaxonomyTreeChange,
  taxonomyTreeAvailable,
}: ControlPanelProps) {
  const [diffGene1, setDiffGene1] = useState('')
  const [diffGene2, setDiffGene2] = useState('')
  const [useCounts, setUseCounts] = useState(false)
  const [filterFamily, setFilterFamily] = useState<string | 'ANY'>('ANY')
  const [familyMinimum, setFamilyMinimum] = useState(0)
  const [rankFilterLevel, setRankFilterLevel] = useState<TaxonomicLevel>('family')
  const [rankMinimumSpecies, setRankMinimumSpecies] = useState(0)
  const orderedGeneNames = sortPhyleticGenes(geneNames)

  useEffect(() => {
    setFamilyMinimum(0)
    setRankMinimumSpecies(0)
  }, [selectedSourceData])

  const handleLevelChange = (level: TaxonomicLevel, checked: boolean) => {
    onSelectedLevelsChange(
      checked
        ? [...selectedLevels, level]
        : selectedLevels.filter(selected => selected !== level)
    )
  }

  const handleAddDifference = () => {
    if (diffGene1 && diffGene2 && diffGene1 !== diffGene2) {
      onAddDifference(diffGene1, diffGene2, useCounts)
    }
  }

  const handleResetFilters = () => {
    setFamilyMinimum(0)
    setRankMinimumSpecies(0)
    onResetFilter()
  }

  return (
    <div className="flex w-full flex-wrap items-end gap-1.5 overflow-x-auto pb-1 text-[12px] xl:flex-nowrap">
      <div className={controlClass}>
        <ControlHeading title="Source Data" hintId="phyletic-hint-source" hintLabel="About Source Data">
          Choose one of the built-in GPCR family count tables. The table requiring all controls is
          loaded initially. Switching tables keeps any separately loaded User Input tracks.
        </ControlHeading>
        <Select value={selectedSourceData} onValueChange={onSourceDataChange}>
          <SelectTrigger className="h-7 w-48 text-xs [&>span]:truncate">
            <SelectValue placeholder="Choose source" />
          </SelectTrigger>
          <SelectContent>
            {sourceDataOptions.map(option => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={controlClass}>
        <ControlHeading title="User Data" hintId="phyletic-hint-user" hintLabel="About User Data">
          Add a tab-separated table with one row per taxon, a <span className="font-mono">taxID</span>{' '}
          column, and numeric family columns ending in <span className="font-mono">_count</span>.
          User tracks are added alongside the selected GPCR table rather than replacing it.
        </ControlHeading>
        <Button onClick={onLoadTSV} size="sm" className="h-7 px-2 text-xs">
          Add TSV
        </Button>
      </div>

      <div className={controlClass}>
        <ControlHeading title="Ranks to Show" hintId="phyletic-hint-ranks" hintLabel="About Ranks to Show">
          Choose which NCBI taxonomic ranks appear as colored rows beneath the hierarchy.
        </ControlHeading>
        <Select>
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue placeholder={`${selectedLevels.length} selected`} />
          </SelectTrigger>
          <SelectContent onCloseAutoFocus={event => event.preventDefault()}>
            {allLevels.map(level => (
              <div
                key={level}
                className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs hover:bg-accent"
                onClick={event => {
                  event.preventDefault()
                  event.stopPropagation()
                  handleLevelChange(level, !selectedLevels.includes(level))
                }}
              >
                <Checkbox
                  checked={selectedLevels.includes(level)}
                  onCheckedChange={checked => handleLevelChange(level, checked as boolean)}
                  onClick={event => event.stopPropagation()}
                />
                <span className="capitalize">{level}</span>
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={controlClass}>
        <ControlHeading title="Search Lineage" hintId="phyletic-hint-search" hintLabel="About Search Lineage">
          Jump to a specific lineage. Use the reset button to return to the complete taxonomy and
          clear the species and rank filters.
        </ControlHeading>
        <div className="flex items-center gap-1">
          <div className="w-32">
            <SearchLineageInput placeholder="Search lineage" className="h-7 w-full text-xs" />
          </div>
          <Button
            onClick={handleResetFilters}
            size="sm"
            variant="outline"
            className="h-7 px-2"
            aria-label="Reset filters"
            title="Reset filters"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className={controlClass}>
        <ControlHeading title="Visualization" hintId="phyletic-hint-visualization" hintLabel="About Visualization">
          <span className="block"><span className="font-semibold">Normalize width</span> gives each group at the selected rank equal visual width, reducing taxon-sampling bias.</span>
          <span className="mt-2 block"><span className="font-semibold">Family tracks</span> displays counts as presence/absence, values normalized within each family, or a shared count heatmap.</span>
        </ControlHeading>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 w-32 justify-between px-2 text-xs">
              Settings
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3">
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span>Normalize width</span>
                <Select
                  value={normalizeLevel || 'none'}
                  onValueChange={value =>
                    onNormalizeLevel(value === 'none' ? null : value as TaxonomicLevel)
                  }
                >
                  <SelectTrigger className="h-7 w-36 text-xs">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {allLevels.map(level => (
                      <SelectItem key={level} value={level}>
                        {formatRankLabel(level)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Family tracks</span>
                <Select value={rugMode} onValueChange={onRugModeChange}>
                  <SelectTrigger className="h-7 w-36 text-xs">
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="binary">Binary</SelectItem>
                    <SelectItem value="normalized">Normalized</SelectItem>
                    <SelectItem value="heatmap">Heatmap</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div
        className={`${controlClass} ${
          taxonomyTreeAvailable ? 'cursor-pointer' : 'cursor-not-allowed text-muted-foreground'
        }`}
      >
        <ControlHeading title="NCBI Taxonomy" hintId="phyletic-hint-taxonomy" hintLabel="About NCBI Taxonomy">
          Show the complete sampled NCBI Taxonomy hierarchy above the bars. It includes populated
          named ranks, clades, and no-rank groups, skips NA values, and represents taxonomy rather
          than evolutionary branch lengths.
        </ControlHeading>
        <label
          className="flex h-7 items-center gap-2 px-1 text-xs"
          title={taxonomyTreeAvailable ? 'Show hierarchy' : 'Taxonomy hierarchy is loading'}
        >
          <Checkbox
            checked={showTaxonomyTree}
            disabled={!taxonomyTreeAvailable}
            onCheckedChange={checked => onShowTaxonomyTreeChange(Boolean(checked))}
          />
          Show tree
        </label>
      </div>

      <div className={controlClass}>
        <ControlHeading title="Compare Families" hintId="phyletic-hint-compare" hintLabel="About Compare Families">
          Add tracks emphasizing taxa where one family is present and the other is absent, and vice
          versa. Enable <span className="font-semibold">Use counts</span> to compare abundance instead
          of simple presence and absence.
        </ControlHeading>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 w-32 justify-between px-2 text-xs">
              Create
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3">
            <div className="space-y-2 text-xs">
              <Select value={diffGene1} onValueChange={setDiffGene1}>
                <SelectTrigger className="h-7 w-full text-xs">
                  <SelectValue placeholder="First family" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {orderedGeneNames.map(gene => (
                    <SelectItem key={gene} value={gene}>
                      {formatPhyleticGeneLabel(gene)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={diffGene2} onValueChange={setDiffGene2}>
                <SelectTrigger className="h-7 w-full text-xs">
                  <SelectValue placeholder="Second family" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {orderedGeneNames.map(gene => (
                    <SelectItem key={gene} value={gene}>
                      {formatPhyleticGeneLabel(gene)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5">
                  <Checkbox
                    checked={useCounts}
                    onCheckedChange={checked => setUseCounts(Boolean(checked))}
                  />
                  Use counts
                </label>
                <Button
                  onClick={handleAddDifference}
                  size="sm"
                  disabled={!diffGene1 || !diffGene2 || diffGene1 === diffGene2}
                  className="h-7 px-3 text-xs"
                >
                  Add
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className={controlClass}>
        <ControlHeading title="Filter Taxa" hintId="phyletic-hint-filter" hintLabel="About Filter Taxa">
          Remove species with no positive counts, keep species meeting a minimum for a selected
          family, or retain rank groups containing a minimum number of species. These filters are
          independent and combine when more than one is applied.
        </ControlHeading>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 w-40 justify-between px-2 text-xs">
              Species &amp; rank filters
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-96 p-3">
            <div className="space-y-3 text-xs">
              <Button
                onClick={onFilterAllZero}
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
              >
                Remove all-zero species
              </Button>
              <div className="space-y-2 border-t border-border pt-3">
                <p className="font-medium text-foreground">Filter species by gene count</p>
                <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                  <span className="text-muted-foreground">Family</span>
                  <Select value={filterFamily} onValueChange={setFilterFamily}>
                    <SelectTrigger className="h-7 min-w-0 text-xs">
                      <SelectValue placeholder="Choose family" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      <SelectItem value="ANY">Any family</SelectItem>
                      {orderedGeneNames.map(gene => (
                        <SelectItem key={gene} value={gene}>
                          {formatPhyleticGeneLabel(gene)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2">
                  <span className="text-muted-foreground">Minimum count</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={familyMinimum === 0 ? '' : String(familyMinimum)}
                    onChange={event => {
                      const numeric = event.target.value.replace(/[^0-9]/g, '')
                      setFamilyMinimum(numeric === '' ? 0 : Number(numeric))
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Enter') onFilterByFamilyMin(familyMinimum, filterFamily)
                    }}
                    className="h-7 min-w-0 px-2 text-xs"
                    placeholder="0"
                    aria-label="Minimum family count"
                  />
                  <Button
                    onClick={() => onFilterByFamilyMin(familyMinimum, filterFamily)}
                    size="sm"
                    className="h-7 px-2 text-xs"
                  >
                    Apply
                  </Button>
                </div>
              </div>
              <div className="space-y-2 border-t border-border pt-3">
                <p className="font-medium text-foreground">Filter rank groups by species count</p>
                <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                  <span className="text-muted-foreground">Rank</span>
                  <Select
                    value={rankFilterLevel}
                    onValueChange={value => setRankFilterLevel(value as TaxonomicLevel)}
                  >
                    <SelectTrigger className="h-7 min-w-0 text-xs">
                      <SelectValue placeholder="Choose rank" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {allLevels.map(level => (
                        <SelectItem key={level} value={level} className="capitalize">
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2">
                  <span className="text-muted-foreground">Minimum species</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={rankMinimumSpecies === 0 ? '' : String(rankMinimumSpecies)}
                    onChange={event => {
                      const numeric = event.target.value.replace(/[^0-9]/g, '')
                      setRankMinimumSpecies(numeric === '' ? 0 : Number(numeric))
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        onFilterByRankSize(rankFilterLevel, rankMinimumSpecies)
                      }
                    }}
                    className="h-7 min-w-0 px-2 text-xs"
                    placeholder="0"
                    aria-label="Minimum species per rank group"
                  />
                  <Button
                    onClick={() => onFilterByRankSize(rankFilterLevel, rankMinimumSpecies)}
                    size="sm"
                    className="h-7 px-2 text-xs"
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
