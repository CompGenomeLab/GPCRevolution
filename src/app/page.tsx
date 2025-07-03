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
    <RootContainer className="max-w-2xl">
      <h1 className="text-3xl font-bold text-left">Welcome to the GPCR Evolution Database</h1>
      <p className="text-lg text-muted-foreground text-left">
        GPCR Evolution Database (GPCREVOdb) is a comprehensive resource for exploring the
        evolutionary history of human GPCRs.
      </p>
      <Command className="rounded-lg border shadow-md">
        <CommandInput placeholder="Search for a receptor..." onValueChange={handleSearch} />
        {hasSearched && (
          <CommandList className={searchResults.length > 5 ? 'max-h-[300px] overflow-y-auto' : ''}>
            {searchResults.length === 0 ? (
              <CommandEmpty>No results found.</CommandEmpty>
            ) : (
              <CommandGroup>
                {searchResults.map((receptor, index) => (
                  <CommandItem
                    key={index}
                    value={receptor.geneName}
                    className="cursor-pointer"
                    onSelect={() => handleSelect(receptor.geneName)}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{`${receptor.geneName} - ${receptor.name}`}</span>
                      <span className="text-sm text-muted-foreground">
                        Class: {receptor.class} | Orthologs: {receptor.numOrthologs} | LCA:{' '}
                        {receptor.lca}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        )}
      </Command>
    </RootContainer>
  );
}
