"""Tests for POST /assessment/start and GET /assessment/{session_id}/status, /results.

All external I/O is mocked:
- Postgres calls are patched at the function level (db.postgres_client.* as
  imported into api.routes.assessment)
- build_graph / _run_assessment_pipeline are patched to avoid real LLM calls
- excel.reader.read_indicator_rows is patched to return fake indicator rows
- os.path.exists is patched so the route doesn't require a real file on disk
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

TENANT_ID = "tenant-1"
DOKUMEN_ID = "dokumen-1"
USER_ID = "user-1"


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


def _start_body(**overrides):
    body = {
        "tenant_id": TENANT_ID,
        "dokumen_id": DOKUMEN_ID,
        "created_by_user_id": USER_ID,
        "laporan_path": "/fake/Laporan_AK.xlsx",
    }
    body.update(overrides)
    return body


def _resume_body(**overrides):
    body = {"tenant_id": TENANT_ID, "dokumen_id": DOKUMEN_ID}
    body.update(overrides)
    return body


# ── POST /assessment/start ────────────────────────────────────────────────────


def test_start_returns_session_id(client):
    resp = client.post("/assessment/start", json=_start_body())
    assert resp.status_code == 200
    data = resp.json()
    assert "session_id" in data
    assert data["total_indicators"] == 2


def test_start_missing_file_returns_400():
    from main import app

    with patch("api.routes.assessment.os.path.exists", return_value=False):
        with TestClient(app) as c:
            resp = c.post("/assessment/start", json=_start_body(laporan_path="/no/such/file.xlsx"))
    assert resp.status_code == 400


def test_start_empty_indicators_returns_422():
    from main import app

    with (
        patch("api.routes.assessment.os.path.exists", return_value=True),
        patch("api.routes.assessment.read_indicator_rows", return_value=[]),
    ):
        with TestClient(app) as c:
            resp = c.post("/assessment/start", json=_start_body(laporan_path="/fake/empty.xlsx"))
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
            resp = c.post("/assessment/start", json=_start_body(max_parallel=3))

    assert resp.status_code == 200
    assert captured.get("max_parallel") == 3


def test_start_no_rubrics_available_returns_500():
    """No laporan_path AND no cached rubrics at all (matrix never parsed) —
    a distinct failure mode from 'file not found' or 'file has no rows'."""
    from main import app

    with patch("api.routes.assessment._get_rubrics", return_value=[]):
        with TestClient(app) as c:
            resp = c.post("/assessment/start", json=_start_body(laporan_path=None))

    assert resp.status_code == 500


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
            resp = c.post("/assessment/start", json=_start_body(laporan_path=None))

    assert resp.status_code == 200
    assert resp.json()["total_indicators"] == 2


# ── POST /assessment/{session_id}/resume ──────────────────────────────────────


def _fake_session_row(**overrides):
    row = {
        "session_id": "sess-1",
        "status": "failed",
        "total_indicators": 3,
        "completed_indicators": 1,
        "error": "worker crashed",
    }
    row.update(overrides)
    return row


def test_resume_session_not_found_returns_404():
    from main import app

    with patch("api.routes.assessment.get_session", return_value=None):
        with TestClient(app) as c:
            resp = c.post("/assessment/nonexistent/resume", json=_resume_body())

    assert resp.status_code == 404


def test_resume_skips_already_done_indicators(fake_indicators):
    """3 indicators total (1, 2, 3 — via a 3rd fake row appended), indicator 1
    already has a result row -> only 2 and 3 get (re-)processed, and the
    progress counter starts from 1 (already done), not 0."""
    from main import app

    row3 = MagicMock()
    row3.indicator_no = 3
    row3.row_index = 30
    row3.kriteria = "Kerja Sama"
    all_indicators = fake_indicators + [row3]

    captured = {}

    async def fake_pipeline(**kwargs):
        captured.update(kwargs)

    with (
        patch("api.routes.assessment.get_session", return_value=_fake_session_row()),
        patch("api.routes.assessment.os.path.exists", return_value=True),
        patch("api.routes.assessment.read_indicator_rows", return_value=all_indicators),
        patch("api.routes.assessment.get_completed_indicator_numbers", return_value={1}),
        patch("api.routes.assessment.update_session_status"),
        patch("api.routes.assessment._run_assessment_pipeline", new=AsyncMock(side_effect=fake_pipeline)),
    ):
        with TestClient(app) as c:
            resp = c.post("/assessment/sess-1/resume", json=_resume_body(laporan_path="/fake/Laporan_AK.xlsx"))

    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"] == "sess-1"
    assert data["skipped_indicators"] == 1
    assert data["remaining_indicators"] == 2

    assert captured["session_id"] == "sess-1"
    remaining_nos = {ind.indicator_no for ind in captured["indicators"]}
    assert remaining_nos == {2, 3}
    assert captured["initial_completed"] == 1


def test_resume_without_laporan_path_uses_default_rubrics():
    from main import app

    fake_rubric_a = MagicMock(); fake_rubric_a.no = 1; fake_rubric_a.kriteria = "K1"
    fake_rubric_b = MagicMock(); fake_rubric_b.no = 2; fake_rubric_b.kriteria = "K2"

    captured = {}

    async def fake_pipeline(**kwargs):
        captured.update(kwargs)

    with (
        patch("api.routes.assessment.get_session", return_value=_fake_session_row(total_indicators=2)),
        patch("api.routes.assessment._get_rubrics", return_value=[fake_rubric_a, fake_rubric_b]),
        patch("api.routes.assessment.get_completed_indicator_numbers", return_value=set()),
        patch("api.routes.assessment.update_session_status"),
        patch("api.routes.assessment._run_assessment_pipeline", new=AsyncMock(side_effect=fake_pipeline)),
    ):
        with TestClient(app) as c:
            resp = c.post("/assessment/sess-1/resume", json=_resume_body(laporan_path=None))

    assert resp.status_code == 200
    remaining_nos = {ind.indicator_no for ind in captured["indicators"]}
    assert remaining_nos == {1, 2}


def test_resume_all_done_marks_completed_without_running_pipeline(fake_indicators):
    from main import app

    with (
        patch("api.routes.assessment.get_session", return_value=_fake_session_row(total_indicators=2)),
        patch("api.routes.assessment.os.path.exists", return_value=True),
        patch("api.routes.assessment.read_indicator_rows", return_value=fake_indicators),
        patch("api.routes.assessment.get_completed_indicator_numbers", return_value={1, 2}),
        patch("api.routes.assessment.update_session_status") as mock_update,
        patch("api.routes.assessment._run_assessment_pipeline", new=AsyncMock()) as mock_pipeline,
    ):
        with TestClient(app) as c:
            resp = c.post("/assessment/sess-1/resume", json=_resume_body(laporan_path="/fake/Laporan_AK.xlsx"))

    assert resp.status_code == 200
    data = resp.json()
    assert data["remaining_indicators"] == 0
    mock_pipeline.assert_not_called()
    mock_update.assert_called_once()
    assert mock_update.call_args.kwargs["status"] == "completed"


# ── GET /assessment/list ───────────────────────────────────────────────────────


def test_list_sessions_returns_empty_when_none():
    from main import app

    with patch("api.routes.assessment.list_sessions_db", return_value=[]):
        with TestClient(app) as c:
            resp = c.get("/assessment/list")

    assert resp.status_code == 200
    assert resp.json() == []


def test_list_sessions_computes_avg_score_per_session():
    """list_sessions_db already computes avg_score via SQL join — the route
    just needs to pass it through untouched."""
    from main import app

    sessions_data = [
        {
            "session_id": "s1", "status": "completed", "total_indicators": 2,
            "completed_indicators": 2, "created_at": None, "updated_at": None,
            "error": None, "avg_score": 3.5,
        },
        {
            "session_id": "s2", "status": "running", "total_indicators": 1,
            "completed_indicators": 0, "created_at": None, "updated_at": None,
            "error": None, "avg_score": None,
        },
    ]

    with patch("api.routes.assessment.list_sessions_db", return_value=sessions_data):
        with TestClient(app) as c:
            resp = c.get("/assessment/list")

    assert resp.status_code == 200
    data = resp.json()
    by_id = {row["session_id"]: row for row in data}
    assert by_id["s1"]["avg_score"] == 3.5
    assert by_id["s2"]["avg_score"] is None


# ── GET /assessment/{session_id}/status ───────────────────────────────────────


def test_status_returns_running():
    from main import app

    with patch(
        "api.routes.assessment.get_session",
        return_value={
            "session_id": "abc-123",
            "status": "running",
            "total_indicators": 78,
            "completed_indicators": 10,
            "error": None,
        },
    ):
        with TestClient(app) as c:
            resp = c.get("/assessment/abc-123/status")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "running"
    assert data["completed_indicators"] == 10


def test_status_not_found_returns_404():
    from main import app

    with patch("api.routes.assessment.get_session", return_value=None):
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
            tenant_id=TENANT_ID,
            dokumen_id=DOKUMEN_ID,
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
            tenant_id=TENANT_ID,
            dokumen_id=DOKUMEN_ID,
        )

    assert result is False
    call_kwargs = mock_log.call_args.kwargs
    assert call_kwargs["error"] is not None
    assert call_kwargs["score"] is None
    assert call_kwargs["recommendation"] is None


# ── GET /assessment/{session_id}/results ──────────────────────────────────────


def test_results_returns_indicators_with_kriteria():
    from main import app

    session_row = {
        "session_id": "sess-1",
        "status": "completed",
        "total_indicators": 3,
        "completed_indicators": 3,
    }
    rows = [
        {
            "indicator_no": 1, "score": 3.0, "justification": "OK", "confidence": 0.9,
            "recommendation": "Tingkatkan dokumentasi.", "error": None,
        },
        {
            "indicator_no": 2, "score": 4.0, "justification": "Sangat baik", "confidence": 0.95,
            "recommendation": "Pertahankan capaian ini.", "error": None,
        },
        {
            "indicator_no": 3, "score": 2.0, "justification": "Cukup.", "confidence": 0.7,
            "recommendation": None, "error": None,
        },
    ]

    fake_rubric_1 = MagicMock(); fake_rubric_1.no = 1; fake_rubric_1.kriteria = "K1"
    fake_rubric_2 = MagicMock(); fake_rubric_2.no = 2; fake_rubric_2.kriteria = "K2"
    fake_rubric_3 = MagicMock(); fake_rubric_3.no = 3; fake_rubric_3.kriteria = "K3"

    with (
        patch("api.routes.assessment.get_session", return_value=session_row),
        patch("api.routes.assessment.get_indicator_results", return_value=rows),
        patch("api.routes.assessment._get_rubrics", return_value=[fake_rubric_1, fake_rubric_2, fake_rubric_3]),
    ):
        with TestClient(app) as c:
            resp = c.get("/assessment/sess-1/results")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert len(data["results"]) == 3
    assert data["results"][0]["kriteria"] == "K1"
    assert data["results"][0]["recommendation"] == "Tingkatkan dokumentasi."
    assert data["results"][1]["score"] == 4.0
    assert data["results"][2]["recommendation"] is None


def test_results_null_recommendation_row_does_not_crash():
    """A DB row with recommendation=None (pre-migration or LLM skipped) must be
    returned as null in the API response without raising an exception."""
    from main import app

    session_row = {
        "session_id": "sess-null",
        "status": "completed",
        "total_indicators": 1,
        "completed_indicators": 1,
    }
    rows = [
        {
            "indicator_no": 5, "score": 2.0, "justification": "Perlu perbaikan.",
            "confidence": 0.6, "recommendation": None, "error": None,
        },
    ]

    fake_rubric = MagicMock(); fake_rubric.no = 5; fake_rubric.kriteria = "K5"

    with (
        patch("api.routes.assessment.get_session", return_value=session_row),
        patch("api.routes.assessment.get_indicator_results", return_value=rows),
        patch("api.routes.assessment._get_rubrics", return_value=[fake_rubric]),
    ):
        with TestClient(app) as c:
            resp = c.get("/assessment/sess-null/results")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["results"]) == 1
    assert data["results"][0]["recommendation"] is None


def test_results_data_none_returns_404():
    """No matching session row -> 404."""
    from main import app

    with patch("api.routes.assessment.get_session", return_value=None):
        with TestClient(app) as c:
            resp = c.get("/assessment/nonexistent/results")

    assert resp.status_code == 404


# ── _run_assessment_pipeline unit test ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_run_assessment_pipeline_seeds_progress_from_initial_completed(fake_indicators):
    """Resuming with 1 already-done indicator + 2 remaining must report
    progress as 2, 3 (not 1, 2), and finish at total 3, not 2."""
    from api.routes.assessment import _run_assessment_pipeline

    with (
        patch("api.routes.assessment.create_ollama_client_from_env"),
        patch("api.routes.assessment.build_graph_auto"),
        patch("api.routes.assessment._process_single_indicator", new=AsyncMock(return_value=True)),
        patch("api.routes.assessment.update_session_status") as mock_update,
    ):
        await _run_assessment_pipeline(
            session_id="sess-1",
            indicators=fake_indicators,  # 2 indicators
            max_parallel=5,
            tenant_id=TENANT_ID,
            dokumen_id=DOKUMEN_ID,
            initial_completed=1,
        )

    running_calls = [
        c.kwargs["completed_indicators"] for c in mock_update.call_args_list
        if c.kwargs.get("status") == "running"
    ]
    assert sorted(running_calls) == [2, 3]

    final_call = mock_update.call_args_list[-1]
    assert final_call.kwargs["status"] == "completed"
    assert final_call.kwargs["completed_indicators"] == 3


@pytest.mark.asyncio
async def test_run_assessment_pipeline_marks_failed_on_setup_exception():
    """A failure before any indicator even starts (e.g. can't reach the LLM
    provider) must mark the session failed, not leave it stuck 'running'."""
    from api.routes.assessment import _run_assessment_pipeline

    with (
        patch("api.routes.assessment.create_ollama_client_from_env", side_effect=RuntimeError("no provider")),
        patch("api.routes.assessment.update_session_status") as mock_update,
    ):
        await _run_assessment_pipeline(
            session_id="sess-1", indicators=[], max_parallel=5,
            tenant_id=TENANT_ID, dokumen_id=DOKUMEN_ID,
        )

    mock_update.assert_called_once()
    assert mock_update.call_args.kwargs["status"] == "failed"
    assert "no provider" in mock_update.call_args.kwargs["error"]
