"""Tests for vectorstore.document_registry_store.

Cutoff/dedup logic (search_document_registry_candidates) is pure Python on
top of search_document_registry, so it's tested by monkeypatching that
function directly -- no DB or model needed, always runs. Upsert and tenant
scoping need real SQL, so those follow test_pgvector_store.py's pattern:
real local Postgres (skipif DATABASE_URL unset), SentenceTransformer mocked
out with deterministic fake vectors.
"""

from __future__ import annotations

import os
import uuid

import numpy as np
import pytest


# ---------------------------------------------------------------------
# search_document_registry_candidates: pure logic, no DB/model needed.
# ---------------------------------------------------------------------


def test_candidates_excludes_results_over_max_distance(monkeypatch):
    import vectorstore.document_registry_store as reg

    def fake_search(query, tenant_id, study_program_id, k=5):
        return [
            {"folder_id": "f-near", "label": "Near", "distance": 0.2},
            {"folder_id": "f-far", "label": "Far", "distance": 0.9},
        ]

    monkeypatch.setattr(reg, "search_document_registry", fake_search)
    result = reg.search_document_registry_candidates(["q"], "t1", None, max_distance=0.5)

    assert [r["folder_id"] for r in result] == ["f-near"]


def test_candidates_dedups_by_folder_id_first_occurrence_wins(monkeypatch):
    import vectorstore.document_registry_store as reg

    def fake_search(query, tenant_id, study_program_id, k=5):
        if query == "q1":
            return [{"folder_id": "f1", "label": "F1", "distance": 0.3}]
        return [
            {"folder_id": "f1", "label": "F1", "distance": 0.1},
            {"folder_id": "f2", "label": "F2", "distance": 0.4},
        ]

    monkeypatch.setattr(reg, "search_document_registry", fake_search)
    result = reg.search_document_registry_candidates(["q1", "q2"], "t1", None)

    assert {r["folder_id"] for r in result} == {"f1", "f2"}
    f1 = next(r for r in result if r["folder_id"] == "f1")
    assert f1["matched_query"] == "q1"
    assert f1["distance"] == 0.3


# ---------------------------------------------------------------------
# index/search: real Postgres, model mocked.
# ---------------------------------------------------------------------

pytestmark_db = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"), reason="DATABASE_URL not set"
)


class _FakeModel:
    """encode() returns a fixed vector per input text, keyed by a marker
    hashed from the text -- deterministic, no model download needed."""

    def encode(self, texts, normalize_embeddings=True, show_progress_bar=False):
        return np.array([_vector_for(t) for t in texts], dtype="float32")


def _vector_for(text: str) -> list[float]:
    base = [0.0] * 1024
    marker = abs(hash(text)) % 1024
    base[marker] = 1.0
    return base


@pytest.fixture(autouse=True)
def fake_model(monkeypatch):
    import vectorstore.document_registry_store as reg

    monkeypatch.setattr(reg, "_get_model", lambda: _FakeModel())
    yield


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
    """One tenant, two prodi (A/B), one user, three evidence_folders (one
    per owner_type/scope) so we can exercise TENANT-wide vs prodi-owned
    visibility the same way evidence itself is scoped."""
    tenant_id = f"test-tenant-{uuid.uuid4().hex[:8]}"
    prodi_a = f"test-prodi-a-{uuid.uuid4().hex[:8]}"
    prodi_b = f"test-prodi-b-{uuid.uuid4().hex[:8]}"
    user_id = f"test-user-{uuid.uuid4().hex[:8]}"
    folder_tenant = f"test-folder-tenant-{uuid.uuid4().hex[:8]}"
    folder_a = f"test-folder-a-{uuid.uuid4().hex[:8]}"
    folder_b = f"test-folder-b-{uuid.uuid4().hex[:8]}"

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
        for folder_id, owner_type, prodi_id, name in (
            (folder_tenant, "TENANT", None, "Folder Tenant"),
            (folder_a, "PROGRAM_STUDI", prodi_a, "Folder A"),
            (folder_b, "PROGRAM_STUDI", prodi_b, "Folder B"),
        ):
            cur.execute(
                """
                INSERT INTO evidence_folders
                    (id, owner_type, tenant_id, study_program_id, name,
                     created_by_user_id, created_by_name)
                VALUES (%s, %s, %s, %s, %s, %s, 'Test User')
                """,
                (folder_id, owner_type, tenant_id, prodi_id, name, user_id),
            )

    yield {
        "tenant_id": tenant_id,
        "prodi_a": prodi_a,
        "prodi_b": prodi_b,
        "folder_tenant": folder_tenant,
        "folder_a": folder_a,
        "folder_b": folder_b,
    }

    with conn.cursor() as cur:
        cur.execute("DELETE FROM document_registry WHERE tenant_id = %s", (tenant_id,))
        cur.execute("DELETE FROM evidence_folders WHERE tenant_id = %s", (tenant_id,))
        cur.execute("DELETE FROM org_study_programs WHERE tenant_id = %s", (tenant_id,))
        cur.execute("DELETE FROM org_tenants WHERE id = %s", (tenant_id,))


@pytestmark_db
def test_reindex_same_folder_updates_not_duplicates(fixture_ids):
    from vectorstore.document_registry_store import index_document_registry

    import db.connection as conn_mod

    f = fixture_ids
    index_document_registry(f["folder_tenant"], f["tenant_id"], None, "TENANT", "Laporan Awal")
    index_document_registry(f["folder_tenant"], f["tenant_id"], None, "TENANT", "Laporan Direvisi")

    with conn_mod.get_conn().cursor() as cur:
        cur.execute("SELECT label FROM document_registry WHERE folder_id = %s", (f["folder_tenant"],))
        rows = cur.fetchall()

    assert len(rows) == 1
    assert rows[0]["label"] == "Laporan Direvisi"


@pytestmark_db
def test_search_scoped_to_prodi_sees_tenant_wide_and_own_folder_only(fixture_ids):
    from vectorstore.document_registry_store import index_document_registry, search_document_registry

    f = fixture_ids
    index_document_registry(f["folder_tenant"], f["tenant_id"], None, "TENANT", "Folder Tenant")
    index_document_registry(f["folder_a"], f["tenant_id"], f["prodi_a"], "PROGRAM_STUDI", "Folder A")
    index_document_registry(f["folder_b"], f["tenant_id"], f["prodi_b"], "PROGRAM_STUDI", "Folder B")

    results = search_document_registry("apapun", f["tenant_id"], f["prodi_a"], k=10)
    ids = {r["folder_id"] for r in results}

    assert ids == {f["folder_tenant"], f["folder_a"]}


@pytestmark_db
def test_search_no_prodi_in_context_sees_every_folder_in_tenant(fixture_ids):
    from vectorstore.document_registry_store import index_document_registry, search_document_registry

    f = fixture_ids
    index_document_registry(f["folder_tenant"], f["tenant_id"], None, "TENANT", "Folder Tenant")
    index_document_registry(f["folder_a"], f["tenant_id"], f["prodi_a"], "PROGRAM_STUDI", "Folder A")
    index_document_registry(f["folder_b"], f["tenant_id"], f["prodi_b"], "PROGRAM_STUDI", "Folder B")

    results = search_document_registry("apapun", f["tenant_id"], None, k=10)
    ids = {r["folder_id"] for r in results}

    assert ids == {f["folder_tenant"], f["folder_a"], f["folder_b"]}
