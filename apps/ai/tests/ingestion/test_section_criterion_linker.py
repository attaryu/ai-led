"""Pencocokan jangkar Panduan <-> matriks (ingestion/section_criterion_linker.py).
Bagian murni saja -- tanpa Postgres. Data meniru Panduan/Rubrik LAM Teknik asli."""

from ingestion.section_criterion_linker import Group, Template, match_anchors, normalize_title

KRITERIA = [
    "I. Diferensiasi Misi (Visi, Misi, Tujuan, dan Strategi)",
    "II. Akuntabilitas",
    "III. Relevansi Pendidikan, Penelitian, dan PkM",
    "IV. Sumber Daya Manusia",
    "V. Sarana, Prasarana, dan Keselamatan Kesehatan Kerja dan Lingkungan (K3L)",
    "VI. Mahasiswa dan Luaran Mahasiswa",
    "VII. Sistem Penjaminan Mutu",
]
JUDUL_C = [
    "Diferensiasi Misi (Visi, Misi, Tujuan, dan Strategi)",
    "Akuntabilitas",
    "Relevansi Pendidikan, Penelitian, dan PkM",
    "Sumber Daya Manusia",
    "Sarana, Prasarana, dan Keselamatan Kesehatan Kerja dan Lingkungan (K3L)",
    "Mahasiswa dan Luaran Mahasiswa",
    "Sistem Penjaminan Mutu",
]


def _tree(judul_c=JUDUL_C):
    t = [
        Template("A", None, 1, "Struktur Tim Penyusun dan Mekanisme Kerja"),
        Template("B", None, 2, "Analisis Lingkungan Eksternal dalam Pengembangan UPPS dan Prodi"),
        Template("C", None, 3, "Kriteria Akreditasi"),
    ]
    for i, j in enumerate(judul_c, start=1):
        t.append(Template(f"C{i}", "C", i, j))
        # sub-bab generik berjudul kembar di tiap Kriteria -- tidak boleh ikut dicocokkan
        t.append(Template(f"C{i}-kebijakan", f"C{i}", 2, "Kebijakan"))
    return t


def _groups():
    g = [Group("KA", None, "KELOMPOK", 1, "A. KRITERIA"),
         Group("KB", None, "KELOMPOK", 2, "B. PROGRAM PENGEMBANGAN BERKELANJUTAN",
               indicator_text="Analisis Lingkungan Eksternal dalam Pengembangan UPPS dan Prodi serta analisis SWOT "
                              "Tujuan Strategis Pengembangan Program Pengembangan Berkelanjutan")]
    for i, k in enumerate(KRITERIA, start=1):
        g.append(Group(f"K{i}", "KA", "KRITERIA", i, k))
    return g


def test_normalize_strips_numbering_and_polluted_tail():
    assert normalize_title("IV. Sumber Daya Manusia") == "sumber daya manusia"
    assert normalize_title("4.1 Profil Dosen") == "profil dosen"
    assert normalize_title("Sarana, Prasarana (K3L) 1. Latar belakang") == "sarana prasarana k3l"


def test_kriteria_matched_by_title_and_children_never_matched():
    links = {l.group_id: l for l in match_anchors(_tree(), _groups())}
    for i in range(1, 8):
        assert links[f"K{i}"].template_id == f"C{i}"
        assert links[f"K{i}"].method == "JUDUL_SAMA" and links[f"K{i}"].status == "OTOMATIS"
    assert not any(l.template_id.endswith("-kebijakan") for l in links.values())


def test_polluted_title_still_matches():
    judul = list(JUDUL_C)
    judul[4] += " 1. Latar belakang"
    links = {l.group_id: l for l in match_anchors(_tree(judul), _groups())}
    assert links["K5"].template_id == "C5" and links["K5"].method == "JUDUL_SAMA"


def test_kelompok_b_matched_by_indicator_keywords():
    links = {l.group_id: l for l in match_anchors(_tree(), _groups())}
    assert links["KB"].template_id == "B"
    assert links["KB"].method == "KEYWORD_INDIKATOR" and links["KB"].status == "PERLU_TINJAU"
    assert links["KB"].confidence >= 0.5
    assert "KA" not in links  # kelompok A wadah tanpa indikator langsung


def test_kelompok_without_clear_winner_is_left_unlinked():
    groups = _groups()
    groups[1].indicator_text = "Hal yang sama sekali tidak terkait apa pun"
    assert "KB" not in {l.group_id for l in match_anchors(_tree(), groups)}


def test_urutan_fallback_when_title_differs_but_counts_and_positions_agree():
    judul = list(JUDUL_C)
    judul[2] = "Judul Yang Sama Sekali Berbeda"
    links = {l.group_id: l for l in match_anchors(_tree(judul), _groups())}
    assert links["K3"].template_id == "C3"
    assert links["K3"].method == "URUTAN" and links["K3"].status == "PERLU_TINJAU"


def test_urutan_skipped_when_counts_differ():
    judul = list(JUDUL_C[:-1])  # 6 template vs 7 kriteria
    judul[2] = "Judul Yang Sama Sekali Berbeda"
    links = {l.group_id for l in match_anchors(_tree(judul), _groups())}
    assert "K3" not in links


def test_confirmed_rows_are_not_overwritten():
    links = match_anchors(_tree(), _groups(), frozenset({"C2"}), frozenset({"K2"}))
    assert "K2" not in {l.group_id for l in links} and "C2" not in {l.template_id for l in links}


def test_duplicate_title_picks_shallowest_and_flags_review():
    t = _tree() + [Template("deep", "C1", 9, "Akuntabilitas")]
    link = next(l for l in match_anchors(t, _groups()) if l.group_id == "K2")
    assert link.template_id == "C2" and link.status == "PERLU_TINJAU"
