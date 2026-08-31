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


def test_formula_tool_missing_variable_returns_error():
    """A plausible LLM mistake: referencing a variable name that wasn't
    passed in `variables`. Must degrade to a structured error, not crash."""
    from agent.tools.formula_tool import compute_formula_score

    result = json.loads(
        compute_formula_score.invoke({"formula_expression": "BOP / 5000000", "variables": {"OTHER": 1}})
    )
    assert "error" in result


# ── rubric_tool (Postgres, scoped per AccreditationSet via AssessmentContext) ──
#
# get_indicator_rubric reads rubric_criteria for require_current_context().
# accreditation_set_id (here, "set-x" per the module's autouse fixture above),
# cached in _rubric_cache_by_set — tests seed that cache directly rather than
# hitting a real DB. _rubric_cache/RUBRIC_CACHE_PATH (matrix.json) below still
# exist but are now only read by GET /assessment/indicators (the seed script's
# bootstrap source), not by this tool.


def test_rubric_tool_not_found(monkeypatch):
    """Returns error JSON when indicator_no is not in the set's cache."""
    from agent.tools import rubric_tool

    monkeypatch.setitem(rubric_tool._rubric_cache_by_set, "set-x", [])
    result = json.loads(rubric_tool.get_indicator_rubric.invoke({"indicator_no": 999}))
    assert "error" in result


def test_rubric_tool_db_error_returns_error(monkeypatch):
    """A Postgres failure loading the set's criteria must surface as a
    structured tool error, not an unhandled exception — get_indicator_rubric
    is the mandatory FIRST tool call per the system prompt, so an uncaught
    crash here kills every single indicator."""
    from agent.tools import rubric_tool

    rubric_tool._rubric_cache_by_set.clear()
    rubric_tool._rubric_load_errors_by_set.clear()
    monkeypatch.setattr(
        rubric_tool,
        "get_rubric_criteria_for_set",
        lambda accreditation_set_id: (_ for _ in ()).throw(RuntimeError("connection refused")),
    )

    result = json.loads(rubric_tool.get_indicator_rubric.invoke({"indicator_no": 1}))
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
    monkeypatch.setitem(rubric_tool._rubric_cache_by_set, "set-x", [fake])
    result = json.loads(rubric_tool.get_indicator_rubric.invoke({"indicator_no": 1}))
    assert result["no"] == 1
    assert result["score_type"] == "qualitative"
    assert "score_criteria" in result


def test_rubric_tool_scopes_cache_per_accreditation_set(monkeypatch):
    """Two different accreditation_set_id contexts must not see each other's
    cached rubrics — a wrong-set lookup was the whole point of moving off the
    old single global _rubric_cache."""
    from ingestion.matrix_parser import IndicatorRubric
    from agent.context import AssessmentContext, current_assessment_context
    from agent.tools import rubric_tool

    fake_x = IndicatorRubric(
        no=1, kriteria="Set X", indikator="i", score_type="qualitative",
        score_criteria={}, formula=None, lkps_table_ref=[], sub_score_formula=None,
    )
    monkeypatch.setitem(rubric_tool._rubric_cache_by_set, "set-x", [fake_x])
    monkeypatch.setitem(rubric_tool._rubric_cache_by_set, "set-y", [])

    result_x = json.loads(rubric_tool.get_indicator_rubric.invoke({"indicator_no": 1}))
    assert result_x["kriteria"] == "Set X"

    token = current_assessment_context.set(AssessmentContext("tenant-y", "doc-9", 1, "set-y"))
    try:
        result_y = json.loads(rubric_tool.get_indicator_rubric.invoke({"indicator_no": 1}))
    finally:
        current_assessment_context.reset(token)
    assert "error" in result_y


# ── lkps_tool / led_tool: (tenant_id, dokumen_id) scoping ──────────────────────
#
# Both tools read the current (tenant_id, dokumen_id) from agent.context
# instead of a bare module-level global — see agent/context.py for why. Every
# test below sets/clears that context explicitly rather than relying on
# import-time state.


@pytest.fixture(autouse=True)
def _assessment_context():
    """Set a fixed (tenant_id, dokumen_id) for every test in this module, and
    reset it after — tests must not leak context into each other."""
    from agent.context import AssessmentContext, current_assessment_context

    token = current_assessment_context.set(AssessmentContext("tenant-x", "doc-1", 1, "set-x"))
    yield
    current_assessment_context.reset(token)


# ── lkps_tool ─────────────────────────────────────────────────────────────────


def test_lkps_tool_no_registry():
    from agent.tools import lkps_tool

    lkps_tool._registries.clear()
    result = json.loads(lkps_tool.get_lkps_table.invoke({"table_reference": "Tabel 2.a. LKPS"}))
    assert "error" in result


def test_lkps_tool_no_context_raises():
    """Calling the tool with no AssessmentContext set at all — not even a
    different tenant — must fail loudly, never silently answer from the
    wrong (or no) document."""
    from agent.context import current_assessment_context
    from agent.tools import lkps_tool

    token = current_assessment_context.set(None)
    try:
        with pytest.raises(RuntimeError):
            lkps_tool.get_lkps_table.invoke({"table_reference": "Tabel 2.a. LKPS"})
    finally:
        current_assessment_context.reset(token)


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

    lkps_tool.set_lkps_registry("tenant-x", "doc-1", FakeRegistry())
    result = lkps_tool.get_lkps_table.invoke({"table_reference": "Tabel 2.a. LKPS"})
    assert "Alice" in result or "Nama" in result


