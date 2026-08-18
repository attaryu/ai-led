"""File upload API routes.

POST /upload/matrix    — Upload Matriks Penilaian PDF; parses + caches to RUBRIC_CACHE_PATH.
POST /upload/led       — Upload LED as .pdf or .docx; triggers background chunking + ChromaDB indexing.
POST /upload/lkps      — Upload LKPS Excel; loads LKPSRegistry and injects into lkps_tool.
POST /upload/laporan   — Upload Laporan_AK.xlsx; stores it for use by /assessment/start.
GET  /upload/status    — Returns which files have been uploaded and LED indexing state.

All files are saved to UPLOAD_DIR (default: data/uploads).
LED indexing writes to CHROMA_PERSIST_DIR (default: data/chroma_db).
Rubric cache is written to RUBRIC_CACHE_PATH (default: data/rubric_cache/matrix.json).
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/upload", tags=["upload"])

UPLOAD_DIR: str = os.environ.get("UPLOAD_DIR", "data/uploads")
CHROMA_PERSIST_DIR: str = os.environ.get("CHROMA_PERSIST_DIR", "data/chroma_db")
RUBRIC_CACHE_PATH: str = os.environ.get(
    "RUBRIC_CACHE_PATH", "data/rubric_cache/matrix.json"
)

MATRIX_FILENAME = "matrix.pdf"
LED_EXTENSIONS = (".pdf", ".docx")
LKPS_FILENAME = "lkps.xlsx"
LAPORAN_FILENAME = "laporan_ak.xlsx"


def _led_filename(original_filename: str) -> str:
    """Preserve the uploaded LED's extension so indexing can branch on it."""
    ext = os.path.splitext(original_filename.lower())[1]
    return f"led{ext}"

# ── In-process state (prototype-grade; resets on restart) ────────────────────

_led_index_status: dict = {
    "state": "idle",    # idle | indexing | ready | error
    "chunk_count": 0,
    "error": None,
}

_matrix_status: dict = {
    "rubric_count": 0,
    "error": None,
}

_uploaded: dict[str, bool] = {
    "matrix": False,
    "led": False,
    "lkps": False,
    "laporan": False,
}


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


def _ensure_upload_dir() -> None:
    os.makedirs(UPLOAD_DIR, exist_ok=True)


def _save_upload(file: UploadFile, filename: str) -> tuple[str, int]:
    """Save an uploaded file to UPLOAD_DIR. Returns (full_path, size_bytes)."""
    _ensure_upload_dir()
    dest = os.path.join(UPLOAD_DIR, filename)
    size = 0
    with open(dest, "wb") as f:
        while chunk := file.file.read(1024 * 256):  # 256 KB chunks
            f.write(chunk)
            size += len(chunk)
    return dest, size


# ── Background: LED indexing ─────────────────────────────────────────────────


def _index_led_background(led_path: str) -> None:
    """Chunk the LED file (.pdf or .docx) and index into ChromaDB. Runs in a
    thread via BackgroundTasks."""
    global _led_index_status
    _led_index_status = {"state": "indexing", "chunk_count": 0, "error": None}
    try:
        from vectorstore.chroma_store import index_led_chunks

        if led_path.lower().endswith(".docx"):
            from ingestion.led_docx_chunker import chunk_led_docx
            chunks = chunk_led_docx(led_path)
        else:
            from ingestion.led_chunker import chunk_led_pdf
            chunks = chunk_led_pdf(led_path)

        index_led_chunks(chunks, CHROMA_PERSIST_DIR)
        _led_index_status = {
            "state": "ready",
            "chunk_count": len(chunks),
            "error": None,
        }
        logger.info("LED indexed: %d chunks into %s", len(chunks), CHROMA_PERSIST_DIR)
    except Exception as exc:
        logger.exception("LED indexing failed")
        _led_index_status = {"state": "error", "chunk_count": 0, "error": str(exc)}


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/status", response_model=UploadStatusResponse)
def get_upload_status() -> UploadStatusResponse:
    """Return which files are uploaded, LED indexing state, and matrix rubric count."""
    # Auto-detect matrix from disk so a pre-existing cache is reflected after restart
    if not _uploaded["matrix"] and os.path.exists(RUBRIC_CACHE_PATH):
        try:
            import json
            with open(RUBRIC_CACHE_PATH, encoding="utf-8") as f:
                cached = json.load(f)
            _uploaded["matrix"] = True
            _matrix_status["rubric_count"] = len(cached)
        except Exception:
            pass

    return UploadStatusResponse(
        matrix_uploaded=_uploaded["matrix"],
        matrix_rubric_count=_matrix_status["rubric_count"],
        matrix_error=_matrix_status["error"],
        led_uploaded=_uploaded["led"],
        lkps_uploaded=_uploaded["lkps"],
        laporan_uploaded=_uploaded["laporan"],
        led_index_state=_led_index_status["state"],
        led_chunk_count=_led_index_status["chunk_count"],
        led_error=_led_index_status["error"],
    )


