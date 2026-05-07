# -*- coding: utf-8 -*-
"""
Spyder-friendly: parse manual curation + alignments, compute BLOSUM80-augmented
conservation % before vs after removing masked orthologs (no CSV/JSON output).

No coverage / gap-count thresholds — every human non-gap column uses the same
count + BLOSUM80 formula (Δ reflects curation only, not threshold flips).

Edit CONFIG (OUTPUT_FIGURE_STEM, HISTOGRAM_Y_AXIS_MODE, etc.). Run the whole file.

Depends: pip install blosum matplotlib
"""

from __future__ import annotations

import json
import statistics
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

import blosum as bl
import matplotlib.pyplot as plt
import numpy as np

# ---------------------------------------------------------------------------
# CONFIG — set plot paths here (Spyder). Use None to skip saving figures.
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent.parent
MANUAL_CURATION_JSON = REPO_ROOT / "public" / "manual_curation.json"
ALIGNMENTS_DIR = REPO_ROOT / "public" / "alignments"

MIN_ORTHOLOGS = 25
TAX_ID = "9606"
USE_BLOSUM_SIMILARITY = True

# Base path without extension: writes {stem}_histogram.png
# If you pass a path ending in .png, the stem is used (e.g. .../foo.png -> foo_histogram.png).
OUTPUT_FIGURE_STEM: Optional[Any] = (
    r"C:\Users\selcuk.1\OneDrive - The Ohio State University\Desktop\gpcr_DELTAconservation"
)
SHOW_PLOTS = True
# Histogram y-axis: "linear" | "log" | "asinh"
# For "asinh", matplotlib's linear_width is set from the data: same height as the orange
# reference line (tallest bin with Δ>25 past x=50%, else past x=25%), else max bin count.
# That ties the quasi-linear stretch on the y-axis to your distribution (no manual 500).
HISTOGRAM_Y_AXIS_MODE = "asinh"
# Optional hard y limits (None = auto). HISTOGRAM_Y_MAX e.g. 400 zooms in on lower counts
# (very tall bins are clipped). HISTOGRAM_Y_MIN rarely needed; for log y use > 0.
HISTOGRAM_Y_MIN: Optional[float] = None
HISTOGRAM_Y_MAX: Optional[float] = None
# Float tolerance: |Δ| below this is treated as “no change” (avoids 1e-16 ≠ 0).
DELTA_ZERO_EPS = 1e-9
# ---------------------------------------------------------------------------


def _figure_paths_from_stem(stem: Optional[Any]) -> Optional[Tuple[Path, str]]:
    """
    Returns (directory, basename_without_ext) or None if stem unset.
    basename is used as prefix: basename_histogram.png, etc.
    """
    if stem is None or stem == "":
        return None
    p = Path(stem)
    suf = p.suffix.lower()
    if suf in {".png", ".pdf", ".svg", ".jpg", ".jpeg", ".webp"}:
        return p.parent, p.stem
    if p.suffix and not p.is_dir():
        # e.g. odd extension; treat as file stem
        return p.parent, p.stem
    # Directory or extensionless file path: use last component as basename
    return p.parent, p.name


def _save_path(stem: Optional[Any], kind: str) -> Optional[Path]:
    info = _figure_paths_from_stem(stem)
    if info is None:
        return None
    parent, base = info
    return parent / f"{base}_{kind}.png"


def _apply_histogram_y_axis(ax, mode: str, asinh_linear_width: float) -> str:
    """
    Configure histogram y-axis. Returns a second-line y-axis note (parenthetical long form),
    or "" for linear scale (no second line).
    """
    mode = (mode or "linear").strip().lower()
    if mode == "log":
        ax.set_yscale("log")
        ax.set_ylim(bottom=0.8)
        return "(logarithmic scale)"
    if mode == "asinh":
        try:
            ax.set_yscale("asinh", linear_width=max(asinh_linear_width, 1e-6))
        except (ValueError, TypeError) as e:
            print(
                "HISTOGRAM_Y_AXIS_MODE='asinh' not supported by this matplotlib; "
                f"falling back to log y ({e})"
            )
            ax.set_yscale("log")
            ax.set_ylim(bottom=0.8)
            return "(logarithmic scale; asinh unavailable)"
        return "(Inverse Hyperbolic Sine Scale)"
    ax.set_yscale("linear")
    return ""


