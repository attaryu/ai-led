"""setor_led.pipeline -- LLM dan tool diganti tiruan; yang diuji alur, urutan, isolasi galat, dan batal."""

from __future__ import annotations

import asyncio
import contextlib
import json
import threading
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage

from agent.context import current_assessment_context
from setor_led import pipeline
from setor_led.pipeline import (
    MAX_TOOL_STEPS,
    SetorLedCancelled,
    cari_capaian,
    cari_capaian_json,
    daftar_tabel_lkps,
    jalankan_setor_led,
    parse_capaian,
    proses_iku,
    ambil_variabel,
    lengkapi_variabel,
    pilih_level,
    tentukan_skor,
    tulis_ekspresi,
    tulis_narasi,
)
from setor_led.rubrik import RubrikIndikator
from setor_led.schema import SetorLedError, hasil_gagal, IkuInput

IKU = IkuInput(kode="IKU.REL.MHS.3", indikator="Rata-rata IPK lulusan", target="3")
INTI = {
    "analisisKetercapaian": "A", "usulanTargetTahunDepan": "U", "strategiPencapaian": "S", "sarprasDibutuhkan": "P",
}
TAMBAHAN = {"faktorPendukung": "F", "faktorPenghambat": "H", "akarMasalah": "A", "tindakLanjut": "T"}
JSON_OK = json.dumps({**INTI, "tambahan": TAMBAHAN})  # model boleh menyertakan tambahan; hanya dipakai bila diminta
CAPAIAN_JSON = json.dumps({"ditemukan": True, "nilai": "RIPK = 3,46", "sumber": "LKPS Tabel 6.b"})
PAGAR = "`" * 3  # pagar code fence Markdown, dibangun dari variabel supaya tidak memutus blok di dokumen plan


class FakeLLM:
    """Mengembalikan balasan berurutan; kalau habis, mengulang yang terakhir."""

    def __init__(self, *balasan):
        self.balasan = list(balasan)
        self.dipanggil = 0

    def invoke(self, _masukan):
        self.dipanggil += 1
        isi = self.balasan[min(self.dipanggil, len(self.balasan)) - 1]
        return isi if isinstance(isi, AIMessage) else AIMessage(content=isi)


def _panggil_tool(nama="get_lkps_table", args=None, id_="c1"):
    return AIMessage(content="", tool_calls=[{"name": nama, "args": args or {"table_reference": "Tabel 6.b"}, "id": id_}])


class FakeTool:
    def __init__(self, keluaran="| ipk |\n| 3,46 |", galat=None):
        self.keluaran, self.galat, self.panggilan = keluaran, galat, []

    def invoke(self, args):
        self.panggilan.append(args)
        if self.galat:
            raise self.galat
        return self.keluaran


# ── parse_capaian ──────────────────────────────────────────────────────────────

def test_parse_capaian_reads_plain_json():
    assert parse_capaian(CAPAIAN_JSON) == {"nilai": "RIPK = 3,46", "sumber": "LKPS Tabel 6.b"}


def test_parse_capaian_survives_think_block_and_code_fence():
    mentah = f"<think>hmm, cek tabel 6.b dulu</think>\nBerikut hasilnya:\n{PAGAR}json\n{CAPAIAN_JSON}\n{PAGAR}"
    assert parse_capaian(mentah) == {"nilai": "RIPK = 3,46", "sumber": "LKPS Tabel 6.b"}


@pytest.mark.parametrize(
    "mentah",
    ['{"ditemukan": false}', '{"ditemukan": true, "nilai": "  "}', "bukan json sama sekali", "[]", "", None],
)
def test_parse_capaian_returns_none_when_not_found_or_unreadable(mentah):
    assert parse_capaian(mentah) is None


@pytest.mark.parametrize(
    "nilai",
    [
        "Tidak terdapat angka persentase keterlaksanaan K3L yang eksplisit di LKPS maupun LED",
        "Persentase K3L diperkirakan tinggi, memenuhi target 75%",
        "Tidak ada angka eksplisit; seluruh aspek terpenuhi",
        "Tidak ditemukan nilai persentase di dokumen",
        "Perkiraan capaian 90%",
        "Capaian tidak secara eksplisit disebutkan",
    ],
)
def test_parse_capaian_rejects_hedged_values_so_no_narrative_is_written_on_a_guess(nilai):
    # Capaian yang hanya ditebak/disimpulkan = "tidak ditemukan" (spec §5), bukan alasan menulis narasi "diperkirakan".
    assert parse_capaian(json.dumps({"ditemukan": True, "nilai": nilai, "sumber": "LED"})) is None


def test_parse_capaian_rejects_a_hedge_hidden_in_the_dasar_field_too():
    mentah = json.dumps({"ditemukan": True, "nilai": "100%", "sumber": "LED", "dasar": "angka riilnya diperkirakan"})
    assert parse_capaian(mentah) is None


def test_parse_capaian_logs_why_a_capaian_was_rejected(caplog):
    # Tanpa log ini, "Capaian tidak ditemukan" tidak bisa dibedakan: model bilang tidak ada, penjaga keraguan
    # menolak, atau jawaban tak terbaca (ditemukan saat uji E2E: MHS.8 gagal sekali tanpa jejak).
    ragu = json.dumps({"ditemukan": True, "nilai": "Perkiraan capaian 90%", "sumber": "LED"})
    ragu_di_dasar = json.dumps({"ditemukan": True, "nilai": "100%", "sumber": "LED", "dasar": "angka riilnya diperkirakan"})
    with caplog.at_level("INFO", logger="setor_led.pipeline"):
        assert parse_capaian(ragu, kode="IKU.X") is None
        assert parse_capaian(ragu_di_dasar, kode="IKU.D") is None
        assert parse_capaian('{"ditemukan": false}', kode="IKU.Y") is None
        assert parse_capaian("ini bukan json", kode="IKU.Z") is None

    log = caplog.text
    assert "IKU.X" in log and "ragu-ragu di nilai" in log and "Perkiraan capaian 90%" in log
    assert "IKU.D" in log and "ragu-ragu di dasar" in log
    assert "IKU.Y" in log and "ditemukan=false" in log
    assert "IKU.Z" in log and "tidak terbaca" in log and "ini bukan json" in log


def test_cari_capaian_passes_the_iku_code_for_the_rejection_log(caplog):
    with caplog.at_level("INFO", logger="setor_led.pipeline"):
        cari_capaian(FakeLLM('{"ditemukan": false}'), IKU, [])
    assert IKU.kode in caplog.text and "ditemukan=false" in caplog.text


@pytest.mark.parametrize(
    "nilai",
    ["RIPK = 3,46", "Pedoman SMK3L PENS tersedia (SK No. 48/PL14/2025)", "100% (25 dari 25 jenis sarana terawat)"],
)
def test_parse_capaian_keeps_firm_values(nilai):
    assert parse_capaian(json.dumps({"ditemukan": True, "nilai": nilai, "sumber": "LKPS"}))["nilai"] == nilai


