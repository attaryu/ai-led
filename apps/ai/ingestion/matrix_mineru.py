"""Ekstraksi rubrik/matriks penilaian dari hasil MinerU -- port dari
ekstrak_mineru_rubrik.ipynb (sel 8, 14, 15, 16, 17, 18, disalin apa adanya).

Menggantikan jalur pdfplumber (matrix_parser.py) untuk INGESTION_RUBRIK_DOKUMEN.
Alasan, terukur pada matriks LAM Teknik 35 halaman:
  - pdfplumber membuang baris induk (A. KRITERIA, I-VII, 2.1/3.1) sehingga tidak
    ada hierarki kelompok > kriteria > IKU > sub_kriteria.
  - pdfplumber tidak tahu sel ter-merge: 39 dari 60 indikator punya band skor
    yang ter-merge, dan band-nya jadi kosong/bergeser.
  - sub-indikator komposit (I., II.) menyatu jadi satu teks; di sini dipisah
    jadi record sendiri dengan `sub_no`.

Pipeline (sama dengan notebook):
  mineru (mulai halaman 2) -> markdown -> table_blocks -> iter_rows -> Chunker -> finalize

MinerU diambil dari evidence_mineru.mineru_extract (3.4.5, backend pipeline =
tier "basic" di notebook). Bagian di bawah garis "ENTRY POINT" adalah satu-satunya
tambahan; selebihnya identik dengan notebook.
"""
from __future__ import annotations

import html
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

from . import mineru_service
from .evidence_mineru import mineru_extract

PAGE_START = 2    # halaman pertama yang diparse (1 = semua halaman); sama dengan notebook


IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
MD_TABLE_SEP_RE = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$")