def _apply_histogram_y_limits(ax) -> None:
    """Apply HISTOGRAM_Y_MIN / HISTOGRAM_Y_MAX if set (after data are drawn)."""
    lo, hi = ax.get_ylim()
    new_lo = HISTOGRAM_Y_MIN if HISTOGRAM_Y_MIN is not None else lo
    new_hi = HISTOGRAM_Y_MAX if HISTOGRAM_Y_MAX is not None else hi
    if HISTOGRAM_Y_MIN is not None or HISTOGRAM_Y_MAX is not None:
        ax.set_ylim(bottom=new_lo, top=new_hi)


def _auto_asinh_linear_width(
    counts: Sequence[float],
    edges: Sequence[float],
    changed: Sequence[float],
) -> float:
    """
    Single scale from data for asinh y-axis: reference peak height if defined, else
    tallest bin overall (≥ 1). Same basis as the dashed reference line.
    """
    y_ref = _reference_line_height_from_histogram(counts, edges, changed)
    if y_ref is not None and y_ref > 0:
        return max(float(y_ref), 1.0)
    c = np.asarray(counts, dtype=float)
    if c.size == 0:
        return 1.0
    return max(float(np.max(c)), 1.0)


def _reference_line_height_from_histogram(
    counts: Sequence[float],
    edges: Sequence[float],
    changed: Sequence[float],
) -> Optional[float]:
    """
    Height (residue count) of the tallest histogram bin to the right of Δ = 50% among
    bins that use only Δ > 25 (positive change > 25%). If none past 50%, fall back to
    bins starting at Δ ≥ 25%. Returns None if no positive height.
    """
    if not changed or len(counts) == 0:
        return None
    c = np.asarray(counts, dtype=float)
    e = np.asarray(edges, dtype=float)
    pos_gt25 = np.array([x for x in changed if x > 25.0], dtype=float)
    if pos_gt25.size > 0:
        c_use, _ = np.histogram(pos_gt25, bins=e)
    else:
        c_use = c
    y50 = 0.0
    for i in range(len(c_use)):
        if e[i] >= 50.0:
            y50 = max(y50, c_use[i])
    if y50 > 0:
        return float(y50)
    y25 = 0.0
    for i in range(len(c_use)):
        if e[i] >= 25.0:
            y25 = max(y25, c_use[i])
    return float(y25) if y25 > 0 else None


def _draw_histogram_reference_line(ax, y_ref: float) -> None:
    """Dashed horizontal line at bin-count height y_ref; text on figure only (not in legend)."""
    if y_ref <= 0:
        return
    ax.axhline(
        y_ref,
        color="tab:orange",
        linestyle="--",
        linewidth=1.25,
        zorder=6,
        alpha=0.9,
    )
    xmin, xmax = ax.get_xlim()
    span = xmax - xmin if xmax != xmin else 1.0
    ax.text(
        xmax - 0.02 * span,
        y_ref,
        f"y = {y_ref:g}",
        ha="right",
        va="bottom",
        fontsize=9,
        color="tab:orange",
        zorder=7,
    )


