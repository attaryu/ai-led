from __future__ import annotations

from setor_led.prompts import SYSTEM_CAPAIAN, bangun_prompt_capaian, bangun_prompt_evaluasi
from setor_led.schema import EVALUASI, NARASI_INTI, NARASI_TAMBAHAN, IkuInput

IKU = IkuInput(kode="IKU.REL.MHS.8", indikator="Rata-rata masa studi (MS) lulusan", target="STR PJJ: 3,5 < MS ≤ 4,5")


def test_capaian_prompt_carries_iku_verbatim_including_range_symbols():
    prompt = bangun_prompt_capaian(IKU, ["6b", "6d"])
    assert "IKU.REL.MHS.8" in prompt
    assert "Rata-rata masa studi (MS) lulusan" in prompt
    assert "3,5 < MS ≤ 4,5" in prompt  # target berformat rentang tidak boleh rusak


def test_capaian_prompt_lists_available_lkps_sheets():
    prompt = bangun_prompt_capaian(IKU, ["6b", "6c1", "6d"])
    assert "6b, 6c1, 6d" in prompt


def test_capaian_prompt_still_builds_when_lkps_registry_is_empty():
    prompt = bangun_prompt_capaian(IKU, [])
    assert "IKU.REL.MHS.8" in prompt
    assert "tidak ada" in prompt.lower()  # model diberi tahu LKPS tidak tersedia


def test_capaian_prompt_demands_json_answer_and_forbids_inventing_numbers():
    assert '"ditemukan"' in SYSTEM_CAPAIAN
    assert '"nilai"' in SYSTEM_CAPAIAN and '"sumber"' in SYSTEM_CAPAIAN
    assert "jangan mengarang" in SYSTEM_CAPAIAN.lower()


def test_capaian_prompt_treats_retrieved_text_as_data_not_instructions():
    assert "data" in SYSTEM_CAPAIAN.lower() and "instruksi" in SYSTEM_CAPAIAN.lower()


def test_evaluasi_prompt_has_iku_capaian_and_evidence():
    prompt = bangun_prompt_evaluasi(IKU, {"nilai": "MS = 4,05", "sumber": "LKPS Tabel 6.d"}, "Hasil tool: ...")
    assert "3,5 < MS ≤ 4,5" in prompt
    assert "MS = 4,05" in prompt and "LKPS Tabel 6.d" in prompt
    assert "Hasil tool: ..." in prompt


def test_evaluasi_prompt_names_every_output_key_and_enum_value():
    prompt = bangun_prompt_evaluasi(IKU, {"nilai": "x", "sumber": "y"}, "")
    for kunci in (*NARASI_INTI, *NARASI_TAMBAHAN, "evaluasi", "tambahan"):
        assert kunci in prompt
    for nilai in EVALUASI:
        assert nilai in prompt


def test_evaluasi_prompt_teaches_target_direction_so_lower_is_better_targets_are_not_misjudged():
    # Target "≤ 5%" (mis. persentase DO) terpenuhi justru oleh capaian DI BAWAH 5%; aturan "di bawah target = belum
    # memenuhi" akan membalik hasilnya.
    iku = IkuInput(kode="IKU.X", indikator="Persentase mahasiswa DO", target="≤ 5%")
    prompt = bangun_prompt_evaluasi(iku, {"nilai": "3%", "sumber": "LKPS Tabel 6.d"}, "")

    assert "ARAH target" in prompt
    assert "makin besar makin baik" in prompt and "makin kecil makin baik" in prompt
    assert "≤" in prompt and "≥" in prompt
    assert "capaian di bawah target" not in prompt  # kalimat lama yang hanya benar untuk "lebih besar lebih baik"


def test_evaluasi_prompt_still_covers_range_targets():
    prompt = bangun_prompt_evaluasi(IKU, {"nilai": "4,05", "sumber": "LKPS"}, "")
    assert "rentang" in prompt and "di luar rentang" in prompt


def test_evaluasi_prompt_does_not_embed_led_pens_sample_text():
    # Spec §10: LED PENS bertanda "Hanya untuk Internal PENS" -- jangan masuk ke kode yang di-commit.
    prompt = bangun_prompt_evaluasi(IKU, {"nilai": "x", "sumber": "y"}, "")
    assert "PENS" not in prompt and "PPMPP" not in prompt
