import type { Publication } from '@/types/publication';

export const CITATION_FORMATS = ['plain', 'bibtex', 'ris'] as const;
export type CitationFormat = (typeof CITATION_FORMATS)[number];

export const CITATION_FORMAT_LABELS: Record<CitationFormat, string> = {
  plain: 'Plain text',
  bibtex: 'BibTeX',
  ris: 'RIS',
};

/** Splits "Berkay Selçuk" into its given and family parts. */
function splitName(author: string): { given: string; family: string } {
  const trimmed = author.trim();
  const comma = trimmed.indexOf(',');
  if (comma !== -1) {
    return {
      family: trimmed.slice(0, comma).trim(),
      given: trimmed.slice(comma + 1).trim(),
    };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { given: '', family: trimmed };
  return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') };
}

/** "Berkay Selçuk" -> "Selçuk, B." */
function abbreviate(author: string): string {
  const { given, family } = splitName(author);
  if (!given) return family;
  const letters = given
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(part => `${part[0].toUpperCase()}.`)
    .join(' ');
  return `${family}, ${letters}`;
}

/** Drops diacritics and non-word characters so BibTeX keys stay ASCII. */
function asciiSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

/** True once the entry has enough metadata to render a real citation. */
export function isCitable(publication: Publication): boolean {
  return Boolean(publication.authors?.length && publication.year);
}

export function publicationLink(publication: Publication): string | undefined {
  if (publication.doi) return `https://doi.org/${publication.doi}`;
  return publication.url;
}

export function bibtexKey(publication: Publication): string {
  const first = publication.authors?.[0];
  if (!first) return asciiSlug(publication.id);
  const firstWord = publication.title.split(/\s+/)[0] ?? '';
  return `${asciiSlug(splitName(first).family)}${publication.year ?? ''}${asciiSlug(firstWord)}`;
}

function formatPlain(publication: Publication): string {
  const authors = (publication.authors ?? []).map(abbreviate);
  const authorList =
    authors.length > 1
      ? `${authors.slice(0, -1).join(', ')}, & ${authors[authors.length - 1]}`
      : (authors[0] ?? '');

  const volume = publication.volume
    ? `, ${publication.volume}${publication.issue ? `(${publication.issue})` : ''}`
    : '';
  const pages = publication.pages ? `, ${publication.pages}` : '';
  const link = publicationLink(publication);

  return [
    authorList,
    publication.year && `(${publication.year}).`,
    `${publication.title}.`,
    publication.journal && `${publication.journal}${volume}${pages}.`,
    link,
  ]
    .filter(Boolean)
    .join(' ');
}

function formatBibtex(publication: Publication): string {
  const fields: [string, string | undefined][] = [
    [
      'author',
      (publication.authors ?? [])
        .map(a => {
          const { given, family } = splitName(a);
          return given ? `${family}, ${given}` : family;
        })
        .join(' and '),
    ],
    ['title', publication.title],
    ['journal', publication.journal],
    ['year', publication.year ? String(publication.year) : undefined],
    ['volume', publication.volume],
    ['number', publication.issue],
    ['pages', publication.pages],
    ['doi', publication.doi],
    ['url', publicationLink(publication)],
  ];

  const body = fields
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `  ${key.padEnd(7)} = {${value}},`)
    .join('\n');

  return `@article{${bibtexKey(publication)},\n${body}\n}`;
}

function formatRis(publication: Publication): string {
  const lines: string[] = ['TY  - JOUR'];
  for (const author of publication.authors ?? []) {
    const { given, family } = splitName(author);
    lines.push(`AU  - ${given ? `${family}, ${given}` : family}`);
  }
  lines.push(`TI  - ${publication.title}`);
  if (publication.journal) lines.push(`JO  - ${publication.journal}`);
  if (publication.year) lines.push(`PY  - ${publication.year}`);
  if (publication.volume) lines.push(`VL  - ${publication.volume}`);
  if (publication.issue) lines.push(`IS  - ${publication.issue}`);
  if (publication.pages) lines.push(`SP  - ${publication.pages}`);
  if (publication.doi) lines.push(`DO  - ${publication.doi}`);
  const link = publicationLink(publication);
  if (link) lines.push(`UR  - ${link}`);
  lines.push('ER  - ');
  return lines.join('\n');
}

/** File extension used when a citation is downloaded. */
export const CITATION_FILE_EXTENSIONS: Record<CitationFormat, string> = {
  plain: 'txt',
  bibtex: 'bib',
  ris: 'ris',
};

/** MIME type used when a citation is downloaded. */
export const CITATION_MIME_TYPES: Record<CitationFormat, string> = {
  plain: 'text/plain',
  bibtex: 'application/x-bibtex',
  ris: 'application/x-research-info-systems',
};

/** Suggested download filename, e.g. "selcuk2026decoding.bib". */
export function citationFileName(publication: Publication, format: CitationFormat): string {
  return `${bibtexKey(publication)}.${CITATION_FILE_EXTENSIONS[format]}`;
}

export function formatCitation(publication: Publication, format: CitationFormat): string {
  switch (format) {
    case 'bibtex':
      return formatBibtex(publication);
    case 'ris':
      return formatRis(publication);
    default:
      return formatPlain(publication);
  }
}

/** Author line shown on the card, e.g. "Selçuk B, Erol I, Durdağı S, Adebali O". */
export function formatAuthorLine(publication: Publication): string {
  return (publication.authors ?? [])
    .map(author => {
      const { given, family } = splitName(author);
      if (!given) return family;
      const letters = given
        .split(/[\s-]+/)
        .filter(Boolean)
        .map(part => part[0].toUpperCase())
        .join('');
      return `${family} ${letters}`;
    })
    .join(', ');
}

/**
 * Volume/issue/pages shown after the journal name on the card, e.g.
 * "5(10), e202201439". Empty when the publication has none of them.
 */
export function formatVolumeLine(publication: Publication): string {
  const volume = publication.volume
    ? `${publication.volume}${publication.issue ? `(${publication.issue})` : ''}`
    : '';
  const pages = publication.pages ?? '';
  return [volume, pages].filter(Boolean).join(', ');
}