def _plot_changed_histogram_split_center_at_zero(
    ax,
    changed: Sequence[float],
    hist_edges: np.ndarray,
) -> None:
    """
    Draw blue histogram for non-zero Δ. Near x=0, uses the same grid as
    _near_zero_histogram_geometry: either one straddle bin is split at 0, or 0 is a bin edge
    and the left bin [-a, 0) stays whole while [0, hi) is split at pos_end = min(a, hi).
    """
    counts, edges = np.histogram(changed, bins=hist_edges)
    edges = np.asarray(edges, dtype=float)
    neg_lo, pos_hi, straddle, i_pos, i_neg_only = _near_zero_histogram_geometry(edges)

    neg_w = 0.0 - neg_lo
    pos_end = min(neg_w, pos_hi)
    at_top = pos_end >= pos_hi - 1e-9

    n_neg_slice = sum(1 for d in changed if neg_lo <= d < 0)
    if at_top:
        n_pos_first = sum(1 for d in changed if 0 < d < pos_hi)
        n_pos_tail = 0
    else:
        n_pos_first = sum(1 for d in changed if 0 < d <= pos_end)
        n_pos_tail = sum(1 for d in changed if pos_end < d < pos_hi)

    kw = dict(
        align="edge",
        color="steelblue",
        edgecolor="white",
        linewidth=0.5,
        alpha=0.9,
        zorder=3,
    )
    labeled = False
    for j in range(len(counts)):
        lo, hi = float(edges[j]), float(edges[j + 1])
        h = float(counts[j])
        if h <= 0:
            continue

        if straddle and j == i_pos:
            if n_neg_slice > 0:
                ax.bar(
                    neg_lo,
                    n_neg_slice,
                    width=0.0 - neg_lo,
                    label="Changed (Δ ≠ 0)" if not labeled else "_nolegend_",
                    **kw,
                )
                labeled = True
            if n_pos_first > 0:
                ax.bar(
                    0.0,
                    n_pos_first,
                    width=pos_end if not at_top else pos_hi,
                    label="Changed (Δ ≠ 0)" if not labeled else "_nolegend_",
                    **kw,
                )
                labeled = True
            if n_pos_tail > 0:
                ax.bar(
                    pos_end,
                    n_pos_tail,
                    width=pos_hi - pos_end,
                    label="Changed (Δ ≠ 0)" if not labeled else "_nolegend_",
                    **kw,
                )
                labeled = True
            continue

        if (not straddle) and j == i_pos:
            if n_pos_first > 0:
                ax.bar(
                    0.0,
                    n_pos_first,
                    width=pos_end if not at_top else pos_hi,
                    label="Changed (Δ ≠ 0)" if not labeled else "_nolegend_",
                    **kw,
                )
                labeled = True
            if n_pos_tail > 0:
                ax.bar(
                    pos_end,
                    n_pos_tail,
                    width=pos_hi - pos_end,
                    label="Changed (Δ ≠ 0)" if not labeled else "_nolegend_",
                    **kw,
                )
                labeled = True
            continue

        if (not straddle) and i_neg_only is not None and j == i_neg_only:
            ax.bar(
                lo,
                h,
                width=hi - lo,
                label="Changed (Δ ≠ 0)" if not labeled else "_nolegend_",
                **kw,
            )
            labeled = True
            continue

        ax.bar(
            lo,
            h,
            width=hi - lo,
            label="Changed (Δ ≠ 0)" if not labeled else "_nolegend_",
            **kw,
        )
        labeled = True


def alignment_dict(fasta_path: Path) -> Dict[str, str]:
    result: Dict[str, str] = {}
    with open(fasta_path, encoding="utf-8", errors="replace") as f:
        header: Optional[str] = None
        chunks: List[str] = []
        for line in f:
            line = line.rstrip("\n\r")
            if not line and header is None:
                continue
            if line.startswith(">"):
                if header is not None:
                    result[header] = "".join(chunks)
                header = line.strip()
                chunks = []
            elif header is not None:
                chunks.append(line.strip())
        if header is not None:
            result[header] = "".join(chunks)
    return result


def ref_non_gap(align_dict: Mapping[str, str], tax: str, rec_name: str) -> List[int]:
    reference_seq = ""
    for seq in align_dict:
        parts = seq.split("|")
        if parts and parts[-1] == tax and rec_name in seq:
            reference_seq = align_dict[seq]
            break
    non_gap: List[int] = []
    for count, aa in enumerate(reference_seq):
        if aa != "-":
            non_gap.append(count)
    return non_gap


def column_aa_counts(align_dict: Mapping[str, str], pos: int) -> Tuple[List[str], List[int], int]:
    column_chars: List[str] = []
    for header in align_dict:
        seq = align_dict[header]
        if pos < len(seq):
            column_chars.append(seq[pos])
        else:
            column_chars.append("-")
    column = "".join(column_chars)
    aas = sorted(set(column))
    gap_count = 0
    aa_list: List[str] = []
    counts: List[int] = []
    for aa in aas:
        c = column.count(aa)
        aa_list.append(aa)
        counts.append(c)
        if aa == "-":
            gap_count = c
    return aa_list, counts, gap_count


_blosum80 = bl.BLOSUM(80)


def blosum_score(most_freq_aa: str, target_aa: str) -> float:
    if most_freq_aa == "-" or target_aa == "-":
        return 0.0
    try:
        return float(_blosum80[most_freq_aa][target_aa])
    except Exception:
        return 0.0


