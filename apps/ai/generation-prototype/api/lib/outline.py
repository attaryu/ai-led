"""Outline section LED — dibangun dari led_bab_tabel.json.

Tiap heading (BAB / sub_bab / sub_sub_bab / subsub_num / list_*) di JSON jadi
satu section di sini, lengkap dengan field hierarki supaya UI bisa
menampilkannya sebagai pohon berkesinambungan:

    id          : stable ID (slug dari path marker)
    title       : judul polos heading
    full_title  : "marker + title" (utk display utuh)
    marker      : "BAB I", "C.1.", "a)", "iii", dsb.
    level       : level hierarki (bab, sub_bab, ...)
    depth       : 0..9 — kedalaman di pohon (utk indentasi UI)
    parent_id   : id parent, atau None utk root
    page        : halaman di PDF (untuk navigasi)
    breadcrumb  : list of {marker, title} dari root ke node ini
"""
from __future__ import annotations

import json
import os
import re
from typing import List, Dict, Optional

LED_STRUCT_PATH = os.environ.get("LED_STRUCT_PATH", "/data/led_bab_tabel.json")
CHUNKS_PATH     = os.environ.get("CHUNKS_PATH", "/data/chunks_all.json")

LEVELS_ORDER = [
    "bab", "sub_bab", "sub_sub_bab", "subsub_num",
    "list_num", "list_dot", "list_alpha", "list_alpha_dot",
    "list_roman_up", "list_roman_lo",
]
LEVEL_DEPTH = {lv: i for i, lv in enumerate(LEVELS_ORDER)}


def _slug_marker(marker: str) -> str:
    """Ubah marker jadi token aman buat ID. 'C.1.' -> 'C1', 'BAB II' -> 'BAB-II'."""
    s = marker.strip()
    s = s.replace(" ", "-")
    s = re.sub(r"[^A-Za-z0-9\-]", "", s)
    return s or "_"


