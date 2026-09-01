"""Tests for the reasoning-mode (prompt-based tool calling) graph."""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def _assessment_context():
    """get_indicator_rubric requires an AssessmentContext (scopes rubric
    lookup to accreditation_set_id) — every test in this module that reaches
    a real graph.invoke() can hit that tool. See test_graph.py's identical
    fixture."""
    from agent.context import AssessmentContext, current_assessment_context

    token = current_assessment_context.set(AssessmentContext("tenant-x", "doc-1", 1, "set-x"))
    yield
    current_assessment_context.reset(token)


# ── is_reasoning_model dispatcher ─────────────────────────────────────────────


def test_is_reasoning_model_default_patterns():
    from agent.graph import is_reasoning_model

    assert is_reasoning_model("deepseek-r1:14b") is True
    assert is_reasoning_model("qwq:32b") is True
    assert is_reasoning_model("o1-preview") is True
    assert is_reasoning_model("openai/o1-mini") is True
    assert is_reasoning_model("qwen2.5:14b") is False
    assert is_reasoning_model("llama3.1:8b") is False
    assert is_reasoning_model("") is False


def test_is_reasoning_model_explicit_override_true():
    from agent.graph import is_reasoning_model

    with patch.dict(os.environ, {"LLM_REASONING_MODE": "true"}):
        assert is_reasoning_model("qwen2.5:14b") is True


def test_is_reasoning_model_explicit_override_false():
    from agent.graph import is_reasoning_model

    with patch.dict(os.environ, {"LLM_REASONING_MODE": "false"}):
        assert is_reasoning_model("deepseek-r1:14b") is False


def test_is_reasoning_model_extra_patterns():
    from agent.graph import is_reasoning_model

    with patch.dict(os.environ, {"REASONING_MODEL_PATTERNS": "my-custom-cot,reasonix"}):
        assert is_reasoning_model("acme/my-custom-cot:7b") is True
        assert is_reasoning_model("reasonix-v2") is True


# ── JSON extraction helpers ───────────────────────────────────────────────────


def test_strip_reasoning_removes_think_block():
    from agent.reasoning_graph import _strip_reasoning

    content = (
        "<think>\nLet me reason about this...\nfirst step\n</think>\n"
        '{"action": "final", "score": 3}'
    )
    assert "think" not in _strip_reasoning(content).lower()
    assert '"action"' in _strip_reasoning(content)


def test_extract_json_from_code_fence():
    from agent.reasoning_graph import _extract_json

    content = '```json\n{"action": "final", "score": 4}\n```'
    parsed = _extract_json(content)
    assert parsed == {"action": "final", "score": 4}


def test_extract_json_takes_last_block():
    """Reasoning leakage: <think> may contain example JSON; we want the FINAL one."""
    from agent.reasoning_graph import _extract_json

    content = (
        "<think>misal saya panggil {\"action\": \"foo\"}</think>\n"
        '{"action": "final", "score": 2.5, "confidence": 0.8}'
    )
    parsed = _extract_json(content)
    assert parsed["action"] == "final"
    assert parsed["score"] == 2.5


def test_extract_json_handles_smart_quotes():
    from agent.reasoning_graph import _extract_json

    content = "{“action”: “final”, “score”: 3}"
    parsed = _extract_json(content)
    assert parsed == {"action": "final", "score": 3}


def test_extract_json_returns_none_when_unparseable():
    from agent.reasoning_graph import _extract_json

    assert _extract_json("totally not json at all") is None
    assert _extract_json("<think>only thinking, no answer</think>") is None


# ── finalize_node logic (mirrored for isolated testing) ──────────────────────


def _finalize(parsed: dict) -> dict:
    """Mirrors finalize_node's field extraction for isolated testing."""
    score = parsed.get("score")
    try:
        score_f = float(score) if score is not None else None
        if score_f is not None and not (0.0 <= score_f <= 4.0):
            score_f = None
    except (TypeError, ValueError):
        score_f = None

    try:
        conf_f = float(parsed.get("confidence", 0.5))
        conf_f = max(0.0, min(1.0, conf_f))
    except (TypeError, ValueError):
        conf_f = 0.5

    recommendation = parsed.get("recommendation")

    return {
        "final_score": score_f,
        "justification": str(parsed.get("justification", ""))[:2000],
        "confidence": conf_f,
        "recommendation": str(recommendation)[:500] if recommendation else None,
    }


