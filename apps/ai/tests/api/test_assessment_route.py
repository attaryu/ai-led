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


def test_start_passes_model_override(fake_indicators):
    from main import app

    captured = {}

    async def fake_pipeline(**kwargs):
        captured.update(kwargs)

    with (
        patch("api.routes.assessment.os.path.exists", return_value=True),
        patch("api.routes.assessment.read_indicator_rows", return_value=fake_indicators),
        patch("api.routes.assessment.create_session"),
        patch("api.routes.assessment.get_available_models", return_value=["qwen3.6:35b", "deepseek-r1:32b"]),
        patch("api.routes.assessment._run_assessment_pipeline", new=AsyncMock(side_effect=fake_pipeline)),
    ):
        with TestClient(app) as c:
            resp = c.post(
                "/assessment/start",
                json=_start_body(model="deepseek-r1:32b"),
            )

    assert resp.status_code == 200
    assert captured.get("model") == "deepseek-r1:32b"


def test_start_rejects_unknown_model(fake_indicators):
    from main import app

    with (
        patch("api.routes.assessment.os.path.exists", return_value=True),
        patch("api.routes.assessment.read_indicator_rows", return_value=fake_indicators),
        patch("api.routes.assessment.get_available_models", return_value=["qwen3.6:35b"]),
    ):
        with TestClient(app) as c:
            resp = c.post(
                "/assessment/start",
                json=_start_body(model="not-a-real-model"),
            )

    assert resp.status_code == 400
    assert "not-a-real-model" in resp.json()["detail"]


def test_assessment_models_endpoint():
    from main import app

    with patch(
        "api.routes.assessment.get_available_models", return_value=["qwen3.6:35b", "deepseek-r1:32b"]
    ):
        with TestClient(app) as c:
            resp = c.get("/assessment/models")

    assert resp.status_code == 200
    data = resp.json()
    assert data["models"] == ["qwen3.6:35b", "deepseek-r1:32b"]


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


def test_start_with_first_n_indicators_limits_default_rubrics():
    """first_n_indicators, without laporan_path, runs only the first N cached rubrics."""
    from main import app

    fake_rubric_a = MagicMock()
    fake_rubric_a.no = 1
    fake_rubric_a.kriteria = "K1"
    fake_rubric_b = MagicMock()
    fake_rubric_b.no = 2
    fake_rubric_b.kriteria = "K2"
    fake_rubric_c = MagicMock()
    fake_rubric_c.no = 3
    fake_rubric_c.kriteria = "K3"

    captured = {}

    async def fake_pipeline(**kwargs):
        captured.update(kwargs)

    with (
        patch(
            "api.routes.assessment._get_rubrics",
            return_value=[fake_rubric_a, fake_rubric_b, fake_rubric_c],
        ),
        patch("api.routes.assessment.create_session"),
        patch("api.routes.assessment._run_assessment_pipeline", new=AsyncMock(side_effect=fake_pipeline)),
    ):
        with TestClient(app) as c:
            resp = c.post(
                "/assessment/start", json=_start_body(laporan_path=None, first_n_indicators=2)
            )

    assert resp.status_code == 200
    assert resp.json()["total_indicators"] == 2
    assert [i.indicator_no for i in captured["indicators"]] == [1, 2]


def test_start_first_n_indicators_overrides_laporan_path(fake_indicators):
    """first_n_indicators wins over laporan_path when both are given."""
    from main import app

    fake_rubric_a = MagicMock()
    fake_rubric_a.no = 1
    fake_rubric_a.kriteria = "K1"

    captured = {}

    async def fake_pipeline(**kwargs):
        captured.update(kwargs)

    with (
        patch("api.routes.assessment.os.path.exists", return_value=True),
        patch("api.routes.assessment.read_indicator_rows", return_value=fake_indicators),
        patch("api.routes.assessment._get_rubrics", return_value=[fake_rubric_a]),
        patch("api.routes.assessment.create_session"),
        patch("api.routes.assessment._run_assessment_pipeline", new=AsyncMock(side_effect=fake_pipeline)),
    ):
        with TestClient(app) as c:
            resp = c.post("/assessment/start", json=_start_body(first_n_indicators=1))

    assert resp.status_code == 200
    assert resp.json()["total_indicators"] == 1
    assert [i.indicator_no for i in captured["indicators"]] == [1]


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


def test_resume_with_retry_failed_passes_flag_through(fake_indicators):
    """?retry_failed=true must be forwarded to get_completed_indicator_numbers
    so previously-failed indicators (logged error, not just never-started
    ones) get re-processed instead of being skipped as 'already done'."""
    from main import app

    captured_call = {}

    def fake_get_completed(session_id, retry_failed=False):
        captured_call["session_id"] = session_id
        captured_call["retry_failed"] = retry_failed
        return set()

    async def fake_pipeline(**kwargs):
        pass

    with (
        patch("api.routes.assessment.get_session", return_value=_fake_session_row()),
        patch("api.routes.assessment.os.path.exists", return_value=True),
        patch("api.routes.assessment.read_indicator_rows", return_value=fake_indicators),
        patch("api.routes.assessment.get_completed_indicator_numbers", side_effect=fake_get_completed),
        patch("api.routes.assessment.update_session_status"),
        patch("api.routes.assessment._run_assessment_pipeline", new=AsyncMock(side_effect=fake_pipeline)),
    ):
        with TestClient(app) as c:
            resp = c.post(
                "/assessment/sess-1/resume?retry_failed=true",
                json=_resume_body(laporan_path="/fake/Laporan_AK.xlsx"),
            )

    assert resp.status_code == 200
    assert captured_call["retry_failed"] is True


