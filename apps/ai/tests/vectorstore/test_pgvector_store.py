"""Integration tests for vectorstore.pgvector_store — real local Postgres,
SentenceTransformer mocked out (deterministic fake vectors) so tests don't
need a model download. The property under test is the SQL: tenant/document
isolation, re-index replacing (not duplicating) a document's chunks, and
nearest-neighbor ordering — none of that depends on real embeddings.
"""

from __future__ import annotations

import os
import uuid
from unittest.mock import MagicMock

import numpy as np
import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"), reason="DATABASE_URL not set"
)


class _FakeModel:
    """encode() returns a fixed vector per input text, keyed by a marker
    embedded in the text itself — so distance ordering is predictable."""

    def encode(self, texts, show_progress_bar=False):
        return np.array([_vector_for(t) for t in texts], dtype="float32")


def _vector_for(text: str) -> list[float]:
    # Distinct near-orthogonal-ish directions per marker, deterministic.
    base = [0.0] * 384
    marker = abs(hash(text)) % 384
    base[marker] = 1.0
    return base


@pytest.fixture(autouse=True)
def fake_model(monkeypatch):
    import vectorstore.pgvector_store as pv

    monkeypatch.setattr(pv, "_get_model", lambda: _FakeModel())
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
    """Insert two throwaway tenants (each with their own dokumen), clean up after."""
    ids = {}
    with conn.cursor() as cur:
        for label in ("a", "b"):
            tenant_id = f"test-tenant-{label}-{uuid.uuid4().hex[:8]}"
            program_studi_id = f"test-prodi-{label}-{uuid.uuid4().hex[:8]}"
            dokumen_id = f"test-dok-{label}-{uuid.uuid4().hex[:8]}"
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
                """
                INSERT INTO writing_led_documents (id, study_program_id, title, academic_year, overall_status)
                VALUES (%s, %s, %s, %s, 'DRAFT')
                """,
                (dokumen_id, program_studi_id, "Test LED", "2026/2027"),
            )
            ids[label] = {
                "tenant_id": tenant_id,
                "program_studi_id": program_studi_id,
                "dokumen_id": dokumen_id,
            }

    yield ids

    with conn.cursor() as cur:
        for label in ("a", "b"):
            # led_chunk_embeddings -> dokumen_led is ON DELETE RESTRICT (same
            # pattern as the rest of this schema), so tests' own rows must
            # go first.
            cur.execute("DELETE FROM writing_led_chunk_embeddings WHERE document_id = %s", (ids[label]["dokumen_id"],))
            cur.execute("DELETE FROM writing_led_documents WHERE id = %s", (ids[label]["dokumen_id"],))
            cur.execute("DELETE FROM org_study_programs WHERE id = %s", (ids[label]["program_studi_id"],))
            cur.execute("DELETE FROM org_tenants WHERE id = %s", (ids[label]["tenant_id"],))


def _chunk(chunk_id, text):
    from ingestion.led_chunker import LEDChunk

    return LEDChunk(
        chunk_id=chunk_id,
        text=text,
        page_start=1,
        page_end=1,
        para_start=-1,
        para_end=-1,
        section_heading="Visi",
        char_start=0,
    )


def test_search_is_scoped_per_tenant_and_document(fixture_ids):
    from vectorstore.pgvector_store import index_led_chunks, search_led

    a, b = fixture_ids["a"], fixture_ids["b"]
    index_led_chunks([_chunk("c1", "tenant a chunk")], a["tenant_id"], a["dokumen_id"])
    index_led_chunks([_chunk("c1", "tenant b chunk")], b["tenant_id"], b["dokumen_id"])

    results_a = search_led("tenant a chunk", a["tenant_id"], a["dokumen_id"])
    assert len(results_a) == 1
    assert results_a[0]["text"] == "tenant a chunk"

    # Same chunk_id exists for tenant b too, but querying tenant a's scope
    # must never surface tenant b's row.
    results_wrong_tenant = search_led("tenant a chunk", b["tenant_id"], a["dokumen_id"])
    assert results_wrong_tenant == []


def test_search_returns_empty_for_never_indexed_document(fixture_ids):
    from vectorstore.pgvector_store import search_led

    a = fixture_ids["a"]
    assert search_led("anything", a["tenant_id"], a["dokumen_id"]) == []


def test_reindex_replaces_not_duplicates(fixture_ids):
    from vectorstore.pgvector_store import index_led_chunks, search_led

    a = fixture_ids["a"]
    index_led_chunks([_chunk("c1", "first version")], a["tenant_id"], a["dokumen_id"])
    index_led_chunks([_chunk("c1", "second version")], a["tenant_id"], a["dokumen_id"])

    results = search_led("second version", a["tenant_id"], a["dokumen_id"], n_results=10)
    assert len(results) == 1, "re-indexing must replace the document's chunks, not append"
    assert results[0]["text"] == "second version"


def test_reindex_does_not_touch_other_documents(fixture_ids):
    """Regression test for the exact ChromaDB bug this replaces: deleting
    one document's rows must never delete another document's rows."""
    from vectorstore.pgvector_store import index_led_chunks, search_led

    a, b = fixture_ids["a"], fixture_ids["b"]
    index_led_chunks([_chunk("c1", "doc a chunk")], a["tenant_id"], a["dokumen_id"])
    index_led_chunks([_chunk("c1", "doc b chunk")], b["tenant_id"], b["dokumen_id"])

    # Re-index doc a only.
    index_led_chunks([_chunk("c1", "doc a chunk v2")], a["tenant_id"], a["dokumen_id"])

    results_b = search_led("doc b chunk", b["tenant_id"], b["dokumen_id"])
    assert len(results_b) == 1
    assert results_b[0]["text"] == "doc b chunk"


def test_search_orders_by_similarity(fixture_ids):
    from vectorstore.pgvector_store import index_led_chunks, search_led

    a = fixture_ids["a"]
    index_led_chunks(
        [_chunk("near", "query text"), _chunk("far", "totally unrelated marker")],
        a["tenant_id"],
        a["dokumen_id"],
    )

    results = search_led("query text", a["tenant_id"], a["dokumen_id"], n_results=2)
    assert results[0]["chunk_id"] == "near"
    assert results[0]["distance"] < results[1]["distance"]
