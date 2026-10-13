"""worker.py::_handle_setor_led -- semua dependensi Postgres/Redis/LLM di-mock, tanpa infra nyata.
Meniru pola tests/test_handle_assessment_ami.py."""

from __future__ import annotations

import asyncio
import contextlib
from unittest.mock import AsyncMock, MagicMock, patch

IKU = {"kode": "IKU.REL.MHS.3", "indikator": "Rata-rata IPK lulusan", "target": "RIPK ≥ 3,25"}


def _fake_job(**data):
    job = MagicMock()
    job.id = "job-1"
    job.updateProgress = AsyncMock()
    job.data = {"dokumenId": "doc-1", "tenantId": "tenant-1", "createdByUserId": "user-1",
                "programStudiId": "prodi-1", "ikuList": [IKU], **data}
    return job


def _run(job, *, set_id="set-1", hasil=None, dibatalkan=False, models=("qwen3.6:35b",), **overrides):
    jalankan = AsyncMock(return_value=(hasil if hasil is not None else [{"kode": IKU["kode"]}], dibatalkan))
    redis_client = MagicMock()
    redis_client.get = AsyncMock(return_value=None)
    redis_client.aclose = AsyncMock()

    defaults = dict(
        load_lkps_for_document=MagicMock(return_value=True),
        _prepare_led_index=AsyncMock(return_value=None),
        _document_lkps_evidence_id=MagicMock(return_value=None),
        get_document_accreditation_set=MagicMock(return_value=set_id),
        get_available_models=MagicMock(return_value=list(models)),
        jalankan_setor_led=jalankan,
    )
    defaults.update(overrides)

    from worker import _handle_setor_led

    with contextlib.ExitStack() as stack:
        stack.enter_context(patch("agent.tools.lkps_tool.load_lkps_for_document", defaults["load_lkps_for_document"]))
        stack.enter_context(patch("worker._prepare_led_index", defaults["_prepare_led_index"]))
        stack.enter_context(patch("worker._document_lkps_evidence_id", defaults["_document_lkps_evidence_id"]))
        stack.enter_context(patch("db.postgres_client.get_document_accreditation_set", defaults["get_document_accreditation_set"]))
        stack.enter_context(patch("llm.ollama_client.get_available_models", defaults["get_available_models"]))
        stack.enter_context(patch("setor_led.pipeline.jalankan_setor_led", defaults["jalankan_setor_led"]))
        stack.enter_context(patch("redis.asyncio.from_url", return_value=redis_client))
        result = asyncio.run(_handle_setor_led(job))

    return result, defaults


def test_happy_path_returns_results_and_passes_scope_to_the_pipeline():
    result, d = _run(_fake_job(), hasil=[{"kode": "IKU.REL.MHS.3", "evaluasi": "MEMENUHI"}])

    assert result == {"status": "completed", "hasil": [{"kode": "IKU.REL.MHS.3", "evaluasi": "MEMENUHI"}]}
    kw = d["jalankan_setor_led"].call_args.kwargs
    assert kw["tenant_id"] == "tenant-1" and kw["dokumen_id"] == "doc-1"
    assert kw["accreditation_set_id"] == "set-1" and kw["study_program_id"] == "prodi-1"
    assert kw["model"] == "qwen3.6:35b"  # default = model pertama yang dikonfigurasi
    iku_list = d["jalankan_setor_led"].call_args.args[0]
    assert [(i.kode, i.target) for i in iku_list] == [("IKU.REL.MHS.3", "RIPK ≥ 3,25")]


def test_cancelled_run_keeps_the_partial_results():
    result, _ = _run(_fake_job(), hasil=[{"kode": "A"}], dibatalkan=True)
    assert result == {"status": "cancelled", "hasil": [{"kode": "A"}]}


def test_empty_or_duplicate_iku_list_stops_the_job():
    for payload in ([], [IKU, dict(IKU)]):
        result, d = _run(_fake_job(ikuList=payload))
        assert result["status"] == "error"
        d["jalankan_setor_led"].assert_not_called()


def test_missing_iku_list_stops_the_job():
    job = _fake_job()
    del job.data["ikuList"]
    result, d = _run(job)
    assert result["status"] == "error" and "ikuList" in result["error"]
    d["jalankan_setor_led"].assert_not_called()


def test_unknown_model_is_rejected():
    result, d = _run(_fake_job(model="nope"))
    assert result["status"] == "error" and "Unknown model" in result["error"]
    d["jalankan_setor_led"].assert_not_called()


def test_requested_model_is_forwarded():
    _, d = _run(_fake_job(model="llama3.3:70b"), models=("qwen3.6:35b", "llama3.3:70b"))
    assert d["jalankan_setor_led"].call_args.kwargs["model"] == "llama3.3:70b"