def test_parse_capaian_keeps_the_optional_dasar_but_omits_it_when_absent():
    dengan = json.dumps({"ditemukan": True, "nilai": "RIPK = 3,46", "sumber": "LKPS Tabel 6.b", "dasar": "(3,58+3,48+3,33)/3"})
    assert parse_capaian(dengan) == {"nilai": "RIPK = 3,46", "sumber": "LKPS Tabel 6.b", "dasar": "(3,58+3,48+3,33)/3"}
    assert "dasar" not in parse_capaian(CAPAIAN_JSON)


def test_parse_capaian_defaults_missing_source():
    assert parse_capaian('{"ditemukan": true, "nilai": "100%"}') == {"nilai": "100%", "sumber": "tidak disebutkan"}


# ── daftar_tabel_lkps ──────────────────────────────────────────────────────────

def test_daftar_tabel_lkps_reads_the_loaded_registry_sheets():
    registry = MagicMock()
    registry.sheets = {"6b": object(), "6c1": object()}
    with patch.dict("agent.tools.lkps_tool._registries", {("t1", "d1"): registry}, clear=True):
        assert daftar_tabel_lkps("t1", "d1") == ["6b", "6c1"]


def test_daftar_tabel_lkps_is_empty_when_registry_not_loaded():
    with patch.dict("agent.tools.lkps_tool._registries", {}, clear=True):
        assert daftar_tabel_lkps("t1", "d1") == []


# ── cari_capaian (tahap 1) ─────────────────────────────────────────────────────

def test_cari_capaian_runs_a_tool_then_returns_capaian_and_evidence():
    llm = FakeLLM(_panggil_tool(), CAPAIAN_JSON)
    tool = FakeTool()
    with patch.dict(pipeline.TOOLS_BY_NAME, {"get_lkps_table": tool}):
        capaian, bahan = cari_capaian(llm, IKU, ["6b"])

    assert capaian == {"nilai": "RIPK = 3,46", "sumber": "LKPS Tabel 6.b"}
    assert tool.panggilan == [{"table_reference": "Tabel 6.b"}]
    assert "| 3,46 |" in bahan and "get_lkps_table" in bahan


def test_cari_capaian_returns_none_when_model_says_not_found():
    capaian, bahan = cari_capaian(FakeLLM('{"ditemukan": false}'), IKU, [])
    assert capaian is None and bahan == ""


def test_cari_capaian_survives_a_tool_that_raises():
    llm = FakeLLM(_panggil_tool(), CAPAIAN_JSON)
    tool = FakeTool(galat=ConnectionError("postgres putus"))
    with patch.dict(pipeline.TOOLS_BY_NAME, {"get_lkps_table": tool}):
        capaian, bahan = cari_capaian(llm, IKU, ["6b"])

    assert capaian is not None  # loop berlanjut, IKU tidak jatuh
    assert "ConnectionError" in bahan  # galat tool dilaporkan ke model sebagai hasil tool


def test_cari_capaian_survives_an_unknown_tool_name():
    llm = FakeLLM(_panggil_tool(nama="tool_ngawur"), CAPAIAN_JSON)
    capaian, bahan = cari_capaian(llm, IKU, [])
    assert capaian is not None and "tool_ngawur" in bahan


def test_cari_capaian_stops_after_max_tool_steps_then_forces_a_final_answer():
    llm = FakeLLM(_panggil_tool())  # selalu minta tool, tidak pernah menjawab
    with patch.dict(pipeline.TOOLS_BY_NAME, {"get_lkps_table": FakeTool()}):
        capaian, _ = cari_capaian(llm, IKU, ["6b"])

    assert capaian is None
    assert llm.dipanggil == MAX_TOOL_STEPS + 1  # MAX_TOOL_STEPS langkah + satu paksaan jawaban akhir


def test_cari_capaian_gives_every_tool_a_share_of_the_evidence_not_just_the_first():
    # Satu tabel LKPS besar tidak boleh menggusur hasil LED/bukti yang dipanggil sesudahnya.
    llm = FakeLLM(
        _panggil_tool(),
        _panggil_tool("search_led_evidence", {"query": "masa studi"}, "c2"),
        CAPAIAN_JSON,
    )
    alat = {"get_lkps_table": FakeTool("x" * 50_000), "search_led_evidence": FakeTool("PENANDA-DARI-LED")}
    with patch.dict(pipeline.TOOLS_BY_NAME, alat):
        _, bahan = cari_capaian(llm, IKU, ["6d"])

    assert "PENANDA-DARI-LED" in bahan
    assert len(bahan) <= pipeline.MAX_BAHAN_CHARS


def test_cari_capaian_caps_collected_evidence_size():
    llm = FakeLLM(_panggil_tool(), CAPAIAN_JSON)
    with patch.dict(pipeline.TOOLS_BY_NAME, {"get_lkps_table": FakeTool(keluaran="x" * 50_000)}):
        _, bahan = cari_capaian(llm, IKU, ["6b"])
    assert len(bahan) <= pipeline.MAX_BAHAN_CHARS


# ── skor rubrik 0-4 dan narasi (tahap 2) ──────────────────────────────────────

CAPAIAN = {"nilai": "RIPK = 3,46", "sumber": "LKPS Tabel 6.b"}
RUBRIK_LEVEL = RubrikIndikator(
    kode="1", deskripsi="Kualitas tata kelola", score_type="KUALITATIF",
    levels={4: "sangat baik", 2: "cukup", 0: "buruk"}, formula=None, sub_score_formula=None,
)
RUBRIK_BERSIH = RubrikIndikator(
    kode="9", deskripsi="Dana operasional", score_type="KUANTITATIF",
    levels={4: "BOP >= 10.000.000", 3: "BOP < 10.000.000"}, formula="(2 x BOP) / 5.000.000", sub_score_formula=None,
)
RUBRIK_PROSA = RubrikIndikator(
    kode="29", deskripsi="Persentase DTPS Doktor", score_type="KUANTITATIF",
    levels={4: "Jika PDS3 >= 20%, Skor = 4", 3: "Jika PDS3 < 20%, Skor = 2 + (PDS3 x 10)"},
    formula="PDS3 = (NDS3 / NDTPS) x 100%", sub_score_formula=None,
)


def _dengan_variabel(**variabel):
    return {**CAPAIAN, "variabel": variabel}


# parse_capaian membawa angka mentah rumus





# lengkapi_variabel

def test_lengkapi_variabel_returns_numbers_and_accepts_numeric_strings():
    capaian = _dengan_variabel(NDS3=12, NDTPS="40", X="1,5")
    assert lengkapi_variabel(capaian) == {"NDS3": 12.0, "NDTPS": 40.0, "X": 1.5}


def test_lengkapi_variabel_names_every_missing_variable():
    with pytest.raises(SetorLedError, match="Variabel rumus tidak ditemukan: B, C"):
        lengkapi_variabel(_dengan_variabel(A=1, B=None, C="abc"))


def test_lengkapi_variabel_requires_the_named_variables():
    with pytest.raises(SetorLedError, match="Variabel rumus tidak ditemukan: B"):
        lengkapi_variabel(_dengan_variabel(A=1), wajib=["A", "B"])


@pytest.mark.parametrize("capaian", [CAPAIAN, _dengan_variabel(), {**CAPAIAN, "variabel": "12"}])
def test_lengkapi_variabel_without_any_variable_is_an_error(capaian):
    with pytest.raises(SetorLedError, match="Variabel rumus tidak ditemukan"):
        lengkapi_variabel(capaian)


