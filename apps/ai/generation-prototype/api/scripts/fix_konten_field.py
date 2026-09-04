"""Perbaikan data: panduan_detail.isi_teks / lkps_detail.isi_teks /
chunk_bukti_dukung.content sempat terisi dari field `text` (representasi
ringkas utk embedding) alih-alih `konten` (isi lengkap utk ditampilkan).
Skrip ini update ulang berdasarkan chunk_id yang sudah tersimpan -- tanpa
re-import (hindari duplikasi baris panduan_referensi/lkps/bukti_dukung).

Jalankan sekali: docker compose exec api python scripts/fix_konten_field.py
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.db import _pool  # noqa: E402

OUTPUT_DIR = Path(os.environ.get("EXTRACT_OUTPUT_DIR", "/data/new_extract_mechanism"))
PEDOMAN_JSON  = OUTPUT_DIR / "pedoman.json"
RUBRIK_JSON   = OUTPUT_DIR / "rubrik.json"
LKPS_JSON     = OUTPUT_DIR / "lkps.json"
EVIDENCE_JSON = OUTPUT_DIR / "evidence.json"


def _clean_str(val):
    if isinstance(val, str) and "\x00" in val:
        return val.replace("\x00", "")
    return val


def _load_json(path: Path) -> list:
    if not path.exists():
        print(f"[SKIP] {path} tidak ditemukan.")
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _dedup_by_chunk_id(chunks: list) -> list:
    by_id = {}
    for c in chunks:
        by_id[c["metadata"]["chunk_id"]] = c
    return list(by_id.values())


def main():
    pedoman_chunks  = _dedup_by_chunk_id(_load_json(PEDOMAN_JSON))
    rubrik_chunks   = _dedup_by_chunk_id(_load_json(RUBRIK_JSON))
    lkps_chunks     = _dedup_by_chunk_id(_load_json(LKPS_JSON))
    evidence_chunks = _dedup_by_chunk_id(_load_json(EVIDENCE_JSON))

    _pool.open(wait=True, timeout=30)
    with _pool.connection() as con:
        con.execute("BEGIN")
        try:
            with con.cursor() as cur:
                cur.executemany(
                    "UPDATE panduan_detail SET isi_teks = %(isi_teks)s WHERE chunk_id = %(chunk_id)s",
                    [{
                        "chunk_id": c["metadata"]["chunk_id"],
                        "isi_teks": _clean_str(c["konten"]),
                    } for c in (pedoman_chunks + rubrik_chunks)],
                )

            with con.cursor() as cur:
                cur.executemany(
                    "UPDATE lkps_detail SET isi_teks = %(isi_teks)s WHERE chunk_id = %(chunk_id)s",
                    [{
                        "chunk_id": c["metadata"]["chunk_id"],
                        "isi_teks": _clean_str(c["konten"]),
                    } for c in lkps_chunks],
                )

            with con.cursor() as cur:
                cur.executemany(
                    "UPDATE chunk_bukti_dukung SET content = %(content)s WHERE chunk_id = %(chunk_id)s",
                    [{
                        "chunk_id": c["metadata"]["chunk_id"],
                        "content": _clean_str(c["konten"]),
                    } for c in evidence_chunks],
                )

            con.commit()
            print(f"[OK] panduan_detail  : {len(pedoman_chunks) + len(rubrik_chunks)} chunk diproses")
            print(f"[OK] lkps_detail     : {len(lkps_chunks)} chunk diproses")
            print(f"[OK] chunk_bukti_dukung : {len(evidence_chunks)} chunk diproses")
        except Exception:
            con.rollback()
            raise


if __name__ == "__main__":
    main()
