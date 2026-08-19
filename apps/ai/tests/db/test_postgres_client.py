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
            "INSERT INTO tenant (id, nama_universitas) VALUES (%s, %s)",
            (tenant_id, "Test University"),
        )
        cur.execute(
            """
            INSERT INTO program_studi
                (id, tenant_id, nama, kode, jenjang, fakultas, ketua_prodi, peringkat_akreditasi)
            VALUES (%s, %s, %s, %s, 'S1', %s, %s, 'BAIK')
            """,
            (program_studi_id, tenant_id, "Test Prodi", "TP", "Test Fakultas", "Test Ketua"),
        )
        cur.execute(
            """
            INSERT INTO dokumen_led (id, program_studi_id, judul, tahun_akademik, status_keseluruhan)
            VALUES (%s, %s, %s, %s, 'DRAFT')
            """,
            (dokumen_id, program_studi_id, "Test LED", "2026/2027"),
        )
        cur.execute(
            """
            INSERT INTO "user" (id, tenant_id, nama_lengkap, email, password_hash, role)
            VALUES (%s, %s, %s, %s, %s, 'PENJAMIN_MUTU')
            """,
            (user_id, tenant_id, "Test User", f"{user_id}@example.com", "hash"),
        )

    yield {"tenant_id": tenant_id, "dokumen_id": dokumen_id, "user_id": user_id}

    with conn.cursor() as cur:
        cur.execute("DELETE FROM \"user\" WHERE id = %s", (user_id,))
        cur.execute("DELETE FROM dokumen_led WHERE id = %s", (dokumen_id,))
        cur.execute("DELETE FROM program_studi WHERE id = %s", (program_studi_id,))
        cur.execute("DELETE FROM tenant WHERE id = %s", (tenant_id,))


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
        pc.log_indicator_result(session_id, indicator_no=1, score=4.0, justification="j1-updated", confidence=0.95)
        pc.log_indicator_result(session_id, indicator_no=2, score=2.0, justification="j2", confidence=0.5)
        pc.log_reasoning_step(session_id, indicator_no=1, step_index=0, content="step0")

        assert pc.get_completed_indicator_numbers(session_id) == {1, 2}

        results = pc.get_indicator_results(session_id)
        r1 = next(r for r in results if r["indicator_no"] == 1)
        assert r1["score"] == 4.0, "upsert (ON CONFLICT) should overwrite, not duplicate"
        assert r1["justification"] == "j1-updated"

        pc.update_session_status(session_id, "completed", completed_indicators=2)
        sess2 = pc.get_session(session_id)
        assert sess2["status"] == "completed"
        assert sess2["completed_indicators"] == 2

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
