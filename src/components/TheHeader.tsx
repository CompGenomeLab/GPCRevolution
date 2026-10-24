'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { SiteSearch } from './SiteSearch';
import DesktopNavigation from './DesktopNavigation';
import MobileNavigation from './MobileNavigation';

interface Props {
  className?: string;
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
        description: 'Generate comprehensive tables and sequence logos',
      },
      {
        title: 'Combine Orthologs',
        href: '/tools/combine-orthologs',
        description: 'Merge and analyze orthologous sequences',
      },
      {
        title: 'Superfamily Logo Comparison (Beta)',
        href: '/superfamily-logo',
        description: 'Compare sequence logos of the GPCR families on one superfamily alignment',
      },
      {
        title: 'Family Taxonomic Distribution (Beta)',
        href: '/taxonomic-distribution',
        description: 'Browse GPCR family counts across eukaryotic genomes, with a count table',
      },
      {
        title: 'Superfamily Trees (Beta)',
        href: '/superfamily-trees',
        description: 'Explore the maximum likelihood trees of the GPCR superfamily',
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
  useEffect(() => {
    setMounted(true);
  }, []);

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
            <SiteSearch className="min-w-0 flex-1" />

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
            <SiteSearch className="w-72 lg:w-96" />

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
