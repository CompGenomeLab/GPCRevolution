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

## Sequence downloads (FASTA)

`public/sequences/` holds the full-length, unaligned sequences (UniProtKB 2025_02, as searched, with their UniProt
headers) of every sequence the species pages list, one FASTA per family:

- `<family>.fasta`: the final members of each GPCR family (after the GPR1 reassignment);
- `removed/<family>.fasta`: the members of each family's clade removed by the filters (no single 7TM core, or
  topology score below 0.8); a sequence removed from two clades is in both;
- `controls/<control>.fasta`: the control clades (G alpha, G beta, G gamma, TBP, RPB1).

A file over 95 MB is split into numbered parts (`classA_1.fasta`, `classA_2.fasta`), since GitHub refuses files
over 100 MB. Within each file the sequences of one genome form one contiguous block.

The **Download FASTA** buttons do not fetch whole files. They read `<family>.index.json`, which gives for each
taxID the file, byte offset, byte length and number of sequences of its block, and fetch only the genomes needed
with HTTP range requests (`src/lib/sequence-download.ts`), then zip one FASTA per family in the browser. For all
human Class A sequences that is 0.18 MB instead of 111 MB. The species page downloads exactly the rows its table
shows (kept, removed and control sequences, after its filters and search); the taxonomic-distribution page the
final members of the genomes and families in view (Final step only).

To update the sequences, rebuild the FASTA files and then their indexes:

```bash
# in the GPCR_Superfamily repository (needs its Zenodo archive)
python code_and_data/04_overlap_assignment/website/build_family_fasta.py --out <GPCRevolution>/public/sequences
# here: rewrite the byte-position indexes of public/sequences/ and its subfolders; run it after any FASTA change
node scripts/index-sequence-fasta.mjs
```

The index script stops with an error if a genome's sequences are not one contiguous block or a header has no
`OX=` taxID. A FASTA replaced without rerunning it leaves stale offsets, and the downloads return wrong sequences.
