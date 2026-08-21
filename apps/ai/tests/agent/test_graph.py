"""Tests for graph structure and parse_output node (no LLM calls)."""

import re
import pytest
from unittest.mock import MagicMock, patch

from agent.state import AssessmentState


def _make_state(**overrides) -> AssessmentState:
    base: AssessmentState = {
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
    base.update(overrides)
    return base


# ── graph import / compilation ─────────────────────────────────────────────────

def test_build_graph_returns_compiled_graph():
    """build_graph should produce a compilable LangGraph without network calls."""
    from llm.ollama_client import OllamaClient
    from agent.graph import build_graph

    fake_client = OllamaClient(
        base_url="http://fake:11434",
        model="test-model",
        timeout_seconds=30,
    )
    graph = build_graph(fake_client)
    # Compiled StateGraph has an `invoke` attribute
    assert hasattr(graph, "invoke")


# ── loop termination: model that never stops calling tools ────────────────────

def test_graph_terminates_when_llm_always_calls_tools():
    """A model that validly calls a tool on every turn (never emits a
    parseable SKOR line, never stops requesting tools) must be forced to a
    final answer within a bounded number of turns — not loop until it hits
    LangGraph's own recursion limit.

    Regression test for the missing tool-call cap: previously `should_continue`
    routed to "tools" unconditionally whenever the model returned tool_calls,
    with no counter — 30 LLM calls in and still climbing before this fix.
    """
    from langchain_core.messages import AIMessage
    from llm.ollama_client import OllamaClient
    from agent.graph import build_graph

    always_tool_call = AIMessage(
        content="",
        tool_calls=[
            {"name": "get_indicator_rubric", "args": {"indicator_no": 1}, "id": "call_1"}
        ],
    )
    fake_llm = MagicMock()
    fake_llm.invoke.return_value = always_tool_call

    fake_client = OllamaClient(base_url="http://fake:11434", model="test-model", timeout_seconds=30)

    with (
        patch("agent.graph._build_llm", return_value=fake_llm),
        patch("agent.tools.rubric_tool._get_rubrics", return_value=[]),
    ):
        graph = build_graph(fake_client)
        # Small-but-generous recursion_limit: the fix must terminate well
        # under LangGraph's own limit, not rely on it as a safety net.
        result = graph.invoke(_make_state(), config={"recursion_limit": 40})

    # Terminated on its own (no GraphRecursionError) — the mock LLM never once
    # emitted a parseable SKOR line, so the graph had to force its way to
    # parse_output rather than exit "naturally".
    assert fake_llm.invoke.call_count < 40
    # parse_output always runs eventually, even if the forced answer is empty —
    # confirm we actually reached it rather than stopping mid-loop.
    assert "final_score" in result


# ── checklist node ──────────────────────────────────────────────────────────

def test_checklist_built_once_and_injected_before_finalizing():
    """After the rubric tool result comes back, a checklist should be built
    once (one extra LLM call), stored in state, and injected into the
    conversation — then the flow continues to a normal final answer."""
    import json
    from langchain_core.messages import AIMessage
    from llm.ollama_client import OllamaClient
    from agent.graph import build_graph

    rubric_tool_call = AIMessage(
        content="",
        tool_calls=[
            {"name": "get_indicator_rubric", "args": {"indicator_no": 1}, "id": "call_1"}
        ],
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
            "SKOR: 3\nJUSTIFIKASI: Bukti memadai.\nCONFIDENCE: 0.8\n"
            "REKOMENDASI: Lengkapi dokumentasi sosialisasi."
        )
    )

    fake_llm = MagicMock()
    fake_llm.invoke.side_effect = [rubric_tool_call, checklist_response, final_answer]

    fake_rubric_json = json.dumps({
        "no": 1, "kriteria": "VMTS", "indikator": "...",
        "score_type": "qualitative",
        "score_criteria": {"4": "VMTS lengkap, partisipatif, dan disosialisasikan"},
        "formula": None, "lkps_table_ref": None, "sub_score_formula": None,
    })

    fake_client = OllamaClient(base_url="http://fake:11434", model="test-model", timeout_seconds=30)

    with (
        patch("agent.graph._build_llm", return_value=fake_llm),
        patch("agent.tools.rubric_tool._get_rubrics") as mock_rubrics,
    ):
        mock_rubrics.return_value = [
            MagicMock(
                no=1, kriteria="VMTS", indikator="...", score_type="qualitative",
                score_criteria={"4": "VMTS lengkap, partisipatif, dan disosialisasikan"},
                formula=None, lkps_table_ref=None, sub_score_formula=None,
            )
        ]
        graph = build_graph(fake_client)
        result = graph.invoke(_make_state(), config={"recursion_limit": 40})

    assert result["checklist"] is not None
    assert len(result["checklist"]) == 3
    assert any("VMTS" in item for item in result["checklist"])
    assert result["final_score"] == 3.0
    # 3 LLM calls total: rubric tool-call turn, checklist generation, final answer.
    assert fake_llm.invoke.call_count == 3
    # The checklist got injected into the conversation as a HumanMessage.
    injected = [
        m for m in result["messages"]
        if getattr(m, "type", None) == "human" and "Checklist" in (m.content or "")
    ]
    assert len(injected) == 1


