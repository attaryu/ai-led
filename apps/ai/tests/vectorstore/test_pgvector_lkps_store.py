"""Integration tests for vectorstore.pgvector_lkps_store — real local
Postgres, SentenceTransformer mocked out (deterministic fake vectors), same
pattern as test_pgvector_store.py. The property under test is the SQL:
tenant/LKPS-file isolation, re-index replacing (not duplicating) an LKPS
file's chunks, and has_lkps_index.
"""

from __future__ import annotations

import os
import uuid

import numpy as np
import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"), reason="DATABASE_URL not set"
)


class _FakeModel:
    def __init__(self, dim: int = 1024):
        self.dim = dim

    def get_sentence_embedding_dimension(self):
        return self.dim

    def encode(self, texts, **kwargs):
        return np.array([_vector_for(t, self.dim) for t in texts], dtype="float32")


def _vector_for(text: str, dim: int = 1024) -> list[float]:
    base = [0.0] * dim
    marker = abs(hash(text)) % dim
    base[marker] = 1.0
    return base


@pytest.fixture(autouse=True)
def fake_model(monkeypatch):
    import vectorstore.pgvector_store as pv

    # ponytail: MiniLM (384-d) dihapus -- AMI_EMBED_MODEL kini sama dengan bge-m3, jadi
    # kondisi lama `384 if name == pv.AMI_EMBED_MODEL` membuat SEMUA vektor tiruan 384-d.
    # Satu model, satu dimensi: 1024.
    # monkeypatch.setattr(pv, "_get_model", lambda name=pv._EMBED_MODEL: _FakeModel(384 if name == pv.AMI_EMBED_MODEL else 1024))
    monkeypatch.setattr(pv, "_get_model", lambda name=pv._EMBED_MODEL: _FakeModel(1024))
    yield


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
    """Insert two throwaway tenants (each with their own LKPS file), clean up after."""
    ids = {}
    with conn.cursor() as cur:
        for label in ("a", "b"):
            tenant_id = f"test-tenant-{label}-{uuid.uuid4().hex[:8]}"
            program_studi_id = f"test-prodi-{label}-{uuid.uuid4().hex[:8]}"
            user_id = f"test-user-{label}-{uuid.uuid4().hex[:8]}"
            lkps_id = f"test-lkps-{label}-{uuid.uuid4().hex[:8]}"
            cur.execute(
                "INSERT INTO org_tenants (id, university_name) VALUES (%s, %s)",
                (tenant_id, f"Test University {label}"),
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
                """INSERT INTO org_users (id, tenant_id, full_name, email, password_hash, role)
                   VALUES (%s, %s, 'Test', %s, 'x', 'PENYUSUN')""",
                (user_id, tenant_id, f"{user_id}@test.local"),
            )
            cur.execute(
                """
                INSERT INTO evidence_files
                    (id, owner_type, kind, tenant_id, study_program_id, document_name, file_url, file_type,
                     size_bytes, extraction_status, uploaded_by_user_id, uploaded_by_name)
                VALUES (%s, 'PROGRAM_STUDI', 'LKPS', %s, %s, 'lkps.xlsx', %s, 'xlsx', 1, 'SIAP', %s, 'Test')
                """,
                (lkps_id, tenant_id, program_studi_id, f"{tenant_id}/lkps.xlsx", user_id),
            )
            ids[label] = {
                "tenant_id": tenant_id,
                "program_studi_id": program_studi_id,
                "user_id": user_id,
                "lkps_id": lkps_id,
            }

    yield ids

    with conn.cursor() as cur:
        for label in ("a", "b"):
            cur.execute("DELETE FROM lkps_chunk_embeddings WHERE evidence_id = %s", (ids[label]["lkps_id"],))
            cur.execute("DELETE FROM evidence_files WHERE id = %s", (ids[label]["lkps_id"],))
            cur.execute("DELETE FROM org_users WHERE id = %s", (ids[label]["user_id"],))
            cur.execute("DELETE FROM org_study_programs WHERE id = %s", (ids[label]["program_studi_id"],))
            cur.execute("DELETE FROM org_tenants WHERE id = %s", (ids[label]["tenant_id"],))


def _chunk(chunk_id, sheet, text):
    return {"chunk_id": chunk_id, "sheet": sheet, "text": text}


