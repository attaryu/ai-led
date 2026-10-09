"""Integration tests for vectorstore.pgvector_evidence_store — real local
Postgres. Covers list_available_evidence_ids (the scoping query
search_evidence_documents depends on): evidence must be explicitly tagged
to an indicator OF A GIVEN accreditation set (evidence_indicator_tags) to be
visible for it, hard-scoped to tenant, no fallback to a blanket tenant/prodi
search.
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

    conn_mod.reset_pool()
    try:
        pool = conn_mod._get_pool()
        c = pool.getconn()
    except Exception as exc:
        pytest.skip(f"Postgres unavailable: {exc}")
    c.autocommit = True
    yield c
    pool.putconn(c)
    conn_mod.reset_pool()


@pytest.fixture()
def fixture_ids(conn):
    """One tenant, two accreditation sets, three evidence rows: one tagged to
    indicator 1 of set A, one tagged to indicator 2 of set A, one tagged to
    indicator 1 of set B — proves indicator-scoping is per-SET, not just a
    bare indicator number (every set renumbers its own indicators from 1)."""
    tenant_id = f"test-tenant-{uuid.uuid4().hex[:8]}"
    user_id = f"test-user-{uuid.uuid4().hex[:8]}"
    set_a = f"test-set-a-{uuid.uuid4().hex[:8]}"
    set_b = f"test-set-b-{uuid.uuid4().hex[:8]}"
    ev_ind1 = f"test-ev-ind1-{uuid.uuid4().hex[:8]}"
    ev_ind2 = f"test-ev-ind2-{uuid.uuid4().hex[:8]}"
    ev_other_set = f"test-ev-other-set-{uuid.uuid4().hex[:8]}"

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
        for set_id, nama in ((set_a, "Set A"), (set_b, "Set B")):
            cur.execute(
                """
                INSERT INTO accreditation_sets (id, tenant_id, nama, lembaga, tahun_siklus, updated_at)
                VALUES (%s, %s, %s, 'Test', 2026, now())
                """,
                (set_id, tenant_id, nama),
            )
        for ev_id in (ev_ind1, ev_ind2, ev_other_set):
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
            "INSERT INTO evidence_indicator_tags (id, evidence_id, accreditation_set_id, indicator_no) VALUES (%s, %s, %s, %s)",
            (f"tag-{uuid.uuid4().hex[:8]}", ev_ind1, set_a, 1),
        )
        cur.execute(
            "INSERT INTO evidence_indicator_tags (id, evidence_id, accreditation_set_id, indicator_no) VALUES (%s, %s, %s, %s)",
            (f"tag-{uuid.uuid4().hex[:8]}", ev_ind2, set_a, 2),
        )
        # Same indicator_no (1) as ev_ind1, but a DIFFERENT set — must not collide.
        cur.execute(
            "INSERT INTO evidence_indicator_tags (id, evidence_id, accreditation_set_id, indicator_no) VALUES (%s, %s, %s, %s)",
            (f"tag-{uuid.uuid4().hex[:8]}", ev_other_set, set_b, 1),
        )

    yield {
        "tenant_id": tenant_id,
        "set_a": set_a,
        "set_b": set_b,
        "ev_ind1": ev_ind1,
        "ev_ind2": ev_ind2,
        "ev_other_set": ev_other_set,
    }

    with conn.cursor() as cur:
        cur.execute("DELETE FROM evidence_files WHERE tenant_id = %s", (tenant_id,))
        cur.execute("DELETE FROM accreditation_sets WHERE tenant_id = %s", (tenant_id,))
        cur.execute("DELETE FROM org_users WHERE id = %s", (user_id,))
        cur.execute("DELETE FROM org_tenants WHERE id = %s", (tenant_id,))


def test_scoped_to_tagged_indicator_only(fixture_ids):
    from vectorstore.pgvector_evidence_store import list_available_evidence_ids

    ids = set(
        list_available_evidence_ids(fixture_ids["tenant_id"], fixture_ids["set_a"], 1)
    )
    assert ids == {fixture_ids["ev_ind1"]}


def test_zero_tags_for_this_indicator_returns_empty_even_with_other_tagged_evidence(fixture_ids):
    """Exact regression for the blanket-scope behavior change: tenant has
    evidence tagged to indicator 2, but asking for indicator 3 (untagged)
    must come back empty — never fall back to any-evidence-in-the-tenant."""
    from vectorstore.pgvector_evidence_store import list_available_evidence_ids

    ids = list_available_evidence_ids(fixture_ids["tenant_id"], fixture_ids["set_a"], 3)
    assert ids == []


def test_same_indicator_no_in_a_different_set_does_not_leak(fixture_ids):
    """Regression for the actual bug this scoping was added for: set A and
    set B both have an indicator #1, tagged to different evidence — asking
    for set A's indicator #1 must not return set B's evidence, and vice versa."""
    from vectorstore.pgvector_evidence_store import list_available_evidence_ids

    ids_a = set(
        list_available_evidence_ids(fixture_ids["tenant_id"], fixture_ids["set_a"], 1)
    )
    ids_b = set(
        list_available_evidence_ids(fixture_ids["tenant_id"], fixture_ids["set_b"], 1)
    )
    assert ids_a == {fixture_ids["ev_ind1"]}
    assert ids_b == {fixture_ids["ev_other_set"]}


def test_prodi_filter_keeps_tenant_wide_evidence(fixture_ids):
    """study_program_id given: tenant-wide evidence (study_program_id NULL) stays visible; other prodi's would not."""
    from vectorstore.pgvector_evidence_store import list_available_evidence_ids

    ids = list_available_evidence_ids(fixture_ids["tenant_id"], fixture_ids["set_a"], 1, "prodi-lain")
    assert ids == [fixture_ids["ev_ind1"]]
