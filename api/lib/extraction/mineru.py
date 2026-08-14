"""Ekstraksi PDF -> Markdown via MinerU CLI. Diadaptasi persis dari
code/mineru_extract_chunk.ipynb & code/new_extract_mechanism.ipynb Cell 5.

Beda dari notebook: MinerU di sini terinstall LANGSUNG di image Docker worker
(bukan dipanggil via subprocess ke venv terpisah di host) -- lihat
web/api/Dockerfile.worker. Command CLI & parameter (backend/method/lang)
tetap identik.
"""
import shutil
import subprocess
from pathlib import Path

MINERU_BACKEND = "pipeline"
MINERU_METHOD = "auto"
MINERU_LANG = "ch"


def _mineru_bin() -> str:
    found = shutil.which("mineru")
    if not found:
        raise RuntimeError("executable 'mineru' tidak ditemukan di PATH -- cek instalasi di Dockerfile.worker")
    return found


def mineru_extract(pdf_path: Path, out_dir: Path) -> Path:
    """Jalankan MinerU untuk 1 PDF, kembalikan path .md hasil."""
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = pdf_path.stem
    cmd = [
        _mineru_bin(), "-p", str(pdf_path), "-o", str(out_dir),
        "-b", MINERU_BACKEND, "-m", MINERU_METHOD, "-l", MINERU_LANG,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    md_files = list((out_dir / stem).rglob("*.md"))
    if not md_files:
        md_files = list(out_dir.rglob(f"{stem}*/**/*.md"))
    md_files = sorted(set(md_files), key=lambda p: len(str(p)))
    if proc.returncode != 0 or not md_files:
        stderr_tail = "\n".join(proc.stderr.strip().splitlines()[-8:])
        raise RuntimeError(f"MinerU gagal untuk {pdf_path.name}: {stderr_tail}")
    return md_files[0]


def convert_to_pdf(src_path: Path, out_dir: Path) -> Path:
    """Convert doc/docx/ppt/pptx -> pdf via LibreOffice headless."""
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"{src_path.stem}.pdf"
    cmd = ["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", str(out_dir), str(src_path)]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if not target.exists():
        raise RuntimeError(f"Konversi gagal utk {src_path.name}: {proc.stderr[-500:]}")
    return target
