"""LangGraph state definition for a single-indicator assessment run."""

from __future__ import annotations

from typing import Any, Optional

from typing_extensions import TypedDict


class AssessmentState(TypedDict):
    # ── Input ────────────────────────────────────────────────────────────────
    session_id: str
    indicator_no: int
    indicator_row: Any          # excel.reader.IndicatorRow

    # ── Loaded context ───────────────────────────────────────────────────────
    rubric: Optional[dict]      # ingestion.matrix_parser.IndicatorRubric as dict

    # ── Tool results ─────────────────────────────────────────────────────────
    led_evidence: list          # list[dict] from LED RAG
    lkps_data: dict             # {table_ref: markdown string}

    # ── Message history (LangGraph / LangChain format) ───────────────────────
    messages: list

    # ── Reasoning log (persisted to Postgres) ────────────────────────────────
    reasoning_steps: list       # list[dict]

    # ── Output ───────────────────────────────────────────────────────────────
    final_score: Optional[float]
    sub_score_i: Optional[float]
    sub_score_ii: Optional[float]
    justification: Optional[str]
    confidence: Optional[float]
    recommendation: Optional[str]
    error: Optional[str]

    # ── Internal loop-control counters (graph.py / reasoning_graph.py) ────────
    # MUST be declared here, not just set ad hoc on the state dict — LangGraph
    # only persists keys that are part of the compiled state schema across
    # node executions. An undeclared key gets silently dropped between steps,
    # which is exactly how the force-retry limit went unenforced before this
    # was added (see the "stabilisasi flow agent" fix).
    _force_count: Optional[int]
    _tool_call_count: Optional[int]
    _checklist_built: Optional[bool]

    # ── Systematic pre-scoring checklist (graph.py / reasoning_graph.py) ──────
    # Rubric sub-criteria extracted once per indicator, right after the rubric
    # tool result comes back — injected into the conversation as guidance and
    # logged for audit trail. None if generation failed or was skipped.
    checklist: Optional[list]

    # ── Independent judge verdict (graph.py / reasoning_graph.py) ─────────────
    # Post-hoc check by a SEPARATE model (RAGAS_* judge config) on whether the
    # final justification is grounded in evidence actually retrieved this run.
    # {"error": ...} if the judge call itself failed — never blocks the result.
    judge_verdict: Optional[dict]

    # LED/LKPS/evidence citations retrieved this run (graph.py's _accumulate_sources)
    sources_used: Optional[dict]
