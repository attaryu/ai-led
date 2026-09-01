"""Postgres access layer for the AMI assessment pipeline — writes to the
monorepo's own tables (assessment_sessions, assessment_indicator_results,
assessment_reasoning_steps, owned by packages/db/prisma/schema.prisma), replacing the
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

import psycopg2.extras

from db.connection import get_conn as _get_conn
from ingestion.matrix_parser import IndicatorRubric

logger = logging.getLogger(__name__)

# rubric_criteria.score_type is stored as the uppercase Indonesian enum
# (KUALITATIF/KUANTITATIF/KOMPOSIT) -- translated back to the lowercase
# English strings the LLM prompt/tests were built against (matrix.json's
# original vocabulary), same spirit as this module's status translation.
_SCORE_TYPE_TO_ENGLISH = {
    "KUALITATIF": "qualitative",
    "KUANTITATIF": "quantitative",
    "KOMPOSIT": "composite",
}
_SCORE_TYPE_FROM_ENGLISH = {v: k for k, v in _SCORE_TYPE_TO_ENGLISH.items()}


# ---------------------------------------------------------------------------
# Session helpers
# ---------------------------------------------------------------------------


def create_session(
    session_id: str,
    tenant_id: str,
    dokumen_id: str,
    created_by_user_id: str,
    total_indicators: int,
    laporan_bukti_dukung_id: Optional[str] = None,
    sumber_led: str = "EDITOR",
    led_file_name: Optional[str] = None,
    lkps_bukti_dukung_id: Optional[str] = None,
) -> None:
    """Insert a new assessment_sessions row (status=RUNNING).

    session_id becomes the row's primary key directly — any unique string
    works as a Prisma `String @id`, it doesn't need to be cuid-shaped.

    sumber_led/led_file_name/lkps_bukti_dukung_id are descriptive only —
    they record what the caller *says* the LED material was, for display.
    The agent's actual evidence retrieval (agent/tools/led_tool.py) always
    searches the same pgvector-indexed chunks for this (tenant_id,
    dokumen_id) regardless of this value; there's no code path that reads
    BabDokumen.kontenKerja directly.
    """
    try:
        with _get_conn().cursor() as cur:
            cur.execute(
                """
                INSERT INTO assessment_sessions
                    (id, tenant_id, document_id, created_by_user_id,
                     report_evidence_id, led_source, led_file_name,
                     lkps_evidence_id, total_indicators,
                     completed_indicators, status, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 0, 'RUNNING', now())
                """,
                (
                    session_id,
                    tenant_id,
                    dokumen_id,
                    created_by_user_id,
                    laporan_bukti_dukung_id,
                    sumber_led,
                    led_file_name,
                    lkps_bukti_dukung_id,
                    total_indicators,
                ),
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
            SELECT id AS session_id, document_id, status, total_indicators, completed_indicators, error
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
            LEFT JOIN assessment_indicator_results r ON r.session_id = s.id AND r.score IS NOT NULL
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
    model: Optional[str] = None,
    sources_used: Optional[dict] = None,
) -> None:
    """Upsert a scored indicator into assessment_indicator_results."""
    try:
        with _get_conn().cursor() as cur:
            cur.execute(
                """
                INSERT INTO assessment_indicator_results
                    (id, session_id, indicator_no, score, justification,
                     confidence, recommendation, error, model, sources_used)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (session_id, indicator_no) DO UPDATE SET
                    score = EXCLUDED.score,
                    justification = EXCLUDED.justification,
                    confidence = EXCLUDED.confidence,
                    recommendation = EXCLUDED.recommendation,
                    error = EXCLUDED.error,
                    model = EXCLUDED.model,
                    sources_used = EXCLUDED.sources_used
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
                    model,
                    psycopg2.extras.Json(sources_used) if sources_used is not None else None,
                ),
            )
    except Exception:
        logger.exception(
            "Failed to log indicator %d result for session %s", indicator_no, session_id
        )


