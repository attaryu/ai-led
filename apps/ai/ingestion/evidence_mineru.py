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


def mineru_extract(pdf_path: Path, out_dir: Path, start_page: int | None = None) -> Path:
    """Run MinerU on one PDF, return the resulting .md path.

    start_page: 0-based first page (MinerU `-s`); None = from the first page (evidence). Panduan skips its cover pages."""
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = pdf_path.stem
    cmd = [
        _mineru_bin(), "-p", str(pdf_path), "-o", str(out_dir),
        "-b", MINERU_BACKEND, "-m", MINERU_METHOD, "-l", MINERU_LANG,
    ]
    if start_page is not None:
        cmd += ["-s", str(start_page)]
    timeout = int(os.environ.get("MINERU_TIMEOUT_SECONDS", "1800"))  # dimas RQ job_timeout=1800
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
        stderr_full = proc.stderr or ""
        if "Incorrect password" in stderr_full or "PdfiumError" in stderr_full:
            raise RuntimeError(
                f"{pdf_path.name} terkunci kata sandi -- hapus proteksi PDF-nya lalu unggah ulang."
            )
        stderr_tail = "\n".join(stderr_full.strip().splitlines()[-8:])
        raise RuntimeError(f"MinerU gagal untuk {pdf_path.name}: {stderr_tail}")
    return md_files[0]


def mineru_extract_paged(pdf_path: Path, out_dir: Path, start_page: int | None = None) -> Path:
    """Seperti mineru_extract, tapi markdown-nya diberi penanda halaman
    `<!-- page N of M -->` di awal tiap halaman.

    ponytail: algoritma chunking v2 (evidence_chunking_v2.py) dan notebook
    ekstraksi_mineru_evidence.ipynb memakai penanda itu -- keluaran MinerU 4.x
    (`mineru parse`). MinerU 3.4.5 yang terpasang di image TIDAK menulisnya
    (diukur: 0 penanda pada matriks 35 halaman, versus 9 dari 9 halaman pada
    keluaran 4.0.8). Tanpa penanda, langkah 2 (buang header/footer berulang,
    butuh >= HF_MIN_PAGES halaman) mati diam-diam dan page_start/page_end
    semuanya 1.

    Penanda disisipkan dengan membangun ulang markdown PER HALAMAN dari
    `*_middle.json` lewat fungsi yang sama dengan yang dipakai MinerU untuk
    `.md` bawaan (union_make). Diverifikasi: tanpa penanda, gabungan per-halaman
    identik dengan `.md` bawaan.

    Batas yang harus diketahui: ini meniru PENANDA-nya, bukan seluruh keluaran
    4.0.8 -- isi markdown tetap dari MinerU 3.4.5, jadi urutan baca/tabel/heading
    bisa berbeda tipis dari yang terlihat di notebook.

    Gagal-aman: bila middle.json tidak ada/rusak, kembalikan .md bawaan apa adanya.
    """
    md_path = mineru_extract(pdf_path, out_dir, start_page)
    middle = next(iter(sorted(md_path.parent.glob("*_middle.json"))), None)
    if middle is None:
        return md_path
    try:
        import json

        from mineru.backend.pipeline.pipeline_middle_json_mkcontent import union_make
        from mineru.utils.enum_class import MakeMode

        pages = json.loads(middle.read_text(encoding="utf-8"))["pdf_info"]
        try:
            import pypdfium2 as pdfium

            pdf = pdfium.PdfDocument(str(pdf_path))
            total = len(pdf)
            pdf.close()
        except Exception:
            total = max((p["page_idx"] for p in pages), default=-1) + 1

        bagian = []
        for page in pages:
            isi = union_make([page], MakeMode.MM_MD, "images")
            # page_idx RELATIF terhadap halaman awal yang diparse: diukur dengan `-s 1`,
            # middle.json berisi page_idx 0..33 (bukan 1..34). Tambahkan offset
            # start_page supaya nomor halaman penanda = nomor halaman PDF asli.
            nomor = page["page_idx"] + 1 + (start_page or 0)
            bagian.append(f"<!-- page {nomor} of {total} -->\n\n{isi}".rstrip())
        paged = md_path.with_name(md_path.stem + ".paged.md")
        paged.write_text("\n\n".join(bagian) + "\n", encoding="utf-8")
        return paged
    except Exception:
        # Penanda hanya pelengkap; jangan sampai ekstraksi gagal karenanya.
        return md_path


def _libreoffice_bin() -> str:
    found = shutil.which("libreoffice") or shutil.which("soffice")
    if found:
        return found
    raise RuntimeError("LibreOffice tidak ditemukan di PATH -- dibutuhkan untuk mengonversi doc/docx/ppt/pptx ke PDF")


def convert_to_pdf(src_path: Path, out_dir: Path) -> Path:
    """Convert doc/docx/ppt/pptx -> pdf via LibreOffice headless (port of Dimas's lib/extraction/mineru.py::convert_to_pdf)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"{src_path.stem}.pdf"
    proc = subprocess.run(
        [_libreoffice_bin(), "--headless", "--convert-to", "pdf", "--outdir", str(out_dir), str(src_path)],
        capture_output=True, text=True, timeout=180,
    )
    if not target.exists():
        raise RuntimeError(f"Konversi gagal untuk {src_path.name}: {proc.stderr[-500:]}")
    return target
