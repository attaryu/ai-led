"""Regression test for worker.py::_handle_assessment_ami -- was crashing with
"_run_assessment_pipeline() missing 1 required positional argument:
'accreditation_set_id'" because this BullMQ job path never resolved/passed
it, unlike api/routes/assessment.py's /start and /resume HTTP routes. All
Postgres/agent/redis dependencies are mocked; no real infra needed.
"""

from __future__ import annotations

import asyncio
import contextlib
from unittest.mock import AsyncMock, MagicMock, patch


def _fake_job(dokumen_id="doc-1", tenant_id="tenant-1", user_id="user-1"):
    job = MagicMock()
    job.id = "job-1"
    job.data = {"dokumenId": dokumen_id, "tenantId": tenant_id, "createdByUserId": user_id}
    return job


def _fake_rubric(no=1, kriteria="Kriteria 1"):
    rubric = MagicMock()
    rubric.no = no
    rubric.kriteria = kriteria
    return rubric


def _run(job, accreditation_set_id="set-1", rubrics=None, **overrides):
    run_pipeline = AsyncMock()
    redis_client = MagicMock()
    redis_client.get = AsyncMock(return_value=None)
    redis_client.aclose = AsyncMock()

    defaults = dict(
        set_lkps_registry=MagicMock(),
        load_lkps_for_document=MagicMock(return_value=True),
        _prepare_led_index=AsyncMock(return_value=None),
        _get_rubrics_for_set=MagicMock(return_value=rubrics if rubrics is not None else [_fake_rubric()]),
        _run_assessment_pipeline=run_pipeline,
        _doc_dir=MagicMock(return_value="/nonexistent/doc/dir"),
        _document_lkps_evidence_id=MagicMock(return_value=None),
        create_session=MagicMock(),
        get_document_accreditation_set=MagicMock(return_value=accreditation_set_id),
        get_session=MagicMock(return_value={
            "status": "completed", "total_indicators": 1, "completed_indicators": 1,
        }),
    )
    defaults.update(overrides)

    from worker import _handle_assessment_ami

    with contextlib.ExitStack() as stack:
        stack.enter_context(patch("agent.tools.lkps_tool.set_lkps_registry", defaults["set_lkps_registry"]))
        stack.enter_context(patch("agent.tools.lkps_tool.load_lkps_for_document", defaults["load_lkps_for_document"]))
        stack.enter_context(patch("worker._prepare_led_index", defaults["_prepare_led_index"]))
        stack.enter_context(patch("agent.tools.rubric_tool._get_rubrics_for_set", defaults["_get_rubrics_for_set"]))
        stack.enter_context(patch("api.routes.assessment._run_assessment_pipeline", defaults["_run_assessment_pipeline"]))
        stack.enter_context(patch("api.routes.upload._doc_dir", defaults["_doc_dir"]))
        stack.enter_context(patch("worker._document_lkps_evidence_id", defaults["_document_lkps_evidence_id"]))
        stack.enter_context(patch("db.postgres_client.create_session", defaults["create_session"]))
        stack.enter_context(patch("db.postgres_client.get_document_accreditation_set", defaults["get_document_accreditation_set"]))
        stack.enter_context(patch("db.postgres_client.get_session", defaults["get_session"]))
        stack.enter_context(patch("redis.asyncio.from_url", return_value=redis_client))
        result = asyncio.run(_handle_assessment_ami(job))

    return result, {**defaults, "run_pipeline": run_pipeline}


def test_passes_accreditation_set_id_through_to_the_pipeline():
    result, defaults = _run(_fake_job(), accreditation_set_id="set-42")

    assert result["status"] == "completed"
    defaults["run_pipeline"].assert_called_once()
    assert defaults["run_pipeline"].call_args.kwargs["accreditation_set_id"] == "set-42"


def test_uses_the_set_scoped_rubric_lookup_not_the_global_one():
    _, defaults = _run(_fake_job(), accreditation_set_id="set-42")
    defaults["_get_rubrics_for_set"].assert_called_with("set-42", "tenant-1", refresh=True)


def test_document_without_a_chosen_set_fails_fast_without_calling_the_pipeline():
    result, defaults = _run(_fake_job(), get_document_accreditation_set=MagicMock(return_value=None))

    assert result["status"] == "error"
    assert "Instrumen Akreditasi" in result["error"]
    defaults["run_pipeline"].assert_not_called()


def test_session_lkps_evidence_is_loaded_with_ariels_registry():
    job = _fake_job()
    job.data["lkpsBuktiDukungId"] = "ev-lkps"
    _, defaults = _run(job)
    defaults["load_lkps_for_document"].assert_called_once_with("tenant-1", "doc-1", "ev-lkps")


