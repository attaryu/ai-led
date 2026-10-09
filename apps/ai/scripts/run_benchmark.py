"""Benchmark runner: invoke assessment graph for multiple (model, indicator) pairs.

Port of ariel's scripts/run_benchmark.py (b2569f9 + 2f97285), adapted to dev-v1's
per-tenant/document/AccreditationSet scoping.

Outputs to data/benchmark_results.csv with columns:
    model, indicator_no, score, justification, confidence, recommendation,
    sources_used, error, runtime_sec

Usage (inside container):
    python -m scripts.run_benchmark
    python -m scripts.run_benchmark --indicators 1,2,4,7,9,13,17,18,22,30,35,42,50,53,58
    python -m scripts.run_benchmark --models qwen3.5:35b,deepseek-r1:32b,gemma4:31b
    python -m scripts.run_benchmark --models qwen3.5:35b --disable-evidence

Without --dokumen-id the run uses a fixed "benchmark" identity: rubric from
matrix.json (like ariel), LKPS from /app/data/uploads/lkps.xlsx. With
--dokumen-id it runs against that real document (its tenant, AccreditationSet
rubric, prodi evidence, LKPS, LED chunks).

Optionally, a SINGLE-model invocation against a real document can also persist a
real assessment session (assessment_sessions + indicator results + reasoning
steps), indistinguishable from one created by POST /assessment/start — so
/eval/run RAGAS and GET /assessment/{id}/results work against benchmark runs:

    python -m scripts.run_benchmark --models qwen3.5:35b --dokumen-id <id> --user-id <id> --session-id-out /tmp/sid.txt

--session-id/--session-id-out require exactly ONE --models value plus
--dokumen-id and --user-id (assessment_sessions has FKs to both).
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

_LOCAL_ID = "benchmark"


@dataclass
class _Indicator:
    indicator_no: int
    kriteria: str


@dataclass
class _Scope:
    tenant_id: str
    dokumen_id: str
    accreditation_set_id: str
    study_program_id: str | None = None


def _resolve_scope(dokumen_id: str | None) -> _Scope:
    if not dokumen_id:
        # Offline: matrix.json rubric under the placeholder set id (ariel's global-rubric behaviour).
        from agent.tools.rubric_tool import _get_rubrics, _rubric_cache_by_set

        _rubric_cache_by_set[_LOCAL_ID] = _get_rubrics()
        return _Scope(_LOCAL_ID, _LOCAL_ID, _LOCAL_ID)

    from db.connection import tenant_cursor

    with tenant_cursor(None) as cur:
        cur.execute(
            """SELECT ps.tenant_id, d.accreditation_set_id, d.study_program_id
               FROM writing_led_documents d JOIN org_study_programs ps ON ps.id = d.study_program_id
               WHERE d.id = %s""",
            (dokumen_id,),
        )
        row = cur.fetchone()
    if not row or not row["accreditation_set_id"]:
        raise SystemExit(f"Dokumen {dokumen_id} tidak ada atau belum memilih Set Akreditasi")
    return _Scope(row["tenant_id"], dokumen_id, row["accreditation_set_id"], row["study_program_id"])


def _load_indicators(nos: list[int], scope: _Scope) -> list[_Indicator]:
    from agent.tools.rubric_tool import _get_rubrics_for_set

    by_no = {r.no: r.kriteria for r in _get_rubrics_for_set(scope.accreditation_set_id, scope.tenant_id)}
    out = []
    for n in nos:
        if n in by_no:
            out.append(_Indicator(indicator_no=n, kriteria=by_no[n]))
        else:
            log.warning("Indikator %d tidak ditemukan di rubrik", n)
    return out


def _ensure_lkps_loaded(scope: _Scope):
    from agent.tools.lkps_tool import load_lkps_for_document, set_lkps_registry

    if scope.dokumen_id != _LOCAL_ID:
        from db.connection import tenant_cursor

        with tenant_cursor(scope.tenant_id) as cur:
            cur.execute("SELECT lkps_evidence_id FROM writing_led_documents WHERE id = %s", (scope.dokumen_id,))
            row = cur.fetchone()
        loaded = load_lkps_for_document(scope.tenant_id, scope.dokumen_id, row["lkps_evidence_id"] if row else None)
        log.info("LKPS loaded for dokumen %s: %s", scope.dokumen_id, loaded)
        return

    from ingestion.lkps_loader import load_lkps

    registry = load_lkps("/app/data/uploads/lkps.xlsx")
    set_lkps_registry(_LOCAL_ID, _LOCAL_ID, registry)
    log.info("LKPS loaded: %d sheets", len(registry.sheets))


def _run_one(graph, indicator: _Indicator, scope: _Scope) -> dict:
    """Invoke the graph for a single indicator, return result dict.

    reasoning_steps is only used by the optional session persistence path,
    never written to the CSV (would bloat it with large JSON blobs)."""
    import contextvars

    from agent.context import AssessmentContext, current_assessment_context

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
        "recommendation": None,
        "error": None,
        "sources_used": None,
    }
    ctx = contextvars.copy_context()
    ctx.run(
        current_assessment_context.set,
        AssessmentContext(
            scope.tenant_id, scope.dokumen_id, indicator.indicator_no,
            scope.accreditation_set_id, scope.study_program_id,
        ),
    )
    t0 = time.time()
    try:
        result = ctx.run(graph.invoke, initial)
        elapsed = time.time() - t0
        # Collapse newlines/tabs so each CSV row stays on one physical line.
        raw_just = (result.get("justification") or "")
        clean_just = " ".join(raw_just.split())[:500]
        raw_rekom = result.get("recommendation") or ""
        clean_rekom = " ".join(raw_rekom.split())[:500] if raw_rekom else None
        return {
            "score": result.get("final_score"),
            "justification": clean_just,
            "confidence": result.get("confidence"),
            "recommendation": clean_rekom,
            "sources_used": result.get("sources_used"),
            "error": result.get("error"),
            "runtime_sec": round(elapsed, 1),
            "reasoning_steps": result.get("reasoning_steps", []),
        }
    except Exception as exc:
        elapsed = time.time() - t0
        log.exception("Failed indicator %d", indicator.indicator_no)
        return {
            "score": None,
            "justification": "",
            "confidence": None,
            "recommendation": None,
            "sources_used": None,
            "error": str(exc)[:200],
            "runtime_sec": round(elapsed, 1),
            "reasoning_steps": [],
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
    parser.add_argument("--output", default="/app/data/benchmark_results.csv", help="Output CSV path")
    parser.add_argument(
        "--fresh",
        action="store_true",
        help="Start from scratch (overwrite CSV). Default: resume — skip pairs already completed (non-null score).",
    )
    parser.add_argument(
        "--disable-evidence",
        action="store_true",
        default=False,
        help="Disable the search_evidence_documents tool for this run (both checklist_node's "
             "proactive auto-injection and the model's ability to call it) — "
             "threaded into build_graph_auto(model, disable_evidence=...).",
    )
    parser.add_argument("--dokumen-id", default=None, help="Run against this real LED document instead of the offline identity.")
    parser.add_argument("--user-id", default=None, help="created_by_user_id for a persisted session (required with --session-id/--session-id-out).")
    parser.add_argument(
        "--session-id",
        default=None,
        help="Persist this run as a real assessment_sessions row under this session_id "
             "(generated as a uuid4 if omitted but --session-id-out is given). Requires exactly "
             "one --models value, --dokumen-id and --user-id.",
    )
    parser.add_argument(
        "--session-id-out",
        default=None,
        help="Write the resolved session_id (plain text) to this path as soon as it's determined, "
             "e.g. to poll GET /assessment/{session_id}/status while this run is in progress.",
    )
    args = parser.parse_args()

    indicator_nos = [int(x.strip()) for x in args.indicators.split(",")]
    models = [m.strip() for m in args.models.split(",")]

    # A session's results come from a single model run.
    persist = args.session_id is not None or args.session_id_out is not None
    if persist and len(models) != 1:
        parser.error(
            "--session-id/--session-id-out require exactly one --models value "
            f"(got {len(models)}: {models}) — a session records a single model."
        )
    if persist and not (args.dokumen_id and args.user_id):
        parser.error("--session-id/--session-id-out require --dokumen-id and --user-id")

    scope = _resolve_scope(args.dokumen_id)

    session_id: str | None = None
    if persist:
        session_id = args.session_id or str(uuid.uuid4())
        log.info("Persisting this run as session_id=%s", session_id)
        if args.session_id_out:
            with open(args.session_id_out, "w", encoding="utf-8") as fh:
                fh.write(session_id)

    indicators = _load_indicators(indicator_nos, scope)
    log.info("Indicators to evaluate: %s", [i.indicator_no for i in indicators])
    log.info("Models to benchmark: %s", models)

    _ensure_lkps_loaded(scope)

    fieldnames = [
        "model", "indicator_no", "score", "justification", "confidence",
        "recommendation", "sources_used", "error", "runtime_sec",
    ]

    # Resume logic: collect (model, indicator_no) pairs already completed (non-null score)
    completed: set[tuple[str, int]] = set()
    if not args.fresh and os.path.exists(args.output):
        with open(args.output, encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                score_str = (row.get("score") or "").strip()
                if score_str and score_str.lower() != "none":
                    try:
                        completed.add((row["model"], int(row["indicator_no"])))
                    except (KeyError, ValueError):
                        pass
        log.info("RESUME mode: %d pairs already completed, will skip.", len(completed))

    file_exists = os.path.exists(args.output)
    if args.fresh or not file_exists:
        with open(args.output, "w", newline="", encoding="utf-8") as fh:
            csv.DictWriter(fh, fieldnames=fieldnames).writeheader()

    total_pairs = len(models) * len(indicators)
    done = 0
    skipped = 0
    persisted_count = 0

    if persist:
        from db.postgres_client import (
            create_session,
            log_indicator_result,
            log_reasoning_step,
            update_session_status,
        )

        create_session(session_id, scope.tenant_id, scope.dokumen_id, args.user_id, len(indicators))

    try:
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
            graph = build_graph_auto(client, disable_evidence=args.disable_evidence)

            for indicator in indicators:
                done += 1
                if (model, indicator.indicator_no) in completed:
                    skipped += 1
                    log.info("[%d/%d] %s — Indikator %d → SKIP (already done)",
                             done, total_pairs, model, indicator.indicator_no)
                    continue

                log.info("[%d/%d] %s — Indikator %d", done, total_pairs, model, indicator.indicator_no)
                res = _run_one(graph, indicator, scope)

                sources_used_json = (
                    json.dumps(res["sources_used"], ensure_ascii=False)
                    if res["sources_used"] is not None else ""
                )
                with open(args.output, "a", newline="", encoding="utf-8") as fh:
                    writer = csv.DictWriter(fh, fieldnames=fieldnames)
                    writer.writerow({
                        "model": model,
                        "indicator_no": indicator.indicator_no,
                        "score": res["score"],
                        "justification": res["justification"],
                        "confidence": res["confidence"],
                        "recommendation": res["recommendation"],
                        "sources_used": sources_used_json,
                        "error": res["error"],
                        "runtime_sec": res["runtime_sec"],
                    })
                log.info("  → score=%s confidence=%s runtime=%ss",
                         res["score"], res["confidence"], res["runtime_sec"])

                if persist:
                    log_indicator_result(
                        tenant_id=scope.tenant_id,
                        session_id=session_id,
                        indicator_no=indicator.indicator_no,
                        score=res["score"],
                        justification=res["justification"],
                        confidence=res["confidence"],
                        recommendation=res["recommendation"],
                        error=res["error"],
                        model=model,
                        sources_used=res["sources_used"],
                    )
                    for idx, step in enumerate(res.get("reasoning_steps", [])):
                        log_reasoning_step(
                            tenant_id=scope.tenant_id,
                            session_id=session_id,
                            indicator_no=indicator.indicator_no,
                            step_index=idx,
                            content=str(step),
                        )
                    persisted_count += 1

        if persist:
            update_session_status(
                scope.tenant_id, session_id, "completed", completed_indicators=persisted_count,
            )

    except Exception as exc:
        if persist:
            log.exception("Persisted benchmark run failed for session %s", session_id)
            update_session_status(scope.tenant_id, session_id, "failed", error=str(exc))
        raise

    log.info("Skipped (already done): %d / %d", skipped, total_pairs)
    if persist:
        log.info("Persisted %d indicator result(s) to session %s", persisted_count, session_id)

    log.info("Benchmark complete. Output: %s", args.output)


if __name__ == "__main__":
    main()
