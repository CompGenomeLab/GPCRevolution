'use client';

import React, { useMemo, useState, useEffect } from 'react';
import RootContainer from '@/components/RootContainer';
import CombinedTreeAlignment from '@/components/CombinedTreeAlignment';
import receptors from '../../../public/receptors.json';

interface Receptor {
  geneName: string;
  class: string;
  numOrthologs: number;
  lca: string;
  gpcrdbId: string;
  tree: string;
  alignment: string;
  conservationFile: string;
  snakePlot: string;
  svgTree: string;
  name: string;
}

export default function MsaTreeCombinedPage() {
  const [receptorName, setReceptorName] = useState<string>('5HT1A');
  const [receptor, setReceptor] = useState<Receptor | null>(null);
  const [newick, setNewick] = useState<string>('');
  const [alignmentFasta, setAlignmentFasta] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  // Fixed settings
  const showSupport = false;
  const mirror = false;
  const fontSize = 14;
  const rowSpacing = 13;

  // Load receptor data when receptor name changes
  useEffect(() => {
    const found = receptors.find((r: Receptor) => r.geneName === receptorName);
    setReceptor(found ?? null);
  }, [receptorName]);

  // Load alignment and tree files when receptor changes
  useEffect(() => {
    if (!receptor) return;
    
    setLoading(true);
    
    // Load both files in parallel
    Promise.all([
      fetch(receptor.tree).then(res => res.text()),
      fetch(receptor.alignment).then(res => res.text())
    ])
    .then(([treeData, alignmentData]) => {
      setNewick(treeData.trim());
      setAlignmentFasta(alignmentData);
    })
    .catch(error => {
      console.error('Error loading files:', error);
    })
    .finally(() => {
      setLoading(false);
    });
  }, [receptor]);



  const trimmed = useMemo(() => newick.trim(), [newick]);

  return (
    <RootContainer>
      <div className="container mx-auto max-w-[1200px] px-4 py-6">
        <div className="space-y-6">
          <div className="rounded-lg bg-card p-6 text-card-foreground shadow-md">
            <h1 className="text-xl font-semibold mb-4">Phylogenetic Tree + Alignment Viewer</h1>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium">Receptor Gene:</label>
                <select
                  className="rounded border border-input bg-background p-2 min-w-[200px]"
                  value={receptorName}
                  onChange={e => setReceptorName(e.target.value)}
                >
                  {receptors.map((r: Receptor) => (
                    <option key={r.geneName} value={r.geneName}>
                      {r.geneName} - {r.name}
                    </option>
                  ))}
                </select>
                {loading && (
                  <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-foreground" />
                )}
              </div>
              
              {receptor && (
                <div className="text-sm text-muted-foreground">
                  <p>Class: {receptor.class} | Orthologs: {receptor.numOrthologs} | LCA: {receptor.lca}</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg bg-card p-2 text-card-foreground shadow-md" style={{ height: 600 }}>
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">Loading tree and alignment data...</p>
                </div>
              </div>
            ) : trimmed ? (
              <CombinedTreeAlignment
                newick={trimmed}
                alignmentFasta={alignmentFasta}
                receptor={receptor}
                showSupportOnBranches={showSupport}
                mirrorRightToLeft={mirror}
                fontSize={fontSize}
                leafRowSpacing={rowSpacing}
                treeWidthPx={300}
                alignmentBoxWidthPx={900}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Select a receptor to view its phylogenetic tree and alignment</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </RootContainer>
  );
}


