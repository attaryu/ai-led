"""Tests for ingestion.panduan_chunker -- deterministic (no LLM)
BAB/sub-bab/sub-sub-bab structure extraction, ported from dimas's
MineruChunker (commit 57a55b0) and adapted to feed off MinerU's markdown
output the same way ingestion.evidence_mineru already does for evidence
docs (see the module's own docstring).

The ported MineruChunker/Node/pattern-matching internals are trusted,
notebook-derived, unmodified code -- these tests focus on what's actually
NEW here: the dev-v1-specific facade (_bab_list_from_nodes, depth-3
collapsing, Daftar-Isi/TOC-leader exclusion, extract_panduan_structure).
A light end-to-end smoke test covers the ported parser too, since nothing
here was previously exercised against a synthetic fixture at all.
"""

from __future__ import annotations

from unittest.mock import patch

from ingestion.panduan_chunker import (
    MineruChunker,
    _bab_list_from_nodes,
    _is_bab_marker,
    _looks_like_toc_entry,
    detect_lkps,
    extract_panduan_structure,
    normalize_lkps_sheet,
)

REALISTIC_MD = """INSTRUMEN PEDOMAN PENYUSUNAN LAPORAN EVALUASI DIRI

DAFTAR ISI

BAB I. PENDAHULUAN....1
BAB II. LAPORAN EVALUASI DIRI....5

BAB I. PENDAHULUAN

A. Rasional

Akreditasi Program Studi (APS) bertujuan untuk menilai dan memberikan jaminan mutu.

B. Peran Evaluasi Diri

Evaluasi diri berperan penting dalam proses akreditasi program studi.

BAB II. LAPORAN EVALUASI DIRI

A. Struktur Tim Penyusun

Tim penyusun LED dibentuk oleh pimpinan program studi.

B. Analisis Lingkungan Eksternal

Analisis lingkungan eksternal mencakup peluang dan tantangan.

C. Kriteria Akreditasi

Kriteria akreditasi terdiri dari beberapa aspek berikut ini secara umum.

C.1 Diferensiasi Misi

Diferensiasi misi mencakup visi, misi, tujuan, dan strategi program studi.

C.1.1 Sub sub sub detail

Ini seharusnya digabung ke C.1, bukan jadi node terpisah.

C.2 Akuntabilitas

Akuntabilitas mencakup transparansi pengelolaan program studi.
"""


def _parse(md: str):
    c = MineruChunker()
    c.parse(md)
    return c.nodes


def test_is_bab_marker():
    assert _is_bab_marker("BAB I") is True
    assert _is_bab_marker("BAB XIV") is True
    assert _is_bab_marker("C.1") is False
    assert _is_bab_marker("A") is False
    assert _is_bab_marker(None) is False


def test_looks_like_toc_entry():
    assert _looks_like_toc_entry("PENDAHULUAN....1") is True
    assert _looks_like_toc_entry("PENDAHULUAN     12") is True
    assert _looks_like_toc_entry("PENDAHULUAN") is False
    assert _looks_like_toc_entry("Kurikulum 2020") is False  # single space, not a leader


def test_bold_only_heading_without_markdown_hash_is_still_detected():
    """Real prod case: bold-only heading, no '#' -- used to detect zero BAB."""
    md = """**BAB I. PENDAHULUAN**

A. Rasional

Teks rasional di sini.

**BAB II. TUJUAN DAN MAKNA EVALUASI DIRI**

A. Tujuan Evaluasi Diri

Teks tujuan di sini.
"""
    bab_list = _bab_list_from_nodes(_parse(md))
    assert [b["title"] for b in bab_list] == ["PENDAHULUAN", "TUJUAN DAN MAKNA EVALUASI DIRI"]


def test_single_star_bullet_still_rejected_as_heading():
    """Full '**bold**' wrap gets stripped, but a single-star bullet must not."""
    md = """# BAB I. PENDAHULUAN

* bukan heading, ini bullet list
* item kedua
"""
    nodes = _parse(md)
    assert [n.marker for n in nodes] == ["BAB I"]


def test_toc_leader_survives_truncated_page_number_and_is_still_excluded():
    """Real prod case: irregular dot-spacing in a ToC leader truncates the page number, so the phantom BAB used to survive as a dup."""
    md = """**DAFTAR ISI**

BAB I. PENDAHULUAN.. .. 1
A. Rasional.. .. 1

**BAB I. PENDAHULUAN**

A. Rasional

Teks rasional sungguhan.

**BAB II. TUJUAN DAN MAKNA EVALUASI DIRI**

A. Tujuan Evaluasi Diri

Teks tujuan sungguhan.
"""
    bab_list = _bab_list_from_nodes(_parse(md))
    assert [b["title"] for b in bab_list] == ["PENDAHULUAN", "TUJUAN DAN MAKNA EVALUASI DIRI"]
    # The ToC's phantom "A. Rasional.." sub-item didn't leak into either BAB.
    assert [s["title"] for s in bab_list[0]["subbab"]] == ["Rasional"]
    assert [s["title"] for s in bab_list[1]["subbab"]] == ["Tujuan Evaluasi Diri"]


