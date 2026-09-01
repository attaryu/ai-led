"""RAGAS evaluation API routes.

POST /eval/run
    Trigger a RAGAS evaluation run in the background.
    Body: EvalRunRequest (session_id optional, n_indicators, metrics)
    Returns: eval_id to poll.

GET /eval/{eval_id}/results
    Return evaluation results once complete.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from eval.ragas_eval import (
    ALL_METRICS,
    get_available_judge_models,
    get_judge_llm_config,
    run_ragas_evaluation,
)
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/eval", tags=["evaluation"])

# In-process result store (resets on restart — sufficient for prototype)
_eval_results: dict[str, dict] = {}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class EvalRunRequest(BaseModel):
    session_id: Optional[str] = Field(
        default=None,
        description="Existing assessment session to read real agent justifications from. "
                    "If omitted, justifications are generated synthetically.",
    )
    n_indicators: int = Field(
        default=5,
        ge=1,
        le=64,
        description="Number of indicators to evaluate (1–64). Keep ≤10 for speed.",
    )
    metrics: list[str] = Field(
        default=["faithfulness", "answer_relevancy", "context_precision", "context_recall"],
        description="RAGAS metrics to compute.",
    )
    reference_path: Optional[str] = Field(
        default=None,
        description="Path to a JSON file containing actual ground-truth references. "
                    'Format: [{"indicator_no": int, "reference": str}, ...]. '
                    "Missing indicators fall back to synthetic LLM generation.",
    )
    model: Optional[str] = Field(
        default=None,
        description="Override judge model — must be one of GET /eval/models. "
                    "Defaults to the configured RAGAS/assessment model when omitted.",
    )


class EvalRunResponse(BaseModel):
    eval_id: str
    message: str
    n_indicators: int


class EvalResultResponse(BaseModel):
    eval_id: str
    status: str                     # pending | running | completed | failed
    n_samples: Optional[int] = None
    total_chunks: Optional[int] = None
    session_id: Optional[str] = None
    scores: Optional[dict] = None
    per_indicator: Optional[list] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    assessor_model: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    progress_stage: Optional[str] = None
    progress_current: Optional[int] = None
    progress_total: Optional[int] = None
    error: Optional[str] = None


class EvalConfigResponse(BaseModel):
    judge_provider: str
    judge_model: str
    assessment_provider: str
    assessment_model: str


class AvailableModelsResponse(BaseModel):
    provider: str
    models: list[str]


class EvalListItem(BaseModel):
    eval_id: str
    status: str
    provider: Optional[str] = None
    model: Optional[str] = None
    n_samples: Optional[int] = None
    scores: Optional[dict] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Background task
# ---------------------------------------------------------------------------


def _run_evaluation_background(
    eval_id: str,
    session_id: Optional[str],
    n_indicators: int,
    metrics: list[str],
    reference_path: Optional[str] = None,
    model: Optional[str] = None,
) -> None:
    _eval_results[eval_id]["status"] = "running"
    _eval_results[eval_id]["started_at"] = datetime.now(timezone.utc).isoformat()
    _eval_results[eval_id].update({
        "progress_stage": "starting",
        "progress_current": 0,
        "progress_total": n_indicators,
    })

    def _on_progress(stage: str, current: int, total: int) -> None:
        _eval_results[eval_id].update({
            "progress_stage": stage,
            "progress_current": current,
            "progress_total": total,
        })

    try:
        result = run_ragas_evaluation(
            n_indicators=n_indicators,
            session_id=session_id,
            metrics_to_run=metrics,
            reference_path=reference_path,
            progress_cb=_on_progress,
            model=model,
        )
        _eval_results[eval_id].update(
            {
                "status": "completed",
                "n_samples": result.get("n_samples"),
                "total_chunks": result.get("total_chunks"),
                "session_id": result.get("session_id"),
                "scores": result.get("scores"),
                "per_indicator": result.get("per_indicator"),
                "provider": result.get("provider"),
                "model": result.get("model"),
                "assessor_model": result.get("assessor_model"),
                "progress_stage": "completed",
                "progress_current": result.get("n_samples", 0),
                "progress_total": result.get("n_samples", 0),
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "error": result.get("error"),
            }
        )
        logger.info(
            "RAGAS eval %s completed — model=%s scores=%s",
            eval_id, result.get("model"), result.get("scores"),
        )
    except Exception as exc:
        logger.exception("RAGAS eval %s failed", eval_id)
        _eval_results[eval_id].update(
            {
                "status": "failed",
                "error": str(exc),
                "finished_at": datetime.now(timezone.utc).isoformat(),
            }
        )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/run", response_model=EvalRunResponse)
async def run_evaluation(
    body: EvalRunRequest,
    background_tasks: BackgroundTasks,
) -> EvalRunResponse:
    """Start a RAGAS evaluation run. Returns an eval_id to poll for results."""
    unknown = set(body.metrics) - set(ALL_METRICS)
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown metrics: {sorted(unknown)}. Valid: {ALL_METRICS}",
        )

    if body.model is not None:
        available = get_available_judge_models()
        if body.model not in available:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown model: {body.model}. Available: {available}",
            )

    eval_id = str(uuid.uuid4())
    cfg = get_judge_llm_config(model=body.model)
    _eval_results[eval_id] = {
        "status": "pending",
        "provider": cfg["provider"],
        "model": cfg["model"],
    }

    background_tasks.add_task(
        _run_evaluation_background,
        eval_id=eval_id,
        session_id=body.session_id,
        n_indicators=body.n_indicators,
        metrics=body.metrics,
        reference_path=body.reference_path,
        model=body.model,
    )

    return EvalRunResponse(
        eval_id=eval_id,
        n_indicators=body.n_indicators,
        message=(
            f"Evaluation started for {body.n_indicators} indicator(s). "
            f"Poll GET /eval/{eval_id}/results for progress."
        ),
    )


@router.get("/models", response_model=AvailableModelsResponse)
def get_available_models() -> AvailableModelsResponse:
    """Return the configured judge model list (RAGAS_* with fallback to the
    assessment model) — used to populate a model picker before /eval/run."""
    cfg = get_judge_llm_config()
    return AvailableModelsResponse(provider=cfg["provider"], models=get_available_judge_models())


@router.get("/config", response_model=EvalConfigResponse)
def get_eval_config(session_id: Optional[str] = None) -> EvalConfigResponse:
    """Return the RAGAS judge config + the assessment model (the thing under test)."""
    import os

    from eval.ragas_eval import _get_assessor_model
    from llm.ollama_client import get_available_models

    judge = get_judge_llm_config()
    assessment_provider = os.environ.get("LLM_PROVIDER", "ollama").lower()
    # session_id given -> report the model(s) that actually scored it, not just the configured default
    assessment_model = (session_id and _get_assessor_model(session_id)) or get_available_models()[0]

    return EvalConfigResponse(
        judge_provider=judge["provider"],
        judge_model=judge["model"],
        assessment_provider=assessment_provider,
        assessment_model=assessment_model,
    )


@router.get("/list", response_model=list[EvalListItem])
def list_eval_runs() -> list[EvalListItem]:
    """Return all eval runs in this process (most recent first)."""
    items = [
        EvalListItem(
            eval_id=eid,
            status=state.get("status", "unknown"),
            provider=state.get("provider"),
            model=state.get("model"),
            n_samples=state.get("n_samples"),
            scores=state.get("scores"),
            started_at=state.get("started_at"),
            finished_at=state.get("finished_at"),
        )
        for eid, state in _eval_results.items()
    ]
    # Most recent first (started_at descending; pending runs at the bottom)
    items.sort(key=lambda x: x.started_at or "", reverse=True)
    return items


@router.get("/{eval_id}/results", response_model=EvalResultResponse)
def get_eval_results(eval_id: str) -> EvalResultResponse:
    """Return evaluation results for a given eval_id."""
    if eval_id not in _eval_results:
        raise HTTPException(status_code=404, detail=f"Eval ID not found: {eval_id}")

    state = _eval_results[eval_id]
    return EvalResultResponse(
        eval_id=eval_id,
        status=state["status"],
        n_samples=state.get("n_samples"),
        total_chunks=state.get("total_chunks"),
        session_id=state.get("session_id"),
        scores=state.get("scores"),
        per_indicator=state.get("per_indicator"),
        provider=state.get("provider"),
        model=state.get("model"),
        assessor_model=state.get("assessor_model"),
        started_at=state.get("started_at"),
        finished_at=state.get("finished_at"),
        progress_stage=state.get("progress_stage"),
        progress_current=state.get("progress_current"),
        progress_total=state.get("progress_total"),
        error=state.get("error"),
    )
