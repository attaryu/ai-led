"""pgvector-backed store for Evidence chunks — same pattern as
pgvector_store.py's LED chunks, different table (evidence_chunk_embeddings)
and scope (evidence_id, not document_id). Same embedding model/singleton
so both share one loaded model, not two copies in memory.
"""

from __future__ import annotations

import logging
import threading
import uuid
import weakref
from contextlib import contextmanager

import psycopg2.extras
from pgvector.psycopg2 import register_vector

from db.connection import tenant_connection

logger = logging.getLogger(__name__)

_EMBED_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"

_model = None
_model_lock = threading.Lock()
# See pgvector_store.py's identical helper -- one register_vector() per
# pooled connection, not per checkout.
_vector_registered: "weakref.WeakSet" = weakref.WeakSet()


def _get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from sentence_transformers import SentenceTransformer

                _model = SentenceTransformer(_EMBED_MODEL)
    return _model


@contextmanager
def _cursor(tenant_id: str):
    with tenant_connection(tenant_id) as conn:
        if conn not in _vector_registered:
            register_vector(conn)
            _vector_registered.add(conn)
        with conn.cursor() as cur:
            yield cur


def index_evidence_chunks(chunks: list[dict], tenant_id: str, bukti_dukung_id: str) -> None:
    """Index one file's chunks (replaces any prior chunks for the same
    bukti_dukung_id). chunks: [{entity, text, chunk_id, confidence}, ...].
    """
    import time

    model = _get_model()

    with _cursor(tenant_id) as cur:
        cur.execute(
            "DELETE FROM evidence_chunk_embeddings WHERE evidence_id = %s",
            (bukti_dukung_id,),
        )

    total = len(chunks)
    if total == 0:
        return

    t0 = time.time()
    embeddings = model.encode([c["text"] for c in chunks], show_progress_bar=False)
    logger.info("Embedded %d evidence chunks in %.1fs", total, time.time() - t0)

    rows = [
        (
            str(uuid.uuid4()),
            tenant_id,
            bukti_dukung_id,
            c["chunk_id"],
            c["entity"],
            c["text"],
            embeddings[i],
            c.get("confidence"),
        )
        for i, c in enumerate(chunks)
    ]

    with _cursor(tenant_id) as cur:
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO evidence_chunk_embeddings
                (id, tenant_id, evidence_id, chunk_id, entity, text, embedding, confidence)
            VALUES %s
            """,
            rows,
        )

    logger.info(
        "Evidence indexing finished for tenant=%s bukti_dukung=%s: %d chunks",
        tenant_id,
        bukti_dukung_id,
        total,
    )


def list_available_evidence_ids(
    tenant_id: str, accreditation_set_id: str, indicator_no: int
) -> list[str]:
    """Evidence ids explicitly tagged to this indicator, hard-scoped to tenant
    AND accreditation_set_id (evidence_indicator_tags) -- indicator_no alone
    is ambiguous once >1 AccreditationSet exists (every set renumbers its own
    indicators from 1). Zero tags for this indicator on this tenant/set -> []
    -> caller returns immediately, no fallback to a blanket tenant/prodi search
    (matches origin/ariel's design; tenant filter is dev-v1-only, Ariel's
    prototype has no tenant concept at all).
    """
    with _cursor(tenant_id) as cur:
        cur.execute(
            """
            SELECT ef.id
            FROM evidence_files ef
            JOIN evidence_indicator_tags eit ON eit.evidence_id = ef.id
            WHERE ef.tenant_id = %s AND eit.accreditation_set_id = %s AND eit.indicator_no = %s
            """,
            (tenant_id, accreditation_set_id, indicator_no),
        )
        return [row["id"] for row in cur.fetchall()]


def search_evidence(
    query: str,
    tenant_id: str,
    bukti_dukung_ids: list[str] | None = None,
    n_results: int = 5,
) -> list[dict]:
    """Search evidence chunks by semantic similarity, scoped to a tenant and
    optionally to a specific set of bukti_dukung_ids (e.g. the evidence
    available to one program studi's generate context).

    Returns [{text, entity, chunk_id, bukti_dukung_id, confidence, distance}].
    """
    model = _get_model()
    query_embedding = model.encode([query], show_progress_bar=False)[0]

    where = ["tenant_id = %s"]
    params: list = [tenant_id]
    if bukti_dukung_ids is not None:
        if not bukti_dukung_ids:
            return []
        where.append("evidence_id = ANY(%s)")
        params.append(bukti_dukung_ids)

    with _cursor(tenant_id) as cur:
        cur.execute(
            f"""
            SELECT chunk_id, evidence_id, entity, text, confidence,
                   embedding <=> %s AS distance
            FROM evidence_chunk_embeddings
            WHERE {" AND ".join(where)}
            ORDER BY embedding <=> %s
            LIMIT %s
            """,
            [query_embedding, *params, query_embedding, n_results],
        )
        rows = cur.fetchall()

    return [
        {
            "text": row["text"],
            "entity": row["entity"],
            "chunk_id": row["chunk_id"],
            "bukti_dukung_id": row["evidence_id"],
            "confidence": row["confidence"],
            "distance": float(row["distance"]),
        }
        for row in rows
    ]
