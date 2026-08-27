"""Integration tests for vectorstore.pgvector_evidence_store — real local
Postgres. Covers list_available_evidence_ids (the scoping query
search_evidence_documents depends on): evidence must be explicitly tagged
to an indicator (evidence_indicator_tags) to be visible for it, hard-scoped
to tenant, no fallback to a blanket tenant/prodi search.
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
    """One tenant, one uploader, two evidence rows: one tagged to indicator 1,
    one tagged to indicator 2 — proves indicator-scoping, not just tenant."""
    tenant_id = f"test-tenant-{uuid.uuid4().hex[:8]}"
    user_id = f"test-user-{uuid.uuid4().hex[:8]}"
    ev_ind1 = f"test-ev-ind1-{uuid.uuid4().hex[:8]}"
    ev_ind2 = f"test-ev-ind2-{uuid.uuid4().hex[:8]}"

    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO org_tenants (id, university_name) VALUES (%s, %s)",
            (tenant_id, "Test University"),
        )
        cur.execute(
            """
            INSERT INTO org_users (id, tenant_id, full_name, email, password_hash, role)
            VALUES (%s, %s, %s, %s, 'x', 'PENJAMIN_MUTU')
            """,
            (user_id, tenant_id, "Uploader Test", f"{user_id}@test.local"),
        )
        for ev_id in (ev_ind1, ev_ind2):
            cur.execute(
                """
                INSERT INTO evidence_files
                    (id, owner_type, tenant_id, study_program_id, document_name,
                     file_url, file_type, size_bytes, extraction_status,
                     uploaded_by_user_id, uploaded_by_name)
                VALUES (%s, 'TENANT', %s, NULL, %s, %s, 'pdf', 100, 'SIAP', %s, 'Uploader Test')
                """,
                (ev_id, tenant_id, f"doc-{ev_id}.pdf", f"key/{ev_id}.pdf", user_id),
            )
        cur.execute(
            "INSERT INTO evidence_indicator_tags (id, evidence_id, indicator_no) VALUES (%s, %s, %s)",
            (f"tag-{uuid.uuid4().hex[:8]}", ev_ind1, 1),
        )
        cur.execute(
            "INSERT INTO evidence_indicator_tags (id, evidence_id, indicator_no) VALUES (%s, %s, %s)",
            (f"tag-{uuid.uuid4().hex[:8]}", ev_ind2, 2),
        )

    yield {
        "tenant_id": tenant_id,
        "ev_ind1": ev_ind1,
        "ev_ind2": ev_ind2,
    }

    with conn.cursor() as cur:
        cur.execute("DELETE FROM evidence_files WHERE tenant_id = %s", (tenant_id,))
        cur.execute("DELETE FROM org_users WHERE id = %s", (user_id,))
        cur.execute("DELETE FROM org_tenants WHERE id = %s", (tenant_id,))


def test_scoped_to_tagged_indicator_only(fixture_ids):
    from vectorstore.pgvector_evidence_store import list_available_evidence_ids

    ids = set(
        list_available_evidence_ids(fixture_ids["tenant_id"], 1)
    )
    assert ids == {fixture_ids["ev_ind1"]}


def test_zero_tags_for_this_indicator_returns_empty_even_with_other_tagged_evidence(fixture_ids):
    """Exact regression for the blanket-scope behavior change: tenant has
    evidence tagged to indicator 2, but asking for indicator 3 (untagged)
    must come back empty — never fall back to any-evidence-in-the-tenant."""
    from vectorstore.pgvector_evidence_store import list_available_evidence_ids

    ids = list_available_evidence_ids(fixture_ids["tenant_id"], 3)
    assert ids == []
