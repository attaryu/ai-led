"""Unit tests for the four LangGraph agent tools."""

import json
import pytest

# ── formula_tool ──────────────────────────────────────────────────────────────


def test_formula_tool_basic():
    from agent.tools.formula_tool import compute_formula_score

    result = json.loads(compute_formula_score.invoke({"formula_expression": "BOP / 5000000", "variables": {"BOP": 25_000_000}}))
    assert result["clamped_score"] == 4.0
    assert result["raw_result"] == 5.0


def test_formula_tool_clamps_above_4():
    from agent.tools.formula_tool import compute_formula_score

    result = json.loads(compute_formula_score.invoke({"formula_expression": "x * 10", "variables": {"x": 100}}))
    assert result["clamped_score"] == 4.0


def test_formula_tool_clamps_below_0():
    from agent.tools.formula_tool import compute_formula_score

    result = json.loads(compute_formula_score.invoke({"formula_expression": "x - 50", "variables": {"x": 0}}))
    assert result["clamped_score"] == 0.0


def test_formula_tool_division_by_zero():
    from agent.tools.formula_tool import compute_formula_score

    result = json.loads(compute_formula_score.invoke({"formula_expression": "1 / 0", "variables": {}}))
    assert "error" in result


def test_formula_tool_rejects_dangerous_builtins():
    from agent.tools.formula_tool import compute_formula_score

    # Attempt to access __import__ — should fail due to empty __builtins__
    result = json.loads(compute_formula_score.invoke({"formula_expression": "__import__('os')", "variables": {}}))
    assert "error" in result


# ── rubric_tool (mocked file system) ─────────────────────────────────────────


def test_rubric_tool_not_found(monkeypatch):
    """Returns error JSON when indicator_no is not in cache."""
    from agent.tools import rubric_tool

    monkeypatch.setitem(rubric_tool._rubric_cache, "rubrics", [])
    result = json.loads(rubric_tool.get_indicator_rubric.invoke({"indicator_no": 999}))
    assert "error" in result


def test_rubric_tool_returns_fields(monkeypatch):
    """Returns all expected fields for a found indicator."""
    from ingestion.matrix_parser import IndicatorRubric
    from agent.tools import rubric_tool

    fake = IndicatorRubric(
        no=1,
        kriteria="A. Kondisi Eksternal",
        indikator="Konsistensi SWOT",
        score_type="qualitative",
        score_criteria={4: "Sangat baik", 3: "Baik", 2: "Cukup", 1: "Kurang", 0: "Tidak ada"},
        formula=None,
        lkps_table_ref=[],
        sub_score_formula=None,
    )
    monkeypatch.setitem(rubric_tool._rubric_cache, "rubrics", [fake])
    result = json.loads(rubric_tool.get_indicator_rubric.invoke({"indicator_no": 1}))
    assert result["no"] == 1
    assert result["score_type"] == "qualitative"
    assert "score_criteria" in result


# ── lkps_tool ─────────────────────────────────────────────────────────────────


def test_lkps_tool_no_registry():
    from agent.tools import lkps_tool

    lkps_tool._lkps_registry = None
    result = json.loads(lkps_tool.get_lkps_table.invoke({"table_reference": "Tabel 2.a. LKPS"}))
    assert "error" in result


def test_lkps_tool_with_registry(monkeypatch):
    """Returns markdown table when registry has the reference."""
    import pandas as pd
    from agent.tools import lkps_tool

    class FakeRegistry:
        sheets = {"2a1": None}
        def get_by_ref(self, ref):
            if "2.a" in ref or "2a" in ref.lower():
                return pd.DataFrame({"Nama": ["Alice"], "Nilai": [90]})
            return None

    lkps_tool.set_lkps_registry(FakeRegistry())
    result = lkps_tool.get_lkps_table.invoke({"table_reference": "Tabel 2.a. LKPS"})
    assert "Alice" in result or "Nama" in result


# ── led_tool ──────────────────────────────────────────────────────────────────


def test_led_tool_returns_json(monkeypatch):
    """Returns valid JSON list on successful search."""
    from agent.tools import led_tool

    def fake_search(query, persist_dir, n_results):
        return [
            {
                "text": "Program studi memiliki visi yang jelas.",
                "chunk_id": "abc",
                "distance": 0.1,
                "metadata": {"page_start": 1, "page_end": 2, "section_heading": "Visi", "char_start": 0},
            }
        ]

    monkeypatch.setattr("agent.tools.led_tool.search_led", fake_search)
    result = json.loads(led_tool.search_led_evidence.invoke({"query": "visi misi", "n_results": 3}))
    assert isinstance(result, list)
    assert result[0]["relevance_score"] == pytest.approx(0.9)