def test_resume_passes_model_override(fake_indicators):
    from main import app

    captured = {}

    async def fake_pipeline(**kwargs):
        captured.update(kwargs)

    with (
        patch("api.routes.assessment.get_session", return_value=_fake_session_row()),
        patch("api.routes.assessment.os.path.exists", return_value=True),
        patch("api.routes.assessment.read_indicator_rows", return_value=fake_indicators),
        patch("api.routes.assessment.get_completed_indicator_numbers", return_value=set()),
        patch("api.routes.assessment.get_available_models", return_value=["qwen3.6:35b", "deepseek-r1:32b"]),
        patch("api.routes.assessment.update_session_status"),
        patch("api.routes.assessment._run_assessment_pipeline", new=AsyncMock(side_effect=fake_pipeline)),
    ):
        with TestClient(app) as c:
            resp = c.post(
                "/assessment/sess-1/resume?model=deepseek-r1:32b",
                json=_resume_body(laporan_path="/fake/Laporan_AK.xlsx"),
            )

    assert resp.status_code == 200
    assert captured.get("model") == "deepseek-r1:32b"


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
        patch("api.routes.assessment.create_ollama_client_from_env", return_value=MagicMock()),
        patch("api.routes.assessment.build_graph_auto", return_value=fake_graph),
    ):
        result = await _process_single_indicator(
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
async def test_process_single_indicator_builds_its_own_graph_per_call(fake_indicators):
    """Each indicator must build its own OllamaClient/graph (not share one
    built once for the whole batch) so that pick_ollama_endpoint()'s
    round-robin actually spreads concurrent indicators across GPUs, instead
    of every parallel task reusing the same first-picked endpoint."""
    from api.routes.assessment import _process_single_indicator

    indicator = fake_indicators[0]
    fake_graph = MagicMock()
    fake_graph.invoke.return_value = {
        "final_score": 3.0, "justification": "ok", "confidence": 0.9,
        "recommendation": None, "reasoning_steps": [], "error": None,
    }
    semaphore = asyncio.Semaphore(5)

    with (
        patch("api.routes.assessment.log_reasoning_step"),
        patch("api.routes.assessment.log_indicator_result"),
        patch("api.routes.assessment.create_ollama_client_from_env", return_value=MagicMock()) as mock_create,
        patch("api.routes.assessment.build_graph_auto", return_value=fake_graph) as mock_build,
    ):
        await _process_single_indicator(
            indicator=indicator, session_id="s", semaphore=semaphore,
            tenant_id=TENANT_ID, dokumen_id=DOKUMEN_ID,
        )
        await _process_single_indicator(
            indicator=indicator, session_id="s", semaphore=semaphore,
            tenant_id=TENANT_ID, dokumen_id=DOKUMEN_ID,
        )

    assert mock_create.call_count == 2
    assert mock_build.call_count == 2


@pytest.mark.asyncio
async def test_process_single_indicator_handles_exception(fake_indicators):
    from api.routes.assessment import _process_single_indicator

    indicator = fake_indicators[0]

    fake_graph = MagicMock()
    fake_graph.invoke.side_effect = RuntimeError("LLM unavailable")

    semaphore = asyncio.Semaphore(5)

    with (
        patch("api.routes.assessment.log_indicator_result") as mock_log,
        patch("api.routes.assessment.create_ollama_client_from_env", return_value=MagicMock()),
        patch("api.routes.assessment.build_graph_auto", return_value=fake_graph),
    ):
        result = await _process_single_indicator(
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
    # Regression test: raw exception text must not leak verbatim into the
    # report-facing error field (full detail still goes to the server log
    # via logger.exception) — only a safe, generic message naming the
    # exception type.
    assert "LLM unavailable" not in call_kwargs["error"]
    assert "RuntimeError" in call_kwargs["error"]


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
async def test_run_assessment_pipeline_completes_even_when_every_indicator_fails_at_setup(fake_indicators):
    """Each indicator now builds its own OllamaClient/graph (create_ollama_client_from_env
    moved from _run_assessment_pipeline into _process_single_indicator — needed
    so pick_ollama_endpoint()'s round-robin actually spreads concurrent
    indicators across GPUs, instead of the whole batch sharing one client
    built once). So a misconfigured provider (e.g. missing OLLAMA_BASE_URL)
    now fails per-indicator rather than at pipeline setup — verify the
    session still reaches a terminal status instead of getting stuck
    'running' when every indicator fails this way."""
    from api.routes.assessment import _run_assessment_pipeline

    with (
        patch("api.routes.assessment.create_ollama_client_from_env", side_effect=RuntimeError("no provider")),
        patch("api.routes.assessment.log_indicator_result") as mock_log,
        patch("api.routes.assessment.update_session_status") as mock_update,
    ):
        await _run_assessment_pipeline(
            session_id="sess-1", indicators=fake_indicators, max_parallel=5,
            tenant_id=TENANT_ID, dokumen_id=DOKUMEN_ID,
        )

    # Every indicator logged its own error instead of the pipeline crashing
    # or silently dropping them.
    assert mock_log.call_count == len(fake_indicators)
    for call in mock_log.call_args_list:
        assert call.kwargs["error"] is not None

    # Session still reaches a terminal state — not left stuck "running".
    final_call = mock_update.call_args_list[-1]
    assert final_call.kwargs["status"] == "completed"
