"""Import hasil ekstraksi (code/new_extract_mechanism.ipynb) ke Postgres.

Sumber: 3 file terpisah per tipe di code/output/new_extract_mechanism/:
  pedoman.json, rubrik.json, lkps.json
(all_chunks.json gabungan TIDAK dipakai di sini -- 1 file per tipe lebih
tepat karena tiap tipe route ke tabel berbeda.)

Target per tipe (Pedoman/Rubrik & LKPS BUKAN "bukti dukung" upload user,
melainkan dokumen institusional/rujukan -- lihat database.md):
  pedoman.json -> panduan_referensi (tipe=PANDUAN_LAM) + panduan_detail
  rubrik.json  -> panduan_referensi (tipe=DOKUMEN_RUBRIK) + panduan_detail
  lkps.json    -> lkps + lkps_detail

Dijalankan manual, SETELAH scripts/migrate_to_postgres.py (butuh seed data
tenant/prodi/dokumen sudah ada):
    docker compose run --rm api python scripts/import_chunks.py --dry-run
    docker compose run --rm api python scripts/import_chunks.py

Catatan evidence: TIDAK LAGI di-bulk-import lewat skrip ini. Evidence
sekarang murni masuk manual per file lewat upload di halaman Document
(routes/documents.py -> worker_tasks.process_document, on-demand chunking),
dipilih user via alur rekomendasi dokumen (lihat lib/generator.py
recommend_chain). Representasi bulk/default evidence sekarang adalah
Document Registry (folder-level, lihat scripts/import_document_registry.py),
bukan isi-per-file spt sebelumnya.
"""
import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # /app

from lib.db import _pool  # noqa: E402

NEW_OUT_DIR = Path(os.environ.get(
    "EXTRACT_OUT_DIR",
    "/data/new_extract_mechanism",
))
PEDOMAN_JSON  = NEW_OUT_DIR / "pedoman.json"
RUBRIK_JSON   = NEW_OUT_DIR / "rubrik.json"
LKPS_JSON     = NEW_OUT_DIR / "lkps.json"

BATCH_SIZE = 1000


def _load_json(path: Path):
    if not path.exists():
        print(f"[ERROR] {path} tidak ditemukan. Jalankan code/new_extract_mechanism.ipynb dulu.")
        sys.exit(1)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _clean_str(val):
    """Postgres TEXT tidak menerima byte NUL (0x00) -- muncul di sebagian
    hasil OCR/parsing PDF yang rusak. Buang NUL, biarkan sisanya apa adanya."""
    if isinstance(val, str) and "\x00" in val:
        return val.replace("\x00", "")
    return val


def _dedup_by_chunk_id(chunks: list, label: str) -> list:
    """evidence_chunks_partial.jsonl bersifat append-only -- kalau notebook
    di-run ulang sebagian (mis. FORCE_RERUN_EVIDENCE=True di atas file yg
    sudah pernah OK), chunk_id yg sama bisa tertulis berkali-kali. Ambil
    kemunculan TERAKHIR per chunk_id (representasi paling baru/final)."""
    by_id = {}
    for c in chunks:
        by_id[c["metadata"]["chunk_id"]] = c
    deduped = list(by_id.values())
    n_dropped = len(chunks) - len(deduped)
    if n_dropped:
        print(f"[WARN] {label}: {n_dropped} chunk duplikat (chunk_id sama) di-dedup, "
              f"{len(chunks)} -> {len(deduped)}.")
    return deduped


def _import_panduan(con, chunks: list, tipe: str, source_path_hint: str):
    """1 file sumber (Pedoman ATAU Rubrik) -> 1 panduan_referensi + N panduan_detail."""
    if not chunks:
        return 0, 0
    fmeta = chunks[0]["metadata"]
    judul = fmeta.get("file_name") or source_path_hint

    panduan_id = con.execute(
        """INSERT INTO panduan_referensi (tipe, kategori, judul, tipe_file)
           VALUES (%s, 'LAM TEKNIK', %s, %s) RETURNING id""",
        (tipe, judul, fmeta.get("file_type")),
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
            } for c in chunks],
        )
    return 1, len(chunks)


def _import_lkps(con, chunks: list):
    if not chunks:
        return 0, 0
    fmeta = chunks[0]["metadata"]
    judul = fmeta.get("file_name") or "LKPS"

    lkps_id = con.execute(
        """INSERT INTO lkps (judul, tipe_file) VALUES (%s, %s) RETURNING id""",
        (judul, fmeta.get("file_type")),
    ).fetchone()["id"]

    with con.cursor() as cur:
        cur.executemany(
            """INSERT INTO lkps_detail (lkps_id, chunk_id, sheet, judul_poin, isi_teks)
               VALUES (%(lkps_id)s, %(chunk_id)s, %(sheet)s, %(judul_poin)s, %(isi_teks)s)""",
            [{
                "lkps_id": lkps_id,
                "chunk_id": c["metadata"]["chunk_id"],
                "sheet": _clean_str(c["metadata"].get("sheet")),
                "judul_poin": _clean_str(c["entity"]),
                "isi_teks": _clean_str(c["konten"]),
            } for c in chunks],
        )
    return 1, len(chunks)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="jalan meski panduan_referensi/lkps sudah berisi data")
    args = ap.parse_args()

    pedoman_chunks  = _dedup_by_chunk_id(_load_json(PEDOMAN_JSON), "pedoman.json")
    rubrik_chunks   = _dedup_by_chunk_id(_load_json(RUBRIK_JSON), "rubrik.json")
    lkps_chunks     = _dedup_by_chunk_id(_load_json(LKPS_JSON), "lkps.json")

    print(f"pedoman.json  : {len(pedoman_chunks)} chunk (setelah dedup)")
    print(f"rubrik.json   : {len(rubrik_chunks)} chunk (setelah dedup)")
    print(f"lkps.json     : {len(lkps_chunks)} chunk (setelah dedup)")

    print(f"\nRencana: 1 panduan_referensi (Pedoman) + 1 panduan_referensi (Rubrik), "
          f"1 lkps. Evidence TIDAK di-bulk-import (lihat catatan di module docstring).")

    if args.dry_run:
        print("\n[DRY RUN] Tidak ada perubahan ditulis ke database.")
        return

    _pool.open(wait=True, timeout=30)
    with _pool.connection() as con:
        con.execute("BEGIN")
        try:
            existing = con.execute("SELECT count(*) AS n FROM panduan_referensi").fetchone()["n"]
            if existing > 0 and not args.force:
                print(f"[ABORT] panduan_referensi sudah berisi {existing} baris. "
                      "Skrip ini sudah pernah dijalankan -- pakai --force kalau yakin ingin jalan lagi.")
                con.rollback()
                sys.exit(1)

            n_pand_pedoman, n_detail_pedoman = _import_panduan(con, pedoman_chunks, "PANDUAN_LAM", "pedoman-penulisan")
            n_pand_rubrik, n_detail_rubrik = _import_panduan(con, rubrik_chunks, "DOKUMEN_RUBRIK", "matrik-penilaian")
            n_lkps, n_lkps_detail = _import_lkps(con, lkps_chunks)

            con.commit()
            print("\n[OK] Import selesai.")
            print(f"  panduan_referensi : {n_pand_pedoman + n_pand_rubrik} "
                  f"(panduan_detail: {n_detail_pedoman + n_detail_rubrik})")
            print(f"  lkps              : {n_lkps} (lkps_detail: {n_lkps_detail})")
        except Exception:
            con.rollback()
            raise


if __name__ == "__main__":
    main()
