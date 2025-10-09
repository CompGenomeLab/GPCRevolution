'use client';

import React, { useCallback } from 'react';
import CustomSequenceLogo from '@/components/CustomSequenceLogo';
import PairwiseOverlapMatrix from '@/components/PairwiseOverlapMatrix';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ConsensusEmitter from '@/components/ConsensusEmitter';

export default function CustomSequenceLogoPage() {
  // Function to get display name for a FASTA file (for UI elements like checkboxes)
  const getDisplayName = useCallback((fileName: string): string => {
    const baseName = fileName.split('_')[0];
    
    const displayNameMap: Record<string, string> = {
      'classA': 'Class A',
      'classB1': 'Class B1',
      'classB2': 'Class B2',
      'classC': 'Class C',
      'classF': 'Class F',
      'classT': 'Class T',
      'Vomeronasal1': 'Vomeronasal 1',
      'Vomeronasal2': 'Vomeronasal 2',
      'Olfactory': 'Olfactory',
      'GPR1': 'GPR1',
      'GP143': 'GP143',
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
      'classT': 'Class T',
      'Vomeronasal1': 'V1R',
      'Vomeronasal2': 'V2R',
      'Olfactory': 'Olfactory',
      'GPR1': 'GPR1',
      'GP143': 'GP143',
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
    'classT_genes_filtered_db_FAMSA.ref_trimmed',
    'Olfactory_genes_filtered_db_FAMSA.ref_trimmed',
    'GPR1_genes_filtered_db_FAMSA.ref_trimmed',
    'GP143_genes_filtered_db_FAMSA.ref_trimmed',
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
    'GP143_genes_filtered_db_FAMSA.ref_trimmed',
    'Mth_genes_filtered_db_FAMSA.ref_trimmed',
    'classB2_genes_filtered_db_FAMSA.ref_trimmed',
    'classB1_genes_filtered_db_FAMSA.ref_trimmed',
    'STE3_genes_filtered_db_FAMSA.ref_trimmed',
    'classC_genes_filtered_db_FAMSA.ref_trimmed',
    'Vomeronasal2_genes_filtered_db_FAMSA.ref_trimmed'
  ];

  const folder = '/custom_msa';

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Custom Sequence Logo Generator</h1>
        <p className="text-gray-600">
          Interactive sequence logos generated from your custom multiple sequence alignments (MSA).
          Visualizing conservation patterns across {fastaNames.length} different families with manual ordering capability.
        </p>
      </div>

      {/* Sequence Logo Display */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Sequence Logos</CardTitle>
          <CardDescription>
            Visual representation of sequence conservation across all alignments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <CustomSequenceLogo
              fastaNames={fastaNames}
              folder={folder}
              selectAllOrder={selectAllOrder}
              getDisplayName={getDisplayName}
              getPlotDisplayName={getPlotDisplayName}
            />
          </div>
        </CardContent>
      </Card>

      {/* Consensus Emitter */}
      <ConsensusEmitter 
        customFastaNames={fastaNames} 
        customFolder={folder}
        getDisplayName={getDisplayName}
      />

      {/* Pairwise Overlap Matrix */}
      <PairwiseOverlapMatrix
        fastaNames={fastaNames}
        folder={folder}
        selectAllOrder={selectAllOrder}
        getDisplayName={getDisplayName}
      />

      {/* File List */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Loaded Alignments ({fastaNames.length})</CardTitle>
          <CardDescription>
            All FASTA files currently being analyzed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {fastaNames.map((name, index) => (
              <div key={index} className="bg-gray-50 p-3 rounded-lg">
                <span className="text-sm font-mono">{name}.fasta</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Information */}
      <Card>
        <CardHeader>
          <CardTitle>About Sequence Logos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 mb-4">
            Sequence logos are a graphical representation of the sequence conservation of nucleotides or amino acids.
            The height of each letter represents the relative frequency of that residue at that position,
            scaled by the information content. Taller letters indicate more conserved positions,
            while shorter letters indicate more variable positions.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-2">Key Features:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Information content calculation based on Shannon entropy</li>
                <li>• Automatic scaling of letter heights based on conservation</li>
                <li>• Support for multiple sequence alignments</li>
                <li>• Real-time visualization updates</li>
              </ul>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-2">Analyzed Families:</h4>
              <ul className="text-sm text-green-800 space-y-1">
                <li>• Class A, B1, B2, C, F, and T GPCRs</li>
                <li>• Olfactory and vomeronasal families (V1R, V2R)</li>
                <li>• Yeast pheromone receptor (STE3)</li>
                <li>• Specialized groups (e.g., cAMP signaling) and orphan families (GPR1, GP143)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 