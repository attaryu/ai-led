"""Assessment pipeline API routes.

POST /assessment/start
    Optional JSON body with laporan_path. If provided, indicator subset is read
    from the Laporan_AK.xlsx template; otherwise all 64 default indicators run.
    Fires off the assessment pipeline in the background and returns a session_id
    immediately so the caller can poll for status.

GET /assessment/{session_id}/status
    Returns current session status from Postgres.

GET /assessment/{session_id}/results
    Returns all per-indicator results (score, justification, confidence,
    recommendation) for a session.

Parallelism: up to MAX_PARALLEL indicators run concurrently (asyncio.Semaphore).
Each indicator is scored by an independent LangGraph graph invocation so there is
no shared mutable state between indicators.
"""

from __future__ import annotations

import asyncio
import contextvars
import logging
import os
import uuid
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from agent.context import AssessmentContext, current_assessment_context
from agent.graph import build_graph_auto
from agent.tools.rubric_tool import _get_rubrics, _get_rubrics_for_set
from db.postgres_client import (
    create_session,
    get_completed_indicator_numbers,
    get_document_accreditation_set,
    get_indicator_results,
    get_session,
    list_sessions as list_sessions_db,
    log_indicator_result,
    log_reasoning_step,
    update_session_status,
)
from excel.reader import read_indicator_rows
from llm.ollama_client import create_ollama_client_from_env, get_available_models

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assessment", tags=["assessment"])

MAX_PARALLEL: int = int(os.environ.get("ASSESSMENT_MAX_PARALLEL", "5"))
# Module-level (not a local) so tests can shrink it — how often is_cancelled()
# gets polled while nothing is completing, e.g. every indicator stuck on a
# slow/congested LLM endpoint.
CANCEL_POLL_SECONDS: float = 3


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class StartAssessmentRequest(BaseModel):
    # Wajib — tools (search_led_evidence, get_lkps_table) butuh ini via
    # agent/context.py. created_by_user_id wajib juga: assessment_sessions
    # (Postgres) punya FK NOT NULL ke users, beda dari Supabase yang dulu
    # tidak tahu user sama sekali.
    tenant_id: str
    dokumen_id: str
    created_by_user_id: str
    laporan_path: Optional[str] = None
    max_parallel: Optional[int] = None
    model: Optional[str] = None
    # Cap on how many cached rubrics run, overrides laporan_path's subset. For fast experiments.
    first_n_indicators: Optional[int] = None


class ResumeAssessmentRequest(BaseModel):
    # tenant_id/dokumen_id diminta ulang di sini karena tidak ada di baris
    # sesi. laporan_path juga: assessment_sessions (Postgres) tidak punya
    # kolom path mentah lagi (diganti laporan_bukti_dukung_id, FK ke modul
    # BuktiDukung yang belum ada — tracker row 45), jadi path harus dikirim
    # ulang oleh caller supaya resume tetap bisa re-derive indicator subset
    # yang sama seperti /start.
    tenant_id: str
    dokumen_id: str
    laporan_path: Optional[str] = None


class StartAssessmentResponse(BaseModel):
    session_id: str
    total_indicators: int
    message: str


class ResumeAssessmentResponse(BaseModel):
    session_id: str
    total_indicators: int
    skipped_indicators: int
    remaining_indicators: int
    message: str


class AvailableModelsResponse(BaseModel):
    provider: str
    models: list[str]


class IndicatorListItem(BaseModel):
    no: int
    kriteria: str
    # Everything below is additive — existing callers that only read
    # no/kriteria (the indicator picker) are unaffected. Added so the
    # frontend can render real rubric text/levels instead of its own
    # placeholder sample data (see RUBRIK_KRITERIA in rubric-criterion.entity.ts).
    indikator: str
    score_type: str
    score_criteria: dict[int, str]
    lkps_table_ref: list[str]
    # Needed to seed RubricCriterion.formula/subScoreFormula (packages/db) for
    # kuantitatif/komposit scoring -- see IndicatorRubric in matrix_parser.py.
    formula: str | None = None
    sub_score_formula: str | None = None


class SessionStatusResponse(BaseModel):
    session_id: str
    status: str
    total_indicators: int
    completed_indicators: int
    model: Optional[str] = None
    error: Optional[str] = None


