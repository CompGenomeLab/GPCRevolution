# -*- coding: utf-8 -*-
"""
Build plotting-friendly taxonomy JSON for a filtered set of taxids (Eukaryota-only),
emitting ALL ranks encountered on lineages (including repeats like Clade, Clade 1, ...),
with missing ranks filled as "NA".

Pipeline:
  1) Load the NCBI taxonomy and insert selected synthetic higher-level clades.
  2) Build the full Eukaryota hierarchy (root=2759).
  3) Prune to user-provided taxIDs (keep the nodes and all ancestors to Eukaryota).
  4) Determine ALL labeled rank columns needed across the set.
  5) Order columns by their observed positions in the original NCBI lineages.
  6) Depth-first traversal for stable output-record ordering.
  7) Emit one flat JSON record per kept node with identical columns (fill NA if absent).

Notes:
  - Exported lineages begin at Eukaryota. The universal NCBI root and
    "cellular organisms" are intentionally omitted because they are constant
    for every record in this Eukaryota-only dataset.
  - "superkingdom" is displayed as "Domain".
  - Synthetic clades are inserted without deleting or renaming any NCBI node.
"""

import argparse
import csv
import json
from collections import defaultdict, Counter
from pathlib import Path
from statistics import median
from typing import Dict, List, Tuple, Set, Optional, Sequence

EUKARYOTA_TAXID = 2759

# Synthetic nodes use negative IDs so they cannot collide with NCBI taxIDs.
# Child names must be scientific names in names.dmp and direct children of the
# stated parent before insertion.
CUSTOM_GROUPS = (
    {
        "taxid": -1,
        "name": "Unikonta",
        "rank": "clade",
        "parent": "Eukaryota",
        "children": (
            ("Amoebozoa",),
            ("Opisthokonta",),
        ),
    },
    {
        "taxid": -2,
        "name": "Archaeplastida",
        "rank": "clade",
        "parent": "Eukaryota",
        "children": (
            ("Glaucocystophyceae", "Glaucophyta"),
            ("Rhodophyta",),
            ("Viridiplantae",),
        ),
    },
)

# ---------------- Helpers ----------------

def _is_na(val: str) -> bool:
    return val is None or str(val).strip().upper() in {"NA", "N/A", ""}


def _str_key(val: str):
    # Real names (case-insensitive) first; NA last.
    return (1, "") if _is_na(val) else (0, val.casefold())


def _fmt_name(name: Optional[str]) -> str:
    return "NA" if name is None or name == "" else name


def split_dmp_line(line: str):
    parts = [p.strip() for p in line.split("|")]
    if parts and parts[-1] == "":
        parts = parts[:-1]
    return parts


def rebuild_children(parent: Dict[int, int]) -> Dict[int, List[int]]:
    """Rebuild child adjacency from the authoritative parent mapping."""
    children: Dict[int, List[int]] = defaultdict(list)
    for tid, parent_tid in parent.items():
        if tid != parent_tid:
            children[parent_tid].append(tid)
    return children


# ---------------- Core parsers ----------------

def load_nodes(path) -> Tuple[Dict[int, int], Dict[int, str], Dict[int, List[int]]]:
    parent, rank = {}, {}
    children = defaultdict(list)
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            p = split_dmp_line(line)
            tid, ptid, rnk = int(p[0]), int(p[1]), p[2]
            parent[tid] = ptid
            rank[tid] = rnk
            children[ptid].append(tid)
    return parent, rank, children


def load_names(path) -> Dict[int, str]:
    sci_name, display_name = {}, {}
    all_names = defaultdict(list)
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            p = split_dmp_line(line)
            tid, name_txt, name_class = int(p[0]), p[1], p[3]
            all_names[tid].append((name_txt, name_class))
            if name_class == "scientific name" and tid not in sci_name:
                sci_name[tid] = name_txt
    for tid, lst in all_names.items():
        display_name[tid] = sci_name.get(tid, lst[0][0])
    return display_name


# ---------------- Synthetic taxonomy overlay ----------------

def build_name_index(name_map: Dict[int, str]) -> Dict[str, List[int]]:
    index: Dict[str, List[int]] = defaultdict(list)
    for tid, name in name_map.items():
        index[name.casefold()].append(tid)
    return index


def resolve_unique_name(name: str,
                        name_index: Dict[str, List[int]],
                        description: str) -> int:
    matches = name_index.get(name.casefold(), [])
    if not matches:
        raise ValueError(f"Could not find {description} scientific name in names.dmp: {name}")
    if len(matches) != 1:
        raise ValueError(
            f"Scientific name is not unique for {description}: {name} -> {matches}"
        )
    return matches[0]