def get_indicator_results(session_id: str) -> list[dict]:
    """Return all assessment_indicator_results rows for a session, ordered by indicator_no."""
    with _get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT indicator_no, score, justification, confidence, recommendation, error,
                   model, sources_used
            FROM assessment_indicator_results WHERE session_id = %s ORDER BY indicator_no
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
    assessment_indicator_results for this session — i.e. their graph run finished
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
                "SELECT indicator_no FROM assessment_indicator_results WHERE session_id = %s",
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
    """Append one reasoning step to the assessment_reasoning_steps table."""
    try:
        with _get_conn().cursor() as cur:
            cur.execute(
                """
                INSERT INTO assessment_reasoning_steps (id, session_id, indicator_no, step_index, content)
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


# ---------------------------------------------------------------------------
# Rubric helpers (dynamic per-AccreditationSet rubrics — replaces the old
# global matrix.json cache for the live scoring path; matrix.json stays the
# bootstrap source ingestion.matrix_parser/seed-rubric-criteria.ts import
# FROM, not something the agent reads directly anymore)
# ---------------------------------------------------------------------------


class RubricSetInUseError(RuntimeError):
    """Raised by replace_rubric_criteria_for_set when the set already has
    real scoring history — overwriting its criteria would silently orphan
    rubric_score_results rows that graded against the old ones."""


def get_document_accreditation_set(dokumen_id: str) -> Optional[str]:
    """Return the accreditation_set_id chosen for this document, or None if
    it hasn't picked one yet (blocks /start and /resume — see assessment.py)."""
    with _get_conn().cursor() as cur:
        cur.execute(
            "SELECT accreditation_set_id FROM writing_led_documents WHERE id = %s",
            (dokumen_id,),
        )
        row = cur.fetchone()
    return row["accreditation_set_id"] if row else None


def get_rubric_criteria_for_set(accreditation_set_id: str) -> list[IndicatorRubric]:
    """Return every rubric_criteria row for this set as IndicatorRubric
    objects — same shape as ingestion.matrix_parser.load_cached_rubrics(),
    so agent/tools/rubric_tool.py can use either interchangeably."""
    with _get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT id, indicator_no, criterion_group, description, score_type,
                   lkps_table_refs, formula, sub_score_formula
            FROM rubric_criteria WHERE accreditation_set_id = %s ORDER BY indicator_no
            """,
            (accreditation_set_id,),
        )
        criteria = [dict(r) for r in cur.fetchall()]
        if not criteria:
            return []

        cur.execute(
            """
            SELECT criterion_id, score, description FROM rubric_levels
            WHERE criterion_id = ANY(%s)
            """,
            ([c["id"] for c in criteria],),
        )
        levels_by_criterion: dict[str, dict[int, str]] = {}
        for row in cur.fetchall():
            levels_by_criterion.setdefault(row["criterion_id"], {})[row["score"]] = row["description"]

    return [
        IndicatorRubric(
            no=c["indicator_no"],
            kriteria=c["criterion_group"],
            indikator=c["description"],
            score_type=_SCORE_TYPE_TO_ENGLISH[c["score_type"]],
            score_criteria=levels_by_criterion.get(c["id"], {}),
            formula=c["formula"],
            lkps_table_ref=list(c["lkps_table_refs"] or []),
            sub_score_formula=c["sub_score_formula"],
        )
        for c in criteria
    ]


def replace_rubric_criteria_for_set(accreditation_set_id: str, rubrics: list[IndicatorRubric]) -> int:
    """Wipe and rewrite every rubric_criteria(+levels) row for this set from
    a freshly parsed rubric PDF (worker.py::_handle_ingestion_rubrik_dokumen).

    rubric_criterion_chapters is deliberately left untouched/empty for the
    new rows -- chapter mapping is LAM Teknik-specific hardcoding
    (seed-rubric-criteria.ts::chapterOrderFor), meaningless for an arbitrary
    custom rubric. A reviewer assigns chapters manually via the criteria
    form (UpsertCriterionDto.chapterOrders) after the auto-parse lands.

    Refuses (RubricSetInUseError) if any of the CURRENT criteria already
    has a real scoring result -- that means the set was actually used to
    score something, not just drafted, and blindly replacing it would
    orphan history. accreditation-set.service.ts's own requireUnlocked
    (checked at attach-document time, before this job is even enqueued)
    is a different, narrower gate: it only looks at whether a LedDocument
    currently points at the set, not whether it was ever scored.
    """
    with _get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT count(*) AS n FROM rubric_score_results
            WHERE criterion_id IN (SELECT id FROM rubric_criteria WHERE accreditation_set_id = %s)
            """,
            (accreditation_set_id,),
        )
        if cur.fetchone()["n"] > 0:
            raise RubricSetInUseError(
                "Set ini sudah punya riwayat skor tersimpan, tidak bisa ditimpa otomatis — hubungi admin."
            )

        cur.execute("BEGIN")
        try:
            cur.execute(
                "DELETE FROM rubric_criterion_chapters WHERE criterion_id IN "
                "(SELECT id FROM rubric_criteria WHERE accreditation_set_id = %s)",
                (accreditation_set_id,),
            )
            cur.execute(
                "DELETE FROM rubric_levels WHERE criterion_id IN "
                "(SELECT id FROM rubric_criteria WHERE accreditation_set_id = %s)",
                (accreditation_set_id,),
            )
            cur.execute(
                "DELETE FROM rubric_criteria WHERE accreditation_set_id = %s",
                (accreditation_set_id,),
            )

            for r in sorted(rubrics, key=lambda x: x.no):
                criterion_id = str(uuid.uuid4())
                cur.execute(
                    """
                    INSERT INTO rubric_criteria
                        (id, accreditation_set_id, indicator_no, criterion_code, criterion_group,
                         description, score_type, lkps_table_refs, formula, sub_score_formula)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        criterion_id,
                        accreditation_set_id,
                        r.no,
                        str(r.no),
                        r.kriteria,
                        r.indikator,
                        _SCORE_TYPE_FROM_ENGLISH[r.score_type],
                        r.lkps_table_ref,
                        r.formula,
                        r.sub_score_formula,
                    ),
                )
                for score, description in r.score_criteria.items():
                    cur.execute(
                        "INSERT INTO rubric_levels (id, criterion_id, score, description) VALUES (%s, %s, %s, %s)",
                        (str(uuid.uuid4()), criterion_id, int(score), description),
                    )
        except Exception:
            cur.execute("ROLLBACK")
            raise
        else:
            cur.execute("COMMIT")

    return len(rubrics)
