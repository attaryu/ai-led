import subprocess
from unittest.mock import MagicMock, patch

import pytest


def test_mineru_extract_raises_runtime_error_on_timeout(tmp_path):
    from ingestion.evidence_mineru import mineru_extract

    pdf_path = tmp_path / "hangs.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 fake")

    with (
        patch("ingestion.evidence_mineru._mineru_bin", return_value="mineru"),
        patch(
            "subprocess.run",
            side_effect=subprocess.TimeoutExpired(cmd="mineru", timeout=300),
        ),
    ):
        with pytest.raises(RuntimeError, match="(?i)timeout"):
            mineru_extract(pdf_path, tmp_path / "out")


def test_mineru_extract_raises_clear_error_for_password_protected_pdf(tmp_path):
    from ingestion.evidence_mineru import mineru_extract

    pdf_path = tmp_path / "locked.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 fake")

    fake_proc = MagicMock(
        returncode=1,
        stderr="...\npypdfium2._helpers.misc.PdfiumError: Failed to load document (PDFium: Incorrect password error).",
    )
    with (
        patch("ingestion.evidence_mineru._mineru_bin", return_value="mineru"),
        patch("subprocess.run", return_value=fake_proc),
    ):
        with pytest.raises(RuntimeError, match="kata sandi"):
            mineru_extract(pdf_path, tmp_path / "out")


def test_convert_to_pdf_raises_with_stderr_when_no_pdf_is_produced(tmp_path, monkeypatch):
    import subprocess
    from types import SimpleNamespace

    import ingestion.evidence_mineru as em

    monkeypatch.setattr(em, "_libreoffice_bin", lambda: "libreoffice")
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: SimpleNamespace(stderr="boom"))
    with pytest.raises(RuntimeError, match="boom"):
        em.convert_to_pdf(tmp_path / "x.docx", tmp_path / "out")


@pytest.mark.parametrize("start_page,expected", [(None, []), (3, ["-s", "3"])])
def test_mineru_extract_forwards_start_page_only_when_given(tmp_path, start_page, expected):
    from ingestion.evidence_mineru import mineru_extract

    pdf_path = tmp_path / "doc.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 fake")
    md = tmp_path / "out" / "doc" / "doc.md"
    md.parent.mkdir(parents=True)
    md.write_text("# x")
    fake_proc = MagicMock(returncode=0, stderr="")

    with (
        patch("ingestion.evidence_mineru._mineru_bin", return_value="mineru"),
        patch("subprocess.run", return_value=fake_proc) as run,
    ):
        assert mineru_extract(pdf_path, tmp_path / "out", start_page=start_page) == md

    cmd = run.call_args.args[0]
    assert cmd[-2:] == expected if expected else "-s" not in cmd
