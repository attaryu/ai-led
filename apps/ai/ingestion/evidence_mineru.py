"""PDF -> Markdown extraction via the MinerU CLI (`pip install "mineru[core]"`).

Adapted from a sibling prototype's lib/extraction/mineru.py — same CLI
invocation, but resolves the binary relative to sys.executable as a
fallback. shutil.which() alone misses it when this process was started as
`.venv/Scripts/python.exe worker.py` without activating the venv (PATH
never gets updated), which is exactly how worker.py is launched here.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

MINERU_BACKEND = "pipeline"
MINERU_METHOD = "auto"
MINERU_LANG = "ch"


def _mineru_bin() -> str:
    found = shutil.which("mineru")
    if found:
        return found
    venv_bin_dir = os.path.dirname(sys.executable)
    candidate = os.path.join(venv_bin_dir, "mineru.exe" if os.name == "nt" else "mineru")
    if os.path.isfile(candidate):
        return candidate
    raise RuntimeError(
        "executable 'mineru' tidak ditemukan di PATH maupun venv Scripts/bin "
        "-- cek instalasi (pip install \"mineru[core]\")"
    )


def mineru_extract(pdf_path: Path, out_dir: Path) -> Path:
    """Run MinerU on one PDF, return the resulting .md path."""
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = pdf_path.stem
    cmd = [
        _mineru_bin(), "-p", str(pdf_path), "-o", str(out_dir),
        "-b", MINERU_BACKEND, "-m", MINERU_METHOD, "-l", MINERU_LANG,
    ]
    timeout = int(os.environ.get("MINERU_TIMEOUT_SECONDS", "300"))
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            f"MinerU timeout setelah {timeout}s untuk {pdf_path.name}"
        ) from exc
    md_files = list((out_dir / stem).rglob("*.md"))
    if not md_files:
        md_files = list(out_dir.rglob(f"{stem}*/**/*.md"))
    md_files = sorted(set(md_files), key=lambda p: len(str(p)))
    if proc.returncode != 0 or not md_files:
        stderr_tail = "\n".join(proc.stderr.strip().splitlines()[-8:])
        raise RuntimeError(f"MinerU gagal untuk {pdf_path.name}: {stderr_tail}")
    return md_files[0]