def test_search_is_scoped_per_tenant_and_lkps_file(fixture_ids):
    from vectorstore.pgvector_lkps_store import index_lkps_chunks, search_lkps

    a, b = fixture_ids["a"], fixture_ids["b"]
    index_lkps_chunks([_chunk("4a", "4a", "tenant a chunk")], a["tenant_id"], a["lkps_id"])
    index_lkps_chunks([_chunk("4a", "4a", "tenant b chunk")], b["tenant_id"], b["lkps_id"])

    results_a = search_lkps("tenant a chunk", a["tenant_id"], a["lkps_id"])
    assert len(results_a) == 1
    assert results_a[0]["text"] == "tenant a chunk"
    assert results_a[0]["sheet"] == "4a"

    # Same chunk_id exists for tenant b too, but querying tenant a's scope
    # must never surface tenant b's row.
    results_wrong_tenant = search_lkps("tenant a chunk", b["tenant_id"], a["lkps_id"])
    assert results_wrong_tenant == []


def test_search_returns_empty_for_never_indexed_document(fixture_ids):
    from vectorstore.pgvector_lkps_store import search_lkps

    a = fixture_ids["a"]
    assert search_lkps("anything", a["tenant_id"], a["lkps_id"]) == []


def test_has_lkps_index_reflects_indexing_state(fixture_ids):
    from vectorstore.pgvector_lkps_store import has_lkps_index, index_lkps_chunks

    a = fixture_ids["a"]
    assert has_lkps_index(a["tenant_id"], a["lkps_id"]) is False

    index_lkps_chunks([_chunk("4a", "4a", "some text")], a["tenant_id"], a["lkps_id"])
    assert has_lkps_index(a["tenant_id"], a["lkps_id"]) is True


def test_reindex_replaces_not_duplicates(fixture_ids):
    from vectorstore.pgvector_lkps_store import index_lkps_chunks, search_lkps

    a = fixture_ids["a"]
    index_lkps_chunks([_chunk("4a", "4a", "first version")], a["tenant_id"], a["lkps_id"])
    index_lkps_chunks([_chunk("4a", "4a", "second version")], a["tenant_id"], a["lkps_id"])

    results = search_lkps("second version", a["tenant_id"], a["lkps_id"], n_results=10)
    assert len(results) == 1
    assert results[0]["text"] == "second version"


def test_lookup_lkps_by_sheets_matches_by_normalized_prefix(fixture_ids):
    """Port of Dimas 140d8ae: a pedoman citing a parent token ("2a") must
    also pull in Excel sub-sheets that split it further ("2a.1"/"2a.2") --
    prefix match on the normalized sheet name, no similarity search."""
    from vectorstore.pgvector_lkps_store import index_lkps_chunks, lookup_lkps_by_sheets

    a = fixture_ids["a"]
    index_lkps_chunks(
        [
            _chunk("2a.1", "2a.1", "kerja sama internasional"),
            _chunk("2a.2", "2a.2", "kerja sama nasional"),
            _chunk("6b", "6b", "jumlah mahasiswa"),
        ],
        a["tenant_id"], a["lkps_id"],
    )

    hits = lookup_lkps_by_sheets(a["tenant_id"], a["lkps_id"], ["2a"])
    assert {h["sheet"] for h in hits} == {"2a.1", "2a.2"}


def test_lookup_lkps_by_sheets_scoped_per_tenant_and_lkps_file(fixture_ids):
    from vectorstore.pgvector_lkps_store import index_lkps_chunks, lookup_lkps_by_sheets

    a, b = fixture_ids["a"], fixture_ids["b"]
    index_lkps_chunks([_chunk("4a", "4a", "tenant a chunk")], a["tenant_id"], a["lkps_id"])

    assert lookup_lkps_by_sheets(b["tenant_id"], a["lkps_id"], ["4a"]) == []
    assert lookup_lkps_by_sheets(a["tenant_id"], a["lkps_id"], ["4a"])[0]["text"] == "tenant a chunk"


def test_lookup_lkps_by_sheets_empty_tokens_returns_empty(fixture_ids):
    from vectorstore.pgvector_lkps_store import lookup_lkps_by_sheets

    a = fixture_ids["a"]
    assert lookup_lkps_by_sheets(a["tenant_id"], a["lkps_id"], []) == []
