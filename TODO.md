# GPCRevolution to-do

Work list for the whole database and website, for every project that feeds it, not only the superfamily
paper. Kept at the repository root rather than in `public/`, because everything in `public/` is served by
the site. Add new requests under *Open* in their section, and move an item to *Done* with its date when it
is finished.

## Open

### Superfamily paper (GPCR superfamily manuscript)

**Priority (user, 2026-10-22):** 1. ML trees (superfamily tree visualizations), 2. per-species page. The other
items follow.

- [ ] **Cite the manuscript on the transparency pages and their FAQ entries.** Each transparency page and its
  FAQ answer (`src/lib/transparency.ts`) should refer to the paper, as the preprint until it is published and
  then the published version, so readers can find the full methods. Waiting (user, 2026-10-24): the manuscript
  is not public yet; possible once a preprint is posted.
- [ ] **Per-species page** (new). For each searched species: every potential GPCR (all sequences after clade
  extraction) with its search E-value and whether and at which step it was removed (single 7TM core, topology
  score, overlap assignment, Dikarya reassignment); UniProt IDs and counts per family, per lineage
  (Glutamate-, cAMP-, Rhodopsin-related; STE2 apart) and in total; G protein IDs and counts; optionally the
  control counts (TBP, RBP1). All inputs are in the paper's Zenodo archive (stages 01-04 and 10).
  **First version built 2026-10-23, not committed, not in the menu, noindex:** `/species?taxid=<taxID>`
  (`src/app/species/page.tsx`, `src/components/species/SpeciesViewer.tsx`, `src/types/species.ts`), data
  `public/species/` (index.json + one JSON per genome, 64 MB) from
  `release/.../04_overlap_assignment/website/build_species_data.py --out <public/species>`. Totals equal the
  final counts (391,856). Under review by the user.
  - Site search with a scope switch (Receptors default, Species), `src/components/SiteSearch.tsx`, used on the
    home page and in the header; species names from `public/species/search.json` (with NCBI common names).
    Built 2026-10-23; 2026-10-24: dropdown restyled as part of the box, "Species" marked Beta, the home heading
    follows it ("Find your receptor" / "Find your species").
  - Later (user, 2026-10-24; requested 2026-10-23): show the database version on the page.
  - **FASTA download built 2026-10-24:** "Download FASTA" above the sequence table gives exactly the rows shown
    (kept, removed and control sequences, after the filters and search), one FASTA per family in a ZIP;
    `public/sequences/` (final, `removed/`, `controls/`; indexes by `scripts/index-sequence-fasta.mjs`; README
    "Sequence downloads"). Check range requests on the live host after the push.
  - **Literature sequences on the species pages (long run; user, 2026-10-24).** All sequences of the literature
    comparison (not only the 18 of the trees), each on its species page with the study's citation, the family
    the study gave, our matching family and the MMseqs2 search metrics (best hit, bits, identity, coverage,
    E-value; `05_literature_comparison` of the archive). Keep them apart from our counts (391,856 stays as
    published). Species with literature sequences only (e.g. Petromyzon marinus) would need their own pages.
- [ ] **Phyletic distribution, filtering steps: built 2026-10-23, not committed.** Source Data now offers the five
  steps (found, seven-helix core, structural fit, overlaps resolved, final; final opens first), explained in its
  info hint. Tables `public/phyletic-distribution/tax_counts_per_family_{clade,core,topology,overlap}.tsv` from
  `release/.../04_overlap_assignment/website/build_step_count_tables.py` (overlap and final checked equal to the
  published count tables). Next: taxon browser (tree, group summary, genome list, TSV/FASTA download of our own
  2025_02 sequences, not UniProt).
  Built with it (2026-10-23): a click on a family count cell opens that genome's species page filtered to the
  family (`/species?taxid=..&family=..`), the hover names the genome, and at 25 genomes or fewer in view the
  plot lists links to their species pages.
- [ ] **Phyletic distribution, table of what is shown (later; user, 2026-10-23).** A table under the plot listing
  the genomes currently in view, with a species name column, their counts per shown family and a link to each
  species page. It follows the plot: as the user clicks lineages and zooms in or out, the table shows exactly the
  genomes and families in view, at the Source Data step selected. Downloads integrated into it: the table as TSV,
  and the sequences in view as FASTA. A right-click menu was considered and set aside (too much to ask of users).
  Depends on: our own sequences (UniProt 2025_02, as searched) saved and served by the site, per genome or per
  family, which is not done yet; no fetching from UniProt.
  **Count table built 2026-10-23, not committed, under review:** `src/components/phyletic-distribution/CountTable.tsx`
  under the plot. Columns: the selected lineage ranks, species (always, linked to its species page), then the
  selected families in plot order; counts from the Source Data step selected; rows = genomes in view (follows
  lineage clicks and filters); sortable headers and TSV download as on the species page (`SortTh`, `downloadTsv`
  now exported from `SpeciesViewer.tsx`). Built 2026-10-24: "Download FASTA" (final members of the genomes and
  families in view; Final step only) and "Download counts" (the table as shown, TSV) above the table.
- [ ] **Topology filter and long ICL3 (found 2026-10-23, user to decide).** `trimal -gt 0.1` drops the TM6/TM7
  columns of sequences with a long ICL3 (human CHRM1-5, HRH1), so they score 0 there and fail. Scoring over the
  helices present (at least 5) would recover 9,429 of 16,853 topology removals (Class A 7,712). Changes the
  paper's counts; not applied.
