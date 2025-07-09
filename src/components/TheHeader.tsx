'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import receptors from '../../public/receptors.json';
import DesktopNavigation from './DesktopNavigation';
import MobileNavigation from './MobileNavigation';

interface Props {
  className?: string;
}

interface Receptor {
  geneName: string;
  class: string;
  numOrthologs: number;
  lca: string;
  gpcrdbId: string;
  name: string;
}

export const navigationItems = [
  {
    title: 'Tools',
    items: [
      {
        title: 'Differential Residue Conservation',
        href: '/tools/receptor-comparison',
        description: 'Analyze residue conservation patterns across species',
      },
      {
        title: 'Multi-Receptor Comparison',
        href: '/tools/multi-receptor-comparison',
        description: 'Compare multiple receptors with conservation tables and sequence logos',
      },
      {
        title: 'Combine Orthologs',
        href: '/tools/combine-orthologs',
        description: 'Merge and analyze orthologous sequences',
      },
    ],
  },
  {
    title: 'Contact',
    href: '/contact',
  },
  {
    title: 'FAQ',
    href: '/faq',
  },
  {
    title: 'Cite Us',
    href: '/cite-us',
  },
];

export function TheHeader({ className }: Props) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [searchResults, setSearchResults] = useState<Receptor[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const router = useRouter();
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setHasSearched(false);
        setSearchResults([]);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSearch = (value: string) => {
    setSearchValue(value);
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
    setHasSearched(false);
    setSearchResults([]);
    setSearchValue('');
    router.push(`/receptor?gene=${encodeURIComponent(geneName)}`);
  };

  return (
    <header className={cn('bg-background border-b border-border', className)}>
      <div className="max-w-7xl mx-auto px-4">
        {/* Mobile: Two-line layout */}
        <div className="flex flex-col sm:hidden">
          {/* Top line: Logo + Title */}
          <div className="flex items-center justify-center py-2">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src={mounted && theme === 'dark' ? '/logo-light.png' : '/logo-dark.png'}
                alt="Logo"
                width={32}
                height={32}
              />
              <span className="text-xl font-semibold tracking-tight text-primary dark:text-primary">
                GPCR Evolution DB
              </span>
            </Link>
          </div>
          
          {/* Bottom line: Search + Theme Toggle + Mobile Navigation */}
          <div className="flex items-center justify-between pb-2">
            <div className="relative w-64" ref={searchRef}>
              <Command shouldFilter={false} className="rounded-lg border shadow-none">
                <CommandInput
                  placeholder="Search for a receptor..."
                  value={searchValue}
                  onValueChange={handleSearch}
                  className="h-9"
                />
                {hasSearched && (
                  <CommandList className="absolute top-full left-0 right-0 z-50 bg-background border rounded-lg shadow-lg max-h-[300px] overflow-y-auto">
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
            </div>

            <div className="flex items-center gap-4 ml-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="h-9 w-9 cursor-pointer"
              >
                <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>

              <MobileNavigation items={navigationItems} />
            </div>
          </div>
        </div>

        {/* Desktop: Single-line layout */}
        <div className="hidden sm:flex items-center justify-between h-16">
          <div className="flex items-center gap-12">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src={mounted && theme === 'dark' ? '/logo-light.png' : '/logo-dark.png'}
                alt="Logo"
                width={32}
                height={32}
              />
              <span className="text-xl font-semibold tracking-tight text-primary dark:text-primary">
                GPCR Evolution DB
              </span>
            </Link>

            <DesktopNavigation items={navigationItems} />
          </div>

          <div className="flex items-center gap-4">
            <div className="relative w-36 sm:w-72" ref={searchRef}>
              <Command shouldFilter={false} className="rounded-lg border shadow-none">
                <CommandInput
                  placeholder="Search for a receptor..."
                  value={searchValue}
                  onValueChange={handleSearch}
                  className="h-9"
                />
                {hasSearched && (
                  <CommandList className="absolute top-full left-0 right-0 z-50 bg-background border rounded-lg shadow-lg max-h-[300px] overflow-y-auto">
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
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="h-9 w-9 cursor-pointer"
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>

            <MobileNavigation items={navigationItems} />
          </div>
        </div>
      </div>
    </header>
  );
}
