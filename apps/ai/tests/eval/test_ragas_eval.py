"""Unit tests for eval/ragas_eval.py and /eval/* endpoints.

All LLM calls, pgvector, and Postgres I/O are mocked.
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
        patch("vectorstore.pgvector_store.search_led", return_value=_fake_search_results(2)),
        patch("eval.ragas_eval._build_ragas_llm", return_value=fake_llm_wrapper),
    ):
        samples = build_eval_samples(n_indicators=3)

    assert len(samples) == 3


def test_build_eval_samples_uses_real_session_justification():
    from eval.ragas_eval import build_eval_samples

    fake_llm_wrapper = MagicMock()
    fake_llm_wrapper.langchain_llm.invoke.return_value = MagicMock(content="Referensi.")

    with (
        patch("agent.tools.rubric_tool._get_rubrics", return_value=[_fake_rubric(1)]),
        patch("vectorstore.pgvector_store.search_led", return_value=_fake_search_results(1)),
        patch("eval.ragas_eval._build_ragas_llm", return_value=fake_llm_wrapper),
        patch(
            "db.postgres_client.get_indicator_results",
            return_value=[{"indicator_no": 1, "justification": "Justifikasi dari session."}],
        ),
    ):
        samples = build_eval_samples(n_indicators=1, session_id="sess-123")

    assert samples[0].response == "Justifikasi dari session."


def test_build_eval_samples_filters_by_session_indicators():
    """Regression test: target_rubrics must be the indicators actually scored in the session, not the first n (ariel 5ecb23d)."""
    from eval.ragas_eval import build_eval_samples

    fake_llm_wrapper = MagicMock()
    fake_llm_wrapper.langchain_llm.invoke.return_value = MagicMock(content="Referensi.")

    with (
        patch("agent.tools.rubric_tool._get_rubrics",
              return_value=[_fake_rubric(i) for i in range(1, 40)]),
        patch("vectorstore.pgvector_store.search_led", return_value=_fake_search_results(1)),
        patch("eval.ragas_eval._build_ragas_llm", return_value=fake_llm_wrapper),
        patch(
            "db.postgres_client.get_indicator_results",
            return_value=[{"indicator_no": 31, "justification": "Justifikasi indikator 31."}],
        ),
    ):
        samples = build_eval_samples(n_indicators=1, session_id="sess-31")

    assert len(samples) == 1
    assert samples[0].indicator_no == 31
    assert samples[0].response == "Justifikasi indikator 31."


def test_build_eval_samples_includes_evidence_context():
    """Regression test: retrieved_contexts must include tagged evidence-document chunks, not just LED (ariel 5ecb23d)."""
    from eval.ragas_eval import build_eval_samples

    fake_llm_wrapper = MagicMock()
    fake_llm_wrapper.langchain_llm.invoke.return_value = MagicMock(content="Referensi.")

    with (
        patch("agent.tools.rubric_tool._get_rubrics", return_value=[_fake_rubric(1)]),
        patch("vectorstore.pgvector_store.search_led", return_value=_fake_search_results(1)),
        patch("vectorstore.pgvector_evidence_store.list_available_evidence_ids", return_value=["ev-1"]),
        patch(
            "vectorstore.pgvector_evidence_store.search_evidence",
            return_value=[{"text": "Isi dokumen evidence.", "entity": None, "chunk_id": "c1",
                           "bukti_dukung_id": "ev-1", "confidence": None, "distance": 0.1}],
        ),
        patch("eval.ragas_eval._build_ragas_llm", return_value=fake_llm_wrapper),
    ):
        samples = build_eval_samples(n_indicators=1)

    assert any("Isi dokumen evidence." in c for c in samples[0].retrieved_contexts)


def test_build_eval_samples_includes_lkps_context():
    """Regression test: quantitative/composite indicators must get LKPS table context too (ariel 5ecb23d)."""
    from eval.ragas_eval import build_eval_samples

    fake_llm_wrapper = MagicMock()
    fake_llm_wrapper.langchain_llm.invoke.return_value = MagicMock(content="Referensi.")

    rubric = _fake_rubric(31)
    rubric.lkps_table_ref = ["Tabel 4.a. LKPS"]

    with (
        patch("agent.tools.rubric_tool._get_rubrics", return_value=[rubric]),
        patch("vectorstore.pgvector_store.search_led", return_value=_fake_search_results(1)),
        patch("vectorstore.pgvector_evidence_store.list_available_evidence_ids", return_value=[]),
        patch("agent.tools.lkps_tool.get_lkps_table") as mock_lkps_tool,
        patch("eval.ragas_eval._build_ragas_llm", return_value=fake_llm_wrapper),
    ):
        mock_lkps_tool.invoke.return_value = "| Nama | Sertifikasi |\n|---|---|\n| A | Ya |"
        samples = build_eval_samples(n_indicators=1)

    assert any("Sertifikasi" in c for c in samples[0].retrieved_contexts)
    mock_lkps_tool.invoke.assert_called_once_with({"table_reference": "Tabel 4.a. LKPS"})


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
            patch("vectorstore.pgvector_store.search_led", return_value=_fake_search_results(1)),
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
            patch("vectorstore.pgvector_store.search_led", return_value=_fake_search_results(1)),
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
        patch("vectorstore.pgvector_store.search_led", return_value=_fake_search_results(1)),
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


def test_eval_run_passes_model_override(client):
    """?model in the request body must be forwarded to the background task
    and validated against the configured judge model list."""
    captured = {}

    def fake_bg(**kwargs):
        captured.update(kwargs)

    with (
        patch.dict(os.environ, {"LLM_PROVIDER": "ollama", "OLLAMA_MODEL": "qwen3.6:35b,deepseek-r1:32b"}, clear=False),
        patch("api.routes.eval._run_evaluation_background", side_effect=fake_bg),
    ):
        for k in ("RAGAS_PROVIDER", "RAGAS_OLLAMA_MODEL", "RAGAS_OPENROUTER_MODEL"):
            os.environ.pop(k, None)
        resp = client.post("/eval/run", json={"n_indicators": 2, "model": "deepseek-r1:32b"})

    assert resp.status_code == 200
    assert captured.get("model") == "deepseek-r1:32b"


def test_eval_run_rejects_unknown_model(client):
    with patch.dict(os.environ, {"LLM_PROVIDER": "ollama", "OLLAMA_MODEL": "qwen3.6:35b"}, clear=False):
        for k in ("RAGAS_PROVIDER", "RAGAS_OLLAMA_MODEL", "RAGAS_OPENROUTER_MODEL"):
            os.environ.pop(k, None)
        resp = client.post("/eval/run", json={"n_indicators": 2, "model": "not-a-real-model"})

    assert resp.status_code == 400
    assert "not-a-real-model" in resp.json()["detail"]


def test_eval_models_endpoint(client):
    with patch.dict(os.environ, {"LLM_PROVIDER": "ollama", "OLLAMA_MODEL": "qwen3.6:35b,deepseek-r1:32b"}, clear=False):
        for k in ("RAGAS_PROVIDER", "RAGAS_OLLAMA_MODEL", "RAGAS_OPENROUTER_MODEL"):
            os.environ.pop(k, None)
        resp = client.get("/eval/models")

    assert resp.status_code == 200
    data = resp.json()
    assert data["provider"] == "ollama"
    assert data["models"] == ["qwen3.6:35b", "deepseek-r1:32b"]


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


def test_run_ragas_evaluation_passes_run_config_with_generous_timeout_and_low_workers():
    """RAGAS's own default RunConfig (timeout=180s, max_workers=16) is too
    aggressive for a slow single-GPU Ollama instance — 16 concurrent jobs
    queue behind each other on the same GPU and blow past the 180s per-job
    timeout before their own inference even starts, so most jobs fail with
    TimeoutError even though the model would eventually respond. Verify
    run_ragas_evaluation configures a longer timeout (tied to
    OLLAMA_TIMEOUT_SECONDS) and a small worker count instead of relying on
    ragas's defaults."""
    import pandas as pd
    from eval.ragas_eval import EvalSample, run_ragas_evaluation

    fake_sample = EvalSample(
        indicator_no=1,
        user_input="q?",
        retrieved_contexts=["ctx"],
        response="resp",
        reference="ref",
    )

    fake_metric = MagicMock()
    fake_metric.name = "faithfulness"

    fake_result = MagicMock()
    fake_result.to_pandas.return_value = pd.DataFrame({"faithfulness": [0.8]})

    with (
        patch("eval.ragas_eval.build_eval_samples", return_value=[fake_sample]),
        patch("eval.ragas_eval._build_ragas_llm", return_value=MagicMock()),
        patch("eval.ragas_eval._build_ragas_embeddings", return_value=MagicMock()),
        patch("ragas.metrics.Faithfulness", return_value=fake_metric),
        patch("ragas.dataset_schema.SingleTurnSample", return_value=MagicMock()),
        patch("ragas.EvaluationDataset", return_value=MagicMock()),
        patch("ragas.evaluate", return_value=fake_result) as mock_evaluate,
        patch.dict(os.environ, {"OLLAMA_TIMEOUT_SECONDS": "300"}, clear=False),
    ):
        run_ragas_evaluation(n_indicators=1, metrics_to_run=["faithfulness"])

    assert mock_evaluate.called
    _, kwargs = mock_evaluate.call_args
    run_config = kwargs.get("run_config")
    assert run_config is not None
    assert run_config.timeout >= 300
    assert run_config.max_workers <= 4


