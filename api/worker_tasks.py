"""Job RQ: proses 1 dokumen evidence hasil upload halaman "Document".
Dijalankan oleh container `worker` (rq worker), BUKAN oleh `api`.

Alur (lihat database.md #7 utk skema bukti_dukung/chunk_bukti_dukung):
  1. UPDATE bukti_dukung.status = 'processing'
  2. lib.extraction.process_file() -- MinerU/LibreOffice/openpyxl sesuai tipe
  3. INSERT chunk_bukti_dukung per chunk
  4. embed() tiap chunk -> upsert ke Chroma collection "evidence"
  5. UPDATE status = 'done' (atau 'failed' + error_message kalau exception)
"""
import shutil
import tempfile
import traceback
from pathlib import Path

from lib.db import conn
from lib.extraction import process_file, UnsupportedFileError
from lib.retrieval import embed, get_or_create_collection


def _flatten_meta(meta: dict) -> dict:
    """Chroma metadata harus scalar (str/int/float/bool)."""
    out = {}
    for k, v in meta.items():
        if isinstance(v, (str, int, float, bool)) or v is None:
            out[k] = v if v is not None else ""
        else:
            out[k] = str(v)
    return out


def process_document(bukti_dukung_id: str) -> None:
    with conn() as con:
        row = con.execute(
            "SELECT file_url, nama_dokumen FROM bukti_dukung WHERE id = %s",
            (bukti_dukung_id,),
        ).fetchone()
        if row is None:
            print(f"[worker] bukti_dukung {bukti_dukung_id} tidak ditemukan, skip.")
            return
        con.execute(
            "UPDATE bukti_dukung SET status = 'processing', error_message = NULL WHERE id = %s",
            (bukti_dukung_id,),
        )

    file_path = Path(row["file_url"])
    work_dir = Path(tempfile.mkdtemp(prefix=f"doc_{bukti_dukung_id}_"))

    try:
        if not file_path.exists():
            raise FileNotFoundError(f"File fisik tidak ditemukan: {file_path}")

        chunks = process_file(file_path, work_dir)
        if not chunks:
            print(f"[worker] {row['nama_dokumen']}: 0 chunk dihasilkan (dokumen kosong?).")

        with conn() as con:
            with con.cursor() as cur:
                cur.executemany(
                    """INSERT INTO chunk_bukti_dukung (id_bukti_dukung, chunk_id, entity, content)
                       VALUES (%(bukti_id)s, %(chunk_id)s, %(entity)s, %(content)s)
                       ON CONFLICT (id_bukti_dukung, chunk_id) DO UPDATE SET
                           entity = excluded.entity, content = excluded.content""",
                    [{
                        "bukti_id": bukti_dukung_id,
                        "chunk_id": c["chunk_id"],
                        "entity": c["entity"],
                        "content": c["text"],
                    } for c in chunks],
                )

        if chunks:
            coll = get_or_create_collection("evidence")
            texts = [c["text"] for c in chunks]
            ids = [c["chunk_id"] for c in chunks]
            metas = [_flatten_meta({
                "chunk_id": c["chunk_id"],
                "id_bukti_dukung": bukti_dukung_id,   # dibutuhkan search_evidence scoped ke file terpilih
                "orig_file": row["nama_dokumen"],
                "confidence": c.get("confidence", "HIGH"),
                "uploaded_at": c.get("uploaded_at", ""),
            }) for c in chunks]
            vecs = embed(texts)
            coll.upsert(ids=ids, documents=texts, metadatas=metas, embeddings=vecs)

        with conn() as con:
            con.execute(
                "UPDATE bukti_dukung SET status = 'done' WHERE id = %s",
                (bukti_dukung_id,),
            )
        print(f"[worker] {row['nama_dokumen']}: OK, {len(chunks)} chunk.")

    except UnsupportedFileError as e:
        _mark_failed(bukti_dukung_id, str(e))
    except Exception as e:
        traceback.print_exc()
        _mark_failed(bukti_dukung_id, f"{type(e).__name__}: {e}"[:2000])
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def _mark_failed(bukti_dukung_id: str, message: str) -> None:
    with conn() as con:
        con.execute(
            "UPDATE bukti_dukung SET status = 'failed', error_message = %s WHERE id = %s",
            (message, bukti_dukung_id),
        )
