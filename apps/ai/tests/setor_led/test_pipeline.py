"""setor_led.pipeline -- LLM dan tool diganti tiruan; yang diuji alur, urutan, isolasi galat, dan batal."""

from __future__ import annotations

import asyncio
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


def test_tulis_evaluasi_retry_tells_the_model_what_was_wrong():
    # Retry dengan prompt identik hampir pasti menghasilkan kesalahan yang sama; beri tahu alasannya.
    dilihat = []

    class Mata(FakeLLM):
        def invoke(self, masukan):
            dilihat.append(masukan)
            return super().invoke(masukan)

    buruk = json.dumps({"evaluasi": "Melampaui standar", **INTI})
    tulis_evaluasi_narasi(Mata(buruk, JSON_OK), IKU, CAPAIAN, "")

    assert len(dilihat) == 2
    assert "ditolak" not in dilihat[0].lower()
    assert dilihat[1].startswith(dilihat[0])  # prompt asli utuh
    assert "ditolak" in dilihat[1].lower() and "Evaluasi di luar daftar" in dilihat[1]


def test_tulis_evaluasi_gives_up_after_one_retry():
    llm = FakeLLM("bukan json")
    with pytest.raises(SetorLedError):
        tulis_evaluasi_narasi(llm, IKU, CAPAIAN, "")
    assert llm.dipanggil == 2


def test_tulis_evaluasi_logs_the_raw_reply_when_it_is_unreadable(caplog):
    # Tanpa potongan jawaban, "JSON tak terbaca" tidak bisa dibedakan: terpotong, prosa, atau kutip rusak.
    with caplog.at_level("WARNING", logger="setor_led.pipeline"):
        with pytest.raises(SetorLedError):
            tulis_evaluasi_narasi(FakeLLM('{"evaluasi": "MEMENUHI", "analisisKetercapaian": "terpotong di sin'), IKU, CAPAIAN, "")
    assert "terpotong di sin" in caplog.text and IKU.kode in caplog.text


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

    def sync(iku, model, tabel, cancel_event=None, prodi=None):
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


def test_tulis_evaluasi_does_not_call_the_llm_once_cancelled():
    batal = threading.Event()
    batal.set()
    llm = FakeLLM(JSON_OK)
    with pytest.raises(SetorLedCancelled):
        tulis_evaluasi_narasi(llm, IKU, CAPAIAN, "", cancel_event=batal)
    assert llm.dipanggil == 0


def test_tulis_evaluasi_does_not_retry_once_cancelled_during_the_first_call():
    batal = threading.Event()

    class Membatalkan(FakeLLM):
        def invoke(self, masukan):
            batal.set()
            return super().invoke(masukan)

    llm = Membatalkan("bukan json", JSON_OK)
    with pytest.raises(SetorLedCancelled):
        tulis_evaluasi_narasi(llm, IKU, CAPAIAN, "", cancel_event=batal)
    assert llm.dipanggil == 1


def test_proses_iku_sync_does_not_start_stage_two_once_cancelled():
    batal = threading.Event()

    def tahap1_lalu_batal(llm, iku, tabel, cancel_event=None, prodi=None):
        batal.set()
        return CAPAIAN, "bahan"

    with (
        patch("setor_led.pipeline.build_setor_llm") as bangun,
        patch("setor_led.pipeline.cari_capaian", tahap1_lalu_batal),
        patch("setor_led.pipeline.tulis_evaluasi_narasi") as tulis,
    ):
        with pytest.raises(SetorLedCancelled):
            pipeline._proses_iku_sync(IKU, "m", [], batal)

    tulis.assert_not_called()
    assert bangun.call_count == 1  # model tahap 2 tidak sempat dibangun


def test_runner_signals_cancel_to_running_threads_so_they_stop_calling_the_llm():
    mulai, berhenti = threading.Event(), threading.Event()

    def sync(iku, model, tabel, cancel_event=None, prodi=None):
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


def test_tulis_evaluasi_puts_the_study_program_in_the_stage_two_prompt():
    llm = Pengintai(JSON_OK)
    tulis_evaluasi_narasi(llm, IKU, CAPAIAN, "", prodi=PRODI)
    assert f"Program studi: {PRODI}" in llm.masukan_terakhir


def test_proses_iku_sync_gives_the_study_program_to_both_stages():
    with (
        patch("setor_led.pipeline.build_setor_llm"),
        patch("setor_led.pipeline.cari_capaian", return_value=(CAPAIAN, "bahan")) as tahap1,
        patch("setor_led.pipeline.tulis_evaluasi_narasi", return_value=("MELAMPAUI", INTI, None)) as tahap2,
    ):
        pipeline._proses_iku_sync(IKU, "m", ["6d"], None, PRODI)

    assert tahap1.call_args.kwargs["prodi"] == PRODI
    assert tahap2.call_args.kwargs["prodi"] == PRODI


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
        patch("setor_led.pipeline.tulis_evaluasi_narasi", return_value=("MELAMPAUI", INTI, None)),
    ):
        hasil = pipeline._proses_iku_sync(IKU, "deepseek-r1:32b", [], None, PRODI)

    json_loop.assert_called_once()
    native.assert_not_called()
    assert json_loop.call_args.kwargs["prodi"] == PRODI
    tahap1, tahap2 = bangun.call_args_list
    assert "tools" not in tahap1.kwargs  # tanpa bind_tools
    assert tahap1.kwargs["num_predict"] == pipeline.REASONING_NUM_PREDICT  # reasoning memakai banyak token <think>
    assert tahap1.kwargs["disable_reasoning"] is False  # seperti AMI: reasoning tetap hidup untuk tahap tool
    assert tahap2.kwargs["num_predict"] == pipeline.REASONING_NUM_PREDICT
    assert hasil["evaluasi"] == "MELAMPAUI"


def test_proses_iku_sync_keeps_native_tool_calling_for_other_models():
    with (
        patch("setor_led.pipeline.is_reasoning_model", return_value=False),
        patch("setor_led.pipeline.build_setor_llm") as bangun,
        patch("setor_led.pipeline.cari_capaian", return_value=(CAPAIAN, "bahan")) as native,
        patch("setor_led.pipeline.cari_capaian_json") as json_loop,
        patch("setor_led.pipeline.tulis_evaluasi_narasi", return_value=("MELAMPAUI", INTI, None)),
    ):
        pipeline._proses_iku_sync(IKU, "qwen3.6:35b", [], None, None)

    native.assert_called_once()
    json_loop.assert_not_called()
    assert bangun.call_args_list[0].kwargs["tools"] == pipeline.TOOLS
    assert bangun.call_args_list[1].kwargs["num_predict"] == 3000
