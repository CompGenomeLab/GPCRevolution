'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Download, ExternalLink, Quote } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  CITATION_FORMATS,
  CITATION_FORMAT_LABELS,
  CITATION_MIME_TYPES,
  type CitationFormat,
  citationFileName,
  isCitable,
  formatAuthorLine,
  formatCitation,
  formatVolumeLine,
  publicationLink,
} from '@/lib/citation';
import { cn } from '@/lib/utils';
import type { CiteForItem, Publication } from '@/types/publication';

interface Props {
  publication: Publication;
}

/** Formats offered as file downloads, in the order the buttons appear. */
const DOWNLOAD_FORMATS: CitationFormat[] = ['bibtex', 'ris'];

function CiteForList({ heading, items }: { heading: string; items: CiteForItem[] }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-foreground">{heading}</p>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {items.map(item => (
          <li key={item.label}>
            {'• '}
            {item.href ? (
              <Link href={item.href} className="underline hover:text-foreground">
                {item.label}
              </Link>
            ) : (
              item.label
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PublicationEntry({ publication }: Props) {
  const [showCite, setShowCite] = useState(false);
  const [format, setFormat] = useState<CitationFormat>('plain');
  const [copied, setCopied] = useState(false);

  const link = publicationLink(publication);
  const citation = formatCitation(publication, format);
  const volumeLine = formatVolumeLine(publication);
  const citable = isCitable(publication);
  const citeForData = publication.citeFor?.data ?? [];
  const citeForTools = publication.citeFor?.tools ?? [];
  const hasCiteFor = citeForData.length > 0 || citeForTools.length > 0;

  async function copyCitation() {
    try {
      await navigator.clipboard.writeText(citation);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(`${CITATION_FORMAT_LABELS[format]} citation copied`);
    } catch {
      toast.error('Could not copy — select the text and copy manually');
    }
  }

  function downloadCitation(target: CitationFormat) {
    const fileName = citationFileName(publication, target);
    const blob = new Blob([formatCitation(publication, target)], {
      type: `${CITATION_MIME_TYPES[target]};charset=utf-8`,
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
    toast.success(`Downloaded ${fileName}`);
  }

  return (
    <article className="space-y-4 rounded-lg bg-card p-6 text-card-foreground shadow-md sm:p-8">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">{publication.title}</h2>
        {citable ? (
          <>
            <p className="text-sm text-muted-foreground">{formatAuthorLine(publication)}</p>
            <p className="text-sm text-muted-foreground">
              <span className="italic">{publication.journal}</span>
              {volumeLine && ` ${volumeLine}`}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {publication.status ? `${publication.status}.` : ''}
            Full citation details will be added upon publication.
          </p>
        )}
      </div>

      {publication.note && <p className="text-muted-foreground">{publication.note}</p>}

      {hasCiteFor && (
        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <h3 className="font-semibold text-foreground">Cite if you use</h3>
          </div>
          {citeForData.length > 0 && <CiteForList heading="Data" items={citeForData} />}
          {citeForTools.length > 0 && <CiteForList heading="Tools" items={citeForTools} />}
        </div>
      )}

      {citable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={showCite ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowCite(current => !current)}
            aria-expanded={showCite}
          >
            <Quote />
            Cite
          </Button>

          {link && (
            <Button variant="outline" size="sm" asChild>
              <Link href={link} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                {publication.doi ? 'DOI' : 'View'}
              </Link>
            </Button>
          )}

          {publication.pmid && (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`https://pubmed.ncbi.nlm.nih.gov/${publication.pmid}/`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink />
                PubMed
              </Link>
            </Button>
          )}
        </div>
      )}

      {citable && showCite && (
        <div className="space-y-3 rounded-md border bg-muted/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {CITATION_FORMATS.map(option => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormat(option)}
                  className={cn(
                    'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                    option === format
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {CITATION_FORMAT_LABELS[option]}
                </button>
              ))}
            </div>

            <Button variant="ghost" size="sm" onClick={copyCitation}>
              {copied ? <Check /> : <Copy />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <pre className="overflow-x-auto rounded-md bg-background p-3 text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground">
            {citation}
          </pre>

          <div className="flex flex-wrap items-center gap-2">
            {DOWNLOAD_FORMATS.map(target => (
              <Button
                key={target}
                variant="outline"
                size="sm"
                onClick={() => downloadCitation(target)}
              >
                <Download />
                Download {CITATION_FORMAT_LABELS[target]}
              </Button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
