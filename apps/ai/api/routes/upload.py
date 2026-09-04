"""File upload API routes.

POST /upload/matrix    — Upload Matriks Penilaian PDF; parses + caches to RUBRIC_CACHE_PATH.
POST /upload/led       — Upload LED as .pdf or .docx; triggers background chunking + pgvector indexing.
POST /upload/lkps      — Upload LKPS Excel; loads LKPSRegistry and injects into lkps_tool.
POST /upload/laporan   — Upload Laporan_AK.xlsx; stores it for use by /assessment/start.
GET  /upload/status    — Returns which files have been uploaded and LED indexing state.

Files save under UPLOAD_DIR/{tenant_id}/{dokumen_id}/, chunk embeddings go
into Postgres (led_chunk_embeddings, DATABASE_URL). RUBRIC_CACHE_PATH
(matrix) is NOT tenant-scoped —
the AMI rubric is shared national reference data, same as RubrikKriteria
having no tenantId in schema.prisma.

tenant_id/dokumen_id are trusted from the caller (apps/ai has no auth of
its own) — see integration-plan.md at the repo root.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Form, HTTPException, UploadFile
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/upload", tags=["upload"])

UPLOAD_DIR: str = os.environ.get("UPLOAD_DIR", "data/uploads")
RUBRIC_CACHE_PATH: str = os.environ.get(
    "RUBRIC_CACHE_PATH", "data/rubric_cache/matrix.json"
)

LED_EXTENSIONS = (".pdf", ".docx")

DocKey = tuple[str, str]  # (tenant_id, dokumen_id)


def _path_segment(value: str) -> str:
    """Reject path-traversal characters — no /, .., or empty."""
    if not value or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise HTTPException(
            status_code=400,
            detail="tenant_id/dokumen_id hanya boleh berisi huruf, angka, '_', '-'",
        )
    return value


def _doc_dir(tenant_id: str, dokumen_id: str) -> str:
    return os.path.join(UPLOAD_DIR, _path_segment(tenant_id), _path_segment(dokumen_id))


def _led_filename(original_filename: str) -> str:
    """Preserve the uploaded LED's extension so indexing can branch on it."""
    ext = os.path.splitext(original_filename.lower())[1]
    return f"led{ext}"


def _existing_led_path(tenant_id: str, dokumen_id: str) -> str | None:
    """Find a previously-uploaded LED file on disk for this document, regardless of extension."""
    for ext in LED_EXTENSIONS:
        p = os.path.join(_doc_dir(tenant_id, dokumen_id), f"led{ext}")
        if os.path.exists(p):
            return p
    return None


# ── In-process state (prototype-grade; resets on restart), keyed per document ──

_led_index_status: dict[DocKey, dict] = {}
_matrix_status: dict = {"rubric_count": 0, "error": None}
_uploaded: dict[DocKey, dict[str, bool]] = {}


def _doc_state(key: DocKey) -> dict[str, bool]:
    return _uploaded.setdefault(key, {"led": False, "lkps": False, "laporan": False})


def _led_status(key: DocKey) -> dict:
    return _led_index_status.setdefault(
        key, {"state": "idle", "chunk_count": 0, "error": None}
    )


# ── Response models ──────────────────────────────────────────────────────────


class UploadStatusResponse(BaseModel):
    matrix_uploaded: bool
    matrix_rubric_count: int
    matrix_error: str | None
    led_uploaded: bool
    lkps_uploaded: bool
    laporan_uploaded: bool
    led_index_state: Literal["idle", "indexing", "ready", "error"]
    led_chunk_count: int
    led_error: str | None


class MatrixUploadResponse(BaseModel):
    message: str
    filename: str
    rubric_count: int
    cache_path: str


class LedUploadResponse(BaseModel):
    message: str
    filename: str
    size_bytes: int


class LkpsUploadResponse(BaseModel):
    message: str
    filename: str
    sheet_count: int
    non_empty_sheets: int


class LaporanUploadResponse(BaseModel):
    message: str
    filename: str
    laporan_path: str
    size_bytes: int


# ── Helpers ──────────────────────────────────────────────────────────────────


def _save_upload(file: UploadFile, dest_dir: str, filename: str) -> tuple[str, int]:
    """Save an uploaded file to dest_dir/filename. Returns (full_path, size_bytes)."""
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, filename)
    size = 0
    with open(dest, "wb") as f:
        while chunk := file.file.read(1024 * 256):  # 256 KB chunks
            f.write(chunk)
            size += len(chunk)
    return dest, size


# ── Background: LED indexing ─────────────────────────────────────────────────