def test_get_assessor_model_reads_from_indicator_results():
    """assessor_model — which model(s) actually scored a session — is distinct from the judge model (ariel 88082d7, adapted to dev-v1's per-indicator IndicatorResult.model)."""
    from eval.ragas_eval import _get_assessor_model

    with patch(
        "db.postgres_client.get_indicator_results",
        return_value=[{"indicator_no": 1, "model": "deepseek-r1:32b"}, {"indicator_no": 2, "model": "deepseek-r1:32b"}],
    ):
        assert _get_assessor_model("sess-1") == "deepseek-r1:32b"


def test_get_assessor_model_joins_distinct_models():
    from eval.ragas_eval import _get_assessor_model

    with patch(
        "db.postgres_client.get_indicator_results",
        return_value=[{"indicator_no": 1, "model": "a"}, {"indicator_no": 2, "model": "b"}],
    ):
        assert _get_assessor_model("sess-1") == "a, b"


def test_run_ragas_evaluation_looks_up_assessor_model_when_session_given():
    import pandas as pd
    from eval.ragas_eval import EvalSample, run_ragas_evaluation

    fake_sample = EvalSample(indicator_no=1, user_input="q?", retrieved_contexts=["ctx"], response="resp", reference="ref")
    fake_metric = MagicMock()
    fake_metric.name = "faithfulness"
    fake_result = MagicMock()
    fake_result.to_pandas.return_value = pd.DataFrame({"faithfulness": [0.8]})

    with (
        patch("eval.ragas_eval.build_eval_samples", return_value=[fake_sample]),
        patch("eval.ragas_eval._build_ragas_llm", return_value=MagicMock()),
        patch("eval.ragas_eval._build_ragas_embeddings", return_value=MagicMock()),
        patch("ragas.metrics.Faithfulness", return_value=fake_metric),
        patch("ragas.dataset_schema.SingleTurnSample", return_value=MagicMock()),
        patch("ragas.EvaluationDataset", return_value=MagicMock()),
        patch("ragas.evaluate", return_value=fake_result),
        patch("db.postgres_client.get_indicator_results", return_value=[{"indicator_no": 1, "model": "deepseek-r1:32b"}]),
    ):
        result = run_ragas_evaluation(n_indicators=1, session_id="sess-1", metrics_to_run=["faithfulness"])

    assert result["assessor_model"] == "deepseek-r1:32b"