class IndicatorResultItem(BaseModel):
    indicator_no: int
    sub_no: str = ""
    kriteria: Optional[str] = None
    score: Optional[float] = None
    justification: Optional[str] = None
    confidence: Optional[float] = None
    recommendation: Optional[str] = None
    error: Optional[str] = None
    model: Optional[str] = None
    sources_used: Optional[dict] = None


class SessionResultsResponse(BaseModel):
    session_id: str
    status: str
    total_indicators: int
    completed_indicators: int
    model: Optional[str] = None
    results: list[IndicatorResultItem]


class SessionSummary(BaseModel):
    session_id: str
    status: str
    total_indicators: int
    completed_indicators: int
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    avg_score: Optional[float] = None
    model: Optional[str] = None
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Lightweight indicator stub (used when no Laporan AK uploaded)
# ---------------------------------------------------------------------------


from ingestion.matrix_parser import sub_no_dari as _sub_no_dari  # noqa: E402 -- satu pintu, lihat ingestion/matrix_parser.py


@dataclass
class _SimpleIndicator:
    """Minimal shape compatible with what agent.graph needs from indicator_row."""
    indicator_no: int
    kriteria: str
    sub_no: str = ""


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


def _derive_indicators(
    laporan_path: Optional[str],
    first_n_indicators: Optional[int] = None,
    *,
    accreditation_set_id: str,
) -> list:
    """Shared by /start and /resume: laporan_path -> Excel-derived subset,
    otherwise every rubric_criteria row in the document's chosen
    AccreditationSet. first_n_indicators overrides both. Raises
    HTTPException on failure."""
    if first_n_indicators is not None:
        rubrics = _get_rubrics_for_set(accreditation_set_id)
        indicators = [
            _SimpleIndicator(indicator_no=r.no, kriteria=r.kriteria, sub_no=_sub_no_dari(r))
            for r in rubrics[:first_n_indicators]
        ]
        if not indicators:
            raise HTTPException(
                status_code=500,
                detail="No rubrics available for this AccreditationSet.",
            )
        return indicators

    if laporan_path:
        if not os.path.exists(laporan_path):
            raise HTTPException(
                status_code=400,
                detail=f"File not found on server: {laporan_path}",
            )
        indicators = read_indicator_rows(laporan_path)
        if not indicators:
            raise HTTPException(
                status_code=422,
                detail="No indicator rows found in the provided Laporan_AK.xlsx file.",
            )
        return indicators

    # Default: evaluate every rubric_criteria row in this AccreditationSet
    rubrics = _get_rubrics_for_set(accreditation_set_id)
    indicators = [
        _SimpleIndicator(indicator_no=r.no, kriteria=r.kriteria, sub_no=_sub_no_dari(r))
        for r in rubrics
    ]
    if not indicators:
        raise HTTPException(
            status_code=500,
            detail="No rubrics available for this AccreditationSet.",
        )
    return indicators


@router.get("/models", response_model=AvailableModelsResponse)
def get_assessment_models() -> AvailableModelsResponse:
    """Return the configured assessment model list (OLLAMA_MODEL or
    OPENROUTER_MODEL, comma-separated) — used to populate a model picker
    before /assessment/start or /assessment/{id}/resume."""
    provider = os.environ.get("LLM_PROVIDER", "ollama").lower()
    return AvailableModelsResponse(provider=provider, models=get_available_models())


@router.get("/indicators", response_model=list[IndicatorListItem])
def get_indicators() -> list[IndicatorListItem]:
    """Return the AMI indicators from the cached matrix.json rubric.

    Deliberately still matrix.json, not rubric_criteria — this is the
    one-time BOOTSTRAP source packages/db/prisma/seed-rubric-criteria.ts
    imports FROM to populate Postgres's rubric_criteria/AccreditationSet
    tables in the first place. Pointing it at Postgres instead would make
    the seed script read from the very table it's supposed to populate.
    The live scoring path (agent/tools/rubric_tool.py's get_indicator_rubric
    tool) reads rubric_criteria directly, scoped per AccreditationSet — see
    db.postgres_client.get_rubric_criteria_for_set.
    """
    return [
        IndicatorListItem(
            no=r.no,
            kriteria=r.kriteria,
            indikator=r.indikator,
            score_type=r.score_type,
            score_criteria=r.score_criteria,
            lkps_table_ref=r.lkps_table_ref,
            formula=r.formula,
            sub_score_formula=r.sub_score_formula,
        )
        for r in _get_rubrics()
    ]


