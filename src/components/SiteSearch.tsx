'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import receptors from '../../public/receptors.json';

interface Receptor {
  geneName: string;
  class: string;
  numOrthologs: number;
  lca: string;
  gpcrdbId: string;
  name: string;
}

/** taxID, scientific name, NCBI common name, lineage, GPCRs (public/species/search.json) */
type SpeciesHit = [string, string, string, string, number];

export type SearchScope = 'receptors' | 'species';

const MAX_RESULTS = 10;

const SCOPES: { key: SearchScope; label: string; beta?: boolean }[] = [
  { key: 'receptors', label: 'Receptors' },
  { key: 'species', label: 'Species', beta: true },
];

const PLACEHOLDERS: Record<'hero' | 'compact', Record<SearchScope, string>> = {
  hero: {
    receptors: 'Search for a receptor (e.g., 5HT1A - 5-hydroxytryptamine receptor 1A) ...',
    species: 'Search for a species (e.g., Homo sapiens, human or 9606) ...',
  },
  compact: {
    receptors: 'Search for a receptor...',
    species: 'Search for a species...',
  },
};

// Loaded once, the first time a species search runs.
let speciesList: Promise<SpeciesHit[]> | null = null;
function loadSpecies() {
  if (!speciesList) {
    speciesList = fetch('/species/search.json')
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .catch(e => { speciesList = null; throw e; });
  }
  return speciesList;
}

function searchReceptors(term: string) {
  return (receptors as Receptor[])
    .filter(r => r.geneName.toLowerCase().includes(term) || r.name.toLowerCase().includes(term))
    .slice(0, MAX_RESULTS);
}

/** Species whose taxID, scientific name or common name matches; names starting with the term first. */
function searchSpecies(list: SpeciesHit[], term: string) {
  const rank = (s: SpeciesHit) => {
    const name = s[1].toLowerCase(), common = s[2].toLowerCase();
    if (s[0] === term) return 0;
    if (name.startsWith(term) || common.startsWith(term)) return 1;
    if (name.split(/\s+/).some(w => w.startsWith(term)) || common.split(/\s+/).some(w => w.startsWith(term))) return 2;
    if (name.includes(term) || common.includes(term)) return 3;
    return -1;
  };
  return list
    .map(s => [rank(s), s] as const)
    .filter(([r]) => r >= 0)
    .sort((a, b) => a[0] - b[0] || a[1][1].localeCompare(b[1][1]))
    .slice(0, MAX_RESULTS)
    .map(([, s]) => s);
}

/**
 * The site search: a scope switch (receptors or species, as UniProt switches between its databases) beside one
 * search box. Receptors lead to the receptor pages, species to the per-species pages. `hero` is the large box of
 * the home page, `compact` the one in the header.
 */
