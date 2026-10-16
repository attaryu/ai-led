"""Jangkar penghubung Panduan <-> matriks penilaian (tabel
set_section_criterion_links).

Hanya JANGKAR yang dicocokkan -- section Panduan yang judulnya sama dengan
sebuah Kriteria (mis. "Akuntabilitas" <-> "II. Akuntabilitas"), plus Kelompok
yang punya indikator langsung (mis. B). Sub-bab di bawah jangkar tidak punya
baris: pembaca mewarisi lewat sub_bab_templates.parent_id. Jangkar tidak
ditemukan lewat `marker` (4 dari 6 Panduan uji tidak punya marker sama sekali)
melainkan lewat judul yang sudah dinormalisasi.

Bagian murni (normalisasi, pencocokan) dipisah dari I/O supaya bisa diuji tanpa
Postgres; `relink_for_set` / `relink_for_guide` dipanggil dari akhir ekstraksi
rubrik dan konfirmasi struktur Panduan.
"""

from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass
from typing import Optional

from db.connection import tenant_cursor

logger = logging.getLogger(__name__)

# Ambang pencocokan keyword (Kelompok <-> template level atas): porsi kata
# bermakna judul template yang muncul di teks sub-kriteria indikator Kelompok,
# dan pemenang harus jelas unggul dari runner-up. Di data uji (B) skornya 1.0
# melawan 0.0 untuk template lain.
KEYWORD_MIN_SCORE = 0.5
KEYWORD_MIN_MARGIN = 2.0
_MIN_TOKEN_LEN = 4

_TAIL_NUMBERING = re.compile(r"\s+\d+[.)]\s.*$")
_HEAD_NUMBERING = re.compile(r"^\s*([IVX]+|[A-Z]\.[0-9]+|[0-9]+(\.[0-9]+)*|[A-Z])[.)]?\s+")
_NON_ALNUM = re.compile(r"[^a-zA-Z0-9]+")


def normalize_title(text: str) -> str:
    """Kunci pencocokan: buang ekor/awalan bernomor, huruf kecil, tanda baca -> spasi.
    Judul asli tidak diubah -- ekstraksi kadang menempelkan "1. Latar belakang"
    di ekor judul (mis. C.5)."""
    text = _TAIL_NUMBERING.sub("", text or "")
    text = _HEAD_NUMBERING.sub("", text)
    return _NON_ALNUM.sub(" ", text).lower().strip()


def _tokens(text: str) -> set[str]:
    return {t for t in _NON_ALNUM.sub(" ", (text or "").lower()).split() if len(t) >= _MIN_TOKEN_LEN}


@dataclass
class Template:
    id: str
    parent_id: Optional[str]
    order: int
    title: str


@dataclass
class Group:
    id: str
    parent_id: Optional[str]
    level: str
    order: int
    label: str
    indicator_text: str = ""  # gabungan criterion_group indikator LANGSUNG di grup ini


@dataclass
class Link:
    template_id: str
    group_id: str
    method: str  # JUDUL_SAMA | KEYWORD_INDIKATOR | URUTAN
    confidence: Optional[float]
    status: str  # OTOMATIS | PERLU_TINJAU


def _depth(t: Template, by_id: dict[str, Template]) -> int:
    d, cur = 0, t
    while cur.parent_id and cur.parent_id in by_id:
        d, cur = d + 1, by_id[cur.parent_id]
    return d


