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
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from prose import doc_to_text, text_to_doc


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
        "lkps_evidence_id": "lkps-1",
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
            "content": text_to_doc(llm_content),
        }]),
        get_pedoman_for_bab=MagicMock(return_value=[]),
        get_rubrik_for_bab=MagicMock(return_value=[]),
        get_confirmed_recommendation=MagicMock(return_value=None),
        get_evidence_citation_labels=MagicMock(return_value={}),
        get_user_nama=MagicMock(return_value="Budi"),
        create_bab_draft=MagicMock(return_value={"id": "draft-1", "version": 1}),
        link_evidence_to_chapter_and_draft=MagicMock(),
        update_bab_dokumen_aktif=MagicMock(),
        create_generation_run=(run := MagicMock(return_value={"id": "run-1"})),
        create_ragas_score=MagicMock(return_value={"id": "score-1"}),
        create_section_draft_ai=MagicMock(return_value={"id": "sd-1", "version": 1}),
        clear_section_chat=MagicMock(),
        # Only this section has been generated: its latest judge is the one just saved.
        get_latest_section_judges=MagicMock(side_effect=lambda *_: [run.call_args.kwargs["judge_result"]]),
        update_chapter_section=MagicMock(),
    )
    defaults.update(db_overrides)

    from worker import _handle_generasi_bab

    with contextlib.ExitStack() as stack:
        # Tes-tes ini menguji jalur LLM-judge (dijalankan di dalam handler); jalur RAGAS susulan
        # punya tes sendiri di bagian bawah berkas.
        stack.enter_context(patch.dict("os.environ", {"WRITING_EVAL_ENGINE": os.environ.get("_UJI_ENGINE", "llm")}))
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
        create_generation_run=(run := MagicMock(return_value={"id": "run-1"})),
        create_ragas_score=MagicMock(return_value={"id": "score-1"}),
        create_section_draft_ai=MagicMock(return_value={"id": "sd-1", "version": 1}),
        clear_section_chat=MagicMock(),
        # Only this section has been generated: its latest judge is the one just saved.
        get_latest_section_judges=MagicMock(side_effect=lambda *_: [run.call_args.kwargs["judge_result"]]),
        update_chapter_section=MagicMock(),
    )

    from worker import _handle_generasi_bab

    with contextlib.ExitStack() as stack:
        # Tes-tes ini menguji jalur LLM-judge (dijalankan di dalam handler); jalur RAGAS susulan
        # punya tes sendiri di bagian bawah berkas.
        stack.enter_context(patch.dict("os.environ", {"WRITING_EVAL_ENGINE": "llm"}))
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
    body = doc_to_text(defaults["update_bab_dokumen_aktif"].call_args.args[2])
    assert "Narasi kebijakan tata pamong." in body

    # "Skor" tab metrics come from the judge (_judge_to_ragas_metrics), not
    # a live `ragas` library call -- see worker.py's 4a/4b merge note.
    ragas_metrics = defaults["create_ragas_score"].call_args.args[3]
    assert ragas_metrics["faithfulness"] == {"nilai": 0.8, "alasan": "Alasan faithfulness."}
    assert ragas_metrics["context_recall"] == {"nilai": 0.5, "alasan": ""}


def test_generation_run_carries_section_id_and_never_searches_led():
    """dimas facts are LKPS + evidence only -- the LED is never retrieved; the run is tied to the generated section."""
    _, defaults = _run(_fake_job())

    call = defaults["create_generation_run"].call_args
    assert call.kwargs["section_id"] == "sec-1"
    assert call.kwargs["chunks_used"] == []
    defaults["search_led"].assert_not_called()


