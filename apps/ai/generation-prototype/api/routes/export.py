"""Endpoint export semua section approved jadi 1 .docx, discope ke 1
dokumen_led eksplisit dari path URL (lihat routes/sections.py).
Query langsung ke bab_dokumen, urutan ORDER BY urutan_bab -- kolom itu sudah
merepresentasikan urutan outline yang benar (diisi persis dari urutan
lib.outline.get_sections() saat seeding), jadi tidak perlu lagi
join manual ke outline.py utk urutan tampil."""
import io
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from docx import Document

from lib.auth import require_led_access
from lib.db import conn
from lib.context import get_dokumen_led

router = APIRouter(prefix="/led-documents/{dokumen_id}/export", tags=["export"])


def _require_dokumen(dokumen_id: str) -> dict:
    doc = get_dokumen_led(dokumen_id)
    if not doc:
        raise HTTPException(404, "Dokumen LED tidak ditemukan")
    return doc


@router.get("")
def export_docx(dokumen_id: str,
                model: str = Query(..., description="Model whose drafts to export"),
                only_approved: bool = Query(True),
                _user=Depends(require_led_access)):
    """Assemble drafts sesuai urutan_bab -> .docx download."""
    doc_led = _require_dokumen(dokumen_id)
    with conn() as con:
        if only_approved:
            rows = con.execute(
                """SELECT urutan_bab, judul_bab, konten_kerja FROM bab_dokumen
                   WHERE dokumen_id=%s AND model=%s AND status='approved'
                   ORDER BY urutan_bab""",
                (dokumen_id, model)).fetchall()
        else:
            rows = con.execute(
                """SELECT urutan_bab, judul_bab, konten_kerja FROM bab_dokumen
                   WHERE dokumen_id=%s AND model=%s
                   ORDER BY urutan_bab""",
                (dokumen_id, model)).fetchall()

    if not rows:
        raise HTTPException(404, "Belum ada draft untuk diekspor")

    doc = Document()
    doc.add_heading(doc_led["judul"], level=0)
    doc.add_paragraph(f"Tahun akademik: {doc_led['tahun_akademik']} · Generated via: {model}")

    for r in rows:
        draft_text = (r["konten_kerja"] or {}).get("draft_text", "")
        if not draft_text:
            continue
        doc.add_heading(r["judul_bab"], level=1)
        for para in draft_text.split("\n\n"):
            para = para.strip()
            if para:
                doc.add_paragraph(para)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)

    safe_judul = "".join(c if c.isalnum() else "_" for c in doc_led["judul"])[:60]
    fname = f"LED_{safe_judul}_{model.replace(':','_').replace('/','_')}.docx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
