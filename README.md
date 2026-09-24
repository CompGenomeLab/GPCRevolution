This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Analytics (Google Analytics 4)

This project supports GA4 to track visits and geography.

1) Create a GA4 property and web data stream. Copy the Measurement ID (looks like `G-XXXXXXX`).

2) Set the environment variable locally or in your hosting provider:

```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXX
```

You can use `.env.local` during development. See `.env.local.example`.

3) The app automatically loads GA and tracks route changes. No additional setup is needed.

Notes:
- GA4 reports: Acquisition (source/medium/referrals) and Demographics (country/city).
- GA4 does not identify individual users; data is aggregate. Ensure cookie/consent compliance as required.

## Phyletic-distribution taxonomy tree

Generate the NCBI Taxonomy hierarchy used by the hidden phyletic-distribution
tool:

```bash
npm run generate:phyletic-tree
```

The taxonomy covers every organism in the searched database, the 2,760 NCBI
taxIDs of the UniProt 2025_02 eukaryotic reference proteome set, including
organisms in which no family was found (a taxon with no counts row has no hits
in any family). `taxonomy_eukaryotes_filtered.json` is built from that taxID
list with `scripts/ncbi_taxonomy_create.py` and the NCBI taxonomy dump of
September 2025. TaxID 1450536, since merged by NCBI into 856835
(*Guyanagaster necrorhizus*), is placed at 856835 and keeps its searched ID.

The page can switch to the Open Tree of Life reference taxonomy (OTT 3.7.3),
served as `taxonomy_ott.json`, `taxonomy_ott.nwk` and
`taxonomy_ott.tree-order.json` in the same formats. It is matched to the same
taxIDs through OTT's `ncbi:` source identifiers and places 2,662 of the 2,760;
the 98 OTT has no NCBI mapping for are absent from that view. The OTT files are
not made by `generate:phyletic-tree`: OTT's rank labels do not nest (an unranked
group can sit above a larger "order"), so rebuilding the nesting from flat rank
columns fails, and the newick is written from the OTT hierarchy itself with
internal nodes labelled `rank__name` like the NCBI tree. Both sets of files are
built by `build_taxonomy_trees.py` in the GPCR superfamily analysis (step 7).

The generator reads
`public/phyletic-distribution/taxonomy_eukaryotes_filtered.json` and writes
`public/phyletic-distribution/taxonomy_eukaryotes_filtered.nwk` plus
`public/phyletic-distribution/taxonomy_eukaryotes_filtered.tree-order.json`.

- Newick tips are NCBI taxIDs so they map directly to visualization records.
- Every populated taxonomy field is retained, including `Cellular Root`, all
  named ranks, `Clade` through `Clade 21`, and `No Rank` through `No Rank 3`.
  Empty and `NA` values never create nodes.
- Because the JSON stores ranked and unranked fields in separate flattened
  columns, groups are nested by containment of their sampled descendant taxa.
  Repeated names in different lineages are separated by broader context.
- Multifurcations are preserved as nodes with any number of children; the tree
  is never forced into a binary topology.
- The companion order file is the authoritative leaf order used by the
  visualization, preventing the taxonomy bars and tree tips from diverging.
- Branch lengths are layout distances, not evolutionary distances. The whole
  hierarchy is stretched to the available height; lineages may contain
  different numbers of populated taxonomy layers while all tips stay aligned.

For future visualization, prune the tree by visible taxID tips and retain child
arrays of arbitrary length. The NCBI tree should be described as a taxonomy
hierarchy and displayed as a cladogram by default.
