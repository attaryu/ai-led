"""Endpoint halaman "Document" (Google-Drive style): upload file/folder,
list dokumen + status pemrosesan, lihat hasil chunk, hapus dokumen.

Alur: POST /documents/upload -> validasi -> simpan file fisik ke
DOCUMENT_EVIDENCE_ROOT -> INSERT bukti_dukung (status=pending) -> enqueue RQ
job "documents" -> worker (worker_tasks.py) proses async -> status
berubah processing -> done/failed. Frontend poll GET /documents utk progres.

Lihat database.md #7 (BUKTI_DUKUNG) utk skema, dan rencana implementasi
"Halaman Document" utk alur lengkap.
"""
import os
import re
import unicodedata
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from redis import Redis
from rq import Queue

from lib.db import conn
from lib.context import get_active_program_studi_id
from lib.extraction.pipeline import CONVERTIBLE_EXTS, CSV_EXTS, EXCEL_EXTS, PDF_EXTS, TEXT_EXTS

router = APIRouter(prefix="/documents", tags=["documents"])

DOCUMENT_EVIDENCE_ROOT = Path(os.environ.get("DOCUMENT_EVIDENCE_ROOT", "/app_document/evidence"))
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379")
ALLOWED_EXTS = CONVERTIBLE_EXTS | EXCEL_EXTS | TEXT_EXTS | PDF_EXTS | CSV_EXTS
MAX_FILE_SIZE = 200 * 1024 * 1024  # 200 MB

_redis = Redis.from_url(REDIS_URL)
_queue = Queue("documents", connection=_redis)


class DocumentOut(BaseModel):
    id: str
    nama_dokumen: str
    folder_path: str
    tipe_file: Optional[str]
    status: str
    error_message: Optional[str]
    waktu_diunggah: str
    kind: str


_DETAIL_QUERY_BY_KIND = {
    "evidence": (
        "SELECT id, nama_dokumen, folder_path, tipe_file, status, "
        "error_message, waktu_diunggah, 'evidence' AS kind "
        "FROM bukti_dukung WHERE id = %s"
    ),
    "panduan": (
        "SELECT id, judul AS nama_dokumen, 'intruction/' AS folder_path, tipe_file, "
        "'done' AS status, NULL AS error_message, dibuat_pada AS waktu_diunggah, "
        "'panduan' AS kind FROM panduan_referensi WHERE id = %s"
    ),
    "lkps": (
        "SELECT id, judul AS nama_dokumen, 'data/' AS folder_path, tipe_file, "
        "'done' AS status, NULL AS error_message, dibuat_pada AS waktu_diunggah, "
        "'lkps' AS kind FROM lkps WHERE id = %s"
    ),
}

_CHUNKS_QUERY_BY_KIND = {
    "evidence": (
        "SELECT chunk_id, entity, content FROM chunk_bukti_dukung "
        "WHERE id_bukti_dukung = %s ORDER BY chunk_id"
    ),
    "panduan": (
        "SELECT chunk_id, judul_poin AS entity, isi_teks AS content FROM panduan_detail "
        "WHERE panduan_id = %s ORDER BY chunk_id"
    ),
    "lkps": (
        "SELECT chunk_id, judul_poin AS entity, isi_teks AS content FROM lkps_detail "
        "WHERE lkps_id = %s ORDER BY chunk_id"
    ),
}


def _safe_relative_path(raw_path: str) -> Path:
    """Normalisasi path relatif dari client (webkitRelativePath / drag&drop folder).
    Tolak path traversal (..), root absolut, dan karakter kontrol."""
    raw_path = raw_path.replace("\\", "/").lstrip("/")
    parts = [p for p in raw_path.split("/") if p not in ("", ".", "..")]
    if not parts:
        raise HTTPException(400, "Path file tidak valid")
    parts = [unicodedata.normalize("NFC", p) for p in parts]
    return Path(*parts)


@router.get("", response_model=List[DocumentOut])
def list_documents():
    """Gabungan 3 sumber dokumen: evidence (bukti_dukung, upload user),
    panduan (Pedoman+Rubrik, tabel panduan_referensi) di folder virtual
    "intruction/", dan LKPS (tabel lkps) di folder virtual "data/". Field
    `kind` menandai sumber tiap baris, dipakai frontend utk memilih endpoint
    detail/chunks yang benar."""
    with conn() as con:
        rows = con.execute(
            """SELECT id, nama_dokumen, folder_path, tipe_file, status,
                      error_message, waktu_diunggah, 'evidence' AS kind
               FROM bukti_dukung
               WHERE owner_tipe = 'PROGRAM_STUDI' AND program_studi_id = %s

               UNION ALL

               SELECT id, judul AS nama_dokumen, 'intruction/' AS folder_path,
                      tipe_file, 'done' AS status, NULL AS error_message,
                      dibuat_pada AS waktu_diunggah, 'panduan' AS kind
               FROM panduan_referensi

               UNION ALL

               SELECT id, judul AS nama_dokumen, 'data/' AS folder_path,
                      tipe_file, 'done' AS status, NULL AS error_message,
                      dibuat_pada AS waktu_diunggah, 'lkps' AS kind
               FROM lkps

               ORDER BY folder_path, nama_dokumen""",
            (get_active_program_studi_id(),),
        ).fetchall()
    return [
        {**r, "id": str(r["id"]), "waktu_diunggah": r["waktu_diunggah"].isoformat()}
        for r in rows
    ]