# tulis_ekspresi

EKSPRESI_OK = json.dumps({"ekspresi": "2 + ((NDS3 / NDTPS) * 10)", "alasan": "cabang PDS3 < 20%"})


def test_tulis_ekspresi_returns_a_valid_expression():
    assert tulis_ekspresi(FakeLLM(EKSPRESI_OK), IKU, _dengan_variabel(NDS3=6, NDTPS=40), RUBRIK_PROSA, "") == "2 + ((NDS3 / NDTPS) * 10)"


def test_tulis_ekspresi_retries_once_on_an_unknown_variable():
    buruk = json.dumps({"ekspresi": "2 + (ZZZ * 10)", "alasan": "x"})
    llm = FakeLLM(buruk, EKSPRESI_OK)
    assert tulis_ekspresi(llm, IKU, _dengan_variabel(NDS3=6, NDTPS=40), RUBRIK_PROSA, "") == "2 + ((NDS3 / NDTPS) * 10)"
    assert llm.dipanggil == 2


def test_tulis_ekspresi_rejects_conditions_and_words_then_gives_up():
    llm = FakeLLM(json.dumps({"ekspresi": "4 if NDS3 > 1 else 3", "alasan": "x"}))
    with pytest.raises(SetorLedError, match="[Ee]kspresi"):
        tulis_ekspresi(llm, IKU, _dengan_variabel(NDS3=6), RUBRIK_PROSA, "")
    assert llm.dipanggil == 2


def test_tulis_ekspresi_does_not_call_the_llm_once_cancelled():
    batal = threading.Event()
    batal.set()
    llm = FakeLLM(EKSPRESI_OK)
    with pytest.raises(SetorLedCancelled):
        tulis_ekspresi(llm, IKU, _dengan_variabel(NDS3=6, NDTPS=40), RUBRIK_PROSA, "", cancel_event=batal)
    assert llm.dipanggil == 0


def test_tulis_ekspresi_rejects_power_and_attribute_access_then_gives_up():
    # Hasil review akhir: "**" dan ".atribut" lolos penjaga karakter, padahal masuk ke eval.
    for jahat in ("NDS3 ** 9", "NDS3.__class__", "9 ** 9 ** 9"):
        llm = FakeLLM(json.dumps({"ekspresi": jahat, "alasan": "x"}))
        with pytest.raises(SetorLedError, match="Ekspresi skor"):
            tulis_ekspresi(llm, IKU, _dengan_variabel(NDS3=6), RUBRIK_PROSA, "")
        assert llm.dipanggil == 2


def test_tulis_ekspresi_rejects_an_overlong_expression():
    panjang = " + ".join(["NDS3"] * 80)
    llm = FakeLLM(json.dumps({"ekspresi": panjang, "alasan": "x"}))
    with pytest.raises(SetorLedError, match="Ekspresi skor"):
        tulis_ekspresi(llm, IKU, _dengan_variabel(NDS3=6), RUBRIK_PROSA, "")


def test_lengkapi_variabel_drops_names_that_are_not_plain_identifiers():
    assert lengkapi_variabel(_dengan_variabel(_X=1, NDS3=2)) == {"NDS3": 2.0}


# pilih_level

def test_pilih_level_returns_the_chosen_score():
    assert pilih_level(FakeLLM('{"score": 2, "alasan": "x"}'), IKU, CAPAIAN, RUBRIK_LEVEL, "") == 2.0


def test_pilih_level_retries_once_when_the_score_is_out_of_range():
    llm = FakeLLM('{"score": 7, "alasan": "x"}', '{"score": 2, "alasan": "x"}')
    assert pilih_level(llm, IKU, CAPAIAN, RUBRIK_LEVEL, "") == 2.0 and llm.dipanggil == 2


@pytest.mark.parametrize("balasan", ['{"score": 7}', '{"score": 2.5}', '{"score": "tinggi"}', "bukan json"])
def test_pilih_level_gives_up_after_one_retry_on_an_unusable_score(balasan):
    llm = FakeLLM(balasan)
    with pytest.raises(SetorLedError):
        pilih_level(llm, IKU, CAPAIAN, RUBRIK_LEVEL, "")
    assert llm.dipanggil == 2


def test_pilih_level_does_not_call_the_llm_once_cancelled():
    batal = threading.Event()
    batal.set()
    llm = FakeLLM('{"score": 2}')
    with pytest.raises(SetorLedCancelled):
        pilih_level(llm, IKU, CAPAIAN, RUBRIK_LEVEL, "", cancel_event=batal)
    assert llm.dipanggil == 0


# tentukan_skor







VARIABEL_BOP = json.dumps({"variabel": {"BOP": 9250000}})
VARIABEL_PROSA = json.dumps({"variabel": {"NDS3": 6, "NDTPS": 40}})


def test_ambil_variabel_returns_numbers_for_the_requested_names():
    assert ambil_variabel(FakeLLM(VARIABEL_BOP), IKU, CAPAIAN, RUBRIK_BERSIH, "", ["BOP"]) == {"BOP": 9250000.0}


def test_ambil_variabel_retries_once_naming_what_was_missing_then_recovers():
    llm = FakeLLM('{"variabel": {"BOP": null}}', VARIABEL_BOP)
    assert ambil_variabel(llm, IKU, CAPAIAN, RUBRIK_BERSIH, "", ["BOP"]) == {"BOP": 9250000.0} and llm.dipanggil == 2


def test_ambil_variabel_does_not_call_the_llm_once_cancelled():
    batal = threading.Event()
    batal.set()
    llm = FakeLLM(VARIABEL_BOP)
    with pytest.raises(SetorLedCancelled):
        ambil_variabel(llm, IKU, CAPAIAN, RUBRIK_BERSIH, "", ["BOP"], cancel_event=batal)
    assert llm.dipanggil == 0


def test_clean_formula_variables_come_from_the_model_but_the_score_is_computed_by_code():
    llm = FakeLLM(VARIABEL_BOP)
    skor = tentukan_skor(llm, IKU, CAPAIAN, RUBRIK_BERSIH, "")
    assert skor == 3.7 and llm.dipanggil == 1  # satu panggilan (variabel); skor dari kode


def test_prose_formula_model_gives_variables_then_an_expression_and_code_computes():
    llm = FakeLLM(VARIABEL_PROSA, EKSPRESI_OK)
    skor = tentukan_skor(llm, IKU, CAPAIAN, RUBRIK_PROSA, "")
    assert skor == 3.5 and llm.dipanggil == 2  # 2 + (6/40)*10, dihitung kode


def test_missing_formula_variable_is_a_named_error_without_model_fallback():
    llm = FakeLLM('{"variabel": {"NDS3": 6, "NDTPS": null}}')
    with pytest.raises(SetorLedError, match="NDTPS"):
        tentukan_skor(llm, IKU, CAPAIAN, RUBRIK_PROSA, "")
    assert llm.dipanggil == 2  # variabel + satu retry; tidak pernah meminta ekspresi atau level
    llm = FakeLLM('{"variabel": {}}')
    with pytest.raises(SetorLedError, match="BOP"):
        tentukan_skor(llm, IKU, CAPAIAN, RUBRIK_BERSIH, "")


