"""Assessment pipeline API routes.

POST /assessment/start
    Accepts a JSON body with laporan_path (path to Laporan_AK.xlsx on the server).
    Fires off the full 78-indicator pipeline in the background and returns a session_id
    immediately so the caller can poll for status.

GET /assessment/{session_id}/status
    Returns current session status from Supabase.

Parallelism: up to MAX_PARALLEL indicators run concurrently (asyncio.Semaphore).
Each indicator is scored by an independent LangGraph graph invocation so there is
no shared mutable state between indicators.
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from agent.graph import build_graph
from db.supabase_client import (
    create_session,
    get_supabase,
    log_indicator_result,
    log_reasoning_step,
    update_session_status,
)
from excel.reader import read_indicator_rows
from excel.writer import write_assessment_result
from llm.ollama_client import create_ollama_client_from_env

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assessment", tags=["assessment"])

MAX_PARALLEL: int = int(os.environ.get("ASSESSMENT_MAX_PARALLEL", "5"))


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class StartAssessmentRequest(BaseModel):
    laporan_path: str
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


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/start", response_model=StartAssessmentResponse)
async def start_assessment(
    body: StartAssessmentRequest,
    background_tasks: BackgroundTasks,
) -> StartAssessmentResponse:
    """Start a full assessment pipeline for Laporan_AK.xlsx.

    Returns immediately with a session_id; the assessment runs in the background.
    """
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

    session_id = str(uuid.uuid4())
    parallel = body.max_parallel or MAX_PARALLEL

    create_session(session_id, body.laporan_path, len(indicators))

    background_tasks.add_task(
        _run_assessment_pipeline,
        session_id=session_id,
        laporan_path=body.laporan_path,
        indicators=indicators,
        max_parallel=parallel,
    )

    return StartAssessmentResponse(
        session_id=session_id,
        total_indicators=len(indicators),
        message="Assessment pipeline started. Poll /assessment/{session_id}/status for progress.",
    )


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


# ---------------------------------------------------------------------------
# Pipeline internals
# ---------------------------------------------------------------------------


async def _process_single_indicator(
    graph,
    indicator,
    laporan_path: str,
    session_id: str,
    semaphore: asyncio.Semaphore,
) -> bool:
    """Run the LangGraph agent for one indicator and persist results.

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
                "error": None,
            }

            # LangGraph .invoke is synchronous; run it in a thread to avoid
            # blocking the event loop while the LLM is generating.
            result = await asyncio.get_event_loop().run_in_executor(
                None, graph.invoke, initial_state
            )

            score = result.get("final_score")
            justification = result.get("justification", "")
            confidence = result.get("confidence")
            error = result.get("error")

            # Persist reasoning steps
            for idx, step in enumerate(result.get("reasoning_steps", [])):
                log_reasoning_step(
                    session_id=session_id,
                    indicator_no=indicator.indicator_no,
                    step_index=idx,
                    content=str(step),
                )

            # Write score + justification back to Excel (thread-safe via writer lock)
            if score is not None:
                write_assessment_result(
                    xlsx_path=laporan_path,
                    row_index=indicator.row_index,
                    score=round(score),
                    justification=justification or "",
                )

            log_indicator_result(
                session_id=session_id,
                indicator_no=indicator.indicator_no,
                score=score,
                justification=justification,
                confidence=confidence,
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
                error=str(exc),
            )
            return False


async def _run_assessment_pipeline(
    session_id: str,
    laporan_path: str,
    indicators: list,
    max_parallel: int,
) -> None:
    """Background task: score all indicators and update session status when done."""
    try:
        ollama_client = create_ollama_client_from_env()
        graph = build_graph(ollama_client)
        semaphore = asyncio.Semaphore(max_parallel)

        tasks = [
            _process_single_indicator(
                graph=graph,
                indicator=indicator,
                laporan_path=laporan_path,
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