@router.post("/start", response_model=StartAssessmentResponse)
async def start_assessment(
    body: StartAssessmentRequest,
    background_tasks: BackgroundTasks,
) -> StartAssessmentResponse:
    """Start an assessment pipeline.

    If ``laporan_path`` is provided, the indicator subset is extracted from that
    Excel template. Otherwise, all 64 default indicators are evaluated.
    Results are persisted to Postgres only — nothing is written back to Excel.
    """
    accreditation_set_id = get_document_accreditation_set(body.dokumen_id)
    if accreditation_set_id is None:
        raise HTTPException(
            status_code=400,
            detail="Dokumen ini belum memilih Instrumen Akreditasi — pilih Instrumen Akreditasi dulu sebelum menjalankan penilaian.",
        )
    indicators = _derive_indicators(
        body.laporan_path, body.first_n_indicators, accreditation_set_id=accreditation_set_id
    )

    if body.model is not None:
        available = get_available_models()
        if body.model not in available:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown model: {body.model}. Available: {available}",
            )

    session_id = str(uuid.uuid4())
    parallel = body.max_parallel or MAX_PARALLEL

    create_session(
        session_id,
        tenant_id=body.tenant_id,
        dokumen_id=body.dokumen_id,
        created_by_user_id=body.created_by_user_id,
        total_indicators=len(indicators),
    )

    background_tasks.add_task(
        _run_assessment_pipeline,
        session_id=session_id,
        indicators=indicators,
        max_parallel=parallel,
        tenant_id=body.tenant_id,
        dokumen_id=body.dokumen_id,
        accreditation_set_id=accreditation_set_id,
        model=body.model,
    )

    return StartAssessmentResponse(
        session_id=session_id,
        total_indicators=len(indicators),
        message="Assessment pipeline started. Poll /assessment/{session_id}/status for progress.",
    )


@router.post("/{session_id}/resume", response_model=ResumeAssessmentResponse)
async def resume_assessment(
    session_id: str,
    body: ResumeAssessmentRequest,
    background_tasks: BackgroundTasks,
    retry_failed: bool = False,
    model: Optional[str] = None,
) -> ResumeAssessmentResponse:
    """Resume a session that was cut off mid-run (worker crash/restart).

    Re-derives the same indicator subset the session originally used (same
    laporan_path, or default rubrics), then skips whichever indicators
    already have a row in indicator_results — their graph run already
    finished, successfully or with a logged error. Only indicators with no
    row at all (never started, or in-flight when the process died) are
    (re-)processed, under the SAME session_id.

    retry_failed=true additionally re-processes indicators that finished
    with a logged error (e.g. gave up after exhausting force-finalize
    retries), instead of leaving them permanently failed.

    model overrides the configured default for this resume run (must be one
    of GET /assessment/models).
    """
    if model is not None:
        available = get_available_models()
        if model not in available:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown model: {model}. Available: {available}",
            )

    sess = get_session(body.tenant_id, session_id)
    if sess is None:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")

    accreditation_set_id = get_document_accreditation_set(body.dokumen_id)
    if accreditation_set_id is None:
        raise HTTPException(
            status_code=400,
            detail="Dokumen ini belum memilih Instrumen Akreditasi — pilih Instrumen Akreditasi dulu sebelum menjalankan penilaian.",
        )

    if body.laporan_path:
        all_indicators = _derive_indicators(
            body.laporan_path, accreditation_set_id=accreditation_set_id
        )
    else:
        # No Excel-derived subset to re-read -- reconstruct the ORIGINAL
        # scope from the session's own recorded total_indicators, which
        # faithfully reflects whatever first_n_indicators (if any) the
        # initial /start call used. Without this, resume falls through to
        # "every cached rubric" regardless of what the session actually
        # started with, silently pulling in extra indicators the original
        # run was never asked to cover -- completed_indicators then grows
        # past the session's own total_indicators (e.g. 12/10, 120%).
        # A no-op for default (no first_n_indicators) sessions, since
        # total_indicators there already equals the full cached-rubric count.
        all_indicators = _derive_indicators(
            body.laporan_path,
            first_n_indicators=sess["total_indicators"],
            accreditation_set_id=accreditation_set_id,
        )

    done = get_completed_indicator_numbers(body.tenant_id, session_id, retry_failed=retry_failed)
    remaining = [ind for ind in all_indicators if (ind.indicator_no, _sub_no_dari(ind)) not in done]

    if not remaining:
        update_session_status(
            tenant_id=body.tenant_id,
            session_id=session_id,
            status="completed",
            completed_indicators=len(all_indicators),
        )
        return ResumeAssessmentResponse(
            session_id=session_id,
            total_indicators=len(all_indicators),
            skipped_indicators=len(done),
            remaining_indicators=0,
            message="All indicators already have a result — session marked completed.",
        )

    update_session_status(tenant_id=body.tenant_id, session_id=session_id, status="running")

    background_tasks.add_task(
        _run_assessment_pipeline,
        session_id=session_id,
        indicators=remaining,
        max_parallel=MAX_PARALLEL,
        initial_completed=len(done),
        tenant_id=body.tenant_id,
        dokumen_id=body.dokumen_id,
        accreditation_set_id=accreditation_set_id,
        model=model,
    )

    return ResumeAssessmentResponse(
        session_id=session_id,
        total_indicators=len(all_indicators),
        skipped_indicators=len(done),
        remaining_indicators=len(remaining),
        message="Resumed. Poll /assessment/{session_id}/status for progress.",
    )