def test_falls_back_to_the_documents_lkps_when_the_session_picked_none():
    _, defaults = _run(_fake_job(), _document_lkps_evidence_id=MagicMock(return_value="ev-doc"))
    defaults["load_lkps_for_document"].assert_called_once_with("tenant-1", "doc-1", "ev-doc")


def test_missing_or_unreadable_lkps_stops_the_job_like_ariel():
    result, defaults = _run(_fake_job(), load_lkps_for_document=MagicMock(return_value=False))
    assert result["status"] == "error" and "LKPS" in result["error"]
    defaults["run_pipeline"].assert_not_called()

    result, defaults = _run(_fake_job(), load_lkps_for_document=MagicMock(side_effect=ValueError("rusak")))
    assert result["status"] == "error" and "rusak" in result["error"]
    defaults["run_pipeline"].assert_not_called()


def test_no_led_to_score_stops_the_job():
    result, defaults = _run(_fake_job(), _prepare_led_index=AsyncMock(return_value="Berkas LED belum diunggah"))
    assert result == {"status": "error", "error": "Berkas LED belum diunggah"}
    defaults["run_pipeline"].assert_not_called()


def test_editor_led_is_indexed_from_chapter_content_with_editor_prefix():
    from worker import _prepare_led_index

    chapters = [
        {"chapter_title": "BAB I Pendahuluan", "working_content": {"type": "doc", "content": [
            {"type": "heading", "content": [{"type": "text", "text": "A. Latar Belakang"}]},
            {"type": "paragraph", "content": [{"type": "text", "text": "Program studi berdiri tahun 2010. " * 10}]},
        ]}},
        {"chapter_title": "BAB II Kosong", "working_content": {"type": "doc", "content": []}},
    ]
    cur = MagicMock()
    cur.fetchall.return_value = chapters
    with (
        patch("db.connection.tenant_cursor") as tc,
        patch("vectorstore.pgvector_store.led_index_matches_editor", return_value=False),
        patch("vectorstore.pgvector_store.index_led_chunks") as index,
    ):
        tc.return_value.__enter__.return_value = cur
        assert asyncio.run(_prepare_led_index("tenant-1", "doc-1", "EDITOR")) is None

    chunks, tenant, dokumen = index.call_args.args
    assert (tenant, dokumen) == ("tenant-1", "doc-1")
    assert all(c.chunk_id.startswith("editor-") for c in chunks)
    assert "Program studi berdiri" in chunks[0].text and "BAB II" not in chunks[0].text
    assert chunks[0].section_heading == "BAB I Pendahuluan"


def test_unchanged_editor_is_not_re_embedded():
    from worker import _prepare_led_index

    cur = MagicMock()
    cur.fetchall.return_value = [{"chapter_title": "BAB I", "working_content": {"type": "doc", "content": [
        {"type": "paragraph", "content": [{"type": "text", "text": "Isi bab yang tidak berubah sama sekali. " * 5}]},
    ]}}]
    with (
        patch("db.connection.tenant_cursor") as tc,
        patch("vectorstore.pgvector_store.led_index_matches_editor", return_value=True),
        patch("vectorstore.pgvector_store.index_led_chunks") as index,
    ):
        tc.return_value.__enter__.return_value = cur
        assert asyncio.run(_prepare_led_index("tenant-1", "doc-1", "EDITOR")) is None
    index.assert_not_called()


def test_led_index_matches_editor_compares_stored_text_in_order():
    from ingestion.led_chunker import LEDChunk
    from vectorstore.pgvector_store import led_index_matches_editor

    chunk = LEDChunk(chunk_id="x", text="teks", page_start=-1, page_end=-1, section_heading="BAB I", char_start=0)
    cur = MagicMock()
    with patch("vectorstore.pgvector_store._cursor") as c:
        c.return_value.__enter__.return_value = cur
        cur.fetchall.return_value = [{"chunk_id": "editor-1", "text": "teks", "section_heading": "BAB I", "embedded": True}]
        assert led_index_matches_editor("t", "d", [chunk])
        cur.fetchall.return_value = [{"chunk_id": "editor-1", "text": "lama", "section_heading": "BAB I", "embedded": True}]
        assert not led_index_matches_editor("t", "d", [chunk])
        cur.fetchall.return_value = [{"chunk_id": "file-1", "text": "teks", "section_heading": "BAB I", "embedded": True}]
        assert not led_index_matches_editor("t", "d", [chunk])
        cur.fetchall.return_value = [{"chunk_id": "editor-1", "text": "teks", "section_heading": "BAB I", "embedded": False}]
        assert not led_index_matches_editor("t", "d", [chunk])
        cur.fetchall.return_value = []
        assert not led_index_matches_editor("t", "d", [chunk])


