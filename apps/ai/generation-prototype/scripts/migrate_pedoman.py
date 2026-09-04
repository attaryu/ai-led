"""Migrasi code/output/pedoman.json -> Chroma collection 'pedoman_new'.

Khusus utk hasil chunking dinamis (mineru_extract_chunk.ipynb), TIDAK
menyentuh collection 'pedoman' lama -- keduanya hidup berdampingan supaya
bisa dibandingkan hasil retrieval-nya sebelum swap.

PENTING: yang di-EMBED adalah `metadata.prefix` (breadcrumb heading saja,
mis. "BAB III..., C.3..., 4. Analisis Faktor..."), BUKAN `text` penuh.
Similarity search jadi murni judul-vs-judul (lebih presisi, tidak
"tenggelam" oleh panjangnya paragraf isi). `text` penuh tetap disimpan
sbg `documents` di Chroma supaya generator.py tetap dapat isi lengkap utk
dikirim ke LLM -- cuma vektor similarity-nya yang berbeda sumber.
"""
import gc
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, "/app")

from lib.retrieval import _client, embed  # noqa: E402

PEDOMAN_JSON = os.environ.get("PEDOMAN_JSON", "/data/pedoman.json")
COLLECTION = "pedoman_new"
BATCH = 16


def _flatten_meta(meta: dict) -> dict:
    """Chroma metadata harus scalar (str/int/float/bool)."""
    out = {}
    for k, v in (meta or {}).items():
        if v is None:
            continue
        if isinstance(v, (str, int, float, bool)):
            out[k] = v
        else:
            out[k] = str(v)[:500]
    return out


def main():
    if not Path(PEDOMAN_JSON).exists():
        print(f"ERROR: {PEDOMAN_JSON} tidak ada.")
        sys.exit(1)

    chunks = json.load(open(PEDOMAN_JSON, encoding="utf-8"))
    chunks = [c for c in chunks if (c.get("text") or "").strip()]
    print(f"Loaded {len(chunks)} chunk dari {PEDOMAN_JSON}")

    cl = _client()
    coll = cl.get_or_create_collection(
        name=COLLECTION,
        metadata={"hnsw:space": "cosine"},
    )

    current = coll.count()
    if current == len(chunks):
        print(f"[{COLLECTION}] SKIP (sudah berisi {current} embedding, cocok dgn {len(chunks)} chunk)")
        return
    if current > 0:
        print(f"[{COLLECTION}] mismatch ({current} vs {len(chunks)}), re-create collection...")
        cl.delete_collection(COLLECTION)
        coll = cl.get_or_create_collection(
            name=COLLECTION,
            metadata={"hnsw:space": "cosine"},
        )

    total = 0
    for i in range(0, len(chunks), BATCH):
        batch = chunks[i:i + BATCH]
        ids      = [c["metadata"].get("chunk_id") or f"{COLLECTION}_{i+j}"
                    for j, c in enumerate(batch)]
        prefixes = [c["metadata"].get("prefix") or c["text"] for c in batch]
        texts    = [c["text"] for c in batch]
        metas    = [_flatten_meta(c["metadata"]) for c in batch]
        vecs     = embed(prefixes)  # embed HEADING/breadcrumb, bukan isi penuh
        coll.add(ids=ids, documents=texts, metadatas=metas, embeddings=vecs)
        total += len(batch)
        del vecs, prefixes, texts, metas, batch
        gc.collect()
        print(f"  [{COLLECTION}] {total}/{len(chunks)}", flush=True)

    print(f"\n✅ Selesai. [{COLLECTION}] DONE: {total} embedding tersimpan.")
    print(f"   Collection 'pedoman' lama TIDAK diubah.")


if __name__ == "__main__":
    main()