def test_finalize_extracts_recommendation():
    result = _finalize(
        {
            "action": "final",
            "score": 3,
            "justification": "Cukup baik.",
            "confidence": 0.8,
            "recommendation": "Tingkatkan dokumentasi kerjasama industri.",
        }
    )
    assert result["recommendation"] == "Tingkatkan dokumentasi kerjasama industri."


def test_finalize_truncates_recommendation_to_500_chars():
    long_text = "A" * 600
    result = _finalize({"action": "final", "score": 2, "justification": "Cukup.", "confidence": 0.7, "recommendation": long_text})
    assert len(result["recommendation"]) == 500


def test_finalize_recommendation_defaults_to_none_when_missing():
    result = _finalize(
        {"action": "final", "score": 4, "justification": "Sudah baik.", "confidence": 0.9}
    )
    assert result["recommendation"] is None
    assert result["final_score"] == 4.0


# ── build_reasoning_graph compiles ────────────────────────────────────────────


def test_build_reasoning_graph_returns_compiled():
    from agent.reasoning_graph import build_reasoning_graph
    from llm.ollama_client import OllamaClient

    fake = OllamaClient(base_url="http://fake:11434", model="deepseek-r1:14b", timeout_seconds=30)
    graph = build_reasoning_graph(fake)
    assert hasattr(graph, "invoke")


def test_build_reasoning_llm_wraps_ollama_with_retry(monkeypatch):
    """Same regression as _build_llm in graph.py: a transient connection
    error talking to Ollama must be retried by the LLM runnable, not
    propagate raw with zero retry."""
    from unittest.mock import MagicMock
    from llm.ollama_client import OllamaClient
    from agent.reasoning_graph import _build_reasoning_llm

    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    fake_client = OllamaClient(base_url="http://fake:11434", model="test-model", timeout_seconds=30)

    with patch("langchain_ollama.ChatOllama") as mock_chat_ollama_cls:
        mock_chat_ollama_cls.return_value = MagicMock()
        _build_reasoning_llm(fake_client)

    mock_chat_ollama_cls.return_value.with_retry.assert_called_once()


def test_build_reasoning_llm_passes_timeout_to_underlying_client(monkeypatch):
    """Same gap as agent.graph._build_llm: OLLAMA_TIMEOUT_SECONDS never
    reached the real ChatOllama instance, so a hung request to Ollama had
    no timeout at all and never errored -- only a manual resume unstuck it."""
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_TIMEOUT_SECONDS", "123")
    from unittest.mock import MagicMock
    from llm.ollama_client import OllamaClient
    from agent.reasoning_graph import _build_reasoning_llm

    fake_client = OllamaClient(base_url="http://fake:11434", model="test-model", timeout_seconds=30)

    with patch("langchain_ollama.ChatOllama") as mock_chat_ollama_cls:
        mock_chat_ollama_cls.return_value = MagicMock()
        _build_reasoning_llm(fake_client)

    assert mock_chat_ollama_cls.call_args.kwargs["client_kwargs"]["timeout"] == 123


def test_build_reasoning_llm_openrouter_uses_ollama_client_model():
    """Same regression as graph.py's _build_llm: the openrouter branch must
    use ollama_client.model (the single resolved source of truth), not
    independently re-read OPENROUTER_MODEL from env."""
    from unittest.mock import MagicMock
    from llm.ollama_client import OllamaClient
    from agent.reasoning_graph import _build_reasoning_llm

    with patch.dict(
        os.environ,
        {"LLM_PROVIDER": "openrouter", "OPENROUTER_API_KEY": "fake-key", "OPENROUTER_MODEL": "wrong/model"},
    ):
        fake_client = OllamaClient(
            base_url="http://fake:11434", model="anthropic/claude-haiku-4.5", timeout_seconds=30
        )
        with patch("langchain_openai.ChatOpenAI") as mock_chat_openai_cls:
            mock_chat_openai_cls.return_value = MagicMock()
            _build_reasoning_llm(fake_client)

    _, kwargs = mock_chat_openai_cls.call_args
    assert kwargs["model"] == "anthropic/claude-haiku-4.5"


