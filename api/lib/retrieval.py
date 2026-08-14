"""Vector store wrapper pakai LangChain Chroma + HuggingFaceEmbeddings."""
import os
from typing import List, Dict, Optional
from functools import lru_cache

# Matikan telemetry SEBELUM import chromadb
os.environ["ANONYMIZED_TELEMETRY"]   = "False"
os.environ["CHROMA_TELEMETRY_IMPL"]  = "none"
os.environ["ORT_LOGGING_LEVEL"]      = "3"

import chromadb
from chromadb.config import Settings as _ChromaSettings

# LangChain stack
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.documents import Document

# Backward-compat: monkey-patch posthog telemetry
try:
    from chromadb.telemetry.product.posthog import Posthog
    Posthog.capture = lambda *args, **kwargs: None
except Exception:
    pass


CHROMA_PATH     = os.environ.get("CHROMA_PATH", "/data/chroma_db")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "BAAI/bge-m3")

# Toggle collection pedoman: "pedoman" (lama, embed=full text) atau
# "pedoman_new" (chunking dinamis rancangan.txt, embed=heading/prefix saja).
# Set PEDOMAN_COLLECTION=pedoman_new di .env utk switch tanpa ubah kode.
PEDOMAN_COLLECTION = os.environ.get("PEDOMAN_COLLECTION", "pedoman")


@lru_cache(maxsize=1)
def get_embeddings() -> HuggingFaceEmbeddings:
    """LangChain wrapper untuk model embedding (default: BAAI/bge-m3).

    Auto-detect GPU. Set EMBEDDING_DEVICE=cpu di env untuk force CPU.
    """
    device = os.environ.get("EMBEDDING_DEVICE")
    if not device:
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
        except ImportError:
            device = "cpu"

    if device == "cuda":
        print(f"✅ Embeddings pakai GPU ({device}) — model: {EMBEDDING_MODEL}", flush=True)
    else:
        print(f"ℹ Embeddings pakai CPU — model: {EMBEDDING_MODEL}", flush=True)

    # bge-m3 sudah handle multilingual & tidak butuh instruction prefix
    # khusus (beda dgn bge-large-en yg butuh "Represent this sentence: ").
    # Note: bge-m3 di HF Hub hanya punya pytorch_model.bin, tidak ada
    # safetensors. torch 2.6+ aman load .bin (CVE-2025-32434 patched).
    return HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL,
        model_kwargs={"device": device},
        encode_kwargs={
            "normalize_embeddings": True,
            "batch_size": 32,
        },
        show_progress=False,
    )


@lru_cache(maxsize=1)
def _raw_client():
    """Chroma PersistentClient — dipakai utk script indexing."""
    return chromadb.PersistentClient(
        path=CHROMA_PATH,
        settings=_ChromaSettings(anonymized_telemetry=False, allow_reset=True),
    )


# Alias supaya script indexing lama tetap jalan
_client = _raw_client


@lru_cache(maxsize=8)
def get_vectorstore(collection_name: str) -> Chroma:
    """Return LangChain Chroma vectorstore utk koleksi tertentu.

    PENTING: kalau ganti EMBEDDING_MODEL ke dimensi berbeda,
    koleksi lama TIDAK compatible. Jalankan re-index:
        docker compose run --rm api python /scripts/index_chunks.py

    LRU cached supaya tidak rebuild tiap call.
    """
    return Chroma(
        collection_name=collection_name,
        embedding_function=get_embeddings(),
        persist_directory=CHROMA_PATH,
        client=_raw_client(),
    )


def get_or_create_collection(name: str):
    """Backward-compat: return raw chromadb Collection (utk indexing script)."""
    return _raw_client().get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"},
    )


# ──────────────────────────────────────────────────────────────────────
# Embedding helper (utk indexing script)
# ──────────────────────────────────────────────────────────────────────

def embed(texts: List[str]) -> List[List[float]]:
    """Embed list of texts. Pakai LangChain embeddings instance."""
    return get_embeddings().embed_documents(texts)


# ──────────────────────────────────────────────────────────────────────
# Search functions (return LangChain Documents)
# ──────────────────────────────────────────────────────────────────────

def _docs_to_dicts(docs: List[Document], distances: List[float] = None) -> List[Dict]:
    """Konversi list[Document] ke list[dict] yg kompatibel dgn kode existing."""
    out = []
    for i, d in enumerate(docs):
        out.append({
            "id":       (d.metadata or {}).get("chunk_id") or f"doc_{i}",
            "text":     d.page_content,
            "metadata": d.metadata or {},
            "distance": distances[i] if distances and i < len(distances) else None,
        })
    return out


def _search(collection_name: str, query: str, k: int,
            where: Optional[Dict] = None) -> List[Dict]:
    """Search via LangChain Chroma. Pakai similarity_search_with_score
    supaya dapat distance/score juga."""
    vs = get_vectorstore(collection_name)
    try:
        results = vs.similarity_search_with_score(query, k=k, filter=where)
    except Exception:
        # Fallback tanpa filter kalau filter tidak valid
        results = vs.similarity_search_with_score(query, k=k)
    docs = [r[0] for r in results]
    scores = [float(r[1]) for r in results]
    return _docs_to_dicts(docs, scores)


def search_pedoman(query: str, k: int = 5, where: Optional[Dict] = None):
    """RAG 1: cari instruksi/struktur penulisan dari pedoman LED-PS."""
    return _search(PEDOMAN_COLLECTION, query, k, where)


def search_rubric(query: str, k: int = 5, where: Optional[Dict] = None):
    """RAG 2: cari rubrik penilaian dari matrik."""
    return _search("rubric", query, k, where)


def search_lkps(query: str, k: int = 5, where: Optional[Dict] = None):
    """RAG 3: cari data kuantitatif dari LKPS (table/CSV ekstrak)."""
    return _search("lkps", query, k, where)


def search_evidence(query: str, k: int = 5, where: Optional[Dict] = None):
    """RAG 4: cari bukti kualitatif dari repository SPMI.

    `where={"id_bukti_dukung": {"$in": [...]}}` men-scope pencarian HANYA ke
    dokumen yg user pilih di alur rekomendasi (lihat generator.py
    `_retrieve_facts`) -- bukan blanket search ke seluruh evidence terupload."""
    return _search("evidence", query, k, where)


def search_document_registry(query: str, k: int = 8, where: Optional[Dict] = None):
    """RAG baru (tahap rekomendasi): cari folder evidence kandidat dari
    Document Registry (granularitas folder, bukan isi file) -- lihat
    document_registry di schema.sql & database.md #9b."""
    return _search("document_registry", query, k, where)


def search_context(query: str, k: int = 8, where: Optional[Dict] = None):
    """Backward-compat: gabung lkps + evidence, masing-masing k/2.

    DEPRECATED — gunakan search_lkps + search_evidence terpisah.
    """
    half = max(1, k // 2)
    lkps = search_lkps(query, k=half, where=where)
    ev   = search_evidence(query, k=k - half, where=where)
    return lkps + ev


# ──────────────────────────────────────────────────────────────────────
# Retriever (LCEL-compatible) — utk dipakai di chain
# ──────────────────────────────────────────────────────────────────────

def get_retriever(collection_name: str, k: int = 5,
                  search_kwargs: Optional[Dict] = None):
    """Return LangChain Retriever yg bisa di-pipe di LCEL."""
    kwargs = {"k": k, **(search_kwargs or {})}
    return get_vectorstore(collection_name).as_retriever(search_kwargs=kwargs)