def test_chunker_resolves_bab_subbab_subsubbab_levels():
    nodes = _parse(REALISTIC_MD)
    by_marker = {n.marker: n for n in nodes if not _looks_like_toc_entry(n.title)}

    assert by_marker["BAB I"].level == 1
    assert by_marker["BAB II"].level == 1
    assert by_marker["A"].level == 2  # last "A" node (BAB II's), same level as BAB I's
    assert by_marker["C"].level == 2
    assert by_marker["C.1"].level == 3
    assert by_marker["C.1"].parent_id == by_marker["C"].id


def test_bab_list_excludes_toc_leader_phantom_entries():
    """The Daftar Isi block's "BAB I. PENDAHULUAN....1" line matches the
    exact same BAB pattern as a real heading and gets promoted as its own
    node (plain-text "Daftar Isi" itself never becomes a titled node to
    exclude by name) -- _looks_like_toc_entry is what actually has to catch
    this, not _exclude_daftar_isi."""
    bab_list = _bab_list_from_nodes(_parse(REALISTIC_MD))
    assert [b["title"] for b in bab_list] == ["PENDAHULUAN", "LAPORAN EVALUASI DIRI"]


def test_bab_list_nests_subbab_and_subsubbab_with_real_content():
    bab_list = _bab_list_from_nodes(_parse(REALISTIC_MD))
    bab2 = bab_list[1]
    assert [s["title"] for s in bab2["subbab"]] == [
        "Struktur Tim Penyusun", "Analisis Lingkungan Eksternal", "Kriteria Akreditasi",
    ]
    kriteria = bab2["subbab"][2]
    # dimas pedoman_text: breadcrumb (ancestor "marker title" per line) + blank line + content
    assert kriteria["guidance"] == (
        "BAB II LAPORAN EVALUASI DIRI\nC Kriteria Akreditasi\n\n"
        "Kriteria akreditasi terdiri dari beberapa aspek berikut ini secara umum."
    )
    assert [s["title"] for s in kriteria["subbab"]] == ["Diferensiasi Misi", "Akuntabilitas"]

    diferensiasi = kriteria["subbab"][0]
    assert "Diferensiasi misi mencakup visi, misi, tujuan" in diferensiasi["guidance"]


def test_deeper_levels_become_their_own_sections_like_dimas():
    """dimas process_panduan_file: every node under a BAB is a section at any depth, pedoman =
    breadcrumb + that node's OWN content (not merged into an ancestor)."""
    md = """BAB I. LAPORAN EVALUASI DIRI

A. Kriteria

Pengantar kriteria.

A.1 Visi Misi

Isi A.1.

1. Keunikan Visi

Isi level empat.

a) Rumusan

Isi level lima.
"""
    bab = _bab_list_from_nodes(_parse(md))[0]
    c = bab["subbab"][0]
    c1 = c["subbab"][0]
    lvl4 = c1["subbab"][0]
    lvl5 = lvl4["subbab"][0]
    assert (c1["title"], lvl4["title"], lvl5["title"]) == ("Visi Misi", "Keunikan Visi", "Rumusan")
    assert lvl5["guidance"] == (
        "BAB I LAPORAN EVALUASI DIRI\nA Kriteria\nA.1 Visi Misi\n1 Keunikan Visi\na) Rumusan\n\nIsi level lima."
    )
    assert "Isi level empat" not in c1["guidance"]  # own content only, nothing folded upward


def test_stacked_marker_stub_uses_marker_as_title():
    """Real Panduan: '## d) I. Prestasi ...' -> stub 'd)' (no title) + child 'I. Prestasi ...'."""
    md = """BAB I. LAPORAN EVALUASI DIRI

A. Mahasiswa

## d) I. Prestasi mahasiswa di bidang akademik

Isi akademik.

## II. Prestasi mahasiswa di bidang non akademik

Isi non akademik.
"""
    stub = _bab_list_from_nodes(_parse(md))[0]["subbab"][0]["subbab"][0]
    assert stub["title"] == "d)"
    assert [s["title"] for s in stub["subbab"]] == [
        "Prestasi mahasiswa di bidang akademik", "Prestasi mahasiswa di bidang non akademik",
    ]


def test_bab_order_follows_document_order_not_roman_numeral_value():
    bab_list = _bab_list_from_nodes(_parse(REALISTIC_MD))
    assert [b["order"] for b in bab_list] == [1, 2]


