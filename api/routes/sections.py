"""Endpoint utk outline + draft per section."""
import json
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from lib.db import conn
from lib.outline import get_sections, get_section
from lib.generator import generate_section

router = APIRouter(prefix="/sections", tags=["sections"])


class GenerateRequest(BaseModel):
    model: str
    overwrite: bool = False


class UpdateDraftRequest(BaseModel):
    draft_text: str
    model: str


class ApproveRequest(BaseModel):
    model: str


@router.get("")
def list_sections(model: Optional[str] = None):
    """List outline + status (per model jika diberikan)."""
    sections = get_sections()
    with conn() as con:
        if model:
            rows = con.execute(
                "SELECT section_id, model, status, length(draft_text) AS draft_len "
                "FROM drafts WHERE model=?", (model,)
            ).fetchall()
        else:
            rows = con.execute(
                "SELECT section_id, model, status, length(draft_text) AS draft_len "
                "FROM drafts"
            ).fetchall()
    by_id = {}
    for r in rows:
        d = dict(r)
        by_id.setdefault(d["section_id"], []).append(d)

    out = []
    for s in sections:
        out.append({
            "id":         s["id"],
            "title":      s["title"],
            "full_title": s.get("full_title", s["title"]),
            "marker":     s.get("marker", ""),
            "level":      s.get("level", ""),
            "depth":      s.get("depth", 0),
            "page":       s.get("page", 0),
            "parent_id":  s.get("parent_id"),
            "breadcrumb": s.get("breadcrumb", []),
            "drafts":     by_id.get(s["id"], []),
        })
    return out


@router.get("/{section_id}")
def get_section_detail(section_id: str, model: Optional[str] = None):
    """Detail 1 section (semua model atau filter model)."""
    section = get_section(section_id)
    if not section:
        raise HTTPException(404, f"Section {section_id} not found")
    with conn() as con:
        if model:
            rows = con.execute(
                "SELECT * FROM drafts WHERE section_id=? AND model=?",
                (section_id, model)).fetchall()
        else:
            rows = con.execute(
                "SELECT * FROM drafts WHERE section_id=?", (section_id,)
            ).fetchall()
    drafts = []
    for r in rows:
        d = dict(r)
        for fld in ("pedoman_used", "rubric_used", "checklist",
                    "chunks_used", "judge_result"):
            if d.get(fld):
                try:
                    d[fld] = json.loads(d[fld])
                except Exception:
                    pass
        drafts.append(d)
    return {"id": section["id"], "title": section["title"], "drafts": drafts}


@router.post("/{section_id}/generate")
def generate(section_id: str, req: GenerateRequest):
    """Trigger generate 1 section (idempotent unless overwrite=true)."""
    import traceback
    try:
        result = generate_section(section_id, req.model, overwrite=req.overwrite)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        # Log traceback ke stderr supaya keliatan di docker logs
        print(f"\n=== GENERATE ERROR section={section_id} model={req.model} ===")
        traceback.print_exc()
        print("=== END ERROR ===\n", flush=True)
        raise HTTPException(500, f"Generate error: {type(e).__name__}: {e}")
    return result


@router.put("/{section_id}/draft")
def update_draft(section_id: str, req: UpdateDraftRequest):
    """User edit manual draft."""
    with conn() as con:
        cur = con.execute(
            "UPDATE drafts SET draft_text=?, updated_at=CURRENT_TIMESTAMP "
            "WHERE section_id=? AND model=?",
            (req.draft_text, section_id, req.model))
        if cur.rowcount == 0:
            raise HTTPException(404, "Draft not found")
    return {"status": "ok"}


@router.delete("/{section_id}")
def delete_section_draft(section_id: str, model: Optional[str] = None):
    """Hapus draft section. Kalau model None, hapus semua model utk section ini."""
    with conn() as con:
        if model:
            n_drafts = con.execute(
                "DELETE FROM drafts WHERE section_id=? AND model=?",
                (section_id, model)).rowcount
            n_chat = con.execute(
                "DELETE FROM chat_messages WHERE section_id=? AND model=?",
                (section_id, model)).rowcount
        else:
            n_drafts = con.execute(
                "DELETE FROM drafts WHERE section_id=?", (section_id,)).rowcount
            n_chat = con.execute(
                "DELETE FROM chat_messages WHERE section_id=?", (section_id,)).rowcount
    return {"status": "ok", "drafts_deleted": n_drafts, "chats_deleted": n_chat}


@router.delete("")
def delete_all_drafts(model: Optional[str] = None):
    """Hapus SEMUA drafts (filter per model kalau diberikan)."""
    with conn() as con:
        if model:
            n_drafts = con.execute(
                "DELETE FROM drafts WHERE model=?", (model,)).rowcount
            n_chat = con.execute(
                "DELETE FROM chat_messages WHERE model=?", (model,)).rowcount
        else:
            n_drafts = con.execute("DELETE FROM drafts").rowcount
            n_chat = con.execute("DELETE FROM chat_messages").rowcount
    return {"status": "ok", "drafts_deleted": n_drafts, "chats_deleted": n_chat}


@router.post("/{section_id}/approve")
def approve(section_id: str, req: ApproveRequest):
    with conn() as con:
        cur = con.execute(
            "UPDATE drafts SET status='approved', updated_at=CURRENT_TIMESTAMP "
            "WHERE section_id=? AND model=?",
            (section_id, req.model))
        if cur.rowcount == 0:
            raise HTTPException(404, "Draft not found")
    return {"status": "approved"}