def test_prompt_title_is_the_guidance_breadcrumb_like_dimas_retrieval_query():
    from worker import _section_prompt_title

    section = {"title": "Kebijakan", "guidance": "BAB II Tata Pamong\nC Kebijakan\n\nBahas dasar hukum"}
    assert _section_prompt_title(section) == "BAB II Tata Pamong\nC Kebijakan"
    # Sections extracted before the breadcrumb existed fall back to the plain title.
    assert _section_prompt_title({"title": "Kebijakan", "guidance": "Bahas dasar hukum"}) == "Kebijakan"


def test_lkps_needed_looks_up_by_sheet_without_rag(monkeypatch):
    """Port of Dimas 140d8ae: needs_lkps/lkps_list are the section's OWN
    precomputed properties (not re-derived from `pedoman` text), and when
    true, retrieval is a direct sheet lookup -- no similarity search."""
    section = {**_fake_section(), "lkps_needed": True, "lkps_list": ["4a"]}
    lookup_mock = MagicMock(return_value=[{"chunk_id": "4a", "sheet": "4a", "text": "data sheet 4a"}])
    search_lkps_mock = MagicMock()
    monkeypatch.setattr("vectorstore.pgvector_lkps_store.lookup_lkps_by_sheets", lookup_mock)
    monkeypatch.setattr("vectorstore.pgvector_lkps_store.search_lkps", search_lkps_mock)

    result, _ = _run(_fake_job(), get_chapter_section=MagicMock(return_value=section))

    assert result["status"] == "completed"
    lookup_mock.assert_called_once_with("tenant-1", "lkps-1", ["4a"])  # the document's LKPS file, indexed on upload
    search_lkps_mock.assert_not_called()


def test_no_lkps_chosen_means_no_lkps_context():
    from worker import _load_lkps_tables

    bab = {"id": "bab-1", "tenant_id": "tenant-1", "lkps_evidence_id": None}
    assert _load_lkps_tables(bab, True, ["4a"], ["q"]) == []


def test_section_not_found_returns_error_without_touching_llm():
    result, defaults = _run(_fake_job(), get_chapter_section=MagicMock(return_value=None))
    assert result["status"] == "error"
    assert "sec-1" in result["error"]
    defaults["plain_llm"].ainvoke.assert_not_called()


def test_section_belonging_to_different_chapter_is_rejected():
    other = {**_fake_section(), "chapter_id": "bab-OTHER"}
    result, _ = _run(_fake_job(), get_chapter_section=MagicMock(return_value=other))
    assert result["status"] == "error"


def test_synthesis_failure_marks_section_error_and_ends_cleanly():
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
        # Tes-tes ini menguji jalur LLM-judge (dijalankan di dalam handler); jalur RAGAS susulan
        # punya tes sendiri di bagian bawah berkas.
        stack.enter_context(patch.dict("os.environ", {"WRITING_EVAL_ENGINE": "llm"}))
        stack.enter_context(patch("llm.chat_model.build_plain_llm", return_value=plain_llm))
        stack.enter_context(patch("vectorstore.pgvector_store.search_led", return_value=[]))
        for name, fn in defaults.items():
            stack.enter_context(patch(f"db.generation_client.{name}", fn))
        result = asyncio.run(_handle_generasi_bab(_fake_job()))

    # Returns (no re-raise) so BullMQ does not rerun the whole pipeline 3x; the failure is surfaced on the section.
    assert result["status"] == "error"
    assert "LLM down" in result["error"]
    error_calls = [c for c in update_section.call_args_list if c.kwargs.get("status") == "ERROR"]
    assert len(error_calls) == 1
    assert "LLM down" in error_calls[0].kwargs["error"]


def test_synthesis_output_has_think_tags_stripped_and_pedoman_is_the_sections_own_guidance():
    result, defaults = _run(_fake_job(), llm_content="<think>rencana</think>Narasi bersih.")

    assert result["status"] == "completed"
    saved = defaults["update_chapter_section"].call_args_list[-1].kwargs["content"]
    assert doc_to_text(saved) == "Narasi bersih."
    # Pedoman = section.guidance 1:1; the per-bab lookup is no longer consulted in this handler.
    defaults["get_pedoman_for_bab"].assert_not_called()
    run_kwargs = defaults["create_generation_run"].call_args.kwargs
    assert run_kwargs["pedoman_used"] == [
        {"point_title": "Kebijakan Tata Pamong", "content_text": "Bahas dasar hukum penetapan tata pamong"}
    ]


