import RootContainer from '@/components/RootContainer';
import PublicationEntry from '@/components/PublicationEntry';
import { publications } from '@/data/publications';
import type { Publication } from '@/types/publication';

/** Publications bucketed by year, newest first, unpublished ones first within a year. */
function groupByYear(entries: Publication[]): { heading: string; items: Publication[] }[] {
  const groups = new Map<number | null, Publication[]>();

  for (const entry of entries) {
    const key = entry.year ?? null;
    const bucket = groups.get(key);
    if (bucket) bucket.push(entry);
    else groups.set(key, [entry]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => (b ?? Infinity) - (a ?? Infinity))
    .map(([year, items]) => ({
      heading: year === null ? 'Forthcoming' : String(year),
      items: [...items].sort((a, b) => Number(Boolean(b.status)) - Number(Boolean(a.status))),
    }));
}

export default function CiteUsPage() {
  const groups = groupByYear(publications);

  return (
    <RootContainer className="px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-3xl font-bold text-left">Cite Us</h1>
        <p className="text-base text-muted-foreground text-left">
          If the GPCR Evolution Database contributed to your work, please cite the publications
          listed below. Each entry states which data and tools it covers, so cite the ones you
          actually used — a study that relies on both the resource and the underlying evolutionary
          data should cite both. Every reference can be copied or downloaded in plain text, BibTeX
          and RIS format.
        </p>
      </div>

      <div className="space-y-8 max-w-3xl mx-auto">
        {groups.map(({ heading, items }) => (
          <section key={heading} className="space-y-4">
            <h2 className="text-2xl font-semibold tabular-nums text-muted-foreground">{heading}</h2>
            {items.map(publication => (
              <PublicationEntry key={publication.id} publication={publication} />
            ))}
          </section>
        ))}
      </div>
    </RootContainer>
  );
}
