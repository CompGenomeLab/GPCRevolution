'use client';

import React from 'react';
import CustomSequenceLogo from '@/components/CustomSequenceLogo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function CustomSequenceLogoPage() {
  // All FASTA files in the custom_msa folder (without .fasta extension)
  const fastaNames = [
    'ClassF_clade',
    'GP157_clade',
    'ClassB1_clade',
    'ClassB2_clade',
    'GPR1_clade',
    'ClassT_clade',
    'ClassA_clade',
    'GP107_clade',
    'G137_clade',
    'STE3_clade',
    'STM1_clade',
    'ClassC_clade',
    'STE2_clade',
    'NOP1_clade',
    'TPRA1_clade'
  ];

  const folder = '/custom_msa';

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Custom Sequence Logo Generator</h1>
        <p className="text-gray-600">
          Interactive sequence logos generated from your custom multiple sequence alignments (MSA).
          Visualizing conservation patterns across {fastaNames.length} different clades with manual ordering capability.
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
            />
          </div>
        </CardContent>
      </Card>

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
              <h4 className="font-semibold text-green-900 mb-2">Analyzed Clades:</h4>
              <ul className="text-sm text-green-800 space-y-1">
                <li>• Class A, B1, B2, C, F, and T GPCRs</li>
                <li>• Various orphan receptors (GPR1, GP107, etc.)</li>
                <li>• Yeast pheromone receptors (STE2, STE3)</li>
                <li>• Specialized receptor families</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 