"""Integration-style tests for worker.py::_handle_rekomendasi_dokumen --
document picks now come from document_catalog.DOCUMENT_CATALOG (closed
set), not a per-tenant registry search (port of Dimas's 332ab2f). All
Postgres/LLM dependencies are mocked; no Redis/Postgres needed.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from unittest.mock import AsyncMock, MagicMock, patch

from document_catalog import DOCUMENT_CATALOG


def _fake_job(bab_id="bab-1", user_id="user-1", draft_id=None):
    job = MagicMock()
    job.data = {"babDokumenId": bab_id, "createdByUserId": user_id}
    if draft_id:
        job.data["draftId"] = draft_id
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


def _run_with_llm(job, llm, **db_overrides):
    """Run _handle_rekomendasi_dokumen with build_plain_llm() and the usual
    db.generation_client dependencies mocked. Returns (result, create_document_recommendation mock)."""
    defaults = dict(
        get_bab_dokumen=MagicMock(return_value=_fake_bab()),
        get_pedoman_for_bab=MagicMock(return_value=[{"point_code": "P1", "content_text": "Pedoman contoh."}]),
        get_rubrik_for_bab=MagicMock(return_value=[]),
        get_chapter_sections=MagicMock(return_value=[]),
        get_user_nama=MagicMock(return_value="Budi"),
        create_bab_draft=MagicMock(return_value={"id": "draft-1"}),
        get_bab_draft=MagicMock(return_value=None),
        set_bab_dokumen_checkpoint_aktif=MagicMock(),
        create_document_recommendation=MagicMock(return_value={"id": "rec-1", "created_at": "now"}),
    )
    defaults.update(db_overrides)

    from worker import _handle_rekomendasi_dokumen

    with contextlib.ExitStack() as stack:
        stack.enter_context(patch("llm.chat_model.build_plain_llm", return_value=llm))
        for name, fn in defaults.items():
            stack.enter_context(patch(f"db.generation_client.{name}", fn))
        result = asyncio.run(_handle_rekomendasi_dokumen(job))

    return result, defaults["create_document_recommendation"]


def _llm_returning(*contents):
    """build_plain_llm() replacement whose .ainvoke() yields each content in
    turn on successive calls (retry attempts / the fallback call)."""
    llm = MagicMock()
    responses = [MagicMock(content=c) for c in contents]
    llm.ainvoke = AsyncMock(side_effect=responses)
    return llm


def test_accepts_valid_catalog_pick_first_try():
    from document_catalog_kategori import catalog_by_category

    # Label yang ditawarkan ke LLM = label kanonik katalog berkategori; yang diterima disimpan apa adanya.
    label = next(iter(catalog_by_category().values()))[0]
    ok_json = json.dumps({
        "lkps_sufficient": None,
        "lkps_evidence_query": [],
        "recommendation_text": "Perlu SK penetapan visi misi.",
        "items": [{"no": 4, "label": label, "reason": "Mendukung penetapan visi misi."}],
    })
    result, create_rec = _run_with_llm(_fake_job(), _llm_returning(ok_json))

    assert result["status"] == "completed"
    assert result["itemCount"] == 1
    _, kwargs = create_rec.call_args
    assert kwargs["items"] == [{"label": label, "reason": "Mendukung penetapan visi misi."}]
    assert kwargs["candidate_folders"] == [{"label": label}]
    assert kwargs["document_query"] == []


def test_retries_up_to_3x_on_json_parse_failure_then_succeeds():
    label = DOCUMENT_CATALOG[0]
    bad = "maaf, saya tidak bisa membantu dalam bahasa Inggris bebas"
    ok_json = json.dumps({
        "lkps_sufficient": None, "lkps_evidence_query": [], "recommendation_text": "ok",
        "items": [{"no": 1, "label": label, "reason": "cocok"}],
    })
    llm = _llm_returning(bad, bad, ok_json)
    result, _ = _run_with_llm(_fake_job(), llm)

    assert result["status"] == "completed"
    assert llm.ainvoke.call_count == 3
    assert result["itemCount"] == 1


def test_gives_up_after_3_failed_parse_attempts():
    bad = "narasi bebas tanpa JSON"
    llm = _llm_returning(bad, bad, bad)
    result, create_rec = _run_with_llm(_fake_job(), llm)

    assert result["status"] == "completed"
    assert result["itemCount"] == 0
    _, kwargs = create_rec.call_args
    assert "Rekomendasikan Ulang" in kwargs["recommendation_text"]


def test_falls_back_to_custom_suggestion_when_catalog_yields_nothing():
    """Port of Dimas's 332ab2f: a successfully-parsed but empty catalog
    result means the LLM searched the whole closed set and found nothing --
    it gets one more chance to propose a document outside the catalog."""
    empty_catalog_json = json.dumps({
        "lkps_sufficient": None, "lkps_evidence_query": [], "recommendation_text": "", "items": [],
    })
    custom_json = json.dumps({
        "items": [{"label": "Dokumen Khusus PENS", "reason": "Tidak ada padanan di katalog standar."}],
    })
    llm = _llm_returning(empty_catalog_json, empty_catalog_json, empty_catalog_json, custom_json)
    result, create_rec = _run_with_llm(_fake_job(), llm)

    assert result["status"] == "completed"
    assert result["itemCount"] == 1
    assert llm.ainvoke.call_count == 4  # 3 assess attempts (empty is retried), then the custom fallback
    _, kwargs = create_rec.call_args
    assert kwargs["items"] == [{"label": "Dokumen Khusus PENS", "reason": "Tidak ada padanan di katalog standar."}]
    assert kwargs["candidate_folders"] == [
        {"custom": True, "label": "Dokumen Khusus PENS", "reason": "Tidak ada padanan di katalog standar."}
    ]


def test_needs_lkps_aggregates_across_bab_sections_and_looks_up_by_sheet():
    """Port of Dimas 140d8ae: REKOMENDASI_DOKUMEN runs at the whole-bab
    level (before a user drills into one section), so needs_lkps/lkps_list
    must be an aggregate across ChapterSection rows -- any section needing
    LKPS makes the whole bab "need" it, union of every lkps_list gets
    looked up directly (no RAG) via lookup_lkps_by_sheets."""
    label = DOCUMENT_CATALOG[0]
    ok_json = json.dumps({
        "lkps_sufficient": None, "lkps_evidence_query": [], "recommendation_text": "ok",
        "items": [{"no": 1, "label": label, "reason": "cocok"}],
    })
    sections = [
        {"lkps_needed": True, "lkps_list": ["4a"]},
        {"lkps_needed": False, "lkps_list": []},
        {"lkps_needed": True, "lkps_list": ["4a", "6b"]},
    ]
    with patch("vectorstore.pgvector_lkps_store.lookup_lkps_by_sheets", return_value=[
        {"chunk_id": "4a", "sheet": "4a", "text": "data sheet 4a"},
    ]) as mock_lookup:
        result, _ = _run_with_llm(
            _fake_job(), _llm_returning(ok_json), get_chapter_sections=MagicMock(return_value=sections),
        )

    assert result["status"] == "completed"
    mock_lookup.assert_called_once_with("tenant-1", "lkps-1", ["4a", "6b"])


def test_rejects_item_with_mismatched_no_and_label_then_falls_back():
    label = DOCUMENT_CATALOG[0]
    mismatched_json = json.dumps({
        "lkps_sufficient": None, "lkps_evidence_query": [], "recommendation_text": "",
        "items": [{"no": 1, "label": "Label karangan model, bukan dari katalog"}],
    })
    custom_json = json.dumps({"items": []})
    llm = _llm_returning(mismatched_json, custom_json)
    result, _ = _run_with_llm(_fake_job(), llm)

    assert result["itemCount"] == 0
    assert label not in str(result)


# ── issue #11: behaviour aligned with Dimas ─────────────────────────────────


def _empty_json():
    return json.dumps({"recommendation_text": "", "items": []})


def test_new_draft_moves_only_the_active_checkpoint_pointer_never_blanks_content():
    llm = _llm_returning(json.dumps({"recommendation_text": "ok", "items": [{"no": 1, "label": DOCUMENT_CATALOG[0]}]}))
    set_pointer, wipe = MagicMock(), MagicMock()
    result, _ = _run_with_llm(
        _fake_job(), llm, set_bab_dokumen_checkpoint_aktif=set_pointer, update_bab_dokumen_aktif=wipe
    )
    assert result["status"] == "completed"
    set_pointer.assert_called_once_with("tenant-1", "bab-1", "draft-1")
    wipe.assert_not_called()  # update_bab_dokumen_aktif would overwrite working_content with {}


def test_reuse_draft_must_be_an_empty_draft_of_this_chapter():
    from prose import text_to_doc

    llm = _llm_returning(_empty_json())
    for draft, expected in (
        (None, "tidak ditemukan"),
        ({"id": "d1", "chapter_id": "bab-lain", "content_snapshot": {}}, "tidak ditemukan"),
        ({"id": "d1", "chapter_id": "bab-1", "content_snapshot": text_to_doc("Sudah ada narasi.")}, "sudah berisi narasi"),
    ):
        result, create_rec = _run_with_llm(
            _fake_job(draft_id="d1"), llm, get_bab_draft=MagicMock(return_value=draft)
        )
        assert result["status"] == "error" and expected in result["error"]
        create_rec.assert_not_called()


def test_reuse_of_an_empty_draft_is_accepted_without_creating_another():
    llm = _llm_returning(json.dumps({"recommendation_text": "ok", "items": [{"no": 1, "label": DOCUMENT_CATALOG[0]}]}))
    create_draft = MagicMock()
    result, create_rec = _run_with_llm(
        _fake_job(draft_id="d1"), llm,
        get_bab_draft=MagicMock(return_value={"id": "d1", "chapter_id": "bab-1", "content_snapshot": {}}),
        create_bab_draft=create_draft,
    )
    assert result["status"] == "completed" and result["babDraftId"] == "d1"
    create_draft.assert_not_called()


def test_custom_fallback_is_skipped_when_items_were_returned_but_all_rejected():
    bad = json.dumps({"recommendation_text": "", "items": [{"no": 999, "label": "karangan"}]})
    llm = _llm_returning(bad)
    result, create_rec = _run_with_llm(_fake_job(), llm)
    assert result["itemCount"] == 0
    assert llm.ainvoke.call_count == 1  # no custom-suggestion call: this is a format failure, not "nothing needed"


def test_no_document_needed_has_its_own_text_not_the_retry_hint():
    llm = _llm_returning(_empty_json(), _empty_json(), _empty_json(), json.dumps({"items": []}))
    result, create_rec = _run_with_llm(_fake_job(), llm)
    text = create_rec.call_args.kwargs["recommendation_text"]
    assert "Tidak ada dokumen pendukung yang diperlukan" in text
    assert "Rekomendasikan Ulang" not in text


def test_custom_fallback_survives_a_non_object_json_answer():
    llm = _llm_returning(_empty_json(), _empty_json(), _empty_json(), '["bukan", "object"]')
    result, _ = _run_with_llm(_fake_job(), llm)
    assert result["status"] == "completed" and result["itemCount"] == 0


def test_per_section_uses_only_that_sections_pedoman_and_active_checkpoint():
    """dimas recommend_documents(dokumen_id, section_id): pedoman/title/LKPS from that one section;
    dev-v1 hangs it on the chapter's active checkpoint instead of a new chapter version."""
    label = DOCUMENT_CATALOG[0]
    ok_json = json.dumps({"recommendation_text": "ok", "items": [{"no": 1, "label": label, "reason": "r"}]})
    llm = _llm_returning(ok_json)
    job = _fake_job()
    job.data["sectionId"] = "sec-2"
    section = {
        "id": "sec-2", "chapter_id": "bab-1", "title": "Visi Misi",
        "guidance": "BAB II KRITERIA\nC.1 Visi Misi\n\nJelaskan visi misi.", "lkps_needed": False, "lkps_list": [],
    }
    create_draft = MagicMock()
    result, create_rec = _run_with_llm(
        job, llm,
        get_bab_dokumen=MagicMock(return_value={**_fake_bab(), "checkpoint_aktif_id": "draft-aktif"}),
        get_chapter_section=MagicMock(return_value=section),
        get_chapter_sections=MagicMock(side_effect=AssertionError("per-section run must not read all sections")),
        create_bab_draft=create_draft,
    )

    assert result["status"] == "completed" and result["sectionId"] == "sec-2"
    create_draft.assert_not_called()
    _, kwargs = create_rec.call_args
    assert kwargs["chapter_draft_id"] == "draft-aktif"
    assert kwargs["chapter_section_id"] == "sec-2"
    assert [p["id"] for p in kwargs["pedoman_used"]] == ["sec-2"]
    prompt = llm.ainvoke.call_args[0][0]
    assert "C.1 Visi Misi" in str(prompt)
