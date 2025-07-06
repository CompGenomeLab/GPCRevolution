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
      <section className="bg-gradient-to-br from-[#424874] via-[#434E71] to-[#424874] text-white py-12 sm:py-20">
        <RootContainer className="text-center">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl sm:text-5xl font-bold mb-4 sm:mb-6">
              GPCR Evolution Database
            </h1>
            <p className="text-lg sm:text-xl mb-6 sm:mb-8 opacity-90">
              Precision evolutionary insights for human G-protein-coupled receptors
            </p>
            <p className="text-sm sm:text-lg mb-8 sm:mb-12 opacity-80 max-w-3xl mx-auto hidden sm:block">
              Rigorously curated, residue-level evolutionary information for every human GPCR, 
              built from high-quality multiple-sequence alignments and phylogenetic trees.
            </p>
            
            {/* Search Section */}
            <div className="max-w-2xl mx-auto mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-4xl font-semibold mb-4 sm:mb-6">Find your receptor</h2>
                            <Command shouldFilter={false} className="rounded-lg border-2 border-[#424874] shadow-none">
                                                                        <CommandInput
                        placeholder="Search for a receptor (e.g., 5HT1A)..."
                        onValueChange={handleSearch}
                        className="h-12 sm:h-14 text-base sm:text-lg px-2"
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
            <div className="grid grid-cols-3 gap-4 sm:gap-8 text-center">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 sm:p-6 border border-white/20">
                <div className="text-2xl sm:text-3xl font-bold text-white">800+</div>
                <div className="text-xs sm:text-sm text-white/80">Human GPCRs</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 sm:p-6 border border-white/20">
                <div className="text-2xl sm:text-3xl font-bold text-white">{totalOrthologs.toLocaleString()}</div>
                <div className="text-xs sm:text-sm text-white/80">Ortholog Sequences</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 sm:p-6 border border-white/20">
                <div className="text-2xl sm:text-3xl font-bold text-white">3</div>
                <div className="text-xs sm:text-sm text-white/80">Integrated Tools</div>
              </div>
            </div>
          </div>
        </RootContainer>
      </section>

      {/* About Section */}
      <section className="py-12 sm:py-16 bg-muted/50">
        <RootContainer>
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold mb-6 sm:mb-8 text-foreground">Accelerating GPCR Research Through Evolution</h2>
            <p className="text-base sm:text-lg text-muted-foreground mb-6 sm:mb-8 hidden sm:block">
              G-protein-coupled receptors (GPCRs) represent the largest protein family in the human genome 
              and the most lucrative class of drug targets. Our database fills a critical gap by providing 
              evolutionary trajectories that clarify ligand and G protein specificity, accelerate 
              deorphanization, and identify pathogenic variants.
            </p>
            <p className="text-sm text-muted-foreground mb-6 sm:hidden">
              GPCRs are the largest protein family and most lucrative drug targets. Our database provides 
              evolutionary trajectories to clarify specificity and identify pathogenic variants.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 text-left">
              <div className="space-y-3 sm:space-y-4">
                <h3 className="text-lg sm:text-xl font-semibold text-foreground">Why GPCRs Matter</h3>
                <ul className="space-y-1 sm:space-y-2 text-sm sm:text-base text-muted-foreground">
                  <li>• Largest protein family in human genome</li>
                  <li>• Primary targets for pharmaceutical drugs</li>
                  <li className="hidden sm:block">• Complex signaling mechanisms</li>
                  <li className="hidden sm:block">• Frequently implicated in diseases</li>
                </ul>
              </div>
              <div className="space-y-3 sm:space-y-4">
                <h3 className="text-lg sm:text-xl font-semibold text-foreground">Our Approach</h3>
                <ul className="space-y-1 sm:space-y-2 text-sm sm:text-base text-muted-foreground">
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
      <section className="py-12 sm:py-16 bg-background">
        <RootContainer>
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 text-foreground">Integrated Analysis Tools</h2>
            <p className="text-base sm:text-lg text-muted-foreground hidden sm:block">
              Three powerful tools designed for evolution-guided hypothesis generation
            </p>
            <p className="text-sm text-muted-foreground sm:hidden">
              Three tools for evolution-guided analysis
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            <Card 
              className="cursor-pointer hover:shadow-lg transition-all duration-300 border-2 hover:border-[#424874]/20 dark:hover:border-[#E6E6FA]/20 group" 
              onClick={() => handleToolNavigation('receptor-comparison')}
            >
              <CardHeader className="pb-3 sm:pb-6">
                <div className="flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 group-hover:scale-110 transition-transform text-[#424874] dark:text-[#E6E6FA]" />
                  <CardTitle className="text-foreground text-base sm:text-lg">Differential Conservation</CardTitle>
                </div>
                <CardDescription className="text-sm">
                  Pinpoint positions that contribute to common and receptor-specific functions
                </CardDescription>
              </CardHeader>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-all duration-300 border-2 hover:border-[#424874]/20 dark:hover:border-[#E6E6FA]/20 group" 
              onClick={() => handleToolNavigation('receptor-table')}
            >
              <CardHeader className="pb-3 sm:pb-6">
                <div className="flex items-center space-x-2">
                  <Table className="h-5 w-5 sm:h-6 sm:w-6 group-hover:scale-110 transition-transform text-[#424874] dark:text-[#E6E6FA]" />
                  <CardTitle className="text-foreground text-base sm:text-lg">Receptor Table Generator</CardTitle>
                </div>
                <CardDescription className="text-sm">
                  Generate conservation tables to compare multiple receptors side-by-side
                </CardDescription>
              </CardHeader>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-all duration-300 border-2 hover:border-[#424874]/20 dark:hover:border-[#E6E6FA]/20 group" 
              onClick={() => handleToolNavigation('combine-orthologs')}
            >
              <CardHeader className="pb-3 sm:pb-6">
                <div className="flex items-center space-x-2">
                  <Combine className="h-5 w-5 sm:h-6 sm:w-6 group-hover:scale-110 transition-transform text-[#424874] dark:text-[#E6E6FA]" />
                  <CardTitle className="text-foreground text-base sm:text-lg">Combine Orthologs</CardTitle>
                </div>
                <CardDescription className="text-sm">
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
