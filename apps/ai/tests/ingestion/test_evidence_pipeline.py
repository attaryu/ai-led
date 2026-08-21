from pathlib import Path

import pytest

from ingestion.evidence_pipeline import UnsupportedFileError, _file_kind, process_file


# ── 1 ────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "name,expected",
    [
        ("a.pdf", "pdf"),
        ("a.PDF", "pdf"),
        ("a.xlsx", "excel"),
        ("a.xls", "excel"),
        ("a.csv", "csv"),
        ("a.txt", "text"),
        ("a.docx", "unknown"),
        ("a.jpg", "unknown"),
        ("a.png", "unknown"),
    ],
)
def test_file_kind_by_extension(tmp_path, name, expected):
    p = tmp_path / name
    p.write_bytes(b"not a real file, extension dispatch doesn't read content")
    assert _file_kind(p) == expected


# ── 2 ────────────────────────────────────────────────────────────────────────
def test_file_kind_detects_pdf_via_magic_bytes_without_extension(tmp_path):
    p = tmp_path / "no_extension"
    p.write_bytes(b"%PDF-1.4\n...")
    assert _file_kind(p) == "pdf"


# ── 3 ────────────────────────────────────────────────────────────────────────
def test_process_file_raises_for_unsupported_type(tmp_path):
    p = tmp_path / "photo.jpg"
    p.write_bytes(b"\xff\xd8\xff")  # jpeg magic bytes, still unsupported
    with pytest.raises(UnsupportedFileError):
        process_file(p, tmp_path / "work")


# ── 4 ────────────────────────────────────────────────────────────────────────
def test_process_file_text(tmp_path):
    p = tmp_path / "catatan.txt"
    p.write_text("Rapat pimpinan menyetujui revisi kurikulum.", encoding="utf-8")
    chunks = process_file(p, tmp_path / "work")
    assert len(chunks) == 1
    assert "revisi kurikulum" in chunks[0]["text"]
    assert chunks[0]["chunk_id"] == "evidence__catatan__0000"
