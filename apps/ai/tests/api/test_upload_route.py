"""Unit tests for /upload/* endpoints.

All heavy I/O (ChromaDB indexing, PDF chunking, Excel loading) is mocked.

Every endpoint except /upload/matrix (shared, not tenant-scoped — see
api/routes/upload.py module docstring) now requires tenant_id/dokumen_id,
and in-process state is keyed by that pair instead of one flat global — see
"Isolasi Tenant & Multi-Dokumen di apps/ai" in the tracker /
integration-plan.md for why.
"""

from __future__ import annotations

import io
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

DOC_A = {"tenant_id": "tenant-a", "dokumen_id": "doc-1"}
DOC_B = {"tenant_id": "tenant-b", "dokumen_id": "doc-2"}


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def reset_upload_state():
    """Reset in-process upload state before each test."""
    import api.routes.upload as up
    up._uploaded.clear()
    up._led_index_status.clear()
    up._matrix_status["rubric_count"] = 0
    up._matrix_status["error"] = None
    # Point cache path to a non-existent location so auto-detect doesn't see leftover files
    up.RUBRIC_CACHE_PATH = "/tmp/_test_nonexistent_matrix.json"
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
    resp = client.get("/upload/status", params=DOC_A)
    assert resp.status_code == 200
    data = resp.json()
    assert data["matrix_uploaded"] is False
    assert data["matrix_rubric_count"] == 0
    assert data["led_uploaded"] is False
    assert data["lkps_uploaded"] is False
    assert data["laporan_uploaded"] is False
    assert data["led_index_state"] == "idle"
    assert data["led_chunk_count"] == 0


def test_status_requires_tenant_and_dokumen_id(client):
    resp = client.get("/upload/status")
    assert resp.status_code == 422  # missing required query params


def test_status_rejects_path_traversal_ids(client):
    resp = client.get(
        "/upload/status", params={"tenant_id": "../../etc", "dokumen_id": "doc-1"}
    )
    assert resp.status_code == 400


def test_status_is_isolated_per_document(client):
    """The whole point of the fix: marking one document ready must not leak
    into another document's status."""
    import api.routes.upload as up

    key = (DOC_A["tenant_id"], DOC_A["dokumen_id"])
    up._doc_state(key)["led"] = True
    up._led_index_status[key] = {"state": "ready", "chunk_count": 42, "error": None}

    resp_a = client.get("/upload/status", params=DOC_A)
    resp_b = client.get("/upload/status", params=DOC_B)

    assert resp_a.json()["led_uploaded"] is True
    assert resp_a.json()["led_chunk_count"] == 42
    assert resp_b.json()["led_uploaded"] is False
    assert resp_b.json()["led_chunk_count"] == 0


# ── POST /upload/matrix (shared, not tenant-scoped) ────────────────────────────


def test_upload_matrix_requires_pdf(client):
    resp = client.post(
        "/upload/matrix",
        files={"file": ("rubric.docx", io.BytesIO(b"docx"), "application/octet-stream")},
    )
    assert resp.status_code == 400


