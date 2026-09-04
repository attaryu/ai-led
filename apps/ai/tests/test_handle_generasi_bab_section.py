"""Integration-style tests for worker.py::_handle_generasi_bab -- now
section-scoped (payload requires `sectionId`, retrieval query = section's
own guidance, not the chapter title) with a compile step that folds every
GENERATED section back into the chapter's active content. All Postgres/
LLM/vectorstore dependencies are mocked; no Redis/Postgres needed.
"""

from __future__ import annotations

import asyncio
import contextlib
import itertools
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _fake_job(bab_id="bab-1", section_id="sec-1", user_id="user-1"):
    job = MagicMock()
    job.data = {"babDokumenId": bab_id, "sectionId": section_id, "createdByUserId": user_id}
    return job


def _fake_bab():
    return {
        "id": "bab-1",
        "tenant_id": "tenant-1",
        "document_id": "doc-1",
        "chapter_order": 1,
        "chapter_title": "Tata Pamong",
        "study_program_id": "prodi-1",
    }


def _fake_section(status="PENDING"):
    return {
        "id": "sec-1",
        "chapter_id": "bab-1",
        "order": 1,
        "title": "Kebijakan Tata Pamong",
        "guidance": "Bahas dasar hukum penetapan tata pamong",
        "status": status,
        "content": None,
        "model": None,
        "error": None,
    }


_FULL_JUDGE_CONTENT = (
    '{"faithfulness": 0.8, "answer_relevancy": 0.7, "context_precision": 0.6, '
    '"context_recall": 0.5, "reasoning": {"faithfulness": "Alasan faithfulness."}}'
)


def _run(job, llm_content="Narasi kebijakan tata pamong.", judge_content=_FULL_JUDGE_CONTENT, search_led=None, **db_overrides):
    plain_llm = MagicMock()
    plain_llm.ainvoke = AsyncMock(side_effect=[
        MagicMock(content="- Butuh dasar hukum apa?"),  # checklist
        MagicMock(content=llm_content),  # synthesis
    ])
    plain_llm.with_retry.return_value = plain_llm  # worker.py wraps every .ainvoke() call in .with_retry()
    judge_llm = MagicMock()
    judge_llm.ainvoke = AsyncMock(return_value=MagicMock(content=judge_content))
    judge_llm.with_retry.return_value = judge_llm
    search_led = search_led if search_led is not None else MagicMock(return_value=[])

    defaults = dict(
        get_bab_dokumen=MagicMock(return_value=_fake_bab()),
        get_chapter_section=MagicMock(return_value=_fake_section()),
        get_chapter_sections=MagicMock(return_value=[{
            **_fake_section(status="GENERATED"),
            "content": {"format": "html", "body": f"<p>{llm_content}</p>", "markdown": llm_content},
        }]),
        get_pedoman_for_bab=MagicMock(return_value=[]),
        get_rubrik_for_bab=MagicMock(return_value=[]),
        get_confirmed_recommendation=MagicMock(return_value=None),
        get_evidence_citation_labels=MagicMock(return_value={}),
        get_user_nama=MagicMock(return_value="Budi"),
        create_bab_draft=MagicMock(return_value={"id": "draft-1", "version": 1}),
        link_evidence_to_chapter_and_draft=MagicMock(),
        update_bab_dokumen_aktif=MagicMock(),
        create_generation_run=MagicMock(return_value={"id": "run-1"}),
        create_ragas_score=MagicMock(return_value={"id": "score-1"}),
        update_chapter_section=MagicMock(),
    )
    defaults.update(db_overrides)

    from worker import _handle_generasi_bab

    with contextlib.ExitStack() as stack:
        stack.enter_context(patch("llm.chat_model.build_plain_llm", return_value=plain_llm))
        stack.enter_context(patch("llm.chat_model.build_judge_llm", return_value=judge_llm))
        stack.enter_context(patch("vectorstore.pgvector_store.search_led", search_led))
        stack.enter_context(patch("vectorstore.pgvector_evidence_store.search_evidence", return_value=[]))
        for name, fn in defaults.items():
            stack.enter_context(patch(f"db.generation_client.{name}", fn))
        result = asyncio.run(_handle_generasi_bab(job))

    return result, {**defaults, "search_led": search_led, "plain_llm": plain_llm, "judge_llm": judge_llm}


