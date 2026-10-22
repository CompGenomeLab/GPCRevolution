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
  then the published version, so readers can find the full methods.
- [ ] **Per-species page** (new). For each searched species: every potential GPCR (all sequences after clade
  extraction) with its search E-value and whether and at which step it was removed (single 7TM core, topology
  score, overlap assignment, Dikarya reassignment); UniProt IDs and counts per family, per lineage
  (Glutamate-, cAMP-, Rhodopsin-related; STE2 apart) and in total; G protein IDs and counts; optionally the
  control counts (TBP, RBP1). All inputs are in the paper's Zenodo archive (stages 01-04 and 10).
- [ ] **Fig. 2, lineage distribution and origins** (new). Port `06_family_origins/lineage_origin_figure.html`
  of the archive.
- [ ] **ML trees** (update `superfamily-trees`): the 8 final trees, viewer and data in the archive under
  `09_superfamily_phylogeny/tree_viewer/` (`ml_tree_viewer.html`, `tree_viewer_data/`). Figure 3 is the core
  tree.
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
  Figure 1 legend) and `/phyletic-distribution`; check every linked page is live once pushed.

### Before the next push

- [ ] `src/app/api/curation-masks/route.ts` declares `OUTPUT_PATH`, `GET` and `POST` twice, so `tsc` (and a
  `next build`) fails on it; it was already so before October 2026. Remove the duplicate block.

### Deferred

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
