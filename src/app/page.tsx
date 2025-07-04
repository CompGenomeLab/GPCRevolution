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
import receptors from '../../public/receptors.json';
import { useRouter } from 'next/navigation';
import RootContainer from '@/components/RootContainer';

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

  return (
    <RootContainer className="flex flex-col items-center min-h-[70vh] pt-24">
      <h1 className="text-4xl font-bold text-center mb-8">Find your receptor</h1>
      <div className="w-full max-w-xl">
        <Command shouldFilter={false} className="rounded-lg border shadow-md bg-background">
          <CommandInput
            placeholder="Search for a receptor..."
            onValueChange={handleSearch}
            className="h-14 text-lg px-6"
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
    </RootContainer>
  );
}