def test_run_ragas_evaluation_assessor_model_none_without_session():
    import pandas as pd
    from eval.ragas_eval import EvalSample, run_ragas_evaluation

    fake_sample = EvalSample(indicator_no=1, user_input="q?", retrieved_contexts=["ctx"], response="resp", reference="ref")
    fake_metric = MagicMock()
    fake_metric.name = "faithfulness"
    fake_result = MagicMock()
    fake_result.to_pandas.return_value = pd.DataFrame({"faithfulness": [0.8]})

    with (
        patch("eval.ragas_eval.build_eval_samples", return_value=[fake_sample]),
        patch("eval.ragas_eval._build_ragas_llm", return_value=MagicMock()),
        patch("eval.ragas_eval._build_ragas_embeddings", return_value=MagicMock()),
        patch("ragas.metrics.Faithfulness", return_value=fake_metric),
        patch("ragas.dataset_schema.SingleTurnSample", return_value=MagicMock()),
        patch("ragas.EvaluationDataset", return_value=MagicMock()),
        patch("ragas.evaluate", return_value=fake_result),
    ):
        result = run_ragas_evaluation(n_indicators=1, metrics_to_run=["faithfulness"])

    assert result["assessor_model"] is None


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


def test_strip_think_removes_block():
    from eval.ragas_eval import _strip_think

    content = "<think>Let me reason...\nstep by step\n</think>The answer is 42."
    assert _strip_think(content) == "The answer is 42."