def test_judge_to_ragas_metrics_all_or_nothing():
    from worker import _judge_to_ragas_metrics

    full = {
        "faithfulness": 0.8, "answer_relevancy": 0.7,
        "context_precision": 0.6, "context_recall": 0.5,
        "reasoning": {"faithfulness": "Alasan."},
    }
    assert _judge_to_ragas_metrics(full) == {
        "faithfulness": {"nilai": 0.8, "alasan": "Alasan."},
        "answer_relevancy": {"nilai": 0.7, "alasan": ""},
        "context_precision": {"nilai": 0.6, "alasan": ""},
        "context_recall": {"nilai": 0.5, "alasan": ""},
    }

    # Missing metric -> skip entirely, don't write a partial score.
    assert _judge_to_ragas_metrics({"faithfulness": 0.8}) == {}
    # Judge error -> skip entirely.
    assert _judge_to_ragas_metrics({"error": "LLM down"}) == {}


def test_manual_selected_evidence_ids_used_when_no_confirmed_draft():
    """apps/web's manual "Bukti Dukung" picker sends `selectedEvidenceIds`
    straight on the payload when there's no recommend->confirm draft --
    previously ignored entirely (evidence retrieval skipped, 0 evidence
    ever linked), now it should drive search_evidence + get linked."""
    job = _fake_job()
    job.data["selectedEvidenceIds"] = ["ev-1", "ev-2"]

    search_evidence = MagicMock(return_value=[
        {"chunk_id": "chunk-1", "text": "Cuplikan evidence.", "bukti_dukung_id": "ev-1"},
    ])

    plain_llm = MagicMock()
    plain_llm.ainvoke = AsyncMock(side_effect=[
        MagicMock(content="- Butuh dasar hukum apa?"),
        MagicMock(content="Narasi kebijakan tata pamong."),
    ])
    plain_llm.with_retry.return_value = plain_llm
    judge_llm = MagicMock()
    judge_llm.ainvoke = AsyncMock(return_value=MagicMock(content='{"faithfulness": 0.8}'))
    judge_llm.with_retry.return_value = judge_llm

    defaults = dict(
        get_bab_dokumen=MagicMock(return_value=_fake_bab()),
        get_chapter_section=MagicMock(return_value=_fake_section()),
        get_chapter_sections=MagicMock(return_value=[_fake_section(status="GENERATED")]),
        get_pedoman_for_bab=MagicMock(return_value=[]),
        get_rubrik_for_bab=MagicMock(return_value=[]),
        get_confirmed_recommendation=MagicMock(return_value=None),
        get_evidence_citation_labels=MagicMock(return_value={"ev-1": "Renstra.pdf", "ev-2": "SK.pdf"}),
        get_user_nama=MagicMock(return_value="Budi"),
        create_bab_draft=MagicMock(return_value={"id": "draft-1", "version": 1}),
        link_evidence_to_chapter_and_draft=MagicMock(),
        update_bab_dokumen_aktif=MagicMock(),
        create_generation_run=MagicMock(return_value={"id": "run-1"}),
        create_ragas_score=MagicMock(return_value={"id": "score-1"}),
        update_chapter_section=MagicMock(),
    )

    from worker import _handle_generasi_bab

    with contextlib.ExitStack() as stack:
        stack.enter_context(patch("llm.chat_model.build_plain_llm", return_value=plain_llm))
        stack.enter_context(patch("llm.chat_model.build_judge_llm", return_value=judge_llm))
        stack.enter_context(patch("vectorstore.pgvector_store.search_led", return_value=[]))
        stack.enter_context(patch("vectorstore.pgvector_evidence_store.search_evidence", search_evidence))
        for name, fn in defaults.items():
            stack.enter_context(patch(f"db.generation_client.{name}", fn))
        result = asyncio.run(_handle_generasi_bab(job))

    assert result["status"] == "completed"
    search_evidence.assert_called()
    assert search_evidence.call_args.args[2] == ["ev-1", "ev-2"]
    defaults["link_evidence_to_chapter_and_draft"].assert_called_once_with(
        "tenant-1", "bab-1", "draft-1", ["ev-1", "ev-2"],
    )