def _index_led_background(led_path: str, tenant_id: str, dokumen_id: str) -> None:
    """Chunk the LED file (.pdf or .docx) and index into pgvector. Runs in a
    thread via BackgroundTasks."""
    key = (tenant_id, dokumen_id)
    _led_index_status[key] = {"state": "indexing", "chunk_count": 0, "error": None}
    try:
        from vectorstore.pgvector_store import index_led_chunks

        if led_path.lower().endswith(".docx"):
            from ingestion.led_docx_chunker import chunk_led_docx
            chunks = chunk_led_docx(led_path)
        else:
            from ingestion.led_chunker import chunk_led_pdf
            chunks = chunk_led_pdf(led_path)

        index_led_chunks(chunks, tenant_id, dokumen_id)
        _led_index_status[key] = {
            "state": "ready",
            "chunk_count": len(chunks),
            "error": None,
        }
        logger.info(
            "LED indexed for tenant=%s dokumen=%s: %d chunks",
            tenant_id,
            dokumen_id,
            len(chunks),
        )
    except Exception as exc:
        logger.exception("LED indexing failed for tenant=%s dokumen=%s", tenant_id, dokumen_id)
        _led_index_status[key] = {"state": "error", "chunk_count": 0, "error": str(exc)}


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/status", response_model=UploadStatusResponse)
def get_upload_status(tenant_id: str, dokumen_id: str) -> UploadStatusResponse:
    """Return which files are uploaded, LED indexing state, and matrix rubric
    count, for one (tenant_id, dokumen_id)."""
    key = (_path_segment(tenant_id), _path_segment(dokumen_id))

    # Auto-detect matrix from disk so a pre-existing cache is reflected after
    # restart — matrix is shared, not per-document, so this stays global.
    if not _matrix_status.get("rubric_count") and os.path.exists(RUBRIC_CACHE_PATH):
        try:
            import json
            with open(RUBRIC_CACHE_PATH, encoding="utf-8") as f:
                cached = json.load(f)
            _matrix_status["rubric_count"] = len(cached)
        except Exception:
            pass

    doc_state = _doc_state(key)
    led_status = _led_status(key)

    # Auto-detect LED from disk: the file and its pgvector index both
    # survive a restart even though the in-process status dicts don't.
    if not doc_state["led"]:
        led_path = _existing_led_path(*key)
        if led_path:
            doc_state["led"] = True
            if led_status["state"] == "idle":
                try:
                    from vectorstore.pgvector_store import get_led_chunk_count

                    count = get_led_chunk_count(*key)
                    if count > 0:
                        led_status["state"] = "ready"
                        led_status["chunk_count"] = count
                except Exception:
                    pass

    # Auto-detect LKPS from disk: the LKPSRegistry only lives in an
    # in-process singleton (agent.tools.lkps_tool), lost on restart.
    if not doc_state["lkps"]:
        lkps_path = os.path.join(_doc_dir(*key), "lkps.xlsx")
        if os.path.exists(lkps_path):
            try:
                from agent.tools.lkps_tool import set_lkps_registry
                from ingestion.lkps_loader import load_lkps

                set_lkps_registry(*key, load_lkps(lkps_path))
                doc_state["lkps"] = True
            except Exception:
                pass

    return UploadStatusResponse(
        matrix_uploaded=_matrix_status["rubric_count"] > 0,
        matrix_rubric_count=_matrix_status["rubric_count"],
        matrix_error=_matrix_status["error"],
        led_uploaded=doc_state["led"],
        lkps_uploaded=doc_state["lkps"],
        laporan_uploaded=doc_state["laporan"],
        led_index_state=led_status["state"],
        led_chunk_count=led_status["chunk_count"],
        led_error=led_status["error"],
    )


