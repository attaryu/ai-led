"""Tests for POST /assessment/start and GET /assessment/{session_id}/status, /results.

All external I/O is mocked:
- Supabase calls are patched at the function level (db.supabase_client.*)
- build_graph / _run_assessment_pipeline are patched to avoid real LLM calls
- excel.reader.read_indicator_rows is patched to return fake indicator rows
- os.path.exists is patched so the route doesn't require a real file on disk
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture()
def fake_indicators():
    """Two fake IndicatorRow objects."""
    row1 = MagicMock()
    row1.indicator_no = 1
    row1.row_index = 6
    row1.kriteria = "Kondisi Eksternal"

    row2 = MagicMock()
    row2.indicator_no = 2
    row2.row_index = 20
    row2.kriteria = "Visi Misi"

    return [row1, row2]


@pytest.fixture()
def client(fake_indicators):
    """TestClient with all external calls mocked out."""
    from main import app

    with (
        patch("api.routes.assessment.os.path.exists", return_value=True),
        patch("api.routes.assessment.read_indicator_rows", return_value=fake_indicators),
        patch("api.routes.assessment.create_session"),
        patch("api.routes.assessment.update_session_status"),
        patch("api.routes.assessment._run_assessment_pipeline", new=AsyncMock()),
    ):
        with TestClient(app) as c:
            yield c


# ── POST /assessment/start ────────────────────────────────────────────────────


def test_start_returns_session_id(client):
    resp = client.post("/assessment/start", json={"laporan_path": "/fake/Laporan_AK.xlsx"})
    assert resp.status_code == 200
    data = resp.json()
    assert "session_id" in data
    assert data["total_indicators"] == 2


def test_start_missing_file_returns_400():
    from main import app

    with (
        patch("api.routes.assessment.os.path.exists", return_value=False),
    ):
        with TestClient(app) as c:
            resp = c.post("/assessment/start", json={"laporan_path": "/no/such/file.xlsx"})
    assert resp.status_code == 400


def test_start_empty_indicators_returns_422():
    from main import app

    with (
        patch("api.routes.assessment.os.path.exists", return_value=True),
        patch("api.routes.assessment.read_indicator_rows", return_value=[]),
    ):
        with TestClient(app) as c:
            resp = c.post("/assessment/start", json={"laporan_path": "/fake/empty.xlsx"})
    assert resp.status_code == 422


def test_start_custom_max_parallel(fake_indicators):
    from main import app

    captured = {}

    async def fake_pipeline(**kwargs):
        captured.update(kwargs)

    with (
        patch("api.routes.assessment.os.path.exists", return_value=True),
        patch("api.routes.assessment.read_indicator_rows", return_value=fake_indicators),
        patch("api.routes.assessment.create_session"),
        patch("api.routes.assessment.update_session_status"),
        patch("api.routes.assessment._run_assessment_pipeline", new=AsyncMock(side_effect=fake_pipeline)),
    ):
        with TestClient(app) as c:
            resp = c.post(
                "/assessment/start",
                json={"laporan_path": "/fake/Laporan_AK.xlsx", "max_parallel": 3},
            )

    assert resp.status_code == 200
    assert captured.get("max_parallel") == 3


def test_start_without_laporan_path_uses_default_rubrics():
    """When laporan_path is omitted, all rubrics from _get_rubrics() are used."""
    from main import app

    fake_rubric_a = MagicMock()
    fake_rubric_a.no = 1
    fake_rubric_a.kriteria = "K1"
    fake_rubric_b = MagicMock()
    fake_rubric_b.no = 2
    fake_rubric_b.kriteria = "K2"

    with (
        patch("api.routes.assessment._get_rubrics", return_value=[fake_rubric_a, fake_rubric_b]),
        patch("api.routes.assessment.create_session"),
        patch("api.routes.assessment._run_assessment_pipeline", new=AsyncMock()),
    ):
        with TestClient(app) as c:
            resp = c.post("/assessment/start", json={})

    assert resp.status_code == 200
    assert resp.json()["total_indicators"] == 2


# ── GET /assessment/{session_id}/status ───────────────────────────────────────


def test_status_returns_running():
    from main import app

    fake_supabase = MagicMock()
    fake_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "session_id": "abc-123",
        "status": "running",
        "total_indicators": 78,
        "completed_indicators": 10,
        "error": None,
    }

    with patch("api.routes.assessment.get_supabase", return_value=fake_supabase):
        with TestClient(app) as c:
            resp = c.get("/assessment/abc-123/status")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "running"
    assert data["completed_indicators"] == 10


def test_status_not_found_returns_404():
    from main import app

    fake_supabase = MagicMock()
    fake_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None

    with patch("api.routes.assessment.get_supabase", return_value=fake_supabase):
        with TestClient(app) as c:
            resp = c.get("/assessment/nonexistent/status")

    assert resp.status_code == 404


# ── _process_single_indicator unit test ───────────────────────────────────────


@pytest.mark.asyncio
async def test_process_single_indicator_success(fake_indicators):
    from api.routes.assessment import _process_single_indicator

    indicator = fake_indicators[0]

    fake_graph = MagicMock()
    fake_graph.invoke.return_value = {
        "final_score": 3.0,
        "justification": "Program studi cukup baik.",
        "confidence": 0.85,
        "recommendation": "Tingkatkan rasio DTPS.",
        "reasoning_steps": ["step1", "step2"],
        "error": None,
    }

    semaphore = asyncio.Semaphore(5)

    with (
        patch("api.routes.assessment.log_reasoning_step"),
        patch("api.routes.assessment.log_indicator_result") as mock_log,
    ):
        result = await _process_single_indicator(
            graph=fake_graph,
            indicator=indicator,
            session_id="test-session",
            semaphore=semaphore,
        )

    assert result is True
    mock_log.assert_called_once()
    call_kwargs = mock_log.call_args.kwargs
    assert call_kwargs["score"] == 3.0
    assert call_kwargs["indicator_no"] == 1
    assert call_kwargs["recommendation"] == "Tingkatkan rasio DTPS."


@pytest.mark.asyncio
async def test_process_single_indicator_handles_exception(fake_indicators):
    from api.routes.assessment import _process_single_indicator

    indicator = fake_indicators[0]

    fake_graph = MagicMock()
    fake_graph.invoke.side_effect = RuntimeError("LLM unavailable")

    semaphore = asyncio.Semaphore(5)

    with patch("api.routes.assessment.log_indicator_result") as mock_log:
        result = await _process_single_indicator(
            graph=fake_graph,
            indicator=indicator,
            session_id="test-session",
            semaphore=semaphore,
        )

    assert result is False
    call_kwargs = mock_log.call_args.kwargs
    assert call_kwargs["error"] is not None
    assert call_kwargs["score"] is None
    assert call_kwargs["recommendation"] is None


# ── GET /assessment/{session_id}/results ──────────────────────────────────────


def test_results_returns_indicators_with_kriteria():
    from main import app

    fake_supabase = MagicMock()
    # session row
    fake_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "session_id": "sess-1",
        "status": "completed",
        "total_indicators": 2,
        "completed_indicators": 2,
    }
    # indicator_results rows — chained call, separate from .single()
    rows_execute = MagicMock()
    rows_execute.data = [
        {
            "indicator_no": 1, "score": 3.0, "justification": "OK", "confidence": 0.9,
            "recommendation": "Tingkatkan dokumentasi.", "error": None,
        },
        {
            "indicator_no": 2, "score": 4.0, "justification": "Sangat baik", "confidence": 0.95,
            "recommendation": "Pertahankan capaian ini.", "error": None,
        },
    ]
    fake_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = rows_execute

    fake_rubric_1 = MagicMock(); fake_rubric_1.no = 1; fake_rubric_1.kriteria = "K1"
    fake_rubric_2 = MagicMock(); fake_rubric_2.no = 2; fake_rubric_2.kriteria = "K2"

    with (
        patch("api.routes.assessment.get_supabase", return_value=fake_supabase),
        patch("api.routes.assessment._get_rubrics", return_value=[fake_rubric_1, fake_rubric_2]),
    ):
        with TestClient(app) as c:
            resp = c.get("/assessment/sess-1/results")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert len(data["results"]) == 2
    assert data["results"][0]["kriteria"] == "K1"
    assert data["results"][0]["recommendation"] == "Tingkatkan dokumentasi."
    assert data["results"][1]["score"] == 4.0
