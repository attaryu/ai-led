"""Chat revise per section pakai LangChain streaming (LCEL astream)."""
import json
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from lib.db import conn
from lib.outline import get_section
from lib.retrieval import search_lkps, search_evidence
from lib.prompts import build_revise_prompt
from lib.ollama_client import get_llm_for_synthesis, disable_thinking_prompt

router = APIRouter(prefix="/sections/{section_id}/chat", tags=["chat"])


class ChatMessage(BaseModel):
    message: str
    model: str
    rerank_context: bool = True


@router.get("")
def get_history(section_id: str, model: Optional[str] = None):
    with conn() as con:
        if model:
            rows = con.execute(
                "SELECT * FROM chat_messages WHERE section_id=? AND model=? "
                "ORDER BY created_at ASC", (section_id, model)).fetchall()
        else:
            rows = con.execute(
                "SELECT * FROM chat_messages WHERE section_id=? "
                "ORDER BY created_at ASC", (section_id,)).fetchall()
    return [dict(r) for r in rows]


@router.post("")
def chat_stream(section_id: str, msg: ChatMessage):
    """SSE streaming: user message → LangChain chain.stream() → token-by-token."""
    section = get_section(section_id)
    if not section:
        raise HTTPException(404, f"Section {section_id} not found")

    with conn() as con:
        row = con.execute(
            "SELECT draft_text FROM drafts WHERE section_id=? AND model=?",
            (section_id, msg.model)).fetchone()
        if not row:
            raise HTTPException(404,
                f"Draft belum ada utk section {section_id}, model {msg.model}")
        current_draft = row["draft_text"]

        hist_rows = con.execute(
            "SELECT role, message FROM chat_messages "
            "WHERE section_id=? AND model=? ORDER BY created_at ASC",
            (section_id, msg.model)).fetchall()
        history = [dict(r) for r in hist_rows]

        # Simpan user message
        con.execute(
            "INSERT INTO chat_messages (section_id, model, role, message) "
            "VALUES (?,?,?,?)",
            (section_id, msg.model, "user", msg.message))

    # Re-retrieve context (LKPS + Evidence) berdasarkan user message
    new_ctx: List[dict] = []
    if msg.rerank_context:
        query = f"{section['title']}. {msg.message}"
        try:
            lkps = search_lkps(query, k=3)
            for c in lkps:
                c["_source_kind"] = "lkps"
            ev = search_evidence(query, k=3)
            for c in ev:
                c["_source_kind"] = "evidence"
            new_ctx = lkps + ev
        except Exception:
            new_ctx = []

    prompt_text = build_revise_prompt(
        section["title"], current_draft, msg.message, new_ctx, history,
    )
    prompt_text = disable_thinking_prompt(prompt_text, msg.model)

    llm = get_llm_for_synthesis(msg.model)

    def event_gen():
        full = []
        try:
            # LangChain LLM.stream() yields chunk strings
            for chunk in llm.stream(prompt_text):
                full.append(chunk)
                yield f"data: {json.dumps({'token': chunk})}\n\n"
        finally:
            response_text = "".join(full).strip()
            if response_text:
                with conn() as con:
                    con.execute(
                        "INSERT INTO chat_messages (section_id, model, role, message) "
                        "VALUES (?,?,?,?)",
                        (section_id, msg.model, "assistant", response_text))
                    con.execute(
                        "UPDATE drafts SET draft_text=?, updated_at=CURRENT_TIMESTAMP "
                        "WHERE section_id=? AND model=?",
                        (response_text, section_id, msg.model))
            yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")
