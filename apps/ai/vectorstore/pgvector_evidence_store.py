"""pgvector-backed store for Evidence chunks — same pattern as
pgvector_store.py's LED chunks, different table (evidence_chunk_embeddings)
and scope (evidence_id, not document_id). Imports pgvector_store's
_get_model instead of keeping its own copy -- a same-named module-level
_model in each file does NOT actually share the loaded SentenceTransformer
(they're separate globals in separate modules), it just silently loads and
holds two ~500MB copies in memory, one per module, first use of each
(confirmed: both "Loading SentenceTransformer model..." lines fire back to
back in worker logs the first time a job calls both search_led AND
search_evidence).
"""

from __future__ import annotations

import logging
import uuid
import weakref
from contextlib import contextmanager

import psycopg2.extras
from pgvector.psycopg2 import register_vector

from db.connection import tenant_connection
from vectorstore.pgvector_store import embed_documents, embed_documents_ami, embed_query, embed_query_ami

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


def index_evidence_chunks(chunks: list[dict], tenant_id: str, bukti_dukung_id: str) -> None:
    """Index one file's chunks (replaces any prior chunks for the same
    bukti_dukung_id). chunks: [{entity, text, chunk_id, confidence}, ...].
    """
    import time


    with _cursor(tenant_id) as cur:
        cur.execute(
            "DELETE FROM evidence_chunk_embeddings WHERE evidence_id = %s",
            (bukti_dukung_id,),
        )

    total = len(chunks)
    if total == 0:
        return

    # Pengaman terakhir: Postgres menolak NUL (0x00) dan satu chunk bernul menggagalkan
    # seluruh berkas. Jalur PDF sudah membersihkannya di sumber (evidence_pipeline.
    # _bersihkan_nul); ini menutup jalur lain (Excel/CSV/teks) dan regresi di masa depan.
    chunks = [
        {**c, "text": c["text"].replace("\x00", ""), "entity": (c.get("entity") or "").replace("\x00", "")}
        for c in chunks
    ]

    t0 = time.time()
    texts = [c["text"] for c in chunks]
    # ponytail: dulu DUA kali embed -- bge-m3 ke `embedding` dan MiniLM ke
    # `embedding_ami`. MiniLM dihapus (kolomnya di-DROP), jadi sekali saja:
    # biaya embedding tiap unggahan turun separuh, dan tidak ada lagi vektor
    # yang hanya mewakili 128 token pertama chunk.
    embeddings = embed_documents(texts)
    # embeddings_ami = embed_documents_ami(texts)
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
    tenant_id: str, accreditation_set_id: str, indicator_no: int, study_program_id: str | None = None
) -> list[str]:
    """Evidence ids explicitly tagged to this indicator, hard-scoped to tenant
    AND accreditation_set_id (evidence_indicator_tags) -- indicator_no alone
    is ambiguous once >1 AccreditationSet exists (every set renumbers its own
    indicators from 1). Zero tags for this indicator on this tenant/set -> []
    -> caller returns immediately, no fallback to a blanket tenant/prodi search
    (matches origin/ariel's design; tenant filter is dev-v1-only, Ariel's
    prototype has no tenant concept at all).

    study_program_id (the assessed document's prodi) further limits to that
    prodi's own evidence or tenant-wide evidence (study_program_id NULL) --
    otherwise two prodi sharing a set would see each other's tagged files.
    """
    prodi_filter = "AND (ef.study_program_id = %s OR ef.study_program_id IS NULL)" if study_program_id else ""
    params = (tenant_id, accreditation_set_id, indicator_no) + ((study_program_id,) if study_program_id else ())
    with _cursor(tenant_id) as cur:
        cur.execute(
            f"""
            SELECT ef.id
            FROM evidence_files ef
            JOIN evidence_indicator_tags eit ON eit.evidence_id = ef.id
            WHERE ef.tenant_id = %s AND ef.kind = 'BUKTI_DUKUNG'
              AND eit.accreditation_set_id = %s AND eit.indicator_no = %s
            {prodi_filter}
            """,
            params,
        )
        return [row["id"] for row in cur.fetchall()]


def search_evidence(
    query: str,
    tenant_id: str,
    bukti_dukung_ids: list[str] | None = None,
    n_results: int = 5,
    ami: bool = False,
) -> list[dict]:
    """Search evidence chunks by semantic similarity, scoped to a tenant and
    optionally to a specific set of bukti_dukung_ids (e.g. the evidence
    available to one program studi's generate context).

    `ami` DEPRECATED: dulu memilih kolom MiniLM `embedding_ami`. Sejak MiniLM
    dihapus hanya ada satu kolom (`embedding`, bge-m3), jadi parameter ini tidak
    lagi berpengaruh -- dipertahankan supaya pemanggil lama (agent/tools/
    evidence_tool.py, eval/) tidak pecah. Ambang jarak tetap TIDAK diterapkan di
    jalur AMI (top-k polos), sama seperti sebelumnya.

    Returns [{text, entity, chunk_id, bukti_dukung_id, confidence, distance}].
    """
    # ponytail: satu kolom saja sejak MiniLM dihapus.
    # kolom = "embedding_ami" if ami else "embedding"
    kolom = "embedding"
    # ponytail: satu model saja -- embed_query_ami kini alias bge-m3.
    # query_embedding = embed_query_ami(query) if ami else embed_query(query)
    query_embedding = embed_query(query)

    where = ["tenant_id = %s", f"{kolom} IS NOT NULL"]
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
                   {kolom} <=> %s AS distance
            FROM evidence_chunk_embeddings
            WHERE {" AND ".join(where)}
            ORDER BY {kolom} <=> %s
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
