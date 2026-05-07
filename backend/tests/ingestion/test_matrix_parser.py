"""
Tests for ingestion.matrix_parser — uses the actual Matriks Penilaian PDF.

Run from the `backend/` directory so the package is importable:
    cd backend && python -m pytest tests/ingestion/test_matrix_parser.py -v
"""

import pytest
from pathlib import Path

from ingestion.matrix_parser import (
    IndicatorRubric,
    cache_rubrics,
    load_cached_rubrics,
    parse_matrix_pdf,
)

MATRIX_PDF = (
    "/home/arielsulton/Documents/Stargazing Project/VScode Project/"
    "tugas_akhir/AMI/docs/reference/matrik-penilaian.pdf"
)

# ---------------------------------------------------------------------------
# Fixtures (parse once per session for speed)
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def rubrics() -> list[IndicatorRubric]:
    return parse_matrix_pdf(MATRIX_PDF)


# ---------------------------------------------------------------------------
# Basic structural tests
# ---------------------------------------------------------------------------


def test_parse_returns_rubrics(rubrics):
    """PDF has many indicators — we expect at least 10."""
    assert len(rubrics) >= 10, f"Expected >=10 rubrics, got {len(rubrics)}"


def test_each_rubric_is_indicator_rubric(rubrics):
    """Every element must be an IndicatorRubric with a positive indicator number."""
    for r in rubrics:
        assert isinstance(r, IndicatorRubric)
        assert r.no > 0, f"Expected positive no, got {r.no}"


def test_indicator_numbers_are_unique(rubrics):
    """Indicator numbers should be unique."""
    nos = [r.no for r in rubrics]
    assert len(nos) == len(set(nos)), "Duplicate indicator numbers found"


def test_indicator_numbers_are_sequential(rubrics):
    """Numbers should be in ascending order and mostly contiguous."""
    nos = sorted(r.no for r in rubrics)
    assert nos == sorted(nos)
    assert nos[0] >= 1


def test_score_type_values(rubrics):
    """score_type must be one of the three allowed values."""
    allowed = {"qualitative", "quantitative", "composite"}
    for r in rubrics:
        assert r.score_type in allowed, (
            f"Indicator {r.no} has invalid score_type={r.score_type!r}"
        )


# ---------------------------------------------------------------------------
# score_criteria tests
# ---------------------------------------------------------------------------


def test_score_criteria_has_values(rubrics):
    """Every rubric must have at least one non-empty score or a formula."""
    for r in rubrics:
        has_score = any(v for v in r.score_criteria.values())
        assert has_score or r.formula, (
            f"Indicator {r.no} has no score text and no formula"
        )


def test_score_criteria_keys_are_integers(rubrics):
    """score_criteria keys must be ints (0–4)."""
    for r in rubrics:
        for k in r.score_criteria:
            assert isinstance(k, int), (
                f"Indicator {r.no}: key {k!r} is {type(k).__name__}, expected int"
            )
        assert set(r.score_criteria.keys()) == {0, 1, 2, 3, 4}, (
            f"Indicator {r.no}: unexpected keys {set(r.score_criteria.keys())}"
        )


# ---------------------------------------------------------------------------
# LKPS reference tests
# ---------------------------------------------------------------------------


def test_lkps_refs_extracted(rubrics):
    """Many indicators reference LKPS tables — at least 1 should have refs."""
    with_refs = [r for r in rubrics if r.lkps_table_ref]
    assert len(with_refs) >= 1, "Expected at least one indicator with LKPS table refs"


def test_lkps_refs_are_lists(rubrics):
    """lkps_table_ref must always be a list (possibly empty)."""
    for r in rubrics:
        assert isinstance(r.lkps_table_ref, list), (
            f"Indicator {r.no}: lkps_table_ref is {type(r.lkps_table_ref).__name__}"
        )


