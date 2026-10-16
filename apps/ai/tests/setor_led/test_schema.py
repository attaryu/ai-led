"""setor_led.schema: input IKU, validasi keluaran LLM, dan bentuk hasil per IKU."""

from __future__ import annotations

import pytest

from setor_led.schema import (
    IkuInput,
    SetorLedError,
    hasil_gagal,
    hasil_sukses,
    parse_iku_list,
    validasi_keluaran_llm,
    validasi_narasi,
    validasi_skor,
)

INTI = {
    "analisisKetercapaian": "Capaian memenuhi target.",
    "usulanTargetTahunDepan": "Pertahankan.",
    "strategiPencapaian": "1) Monitoring.",
    "sarprasDibutuhkan": "1) LMS.",
}
TAMBAHAN = {
    "faktorPendukung": "LSP tersedia.",
    "faktorPenghambat": "Sosialisasi kurang.",
    "akarMasalah": "Belum terintegrasi.",
    "tindakLanjut": "Integrasikan.",
}


def _iku(**override):
    return {"kode": "IKU.REL.MHS.3", "indikator": "Rata-rata IPK lulusan", "target": "3", **override}


def test_parse_iku_list_returns_trimmed_inputs():
    hasil = parse_iku_list([_iku(kode="  IKU.A  ")])
    assert hasil == [IkuInput(kode="IKU.A", indikator="Rata-rata IPK lulusan", target="3")]


@pytest.mark.parametrize("raw", [None, [], "bukan list", {}])
def test_parse_iku_list_rejects_empty_or_non_list(raw):
    with pytest.raises(ValueError, match="ikuList"):
        parse_iku_list(raw)


@pytest.mark.parametrize("field", ["kode", "indikator", "target"])
def test_parse_iku_list_rejects_blank_fields(field):
    with pytest.raises(ValueError, match=field):
        parse_iku_list([_iku(**{field: "   "})])


def test_parse_iku_list_rejects_non_object_item():
    with pytest.raises(ValueError, match="bukan objek"):
        parse_iku_list(["IKU.A"])


def test_parse_iku_list_rejects_duplicate_kode():
    with pytest.raises(ValueError, match="duplikat"):
        parse_iku_list([_iku(), _iku()])


@pytest.mark.parametrize("target", ["0", "1", "2", "3", "4", " 4 "])
def test_parse_iku_list_accepts_target_0_to_4(target):
    assert parse_iku_list([_iku(target=target)])[0].target_skor == int(target)


@pytest.mark.parametrize("target", ["5", "-1", "3.5", "tiga", "PJJ: RIPK ≥ 3,25", "3,5 < MS ≤ 4,5"])
def test_parse_iku_list_rejects_non_score_target(target):
    with pytest.raises(ValueError, match="target.*0-4"):
        parse_iku_list([_iku(target=target)])


@pytest.mark.parametrize("nilai", [0, 4, 3.7, "2", "3.25", 0.0])
def test_validasi_skor_accepts_a_score_between_0_and_4(nilai):
    assert validasi_skor(nilai) == float(nilai)


@pytest.mark.parametrize("nilai", [4.01, -0.1, 5, "abc", "", None, True, float("nan"), [3]])
def test_validasi_skor_rejects_everything_else(nilai):
    with pytest.raises(SetorLedError, match="[Ss]kor"):
        validasi_skor(nilai)


def test_validasi_narasi_returns_inti_and_ignores_tambahan_when_not_asked():
    inti, tambahan = validasi_narasi({**INTI, "tambahan": TAMBAHAN}, dengan_tambahan=False)
    assert inti == INTI and tambahan is None


