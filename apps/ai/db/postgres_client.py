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

Every function takes `tenant_id` (keyword-only) and runs inside
db.connection.tenant_cursor(tenant_id), which sets Postgres's
`app.tenant_id` session var for RLS — see db/connection.py's docstring.
`tenant_id=None` only for the two bootstrap/global-listing exceptions
(get_document_accreditation_set, list_sessions).
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

import psycopg2.extras

from db.connection import tenant_cursor
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
    bull_job_id: Optional[str] = None,
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

    bull_job_id — the BullMQ job driving this session (worker.py's
    `job.id`), persisted so the Batalkan button works from any tab/user
    viewing this session, not just the one that started it (see
    JobsService.cancel, apps/backend). `None` for the direct HTTP
    /assessment/start /resume routes, which never go through BullMQ.
    """
    try:
        with tenant_cursor(tenant_id) as cur:
            cur.execute(
                """
                INSERT INTO assessment_sessions
                    (id, tenant_id, document_id, created_by_user_id,
                     report_evidence_id, led_source, led_file_name,
                     lkps_evidence_id, total_indicators,
                     completed_indicators, status, bull_job_id, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 0, 'RUNNING', %s, now())
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
                    bull_job_id,
                ),
            )
    except Exception:
        logger.exception("Failed to create session %s in Postgres", session_id)


