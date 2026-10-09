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
    if not Path(MATRIX_PDF).exists():
        pytest.skip(f"PDF not available: {MATRIX_PDF}")
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


def test_no_indicator_has_empty_kriteria(rubrics):
    """Every indicator must have non-empty kriteria text.

    Regression test: the source PDF has a vertically-merged 'Kriteria' table
    cell spanning several sibling indicator rows. pdfplumber only returns
    that cell's text on the first physical row of the merge, blank on the
    rest — without carry-forward, every indicator after the first in a
    merged group ended up with kriteria="", rendered as "—" in reports."""
    empty = [r.no for r in rubrics if not r.kriteria.strip()]
    assert not empty, f"Indicators with empty kriteria: {empty}"


def test_indicator_numbers_are_unique_and_ascending(rubrics):
    """Returned rubrics must be in ascending order with unique numbers."""
    nos = [r.no for r in rubrics]  # original order from parse
    assert nos == sorted(set(nos)), "Rubrics are not unique and ascending"
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


# ---------------------------------------------------------------------------
# Merged floor-note propagation (pure function — no PDF fixture needed)
# ---------------------------------------------------------------------------

from ingestion.matrix_parser import _propagate_floor_note  # noqa: E402


def test_propagate_floor_note_fills_siblings_when_note_in_middle_band():
    """Matches ariel's real #27/#29/#30 pattern: the merged-cell text landed
    on band 1, leaving bands 2 and 0 empty even though it covers all three."""
    scores = {
        4: "Jika X >= 25%, maka Skor = 4",
        3: "Jika X < 25%, maka Skor = 2 + (8 x X)",
        2: "",
        1: "Tidak ada skor kurang dari 2",
        0: "",
    }
    result = _propagate_floor_note(scores)
    assert result[2] == "Tidak ada skor kurang dari 2"
    assert result[0] == "Tidak ada skor kurang dari 2"
    assert result[1] == "Tidak ada skor kurang dari 2"
    # Bands 3/4 (the real formulas) must be untouched.
    assert result[4] == scores[4]
    assert result[3] == scores[3]


def test_propagate_floor_note_fills_siblings_when_note_in_rightmost_band():
    """Matches ariel's real #31/#34/#39 pattern: the merged-cell text landed
    on band 0 instead of band 1 — propagation must not assume a fixed position."""
    scores = {4: "Jika Y >= 50%, maka Skor = 4", 3: "Jika Y < 50%, maka Skor = 1 + (6 x Y)",
              2: "", 1: "", 0: "Tidak ada skor kurang dari 1."}
    result = _propagate_floor_note(scores)
    assert result[2] == "Tidak ada skor kurang dari 1."
    assert result[1] == "Tidak ada skor kurang dari 1."
    assert result[0] == "Tidak ada skor kurang dari 1."


def test_propagate_floor_note_detects_garbled_inter_letter_spacing():
    """Some pages extract the floor note with spurious spaces between every
    letter (a pdfplumber artifact) — the tolerant pattern must still catch it."""
    scores = {4: "Jika Z >= 20%, maka Skor = 4", 3: "Jika Z < 20%, maka Skor = 2 + (Z x 10)",
              2: "", 1: "T i d a k a d a s k o r kurang dari 2", 0: ""}
    result = _propagate_floor_note(scores)
    assert result[2] == "T i d a k a d a s k o r kurang dari 2"
    assert result[0] == "T i d a k a d a s k o r kurang dari 2"


def test_propagate_floor_note_leaves_genuinely_blank_bands_unchanged():
    """Matches ariel's real #9/#56 pattern: the source PDF never states any
    criteria for bands 2/1/0 at all (a purely continuous formula with no
    floor note anywhere) — nothing to propagate, must stay empty."""
    scores = {
        4: "Jika BOP >= 10.000.000, maka Skor 4",
        3: "Jika BOP < 10.000.000, maka Skor = (2 x BOP) / 5.000.000",
        2: "", 1: "", 0: "",
    }
    result = _propagate_floor_note(scores)
    assert result == scores


def test_propagate_floor_note_does_not_touch_distinct_per_band_text():
    """Matches ariel's real #28 pattern: every band already has its own
    distinct (non-floor-note) criteria text — must be returned unchanged."""
    scores = {
        4: "Jika NDTPS >= 12, maka Skor = 4",
        3: "Jika 5 <= NDTPS < 12, maka Skor = 2 + 2(A x B)",
        2: "Jika NDTPS >= 5 dan PDTT > 40%, maka skor = 2",
        1: "Jika NDTPS >= 5, maka Skor = 2 + (2 x B)",
        0: "Jika NDTPS < 5, maka Skor = 0",
    }
    result = _propagate_floor_note(scores)
    assert result == scores


def test_repeated_score_text_is_not_appended_twice():
    """Composite indicator no. 46: sub-indicators I and II carry the SAME rubric sentence, and a row split
    across a page break re-emits its cell -- the stored level text used to read as duplicated nonsense."""
    from ingestion.matrix_parser import _RowAccumulator

    acc = _RowAccumulator(no=46, kriteria="Prestasi", indikator="I. akademik")
    acc.append_score(3, "Jika 0 < RI, maka Skor = 3,75")
    acc.append_score(3, "Jika 0 < RI, maka Skor = 3,75")  # sub-indikator II, kalimat identik
    acc.append_score(4, "Jika RI > a maka Skor = 4")
    acc.append_score(4, "Faktor: a = 0,2%")  # isi berbeda tetap disambung
    assert acc.scores[3] == "Jika 0 < RI, maka Skor = 3,75"
    assert acc.scores[4] == "Jika RI > a maka Skor = 4 Faktor: a = 0,2%"
