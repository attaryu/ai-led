"""mineru_extract_paged jatuh kembali ke .md bawaan bila middle.json tidak ada."""
from pathlib import Path

from ingestion import evidence_mineru


def test_paged_falls_back_to_plain_md_without_middle_json(tmp_path: Path, monkeypatch):
    md = tmp_path / "dok" / "auto" / "dok.md"
    md.parent.mkdir(parents=True)
    md.write_text("isi", encoding="utf-8")
    monkeypatch.setattr(evidence_mineru, "mineru_extract", lambda *a, **k: md)

    assert evidence_mineru.mineru_extract_paged(Path("x.pdf"), tmp_path) == md