def _run_with_cross_check(existing_items, third_ainvoke, events=None, **db_overrides):
    """Like _run(), but with draftId set so a confirmed recommendation exists
    and _cross_check_recommendation_items fires (worker.py, after
    create_ragas_score) -- third_ainvoke is either a str (cross-check LLM
    content) or an Exception (simulates the LLM call itself failing)."""
    job = _fake_job()
    job.data["draftId"] = "draft-rec-1"

    third = third_ainvoke if isinstance(third_ainvoke, Exception) else MagicMock(content=third_ainvoke)
    plain_llm = MagicMock()
    plain_llm.ainvoke = AsyncMock(side_effect=[
        MagicMock(content="- Butuh dasar hukum apa?"),  # checklist
        MagicMock(content="Narasi kebijakan tata pamong."),  # synthesis
        third,  # cross-check
    ])
    plain_llm.with_retry.return_value = plain_llm
    judge_llm = MagicMock()
    judge_llm.ainvoke = AsyncMock(return_value=MagicMock(content=_FULL_JUDGE_CONTENT))
    judge_llm.with_retry.return_value = judge_llm
    if events is not None:  # record call order + prompts: (name, prompt)
        for name, llm in (("plain", plain_llm), ("judge", judge_llm)):
            def _wrap(orig, name=name):
                async def call(prompt, *a, **k):
                    events.append((name, prompt))
                    return await orig(prompt, *a, **k)
                return call
            llm.ainvoke = _wrap(llm.ainvoke)

    defaults = dict(
        get_bab_dokumen=MagicMock(return_value=_fake_bab()),
        get_chapter_section=MagicMock(return_value=_fake_section()),
        get_chapter_sections=MagicMock(return_value=[{
            **_fake_section(status="GENERATED"),
            "content": text_to_doc("Narasi kebijakan tata pamong."),
        }]),
        get_pedoman_for_bab=MagicMock(return_value=[]),
        get_rubrik_for_bab=MagicMock(return_value=[]),
        get_confirmed_recommendation=MagicMock(return_value={"id": "rec-1", "selected_evidence_ids": []}),
        get_recommendation_items=MagicMock(return_value=existing_items),
        update_recommendation_item_status=MagicMock(),
        insert_recommendation_items=MagicMock(),
        get_evidence_citation_labels=MagicMock(return_value={}),
        get_user_nama=MagicMock(return_value="Budi"),
        create_bab_draft=MagicMock(return_value={"id": "draft-1", "version": 1}),
        link_evidence_to_chapter_and_draft=MagicMock(),
        update_bab_dokumen_aktif=MagicMock(),
        create_generation_run=(run := MagicMock(return_value={"id": "run-1"})),
        create_ragas_score=MagicMock(return_value={"id": "score-1"}),
        create_section_draft_ai=MagicMock(return_value={"id": "sd-1", "version": 1}),
        clear_section_chat=MagicMock(),
        # Only this section has been generated: its latest judge is the one just saved.
        get_latest_section_judges=MagicMock(side_effect=lambda *_: [run.call_args.kwargs["judge_result"]]),
        update_chapter_section=MagicMock(),
    )
    defaults.update(db_overrides)

    from worker import _handle_generasi_bab

    with contextlib.ExitStack() as stack:
        # Tes-tes ini menguji jalur LLM-judge (dijalankan di dalam handler); jalur RAGAS susulan
        # punya tes sendiri di bagian bawah berkas.
        stack.enter_context(patch.dict("os.environ", {"WRITING_EVAL_ENGINE": "llm"}))
        stack.enter_context(patch("llm.chat_model.build_plain_llm", return_value=plain_llm))
        stack.enter_context(patch("llm.chat_model.build_judge_llm", return_value=judge_llm))
        stack.enter_context(patch("vectorstore.pgvector_store.search_led", return_value=[]))
        stack.enter_context(patch("vectorstore.pgvector_evidence_store.search_evidence", return_value=[]))
        for name, fn in defaults.items():
            stack.enter_context(patch(f"db.generation_client.{name}", fn))
        result = asyncio.run(_handle_generasi_bab(job))

    return result, defaults


