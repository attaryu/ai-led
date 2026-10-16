"""setor_led.rubrik -- pemuatan rubrik indikator lewat kode; DB diganti tiruan."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from setor_led.rubrik import RubrikIndikator, muat_rubrik
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