@router.get("/list", response_model=list[SessionSummary])
async def list_sessions(limit: int = 50) -> list[SessionSummary]:
    """List recent assessment sessions (newest first), with avg score per session."""
    sessions = list_sessions_db(limit)
    return [
        SessionSummary(
            session_id=s["session_id"],
            status=s["status"],
            total_indicators=s["total_indicators"],
            completed_indicators=s["completed_indicators"],
            created_at=s.get("created_at").isoformat() if s.get("created_at") else None,
            updated_at=s.get("updated_at").isoformat() if s.get("updated_at") else None,
            avg_score=round(s["avg_score"], 2) if s.get("avg_score") is not None else None,
            model=s.get("model"),
            error=s.get("error"),
        )
        for s in sessions
    ]


@router.get("/{session_id}/status", response_model=SessionStatusResponse)
async def get_session_status(session_id: str) -> SessionStatusResponse:
    """Return the current status of an assessment session."""
    row = get_session(None, session_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")

    return SessionStatusResponse(
        session_id=row["session_id"],
        status=row["status"],
        total_indicators=row["total_indicators"],
        completed_indicators=row["completed_indicators"],
        model=row.get("model"),
        error=row.get("error"),
    )


@router.get("/{session_id}/results", response_model=SessionResultsResponse)
async def get_session_results(session_id: str) -> SessionResultsResponse:
    """Return all per-indicator results for a session, joined with rubric kriteria."""
    sess = get_session(None, session_id)
    if sess is None:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")

    rows = get_indicator_results(sess["tenant_id"], session_id)

    # Map indicator_no → kriteria for fast lookup, scoped to whatever
    # AccreditationSet this session's document actually used. Falls back to
    # an empty map (kriteria shows as None) rather than raising — a missing
    # set shouldn't block viewing already-scored results.
    accreditation_set_id = get_document_accreditation_set(sess["document_id"])
    kriteria_map: dict[tuple[int, str], str] = (
        {(r.no, _sub_no_dari(r)): r.kriteria for r in _get_rubrics_for_set(accreditation_set_id, sess["tenant_id"])}
        if accreditation_set_id
        else {}
    )

    items: list[IndicatorResultItem] = [
        IndicatorResultItem(
            indicator_no=row["indicator_no"],
            sub_no=row.get("sub_no") or "",
            kriteria=kriteria_map.get((row["indicator_no"], row.get("sub_no") or "")),
            score=row.get("score"),
            justification=row.get("justification"),
            confidence=row.get("confidence"),
            recommendation=row.get("recommendation"),
            error=row.get("error"),
            model=row.get("model"),
            sources_used=row.get("sources_used"),
        )
        for row in rows
    ]

    return SessionResultsResponse(
        session_id=session_id,
        status=sess["status"],
        total_indicators=sess["total_indicators"],
        completed_indicators=sess["completed_indicators"],
        model=sess.get("model"),
        results=items,
    )


# ---------------------------------------------------------------------------
# Pipeline internals
# ---------------------------------------------------------------------------


def _ringkas(teks: Optional[str], maks: int = 200) -> str:
    """One-line preview for log output -- justification/recommendation can
    run up to 2000/500 chars (graph.py's own truncation caps), too long to
    stay scannable in a terminal log line."""
    if not teks:
        return "-"
    teks = " ".join(teks.split())
    return teks if len(teks) <= maks else f"{teks[:maks]}…"


async def _process_single_indicator(
    indicator,
    session_id: str,
    semaphore: asyncio.Semaphore,
    tenant_id: str,
    dokumen_id: str,
    accreditation_set_id: str,
    study_program_id: Optional[str] = None,
    model: Optional[str] = None,
) -> bool:
    """Run the LangGraph agent for one indicator and persist results to Postgres.

    Builds its own OllamaClient/graph rather than reusing one shared across
    the whole batch — create_ollama_client_from_env() round-robins across a
    multi-endpoint OLLAMA_BASE_URL (one Ollama instance per GPU), so each
    concurrently-running indicator can land on a different GPU instead of
    every parallel task funneling through the same single endpoint.

    Returns True on success, False on error (error is logged and stored in Postgres).
    """
    async with semaphore:
        ollama_client = None
        try:
            ollama_client = create_ollama_client_from_env(model=model)
            logger.info(
                "Indicator %d (session %s) using Ollama endpoint %s",
                indicator.indicator_no, session_id, ollama_client.base_url,
            )
            graph = build_graph_auto(ollama_client)

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
                "sources_used": None,
            }

            # run_in_executor doesn't inherit context by default — copy it
            # explicitly so search_led_evidence/get_lkps_table see this.
            current_assessment_context.set(
                AssessmentContext(
                    tenant_id, dokumen_id, indicator.indicator_no, accreditation_set_id, study_program_id,
                    sub_no=_sub_no_dari(indicator),
                )
            )
            ctx = contextvars.copy_context()
            result = await asyncio.get_event_loop().run_in_executor(
                None, ctx.run, graph.invoke, initial_state
            )

            score = result.get("final_score")
            justification = result.get("justification", "")
            confidence = result.get("confidence")
            recommendation = result.get("recommendation")
            error = result.get("error")

            # The graph's actual verdict per indicator — otherwise the only
            # terminal-visible line is "using Ollama endpoint ..." logged
            # BEFORE invocation (line above), and the result only ever lands
            # in Postgres (log_indicator_result below), invisible from here.
            logger.info(
                "Indicator %d (session %s) dinilai: skor=%s confidence=%s | justifikasi: %s | rekomendasi: %s",
                indicator.indicator_no,
                session_id,
                f"{score:.2f}" if score is not None else "-",
                f"{confidence:.2f}" if confidence is not None else "-",
                _ringkas(justification),
                _ringkas(recommendation),
            )
            if error:
                # give_up_node/error_node set state["error"] without raising
                # -- this path returns normally, so without this the failure
                # is silent in the terminal (only the generic INFO line above).
                logger.warning(
                    "Indicator %d (session %s) selesai dengan galat dari agent: %s",
                    indicator.indicator_no, session_id, error,
                )

            for idx, step in enumerate(result.get("reasoning_steps", [])):
                log_reasoning_step(
                    tenant_id=tenant_id,
                    session_id=session_id,
                    indicator_no=indicator.indicator_no,
                    sub_no=_sub_no_dari(indicator),
                    step_index=idx,
                    content=str(step),
                )

            log_indicator_result(
                tenant_id=tenant_id,
                session_id=session_id,
                indicator_no=indicator.indicator_no,
                sub_no=_sub_no_dari(indicator),
                score=score,
                justification=justification,
                confidence=confidence,
                recommendation=recommendation,
                error=error,
                model=ollama_client.model,
                sources_used=result.get("sources_used"),
                judge_evidence=result.get("judge_evidence"),
            )
            return True

        except Exception as exc:
            logger.exception(
                "Error processing indicator %d for session %s",
                indicator.indicator_no,
                session_id,
            )
            # Full exception detail goes to the server log above — the
            # report-facing `error` field only gets a safe, generic message
            # naming the exception type, never the raw exception text
            # (which can contain low-level details like a bare socket error)
            # verbatim.
            log_indicator_result(
                tenant_id=tenant_id,
                session_id=session_id,
                indicator_no=indicator.indicator_no,
                sub_no=_sub_no_dari(indicator),
                score=None,
                justification=None,
                confidence=None,
                recommendation=None,
                error=f"Gagal dinilai ({type(exc).__name__}) — lihat log server untuk detail.",
                model=ollama_client.model if ollama_client else model,
            )
            return False


