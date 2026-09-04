"""Chat revision endpoint for a bab's active content.

POST /chat/{bab_id}
    Streams the LLM's reply token-by-token as SSE, given a user message.
    Saves the user message before streaming starts, the assistant's full
    reply after the stream completes — same ordering as the shape this was
    adapted from (generation-prototype/api/routes/chat.py), against the
    real schema (chat_messages, scoped to bab_dokumen_id) instead of the
    prototype's own separate one.

GET /chat/{bab_id}/history
    Message history for the chat panel to load on open.

tenant_id/access is trusted from the caller — apps/ai has no auth of its
own, NestJS's proxy route (POST bab/:id/chat) is the real gatekeeper. See
integration-plan.md.
"""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from db.generation_client import get_bab_dokumen, get_chat_history, save_chat_message
from llm.chat_model import build_plain_llm
from vectorstore.pgvector_store import search_led

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


@router.get("/{bab_id}/history", response_model=list[ChatHistoryItem])
async def get_history(bab_id: str) -> list[ChatHistoryItem]:
    bab = get_bab_dokumen(bab_id)
    if bab is None:
        raise HTTPException(status_code=404, detail="Bab tidak ditemukan")
    return [
        ChatHistoryItem(id=r["id"], user_id=r["user_id"], role=r["role"], message=r["message"])
        for r in get_chat_history(bab["tenant_id"], bab_id)
    ]


def _build_chat_prompt(judul_bab: str, konten_kerja: dict, evidence: list[dict], message: str) -> str:
    markdown_konten = konten_kerja.get("markdown", "") if isinstance(konten_kerja, dict) else ""
    evidence_text = "\n\n".join(c["text"][:500] for c in evidence) or "(tidak ada bukti tambahan ditemukan)"

    return f"""Anda membantu merevisi Bab "{judul_bab}" dari sebuah Laporan Evaluasi Diri (LED).

ISI BAB SAAT INI:
{markdown_konten[:3000] or "(bab ini belum punya konten)"}

BUKTI TAMBAHAN DARI DOKUMEN LED:
{evidence_text}

PERMINTAAN REVISI DARI USER:
{message}

Jawab dengan jelas dan ringkas dalam Bahasa Indonesia."""


@router.post("/{bab_id}")
async def chat(bab_id: str, body: ChatRequest):
    bab = get_bab_dokumen(bab_id)
    if bab is None:
        raise HTTPException(status_code=404, detail="Bab tidak ditemukan")

    save_chat_message(bab["tenant_id"], bab_id, body.user_id, "USER", body.message)

    async def stream():
        # Synchronous (psycopg2 + blocking encode) — off the event loop so it
        # doesn't stall concurrent SSE streams.
        evidence = await asyncio.to_thread(search_led, body.message, bab["tenant_id"], bab["document_id"], n_results=3)
        prompt = _build_chat_prompt(bab["chapter_title"], bab.get("working_content") or {}, evidence, body.message)

        llm = build_plain_llm()
        full_reply = ""
        try:
            async for chunk in llm.astream(prompt):
                token = chunk.content
                if not token:
                    continue
                full_reply += token
                yield f"data: {json.dumps({'token': token})}\n\n"
        except Exception as exc:
            logger.exception("Chat stream gagal untuk bab %s", bab_id)
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
        finally:
            if full_reply:
                save_chat_message(bab["tenant_id"], bab_id, body.user_id, "ASSISTANT", full_reply)
            yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