def conservation_percentage(
    aa_list: Sequence[str],
    count_list: Sequence[int],
    non_gap_count: int,
    similarity: bool,
) -> float:
    """BLOSUM80-augmented column conservation % (no threshold gating)."""
    conservations: List[float] = []
    max_cons = 0.0
    max_aa = "."
    for i in range(len(count_list)):
        aa = aa_list[i]
        count = count_list[i]
        if non_gap_count <= 0:
            conservation = 0.0
        elif round(count / non_gap_count, 2) > 1:
            conservation = (count / (non_gap_count + count)) * 100.0
        else:
            conservation = (count / non_gap_count) * 100.0
        conservations.append(conservation)
        if conservation >= max_cons:
            max_cons = conservation
            max_aa = aa

    for i in range(len(aa_list)):
        aa = aa_list[i]
        if similarity:
            if aa != max_aa[0] and blosum_score(max_aa[0], aa) >= 2:
                idx = aa_list.index(aa)
                max_cons += conservations[idx]
                max_aa += "/" + aa
        final_conservation = max_cons
        if max_aa == "-":
            final_conservation = 0.0

    return float(final_conservation)


def column_conservation_percent(
    align_dict: Mapping[str, str], pos: int, similarity: bool
) -> float:
    aa_list, counts, gap_count = column_aa_counts(align_dict, pos)
    non_gap_count = sum(counts) - gap_count
    return conservation_percentage(aa_list, counts, non_gap_count, similarity)


def strip_gt(header: str) -> str:
    h = header.strip()
    return h[1:] if h.startswith(">") else h


def normalize_mask_entries(masked_field: Any) -> List[str]:
    if not masked_field:
        return []
    out: List[str] = []
    for item in masked_field:
        if isinstance(item, str):
            s = item.strip()
            if s:
                out.append(s)
        elif isinstance(item, dict):
            flag = item.get("masked")
            if flag is None:
                flag = item.get("remove")
            if flag is None:
                flag = item.get("selected")
            if flag is not True:
                continue
            h = item.get("header") or item.get("id") or item.get("sequenceId")
            if isinstance(h, str) and h.strip():
                out.append(h.strip())
    return out


def filter_alignment(align: Mapping[str, str], mask_stripped: set) -> Dict[str, str]:
    return {k: v for k, v in align.items() if strip_gt(k) not in mask_stripped}


def load_curation(path: Path) -> List[dict]:
    with open(path, encoding="utf-8") as f:
        payload = json.load(f)
    return list(payload.get("receptors") or [])


def summarize_delta_distribution(deltas: List[float], eps: float = DELTA_ZERO_EPS) -> Dict[str, Any]:
    """
    Numeric summary of Δ = conservation_after − conservation_before (per residue × receptor).

    Useful quantities:
      • n_pos / n_neg / n_zero and % — how often curation helps vs hurts vs no change.
      • median — typical signed change (robust; good headline number).
      • mean — average signed change (positive and negative can cancel).
      • mean_pos / mean_neg — average size of increases vs decreases (among non-zero).
      • mean_abs / median_abs — typical *magnitude* of change ignoring direction.
      • Q1 / Q3 — spread compatible with the box plot.
    """
    n = len(deltas)
    if n == 0:
        return {"n": 0}

    pos = [d for d in deltas if d > eps]
    neg = [d for d in deltas if d < -eps]
    n_pos, n_neg = len(pos), len(neg)
    n_zero = n - n_pos - n_neg
    abs_d = [abs(d) for d in deltas]

    out: Dict[str, Any] = {
        "n": n,
        "n_positive": n_pos,
        "n_negative": n_neg,
        "n_zero": n_zero,
        "pct_positive": 100.0 * n_pos / n,
        "pct_negative": 100.0 * n_neg / n,
        "pct_zero": 100.0 * n_zero / n,
        "mean_delta": statistics.mean(deltas),
        "median_delta": statistics.median(deltas),
        "mean_abs_delta": statistics.mean(abs_d),
        "median_abs_delta": statistics.median(abs_d),
        "sum_positive_delta": sum(pos),
        "sum_negative_delta": sum(neg),
        "mean_delta_if_positive": statistics.mean(pos) if pos else None,
        "mean_delta_if_negative": statistics.mean(neg) if neg else None,
        "stdev_delta": statistics.stdev(deltas) if n > 1 else None,
        "min_delta": min(deltas),
        "max_delta": max(deltas),
    }
    try:
        q1, q2, q3 = statistics.quantiles(deltas, n=4, method="inclusive")
        out["q1_delta"] = q1
        out["q2_delta"] = q2
        out["q3_delta"] = q3
    except statistics.StatisticsError:
        out["q1_delta"] = out["q2_delta"] = out["q3_delta"] = None
    return out


