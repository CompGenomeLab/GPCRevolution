'use client';

import React, { useCallback, useState } from 'react';
import SuperfamilyLogo from '@/components/SuperfamilyLogo';
import { Card, CardContent } from '@/components/ui/card';
import FamilyScatterPlot from '@/components/FamilyScatterPlot';
import { Button } from '@/components/ui/button';
import { isBackgroundFamily } from '@/lib/superfamilyBackground';
import { ControlHint } from '@/components/phyletic-distribution/ControlPanel';

// Superfamily alignments: four sequence sets, each aligned with two gap settings. Every one has
// its own precomputed mapping folder, public/superfamily_logo_mappings<set suffix><gap suffix>.
const gapPenaltyOptions = {
  higher: { label: 'Higher', suffix: '' },
  lower: { label: 'Lower', suffix: '_lower_gap' }
} as const;
type GapPenalty = keyof typeof gapPenaltyOptions;

const sequenceSetOptions = {
  all: { label: 'All families', suffix: '' },
  no_ste2: { label: 'Without STE2', suffix: '_no_ste2' },
  core: { label: 'Without STE2, STE3, Class C and V2R', suffix: '_no_ste2ste3classCV2' },
  literature: { label: 'Core with literature sequences', suffix: '_and_literature' }
} as const;
type SequenceSet = keyof typeof sequenceSetOptions;

// Guide tree of the G-INS-i alignment: MAFFT's own, or the ML tree (STE2, (Glutamate, rest)).
const guideTreeOptions = {
  default: { label: 'MAFFT default', suffix: '' },
  treein: { label: 'ML tree', suffix: '_treein' }
} as const;
type GuideTree = keyof typeof guideTreeOptions;

// Family selection IDs. Runtime logo/scatter data comes from public/superfamily_logo_mappings/*.json.
const fastaNames = [
  'classA_genes_filtered_db_FAMSA.ref_trimmed',
  'classB1_genes_filtered_db_FAMSA.ref_trimmed',
  'classB2_genes_filtered_db_FAMSA.ref_trimmed',
  'classC_genes_filtered_db_FAMSA.ref_trimmed',
  'classF_genes_filtered_db_FAMSA.ref_trimmed',
  'FSLB_genes_filtered_db_FAMSA.ref_trimmed',
  'classT_genes_filtered_db_FAMSA.ref_trimmed',
  'Olfactory_genes_filtered_db_FAMSA.ref_trimmed',
  'GPR1_genes_filtered_db_FAMSA.ref_trimmed',
  'GP143_genes_filtered_db_FAMSA.ref_trimmed',
  'GP157_genes_filtered_db_FAMSA.ref_trimmed',
  'cAMP_genes_filtered_db_FAMSA.ref_trimmed',
  'STE2_genes_filtered_db_FAMSA.ref_trimmed',
  'STE3_genes_filtered_db_FAMSA.ref_trimmed',
  'TM116_genes_filtered_db_FAMSA.ref_trimmed',
  'Vomeronasal1_genes_filtered_db_FAMSA.ref_trimmed',
  'Vomeronasal2_genes_filtered_db_FAMSA.ref_trimmed',
  'Mth_genes_filtered_db_FAMSA.ref_trimmed',
  'Nematode_genes_filtered_db_FAMSA.ref_trimmed'
];

// Custom order for "Select All".
const selectAllOrder = [
  'classA_genes_filtered_db_FAMSA.ref_trimmed',
  'Olfactory_genes_filtered_db_FAMSA.ref_trimmed',
  'classT_genes_filtered_db_FAMSA.ref_trimmed',
  'Vomeronasal1_genes_filtered_db_FAMSA.ref_trimmed',
  'Nematode_genes_filtered_db_FAMSA.ref_trimmed',
  'GPR1_genes_filtered_db_FAMSA.ref_trimmed',
  'cAMP_genes_filtered_db_FAMSA.ref_trimmed',
  'classF_genes_filtered_db_FAMSA.ref_trimmed',
  'FSLB_genes_filtered_db_FAMSA.ref_trimmed',
  'GP143_genes_filtered_db_FAMSA.ref_trimmed',
  'TM116_genes_filtered_db_FAMSA.ref_trimmed',
  'GP157_genes_filtered_db_FAMSA.ref_trimmed',
  'Mth_genes_filtered_db_FAMSA.ref_trimmed',
  'classB2_genes_filtered_db_FAMSA.ref_trimmed',
  'classB1_genes_filtered_db_FAMSA.ref_trimmed',
  'STE3_genes_filtered_db_FAMSA.ref_trimmed',
  'classC_genes_filtered_db_FAMSA.ref_trimmed',
  'Vomeronasal2_genes_filtered_db_FAMSA.ref_trimmed',
  // In no receptorGroups bracket, so kept last where it splits no group.
  'STE2_genes_filtered_db_FAMSA.ref_trimmed'
];