@router.post("/matrix", response_model=MatrixUploadResponse)
async def upload_matrix(file: UploadFile) -> MatrixUploadResponse:
    """Upload Matriks Penilaian PDF; parses rubrics and writes them to RUBRIC_CACHE_PATH.

    Not tenant-scoped — see module docstring. Re-uploading replaces the
    (shared) cache for everyone, same as before.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF (.pdf)")

    matrix_dir = os.path.join(UPLOAD_DIR, "_shared")
    path, _ = await asyncio.get_event_loop().run_in_executor(
        None, _save_upload, file, matrix_dir, "matrix.pdf"
    )

    def _parse_and_cache(p: str) -> int:
        from agent.tools.rubric_tool import _rubric_cache
        from ingestion.matrix_parser import cache_rubrics, parse_matrix_pdf

        rubrics = parse_matrix_pdf(p)
        cache_rubrics(rubrics, RUBRIC_CACHE_PATH)
        # Invalidate in-memory cache so subsequent calls reload from new file
        _rubric_cache.pop("rubrics", None)
        return len(rubrics)

    try:
        count = await asyncio.get_event_loop().run_in_executor(
            None, _parse_and_cache, path
        )
    except Exception as exc:
        logger.exception("Matrix parsing failed")
        _matrix_status["error"] = str(exc)
        raise HTTPException(
            status_code=422, detail=f"Failed to parse matrix PDF: {exc}"
        ) from exc

    _matrix_status["rubric_count"] = count
    _matrix_status["error"] = None

    return MatrixUploadResponse(
        message=f"Matrix parsed: {count} rubrics cached.",
        filename="matrix.pdf",
        rubric_count=count,
        cache_path=RUBRIC_CACHE_PATH,
    )


@router.post("/led", response_model=LedUploadResponse)
async def upload_led(
    background_tasks: BackgroundTasks,
    file: UploadFile,
    tenant_id: str = Form(...),
    dokumen_id: str = Form(...),
) -> LedUploadResponse:
    """Upload one document's LED as .pdf or .docx. Chunk embedding into
    Postgres (led_chunk_embeddings) starts immediately in the background."""
    if not file.filename or not file.filename.lower().endswith(LED_EXTENSIONS):
        raise HTTPException(
            status_code=400, detail="File must be a PDF (.pdf) or Word document (.docx)"
        )

    tenant_id, dokumen_id = _path_segment(tenant_id), _path_segment(dokumen_id)
    key = (tenant_id, dokumen_id)
    led_filename = _led_filename(file.filename)
    path, size = await asyncio.get_event_loop().run_in_executor(
        None, _save_upload, file, _doc_dir(tenant_id, dokumen_id), led_filename
    )
    _doc_state(key)["led"] = True

    background_tasks.add_task(_index_led_background, path, tenant_id, dokumen_id)

    return LedUploadResponse(
        message="LED uploaded. Indexing started in the background — poll /upload/status for progress.",
        filename=led_filename,
        size_bytes=size,
    )


@router.post("/lkps", response_model=LkpsUploadResponse)
async def upload_lkps(
    file: UploadFile,
    tenant_id: str = Form(...),
    dokumen_id: str = Form(...),
) -> LkpsUploadResponse:
    """Upload one document's LKPS Excel. Loads LKPSRegistry immediately and
    injects it into lkps_tool, scoped to (tenant_id, dokumen_id)."""
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="File must be an Excel file (.xlsx or .xls)")

    tenant_id, dokumen_id = _path_segment(tenant_id), _path_segment(dokumen_id)
    key = (tenant_id, dokumen_id)
    path, _ = await asyncio.get_event_loop().run_in_executor(
        None, _save_upload, file, _doc_dir(tenant_id, dokumen_id), "lkps.xlsx"
    )

    def _load_and_inject(p: str):
        from agent.tools.lkps_tool import set_lkps_registry
        from ingestion.lkps_loader import load_lkps

        registry = load_lkps(p)
        set_lkps_registry(tenant_id, dokumen_id, registry)
        return registry

    registry = await asyncio.get_event_loop().run_in_executor(None, _load_and_inject, path)

    all_sheets = len(registry.sheets)
    non_empty = len([v for v in registry.sheets.values() if not v.empty])
    _doc_state(key)["lkps"] = True

    return LkpsUploadResponse(
        message="LKPS Excel uploaded and registry loaded.",
        filename="lkps.xlsx",
        sheet_count=all_sheets,
        non_empty_sheets=non_empty,
    )


@router.post("/laporan", response_model=LaporanUploadResponse)
async def upload_laporan(
    file: UploadFile,
    tenant_id: str = Form(...),
    dokumen_id: str = Form(...),
) -> LaporanUploadResponse:
    """Upload one document's Laporan_AK.xlsx. Returns the server-side path for
    use with /assessment/start."""
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="File must be an Excel file (.xlsx or .xls)")

    tenant_id, dokumen_id = _path_segment(tenant_id), _path_segment(dokumen_id)
    key = (tenant_id, dokumen_id)
    path, size = await asyncio.get_event_loop().run_in_executor(
        None, _save_upload, file, _doc_dir(tenant_id, dokumen_id), "laporan_ak.xlsx"
    )
    _doc_state(key)["laporan"] = True

    return LaporanUploadResponse(
        message="Laporan_AK.xlsx uploaded.",
        filename="laporan_ak.xlsx",
        laporan_path=path,
        size_bytes=size,
    )
