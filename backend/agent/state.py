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

    # ── Reasoning log (persisted to Supabase) ────────────────────────────────
    reasoning_steps: list       # list[dict]

    # ── Output ───────────────────────────────────────────────────────────────
    final_score: Optional[float]
    sub_score_i: Optional[float]
    sub_score_ii: Optional[float]
    justification: Optional[str]
    confidence: Optional[float]
    error: Optional[str]