# ── loop termination: model that never stops calling tools ────────────────────


def _make_state():
    from unittest.mock import MagicMock

    return {
        "session_id": "test-session",
        "indicator_no": 1,
        "indicator_row": MagicMock(indicator_no=1, kriteria="Kondisi Eksternal"),
        "rubric": None,
        "led_evidence": [],
        "lkps_data": {},
        "messages": [],
        "reasoning_steps": [],
        "final_score": None,
        "sub_score_i": None,
        "sub_score_ii": None,
        "justification": None,
        "confidence": None,
        "recommendation": None,
        "error": None,
    }


def test_reasoning_graph_terminates_when_llm_always_calls_tools():
    """A reasoning model that emits a VALID tool-call JSON on every turn and
    never emits {"action": "final", ...} must be forced to a final answer
    within a bounded number of turns, not loop until it hits LangGraph's own
    recursion limit.

    Regression test: MAX_ITERATIONS was previously only checked on the
    invalid-JSON / unknown-action branches — a model that keeps validly
    calling a tool had no cap at all.

    Also covers ariel 10f5a53: state["error"] used to be set from inside a router and never persisted."""
    from unittest.mock import MagicMock, patch

    from langchain_core.messages import AIMessage
    from llm.ollama_client import OllamaClient
    from agent.reasoning_graph import build_reasoning_graph

    always_tool_call = AIMessage(
        content='{"action": "get_indicator_rubric", "args": {"indicator_no": 1}}'
    )
    fake_llm = MagicMock()
    fake_llm.invoke.return_value = always_tool_call

    fake_client = OllamaClient(base_url="http://fake:11434", model="deepseek-r1:14b", timeout_seconds=30)

    with (
        patch("agent.reasoning_graph._build_reasoning_llm", return_value=fake_llm),
        patch("agent.tools.rubric_tool._get_rubrics_for_set", return_value=[]),
    ):
        graph = build_reasoning_graph(fake_client)
        result = graph.invoke(_make_state(), config={"recursion_limit": 60})

    assert fake_llm.invoke.call_count < 60
    assert "final_score" in result
    assert result["error"] is not None


# ── checklist node ──────────────────────────────────────────────────────────


def test_checklist_built_once_and_injected_before_finalizing():
    from unittest.mock import MagicMock, patch

    from langchain_core.messages import AIMessage
    from llm.ollama_client import OllamaClient
    from agent.reasoning_graph import build_reasoning_graph

    rubric_tool_call = AIMessage(
        content='{"action": "get_indicator_rubric", "args": {"indicator_no": 1}}'
    )
    checklist_response = AIMessage(
        content=(
            "- Dokumen VMTS tersedia dan lengkap\n"
            "- Proses penyusunan melibatkan pemangku kepentingan\n"
            "- VMTS sudah disosialisasikan ke sivitas akademika"
        )
    )
    final_answer = AIMessage(
        content=(
            '{"action": "final", "score": 3, "justification": "Bukti memadai.", '
            '"confidence": 0.8, "recommendation": "Lengkapi dokumentasi sosialisasi."}'
        )
    )

    fake_llm = MagicMock()
    fake_llm.invoke.side_effect = [rubric_tool_call, checklist_response, final_answer]

    fake_client = OllamaClient(base_url="http://fake:11434", model="deepseek-r1:14b", timeout_seconds=30)

    with (
        patch("agent.reasoning_graph._build_reasoning_llm", return_value=fake_llm),
        patch("agent.tools.rubric_tool._get_rubrics_for_set") as mock_rubrics,
    ):
        mock_rubrics.return_value = [
            MagicMock(
                no=1, kriteria="VMTS", indikator="...", score_type="qualitative",
                score_criteria={"4": "VMTS lengkap, partisipatif, dan disosialisasikan"},
                formula=None, lkps_table_ref=None, sub_score_formula=None,
            )
        ]
        graph = build_reasoning_graph(fake_client)
        result = graph.invoke(_make_state(), config={"recursion_limit": 40})

    assert result["checklist"] is not None
    assert len(result["checklist"]) == 3
    assert result["final_score"] == 3.0
    assert fake_llm.invoke.call_count == 3
    injected = [
        m for m in result["messages"]
        if "Checklist" in (getattr(m, "content", "") or "")
    ]
    assert len(injected) == 1


