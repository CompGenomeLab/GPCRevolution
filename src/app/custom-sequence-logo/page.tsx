'use client';

import React, { useCallback, useState } from 'react';
import CustomSequenceLogo from '@/components/CustomSequenceLogo';
import { Card, CardContent } from '@/components/ui/card';
import FamilyScatterPlot from '@/components/FamilyScatterPlot';

export default function CustomSequenceLogoPage() {
  const [filteredPositions, setFilteredPositions] = useState<number[]>([]);
  const [selectedFamilies, setSelectedFamilies] = useState<string[]>([]);
  const [selectedAlignments, setSelectedAlignments] = useState<string[]>([]);
  const [showReferenceRows, setShowReferenceRows] = useState(false);
  const [showProteinRegions, setShowProteinRegions] = useState(false);
  const [rowHeight, setRowHeight] = useState(30);
  const [minConservationThreshold, setMinConservationThreshold] = useState(0);
  const [minFamiliesCount, setMinFamiliesCount] = useState(0);
  
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
      'classT': 'Class T',
      'Vomeronasal1': 'Vomeronasal 1',
      'Vomeronasal2': 'Vomeronasal 2',
      'Olfactory': 'Olfactory',
      'GPR1': 'GPR1',
      'GP143': 'GP143',
      'GP157': 'GP157',
      'cAMP': 'cAMP',
      'STE3': 'STE3',
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
      'classT': 'Class T',
      'Vomeronasal1': 'V1R',
      'Vomeronasal2': 'V2R',
      'Olfactory': 'Olfactory',
      'GPR1': 'GPR1',
      'GP143': 'GP143',
      'GP157': 'GP157',
      'cAMP': 'cAMP',
      'STE3': 'STE3',
      'Mth': 'Mth',
      'Nematode': 'Nematode'
    };
    
    return plotNameMap[baseName] || baseName;
  }, []);
  // All FASTA files in the custom_msa folder (without .fasta extension)
  // STE2 has been removed as requested
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
    'STE3_genes_filtered_db_FAMSA.ref_trimmed',
    'Vomeronasal1_genes_filtered_db_FAMSA.ref_trimmed',
    'Vomeronasal2_genes_filtered_db_FAMSA.ref_trimmed',
    'Mth_genes_filtered_db_FAMSA.ref_trimmed',
    'Nematode_genes_filtered_db_FAMSA.ref_trimmed'
  ];

  // Custom order for "Select All": classA, Olfactory, classT, Vomeronasal1, Nematode, GPR1, cAMP, classF, GP143, Mth, ClassB2, ClassB1, STE3, ClassC, Vomeronasal2
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
    'GP157_genes_filtered_db_FAMSA.ref_trimmed',
    'Mth_genes_filtered_db_FAMSA.ref_trimmed',
    'classB2_genes_filtered_db_FAMSA.ref_trimmed',
    'classB1_genes_filtered_db_FAMSA.ref_trimmed',
    'STE3_genes_filtered_db_FAMSA.ref_trimmed',
    'classC_genes_filtered_db_FAMSA.ref_trimmed',
    'Vomeronasal2_genes_filtered_db_FAMSA.ref_trimmed'
  ];

  const folder = '/custom_msa';

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

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Combined Controls and Scatter Plot Section */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row gap-6 h-full">
            {/* Left: Scatter Plot */}
            <div className="flex-1 lg:w-1/2">
              <FamilyScatterPlot
                fastaNames={fastaNames}
                folder={folder}
                getDisplayName={getDisplayName}
                onSelectionChange={(positions) => setFilteredPositions(positions)}
                selectedFamilies={selectedFamilies}
                height={500}
                minConservationThreshold={minConservationThreshold}
                minFamiliesCount={minFamiliesCount}
              />
            </div>

            {/* Vertical Divider */}
            <div className="hidden lg:block w-px bg-border self-stretch"></div>

            {/* Right: Controls */}
            <div className="flex-1 lg:w-1/2 flex flex-col">
              <h3 className="text-lg font-semibold mb-3">Logo Controls</h3>
              
              {/* Family Selection */}
              <div className="mb-4 flex-grow flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Select Families:</label>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSelectAll}
                      className="text-xs px-2 py-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded"
                    >
                      All
                    </button>
                    <button
                      onClick={handleSelectNone}
                      className="text-xs px-2 py-1 bg-muted hover:bg-muted/80 text-muted-foreground rounded"
                    >
                      None
                    </button>
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
                    max={Math.max(1, selectedAlignments.length)}
                    value={Math.min(minFamiliesCount, Math.max(1, selectedAlignments.length))}
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
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sequence Logo Display */}
      <Card>
        <CardContent className="p-6">
          <div className="overflow-auto">
            <CustomSequenceLogo
              fastaNames={fastaNames}
              folder={folder}
              getDisplayName={getDisplayName}
              getPlotDisplayName={getPlotDisplayName}
              filteredPositions={filteredPositions}
              selectedAlignmentsExternal={selectedAlignments}
              showReferenceRowsExternal={showReferenceRows}
              showProteinRegionsExternal={showProteinRegions}
              rowHeightExternal={rowHeight}
              minConservationThresholdExternal={minConservationThreshold}
              minFamiliesCountExternal={minFamiliesCount}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 