'use client';

import { useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import receptors from '../../public/receptors.json';
import { useRouter } from 'next/navigation';
import RootContainer from '@/components/RootContainer';
import { BarChart3, Table, Combine } from 'lucide-react';

interface Receptor {
  geneName: string;
  class: string;
  numOrthologs: number;
  lca: string;
  gpcrdbId: string;
  name: string;
}

export default function Home() {
  const [searchResults, setSearchResults] = useState<Receptor[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const router = useRouter();

  const handleSearch = (value: string) => {
    if (!value.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setHasSearched(true);
    const term = value.toLowerCase();
    const results = receptors
      .filter(
        (receptor: Receptor) =>
          receptor.geneName.toLowerCase().includes(term) || receptor.name.toLowerCase().includes(term)
      )
      .slice(0, 10);

    setSearchResults(results);
  };

  const handleSelect = (geneName: string) => {
    router.push(`/receptor?gene=${encodeURIComponent(geneName)}`);
  };

  const handleToolNavigation = (tool: string) => {
    router.push(`/tools/${tool}`);
  };

  const totalOrthologs = receptors.reduce((sum, receptor) => sum + receptor.numOrthologs, 0);

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#424874] via-[#434E71] to-[#424874] text-white py-20">
        <RootContainer className="text-center">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-5xl font-bold mb-6">
              GPCR Evolution Database
            </h1>
            <p className="text-xl mb-8 opacity-90">
              Precision evolutionary insights for human G-protein-coupled receptors
            </p>
            <p className="text-lg mb-12 opacity-80 max-w-3xl mx-auto">
              Rigorously curated, residue-level evolutionary information for every human GPCR, 
              built from high-quality multiple-sequence alignments and phylogenetic trees.
            </p>
            
            {/* Search Section */}
            <div className="max-w-2xl mx-auto mb-12">
              <h2 className="text-4xl font-semibold mb-6">Find your receptor</h2>
                            <Command shouldFilter={false} className="rounded-lg border-2 border-[#424874] shadow-none">
                                    <CommandInput
                      placeholder="Search for a receptor (e.g., 5HT1A - 5-hydroxytryptamine receptor 1A) ..."
                      onValueChange={handleSearch}
                      className="h-14 text-lg px-2"
                    />
                {hasSearched && (
                  <CommandList className={searchResults.length > 5 ? 'max-h-[300px] overflow-y-auto' : ''}>
                    {searchResults.length === 0 ? (
                      <CommandEmpty>No results found.</CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {searchResults.map((receptor, index) => (
                          <CommandItem
                            key={index}
                            value={`${receptor.geneName} ${receptor.name}`}
                            className="cursor-pointer"
                            onSelect={() => handleSelect(receptor.geneName)}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium">{`${receptor.geneName} - ${receptor.name}`}</span>
                              <span className="text-sm text-muted-foreground">
                                Class: {receptor.class} | Orthologs: {receptor.numOrthologs} | LCA: {receptor.lca}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                )}
              </Command>
            </div>

            {/* Key Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
                <div className="text-3xl font-bold text-white">800+</div>
                <div className="text-sm text-white/80">Human GPCRs</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
                <div className="text-3xl font-bold text-white">{totalOrthologs.toLocaleString()}</div>
                <div className="text-sm text-white/80">Ortholog Sequences</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
                <div className="text-3xl font-bold text-white">3</div>
                <div className="text-sm text-white/80">Integrated Tools</div>
              </div>
            </div>
          </div>
        </RootContainer>
      </section>

      {/* About Section */}
      <section className="py-16 bg-muted/50">
        <RootContainer>
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-8 text-foreground">Accelerating GPCR Research Through Evolution</h2>
            <p className="text-lg text-muted-foreground mb-8">
              G-protein-coupled receptors (GPCRs) represent the largest protein family in the human genome 
              and the most lucrative class of drug targets. Our database fills a critical gap by providing 
              evolutionary trajectories that clarify ligand and G protein specificity, accelerate 
              deorphanization, and identify pathogenic variants.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-foreground">Why GPCRs Matter</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Largest protein family in human genome</li>
                  <li>• Primary targets for pharmaceutical drugs</li>
                  <li>• Complex signaling mechanisms</li>
                  <li>• Frequently implicated in diseases</li>
                </ul>
              </div>
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-foreground">Our Approach</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Residue-level evolutionary information</li>
                  <li>• High-quality multiple-sequence alignments</li>
                  <li>• Rigorously curated phylogenetic trees</li>
                </ul>
              </div>
            </div>
          </div>
        </RootContainer>
      </section>

      {/* Tools Section */}
      <section className="py-16 bg-background">
        <RootContainer>
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4 text-foreground">Integrated Analysis Tools</h2>
            <p className="text-lg text-muted-foreground">
              Three powerful tools designed for evolution-guided hypothesis generation
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card 
              className="cursor-pointer hover:shadow-lg transition-all duration-300 border-2 hover:border-[#424874]/20 dark:hover:border-[#E6E6FA]/20 group" 
              onClick={() => handleToolNavigation('receptor-comparison')}
            >
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <BarChart3 className="h-6 w-6 group-hover:scale-110 transition-transform text-[#424874] dark:text-[#E6E6FA]" />
                  <CardTitle className="text-foreground">Differential Conservation</CardTitle>
                </div>
                <CardDescription>
                  Pinpoint positions that contribute to common and receptor-specific functions
                </CardDescription>
              </CardHeader>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-all duration-300 border-2 hover:border-[#424874]/20 dark:hover:border-[#E6E6FA]/20 group" 
              onClick={() => handleToolNavigation('receptor-table')}
            >
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Table className="h-6 w-6 group-hover:scale-110 transition-transform text-[#424874] dark:text-[#E6E6FA]" />
                  <CardTitle className="text-foreground">Receptor Table Generator</CardTitle>
                </div>
                <CardDescription>
                  Generate conservation tables to compare multiple receptors side-by-side
                </CardDescription>
              </CardHeader>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-all duration-300 border-2 hover:border-[#424874]/20 dark:hover:border-[#E6E6FA]/20 group" 
              onClick={() => handleToolNavigation('combine-orthologs')}
            >
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Combine className="h-6 w-6 group-hover:scale-110 transition-transform text-[#424874] dark:text-[#E6E6FA]" />
                  <CardTitle className="text-foreground">Combine Orthologs</CardTitle>
                </div>
                <CardDescription>
                  Merge ortholog alignments to reveal divergence across paralogous lineages
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </RootContainer>
      </section>
    </div>
  );
}
