"""Import code/new_extract_mechanism.ipynb Bagian 4b output
(document_registry.json) ke Postgres (tabel document_registry) DAN Chroma
(collection baru "document_registry", TERPISAH dari "evidence" --
granularitas beda: 1 baris = 1 folder, bukan 1 chunk isi file).

Idempotent (ON CONFLICT chunk_id DO UPDATE) -- registry ini wajar
disegarkan berkala seiring folder evidence bertambah, beda dari
import_chunks.py yg abort kalau sudah pernah jalan.

Jalankan, SETELAH scripts/migrate_to_postgres.py DAN SETELAH schema
document_registry ter-apply (scripts/migrate_add_document_registry.py kalau
DB lama, atau fresh volume dari db/schema.sql):
    docker compose exec api python scripts/import_document_registry.py --dry-run
    docker compose exec api python scripts/import_document_registry.py
"""
import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.db import _pool  # noqa: E402
from lib.retrieval import embed, get_or_create_collection  # noqa: E402

NEW_OUT_DIR = Path(os.environ.get("EXTRACT_OUT_DIR", "/data/new_extract_mechanism"))
REGISTRY_JSON = NEW_OUT_DIR / "document_registry.json"


def _clean_str(val):
    if isinstance(val, str) and "\x00" in val:
        return val.replace("\x00", "")
    return val


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not REGISTRY_JSON.exists():
        print(f"[ERROR] {REGISTRY_JSON} tidak ditemukan. Jalankan notebook Bagian 4b dulu.")
        sys.exit(1)

    with open(REGISTRY_JSON, encoding="utf-8") as f:
        chunks = json.load(f)
    by_id = {c["metadata"]["chunk_id"]: c for c in chunks}
    chunks = list(by_id.values())
    print(f"document_registry.json: {len(chunks)} folder-chunk")

    if args.dry_run:
        print("[DRY RUN] tidak ada perubahan.")
        return

    _pool.open(wait=True, timeout=30)
    with _pool.connection() as con:
        con.execute("BEGIN")
        try:
            with con.cursor() as cur:
                cur.executemany(
                    """INSERT INTO document_registry
                           (chunk_id, folder_path, folder_name, document_text, document_count)
                       VALUES (%(chunk_id)s, %(folder_path)s, %(folder_name)s, %(document_text)s, %(document_count)s)
                       ON CONFLICT (chunk_id) DO UPDATE SET
                           document_text = excluded.document_text,
                           document_count = excluded.document_count,
                           diperbarui_pada = now()""",
                    [{
                        "chunk_id": c["metadata"]["chunk_id"],
                        "folder_path": _clean_str(c["metadata"]["folder_path"]),
                        "folder_name": _clean_str(c["metadata"]["file_name"]),
                        "document_text": _clean_str(c["konten"]),
                        "document_count": c["metadata"]["document_count"],
                    } for c in chunks],
                )
            con.commit()
        except Exception:
            con.rollback()
            raise
    print(f"[OK] Postgres document_registry: {len(chunks)} baris (upsert).")

    coll = get_or_create_collection("document_registry")
    BATCH = 16
    total = 0
    for i in range(0, len(chunks), BATCH):
        batch = chunks[i:i + BATCH]
        ids = [c["metadata"]["chunk_id"] for c in batch]
        texts = [c["text"] for c in batch]
        metas = [{
            "chunk_id": c["metadata"]["chunk_id"],
            "folder_path": c["metadata"]["folder_path"],
            "file_name": c["metadata"]["file_name"],
            "document_count": c["metadata"]["document_count"],
        } for c in batch]
        vecs = embed(texts)
        coll.upsert(ids=ids, documents=texts, metadatas=metas, embeddings=vecs)
        total += len(batch)
        print(f"  [document_registry] {total}/{len(chunks)}", flush=True)
    print(f"[OK] Chroma 'document_registry': {total} embedding.")


if __name__ == "__main__":
    main()