def test_cross_check_runs_before_the_judge_on_the_unsaved_section_text():
    """Dimas order: synthesize -> cross-check -> judge -> save. The section is still PENDING in the DB at
    cross-check time, so its fresh narrative must be overlaid into the compiled chapter text."""
    events: list = []
    existing = [{"id": "item-1", "label": "SK Rektor A", "reason": None, "order": 0, "status": "DIREKOMENDASIKAN"}]
    result, defaults = _run_with_cross_check(
        existing, '{"items": []}', events=events,
        get_chapter_sections=MagicMock(return_value=[_fake_section(status="PENDING")]),
    )
    assert result["status"] == "completed"
    assert [name for name, _ in events] == ["plain", "plain", "plain", "judge"]  # checklist, synthesis, cross-check, judge
    assert "Narasi kebijakan tata pamong." in events[2][1]
    saved = defaults["update_chapter_section"].call_args_list[-1].kwargs
    assert saved["status"] == "GENERATED"


def test_cross_check_marks_matched_item_digunakan():
    existing = [{"id": "item-1", "label": "SK Rektor A", "reason": None, "order": 0, "status": "DIREKOMENDASIKAN"}]
    result, defaults = _run_with_cross_check(
        existing, '{"items": [{"label": "SK Rektor A", "status": 1}]}',
    )
    assert result["status"] == "completed"
    defaults["update_recommendation_item_status"].assert_called_once_with("tenant-1", "item-1", "DIGUNAKAN")
    defaults["insert_recommendation_items"].assert_not_called()


def test_cross_check_tolerates_string_statuses():
    existing = [{"id": "item-1", "label": "SK Rektor A", "reason": None, "order": 0, "status": "DIREKOMENDASIKAN"}]
    _, defaults = _run_with_cross_check(existing, '{"items": [{"label": "SK Rektor A", "status": "1"}]}')
    defaults["update_recommendation_item_status"].assert_called_once_with("tenant-1", "item-1", "DIGUNAKAN")


def test_cross_check_never_reverts_a_final_status():
    """DIGUNAKAN/TIDAK_DIPERLUKAN are final (dimas's SYSTEM_CROSS_CHECK rule
    1/2) -- a proposal to change an already-final item must be ignored."""
    existing = [{"id": "item-1", "label": "SK Rektor A", "reason": None, "order": 0, "status": "DIGUNAKAN"}]
    result, defaults = _run_with_cross_check(
        existing, '{"items": [{"label": "SK Rektor A", "status": 2}]}',
    )
    assert result["status"] == "completed"
    defaults["update_recommendation_item_status"].assert_not_called()


def test_cross_check_inserts_newly_discovered_item_after_existing_order():
    existing = [{"id": "item-1", "label": "SK Rektor A", "reason": None, "order": 0, "status": "DIREKOMENDASIKAN"}]
    result, defaults = _run_with_cross_check(
        existing,
        '{"items": [{"label": "SK Rektor A", "status": 0}, '
        '{"label": "Pedoman Baru", "status": 0}]}',
    )
    assert result["status"] == "completed"
    defaults["update_recommendation_item_status"].assert_not_called()
    defaults["insert_recommendation_items"].assert_called_once_with(
        "tenant-1", "rec-1", [{"label": "Pedoman Baru", "reason": None}], 1,
    )


