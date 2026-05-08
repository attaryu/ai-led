"""Unit tests for eval/ragas_eval.py and /eval/* endpoints.

All LLM calls, ChromaDB, and Supabase I/O are mocked.
"""

from __future__ import annotations

import json
import os
import tempfile
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture()
def client():
    from main import app
    with TestClient(app) as c:
        yield c


def _fake_rubric(no: int):
    r = MagicMock()
    r.no = no
    r.kriteria = f"Kriteria {no}"
    return r


def _fake_search_results(n: int = 2):
    return [
        {
            "text": f"Chunk {i}: Program studi telah melaksanakan evaluasi secara konsisten.",
            "chunk_id": f"chunk-{i}",
            "distance": 0.1 * i,
            "metadata": {"page_start": i, "page_end": i, "section_heading": "Visi"},
        }
        for i in range(n)
    ]


# ── _form_question ─────────────────────────────────────────────────────────


def test_form_question_contains_indicator_no():
    from eval.ragas_eval import _form_question

    q = _form_question(5, "Visi Misi")
    assert "5" in q
    assert "Visi Misi" in q


# ── _generate_reference ────────────────────────────────────────────────────


def test_generate_reference_no_contexts():
    from eval.ragas_eval import _generate_reference

    fake_llm = MagicMock()
    result = _generate_reference("pertanyaan", [], fake_llm)
    assert "tidak ada" in result.lower()


def test_generate_reference_calls_llm():
    from eval.ragas_eval import _generate_reference

    fake_llm = MagicMock()
    fake_llm.langchain_llm.invoke.return_value = MagicMock(content="Referensi bagus.")

    result = _generate_reference("pertanyaan?", ["Konteks A", "Konteks B"], fake_llm)
    assert "Referensi bagus." in result
    fake_llm.langchain_llm.invoke.assert_called_once()


def test_generate_reference_fallback_on_exception():
    from eval.ragas_eval import _generate_reference

    fake_llm = MagicMock()
    fake_llm.langchain_llm.invoke.side_effect = RuntimeError("LLM down")

    result = _generate_reference("q", ["Fallback chunk"], fake_llm)
    assert len(result) > 0  # returns chunk[:500] as fallback


# ── build_eval_samples ─────────────────────────────────────────────────────


def test_build_eval_samples_returns_correct_count():
    from eval.ragas_eval import build_eval_samples

    fake_llm_wrapper = MagicMock()
    fake_llm_wrapper.langchain_llm.invoke.return_value = MagicMock(content="Jawaban.")

    with (
        patch("agent.tools.rubric_tool._get_rubrics",
              return_value=[_fake_rubric(i) for i in range(1, 6)]),
        patch("vectorstore.chroma_store.search_led", return_value=_fake_search_results(2)),
        patch("eval.ragas_eval._build_ragas_llm", return_value=fake_llm_wrapper),
    ):
        samples = build_eval_samples(n_indicators=3)

    assert len(samples) == 3


def test_build_eval_samples_uses_supabase_justification():
    from eval.ragas_eval import build_eval_samples

    fake_llm_wrapper = MagicMock()
    fake_llm_wrapper.langchain_llm.invoke.return_value = MagicMock(content="Referensi.")

    fake_sb = MagicMock()
    fake_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"indicator_no": 1, "justification": "Justifikasi dari session."}
    ]

    with (
        patch("agent.tools.rubric_tool._get_rubrics", return_value=[_fake_rubric(1)]),
        patch("vectorstore.chroma_store.search_led", return_value=_fake_search_results(1)),
        patch("eval.ragas_eval._build_ragas_llm", return_value=fake_llm_wrapper),
        patch("db.supabase_client.get_supabase", return_value=fake_sb),
    ):
        samples = build_eval_samples(n_indicators=1, session_id="sess-123")

    assert samples[0].response == "Justifikasi dari session."


def test_build_eval_samples_uses_actual_reference():
    from eval.ragas_eval import build_eval_samples

    fake_llm_wrapper = MagicMock()
    # LLM should NOT be called for reference when actual ref is provided
    fake_llm_wrapper.langchain_llm.invoke.return_value = MagicMock(content="Generated.")

    actual_refs = [{"indicator_no": 1, "reference": "Referensi aktual dari dokumen."}]

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    ) as f:
        json.dump(actual_refs, f)
        ref_path = f.name

    try:
        with (
            patch("agent.tools.rubric_tool._get_rubrics", return_value=[_fake_rubric(1)]),
            patch("vectorstore.chroma_store.search_led", return_value=_fake_search_results(1)),
            patch("eval.ragas_eval._build_ragas_llm", return_value=fake_llm_wrapper),
        ):
            samples = build_eval_samples(n_indicators=1, reference_path=ref_path)
    finally:
        os.unlink(ref_path)

    assert samples[0].reference == "Referensi aktual dari dokumen."
    # LLM was only called for response generation (synthetic), not reference
    fake_llm_wrapper.langchain_llm.invoke.assert_called_once()


def test_build_eval_samples_falls_back_when_ref_missing():
    """Indicators not in reference_path still get synthetic references."""
    from eval.ragas_eval import build_eval_samples

    fake_llm_wrapper = MagicMock()
    fake_llm_wrapper.langchain_llm.invoke.return_value = MagicMock(content="Synthetic ref.")

    # File covers indicator 99 only; our rubric is indicator 1
    actual_refs = [{"indicator_no": 99, "reference": "Tidak relevan."}]

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    ) as f:
        json.dump(actual_refs, f)
        ref_path = f.name

    try:
        with (
            patch("agent.tools.rubric_tool._get_rubrics", return_value=[_fake_rubric(1)]),
            patch("vectorstore.chroma_store.search_led", return_value=_fake_search_results(1)),
            patch("eval.ragas_eval._build_ragas_llm", return_value=fake_llm_wrapper),
        ):
            samples = build_eval_samples(n_indicators=1, reference_path=ref_path)
    finally:
        os.unlink(ref_path)

    assert samples[0].reference == "Synthetic ref."