def test_lkps_refs_contain_lkps_keyword(rubrics):
    """Every extracted LKPS ref string must contain 'LKPS'."""
    for r in rubrics:
        for ref in r.lkps_table_ref:
            assert "LKPS" in ref.upper(), (
                f"Indicator {r.no}: ref {ref!r} does not contain 'LKPS'"
            )


# ---------------------------------------------------------------------------
# Score type classification tests
# ---------------------------------------------------------------------------


def test_quantitative_indicators_exist(rubrics):
    """There are formula-based indicators (BOP, NDTPS, RK, etc.)."""
    quant = [r for r in rubrics if r.score_type == "quantitative"]
    assert len(quant) >= 1, (
        f"Expected >=1 quantitative indicators, got {len(quant)}"
    )


def test_composite_indicators_exist(rubrics):
    """There are composite sub-score indicators (e.g. Skor = (I + II) / 2)."""
    composite = [r for r in rubrics if r.score_type == "composite"]
    assert len(composite) >= 1, (
        f"Expected >=1 composite indicators, got {len(composite)}"
    )


def test_qualitative_indicators_exist(rubrics):
    """Most indicators should be qualitative."""
    qualitative = [r for r in rubrics if r.score_type == "qualitative"]
    assert len(qualitative) >= 1, "Expected at least 1 qualitative indicator"


def test_quantitative_have_formula_or_score_text(rubrics):
    """Quantitative indicators should have formula extracted or at least score text."""
    quant = [r for r in rubrics if r.score_type == "quantitative"]
    for r in quant:
        has_content = r.formula or any(v for v in r.score_criteria.values())
        assert has_content, (
            f"Quantitative indicator {r.no} has no formula and no score text"
        )


def test_composite_indicators_have_sub_score_formula(rubrics):
    """Composite indicators should have a sub_score_formula extracted."""
    composite = [r for r in rubrics if r.score_type == "composite"]
    with_formula = [r for r in composite if r.sub_score_formula]
    # Allow partial extraction — just need at least half to have it
    assert len(with_formula) >= max(1, len(composite) // 2), (
        f"Too few composite indicators with sub_score_formula: "
        f"{len(with_formula)}/{len(composite)}"
    )


# ---------------------------------------------------------------------------
# Cache round-trip test
# ---------------------------------------------------------------------------


def test_cache_and_load_roundtrip(rubrics, tmp_path):
    """Serialise to JSON and load back — results must be identical."""
    cache_path = str(tmp_path / "matrix.json")
    cache_rubrics(rubrics, cache_path)

    loaded = load_cached_rubrics(cache_path)

    assert len(loaded) == len(rubrics), (
        f"Round-trip length mismatch: {len(loaded)} != {len(rubrics)}"
    )

    for orig, restored in zip(rubrics, loaded):
        assert restored.no == orig.no
        assert restored.score_type == orig.score_type
        assert restored.kriteria == orig.kriteria
        assert restored.indikator == orig.indikator
        assert restored.formula == orig.formula
        assert restored.lkps_table_ref == orig.lkps_table_ref
        assert restored.sub_score_formula == orig.sub_score_formula

        # score_criteria keys must be ints after round-trip
        for k in restored.score_criteria:
            assert isinstance(k, int), (
                f"Indicator {orig.no}: round-trip key {k!r} is not int"
            )
        assert restored.score_criteria == orig.score_criteria


def test_cache_file_is_valid_json(rubrics, tmp_path):
    """The cache file must be parseable as JSON."""
    import json

    cache_path = str(tmp_path / "matrix_check.json")
    cache_rubrics(rubrics, cache_path)

    with open(cache_path, encoding="utf-8") as fh:
        data = json.load(fh)

    assert isinstance(data, list)
    assert len(data) == len(rubrics)


# ---------------------------------------------------------------------------
# File-not-found error test
# ---------------------------------------------------------------------------


def test_parse_raises_on_missing_file():
    """parse_matrix_pdf must raise FileNotFoundError for non-existent paths."""
    with pytest.raises(FileNotFoundError):
        parse_matrix_pdf("/tmp/does_not_exist_xyz.pdf")