def test_checklist_generation_failure_does_not_block_flow():
    from unittest.mock import MagicMock, patch

    from langchain_core.messages import AIMessage
    from llm.ollama_client import OllamaClient
    from agent.reasoning_graph import build_reasoning_graph

    rubric_tool_call = AIMessage(
        content='{"action": "get_indicator_rubric", "args": {"indicator_no": 1}}'
    )
    final_answer = AIMessage(
        content=(
            '{"action": "final", "score": 2, "justification": "Bukti terbatas.", '
            '"confidence": 0.6, "recommendation": "Lengkapi bukti."}'
        )
    )

    fake_llm = MagicMock()
    fake_llm.invoke.side_effect = [rubric_tool_call, RuntimeError("LLM timeout"), final_answer]

    fake_client = OllamaClient(base_url="http://fake:11434", model="deepseek-r1:14b", timeout_seconds=30)

    with (
        patch("agent.reasoning_graph._build_reasoning_llm", return_value=fake_llm),
        patch("agent.tools.rubric_tool._get_rubrics_for_set", return_value=[]),
    ):
        graph = build_reasoning_graph(fake_client)
        result = graph.invoke(_make_state(), config={"recursion_limit": 40})

    assert result["checklist"] is None
    assert result["final_score"] == 2.0


def test_checklist_node_auto_injects_tagged_evidence():
    """Tagged evidence must be injected unconditionally, not left to the model's own tool choice (ariel 491a2bb)."""
    import json
    from unittest.mock import MagicMock, patch

    from langchain_core.messages import AIMessage
    from llm.ollama_client import OllamaClient
    from agent.reasoning_graph import build_reasoning_graph

    rubric_tool_call = AIMessage(
        content='{"action": "get_indicator_rubric", "args": {"indicator_no": 1}}'
    )
    checklist_response = AIMessage(content="- Item satu")
    final_answer = AIMessage(
        content=(
            '{"action": "final", "score": 3, "justification": "Bukti memadai.", '
            '"confidence": 0.8, "recommendation": "Lengkapi."}'
        )
    )
    fake_llm = MagicMock()
    fake_llm.invoke.side_effect = [rubric_tool_call, checklist_response, final_answer]

    fake_client = OllamaClient(base_url="http://fake:11434", model="deepseek-r1:14b", timeout_seconds=30)
    evidence_json = json.dumps([{"text": "Isi SK.", "entity": "SK Rektor 123", "relevance_score": 0.9}])
    fake_evidence_tool = MagicMock()
    fake_evidence_tool.invoke.return_value = evidence_json

    with (
        patch("agent.reasoning_graph._build_reasoning_llm", return_value=fake_llm),
        patch("agent.tools.rubric_tool._get_rubrics_for_set", return_value=[]),
        patch("agent.reasoning_graph.search_evidence_documents", fake_evidence_tool),
    ):
        graph = build_reasoning_graph(fake_client)
        result = graph.invoke(_make_state(), config={"recursion_limit": 40})

    assert any("SK Rektor 123" in (getattr(m, "content", "") or "") for m in result["messages"])
    assert result["sources_used"]["evidence_documents"] == ["SK Rektor 123"]