def test_qualitative_indicator_picks_a_level_with_the_model():
    llm = FakeLLM('{"score": 2, "alasan": "x"}')
    assert tentukan_skor(llm, IKU, CAPAIAN, RUBRIK_LEVEL, "") == 2.0 and llm.dipanggil == 1


# tulis_narasi

def test_tulis_narasi_returns_validated_inti_without_tambahan_at_or_above_target():
    inti, tambahan = tulis_narasi(FakeLLM(JSON_OK), IKU, CAPAIAN, 3.0, RUBRIK_LEVEL, "bahan")
    assert inti == INTI and tambahan is None  # skor 3 == target 3


@pytest.mark.parametrize("skor, target, ada", [(3.99, "4", True), (4.0, "4", False), (3.0, "3", False), (2.5, "3", True)])
def test_tambahan_only_when_score_is_strictly_below_target(skor, target, ada):
    iku = IkuInput(kode="K", indikator="i", target=target)
    llm = Pengintai(JSON_OK)
    _, tambahan = tulis_narasi(llm, iku, CAPAIAN, skor, RUBRIK_LEVEL, "")
    assert (tambahan == TAMBAHAN) is ada
    assert ("faktorPenghambat" in llm.masukan_terakhir) is ada  # prompt hanya memintanya bila skor < target


def test_tulis_narasi_retries_once_and_tells_the_model_what_was_wrong():
    # Retry dengan prompt identik hampir pasti menghasilkan kesalahan yang sama; beri tahu alasannya.
    dilihat = []

    class Mata(FakeLLM):
        def invoke(self, masukan):
            dilihat.append(masukan)
            return super().invoke(masukan)

    buruk = json.dumps({**INTI, "analisisKetercapaian": ""})
    tulis_narasi(Mata(buruk, JSON_OK), IKU, CAPAIAN, 3.0, RUBRIK_LEVEL, "")

    assert len(dilihat) == 2
    assert "ditolak" not in dilihat[0].lower()
    assert dilihat[1].startswith(dilihat[0])  # prompt asli utuh
    assert "ditolak" in dilihat[1].lower() and "analisisKetercapaian" in dilihat[1]


def test_tulis_narasi_gives_up_after_one_retry():
    llm = FakeLLM("bukan json")
    with pytest.raises(SetorLedError):
        tulis_narasi(llm, IKU, CAPAIAN, 3.0, RUBRIK_LEVEL, "")
    assert llm.dipanggil == 2


def test_tulis_narasi_logs_the_raw_reply_when_it_is_unreadable(caplog):
    # Tanpa potongan jawaban, "JSON tak terbaca" tidak bisa dibedakan: terpotong, prosa, atau kutip rusak.
    with caplog.at_level("WARNING", logger="setor_led.pipeline"):
        with pytest.raises(SetorLedError):
            tulis_narasi(FakeLLM('{"analisisKetercapaian": "terpotong di sin'), IKU, CAPAIAN, 3.0, RUBRIK_LEVEL, "")
    assert "terpotong di sin" in caplog.text and IKU.kode in caplog.text


def test_tulis_narasi_reads_json_wrapped_in_think_and_fence():
    mentah = f"<think>bandingkan 3,46 dengan 3</think>\n{PAGAR}json\n{JSON_OK}\n{PAGAR}"
    inti, _ = tulis_narasi(FakeLLM(mentah), IKU, CAPAIAN, 3.0, RUBRIK_LEVEL, "")
    assert inti == INTI


def test_tulis_narasi_does_not_call_the_llm_once_cancelled():
    batal = threading.Event()
    batal.set()
    llm = FakeLLM(JSON_OK)
    with pytest.raises(SetorLedCancelled):
        tulis_narasi(llm, IKU, CAPAIAN, 3.0, RUBRIK_LEVEL, "", cancel_event=batal)
    assert llm.dipanggil == 0


def test_tulis_narasi_does_not_retry_once_cancelled_during_the_first_call():
    batal = threading.Event()

    class Membatalkan(FakeLLM):
        def invoke(self, masukan):
            batal.set()
            return super().invoke(masukan)

    llm = Membatalkan("bukan json", JSON_OK)
    with pytest.raises(SetorLedCancelled):
        tulis_narasi(llm, IKU, CAPAIAN, 3.0, RUBRIK_LEVEL, "", cancel_event=batal)
    assert llm.dipanggil == 1


# ── proses_iku (satu IKU, async) ───────────────────────────────────────────────

KW = dict(tenant_id="t1", dokumen_id="d1", accreditation_set_id="s1", study_program_id="p1", model="m", tabel_lkps=["6b"])


def _hasil_ok(kode):
    return {"kode": kode, "score": 3.0}


def test_proses_iku_runs_the_sync_work_with_assessment_context_set():
    dilihat = {}

    def sync(iku, model, tabel, cancel_event=None, prodi=None, tenant_id=None, accreditation_set_id=None):
        ctx = current_assessment_context.get()
        dilihat.update(tenant=ctx.tenant_id, dokumen=ctx.dokumen_id, indikator=ctx.indicator_no, prodi=ctx.study_program_id)
        return _hasil_ok(iku.kode)

    with patch("setor_led.pipeline._proses_iku_sync", sync):
        hasil = asyncio.run(proses_iku(IKU, asyncio.Semaphore(1), **KW))

    assert hasil == _hasil_ok(IKU.kode)
    assert dilihat == {"tenant": "t1", "dokumen": "d1", "indikator": 0, "prodi": "p1"}


def test_proses_iku_turns_a_domain_error_into_an_error_result():
    with patch("setor_led.pipeline._proses_iku_sync", side_effect=SetorLedError("Capaian tidak ditemukan")):
        hasil = asyncio.run(proses_iku(IKU, asyncio.Semaphore(1), **KW))
    assert hasil == {"kode": IKU.kode, "error": "Capaian tidak ditemukan"}


def test_proses_iku_does_not_leak_raw_exception_text():
    with patch("setor_led.pipeline._proses_iku_sync", side_effect=RuntimeError("password=rahasia host=10.0.0.5")):
        hasil = asyncio.run(proses_iku(IKU, asyncio.Semaphore(1), **KW))
    assert hasil["kode"] == IKU.kode
    assert "RuntimeError" in hasil["error"] and "rahasia" not in hasil["error"]


@contextlib.contextmanager
def _skor_dan_narasi(rubrik=RUBRIK_LEVEL, score=3.0, tambahan=None):
    """Rubrik, skor, dan narasi ditiru: yang diuji urutan dan data yang mengalir antar-langkah."""
    with (
        patch("setor_led.pipeline.muat_rubrik", return_value=rubrik),
        patch("setor_led.pipeline.tentukan_skor", return_value=score) as skor,
        patch("setor_led.pipeline.tulis_narasi", return_value=(INTI, tambahan)) as narasi,
    ):
        yield skor, narasi


SYNC_ARGS = (None, None, "t1", "s1")  # cancel_event, prodi, tenant_id, accreditation_set_id