def test_build_eval_samples_ignores_nonexistent_reference_path():
    from eval.ragas_eval import build_eval_samples

    fake_llm_wrapper = MagicMock()
    fake_llm_wrapper.langchain_llm.invoke.return_value = MagicMock(content="Fallback.")

    with (
        patch("agent.tools.rubric_tool._get_rubrics", return_value=[_fake_rubric(1)]),
        patch("vectorstore.chroma_store.search_led", return_value=_fake_search_results(1)),
        patch("eval.ragas_eval._build_ragas_llm", return_value=fake_llm_wrapper),
    ):
        # Should not raise even if path doesn't exist
        samples = build_eval_samples(n_indicators=1, reference_path="/nonexistent/path.json")

    assert len(samples) == 1


# ── POST /eval/run ─────────────────────────────────────────────────────────


def test_eval_run_returns_eval_id(client):
    with patch("api.routes.eval._run_evaluation_background"):
        resp = client.post("/eval/run", json={"n_indicators": 3})
    assert resp.status_code == 200
    data = resp.json()
    assert "eval_id" in data
    assert data["n_indicators"] == 3


def test_eval_run_rejects_unknown_metric(client):
    resp = client.post("/eval/run", json={"metrics": ["nonexistent_metric"]})
    assert resp.status_code == 400
    assert "nonexistent_metric" in resp.json()["detail"]


def test_eval_run_default_metrics(client):
    with patch("api.routes.eval._run_evaluation_background"):
        resp = client.post("/eval/run", json={})
    assert resp.status_code == 200


def test_eval_run_passes_reference_path(client):
    captured = {}

    def fake_bg(**kwargs):
        captured.update(kwargs)

    with patch("api.routes.eval._run_evaluation_background", side_effect=fake_bg):
        resp = client.post(
            "/eval/run",
            json={"n_indicators": 2, "reference_path": "/data/refs.json"},
        )
    assert resp.status_code == 200
    assert captured.get("reference_path") == "/data/refs.json"


# ── GET /eval/{eval_id}/results ────────────────────────────────────────────


def test_eval_results_not_found(client):
    resp = client.get("/eval/nonexistent-id/results")
    assert resp.status_code == 404


def test_eval_results_pending(client):
    import api.routes.eval as ev

    ev._eval_results["test-id"] = {"status": "pending"}
    resp = client.get("/eval/test-id/results")
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending"


def test_eval_results_completed(client):
    import api.routes.eval as ev

    ev._eval_results["done-id"] = {
        "status": "completed",
        "n_samples": 3,
        "session_id": None,
        "scores": {"faithfulness": 0.85, "answer_relevancy": 0.78},
        "per_indicator": [{"indicator_no": 1, "faithfulness": 0.85}],
        "error": None,
    }
    resp = client.get("/eval/done-id/results")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert data["scores"]["faithfulness"] == 0.85


# ── Background task integration ────────────────────────────────────────────


def test_run_evaluation_background_success():
    import api.routes.eval as ev

    eval_id = "bg-test"
    ev._eval_results[eval_id] = {"status": "pending"}

    fake_result = {
        "n_samples": 2,
        "session_id": None,
        "scores": {"faithfulness": 0.9},
        "per_indicator": [],
        "provider": "ollama",
        "model": "deepseek-r1:7b",
    }

    with patch("api.routes.eval.run_ragas_evaluation", return_value=fake_result):
        ev._run_evaluation_background(
            eval_id=eval_id,
            session_id=None,
            n_indicators=2,
            metrics=["faithfulness"],
        )

    assert ev._eval_results[eval_id]["status"] == "completed"
    assert ev._eval_results[eval_id]["scores"]["faithfulness"] == 0.9
    assert ev._eval_results[eval_id]["model"] == "deepseek-r1:7b"
    assert ev._eval_results[eval_id]["provider"] == "ollama"
    assert ev._eval_results[eval_id].get("finished_at")  # ISO timestamp set


def test_eval_config_endpoint(client):
    import os
    with patch.dict(os.environ, {"LLM_PROVIDER": "openrouter", "OPENROUTER_MODEL": "test/model"}):
        resp = client.get("/eval/config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["provider"] == "openrouter"
    assert data["model"] == "test/model"


def test_eval_list_endpoint(client):
    import api.routes.eval as ev

    # Inject a fake completed run
    ev._eval_results["list-test"] = {
        "status": "completed",
        "provider": "ollama",
        "model": "llama3:8b",
        "n_samples": 5,
        "scores": {"faithfulness": 0.85},
        "started_at": "2025-01-01T00:00:00+00:00",
        "finished_at": "2025-01-01T00:01:00+00:00",
    }

    resp = client.get("/eval/list")
    assert resp.status_code == 200
    items = resp.json()
    assert any(item["eval_id"] == "list-test" and item["model"] == "llama3:8b" for item in items)


def test_run_evaluation_background_failure():
    import api.routes.eval as ev

    eval_id = "bg-fail"
    ev._eval_results[eval_id] = {"status": "pending"}

    with patch("api.routes.eval.run_ragas_evaluation", side_effect=RuntimeError("LLM error")):
        ev._run_evaluation_background(
            eval_id=eval_id,
            session_id=None,
            n_indicators=2,
            metrics=["faithfulness"],
        )

    assert ev._eval_results[eval_id]["status"] == "failed"
    assert "LLM error" in ev._eval_results[eval_id]["error"]