def test_reasoning_graph_rejects_quantitative_finalize_without_formula_tool():
    """A quantitative indicator finalized without calling compute_formula_score must be force-retried, not accepted (ariel 10f5a53)."""
    from unittest.mock import MagicMock, patch

    from langchain_core.messages import AIMessage
    from llm.ollama_client import OllamaClient
    from agent.reasoning_graph import build_reasoning_graph

    rubric_tool_call = AIMessage(
        content='{"action": "get_indicator_rubric", "args": {"indicator_no": 1}}'
    )
    checklist_response = AIMessage(content="- Item satu")
    hand_computed_final = AIMessage(
        content='{"action": "final", "score": 3.6, "justification": "Dihitung manual.", "confidence": 0.7, "recommendation": "-"}'
    )
    formula_tool_call = AIMessage(
        content='{"action": "compute_formula_score", "args": {"formula_expression": "BOP / 5000000", "variables": {"BOP": 18000000}}}'
    )
    proper_final = AIMessage(
        content='{"action": "final", "score": 3.6, "justification": "Dihitung via tool.", "confidence": 0.9, "recommendation": "-"}'
    )

    fake_llm = MagicMock()
    fake_llm.invoke.side_effect = [
        rubric_tool_call, checklist_response, hand_computed_final, formula_tool_call, proper_final,
    ]

    fake_client = OllamaClient(base_url="http://fake:11434", model="deepseek-r1:14b", timeout_seconds=30)

    with (
        patch("agent.reasoning_graph._build_reasoning_llm", return_value=fake_llm),
        patch("agent.tools.rubric_tool._get_rubrics_for_set") as mock_rubrics,
    ):
        mock_rubrics.return_value = [
            MagicMock(
                no=1, kriteria="Pembiayaan", indikator="...", score_type="quantitative",
                score_criteria={}, formula="BOP / 5000000", lkps_table_ref=["Tabel 2.b"],
                sub_score_formula=None,
            )
        ]
        graph = build_reasoning_graph(fake_client)
        result = graph.invoke(_make_state(), config={"recursion_limit": 40})

    assert result["final_score"] == 3.6
    assert "tool:compute_formula_score" in result["reasoning_steps"]


def test_reasoning_graph_qualitative_score_gets_decimal_refined():
    from unittest.mock import MagicMock, patch

    from langchain_core.messages import AIMessage
    from llm.ollama_client import OllamaClient
    from agent.reasoning_graph import build_reasoning_graph

    rubric_tool_call = AIMessage(
        content='{"action": "get_indicator_rubric", "args": {"indicator_no": 1}}'
    )
    checklist_response = AIMessage(content="- Item satu")
    final_answer = AIMessage(
        content='{"action": "final", "score": 3, "justification": "Bukti memadai.", "confidence": 0.8, "recommendation": "Lengkapi."}'
    )
    band_diff_response = AIMessage(content='["Aspek A", "Aspek B"]')
    verify_response = AIMessage(content="[true, false]")

    fake_llm = MagicMock()
    fake_llm.invoke.side_effect = [
        rubric_tool_call, checklist_response, final_answer, band_diff_response, verify_response,
    ]

    fake_client = OllamaClient(base_url="http://fake:11434", model="deepseek-r1:14b", timeout_seconds=30)

    with (
        patch("agent.reasoning_graph._build_reasoning_llm", return_value=fake_llm),
        patch("agent.tools.rubric_tool._get_rubrics_for_set") as mock_rubrics,
    ):
        mock_rubrics.return_value = [
            MagicMock(
                no=1, kriteria="VMTS", indikator="...", score_type="qualitative",
                score_criteria={"3": "Kriteria band 3.", "4": "Kriteria band 4."},
                formula=None, lkps_table_ref=None, sub_score_formula=None,
            )
        ]
        graph = build_reasoning_graph(fake_client)
        result = graph.invoke(_make_state(), config={"recursion_limit": 40})

    assert result["final_score"] == 3.5
    assert "aspek tambahan" in result["justification"]


# ── independent judge ───────────────────────────────────────────────────────