def test_rubric_is_loaded_before_any_llm_call():
    with (
        patch("setor_led.pipeline.muat_rubrik", side_effect=SetorLedError("Rubrik untuk kode 'X' tidak ditemukan")) as muat,
        patch("setor_led.pipeline.build_setor_llm") as bangun,
    ):
        with pytest.raises(SetorLedError, match="tidak ditemukan"):
            pipeline._proses_iku_sync(IKU, "m", [], *SYNC_ARGS)
    muat.assert_called_once_with("t1", "s1", IKU.kode)
    bangun.assert_not_called()


def test_a_rubric_that_cannot_be_scored_fails_before_any_llm_call():
    sub = RubrikIndikator(kode="4", deskripsi="d", score_type="KOMPOSIT", levels={}, formula=None, sub_score_formula="(I + II) / 2")
    with patch("setor_led.pipeline.muat_rubrik", return_value=sub), patch("setor_led.pipeline.build_setor_llm") as bangun:
        with pytest.raises(SetorLedError, match="sub-indikator"):
            pipeline._proses_iku_sync(IKU, "m", [], *SYNC_ARGS)
    bangun.assert_not_called()


def test_capaian_not_found_still_errors_before_scoring():
    with (
        _skor_dan_narasi() as (skor, narasi),
        patch("setor_led.pipeline.build_setor_llm") as bangun,
        patch("setor_led.pipeline.cari_capaian", return_value=(None, "")),
    ):
        with pytest.raises(SetorLedError, match="Capaian tidak ditemukan"):
            pipeline._proses_iku_sync(IKU, "m", [], *SYNC_ARGS)
    skor.assert_not_called()
    narasi.assert_not_called()
    assert bangun.call_count == 1  # model tahap 2 tidak dibangun


def test_result_has_score_and_no_capaian_and_stage_two_sees_the_dasar():
    capaian = {**CAPAIAN, "dasar": "(3,58+3,48+3,33)/3 = 3,463"}
    with (
        _skor_dan_narasi(score=3.7) as (skor, narasi),
        patch("setor_led.pipeline.build_setor_llm"),
        patch("setor_led.pipeline.cari_capaian", return_value=(capaian, "bahan")),
    ):
        hasil = pipeline._proses_iku_sync(IKU, "m", [], *SYNC_ARGS)

    assert hasil == {"kode": IKU.kode, "score": 3.7, **INTI}
    assert skor.call_args.args[2] == capaian and narasi.call_args.args[2] == capaian  # dasar sampai ke tahap 2
    assert narasi.call_args.args[3] == 3.7  # narasi menerima skor hasil


def test_result_includes_tambahan_when_the_narrative_step_returns_it():
    with (
        _skor_dan_narasi(score=1.0, tambahan=TAMBAHAN),
        patch("setor_led.pipeline.build_setor_llm"),
        patch("setor_led.pipeline.cari_capaian", return_value=(CAPAIAN, "bahan")),
    ):
        hasil = pipeline._proses_iku_sync(IKU, "m", [], *SYNC_ARGS)
    assert hasil["tambahan"] == TAMBAHAN


@pytest.mark.parametrize("rubrik", [RUBRIK_BERSIH, RUBRIK_PROSA, RUBRIK_LEVEL])
def test_stage_one_never_receives_a_formula_block(rubrik):
    # Blok rumus/variabel di tahap 1 menurunkan tingkat ketemunya capaian pada data nyata; variabel diambil di langkah skor.
    with (
        _skor_dan_narasi(rubrik=rubrik),
        patch("setor_led.pipeline.build_setor_llm"),
        patch("setor_led.pipeline.cari_capaian", return_value=(CAPAIAN, "bahan")) as tahap1,
    ):
        pipeline._proses_iku_sync(IKU, "m", [], *SYNC_ARGS)
    assert "rumus" not in tahap1.call_args.kwargs and "variabel" not in tahap1.call_args.kwargs


def test_an_unknown_kode_fails_only_that_iku():
    def muat(tenant, set_id, kode):
        if kode == "A":
            raise SetorLedError("Rubrik untuk kode 'A' tidak ditemukan")
        return RUBRIK_LEVEL

    with (
        patch("setor_led.pipeline.muat_rubrik", muat),
        patch("setor_led.pipeline.build_setor_llm"),
        patch("setor_led.pipeline.cari_capaian", return_value=(CAPAIAN, "bahan")),
        patch("setor_led.pipeline.tentukan_skor", return_value=3.0),
        patch("setor_led.pipeline.tulis_narasi", return_value=(INTI, None)),
    ):
        hasil, dibatalkan = asyncio.run(jalankan_setor_led(_ikus("A", "B"), **RUN_KW))

    assert dibatalkan is False
    assert hasil[0] == {"kode": "A", "error": "Rubrik untuk kode 'A' tidak ditemukan"}
    assert hasil[1]["kode"] == "B" and hasil[1]["score"] == 3.0


# ── jalankan_setor_led (penjadwal) ─────────────────────────────────────────────

def _ikus(*kode):
    return [IkuInput(kode=k, indikator="i", target="3") for k in kode]


RUN_KW = dict(max_parallel=2, tenant_id="t1", dokumen_id="d1", accreditation_set_id="s1", study_program_id="p1", model="m")


def test_runner_returns_results_in_input_order_and_reports_progress():
    async def tiruan(iku, semaphore, **kw):
        await asyncio.sleep(0.05 if iku.kode == "A" else 0)  # A selesai belakangan
        return _hasil_ok(iku.kode)

    progres = []

    async def on_progress(selesai, total):
        progres.append((selesai, total))

    with (
        patch("setor_led.pipeline.proses_iku", tiruan),
        patch("setor_led.pipeline.daftar_tabel_lkps", return_value=[]),
    ):
        hasil, dibatalkan = asyncio.run(jalankan_setor_led(_ikus("A", "B", "C"), on_progress=on_progress, **RUN_KW))

    assert [h["kode"] for h in hasil] == ["A", "B", "C"]
    assert dibatalkan is False
    assert progres[-1] == (3, 3) and [p[0] for p in progres] == [1, 2, 3]


def test_runner_isolates_a_failing_iku():
    async def tiruan(iku, semaphore, **kw):
        return hasil_gagal(iku.kode, "gagal") if iku.kode == "B" else _hasil_ok(iku.kode)

    with (
        patch("setor_led.pipeline.proses_iku", tiruan),
        patch("setor_led.pipeline.daftar_tabel_lkps", return_value=[]),
    ):
        hasil, dibatalkan = asyncio.run(jalankan_setor_led(_ikus("A", "B", "C"), **RUN_KW))

    assert [h.get("error") for h in hasil] == [None, "gagal", None]
    assert dibatalkan is False


def test_runner_honours_max_parallel():
    aktif, puncak = 0, 0

    async def tiruan(iku, semaphore, **kw):
        nonlocal aktif, puncak
        async with semaphore:
            aktif += 1
            puncak = max(puncak, aktif)
            await asyncio.sleep(0.02)
            aktif -= 1
        return _hasil_ok(iku.kode)

    with (
        patch("setor_led.pipeline.proses_iku", tiruan),
        patch("setor_led.pipeline.daftar_tabel_lkps", return_value=[]),
    ):
        asyncio.run(jalankan_setor_led(_ikus("A", "B", "C", "D", "E"), **{**RUN_KW, "max_parallel": 2}))

    assert puncak == 2