def test_upload_matrix_parses_and_caches(client, tmp_path):
    fake_rubrics = [MagicMock() for _ in range(60)]

    with (
        patch("api.routes.upload.UPLOAD_DIR", str(tmp_path)),
        patch("api.routes.upload._save_upload", return_value=(str(tmp_path / "matrix.pdf"), 1024)),
        patch("ingestion.matrix_parser.parse_matrix_pdf", return_value=fake_rubrics),
        patch("ingestion.matrix_parser.cache_rubrics"),
    ):
        resp = client.post(
            "/upload/matrix",
            files={"file": ("matrix.pdf", io.BytesIO(_pdf_bytes()), "application/pdf")},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["rubric_count"] == 60

    import api.routes.upload as up
    assert up._matrix_status["rubric_count"] == 60


def test_upload_matrix_returns_422_on_parse_failure(client, tmp_path):
    with (
        patch("api.routes.upload.UPLOAD_DIR", str(tmp_path)),
        patch("api.routes.upload._save_upload", return_value=(str(tmp_path / "matrix.pdf"), 1024)),
        patch("ingestion.matrix_parser.parse_matrix_pdf", side_effect=ValueError("bad PDF")),
    ):
        resp = client.post(
            "/upload/matrix",
            files={"file": ("matrix.pdf", io.BytesIO(_pdf_bytes()), "application/pdf")},
        )

    assert resp.status_code == 422


# ── POST /upload/led ──────────────────────────────────────────────────────────


def test_upload_led_rejects_invalid_extension(client):
    resp = client.post(
        "/upload/led",
        files={"file": ("report.txt", io.BytesIO(b"plain text"), "text/plain")},
        data=DOC_A,
    )
    assert resp.status_code == 400


def test_upload_led_requires_tenant_and_dokumen_id(client):
    resp = client.post(
        "/upload/led",
        files={"file": ("led.pdf", io.BytesIO(_pdf_bytes()), "application/pdf")},
    )
    assert resp.status_code == 422


def test_upload_led_success(client, tmp_path):
    with (
        patch("api.routes.upload.UPLOAD_DIR", str(tmp_path)),
        patch("api.routes.upload._index_led_background"),  # suppress background task
    ):
        resp = client.post(
            "/upload/led",
            files={"file": ("led.pdf", io.BytesIO(_pdf_bytes()), "application/pdf")},
            data=DOC_A,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["filename"] == "led.pdf"
    assert data["size_bytes"] > 0

    import api.routes.upload as up
    key = (DOC_A["tenant_id"], DOC_A["dokumen_id"])
    assert up._uploaded[key]["led"] is True


def test_upload_led_accepts_docx(client, tmp_path):
    with (
        patch("api.routes.upload.UPLOAD_DIR", str(tmp_path)),
        patch("api.routes.upload._index_led_background"),  # suppress background task
    ):
        resp = client.post(
            "/upload/led",
            files={
                "file": (
                    "report.docx",
                    io.BytesIO(b"docx"),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
            data=DOC_A,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["filename"] == "led.docx"
    assert data["size_bytes"] > 0


def test_upload_led_saves_under_tenant_dokumen_path(client, tmp_path):
    """The core of the fix: two different documents must be saved to two
    different paths, never the same fixed filename."""
    import os

    with patch("api.routes.upload.UPLOAD_DIR", str(tmp_path)):
        with patch("api.routes.upload._index_led_background") as mock_index:
            client.post(
                "/upload/led",
                files={"file": ("led.pdf", io.BytesIO(_pdf_bytes()), "application/pdf")},
                data=DOC_A,
            )
            client.post(
                "/upload/led",
                files={"file": ("led.pdf", io.BytesIO(_pdf_bytes()), "application/pdf")},
                data=DOC_B,
            )

    paths = [call.args[0] for call in mock_index.call_args_list]
    assert len(paths) == 2
    assert paths[0] != paths[1]
    assert os.path.exists(paths[0])
    assert os.path.exists(paths[1])


def test_upload_led_triggers_background_index(client, tmp_path):
    called_with = []

    def fake_index(path, tenant_id, dokumen_id):
        called_with.append((path, tenant_id, dokumen_id))

    with (
        patch("api.routes.upload.UPLOAD_DIR", str(tmp_path)),
        patch("api.routes.upload._index_led_background", side_effect=fake_index),
    ):
        client.post(
            "/upload/led",
            files={"file": ("led.pdf", io.BytesIO(_pdf_bytes()), "application/pdf")},
            data=DOC_A,
        )

    # BackgroundTasks runs synchronously inside TestClient
    assert len(called_with) == 1
    path, tenant_id, dokumen_id = called_with[0]
    assert path.endswith("led.pdf")
    assert tenant_id == DOC_A["tenant_id"]
    assert dokumen_id == DOC_A["dokumen_id"]


# ── POST /upload/lkps ─────────────────────────────────────────────────────────


def test_upload_lkps_requires_excel(client):
    resp = client.post(
        "/upload/lkps",
        files={"file": ("data.csv", io.BytesIO(b"a,b,c"), "text/csv")},
        data=DOC_A,
    )
    assert resp.status_code == 400


def test_upload_lkps_success(client, tmp_path):
    fake_registry = MagicMock()
    fake_registry.sheets = {"2a1": MagicMock(empty=False), "2b": MagicMock(empty=True)}

    with (
        patch("api.routes.upload.UPLOAD_DIR", str(tmp_path)),
        patch("api.routes.upload._save_upload", return_value=(str(tmp_path / "lkps.xlsx"), 1024)),
        patch("ingestion.lkps_loader.load_lkps", return_value=fake_registry),
        patch("agent.tools.lkps_tool.set_lkps_registry") as mock_set,
    ):
        resp = client.post(
            "/upload/lkps",
            files={"file": ("lkps.xlsx", io.BytesIO(_xlsx_bytes()), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data=DOC_A,
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["sheet_count"] == 2
    assert data["non_empty_sheets"] == 1
    mock_set.assert_called_once_with(DOC_A["tenant_id"], DOC_A["dokumen_id"], fake_registry)


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
            data=DOC_A,
        )

    import api.routes.upload as up
    key = (DOC_A["tenant_id"], DOC_A["dokumen_id"])
    assert up._uploaded[key]["lkps"] is True


# ── POST /upload/laporan ──────────────────────────────────────────────────────


def test_upload_laporan_requires_excel(client):
    resp = client.post(
        "/upload/laporan",
        files={"file": ("report.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
        data=DOC_A,
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
            data=DOC_A,
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["laporan_path"] == expected_path
    assert data["size_bytes"] == 2048

    import api.routes.upload as up
    key = (DOC_A["tenant_id"], DOC_A["dokumen_id"])
    assert up._uploaded[key]["laporan"] is True


# ── LED index background function unit test ───────────────────────────────────


def test_index_led_background_sets_ready(tmp_path):
    fake_chunk = MagicMock()
    fake_chunks = [fake_chunk] * 42

    with (
        patch("ingestion.led_chunker.chunk_led_pdf", return_value=fake_chunks),
        patch("vectorstore.pgvector_store.index_led_chunks"),
    ):
        import api.routes.upload as up
        up._index_led_background(str(tmp_path / "led.pdf"), "tenant-a", "doc-1")

    key = ("tenant-a", "doc-1")
    assert up._led_index_status[key]["state"] == "ready"
    assert up._led_index_status[key]["chunk_count"] == 42


def test_index_led_background_sets_error_on_failure(tmp_path):
    with patch("ingestion.led_chunker.chunk_led_pdf", side_effect=RuntimeError("PDF read error")):
        import api.routes.upload as up
        up._index_led_background(str(tmp_path / "bad.pdf"), "tenant-a", "doc-1")

    key = ("tenant-a", "doc-1")
    assert up._led_index_status[key]["state"] == "error"
    assert "PDF read error" in up._led_index_status[key]["error"]


def test_index_led_background_routes_docx_to_docx_chunker(tmp_path):
    fake_chunks = [MagicMock()] * 7

    with (
        patch("ingestion.led_docx_chunker.chunk_led_docx", return_value=fake_chunks) as mock_docx,
        patch("ingestion.led_chunker.chunk_led_pdf") as mock_pdf,
        patch("vectorstore.pgvector_store.index_led_chunks"),
    ):
        import api.routes.upload as up
        up._index_led_background(str(tmp_path / "led.docx"), "tenant-a", "doc-1")

    mock_docx.assert_called_once()
    mock_pdf.assert_not_called()
    key = ("tenant-a", "doc-1")
    assert up._led_index_status[key]["state"] == "ready"
    assert up._led_index_status[key]["chunk_count"] == 7


def test_index_led_background_does_not_touch_other_documents(tmp_path):
    """Indexing tenant-a's document must not disturb tenant-b's already-ready
    status — this used to blow away the ENTIRE ChromaDB collection store."""
    import api.routes.upload as up

    key_b = ("tenant-b", "doc-2")
    up._led_index_status[key_b] = {"state": "ready", "chunk_count": 99, "error": None}

    with (
        patch("ingestion.led_chunker.chunk_led_pdf", return_value=[MagicMock()] * 3),
        patch("vectorstore.pgvector_store.index_led_chunks"),
    ):
        up._index_led_background(str(tmp_path / "led.pdf"), "tenant-a", "doc-1")

    assert up._led_index_status[key_b] == {"state": "ready", "chunk_count": 99, "error": None}