def resolve_aliases(aliases: Sequence[str],
                    name_index: Dict[str, List[int]],
                    description: str) -> int:
    found: List[Tuple[str, int]] = []
    for alias in aliases:
        matches = name_index.get(alias.casefold(), [])
        if len(matches) > 1:
            raise ValueError(
                f"Scientific-name alias is not unique for {description}: {alias} -> {matches}"
            )
        if len(matches) == 1:
            found.append((alias, matches[0]))

    unique_taxids = {tid for _, tid in found}
    if not unique_taxids:
        raise ValueError(
            f"Could not find any scientific-name alias for {description}: {tuple(aliases)}"
        )
    if len(unique_taxids) != 1:
        raise ValueError(
            f"Aliases resolve to different taxIDs for {description}: {found}"
        )
    return next(iter(unique_taxids))


def apply_custom_groups(parent: Dict[int, int],
                        rank_map: Dict[int, str],
                        name_map: Dict[int, str]) -> Dict[int, List[int]]:
    """
    Insert synthetic parent nodes while preserving every existing NCBI node.

    Each listed child must currently be a direct child of the listed parent.
    This prevents a misspelled or outdated group definition from silently
    rewiring a deeper portion of the NCBI hierarchy.
    """
    name_index = build_name_index(name_map)

    for group in CUSTOM_GROUPS:
        synthetic_tid = int(group["taxid"])
        group_name = str(group["name"])
        group_rank = str(group["rank"])
        parent_name = str(group["parent"])

        if synthetic_tid >= 0:
            raise ValueError(f"Synthetic taxID must be negative: {synthetic_tid}")
        if synthetic_tid in parent or synthetic_tid in name_map:
            raise ValueError(f"Synthetic taxID is already in use: {synthetic_tid}")

        parent_tid = resolve_unique_name(
            parent_name, name_index, f"parent of synthetic group {group_name}"
        )

        child_taxids: List[int] = []
        for aliases in group["children"]:
            child_tid = resolve_aliases(
                aliases, name_index, f"child of synthetic group {group_name}"
            )
            current_parent = parent.get(child_tid)
            if current_parent != parent_tid:
                current_parent_name = name_map.get(current_parent, str(current_parent))
                raise ValueError(
                    f"Cannot insert {group_name}: child {name_map.get(child_tid, child_tid)} "
                    f"is currently under {current_parent_name}, not directly under {parent_name}."
                )
            child_taxids.append(child_tid)

        parent[synthetic_tid] = parent_tid
        rank_map[synthetic_tid] = group_rank
        name_map[synthetic_tid] = group_name
        name_index[group_name.casefold()].append(synthetic_tid)

        for child_tid in child_taxids:
            parent[child_tid] = synthetic_tid

    return rebuild_children(parent)


# ---------------- Lineage helpers ----------------

def lineage_to_ancestor(tid: int,
                        parent: Dict[int, int],
                        ancestor_tid: int = EUKARYOTA_TAXID) -> List[int]:
    """Return [ancestor..tid], raising if the requested ancestor is not reached."""
    path, seen, cur = [], set(), tid
    while True:
        if cur in seen:
            raise ValueError(f"Cycle detected while tracing taxID {tid}: {cur}")
        seen.add(cur)
        path.append(cur)

        if cur == ancestor_tid:
            return path[::-1]

        if cur not in parent:
            raise ValueError(
                f"TaxID {tid} does not reach ancestor {ancestor_tid}; missing parent for {cur}."
            )
        next_tid = parent[cur]
        if next_tid == cur:
            raise ValueError(
                f"TaxID {tid} reached root {cur} before ancestor {ancestor_tid}."
            )
        cur = next_tid


def path_to_root(tid: int, parent: Dict[int, int]) -> List[int]:
    # Kept for the existing call sites; the analytical root is Eukaryota.
    return lineage_to_ancestor(tid, parent, EUKARYOTA_TAXID)


# ---------------- TSV filter loader ----------------

def load_taxid_filter(tsv_path: str) -> Set[int]:
    taxids: Set[int] = set()
    with open(tsv_path, "r", encoding="utf-8") as f:
        sample = f.read(2048)
        f.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample)
        except csv.Error:
            class Dialect(csv.excel_tab):
                delimiter = "\t"
            dialect = Dialect()

        reader = csv.reader(f, dialect)
        rows = list(reader)
        if not rows:
            return taxids

        header_like = rows[0]
        has_header = any(not cell.isdigit() for cell in header_like)

        if has_header:
            header = [h.strip() for h in header_like]
            cand_idx = None
            low = [h.lower() for h in header]
            for i, h in enumerate(low):
                if "tax" in h and "id" in h:
                    cand_idx = i
                    break
            if cand_idx is None:
                cand_idx = 0
            data_rows = rows[1:]
            for r in data_rows:
                if not r or cand_idx >= len(r):
                    continue
                try:
                    taxids.add(int(r[cand_idx].strip()))
                except ValueError:
                    continue
        else:
            for r in rows:
                if not r:
                    continue
                try:
                    taxids.add(int(r[0].strip()))
                except ValueError:
                    continue
    return taxids


