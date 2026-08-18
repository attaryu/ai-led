"""
ChromaDB vector store for LED chunks.

Uses a multilingual SentenceTransformer embedding model so Bahasa Indonesia
queries are handled correctly.

Scoping: one collection PER (tenant_id, dokumen_id) pair, not one shared
global collection. This used to be a single fixed collection name that
`index_led_chunks()` deleted and rebuilt on every upload — meaning at most
one LED document could be indexed at a time, for the whole system,
regardless of tenant. Re-indexing now only ever touches the one collection
for the document being (re-)indexed; every other tenant's/document's data
is untouched (tracker: "Isolasi Tenant & Multi-Dokumen di apps/ai").
"""

from __future__ import annotations

import hashlib
import re
import threading

import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

from ingestion.led_chunker import LEDChunk

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Multilingual model that supports Bahasa Indonesia
_EMBED_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"

# Lazy singleton — loaded on first use, not at import time
_ef: SentenceTransformerEmbeddingFunction | None = None


def _get_ef() -> SentenceTransformerEmbeddingFunction:
    global _ef
    if _ef is None:
        _ef = SentenceTransformerEmbeddingFunction(model_name=_EMBED_MODEL)
    return _ef


def collection_name(tenant_id: str, dokumen_id: str) -> str:
    """Deterministic per-document collection name.

    Chroma collection names must be 3-512 chars, alnum/./_/- only, and
    start/end alphanumeric — tenant_id/dokumen_id (cuid strings) already
    satisfy that, but a hash suffix is added anyway so this doesn't quietly
    break if an id ever contains a character Chroma rejects.
    """
    raw = f"led__{tenant_id}__{dokumen_id}"
    safe = re.sub(r"[^a-zA-Z0-9._-]", "_", raw)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:8]
    name = f"{safe}_{digest}"
    return name[:512]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


# Per-process client cache + lock. ChromaDB 1.x has a thread-safety bug in
# SharedSystemClient._create_system_if_not_exists where concurrent calls
# race between the dict-check and the return, throwing
# "KeyError: '/app/data/chroma_db'". We serialize PersistentClient
# construction and cache the result.
_clients: dict[str, "chromadb.ClientAPI"] = {}
_client_lock = threading.Lock()


def get_chroma_client(persist_dir: str) -> "chromadb.ClientAPI":
    """Return a thread-safe cached persistent ChromaDB client at *persist_dir*."""
    with _client_lock:
        if persist_dir not in _clients:
            _clients[persist_dir] = chromadb.PersistentClient(path=persist_dir)
        return _clients[persist_dir]


def index_led_chunks(
    chunks: list[LEDChunk],
    persist_dir: str,
    tenant_id: str,
    dokumen_id: str,
) -> None:
    """Index one document's LED chunks into its own collection (idempotent —
    deletes only THIS document's collection first, not the whole store).

    Metadata stored per chunk:
        tenant_id, dokumen_id (defense in depth — the collection is already
        scoped by these, but stamping them too means a stray cross-collection
        query would still come back empty/filterable rather than silently
        returning another tenant's rows), page_start, page_end, para_start,
        para_end, section_heading (empty string when None), char_start.
        page_start/page_end are -1 for docx-sourced chunks; para_start/
        para_end are -1 for pdf-sourced ones (see ingestion.led_chunker.LEDChunk).
    """
    import logging
    import time
    log = logging.getLogger(__name__)

    client = get_chroma_client(persist_dir)
    name = collection_name(tenant_id, dokumen_id)

    try:
        client.delete_collection(name)
    except Exception:
        pass

    log.info("Loading embedding model (first run downloads ~118MB)…")
    t0 = time.time()
    ef = _get_ef()
    log.info("Embedding model ready in %.1fs", time.time() - t0)

    collection = client.create_collection(
        name=name,
        embedding_function=ef,
        metadata={"hnsw:space": "cosine"},
    )

    total = len(chunks)
    _BATCH_SIZE = 100
    t_start = time.time()
    for i in range(0, total, _BATCH_SIZE):
        batch = chunks[i : i + _BATCH_SIZE]
        collection.add(
            ids=[c.chunk_id for c in batch],
            documents=[c.text for c in batch],
            metadatas=[
                {
                    "tenant_id": tenant_id,
                    "dokumen_id": dokumen_id,
                    "page_start": c.page_start,
                    "page_end": c.page_end,
                    "para_start": c.para_start,
                    "para_end": c.para_end,
                    "section_heading": c.section_heading or "",
                    "char_start": c.char_start,
                }
                for c in batch
            ],
        )
        done = min(i + _BATCH_SIZE, total)
        log.info(
            "[%s/%s] Indexed %d/%d chunks (%.1fs elapsed)",
            tenant_id,
            dokumen_id,
            done,
            total,
            time.time() - t_start,
        )
    log.info(
        "LED indexing finished for tenant=%s dokumen=%s: %d chunks in %.1fs",
        tenant_id,
        dokumen_id,
        total,
        time.time() - t_start,
    )


def search_led(
    query: str,
    persist_dir: str,
    tenant_id: str,
    dokumen_id: str,
    n_results: int = 5,
) -> list[dict]:
    """Search one document's LED chunks by semantic similarity.

    Returns a list of dicts with keys:
        text       – the chunk text
        chunk_id   – UUID of the chunk
        metadata   – dict {page_start, page_end, para_start, para_end, section_heading, char_start}
        distance   – cosine distance (lower = more similar)

    Returns [] (not an error) if this document was never indexed — that's a
    normal "not ready yet" state, not a system failure.
    """
    client = get_chroma_client(persist_dir)
    name = collection_name(tenant_id, dokumen_id)

    try:
        collection = client.get_collection(name=name, embedding_function=_get_ef())
    except Exception:
        return []

    count = collection.count()
    if count == 0:
        return []

    results = collection.query(
        query_texts=[query],
        n_results=min(n_results, count),
        include=["documents", "metadatas", "distances"],
    )

    output: list[dict] = []
    docs = results["documents"][0]
    ids = results["ids"][0]
    metas = results["metadatas"][0]
    distances = results["distances"][0]

    for doc, cid, meta, dist in zip(docs, ids, metas, distances):
        output.append(
            {
                "text": doc,
                "chunk_id": cid,
                "metadata": meta,
                "distance": dist,
            }
        )

    return output
