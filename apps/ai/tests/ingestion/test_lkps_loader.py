import os
import pytest
from pathlib import Path
import pandas as pd
from ingestion.lkps_loader import LKPSRegistry, load_lkps

LKPS_PATH = os.environ.get(
    "LKPS_TEST_FILE",
    "/home/arielsulton/Documents/Stargazing Project/VScode Project/tugas_akhir/AMI/docs/reference/[Setelah AL] LKPS STr PJJ Teknik Telekomunikasi-passwd.xlsx",
)


@pytest.fixture(scope="session")
def registry():
    if not Path(LKPS_PATH).exists():
        pytest.skip(f"LKPS file not available: {LKPS_PATH}")
    return load_lkps(LKPS_PATH)


def test_registry_loads_correct_sheet_count(registry):
    """Registry should have exactly 50 entries matching the xlsx sheet count."""
    assert len(registry.sheets) == 50


def test_navigation_sheets_are_empty(registry):
    """Menu, Daftar Tabel, PS are navigation-only and should be empty DataFrames."""
    for nav_sheet in ("Menu", "Daftar Tabel", "PS"):
        assert nav_sheet in registry.sheets, f"'{nav_sheet}' missing from registry"
        assert registry.sheets[nav_sheet].empty, f"'{nav_sheet}' should be empty"


def test_data_sheets_are_non_empty(registry):
    """Core data sheets should contain actual data rows."""
    for sheet_name in ("1", "2a1", "2b"):
        assert sheet_name in registry.sheets, f"Sheet '{sheet_name}' missing"
        assert not registry.sheets[sheet_name].empty, f"Sheet '{sheet_name}' should be non-empty"


def test_get_by_ref_tabel_2a(registry):
    """get_by_ref should resolve 'Tabel 2.a. LKPS' to a non-None DataFrame."""
    result = registry.get_by_ref("Tabel 2.a. LKPS")
    assert result is not None
    assert isinstance(result, pd.DataFrame)
    assert len(result) > 0


def test_get_by_ref_concatenates_multiple_sheets(registry):
    """'Tabel 2.a. LKPS' should concat sheets 2a1+2a2+2a3 — rows >= any single sheet."""
    result = registry.get_by_ref("Tabel 2.a. LKPS")
    assert result is not None

    # Each sub-sheet's row count individually
    sub_rows = sum(
        len(registry.sheets[s])
        for s in ("2a1", "2a2", "2a3")
        if s in registry.sheets and not registry.sheets[s].empty
    )
    assert len(result) == sub_rows, (
        f"Concatenated rows {len(result)} should equal sum of sub-sheets {sub_rows}"
    )


def test_get_by_ref_unknown_returns_none(registry):
    """Unknown reference text should return None."""
    result = registry.get_by_ref("Tabel 99.z. LKPS")
    assert result is None


def test_get_summary_has_row_counts(registry):
    """get_summary() should return dict with rows and columns keys for non-empty sheets."""
    summary = registry.get_summary()
    assert isinstance(summary, dict)
    assert len(summary) > 0

    # Navigation sheets (empty) should not appear in summary
    for nav_sheet in ("Menu", "Daftar Tabel", "PS"):
        assert nav_sheet not in summary

    # Data sheets should appear with correct keys
    for sheet_name, info in summary.items():
        assert "rows" in info, f"'rows' key missing for sheet '{sheet_name}'"
        assert "columns" in info, f"'columns' key missing for sheet '{sheet_name}'"
        assert info["rows"] > 0


def test_get_sheet_as_text_returns_markdown(registry):
    """get_sheet_as_text() should return a markdown table string containing '|'."""
    result = registry.get_sheet_as_text("1")
    assert isinstance(result, str)
    assert "|" in result, "Expected markdown table pipe character '|' in output"


def test_get_by_ref_case_insensitive(registry):
    """Reference lookup should be case-insensitive."""
    upper = registry.get_by_ref("Tabel 2.a. LKPS")
    lower = registry.get_by_ref("tabel 2.a. lkps")
    assert upper is not None
    assert lower is not None
    assert len(upper) == len(lower), "Case-insensitive lookup should return same rows"


def test_get_by_ref_tabel_6e3(registry):
    """'Tabel 6.e.3. LKPS' should return DataFrame from 4 concatenated sheets."""
    result = registry.get_by_ref("Tabel 6.e.3. LKPS")
    assert result is not None
    assert isinstance(result, pd.DataFrame)

    # Should have rows from all 4 sub-sheets
    sub_rows = sum(
        len(registry.sheets[s])
        for s in ("6e3-1", "6e3-2", "6e3-3", "6e3-4")
        if s in registry.sheets and not registry.sheets[s].empty
    )
    assert len(result) == sub_rows, (
        f"6e3 concat rows {len(result)} should equal sub-sheet sum {sub_rows}"
    )


# ── Unit tests that don't need the LKPS fixture ──────────────────────────────

def test_get_sheet_as_text_unknown_sheet():
    """get_sheet_as_text should return a 'tidak ditemukan' message for unknown sheets."""
    reg = LKPSRegistry(sheets={"2a1": pd.DataFrame({"a": [1]})})
    result = reg.get_sheet_as_text("nonexistent")
    assert "tidak ditemukan" in result


def test_get_sheet_as_text_empty_sheet():
    """get_sheet_as_text should return a 'kosong' message for empty sheets."""
    reg = LKPSRegistry(sheets={"empty": pd.DataFrame()})
    result = reg.get_sheet_as_text("empty")
    assert "kosong" in result


# ── get_by_ref: cocok langsung ke nama sheet yang ada (tanpa berkas LKPS eksternal) ──────────────


def _registry(*nama):
    return LKPSRegistry(sheets={n: pd.DataFrame({"k": [n]}) for n in nama})


def test_get_by_ref_sheet_6c1_yang_tidak_ada_di_peta_statis():
    """Regresi: peta statis hanya punya 'tabel 6.c' -> ['6c'], jadi 'Tabel 6.c.1' dianggap tidak ada
    padahal sheet-nya bernama '6c1'. Penilaian AMI indikator 43 gagal karena ini."""
    reg = _registry("6c1", "6c2", "6a")
    df = reg.get_by_ref("Tabel 6.c.1. LKPS")
    assert df is not None and list(df["k"]) == ["6c1"]


def test_get_by_ref_token_huruf_mencakup_turunannya():
    reg = _registry("6c1", "6c2", "6d")
    assert list(reg.get_by_ref("Tabel 6.c LKPS")["k"]) == ["6c1", "6c2"]


def test_get_by_ref_nama_sheet_bertanda_hubung_dan_kembar_prefix():
    reg = _registry("4f-1", "4f-2", "4f-3", "4g")
    assert list(reg.get_by_ref("Tabel 4.f.3. LKPS")["k"]) == ["4f-3"]
    assert list(reg.get_by_ref("Tabel 4.f. LKPS")["k"]) == ["4f-1", "4f-2", "4f-3"]


def test_get_by_ref_token_angka_saja_hanya_cocok_persis():
    reg = _registry("1", "10", "2a1")
    assert list(reg.get_by_ref("Tabel 1 LKPS")["k"]) == ["1"]


def test_get_by_ref_tidak_ditemukan_mengembalikan_none_dan_peta_lama_tetap_jadi_cadangan():
    assert _registry("2b").get_by_ref("Tabel 9.z LKPS") is None
    # peta statis lama masih dipakai bila tidak ada kecocokan langsung ("tabel 2.a" -> 2a1..2a3)
    assert list(_registry("2a1", "2a2").get_by_ref("Tabel 2.a. LKPS")["k"]) == ["2a1", "2a2"]