def match_anchors(
    templates: list[Template],
    groups: list[Group],
    taken_templates: frozenset[str] = frozenset(),
    taken_groups: frozenset[str] = frozenset(),
) -> list[Link]:
    """Hitung tautan jangkar. `taken_*` = template/grup yang sudah dipegang baris
    DIKONFIRMASI/MANUAL -- dilewati, tidak ditimpa."""
    by_id = {t.id: t for t in templates}
    links: list[Link] = []
    used_t: set[str] = set(taken_templates)
    used_g: set[str] = set(taken_groups)

    kriteria = sorted((g for g in groups if g.level == "KRITERIA"), key=lambda g: g.order)
    by_title: dict[str, list[Template]] = {}
    for t in templates:
        by_title.setdefault(normalize_title(t.title), []).append(t)

    # Tahap 1 -- judul sama persis.
    for g in kriteria:
        if g.id in used_g:
            continue
        cands = [t for t in by_title.get(normalize_title(g.label), []) if t.id not in used_t]
        if not cands:
            continue
        cands.sort(key=lambda t: (_depth(t, by_id), t.order))
        pick = cands[0]
        links.append(Link(pick.id, g.id, "JUDUL_SAMA", None, "OTOMATIS" if len(cands) == 1 else "PERLU_TINJAU"))
        used_t.add(pick.id)
        used_g.add(g.id)

    # Tahap 2 -- Kelompok dengan indikator langsung (mis. B): overlap kata teks
    # sub-kriteria indikatornya terhadap judul template level atas yang bukan
    # leluhur jangkar Kriteria (itu wadah "Kriteria Akreditasi").
    ancestors: set[str] = set()
    for l in links:
        cur = by_id[l.template_id]
        while cur.parent_id and cur.parent_id in by_id:
            ancestors.add(cur.parent_id)
            cur = by_id[cur.parent_id]
    top = [t for t in templates if t.parent_id is None and t.id not in used_t and t.id not in ancestors]
    for g in groups:
        if g.level != "KELOMPOK" or g.id in used_g or not g.indicator_text.strip():
            continue
        gtok = _tokens(g.indicator_text)
        scored = []
        for t in top:
            ttok = _tokens(t.title)
            if ttok:
                scored.append((len(ttok & gtok) / len(ttok), t))
        scored.sort(key=lambda x: -x[0])
        if not scored or scored[0][0] < KEYWORD_MIN_SCORE:
            continue
        runner = scored[1][0] if len(scored) > 1 else 0.0
        if runner and scored[0][0] / runner < KEYWORD_MIN_MARGIN:
            continue
        pick = scored[0][1]
        links.append(Link(pick.id, g.id, "KEYWORD_INDIKATOR", round(scored[0][0], 3), "PERLU_TINJAU"))
        used_t.add(pick.id)
        used_g.add(g.id)
        top = [t for t in top if t.id != pick.id]

    # Tahap 3 -- urutan, hanya bila jumlahnya persis sama dan posisi jangkar yang
    # sudah cocok konsisten (C.n <-> Kriteria ke-n). Selalu PERLU_TINJAU.
    pending = [g for g in kriteria if g.id not in used_g]
    matched = [l for l in links if l.method == "JUDUL_SAMA"]
    if pending and matched:
        parent_ids = {by_id[l.template_id].parent_id for l in matched}
        if len(parent_ids) == 1:
            siblings = sorted((t for t in templates if t.parent_id == next(iter(parent_ids))), key=lambda t: t.order)
            if len(siblings) == len(kriteria):
                pos_by_tpl = {t.id: i for i, t in enumerate(siblings)}
                pos_by_grp = {g.id: i for i, g in enumerate(kriteria)}
                if all(pos_by_tpl[l.template_id] == pos_by_grp[l.group_id] for l in matched):
                    for g in pending:
                        t = siblings[pos_by_grp[g.id]]
                        if t.id in used_t:
                            continue
                        links.append(Link(t.id, g.id, "URUTAN", None, "PERLU_TINJAU"))
                        used_t.add(t.id)
                        used_g.add(g.id)
    return links


