"""setor_led.pipeline -- LLM dan tool diganti tiruan; yang diuji alur, urutan, isolasi galat, dan batal."""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage

from agent.context import current_assessment_context
from setor_led import pipeline
from setor_led.pipeline import (
    MAX_TOOL_STEPS,
    cari_capaian,
    daftar_tabel_lkps,
    jalankan_setor_led,
    parse_capaian,
    proses_iku,
    tulis_evaluasi_narasi,
)
from setor_led.schema import SetorLedError, hasil_gagal, IkuInput

IKU = IkuInput(kode="IKU.REL.MHS.3", indikator="Rata-rata IPK lulusan", target="PJJ: RIPK ≥ 3,25")
INTI = {
    "analisisKetercapaian": "A", "usulanTargetTahunDepan": "U", "strategiPencapaian": "S", "sarprasDibutuhkan": "P",
}
JSON_OK = json.dumps({"evaluasi": "MELAMPAUI", **INTI})
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


def test_cari_capaian_caps_collected_evidence_size():
    llm = FakeLLM(_panggil_tool(), CAPAIAN_JSON)
    with patch.dict(pipeline.TOOLS_BY_NAME, {"get_lkps_table": FakeTool(keluaran="x" * 50_000)}):
        _, bahan = cari_capaian(llm, IKU, ["6b"])
    assert len(bahan) <= pipeline.MAX_BAHAN_CHARS


# ── tulis_evaluasi_narasi (tahap 2) ────────────────────────────────────────────

CAPAIAN = {"nilai": "RIPK = 3,46", "sumber": "LKPS Tabel 6.b"}


def test_tulis_evaluasi_returns_validated_output():
    evaluasi, inti, tambahan = tulis_evaluasi_narasi(FakeLLM(JSON_OK), IKU, CAPAIAN, "bahan")
    assert evaluasi == "MELAMPAUI" and inti == INTI and tambahan is None


def test_tulis_evaluasi_retries_once_on_an_invalid_enum():
    buruk = json.dumps({"evaluasi": "Melampaui standar", **INTI})
    llm = FakeLLM(buruk, JSON_OK)
    evaluasi, _, _ = tulis_evaluasi_narasi(llm, IKU, CAPAIAN, "")
    assert evaluasi == "MELAMPAUI" and llm.dipanggil == 2


def test_tulis_evaluasi_gives_up_after_one_retry():
    llm = FakeLLM("bukan json")
    with pytest.raises(SetorLedError):
        tulis_evaluasi_narasi(llm, IKU, CAPAIAN, "")
    assert llm.dipanggil == 2


def test_tulis_evaluasi_reads_json_wrapped_in_think_and_fence():
    mentah = f"<think>bandingkan 3,46 dengan 3,25</think>\n{PAGAR}json\n{JSON_OK}\n{PAGAR}"
    evaluasi, _, _ = tulis_evaluasi_narasi(FakeLLM(mentah), IKU, CAPAIAN, "")
    assert evaluasi == "MELAMPAUI"


# ── proses_iku (satu IKU, async) ───────────────────────────────────────────────

KW = dict(tenant_id="t1", dokumen_id="d1", accreditation_set_id="s1", study_program_id="p1", model="m", tabel_lkps=["6b"])


def _hasil_ok(kode):
    return {"kode": kode, "evaluasi": "MEMENUHI"}


def test_proses_iku_runs_the_sync_work_with_assessment_context_set():
    dilihat = {}

    def sync(iku, model, tabel):
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


def test_proses_iku_sync_reports_missing_capaian_without_calling_stage_two():
    with (
        patch("setor_led.pipeline.build_setor_llm") as bangun,
        patch("setor_led.pipeline.cari_capaian", return_value=(None, "")),
        patch("setor_led.pipeline.tulis_evaluasi_narasi") as tulis,
    ):
        with pytest.raises(SetorLedError, match="Capaian tidak ditemukan"):
            pipeline._proses_iku_sync(IKU, "m", [])
    tulis.assert_not_called()
    assert bangun.call_count == 1  # model tahap 2 tidak dibangun


def test_proses_iku_sync_gives_stage_two_the_dasar_but_keeps_it_out_of_the_result():
    capaian = {**CAPAIAN, "dasar": "(3,58+3,48+3,33)/3 = 3,463"}
    with (
        patch("setor_led.pipeline.build_setor_llm"),
        patch("setor_led.pipeline.cari_capaian", return_value=(capaian, "bahan")),
        patch("setor_led.pipeline.tulis_evaluasi_narasi", return_value=("MELAMPAUI", INTI, None)) as tulis,
    ):
        hasil = pipeline._proses_iku_sync(IKU, "m", [])

    assert tulis.call_args.args[2] == capaian  # tahap 2 melihat dasar perhitungannya
    assert hasil["capaian"] == CAPAIAN  # hasil job tetap {nilai, sumber} saja, ringkas


def test_proses_iku_sync_builds_the_full_result():
    with (
        patch("setor_led.pipeline.build_setor_llm"),
        patch("setor_led.pipeline.cari_capaian", return_value=(CAPAIAN, "bahan")),
        patch("setor_led.pipeline.tulis_evaluasi_narasi", return_value=("MELAMPAUI", INTI, None)),
    ):
        hasil = pipeline._proses_iku_sync(IKU, "m", [])
    assert hasil == {"kode": IKU.kode, "capaian": CAPAIAN, "evaluasi": "MELAMPAUI", **INTI}


# ── jalankan_setor_led (penjadwal) ─────────────────────────────────────────────

def _ikus(*kode):
    return [IkuInput(kode=k, indikator="i", target="t") for k in kode]


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