def test_runner_cancel_returns_finished_results_and_stops_the_rest():
    async def tiruan(iku, semaphore, **kw):
        if iku.kode == "B":
            await asyncio.sleep(30)  # macet; harus dibatalkan, bukan ditunggu
        return _hasil_ok(iku.kode)

    async def selalu_batal():
        return True

    with (
        patch("setor_led.pipeline.proses_iku", tiruan),
        patch("setor_led.pipeline.daftar_tabel_lkps", return_value=[]),
        patch("setor_led.pipeline.CANCEL_POLL_SECONDS", 0.05),
    ):
        hasil, dibatalkan = asyncio.run(jalankan_setor_led(_ikus("A", "B"), is_cancelled=selalu_batal, **RUN_KW))

    assert dibatalkan is True
    assert [h["kode"] for h in hasil] == ["A"]


def test_runner_reports_not_cancelled_when_the_flag_is_false():
    async def tiruan(iku, semaphore, **kw):
        return _hasil_ok(iku.kode)

    tidak_batal = AsyncMock(return_value=False)
    with (
        patch("setor_led.pipeline.proses_iku", tiruan),
        patch("setor_led.pipeline.daftar_tabel_lkps", return_value=[]),
    ):
        hasil, dibatalkan = asyncio.run(jalankan_setor_led(_ikus("A"), is_cancelled=tidak_batal, **RUN_KW))

    assert dibatalkan is False and len(hasil) == 1


# ── pembatalan sampai ke thread LLM ────────────────────────────────────────────
# Membatalkan task asyncio tidak menghentikan thread executor yang sedang memanggil LLM. Tanpa sinyal kooperatif,
# thread itu terus menjalankan sisa langkah (sampai 6 tool + tahap 2 + retry) dan menghabiskan kredit setelah "batal".

def test_cari_capaian_stops_before_the_next_llm_call_once_cancelled():
    batal = threading.Event()
    llm = FakeLLM(_panggil_tool(), _panggil_tool(), CAPAIAN_JSON)

    class AlatYangDibatalkanSaatJalan(FakeTool):
        def invoke(self, args):
            batal.set()  # pembatalan tiba saat tool pertama berjalan
            return super().invoke(args)

    with patch.dict(pipeline.TOOLS_BY_NAME, {"get_lkps_table": AlatYangDibatalkanSaatJalan()}):
        with pytest.raises(SetorLedCancelled):
            cari_capaian(llm, IKU, ["6b"], cancel_event=batal)

    assert llm.dipanggil == 1  # panggilan LLM ke-2 tidak pernah dikirim


def test_cari_capaian_skips_remaining_tool_calls_of_the_same_step_once_cancelled():
    batal = threading.Event()
    dua_panggilan = AIMessage(content="", tool_calls=[
        {"name": "get_lkps_table", "args": {"table_reference": "Tabel 6.b"}, "id": "c1"},
        {"name": "search_led_evidence", "args": {"query": "q"}, "id": "c2"},
    ])
    pertama, kedua = FakeTool(), FakeTool()
    pertama_invoke = pertama.invoke
    pertama.invoke = lambda args: (batal.set(), pertama_invoke(args))[1]

    with patch.dict(pipeline.TOOLS_BY_NAME, {"get_lkps_table": pertama, "search_led_evidence": kedua}):
        with pytest.raises(SetorLedCancelled):
            cari_capaian(FakeLLM(dua_panggilan, CAPAIAN_JSON), IKU, [], cancel_event=batal)

    assert kedua.panggilan == []


def test_cari_capaian_is_unchanged_without_a_cancel_event():
    with patch.dict(pipeline.TOOLS_BY_NAME, {"get_lkps_table": FakeTool()}):
        capaian, _ = cari_capaian(FakeLLM(_panggil_tool(), CAPAIAN_JSON), IKU, ["6b"])
    assert capaian is not None


def test_proses_iku_sync_does_not_start_stage_two_once_cancelled():
    batal = threading.Event()

    def tahap1_lalu_batal(llm, iku, tabel, cancel_event=None, prodi=None):
        batal.set()
        return CAPAIAN, "bahan"

    with (
        _skor_dan_narasi() as (skor, narasi),
        patch("setor_led.pipeline.build_setor_llm") as bangun,
        patch("setor_led.pipeline.cari_capaian", tahap1_lalu_batal),
    ):
        with pytest.raises(SetorLedCancelled):
            pipeline._proses_iku_sync(IKU, "m", [], batal, None, "t1", "s1")

    skor.assert_not_called()
    narasi.assert_not_called()
    assert bangun.call_count == 1  # model tahap 2 tidak sempat dibangun


def test_runner_signals_cancel_to_running_threads_so_they_stop_calling_the_llm():
    mulai, berhenti = threading.Event(), threading.Event()

    def sync(iku, model, tabel, cancel_event=None, prodi=None, tenant_id=None, accreditation_set_id=None):
        mulai.set()
        assert cancel_event.wait(timeout=5), "sinyal batal tidak pernah sampai ke thread"
        berhenti.set()
        raise SetorLedCancelled()

    async def batal_setelah_thread_jalan():
        # Berbatas waktu: bila thread tidak pernah mulai (mis. tanda tangan tiruan salah), tes gagal, bukan menggantung.
        for _ in range(300):
            if mulai.is_set():
                return True
            await asyncio.sleep(0.01)
        raise AssertionError("thread tidak pernah mulai")

    with (
        patch("setor_led.pipeline._proses_iku_sync", sync),
        patch("setor_led.pipeline.daftar_tabel_lkps", return_value=[]),
        patch("setor_led.pipeline.CANCEL_POLL_SECONDS", 0.05),
    ):
        hasil, dibatalkan = asyncio.run(
            jalankan_setor_led(_ikus("A"), is_cancelled=batal_setelah_thread_jalan, **RUN_KW)
        )

    assert dibatalkan is True and hasil == []
    assert berhenti.is_set()  # thread keluar karena sinyal, bukan karena menunggu habis


def test_runner_keeps_an_iku_that_finished_while_the_cancel_flag_was_being_checked():
    async def tiruan(iku, semaphore, **kw):
        await asyncio.sleep(30 if iku.kode == "LAMBAT" else 0.02)
        return _hasil_ok(iku.kode)

    async def batal_setelah_jeda():
        await asyncio.sleep(0.2)  # IKU "CEPAT" selesai selama pengecekan flag ini
        return True

    with (
        patch("setor_led.pipeline.proses_iku", tiruan),
        patch("setor_led.pipeline.daftar_tabel_lkps", return_value=[]),
        patch("setor_led.pipeline.CANCEL_POLL_SECONDS", 0.01),
    ):
        hasil, dibatalkan = asyncio.run(
            jalankan_setor_led(_ikus("CEPAT", "LAMBAT"), is_cancelled=batal_setelah_jeda, **RUN_KW)
        )

    assert dibatalkan is True
    assert [h["kode"] for h in hasil] == ["CEPAT"]  # hasil yang sudah jadi tidak boleh terbuang


# ── jenis program studi diteruskan ke kedua tahap ──────────────────────────────

PRODI = "Teknik Telekomunikasi (jenjang D4 / Sarjana Terapan)"


