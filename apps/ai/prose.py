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
- Blok yg SELURUH ISINYA JSON valid berbentuk {"table": id, "rows": [...]}
  (lihat prompts.py SYSTEM_GENERATE aturan TABEL, hanya muncul kalau
  section punya table_spec -- lib/generator.py::_get_table_spec) -> jadi
  node "table" ProseMirror, BUKAN paragraph biasa. table_spec (kalau
  diberikan) dipakai utk urutan & nama kolom yg konsisten; tanpa itu
  (atau "table" id tidak match), fallback ke union key yg ada di rows.
"""
import json
import re
from typing import Any, Dict, List, Optional

_BULLET_RE = re.compile(r"^[-*•]\s+(.*)$")
_ORDERED_RE = re.compile(r"^\d+[.\)]\s+(.*)$")

EMPTY_DOC = {"type": "doc", "content": [{"type": "paragraph"}]}


def _table_cell(text: str, header: bool = False) -> Dict[str, Any]:
    node_type = "tableHeader" if header else "tableCell"
    content = [{"type": "text", "text": text}] if text else []
    return {"type": node_type, "content": [{"type": "paragraph", "content": content}]}


def _table_row(values: List[str], header: bool = False) -> Dict[str, Any]:
    return {"type": "tableRow", "content": [_table_cell(v, header=header) for v in values]}


def _columns_for_table(table_id: Any, rows: List[Dict], table_spec: Optional[List[Dict]]) -> List[str]:
    """Urutan kolom TERPRIORITASKAN dari table_spec (instruksi asli) yg
    id-nya cocok dgn blok JSON -- supaya kolom kosong di sebagian rows
    tetap konsisten & urut sesuai definisi user, bukan sekadar urutan key
    di JSON (dict Python memang preserve-insertion-order, tapi LLM tidak
    dijamin taat urutan). Fallback: union key yg MUNCUL di rows (order of
    first appearance) kalau table_spec kosong atau id tidak match."""
    if table_spec:
        for t in table_spec:
            if t.get("id") == table_id:
                cols = t.get("columns") or []
                if cols:
                    return cols
    seen, cols = set(), []
    for row in rows:
        if not isinstance(row, dict):
            continue
        for key in row.keys():
            if key not in seen:
                seen.add(key)
                cols.append(key)
    return cols


def _try_parse_table_block(block: str, table_spec: Optional[List[Dict]]) -> Optional[Dict[str, Any]]:
    """block -> node "table" ProseMirror kalau block adalah JSON valid
    {"table": ..., "rows": [...]}, else None (caller fallback ke paragraf
    biasa -- BUKAN error, LLM yg kebetulan nulis kalimat mengandung tanda
    kurung kurawal tidak boleh mengorupsi narasi)."""
    stripped = block.strip()
    if not (stripped.startswith("{") and stripped.endswith("}")):
        return None
    try:
        data = json.loads(stripped)
    except (ValueError, TypeError):
        return None
    if not isinstance(data, dict) or "rows" not in data:
        return None
    rows = data.get("rows")
    if not isinstance(rows, list) or not rows:
        return None

    columns = _columns_for_table(data.get("table"), rows, table_spec)
    if not columns:
        return None

    table_rows = [_table_row(columns, header=True)]
    for row in rows:
        if not isinstance(row, dict):
            continue
        values = [str(row.get(col) or "") for col in columns]
        table_rows.append(_table_row(values, header=False))

    if len(table_rows) < 2:
        return None  # header doang tanpa 1 pun baris data valid -- bukan tabel yg berguna
    return {"type": "table", "content": table_rows}


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


def text_to_doc(raw: str, table_spec: Optional[List[Dict]] = None) -> Dict[str, Any]:
    """Plain-text narasi LLM -> ProseMirror doc JSON.

    Blok dipisah baris kosong (\\n\\n). Tiap blok dicek URUTAN INI:
    1. Blok JSON valid {"table": id, "rows": [...]} -> node "table" (lihat
       _try_parse_table_block) -- HANYA muncul kalau prompt SYSTEM_GENERATE
       diberi TABLE_SCHEMA (section punya table_spec, lib/generator.py).
    2. Kalau SEMUA baris non-kosongnya match pola bullet/ordered -> 1 list
       node.
    3. Kalau campuran/tidak match apapun -> paragraph node biasa
       (multi-baris internal -> hardBreak, lihat _paragraph_from_line)."""
    raw = (raw or "").strip()
    if not raw:
        return {"type": "doc", "content": [{"type": "paragraph"}]}

    blocks = re.split(r"\n\s*\n", raw)
    doc_content: List[Dict[str, Any]] = []

    for block in blocks:
        block = block.strip("\n")
        if not block.strip():
            continue

        table_node = _try_parse_table_block(block, table_spec)
        if table_node is not None:
            doc_content.append(table_node)
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

    def cell_text(cell: Dict[str, Any]) -> str:
        sub: List[str] = []
        for child in cell.get("content", []) or []:
            if child.get("type") == "paragraph":
                for gc in child.get("content", []) or []:
                    if gc.get("type") == "text":
                        sub.append(gc.get("text", ""))
        return "".join(sub)

    def walk(node: Dict[str, Any]):
        ntype = node.get("type")
        if ntype == "text":
            parts.append(node.get("text", ""))
        elif ntype == "hardBreak":
            parts.append("\n")
        elif ntype == "table":
            for row in node.get("content", []) or []:
                cells = [cell_text(c) for c in row.get("content", []) or []]
                parts.append(" | ".join(cells) + "\n")
            parts.append("\n")
            return  # sudah handle children sendiri (row/cell), jangan walk generik lagi
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


# --- dev-v1 additions: legacy rows stored {format:'html', body, markdown} before content became a ProseMirror doc.
def content_to_text(content: Any) -> str:
    """Section/chapter `content` (doc, legacy dict, or str) -> plain text."""
    if isinstance(content, dict) and content.get("type") == "doc":
        return doc_to_text(content)
    if isinstance(content, dict):
        legacy = content.get("markdown") or re.sub(r"<[^>]+>", " ", content.get("body") or "")
        return re.sub(r"[ \t]+", " ", legacy).strip()
    return doc_to_text(content)


def content_to_nodes(content: Any) -> List[Dict[str, Any]]:
    """Block nodes of `content`; legacy rows degrade to paragraphs of their text."""
    if isinstance(content, dict) and content.get("type") == "doc":
        return list(content.get("content") or [])
    text = content_to_text(content)
    return text_to_doc(text)["content"] if text else []
