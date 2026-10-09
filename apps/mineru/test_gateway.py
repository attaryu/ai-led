"""Gateway MinerU diuji dengan `mineru` PALSU (run_mineru di-monkeypatch):
tanpa GPU, tanpa jaringan, tanpa model. Yang diverifikasi: argumen CLI yang
dikirim identik dengan notebook, kursor `truncated` disambung, dan mode
local/api memilih jalur yang benar."""
import json
import subprocess

import pypdfium2 as pdfium
import pytest
from fastapi.testclient import TestClient

import gateway


def _pdf_bytes(tmp_path, halaman=3):
    pdf = pdfium.PdfDocument.new()
    for _ in range(halaman):
        pdf.new_page(200, 200)
    f = tmp_path / "uji.pdf"
    pdf.save(str(f))
    pdf.close()
    return f.read_bytes()


class FakeMinerU:
    """Meniru `mineru`: status server + parse (dua potongan bila truncated)."""

    def __init__(self, healthy=True, truncated=False, status="done"):
        self.calls = []
        self.healthy, self.truncated, self.status = healthy, truncated, status

    def __call__(self, *args, timeout=None):
        self.calls.append([str(a) for a in args])
        a = [str(x) for x in args]
        if a[:2] == ["server", "status"]:
            out = {"running": True, "parse_server": {"local": {"healthy": self.healthy,
                                                              "supported_tiers": ["basic", "standard"]}}}
            return subprocess.CompletedProcess(a, 0, json.dumps(out), "")
        if a[0] == "parse":
            if "--after" in a:
                data = {"parse": {"status": "done"}, "content": {"content": " AKHIR", "truncated": False}}
            else:
                data = {"parse": {"status": self.status, "tip": "x"},
                        "content": {"content": "<!-- page 1 of 3 -->\n\nAWAL",
                                    "truncated": self.truncated,
                                    "next_request": {"after": "kursor-1"}}}
            return subprocess.CompletedProcess(a, 0, json.dumps(data), "")
        return subprocess.CompletedProcess(a, 0, "", "")


@pytest.fixture()
def klien(monkeypatch):
    monkeypatch.setattr(gateway.time, "sleep", lambda *_: None)
    return TestClient(gateway.app)


def _parse_calls(fake):
    return [c for c in fake.calls if c[0] == "parse"]


def test_parse_args_match_notebook_local(monkeypatch, klien, tmp_path):
    fake = FakeMinerU()
    monkeypatch.setattr(gateway, "run_mineru", fake)
    r = klien.post("/parse", files={"file": ("a.pdf", _pdf_bytes(tmp_path), "application/pdf")})
    assert r.status_code == 200, r.text
    assert r.json()["markdown"].startswith("<!-- page 1 of 3 -->")
    assert r.json()["mode"] == "local" and r.json()["tier"] == "basic"
    [c] = _parse_calls(fake)
    # persis argumen notebook: --pages --tier --wait --json --limit ... --force
    assert c[c.index("--pages") + 1] == "all"
    assert c[c.index("--tier") + 1] == "basic"
    assert "--json" in c and "--force" in c and "--remote" not in c
    assert c[c.index("--limit") + 1] == "50000000"


def test_start_page_becomes_range_like_rubric_notebook(monkeypatch, klien, tmp_path):
    fake = FakeMinerU()
    monkeypatch.setattr(gateway, "run_mineru", fake)
    r = klien.post("/parse", files={"file": ("a.pdf", _pdf_bytes(tmp_path, 3), "application/pdf")},
                   data={"start_page": "2"})
    assert r.status_code == 200
    [c] = _parse_calls(fake)
    assert c[c.index("--pages") + 1] == "2-3"          # PAGE_START-N seperti notebook rubrik
    assert r.json()["total_pages"] == 3


def test_truncated_output_is_continued_via_cursor(monkeypatch, klien, tmp_path):
    fake = FakeMinerU(truncated=True)
    monkeypatch.setattr(gateway, "run_mineru", fake)
    r = klien.post("/parse", files={"file": ("a.pdf", _pdf_bytes(tmp_path), "application/pdf")})
    assert r.json()["markdown"].endswith("AWAL AKHIR")
    lanjut = [c for c in _parse_calls(fake) if "--after" in c]
    assert len(lanjut) == 1 and lanjut[0][lanjut[0].index("--after") + 1] == "kursor-1"


def test_api_mode_uses_remote_and_needs_key(monkeypatch, klien, tmp_path):
    fake = FakeMinerU()
    monkeypatch.setattr(gateway, "run_mineru", fake)
    pdf = {"file": ("a.pdf", _pdf_bytes(tmp_path), "application/pdf")}

    monkeypatch.delenv("MINERU_API_KEY", raising=False)
    assert klien.post("/parse", files=pdf, data={"mode": "api"}).status_code == 400

    monkeypatch.setenv("MINERU_API_KEY", "kunci-uji")
    r = klien.post("/parse", files={"file": ("a.pdf", _pdf_bytes(tmp_path), "application/pdf")}, data={"mode": "api"})
    assert r.status_code == 200 and r.json()["mode"] == "api"
    [c] = _parse_calls(fake)
    assert "--remote" in c


def test_failed_parse_status_becomes_502(monkeypatch, klien, tmp_path):
    monkeypatch.setattr(gateway, "run_mineru", FakeMinerU(status="failed"))
    r = klien.post("/parse", files={"file": ("a.pdf", _pdf_bytes(tmp_path), "application/pdf")})
    assert r.status_code == 502 and "failed" in r.json()["detail"]


def test_rejects_unknown_mode_and_tier(klien, tmp_path):
    pdf = lambda: {"file": ("a.pdf", _pdf_bytes(tmp_path), "application/pdf")}  # noqa: E731
    assert klien.post("/parse", files=pdf(), data={"mode": "cloud"}).status_code == 400
    assert klien.post("/parse", files=pdf(), data={"tier": "ultra"}).status_code == 400