class Pengintai(FakeLLM):
    """FakeLLM yang menyimpan masukan terakhir (pesan tahap 1 berupa list, prompt tahap 2 berupa str)."""

    def invoke(self, masukan):
        self.masukan_terakhir = masukan
        return super().invoke(masukan)


def test_cari_capaian_puts_the_study_program_in_the_stage_one_prompt():
    llm = Pengintai('{"ditemukan": false}')
    cari_capaian(llm, IKU, ["6d"], prodi=PRODI)
    pesan_pengguna = llm.masukan_terakhir[1].content
    assert f"Program studi: {PRODI}" in pesan_pengguna


def test_tulis_narasi_puts_the_study_program_in_the_stage_two_prompt():
    llm = Pengintai(JSON_OK)
    tulis_narasi(llm, IKU, CAPAIAN, 3.0, RUBRIK_LEVEL, "", prodi=PRODI)
    assert f"Program studi: {PRODI}" in llm.masukan_terakhir


def test_proses_iku_sync_gives_the_study_program_to_every_step():
    with (
        _skor_dan_narasi() as (skor, narasi),
        patch("setor_led.pipeline.build_setor_llm"),
        patch("setor_led.pipeline.cari_capaian", return_value=(CAPAIAN, "bahan")) as tahap1,
    ):
        pipeline._proses_iku_sync(IKU, "m", ["6d"], None, PRODI, "t1", "s1")

    assert tahap1.call_args.kwargs["prodi"] == PRODI
    assert skor.call_args.kwargs["prodi"] == PRODI
    assert narasi.call_args.kwargs["prodi"] == PRODI


def test_runner_hands_the_study_program_to_every_iku():
    dilihat = []

    async def tiruan(iku, semaphore, **kw):
        dilihat.append(kw.get("konteks_prodi"))
        return _hasil_ok(iku.kode)

    with (
        patch("setor_led.pipeline.proses_iku", tiruan),
        patch("setor_led.pipeline.daftar_tabel_lkps", return_value=[]),
    ):
        asyncio.run(jalankan_setor_led(_ikus("A", "B"), konteks_prodi=PRODI, **RUN_KW))

    assert dilihat == [PRODI, PRODI]


# ── tahap 1 untuk model reasoning: protokol JSON (seperti agent/reasoning_graph.py) ─────────────────────────
# Model reasoning tidak memakai function calling bawaan; ia membalas SATU objek JSON per giliran:
#   {"action": "<tool>", "args": {...}}  atau  {"action": "final", "ditemukan": ..., "nilai": ..., "sumber": ...}

def _aksi(nama, **args):
    return json.dumps({"action": nama, "args": args})


FINAL_JSON = json.dumps(
    {"action": "final", "ditemukan": True, "nilai": "RIPK = 3,46", "sumber": "LKPS Tabel 6.b", "dasar": "(3,58+3,48+3,33)/3"}
)


def test_json_loop_runs_a_tool_then_returns_the_final_capaian():
    llm = Pengintai(_aksi("get_lkps_table", table_reference="Tabel 6.b"), FINAL_JSON)
    alat = FakeTool()
    with patch.dict(pipeline.TOOLS_BY_NAME, {"get_lkps_table": alat}):
        capaian, bahan = cari_capaian_json(llm, IKU, ["6b"])

    assert capaian == {"nilai": "RIPK = 3,46", "sumber": "LKPS Tabel 6.b", "dasar": "(3,58+3,48+3,33)/3"}
    assert alat.panggilan == [{"table_reference": "Tabel 6.b"}]
    assert "| 3,46 |" in bahan and "get_lkps_table" in bahan
    # hasil tool kembali ke model sebagai pesan teks (model ini tidak punya ToolMessage bawaan)
    terakhir = llm.masukan_terakhir[-1].content
    assert terakhir.startswith("Hasil tool (get_lkps_table)") and "| 3,46 |" in terakhir


def test_json_loop_reads_replies_wrapped_in_think_blocks_and_code_fences():
    mentah = f"<think>cek tabel 6.b dulu</think>\n{PAGAR}json\n{FINAL_JSON}\n{PAGAR}"
    capaian, _ = cari_capaian_json(FakeLLM(mentah), IKU, [])
    assert capaian["nilai"] == "RIPK = 3,46"


def test_json_loop_accepts_a_final_object_without_the_action_key():
    polos = json.dumps({"ditemukan": True, "nilai": "100%", "sumber": "LED"})
    capaian, _ = cari_capaian_json(FakeLLM(polos), IKU, [])
    assert capaian == {"nilai": "100%", "sumber": "LED"}


def test_json_loop_reports_not_found():
    capaian, bahan = cari_capaian_json(FakeLLM('{"action": "final", "ditemukan": false}'), IKU, [])
    assert capaian is None and bahan == ""


def test_json_loop_nudges_after_an_invalid_reply_and_recovers():
    llm = Pengintai("saya akan mencari dulu...", FINAL_JSON)
    capaian, _ = cari_capaian_json(llm, IKU, [])
    assert capaian is not None
    assert "tidak valid JSON" in llm.masukan_terakhir[-1].content  # nudge terkirim ke model


def test_json_loop_gives_up_after_repeated_invalid_replies():
    llm = FakeLLM("bukan json")
    capaian, _ = cari_capaian_json(llm, IKU, [])
    assert capaian is None
    assert llm.dipanggil == pipeline.MAX_JSON_RETRY + 1  # terbatas, tidak berputar selamanya


def test_json_loop_tells_the_model_when_it_names_an_unknown_tool_and_goes_on():
    llm = Pengintai(_aksi("tool_ngawur", x=1), FINAL_JSON)
    capaian, bahan = cari_capaian_json(llm, IKU, [])
    assert capaian is not None and "tool_ngawur" in bahan
    assert "tidak tersedia" in llm.masukan_terakhir[-1].content


@pytest.mark.parametrize(
    "tool, dikirim, diterima",
    [
        ("get_lkps_table", {"table_id": "6b"}, {"table_reference": "6b"}),
        ("get_lkps_table", {"table": "6b"}, {"table_reference": "6b"}),
        ("search_led_evidence", {"q": "masa studi"}, {"query": "masa studi"}),
        ("cari_bukti_dukung_prodi", {"q": "sertifikat"}, {"query": "sertifikat"}),
    ],
)
def test_json_loop_normalises_common_argument_name_mistakes_like_amis_loop(tool, dikirim, diterima):
    alat = FakeTool("{}")
    with patch.dict(pipeline.TOOLS_BY_NAME, {tool: alat}):
        cari_capaian_json(FakeLLM(_aksi(tool, **dikirim), FINAL_JSON), IKU, [])
    assert alat.panggilan == [diterima]


def test_json_loop_survives_a_tool_that_raises_and_non_dict_args():
    alat = FakeTool(galat=ConnectionError("db putus"))
    ragu = json.dumps({"action": "get_lkps_table", "args": "bukan dict"})
    with patch.dict(pipeline.TOOLS_BY_NAME, {"get_lkps_table": alat}):
        capaian, bahan = cari_capaian_json(FakeLLM(ragu, FINAL_JSON), IKU, [])
    assert capaian is not None and "ConnectionError" in bahan