def test_reasoning_model_is_rejected_with_a_clear_message():
    result, d = _run(_fake_job(model="deepseek-r1:32b"), models=("deepseek-r1:32b",))
    assert result["status"] == "error" and "reasoning" in result["error"].lower()
    d["jalankan_setor_led"].assert_not_called()


def test_default_model_that_is_a_reasoning_model_is_rejected_too():
    result, d = _run(_fake_job(), models=("deepseek-r1:32b",))
    assert result["status"] == "error" and "reasoning" in result["error"].lower()
    d["jalankan_setor_led"].assert_not_called()


def test_document_without_accreditation_set_stops_the_job():
    result, d = _run(_fake_job(), get_document_accreditation_set=MagicMock(return_value=None))
    assert result["status"] == "error" and "Set Akreditasi" in result["error"]
    d["jalankan_setor_led"].assert_not_called()


def test_led_not_ready_stops_the_job():
    result, d = _run(_fake_job(), _prepare_led_index=AsyncMock(return_value="Berkas LED belum diunggah"))
    assert result == {"status": "error", "error": "Berkas LED belum diunggah"}
    d["jalankan_setor_led"].assert_not_called()


def test_sumber_led_defaults_to_editor_and_is_forwarded():
    _, d = _run(_fake_job())
    d["_prepare_led_index"].assert_awaited_once_with("tenant-1", "doc-1", "EDITOR")
    _, d = _run(_fake_job(sumberLed="UNGGAHAN"))
    d["_prepare_led_index"].assert_awaited_once_with("tenant-1", "doc-1", "UNGGAHAN")


def test_missing_or_unreadable_lkps_stops_the_job():
    result, d = _run(_fake_job(), load_lkps_for_document=MagicMock(return_value=False))
    assert result["status"] == "error" and "LKPS" in result["error"]
    d["jalankan_setor_led"].assert_not_called()

    result, d = _run(_fake_job(), load_lkps_for_document=MagicMock(side_effect=ValueError("rusak")))
    assert result["status"] == "error" and "rusak" in result["error"]
    d["jalankan_setor_led"].assert_not_called()


def test_payload_lkps_wins_then_falls_back_to_the_documents_lkps():
    _, d = _run(_fake_job(lkpsBuktiDukungId="ev-payload"), _document_lkps_evidence_id=MagicMock(return_value="ev-doc"))
    d["load_lkps_for_document"].assert_called_once_with("tenant-1", "doc-1", "ev-payload")

    _, d = _run(_fake_job(), _document_lkps_evidence_id=MagicMock(return_value="ev-doc"))
    d["load_lkps_for_document"].assert_called_once_with("tenant-1", "doc-1", "ev-doc")


def test_progress_callback_updates_the_bullmq_job():
    async def jalankan(iku_list, **kw):
        await kw["on_progress"](1, 1)
        return [{"kode": "A"}], False

    job = _fake_job()
    _run(job, jalankan_setor_led=AsyncMock(side_effect=jalankan))
    job.updateProgress.assert_awaited_once_with({"completed": 1, "total": 1})


def test_cancel_flag_is_read_from_the_shared_redis_key():
    seen = {}

    async def jalankan(iku_list, **kw):
        seen["batal"] = await kw["is_cancelled"]()
        return [], True

    redis_client = MagicMock()
    redis_client.get = AsyncMock(return_value=b"1")
    redis_client.aclose = AsyncMock()
    from worker import _handle_setor_led

    with (
        patch("agent.tools.lkps_tool.load_lkps_for_document", return_value=True),
        patch("worker._prepare_led_index", AsyncMock(return_value=None)),
        patch("worker._document_lkps_evidence_id", return_value=None),
        patch("db.postgres_client.get_document_accreditation_set", return_value="set-1"),
        patch("llm.ollama_client.get_available_models", return_value=["qwen3.6:35b"]),
        patch("setor_led.pipeline.jalankan_setor_led", AsyncMock(side_effect=jalankan)),
        patch("redis.asyncio.from_url", return_value=redis_client),
    ):
        asyncio.run(_handle_setor_led(_fake_job()))

    redis_client.get.assert_awaited_with("job:cancel:job-1")
    assert seen["batal"] is True
    redis_client.aclose.assert_awaited_once()


def test_process_job_routes_setor_led_to_its_handler():
    from worker import process_job

    job = MagicMock()
    job.name, job.id, job.data = "SETOR_LED", "job-1", {}
    job.queue.name = "assessment-queue"
    with patch("worker._handle_setor_led", AsyncMock(return_value={"status": "completed", "hasil": []})) as h:
        result = asyncio.run(process_job(job, "token"))

    h.assert_awaited_once_with(job)
    assert result == {"status": "completed", "hasil": []}
