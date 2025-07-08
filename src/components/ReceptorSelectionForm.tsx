'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
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
import { Slider } from '@/components/ui/slider';
import { useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Loader2 } from 'lucide-react';
import receptors from '../../public/receptors.json';

const formSchema = z.object({
  receptor1: z.string().min(1, 'Required'),
  receptor2: z.string().min(1, 'Required'),
  threshold: z.number().min(0).max(100),
});

interface Receptor {
  geneName: string;
  class: string;
  numOrthologs: number;
  lca: string;
  gpcrdbId: string;
  snakePlot: string;
  name: string;
  conservationFile: string;
}

interface ReceptorSelectionFormProps {
  onSubmit: (values: z.infer<typeof formSchema>) => Promise<void>;
  onThresholdChange: (values: z.infer<typeof formSchema>) => Promise<void>;
  isLoading: boolean;
}

export default function ReceptorSelectionForm({ 
  onSubmit, 
  onThresholdChange, 
  isLoading 
}: ReceptorSelectionFormProps) {
  const [searchResults1, setSearchResults1] = useState<Receptor[]>([]);
  const [searchResults2, setSearchResults2] = useState<Receptor[]>([]);
  const [hasSearched1, setHasSearched1] = useState(false);
  const [hasSearched2, setHasSearched2] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      receptor1: '',
      receptor2: '',
      threshold: 90,
    },
  });

  const receptor1 = useWatch({
    control: form.control,
    name: 'receptor1',
  });

  const receptor2 = useWatch({
    control: form.control,
    name: 'receptor2',
  });

  const handleSearch1 = (value: string) => {
    if (!value.trim()) {
      setSearchResults1([]);
      setHasSearched1(false);
      return;
    }

    setHasSearched1(true);
    const term = value.toLowerCase();
    const results = receptors
      .filter(
        (receptor: Receptor) =>
          receptor.geneName.toLowerCase().includes(term) || receptor.name.toLowerCase().includes(term)
      )
      .slice(0, 10);

    setSearchResults1(results);
  };

  const handleSearch2 = (value: string) => {
    if (!value.trim()) {
      setSearchResults2([]);
      setHasSearched2(false);
      return;
    }

    setHasSearched2(true);
    const term = value.toLowerCase();
    const results = receptors
      .filter(
        (receptor: Receptor) =>
          receptor.geneName.toLowerCase().includes(term) || receptor.name.toLowerCase().includes(term)
      )
      .slice(0, 10);

    setSearchResults2(results);
  };

  return (
    <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="receptor1"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Receptor 1 Name</FormLabel>
                <FormControl>
                  <Command shouldFilter={false} className="rounded-lg border shadow-md">
                    <CommandInput
                      placeholder="Search for receptor 1..."
                      onValueChange={value => {
                        handleSearch1(value);
                        field.onChange(value);
                      }}
                      value={field.value}
                    />
                    {hasSearched1 && (
                      <CommandList
                        className={
                          searchResults1.length > 5 ? 'max-h-[300px] overflow-y-auto' : ''
                        }
                      >
                        {searchResults1.length === 0 ? (
                          <CommandEmpty>No results found.</CommandEmpty>
                        ) : (
                          <CommandGroup>
                            {searchResults1.map((receptor, index) => (
                              <CommandItem
                                key={index}
                                value={`${receptor.geneName} ${receptor.name}`}
                                className="cursor-pointer"
                                onSelect={() => {
                                  field.onChange(receptor.geneName);
                                  setSearchResults1([]);
                                  setHasSearched1(false);
                                }}
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium">{`${receptor.geneName} - ${receptor.name}`}</span>
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
            name="receptor2"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Receptor 2 Name</FormLabel>
                <FormControl>
                  <Command shouldFilter={false} className="rounded-lg border shadow-md">
                    <CommandInput
                      placeholder="Search for receptor 2..."
                      onValueChange={value => {
                        handleSearch2(value);
                        field.onChange(value);
                      }}
                      value={field.value}
                    />
                    {hasSearched2 && (
                      <CommandList
                        className={
                          searchResults2.length > 5 ? 'max-h-[300px] overflow-y-auto' : ''
                        }
                      >
                        {searchResults2.length === 0 ? (
                          <CommandEmpty>No results found.</CommandEmpty>
                        ) : (
                          <CommandGroup>
                            {searchResults2.map((receptor, index) => (
                              <CommandItem
                                key={index}
                                value={`${receptor.geneName} ${receptor.name}`}
                                className="cursor-pointer"
                                onSelect={() => {
                                  field.onChange(receptor.geneName);
                                  setSearchResults2([]);
                                  setHasSearched2(false);
                                }}
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium">{`${receptor.geneName} - ${receptor.name}`}</span>
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
            name="threshold"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Conservation Threshold: {field.value}%</FormLabel>
                <FormControl>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[field.value]}
                    onValueChange={value => {
                      field.onChange(value[0]);
                      if (receptor1 && receptor2) {
                        onThresholdChange({
                          receptor1,
                          receptor2,
                          threshold: value[0],
                        });
                      }
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              'Compare Receptors'
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
} 