def test_json_loop_stops_calling_tools_after_the_step_limit_and_asks_for_the_final_answer():
    llm = Pengintai(*([_aksi("get_lkps_table", table_reference="6b")] * 20))
    with patch.dict(pipeline.TOOLS_BY_NAME, {"get_lkps_table": FakeTool()}):
        capaian, _ = cari_capaian_json(llm, IKU, ["6b"])

    assert capaian is None
    assert llm.dipanggil <= MAX_TOOL_STEPS + pipeline.MAX_JSON_RETRY + 1  # panggilan LLM terbatas
    assert "Batas pemanggilan tool" in llm.masukan_terakhir[-1].content


def test_json_loop_applies_the_same_hedge_guard_as_the_native_loop():
    ragu = json.dumps({"action": "final", "ditemukan": True, "nilai": "diperkirakan tinggi", "sumber": "LED"})
    capaian, _ = cari_capaian_json(FakeLLM(ragu), IKU, [])
    assert capaian is None


def test_json_loop_caps_each_tool_result_in_the_evidence():
    llm = FakeLLM(_aksi("get_lkps_table", table_reference="6b"), _aksi("search_led_evidence", query="q"), FINAL_JSON)
    alat = {"get_lkps_table": FakeTool("x" * 50_000), "search_led_evidence": FakeTool("PENANDA-LED")}
    with patch.dict(pipeline.TOOLS_BY_NAME, alat):
        _, bahan = cari_capaian_json(llm, IKU, ["6b"])
    assert "PENANDA-LED" in bahan and len(bahan) <= pipeline.MAX_BAHAN_CHARS


def test_json_loop_puts_the_study_program_in_the_first_prompt():
    llm = Pengintai(FINAL_JSON)
    cari_capaian_json(llm, IKU, ["6d"], prodi=PRODI)
    assert f"Program studi: {PRODI}" in llm.masukan_terakhir[1].content


def test_json_loop_stops_before_the_next_llm_call_once_cancelled():
    batal = threading.Event()

    class Alat(FakeTool):
        def invoke(self, args):
            batal.set()
            return super().invoke(args)

    llm = FakeLLM(_aksi("get_lkps_table", table_reference="6b"), FINAL_JSON)
    with patch.dict(pipeline.TOOLS_BY_NAME, {"get_lkps_table": Alat()}):
        with pytest.raises(SetorLedCancelled):
            cari_capaian_json(llm, IKU, [], cancel_event=batal)
    assert llm.dipanggil == 1


# ── pemilihan jalur di _proses_iku_sync ────────────────────────────────────────

def test_proses_iku_sync_uses_the_json_protocol_for_reasoning_models():
    with (
        patch("setor_led.pipeline.is_reasoning_model", return_value=True),
        patch("setor_led.pipeline.build_setor_llm") as bangun,
        patch("setor_led.pipeline.cari_capaian_json", return_value=(CAPAIAN, "bahan")) as json_loop,
        patch("setor_led.pipeline.cari_capaian") as native,
        _skor_dan_narasi(),
    ):
        hasil = pipeline._proses_iku_sync(IKU, "deepseek-r1:32b", [], None, PRODI, "t1", "s1")

    json_loop.assert_called_once()
    native.assert_not_called()
    assert json_loop.call_args.kwargs["prodi"] == PRODI
    tahap1, tahap2 = bangun.call_args_list
    assert "tools" not in tahap1.kwargs  # tanpa bind_tools
    assert tahap1.kwargs["num_predict"] == pipeline.REASONING_NUM_PREDICT  # reasoning memakai banyak token <think>
    assert tahap1.kwargs["disable_reasoning"] is False  # seperti AMI: reasoning tetap hidup untuk tahap tool
    assert tahap2.kwargs["num_predict"] == pipeline.REASONING_NUM_PREDICT
    # Uji live OpenRouter: deepseek-r1 menjawab 400 "Reasoning is mandatory for this endpoint and cannot be disabled"
    # bila reasoning dimatikan. Model reasoning tidak boleh dimatikan reasoning-nya di tahap mana pun (seperti AMI).
    assert tahap2.kwargs["disable_reasoning"] is False
    assert hasil["score"] == 3.0


def test_proses_iku_sync_keeps_native_tool_calling_for_other_models():
    with (
        patch("setor_led.pipeline.is_reasoning_model", return_value=False),
        patch("setor_led.pipeline.build_setor_llm") as bangun,
        patch("setor_led.pipeline.cari_capaian", return_value=(CAPAIAN, "bahan")) as native,
        patch("setor_led.pipeline.cari_capaian_json") as json_loop,
        _skor_dan_narasi(),
    ):
        pipeline._proses_iku_sync(IKU, "qwen3.6:35b", [], None, None, "t1", "s1")

    native.assert_called_once()
    json_loop.assert_not_called()
    assert bangun.call_args_list[0].kwargs["tools"] == pipeline.TOOLS
    assert bangun.call_args_list[1].kwargs["num_predict"] == 3000
    assert bangun.call_args_list[1].kwargs.get("disable_reasoning") is None  # model chat: bawaan (dimatikan tanpa tools)


# ── skor minimum rubrik ("Tidak ada skor kurang dari N") ──────────────────────────────────────────────────────────

RUBRIK_LEVEL_MIN2 = RubrikIndikator(
    kode="1", deskripsi="VMTS", score_type="KUALITATIF",
    levels={4: "sangat baik", 2: "cukup", 1: "Tidak ada skor kurang dari 2.", 0: "Tidak ada skor kurang dari 2."},
    formula=None, sub_score_formula=None,
)
RUBRIK_BERSIH_MIN2 = RubrikIndikator(
    kode="9", deskripsi="Dana operasional", score_type="KUANTITATIF",
    levels={4: "BOP >= 10.000.000", 1: "Tidak ada skor kurang dari 2."}, formula="(2 x BOP) / 5.000.000", sub_score_formula=None,
)


@pytest.mark.parametrize("dijawab, hasil", [(0, 2.0), (1, 2.0), (2, 2.0), (3, 3.0), (4, 4.0)])
def test_level_score_is_raised_to_the_rubric_minimum(dijawab, hasil):
    llm = FakeLLM(json.dumps({"score": dijawab, "alasan": "x"}))
    assert tentukan_skor(llm, IKU, CAPAIAN, RUBRIK_LEVEL_MIN2, "") == hasil


def test_formula_score_is_raised_to_the_rubric_minimum():
    llm = FakeLLM(json.dumps({"variabel": {"BOP": 3500000}}))  # (2 x 3.500.000) / 5.000.000 = 1,4 < 2
    assert tentukan_skor(llm, IKU, CAPAIAN, RUBRIK_BERSIH_MIN2, "") == 2.0


def test_formula_score_above_the_minimum_is_untouched():
    llm = FakeLLM(json.dumps({"variabel": {"BOP": 9250000}}))
    assert tentukan_skor(llm, IKU, CAPAIAN, RUBRIK_BERSIH_MIN2, "") == 3.7


def test_a_rubric_without_a_floor_keeps_the_models_low_score():
    llm = FakeLLM(json.dumps({"score": 0, "alasan": "x"}))
    assert tentukan_skor(llm, IKU, CAPAIAN, RUBRIK_LEVEL, "") == 0.0
