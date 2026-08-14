"""Re-import HANYA Rubrik (bukan full re-run import_chunks.py) setelah
notebook diperbaiki (hierarki BAB/SUB/SUB SUB, text vs konten dipisah --
lihat code/new_extract_mechanism.ipynb Bagian 2).

Update Postgres (panduan_referensi tipe=DOKUMEN_RUBRIK + panduan_detail) DAN
Chroma (collection "rubric", drop+recreate lalu embed ulang field `text`
pendek, simpan `konten` lengkap sbg `documents`) -- tidak ada script existing
yg dipakai utk populate Chroma "rubric" sebelumnya (dicek: tidak ada file
manapun di project ini yg pernah menulis ke collection ini selain lewat
proses manual di luar repo), jadi skrip ini jadi satu-satunya sumber
kebenaran utk isi ulang collection tsb ke depannya.

Jalankan: docker compose exec api python scripts/reimport_rubrik.py --dry-run
          docker compose exec api python scripts/reimport_rubrik.py
"""
import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.db import _pool  # noqa: E402
from lib.retrieval import embed, _raw_client  # noqa: E402

NEW_OUT_DIR = Path(os.environ.get("EXTRACT_OUT_DIR", "/data/new_extract_mechanism"))
RUBRIK_JSON = NEW_OUT_DIR / "rubrik.json"


def _clean_str(val):
    """Postgres TEXT tidak menerima byte NUL (0x00)."""
    if isinstance(val, str) and "\x00" in val:
        return val.replace("\x00", "")
    return val


def _load_json(path: Path) -> list:
    if not path.exists():
        print(f"[ERROR] {path} tidak ditemukan. Jalankan notebook Bagian 2 dulu.")
        sys.exit(1)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _dedup_by_chunk_id(chunks: list) -> list:
    by_id = {}
    for c in chunks:
        by_id[c["metadata"]["chunk_id"]] = c
    return list(by_id.values())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    rubrik_chunks = _dedup_by_chunk_id(_load_json(RUBRIK_JSON))
    print(f"rubrik.json: {len(rubrik_chunks)} chunk (setelah dedup)")

    if args.dry_run:
        print("[DRY RUN] tidak ada perubahan ditulis.")
        return

    # --- Postgres: hapus panduan_referensi lama tipe rubrik, insert ulang ---
    _pool.open(wait=True, timeout=30)
    with _pool.connection() as con:
        con.execute("BEGIN")
        try:
            con.execute("DELETE FROM panduan_referensi WHERE tipe = 'DOKUMEN_RUBRIK'")

            fmeta = rubrik_chunks[0]["metadata"]
            judul = fmeta.get("file_name") or "matrik-penilaian"
            panduan_id = con.execute(
                """INSERT INTO panduan_referensi (tipe, kategori, judul, tipe_file)
                   VALUES ('DOKUMEN_RUBRIK', 'LAM TEKNIK', %s, %s) RETURNING id""",
                (judul, fmeta.get("file_type")),
            ).fetchone()["id"]

            with con.cursor() as cur:
                cur.executemany(
                    """INSERT INTO panduan_detail (panduan_id, chunk_id, judul_poin, isi_teks)
                       VALUES (%(panduan_id)s, %(chunk_id)s, %(judul_poin)s, %(isi_teks)s)""",
                    [{
                        "panduan_id": panduan_id,
                        "chunk_id": c["metadata"]["chunk_id"],
                        "judul_poin": _clean_str(c["entity"]),
                        "isi_teks": _clean_str(c["konten"]),
                    } for c in rubrik_chunks],
                )
            con.commit()
            print(f"[OK] Postgres: panduan_referensi (1) + panduan_detail ({len(rubrik_chunks)}) rubrik ditulis ulang.")
        except Exception:
            con.rollback()
            raise

    # --- Chroma: drop+recreate collection "rubric", embed `text` pendek ---
    cl = _raw_client()
    try:
        cl.delete_collection("rubric")
        print("[OK] Chroma collection 'rubric' lama di-drop.")
    except Exception as e:
        print(f"[INFO] Collection 'rubric' belum ada / gagal drop (lanjut): {e}")

    coll = cl.get_or_create_collection(name="rubric", metadata={"hnsw:space": "cosine"})
    BATCH = 16
    total = 0
    for i in range(0, len(rubrik_chunks), BATCH):
        batch = rubrik_chunks[i:i + BATCH]
        ids = [c["metadata"]["chunk_id"] for c in batch]
        texts = [c["text"] for c in batch]          # short-form -- utk embedding
        documents = [c["konten"] for c in batch]     # full content -- utk ditampilkan
        metas = [{
            "chunk_id": c["metadata"]["chunk_id"],
            "entity": c["entity"],
            "type": c["metadata"].get("type", "Rubrik Penilaian LED LAM Teknik"),
        } for c in batch]
        vecs = embed(texts)
        coll.upsert(ids=ids, documents=documents, metadatas=metas, embeddings=vecs)
        total += len(batch)
        print(f"  [rubric] {total}/{len(rubrik_chunks)}", flush=True)

    print(f"[OK] Chroma 'rubric': {total} embedding (embed=text pendek, documents=konten lengkap).")


if __name__ == "__main__":
    main()
