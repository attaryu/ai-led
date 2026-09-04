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
    }


def _run_with_llm(job, llm, **db_overrides):
    """Run _handle_rekomendasi_dokumen with build_plain_llm() and the usual
    db.generation_client dependencies mocked. Returns (result, create_document_recommendation mock)."""
    defaults = dict(
        get_bab_dokumen=MagicMock(return_value=_fake_bab()),
        get_pedoman_for_bab=MagicMock(return_value=[{"point_code": "P1", "content_text": "Pedoman contoh."}]),
        get_rubrik_for_bab=MagicMock(return_value=[]),
        get_user_nama=MagicMock(return_value="Budi"),
        create_bab_draft=MagicMock(return_value={"id": "draft-1"}),
        update_bab_dokumen_aktif=MagicMock(),
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
    entry = DOCUMENT_CATALOG[3]
    ok_json = json.dumps({
        "lkps_sufficient": None,
        "lkps_evidence_query": [],
        "recommendation_text": "Perlu SK penetapan visi misi.",
        "items": [{"no": 4, "label": entry["label"], "reason": "Mendukung penetapan visi misi."}],
    })
    result, create_rec = _run_with_llm(_fake_job(), _llm_returning(ok_json))

    assert result["status"] == "completed"
    assert result["itemCount"] == 1
    _, kwargs = create_rec.call_args
    assert kwargs["items"] == [{"label": entry["label"], "reason": "Mendukung penetapan visi misi."}]
    assert kwargs["candidate_folders"] == [{"no": 4, "label": entry["label"], "tier": entry["tier"]}]
    assert kwargs["document_query"] == []


def test_retries_up_to_3x_on_json_parse_failure_then_succeeds():
    entry = DOCUMENT_CATALOG[0]
    bad = "maaf, saya tidak bisa membantu dalam bahasa Inggris bebas"
    ok_json = json.dumps({
        "lkps_sufficient": None, "lkps_evidence_query": [], "recommendation_text": "ok",
        "items": [{"no": 1, "label": entry["label"], "reason": "cocok"}],
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
    llm = _llm_returning(empty_catalog_json, custom_json)
    result, create_rec = _run_with_llm(_fake_job(), llm)

    assert result["status"] == "completed"
    assert result["itemCount"] == 1
    assert llm.ainvoke.call_count == 2
    _, kwargs = create_rec.call_args
    assert kwargs["items"] == [{"label": "Dokumen Khusus PENS", "reason": "Tidak ada padanan di katalog standar."}]
    assert kwargs["candidate_folders"] == [
        {"custom": True, "label": "Dokumen Khusus PENS", "reason": "Tidak ada padanan di katalog standar."}
    ]


def test_rejects_item_with_mismatched_no_and_label_then_falls_back():
    entry = DOCUMENT_CATALOG[0]
    mismatched_json = json.dumps({
        "lkps_sufficient": None, "lkps_evidence_query": [], "recommendation_text": "",
        "items": [{"no": 1, "label": "Label karangan model, bukan dari katalog"}],
    })
    custom_json = json.dumps({"items": []})
    llm = _llm_returning(mismatched_json, custom_json)
    result, _ = _run_with_llm(_fake_job(), llm)

    assert result["itemCount"] == 0
    assert entry["label"] not in str(result)
