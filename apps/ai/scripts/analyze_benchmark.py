"""Analyze benchmark_results.csv vs reference_scores_claude.csv.

Outputs:
  - Per-model aggregate stats (MAE, exact match, ±1 accuracy, Pearson r)
  - Per-indicator comparison table
  - Saves Markdown report to data/benchmark_report.md
  - Three flat CSVs: aggregate, per-indicator, per-type

Usage:
    python -m scripts.analyze_benchmark
    python -m scripts.analyze_benchmark --indicators 14,15,16,17,20,22,24
    python -m scripts.analyze_benchmark --indicators 14,15,16,17,20,22,24 --suffix _focus7
"""
from __future__ import annotations

import argparse
import csv
import math
import statistics
import sys
from collections import defaultdict
from pathlib import Path


def _load_csv(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _f(x):
    """Float-or-None coercion."""
    if x is None or x == "" or x == "None":
        return None
    try:
        return float(x)
    except (ValueError, TypeError):
        return None


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 2:
        return None
    n = len(xs)
    mx, my = sum(xs)/n, sum(ys)/n
    num = sum((x-mx)*(y-my) for x, y in zip(xs, ys))
    dx = math.sqrt(sum((x-mx)**2 for x in xs))
    dy = math.sqrt(sum((y-my)**2 for y in ys))
    if dx == 0 or dy == 0:
        return None
    return num / (dx * dy)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--indicators", default="",
                    help="Comma-separated indicator numbers to include (default: all). "
                         "Example: --indicators 14,15,16,17,20,22,24")
    ap.add_argument("--suffix", default="",
                    help="Filename suffix for outputs, e.g. '_focus7' produces "
                         "report_aggregate_focus7.csv. Default: empty (overwrites canonical).")
    args = ap.parse_args()

    indicator_filter: set[int] | None = None
    if args.indicators.strip():
        indicator_filter = {int(x.strip()) for x in args.indicators.split(",") if x.strip()}

    ref_rows = _load_csv("/app/data/reference_scores_claude.csv")
    ref = {int(r["indicator_no"]): _f(r["score"]) for r in ref_rows}
    ref_type = {int(r["indicator_no"]): r.get("score_type", "unknown") for r in ref_rows}
    bench = _load_csv("/app/data/benchmark_results.csv")

    if indicator_filter is not None:
        bench = [r for r in bench if int(r["indicator_no"]) in indicator_filter]
        print(f"Filtering to {len(indicator_filter)} indicators: "
              f"{sorted(indicator_filter)}")

    # group by model
    by_model: dict[str, list[dict]] = defaultdict(list)
    for r in bench:
        by_model[r["model"]].append(r)

    # ─── Per-model aggregate stats ──────────────────────────────────────────
    print("\n" + "=" * 80)
    print("PER-MODEL AGGREGATE STATISTICS")
    print("=" * 80)

    model_stats = []
    for model, rows in by_model.items():
        paired = []
        runtimes = []
        n_errors = 0
        n_none = 0
        confidences = []
        for r in rows:
            ref_score = ref.get(int(r["indicator_no"]))
            model_score = _f(r["score"])
            if r.get("error"):
                n_errors += 1
            if model_score is None:
                n_none += 1
            if ref_score is not None and model_score is not None:
                paired.append((ref_score, model_score))
            runtimes.append(_f(r["runtime_sec"]) or 0)
            c = _f(r["confidence"])
            if c is not None:
                confidences.append(c)

        if not paired:
            print(f"\n{model}: no usable data points")
            continue

        diffs = [abs(rs - ms) for rs, ms in paired]
        mae = statistics.mean(diffs)
        exact = sum(1 for d in diffs if d == 0) / len(diffs)
        within1 = sum(1 for d in diffs if d <= 1) / len(diffs)
        rmse = math.sqrt(statistics.mean(d**2 for d in diffs))
        r_corr = _pearson([rs for rs, _ in paired], [ms for _, ms in paired])
        avg_runtime = statistics.mean(runtimes) if runtimes else 0
        total_runtime = sum(runtimes)
        avg_conf = statistics.mean(confidences) if confidences else 0

        stats = {
            "model": model,
            "n_total": len(rows),
            "n_paired": len(paired),
            "n_errors": n_errors,
            "n_none": n_none,
            "mae": mae,
            "rmse": rmse,
            "exact": exact,
            "within1": within1,
            "pearson_r": r_corr,
            "avg_confidence": avg_conf,
            "avg_runtime_sec": avg_runtime,
            "total_runtime_sec": total_runtime,
        }
        model_stats.append(stats)

        print(f"\n--- {model} ---")
        print(f"  N evaluated:      {len(rows)} (paired with ref: {len(paired)})")
        print(f"  Errors / None:    {n_errors} / {n_none}")
        print(f"  MAE:              {mae:.3f}")
        print(f"  RMSE:             {rmse:.3f}")
        print(f"  Exact match:      {exact:.1%}")
        print(f"  Accuracy ±1:      {within1:.1%}")
        print(f"  Pearson r:        {r_corr:.3f}" if r_corr else "  Pearson r:        n/a")
        print(f"  Avg confidence:   {avg_conf:.2f}")
        print(f"  Avg runtime/ind:  {avg_runtime:.1f}s")
        print(f"  Total runtime:    {total_runtime:.0f}s ({total_runtime/60:.1f} min)")

    # ─── Per-type breakdown ────────────────────────────────────────────────
    print("\n" + "=" * 80)
    print("PER-TYPE BREAKDOWN (qualitative / composite / quantitative)")
    print("=" * 80)
    per_type_rows = []
    for model, rows in by_model.items():
        for typ in ("qualitative", "composite", "quantitative"):
            paired = []
            n_zero = 0
            for r in rows:
                ino = int(r["indicator_no"])
                if ref_type.get(ino) != typ:
                    continue
                ref_score = ref.get(ino)
                ms = _f(r["score"])
                if ms == 0.0:
                    n_zero += 1
                if ref_score is not None and ms is not None:
                    paired.append((ref_score, ms))
            if not paired:
                continue
            mae = statistics.mean(abs(rs - ms) for rs, ms in paired)
            exact = sum(1 for rs, ms in paired if rs == ms) / len(paired)
            within1 = sum(1 for rs, ms in paired if abs(rs - ms) <= 1) / len(paired)
            print(f"  {model:30s} {typ:14s}  n={len(paired):2d}  MAE={mae:.2f}  Exact={exact:.1%}  ±1={within1:.1%}  zeros={n_zero}")
            per_type_rows.append({
                "model": model, "type": typ, "n": len(paired),
                "mae": mae, "exact": exact, "within1": within1, "zeros": n_zero,
            })

    # ─── Per-indicator comparison ──────────────────────────────────────────
    print("\n" + "=" * 80)
    print("PER-INDICATOR COMPARISON")
    print("=" * 80)
    indicators_sorted = sorted({int(r["indicator_no"]) for r in bench})
    models_sorted = sorted(by_model.keys())

    header = ["No", "Ref"] + models_sorted
    col_w = max(12, max(len(m) for m in models_sorted))
    print(f"  {'No':<4} {'Ref':<5} " + " ".join(f"{m[:col_w]:<{col_w}}" for m in models_sorted))
    print("  " + "-" * (4 + 5 + (col_w + 1) * len(models_sorted) + 2))
    for ino in indicators_sorted:
        ref_s = ref.get(ino)
        ref_str = f"{ref_s:.1f}" if ref_s is not None else "—"
        cells = []
        for m in models_sorted:
            row = next((r for r in by_model[m] if int(r["indicator_no"]) == ino), None)
            if row is None or _f(row["score"]) is None:
                cell = "—"
            else:
                ms = _f(row["score"])
                diff = abs(ms - ref_s) if ref_s is not None else None
                marker = " ✓" if diff == 0 else (" ~" if diff and diff <= 1 else " ✗")
                cell = f"{ms:.1f}{marker}"
            cells.append(f"{cell:<{col_w}}")
        print(f"  {ino:<4} {ref_str:<5} " + " ".join(cells))

    # ─── Markdown report ───────────────────────────────────────────────────
    md_path = Path(f"/app/data/benchmark_report{args.suffix}.md")
    with open(md_path, "w", encoding="utf-8") as fh:
        fh.write("# Benchmark Report — AMI Assessment\n\n")
        fh.write(f"Reference: `data/reference_scores_claude.csv` (Claude as preliminary annotator)\n\n")
        fh.write("## Aggregate Statistics\n\n")
        fh.write("| Model | N | MAE ↓ | RMSE ↓ | Exact ↑ | ±1 Acc ↑ | Pearson r ↑ | Avg Conf | Runtime/ind |\n")
        fh.write("|---|---|---|---|---|---|---|---|---|\n")
        for s in sorted(model_stats, key=lambda x: x["mae"]):
            r_str = f"{s['pearson_r']:.3f}" if s['pearson_r'] is not None else "—"
            fh.write(f"| `{s['model']}` | {s['n_paired']} | {s['mae']:.3f} | {s['rmse']:.3f} | "
                     f"{s['exact']:.1%} | {s['within1']:.1%} | {r_str} | "
                     f"{s['avg_confidence']:.2f} | {s['avg_runtime_sec']:.1f}s |\n")

        fh.write("\n## Per-Indicator Scores\n\n")
        fh.write("| No | Ref |" + "|".join(f" {m} " for m in models_sorted) + "|\n")
        fh.write("|---|---|" + "|".join("---" for _ in models_sorted) + "|\n")
        for ino in indicators_sorted:
            ref_s = ref.get(ino)
            ref_str = f"{ref_s:.1f}" if ref_s is not None else "—"
            cells = []
            for m in models_sorted:
                row = next((r for r in by_model[m] if int(r["indicator_no"]) == ino), None)
                if row is None or _f(row["score"]) is None:
                    cells.append("—")
                else:
                    ms = _f(row["score"])
                    diff = abs(ms - ref_s) if ref_s is not None else None
                    if diff == 0: marker = " ✓"
                    elif diff is not None and diff <= 1: marker = ""
                    else: marker = " ✗"
                    cells.append(f"{ms:.1f}{marker}")
            fh.write(f"| {ino} | {ref_str} | " + " | ".join(cells) + " |\n")

        fh.write("\n## Per-Type Breakdown\n\n")
        fh.write("| Model | Type | N | MAE ↓ | Exact ↑ | ±1 Acc ↑ | Score=0 (false-refusal proxy) |\n")
        fh.write("|---|---|---|---|---|---|---|\n")
        for r in per_type_rows:
            fh.write(f"| `{r['model']}` | {r['type']} | {r['n']} | {r['mae']:.2f} | {r['exact']:.1%} | {r['within1']:.1%} | {r['zeros']} |\n")

        fh.write("\n## Legend\n\n")
        fh.write("- ✓ = exact match with reference\n")
        fh.write("- (no marker) = within ±1 of reference (acceptable)\n")
        fh.write("- ✗ = differ by > 1 from reference (significant disagreement)\n")
        fh.write("- — = no score produced (error or null output)\n")

    print(f"\n→ Markdown report written to: {md_path}")

    # ─── Three flat CSVs for downstream analysis (Excel / pandas / sheets) ──
    out_dir = Path("/app/data")

    # 1) Aggregate stats per model
    agg_path = out_dir / f"report_aggregate{args.suffix}.csv"
    with open(agg_path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["model", "n", "mae", "rmse", "exact_pct", "within1_pct",
                    "pearson_r", "avg_confidence", "avg_runtime_sec",
                    "total_runtime_sec", "n_errors", "n_none"])
        for s in sorted(model_stats, key=lambda x: x["mae"]):
            w.writerow([
                s["model"], s["n_paired"],
                round(s["mae"], 4), round(s["rmse"], 4),
                round(s["exact"] * 100, 2), round(s["within1"] * 100, 2),
                round(s["pearson_r"], 4) if s["pearson_r"] is not None else "",
                round(s["avg_confidence"], 4),
                round(s["avg_runtime_sec"], 2),
                round(s["total_runtime_sec"], 2),
                s["n_errors"], s["n_none"],
            ])

    # 2) Per-indicator wide-form (one row per indicator, one col per model)
    pi_path = out_dir / f"report_per_indicator{args.suffix}.csv"
    with open(pi_path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        header = ["indicator_no", "score_type", "ref_score"]
        for m in models_sorted:
            header += [f"{m}_score", f"{m}_diff", f"{m}_marker"]
        w.writerow(header)
        for ino in indicators_sorted:
            ref_s = ref.get(ino)
            row = [ino, ref_type.get(ino, ""), ref_s if ref_s is not None else ""]
            for m in models_sorted:
                rec = next((r for r in by_model[m] if int(r["indicator_no"]) == ino), None)
                ms = _f(rec["score"]) if rec else None
                if ms is None or ref_s is None:
                    row += ["", "", "missing"]
                else:
                    diff = abs(ms - ref_s)
                    marker = "exact" if diff == 0 else ("within1" if diff <= 1 else "off")
                    row += [ms, round(diff, 2), marker]
            w.writerow(row)

    # 3) Per-type breakdown long-form
    pt_path = out_dir / f"report_per_type{args.suffix}.csv"
    with open(pt_path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["model", "score_type", "n", "mae", "exact_pct",
                    "within1_pct", "score_zero_count"])
        for r in per_type_rows:
            w.writerow([
                r["model"], r["type"], r["n"],
                round(r["mae"], 4),
                round(r["exact"] * 100, 2),
                round(r["within1"] * 100, 2),
                r["zeros"],
            ])

    print(f"→ Aggregate CSV:    {agg_path}")
    print(f"→ Per-indicator CSV: {pi_path}")
    print(f"→ Per-type CSV:      {pt_path}")


if __name__ == "__main__":
    main()