def update_session_status(
    tenant_id: str,
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
        with tenant_cursor(tenant_id) as cur:
            cur.execute(
                f"UPDATE assessment_sessions SET {', '.join(sets)} WHERE id = %s",
                params,
            )
    except Exception:
        logger.exception("Failed to update session %s status to %s", session_id, status)


def save_session_quality(tenant_id: str, session_id: str, quality: dict) -> None:
    """Persist a session's RAGAS quality result (docs/database.md §12b(3)).

    Overwritten on every re-run, same policy as IndicatorResult — not an
    append-only log. `quality` is stored as-is (the same
    scores/per_indicator/total_chunks/model/finished_at shape
    api/routes/eval.py's EvalResultResponse already returns), so the caller
    doesn't need a second shape just for persistence.
    """
    try:
        with tenant_cursor(tenant_id) as cur:
            cur.execute(
                "UPDATE assessment_sessions SET kualitas = %s, updated_at = now() WHERE id = %s",
                (psycopg2.extras.Json(quality), session_id),
            )
    except Exception:
        logger.exception("Failed to save session %s quality", session_id)


def get_session(tenant_id: Optional[str], session_id: str) -> Optional[dict]:
    """Return the assessment_sessions row for session_id, or None if missing.

    `tenant_id=None` where the caller doesn't have one yet (GET /status,
    /results — session_id is the only identifier the request carries) — the
    returned row's own `tenant_id` then scopes whatever else that request
    needs to look up, same bootstrap pattern as get_bab_dokumen.
    """
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            SELECT s.id AS session_id, s.tenant_id, s.document_id, s.status, s.total_indicators,
                   s.completed_indicators, s.error, s.lkps_evidence_id,
                   d.accreditation_set_id, d.study_program_id, d.lkps_evidence_id AS document_lkps_evidence_id,
                   (SELECT r2.model FROM assessment_indicator_results r2 WHERE r2.session_id = s.id AND r2.model IS NOT NULL LIMIT 1) AS model
            FROM assessment_sessions s
            JOIN writing_led_documents d ON d.id = s.document_id
            WHERE s.id = %s
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
    """List recent sessions (newest first) with avg indicator score, joined
    in SQL. Genuinely cross-tenant (admin/global listing) — no tenant_id,
    runs with no `app.tenant_id` set."""
    with tenant_cursor(None) as cur:
        cur.execute(
            """
            SELECT s.id AS session_id, s.status, s.total_indicators,
                   s.completed_indicators, s.created_at, s.updated_at, s.error,
                   AVG(r.score) AS avg_score, (SELECT r2.model FROM assessment_indicator_results r2 WHERE r2.session_id = s.id AND r2.model IS NOT NULL LIMIT 1) AS model
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
    tenant_id: str,
    session_id: str,
    indicator_no: int,
    score: Optional[float],
    justification: Optional[str],
    confidence: Optional[float],
    recommendation: Optional[str] = None,
    error: Optional[str] = None,
    model: Optional[str] = None,
    sources_used: Optional[dict] = None,
    sub_no: str = "",
    judge_evidence: Optional[str] = None,
) -> None:
    """Upsert a scored indicator into assessment_indicator_results. Kuncinya (session, indicator_no, sub_no):
    sub-indikator dengan nomor sama (43.I / 43.II) tidak saling menimpa."""
    try:
        with tenant_cursor(tenant_id) as cur:
            cur.execute(
                """
                INSERT INTO assessment_indicator_results
                    (id, session_id, indicator_no, sub_no, score, justification,
                     confidence, recommendation, error, model, sources_used, judge_evidence)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (session_id, indicator_no, sub_no) DO UPDATE SET
                    score = EXCLUDED.score,
                    justification = EXCLUDED.justification,
                    confidence = EXCLUDED.confidence,
                    recommendation = EXCLUDED.recommendation,
                    error = EXCLUDED.error,
                    model = EXCLUDED.model,
                    sources_used = EXCLUDED.sources_used,
                    judge_evidence = EXCLUDED.judge_evidence,
                    -- dinilai ulang = justifikasi baru; verdict lama tidak boleh menempel padanya
                    judge_verdict = NULL
                """,
                (
                    str(uuid.uuid4()),
                    session_id,
                    indicator_no,
                    sub_no or "",
                    score,
                    justification,
                    confidence,
                    recommendation,
                    error,
                    model,
                    psycopg2.extras.Json(sources_used) if sources_used is not None else None,
                    judge_evidence,
                ),
            )
    except Exception:
        logger.exception(
            "Failed to log indicator %d result for session %s", indicator_no, session_id
        )


def get_indicator_results(tenant_id: str, session_id: str) -> list[dict]:
    """Return all assessment_indicator_results rows for a session, ordered by indicator_no."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            SELECT indicator_no, sub_no, score, justification, confidence, recommendation, error,
                   model, sources_used
            FROM assessment_indicator_results WHERE session_id = %s ORDER BY indicator_no, sub_no
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


def get_judge_rows(tenant_id: str, session_id: str) -> list[dict]:
    """Baris hasil satu sesi beserta masukan/keluaran judge on-demand, urut (indicator_no, sub_no).
    `judge_evidence` sengaja hanya dibaca di sini (apps/ai), tidak ikut `get_indicator_results`."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            SELECT indicator_no, sub_no, score, justification, error, judge_evidence, judge_verdict
            FROM assessment_indicator_results WHERE session_id = %s ORDER BY indicator_no, sub_no
            """,
            (session_id,),
        )
        rows = [dict(r) for r in cur.fetchall()]
    for row in rows:
        if row["score"] is not None:
            row["score"] = float(row["score"])
    return rows


def set_judge_verdict(
    tenant_id: str,
    session_id: str,
    indicator_no: int,
    sub_no: str,
    justification: Optional[str],
    verdict: dict,
) -> bool:
    """Tulis verdict judge untuk satu baris -- hanya bila justifikasinya masih yang dinilai juri.
    Penilaian ulang yang terjadi saat judge berjalan mengganti justifikasi, sehingga verdict
    kedaluwarsa ditolak (return False) alih-alih menempel di teks baru."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            UPDATE assessment_indicator_results SET judge_verdict = %s
            WHERE session_id = %s AND indicator_no = %s AND sub_no = %s
              AND justification IS NOT DISTINCT FROM %s
            """,
            (psycopg2.extras.Json(verdict), session_id, indicator_no, sub_no or "", justification),
        )
        return cur.rowcount == 1


def get_completed_indicator_numbers(
    tenant_id: str, session_id: str, retry_failed: bool = False
) -> set[tuple[int, str]]:
    """Return the set of (indicator_no, sub_no) that already have a row in
    assessment_indicator_results for this session — i.e. their graph run finished
    (successfully or with a logged error), as opposed to never having
    started or being cut off mid-run by a crash/restart. Used by resume to
    decide what still needs (re-)processing.

    Returns an empty set on any DB error — the conservative choice for a
    resume decision is to treat nothing as confirmed done and re-run it,
    not to silently skip work based on an unreadable state.
    """
    try:
        with tenant_cursor(tenant_id) as cur:
            cur.execute(
                "SELECT indicator_no, sub_no FROM assessment_indicator_results WHERE session_id = %s"
                # retry_failed: baris yang berakhir error dianggap BELUM selesai (diproses ulang saat resume).
                + (" AND error IS NULL" if retry_failed else ""),
                (session_id,),
            )
            return {(row["indicator_no"], row["sub_no"] or "") for row in cur.fetchall()}
    except Exception:
        logger.exception("Failed to fetch completed indicators for session %s", session_id)
        return set()


