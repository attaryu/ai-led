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
import os
import threading
import uuid
import weakref
from contextlib import contextmanager

import psycopg2.extras
from pgvector.psycopg2 import register_vector

from db.connection import tenant_connection
from ingestion.led_chunker import LEDChunk

logger = logging.getLogger(__name__)

# Port of Dimas 140d8ae (api/lib/retrieval.py): BAAI/bge-m3 -- multilingual, 1024-d, 8192-token
# context, normalised vectors (the LKPS/evidence distance thresholds in worker.py are tuned on it).
# MiniLM (384-d) only saw the first 128 tokens of a chunk. Writing (dimas) columns `embedding` use it.
_EMBED_MODEL = os.environ.get("EMBEDDING_MODEL", "BAAI/bge-m3")
# ponytail: MiniLM DIHAPUS -- seluruh sistem kini satu model embedding (bge-m3).
# Alasannya terukur: MiniLM max_seq_length = 128 token (~600 karakter Indonesia,
# rasio 4,8 char/token), jadi pada chunk evidence rerata 2306 karakter hanya
# ~30% bagian awal yang terwakili di vektornya -- dibuktikan dengan cosine
# 1.000000 antara vektor teks penuh dan teks yang dipotong manual di 128 token.
# AMI_EMBED_MODEL diarahkan ke _EMBED_MODEL supaya pemanggil lama tidak pecah;
# baris lamanya dibiarkan sebagai jejak.
# AMI_EMBED_MODEL = os.environ.get("AMI_EMBEDDING_MODEL", "paraphrase-multilingual-MiniLM-L12-v2")
AMI_EMBED_MODEL = _EMBED_MODEL
_EMBED_BATCH = 8
# Chunks longer than this are embedded alone (batch of 1): a single 10-16k char chunk batched with others can OOM.
_LONG_CHUNK_CHARS = 4000

_models: dict = {}
_model_lock = threading.Lock()
# Pooled connections are handed out (and reused) across calls -- track which
# underlying connection objects already have the vector type adapter
# registered so a pool of N connections only pays register_vector() once
# each, not once per checkout. WeakSet so a closed/evicted connection drops
# out on its own instead of pinning it alive.
_vector_registered: "weakref.WeakSet" = weakref.WeakSet()


def _get_model(name: str = _EMBED_MODEL):
    """Lazy singleton per model name — loaded on first use, not at import time."""
    if name not in _models:
        with _model_lock:
            if name not in _models:
                from sentence_transformers import SentenceTransformer

                _models[name] = SentenceTransformer(name)
    return _models[name]


def embed_documents(texts: list[str], model_name: str = _EMBED_MODEL):
    """Embed texts in small batches (port of Dimas's _batched_embed), long chunks isolated. Returns an (n, dim) array."""
    import numpy as np

    model = _get_model(model_name)
    out = []
    i = 0
    while i < len(texts):
        if len(texts[i]) > _LONG_CHUNK_CHARS:
            group = [texts[i]]
            i += 1
        else:
            group = []
            while i < len(texts) and len(texts[i]) <= _LONG_CHUNK_CHARS and len(group) < _EMBED_BATCH:
                group.append(texts[i])
                i += 1
        out.append(model.encode(group, normalize_embeddings=True, batch_size=_EMBED_BATCH, show_progress_bar=False))
    return np.vstack(out) if out else np.empty((0, model.get_sentence_embedding_dimension()), dtype="float32")


def embed_query(query: str):
    return embed_documents([query])[0]


def embed_documents_ami(texts: list[str]):
    """DEPRECATED -- alias ke embed_documents (bge-m3). Dulu memakai MiniLM 384-d
    ke kolom `embedding_ami`; kolom itu sudah di-DROP. Dibiarkan sebagai alias
    supaya pemanggil lama (eval/ragas_eval.py, scripts/) tidak pecah."""
    # return embed_documents(texts, AMI_EMBED_MODEL)
    return embed_documents(texts)