def test_cross_check_malformed_json_is_a_no_op():
    existing = [{"id": "item-1", "label": "SK Rektor A", "reason": None, "order": 0, "status": "DIREKOMENDASIKAN"}]
    result, defaults = _run_with_cross_check(existing, "bukan json sama sekali")
    assert result["status"] == "completed"
    defaults["update_recommendation_item_status"].assert_not_called()
    defaults["insert_recommendation_items"].assert_not_called()


def test_cross_check_llm_failure_does_not_fail_the_job():
    existing = [{"id": "item-1", "label": "SK Rektor A", "reason": None, "order": 0, "status": "DIREKOMENDASIKAN"}]
    result, defaults = _run_with_cross_check(existing, RuntimeError("cross-check LLM down"))
    assert result["status"] == "completed"
    defaults["update_recommendation_item_status"].assert_not_called()
    defaults["insert_recommendation_items"].assert_not_called()


# ── issue #11: cross-check apply semantics aligned with Dimas ───────────────


def _item(id_, label, status="DIREKOMENDASIKAN", order=0):
    return {"id": id_, "label": label, "reason": None, "order": order, "status": status}


def test_cross_check_label_match_is_case_insensitive():
    _, defaults = _run_with_cross_check(
        [_item("item-1", "SK Rektor A")], '{"items": [{"label": "  sk rektor a ", "status": 1}]}'
    )
    defaults["update_recommendation_item_status"].assert_called_once_with("tenant-1", "item-1", "DIGUNAKAN")
    defaults["insert_recommendation_items"].assert_not_called()


def test_cross_check_not_needed_deletes_the_row():
    _, defaults = _run_with_cross_check(
        [_item("item-1", "SK Rektor A")], '{"items": [{"label": "SK Rektor A", "status": 2}]}',
        delete_recommendation_item=MagicMock(),
    )
    defaults["delete_recommendation_item"].assert_called_once_with("tenant-1", "item-1")
    defaults["update_recommendation_item_status"].assert_not_called()


def test_cross_check_never_deletes_a_final_item():
    _, defaults = _run_with_cross_check(
        [_item("item-1", "SK Rektor A", status="DIGUNAKAN")], '{"items": [{"label": "SK Rektor A", "status": 2}]}',
        delete_recommendation_item=MagicMock(),
    )
    defaults["delete_recommendation_item"].assert_not_called()


def test_cross_check_unknown_label_is_inserted_once_as_a_fresh_recommendation_whatever_its_status():
    _, defaults = _run_with_cross_check(
        [_item("item-1", "SK Rektor A")],
        '{"items": [{"label": "Pedoman Baru", "status": 1}, {"label": "PEDOMAN BARU", "status": 0}, '
        '{"label": "Dokumen Tak Perlu", "status": 2}]}',
    )
    defaults["insert_recommendation_items"].assert_called_once_with(
        "tenant-1", "rec-1", [{"label": "Pedoman Baru", "reason": None}], 1,
    )


def test_documents_lkps_file_is_not_retrieved_as_evidence():
    job = _fake_job()
    job.data["selectedEvidenceIds"] = ["ev-lkps", "ev-1"]
    labels = MagicMock(return_value={})
    _run(job, get_bab_dokumen=MagicMock(return_value={**_fake_bab(), "lkps_evidence_id": "ev-lkps"}),
         get_evidence_citation_labels=labels)

    assert labels.call_args.args[1] == ["ev-1"]


def test_generate_saves_an_ai_section_version_and_clears_chat():
    """dimas: every generate is a new version of the section (regenerate never loses the old narrative),
    and the section's chat history about the old text is dropped."""
    _, defaults = _run(_fake_job())
    args = defaults["create_section_draft_ai"].call_args.args
    assert args[1] == "sec-1" and doc_to_text(args[4]).strip()
    defaults["clear_section_chat"].assert_called_once_with("tenant-1", "sec-1")