- [ ] **Recover sequences filtered out wrongly (idea, user, 2026-10-24; no solid approach yet).** Some true
  GPCRs are removed by the filters (e.g. the long-ICL3 case above). Find a general way to recover them for the
  database without changing the paper's counts, e.g. as a separate, flagged set.
- [ ] **Fig. 2, lineage distribution and origins** (new). Port `06_family_origins/lineage_origin_figure.html`
  of the archive.
- [ ] **ML trees page: built 2026-10-23, user-approved state, not committed, not in the menu.** `/superfamily-trees`
  (`src/app/superfamily-trees/page.tsx`, `src/components/superfamily-trees/SuperfamilyTreeViewer.tsx`,
  `src/lib/superfamily-trees/draw.ts`, `src/types/superfamily-trees.ts`, data `public/superfamily-trees/` from
  `release/.../09_superfamily_phylogeny/website/build_superfamily_trees_data.py --out <public/superfamily-trees>`).
  8 trees; Simplified/Circular views; family labels final (21 Dikarya Class A -> GPR1) or as in the trees; lineage
  and family checkboxes; fade unstable (STE2 cutoff); info hints (ControlHint); full screen; SVG export; page is
  noindex. Left to do: commit, add to the menu (user plans Tools or a visualizations group), drop noindex then.
- [ ] **Family-assignment page:** mark more named reference sequences (known annotations that guided the
  extraction) besides the human ones, so the separation of the clades is easier to see. The builder takes
  them as guide accessions (`GUIDE_MARKERS` in `build_family_assignment_data.py`).
- [ ] **Family-assignment page, decision:** Class A and Class C still count the nested families (GPR1 and
  Vomeronasal 1, Vomeronasal 2) inside their clade until "Overlaps resolved", so their counts differ from
  Table S1 at the first three steps. Decide whether to remove them at clade extraction, as in the Methods.
- [ ] **Topology-filter page: show the sequence as well.** Next to the topology state of each cell, show the
  residue: in the tooltip, as the letter once the map is zoomed in, and optionally as a second map coloured by
  residue (the analysis viewer already supports a protein alignment beside its topology projection). Needs the
  residue alignment the topology alignments were projected from, `<family>_genes_7TMfilter_db_TMonly_FAMSA.fasta`
  per family; it is on the cluster (`$P/families/<family>/`) but not yet in the Zenodo archive. Roughly doubles
  the page data (Class A about 14 MB more).
- [ ] **Data Availability links:** the manuscript links `/transparency/family-assignment` (Methods and the
  Figure 1 legend) and `/taxonomic-distribution`; check every linked page is live once pushed.
- [ ] **Renamed 2026-10-24, not committed:** Phyletic distribution -> "Family Taxonomic Distribution", route
  `src/app/taxonomic-distribution/` (old `/phyletic-distribution` redirects there, `next.config.ts`); data folder
  `public/phyletic-distribution/` and component names unchanged. Tools menu now in one column with three Beta
  entries (Superfamily Logo Comparison, Family Taxonomic Distribution, Superfamily Trees).

### Before the next push

- [x] 2026-10-24: `src/app/api/curation-masks/route.ts` declared `OUTPUT_PATH`, `GET` and `POST` twice, so `tsc`
  (and a `next build`) failed on it; the duplicate block was removed.

### Deferred

- [ ] **Transparency for every study (idea, user, 2026-10-24).** Provide transparency pages and files for every study
  associated with the database, not only the superfamily paper. Possible shape: an overview page `/transparency`
  listing each study's pages in its Methods order, a "Transparency" item in the top menu (separate from Tools),
  and links from the tools to the matching step. For now the transparency pages stay reachable only through the
  FAQ, not linked from the menu or the tools.

- [ ] **Structure viewer of the shared motifs** (Fig. 5, 3Dmol). Not needed for the manuscript. Options: a
  transparency page, a panel on the superfamily-logo page showing where the logo positions lie, or a
  structural-overlap tool. The viewer itself needs further improvement first (user, 2026-10-22).

## Done

- 2026-10-22 (committed and pushed with the earlier superfamily-logo updates)
  - `transparency/family-assignment` page: `src/app/transparency/family-assignment/`,
    `src/components/family-assignment/`, `src/lib/family-assignment/draw.ts`, `src/types/family-assignment.ts`,
    data in `public/family-assignment/` (built from the paper's archive).
  - FAQ: transparency pages listed in `src/lib/transparency.ts`, one question each.
  - `transparency/topology-filter` page: `src/app/transparency/topology-filter/`,
    `src/components/topology-filter/`, `src/lib/topology-filter/viewer.ts`, `src/types/topology-filter.ts`, data in
    `public/topology-filter/` (19 alignments, 23 MB, largest 14 MB). Filter impact per family and the read-only
    topology viewer; its retained counts equal Table S1 for every family (Class C without Vomeronasal 2).
  - Phyletic distribution: final counts (`tax_counts_per_family_final.tsv`, after the GPR1 reassignment) as
    the only dataset; TM116 after GP143 in the family order.
  - Unused data removed: the three old phyletic count tables (`tax_counts_per_family_e0.1_BestEval*.tsv`,
    `tax_counts_per_family_unfiltered.tsv`, replaced by the single final count table) and
    `public/fullscreen.svg`, which nothing referenced. Every other item in `public/` is read by a page (the
    ten superfamily-logo mapping folders through the set, gap and guide-tree options of that page).
  - Superfamily logo: Class C logo data updated (`superfamily_logo_mappings_treein`,
    `superfamily_logo_mappings_lower_gap_treein`).
