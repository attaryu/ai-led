"""
ChromaDB vector store for LED chunks.

Uses a multilingual SentenceTransformer embedding model so Bahasa Indonesia
queries are handled correctly.
"""

from __future__ import annotations

import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

from ingestion.led_chunker import LEDChunk

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_COLLECTION_NAME = "led_chunks"
# Multilingual model that supports Bahasa Indonesia
_EMBED_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_chroma_client(persist_dir: str) -> chromadb.ClientAPI:
    """Return a persistent ChromaDB client stored at *persist_dir*."""
    return chromadb.PersistentClient(path=persist_dir)


def index_led_chunks(chunks: list[LEDChunk], persist_dir: str) -> None:
    """Index LED chunks into ChromaDB (idempotent — deletes existing collection first).

    Metadata stored per chunk:
        page_start, page_end, section_heading (empty string when None), char_start
    """
    client = get_chroma_client(persist_dir)
    ef = SentenceTransformerEmbeddingFunction(model_name=_EMBED_MODEL)

    # Delete existing collection so indexing is idempotent
    try:
        client.delete_collection(_COLLECTION_NAME)
    except Exception:
        pass  # Collection didn't exist yet — that's fine

    collection = client.create_collection(
        name=_COLLECTION_NAME,
        embedding_function=ef,
        metadata={"hnsw:space": "cosine"},
    )

    # ChromaDB add() can handle large lists but batching avoids memory spikes
    _BATCH_SIZE = 100
    for i in range(0, len(chunks), _BATCH_SIZE):
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
    ef = SentenceTransformerEmbeddingFunction(model_name=_EMBED_MODEL)

    collection = client.get_collection(
        name=_COLLECTION_NAME,
        embedding_function=ef,
    )

    results = collection.query(
        query_texts=[query],
        n_results=min(n_results, collection.count()),
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