def test_strip_think_preserves_content_without_think():
    from eval.ragas_eval import _strip_think

    assert _strip_think("Just a plain answer.") == "Just a plain answer."


def test_is_reasoning_model_name():
    from eval.ragas_eval import _is_reasoning_model_name

    assert _is_reasoning_model_name("deepseek-r1:14b") is True
    assert _is_reasoning_model_name("openai/o1-preview") is True
    assert _is_reasoning_model_name("qwen2.5:14b") is False
    assert _is_reasoning_model_name("anthropic/claude-haiku-4.5") is False


def test_think_stripping_wrapper_scrubs_generations():
    from unittest.mock import MagicMock
    from eval.ragas_eval import _ThinkStrippingLLMWrapper

    inner = MagicMock()
    fake_gen = MagicMock()
    fake_gen.text = "<think>cot</think>final answer"
    fake_gen.message.content = "<think>cot</think>final answer"
    inner.generate_text.return_value = MagicMock(generations=[[fake_gen]])

    w = _ThinkStrippingLLMWrapper(inner)
    result = w.generate_text("prompt")
    assert result.generations[0][0].text == "final answer"
    assert result.generations[0][0].message.content == "final answer"


def test_generate_reference_strips_think_block():
    from unittest.mock import MagicMock
    from eval.ragas_eval import _generate_reference

    fake_llm = MagicMock()
    fake_llm.langchain_llm.invoke.return_value = MagicMock(
        content="<think>let me think</think>Referensi bersih."
    )
    result = _generate_reference("q?", ["chunk"], fake_llm)
    assert "<think>" not in result
    assert "Referensi bersih." in result


# ── get_judge_llm_config / get_available_judge_models ─────────────────────────


def test_build_ragas_llm_round_robins_across_ollama_endpoints():
    """RAGAS's judge LLM must also spread across a multi-GPU endpoint pool
    (via pick_ollama_endpoint), not always hit the first one."""
    from eval.ragas_eval import _build_ragas_llm

    with (
        patch.dict(
            os.environ,
            {"LLM_PROVIDER": "ollama", "OLLAMA_MODEL": "deepseek-r1:7b",
             "OLLAMA_BASE_URL": "http://gpu1:11435,http://gpu2:11436"},
            clear=False,
        ),
        patch("langchain_ollama.ChatOllama") as mock_chat_ollama_cls,
    ):
        for k in ("RAGAS_PROVIDER", "RAGAS_OLLAMA_BASE_URL", "RAGAS_OLLAMA_MODEL"):
            os.environ.pop(k, None)
        mock_chat_ollama_cls.return_value = MagicMock()
        _build_ragas_llm()
        _build_ragas_llm()

    base_urls = {c.kwargs["base_url"] for c in mock_chat_ollama_cls.call_args_list}
    assert base_urls == {"http://gpu1:11435", "http://gpu2:11436"}

    # Regression: client_kwargs["timeout"] was never set, so a hung request
    # to Ollama had no timeout and never errored -- see agent.graph's same fix.
    for c in mock_chat_ollama_cls.call_args_list:
        assert c.kwargs["client_kwargs"]["timeout"] == 300  # OLLAMA_TIMEOUT_SECONDS default