def test_chapter_score_is_the_mean_over_sections():
    from worker import _mean_ragas_metrics

    a = {"faithfulness": {"nilai": 1.0, "alasan": "x"}}
    b = {"faithfulness": {"nilai": 0.5, "alasan": "y"}}
    assert _mean_ragas_metrics([a, b, {}])["faithfulness"]["nilai"] == 0.75
    assert _mean_ragas_metrics([{}]) == {}


def test_judge_to_ragas_metrics_pending_dan_context_recall_opsional():
    from worker import _judge_to_ragas_metrics

    assert _judge_to_ragas_metrics({"pending": True, "engine": "ragas"}) == {}
    tiga = {"faithfulness": 0.5, "answer_relevancy": 0.6, "context_precision": 0.7, "reasoning": {}}
    assert set(_judge_to_ragas_metrics(tiga)) == {"faithfulness", "answer_relevancy", "context_precision"}


def test_score_section_with_ragas_menolak_hasil_tidak_lengkap_dan_tidak_mengarang_angka():
    from worker import _score_section_with_ragas

    facts = [{"text": "konteks A"}]
    with patch("eval.ragas_eval.score_single_sample", return_value={"faithfulness": 0.5, "answer_relevancy": 0.6}):
        hasil = _score_section_with_ragas("judul", "narasi", facts)
    assert "error" in hasil and "faithfulness" not in hasil

    with patch("eval.ragas_eval.score_single_sample", return_value={
        "faithfulness": 0.5, "answer_relevancy": 0.6, "context_precision": 0.7,
    }):
        ok = _score_section_with_ragas("judul", "narasi", facts)
    assert ok["engine"] == "ragas" and ok["context_precision"] == 0.7

    assert "error" in _score_section_with_ragas("judul", "narasi", [])


def test_handler_ragas_tidak_menilai_otomatis_dan_menunggu_tombol():
    """Bawaan: generate TIDAK menjalankan RAGAS -- judge_result dibiarkan kosong (belum dinilai)."""
    async def tidak_boleh_dipanggil(*args):
        raise AssertionError("penilaian susulan tidak boleh dijadwalkan tanpa WRITING_EVAL_AUTO=1")

    with patch.dict("os.environ", {"_UJI_ENGINE": "ragas", "WRITING_EVAL_AUTO": "0"}), \
            patch("worker._nilai_ragas_susulan", tidak_boleh_dipanggil):
        result, mocks = _run(_fake_job())

    assert result["status"] == "completed"
    assert result["judgeResult"] is None
    assert result["ragasScores"] == {}
    assert mocks["create_generation_run"].call_args.kwargs["judge_result"] is None
    mocks["create_ragas_score"].assert_not_called()
    mocks["judge_llm"].ainvoke.assert_not_called()


def test_handler_ragas_auto_menandai_pending_dan_menjadwalkan_penilaian_susulan():
    dijadwalkan = []

    async def fake_susulan(*args):
        dijadwalkan.append(args)

    with patch.dict("os.environ", {"_UJI_ENGINE": "ragas", "WRITING_EVAL_AUTO": "1"}), \
            patch("worker._nilai_ragas_susulan", fake_susulan):
        result, mocks = _run(_fake_job())

    assert result["judgeResult"]["pending"] is True
    assert result["ragasScores"] == {}
    mocks["judge_llm"].ainvoke.assert_not_called()


def test_reference_recall_dari_pedoman_dan_checklist():
    from worker import _reference_recall

    ref = _reference_recall(
        [{"content_text": "BAB III\nC.1 Diferensiasi\n1 Latar Belakang\n\nBagian ini menjelaskan latar belakang VMTS."}],
        ["- Apa dasar penetapan visi?", "2. Siapa penetapnya"],
    )
    assert ref == "Bagian ini menjelaskan latar belakang VMTS.\nApa dasar penetapan visi?\nSiapa penetapnya."
    assert _reference_recall([], []) == ""