def test_judge_runs_after_finalize_and_lowers_confidence_when_ungrounded():
    import json
    from unittest.mock import MagicMock, patch

    from langchain_core.messages import AIMessage
    from llm.ollama_client import OllamaClient
    from agent.reasoning_graph import build_reasoning_graph

    rubric_tool_call = AIMessage(
        content='{"action": "get_indicator_rubric", "args": {"indicator_no": 1}}'
    )
    checklist_response = AIMessage(content="- Dokumen VMTS tersedia\n- Proses partisipatif")
    evidence_tool_call = AIMessage(
        content='{"action": "search_led_evidence", "args": {"query": "visi misi"}}'
    )
    final_answer = AIMessage(
        content=(
            '{"action": "final", "score": 3, '
            '"justification": "Program studi disusun partisipatif dengan 100 dosen.", '
            '"confidence": 0.9, "recommendation": "Pertahankan praktik baik."}'
        )
    )

    fake_llm = MagicMock()
    fake_llm.invoke.side_effect = [
        rubric_tool_call, checklist_response, evidence_tool_call, final_answer,
    ]

    fake_judge_llm = MagicMock()
    fake_judge_llm.invoke.return_value = AIMessage(
        content=json.dumps({
            "grounded": False,
            "hallucinated_claims": ["100 dosen tidak disebut di bukti manapun"],
            "missing_facts": [],
            "notes": "Angka 100 dosen mengada-ada.",
        })
    )

    fake_client = OllamaClient(base_url="http://fake:11434", model="deepseek-r1:14b", timeout_seconds=30)

    with (
        patch("agent.reasoning_graph._build_reasoning_llm", return_value=fake_llm),
        patch("agent.reasoning_graph.build_judge_llm", return_value=fake_judge_llm),
        patch("agent.tools.rubric_tool._get_rubrics_for_set", return_value=[]),
        patch(
            "agent.tools.led_tool.search_led",
            return_value=[{
                "text": "Visi misi disusun lewat rapat pimpinan.",
                "metadata": {"page_start": 12, "page_end": 12, "para_start": -1, "para_end": -1, "section_heading": ""},
                "distance": 0.1,
            }],
        ),
    ):
        graph = build_reasoning_graph(fake_client)
        result = graph.invoke(_make_state(), config={"recursion_limit": 60})

    assert result["final_score"] == 3.0
    assert result["judge_verdict"]["grounded"] is False
    assert result["confidence"] <= 0.3
    fake_judge_llm.invoke.assert_called_once()


def test_judge_failure_does_not_block_result():
    from unittest.mock import MagicMock, patch

    from langchain_core.messages import AIMessage
    from llm.ollama_client import OllamaClient
    from agent.reasoning_graph import build_reasoning_graph

    rubric_tool_call = AIMessage(
        content='{"action": "get_indicator_rubric", "args": {"indicator_no": 1}}'
    )
    checklist_response = AIMessage(content="- Dokumen VMTS tersedia")
    final_answer = AIMessage(
        content=(
            '{"action": "final", "score": 2, "justification": "Bukti terbatas.", '
            '"confidence": 0.7, "recommendation": "Lengkapi bukti."}'
        )
    )

    fake_llm = MagicMock()
    fake_llm.invoke.side_effect = [rubric_tool_call, checklist_response, final_answer]

    fake_judge_llm = MagicMock()
    fake_judge_llm.invoke.side_effect = RuntimeError("judge unreachable")

    fake_client = OllamaClient(base_url="http://fake:11434", model="deepseek-r1:14b", timeout_seconds=30)

    with (
        patch("agent.reasoning_graph._build_reasoning_llm", return_value=fake_llm),
        patch("agent.reasoning_graph.build_judge_llm", return_value=fake_judge_llm),
        patch("agent.tools.rubric_tool._get_rubrics_for_set", return_value=[]),
    ):
        graph = build_reasoning_graph(fake_client)
        result = graph.invoke(_make_state(), config={"recursion_limit": 60})

    assert result["final_score"] == 2.0
    assert result["confidence"] == 0.7
    assert "error" in (result["judge_verdict"] or {})


def test_search_evidence_documents_registered_in_tool_registry():
    from agent.reasoning_graph import _TOOL_REGISTRY

    assert "search_evidence_documents" in _TOOL_REGISTRY


def test_collect_reasoning_evidence_text_includes_evidence_tool_by_default():
    from agent.reasoning_graph import _collect_reasoning_evidence_text
    from langchain_core.messages import HumanMessage

    messages = [
        HumanMessage(content="Tool result (search_led_evidence): LED bilang X"),
        HumanMessage(content="Tool result (search_evidence_documents): Sertifikat menunjukkan Y"),
    ]
    combined = _collect_reasoning_evidence_text(messages)
    assert "Sertifikat menunjukkan Y" in combined
