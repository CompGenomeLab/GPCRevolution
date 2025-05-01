'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useState } from 'react';
import receptors from '@/data/receptors.json';

const formSchema = z.object({
  receptorClass: z.string().min(1, 'Required'),
  minOrthologs: z.string().min(1, 'Required'),
  maxOrthologs: z.string().min(1, 'Required'),
  includeInactive: z.boolean().default(false),
});

interface Receptor {
  geneName: string;
  class: string;
  numOrthologs: number;
  lca: string;
  gpcrdbId: string;
}

export default function ReceptorTablePage() {
  const [referenceResults, setReferenceResults] = useState<Receptor[]>([]);
  const [hasSearchedReference, setHasSearchedReference] = useState(false);
  const [targetResults, setTargetResults] = useState<Receptor[]>([]);
  const [hasSearchedTarget, setHasSearchedTarget] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      receptorClass: '',
      minOrthologs: '',
      maxOrthologs: '',
      includeInactive: false,
    },
  });

  const handleReferenceSearch = (value: string) => {
    if (!value.trim()) {
      setReferenceResults([]);
      setHasSearchedReference(false);
      return;
    }

    setHasSearchedReference(true);
    const results = receptors
      .filter((receptor: Receptor) => receptor.geneName.toLowerCase().includes(value.toLowerCase()))
      .slice(0, 10);

    setReferenceResults(results);
  };

  const handleTargetSearch = (value: string) => {
    setSearchValue(value);
    if (!value.trim()) {
      setTargetResults([]);
      setHasSearchedTarget(false);
      return;
    }

    setHasSearchedTarget(true);
    const results = receptors
      .filter((receptor: Receptor) => receptor.geneName.toLowerCase().includes(value.toLowerCase()))
      .slice(0, 10);

    setTargetResults(results);
  };

  const handleTargetSelect = (receptor: Receptor) => {
    const currentValue = form.getValues('minOrthologs');
    const newValue = currentValue ? `${currentValue}, ${receptor.geneName}` : receptor.geneName;

    form.setValue('minOrthologs', newValue);
    setSearchValue('');
    setTargetResults([]);
    setHasSearchedTarget(false);
  };

  function onSubmit(values: z.infer<typeof formSchema>) {
    console.log(values);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-4">
      <h1 className="text-3xl font-bold text-left">Receptor Table Generator</h1>
      <p className="text-lg text-muted-foreground text-left">
        Enter a reference receptor and one or more target receptors from the same class to generate
        a residue‐by‐residue alignment table. Optionally specify a comma‐separated list of residue
        numbers to filter the results. Check &quot;Include Conservation Data&quot; to pull in
        per‐position conservation %, conserved amino acid(s), receptor region and GPCRdb numbering
        for your reference GPCR.
      </p>

      <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="receptorClass"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference Receptor</FormLabel>
                  <FormControl>
                    <Command className="rounded-lg border shadow-md">
                      <CommandInput
                        placeholder="Search for receptor..."
                        onValueChange={value => {
                          handleReferenceSearch(value);
                          field.onChange(value);
                        }}
                        value={field.value}
                      />
                      {hasSearchedReference && (
                        <CommandList
                          className={
                            referenceResults.length > 5 ? 'max-h-[300px] overflow-y-auto' : ''
                          }
                        >
                          {referenceResults.length === 0 ? (
                            <CommandEmpty>No results found.</CommandEmpty>
                          ) : (
                            <CommandGroup>
                              {referenceResults.map((receptor, index) => (
                                <CommandItem
                                  key={index}
                                  value={receptor.geneName}
                                  className="cursor-pointer"
                                  onSelect={() => {
                                    field.onChange(receptor.geneName);
                                    setReferenceResults([]);
                                    setHasSearchedReference(false);
                                  }}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-medium">{receptor.geneName}</span>
                                    <span className="text-sm text-muted-foreground">
                                      Class: {receptor.class} | Orthologs: {receptor.numOrthologs} |
                                      LCA: {receptor.lca}
                                    </span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      )}
                    </Command>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="minOrthologs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target Receptor(s)</FormLabel>
                  <FormControl>
                    <Command className="rounded-lg border shadow-md">
                      <CommandInput
                        placeholder="Search for target receptor..."
                        onValueChange={handleTargetSearch}
                        value={searchValue}
                      />
                      {hasSearchedTarget && (
                        <CommandList
                          className={
                            targetResults.length > 5 ? 'max-h-[300px] overflow-y-auto' : ''
                          }
                        >
                          {targetResults.length === 0 ? (
                            <CommandEmpty>No results found.</CommandEmpty>
                          ) : (
                            <CommandGroup>
                              {targetResults.map((receptor, index) => (
                                <CommandItem
                                  key={index}
                                  value={receptor.geneName}
                                  className="cursor-pointer"
                                  onSelect={() => handleTargetSelect(receptor)}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-medium">{receptor.geneName}</span>
                                    <span className="text-sm text-muted-foreground">
                                      Class: {receptor.class} | Orthologs: {receptor.numOrthologs} |
                                      LCA: {receptor.lca}
                                    </span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      )}
                    </Command>
                  </FormControl>
                  <div className="text-sm text-muted-foreground">
                    Selected: {field.value || 'None'}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maxOrthologs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Residue Numbers (comma-separated)</FormLabel>
                  <FormControl>
                    <Command className="rounded-lg border shadow-md">
                      <CommandInput
                        placeholder="Enter residue numbers..."
                        onValueChange={value => {
                          field.onChange(value);
                        }}
                        value={field.value}
                      />
                    </Command>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="includeInactive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-1 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Include Conservation Data</FormLabel>
                  </div>
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full">
              Map Residues
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
