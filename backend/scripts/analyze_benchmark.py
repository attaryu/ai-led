"""Analyze benchmark_results.csv vs reference_scores_claude.csv.

Outputs:
  - Per-model aggregate stats (MAE, exact match, ±1 accuracy, Pearson r)
  - Per-indicator comparison table
  - Saves Markdown report to data/benchmark_report.md

Usage:
    python -m scripts.analyze_benchmark
"""
from __future__ import annotations

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
    ref = {int(r["indicator_no"]): _f(r["score"]) for r in _load_csv("/app/data/reference_scores_claude.csv")}
    bench = _load_csv("/app/data/benchmark_results.csv")

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
    md_path = Path("/app/data/benchmark_report.md")
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

        fh.write("\n## Legend\n\n")
        fh.write("- ✓ = exact match with reference\n")
        fh.write("- (no marker) = within ±1 of reference (acceptable)\n")
        fh.write("- ✗ = differ by > 1 from reference (significant disagreement)\n")
        fh.write("- — = no score produced (error or null output)\n")

    print(f"\n→ Markdown report written to: {md_path}")


if __name__ == "__main__":
    main()
