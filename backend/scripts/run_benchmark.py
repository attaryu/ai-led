"""Benchmark runner: invoke assessment graph for multiple (model, indicator) pairs.

Outputs to data/benchmark_results.csv with columns:
    model, indicator_no, score, justification, confidence, error, runtime_sec

Usage (inside container):
    python -m scripts.run_benchmark
    python -m scripts.run_benchmark --indicators 1,2,4,7,9,13,17,18,22,30,35,42,50,53,58
    python -m scripts.run_benchmark --models qwen3.5:35b,deepseek-r1:32b,gemma4:31b
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import sys
import time
from dataclasses import dataclass

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


@dataclass
class _Indicator:
    indicator_no: int
    kriteria: str


def _load_indicators(nos: list[int]) -> list[_Indicator]:
    with open("/app/data/rubric_cache/matrix.json") as f:
        rubrics = json.load(f)
    by_no = {r["no"]: r["kriteria"] for r in rubrics}
    out = []
    for n in nos:
        if n in by_no:
            out.append(_Indicator(indicator_no=n, kriteria=by_no[n]))
        else:
            log.warning("Indikator %d tidak ditemukan di matrix.json", n)
    return out


def _ensure_lkps_loaded():
    from agent.tools.lkps_tool import set_lkps_registry
    from ingestion.lkps_loader import load_lkps
    registry = load_lkps("/app/data/uploads/lkps.xlsx")
    set_lkps_registry(registry)
    log.info("LKPS loaded: %d sheets", len(registry.sheets))


def _run_one(graph, indicator: _Indicator) -> dict:
    """Invoke the graph for a single indicator, return result dict."""
    initial = {
        "session_id": "benchmark",
        "indicator_no": indicator.indicator_no,
        "indicator_row": indicator,
        "rubric": None,
        "led_evidence": [],
        "lkps_data": {},
        "messages": [],
        "reasoning_steps": [],
        "final_score": None,
        "sub_score_i": None,
        "sub_score_ii": None,
        "justification": None,
        "confidence": None,
        "error": None,
    }
    t0 = time.time()
    try:
        result = graph.invoke(initial)
        elapsed = time.time() - t0
        return {
            "score": result.get("final_score"),
            "justification": (result.get("justification") or "")[:500],
            "confidence": result.get("confidence"),
            "error": result.get("error"),
            "runtime_sec": round(elapsed, 1),
        }
    except Exception as exc:
        elapsed = time.time() - t0
        log.exception("Failed indicator %d", indicator.indicator_no)
        return {
            "score": None,
            "justification": "",
            "confidence": None,
            "error": str(exc)[:200],
            "runtime_sec": round(elapsed, 1),
        }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--indicators",
        default="1,2,4,7,8,13,17,22,28,30,32,35,39,42,48,50,53,58,60",
        help="Comma-separated indicator numbers (default: 19 representative)",
    )
    parser.add_argument(
        "--models",
        default="qwen3.5:35b,deepseek-r1:32b,gemma4:31b",
        help="Comma-separated Ollama model tags",
    )
    parser.add_argument(
        "--output",
        default="/app/data/benchmark_results.csv",
        help="Output CSV path",
    )
    args = parser.parse_args()

    indicator_nos = [int(x.strip()) for x in args.indicators.split(",")]
    models = [m.strip() for m in args.models.split(",")]

    indicators = _load_indicators(indicator_nos)
    log.info("Indicators to evaluate: %s", [i.indicator_no for i in indicators])
    log.info("Models to benchmark: %s", models)

    _ensure_lkps_loaded()

    # Write header (overwrite — fresh benchmark each run)
    with open(args.output, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=["model", "indicator_no", "score", "justification", "confidence", "error", "runtime_sec"],
        )
        writer.writeheader()

    total_pairs = len(models) * len(indicators)
    done = 0

    for model in models:
        log.info("=" * 60)
        log.info("MODEL: %s", model)
        log.info("=" * 60)

        # Override OLLAMA_MODEL for this run
        os.environ["OLLAMA_MODEL"] = model

        # Build graph fresh per model so reasoning vs native dispatcher picks correctly
        from agent.graph import build_graph_auto
        from llm.ollama_client import create_ollama_client_from_env

        client = create_ollama_client_from_env()
        graph = build_graph_auto(client)

        for indicator in indicators:
            done += 1
            log.info("[%d/%d] %s — Indikator %d", done, total_pairs, model, indicator.indicator_no)
            res = _run_one(graph, indicator)

            with open(args.output, "a", newline="", encoding="utf-8") as fh:
                writer = csv.DictWriter(
                    fh,
                    fieldnames=["model", "indicator_no", "score", "justification", "confidence", "error", "runtime_sec"],
                )
                writer.writerow({
                    "model": model,
                    "indicator_no": indicator.indicator_no,
                    "score": res["score"],
                    "justification": res["justification"],
                    "confidence": res["confidence"],
                    "error": res["error"],
                    "runtime_sec": res["runtime_sec"],
                })
            log.info("  → score=%s confidence=%s runtime=%ss",
                     res["score"], res["confidence"], res["runtime_sec"])

    log.info("Benchmark complete. Output: %s", args.output)


if __name__ == "__main__":
    main()
