"""api/routes/chat.py -- section-scoped (dimas parity): reply overwrites
ChapterSection.content in place, no new SectionDraft version per turn.
Postgres/LLM/vectorstore all mocked.
"""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

import pytest

from prose import text_to_doc


def _fake_section():
    return {
        "id": "sec-1",
        "chapter_id": "bab-1",
        "section_title": "Kebijakan Tata Pamong",
        "content": {"markdown": "Isi lama."},
        "document_id": "doc-1",
        "chapter_title": "Tata Pamong",
        "tenant_id": "tenant-1",
    }


async def _collect(agen):
    return [item async for item in agen]


def test_chat_overwrites_section_content_with_full_reply_on_completion():
    from api.routes import chat as chat_route

    plain_llm = MagicMock()

    async def fake_astream(_prompt):
        for token in ["Halo, ", "ini revisi."]:
            yield MagicMock(content=token)

    plain_llm.astream = fake_astream

    with (
        patch.object(chat_route, "get_section_for_chat", return_value=_fake_section()),
        patch.object(chat_route, "get_chat_history", return_value=[]),
        patch.object(chat_route, "save_chat_message") as save_msg,
        patch.object(chat_route, "update_section_content") as update_content,
        patch.object(chat_route, "build_plain_llm", return_value=plain_llm),
        patch.object(chat_route, "_retrieve_revise_context", return_value=[]),
    ):
        async def _run():
            response = await chat_route.chat(
                "sec-1", chat_route.ChatRequest(message="Tolong revisi", user_id="user-1")
            )
            await _collect(response.body_iterator)

        asyncio.run(_run())

    save_msg.assert_any_call("tenant-1", "sec-1", "user-1", "USER", "Tolong revisi")
    save_msg.assert_any_call("tenant-1", "sec-1", "user-1", "ASSISTANT", "Halo, ini revisi.")
    update_content.assert_called_once_with("tenant-1", "sec-1", text_to_doc("Halo, ini revisi."))


def test_chat_404s_on_unknown_section():
    from fastapi import HTTPException
    from api.routes import chat as chat_route

    with patch.object(chat_route, "get_section_for_chat", return_value=None):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(chat_route.chat("missing", chat_route.ChatRequest(message="x", user_id="u")))
    assert exc.value.status_code == 404


def test_revise_prompt_and_retrieval_follow_dimas():
    """dimas build_revise_prompt layout + query "{title}. {message}" -> LKPS k=3 + evidence k=3 (prodi-scoped)."""
    from api.routes import chat as chat_route

    prompt = chat_route._build_chat_prompt(
        "Kebijakan", "Draft lama.", "Perbaiki", [{"name": "SK Rektor", "text": "Isi SK"}],
        [{"role": "USER", "message": "hai"}],
    )
    assert prompt.startswith(chat_route.SYSTEM_REVISE)
    assert "## SECTION: Kebijakan" in prompt and "## DRAFT SAAT INI:\nDraft lama." in prompt
    assert "[FILE: SK Rektor]\nIsi SK" in prompt and "USER: hai" in prompt
    assert prompt.endswith("Tulis ulang DRAFT BARU UTUH sekarang:")

    section = {**_fake_section(), "study_program_id": "p1", "lkps_evidence_id": "ev-lkps"}
    with (
        patch.object(chat_route, "has_lkps_index", return_value=True),
        patch.object(chat_route, "search_lkps", return_value=[{"chunk_id": "4a", "text": "LKPS 4a"}]) as lkps,
        patch.object(chat_route, "get_prodi_evidence_ids", return_value=["ev-1", "ev-lkps"]),
        patch.object(chat_route, "search_evidence",
                     return_value=[{"chunk_id": "c", "bukti_dukung_id": "ev-1", "text": "E"}]) as ev,
        patch.object(chat_route, "get_evidence_citation_labels", return_value={"ev-1": "SK Rektor"}),
    ):
        ctx = chat_route._retrieve_revise_context(section, "Perbaiki")

    assert lkps.call_args.args[0] == "Kebijakan Tata Pamong. Perbaiki"
    assert ev.call_args.args[2] == ["ev-1"]  # the document's own LKPS file is not evidence
    assert ctx == [{"name": "4a", "text": "LKPS 4a"}, {"name": "SK Rektor", "text": "E"}]