def test_generates_one_section_and_compiles_chapter():
    result, defaults = _run(_fake_job())

    assert result["status"] == "completed"
    assert result["sectionId"] == "sec-1"
    assert result["babDraftId"] == "draft-1"

    # Marked GENERATING then GENERATED (not PENDING/ERROR).
    statuses = [c.kwargs.get("status") for c in defaults["update_chapter_section"].call_args_list]
    assert "GENERATING" in statuses
    assert "GENERATED" in statuses

    # Compiled from ALL generated sections, persisted as the chapter's active content.
    defaults["create_bab_draft"].assert_called_once()
    body = defaults["update_bab_dokumen_aktif"].call_args.args[2]["body"]
    assert "Narasi kebijakan tata pamong." in body

    # "Skor" tab metrics come from the judge (_judge_to_ragas_metrics), not
    # a live `ragas` library call -- see worker.py's 4a/4b merge note.
    ragas_metrics = defaults["create_ragas_score"].call_args.args[3]
    assert ragas_metrics["faithfulness"] == {"nilai": 0.8, "alasan": "Alasan faithfulness."}
    assert ragas_metrics["context_recall"] == {"nilai": 0.5, "alasan": ""}


def test_retrieval_query_uses_section_guidance_not_chapter_title():
    _, defaults = _run(_fake_job())
    query = defaults["search_led"].call_args.args[0]
    assert "Bahas dasar hukum penetapan tata pamong" in query
    assert query.startswith("Kebijakan Tata Pamong")


def test_section_not_found_returns_error_without_touching_llm():
    result, defaults = _run(_fake_job(), get_chapter_section=MagicMock(return_value=None))
    assert result["status"] == "error"
    assert "sec-1" in result["error"]
    defaults["plain_llm"].ainvoke.assert_not_called()


def test_section_belonging_to_different_chapter_is_rejected():
    other = {**_fake_section(), "chapter_id": "bab-OTHER"}
    result, _ = _run(_fake_job(), get_chapter_section=MagicMock(return_value=other))
    assert result["status"] == "error"


def test_synthesis_failure_marks_section_error_and_reraises():
    plain_llm = MagicMock()
    # RuntimeError repeats indefinitely (not a 2-item list) -- worker.py wraps
    # the synthesis call in .with_retry() (default 3 attempts), which would
    # exhaust a finite side_effect list with StopIteration instead of
    # re-raising the real error.
    plain_llm.ainvoke = AsyncMock(side_effect=itertools.chain(
        [MagicMock(content="- checklist item")], itertools.repeat(RuntimeError("LLM down")),
    ))
    plain_llm.with_retry.return_value = plain_llm
    update_section = MagicMock()

    from worker import _handle_generasi_bab

    defaults = dict(
        get_bab_dokumen=MagicMock(return_value=_fake_bab()),
        get_chapter_section=MagicMock(return_value=_fake_section()),
        get_pedoman_for_bab=MagicMock(return_value=[]),
        get_rubrik_for_bab=MagicMock(return_value=[]),
        get_confirmed_recommendation=MagicMock(return_value=None),
        get_evidence_citation_labels=MagicMock(return_value={}),
        update_chapter_section=update_section,
    )
    with contextlib.ExitStack() as stack:
        stack.enter_context(patch("llm.chat_model.build_plain_llm", return_value=plain_llm))
        stack.enter_context(patch("vectorstore.pgvector_store.search_led", return_value=[]))
        for name, fn in defaults.items():
            stack.enter_context(patch(f"db.generation_client.{name}", fn))
        with pytest.raises(RuntimeError):
            asyncio.run(_handle_generasi_bab(_fake_job()))

    error_calls = [c for c in update_section.call_args_list if c.kwargs.get("status") == "ERROR"]
    assert len(error_calls) == 1
