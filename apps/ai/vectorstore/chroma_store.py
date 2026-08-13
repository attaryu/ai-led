"""
ChromaDB vector store for LED chunks.

Uses a multilingual SentenceTransformer embedding model so Bahasa Indonesia
queries are handled correctly.
"""

from __future__ import annotations

import threading

import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

from ingestion.led_chunker import LEDChunk

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_COLLECTION_NAME = "led_chunks"
# Multilingual model that supports Bahasa Indonesia
_EMBED_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"

# Lazy singleton — loaded on first use, not at import time
_ef: SentenceTransformerEmbeddingFunction | None = None


def _get_ef() -> SentenceTransformerEmbeddingFunction:
    global _ef
    if _ef is None:
        _ef = SentenceTransformerEmbeddingFunction(model_name=_EMBED_MODEL)
    return _ef

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


def index_led_chunks(chunks: list[LEDChunk], persist_dir: str) -> None:
    """Index LED chunks into ChromaDB (idempotent — deletes existing collection first).

    Metadata stored per chunk:
        page_start, page_end, section_heading (empty string when None), char_start
    """
    import logging
    import time
    log = logging.getLogger(__name__)

    client = get_chroma_client(persist_dir)

    try:
        client.delete_collection(_COLLECTION_NAME)
    except Exception:
        pass

    log.info("Loading embedding model (first run downloads ~118MB)…")
    t0 = time.time()
    ef = _get_ef()
    log.info("Embedding model ready in %.1fs", time.time() - t0)

    collection = client.create_collection(
        name=_COLLECTION_NAME,
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
                    "page_start": c.page_start,
                    "page_end": c.page_end,
                    "section_heading": c.section_heading or "",
                    "char_start": c.char_start,
                }
                for c in batch
            ],
        )
        done = min(i + _BATCH_SIZE, total)
        log.info("Indexed %d/%d chunks (%.1fs elapsed)", done, total, time.time() - t_start)
    log.info("LED indexing finished: %d chunks in %.1fs", total, time.time() - t_start)


def search_led(
    query: str,
    persist_dir: str,
    n_results: int = 5,
) -> list[dict]:
    """Search LED chunks by semantic similarity.

    Returns a list of dicts with keys:
        text       – the chunk text
        chunk_id   – UUID of the chunk
        metadata   – dict {page_start, page_end, section_heading, char_start}
        distance   – cosine distance (lower = more similar)
    """
    client = get_chroma_client(persist_dir)

    collection = client.get_collection(
        name=_COLLECTION_NAME,
        embedding_function=_get_ef(),
    )

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
