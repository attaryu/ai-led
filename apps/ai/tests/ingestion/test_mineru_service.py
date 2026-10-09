"""ingestion/mineru_service.py -- klien untuk container `mineru` (httpx.post di-fake)."""
from pathlib import Path

import httpx
import pytest

from ingestion import mineru_service


class _Resp:
    def __init__(self, status=200, body=None, text=""):
        self.status_code, self._body, self.text = status, body, text

    def json(self):
        if self._body is None:
            raise ValueError("bukan json")
        return self._body


@pytest.fixture()
def pdf(tmp_path: Path) -> Path:
    f = tmp_path / "dok.pdf"
    f.write_bytes(b"%PDF-1.4 uji")
    return f


def test_service_enabled_follows_env(monkeypatch):
    monkeypatch.delenv("MINERU_SERVICE_URL", raising=False)
    assert mineru_service.service_enabled() is False
    monkeypatch.setenv("MINERU_SERVICE_URL", "http://mineru:8100")
    assert mineru_service.service_enabled() is True


def test_parse_pdf_posts_file_and_returns_markdown(monkeypatch, pdf):
    monkeypatch.setenv("MINERU_SERVICE_URL", "http://mineru:8100/")
    visto = {}

    def fake_post(url, files, data, timeout):
        visto.update(url=url, nama=files["file"][0], data=data)
        return _Resp(200, {"markdown": "<!-- page 1 of 1 -->\n\nisi"})

    monkeypatch.setattr(mineru_service.httpx, "post", fake_post)
    md = mineru_service.parse_pdf(pdf, start_page=2, mode="api")
    assert md.startswith("<!-- page 1 of 1 -->")
    assert visto["url"] == "http://mineru:8100/parse"          # slash ganda dirapikan
    assert visto["nama"] == "dok.pdf"
    assert visto["data"] == {"start_page": "2", "mode": "api"}


def test_parse_pdf_omits_optional_fields(monkeypatch, pdf):
    monkeypatch.setenv("MINERU_SERVICE_URL", "http://mineru:8100")
    visto = {}
    monkeypatch.setattr(mineru_service.httpx, "post",
                        lambda url, files, data, timeout: visto.update(data=data) or _Resp(200, {"markdown": ""}))
    mineru_service.parse_pdf(pdf)
    assert visto["data"] == {}


def test_unreachable_service_gives_actionable_message(monkeypatch, pdf):
    monkeypatch.setenv("MINERU_SERVICE_URL", "http://mineru:8100")

    def boom(*a, **k):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(mineru_service.httpx, "post", boom)
    with pytest.raises(RuntimeError, match="docker compose up -d mineru"):
        mineru_service.parse_pdf(pdf)


def test_password_protected_pdf_message(monkeypatch, pdf):
    monkeypatch.setenv("MINERU_SERVICE_URL", "http://mineru:8100")
    monkeypatch.setattr(mineru_service.httpx, "post",
                        lambda *a, **k: _Resp(502, {"detail": "PdfiumError: Incorrect password"}))
    with pytest.raises(RuntimeError, match="terkunci kata sandi"):
        mineru_service.parse_pdf(pdf)


def test_service_error_detail_is_surfaced(monkeypatch, pdf):
    monkeypatch.setenv("MINERU_SERVICE_URL", "http://mineru:8100")
    monkeypatch.setattr(mineru_service.httpx, "post",
                        lambda *a, **k: _Resp(502, {"detail": "CUDA out of memory"}))
    with pytest.raises(RuntimeError, match="CUDA out of memory"):
        mineru_service.parse_pdf(pdf)