@router.post("/matrix", response_model=MatrixUploadResponse)
async def upload_matrix(file: UploadFile) -> MatrixUploadResponse:
    """Upload Matriks Penilaian PDF; parses rubrics and writes them to RUBRIC_CACHE_PATH.

    The cache is consumed by `agent.tools.rubric_tool._get_rubrics()` and by the
    default-78-indicator path in `/assessment/start`. Re-uploading replaces the cache.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF (.pdf)")

    path, _ = await asyncio.get_event_loop().run_in_executor(
        None, _save_upload, file, MATRIX_FILENAME
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
        _uploaded["matrix"] = False
        raise HTTPException(
            status_code=422, detail=f"Failed to parse matrix PDF: {exc}"
        ) from exc

    _matrix_status["rubric_count"] = count
    _matrix_status["error"] = None
    _uploaded["matrix"] = True

    return MatrixUploadResponse(
        message=f"Matrix parsed: {count} rubrics cached.",
        filename=MATRIX_FILENAME,
        rubric_count=count,
        cache_path=RUBRIC_CACHE_PATH,
    )


@router.post("/led", response_model=LedUploadResponse)
async def upload_led(
    file: UploadFile,
    background_tasks: BackgroundTasks,
) -> LedUploadResponse:
    """Upload the LED as .pdf or .docx. Indexing into ChromaDB starts immediately
    in the background."""
    if not file.filename or not file.filename.lower().endswith(LED_EXTENSIONS):
        raise HTTPException(
            status_code=400, detail="File must be a PDF (.pdf) or Word document (.docx)"
        )

    led_filename = _led_filename(file.filename)
    path, size = await asyncio.get_event_loop().run_in_executor(
        None, _save_upload, file, led_filename
    )
    _uploaded["led"] = True

    background_tasks.add_task(_index_led_background, path)

    return LedUploadResponse(
        message="LED uploaded. Indexing started in the background — poll /upload/status for progress.",
        filename=led_filename,
        size_bytes=size,
    )


@router.post("/lkps", response_model=LkpsUploadResponse)
async def upload_lkps(file: UploadFile) -> LkpsUploadResponse:
    """Upload the LKPS Excel. Loads LKPSRegistry immediately and injects into lkps_tool."""
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="File must be an Excel file (.xlsx or .xls)")

    path, _ = await asyncio.get_event_loop().run_in_executor(
        None, _save_upload, file, LKPS_FILENAME
    )

    def _load_and_inject(p: str):
        from agent.tools.lkps_tool import set_lkps_registry
        from ingestion.lkps_loader import load_lkps

        registry = load_lkps(p)
        set_lkps_registry(registry)
        return registry

    registry = await asyncio.get_event_loop().run_in_executor(None, _load_and_inject, path)

    all_sheets = len(registry.sheets)
    non_empty = len([v for v in registry.sheets.values() if not v.empty])
    _uploaded["lkps"] = True

    return LkpsUploadResponse(
        message="LKPS Excel uploaded and registry loaded.",
        filename=LKPS_FILENAME,
        sheet_count=all_sheets,
        non_empty_sheets=non_empty,
    )


@router.post("/laporan", response_model=LaporanUploadResponse)
async def upload_laporan(file: UploadFile) -> LaporanUploadResponse:
    """Upload Laporan_AK.xlsx. Returns the server-side path for use with /assessment/start."""
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="File must be an Excel file (.xlsx or .xls)")

    path, size = await asyncio.get_event_loop().run_in_executor(
        None, _save_upload, file, LAPORAN_FILENAME
    )
    _uploaded["laporan"] = True

    return LaporanUploadResponse(
        message="Laporan_AK.xlsx uploaded.",
        filename=LAPORAN_FILENAME,
        laporan_path=path,
        size_bytes=size,
    )
