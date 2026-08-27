"""pgvector-backed store for document_registry — one row per evidence
folder (bge-m3 embedding of the folder's label), used by the folder
recommendation pipeline. Separate embedding model from pgvector_evidence_store
(paraphrase-multilingual-MiniLM-L12-v2) — bge-m3 is what this pipeline was
tuned against, so both models stay loaded side by side, not swapped in place.
"""

from __future__ import annotations

import logging
import threading
import uuid

import psycopg2.extras
from pgvector.psycopg2 import register_vector

from db.connection import get_conn

logger = logging.getLogger(__name__)

_EMBED_MODEL = "BAAI/bge-m3"

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


def index_document_registry(
    folder_id: str,
    tenant_id: str,
    study_program_id: str | None,
    owner_type: str,
    label: str,
) -> None:
    """Embed `label` and upsert the folder's registry row. Re-indexing the
    same folder_id (e.g. a rename) updates the existing row via ON CONFLICT,
    it never duplicates it."""
    conn = _conn()
    model = _get_model()
    embedding = model.encode([label], normalize_embeddings=True, show_progress_bar=False)[0]

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO document_registry
                (id, owner_type, tenant_id, study_program_id, folder_id, label, embedding)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (folder_id) DO UPDATE SET
                owner_type = EXCLUDED.owner_type,
                tenant_id = EXCLUDED.tenant_id,
                study_program_id = EXCLUDED.study_program_id,
                label = EXCLUDED.label,
                embedding = EXCLUDED.embedding
            """,
            (str(uuid.uuid4()), owner_type, tenant_id, study_program_id, folder_id, label, embedding),
        )


def delete_document_registry(folder_id: str) -> None:
    """Safety-net delete — evidence_folders -> document_registry FK is
    already ON DELETE CASCADE, so this is only needed if a caller wants to
    clear the registry row without deleting the folder itself."""
    conn = _conn()
    with conn.cursor() as cur:
        cur.execute("DELETE FROM document_registry WHERE folder_id = %s", (folder_id,))


def search_document_registry(
    query: str,
    tenant_id: str,
    study_program_id: str | None,
    k: int = 5,
) -> list[dict]:
    """Raw cosine search over folder labels, scoped like evidence visibility
    elsewhere: tenant-wide rows plus (if given) that prodi's own.

    Returns [{folder_id, label, distance}, ...].
    """
    conn = _conn()
    model = _get_model()
    query_embedding = model.encode([query], normalize_embeddings=True, show_progress_bar=False)[0]

    if study_program_id:
        where = "tenant_id = %s AND (owner_type = 'TENANT' OR study_program_id = %s)"
        params = [tenant_id, study_program_id]
    else:
        where = "tenant_id = %s"
        params = [tenant_id]

    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT folder_id, label, embedding <=> %s AS distance
            FROM document_registry
            WHERE {where}
            ORDER BY embedding <=> %s
            LIMIT %s
            """,
            [query_embedding, *params, query_embedding, k],
        )
        rows = cur.fetchall()

    return [
        {"folder_id": row["folder_id"], "label": row["label"], "distance": float(row["distance"])}
        for row in rows
    ]


def search_document_registry_candidates(
    queries: list[str],
    tenant_id: str,
    study_program_id: str | None,
    k: int = 5,
    max_distance: float = 0.50,
) -> list[dict]:
    """Search once per query, dedup by folder_id (first occurrence wins,
    tagged with the query that found it), drop anything past max_distance.
    This is the function the recommend pipeline calls."""
    seen: set[str] = set()
    candidates: list[dict] = []
    for query in queries:
        for hit in search_document_registry(query, tenant_id, study_program_id, k=k):
            if hit["folder_id"] in seen:
                continue
            if hit["distance"] is not None and hit["distance"] > max_distance:
                continue
            seen.add(hit["folder_id"])
            candidates.append({**hit, "matched_query": query})
    return candidates