def log_reasoning_step(
    tenant_id: str,
    session_id: str,
    indicator_no: int,
    step_index: int,
    content: str,
    sub_no: str = "",
) -> None:
    """Append one reasoning step to the assessment_reasoning_steps table."""
    try:
        with tenant_cursor(tenant_id) as cur:
            cur.execute(
                """
                INSERT INTO assessment_reasoning_steps (id, session_id, indicator_no, sub_no, step_index, content)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (str(uuid.uuid4()), session_id, indicator_no, sub_no or "", step_index, content),
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
    it hasn't picked one yet (blocks /start and /resume — see assessment.py).
    Bootstrap lookup — tenant_id isn't known yet, this is what discovers it
    downstream (worker.py resolves tenant_id from job.data separately)."""
    with tenant_cursor(None) as cur:
        cur.execute(
            "SELECT accreditation_set_id FROM writing_led_documents WHERE id = %s",
            (dokumen_id,),
        )
        row = cur.fetchone()
    return row["accreditation_set_id"] if row else None


def get_accreditation_set_tenant(accreditation_set_id: str) -> Optional[str]:
    """Bootstrap lookup — worker.py's INGESTION_RUBRIK_DOKUMEN job only
    carries accreditationSetId in its BullMQ payload (accreditation-set.
    service.ts's enqueue call), not tenantId, so this discovers it the same
    way get_document_accreditation_set does for dokumen_id."""
    with tenant_cursor(None) as cur:
        cur.execute(
            "SELECT tenant_id FROM accreditation_sets WHERE id = %s",
            (accreditation_set_id,),
        )
        row = cur.fetchone()
    return row["tenant_id"] if row else None


def get_reference_guide_tenant(guide_id: str) -> Optional[str]:
    """Bootstrap lookup, same reasoning as get_accreditation_set_tenant --
    INGESTION_STRUKTUR_DOKUMEN now carries guideId (the Panduan, a
    ReferenceGuide row), not accreditationSetId, since a Panduan is reusable
    across sets and owns its own extraction status. guide_references.tenant_id
    is a direct column (migration `20260915140000_reusable_panduan_penulisan`),
    no join needed."""
    with tenant_cursor(None) as cur:
        cur.execute(
            "SELECT tenant_id FROM guide_references WHERE id = %s",
            (guide_id,),
        )
        row = cur.fetchone()
    return row["tenant_id"] if row else None


def get_rubric_criteria_for_set(tenant_id: str, accreditation_set_id: str) -> list[IndicatorRubric]:
    """Return every rubric_criteria row for this set as IndicatorRubric
    objects — same shape as ingestion.matrix_parser.load_cached_rubrics(),
    so agent/tools/rubric_tool.py can use either interchangeably."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            SELECT id, indicator_no, sub_no, criterion_group, description, score_type,
                   lkps_table_refs, formula, sub_score_formula
            FROM rubric_criteria WHERE accreditation_set_id = %s ORDER BY indicator_no, sub_no
            """,
            (accreditation_set_id,),
        )
        criteria = [dict(r) for r in cur.fetchall()]
        if not criteria:
            return []

        cur.execute(
            """
            SELECT criterion_id, score, description FROM rubric_levels
            WHERE criterion_id = ANY(%s) ORDER BY score DESC
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
            sub_no=c["sub_no"] or "",
        )
        for c in criteria
    ]


def replace_rubric_criteria_for_set(
    tenant_id: str, accreditation_set_id: str, rubrics: list[IndicatorRubric]
) -> int:
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

    Runs as one transaction (tenant_cursor owns commit/rollback) — the
    guard SELECT and the wipe+rewrite are now atomic together, where the
    old autocommit connection needed its own explicit BEGIN/COMMIT after
    the guard.
    """
    with tenant_cursor(tenant_id) as cur:
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

    return len(rubrics)


def replace_rubric_hierarchy_for_set(
    tenant_id: str, accreditation_set_id: str, records: list[dict]
) -> int:
    """Wipe and rewrite rubric_criterion_groups + rubric_criteria (+levels) for
    this set from `ingestion.matrix_mineru.parse_matrix_mineru` records.

    ponytail: pengganti replace_rubric_criteria_for_set untuk jalur MinerU. Beda
    pokok:
      - Tiga tingkat teratas (kelompok > kriteria > IKU, urutan kunci SEBELUM
        `sub_kriteria` pada record) ditulis ke rubric_criterion_groups sebagai
        adjacency list; rubric_criteria.group_id menunjuk node terdalamnya.
        `sub_kriteria` (teks kolom "Kriteria" baris itu) tetap di
        rubric_criteria.criterion_group, seperti permintaan pengguna.
      - Satu `no` bisa jadi beberapa record (sub-indikator komposit I, II,
        dibedakan `sub_no`) -> beberapa baris dengan indicator_no sama.
        criterion_code dibuat unik ("4" atau "4.I") karena worker.py::
        kode_ke_id memakainya sebagai kunci kamus.
      - Judul grup yang sama di induk BERBEDA tetap dua node (unique index
        ada di (set, COALESCE(parent_id,''), label)).

    Penjaga RubricSetInUseError dipertahankan: set yang sudah punya riwayat skor
    tidak ditimpa. rubric_criterion_chapters dikosongkan seperti sebelumnya
    (pemetaan bab diisi manual lewat form kriteria).
    """
    from ingestion.matrix_mineru import parse_markers

    def _marker(label: str) -> str | None:
        kandidat = parse_markers(label)
        return kandidat[0].raw if kandidat else None

    with tenant_cursor(tenant_id) as cur:
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
        cur.execute("DELETE FROM rubric_criteria WHERE accreditation_set_id = %s", (accreditation_set_id,))
        cur.execute("DELETE FROM rubric_criterion_groups WHERE accreditation_set_id = %s", (accreditation_set_id,))

        # (parent_id, label) -> group id ; urutan saudara dihitung per induk
        grup_id: dict[tuple, str] = {}
        urutan: dict[object, int] = {}

        def _grup(parent_id: str | None, level: str, label: str) -> str:
            kunci = (parent_id, label)
            if kunci in grup_id:
                return grup_id[kunci]
            urutan[parent_id] = urutan.get(parent_id, 0) + 1
            gid = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO rubric_criterion_groups
                    (id, accreditation_set_id, parent_id, level, "order", marker, label)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (gid, accreditation_set_id, parent_id, level, urutan[parent_id], _marker(label), label),
            )
            grup_id[kunci] = gid
            return gid

        for rec in sorted(records, key=lambda r: (r["no"], r.get("sub_no") or "")):
            # kunci hierarki = semua kunci record SEBELUM "sub_kriteria"
            kunci_level = list(rec)[: list(rec).index("sub_kriteria")]
            parent: str | None = None
            for k in kunci_level:
                if rec.get(k):
                    parent = _grup(parent, k.upper(), rec[k])

            sub_no = rec.get("sub_no")
            criterion_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO rubric_criteria
                    (id, accreditation_set_id, indicator_no, sub_no, group_id, criterion_code, criterion_group,
                     description, score_type, lkps_table_refs, formula, sub_score_formula)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    criterion_id,
                    accreditation_set_id,
                    rec["no"],
                    sub_no,
                    parent,
                    str(rec["no"]) if not sub_no else f"{rec['no']}.{sub_no}",
                    rec.get("sub_kriteria") or "",
                    rec.get("indikator") or "",
                    _SCORE_TYPE_FROM_ENGLISH[rec["score_type"]],
                    rec.get("lkps_table_ref") or [],
                    rec.get("formula"),
                    rec.get("sub_score_formula"),
                ),
            )
            for score, description in rec["score_criteria"].items():
                cur.execute(
                    "INSERT INTO rubric_levels (id, criterion_id, score, description) VALUES (%s, %s, %s, %s)",
                    (str(uuid.uuid4()), criterion_id, int(score), description or ""),
                )

    return len(records)