export default function SuperfamilyLogoPage() {
  const [filteredPositions, setFilteredPositions] = useState<number[]>([]);
  // Stable callback that keeps the old array when the selection is unchanged: the scatter plot
  // reports its selection whenever this callback changes, so a new one (or a new empty array)
  // on every render would re-render the page forever.
  const handleScatterSelection = useCallback((positions: number[]) => {
    setFilteredPositions((prev) =>
      prev.length === positions.length && prev.every((p, i) => p === positions[i]) ? prev : positions);
  }, []);
  const [selectedFamilies, setSelectedFamilies] = useState<string[]>([]);
  const [selectedAlignments, setSelectedAlignments] = useState<string[]>([]);
  const [showReferenceRows, setShowReferenceRows] = useState(false);
  const [showProteinRegions, setShowProteinRegions] = useState(false);
  // Mapping confidence of each family position (share of the family's representatives
  // that place it in that superfamily column): positions below the minimum are masked, and a
  // bar row shows column means.
  const [minMappingConfidence, setMinMappingConfidence] = useState(0);
  const [showConfidenceBars, setShowConfidenceBars] = useState(false);
  const [regionSourceAlignment, setRegionSourceAlignment] = useState<string | null>(null);
  const [rowHeight, setRowHeight] = useState(30);
  const [minConservationThreshold, setMinConservationThreshold] = useState(0);
  const [minFamiliesCount, setMinFamiliesCount] = useState(0);
  const [gapPenalty, setGapPenalty] = useState<GapPenalty>('higher');
  const [sequenceSet, setSequenceSet] = useState<SequenceSet>('all');
  const [guideTree, setGuideTree] = useState<GuideTree>('default');
  const mappingsDir =
    `superfamily_logo_mappings${sequenceSetOptions[sequenceSet].suffix}${gapPenaltyOptions[gapPenalty].suffix}` +
    guideTreeOptions[guideTree].suffix;
  // Background families are shown but not counted towards the families-above-threshold filter.
  const coreSelectedCount = selectedAlignments.filter((name) => !isBackgroundFamily(name)).length;

  // Note: filteredPositions will be empty array initially, which means "show all positions"
  // Function to get display name for a FASTA file (for UI elements like checkboxes)
  const getDisplayName = useCallback((fileName: string): string => {
    const baseName = fileName.split('_')[0];
    
    const displayNameMap: Record<string, string> = {
      'classA': 'Class A',
      'classB1': 'Class B1',
      'classB2': 'Class B2',
      'classC': 'Class C',
      'classF': 'Class F',
      'FSLB': 'FSL',
      'classT': 'Taste-2',
      'Vomeronasal1': 'Vomeronasal 1',
      'Vomeronasal2': 'Vomeronasal 2',
      'Olfactory': 'Olfactory',
      'GPR1': 'GPR1',
      'GP143': 'GP143',
      'GP157': 'GP157',
      'cAMP': 'cAMP',
      'STE2': 'STE2',
      'STE3': 'STE3',
      'TM116': 'TMEM116',
      'Mth': 'Mth',
      'Nematode': 'Nematode'
    };

    return displayNameMap[baseName] || baseName;
  }, []);

  // Function to get short display name for plot labels
  const getPlotDisplayName = useCallback((fileName: string): string => {
    const baseName = fileName.split('_')[0];
    
    const plotNameMap: Record<string, string> = {
      'classA': 'Class A',
      'classB1': 'Class B1',
      'classB2': 'Class B2',
      'classC': 'Class C',
      'classF': 'Class F',
      'FSLB': 'FSL',
      'classT': 'Taste-2',
      'Vomeronasal1': 'V1R',
      'Vomeronasal2': 'V2R',
      'Olfactory': 'Olfactory',
      'GPR1': 'GPR1',
      'GP143': 'GP143',
      'GP157': 'GP157',
      'cAMP': 'cAMP',
      'STE2': 'STE2',
      'STE3': 'STE3',
      'TM116': 'TMEM116',
      'Mth': 'Mth',
      'Nematode': 'Nematode'
    };

    return plotNameMap[baseName] || baseName;
  }, []);
  const handleAlignmentToggle = (name: string) => {
    const newSelection = selectedAlignments.includes(name) 
      ? selectedAlignments.filter(n => n !== name)
      : [...selectedAlignments, name];
    
    setSelectedAlignments(newSelection);
    setSelectedFamilies(newSelection);
  };

  const handleSelectAll = () => {
    setSelectedAlignments(selectAllOrder);
    setSelectedFamilies(selectAllOrder);
  };

  const handleSelectNone = () => {
    setSelectedAlignments([]);
    setSelectedFamilies([]);
  };

  React.useEffect(() => {
    if (selectedAlignments.length === 0) {
      setRegionSourceAlignment(null);
      return;
    }
    if (!regionSourceAlignment || !selectedAlignments.includes(regionSourceAlignment)) {
      setRegionSourceAlignment(selectedAlignments[0]);
    }
  }, [selectedAlignments, regionSourceAlignment]);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="max-w-6xl space-y-4 mb-6">
        <h1 className="text-3xl font-bold text-left">Superfamily Logo Comparison</h1>
        <p className="text-base text-muted-foreground text-left">
          Compare sequence conservation logos across selected GPCR families at the superfamily level.
          Use the scatter plot and filters to focus informative positions, then inspect GPCRdb numbering
          and inferred region blocks for the selected family context.
        </p>
      </div>

      {/* Combined Controls and Scatter Plot Section */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row gap-6 h-full">
            {/* Left: Scatter Plot */}
            <div className="flex-1 lg:w-1/2">
              <FamilyScatterPlot
                fastaNames={fastaNames}
                getDisplayName={getDisplayName}
                onSelectionChange={handleScatterSelection}
                selectedFamilies={selectedFamilies}
                height={500}
                minConservationThreshold={minConservationThreshold}
                minFamiliesCount={minFamiliesCount}
                mappingsDir={mappingsDir}
              />
            </div>

            {/* Vertical Divider */}
            <div className="hidden lg:block w-px bg-border self-stretch"></div>

            {/* Right: Controls */}
            <div className="flex-1 lg:w-1/2 flex flex-col">
              <h3 className="text-lg font-semibold mb-3">Logo Controls</h3>

              {/* Superfamily alignment: sequence set */}
              <div className="mb-2 flex items-center gap-2">
                <label htmlFor="sequence-set" className="text-sm font-medium">Alignment Sequence Set:</label>
                <select
                  id="sequence-set"
                  value={sequenceSet}
                  onChange={(e) => {
                    // the scatter plot re-applies its brushed value ranges to the new alignment's positions
                    setSequenceSet(e.target.value as SequenceSet);
                  }}
                  className="h-8 rounded border bg-background px-2 text-sm text-foreground"
                >
                  {(Object.keys(sequenceSetOptions) as SequenceSet[]).map((key) => (
                    <option key={key} value={key}>{sequenceSetOptions[key].label}</option>
                  ))}
                </select>
                <ControlHint id="sequence-set-hint" label="About the alignment sequence sets">
                  The superfamily alignment was built from four sets of family representatives.{' '}
                  <strong>All families</strong> holds every family. <strong>Without STE2</strong> leaves out
                  the STE2 control. <strong>Without STE2, STE3, Class C and V2R</strong> also leaves out the
                  most divergent families. <strong>Core with literature sequences</strong> adds published
                  receptor sequences to that set. A family that is not in the chosen set has no logo row.
                  Column numbers differ between the alignments, so switching clears the scatter-plot
                  selection.
                </ControlHint>
              </div>

              {/* Superfamily alignment: gap penalty */}
              <div className="mb-2 flex items-center gap-2">
                <label htmlFor="gap-penalty" className="text-sm font-medium">Alignment Gap Penalty:</label>
                <select
                  id="gap-penalty"
                  value={gapPenalty}
                  onChange={(e) => {
                    // the scatter plot re-applies its brushed value ranges to the new alignment's positions
                    setGapPenalty(e.target.value as GapPenalty);
                  }}
                  className="h-8 rounded border bg-background px-2 text-sm text-foreground"
                >
                  {(Object.keys(gapPenaltyOptions) as GapPenalty[]).map((key) => (
                    <option key={key} value={key}>{gapPenaltyOptions[key].label}</option>
                  ))}
                </select>
                <ControlHint id="gap-penalty-hint" label="About the alignment gap penalty">
                  The superfamily alignment of family representatives was built with MAFFT G-INS-i in two
                  ways. <strong>Higher</strong> adds an offset (--ep 0.123) that acts like a gap-extension
                  penalty, so sequences are held in shared columns rather than opening gaps.{' '}
                  <strong>Lower</strong> drops that offset and allows longer gaps. Columns conserved across
                  several families are nearly identical in both; the differences fall mostly in loops, helix
                  ends and the cytoplasmic half of TM5. Column numbers differ between the two, so switching
                  clears the scatter-plot selection.
                </ControlHint>
              </div>

              {/* Superfamily alignment: guide tree */}
              <div className="mb-4 flex items-center gap-2">
                <label htmlFor="guide-tree" className="text-sm font-medium">Alignment Guide Tree:</label>
                <select
                  id="guide-tree"
                  value={guideTree}
                  onChange={(e) => {
                    // the scatter plot re-applies its brushed value ranges to the new alignment's positions
                    setGuideTree(e.target.value as GuideTree);
                  }}
                  className="h-8 rounded border bg-background px-2 text-sm text-foreground"
                >
                  {(Object.keys(guideTreeOptions) as GuideTree[]).map((key) => (
                    <option key={key} value={key}>{guideTreeOptions[key].label}</option>
                  ))}
                </select>
                <ControlHint id="guide-tree-hint" label="About the alignment guide tree">
                  <strong>MAFFT default</strong> lets G-INS-i build its own guide tree.{' '}
                  <strong>ML tree</strong> aligns the families in the order of the maximum-likelihood tree
                  of the representatives, rooted between the Glutamate-related families and the rest, with
                  STE2 merged last against the whole superfamily. Column numbers differ between the
                  alignments, so switching clears the scatter-plot selection.
                </ControlHint>
              </div>

              {/* Family Selection */}
              <div className="mb-4 flex-grow flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Select Families:</label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleSelectAll}
                      className="h-7 px-2 text-xs"
                    >
                      All
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSelectNone}
                      className="h-7 px-2 text-xs"
                    >
                      None
                    </Button>
                  </div>
                </div>
                <div className="flex-grow overflow-y-auto border rounded p-2">
                  <div className="grid grid-cols-2 gap-1">
                    {fastaNames.map((name) => (
                      <label key={name} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={selectedAlignments.includes(name)}
                          onChange={() => handleAlignmentToggle(name)}
                          className="cursor-pointer"
                        />
                        <span>{getDisplayName(name)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Row Height Control */}
              <div className="mb-4">
                <label className="text-sm font-medium block mb-2">Row Height:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={rowHeight}
                    onChange={(e) => setRowHeight(Number(e.target.value))}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={rowHeight}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (!isNaN(val)) {
                        setRowHeight(Math.min(100, Math.max(0, val)));
                      }
                    }}
                    className="w-16 px-2 py-1 text-xs border rounded bg-background text-foreground text-center"
                  />
                </div>
              </div>

              {/* Conservation Filter */}
              <div className="mb-4">
                <label className="text-sm font-medium block mb-2">Minimum Conservation %:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={minConservationThreshold}
                    onChange={(e) => setMinConservationThreshold(Number(e.target.value))}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={minConservationThreshold}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (!isNaN(val)) {
                        setMinConservationThreshold(Math.min(100, Math.max(0, val)));
                      }
                    }}
                    className="w-16 px-2 py-1 text-xs border rounded bg-background text-foreground text-center"
                  />
                </div>
              </div>

              {/* # of Families with Minimum Conservation Filter */}
              <div className="mb-4">
                <label className="text-sm font-medium block mb-2"># of Families with Minimum Conservation:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max={Math.max(1, coreSelectedCount)}
                    value={Math.min(minFamiliesCount, Math.max(1, coreSelectedCount))}
                    onChange={(e) => setMinFamiliesCount(Number(e.target.value))}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={minFamiliesCount}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (!isNaN(val) && val >= 0) {
                        setMinFamiliesCount(val);
                      }
                    }}
                    className="w-16 px-2 py-1 text-xs border rounded bg-background text-foreground text-center"
                  />
                </div>
              </div>

              {/* Mapping confidence mask */}
              <div className="mb-4">
                <label className="text-sm font-medium block mb-2">Minimum Mapping Confidence:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={minMappingConfidence}
                    onChange={(e) => setMinMappingConfidence(Number(e.target.value))}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={minMappingConfidence}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (!isNaN(val)) {
                        setMinMappingConfidence(Math.min(1, Math.max(0, val)));
                      }
                    }}
                    className="w-16 px-2 py-1 text-xs border rounded bg-background text-foreground text-center"
                  />
                </div>
              </div>

              {/* Show Reference Checkbox */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="show-reference-top"
                    checked={showReferenceRows}
                    onChange={(e) => setShowReferenceRows(e.target.checked)}
                    className="cursor-pointer"
                  />
                  <label htmlFor="show-reference-top" className="text-sm cursor-pointer">
                    Show GPCRdb Numbers
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="show-protein-regions"
                    checked={showProteinRegions}
                    onChange={(e) => setShowProteinRegions(e.target.checked)}
                    className="cursor-pointer"
                  />
                  <label htmlFor="show-protein-regions" className="text-sm cursor-pointer">
                    Show Protein Regions
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="show-confidence-bars"
                    checked={showConfidenceBars}
                    onChange={(e) => setShowConfidenceBars(e.target.checked)}
                    className="cursor-pointer"
                  />
                  <label htmlFor="show-confidence-bars" className="text-sm cursor-pointer">
                    Show Mapping Confidence
                  </label>
                </div>
                {showProteinRegions && (
                  <div className="flex items-center gap-2">
                    <label htmlFor="protein-region-source" className="text-sm">
                      Region Family:
                    </label>
                    <select
                      id="protein-region-source"
                      value={regionSourceAlignment || ''}
                      onChange={(e) => setRegionSourceAlignment(e.target.value || null)}
                      className="h-8 rounded border bg-background px-2 text-sm text-foreground"
                      disabled={selectedAlignments.length === 0}
                    >
                      {selectedAlignments.map((name) => (
                        <option key={name} value={name}>
                          {getDisplayName(name)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sequence Logo Display */}
      <Card>
        <CardContent className="p-6">
          <div className="overflow-auto">
            <SuperfamilyLogo
              fastaNames={fastaNames}
              getDisplayName={getDisplayName}
              getPlotDisplayName={getPlotDisplayName}
              filteredPositions={filteredPositions}
              selectedAlignmentsExternal={selectedAlignments}
              showReferenceRowsExternal={showReferenceRows}
              showProteinRegionsExternal={showProteinRegions}
              minMappingConfidence={minMappingConfidence}
              showConfidenceBars={showConfidenceBars}
              regionSourceAlignmentExternal={regionSourceAlignment}
              rowHeightExternal={rowHeight}
              minConservationThresholdExternal={minConservationThreshold}
              minFamiliesCountExternal={minFamiliesCount}
              mappingsDir={mappingsDir}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 