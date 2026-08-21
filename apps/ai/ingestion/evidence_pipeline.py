"""Facade: one BuktiDukung file -> list of chunk dicts, ready to embed.

Adapted from a sibling prototype's lib/extraction/pipeline.py. Two things
intentionally dropped rather than ported:
  - doc/docx/ppt/pptx conversion (needs a LibreOffice install we don't have
    here) — raises UnsupportedFileError instead of converting.
  - jpg/jpeg/png (no pipeline anywhere extracts text from a standalone
    image — the source prototype doesn't either, MinerU is a PDF/office
    tool, not a generic OCR-any-image tool).
Both are real gaps, not bugs — see worker.py's ingestion handler for how
callers are expected to handle UnsupportedFileError (GAGAL, not silently
SIAP-with-zero-chunks, so the UI doesn't claim a file is AI-searchable
when it never got chunked).
"""

from __future__ import annotations

from pathlib import Path

from .evidence_chunking import chunk_evidence_markdown, clean_entity_evidence
from .evidence_excel import df_to_konten, drop_first_col_only_rows, extract_tables
from .evidence_mineru import mineru_extract

EXCEL_EXTS = {".xlsx", ".xls"}
TEXT_EXTS = {".txt"}
PDF_EXTS = {".pdf"}
CSV_EXTS = {".csv"}


class UnsupportedFileError(Exception):
    """Extension we don't (yet) know how to extract text from."""


def _file_kind(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in EXCEL_EXTS:
        return "excel"
    if ext in CSV_EXTS:
        return "csv"
    if ext in TEXT_EXTS:
        return "text"
    if ext in PDF_EXTS:
        return "pdf"
    try:
        with open(path, "rb") as f:
            head = f.read(5)
        if head == b"%PDF-":
            return "pdf"
    except OSError:
        pass
    return "unknown"


def _process_pdf(pdf_path: Path, filename: str, mineru_out_dir: Path) -> list[dict]:
    md_path = mineru_extract(pdf_path, mineru_out_dir)
    raw_md = md_path.read_text(encoding="utf-8")
    ev_chunks = chunk_evidence_markdown(raw_md, filename)
    return [
        {
            "entity": c["entity"],
            "text": c["konten"],
            "chunk_id": f"evidence__{filename}__{i:04d}",
            "confidence": c["confidence"],
        }
        for i, c in enumerate(ev_chunks)
    ]


def _process_excel(xlsx_path: Path, filename: str) -> list[dict]:
    from openpyxl import load_workbook

    sheets = load_workbook(xlsx_path, read_only=True, data_only=True).sheetnames
    out: list[dict] = []
    for sheet in sheets:
        try:
            result = extract_tables(str(xlsx_path), sheet_name=sheet)
        except Exception:
            continue
        result["tables"] = drop_first_col_only_rows(result["tables"])
        table_name = result.get("name")
        for t_idx, df in enumerate(result["tables"]):
            if df.empty:
                continue
            konten = df_to_konten(df)
            if not konten.strip():
                continue
            label = table_name or sheet
            entity = clean_entity_evidence(f"{filename.replace('_', ' ')} {sheet} {label} Sub-tabel {t_idx + 1}")
            out.append({
                "entity": entity,
                "text": konten,
                "chunk_id": f"evidence__{filename}__{sheet}__{t_idx:02d}",
                "confidence": None,
            })
        df_info = result.get("info")
        if df_info is not None and not df_info.empty:
            konten_info = df_to_konten(df_info)
            if konten_info.strip():
                entity = clean_entity_evidence(f"{filename.replace('_', ' ')} {sheet} Info")
                out.append({
                    "entity": entity,
                    "text": konten_info,
                    "chunk_id": f"evidence__{filename}__{sheet}__info",
                    "confidence": None,
                })
    return out


def _process_csv(csv_path: Path, filename: str) -> list[dict]:
    import pandas as pd

    df = pd.read_csv(csv_path)
    if df.empty:
        return []
    konten = df_to_konten(df)
    if not konten.strip():
        return []
    entity = clean_entity_evidence(filename.replace("_", " "))
    return [{
        "entity": entity,
        "text": konten,
        "chunk_id": f"evidence__{filename}__0000",
        "confidence": None,
    }]


def _process_text(txt_path: Path, filename: str) -> list[dict]:
    try:
        content = txt_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        content = txt_path.read_text(encoding="latin-1")
    content = content.strip()
    if not content:
        return []
    entity = clean_entity_evidence(filename.replace("_", " "))
    return [{
        "entity": entity,
        "text": content,
        "chunk_id": f"evidence__{filename}__0000",
        "confidence": None,
    }]


def process_file(file_path: Path, work_dir: Path) -> list[dict]:
    """Process one evidence file, return chunk dicts ready for embedding.

    work_dir: scratch folder for MinerU's markdown output — caller cleans it
    up after use.

    Raises UnsupportedFileError for extensions we don't extract text from
    (doc/docx/ppt/pptx, jpg/jpeg/png, anything else unrecognized).
    """
    file_path = Path(file_path)
    kind = _file_kind(file_path)
    filename = file_path.stem
    mineru_out_dir = work_dir / "mineru_md"

    if kind == "pdf":
        return _process_pdf(file_path, filename, mineru_out_dir)
    if kind == "excel":
        return _process_excel(file_path, filename)
    if kind == "csv":
        return _process_csv(file_path, filename)
    if kind == "text":
        return _process_text(file_path, filename)
    raise UnsupportedFileError(f"Tipe file belum didukung untuk ekstraksi: {file_path.name}")