@router.get("/registry")
def list_document_registry():
    """Folder-level registry (bulk default, lihat database.md #9b) -- dipakai
    UI rekomendasi dokumen utk browse/pilih folder tanpa lewat /documents
    (yg granularitasnya per-file bukti_dukung)."""
    with conn() as con:
        rows = con.execute(
            """SELECT id, chunk_id, folder_path, folder_name, document_count
               FROM document_registry ORDER BY folder_path"""
        ).fetchall()
    return [{**r, "id": str(r["id"])} for r in rows]


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: str, kind: Optional[str] = None):
    """Detail 1 dokumen (metadata, TANPA isi chunk -- lihat /chunks). Dipakai
    DocumentDetailPage fetch langsung by id, independen dari list -- supaya
    buka/refresh URL /documents/{id} langsung tetap jalan tanpa perlu
    docList sudah termuat lebih dulu. `kind` (evidence/panduan/lkps) memilih
    tabel sumber; tanpa `kind` dicoba berurutan di ketiga tabel (fallback)."""
    kinds = [kind] if kind in _DETAIL_QUERY_BY_KIND else list(_DETAIL_QUERY_BY_KIND)
    with conn() as con:
        for k in kinds:
            row = con.execute(_DETAIL_QUERY_BY_KIND[k], (document_id,)).fetchone()
            if row:
                return {**row, "id": str(row["id"]), "waktu_diunggah": row["waktu_diunggah"].isoformat()}
    raise HTTPException(404, "Dokumen tidak ditemukan")


@router.post("/upload", response_model=List[DocumentOut])
async def upload_documents(
    files: List[UploadFile] = File(...),
    paths: List[str] = Form(...),
):
    """Terima banyak file sekaligus. `paths` (form field terpisah, urutan
    sejajar dgn `files`) berisi relative path tiap file -- dari
    File.webkitRelativePath di browser saat upload folder, atau nama file
    polos kalau upload file tunggal."""
    if len(files) != len(paths):
        raise HTTPException(400, "Jumlah files dan paths tidak sama")

    program_studi_id = get_active_program_studi_id()
    created = []

    with conn() as con:
        for upload, raw_path in zip(files, paths):
            rel_path = _safe_relative_path(raw_path)
            ext = rel_path.suffix.lower()
            if ext not in ALLOWED_EXTS:
                raise HTTPException(400, f"Tipe file tidak didukung: {rel_path.name}")

            content = await upload.read()
            if len(content) > MAX_FILE_SIZE:
                raise HTTPException(400, f"File terlalu besar (>200MB): {rel_path.name}")
            if not content:
                raise HTTPException(400, f"File kosong: {rel_path.name}")

            dest = DOCUMENT_EVIDENCE_ROOT / rel_path
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(content)

            folder_path = str(rel_path.parent) + "/" if str(rel_path.parent) != "." else ""

            row = con.execute(
                """INSERT INTO bukti_dukung
                       (owner_tipe, program_studi_id, nama_dokumen, file_url,
                        tipe_file, folder_path, status)
                   VALUES ('PROGRAM_STUDI', %s, %s, %s, %s, %s, 'pending')
                   RETURNING id, nama_dokumen, folder_path, tipe_file, status,
                             error_message, waktu_diunggah, 'evidence' AS kind""",
                (program_studi_id, rel_path.name, str(dest), ext.lstrip("."), folder_path),
            ).fetchone()
            created.append(row)

    for row in created:
        _queue.enqueue("worker_tasks.process_document", str(row["id"]), job_timeout=1800)

    return [
        {**r, "id": str(r["id"]), "waktu_diunggah": r["waktu_diunggah"].isoformat()}
        for r in created
    ]


@router.get("/{document_id}/chunks")
def get_document_chunks(document_id: str, kind: Optional[str] = None):
    kinds = [kind] if kind in _CHUNKS_QUERY_BY_KIND else list(_CHUNKS_QUERY_BY_KIND)
    with conn() as con:
        if kind in _DETAIL_QUERY_BY_KIND:
            exists = con.execute(_DETAIL_QUERY_BY_KIND[kind], (document_id,)).fetchone()
            if not exists:
                raise HTTPException(404, "Dokumen tidak ditemukan")
            return [dict(r) for r in con.execute(_CHUNKS_QUERY_BY_KIND[kind], (document_id,)).fetchall()]

        for k in kinds:
            exists = con.execute(_DETAIL_QUERY_BY_KIND[k], (document_id,)).fetchone()
            if exists:
                return [dict(r) for r in con.execute(_CHUNKS_QUERY_BY_KIND[k], (document_id,)).fetchall()]
    raise HTTPException(404, "Dokumen tidak ditemukan")


@router.delete("/{document_id}")
def delete_document(document_id: str):
    with conn() as con:
        row = con.execute(
            "SELECT file_url FROM bukti_dukung WHERE id = %s", (document_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Dokumen tidak ditemukan")

        chunk_ids = [r["chunk_id"] for r in con.execute(
            "SELECT chunk_id FROM chunk_bukti_dukung WHERE id_bukti_dukung = %s",
            (document_id,),
        ).fetchall()]

        con.execute("DELETE FROM bukti_dukung WHERE id = %s", (document_id,))  # CASCADE chunk_bukti_dukung

    if chunk_ids:
        try:
            from lib.retrieval import get_or_create_collection
            get_or_create_collection("evidence").delete(ids=chunk_ids)
        except Exception:
            pass  # embedding orphan di Chroma bukan fatal, chunk Postgres sudah bersih

    file_path = Path(row["file_url"])
    if file_path.exists():
        file_path.unlink()

    return {"status": "ok"}
