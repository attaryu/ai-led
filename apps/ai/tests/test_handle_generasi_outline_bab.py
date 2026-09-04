"""Integration-style tests for worker.py::_handle_generasi_outline_bab --
LLM-generated outline (list of ChapterSection rows), grounded in the bab's
own rubric criterion groups. All Postgres/LLM dependencies are mocked; no
Redis/Postgres needed.
"""

from __future__ import annotations

import asyncio
import contextlib
from unittest.mock import AsyncMock, MagicMock, patch


def _fake_job(bab_id="bab-1", overwrite=False):
    job = MagicMock()
    job.data = {"babDokumenId": bab_id}
    if overwrite:
        job.data["overwrite"] = True
    return job


def _fake_bab(accreditation_set_id="set-1"):
    return {
        "id": "bab-1",
        "tenant_id": "tenant-1",
        "document_id": "doc-1",
        "chapter_order": 1,
        "chapter_title": "Tata Pamong",
        "study_program_id": "prodi-1",
        "accreditation_set_id": accreditation_set_id,
    }


def _run_with_llm(job, llm, **db_overrides):
    defaults = dict(
        get_bab_dokumen=MagicMock(return_value=_fake_bab()),
        get_pedoman_for_bab=MagicMock(return_value=[]),
        get_rubrik_for_bab=MagicMock(return_value=[
            {"id": "c1", "criterion_code": "1.1", "criterion_group": "Tata Pamong", "description": "desc"},
        ]),
        get_chapter_template_subbab=MagicMock(return_value=[]),
        create_chapter_sections=MagicMock(return_value=[{"id": "sec-1"}, {"id": "sec-2"}]),
    )
    defaults.update(db_overrides)

    from worker import _handle_generasi_outline_bab

    with contextlib.ExitStack() as stack:
        stack.enter_context(patch("llm.chat_model.build_plain_llm", return_value=llm))
        for name, fn in defaults.items():
            stack.enter_context(patch(f"db.generation_client.{name}", fn))
        result = asyncio.run(_handle_generasi_outline_bab(job))

    return result, defaults


def _llm_returning(content):
    llm = MagicMock()
    llm.ainvoke = AsyncMock(return_value=MagicMock(content=content))
    llm.with_retry.return_value = llm  # worker.py wraps every .ainvoke() call in .with_retry()
    return llm


def test_parses_valid_outline_and_persists_sections():
    raw = """{"sections": [
        {"judul": "Kebijakan Tata Pamong", "panduan": "Bahas dasar hukum penetapan tata pamong"},
        {"judul": "Pelaksanaan", "panduan": "Bahas praktik tata pamong sehari-hari"}
    ]}"""
    result, defaults = _run_with_llm(_fake_job(), _llm_returning(raw))
    create_sections = defaults["create_chapter_sections"]

    assert result == {"status": "completed", "sectionCount": 2}
    args, kwargs = create_sections.call_args
    assert args[0] == "tenant-1"
    assert args[1] == "bab-1"
    assert args[2] == [
        {"title": "Kebijakan Tata Pamong", "guidance": "Bahas dasar hukum penetapan tata pamong", "subseksi": []},
        {"title": "Pelaksanaan", "guidance": "Bahas praktik tata pamong sehari-hari", "subseksi": []},
    ]
    assert kwargs["overwrite"] is False


def test_overwrite_flag_passed_through():
    raw = '{"sections": [{"judul": "A", "panduan": "B"}]}'
    _, defaults = _run_with_llm(_fake_job(overwrite=True), _llm_returning(raw))
    assert defaults["create_chapter_sections"].call_args.kwargs["overwrite"] is True


def test_empty_outline_from_llm_returns_error():
    result, defaults = _run_with_llm(_fake_job(), _llm_returning("bukan JSON sama sekali"))
    assert result["status"] == "error"
    defaults["create_chapter_sections"].assert_not_called()


def test_existing_sections_without_overwrite_surfaces_value_error_as_result():
    def _raise(*args, **kwargs):
        raise ValueError("Bab bab-1 sudah punya 2 section — pakai overwrite=true untuk mengganti")

    raw = '{"sections": [{"judul": "A", "panduan": "B"}]}'
    result, _ = _run_with_llm(_fake_job(), _llm_returning(raw), create_chapter_sections=MagicMock(side_effect=_raise))
    assert result["status"] == "error"
    assert "overwrite=true" in result["error"]


def test_bab_not_found_returns_error_without_calling_llm():
    llm = _llm_returning("{}")
    result, _ = _run_with_llm(_fake_job(), llm, get_bab_dokumen=MagicMock(return_value=None))
    assert result == {"status": "error", "error": "BabDokumen bab-1 tidak ditemukan"}
    llm.ainvoke.assert_not_called()


def test_rubrik_and_struktur_lookups_scoped_to_documents_accreditation_set():
    raw = '{"sections": [{"judul": "A", "panduan": "B"}]}'
    _, defaults = _run_with_llm(_fake_job(), _llm_returning(raw))

    defaults["get_rubrik_for_bab"].assert_called_once_with("tenant-1", 1, "set-1")
    defaults["get_chapter_template_subbab"].assert_called_once_with("tenant-1", "set-1", 1)


def test_struktur_referensi_included_in_outline_prompt():
    raw = '{"sections": [{"judul": "A", "panduan": "B"}]}'
    subbab = [{"title": "Kebijakan Mutu", "guidance": "Dasar hukum penetapan kebijakan mutu"}]
    llm = _llm_returning(raw)
    _run_with_llm(_fake_job(), llm, get_chapter_template_subbab=MagicMock(return_value=subbab))

    prompt = llm.ainvoke.call_args.args[0]
    assert "STRUKTUR RESMI DARI PEDOMAN" in prompt
    assert "Kebijakan Mutu" in prompt
