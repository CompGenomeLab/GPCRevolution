'use client'

import React, { useEffect, useState } from 'react'
import { usePhyleticDistribution } from '@/hooks/usePhyleticDistribution'
import { ControlPanel } from './ControlPanel'
import { GeneSelectionSidebar } from './GeneSelectionSidebar'
import { VisualizationCanvas } from './VisualizationCanvas'
import { Loader2 } from 'lucide-react'

// Loading overlay component
function LoadingOverlay({ isLoading, message }: { isLoading: boolean; message: string }) {
  if (!isLoading) return null;
  
  return (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
      <div className="bg-card rounded-lg p-6 shadow-2xl flex flex-col items-center max-w-sm mx-4 border border-border">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Processing...</h3>
        <p className="text-sm text-muted-foreground text-center">{message}</p>
      </div>
    </div>
  );
}

export function GeneVisualization() {
  const [showSidebar, setShowSidebar] = useState(true)
  const [showTaxonomyTree, setShowTaxonomyTree] = useState(false)
  const [taxonomyTreeNewick, setTaxonomyTreeNewick] = useState<string | null>(null)
  const {
    state,
    sourceData,
    sourceDataOptions,
    selectSourceData,
    loadCustomTSVData,
    setSelectedLevels,
    setNormalizeLevel,
    filterByLineage,
    filterByFamilyMin,
    filterByRankSize,
    filterAllZeroTaxa,
    resetFilters,
    toggleGeneSelection,
    toggleAllGenes,
    addDifferenceVisualization,
    SearchLineageInput,
    onWidthChange,
    rugMode,
    setRugMode,
  } = usePhyleticDistribution()

  useEffect(() => {
    let cancelled = false

    fetch('/phyletic-distribution/taxonomy_eukaryotes_filtered.nwk')
      .then(response => {
        if (!response.ok) throw new Error(`Could not load taxonomy hierarchy (HTTP ${response.status})`)
        return response.text()
      })
      .then(newick => {
        if (!cancelled) setTaxonomyTreeNewick(newick)
      })
      .catch(() => {
        if (!cancelled) {
          setTaxonomyTreeNewick(null)
          setShowTaxonomyTree(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleFileUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.tsv'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const text = e.target?.result as string
          loadCustomTSVData(text, file.name || 'User Input')
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }


  // Calculate coverage percentages (presence-based)
  // Input presence coverage: rows with >=1 count / total input rows
  const inputPresenceCoverage = state.totalInput > 0 ? ((
    (state.totalInputWithAnyCount || 0) / state.totalInput
  ) * 100).toFixed(1) : '0.0'
  // NCBI Taxonomy coverage: unique matched taxIDs with >=1 count / total reference taxa
  const uniprotCoverage = state.taxonCount > 0 ? ((
    (state.uniqueMatchedTaxaWithAnyCount || 0) / state.taxonCount
  ) * 100).toFixed(1) : '0.0'
  
  return (
    <section className="phyletic-distribution font-sans">

      {/* Controls */}
      <div className="bg-card border border-border rounded-lg shadow-sm px-3 sm:px-5 lg:px-6 py-2.5">
        <ControlPanel
          onLoadTSV={handleFileUpload}
          sourceDataOptions={sourceDataOptions}
          selectedSourceData={sourceData}
          onSourceDataChange={selectSourceData}
          selectedLevels={state.selectedLevels}
          onSelectedLevelsChange={setSelectedLevels}
          onResetFilter={resetFilters}
          geneNames={state.geneNames}
          onAddDifference={(gene1, gene2, useCounts) => addDifferenceVisualization({ gene1, gene2, useCounts })}
          normalizeLevel={state.normalizeLevel}
          onNormalizeLevel={setNormalizeLevel}
          onFilterByFamilyMin={filterByFamilyMin}
          onFilterByRankSize={filterByRankSize}
          onFilterAllZero={filterAllZeroTaxa}
          SearchLineageInput={SearchLineageInput}
          rugMode={rugMode}
          onRugModeChange={setRugMode}
          showTaxonomyTree={showTaxonomyTree}
          onShowTaxonomyTreeChange={setShowTaxonomyTree}
          taxonomyTreeAvailable={Boolean(taxonomyTreeNewick)}
        />
      </div>

      {/* Main Content */}
      <div className="py-4 flex flex-col lg:flex-row gap-4">
          {/* Sidebar */}
          {showSidebar ? (
            <div className="w-full lg:w-56 xl:w-64 flex-shrink-0 relative">
              <button
                onClick={() => setShowSidebar(false)}
                className="absolute top-2 right-2 h-7 w-7 rounded border bg-background hover:bg-accent flex items-center justify-center"
                aria-label="Collapse gene selection"
                title="Hide"
              >
                <span aria-hidden="true">&lsaquo;</span>
              </button>
              <div className="bg-card rounded-lg shadow-sm border border-border h-full">
                <GeneSelectionSidebar
                  geneNames={state.geneNames}
                  defaultGeneNames={state.defaultGeneNames}
                  customGeneNames={state.customGeneNames}
                  customTsvLabel={state.customTsvLabel}
                  activeGenes={state.activeGenes}
                  onToggleGene={toggleGeneSelection}
                  onToggleAll={toggleAllGenes}
                />
              </div>
            </div>
          ) : (
            <div className="flex-shrink-0">
              <button
                onClick={() => setShowSidebar(true)}
                className="h-7 w-7 rounded border bg-background hover:bg-accent flex items-center justify-center"
                aria-label="Expand gene selection"
                title="Expand"
              >
                <span aria-hidden="true">&rsaquo;</span>
              </button>
            </div>
          )}

          {/* Visualization Area */}
          <div className="flex-1 min-w-0 flex flex-col w-full">
            <div className="bg-card rounded-lg shadow-sm border border-border flex flex-col relative w-full">
              {/* Loading Overlay - positioned relative to visualization area */}
              <LoadingOverlay isLoading={state.isLoading} message={state.loadingMessage} />
              
              <div className={`p-3 flex flex-col w-full ${state.isLoading ? 'opacity-0 pointer-events-none' : ''}`}>
                {/* Mapping Info */}
                {state.totalInput > 0 && (
                  <div className="mb-3 p-2 bg-primary/10 border border-primary/20 rounded-lg">
                    <div className="text-sm font-medium text-foreground">
                      Selected source — NCBI Taxonomy coverage: {uniprotCoverage}% • input taxon coverage: {inputPresenceCoverage}%
                    </div>
                  </div>
                )}

                {/* Visualization */}
                <div className="w-full flex-1">
                  <VisualizationCanvas
                    data={state.raw}
                    selectedLevels={state.selectedLevels}
                    activeGenes={state.activeGenes}
                    coordMap={state.coordMap}
                    widthMap={state.widthMap}
                    countMap={state.countMap}
                    onLineageClick={filterByLineage}
                    onWidthChange={onWidthChange}
                    rugMode={rugMode}
                    onLoadTSV={handleFileUpload}
                    showTaxonomyTree={showTaxonomyTree}
                    taxonomyTreeNewick={taxonomyTreeNewick}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
    </section>
  )
} 
