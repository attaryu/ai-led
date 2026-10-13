"""Ekstraksi struktur PANDUAN_LAM (PDF -> tree BAB/sub-bab/sub-sub-bab
dengan isi teks ASLI per bagian) lewat MinerU + regex/heuristik
state-machine murni Python -- BUKAN LLM. Port dari dimas's
lib/extraction/panduan_chunker.py (`led-wiriting(dimas)` commit `57a55b0`,
class `MineruChunker`), diadaptasi untuk dev-v1:
  - PDF->Markdown pakai `ingestion.evidence_mineru.mineru_extract` yang
    sudah ada di sini (dev-v1 sudah pakai MinerU utk evidence docs -- bukan
    dependency baru), bukan dimas's `lib/extraction/mineru.py` sendiri.
  - Fasad keluarannya (`extract_panduan_structure`) menghasilkan `bab_list`
    persis bentuk lama worker.py::_parse_struktur_dokumen
    ([{"order","title","subbab":[{"order","title","guidance","subbab":[...]}]}])
    supaya worker.py bisa tetap pakai `_gabung_duplikat_judul` dan
    `_flatten_bab_list` yang sudah ada/teruji, bukan pipeline paralel baru.
  - Sedalam apa pun, seperti dimas (process_panduan_file): setiap node di
    bawah BAB jadi section sendiri (SubBabTemplate.parentId bersarang), dengan
    pedoman = breadcrumb + isi node itu SENDIRI.

Class MineruChunker/Node/fungsi pola di bawah ini SENGAJA disalin nyaris
utuh dari dimas (notebook-derived, regex+heuristik teruji thd dokumen LAM
Teknik nyata) -- lihat docstring aslinya per fungsi."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ---------- Roman helpers -------------------------------------------------

_ROMAN_RE = re.compile(
    r"^(?=[MDCLXVI])M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$"
)
_ROMAN_VALUES = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}


def is_roman(token: str) -> bool:
    return bool(_ROMAN_RE.match(token.upper()))


def roman_to_int(token: str) -> int:
    token = token.upper()
    total, prev = 0, 0
    for ch in reversed(token):
        val = _ROMAN_VALUES[ch]
        total = total - val if val < prev else total + val
        prev = max(prev, val)
    return total


# ---------- Pemotong kalimat pertama --------------------------------------

# Titik pada singkatan/inisial ini tidak dianggap akhir kalimat.
ABBREV = {
    "dll", "dsb", "dst", "hlm", "no", "prof", "dr", "ir", "drs", "hj", "sdr",
    "tbl", "gb", "vol", "ed", "cet", "spd", "msi", "mt", "st", "al", "etc",
}


def split_first_sentence(line: str, skip: int = 0):
    """Potong pada titik akhir kalimat pertama.

    Titik di dalam kurung, titik penomoran seperti '3.b', inisial satu huruf,
    dan singkatan umum tidak dihitung sebagai akhir kalimat.
    Mengembalikan (kalimat_pertama, sisa).
    """
    depth = 0
    i, n = skip, len(line)
    while i < n:
        ch = line[i]
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth = max(0, depth - 1)
        elif ch in ".!?" and depth == 0:
            nxt = i + 1
            if nxt >= n or line[nxt].isspace():
                prev = re.split(r"[\s(\[]", line[:i])[-1]
                if len(prev) > 1 and prev.lower().rstrip(".") not in ABBREV:
                    return line[: i + 1].strip(), line[nxt:].strip()
        i += 1
    return line.strip(), ""


# ---------- Bank pola -----------------------------------------------------

_P_BAB = re.compile(r"^(BAB)\s+([IVXLCDM]+)\s*\.?\s*(.*)$")
_P_CAP_NUM_DOT = re.compile(r"^([A-Z])\.(\d+)\.\s+(.+)$")
_P_CAP_NUM = re.compile(r"^([A-Z])\.(\d+)\s+(.+)$")
_P_CAP_DOT = re.compile(r"^([A-Z])\.\s+(.+)$")
_P_ROMAN_UP = re.compile(r"^([IVXLCDM]{2,7})\.\s+(.+)$")
_P_ROMAN_LOW = re.compile(r"^([ivxlcdm]{1,7})\.\s+(.+)$")
_P_NUM_DOT = re.compile(r"^(\d{1,4})\.\s+(.+)$")
_P_NUM_PAREN = re.compile(r"^(\d{1,3})\)\s+(.+)$")
_P_LOW_PAREN = re.compile(r"^([a-z])\)\s+(.+)$")
_P_CAP_PAREN = re.compile(r"^([A-Z])\)\s+(.+)$")

MAX_PLAIN_NUMBER = 50  # "2019. ..." bukan heading


def match_patterns(line: str) -> list:
    """Semua interpretasi pola yang mungkin untuk satu baris (bisa ambigu)."""
    s = line.strip()
    out = []

    def add(ptype, numbering, text, prefix, index):
        out.append(
            {
                "pattern_type": ptype,
                "numbering": numbering,
                "text": text.strip(),
                "prefix": prefix,
                "index": index,
            }
        )

    m = _P_BAB.match(s)
    if m:
        add("BAB", f"BAB {m.group(2)}", m.group(3), None, roman_to_int(m.group(2)))
        return out

    m = _P_CAP_NUM_DOT.match(s)
    if m:
        add("CAPITAL_LETTER_NUMBER_DOT", f"{m.group(1)}.{m.group(2)}.",
            m.group(3), m.group(1), int(m.group(2)))
    m = _P_CAP_NUM.match(s)
    if m:
        add("CAPITAL_LETTER_NUMBER", f"{m.group(1)}.{m.group(2)}",
            m.group(3), m.group(1), int(m.group(2)))

    m = _P_ROMAN_UP.match(s)
    if m and is_roman(m.group(1)):
        add("ROMAN_UPPER", m.group(1), m.group(2), None, roman_to_int(m.group(1)))

    m = _P_CAP_DOT.match(s)
    if m:
        letter = m.group(1)
        add("CAPITAL_LETTER", letter, m.group(2), None, ord(letter) - 64)
        if is_roman(letter):
            add("ROMAN_UPPER", letter, m.group(2), None, roman_to_int(letter))

    m = _P_ROMAN_LOW.match(s)
    if m and is_roman(m.group(1)):
        add("ROMAN_LOWER", m.group(1), m.group(2), None, roman_to_int(m.group(1)))

    m = _P_NUM_DOT.match(s)
    if m:
        add("NUMBER", m.group(1), m.group(2), None, int(m.group(1)))

    m = _P_NUM_PAREN.match(s)
    if m:
        add("NUMBER_PAREN", m.group(1), m.group(2), None, int(m.group(1)))

    m = _P_LOW_PAREN.match(s)
    if m:
        add("LOWER_LETTER_PAREN", m.group(1), m.group(2), None, ord(m.group(1)) - 96)

    m = _P_CAP_PAREN.match(s)
    if m:
        add("CAPITAL_LETTER_PAREN", m.group(1), m.group(2), None, ord(m.group(1)) - 64)

    return out


_PAREN_TYPES = {"NUMBER_PAREN", "LOWER_LETTER_PAREN", "CAPITAL_LETTER_PAREN"}


def make_marker(cand) -> Optional[str]:
    """Marker siap pakai: 'C.1', 'B', 'a)', 'I', 'BAB III'."""
    if not cand:
        return None
    num = cand["numbering"].rstrip(".")
    return num + ")" if cand["pattern_type"] in _PAREN_TYPES else num


# ---------- Node ----------------------------------------------------------


@dataclass
class Node:
    id: int
    level: int
    heading: str
    raw_line: str
    pattern_type: Optional[str]
    numbering: Optional[str]
    prefix: Optional[str]
    index: Optional[int]
    md_level: Optional[int]
    is_virtual: bool
    marker: Optional[str] = None
    title: str = ""
    parent_id: Optional[int] = None
    content_lines: list = field(default_factory=list)

    @property
    def key(self):
        """Kunci pencocokan prefix anak: 'C' untuk heading 'C.'."""
        if self.pattern_type in ("CAPITAL_LETTER", "CAPITAL_LETTER_PAREN"):
            return self.numbering
        if self.pattern_type in ("CAPITAL_LETTER_NUMBER", "CAPITAL_LETTER_NUMBER_DOT"):
            return self.numbering.rstrip(".")
        return None


# ---------- Chunker -------------------------------------------------------


class MineruChunker:
    def __init__(
        self,
        promote_virtual: bool = True,
        max_plain_number: int = MAX_PLAIN_NUMBER,
        demote_unnumbered_md: bool = True,   # '## Judul tanpa nomor' -> teks biasa
        demote_from_md_level: int = 2,       # '#' level 1 tidak ikut diturunkan
        demote_level1_without_capital: bool = True,  # '# mengontrol dan ...' -> teks biasa
        split_sentence_virtual: bool = True,  # heading virtual dipotong 1 kalimat
        split_sentence_md: bool = False,      # heading markdown ikut dipotong?
        split_stacked_markers: bool = True,   # 'a) I. Judul' -> 'a)' + anak 'I. Judul'
        max_stacked_markers: int = 3,
    ):
        self.promote_virtual = promote_virtual
        self.max_plain_number = max_plain_number
        self.demote_unnumbered_md = demote_unnumbered_md
        self.demote_from_md_level = demote_from_md_level
        self.demote_level1_without_capital = demote_level1_without_capital
        self.split_sentence_virtual = split_sentence_virtual
        self.split_sentence_md = split_sentence_md
        self.split_stacked_markers = split_stacked_markers
        self.max_stacked_markers = max_stacked_markers
        self.nodes = []
        self.stack = []
        self._next_id = 0

    # -- skoring kandidat --------------------------------------------------

    def _score(self, cand) -> int:
        """3 = ada parent/sibling di stack, 2 = awal sekuens, 1 = lemah."""
        if cand["prefix"]:
            for n in reversed(self.stack):
                if n.key == cand["prefix"]:
                    return 3
        for n in reversed(self.stack):
            if n.pattern_type == cand["pattern_type"] and n.prefix == cand["prefix"]:
                if n.index is not None and cand["index"] == n.index + 1:
                    return 3
                if cand["index"] == 1:
                    return 2
                return 1
        return 2 if cand["index"] == 1 else 1

    def _pick(self, cands):
        if not cands:
            return None
        scored = [(self._score(c), -i, c) for i, c in enumerate(cands)]
        scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
        best = dict(scored[0][2])
        best["_score"] = scored[0][0]
        return best

    # -- leveling ----------------------------------------------------------

    def _resolve_level(self, cand, md_level) -> int:
        if not self.stack:
            return 1

        if cand:
            # 1. parent eksplisit lewat prefix penomoran (C.1 -> C.)
            if cand["prefix"]:
                for i in range(len(self.stack) - 1, -1, -1):
                    if self.stack[i].key == cand["prefix"]:
                        del self.stack[i + 1:]
                        return self.stack[i].level + 1

            # 2. sibling: pola + prefix sama yang masih terbuka
            for i in range(len(self.stack) - 1, -1, -1):
                n = self.stack[i]
                if n.pattern_type == cand["pattern_type"] and n.prefix == cand["prefix"]:
                    lvl = n.level
                    del self.stack[i:]
                    return lvl

            # 3. pola baru -> satu tingkat lebih dalam
            return self.stack[-1].level + 1

        # 4. tanpa penomoran -> ikut level markdown
        if md_level is not None:
            for i in range(len(self.stack) - 1, -1, -1):
                n = self.stack[i]
                if n.md_level is None:
                    continue
                if n.md_level == md_level:
                    lvl = n.level
                    del self.stack[i:]
                    return lvl
                if n.md_level < md_level:
                    del self.stack[i + 1:]
                    return n.level + 1
            return 1

        return self.stack[-1].level + 1

    # -- parsing -----------------------------------------------------------

    def parse(self, markdown: str):
        self.nodes, self.stack, self._next_id = [], [], 0
        in_fence = False
        current = None

        for raw in markdown.splitlines():
            stripped = raw.strip()

            # Not in dimas: kept because real Panduan PDFs render BAB headings as bare **bold** via MinerU
            # (no '#'), which otherwise extracts zero BAB (prod bug). Bullets '* x' untouched.
            if len(stripped) > 4 and (
                (stripped.startswith("**") and stripped.endswith("**"))
                or (stripped.startswith("__") and stripped.endswith("__"))
            ):
                stripped = stripped[2:-2].strip()

            if stripped.startswith("```") or stripped.startswith("~~~"):
                in_fence = not in_fence
                if current:
                    current.content_lines.append(raw)
                continue
            if in_fence:
                if current:
                    current.content_lines.append(raw)
                continue

            md_match = re.match(r"^(#{1,6})\s+(.*)$", stripped)
            if md_match:
                md_level = len(md_match.group(1))
                body = md_match.group(2).strip()
                cand = self._pick(match_patterns(body))

                # heading markdown tanpa penomoran -> turunkan jadi teks biasa
                if cand is None and self.demote_unnumbered_md and current is not None:
                    deep_enough = md_level >= self.demote_from_md_level
                    # level 1: hanya diturunkan kalau tidak diawali huruf kapital
                    no_capital = (
                        self.demote_level1_without_capital
                        and not re.match(r"^[A-Z]", body)
                    )
                    if deep_enough or no_capital:
                        current.content_lines.append(body)
                        continue

                current = self._emit_heading(body, raw, md_level, False)
                continue

            if self.promote_virtual and self._is_virtual_heading(stripped):
                current = self._emit_heading(stripped, raw, None, True)
                continue

            if current is not None:
                current.content_lines.append(raw)

        return self.nodes

    def _emit_heading(self, body: str, raw: str, md_level, is_virtual) -> Node:
        """Buat node heading.

        Marker bertumpuk seperti 'a) I. Judul' dipecah jadi heading stub 'a)'
        tanpa content, lalu 'I. Judul' sebagai anaknya.
        """
        if self.split_stacked_markers:
            for _ in range(self.max_stacked_markers):
                cand = self._pick(match_patterns(body))
                if cand is None:
                    break
                rest = cand["text"]
                nested = self._pick(match_patterns(rest))
                if not (nested and nested["_score"] >= 2 and len(nested["text"]) >= 3):
                    break
                marker = body[: len(body) - len(rest)].strip()
                self._add_node(marker, raw, cand, md_level, is_virtual, title="")
                body = rest
                if md_level:
                    md_level = min(md_level + 1, 6)

        cand = self._pick(match_patterns(body))
        head, tail = body, ""
        do_split = self.split_sentence_virtual if is_virtual else self.split_sentence_md
        if cand and do_split:
            head, tail = self._split_heading(body, cand)
        skip = len(body) - len(cand["text"]) if cand else 0
        node = self._add_node(
            head, raw, cand, md_level, is_virtual, title=head[skip:].strip()
        )
        if tail:
            node.content_lines.append(tail)
        return node

    def _split_heading(self, line: str, cand):
        """Heading = penomoran + kalimat pertama. Sisanya jadi content."""
        s = line.strip()
        skip = len(s) - len(cand["text"]) if cand and s.endswith(cand["text"]) else 0
        return split_first_sentence(s, skip=skip)

    def _is_virtual_heading(self, line: str) -> bool:
        if not line or line[0] in "|>-*+([!":
            return False
        cands = match_patterns(line)
        if not cands:
            return False
        best = self._pick(cands)
        if best["_score"] < 2:            # bukan awal sekuens, bukan lanjutan
            return False
        if best["pattern_type"] == "NUMBER" and best["index"] > self.max_plain_number:
            return False
        return len(best["text"]) >= 3

    def _add_node(self, heading, raw, cand, md_level, is_virtual, title=None) -> Node:
        level = self._resolve_level(cand, md_level)
        if title is None:
            title = cand["text"] if (cand and heading.endswith(cand["text"])) else heading
        node = Node(
            id=self._next_id,
            level=level,
            heading=heading,
            raw_line=raw,
            pattern_type=cand["pattern_type"] if cand else None,
            numbering=cand["numbering"] if cand else None,
            prefix=cand["prefix"] if cand else None,
            index=cand["index"] if cand else None,
            md_level=md_level,
            is_virtual=is_virtual,
            marker=make_marker(cand),
            title=title.strip(),
        )
        self._next_id += 1
        self.nodes.append(node)
        while self.stack and self.stack[-1].level >= level:
            self.stack.pop()
        node.parent_id = self.stack[-1].id if self.stack else None
        self.stack.append(node)
        return node


def chunk_markdown(markdown: str, promote_virtual: bool = True) -> list:
    c = MineruChunker(promote_virtual=promote_virtual)
    c.parse(markdown)
    return c.nodes


# ---------- Fasad dev-v1 (baru, tidak ada di versi dimas) -----------------

_BAB_MARKER_RE = re.compile(r"^BAB\s+[IVXLCDM]+$")
_DAFTAR_ISI_RE = re.compile(r"daftar\s+isi", re.IGNORECASE)


def _is_bab_marker(marker: Optional[str]) -> bool:
    """True kalau marker "BAB I"/"BAB II"/dst -- judul BAB, bukan container
    atau sub-bab. Deteksi lewat marker (BUKAN level absolut) krn level
    absolut BAB bisa beda2 tergantung ada/tidaknya node pembungkus (mis.
    "INSTRUMEN PEDOMAN PENYUSUNAN...") di atasnya -- lihat contoh nyata di
    tracker row 146."""
    return bool(marker and _BAB_MARKER_RE.match(marker.strip()))


# Leader Daftar Isi: titik-leader (digit di akhir opsional -- split_first_sentence bisa motong duluan) atau spasi-leader telanjang (digit wajib).
_TOC_LEADER_RE = re.compile(r"(\.[.\s]+\d{0,4}|\s{3,}\d{1,4})\s*$")


def _looks_like_toc_entry(title: str) -> bool:
    return bool(_TOC_LEADER_RE.search(title or ""))


def _own_content(n: Node) -> str:
    text = "\n".join(n.content_lines).strip("\n")
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _exclude_daftar_isi(nodes: list[Node]) -> list[Node]:
    """Buang node "Daftar Isi" atau entri leader-nya (di semua level, bukan cuma BAB), beserta keturunannya."""
    excluded: set[int] = set()
    for n in nodes:
        if _DAFTAR_ISI_RE.search(n.title or "") or _looks_like_toc_entry(n.title):
            excluded.add(n.id)
    if not excluded:
        return nodes
    changed = True
    while changed:
        changed = False
        for n in nodes:
            if n.id not in excluded and n.parent_id in excluded:
                excluded.add(n.id)
                changed = True
    return [n for n in nodes if n.id not in excluded]


# ---------- LKPS need detection (port of Dimas 140d8ae) -------------------

_LKPS_TOKEN = r"\d+[a-z]?(?:[.-][a-z0-9]+)*"
# Pemisah antar token dalam satu penyebutan "Tabel ..." (koma, "dan",
# "serta", "&", "/", "+"); boleh beruntun spt ", dan"
_LKPS_SEP = r"(?:\s*(?:,|dan|serta|&|/|\+)\s*)+"
_LKPS_CLAUSE_RE = re.compile(
    rf"[Tt]abel\s+({_LKPS_TOKEN}(?:{_LKPS_SEP}{_LKPS_TOKEN})*)", re.IGNORECASE
)
_LKPS_TOKEN_RE = re.compile(_LKPS_TOKEN, re.IGNORECASE)
_LKPS_WORD_RE = re.compile(r"\bLKPS\b", re.IGNORECASE)


def normalize_lkps_sheet(sheet: str) -> str:
    """Lowercase + buang semua karakter non-alphanumeric -- "2a.1" -> "2a1",
    "4/b" -> "4b". Dipakai KEDUA arah supaya bisa di-lookup langsung tanpa
    RAG/similarity: (1) di detect_lkps di bawah, normalize token hasil
    ekstraksi teks Panduan (mis. "Tabel 2a.1 LKPS") sebelum disimpan ke
    SubBabTemplate.lkpsList, dan (2) di vectorstore/pgvector_lkps_store.py::
    lookup_lkps_by_sheets, normalize nama sheet Excel mentah
    (lkps_chunk_embeddings.sheet) sebelum dicocokkan. Kedua sisi HARUS pakai
    fungsi yang SAMA PERSIS -- kalau tidak, token "2a1" (dari Panduan) tidak
    akan pernah match sheet "2A.1" (dari Excel) walau maksudnya identik."""
    return re.sub(r"[^a-z0-9]", "", sheet.lower())


def detect_lkps(text: str) -> dict:
    """Input: teks guidance satu section (sub-bab/sub-sub-bab). Output:
    {"needs_lkps": bool, "tables": [token ternormalisasi, ...]}.

    Butuh LKPS jika section menyebut DUA-DUANYA (urutan bebas, boleh beda
    kalimat): referensi "Tabel <token>" DAN kata "LKPS" -- dijalankan sekali
    saat ekstraksi Panduan (_bab_list_from_nodes), hasilnya disimpan
    permanen di SubBabTemplate.lkpsNeeded/lkpsList, gantikan
    worker.py::_lkps_refs_in_pedoman (regex runtime tiap generate)."""
    has_lkps = _LKPS_WORD_RE.search(text) is not None

    tables: list[str] = []
    for m in _LKPS_CLAUSE_RE.finditer(text):
        for t in _LKPS_TOKEN_RE.findall(m.group(1)):
            tables.append(t.replace(".", "").replace(",", ""))

    needs_lkps = has_lkps and len(tables) > 0
    return {
        "needs_lkps": needs_lkps,
        "tables": [normalize_lkps_sheet(t) for t in tables] if needs_lkps else [],
    }


def _bab_list_from_nodes(nodes: list[Node]) -> list[dict]:
    """chunker.nodes (flat, parent_id integer) -> bab_list ([{"order","title","subbab":
    [{"order","title","guidance","lkps_needed","lkps_list","subbab":[...]}]}]), sedalam
    apa pun seperti dimas process_panduan_file: BAB dicari lewat _is_bab_marker di
    seluruh tree (root pembungkus tidak ikut); setiap keturunan BAB jadi section
    sendiri dengan guidance = breadcrumb + isi node itu sendiri (dimas pedoman_text,
    chunks(content_with_path=True)), detect_lkps dijalankan atas teks itu."""
    nodes = _exclude_daftar_isi(nodes)
    children_by_parent: dict = {}
    for n in nodes:
        children_by_parent.setdefault(n.parent_id, []).append(n)
    by_id = {n.id: n for n in nodes}

    def with_breadcrumb(n: Node, content: str) -> str:
        """dimas chunks(content_with_path=True): ancestor chain "marker title" per line, blank line, content."""
        chain = [n]
        while chain[-1].parent_id is not None and chain[-1].parent_id in by_id:
            chain.append(by_id[chain[-1].parent_id])
        breadcrumb = "\n".join(f"{a.marker or ''} {a.title}".strip() for a in reversed(chain))
        return f"{breadcrumb}\n\n{content}".strip()

    def section(n: Node, order: int, with_children: bool = True) -> dict:
        guidance = with_breadcrumb(n, _own_content(n))
        lkps = detect_lkps(guidance)
        return {
            "order": order,
            # Stub marker bertumpuk ('d) I. Judul' -> 'd)' tanpa judul): dimas tampilkan
            # marker + "(tanpa judul)"; dev-v1 tidak simpan marker, jadi marker = judul.
            "title": n.title or n.marker or "",
            "marker": n.marker,
            "guidance": guidance,
            "lkps_needed": lkps["needs_lkps"],
            "lkps_list": lkps["tables"],
            "subbab": subtree(n) if with_children else [],
        }

    def subtree(parent: Node) -> list[dict]:
        return [section(n, order) for order, n in enumerate(children_by_parent.get(parent.id, []), start=1)]

    def contains_bab(n: Node) -> bool:
        return any(_is_bab_marker(c.marker) or contains_bab(c) for c in children_by_parent.get(n.id, []))

    # dimas: EVERY node is a section, BAB or not. dev-v1 needs chapters, so: a BAB is a chapter; a
    # container holding BABs (root wrapper) is skipped; any other top-level part (Ringkasan, Lampiran,
    # or a Panduan without BAB headings) becomes its own chapter with itself as its one section.
    containers: set = set()

    def chapter_nodes(parent_id) -> list[Node]:
        out: list[Node] = []
        for n in children_by_parent.get(parent_id, []):
            if not _is_bab_marker(n.marker) and contains_bab(n):
                if _own_content(n).strip():  # its own text still counts, just without the BABs under it
                    containers.add(n.id)
                    out.append(n)
                out.extend(chapter_nodes(n.id))
            else:
                out.append(n)
        return out

    tops = chapter_nodes(None)
    if len(tops) == 1 and not _is_bab_marker(tops[0].marker) and children_by_parent.get(tops[0].id):
        tops = children_by_parent[tops[0].id]  # BAB-less Panduan under a single wrapper: its children are the parts

    return [
        {
            "order": order,
            "title": n.title or n.marker or "",
            # dimas keeps the BAB row's own isi_teks (visible, not generatable) -- the chapter's intro pedoman.
            "guidance": with_breadcrumb(n, _own_content(n)) if _is_bab_marker(n.marker) and _own_content(n).strip() else None,
            "subbab": subtree(n) if _is_bab_marker(n.marker) else [section(n, 1, n.id not in containers)],
        }
        for order, n in enumerate(tops, start=1)
    ]


def extract_panduan_structure(pdf_path: Path, work_dir: Path) -> list[dict]:
    """1 file Pedoman (PDF) -> `bab_list` (lihat _bab_list_from_nodes),
    dipanggil worker.py::_handle_ingestion_struktur_dokumen. Tidak ada LLM
    sama sekali -- PDF->Markdown lewat MinerU (sudah dipakai dev-v1 utk
    evidence docs, ingestion.evidence_mineru), lalu MineruChunker (regex
    murni) yang membangun tree-nya.

    work_dir: folder kerja sementara utk output MinerU markdown -- pemanggil
    yang membersihkannya, sama seperti ingestion.evidence_pipeline.process_file."""
    from . import mineru_service
    from .evidence_mineru import mineru_extract

    # start_page=3 (0-based = 4th page): Dimas skips the cover/front-matter pages of a Pedoman, which are not
    # part of the BAB structure (_exclude_daftar_isi below still covers a Daftar Isi that starts later).
    if mineru_service.service_enabled():
        # Gateway `mineru` (varian gpu/cpu/api) -- parse_pdf memakai halaman 1-based. Tanpa cabang ini,
        # varian api tetap memanggil MinerU 3.4.5 in-process yang butuh model lokal (offline di container).
        markdown = mineru_service.parse_pdf(Path(pdf_path), start_page=4)
    else:
        md_path = mineru_extract(Path(pdf_path), Path(work_dir) / "mineru_md", start_page=3)
        markdown = md_path.read_text(encoding="utf-8")

    chunker = MineruChunker()
    chunker.parse(markdown)
    return _bab_list_from_nodes(chunker.nodes)
