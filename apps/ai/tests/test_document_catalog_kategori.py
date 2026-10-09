"""Unit tests for document_catalog_kategori.py -- no Redis/Postgres needed."""


def test_label_unik_global_dan_tiap_kategori_terisi():
    from document_catalog_kategori import catalog_by_category

    semua = [lab.casefold() for labels in catalog_by_category().values() for lab in labels]
    assert len(semua) == len(set(semua))
    assert all(catalog_by_category().values())


def test_baris_prompt_memuat_judul_kategori_dan_label_berkutip():
    from document_catalog_kategori import catalog_lines_for_prompt

    baris = catalog_lines_for_prompt()
    assert "[Penelitian]" in baris
    assert any(b.startswith('"Rencana Induk Penelitian (RIP) Institusi') for b in baris)


def test_parse_items_menerima_entri_lengkap_nama_pendek_dan_label_lama_dan_menolak_karangan():
    from document_catalog import label_only
    from document_catalog_kategori import DOCUMENT_CATALOG_BY_CATEGORY, LABEL_PENUH, parse_items

    penuh = next(e for v in DOCUMENT_CATALOG_BY_CATEGORY.values() for e in v if e.startswith("Pedoman Kurikulum,"))
    # Label kanonik mengikuti sakelar LABEL_PENUH (entri lengkap atau nama pendek).
    kanon = penuh.strip() if LABEL_PENUH else label_only(penuh)
    ok, no = parse_items([
        {"label": penuh, "reason": "r"},
        {"label": '"' + penuh + '"'},  # kutip pembungkus ikut tersalin
        {"label": "Pedoman Kurikulum"},  # nama pendek -> dinormalkan ke label kanonik
        {"label": "Ijasah Dosen"},  # label lama dari document_catalog
        {"label": "dokumen karangan"},
    ])
    assert [a["label"] for a in ok[:3]] == [kanon] * 3
    assert ok[3]["label"] == "Ijasah Dosen"
    assert len(no) == 1