def test_empty_editor_is_an_error_not_an_empty_index():
    from worker import _prepare_led_index

    cur = MagicMock()
    cur.fetchall.return_value = []
    with patch("db.connection.tenant_cursor") as tc, patch("vectorstore.pgvector_store.index_led_chunks") as index:
        tc.return_value.__enter__.return_value = cur
        assert "Editor" in asyncio.run(_prepare_led_index("tenant-1", "doc-1", "EDITOR"))
    index.assert_not_called()


def test_uploaded_led_reindexes_from_file_key_when_index_is_missing_or_from_editor():
    from worker import _prepare_led_index

    cur = MagicMock()
    cur.fetchone.return_value = {"led_file_key": "tenant-1/led.pdf"}
    index_file = AsyncMock(return_value=12)
    with (
        patch("db.connection.tenant_cursor") as tc,
        patch("vectorstore.pgvector_store.led_index_is_from_file", return_value=False),
        patch("worker._index_led_file", index_file),
    ):
        tc.return_value.__enter__.return_value = cur
        assert asyncio.run(_prepare_led_index("tenant-1", "doc-1", "UNGGAHAN")) is None
    index_file.assert_awaited_once_with("tenant-1", "doc-1", "tenant-1/led.pdf")

    with (
        patch("vectorstore.pgvector_store.led_index_is_from_file", return_value=True),
        patch("worker._index_led_file") as index_again,
    ):
        assert asyncio.run(_prepare_led_index("tenant-1", "doc-1", "UNGGAHAN")) is None
    index_again.assert_not_called()


def test_ingestion_lkps_indexes_the_file_key_with_dimas_chunker():
    from worker import _handle_ingestion_lkps

    job = MagicMock()
    job.data = {"evidenceId": "lkps-1", "tenantId": "tenant-1", "fileUrl": "tenant-1/lkps.xlsx"}
    chunks = [{"chunk_id": "4a", "sheet": "4a", "text": "x"}]
    cur = MagicMock()
    with (
        patch("db.r2_client.download_to", side_effect=lambda key, dest: dest) as download,
        patch("ingestion.lkps_chunker.process_lkps_file", return_value=chunks),
        patch("vectorstore.pgvector_lkps_store.index_lkps_chunks") as index,
        patch("db.connection.tenant_cursor") as tc,
    ):
        tc.return_value.__enter__.return_value = cur
        result = asyncio.run(_handle_ingestion_lkps(job))

    assert download.call_args.args[0] == "tenant-1/lkps.xlsx"
    index.assert_called_once_with(chunks, "tenant-1", "lkps-1")  # keyed by the LKPS file (dimas lkps_id)
    assert result["chunks"] == 1
    assert cur.execute.call_args.args[1] == ("SIAP", None, "lkps-1")


def test_ingestion_led_downloads_file_key_and_indexes_with_pdf_chunker():
    from worker import _handle_ingestion_led

    job = MagicMock()
    job.data = {"dokumenId": "doc-1", "tenantId": "tenant-1", "fileUrl": "tenant-1/x/led.pdf"}
    with (
        patch("db.r2_client.download_to", side_effect=lambda key, dest: dest),
        patch("ingestion.led_chunker.chunk_led_pdf", return_value=["c1", "c2"]) as chunk,
        patch("vectorstore.pgvector_store.index_led_chunks") as index,
    ):
        result = asyncio.run(_handle_ingestion_led(job))

    assert chunk.call_args.args[0].endswith("led.pdf")
    index.assert_called_once_with(["c1", "c2"], "tenant-1", "doc-1")
    assert result["chunks"] == 2


def test_session_model_from_payload_reaches_the_pipeline_like_ariels_start():
    job = _fake_job()
    job.data["model"] = "qwen3.6:35b"
    with patch("llm.ollama_client.get_available_models", return_value=["qwen3.6:35b"]):
        _, defaults = _run(job)
    assert defaults["run_pipeline"].call_args.kwargs["model"] == "qwen3.6:35b"


def test_unknown_session_model_is_rejected():
    job = _fake_job()
    job.data["model"] = "nope"
    with patch("llm.ollama_client.get_available_models", return_value=["qwen3.6:35b"]):
        result, defaults = _run(job)
    assert result["status"] == "error"
    defaults["run_pipeline"].assert_not_called()