def test_checklist_generation_failure_does_not_block_flow():
    """If the checklist LLM call itself raises, the flow must still reach a
    final answer instead of crashing the whole indicator."""
    from langchain_core.messages import AIMessage
    from llm.ollama_client import OllamaClient
    from agent.graph import build_graph

    rubric_tool_call = AIMessage(
        content="",
        tool_calls=[
            {"name": "get_indicator_rubric", "args": {"indicator_no": 1}, "id": "call_1"}
        ],
    )
    final_answer = AIMessage(
        content="SKOR: 2\nJUSTIFIKASI: Bukti terbatas.\nCONFIDENCE: 0.6\nREKOMENDASI: Lengkapi bukti."
    )

    fake_llm = MagicMock()
    fake_llm.invoke.side_effect = [rubric_tool_call, RuntimeError("LLM timeout"), final_answer]

    fake_client = OllamaClient(base_url="http://fake:11434", model="test-model", timeout_seconds=30)

    with (
        patch("agent.graph._build_llm", return_value=fake_llm),
        patch("agent.tools.rubric_tool._get_rubrics", return_value=[]),
    ):
        graph = build_graph(fake_client)
        result = graph.invoke(_make_state(), config={"recursion_limit": 40})

    assert result["checklist"] is None
    assert result["final_score"] == 2.0


# ── independent judge ───────────────────────────────────────────────────────

