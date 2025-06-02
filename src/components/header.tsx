'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import DesktopNavigation from './DesktopNavigation';
import MobileNavigation from './MobileNavigation';

interface Props {
  className?: string;
}

export const navigationItems = [
  {
    title: 'Trees',
    items: [
      {
        title: 'Super Family',
        href: '/trees/super-family',
        description: 'View the complete Super Family tree',
      },
      {
        title: 'Olfactory Receptors',
        href: '/trees/class?type=olfactory',
        description: 'Explore Olfactory Receptor class trees',
      },
      {
        title: 'Class A',
        href: '/trees/class?type=a',
        description: 'View Class A class trees',
      },
      {
        title: 'Class B',
        href: '/trees/class?type=b',
        description: 'View Class B class trees',
      },
      {
        title: 'Class C',
        href: '/trees/class?type=c',
        description: 'View Class C class trees',
      },
      {
        title: 'Class F',
        href: '/trees/class?type=f',
        description: 'View Class F class trees',
      },
      {
        title: 'Class T',
        href: '/trees/class?type=t',
        description: 'View Class T class trees',
      },
    ],
  },
  {
    title: 'Tools',
    items: [
      {
        title: 'Differential Residue Conservation',
        href: '/tools/receptor-comparison',
        description: 'Analyze residue conservation patterns across species',
      },
      {
        title: 'Receptor Table Generator',
        href: '/tools/receptor-table',
        description: 'Generate comprehensive receptor tables',
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

export function Header({ className }: Props) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className={cn('bg-background border-b border-border', className)}>
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-12">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src={mounted && theme === 'dark' ? '/logo-light.png' : '/logo-dark.png'}
                alt="Logo"
                width={32}
                height={32}
              />
              <span className="text-xl font-semibold tracking-tight text-primary dark:text-primary">
                GPCREVOdb
              </span>
            </Link>

            <DesktopNavigation items={navigationItems} />
          </div>

          <div className="flex items-center gap-2">
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
