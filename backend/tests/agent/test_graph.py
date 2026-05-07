"""Tests for graph structure and parse_output node (no LLM calls)."""

import re
import pytest
from unittest.mock import MagicMock

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


# ── parse_output logic (extracted for unit testing) ───────────────────────────

def _parse_output(content: str) -> dict:
    """Mirrors the parse_output_node logic for isolated testing."""
    score_match = re.search(r"SKOR:\s*([\d\.]+)", content)
    just_match = re.search(r"JUSTIFIKASI:\s*(.+?)(?=CONFIDENCE:|$)", content, re.DOTALL)
    conf_match = re.search(r"CONFIDENCE:\s*([\d\.]+)", content)
    return {
        "final_score": float(score_match.group(1)) if score_match else None,
        "justification": just_match.group(1).strip() if just_match else content[:500],
        "confidence": float(conf_match.group(1)) if conf_match else 0.5,
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


# ── state TypedDict structure ─────────────────────────────────────────────────

def test_assessment_state_has_required_keys():
    state = _make_state()
    required = {
        "session_id", "indicator_no", "indicator_row", "rubric",
        "led_evidence", "lkps_data", "messages", "reasoning_steps",
        "final_score", "justification", "confidence", "error",
    }
    assert required.issubset(state.keys())