def clean(text):
    text = IMAGE_RE.sub("", text)
    text = re.sub(r"<br\s*/?>", " ", text, flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    text = re.sub(r"(\*\*|__)(.+?)\1", r"\2", text)
    text = re.sub(r"^\s*[-*+>]\s+", "", text)
    return re.sub(r"\s+", " ", text).strip()


def html_table_rows(table_html):
    grid, spans = [], {}
    for r, tr in enumerate(BeautifulSoup(table_html, "html.parser").find_all("tr")):
        row, c = [], 0
        for cell in tr.find_all(["td", "th"]):
            while (r, c) in spans:
                row.append(spans.pop((r, c)))
                c += 1
            text = clean(cell.get_text(" "))
            colspan, rowspan = int(cell.get("colspan", 1) or 1), int(cell.get("rowspan", 1) or 1)
            for dc in range(colspan):
                row.append(text)
                for dr in range(1, rowspan):
                    spans[(r + dr, c + dc)] = text
            c += colspan
        while (r, c) in spans:
            row.append(spans.pop((r, c)))
            c += 1
        grid.append("|".join(row))
    return [row for row in grid if row.strip("|")]


def table_blocks(markdown):
    """Ambil blok tabel mentah (HTML <table> atau tabel Markdown) sesuai urutan baca."""
    text = re.sub(r"<!--.*?-->", "", markdown, flags=re.S)
    blocks = []
    for part in re.split(r"(<table\b.*?</table>)", text, flags=re.S | re.I):
        if re.match(r"<table\b", part, re.I):
            blocks.append(part.strip())
            continue
        block = []                                    # tabel Markdown
        for line in part.splitlines() + [""]:
            if line.strip().startswith("|"):
                block.append(line.strip())
            elif block:
                blocks.append("\n".join(block))
                block = []
    return blocks


def table_text(block):
    """Satu blok tabel -> string "a|b\\nc|d"."""
    if block.startswith("<"):
        rows = html_table_rows(block)
    else:
        rows = ["|".join(clean(c) for c in line.strip("|").split("|"))
                for line in block.splitlines() if not MD_TABLE_SEP_RE.match(line)]
    return "\n".join(rows)

import sys
from dataclasses import dataclass
from typing import Any

# ------------------------------------------------------------------ konfigurasi
N_COLS = 8                                        # No | Kriteria | Indikator | 4 | 3 | 2 | 1 | 0
SCORE_OF_COL = {3: "4", 4: "3", 5: "2", 6: "1", 7: "0"}
MIN_HEADING_SPAN = 3                              # merge minimal 3 kolom, mulai dari kolom paling kiri
LEVEL_FIELDS = ["kelompok", "kriteria", "IKU"]    # nama field untuk level 1, 2, 3, ...

# Perbaikan artefak teks hasil ekstraksi (regex, pengganti), dijalankan berurutan pada setiap field teks.
# Tambahkan sendiri bila ada artefak baru.
TEXT_FIXES = [
    # kata terpotong akibat sel sempit di PDF
    (r"/(?:administr ator|admini strator|adm inistrator|ad ministrator)", "/administrator"),
    (r"mempertimbangk an", "mempertimbangkan"),
    (r"menyelenggaraka n", "menyelenggarakan"),
    (r"peluan g", "peluang"),
    (r"\bR N\b", "RN"),
    # spasi hilang
    (r"([A-Za-z])\((\d{1,2})\)", r"\1 (\2)"),          # "dan(3)"            -> "dan (3)"
    (r"\)(?=[A-Z][a-z])", ") "),                       # "(4)Dokumen"        -> "(4) Dokumen"
    (r":(?=\()", ": "),                                # "dalam:(1)"         -> "dalam: (1)"
    (r",(?=[A-Za-z])", ", "),                          # ",maka" / ",peluang"
    (r"([≥≤])(?=\d)", r"\1 "),                         # "≥20.000.000"       -> "≥ 20.000.000"
    (r"\bstudy(?=yang\b|terkoordinasi\b|DIKTI\b)", "study "),
    (r"\bscholar(?=di\b)", "scholar "),
    (r"\bspeaker(?=pada\b)", "speaker "),
]

# ------------------------------------------------------------------ penomoran
PATTERNS = [
    ("bab",       re.compile(r"^(BAB)\s+([IVXLCDM]+)\s*\.?\s*(.*)$")),
    ("cap_num",   re.compile(r"^([A-Z])\.(\d+)\.?\s+(.+)$")),        # A.1 / A.1.
    ("dec",       re.compile(r"^(\d+(?:\.\d+)+)\.?\s+(.+)$")),       # 2.1 / 3.1.  (tambahan)
    ("cap_dot",   re.compile(r"^([A-Z])\.\s+(.+)$")),                # A.  (juga I., V. -> ambigu)
    ("roman_up",  re.compile(r"^([IVXLCDM]{2,7})\.\s+(.+)$")),
    ("roman_low", re.compile(r"^([ivxlcdm]{1,7})\.\s+(.+)$")),
    ("num_dot",   re.compile(r"^(\d{1,4})\.\s+(.+)$")),
    ("num_paren", re.compile(r"^(\d{1,3})\)\s+(.+)$")),
    ("low_paren", re.compile(r"^([a-z])\)\s+(.+)$")),
    ("cap_paren", re.compile(r"^([A-Z])\)\s+(.+)$")),
]
ROMAN_VAL = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
ROMAN_VALID = re.compile(r"M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})")


@dataclass(frozen=True)
class Marker:
    family: str
    value: Any        # int, atau tuple untuk "2.1" / "A.1"
    raw: str


def roman_to_int(s):
    s = s.upper()
    if not s or not ROMAN_VALID.fullmatch(s):
        return None
    total = prev = 0
    for ch in reversed(s):
        v = ROMAN_VAL[ch]
        if v < prev:
            total -= v
        else:
            total += v
            prev = v
    return total


def parse_markers(text):
    """Kandidat penomoran di awal teks. Huruf tunggal I/V/X/L/C/D/M -> 2 kandidat (alfabet & romawi)."""
    t = text.strip()
    for name, rx in PATTERNS:
        m = rx.match(t)
        if not m:
            continue
        g = m.group(1)
        if name == "cap_dot":
            out = [Marker("alpha_up", ord(g) - 64, g)]
            if g in ROMAN_VAL:
                out.append(Marker("roman_up", ROMAN_VAL[g], g))
            return out
        if name in ("roman_up", "roman_low"):
            v = roman_to_int(g)
            return [Marker(name, v, g)] if v else []
        if name == "bab":
            v = roman_to_int(m.group(2))
            return [Marker(name, v, m.group(2))] if v else []
        if name == "cap_num":
            return [Marker(name, (ord(g) - 64, int(m.group(2))), f"{g}.{m.group(2)}")]
        if name == "dec":
            return [Marker(name, tuple(int(x) for x in g.split(".")), g)]
        if name in ("num_dot", "num_paren"):
            return [Marker(name, int(g), g)]
        if name == "low_paren":
            return [Marker(name, ord(g) - 96, g)]
        if name == "cap_paren":
            return [Marker(name, ord(g) - 64, g)]
    return []


def is_next(a, b):
    """b adalah saudara langsung berikutnya dari a (I -> II, 1 -> 2, 2.1 -> 2.2)."""
    if a.family != b.family:
        return False
    if isinstance(a.value, tuple):
        return a.value[:-1] == b.value[:-1] and b.value[-1] == a.value[-1] + 1
    return b.value == a.value + 1

# ------------------------------------------------------------------ leveling dinamis
class Leveler:
    def __init__(self):
        self.kind_level = {}     # family -> level (1-based), ditentukan saat pertama kali muncul
        self.stack = {}          # level -> (Marker, teks heading)
        self.last = {}           # family -> Marker terakhir
        self.touched = {}        # family -> urutan pemakaian terakhir
        self.tick = 0

    def _resolve(self, cands):
        if len(cands) == 1:
            return cands[0]
        cont = [c for c in cands if c.family in self.last and is_next(self.last[c.family], c)]
        if cont:                                           # lanjutan deret yang sedang berjalan
            return max(cont, key=lambda c: self.touched[c.family])
        start = [c for c in cands if c.value == 1]         # awal deret baru: "I" -> romawi, "A" -> alfabet
        return start[0] if start else cands[0]

    def feed(self, text):
        cands = parse_markers(text)
        if not cands:
            return None
        mk = self._resolve(cands)
        if mk.family not in self.kind_level:
            self.kind_level[mk.family] = (max(self.stack) if self.stack else 0) + 1
        lvl = self.kind_level[mk.family]
        for k in [k for k in self.stack if k >= lvl]:
            del self.stack[k]
        self.stack[lvl] = (mk, text)
        self.last[mk.family] = mk
        self.tick += 1
        self.touched[mk.family] = self.tick
        return lvl

    def snapshot(self):
        n = max(len(LEVEL_FIELDS), max(self.stack, default=0))
        out = {}
        for i in range(1, n + 1):
            name = LEVEL_FIELDS[i - 1] if i <= len(LEVEL_FIELDS) else f"level{i}"
            out[name] = self.stack[i][1] if i in self.stack else None
        return out

# ------------------------------------------------------------------ parser tabel -> grid
@dataclass
class Cell:
    text: str
    col: int
    colspan: int = 1


class Row:
    def __init__(self, slots, has_span_info):
        self.slots = slots                 # list[(Cell | None, is_origin)]
        self.has_span_info = has_span_info

    def fresh(self, col):
        """Teks sel HANYA di baris tempat sel itu dimulai (sel rowspan di baris lanjutan = kosong)."""
        cell, origin = self.slots[col]
        return cell.text if (cell is not None and origin) else ""

    def origin_cells(self):
        return [c for c, o in self.slots if c is not None and o]


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def parse_html_table(html):
    soup = BeautifulSoup(html, "html.parser")
    rows, carry = [], {}
    for tr in soup.find_all("tr"):
        slots = [(None, False)] * N_COLS
        nxt = {}
        for k, (cell, rem) in carry.items():
            slots[k] = (cell, False)
            if rem > 1:
                nxt[k] = (cell, rem - 1)
        col = 0
        for td in tr.find_all(["td", "th"], recursive=False):
            while col < N_COLS and slots[col][0] is not None:
                col += 1
            if col >= N_COLS:
                break
            cs, rs = int(td.get("colspan", 1)), int(td.get("rowspan", 1))
            cell = Cell(norm(td.get_text(" ", strip=True)), col, cs)
            for k in range(col, min(col + cs, N_COLS)):
                slots[k] = (cell, k == col)
                if rs > 1:
                    nxt[k] = (cell, rs - 1)
            col += cs
        carry = nxt
        rows.append(Row(slots, True))
    return rows


def parse_pipe_table(block):
    rows = []
    for line in block.splitlines():
        line = line.strip()
        if not line.startswith("|"):
            continue
        inner = line[1:-1] if line.endswith("|") else line[1:]
        cells = [c.strip() for c in inner.split("|")]
        if all(re.fullmatch(r":?-{3,}:?", c) for c in cells if c):
            if any(cells):
                continue                       # baris pemisah | --- | --- |
        cells = (cells + [""] * N_COLS)[:N_COLS]
        rows.append(Row([(Cell(norm(c), i, 1), True) for i, c in enumerate(cells)], False))
    return rows


BLOCK_RE = re.compile(r"(?s:<table.*?</table>)|(?:^\|[^\n]*\n?)+", re.M)


def iter_rows(md):
    for m in BLOCK_RE.finditer(md):
        blk = m.group(0)
        yield from (parse_html_table(blk) if blk.lstrip().startswith("<table") else parse_pipe_table(blk))

# ------------------------------------------------------------------ chunker
LKPS_RE = re.compile(r"Tabel\s+\d+(?:\.[0-9A-Za-z]+)*\.?\s+LKPS")
SKOR_RE = re.compile(r"[Ss]kor\s*=\s*(.+?)(?=\s+(?:[Jj]ika|[Mm]aka)\b|$)")
KRIT_SKOR_RE = re.compile(r"\s*\bSkor\s*=\s*(.+)$")


def clean_text(s):
    s = norm(s)
    for pat, rep in TEXT_FIXES:
        s = re.sub(pat, rep, s)
    return s


class Chunker:
    def __init__(self):
        self.lv = Leveler()
        self.records = []
        self.cur = None
        self.after_heading = False
        self.unlabeled = []

    # -- klasifikasi baris
    def _is_heading(self, row):
        cell, origin = row.slots[0]
        if cell is None or not origin or not cell.text:
            return False
        if cell.colspan >= MIN_HEADING_SPAN:
            return True
        if not row.has_span_info:              # tabel pipa: tidak ada info merge
            rest_empty = not any(row.fresh(i) for i in range(1, N_COLS))
            return rest_empty and not cell.text.isdigit() and cell.text.lower() != "no"
        return False

    def _starts_new(self, no_t, in_t):
        if no_t:
            return no_t.isdigit()
        if in_t and self.cur and self.cur["lead"]:
            new = parse_markers(in_t)
            return any(is_next(p, n) for p in self.cur["lead"] for n in new)
        return False

    # -- proses satu baris
    def feed(self, row):
        texts = [row.fresh(i) for i in range(N_COLS)]
        if texts[:3] == ["No", "Kriteria", "Indikator"]:
            return                                             # header berulang tiap halaman
        if self._is_heading(row):
            text = row.slots[0][0].text
            if self.lv.feed(text) is None:
                self.unlabeled.append(text)
            else:
                self.after_heading = True
            return
        if not any(texts):
            return
        no_t, kr_t, in_t = texts[0], texts[1], texts[2]
        if self._starts_new(no_t, in_t):
            self.cur = {
                "snap": self.lv.snapshot(),
                "no": int(no_t) if no_t else self.cur["no"],
                "krit": [], "ind": [],
                "lead": parse_markers(in_t) if in_t else [],
                "parts": {s: [] for s in "43210"},
                "after_heading": self.after_heading,
            }
            self.after_heading = False
            self.records.append(self.cur)
        elif self.cur is None:
            print("peringatan: baris lanjutan tanpa indikator:", texts, file=sys.stderr)
            return
        if kr_t:
            self.cur["krit"].append(kr_t)
        if in_t:
            self.cur["ind"].append(in_t)
        self._put_scores(self.cur, row)

    @staticmethod
    def _put_scores(rec, row):
        for cell in row.origin_cells():
            if cell.col < 3 or not cell.text:
                continue
            last = min(cell.col + cell.colspan, N_COLS) - 1
            for c in range(cell.col, last + 1):                # sel merge -> ke SETIAP kolom skor yang dicakup
                rec["parts"][SCORE_OF_COL[c]].append(cell.text)

    # -- rakit hasil akhir
    def finalize(self):
        last_krit = None
        for r in self.records:
            if r["after_heading"]:
                last_krit = None
            m = KRIT_SKOR_RE.search(" ".join(r["krit"]))
            full = " ".join(r["krit"])
            clean, ssf = (full[:m.start()].strip(), m.group(1).strip()) if m else (full.strip(), None)
            if clean:
                last_krit = clean
            r["sub_kriteria"], r["ssf"] = clean or last_krit, ssf

        groups = {}
        for r in self.records:
            groups.setdefault(r["no"], []).append(r)

        out = []
        for r in self.records:
            grp = groups[r["no"]]
            multi = len(grp) > 1
            ssf = next((g["ssf"] for g in grp if g["ssf"]), None)
            ind, sub_no = " ".join(r["ind"]), None
            if multi:
                m = re.match(r"^\s*([IVXLCDM]+|[A-Z])\.\s+", ind)
                if m:
                    sub_no, ind = m.group(1), ind[m.end():]

            formula = None                                     # dari tiap sel sendiri, bukan hasil gabungan
            for s in "34210":
                found = [f for p in r["parts"][s] for f in SKOR_RE.findall(p)]
                if found:
                    formula = " ; ".join(found)
                    break

            score_type = "composite" if (ssf or multi) else ("quantitative" if formula else "qualitative")
            refs = []
            for txt in [ind] + [p for s in "43210" for p in r["parts"][s]]:
                for ref in LKPS_RE.findall(txt):
                    ref = norm(ref)
                    if ref not in refs:
                        refs.append(ref)

            rec = {
                **r["snap"],
                "sub_kriteria": r["sub_kriteria"],
                "no": r["no"],
                "sub_no": sub_no,
                "indikator": ind,
                "score_type": score_type,
                "score_criteria": {s: " ".join(r["parts"][s]) for s in "43210"},
                "formula": formula,
                "lkps_table_ref": refs,
                "sub_score_formula": ssf,
            }
            out.append(json.loads(json.dumps(rec), object_hook=lambda d: {
                k: (clean_text(v) if isinstance(v, str) else v) for k, v in d.items()}))
        return out


# ======================================================================
# ENTRY POINT -- satu-satunya tambahan di luar notebook
# ======================================================================


def parse_matrix_mineru(pdf_path: Path, work_dir: Path, page_start: int = PAGE_START) -> list[dict]:
    """PDF matriks penilaian -> list record indikator (lihat Chunker.finalize).

    Setiap record: kelompok, kriteria, IKU, sub_kriteria, no, sub_no, indikator,
    score_type, score_criteria {"4".."0"}, formula, lkps_table_ref, sub_score_formula.
    Sama dengan isi `<nama>_indikator.json` di notebook.
    """
    if mineru_service.service_enabled():
        # MinerU 4.x di container `mineru` -- keluaran yang sama dengan notebook.
        markdown = mineru_service.parse_pdf(Path(pdf_path), start_page=page_start)
    else:
        # Cadangan: MinerU 3.4.5 in-process. DIUKUR lebih buruk pada matriks LAM Teknik:
        # 55 dari 60 butir dan urutan level hierarki salah (kode yang sama pada keluaran
        # 4.0.8 menghasilkan 60 dari 60) -- pakai hanya bila service tidak tersedia.
        md_path = mineru_extract(Path(pdf_path), Path(work_dir), start_page=page_start - 1)
        markdown = md_path.read_text(encoding="utf-8")
    # notebook: (OUT_DIR / f"{name}.md").write_text("\n\n".join(blocks) + "\n")  # hanya tabel
    tables_md = "\n\n".join(table_blocks(markdown)) + "\n"
    chunker = Chunker()
    for tbl_row in iter_rows(tables_md):
        chunker.feed(tbl_row)
    return chunker.finalize()
