"""Fasad process_file(): 1 file evidence -> list chunk dict. Diadaptasi dari
code/new_extract_mechanism.ipynb Bagian 4.4 (Driver Utama), disesuaikan utk
memproses SATU dokumen per panggilan (dipakai worker_tasks.py per job),
bukan loop batch 1691 file seperti notebook."""
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

from .evidence_chunking import chunk_evidence_markdown, clean_entity_evidence
from .excel_extractor import df_to_konten, drop_first_col_only_rows, extract_tables
from .mineru import convert_to_pdf, mineru_extract
from .watermark import remove_watermark_text

CONVERTIBLE_EXTS = {".doc", ".docx", ".ppt", ".pptx"}
EXCEL_EXTS = {".xlsx", ".xls"}
TEXT_EXTS = {".txt"}
PDF_EXTS = {".pdf"}
CSV_EXTS = {".csv"}

WIB = timezone(timedelta(hours=7))


class UnsupportedFileError(Exception):
    """Ekstensi/tipe file tidak dikenal (bukan pdf/doc/docx/ppt/pptx/xlsx/xls/txt,
    dan bukan PDF via magic bytes)."""


def _wib_now_iso() -> str:
    return datetime.now(WIB).isoformat(timespec="seconds")


def _file_meta(path: Path) -> dict:
    return {
        "file_name": path.stem,
        "file_type": path.suffix.lstrip(".").lower() or "unknown",
    }


def resolve_file_kind(path: Path) -> str:
    """Tentukan kind pemrosesan: convert / excel / csv / text / pdf / unknown.
    Untuk file tanpa ekstensi dikenal, cek magic bytes PDF (%PDF) sbg fallback."""
    ext = path.suffix.lower()
    if ext in CONVERTIBLE_EXTS:
        return "convert"
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


def _process_pdf_like(pdf_path: Path, filename: str, mineru_out_dir: Path) -> list:
    md_path = mineru_extract(pdf_path, mineru_out_dir)
    raw_md = md_path.read_text(encoding="utf-8")
    raw_md = remove_watermark_text(raw_md)
    ev_chunks = chunk_evidence_markdown(raw_md, filename)
    out = []
    for i, c in enumerate(ev_chunks):
        out.append({
            "entity": c["entity"],
            "text": c["konten"],
            "chunk_id": f"evidence__{filename}__{i:04d}",
            "confidence": c["confidence"],
        })
    return out


def _process_excel(xlsx_path: Path, filename: str) -> list:
    from openpyxl import load_workbook
    wb_sheets = [s for s in load_workbook(xlsx_path, read_only=True, data_only=True).sheetnames]
    out = []
    for sheet in wb_sheets:
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
                })
    return out


def _process_csv(csv_path: Path, filename: str) -> list:
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
    }]


def _process_text(txt_path: Path, filename: str) -> list:
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
    }]


def process_file(file_path: Path, work_dir: Path) -> list:
    """Proses 1 file evidence, kembalikan list chunk dict siap diinsert ke
    chunk_bukti_dukung: {entity, text, chunk_id, ...}.

    work_dir: folder kerja sementara utk output MinerU/konversi PDF (biasanya
    subfolder khusus per job, dibersihkan worker_tasks.py setelah selesai).

    Raises UnsupportedFileError kalau tipe file tidak dikenal.
    """
    file_path = Path(file_path)
    kind = resolve_file_kind(file_path)
    filename = file_path.stem
    mineru_out_dir = work_dir / "mineru_md"
    convert_out_dir = work_dir / "converted_pdf"

    if kind == "pdf":
        chunks = _process_pdf_like(file_path, filename, mineru_out_dir)
    elif kind == "convert":
        pdf_out = convert_to_pdf(file_path, convert_out_dir)
        chunks = _process_pdf_like(pdf_out, filename, mineru_out_dir)
    elif kind == "excel":
        chunks = _process_excel(file_path, filename)
    elif kind == "csv":
        chunks = _process_csv(file_path, filename)
    elif kind == "text":
        chunks = _process_text(file_path, filename)
    else:
        raise UnsupportedFileError(f"Tipe file tidak dikenal: {file_path.name}")

    now = _wib_now_iso()
    for c in chunks:
        c["uploaded_at"] = now
    return chunks