def test_get_judge_llm_config_explicit_model_override():
    """A caller-supplied model wins over RAGAS_* / assessment env vars —
    used when the frontend lets the user pick a judge model."""
    from eval.ragas_eval import get_judge_llm_config

    with patch.dict(
        os.environ,
        {"LLM_PROVIDER": "ollama", "OLLAMA_MODEL": "qwen3.6:35b", "RAGAS_OLLAMA_MODEL": "deepseek-r1:32b"},
        clear=False,
    ):
        cfg = get_judge_llm_config(model="anthropic/claude-haiku-4.5")

    assert cfg["model"] == "anthropic/claude-haiku-4.5"


def test_get_available_judge_models_falls_back_to_assessment_list():
    """No RAGAS_* model configured -> falls back to the assessment model list."""
    from eval.ragas_eval import get_available_judge_models

    with patch.dict(os.environ, {"LLM_PROVIDER": "ollama", "OLLAMA_MODEL": "qwen3.6:35b,deepseek-r1:32b"}, clear=False):
        for k in ("RAGAS_PROVIDER", "RAGAS_OLLAMA_MODEL", "RAGAS_OPENROUTER_MODEL"):
            os.environ.pop(k, None)
        models = get_available_judge_models()

    assert models == ["qwen3.6:35b", "deepseek-r1:32b"]


def test_get_available_judge_models_uses_ragas_override_list():
    """RAGAS_OLLAMA_MODEL (comma-separated) overrides the assessment list."""
    from eval.ragas_eval import get_available_judge_models

    with patch.dict(
        os.environ,
        {
            "LLM_PROVIDER": "ollama",
            "OLLAMA_MODEL": "qwen3.6:35b",
            "RAGAS_OLLAMA_MODEL": "deepseek-r1:32b,qwen2.5:14b",
        },
        clear=False,
    ):
        models = get_available_judge_models()

    assert models == ["deepseek-r1:32b", "qwen2.5:14b"]


def test_eval_config_endpoint_falls_back_to_assessment(client):
    """When no RAGAS_* vars set, judge config falls back to assessment model."""
    import os
    with patch.dict(
        os.environ,
        {"LLM_PROVIDER": "openrouter", "OPENROUTER_MODEL": "test/model"},
        clear=False,
    ):
        # Make sure RAGAS_* vars are NOT set
        for k in ("RAGAS_PROVIDER", "RAGAS_OPENROUTER_MODEL", "RAGAS_OLLAMA_MODEL"):
            os.environ.pop(k, None)
        resp = client.get("/eval/config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["assessment_provider"] == "openrouter"
    assert data["assessment_model"] == "test/model"
    assert data["judge_provider"] == "openrouter"
    assert data["judge_model"] == "test/model"


def test_eval_config_endpoint_judge_overrides_assessment(client):
    """RAGAS_* vars override the assessment model for judge config."""
    import os
    with patch.dict(
        os.environ,
        {
            "LLM_PROVIDER": "ollama",
            "OLLAMA_MODEL": "qwen3.5:35b",
            "RAGAS_PROVIDER": "openrouter",
            "RAGAS_OPENROUTER_MODEL": "anthropic/claude-haiku-4.5",
        },
        clear=False,
    ):
        resp = client.get("/eval/config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["assessment_model"] == "qwen3.5:35b"
    assert data["judge_model"] == "anthropic/claude-haiku-4.5"
    assert data["judge_provider"] == "openrouter"


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