def test_validasi_narasi_requires_complete_tambahan_when_asked():
    inti, tambahan = validasi_narasi({**INTI, "tambahan": TAMBAHAN}, dengan_tambahan=True)
    assert tambahan == TAMBAHAN
    with pytest.raises(SetorLedError, match="tambahan"):
        validasi_narasi(INTI, dengan_tambahan=True)
    with pytest.raises(SetorLedError, match="tindakLanjut"):
        validasi_narasi({**INTI, "tambahan": {**TAMBAHAN, "tindakLanjut": " "}}, dengan_tambahan=True)


def test_validasi_narasi_rejects_missing_or_blank_inti():
    with pytest.raises(SetorLedError, match="analisisKetercapaian"):
        validasi_narasi({**INTI, "analisisKetercapaian": ""}, dengan_tambahan=False)
    with pytest.raises(SetorLedError, match="JSON"):
        validasi_narasi("bukan objek", dengan_tambahan=False)


def test_validasi_accepts_memenuhi_without_tambahan():
    evaluasi, inti, tambahan = validasi_keluaran_llm({"evaluasi": "MEMENUHI", **INTI})
    assert evaluasi == "MEMENUHI" and inti == INTI and tambahan is None


def test_validasi_ignores_tambahan_when_not_belum_memenuhi():
    _, _, tambahan = validasi_keluaran_llm({"evaluasi": "MELAMPAUI", **INTI, "tambahan": TAMBAHAN})
    assert tambahan is None


def test_validasi_requires_tambahan_when_belum_memenuhi():
    evaluasi, _, tambahan = validasi_keluaran_llm({"evaluasi": "BELUM_MEMENUHI", **INTI, "tambahan": TAMBAHAN})
    assert evaluasi == "BELUM_MEMENUHI" and tambahan == TAMBAHAN

    with pytest.raises(SetorLedError, match="tambahan"):
        validasi_keluaran_llm({"evaluasi": "BELUM_MEMENUHI", **INTI})
    with pytest.raises(SetorLedError, match="akarMasalah"):
        validasi_keluaran_llm(
            {"evaluasi": "BELUM_MEMENUHI", **INTI, "tambahan": {**TAMBAHAN, "akarMasalah": " "}}
        )


@pytest.mark.parametrize("evaluasi", ["memenuhi", "Melampaui standar", "", None, 3])
def test_validasi_rejects_evaluasi_outside_enum(evaluasi):
    with pytest.raises(SetorLedError, match="Evaluasi"):
        validasi_keluaran_llm({"evaluasi": evaluasi, **INTI})


def test_validasi_rejects_missing_or_blank_narasi():
    for kunci in INTI:
        rusak = {**INTI, kunci: "   "}
        with pytest.raises(SetorLedError, match=kunci):
            validasi_keluaran_llm({"evaluasi": "MEMENUHI", **rusak})
    with pytest.raises(SetorLedError, match="JSON"):
        validasi_keluaran_llm(None)
    with pytest.raises(SetorLedError, match="JSON"):
        validasi_keluaran_llm(["bukan", "dict"])


def test_hasil_sukses_has_the_documented_keys():
    hasil = hasil_sukses("IKU.A", {"nilai": "RIPK = 3,46", "sumber": "LKPS Tabel 6.b"}, "MEMENUHI", INTI, None)
    assert hasil == {
        "kode": "IKU.A",
        "capaian": {"nilai": "RIPK = 3,46", "sumber": "LKPS Tabel 6.b"},
        "evaluasi": "MEMENUHI",
        **INTI,
    }
    assert "tambahan" not in hasil and "error" not in hasil


def test_hasil_sukses_includes_tambahan_only_when_given():
    hasil = hasil_sukses("IKU.A", {"nilai": "8,93%", "sumber": "LKPS 6.c"}, "BELUM_MEMENUHI", INTI, TAMBAHAN)
    assert hasil["tambahan"] == TAMBAHAN


def test_hasil_gagal_has_only_kode_and_error():
    assert hasil_gagal("IKU.A", "Capaian tidak ditemukan") == {"kode": "IKU.A", "error": "Capaian tidak ditemukan"}
