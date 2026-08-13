"""One-shot cleaner for data/benchmark_results.csv — collapse newlines/tabs
inside justification field so each row is exactly one physical line.

Usage:
    python -m scripts.clean_benchmark_csv [--in PATH] [--out PATH]

Default: rewrites /app/data/benchmark_results.csv in place (atomic via tmp).
"""
from __future__ import annotations

import argparse
import csv
import os


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="in_path", default="/app/data/benchmark_results.csv")
    ap.add_argument("--out", dest="out_path", default=None,
                    help="Default: overwrite input atomically")
    args = ap.parse_args()

    out_path = args.out_path or args.in_path
    tmp_path = out_path + ".tmp"

    with open(args.in_path, encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))

    fieldnames = ["model", "indicator_no", "score", "justification", "confidence", "error", "runtime_sec"]

    cleaned_count = 0
    for r in rows:
        original = r.get("justification") or ""
        cleaned = " ".join(original.split())[:500]
        if cleaned != original:
            cleaned_count += 1
        r["justification"] = cleaned

    with open(tmp_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow({k: r.get(k, "") for k in fieldnames})

    os.replace(tmp_path, out_path)
    print(f"Cleaned {cleaned_count}/{len(rows)} rows. Output: {out_path}")


if __name__ == "__main__":
    main()
