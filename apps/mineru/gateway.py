"""Gateway HTTP untuk MinerU 4.x -- service MinerU sendiri, terpisah dari `ai`.

Membungkus `mineru parse` (CLI MinerU 4.x) persis seperti notebook
ekstrak_mineru_rubrik.ipynb dan ekstraksi_mineru_evidence.ipynb:
`run_mineru` dan `mineru_parse` di bawah disalin dari notebook (bagian yang
memanggil CLI dan menyambung kursor `truncated`), jadi keluaran markdown-nya --
termasuk penanda `<!-- page N of M -->` -- sama dengan yang Anda lihat di notebook.

Kenapa service sendiri:
  - MinerU 4.x (subperintah `parse`, tier basic/standard) tidak bisa dijalankan
    oleh MinerU 3.4.5 di image `ai`, dan keluaran 3.4.5 tidak memuat penanda halaman.
  - GPU: satu container yang memegang model MinerU, bukan worker + notebook +
    subprocess berebut 6 GB VRAM (CUDA OOM pada SK Pendirian PENS).

Dua mode, bisa dialihkan tanpa mengubah kode (env MINERU_MODE, atau field `mode`
per permintaan):
  local -> parse-server MinerU di container ini, GPU lokal   (REMOTE = False di notebook)
  api   -> mineru.net lewat `--remote`, tanpa GPU               (REMOTE = True)
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

import pypdfium2 as pdfium
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

MINERU = os.environ.get("MINERU_BIN", "mineru")
DEFAULT_MODE = os.environ.get("MINERU_MODE", "local")     # local | api
DEFAULT_TIER = os.environ.get("MINERU_TIER", "basic")     # basic = pipeline saja
WAIT_SEC = int(os.environ.get("MINERU_WAIT_SEC", "1800"))
SERVER_READY_SEC = int(os.environ.get("MINERU_SERVER_READY_SEC", "300"))

MODES = {"local", "api"}
TIERS = {"flash", "basic", "standard", "advanced"}

# Satu pekerjaan lokal pada satu waktu: parse-server memegang model di GPU, dan
# dua parse bersamaan di kartu 6 GB adalah resep CUDA OOM. Mode api tidak dikunci.
_gpu_lock = threading.Lock()


# ----------------------------------------------------------------------------
# Disalin dari notebook (ekstrak_mineru_rubrik.ipynb sel 4 + 6, identik dengan
# ekstraksi_mineru_evidence.ipynb sel 4 + 6)
# ----------------------------------------------------------------------------


def run_mineru(*args, timeout=None):
    return subprocess.run([str(MINERU), *map(str, args)], capture_output=True, text=True, timeout=timeout)


def mineru_status():
    return json.loads(run_mineru("server", "status", "--json").stdout or "{}")


def mineru_parse(pdf_path, pages, tier, remote, wait_sec=WAIT_SEC):
    base = ["parse", pdf_path, "--pages", pages, "--tier", tier, "--wait", wait_sec,
            "--json", "--limit", 50_000_000] + (["--remote"] if remote else [])
    proc = run_mineru(*base, "--force", timeout=wait_sec + 120)
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout).strip()[-800:])

    data = json.loads(proc.stdout)
    if data["parse"]["status"] != "done":
        raise RuntimeError(f"Status parse: {data['parse']['status']} — {data['parse'].get('tip')}")
    chunks = [data["content"]["content"]]
    while data["content"].get("truncated"):       # output terpotong -> lanjut via cursor
        data = json.loads(run_mineru(*base, "--after", data["content"]["next_request"]["after"]).stdout)
        chunks.append(data["content"]["content"])
    return "".join(chunks)


# ----------------------------------------------------------------------------
# Tambahan gateway (bukan dari notebook)
# ----------------------------------------------------------------------------


def ensure_server(mode: str, tier: str, timeout: int = SERVER_READY_SEC) -> None:
    """Pastikan server doclib hidup; untuk mode lokal tunggu parse-server siap.
    Logikanya sama dengan `start_mineru` di notebook."""
    if not mineru_status().get("running"):
        run_mineru("server", "start")
    if mode != "local":
        return
    deadline = time.time() + timeout
    while time.time() < deadline:
        local = mineru_status().get("parse_server", {}).get("local", {})
        if local.get("healthy") and tier in local.get("supported_tiers", []):
            return
        time.sleep(5)
    raise TimeoutError("Parse-server lokal tidak siap. Cek ~/.mineru/logs/doclib.parse-server.stderr.log")


def _aman(nama: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", nama) or "dokumen.pdf"


def _page_count(pdf_path: Path) -> int:
    pdf = pdfium.PdfDocument(str(pdf_path))
    try:
        return len(pdf)
    finally:
        pdf.close()


def _parse_blocking(pdf_path: Path, start_page: int | None, tier: str, mode: str) -> dict:
    total = _page_count(pdf_path)
    # sama dengan notebook rubrik: PAGE_START-N; evidence: "all"
    pages = "all" if not start_page or start_page <= 1 else f"{start_page}-{total}"
    remote = mode == "api"

    mulai = time.perf_counter()
    if remote:
        ensure_server(mode, tier)
        markdown = mineru_parse(str(pdf_path), pages, tier, remote)
    else:
        with _gpu_lock:
            ensure_server(mode, tier)
            markdown = mineru_parse(str(pdf_path), pages, tier, remote)
    return {
        "markdown": markdown,
        "total_pages": total,
        "pages": pages,
        "tier": tier,
        "mode": mode,
        "seconds": round(time.perf_counter() - mulai, 3),
    }


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Nyalakan server di latar belakang supaya permintaan pertama tidak menunggu
    model dimuat. Kegagalan di sini tidak boleh menjatuhkan gateway -- /health
    melaporkannya, dan setiap /parse mencoba ensure_server lagi."""
    def _jalan():
        try:
            ensure_server(DEFAULT_MODE, DEFAULT_TIER)
        except Exception:  # noqa: BLE001
            pass
    threading.Thread(target=_jalan, daemon=True).start()
    yield