def test_judge_runs_after_parse_output_and_lowers_confidence_when_ungrounded():
    """After a final score is parsed, an independent judge (separate model)
    checks whether the justification is grounded in evidence that was
    actually retrieved. When it flags the claim as ungrounded, confidence
    must be capped down rather than left at the model's own self-report."""
    import json
    from langchain_core.messages import AIMessage
    from llm.ollama_client import OllamaClient
    from agent.context import AssessmentContext, current_assessment_context
    from agent.graph import build_graph

    # search_led_evidence reads (tenant_id, dokumen_id) from agent.context —
    # see agent/context.py. This is the only test in this module that reaches
    # that tool, so the context is set locally rather than via a module-wide
    # autouse fixture (test_tools.py's pattern for the tools that all need it).
    token = current_assessment_context.set(AssessmentContext("tenant-x", "doc-1"))

    rubric_tool_call = AIMessage(
        content="",
        tool_calls=[{"name": "get_indicator_rubric", "args": {"indicator_no": 1}, "id": "call_1"}],
    )
    checklist_response = AIMessage(content="- Dokumen VMTS tersedia\n- Proses partisipatif")
    evidence_tool_call = AIMessage(
        content="",
        tool_calls=[{"name": "search_led_evidence", "args": {"query": "visi misi"}, "id": "call_2"}],
    )
    final_answer = AIMessage(
        content=(
            "SKOR: 3\nJUSTIFIKASI: Program studi disusun secara partisipatif dengan 100 dosen.\n"
            "CONFIDENCE: 0.9\nREKOMENDASI: Pertahankan praktik baik."
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

    fake_client = OllamaClient(base_url="http://fake:11434", model="test-model", timeout_seconds=30)

    try:
        with (
            patch("agent.graph._build_llm", return_value=fake_llm),
            patch("agent.graph.build_judge_llm", return_value=fake_judge_llm),
            patch("agent.tools.rubric_tool._get_rubrics", return_value=[]),
            patch(
                "agent.tools.led_tool.search_led",
                return_value=[{
                    "text": "Visi misi disusun lewat rapat pimpinan.",
                    "metadata": {"page_start": 12, "page_end": 12, "para_start": -1, "para_end": -1, "section_heading": ""},
                    "distance": 0.1,
                }],
            ),
        ):
            graph = build_graph(fake_client)
            result = graph.invoke(_make_state(), config={"recursion_limit": 60})
    finally:
        current_assessment_context.reset(token)

    assert result["final_score"] == 3.0
    assert result["judge_verdict"]["grounded"] is False
    assert result["confidence"] <= 0.3
    fake_judge_llm.invoke.assert_called_once()


def test_judge_leaves_confidence_untouched_when_grounded():
    import json
    from langchain_core.messages import AIMessage
    from llm.ollama_client import OllamaClient
    from agent.graph import build_graph

    rubric_tool_call = AIMessage(
        content="",
        tool_calls=[{"name": "get_indicator_rubric", "args": {"indicator_no": 1}, "id": "call_1"}],
    )
    checklist_response = AIMessage(content="- Dokumen VMTS tersedia")
    final_answer = AIMessage(
        content="SKOR: 2\nJUSTIFIKASI: Bukti terbatas.\nCONFIDENCE: 0.7\nREKOMENDASI: Lengkapi bukti."
    )

    fake_llm = MagicMock()
    fake_llm.invoke.side_effect = [rubric_tool_call, checklist_response, final_answer]

    fake_judge_llm = MagicMock()
    fake_judge_llm.invoke.return_value = AIMessage(
        content=json.dumps({"grounded": True, "hallucinated_claims": [], "missing_facts": [], "notes": "OK."})
    )

    fake_client = OllamaClient(base_url="http://fake:11434", model="test-model", timeout_seconds=30)

    with (
        patch("agent.graph._build_llm", return_value=fake_llm),
        patch("agent.graph.build_judge_llm", return_value=fake_judge_llm),
        patch("agent.tools.rubric_tool._get_rubrics", return_value=[]),
    ):
        graph = build_graph(fake_client)
        result = graph.invoke(_make_state(), config={"recursion_limit": 60})

    assert result["confidence"] == 0.7
    assert result["judge_verdict"]["grounded"] is True


def test_judge_failure_does_not_block_result():
    from langchain_core.messages import AIMessage
    from llm.ollama_client import OllamaClient
    from agent.graph import build_graph

    rubric_tool_call = AIMessage(
        content="",
        tool_calls=[{"name": "get_indicator_rubric", "args": {"indicator_no": 1}, "id": "call_1"}],
    )
    checklist_response = AIMessage(content="- Dokumen VMTS tersedia")
    final_answer = AIMessage(
        content="SKOR: 2\nJUSTIFIKASI: Bukti terbatas.\nCONFIDENCE: 0.7\nREKOMENDASI: Lengkapi bukti."
    )

    fake_llm = MagicMock()
    fake_llm.invoke.side_effect = [rubric_tool_call, checklist_response, final_answer]

    fake_judge_llm = MagicMock()
    fake_judge_llm.invoke.side_effect = RuntimeError("judge unreachable")

    fake_client = OllamaClient(base_url="http://fake:11434", model="test-model", timeout_seconds=30)

    with (
        patch("agent.graph._build_llm", return_value=fake_llm),
        patch("agent.graph.build_judge_llm", return_value=fake_judge_llm),
        patch("agent.tools.rubric_tool._get_rubrics", return_value=[]),
    ):
        graph = build_graph(fake_client)
        result = graph.invoke(_make_state(), config={"recursion_limit": 60})

    assert result["final_score"] == 2.0
    assert result["confidence"] == 0.7
    assert "error" in (result["judge_verdict"] or {})


def test_graph_terminates_when_llm_never_finalizes():
    """A chat-tuned model that goes conversational — never calls a tool, never
    emits a parseable SKOR line — must stop after FORCE_LIMIT retries.

    Regression test for _force_count silently not persisting across graph
    steps (it wasn't declared in AssessmentState, so LangGraph dropped it
    between node executions and the retry limit never actually applied)."""
    from langchain_core.messages import AIMessage
    from llm.ollama_client import OllamaClient
    from agent.graph import build_graph

    chatty = AIMessage(content="Saya melihat Anda telah membagikan beberapa dokumen...")
    fake_llm = MagicMock()
    fake_llm.invoke.return_value = chatty

    fake_client = OllamaClient(base_url="http://fake:11434", model="test-model", timeout_seconds=30)

    with patch("agent.graph._build_llm", return_value=fake_llm):
        graph = build_graph(fake_client)
        result = graph.invoke(_make_state(), config={"recursion_limit": 40})

    assert fake_llm.invoke.call_count < 40
    assert "final_score" in result


# ── parse_output logic (extracted for unit testing) ───────────────────────────

def _parse_output(content: str) -> dict:
    """Mirrors the parse_output_node logic for isolated testing.

    Permissive: handles markdown bold, headings, backticks, case variations,
    and picks the LAST in-range score so a "Skor = formula" reference doesn't win.
    """
    cleaned = re.sub(r"\*{1,3}|`+|#+\s*", "", content)

    score_candidates = re.findall(
        r"(?im)\bskor(?:\s+(?:final|akhir))?\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)",
        cleaned,
    )
    score = None
    for cand in reversed(score_candidates):
        try:
            v = float(cand)
        except ValueError:
            continue
        if 0.0 <= v <= 4.0:
            score = v
            break

    just_match = re.search(
        r"(?is)\bjustifikasi\s*[:=]\s*(.+?)(?=\bconfidence\b|$)", cleaned
    )
    justification = just_match.group(1).strip() if just_match else cleaned.strip()[:600]

    conf_match = re.search(r"(?i)\bconfidence\s*[:=]\s*([0-9]*\.?[0-9]+)", cleaned)
    if conf_match:
        try:
            confidence = max(0.0, min(1.0, float(conf_match.group(1))))
        except ValueError:
            confidence = 0.5
    else:
        confidence = 0.5

    rekom_match = re.search(r"(?is)\brekomendasi\s*[:=]\s*(.+)$", cleaned)
    recommendation = rekom_match.group(1).strip() if rekom_match else None

    return {
        "final_score": score,
        "justification": justification,
        "confidence": confidence,
        "recommendation": recommendation,
    }


def test_parse_output_extracts_score():
    result = _parse_output("SKOR: 3\nJUSTIFIKASI: Program studi cukup baik.\nCONFIDENCE: 0.8")
    assert result["final_score"] == 3.0
    assert result["confidence"] == 0.8


def test_parse_output_extracts_decimal_score():
    result = _parse_output("SKOR: 2.67\nJUSTIFIKASI: Composite.\nCONFIDENCE: 0.75")
    assert result["final_score"] == pytest.approx(2.67)


def test_parse_output_defaults_when_missing():
    result = _parse_output("Program studi telah memenuhi beberapa kriteria.")
    assert result["final_score"] is None
    assert result["confidence"] == 0.5
    assert len(result["justification"]) > 0


def test_parse_output_strips_justification_whitespace():
    result = _parse_output("SKOR: 4\nJUSTIFIKASI:   \nTeks justifikasi.\n  \nCONFIDENCE: 1.0")
    assert result["justification"] == "Teks justifikasi."


def test_parse_output_handles_markdown_bold():
    """LLM often wraps fields in **bold** — parser must strip it."""
    content = "## Hasil\n**Skor:** 3\n**Justifikasi:** Bagus.\n**Confidence:** 0.85"
    result = _parse_output(content)
    assert result["final_score"] == 3.0
    assert result["confidence"] == pytest.approx(0.85)


def test_parse_output_picks_last_score_ignoring_formula():
    """`Skor = formula` early in the message must NOT win over `Skor Akhir: 2.5`."""
    content = (
        "Rumus: Skor = ((I × 2) + II) / 3\n"
        "Perhitungan: I=3, II=2\n"
        "Skor Akhir: 2.67\n"
        "Confidence: 0.7"
    )
    result = _parse_output(content)
    assert result["final_score"] == pytest.approx(2.67)


def test_parse_output_lowercase_keys():
    result = _parse_output("skor: 4\njustifikasi: lengkap.\nconfidence: 0.95")
    assert result["final_score"] == 4.0
    assert result["confidence"] == pytest.approx(0.95)


def test_parse_output_clamps_confidence_above_one():
    result = _parse_output("SKOR: 2\nCONFIDENCE: 1.5")
    assert result["confidence"] == 1.0


def test_parse_output_score_out_of_range_skipped():
    """A '5' in the message must not be returned as score (rubric is 0–4)."""
    result = _parse_output("Skor: 5\nCatatan: di luar rubrik.")
    # No valid candidate in 0..4 → None
    assert result["final_score"] is None


# ── state TypedDict structure ─────────────────────────────────────────────────

def test_assessment_state_has_required_keys():
    state = _make_state()
    required = {
        "session_id", "indicator_no", "indicator_row", "rubric",
        "led_evidence", "lkps_data", "messages", "reasoning_steps",
        "final_score", "justification", "confidence", "recommendation", "error",
    }
    assert required.issubset(state.keys())


# ── recommendation extraction ─────────────────────────────────────────────────

def test_parse_output_extracts_recommendation():
    result = _parse_output(
        "SKOR: 3\nJUSTIFIKASI: Program studi cukup baik.\nCONFIDENCE: 0.8\n"
        "REKOMENDASI: Tingkatkan rasio DTPS dengan merekrut tenaga pengajar baru."
    )
    assert result["recommendation"] == "Tingkatkan rasio DTPS dengan merekrut tenaga pengajar baru."


def test_parse_output_recommendation_defaults_to_none_when_missing():
    result = _parse_output("SKOR: 4\nJUSTIFIKASI: Lengkap.\nCONFIDENCE: 0.9")
    assert result["recommendation"] is None
    assert result["final_score"] == 4.0


def test_parse_output_recommendation_handles_markdown_bold():
    content = (
        "**Skor:** 3\n**Justifikasi:** Bagus.\n"
        "**Confidence:** 0.85\n**Rekomendasi:** Lengkapi dokumen kerjasama industri."
    )
    result = _parse_output(content)
    assert result["recommendation"] == "Lengkapi dokumen kerjasama industri."