def _load(cur, set_id: str, guide_id: str) -> tuple[list[Template], list[Group]]:
    cur.execute(
        """SELECT s.id, s.parent_id, s."order", s.title
           FROM sub_bab_templates s JOIN chapter_templates c ON c.id = s.chapter_template_id
           WHERE c.guide_id = %s AND s.is_active""",
        (guide_id,),
    )
    templates = [Template(r["id"], r["parent_id"], r["order"], r["title"]) for r in cur.fetchall()]
    cur.execute(
        """SELECT id, parent_id, level, "order", label FROM rubric_criterion_groups
           WHERE accreditation_set_id = %s""",
        (set_id,),
    )
    groups = {r["id"]: Group(r["id"], r["parent_id"], r["level"], r["order"], r["label"]) for r in cur.fetchall()}
    cur.execute(
        """SELECT group_id, criterion_group FROM rubric_criteria
           WHERE accreditation_set_id = %s AND group_id IS NOT NULL""",
        (set_id,),
    )
    for r in cur.fetchall():
        g = groups.get(r["group_id"])
        if g and r["criterion_group"]:
            g.indicator_text += " " + r["criterion_group"]
    return templates, list(groups.values())


def relink_for_set(tenant_id: str, set_id: str) -> Optional[int]:
    """Hitung ulang tautan jangkar satu set. Hanya baris OTOMATIS/PERLU_TINJAU
    yang diganti; DIKONFIRMASI/MANUAL tidak disentuh. Mengembalikan jumlah tautan
    baru, atau None kalau prasyarat belum terpenuhi (Panduan belum dipilih/siap,
    rubrik belum siap) -- bukan error, dipanggil lagi saat prasyarat lain selesai."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """SELECT a.panduan_id, a.criteria_parse_status, g.structure_parse_status
               FROM accreditation_sets a LEFT JOIN guide_references g ON g.id = a.panduan_id
               WHERE a.id = %s""",
            (set_id,),
        )
        row = cur.fetchone()
        if not row or not row["panduan_id"]:
            return None
        if row["criteria_parse_status"] != "SIAP" or row["structure_parse_status"] != "SIAP":
            return None
        templates, groups = _load(cur, set_id, row["panduan_id"])
        if not templates or not groups:
            return None

        cur.execute(
            """SELECT sub_bab_template_id, criterion_group_id FROM set_section_criterion_links
               WHERE accreditation_set_id = %s AND status = 'DIKONFIRMASI'""",
            (set_id,),
        )
        keep = cur.fetchall()
        links = match_anchors(
            templates,
            groups,
            frozenset(r["sub_bab_template_id"] for r in keep),
            frozenset(r["criterion_group_id"] for r in keep),
        )
        cur.execute(
            "DELETE FROM set_section_criterion_links WHERE accreditation_set_id = %s AND status <> 'DIKONFIRMASI'",
            (set_id,),
        )
        for l in links:
            cur.execute(
                """INSERT INTO set_section_criterion_links
                     (id, accreditation_set_id, sub_bab_template_id, criterion_group_id,
                      match_method, confidence, status, updated_at)
                   VALUES (%s, %s, %s, %s, %s::"SectionLinkMethod", %s, %s::"SectionLinkStatus", now())""",
                (str(uuid.uuid4()), set_id, l.template_id, l.group_id, l.method, l.confidence, l.status),
            )
    return len(links)


def relink_for_guide(tenant_id: str, guide_id: str) -> None:
    """Semua set yang memakai Panduan ini (satu Panduan dipakai banyak set)."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute("SELECT id FROM accreditation_sets WHERE panduan_id = %s", (guide_id,))
        set_ids = [r["id"] for r in cur.fetchall()]
    for sid in set_ids:
        relink_for_set(tenant_id, sid)


def safe_relink_for_set(tenant_id: str, set_id: str) -> None:
    """Pembungkus untuk jalur ekstraksi: kegagalan penautan tidak boleh
    menggagalkan ekstraksi yang sudah berhasil."""
    try:
        relink_for_set(tenant_id, set_id)
    except Exception:
        logger.exception("Penautan section-kriteria gagal untuk set %s", set_id)


def safe_relink_for_guide(tenant_id: str, guide_id: str) -> None:
    try:
        relink_for_guide(tenant_id, guide_id)
    except Exception:
        logger.exception("Penautan section-kriteria gagal untuk panduan %s", guide_id)
