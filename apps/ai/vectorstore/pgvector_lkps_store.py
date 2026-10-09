"""pgvector-backed store for LKPS chunks -- same pattern as
pgvector_evidence_store.py, different table (lkps_chunk_embeddings), scoped per
LKPS file (evidence_id = dimas lkps_id), indexed once on upload and shared by
every document that picks it (LedDocument.lkpsEvidenceId). Imports
pgvector_store's _get_model instead of keeping its own copy -- see
pgvector_evidence_store.py's module docstring for why a separate copy per
module would double-load the same ~500MB SentenceTransformer.

Semantic search gap vs Dimas: worker.py's `_load_lkps_tables` only ever did
an exact-ref lookup (the pedoman must literally cite "(Tabel X.Y LKPS)") --
this module adds real embedding-based retrieval, same class as search_evidence,
so a checklist query that implies LKPS relevance without quoting an exact
table number can still surface something relevant.
"""

from __future__ import annotations

import logging
import uuid
import weakref
from contextlib import contextmanager

import psycopg2.extras
from pgvector.psycopg2 import register_vector

from db.connection import tenant_connection
from vectorstore.pgvector_store import embed_documents, embed_query

logger = logging.getLogger(__name__)

# See pgvector_store.py's identical helper -- one register_vector() per
# pooled connection, not per checkout.
_vector_registered: "weakref.WeakSet" = weakref.WeakSet()


@contextmanager
def _cursor(tenant_id: str):
    with tenant_connection(tenant_id) as conn:
        if conn not in _vector_registered:
            register_vector(conn)
            _vector_registered.add(conn)
        with conn.cursor() as cur:
            yield cur


def index_lkps_chunks(chunks: list[dict], tenant_id: str, evidence_id: str) -> None:
    """Index one LKPS file's chunks (replaces any prior chunks for the same
    evidence_id -- re-running INGESTION_LKPS re-indexes from scratch).
    chunks: [{chunk_id, sheet, text}, ...] (ingestion/lkps_chunker.py)."""
    import time


    with _cursor(tenant_id) as cur:
        cur.execute(
            "DELETE FROM lkps_chunk_embeddings WHERE evidence_id = %s",
            (evidence_id,),
        )

    total = len(chunks)
    if total == 0:
        return

    t0 = time.time()
    # Yang di-embed: `embed_text` (judul tabel + nama kolom) bila ada; `text` (judul +
    # seluruh nilai tabel) tetap disimpan utuh dan dikirim ke LLM.
    embeddings = embed_documents([c.get("embed_text") or c["text"] for c in chunks])
    logger.info("Embedded %d LKPS chunks in %.1fs", total, time.time() - t0)

    rows = [
        (
            str(uuid.uuid4()),
            tenant_id,
            evidence_id,
            c["chunk_id"],
            c["sheet"],
            c.get("entity"),
            c["text"],
            embeddings[i],
        )
        for i, c in enumerate(chunks)
    ]

    with _cursor(tenant_id) as cur:
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO lkps_chunk_embeddings
                (id, tenant_id, evidence_id, chunk_id, sheet, judul, text, embedding)
            VALUES %s
            """,
            rows,
        )

    logger.info(
        "LKPS indexing finished for tenant=%s lkps=%s: %d chunks",
        tenant_id,
        evidence_id,
        total,
    )


def has_lkps_index(tenant_id: str, evidence_id: str) -> bool:
    """Whether this LKPS file has been embedded yet (INGESTION_LKPS finished)."""
    with _cursor(tenant_id) as cur:
        cur.execute(
            "SELECT 1 FROM lkps_chunk_embeddings WHERE evidence_id = %s LIMIT 1",
            (evidence_id,),
        )
        return cur.fetchone() is not None


def lookup_lkps_by_sheets(
    tenant_id: str, evidence_id: str, sheet_tokens: list[str]
) -> list[dict]:
    """Direct match against lkps_chunk_embeddings.sheet -- NO similarity
    search. Port of Dimas 140d8ah's _lookup_lkps_by_sheets: when a section's
    guidance already names an explicit LKPS table (SubBabTemplate/
    ChapterSection.lkpsList, from ingestion.panduan_chunker.detect_lkps),
    a vector search is both unnecessary and less precise than a direct
    lookup.

    Matches by PREFIX (normalized), not exact -- a pedoman citing a parent
    token ("2a") can have its Excel data split into several sub-sheets
    ("2a1"/"2a2"/"2a3", e.g. per international/national/local partnership);
    prefix matching pulls in all of them. `sheet_tokens` are assumed
    already normalized (ingestion.panduan_chunker.normalize_lkps_sheet);
    the stored `sheet` column is normalized here too since it's the raw
    Excel sheet name (ingestion/lkps_chunker.py never normalizes it)."""
    from ingestion.panduan_chunker import normalize_lkps_sheet

    if not sheet_tokens:
        return []

    with _cursor(tenant_id) as cur:
        cur.execute(
            "SELECT chunk_id, sheet, judul, text FROM lkps_chunk_embeddings WHERE tenant_id = %s AND evidence_id = %s",
            (tenant_id, evidence_id),
        )
        rows = cur.fetchall()

    hits: dict[str, dict] = {}
    for row in rows:
        norm = normalize_lkps_sheet(row["sheet"])
        if any(norm.startswith(tok) for tok in sheet_tokens):
            hits[row["chunk_id"]] = {
                "chunk_id": row["chunk_id"], "sheet": row["sheet"], "judul": row["judul"], "text": row["text"],
            }
    # Beyond dimas: the reverse direction too, for tokens the workbook merges into one parent sheet
    # (pedoman cites "Tabel 6.c.1 LKPS"/"6.c.2" while the Excel has a single sheet "6c") -- otherwise a
    # section that explicitly names its table gets NO LKPS data at all.
    kurang = [tok for tok in sheet_tokens if not any(normalize_lkps_sheet(r["sheet"]).startswith(tok) for r in rows)]
    for row in rows:
        norm = normalize_lkps_sheet(row["sheet"])
        if norm and any(tok.startswith(norm) for tok in kurang):
            hits[row["chunk_id"]] = {
                "chunk_id": row["chunk_id"], "sheet": row["sheet"], "judul": row["judul"], "text": row["text"],
            }
    return list(hits.values())


def search_lkps(
    query: str,
    tenant_id: str,
    evidence_id: str,
    n_results: int = 5,
) -> list[dict]:
    """Search this LKPS file's chunks by semantic similarity.

    Returns [{text, sheet, chunk_id, distance}]."""
    query_embedding = embed_query(query)

    with _cursor(tenant_id) as cur:
        cur.execute(
            """
            SELECT chunk_id, sheet, judul, text, embedding <=> %s AS distance
            FROM lkps_chunk_embeddings
            WHERE tenant_id = %s AND evidence_id = %s
            ORDER BY embedding <=> %s
            LIMIT %s
            """,
            [query_embedding, tenant_id, evidence_id, query_embedding, n_results],
        )
        rows = cur.fetchall()

    return [
        {
            "text": row["text"],
            "sheet": row["sheet"],
            "judul": row["judul"],
            "chunk_id": row["chunk_id"],
            "distance": float(row["distance"]),
        }
        for row in rows
    ]