def print_delta_summary(summary: Dict[str, Any]) -> None:
    if summary.get("n") == 0:
        print("Δ summary: no residue rows.")
        return
    n = summary["n"]
    print()
    print("=== Δ conservation % (after − before) — numeric summary ===")
    print(
        f"  N = {n}  (residue × receptor positions)\n"
        f"  Increased: {summary['n_positive']} ({summary['pct_positive']:.2f}%)\n"
        f"  Decreased: {summary['n_negative']} ({summary['pct_negative']:.2f}%)\n"
        f"  No change (Δ = 0): {summary['n_zero']} ({summary['pct_zero']:.2f}%)"
    )
    print(
        f"  Mean Δ:   {summary['mean_delta']:.6g}\n"
        f"  Median Δ: {summary['median_delta']:.6g}"
    )
    if summary.get("stdev_delta") is not None:
        print(f"  St. dev.: {summary['stdev_delta']:.6g}")
    if summary.get("q1_delta") is not None:
        print(
            f"  Quartiles (Q1 / Q2 / Q3): {summary['q1_delta']:.6g} / "
            f"{summary['q2_delta']:.6g} / {summary['q3_delta']:.6g}"
        )
    print(
        f"  Mean |Δ|:   {summary['mean_abs_delta']:.6g}\n"
        f"  Median |Δ|: {summary['median_abs_delta']:.6g}"
    )
    if summary["mean_delta_if_positive"] is not None:
        print(f"  Mean Δ when Δ>0:  {summary['mean_delta_if_positive']:.6g}  (n={summary['n_positive']})")
    if summary["mean_delta_if_negative"] is not None:
        print(f"  Mean Δ when Δ<0:  {summary['mean_delta_if_negative']:.6g}  (n={summary['n_negative']})")
    print(
        f"  Sum of positive Δ: {summary['sum_positive_delta']:.6g}\n"
        f"  Sum of negative Δ: {summary['sum_negative_delta']:.6g}"
    )
    print(f"  Min / max Δ: {summary['min_delta']:.6g} / {summary['max_delta']:.6g}")
    print()


def _near_zero_histogram_geometry(
    edges: np.ndarray,
) -> Tuple[float, float, bool, int, Optional[int]]:
    """
    Describe how the 60-bin grid meets 0.

    Returns (neg_lo, pos_hi, straddle, i_pos, i_neg_only):
    - **Straddle** (one bin has neg_lo < 0 < pos_hi): i_pos is that bin; i_neg_only is None.
      Slices: [neg_lo, 0), (0, pos_end] with pos_end = min(-neg_lo, pos_hi).
    - **Split at 0** (bin containing 0 is [0, pos_hi)): neg_lo = edges[i_pos - 1];
      i_neg_only is the pure-negative bin index; same slice formulas using that neg_lo.

    When 0 falls on a bin edge, numpy uses [0, pos_hi) for Δ=0; without the left bin, neg_lo
    would be 0 and the “first negative / first positive” ranges degenerate to [0,0) and (0,0].
    """
    e = np.asarray(edges, dtype=float)
    iz: Optional[int] = None
    for j in range(len(e) - 1):
        if e[j] <= 0 < e[j + 1]:
            iz = j
            break
    if iz is None:
        centers = (e[:-1] + e[1:]) / 2.0
        iz = int(np.argmin(np.abs(centers)))

    lo, hi = float(e[iz]), float(e[iz + 1])
    if lo < 0:
        return lo, hi, True, iz, None
    # Bin containing 0 is [0, pos_hi); negative arm is the previous bin [-a, 0).
    if iz > 0:
        neg_lo = float(e[iz - 1])
        return neg_lo, hi, False, iz, iz - 1
    return 0.0, hi, False, iz, None


