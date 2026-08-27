"""pgvector-backed store for Evidence chunks — same pattern as
pgvector_store.py's LED chunks, different table (evidence_chunk_embeddings)
and scope (evidence_id, not document_id). Same embedding model/singleton
so both share one loaded model, not two copies in memory.
"""

from __future__ import annotations

import logging
import threading
import uuid

import psycopg2.extras
from pgvector.psycopg2 import register_vector

from db.connection import get_conn

logger = logging.getLogger(__name__)

_EMBED_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"

_model = None
_model_lock = threading.Lock()
_vector_registered = False


def _get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from sentence_transformers import SentenceTransformer

                _model = SentenceTransformer(_EMBED_MODEL)
    return _model


def _conn():
    global _vector_registered
    conn = get_conn()
    if not _vector_registered:
        register_vector(conn)
        _vector_registered = True
    return conn


def index_evidence_chunks(chunks: list[dict], tenant_id: str, bukti_dukung_id: str) -> None:
    """Index one file's chunks (replaces any prior chunks for the same
    bukti_dukung_id). chunks: [{entity, text, chunk_id, confidence}, ...].
    """
    import time

    conn = _conn()
    model = _get_model()

    with conn.cursor() as cur:
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

    with conn.cursor() as cur:
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


def list_available_evidence_ids(tenant_id: str, study_program_id: str | None) -> list[str]:
    """Evidence ids visible to one program studi: tenant-wide rows plus that
    prodi's own — mirrors evidence.repository.ts::findAvailableForStudyProgram's
    scope (NOT bukti-dukung.service.ts::findAll, which excludes tenant-wide
    rows once a studyProgramId is given — this query runs straight against
    Postgres, so it isn't subject to that endpoint's PENYUSUN 403 either).
    `None` (no prodi in context) returns every evidence id in the tenant.
    """
    conn = _conn()
    with conn.cursor() as cur:
        if study_program_id:
            cur.execute(
                "SELECT id FROM evidence_files WHERE tenant_id = %s AND (owner_type = 'TENANT' OR study_program_id = %s)",
                (tenant_id, study_program_id),
            )
        else:
            cur.execute("SELECT id FROM evidence_files WHERE tenant_id = %s", (tenant_id,))
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
    conn = _conn()
    model = _get_model()
    query_embedding = model.encode([query], show_progress_bar=False)[0]

    where = ["tenant_id = %s"]
    params: list = [tenant_id]
    if bukti_dukung_ids is not None:
        if not bukti_dukung_ids:
            return []
        where.append("evidence_id = ANY(%s)")
        params.append(bukti_dukung_ids)

    with conn.cursor() as cur:
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
