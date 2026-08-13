"""Assessment pipeline API routes.

POST /assessment/start
    Optional JSON body with laporan_path. If provided, indicator subset is read
    from the Laporan_AK.xlsx template; otherwise all 78 default indicators run.
    Fires off the assessment pipeline in the background and returns a session_id
    immediately so the caller can poll for status.

GET /assessment/{session_id}/status
    Returns current session status from Supabase.

GET /assessment/{session_id}/results
    Returns all per-indicator results (score, justification, confidence,
    recommendation) for a session.

Parallelism: up to MAX_PARALLEL indicators run concurrently (asyncio.Semaphore).
Each indicator is scored by an independent LangGraph graph invocation so there is
no shared mutable state between indicators.
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from dataclasses import dataclass
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from agent.graph import build_graph_auto
from agent.tools.rubric_tool import _get_rubrics
from db.supabase_client import (
    create_session,
    get_supabase,
    log_indicator_result,
    log_reasoning_step,
    update_session_status,
)
from excel.reader import read_indicator_rows
from llm.ollama_client import create_ollama_client_from_env

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assessment", tags=["assessment"])

MAX_PARALLEL: int = int(os.environ.get("ASSESSMENT_MAX_PARALLEL", "5"))


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class StartAssessmentRequest(BaseModel):
    laporan_path: Optional[str] = None
    max_parallel: Optional[int] = None


class StartAssessmentResponse(BaseModel):
    session_id: str
    total_indicators: int
    message: str


class SessionStatusResponse(BaseModel):
    session_id: str
    status: str
    total_indicators: int
    completed_indicators: int
    error: Optional[str] = None


class IndicatorResultItem(BaseModel):
    indicator_no: int
    kriteria: Optional[str] = None
    score: Optional[float] = None
    justification: Optional[str] = None
    confidence: Optional[float] = None
    recommendation: Optional[str] = None
    error: Optional[str] = None


class SessionResultsResponse(BaseModel):
    session_id: str
    status: str
    total_indicators: int
    completed_indicators: int
    results: list[IndicatorResultItem]


class SessionSummary(BaseModel):
    session_id: str
    status: str
    total_indicators: int
    completed_indicators: int
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    avg_score: Optional[float] = None
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Lightweight indicator stub (used when no Laporan AK uploaded)
# ---------------------------------------------------------------------------


@dataclass
class _SimpleIndicator:
    """Minimal shape compatible with what agent.graph needs from indicator_row."""
    indicator_no: int
    kriteria: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/start", response_model=StartAssessmentResponse)
async def start_assessment(
    body: StartAssessmentRequest,
    background_tasks: BackgroundTasks,
) -> StartAssessmentResponse:
    """Start an assessment pipeline.

    If ``laporan_path`` is provided, the indicator subset is extracted from that
    Excel template. Otherwise, all 78 default indicators are evaluated.
    Results are persisted to Supabase only — nothing is written back to Excel.
    """
    if body.laporan_path:
        if not os.path.exists(body.laporan_path):
            raise HTTPException(
                status_code=400,
                detail=f"File not found on server: {body.laporan_path}",
            )
        indicators = read_indicator_rows(body.laporan_path)
        if not indicators:
            raise HTTPException(
                status_code=422,
                detail="No indicator rows found in the provided Laporan_AK.xlsx file.",
            )
    else:
        # Default: evaluate every rubric in the cached matrix
        rubrics = _get_rubrics()
        indicators = [
            _SimpleIndicator(indicator_no=r.no, kriteria=r.kriteria)
            for r in rubrics
        ]
        if not indicators:
            raise HTTPException(
                status_code=500,
                detail="No rubrics available — has the matrix been parsed?",
            )

    session_id = str(uuid.uuid4())
    parallel = body.max_parallel or MAX_PARALLEL

    create_session(session_id, body.laporan_path or "", len(indicators))

    background_tasks.add_task(
        _run_assessment_pipeline,
        session_id=session_id,
        indicators=indicators,
        max_parallel=parallel,
    )

    return StartAssessmentResponse(
        session_id=session_id,
        total_indicators=len(indicators),
        message="Assessment pipeline started. Poll /assessment/{session_id}/status for progress.",
    )


@router.get("/list", response_model=list[SessionSummary])
async def list_sessions(limit: int = 50) -> list[SessionSummary]:
    """List recent assessment sessions (newest first), with avg score per session."""
    sb = get_supabase()

    sessions_resp = (
        sb.table("assessment_sessions")
        .select("session_id, status, total_indicators, completed_indicators, created_at, updated_at, error")
        .order("created_at", desc=True)
        .limit(max(1, min(limit, 200)))
        .execute()
    )
    sessions = sessions_resp.data or []
    if not sessions:
        return []

    # Fetch avg scores per session in one query
    ids = [s["session_id"] for s in sessions]
    scores_resp = (
        sb.table("indicator_results")
        .select("session_id, score")
        .in_("session_id", ids)
        .execute()
    )

    avg_by_session: dict[str, float] = {}
    counts: dict[str, int] = {}
    for row in (scores_resp.data or []):
        sid = row["session_id"]
        sc = row.get("score")
        if sc is None:
            continue
        avg_by_session[sid] = avg_by_session.get(sid, 0.0) + float(sc)
        counts[sid] = counts.get(sid, 0) + 1

    out: list[SessionSummary] = []
    for s in sessions:
        sid = s["session_id"]
        avg = (avg_by_session.get(sid, 0.0) / counts[sid]) if counts.get(sid) else None
        out.append(
            SessionSummary(
                session_id=sid,
                status=s["status"],
                total_indicators=s["total_indicators"],
                completed_indicators=s["completed_indicators"],
                created_at=s.get("created_at"),
                updated_at=s.get("updated_at"),
                avg_score=round(avg, 2) if avg is not None else None,
                error=s.get("error"),
            )
        )
    return out


@router.get("/{session_id}/status", response_model=SessionStatusResponse)
async def get_session_status(session_id: str) -> SessionStatusResponse:
    """Return the current status of an assessment session."""
    try:
        resp = (
            get_supabase()
            .table("assessment_sessions")
            .select("*")
            .eq("session_id", session_id)
            .single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}") from exc

    if not resp.data:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")

    row = resp.data
    return SessionStatusResponse(
        session_id=row["session_id"],
        status=row["status"],
        total_indicators=row["total_indicators"],
        completed_indicators=row["completed_indicators"],
        error=row.get("error"),
    )


@router.get("/{session_id}/results", response_model=SessionResultsResponse)
async def get_session_results(session_id: str) -> SessionResultsResponse:
    """Return all per-indicator results for a session, joined with rubric kriteria."""
    sb = get_supabase()

    try:
        sess = (
            sb.table("assessment_sessions")
            .select("*")
            .eq("session_id", session_id)
            .single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}") from exc

    if not sess.data:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")

    rows_resp = (
        sb.table("indicator_results")
        .select("indicator_no, score, justification, confidence, recommendation, error")
        .eq("session_id", session_id)
        .order("indicator_no")
        .execute()
    )

    # Map indicator_no → kriteria for fast lookup
    kriteria_map: dict[int, str] = {r.no: r.kriteria for r in _get_rubrics()}

    items: list[IndicatorResultItem] = [
        IndicatorResultItem(
            indicator_no=row["indicator_no"],
            kriteria=kriteria_map.get(row["indicator_no"]),
            score=row.get("score"),
            justification=row.get("justification"),
            confidence=row.get("confidence"),
            recommendation=row.get("recommendation"),
            error=row.get("error"),
        )
        for row in (rows_resp.data or [])
    ]

    return SessionResultsResponse(
        session_id=session_id,
        status=sess.data["status"],
        total_indicators=sess.data["total_indicators"],
        completed_indicators=sess.data["completed_indicators"],
        results=items,
    )


# ---------------------------------------------------------------------------
# Pipeline internals
# ---------------------------------------------------------------------------


async def _process_single_indicator(
    graph,
    indicator,
    session_id: str,
    semaphore: asyncio.Semaphore,
) -> bool:
    """Run the LangGraph agent for one indicator and persist results to Supabase.

    Returns True on success, False on error (error is logged and stored in Supabase).
    """
    async with semaphore:
        try:
            initial_state = {
                "session_id": session_id,
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
            }

            result = await asyncio.get_event_loop().run_in_executor(
                None, graph.invoke, initial_state
            )

            score = result.get("final_score")
            justification = result.get("justification", "")
            confidence = result.get("confidence")
            recommendation = result.get("recommendation")
            error = result.get("error")

            for idx, step in enumerate(result.get("reasoning_steps", [])):
                log_reasoning_step(
                    session_id=session_id,
                    indicator_no=indicator.indicator_no,
                    step_index=idx,
                    content=str(step),
                )

            log_indicator_result(
                session_id=session_id,
                indicator_no=indicator.indicator_no,
                score=score,
                justification=justification,
                confidence=confidence,
                recommendation=recommendation,
                error=error,
            )
            return True

        except Exception as exc:
            logger.exception(
                "Error processing indicator %d for session %s",
                indicator.indicator_no,
                session_id,
            )
            log_indicator_result(
                session_id=session_id,
                indicator_no=indicator.indicator_no,
                score=None,
                justification=None,
                confidence=None,
                recommendation=None,
                error=str(exc),
            )
            return False


async def _run_assessment_pipeline(
    session_id: str,
    indicators: list,
    max_parallel: int,
) -> None:
    """Background task: score all indicators and update session status when done."""
    try:
        ollama_client = create_ollama_client_from_env()
        graph = build_graph_auto(ollama_client)
        semaphore = asyncio.Semaphore(max_parallel)

        tasks = [
            _process_single_indicator(
                graph=graph,
                indicator=indicator,
                session_id=session_id,
                semaphore=semaphore,
            )
            for indicator in indicators
        ]

        completed = 0
        for coro in asyncio.as_completed(tasks):
            await coro
            completed += 1
            update_session_status(
                session_id=session_id,
                status="running",
                completed_indicators=completed,
            )

        update_session_status(
            session_id=session_id,
            status="completed",
            completed_indicators=len(indicators),
        )
        logger.info("Assessment session %s completed (%d indicators)", session_id, len(indicators))

    except Exception as exc:
        logger.exception("Pipeline failure for session %s", session_id)
        update_session_status(
            session_id=session_id,
            status="failed",
            error=str(exc),
        )