def _count_in_bin_excl_zero(
    deltas: Sequence[float], lo: float, hi: float, eps: float
) -> float:
    """Half-open [lo, hi); exact zeros (|Δ|≤eps) excluded."""
    return float(sum(1 for d in deltas if abs(d) > eps and lo <= d < hi))


def minimal_change_bin_stats(
    deltas: List[float], bins: int = 60, eps: float = DELTA_ZERO_EPS
) -> Dict[str, Any]:
    """
    Same automatic bin edges as np.histogram(deltas, bins=60).

    Uses the histogram grid around 0 (see _near_zero_histogram_geometry). If one bin spans
    negative and positive values, neg_lo is its left edge; if 0 is a bin edge, neg_lo is the
    left edge of the bin immediately to the left of [0, pos_hi).

    • First negative slice: [neg_lo, 0). • First positive: (0, pos_end] with
      pos_end = min(-neg_lo, pos_hi). Exact Δ=0 stays in n_zero only.
    • Combined minimal = n_zero + first neg + first pos (rest of the near-zero region is separate).
    """
    n = len(deltas)
    if n == 0:
        return {"n": 0}
    _, edges = np.histogram(deltas, bins=bins)
    neg_lo, pos_hi, straddle, _i_pos, _i_neg = _near_zero_histogram_geometry(edges)
    neg_arm_w = 0.0 - neg_lo
    pos_end = min(neg_arm_w, pos_hi)
    at_positive_bin_top = pos_end >= pos_hi - 1e-9

    n_first_neg = float(sum(1 for d in deltas if abs(d) > eps and neg_lo <= d < 0))
    if at_positive_bin_top:
        n_first_pos = float(
            sum(1 for d in deltas if abs(d) > eps and 0 < d < pos_hi)
        )
    else:
        n_first_pos = float(
            sum(1 for d in deltas if abs(d) > eps and 0 < d <= pos_end)
        )

    n_zero = float(sum(1 for d in deltas if abs(d) <= eps))
    n_combined = n_zero + n_first_neg + n_first_pos
    if straddle:
        n_center_excl_zero = _count_in_bin_excl_zero(deltas, neg_lo, pos_hi, eps)
    else:
        n_center_excl_zero = _count_in_bin_excl_zero(
            deltas, neg_lo, 0.0, eps
        ) + _count_in_bin_excl_zero(deltas, 0.0, pos_hi, eps)

    return {
        "n": n,
        "n_zero": n_zero,
        "pct_zero": 100.0 * n_zero / n,
        "n_first_negative_bin": n_first_neg,
        "pct_first_negative_bin": 100.0 * n_first_neg / n,
        "first_negative_x_range": (neg_lo, 0.0),
        "n_first_positive_bin": n_first_pos,
        "pct_first_positive_bin": 100.0 * n_first_pos / n,
        "first_positive_pos_end": pos_end,
        "first_positive_right_closed": not at_positive_bin_top,
        "center_bin_x_range": (neg_lo, pos_hi),
        "n_center_bin": n_center_excl_zero,
        "pct_center_bin": 100.0 * n_center_excl_zero / n,
        "n_center_nonzero": n_center_excl_zero,
        "pct_center_nonzero": 100.0 * n_center_excl_zero / n,
        "n_minimal_combined": n_combined,
        "pct_minimal_combined": 100.0 * n_combined / n,
    }


