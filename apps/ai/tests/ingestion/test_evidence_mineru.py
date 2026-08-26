import subprocess
from unittest.mock import patch

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
