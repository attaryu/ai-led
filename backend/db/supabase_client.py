"""Supabase client — lazy singleton with audit-logging helpers.

Tables used (created by SQL migration in Task 10):
    assessment_sessions   — one row per /start call
    indicator_results     — one row per indicator scored
    reasoning_steps       — chain-of-thought log per indicator
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

from supabase import create_client

logger = logging.getLogger(__name__)

_client = None


def get_supabase():
    """Return the shared Supabase client, creating it on first call.

    Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from env.
    Raises RuntimeError if either var is missing.
    """
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment."
            )
        _client = create_client(url, key)
    return _client


# ---------------------------------------------------------------------------
# Session helpers
# ---------------------------------------------------------------------------


def create_session(session_id: str, laporan_path: str, total_indicators: int) -> None:
    """Insert a new assessment_sessions row (status='running')."""
    try:
        get_supabase().table("assessment_sessions").insert(
            {
                "session_id": session_id,
                "laporan_path": laporan_path,
                "total_indicators": total_indicators,
                "completed_indicators": 0,
                "status": "running",
            }
        ).execute()
    except Exception:
        logger.exception("Failed to create session %s in Supabase", session_id)


def update_session_status(
    session_id: str,
    status: str,
    completed_indicators: Optional[int] = None,
    error: Optional[str] = None,
) -> None:
    """Update status (and optionally completed_indicators / error) for a session."""
    payload: dict[str, Any] = {"status": status}
    if completed_indicators is not None:
        payload["completed_indicators"] = completed_indicators
    if error is not None:
        payload["error"] = error
    try:
        get_supabase().table("assessment_sessions").update(payload).eq(
            "session_id", session_id
        ).execute()
    except Exception:
        logger.exception("Failed to update session %s status to %s", session_id, status)


# ---------------------------------------------------------------------------
# Result helpers
# ---------------------------------------------------------------------------


def log_indicator_result(
    session_id: str,
    indicator_no: int,
    score: Optional[float],
    justification: Optional[str],
    confidence: Optional[float],
    error: Optional[str] = None,
) -> None:
    """Upsert a scored indicator into indicator_results."""
    try:
        get_supabase().table("indicator_results").upsert(
            {
                "session_id": session_id,
                "indicator_no": indicator_no,
                "score": score,
                "justification": justification,
                "confidence": confidence,
                "error": error,
            }
        ).execute()
    except Exception:
        logger.exception(
            "Failed to log indicator %d result for session %s", indicator_no, session_id
        )


def log_reasoning_step(
    session_id: str,
    indicator_no: int,
    step_index: int,
    content: str,
) -> None:
    """Append one reasoning step to the reasoning_steps table."""
    try:
        get_supabase().table("reasoning_steps").insert(
            {
                "session_id": session_id,
                "indicator_no": indicator_no,
                "step_index": step_index,
                "content": content,
            }
        ).execute()
    except Exception:
        logger.exception(
            "Failed to log reasoning step %d for indicator %d session %s",
            step_index,
            indicator_no,
            session_id,
        )