app = FastAPI(title="MinerU gateway", lifespan=lifespan)


@app.get("/health")
def health():
    try:
        status = mineru_status()
    except Exception as exc:  # noqa: BLE001
        status = {"error": str(exc)[:200]}
    local = status.get("parse_server", {}).get("local", {}) if isinstance(status, dict) else {}
    return {
        "ok": True,
        "mode": DEFAULT_MODE,
        "tier": DEFAULT_TIER,
        "server_running": bool(status.get("running")) if isinstance(status, dict) else False,
        "local_parse_server_healthy": bool(local.get("healthy")),
        "api_key_configured": bool(os.environ.get("MINERU_API_KEY")),
    }


@app.post("/parse")
async def parse(
    file: UploadFile = File(...),
    start_page: int | None = Form(None),
    tier: str | None = Form(None),
    mode: str | None = Form(None),
):
    mode = (mode or DEFAULT_MODE).lower()
    tier = (tier or DEFAULT_TIER).lower()
    if mode not in MODES:
        raise HTTPException(400, f"mode harus salah satu dari {sorted(MODES)}")
    if tier not in TIERS:
        raise HTTPException(400, f"tier harus salah satu dari {sorted(TIERS)}")
    if mode == "api" and not os.environ.get("MINERU_API_KEY"):
        raise HTTPException(400, "mode api butuh MINERU_API_KEY di environment container mineru")

    with tempfile.TemporaryDirectory(prefix="mineru_") as tmp:
        pdf_path = Path(tmp) / _aman(file.filename or "dokumen.pdf")
        pdf_path.write_bytes(await file.read())
        try:
            return await run_in_threadpool(_parse_blocking, pdf_path, start_page, tier, mode)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(502, str(exc)[-800:]) from exc