def _insert_sub_bab_template(cur, chapter_template_id: str, parent_id: str | None, sub: dict) -> None:
    """Insert satu sub_bab_templates row, lalu anak-anaknya (`sub["subbab"]`, rekursif sedalam apa pun)."""
    sub_bab_id = str(uuid.uuid4())
    cur.execute(
        """
        INSERT INTO sub_bab_templates
            (id, chapter_template_id, parent_id, "order", title, marker, guidance, lkps_needed, lkps_list)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            sub_bab_id, chapter_template_id, parent_id, sub["order"], sub["title"], sub.get("marker"), sub["guidance"],
            sub.get("lkps_needed"), psycopg2.extras.Json(sub.get("lkps_list") or []),
        ),
    )
    for anak in sub.get("subbab", []):
        _insert_sub_bab_template(cur, chapter_template_id, sub_bab_id, anak)


def replace_chapter_templates_for_guide(
    tenant_id: str, guide_id: str, bab_list: list[dict]
) -> int:
    """Wipe and rewrite every chapter_templates(+sub_bab_templates) row for
    this Panduan (ReferenceGuide) from a freshly parsed PANDUAN_LAM PDF
    (worker.py::_handle_ingestion_struktur_dokumen). Scoped to the Panduan,
    not one AccreditationSet -- every set pointing at this guide_id (many,
    since a Panduan is reusable, see AccreditationSet.panduanId) shares the
    same rewritten structure.

    `bab_list`: [{"order": int, "title": str, "subbab": [{"order": int,
    "title": str, "guidance": str, "subbab": [...]}]}], nested to any depth
    (SubBabTemplate.parentId), like dimas's panduan_detail.

    No "in use" guard like replace_rubric_criteria_for_set -- a document's
    DocumentChapter rows are stamped ONCE at creation time from whatever
    templates exist then (apps/web's ledProjectRepository.create());
    re-extracting only changes the template for documents created
    AFTERWARD, never retroactively touches existing ones.
    """
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            "DELETE FROM sub_bab_templates WHERE chapter_template_id IN "
            "(SELECT id FROM chapter_templates WHERE guide_id = %s)",
            (guide_id,),
        )
        cur.execute(
            "DELETE FROM chapter_templates WHERE guide_id = %s",
            (guide_id,),
        )

        for bab in bab_list:
            chapter_template_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO chapter_templates (id, guide_id, "order", title, guidance)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (chapter_template_id, guide_id, bab["order"], bab["title"], bab.get("guidance") or None),
            )
            for sub in bab.get("subbab", []):
                _insert_sub_bab_template(cur, chapter_template_id, None, sub)

    return len(bab_list)


def save_structure_staging(tenant_id: str, guide_id: str, staged_nodes: list[dict]) -> None:
    """Park a freshly parsed PANDUAN_LAM structure in guide_references.structure_staging
    instead of committing it (worker.py::_handle_ingestion_struktur_dokumen) --
    ChapterTemplate/SubBabTemplate stay untouched until confirm_structure_staging.

    `staged_nodes`: flat [{"id", "parent_id", "level" (1 = BAB, any depth), "order",
    "title", "guidance"}, ...] -- worker.py::_flatten_bab_list assigns
    stable dotted ids ("1", "1.2", "1.2.3") so parent/child survive the
    round trip without real ChapterTemplate/SubBabTemplate rows yet.
    """
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """UPDATE guide_references
               SET structure_staging = %s, structure_parse_status = 'MENUNGGU_KONFIRMASI',
                   structure_parse_error = NULL
               WHERE id = %s""",
            (psycopg2.extras.Json(staged_nodes), guide_id),
        )


def get_structure_preview(tenant_id: str, guide_id: str) -> Optional[dict]:
    """Read-side for the "Pilih Struktur Pedoman" confirm modal. While
    structure_parse_status is MENUNGGU_KONFIRMASI, reads the staged (not yet
    committed) tree; otherwise falls back to the real committed
    ChapterTemplate/SubBabTemplate rows (so re-opening the modal after
    confirm, or before any extraction ran, still shows something sane) --
    same dual-mode as dimas's GET /panduan/{id}/preview."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """SELECT structure_parse_status, structure_staging
               FROM guide_references WHERE id = %s""",
            (guide_id,),
        )
        row = cur.fetchone()
        if not row:
            return None

        if row["structure_parse_status"] == "MENUNGGU_KONFIRMASI" and row["structure_staging"]:
            nodes = row["structure_staging"]
        else:
            cur.execute(
                """SELECT id, NULL::text AS parent_id, 1 AS level, "order", title, NULL::text AS marker,
                          guidance, true AS is_active,
                          false AS lkps_needed, '[]'::jsonb AS lkps_list
                   FROM chapter_templates WHERE guide_id = %s
                   UNION ALL
                   SELECT sb.id, COALESCE(sb.parent_id, sb.chapter_template_id),
                          0,
                          sb."order", sb.title, sb.marker, sb.guidance, sb.is_active,
                          COALESCE(sb.lkps_needed, false), sb.lkps_list
                   FROM sub_bab_templates sb
                   JOIN chapter_templates ct ON ct.id = sb.chapter_template_id
                   WHERE ct.guide_id = %s
                   ORDER BY level DESC, "order" """,
                (guide_id, guide_id),
            )
            nodes = [dict(r) for r in cur.fetchall()]
            # Real depth from the parent chain (any depth), chapters are level 1.
            parent_of = {n["id"]: n["parent_id"] for n in nodes}

            def depth(node_id: str) -> int:
                parent = parent_of.get(node_id)
                return 1 if parent is None else depth(parent) + 1

            for n in nodes:
                n["level"] = depth(n["id"])
            nodes.sort(key=lambda n: (n["level"], n["order"]))

    return {"status": row["structure_parse_status"], "nodes": nodes}


def confirm_structure_staging(tenant_id: str, guide_id: str, accepted_ids: set[str]) -> int:
    """Commit ONLY the checked nodes from structure_staging into
    ChapterTemplate/SubBabTemplate (worker.py exposes this via
    POST /structure/{guideId}/confirm). Unchecked nodes are discarded; a checked
    node under an unchecked parent is kept under its nearest checked ancestor.

    Raises ValueError if this Panduan isn't actually MENUNGGU_KONFIRMASI
    (stale double-submit, or confirm called before any extraction ran)."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """SELECT structure_parse_status, structure_staging
               FROM guide_references WHERE id = %s""",
            (guide_id,),
        )
        row = cur.fetchone()
    if not row or row["structure_parse_status"] != "MENUNGGU_KONFIRMASI":
        raise ValueError("Struktur ini tidak sedang menunggu konfirmasi")

    nodes = row["structure_staging"] or []
    # dimas confirm_panduan keeps every checked node on its own: a checked node under an unchecked
    # parent hangs off its nearest checked ancestor. Only a BAB (level 1) makes a chapter, so nodes
    # whose whole chain up to the BAB is unchecked have nowhere to go and are dropped.
    by_id = {n["id"]: n for n in nodes}
    position = {n["id"]: i for i, n in enumerate(nodes)}  # staging is in document order

    def _kept_parent(n: dict) -> Optional[str]:
        p = n["parent_id"]
        while p is not None and p not in accepted_ids:
            p = by_id[p]["parent_id"] if p in by_id else None
        return p

    by_parent: dict[Optional[str], list[dict]] = {}
    for n in nodes:
        if n["id"] not in accepted_ids:
            continue
        parent = None if n["parent_id"] is None else _kept_parent(n)
        if n["parent_id"] is not None and parent is None:
            continue
        by_parent.setdefault(parent, []).append(n)
    for siblings in by_parent.values():
        siblings.sort(key=lambda n: position[n["id"]])

    def _to_subbab(parent_id: str) -> list[dict]:
        return [
            {
                "order": i, "title": n["title"], "marker": n.get("marker"), "guidance": n.get("guidance") or "",
                "lkps_needed": bool(n.get("lkps_needed")), "lkps_list": n.get("lkps_list") or [],
                "subbab": _to_subbab(n["id"]),
            }
            for i, n in enumerate(by_parent.get(parent_id, []), start=1)
        ]

    bab_list = [
        {"order": i, "title": n["title"], "guidance": n.get("guidance"), "subbab": _to_subbab(n["id"])}
        for i, n in enumerate(by_parent.get(None, []), start=1)
    ]

    count = replace_chapter_templates_for_guide(tenant_id, guide_id, bab_list)

    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """UPDATE guide_references
               SET structure_staging = NULL, structure_parse_status = 'SIAP'
               WHERE id = %s""",
            (guide_id,),
        )
    return count
