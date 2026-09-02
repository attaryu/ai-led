"""Integration tests for db.postgres_client — real local Postgres (the same
one apps/backend uses), not mocked. Mocking psycopg2 would only prove we
called .execute() with *some* string; the property that actually matters
here (tenant isolation, upsert-on-conflict, cascade delete) only means
something against a real database with real FK constraints.

Skips if DATABASE_URL isn't set or the DB isn't reachable — same fallback
pattern as tests/ingestion/test_led_chunker.py's SentenceTransformer skip.
"""

from __future__ import annotations

import os
import uuid

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"), reason="DATABASE_URL not set"
)


@pytest.fixture()
def conn():
    import db.connection as conn_mod

    conn_mod._conn = None
    try:
        c = conn_mod.get_conn()
    except Exception as exc:
        pytest.skip(f"Postgres unavailable: {exc}")
    yield c
    conn_mod._conn = None


@pytest.fixture()
def fixture_ids(conn):
    """Insert a throwaway tenant/program-studi/dokumen/user, clean up after."""
    tenant_id = f"test-tenant-{uuid.uuid4().hex[:8]}"
    program_studi_id = f"test-prodi-{uuid.uuid4().hex[:8]}"
    dokumen_id = f"test-dok-{uuid.uuid4().hex[:8]}"
    user_id = f"test-user-{uuid.uuid4().hex[:8]}"

    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO org_tenants (id, university_name) VALUES (%s, %s)",
            (tenant_id, "Test University"),
        )
        cur.execute(
            """
            INSERT INTO org_study_programs
                (id, tenant_id, name, code, level, faculty, program_head, accreditation_rank)
            VALUES (%s, %s, %s, %s, 'S1', %s, %s, 'BAIK')
            """,
            (program_studi_id, tenant_id, "Test Prodi", "TP", "Test Fakultas", "Test Ketua"),
        )
        cur.execute(
            """
            INSERT INTO writing_led_documents (id, study_program_id, title, academic_year, overall_status)
            VALUES (%s, %s, %s, %s, 'DRAFT')
            """,
            (dokumen_id, program_studi_id, "Test LED", "2026/2027"),
        )
        cur.execute(
            """
            INSERT INTO org_users (id, tenant_id, full_name, email, password_hash, role)
            VALUES (%s, %s, %s, %s, %s, 'PENJAMIN_MUTU')
            """,
            (user_id, tenant_id, "Test User", f"{user_id}@example.com", "hash"),
        )

    yield {"tenant_id": tenant_id, "dokumen_id": dokumen_id, "user_id": user_id}

    with conn.cursor() as cur:
        cur.execute("DELETE FROM org_users WHERE id = %s", (user_id,))
        cur.execute("DELETE FROM writing_led_documents WHERE id = %s", (dokumen_id,))
        cur.execute("DELETE FROM org_study_programs WHERE id = %s", (program_studi_id,))
        cur.execute("DELETE FROM org_tenants WHERE id = %s", (tenant_id,))


def test_session_lifecycle_and_upsert(fixture_ids):
    import db.postgres_client as pc

    session_id = f"test-session-{uuid.uuid4().hex[:8]}"
    try:
        pc.create_session(
            session_id,
            tenant_id=fixture_ids["tenant_id"],
            dokumen_id=fixture_ids["dokumen_id"],
            created_by_user_id=fixture_ids["user_id"],
            total_indicators=3,
        )
        sess = pc.get_session(session_id)
        assert sess is not None
        assert sess["status"] == "running"
        assert sess["total_indicators"] == 3

        pc.log_indicator_result(session_id, indicator_no=1, score=3.5, justification="j1", confidence=0.9)
        pc.log_indicator_result(
            session_id, indicator_no=1, score=4.0, justification="j1-updated", confidence=0.95,
            model="deepseek-r1:32b", sources_used={"led_chunks": [{"page": 3}], "lkps_tables": [], "evidence_documents": []},
        )
        pc.log_indicator_result(session_id, indicator_no=2, score=2.0, justification="j2", confidence=0.5)
        pc.log_reasoning_step(session_id, indicator_no=1, step_index=0, content="step0")

        assert pc.get_completed_indicator_numbers(session_id) == {1, 2}

        results = pc.get_indicator_results(session_id)
        r1 = next(r for r in results if r["indicator_no"] == 1)
        assert r1["score"] == 4.0, "upsert (ON CONFLICT) should overwrite, not duplicate"
        assert r1["justification"] == "j1-updated"
        assert r1["model"] == "deepseek-r1:32b"
        assert r1["sources_used"] == {"led_chunks": [{"page": 3}], "lkps_tables": [], "evidence_documents": []}

        pc.update_session_status(session_id, "completed", completed_indicators=2)
        sess2 = pc.get_session(session_id)
        assert sess2["status"] == "completed"
        assert sess2["completed_indicators"] == 2

        quality = {
            "scores": {"faithfulness": 0.9, "context_recall": 0.5},
            "per_indicator": [{"indicator_no": 1, "context_recall": 0.5, "faithfulness": 0.9}],
            "total_chunks": 4,
            "model": "deepseek-r1:32b",
            "finished_at": "2026-09-02T00:00:00+00:00",
        }
        pc.save_session_quality(session_id, quality)
        with pc._get_conn().cursor() as cur:
            cur.execute("SELECT kualitas FROM assessment_sessions WHERE id = %s", (session_id,))
            assert cur.fetchone()["kualitas"] == quality, "overwritten in place, not appended"

        sessions = pc.list_sessions(limit=50)
        found = next(s for s in sessions if s["session_id"] == session_id)
        assert found["avg_score"] == 3.0  # (4.0 + 2.0) / 2
    finally:
        conn = pc._get_conn()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM assessment_sessions WHERE id = %s", (session_id,))


