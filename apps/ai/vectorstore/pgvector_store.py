"""
pgvector-backed store for LED chunks (packages/db/prisma/schema.prisma's
LedChunkEmbedding, table led_chunk_embeddings) — replaces vectorstore/
chroma_store.py's per-(tenant_id, dokumen_id) ChromaDB collection scheme.

Isolation is now a plain `WHERE tenant_id = ... AND dokumen_id = ...`, same
mechanism as every other table in this system, instead of a second,
separately-reasoned-about isolation scheme (Chroma's collection-per-document
naming/hashing). Same multilingual SentenceTransformer embedding model as
before, unchanged.
"""

from __future__ import annotations

import logging
import threading
import uuid

import psycopg2.extras
from pgvector.psycopg2 import register_vector

from db.connection import get_conn
from ingestion.led_chunker import LEDChunk

logger = logging.getLogger(__name__)

# Multilingual model that supports Bahasa Indonesia — same as chroma_store.py.
_EMBED_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"

_model = None
_model_lock = threading.Lock()
_vector_registered = False


def _get_model():
    """Lazy singleton — loaded on first use, not at import time."""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from sentence_transformers import SentenceTransformer

                _model = SentenceTransformer(_EMBED_MODEL)
    return _model


def _conn():
    """Shared connection with the pgvector type adapter registered on it."""
    global _vector_registered
    conn = get_conn()
    if not _vector_registered:
        register_vector(conn)
        _vector_registered = True
    return conn


def index_led_chunks(chunks: list[LEDChunk], tenant_id: str, dokumen_id: str) -> None:
    """Index one document's chunks (replaces any prior chunks for the same
    (tenant_id, dokumen_id) — deletes only that document's rows, not the
    whole table).

    Columns per chunk: tenant_id, dokumen_id, page_start, page_end,
    para_start, para_end, section_heading, char_start. page_start/page_end
    are -1 for docx chunks; para_start/para_end are -1 for pdf chunks.
    """
    import time

    conn = _conn()
    model = _get_model()

    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM writing_led_chunk_embeddings WHERE tenant_id = %s AND document_id = %s",
            (tenant_id, dokumen_id),
        )

    total = len(chunks)
    if total == 0:
        return

    logger.info("Loading embedding model (first run downloads ~118MB)…")
    t0 = time.time()
    embeddings = model.encode([c.text for c in chunks], show_progress_bar=False)
    logger.info("Embedded %d chunks in %.1fs", total, time.time() - t0)

    rows = [
        (
            str(uuid.uuid4()),
            tenant_id,
            dokumen_id,
            c.chunk_id,
            c.text,
            embeddings[i],
            c.page_start,
            c.page_end,
            c.para_start,
            c.para_end,
            c.section_heading or "",
            c.char_start,
        )
        for i, c in enumerate(chunks)
    ]

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO writing_led_chunk_embeddings
                (id, tenant_id, document_id, chunk_id, text, embedding,
                 page_start, page_end, para_start, para_end, section_heading, char_start)
            VALUES %s
            """,
            rows,
        )

    logger.info(
        "LED indexing finished for tenant=%s dokumen=%s: %d chunks",
        tenant_id,
        dokumen_id,
        total,
    )


def get_led_chunk_count(tenant_id: str, dokumen_id: str) -> int:
    """Chunks already indexed for this document — used to recover led_index_state after a restart."""
    with _conn().cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM writing_led_chunk_embeddings WHERE tenant_id = %s AND document_id = %s",
            (tenant_id, dokumen_id),
        )
        return cur.fetchone()["count"]


def search_led(
    query: str,
    tenant_id: str,
    dokumen_id: str,
    n_results: int = 5,
) -> list[dict]:
    """Search one document's LED chunks by semantic similarity.

    Returns [{text, chunk_id, metadata, distance}], or [] if this document
    was never indexed (not an error — just not ready yet).
    """
    conn = _conn()
    model = _get_model()
    query_embedding = model.encode([query], show_progress_bar=False)[0]

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT chunk_id, text, page_start, page_end, para_start, para_end,
                   section_heading, char_start, embedding <=> %s AS distance
            FROM writing_led_chunk_embeddings
            WHERE tenant_id = %s AND document_id = %s
            ORDER BY embedding <=> %s
            LIMIT %s
            """,
            (query_embedding, tenant_id, dokumen_id, query_embedding, n_results),
        )
        rows = cur.fetchall()

    return [
        {
            "text": row["text"],
            "chunk_id": row["chunk_id"],
            "metadata": {
                "tenant_id": tenant_id,
                "dokumen_id": dokumen_id,
                "page_start": row["page_start"],
                "page_end": row["page_end"],
                "para_start": row["para_start"],
                "para_end": row["para_end"],
                "section_heading": row["section_heading"],
                "char_start": row["char_start"],
            },
            "distance": float(row["distance"]),
        }
        for row in rows
    ]
