'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import {
  Activity,
  CheckSquare,
  Dna,
  GitCompare,
  House,
  Square,
  Upload,
} from 'lucide-react'
import {
  formatPhyleticGeneMenuLabel,
  formatPhyleticGeneMenuTooltip,
  isGProteinSignalingControl,
  isHousekeepingControl,
  sortPhyleticGenes,
} from '@/lib/phyletic-distribution-families'

interface GeneSelectionSidebarProps {
  geneNames: string[]
  defaultGeneNames: string[]
  customGeneNames: string[]
  customTsvLabel: string | null
  activeGenes: string[]
  onToggleGene: (gene: string) => void
  onToggleAll: () => void
}

interface SelectionSectionProps {
  title: string
  genes: string[]
  activeGenes: string[]
  icon: React.ReactNode
  accent?: boolean
  onToggleGene: (gene: string) => void
}

function SelectionSection({
  title,
  genes,
  activeGenes,
  icon,
  accent = false,
  onToggleGene,
}: SelectionSectionProps) {
  const activeCount = genes.filter(gene => activeGenes.includes(gene)).length

  return (
    <div>
      <div className="mb-2 space-y-1">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
          {icon}
          <span className="min-w-0 leading-tight" title={title}>{title}</span>
        </h3>
        <div className="flex items-center gap-1 pl-6">
          <Badge variant="secondary" className="text-xs">{genes.length} total</Badge>
          {activeCount > 0 && (
            <Badge variant="default" className="bg-primary/10 text-xs text-primary">
              {activeCount} active
            </Badge>
          )}
        </div>
      </div>

      <Card className={accent ? 'border-primary/20' : 'border-border'}>
        <CardContent className="p-2">
          <div className="grid grid-cols-2 gap-1">
            {genes.map(gene => (
              <label
                key={gene}
                className="group flex cursor-pointer items-center space-x-1 rounded p-1 hover:bg-accent"
              >
                <Checkbox
                  checked={activeGenes.includes(gene)}
                  onCheckedChange={() => onToggleGene(gene)}
                />
                <span
                  className={`flex-1 truncate text-xs font-medium ${accent ? 'text-primary' : 'text-foreground/80 group-hover:text-foreground'}`}
                  title={formatPhyleticGeneMenuTooltip(gene)}
                >
                  {formatPhyleticGeneMenuLabel(gene)}
                </span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function GeneSelectionSidebar({
  geneNames,
  defaultGeneNames,
  customGeneNames,
  customTsvLabel,
  activeGenes,
  onToggleGene,
  onToggleAll,
}: GeneSelectionSidebarProps) {
  const defaultSet = new Set(defaultGeneNames)
  const customSet = new Set(customGeneNames)
  const comparisonGenes = geneNames.filter(gene => !defaultSet.has(gene) && !customSet.has(gene))
  const housekeepingControls = sortPhyleticGenes(
    defaultGeneNames.filter(isHousekeepingControl)
  )
  const gProteinSignalingControls = sortPhyleticGenes(
    defaultGeneNames.filter(isGProteinSignalingControl)
  )
  const gpcrFamilies = sortPhyleticGenes(
    defaultGeneNames.filter(
      gene => !isHousekeepingControl(gene) && !isGProteinSignalingControl(gene)
    )
  )

  return (
    <div className="flex flex-col">
      <CardHeader className="px-3 pb-1">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Dna className="h-5 w-5 text-primary" />
          Family Selection
        </CardTitle>
        <div className="mt-1 flex flex-wrap gap-1">
          <Button
            onClick={onToggleAll}
            size="sm"
            variant="outline"
            className="flex h-7 items-center gap-1 px-2 text-xs"
          >
            {activeGenes.length === 0 ? (
              <>
                <CheckSquare className="h-3 w-3" />
                Select All
              </>
            ) : (
              <>
                <Square className="h-3 w-3" />
                Deselect All
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="px-3 pb-3 pt-0">
        <div className="flex flex-col space-y-3">
          {defaultGeneNames.length > 0 ? (
            <>
              {housekeepingControls.length > 0 && (
                <SelectionSection
                  title="Housekeeping Controls"
                  genes={housekeepingControls}
                  activeGenes={activeGenes}
                  icon={<House className="h-4 w-4 text-muted-foreground" />}
                  onToggleGene={onToggleGene}
                />
              )}
              {gProteinSignalingControls.length > 0 && (
                <SelectionSection
                  title="G-Protein Signaling Controls"
                  genes={gProteinSignalingControls}
                  activeGenes={activeGenes}
                  icon={<Activity className="h-4 w-4 text-muted-foreground" />}
                  onToggleGene={onToggleGene}
                />
              )}
              {gpcrFamilies.length > 0 && (
                <SelectionSection
                  title="GPCR Families"
                  genes={gpcrFamilies}
                  activeGenes={activeGenes}
                  icon={<Dna className="h-4 w-4 text-muted-foreground" />}
                  onToggleGene={onToggleGene}
                />
              )}
            </>
          ) : (
            <div className="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">
              Loading default family data...
            </div>
          )}

          {customGeneNames.length > 0 && (
            <>
              <Separator />
              <SelectionSection
                title={customTsvLabel ? `User Input: ${customTsvLabel}` : 'User Input'}
                genes={sortPhyleticGenes(customGeneNames)}
                activeGenes={activeGenes}
                icon={<Upload className="h-4 w-4 text-muted-foreground" />}
                onToggleGene={onToggleGene}
              />
            </>
          )}

          {comparisonGenes.length > 0 && (
            <>
              <Separator />
              <SelectionSection
                title="Comparisons"
                genes={sortPhyleticGenes(comparisonGenes)}
                activeGenes={activeGenes}
                icon={<GitCompare className="h-4 w-4 text-primary" />}
                accent
                onToggleGene={onToggleGene}
              />
            </>
          )}
        </div>
      </CardContent>
    </div>
  )
}
