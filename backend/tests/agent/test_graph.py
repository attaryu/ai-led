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

    return {"final_score": score, "justification": justification, "confidence": confidence}


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
        "final_score", "justification", "confidence", "error",
    }
    assert required.issubset(state.keys())
