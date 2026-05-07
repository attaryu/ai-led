"""Unit tests for /upload/* endpoints.

All heavy I/O (ChromaDB indexing, PDF chunking, Excel loading) is mocked.
"""

from __future__ import annotations

import io
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def reset_upload_state():
    """Reset in-process upload state before each test."""
    import api.routes.upload as up
    up._uploaded["led"] = False
    up._uploaded["lkps"] = False
    up._uploaded["laporan"] = False
    up._led_index_status = {"state": "idle", "chunk_count": 0, "error": None}
    yield


@pytest.fixture()
def client():
    from main import app
    with TestClient(app) as c:
        yield c


def _pdf_bytes() -> bytes:
    return b"%PDF-1.4 fake pdf content"


def _xlsx_bytes() -> bytes:
    """Minimal bytes that look like an xlsx upload (actual parsing is mocked)."""
    return b"PK\x03\x04fake xlsx content"


# ── GET /upload/status ────────────────────────────────────────────────────────


def test_status_initial_state(client):
    resp = client.get("/upload/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["led_uploaded"] is False
    assert data["lkps_uploaded"] is False
    assert data["laporan_uploaded"] is False
    assert data["led_index_state"] == "idle"
    assert data["led_chunk_count"] == 0


# ── POST /upload/led ──────────────────────────────────────────────────────────


def test_upload_led_requires_pdf(client):
    resp = client.post(
        "/upload/led",
        files={"file": ("report.docx", io.BytesIO(b"docx"), "application/octet-stream")},
    )
    assert resp.status_code == 400


def test_upload_led_success(client, tmp_path):
    with (
        patch("api.routes.upload.UPLOAD_DIR", str(tmp_path)),
        patch("api.routes.upload._index_led_background"),  # suppress background task
    ):
        resp = client.post(
            "/upload/led",
            files={"file": ("led.pdf", io.BytesIO(_pdf_bytes()), "application/pdf")},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["filename"] == "led.pdf"
    assert data["size_bytes"] > 0

    import api.routes.upload as up
    assert up._uploaded["led"] is True


def test_upload_led_triggers_background_index(client, tmp_path):
    called_with = []

    def fake_index(path):
        called_with.append(path)

    with (
        patch("api.routes.upload.UPLOAD_DIR", str(tmp_path)),
        patch("api.routes.upload._index_led_background", side_effect=fake_index),
    ):
        client.post(
            "/upload/led",
            files={"file": ("led.pdf", io.BytesIO(_pdf_bytes()), "application/pdf")},
        )

    # BackgroundTasks runs synchronously inside TestClient
    assert len(called_with) == 1
    assert called_with[0].endswith("led.pdf")


# ── POST /upload/lkps ─────────────────────────────────────────────────────────


def test_upload_lkps_requires_excel(client):
    resp = client.post(
        "/upload/lkps",
        files={"file": ("data.csv", io.BytesIO(b"a,b,c"), "text/csv")},
    )
    assert resp.status_code == 400


def test_upload_lkps_success(client, tmp_path):
    fake_registry = MagicMock()
    fake_registry.sheets = {"2a1": MagicMock(empty=False), "2b": MagicMock(empty=True)}

    with (
        patch("api.routes.upload.UPLOAD_DIR", str(tmp_path)),
        patch("api.routes.upload._save_upload", return_value=(str(tmp_path / "lkps.xlsx"), 1024)),
        patch("ingestion.lkps_loader.load_lkps", return_value=fake_registry),
        patch("agent.tools.lkps_tool.set_lkps_registry"),
    ):
        resp = client.post(
            "/upload/lkps",
            files={"file": ("lkps.xlsx", io.BytesIO(_xlsx_bytes()), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["sheet_count"] == 2
    assert data["non_empty_sheets"] == 1


def test_upload_lkps_marks_uploaded(client, tmp_path):
    fake_registry = MagicMock()
    fake_registry.sheets = {}

    with (
        patch("api.routes.upload.UPLOAD_DIR", str(tmp_path)),
        patch("api.routes.upload._save_upload", return_value=(str(tmp_path / "lkps.xlsx"), 512)),
        patch("ingestion.lkps_loader.load_lkps", return_value=fake_registry),
        patch("agent.tools.lkps_tool.set_lkps_registry"),
    ):
        client.post(
            "/upload/lkps",
            files={"file": ("lkps.xlsx", io.BytesIO(_xlsx_bytes()), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )

    import api.routes.upload as up
    assert up._uploaded["lkps"] is True


# ── POST /upload/laporan ──────────────────────────────────────────────────────


def test_upload_laporan_requires_excel(client):
    resp = client.post(
        "/upload/laporan",
        files={"file": ("report.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
    )
    assert resp.status_code == 400


def test_upload_laporan_success(client, tmp_path):
    expected_path = str(tmp_path / "laporan_ak.xlsx")

    with (
        patch("api.routes.upload.UPLOAD_DIR", str(tmp_path)),
        patch("api.routes.upload._save_upload", return_value=(expected_path, 2048)),
    ):
        resp = client.post(
            "/upload/laporan",
            files={"file": ("Laporan_AK.xlsx", io.BytesIO(_xlsx_bytes()), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["laporan_path"] == expected_path
    assert data["size_bytes"] == 2048

    import api.routes.upload as up
    assert up._uploaded["laporan"] is True


# ── LED index background function unit test ───────────────────────────────────


def test_index_led_background_sets_ready(tmp_path):
    fake_chunk = MagicMock()
    fake_chunks = [fake_chunk] * 42

    with (
        patch("ingestion.led_chunker.chunk_led_pdf", return_value=fake_chunks),
        patch("vectorstore.chroma_store.index_led_chunks"),
    ):
        import api.routes.upload as up
        up._index_led_background(str(tmp_path / "led.pdf"))

    assert up._led_index_status["state"] == "ready"
    assert up._led_index_status["chunk_count"] == 42


def test_index_led_background_sets_error_on_failure(tmp_path):
    with patch("ingestion.led_chunker.chunk_led_pdf", side_effect=RuntimeError("PDF read error")):
        import api.routes.upload as up
        up._index_led_background(str(tmp_path / "bad.pdf"))

    assert up._led_index_status["state"] == "error"
    assert "PDF read error" in up._led_index_status["error"]