def test_extract_panduan_structure_uses_mineru_then_chunks_it(tmp_path):
    out_dir = tmp_path / "mineru_out"
    real_md_path = tmp_path / "panduan.md"
    real_md_path.write_text(REALISTIC_MD, encoding="utf-8")

    pdf_path = tmp_path / "panduan.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 fake")

    with patch("ingestion.evidence_mineru.mineru_extract", return_value=real_md_path) as mock_extract:
        bab_list = extract_panduan_structure(pdf_path, out_dir)

    mock_extract.assert_called_once()
    assert mock_extract.call_args.kwargs["start_page"] == 3  # Dimas: skip the first 3 (cover) pages
    assert [b["title"] for b in bab_list] == ["PENDAHULUAN", "LAPORAN EVALUASI DIRI"]


def test_normalize_lkps_sheet_strips_punctuation_and_lowercases():
    assert normalize_lkps_sheet("2a.1") == "2a1"
    assert normalize_lkps_sheet("4/B") == "4b"
    assert normalize_lkps_sheet("Daftar Tabel") == "daftartabel"


def test_detect_lkps_requires_both_table_reference_and_lkps_word():
    assert detect_lkps("Jelaskan rasio dosen (Tabel 2.a LKPS) terhadap mahasiswa.") == {
        "needs_lkps": True,
        "tables": ["2a"],
    }
    # "Tabel" without "LKPS" -- e.g. a plain in-document table reference.
    assert detect_lkps("Lihat Tabel 3 untuk rincian.") == {"needs_lkps": False, "tables": []}
    # "LKPS" mentioned without any "Tabel <token>" clause.
    assert detect_lkps("Data ini bersumber dari LKPS program studi.") == {
        "needs_lkps": False, "tables": [],
    }
    assert detect_lkps("Jelaskan proses penyusunan visi program studi.") == {
        "needs_lkps": False, "tables": [],
    }


def test_detect_lkps_extracts_multiple_comma_separated_tables():
    result = detect_lkps("Jelaskan Tabel 2a, 2b dan 3 LKPS terkait kinerja dosen.")
    assert result["needs_lkps"] is True
    assert result["tables"] == ["2a", "2b", "3"]


def test_bab_list_attaches_lkps_needed_from_guidance_text():
    md = REALISTIC_MD.replace(
        "Diferensiasi misi mencakup visi, misi, tujuan, dan strategi program studi.",
        "Diferensiasi misi mencakup visi, misi, tujuan (Tabel 2.a LKPS) dan strategi program studi.",
    )
    bab_list = _bab_list_from_nodes(_parse(md))
    kriteria = bab_list[1]["subbab"][2]
    assert kriteria["lkps_needed"] is False
    assert kriteria["lkps_list"] == []
    diferensiasi = kriteria["subbab"][0]
    assert diferensiasi["lkps_needed"] is True
    assert diferensiasi["lkps_list"] == ["2a"]


def test_parts_outside_bab_and_bab_less_panduan_are_kept():
    """dimas: every node is a section. A part outside any BAB (and a Panduan with no BAB at all) becomes its own
    chapter holding itself as the one section, instead of being dropped / failing the extraction."""
    md = """RINGKASAN EKSEKUTIF

A. Ringkasan

Tulis ringkasan.

BAB I. PENDAHULUAN

A. Rasional

Isi rasional.
"""
    bab_list = _bab_list_from_nodes(_parse(md))
    # Chunker (identical to dimas) nests the BAB under "A. Ringkasan"; nothing is lost either way.
    assert [b["title"] for b in bab_list] == ["Ringkasan", "PENDAHULUAN", "Rasional"]
    assert bab_list[0]["subbab"][0]["subbab"] == []
    assert bab_list[0]["subbab"][0]["guidance"].endswith("Tulis ringkasan.")

    no_bab = _bab_list_from_nodes(_parse("A. Rasional\n\nIsi.\n\nB. Peran\n\nIsi peran.\n"))
    assert [b["title"] for b in no_bab] == ["Rasional", "Peran"]
    assert no_bab[1]["subbab"][0]["title"] == "Peran"


def test_bab_intro_text_is_kept_as_chapter_guidance():
    """dimas keeps the BAB row's own isi_teks (visible, not generatable)."""
    md = "BAB I. PENDAHULUAN\n\nPengantar bab ini.\n\nA. Rasional\n\nIsi rasional.\n"
    bab = _bab_list_from_nodes(_parse(md))[0]
    assert bab["guidance"] == "BAB I PENDAHULUAN\n\nPengantar bab ini."
    assert _bab_list_from_nodes(_parse("BAB I. PENDAHULUAN\n\nA. Rasional\n\nIsi rasional.\n"))[0]["guidance"] is None
