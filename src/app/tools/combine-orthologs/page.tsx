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
  receptorName: z.string().min(1, 'Required'),
});

interface Receptor {
  geneName: string;
  class: string;
  numOrthologs: number;
  lca: string;
  gpcrdbId: string;
}

type FormValues = z.infer<typeof formSchema>;

export default function CombineOrthologsPage() {
  const [searchResults, setSearchResults] = useState<Receptor[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      receptorName: '',
    },
  });

  const handleSearch = (value: string) => {
    if (!value.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setHasSearched(true);
    const results = receptors
      .filter((receptor: Receptor) => receptor.geneName.toLowerCase().includes(value.toLowerCase()))
      .slice(0, 10);

    setSearchResults(results);
  };

  function onSubmit(values: FormValues) {
    console.log(values);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-4">
      <h1 className="text-3xl font-bold text-left">Combine Orthologs</h1>
      <p className="text-lg text-muted-foreground text-left">
        Enter one or more receptor gene names (comma-separated) from the same class to fetch and
        merge their orthologous alignments. Columns that human sequences contain gaps are not
        included. You can preview the combined alignment and download as a FASTA file.
      </p>

      <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="receptorName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Receptor List (comma-separated)</FormLabel>
                  <FormControl>
                    <Command className="rounded-lg border shadow-md">
                      <CommandInput
                        placeholder="Search for receptor..."
                        onValueChange={value => {
                          handleSearch(value);
                          field.onChange(value);
                        }}
                        value={field.value}
                      />
                      {hasSearched && (
                        <CommandList
                          className={
                            searchResults.length > 5 ? 'max-h-[300px] overflow-y-auto' : ''
                          }
                        >
                          {searchResults.length === 0 ? (
                            <CommandEmpty>No results found.</CommandEmpty>
                          ) : (
                            <CommandGroup>
                              {searchResults.map((receptor, index) => (
                                <CommandItem
                                  key={index}
                                  value={receptor.geneName}
                                  className="cursor-pointer"
                                  onSelect={() => {
                                    field.onChange(receptor.geneName);
                                    setSearchResults([]);
                                    setHasSearched(false);
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

            <Button type="submit" className="w-full">
              Combine Alignments
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