def print_minimal_change_bin_stats(deltas: List[float]) -> None:
    s = minimal_change_bin_stats(deltas)
    if s.get("n") == 0:
        print("Near-zero bin summary: no data.")
        return
    clo, chi = s["center_bin_x_range"]
    nlo, nhi = s["first_negative_x_range"]
    if nlo < -1e-15:
        neg_txt = f"Δ ∈ [{nlo:.4g}, {nhi:.4g})"
    else:
        neg_txt = "Δ ∈ [0, 0) (no negative slice — 0 is the histogram left edge)"
    pe = s["first_positive_pos_end"]
    if s["first_positive_right_closed"] and pe > 1e-15 and pe < chi - 1e-9:
        pos_txt = f"Δ ∈ (0, {pe:.4g}]"
    else:
        pos_txt = f"Δ ∈ (0, {chi:.4g})"
    print()
    print("=== Near-zero Δ (60-bin histogram, same auto range as figure) ===")
    print(
        "  Definition: exact Δ = 0 + first negative bin + first positive bin "
        "(not the rest of the bin that straddles 0).\n"
        f"  Exact Δ = 0: {int(s['n_zero'])} ({s['pct_zero']:.2f}%)\n"
        f"  First negative bin ({neg_txt}): "
        f"{int(s['n_first_negative_bin'])} ({s['pct_first_negative_bin']:.2f}%)\n"
        f"  First positive bin ({pos_txt}): "
        f"{int(s['n_first_positive_bin'])} ({s['pct_first_positive_bin']:.2f}%)"
    )
    print(
        f"  Combined (zeros + first neg + first pos): {int(s['n_minimal_combined'])} "
        f"({s['pct_minimal_combined']:.2f}%)"
    )
    print(
        f"  (For context: near-zero histogram interval (bins meeting 0): [{clo:.4g}, {chi:.4g}); "
        f"count in that x-interval with exact Δ=0 excluded: {int(s['n_center_bin'])} "
        f"({s['pct_center_bin']:.2f}%) — excluded from combined above.)"
    )
    print()


def analyze_curation_impact() -> Tuple[
    List[dict],
    List[float],
    List[Tuple[str, float, int, int]],
    List[str],
    Dict[str, Any],
]:
    """
    Returns:
      rows, all_deltas, per_receptor_mean_delta, skipped,
      delta_summary — see summarize_delta_distribution()
    """
    receptors = load_curation(MANUAL_CURATION_JSON)
    rows: List[dict] = []
    all_deltas: List[float] = []
    per_receptor_mean_delta: List[Tuple[str, float, int, int]] = []
    skipped: List[str] = []
    similarity = USE_BLOSUM_SIMILARITY

    for rec in receptors:
        gene = rec.get("geneName")
        if not gene:
            continue
        masked = normalize_mask_entries(rec.get("maskedSequenceHeaders"))
        if not masked:
            continue

        fasta = ALIGNMENTS_DIR / f"{gene}_orthologs_MSA.fasta"
        if not fasta.is_file():
            skipped.append(f"{gene}:missing_fasta")
            continue

        align_full = alignment_dict(fasta)
        n_seq = len(align_full)
        if n_seq < MIN_ORTHOLOGS:
            skipped.append(f"{gene}:n={n_seq}<{MIN_ORTHOLOGS}")
            continue

        mask_set = {strip_gt(m) for m in masked}
        present_masks = {strip_gt(k) for k in align_full if strip_gt(k) in mask_set}
        if not present_masks:
            skipped.append(f"{gene}:no_masked_headers_in_fasta")
            continue

        align_trim = filter_alignment(align_full, present_masks)
        if len(align_trim) < 2:
            skipped.append(f"{gene}:too_few_sequences_after_mask")
            continue

        non_gap = ref_non_gap(align_full, TAX_ID, gene)
        if not non_gap:
            skipped.append(f"{gene}:no_human_reference")
            continue

        print(
            f"processing {gene} | orthologs={n_seq} | masked_removed={len(present_masks)} "
            f"| human_residues={len(non_gap)}"
        )

        deltas_this: List[float] = []
        for ri, pos in enumerate(non_gap):
            before = column_conservation_percent(align_full, pos, similarity)
            after = column_conservation_percent(align_trim, pos, similarity)
            delta = after - before
            deltas_this.append(delta)
            all_deltas.append(delta)
            rows.append(
                {
                    "geneName": gene,
                    "human_residue_index": ri + 1,
                    "alignment_column": pos + 1,
                    "percent_before": before,
                    "percent_after": after,
                    "delta": delta,
                    "n_seq_before": n_seq,
                    "n_seq_after": len(align_trim),
                    "n_masked_removed": len(present_masks),
                }
            )

        if deltas_this:
            per_receptor_mean_delta.append(
                (gene, sum(deltas_this) / len(deltas_this), len(deltas_this), len(present_masks))
            )

    print(
        f"done — analyzed {len(per_receptor_mean_delta)} receptors, "
        f"{len(rows)} residue rows, skipped {len(skipped)}"
    )
    if skipped:
        preview = skipped[:25]
        more = f" … (+{len(skipped) - len(preview)} more)" if len(skipped) > len(preview) else ""
        print("skipped:", "; ".join(preview) + more)

    delta_summary = summarize_delta_distribution(all_deltas)
    print_delta_summary(delta_summary)
    print_minimal_change_bin_stats(all_deltas)

    return rows, all_deltas, per_receptor_mean_delta, skipped, delta_summary