# ---------------- Hierarchy traversal ----------------

def collect_eukaryota_descendants(root_tid: int,
                                  children: Dict[int, List[int]],
                                  rank_map: Dict[int, str]) -> Set[int]:
    """Traverse the entire Eukaryota subtree and collect all nodes."""
    keep: Set[int] = set()
    stack = [root_tid]
    seen: Set[int] = set()
    while stack:
        tid = stack.pop()
        if tid in seen:
            continue
        seen.add(tid)
        keep.add(tid)
        for c in children.get(tid, []):
            stack.append(c)
    return keep


def compute_relevant_nodes_for_filtered(keep_nodes: Set[int],
                                        parent: Dict[int, int],
                                        root_tid: int = EUKARYOTA_TAXID) -> Set[int]:
    """Union of filtered nodes and their ancestors through Eukaryota."""
    relevant: Set[int] = set()
    for node in keep_nodes:
        relevant.update(lineage_to_ancestor(node, parent, root_tid))
    return relevant


def build_pruned_children(children: Dict[int, List[int]],
                          euk_nodes: Set[int],
                          relevant: Set[int]) -> Dict[int, List[int]]:
    """Adjacency for nodes under Eukaryota that lie on paths to kept nodes."""
    pruned: Dict[int, List[int]] = defaultdict(list)
    for parent_tid, kids in children.items():
        if parent_tid not in euk_nodes or parent_tid not in relevant:
            continue
        for c in kids:
            if c in euk_nodes and c in relevant:
                pruned[parent_tid].append(c)
    return pruned


def node_name(tid: int, name_map: Dict[int, str]) -> str:
    return _fmt_name((name_map.get(tid, "") or "").strip())


def child_sort_key(tid: int, name_map: Dict[int, str], rank_map: Dict[int, str]):
    nm = node_name(tid, name_map)
    r = (rank_map.get(tid, "") or "").lower()
    return (_str_key(nm), r, tid)


def order_nodes_by_hierarchy(root_tid: int,
                             pruned_children: Dict[int, List[int]],
                             rank_map: Dict[int, str],
                             name_map: Dict[int, str],
                             kept_nodes: Set[int]) -> List[int]:
    """
    Depth-first traversal; emit nodes that are in kept_nodes.
    Children are visited alphabetically for stable, taxonomy-contiguous output.
    """
    ordered: List[int] = []

    def dfs(tid: int):
        kids = pruned_children.get(tid, [])
        kids_sorted = sorted(kids, key=lambda k: child_sort_key(k, name_map, rank_map))
        for c in kids_sorted:
            dfs(c)
        if tid in kept_nodes:
            ordered.append(tid)

    dfs(root_tid)
    return ordered


# ---------------- Rank labeling (for repeated ranks) ----------------

def normalized_rank_label(raw_rank: str) -> str:
    """
    Normalize a raw NCBI rank to a display-column base:
      - superkingdom -> Domain
      - all others -> title case
    """
    r = (raw_rank or "no rank").strip().lower()
    if r == "superkingdom":
        return "Domain"
    return r.title()


def labeled_columns_for_path(path_taxids: List[int],
                             rank_map: Dict[int, str]) -> List[str]:
    """
    Given [Eukaryota..node], label repeated ranks in lineage order:
      ["Domain", "Clade", "Clade 1", "Phylum", ...]
    """
    seen = Counter()
    labels = []
    for tid in path_taxids:
        base = normalized_rank_label(rank_map.get(tid, "no rank"))
        suffix = "" if seen[base] == 0 else f" {seen[base]}"
        labels.append(f"{base}{suffix}")
        seen[base] += 1
    return labels


# ---------------- Build global schema (all labeled rank columns) ----------------

def _label_tiebreak(label: str):
    """Natural ordering for repeated labels such as Clade, Clade 1, Clade 2."""
    parts = label.rsplit(" ", 1)
    if len(parts) == 2 and parts[1].isdigit():
        return (parts[0].casefold(), int(parts[1]))
    return (label.casefold(), -1)


def collect_all_labeled_columns(kept_nodes: Set[int],
                                parent: Dict[int, int],
                                rank_map: Dict[int, str]) -> List[str]:
    """
    Union of all labeled columns across all kept lineages.

    Columns are ordered by their median normalized position in the original
    Eukaryota-to-tip paths rather than alphabetically. This preserves the flat
    JSON schema while giving the Newick builder a biologically informed order
    for unary layers that have identical sampled descendants.
    """
    positions: Dict[str, List[float]] = defaultdict(list)

    for tid in kept_nodes:
        path = path_to_root(tid, parent)
        labels = labeled_columns_for_path(path, rank_map)
        denominator = max(1, len(labels) - 1)
        for index, label in enumerate(labels):
            positions[label].append(index / denominator)

    return sorted(
        positions,
        key=lambda label: (
            median(positions[label]),
            sum(positions[label]) / len(positions[label]),
            _label_tiebreak(label),
        ),
    )


