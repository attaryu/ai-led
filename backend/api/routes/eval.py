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
from typing import Optional

from eval.ragas_eval import ALL_METRICS, run_ragas_evaluation
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
        le=78,
        description="Number of indicators to evaluate (1–78). Keep ≤10 for speed.",
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


class EvalRunResponse(BaseModel):
    eval_id: str
    message: str
    n_indicators: int


class EvalResultResponse(BaseModel):
    eval_id: str
    status: str                     # pending | running | completed | failed
    n_samples: Optional[int] = None
    session_id: Optional[str] = None
    scores: Optional[dict] = None
    per_indicator: Optional[list] = None
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Background task
# ---------------------------------------------------------------------------


def _run_evaluation_background(
    eval_id: str,
    session_id: Optional[str],
    n_indicators: int,
    metrics: list[str],
    reference_path: Optional[str] = None,
) -> None:
    _eval_results[eval_id]["status"] = "running"
    try:
        result = run_ragas_evaluation(
            n_indicators=n_indicators,
            session_id=session_id,
            metrics_to_run=metrics,
            reference_path=reference_path,
        )
        _eval_results[eval_id].update(
            {
                "status": "completed",
                "n_samples": result.get("n_samples"),
                "session_id": result.get("session_id"),
                "scores": result.get("scores"),
                "per_indicator": result.get("per_indicator"),
                "error": result.get("error"),
            }
        )
        logger.info("RAGAS eval %s completed — scores: %s", eval_id, result.get("scores"))
    except Exception as exc:
        logger.exception("RAGAS eval %s failed", eval_id)
        _eval_results[eval_id].update({"status": "failed", "error": str(exc)})


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

    eval_id = str(uuid.uuid4())
    _eval_results[eval_id] = {"status": "pending"}

    background_tasks.add_task(
        _run_evaluation_background,
        eval_id=eval_id,
        session_id=body.session_id,
        n_indicators=body.n_indicators,
        metrics=body.metrics,
        reference_path=body.reference_path,
    )

    return EvalRunResponse(
        eval_id=eval_id,
        n_indicators=body.n_indicators,
        message=(
            f"Evaluation started for {body.n_indicators} indicator(s). "
            f"Poll GET /eval/{eval_id}/results for progress."
        ),
    )


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
        session_id=state.get("session_id"),
        scores=state.get("scores"),
        per_indicator=state.get("per_indicator"),
        error=state.get("error"),
    )