def test_get_session_returns_none_for_unknown_id(fixture_ids):
    import db.postgres_client as pc

    assert pc.get_session("does-not-exist") is None


def test_get_completed_indicator_numbers_empty_for_unknown_session():
    import db.postgres_client as pc

    assert pc.get_completed_indicator_numbers("does-not-exist") == set()


def test_get_document_accreditation_set_none_when_unset(fixture_ids):
    import db.postgres_client as pc

    assert pc.get_document_accreditation_set(fixture_ids["dokumen_id"]) is None


def test_get_rubric_criteria_for_set(fixture_ids, conn):
    import db.postgres_client as pc

    set_id = f"test-set-{uuid.uuid4().hex[:8]}"
    criterion_id = f"test-criterion-{uuid.uuid4().hex[:8]}"
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO accreditation_sets (id, tenant_id, nama, lembaga, tahun_siklus, status, updated_at)
                VALUES (%s, %s, %s, %s, %s, 'SIAP', now())
                """,
                (set_id, fixture_ids["tenant_id"], "Test Set", "Test Lembaga", 2026),
            )
            cur.execute(
                """
                INSERT INTO rubric_criteria
                    (id, accreditation_set_id, indicator_no, criterion_code, criterion_group,
                     description, score_type, lkps_table_refs, formula, sub_score_formula)
                VALUES (%s, %s, 1, 'C1', 'Kelompok A', 'Indikator uji komposit',
                        'KOMPOSIT', %s, NULL, '((I x 2) + II) / 3')
                """,
                (criterion_id, set_id, ["Tabel 1"]),
            )
            cur.execute(
                "INSERT INTO rubric_levels (id, criterion_id, score, description) VALUES (%s, %s, 4, %s)",
                (f"{criterion_id}-lvl4", criterion_id, "Sangat baik"),
            )
            cur.execute(
                "INSERT INTO rubric_levels (id, criterion_id, score, description) VALUES (%s, %s, 0, %s)",
                (f"{criterion_id}-lvl0", criterion_id, "Tidak ada"),
            )
            cur.execute(
                "UPDATE writing_led_documents SET accreditation_set_id = %s WHERE id = %s",
                (set_id, fixture_ids["dokumen_id"]),
            )

        assert pc.get_document_accreditation_set(fixture_ids["dokumen_id"]) == set_id

        rubrics = pc.get_rubric_criteria_for_set(set_id)
        assert len(rubrics) == 1
        r = rubrics[0]
        assert r.no == 1
        assert r.kriteria == "Kelompok A"
        assert r.indikator == "Indikator uji komposit"
        # Enum comes back translated to the lowercase English vocabulary the
        # LLM prompt/tests were built against, not the Postgres KOMPOSIT literal.
        assert r.score_type == "composite"
        assert r.score_criteria == {4: "Sangat baik", 0: "Tidak ada"}
        assert r.formula is None
        assert r.sub_score_formula == "((I x 2) + II) / 3"
        assert r.lkps_table_ref == ["Tabel 1"]

        assert pc.get_rubric_criteria_for_set("does-not-exist") == []
    finally:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE writing_led_documents SET accreditation_set_id = NULL WHERE id = %s",
                (fixture_ids["dokumen_id"],),
            )
            cur.execute("DELETE FROM rubric_levels WHERE criterion_id = %s", (criterion_id,))
            cur.execute("DELETE FROM rubric_criteria WHERE id = %s", (criterion_id,))
            cur.execute("DELETE FROM accreditation_sets WHERE id = %s", (set_id,))
