"""Hapus SEMUA data evidence lama (era bulk-import per-heading-chunk) dari
Postgres + Chroma. TIDAK menghapus tabel/kolom, TIDAK menyentuh mekanisme
upload-on-demand (worker_tasks.process_document / lib.extraction.pipeline)
-- itu tetap dipakai utk evidence yg user pilih di alur rekomendasi baru.
Skrip ini murni purge DATA lama sebelum document_registry menggantikannya
sbg representasi bulk default.

Jalankan SEKALI, SETELAH schema document_registry sudah ada dan SEBELUM
(atau bersamaan dgn) import_document_registry.py:
    docker compose exec api python scripts/purge_evidence.py --dry-run
    docker compose exec api python scripts/purge_evidence.py
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.db import _pool  # noqa: E402
from lib.retrieval import _raw_client  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    _pool.open(wait=True, timeout=30)
    with _pool.connection() as con:
        n_bukti = con.execute("SELECT count(*) AS n FROM bukti_dukung").fetchone()["n"]
        n_chunk = con.execute("SELECT count(*) AS n FROM chunk_bukti_dukung").fetchone()["n"]
        n_ref = con.execute(
            "SELECT count(*) AS n FROM bab_referensi_chunk WHERE tipe_sumber = 'EVIDENCE'"
        ).fetchone()["n"]
        print(f"bukti_dukung: {n_bukti} baris, chunk_bukti_dukung: {n_chunk} baris, "
              f"bab_referensi_chunk(EVIDENCE): {n_ref} baris akan dihapus.")

        if args.dry_run:
            print("[DRY RUN] tidak ada perubahan.")
            return

        con.execute("BEGIN")
        try:
            con.execute("DELETE FROM bab_referensi_chunk WHERE tipe_sumber = 'EVIDENCE'")
            con.execute("DELETE FROM bukti_dukung")  # CASCADE -> chunk_bukti_dukung, bukti_dukung_bab, bukti_dukung_draft
            con.commit()
            print(f"[OK] Postgres: {n_bukti} bukti_dukung + {n_chunk} chunk_bukti_dukung dihapus (CASCADE).")
        except Exception:
            con.rollback()
            raise

    cl = _raw_client()
    try:
        cl.delete_collection("evidence")
        print("[OK] Chroma collection 'evidence' di-drop.")
    except Exception as e:
        print(f"[INFO] Collection 'evidence' belum ada / gagal drop (lanjut): {e}")

    # Re-create kosong supaya get_or_create_collection("evidence") di
    # worker_tasks.py (jalur on-demand) tetap langsung siap dipakai tanpa
    # perlu logic tambahan utk "collection belum ada".
    cl.get_or_create_collection(name="evidence", metadata={"hnsw:space": "cosine"})
    print("[OK] Chroma collection 'evidence' dibuat ulang kosong (siap dipakai on-demand).")


if __name__ == "__main__":
    main()
