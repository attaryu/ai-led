"""setor_led.rubrik -- pemuatan rubrik indikator lewat kode; DB diganti tiruan."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from setor_led.rubrik import (
    RubrikIndikator,
    ekspresi_bersih,
    hitung_skor_rumus,
    mode_penilaian,
    muat_rubrik,
    variabel_ekspresi,
)
from setor_led.schema import SetorLedError

BARIS = {
    "criterion_code": "9",
    "description": "Rata-rata dana operasional pendidikan per mahasiswa",
    "score_type": "KUANTITATIF",
    "formula": "(2 x BOP) / 5.000.000",
    "sub_score_formula": None,
    "levels": {4: "BOP >= 10.000.000", 3: "BOP < 10.000.000"},
}


def _muat(baris):
    with patch("setor_led.rubrik.get_rubric_criteria_by_code", return_value=baris) as pencarian:
        return muat_rubrik("t1", "set1", "9"), pencarian


def test_muat_rubrik_returns_levels_and_formula():
    rubrik, pencarian = _muat([BARIS])
    assert rubrik == RubrikIndikator(
        kode="9",
        deskripsi="Rata-rata dana operasional pendidikan per mahasiswa",
        score_type="KUANTITATIF",
        levels={4: "BOP >= 10.000.000", 3: "BOP < 10.000.000"},
        formula="(2 x BOP) / 5.000.000",
        sub_score_formula=None,
    )
    pencarian.assert_called_once_with("t1", "set1", "9")


def test_muat_rubrik_unknown_kode_is_a_clear_error():
    with pytest.raises(SetorLedError, match="'9'.*tidak ditemukan"):
        _muat([])


def test_muat_rubrik_ambiguous_kode_is_an_error():
    with pytest.raises(SetorLedError, match="'9'.*ambigu.*2 baris"):
        _muat([BARIS, dict(BARIS)])


PROSA = (
    "4. NDS3 = Jumlah DTPS yang berpendidikan tertinggi Doktor/Doktor Terapan. NDTPS = Jumlah dosen tetap yang "
    "ditugaskan sebagai pengampu mata kuliah. PDS3 = (NDS3 / NDTPS) x 100%"
)


@pytest.mark.parametrize(
    "formula, ekspresi",
    [
        ("(2 x BOP) / 5.000.000", "(2 * BOP) / 5000000"),
        ("(64 - (3 x BK))/4", "(64 - (3 * BK))/4"),
        ("2 + ((2 x RLP) / 3)", "2 + ((2 * RLP) / 3)"),
        ("(NDTPS X 0,5) / RK", "(NDTPS * 0.5) / RK"),
    ],
)
def test_ekspresi_bersih_normalizes_simple_arithmetic(formula, ekspresi):
    assert ekspresi_bersih(formula) == ekspresi


@pytest.mark.parametrize("formula", [None, "", "   ", "4", "4.", PROSA, "Skor = BOP / 5", "(1 x A) / " + "9" * 90])
def test_ekspresi_bersih_rejects_prose_bare_numbers_and_empty(formula):
    assert ekspresi_bersih(formula) is None


def test_variabel_ekspresi_lists_unique_names_in_order():
    assert variabel_ekspresi("(2 * BOP) / 5000000") == ["BOP"]
    assert variabel_ekspresi("(NDTPS + RK) / (NDTPS * 2)") == ["NDTPS", "RK"]


def _rubrik(**override):
    dasar = dict(
        kode="9", deskripsi="d", score_type="KUALITATIF", levels={4: "baik", 0: "buruk"},
        formula=None, sub_score_formula=None,
    )
    return RubrikIndikator(**{**dasar, **override})


def test_mode_penilaian_covers_all_three_modes():
    assert mode_penilaian(_rubrik(score_type="KUANTITATIF", formula="(2 x BOP) / 5.000.000")) == "rumus_bersih"
    assert mode_penilaian(_rubrik(score_type="KUANTITATIF", formula=PROSA)) == "rumus_prosa"
    assert mode_penilaian(_rubrik()) == "level"


def test_mode_penilaian_ignores_a_formula_that_is_only_a_number():
    assert mode_penilaian(_rubrik(score_type="KUANTITATIF", formula="4")) == "level"


def test_mode_penilaian_composite_without_levels_asks_for_sub_indicator():
    rubrik = _rubrik(score_type="KOMPOSIT", levels={}, sub_score_formula="((I x 2)+ (II)) / 3")
    with pytest.raises(SetorLedError, match="sub-indikator"):
        mode_penilaian(rubrik)


def test_mode_penilaian_without_formula_or_levels_is_an_error():
    with pytest.raises(SetorLedError, match="level 0-4"):
        mode_penilaian(_rubrik(levels={}))


def test_hitung_skor_rumus_returns_the_decimal_score():
    assert hitung_skor_rumus("(2 * BOP) / 5000000", {"BOP": 9250000}) == 3.7


def test_hitung_skor_rumus_clamps_to_4():
    assert hitung_skor_rumus("BOP / 1", {"BOP": 99}) == 4.0


@pytest.mark.parametrize("ekspresi, variabel", [("BOP /", {"BOP": 1}), ("X + 1", {})])
def test_hitung_skor_rumus_reports_tool_error(ekspresi, variabel):
    with pytest.raises(SetorLedError, match="Rumus gagal dihitung"):
        hitung_skor_rumus(ekspresi, variabel)


# ── review akhir: ekspresi harus aritmetika murni ──────────────────────────────

def test_ekspresi_bersih_strips_a_sentence_ending_dot():
    # Baris matriks nyata no. 51: "2 + (0,2 x NLP) ." -- titik penutup kalimat membuat eval SyntaxError.
    assert ekspresi_bersih("2 + (0,2 x NLP) .") == "2 + (0.2 * NLP)"


@pytest.mark.parametrize("formula", ["A ** B", "A.real + 1", "(1 x A) (2)", "A +", "A x"])
def test_ekspresi_bersih_rejects_arithmetic_that_does_not_parse_or_is_not_plain(formula):
    assert ekspresi_bersih(formula) is None


@pytest.mark.parametrize(
    "ekspresi",
    ["9**9**9", "NDS3 ** NDTPS", "NDS3.__class__", "abs(NDS3)", "_X + 1", "A if B else C", "A < B", "1j * A", "True + A", "A +"],
)
def test_variabel_ekspresi_rejects_everything_but_plain_arithmetic(ekspresi):
    with pytest.raises(SetorLedError, match="Ekspresi skor"):
        variabel_ekspresi(ekspresi)


def test_variabel_ekspresi_accepts_unary_minus_and_nested_parentheses():
    assert variabel_ekspresi("-(A + 2) / (B * 0.5)") == ["A", "B"]


# ── data nyata dari DB (set "Lam Teknik 2025"): "AxB" berarti A kali B, bukan satu variabel bernama AxB ────────────

FORMULA_NYATA_32 = "3.75 * ((A+B+(C/2))-(AxB)-(((AxC)/2)-((BxC)/2)+(AxBxC)/2))"


@pytest.mark.parametrize("formula", [FORMULA_NYATA_32, "(AxB)", "(A+B)x(C)", "2x3 + A", "3,75 x ((A+B+(C/2))-(AxB)-(AxC)/2)-(BxC)/2)+(AxBxC)/2))"])
def test_ekspresi_bersih_rejects_juxtaposed_multiplication_so_the_model_must_expand_it(formula):
    assert ekspresi_bersih(formula) is None


def test_ekspresi_bersih_still_accepts_spaced_multiplication():
    assert ekspresi_bersih("(A x B) + C") == "(A * B) + C"
    assert mode_penilaian(_rubrik(score_type="KUANTITATIF", formula=FORMULA_NYATA_32)) == "rumus_prosa"


# ── skor minimum dari teks rubrik ("Tidak ada skor kurang dari 2") ───────────────────────────────────────────────

def _dengan_level(**levels):
    return _rubrik(levels={int(k[1:]): v for k, v in levels.items()})


@pytest.mark.parametrize(
    "teks, minimum",
    [
        ("Tidak ada skor kurang dari 2.", 2.0),
        ("Tidak ada Skor kurang dari 1", 1.0),
        ("T i d a k a d a s k o r kurang dari 1.", 1.0),  # hasil ekstraksi PDF nyata (indikator 40)
        ("Tidak ada kurang dari 1", 1.0),  # varian nyata (indikator 21)
        ("Tidak ada skor yang kurang dari 2", 2.0),
    ],
)
def test_skor_minimum_reads_the_rubric_floor_sentence(teks, minimum):
    assert _dengan_level(L1=teks, L0=teks).skor_minimum == minimum


@pytest.mark.parametrize(
    "teks",
    [
        "Hasil Penelitian dan Pengabdian kepada Masyarakat (PkM) kurang dari 10",  # bukan batas skor (indikator 19)
        "Tidak ada skor kurang dari 10",  # di luar skala 0-4
        "Jika PDS3 < 20%, maka Skor = 2 + (PDS3 x 10).",
        "",
    ],
)
def test_skor_minimum_ignores_text_that_is_not_a_floor(teks):
    assert _dengan_level(L3=teks, L1=teks).skor_minimum == 0.0


def test_skor_minimum_takes_the_highest_floor_when_levels_disagree():
    assert _dengan_level(L1="Tidak ada skor kurang dari 1", L0="Tidak ada skor kurang dari 2").skor_minimum == 2.0