def test_score_section_with_ragas_context_recall_wajib_bila_ada_acuan():
    from worker import _score_section_with_ragas

    facts = [{"text": "konteks A"}]
    tiga = {"faithfulness": 0.5, "answer_relevancy": 0.6, "context_precision": 0.7}
    with patch("eval.ragas_eval.score_single_sample", return_value=tiga):
        assert "error" in _score_section_with_ragas("j", "n", facts, reference="acuan")
        assert "context_recall" not in _score_section_with_ragas("j", "n", facts)
    with patch("eval.ragas_eval.score_single_sample", return_value={**tiga, "context_recall": 0.4}):
        assert _score_section_with_ragas("j", "n", facts, reference="acuan")["context_recall"] == 0.4


def test_handle_penilaian_ragas_menulis_skor_ke_run_dan_membuat_skor_bab():
    from worker import _handle_penilaian_ragas

    job = MagicMock()
    job.data = {"babDokumenId": "bab-1", "sectionId": "sec-1", "runId": "run-1"}
    skor = {"faithfulness": 0.8, "answer_relevancy": 0.7, "context_precision": 0.6, "context_recall": 0.5,
            "reasoning": {}, "engine": "ragas"}
    update = MagicMock()
    buat_skor = MagicMock()
    section = {**_fake_section("GENERATED"), "content": text_to_doc("Narasi hasil sunting.")}
    run = {"id": "run-1", "chapter_draft_id": "draft-1", "guidelines_used": [], "checklist": [],
           "chunks_used": [{"kind": "evidence", "text": "Cuplikan."}, {"kind": "led", "text": "diabaikan"}]}
    with patch("db.generation_client.get_bab_dokumen", return_value={"tenant_id": "tenant-1"}), \
            patch("db.generation_client.get_latest_generation_run_for_section", return_value=run), \
            patch("db.generation_client.get_chapter_section", return_value=section), \
            patch("db.generation_client.update_generation_run_judge", update), \
            patch("db.generation_client.get_latest_section_judges", return_value=[skor]), \
            patch("db.generation_client.create_ragas_score", buat_skor), \
            patch("worker._score_section_with_ragas", return_value=skor) as nilai:
        hasil = asyncio.run(_handle_penilaian_ragas(job))

    assert hasil["status"] == "completed"
    # teks yang dinilai = isi section SAAT INI; chunk 'led' tidak ikut jadi konteks
    assert "Narasi hasil sunting." in nilai.call_args.args[1]
    assert nilai.call_args.args[2] == [{"kind": "evidence", "text": "Cuplikan."}]
    update.assert_called_once_with("tenant-1", "run-1", skor)
    buat_skor.assert_called_once()


def test_handle_penilaian_ragas_gagal_ditulis_sebagai_error_bukan_pending():
    from worker import _handle_penilaian_ragas

    job = MagicMock()
    job.data = {"babDokumenId": "bab-1", "sectionId": "sec-1", "runId": "run-1"}
    update = MagicMock()
    run = {"id": "run-1", "chapter_draft_id": "draft-1", "guidelines_used": [], "checklist": [], "chunks_used": []}
    with patch("db.generation_client.get_bab_dokumen", return_value={"tenant_id": "tenant-1"}), \
            patch("db.generation_client.get_latest_generation_run_for_section", return_value=run), \
            patch("db.generation_client.get_chapter_section", return_value={**_fake_section(), "content": None}), \
            patch("db.generation_client.update_generation_run_judge", update), \
            patch("db.generation_client.get_latest_section_judges", return_value=[]), \
            patch("db.generation_client.create_ragas_score", MagicMock()), \
            patch("worker._score_section_with_ragas", side_effect=RuntimeError("LLM mati")):
        hasil = asyncio.run(_handle_penilaian_ragas(job))

    assert hasil["status"] == "error"
    assert "error" in update.call_args.args[2]
