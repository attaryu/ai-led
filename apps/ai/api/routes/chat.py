"""Chat revision endpoint for a section's content -- section-scoped, dimas
parity (bab_dokumen.chat.py): the assistant's reply is written straight back
into ChapterSection.content on stream completion, no new SectionDraft
version per turn.

POST /chat/{section_id}
    Streams the LLM's reply token-by-token as SSE, given a user message.
    Saves the user message before streaming starts, the assistant's full
    reply after the stream completes, and overwrites the section's content
    in place.

GET /chat/{section_id}/history
    Message history for the chat panel to load on open.

tenant_id/access is trusted from the caller — apps/ai has no auth of its
own, NestJS's proxy route (POST bab/:id/sections/:sectionId/chat) is the
real gatekeeper. See integration-plan.md.
"""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from db.generation_client import (
    get_chat_history,
    get_evidence_citation_labels,
    get_prodi_evidence_ids,
    get_section_for_chat,
    save_chat_message,
    update_section_content,
)
from llm.chat_model import SYNTHESIS, build_plain_llm, no_think
from prose import content_to_text, text_to_doc
from vectorstore.pgvector_evidence_store import search_evidence
from vectorstore.pgvector_lkps_store import has_lkps_index, search_lkps

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    user_id: str


class ChatHistoryItem(BaseModel):
    id: str
    user_id: str
    role: str
    message: str


@router.get("/{section_id}/history", response_model=list[ChatHistoryItem])
async def get_history(section_id: str) -> list[ChatHistoryItem]:
    section = get_section_for_chat(section_id)
    if section is None:
        raise HTTPException(status_code=404, detail="Section tidak ditemukan")
    return [
        ChatHistoryItem(id=r["id"], user_id=r["user_id"], role=r["role"], message=r["message"])
        for r in get_chat_history(section["tenant_id"], section_id)
    ]


SYSTEM_REVISE = """Anda penulis LED akreditasi. User meminta revisi draft.
Output: DRAFT BARU UTUH (bukan diff). Tetap pertahankan struktur paragraf.
Setiap klaim faktual harus tetap menyebut sumber (sumber: NAMA_FILE)."""


def _build_chat_prompt(
    section_title: str, current_draft: str, user_request: str,
    new_context: list[dict] | None = None, history: list[dict] | None = None,
) -> str:
    """Verbatim port of Dimas 140d8ae's build_revise_prompt. new_context items: {"name", "text"}."""
    parts = [SYSTEM_REVISE, ""]
    parts.append(f"## SECTION: {section_title}")
    parts.append("")
    parts.append("## DRAFT SAAT INI:")
    parts.append(current_draft)
    parts.append("")

    if new_context:
        parts.append("## KONTEKS TAMBAHAN (dari retrieval ulang):")
        for c in new_context:
            parts.append(f"\n[FILE: {c.get('name') or '?'}]\n{c.get('text') or ''}")
        parts.append("")

    if history:
        parts.append("## RIWAYAT PERCAKAPAN SEBELUMNYA:")
        for h in history[-6:]:
            parts.append(f"{h['role'].upper()}: {h['message']}")
        parts.append("")

    parts.append("## PERMINTAAN USER:")
    parts.append(user_request)
    parts.append("")
    parts.append("Tulis ulang DRAFT BARU UTUH sekarang:")
    return "\n".join(parts)


def _retrieve_revise_context(section: dict, message: str) -> list[dict]:
    """dimas chat.py: query "{title}. {message}" -> LKPS k=3 (document's LKPS only) + evidence k=3.
    Platform scope: evidence = this prodi's + tenant-wide files, minus the document's own LKPS file."""
    query = f"{section['section_title']}. {message}"
    tenant_id = section["tenant_id"]
    try:
        lkps_id = section.get("lkps_evidence_id")
        lkps = (
            search_lkps(query, tenant_id, lkps_id, n_results=3)
            if lkps_id and has_lkps_index(tenant_id, lkps_id) else []
        )
        ids = [i for i in get_prodi_evidence_ids(tenant_id, section["study_program_id"])
               if i != section.get("lkps_evidence_id")]
        ev = search_evidence(query, tenant_id, ids, 3)
        labels = get_evidence_citation_labels(tenant_id, [c["bukti_dukung_id"] for c in ev])
    except Exception:
        logger.exception("Retrieval ulang chat gagal untuk section %s", section["id"])
        return []
    return (
        [{"name": c.get("chunk_id") or c.get("sheet"), "text": c["text"]} for c in lkps]
        + [{"name": labels.get(c["bukti_dukung_id"]) or c["chunk_id"], "text": c["text"]} for c in ev]
    )


@router.post("/{section_id}")
async def chat(section_id: str, body: ChatRequest):
    section = get_section_for_chat(section_id)
    if section is None:
        raise HTTPException(status_code=404, detail="Section tidak ditemukan")

    history = get_chat_history(section["tenant_id"], section_id)
    save_chat_message(section["tenant_id"], section_id, body.user_id, "USER", body.message)

    async def stream():
        # Synchronous (psycopg2 + blocking encode) — off the event loop so it doesn't stall concurrent SSE streams.
        new_ctx = await asyncio.to_thread(_retrieve_revise_context, section, body.message)
        prompt = _build_chat_prompt(
            section["section_title"], content_to_text(section.get("content") or {}), body.message, new_ctx, history
        )

        llm = build_plain_llm(SYNTHESIS)
        full_reply = ""
        try:
            async for chunk in llm.astream(no_think(prompt)):
                token = chunk.content
                if not token:
                    continue
                full_reply += token
                yield f"data: {json.dumps({'token': token})}\n\n"
        except Exception as exc:
            logger.exception("Chat stream gagal untuk section %s", section_id)
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
        finally:
            if full_reply:
                save_chat_message(section["tenant_id"], section_id, body.user_id, "ASSISTANT", full_reply)
                update_section_content(
                    section["tenant_id"],
                    section_id,
                    text_to_doc(full_reply),
                )
            yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
