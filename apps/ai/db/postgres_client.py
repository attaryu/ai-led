"""Postgres access layer for the AMI assessment pipeline — writes to the
monorepo's own tables (assessment_sessions, indicator_results,
reasoning_steps, owned by packages/db/prisma/schema.prisma), replacing the
old Supabase project db.supabase_client used to write to (tracker row 44).

Same lazy-singleton-connection shape as db/supabase_client.py, same
call signatures, so callers only need an import swap. Two differences
callers must account for:
  - every function here requires tenant_id/dokumen_id/created_by_user_id
    (Supabase's tables never had a tenant concept at all)
  - status is stored as the uppercase AssessmentStatus enum in Postgres;
    this module translates to/from the lowercase strings ("running",
    "completed", "failed") the rest of the codebase already uses, so no
    caller-side string literals need to change
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

from db.connection import get_conn as _get_conn

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Session helpers
# ---------------------------------------------------------------------------


def create_session(
    session_id: str,
    tenant_id: str,
    dokumen_id: str,
    created_by_user_id: str,
    total_indicators: int,
) -> None:
    """Insert a new assessment_sessions row (status=RUNNING).

    session_id becomes the row's primary key directly — any unique string
    works as a Prisma `String @id`, it doesn't need to be cuid-shaped.
    """
    try:
        with _get_conn().cursor() as cur:
            cur.execute(
                """
                INSERT INTO assessment_sessions
                    (id, tenant_id, dokumen_id, created_by_user_id,
                     total_indicators, completed_indicators, status, updated_at)
                VALUES (%s, %s, %s, %s, %s, 0, 'RUNNING', now())
                """,
                (session_id, tenant_id, dokumen_id, created_by_user_id, total_indicators),
            )
    except Exception:
        logger.exception("Failed to create session %s in Postgres", session_id)


def update_session_status(
    session_id: str,
    status: str,
    completed_indicators: Optional[int] = None,
    error: Optional[str] = None,
) -> None:
    """Update status (and optionally completed_indicators / error) for a session."""
    sets = ["status = %s", "updated_at = now()"]
    params: list[Any] = [status.upper()]
    if completed_indicators is not None:
        sets.append("completed_indicators = %s")
        params.append(completed_indicators)
    if error is not None:
        sets.append("error = %s")
        params.append(error)
    params.append(session_id)
    try:
        with _get_conn().cursor() as cur:
            cur.execute(
                f"UPDATE assessment_sessions SET {', '.join(sets)} WHERE id = %s",
                params,
            )
    except Exception:
        logger.exception("Failed to update session %s status to %s", session_id, status)


def get_session(session_id: str) -> Optional[dict]:
    """Return the assessment_sessions row for session_id, or None if missing."""
    with _get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT id AS session_id, status, total_indicators, completed_indicators, error
            FROM assessment_sessions WHERE id = %s
            """,
            (session_id,),
        )
        row = cur.fetchone()
    if row is None:
        return None
    row = dict(row)
    row["status"] = row["status"].lower()
    return row


def list_sessions(limit: int = 50) -> list[dict]:
    """List recent sessions (newest first) with avg indicator score, joined in SQL."""
    with _get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT s.id AS session_id, s.status, s.total_indicators,
                   s.completed_indicators, s.created_at, s.updated_at, s.error,
                   AVG(r.score) AS avg_score
            FROM assessment_sessions s
            LEFT JOIN indicator_results r ON r.session_id = s.id AND r.score IS NOT NULL
            GROUP BY s.id
            ORDER BY s.created_at DESC
            LIMIT %s
            """,
            (max(1, min(limit, 200)),),
        )
        rows = [dict(r) for r in cur.fetchall()]
    for row in rows:
        row["status"] = row["status"].lower()
        if row["avg_score"] is not None:
            row["avg_score"] = float(row["avg_score"])
    return rows


# ---------------------------------------------------------------------------
# Result helpers
# ---------------------------------------------------------------------------


def log_indicator_result(
    session_id: str,
    indicator_no: int,
    score: Optional[float],
    justification: Optional[str],
    confidence: Optional[float],
    recommendation: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    """Upsert a scored indicator into indicator_results."""
    try:
        with _get_conn().cursor() as cur:
            cur.execute(
                """
                INSERT INTO indicator_results
                    (id, session_id, indicator_no, score, justification,
                     confidence, recommendation, error)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (session_id, indicator_no) DO UPDATE SET
                    score = EXCLUDED.score,
                    justification = EXCLUDED.justification,
                    confidence = EXCLUDED.confidence,
                    recommendation = EXCLUDED.recommendation,
                    error = EXCLUDED.error
                """,
                (
                    str(uuid.uuid4()),
                    session_id,
                    indicator_no,
                    score,
                    justification,
                    confidence,
                    recommendation,
                    error,
                ),
            )
    except Exception:
        logger.exception(
            "Failed to log indicator %d result for session %s", indicator_no, session_id
        )


def get_indicator_results(session_id: str) -> list[dict]:
    """Return all indicator_results rows for a session, ordered by indicator_no."""
    with _get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT indicator_no, score, justification, confidence, recommendation, error
            FROM indicator_results WHERE session_id = %s ORDER BY indicator_no
            """,
            (session_id,),
        )
        rows = [dict(r) for r in cur.fetchall()]
    for row in rows:
        if row["score"] is not None:
            row["score"] = float(row["score"])
        if row["confidence"] is not None:
            row["confidence"] = float(row["confidence"])
    return rows


def get_completed_indicator_numbers(session_id: str) -> set[int]:
    """Return the set of indicator_no that already have a row in
    indicator_results for this session — i.e. their graph run finished
    (successfully or with a logged error), as opposed to never having
    started or being cut off mid-run by a crash/restart. Used by resume to
    decide what still needs (re-)processing.

    Returns an empty set on any DB error — the conservative choice for a
    resume decision is to treat nothing as confirmed done and re-run it,
    not to silently skip work based on an unreadable state.
    """
    try:
        with _get_conn().cursor() as cur:
            cur.execute(
                "SELECT indicator_no FROM indicator_results WHERE session_id = %s",
                (session_id,),
            )
            return {row["indicator_no"] for row in cur.fetchall()}
    except Exception:
        logger.exception("Failed to fetch completed indicators for session %s", session_id)
        return set()


def log_reasoning_step(
    session_id: str,
    indicator_no: int,
    step_index: int,
    content: str,
) -> None:
    """Append one reasoning step to the reasoning_steps table."""
    try:
        with _get_conn().cursor() as cur:
            cur.execute(
                """
                INSERT INTO reasoning_steps (id, session_id, indicator_no, step_index, content)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (str(uuid.uuid4()), session_id, indicator_no, step_index, content),
            )
    except Exception:
        logger.exception(
            "Failed to log reasoning step %d for indicator %d session %s",
            step_index,
            indicator_no,
            session_id,
        )
