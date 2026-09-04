"""Konversi teks LLM (plain-text narasi) <-> dokumen ProseMirror/TipTap JSON.
Storage format `draft_text` sekarang SELALU dict berbentuk ProseMirror doc
node ({"type": "doc", "content": [...]}), bukan string markdown-ish lagi
(lihat scripts/migrate_prose_to_tiptap.py utk migrasi data lama).

Kontrak paragraf dari LLM (lihat prompts.py SYSTEM_GENERATE/SYSTEM_REVISE):
- Paragraf dipisah baris kosong ("\n\n").
- Newline tunggal DI DALAM 1 paragraf -> hard break (jarang muncul, tapi
  ditangani supaya tidak hilang).
- Baris yang diawali "- ", "* ", atau "N. "/"N) " dianggap bullet/ordered
  list item -- dikelompokkan jadi 1 node bulletList/orderedList berturutan.
- Sitasi "(sumber: NAMA_FILE)" TETAP inline text biasa di dalam paragraph
  node -- BUKAN node/mark khusus (single-tenant tool, tidak perlu struktur
  ekstra).
"""
import re
from typing import Any, Dict, List

_BULLET_RE = re.compile(r"^[-*•]\s+(.*)$")
_ORDERED_RE = re.compile(r"^\d+[.\)]\s+(.*)$")

EMPTY_DOC = {"type": "doc", "content": [{"type": "paragraph"}]}


def _text_node(text: str) -> Dict[str, Any]:
    return {"type": "text", "text": text}


def _paragraph_from_line(line: str) -> Dict[str, Any]:
    """1 paragraf logis (boleh multi-baris via \n internal -> hardBreak)."""
    sub_lines = line.split("\n")
    content: List[Dict[str, Any]] = []
    for i, sl in enumerate(sub_lines):
        sl = sl.rstrip()
        if i > 0:
            content.append({"type": "hardBreak"})
        if sl:
            content.append(_text_node(sl))
    if not content:
        return {"type": "paragraph"}
    return {"type": "paragraph", "content": content}


def text_to_doc(raw: str) -> Dict[str, Any]:
    """Plain-text narasi LLM -> ProseMirror doc JSON.

    Blok dipisah baris kosong (\\n\\n). Tiap blok dicek: kalau SEMUA baris
    non-kosongnya match pola bullet/ordered, jadi 1 list node; kalau
    campuran atau tidak ada yg match, jadi paragraph node biasa (multi-baris
    internal -> hardBreak, lihat _paragraph_from_line)."""
    raw = (raw or "").strip()
    if not raw:
        return {"type": "doc", "content": [{"type": "paragraph"}]}

    blocks = re.split(r"\n\s*\n", raw)
    doc_content: List[Dict[str, Any]] = []

    for block in blocks:
        block = block.strip("\n")
        if not block.strip():
            continue
        lines = [l for l in block.split("\n") if l.strip()]

        bullet_matches = [_BULLET_RE.match(l) for l in lines]
        ordered_matches = [_ORDERED_RE.match(l) for l in lines]

        if lines and all(bullet_matches):
            items = [{
                "type": "listItem",
                "content": [_paragraph_from_line(m.group(1))],
            } for m in bullet_matches]
            doc_content.append({"type": "bulletList", "content": items})
        elif lines and all(ordered_matches):
            items = [{
                "type": "listItem",
                "content": [_paragraph_from_line(m.group(1))],
            } for m in ordered_matches]
            doc_content.append({"type": "orderedList", "content": items})
        else:
            doc_content.append(_paragraph_from_line(block))

    if not doc_content:
        doc_content = [{"type": "paragraph"}]
    return {"type": "doc", "content": doc_content}


def doc_to_text(doc: Any) -> str:
    """ProseMirror doc JSON -> plain text (dipakai judge prompt truncation,
    _draft_len, preview snippet, dan SEBAGAI FALLBACK kalau doc masih string
    lama yg belum dimigrasikan -- lihat guard di bawah)."""
    if doc is None:
        return ""
    if isinstance(doc, str):
        # Guard: baris data lama yg belum sempat lewat migrasi (mis. race
        # antara deploy & migrate_prose_to_tiptap.py) -- treat as plain text
        # langsung, jangan error.
        return doc
    if not isinstance(doc, dict):
        return ""

    parts: List[str] = []

    def walk(node: Dict[str, Any]):
        ntype = node.get("type")
        if ntype == "text":
            parts.append(node.get("text", ""))
        elif ntype == "hardBreak":
            parts.append("\n")
        for child in node.get("content", []) or []:
            walk(child)
        if ntype in ("paragraph", "heading", "listItem"):
            parts.append("\n")
        if ntype in ("bulletList", "orderedList"):
            parts.append("\n")

    for node in doc.get("content", []) or []:
        walk(node)

    text = "".join(parts)
    # Collapse 3+ newlines -> 2 (paragraph boundary), trim edges.
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text


def is_empty_doc(doc: Any) -> bool:
    """True kalau doc kosong/tidak ada narasi sama sekali -- pengganti
    `not draft_text` (string check lama) di idempotency shortcut
    generate_section() dan _draft_len()."""
    return not doc_to_text(doc).strip()
