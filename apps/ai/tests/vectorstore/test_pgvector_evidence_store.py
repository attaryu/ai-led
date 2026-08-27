"""Integration tests for vectorstore.pgvector_evidence_store — real local
Postgres. Covers list_available_evidence_ids (the scoping query
search_evidence_documents depends on): tenant-wide evidence must be visible
to every prodi, prodi-owned evidence must stay scoped to that prodi.
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
    """One tenant, two prodi (A/B), one uploader, and three evidence rows:
    tenant-wide, prodi A's own, and prodi B's own."""
    tenant_id = f"test-tenant-{uuid.uuid4().hex[:8]}"
    prodi_a = f"test-prodi-a-{uuid.uuid4().hex[:8]}"
    prodi_b = f"test-prodi-b-{uuid.uuid4().hex[:8]}"
    user_id = f"test-user-{uuid.uuid4().hex[:8]}"
    ev_tenant = f"test-ev-tenant-{uuid.uuid4().hex[:8]}"
    ev_a = f"test-ev-a-{uuid.uuid4().hex[:8]}"
    ev_b = f"test-ev-b-{uuid.uuid4().hex[:8]}"

    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO org_tenants (id, university_name) VALUES (%s, %s)",
            (tenant_id, "Test University"),
        )
        for prodi_id, label in ((prodi_a, "A"), (prodi_b, "B")):
            cur.execute(
                """
                INSERT INTO org_study_programs
                    (id, tenant_id, name, code, level, faculty, program_head, accreditation_rank)
                VALUES (%s, %s, %s, %s, 'S1', %s, %s, 'BAIK')
                """,
                (prodi_id, tenant_id, f"Prodi {label}", f"P{label}", "Fakultas Test", "Ketua Test"),
            )
        cur.execute(
            """
            INSERT INTO org_users (id, tenant_id, full_name, email, password_hash, role)
            VALUES (%s, %s, %s, %s, 'x', 'PENJAMIN_MUTU')
            """,
            (user_id, tenant_id, "Uploader Test", f"{user_id}@test.local"),
        )
        for ev_id, owner_type, prodi_id in (
            (ev_tenant, "TENANT", None),
            (ev_a, "PROGRAM_STUDI", prodi_a),
            (ev_b, "PROGRAM_STUDI", prodi_b),
        ):
            cur.execute(
                """
                INSERT INTO evidence_files
                    (id, owner_type, tenant_id, study_program_id, document_name,
                     file_url, file_type, size_bytes, extraction_status,
                     uploaded_by_user_id, uploaded_by_name)
                VALUES (%s, %s, %s, %s, %s, %s, 'pdf', 100, 'SIAP', %s, 'Uploader Test')
                """,
                (ev_id, owner_type, tenant_id, prodi_id, f"doc-{ev_id}.pdf", f"key/{ev_id}.pdf", user_id),
            )

    yield {
        "tenant_id": tenant_id,
        "prodi_a": prodi_a,
        "prodi_b": prodi_b,
        "ev_tenant": ev_tenant,
        "ev_a": ev_a,
        "ev_b": ev_b,
    }

    with conn.cursor() as cur:
        cur.execute("DELETE FROM evidence_files WHERE tenant_id = %s", (tenant_id,))
        cur.execute("DELETE FROM org_users WHERE id = %s", (user_id,))
        cur.execute("DELETE FROM org_study_programs WHERE tenant_id = %s", (tenant_id,))
        cur.execute("DELETE FROM org_tenants WHERE id = %s", (tenant_id,))


def test_scoped_to_prodi_sees_tenant_wide_and_own_evidence_only(fixture_ids):
    from vectorstore.pgvector_evidence_store import list_available_evidence_ids

    ids = set(
        list_available_evidence_ids(fixture_ids["tenant_id"], fixture_ids["prodi_a"])
    )
    assert ids == {fixture_ids["ev_tenant"], fixture_ids["ev_a"]}


def test_no_prodi_in_context_sees_every_evidence_in_tenant(fixture_ids):
    from vectorstore.pgvector_evidence_store import list_available_evidence_ids

    ids = set(list_available_evidence_ids(fixture_ids["tenant_id"], None))
    assert ids == {fixture_ids["ev_tenant"], fixture_ids["ev_a"], fixture_ids["ev_b"]}
