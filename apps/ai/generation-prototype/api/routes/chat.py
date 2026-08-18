"""Chat revise per section pakai LangChain streaming (LCEL astream).
Riwayat chat disimpan di tabel relasional bab_chat_message (FK ke
bab_dokumen), bukan jsonb -- lihat database.md #6a BAB_CHAT_MESSAGE.
Discope ke 1 dokumen_led eksplisit dari path URL (lihat routes/sections.py)."""
import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from lib.auth import require_led_access
from lib.db import conn
from lib.context import get_dokumen_led, get_urutan_bab
from lib.outline import get_section
from lib.retrieval import search_lkps, search_evidence
from lib.prompts import build_revise_prompt
from lib.ollama_client import get_llm_for_synthesis, disable_thinking_prompt

router = APIRouter(prefix="/led-documents/{dokumen_id}/sections/{section_id}/chat", tags=["chat"])


def _require_dokumen(dokumen_id: str) -> dict:
    doc = get_dokumen_led(dokumen_id)
    if not doc:
        raise HTTPException(404, "Dokumen LED tidak ditemukan")
    return doc


class ChatMessage(BaseModel):
    message: str
    model: str
    rerank_context: bool = True


def _get_bab_row(con, dokumen_id: str, section_id: str, model: str):
    urutan_bab = get_urutan_bab(section_id)
    if urutan_bab is None:
        return None
    return con.execute(
        """SELECT id, konten_kerja FROM bab_dokumen
           WHERE dokumen_id=%s AND urutan_bab=%s AND model=%s""",
        (dokumen_id, urutan_bab, model)).fetchone()


@router.get("")
def get_history(dokumen_id: str, section_id: str, model: Optional[str] = None,
                _user=Depends(require_led_access)):
    _require_dokumen(dokumen_id)
    with conn() as con:
        if model:
            bab = _get_bab_row(con, dokumen_id, section_id, model)
            if not bab:
                return []
            rows = con.execute(
                """SELECT * FROM bab_chat_message
                   WHERE bab_id=%s ORDER BY dibuat_pada ASC""",
                (bab["id"],)).fetchall()
        else:
            urutan_bab = get_urutan_bab(section_id)
            rows = con.execute(
                """SELECT cm.* FROM bab_chat_message cm
                   JOIN bab_dokumen bd ON bd.id = cm.bab_id
                   WHERE bd.dokumen_id=%s AND bd.urutan_bab=%s
                   ORDER BY cm.dibuat_pada ASC""",
                (dokumen_id, urutan_bab)).fetchall()
    return [dict(r) for r in rows]


@router.post("")
def chat_stream(dokumen_id: str, section_id: str, msg: ChatMessage,
               _user=Depends(require_led_access)):
    """SSE streaming: user message → LangChain chain.stream() → token-by-token."""
    _require_dokumen(dokumen_id)
    section = get_section(section_id)
    if not section:
        raise HTTPException(404, f"Section {section_id} not found")

    with conn() as con:
        bab = _get_bab_row(con, dokumen_id, section_id, msg.model)
        if not bab:
            raise HTTPException(404,
                f"Draft belum ada utk section {section_id}, model {msg.model}")
        bab_id = bab["id"]
        current_draft = (bab["konten_kerja"] or {}).get("draft_text", "")

        hist_rows = con.execute(
            """SELECT role, message FROM bab_chat_message
               WHERE bab_id=%s ORDER BY dibuat_pada ASC""",
            (bab_id,)).fetchall()
        history = [dict(r) for r in hist_rows]

        # Simpan user message
        con.execute(
            "INSERT INTO bab_chat_message (bab_id, role, message) VALUES (%s, %s, %s)",
            (bab_id, "user", msg.message))

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
                        "INSERT INTO bab_chat_message (bab_id, role, message) VALUES (%s, %s, %s)",
                        (bab_id, "assistant", response_text))
                    row = con.execute(
                        "SELECT konten_kerja FROM bab_dokumen WHERE id=%s", (bab_id,)
                    ).fetchone()
                    kk = row["konten_kerja"] or {}
                    kk["draft_text"] = response_text
                    con.execute(
                        """UPDATE bab_dokumen SET konten_kerja=%s, terakhir_disimpan=now()
                           WHERE id=%s""",
                        (json.dumps(kk, ensure_ascii=False), bab_id))
            yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")