def test_lkps_tool_scoped_per_tenant_document(monkeypatch):
    """Two different (tenant_id, dokumen_id) registries must never answer
    each other's query — this is the whole point of the scoping fix."""
    import pandas as pd
    from agent.context import AssessmentContext, current_assessment_context
    from agent.tools import lkps_tool

    class FakeRegistry:
        def __init__(self, name):
            self.name = name
            self.sheets = {"2a1": None}
        def get_by_ref(self, ref):
            return pd.DataFrame({"owner": [self.name]})

    lkps_tool.set_lkps_registry("tenant-x", "doc-1", FakeRegistry("tenant-x-data"))
    lkps_tool.set_lkps_registry("tenant-y", "doc-9", FakeRegistry("tenant-y-data"))

    result_x = lkps_tool.get_lkps_table.invoke({"table_reference": "Tabel 1"})
    assert "tenant-x-data" in result_x

    token = current_assessment_context.set(AssessmentContext("tenant-y", "doc-9", 1, "set-y"))
    try:
        result_y = lkps_tool.get_lkps_table.invoke({"table_reference": "Tabel 1"})
    finally:
        current_assessment_context.reset(token)
    assert "tenant-y-data" in result_y
    assert "tenant-x-data" not in result_y


def test_lkps_tool_empty_sheet_returns_error_not_crash():
    """A matching sheet that's empty (no rows) must degrade to the normal
    'not found' error, not crash on an empty DataFrame."""
    import pandas as pd
    from agent.tools import lkps_tool

    class FakeRegistry:
        sheets = {"2a1": pd.DataFrame()}
        def get_by_ref(self, ref):
            return None  # mirrors LKPSRegistry.get_by_ref: all matches empty -> None

    lkps_tool.set_lkps_registry("tenant-x", "doc-1", FakeRegistry())
    result = json.loads(lkps_tool.get_lkps_table.invoke({"table_reference": "Tabel 2.a. LKPS"}))
    assert "error" in result


# ── led_tool ──────────────────────────────────────────────────────────────────


def test_led_tool_returns_json(monkeypatch):
    """Returns valid JSON list on successful search."""
    from agent.tools import led_tool

    def fake_search(query, tenant_id, dokumen_id, n_results):
        assert tenant_id == "tenant-x"
        assert dokumen_id == "doc-1"
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


def test_led_tool_no_context_raises():
    from agent.context import current_assessment_context
    from agent.tools import led_tool

    token = current_assessment_context.set(None)
    try:
        with pytest.raises(RuntimeError):
            led_tool.search_led_evidence.invoke({"query": "visi misi"})
    finally:
        current_assessment_context.reset(token)


# ── evidence_tool ────────────────────────────────────────────────────────────


def test_search_evidence_documents_returns_json_list(monkeypatch):
    from agent.tools import evidence_tool

    def fake_ids(tenant_id, accreditation_set_id, indicator_no):
        assert tenant_id == "tenant-x"
        assert accreditation_set_id == "set-x"
        assert indicator_no == 1
        return ["ev1"]

    def fake_search(query, tenant_id, bukti_dukung_ids, n_results):
        assert bukti_dukung_ids == ["ev1"]
        return [
            {
                "text": "Sertifikat akreditasi B untuk program studi",
                "entity": "sertifikat.pdf",
                "chunk_id": "c1",
                "bukti_dukung_id": "ev1",
                "confidence": None,
                "distance": 0.1,
            }
        ]

    monkeypatch.setattr(evidence_tool, "list_available_evidence_ids", fake_ids)
    monkeypatch.setattr(evidence_tool, "search_evidence", fake_search)

    result = json.loads(
        evidence_tool.search_evidence_documents.invoke({"query": "akreditasi"})
    )
    assert len(result) == 1
    assert result[0]["entity"] == "sertifikat.pdf"
    assert result[0]["relevance_score"] == pytest.approx(0.9)


def test_search_evidence_documents_empty_when_no_evidence_available(monkeypatch):
    """Prodi belum punya bukti dukung sama sekali — bukan error, dan tidak
    perlu memanggil search_evidence (tidak ada id untuk dicari)."""
    from agent.tools import evidence_tool

    monkeypatch.setattr(evidence_tool, "list_available_evidence_ids", lambda *a: [])
    monkeypatch.setattr(
        evidence_tool,
        "search_evidence",
        lambda **kw: pytest.fail("search_evidence should not be called"),
    )

    result = json.loads(
        evidence_tool.search_evidence_documents.invoke({"query": "apapun"})
    )
    assert result == []


def test_search_evidence_documents_scoped_to_current_indicator_only(monkeypatch):
    """Regression for the blanket-scope bug: tenant has evidence tagged to
    indicator 2, but the context (fixture above) is indicator_no=1 — must
    come back empty, not fall back to any-evidence-in-the-tenant."""
    from agent.tools import evidence_tool

    tags_by_indicator = {2: ["ev-for-indicator-2"]}

    def fake_ids(tenant_id, accreditation_set_id, indicator_no):
        return tags_by_indicator.get(indicator_no, [])

    monkeypatch.setattr(evidence_tool, "list_available_evidence_ids", fake_ids)
    monkeypatch.setattr(
        evidence_tool,
        "search_evidence",
        lambda **kw: pytest.fail("search_evidence should not be called"),
    )

    result = json.loads(
        evidence_tool.search_evidence_documents.invoke({"query": "apapun"})
    )
    assert result == []


def test_search_evidence_documents_no_context_raises():
    from agent.context import current_assessment_context
    from agent.tools import evidence_tool

    token = current_assessment_context.set(None)
    try:
        with pytest.raises(RuntimeError):
            evidence_tool.search_evidence_documents.invoke({"query": "apapun"})
    finally:
        current_assessment_context.reset(token)
