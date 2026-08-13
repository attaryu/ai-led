"""T1: Index chunks_all.json → Chroma (2 koleksi: rubric, context).
Pedoman tidak di-embed (sudah ada di outline static)."""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, "/app")

from lib.retrieval import _client, embed, get_or_create_collection  # noqa: E402

CHUNKS_PATH = os.environ.get("CHUNKS_PATH", "/data/chunks_all.json")


def main():
    if not Path(CHUNKS_PATH).exists():
        print(f"ERROR: {CHUNKS_PATH} tidak ada. Mount dari host: ../code/output/chunks_all.json")
        sys.exit(1)

    chunks = json.load(open(CHUNKS_PATH, encoding="utf-8"))
    print(f"Loaded {len(chunks)} chunks dari {CHUNKS_PATH}")

    by_source = {}
    for c in chunks:
        src = (c.get("metadata") or {}).get("source")
        by_source.setdefault(src, []).append(c)
    for k, v in by_source.items():
        print(f"  {k:<10}: {len(v)}")

    # 4 koleksi sesuai arsitektur 6-tahap:
    #   pedoman  → aturan/struktur penulisan (RAG 1)
    #   rubric   → kriteria penilaian (RAG 2)
    #   lkps     → data kuantitatif LKPS (RAG 3)
    #   evidence → bukti kualitatif SPMI (RAG 4)
    pedoman_chunks  = by_source.get("pedoman",  [])
    rubric_chunks   = by_source.get("matrik",   [])
    lkps_chunks     = by_source.get("lkps",     [])
    evidence_chunks = by_source.get("evidence", [])

    # Mode resume: skip koleksi yang sudah berisi data (kalau jumlah match).
    # Set REINDEX=force di env untuk wipe semua dan rebuild dari nol.
    force_reindex = os.environ.get("REINDEX", "").lower() == "force"
    cl = _client()

    if force_reindex:
        for name in ("pedoman", "rubric", "lkps", "evidence", "context"):
            try:
                cl.delete_collection(name)
                print(f"  [{name}] WIPED")
            except Exception:
                pass
    else:
        # Drop koleksi 'context' lama (tidak dipakai lagi)
        try:
            cl.delete_collection("context")
        except Exception:
            pass

    import gc

    def upsert(collection_name, items):
        coll = get_or_create_collection(collection_name)
        # Skip kalau text kosong
        items = [c for c in items if (c.get("text") or "").strip()]

        # Resume: skip kalau count koleksi sudah match jumlah items
        current = coll.count()
        if current >= len(items) and not force_reindex:
            print(f"  [{collection_name}] SKIP (already has {current} embeddings)")
            return

        # Wipe jika resume tidak match (count beda → re-create)
        if current > 0 and current != len(items):
            print(f"  [{collection_name}] mismatch ({current} vs {len(items)}), re-indexing...")
            cl.delete_collection(collection_name)
            coll = get_or_create_collection(collection_name)

        # Batch kecil utk hemat RAM (bge-m3 di CPU butuh ~2.3 GB base + peak)
        BATCH = 16
        total = 0
        for i in range(0, len(items), BATCH):
            batch = items[i:i + BATCH]
            ids   = [c["metadata"].get("chunk_id") or f"{collection_name}_{i+j}"
                     for j, c in enumerate(batch)]
            texts = [c["text"] for c in batch]
            metas = [_flatten_meta(c["metadata"]) for c in batch]
            vecs  = embed(texts)
            coll.add(ids=ids, documents=texts, metadatas=metas, embeddings=vecs)
            total += len(batch)
            # Free intermediate tensor + force GC tiap batch
            del vecs, texts, metas, batch
            gc.collect()
            print(f"  [{collection_name}] {total}/{len(items)}", flush=True)
        print(f"  [{collection_name}] DONE: {total}")

    print("\nIndexing pedoman...")
    upsert("pedoman", pedoman_chunks)
    print("\nIndexing rubric (matrik)...")
    upsert("rubric", rubric_chunks)
    print("\nIndexing lkps...")
    upsert("lkps", lkps_chunks)
    print("\nIndexing evidence...")
    upsert("evidence", evidence_chunks)

    print("\n✅ Selesai. DB: ", os.environ.get("CHROMA_PATH", "/data/chroma_db"))


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


if __name__ == "__main__":
    main()