export function SiteSearch({ variant = 'compact', className, scope: scopeProp, onScopeChange }: {
  variant?: 'hero' | 'compact'; className?: string;
  /** optional control of the scope from outside, e.g. so the home page heading follows it */
  scope?: SearchScope; onScopeChange?: (scope: SearchScope) => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [ownScope, setOwnScope] = useState<SearchScope>('receptors');
  const scope = scopeProp ?? ownScope;
  const setScope = (s: SearchScope) => { setOwnScope(s); onScopeChange?.(s); };
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [receptorHits, setReceptorHits] = useState<Receptor[]>([]);
  const [speciesHits, setSpeciesHits] = useState<SpeciesHit[]>([]);
  const [error, setError] = useState(false);
  const hero = variant === 'hero';

  const run = useCallback((text: string, where: SearchScope) => {
    const term = text.trim().toLowerCase();
    if (!term) { setOpen(false); return; }
    setOpen(true);
    if (where === 'receptors') {
      setReceptorHits(searchReceptors(term));
      return;
    }
    loadSpecies()
      .then(list => { setError(false); setSpeciesHits(searchSpecies(list, term)); })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setValue('');
    router.push(href);
  };

  const hits = scope === 'receptors' ? receptorHits.length : speciesHits.length;

  return (
    <div ref={ref} className={cn('relative flex items-stretch rounded-lg border bg-popover text-popover-foreground',
      hero ? 'border-2 border-[#424874]' : 'border-[#424874]/60 dark:border-[#E6E6FA]/50', className)}>
      {/* scope dropdown, drawn as part of the box: no fill or border of its own, a thin divider before the input */}
      <Select value={scope} onValueChange={v => { setScope(v as SearchScope); run(value, v as SearchScope); }}>
        <SelectTrigger aria-label="What to search"
                       className={cn('shrink-0 cursor-pointer items-center gap-1 self-center rounded-r-none border-0 bg-transparent py-0 font-medium leading-none text-[#424874] shadow-none',
                         'hover:bg-muted/50 focus-visible:ring-0 dark:bg-transparent dark:text-[#E6E6FA] dark:hover:bg-muted/50',
                         // the trigger's own data-[size] height wins over a plain h-*, so match the input height there
                         hero ? 'pl-4 pr-2 text-base data-[size=default]:h-14' : 'pl-3 pr-1.5 text-sm data-[size=default]:h-9')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="z-[60]">
          {SCOPES.map(({ key, label, beta }) => (
            <SelectItem key={key} value={key} className="cursor-pointer">
              {label}
              {beta && (
                <span className="rounded-sm bg-[#424874]/10 px-1 py-px text-[10px] font-semibold uppercase leading-none tracking-wide text-[#424874] dark:bg-[#E6E6FA]/15 dark:text-[#E6E6FA]">
                  Beta
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span aria-hidden className={cn('w-px shrink-0 self-center bg-border', hero ? 'h-7' : 'h-5')} />
      <Command shouldFilter={false} className="min-w-0 flex-1 bg-transparent">
        <CommandInput
          placeholder={PLACEHOLDERS[hero ? 'hero' : 'compact'][scope]}
          value={value}
          onValueChange={v => { setValue(v); run(v, scope); }}
          onFocus={() => value.trim() && setOpen(true)}
          onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
          className={hero ? 'h-14 px-2 text-lg placeholder:text-base' : 'h-9 placeholder:text-[13px]'}
          wrapperClassName={cn('border-b-0', hero ? 'h-14' : 'h-9')}
        />
        {open && (
          <CommandList className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[300px] overflow-y-auto rounded-lg border bg-popover text-left text-popover-foreground shadow-lg">
            {scope === 'species' && error ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">The species list could not be loaded.</div>
            ) : hits === 0 ? (
              <CommandEmpty>No results found.</CommandEmpty>
            ) : scope === 'receptors' ? (
              <CommandGroup>
                {receptorHits.map(r => (
                  <CommandItem key={r.geneName} value={`${r.geneName} ${r.name}`} className="cursor-pointer text-left"
                               onSelect={() => go(`/receptor?gene=${encodeURIComponent(r.geneName)}`)}>
                    <div className="flex w-full flex-col items-start">
                      <span className="font-medium">{`${r.geneName} - ${r.name}`}</span>
                      <span className="text-sm text-muted-foreground">
                        Class: {r.class} | Orthologs: {r.numOrthologs} | LCA: {r.lca}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              <CommandGroup>
                {speciesHits.map(([taxID, name, common, lineage, total]) => (
                  <CommandItem key={taxID} value={`${taxID} ${name}`} className="cursor-pointer text-left"
                               onSelect={() => go(`/species?taxid=${encodeURIComponent(taxID)}`)}>
                    <div className="flex w-full flex-col items-start">
                      <span className="font-medium">
                        <i>{name}</i>{common ? <span className="font-normal text-muted-foreground"> ({common})</span> : null}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {lineage} | GPCRs: {total.toLocaleString('en-US')} | Taxonomy ID: {taxID}
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
  );
}