def plot_results(all_deltas: List[float]) -> None:
    """Histogram of pooled per-residue Δ (saved as {OUTPUT_FIGURE_STEM}_histogram.png)."""
    title_base = "Δ conservation % per residue"

    fig_h, ax_h = plt.subplots(figsize=(9, 5))
    if all_deltas:
        eps = DELTA_ZERO_EPS
        n_unchanged = sum(1 for d in all_deltas if abs(d) <= eps)
        changed = [d for d in all_deltas if abs(d) > eps]
        span = max(all_deltas) - min(all_deltas)
        zero_bar_w = max(span / 80.0, eps * 1e6, 1e-6) if span > 0 else 1.0

        hist_counts: Optional[np.ndarray] = None
        hist_edges: Optional[np.ndarray] = None
        asinh_lw = 1.0
        if changed:
            hist_counts, hist_edges = np.histogram(changed, bins=60)
            mode_lc = (HISTOGRAM_Y_AXIS_MODE or "").strip().lower()
            if mode_lc == "asinh":
                asinh_lw = _auto_asinh_linear_width(hist_counts, hist_edges, changed)
            _plot_changed_histogram_split_center_at_zero(ax_h, changed, hist_edges)
        elif (HISTOGRAM_Y_AXIS_MODE or "").strip().lower() == "asinh" and n_unchanged > 0:
            asinh_lw = max(float(n_unchanged), 1.0)
        if n_unchanged > 0:
            ax_h.bar(
                0.0,
                n_unchanged,
                width=zero_bar_w,
                align="center",
                color="dimgray",
                edgecolor="black",
                linewidth=0.6,
                alpha=0.9,
                label=f"No change (Δ = 0), n = {n_unchanged}",
                zorder=5,
            )
        if not changed and n_unchanged:
            # All values are (numerically) zero change
            ax_h.set_xlim(-zero_bar_w * 3, zero_bar_w * 3)

        ax_h.axvline(0, color="black", linestyle="--", linewidth=1, zorder=4)
        ax_h.set_xlabel("Δ conservation % (after − before)")
        y_axis_note = _apply_histogram_y_axis(ax_h, HISTOGRAM_Y_AXIS_MODE, asinh_lw)
        if y_axis_note:
            ax_h.set_ylabel("Number of Residues\n" + y_axis_note)
        else:
            ax_h.set_ylabel("Number of Residues")
        ax_h.set_title(f"{title_base} (n={len(all_deltas):,})")
        _apply_histogram_y_limits(ax_h)
        if hist_counts is not None and hist_edges is not None:
            y_ref = _reference_line_height_from_histogram(
                hist_counts, hist_edges, changed
            )
            if y_ref is not None:
                _draw_histogram_reference_line(ax_h, y_ref)
        ax_h.legend(loc="best", fontsize=9)
    else:
        ax_h.set_title(f"{title_base} (n=0)")
        ax_h.text(0.5, 0.5, "No data", ha="center", va="center", transform=ax_h.transAxes)

    fig_h.tight_layout()
    out_h = _save_path(OUTPUT_FIGURE_STEM, "histogram")
    if out_h is not None:
        out_h.parent.mkdir(parents=True, exist_ok=True)
        fig_h.savefig(out_h, dpi=150)

    if SHOW_PLOTS:
        plt.show()
    else:
        plt.close(fig_h)


# Spyder / run-all: populated in namespace
rows: List[dict] = []
all_deltas: List[float] = []
per_receptor_mean_delta: List[Tuple[str, float, int, int]] = []
skipped: List[str] = []
delta_summary: Dict[str, Any] = {}


def run() -> None:
    global rows, all_deltas, per_receptor_mean_delta, skipped, delta_summary
    rows, all_deltas, per_receptor_mean_delta, skipped, delta_summary = analyze_curation_impact()
    plot_results(all_deltas)


if __name__ == "__main__":
    run()