def embed_query_ami(query: str):
    return embed_documents_ami([query])[0]


@contextmanager
def _cursor(tenant_id: str):
    """tenant_connection, but also registers the pgvector type adapter on
    the checked-out connection before handing back a cursor."""
    with tenant_connection(tenant_id) as conn:
        if conn not in _vector_registered:
            register_vector(conn)
            _vector_registered.add(conn)
        with conn.cursor() as cur:
            yield cur


def index_led_chunks(chunks: list[LEDChunk], tenant_id: str, dokumen_id: str) -> None:
    """Index one document's chunks (replaces any prior chunks for the same
    (tenant_id, dokumen_id) — deletes only that document's rows, not the
    whole table).

    Columns per chunk: tenant_id, dokumen_id, page_start, page_end,
    para_start, para_end, section_heading, char_start. page_start/page_end
    are -1 for docx chunks; para_start/para_end are -1 for pdf chunks.
    """
    import time

    with _cursor(tenant_id) as cur:
        cur.execute(
            "DELETE FROM writing_led_chunk_embeddings WHERE tenant_id = %s AND document_id = %s",
            (tenant_id, dokumen_id),
        )

    total = len(chunks)
    if total == 0:
        return

    # The LED index is read only by the AMI assessment -> ariel's model, `embedding_ami` column.
    t0 = time.time()
    embeddings = embed_documents_ami([c.text for c in chunks])
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

    with _cursor(tenant_id) as cur:
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
    with _cursor(tenant_id) as cur:
        cur.execute(
            "SELECT COUNT(*) FROM writing_led_chunk_embeddings WHERE tenant_id = %s AND document_id = %s",
            (tenant_id, dokumen_id),
        )
        return cur.fetchone()["count"]


EDITOR_CHUNK_PREFIX = "editor-"


def led_index_is_from_file(tenant_id: str, dokumen_id: str) -> bool:
    """True when this document's LED index exists and came from an uploaded file,
    not from Editor content (chunk_id prefixed EDITOR_CHUNK_PREFIX)."""
    with _cursor(tenant_id) as cur:
        cur.execute(
            "SELECT bool_and(chunk_id NOT LIKE %s AND embedding IS NOT NULL) AS ok FROM writing_led_chunk_embeddings "
            "WHERE tenant_id = %s AND document_id = %s",
            (EDITOR_CHUNK_PREFIX + "%", tenant_id, dokumen_id),
        )
        return bool(cur.fetchone()["ok"])


def led_index_matches_editor(tenant_id: str, dokumen_id: str, chunks: list[LEDChunk]) -> bool:
    """True when the stored index is already these Editor chunks (same text/heading, same order),
    so an unchanged Editor needs no re-embedding."""
    with _cursor(tenant_id) as cur:
        cur.execute(
            "SELECT chunk_id, text, section_heading, embedding IS NOT NULL AS embedded FROM writing_led_chunk_embeddings "
            "WHERE tenant_id = %s AND document_id = %s ORDER BY char_start",
            (tenant_id, dokumen_id),
        )
        rows = cur.fetchall()
    # Rows indexed before the embedding column was filled are unsearchable -> re-index.
    return all(r["chunk_id"].startswith(EDITOR_CHUNK_PREFIX) and r["embedded"] for r in rows) and [
        (r["text"], r["section_heading"] or "") for r in rows
    ] == [(c.text, c.section_heading or "") for c in chunks]


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
    # ponytail: embed_query_ami kini alias bge-m3; dipanggil langsung agar jelas.
    # query_embedding = embed_query_ami(query)
    query_embedding = embed_query(query)

    with _cursor(tenant_id) as cur:
        cur.execute(
            """
            SELECT chunk_id, text, page_start, page_end, para_start, para_end,
                   section_heading, char_start, embedding <=> %s AS distance
            FROM writing_led_chunk_embeddings
            WHERE tenant_id = %s AND document_id = %s AND embedding IS NOT NULL
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