# ---------------- Record builder ----------------

def build_full_json(order_taxids: List[int],
                    parent: Dict[int, int],
                    rank_map: Dict[int, str],
                    name_map: Dict[int, str],
                    all_labels: List[str]) -> List[Dict[str, object]]:
    """
    Emit one record per kept node with an identical flat column set.

    The output contract is:
      - taxID first
      - every observed NCBI taxonomy rank in lineage-informed order
      - species convenience field last

    Biotype is not reserved as metadata because current NCBI taxdump releases
    use it as a genuine taxonomy rank for some records.
    """
    result: List[Dict[str, object]] = []

    for tid in order_taxids:
        path = path_to_root(tid, parent)

        labels_this = labeled_columns_for_path(path, rank_map)
        names_this = [name_map.get(t, str(t)) for t in path]
        fill_map = dict(zip(labels_this, names_this))

        species_name = "NA"
        for t in reversed(path):
            if rank_map.get(t, "").strip().lower() == "species":
                species_name = name_map.get(t, str(t))
                break
        if species_name == "NA":
            species_name = name_map.get(tid, str(tid))

        rec: Dict[str, object] = {"taxID": tid}
        for col in all_labels:
            rec[col] = _fmt_name(fill_map.get(col, "NA"))
        rec["species"] = _fmt_name(species_name)
        result.append(rec)

    return result


# ---------------- CLI ----------------

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TAXID_TSV_PATH = (
    PROJECT_ROOT
    / "public"
    / "phyletic-distribution"
    / "tax_counts_per_family_unfiltered.tsv"
)
DEFAULT_OUTPUT_JSON = (
    PROJECT_ROOT
    / "public"
    / "phyletic-distribution"
    / "taxonomy_eukaryotes_filtered.json"
)


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Create the flattened Eukaryota taxonomy JSON used by the "
            "phyletic-distribution visualization."
        )
    )
    parser.add_argument(
        "--nodes",
        required=True,
        type=Path,
        help="Path to nodes.dmp from an NCBI taxdump release.",
    )
    parser.add_argument(
        "--names",
        required=True,
        type=Path,
        help="Path to names.dmp from the same NCBI taxdump release.",
    )
    parser.add_argument(
        "--taxids",
        type=Path,
        default=DEFAULT_TAXID_TSV_PATH,
        help=(
            "TSV/CSV containing the taxIDs to retain. Defaults to the "
            "project's unfiltered GPCR-family table."
        ),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_JSON,
        help="Output JSON path for the website.",
    )
    return parser.parse_args()


# ---------------- RUN ----------------

if __name__ == "__main__":
    args = parse_args()

    # Load the NCBI dumps.
    parent, rank_map, children = load_nodes(args.nodes)
    name_map = load_names(args.names)

    # Add agreed higher-level eukaryotic groups, then rebuild child adjacency.
    children = apply_custom_groups(parent, rank_map, name_map)

    # Build the modified Eukaryota subtree.
    euk_nodes = collect_eukaryota_descendants(EUKARYOTA_TAXID, children, rank_map)

    # Load and retain only supplied taxIDs that occur below Eukaryota.
    keep_taxids_raw = load_taxid_filter(args.taxids)
    kept_nodes = {tid for tid in keep_taxids_raw if tid in euk_nodes}

    # Keep selected nodes and every ancestor through Eukaryota.
    relevant_nodes = compute_relevant_nodes_for_filtered(
        kept_nodes, parent, EUKARYOTA_TAXID
    )

    # Prune and establish the stable record order.
    pruned_children = build_pruned_children(children, euk_nodes, relevant_nodes)
    order_taxids = order_nodes_by_hierarchy(
        EUKARYOTA_TAXID, pruned_children, rank_map, name_map, kept_nodes
    )

    # Build the shared, lineage-informed flat schema and JSON records.
    all_labels = collect_all_labeled_columns(kept_nodes, parent, rank_map)
    data = build_full_json(order_taxids, parent, rank_map, name_map, all_labels)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as fo:
        json.dump(data, fo, ensure_ascii=False)

    print(f"Wrote {len(data)} records to {args.output}")
    if data:
        print("Example record keys:", list(data[0].keys()))

    unique_raw_ranks = sorted({
        (rank_map.get(tid, "no rank") or "no rank").strip().lower()
        for tid in relevant_nodes
    })
    print("\nUnique raw rank categories used (sorted, lower-case):")
    print(unique_raw_ranks)

    print("\nExported labeled rank columns (lineage-informed order):")
    print(all_labels)