def _build_sections() -> List[Dict]:
    """Baca led_bab_tabel.json, kembalikan list section flat namun urut hierarkis."""
    if not os.path.exists(LED_STRUCT_PATH):
        return []
    data = json.load(open(LED_STRUCT_PATH, encoding="utf-8"))
    headings = data.get("headings", [])

    # bangun id stable lewat path marker. Stack[level] = id terakhir di level itu,
    # supaya parent_id bisa di-resolve dari level satu tingkat di atas.
    stack: Dict[str, str] = {}     # level -> id node terakhir di level itu
    parent_stack: List[str] = []   # urutan id parent yang masih hidup, dari root

    out: List[Dict] = []
    seen_ids: Dict[str, int] = {}  # untuk dedup kalau ada marker duplikat

    for h in headings:
        level   = h["level"]
        marker  = h["marker"]
        title   = h.get("title", "")
        page    = h.get("page", 0)
        path    = h.get("path", [])
        depth   = LEVEL_DEPTH.get(level, len(LEVELS_ORDER))

        # bangun id dari rangkaian marker path + marker sendiri
        chain_markers = [p["marker"] for p in path] + [marker]
        base_id = ".".join(_slug_marker(m) for m in chain_markers)
        # jika ada duplikat (mis. marker 'a)' muncul dua kali di sub_bab yg sama),
        # tambahkan suffix #2, #3, ...
        n = seen_ids.get(base_id, 0) + 1
        seen_ids[base_id] = n
        sid = base_id if n == 1 else f"{base_id}#{n}"

        # parent_id: id terakhir di level yang lebih dangkal dari ini
        parent_id: Optional[str] = None
        for ancestor_level in LEVELS_ORDER[:depth]:
            if ancestor_level in stack:
                parent_id = stack[ancestor_level]
        # reset stack di level >= current sebelum menyimpan diri
        for lv in list(stack.keys()):
            if LEVEL_DEPTH[lv] >= depth:
                del stack[lv]
        stack[level] = sid

        breadcrumb = [{"marker": p["marker"], "title": p.get("title", "")} for p in path]

        # `retrieval_query`: gabungan breadcrumb + diri sendiri, multi-baris.
        # Format ini SENGAJA seperti title lama (mis.
        #   "BAB II. STRUKTUR LAPORAN EVALUASI DIRI\nC.3. ...\n3.3. ...\niii. ...")
        # supaya query embedding ke Chroma kaya konteks dan retrieval
        # mengembalikan chunk yang relevan — kalau cuma "iii Proses tinjauan
        # rutin RPS" saja embeddingnya terlalu pendek/ambigu.
        #
        # SEMPAT dicoba dibalik (diri sendiri dulu, breadcrumb belakang) utk
        # perbaiki kasus top-1 search_pedoman yg salah section -- terbukti
        # membantu di 1 kasus TAPI tidak menyelesaikan akar masalahnya:
        # breadcrumb section itu sendiri (mis. BAB-II.C.C1.153) TERNYATA
        # melompati level induk langsung (.15, yg py title lengkap "Strategi
        # perbaikan dan pengembangan (Menggunakan Analisis SWOT)"), jadi
        # query kehilangan kata kunci pembeda terlepas dari urutan. Fix
        # urutan DIKEMBALIKAN ke lama -- perbaikan sebenarnya ada di sisi
        # search_pedoman (k=5 + sorting/filter, lihat generator.py
        # _retrieve_rules), bukan di sini.
        chain_for_query = breadcrumb + [{"marker": marker, "title": title}]
        retrieval_query = "\n".join(
            f"{c['marker']} {c['title']}".strip() for c in chain_for_query if c['marker']
        )

        out.append({
            "id":         sid,
            "title":      title,
            "marker":     marker,
            "full_title": f"{marker} {title}".strip(),
            "retrieval_query": retrieval_query,
            "level":      level,
            "depth":      depth,
            "page":       page,
            "parent_id":  parent_id,
            "breadcrumb": breadcrumb,
            # field rubric_filter dipertahankan untuk kompatibilitas lama
            # (generator.py memakainya untuk filter chunk source=matrik).
            # Heuristik: kalau ada sub_bab di breadcrumb, jadikan filter.
            "rubric_filter": _derive_rubric_filter(breadcrumb, level, marker),
        })
    return out


def _derive_rubric_filter(breadcrumb: List[Dict], level: str, marker: str) -> Dict:
    """Heuristik filter rubric berdasarkan posisi di pohon.

    Format yang dipakai generator lama: {"sub_bab": "I. ..."} atau {"bab": None}.
    Kita pakai marker sub_sub_bab (C.1., C.2., dst) untuk filter rubric.
    """
    for crumb in breadcrumb:
        m = crumb["marker"]
        # C.1. → "I. ...", C.2. → "II. ...", dst
        match = re.match(r"^C\.(\d+)\.$", m)
        if match:
            n = int(match.group(1))
            roman = ["I","II","III","IV","V","VI","VII"][n-1] if 1 <= n <= 7 else str(n)
            return {"sub_bab": f"{roman}."}
    return {"bab": None}


# cache di module-load (kecil, ~210 entries)
_SECTIONS: List[Dict] = _build_sections()


def get_sections() -> List[Dict]:
    return _SECTIONS


def get_section(section_id: str) -> Optional[Dict]:
    for s in _SECTIONS:
        if s["id"] == section_id:
            return s
    return None


def load_pedoman_for_section(section_id: str) -> List[Dict]:
    """Ambil chunks pedoman yang relevan utk section."""
    if not os.path.exists(CHUNKS_PATH):
        return []
    chunks = json.load(open(CHUNKS_PATH, encoding="utf-8"))
    section = get_section(section_id)
    if not section:
        return []
    # match by marker pieces — pakai marker top-level di path + marker sendiri
    tokens = [c["marker"] for c in section["breadcrumb"]] + [section["marker"]]
    out = []
    for c in chunks:
        if c["metadata"].get("source") != "pedoman":
            continue
        meta = c["metadata"]
        joined = " ".join(str(v) for v in meta.values() if v)
        if any(t and t in joined for t in tokens):
            out.append(c)
    return out