async def _run_assessment_pipeline(
    session_id: str,
    indicators: list,
    max_parallel: int,
    tenant_id: str,
    dokumen_id: str,
    accreditation_set_id: str,
    study_program_id: Optional[str] = None,
    initial_completed: int = 0,
    on_progress: Optional[Callable[[int, int], Awaitable[None]]] = None,
    model: Optional[str] = None,
    is_cancelled: Optional[Callable[[], Awaitable[bool]]] = None,
) -> None:
    """Background task: score all `indicators` and update session status when
    done. `indicators` may be a subset (resume) — `initial_completed` seeds
    the progress counter so /status reflects total session progress, not
    just progress within this particular run.

    `on_progress(completed, total)` — optional, awaited after each indicator
    finishes (success or logged error). Postgres (`completed_indicators`)
    already carries progress for the polling /status route; this is the
    second, separate channel a BullMQ job caller can wire to
    job.updateProgress() for the SSE gateway (job-events.service.ts) to
    forward live, without this module knowing BullMQ exists at all.

    `is_cancelled()` — optional, polled every `CANCEL_POLL_SECONDS` REGARDLESS
    of whether any indicator has finished yet — not just after completions.
    A slow/stuck LLM endpoint can mean nothing finishes for minutes; checking
    only on completion would leave a cancel request sitting unseen for that
    whole time. Once true, remaining not-yet-done tasks are cancelled outright
    and the session is marked `cancelled` rather than `completed` — indicators
    that finished before the check stay scored, nothing already written is
    undone.

    `model` overrides the configured default (see get_available_models()).
    """
    try:
        semaphore = asyncio.Semaphore(max_parallel)

        pending = {
            asyncio.ensure_future(
                _process_single_indicator(
                    indicator=indicator,
                    session_id=session_id,
                    semaphore=semaphore,
                    tenant_id=tenant_id,
                    dokumen_id=dokumen_id,
                    accreditation_set_id=accreditation_set_id,
                    study_program_id=study_program_id,
                    model=model,
                )
            )
            for indicator in indicators
        }

        total = initial_completed + len(indicators)
        completed = initial_completed
        cancelled = False
        while pending:
            # timeout, not just "wait for one" — this is what makes the
            # is_cancelled() check below fire even while every task is still
            # in flight, instead of only after something finishes.
            done, pending = await asyncio.wait(
                pending, timeout=CANCEL_POLL_SECONDS, return_when=asyncio.FIRST_COMPLETED
            )
            for task in done:
                await task
                completed += 1
                update_session_status(
                    tenant_id=tenant_id,
                    session_id=session_id,
                    status="running",
                    completed_indicators=completed,
                )
                if on_progress is not None:
                    await on_progress(completed, total)

            if is_cancelled is not None and await is_cancelled():
                cancelled = True
                break

        if cancelled:
            for task in pending:
                if not task.done():
                    task.cancel()
            update_session_status(
                tenant_id=tenant_id,
                session_id=session_id,
                status="cancelled",
                completed_indicators=completed,
            )
            logger.info(
                "Assessment session %s cancelled (%d/%d indicators completed)",
                session_id, completed, total,
            )
            return

        update_session_status(
            tenant_id=tenant_id,
            session_id=session_id,
            status="completed",
            completed_indicators=initial_completed + len(indicators),
        )
        logger.info(
            "Assessment session %s completed (%d indicators this run, %d total)",
            session_id, len(indicators), initial_completed + len(indicators),
        )

    except Exception as exc:
        logger.exception("Pipeline failure for session %s", session_id)
        update_session_status(
            tenant_id=tenant_id,
            session_id=session_id,
            status="failed",
            error=str(exc),
        )
