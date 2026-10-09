from ingestion.lkps_chunker import process_lkps_file


def _workbook(tmp_path, sheets: dict[str, list[list]]):
    import openpyxl

    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(name)
        for row in rows:
            ws.append(row)
    p = tmp_path / "lkps.xlsx"
    wb.save(p)
    return p


def test_one_chunk_per_sheet(tmp_path):
    p = _workbook(
        tmp_path,
        {
            "4a": [["Nama", "Jabatan"], ["Budi", "Dosen"], ["Sari", "Dosen"]],
            "5a": [["Tahun", "Jumlah"], [2024, 10], [2025, 12]],
        },
    )
    chunks = process_lkps_file(p)

    assert {c["chunk_id"] for c in chunks} == {"4a", "5a"}
    assert {c["sheet"] for c in chunks} == {"4a", "5a"}
    chunk_4a = next(c for c in chunks if c["chunk_id"] == "4a")
    assert "Budi" in chunk_4a["text"]
    assert "Sari" in chunk_4a["text"]


def test_indexes_navigation_sheets_like_dimas(tmp_path):
    p = _workbook(
        tmp_path,
        {
            "Menu": [["Daftar isi"], ["4a"], ["5a"]],
            "4a": [["Nama"], ["Budi"]],
        },
    )
    chunks = process_lkps_file(p)

    assert {c["chunk_id"] for c in chunks} == {"Menu", "4a"}


def test_empty_sheet_produces_no_chunk(tmp_path):
    p = _workbook(tmp_path, {"kosong": []})
    chunks = process_lkps_file(p)

    assert chunks == []


class _DF:
    def __init__(self, kolom):
        self.columns = kolom


def test_teks_embedding_hanya_judul_dan_nama_kolom():
    from ingestion.lkps_chunker import teks_embedding

    hasil = teks_embedding(
        "Tabel 4.f) Luaran Penelitian dan PkM oleh DTPS | Tabel 4.f) Bagian-3 Teknologi Tepat Guna, Produk",
        [_DF(["No", "Luaran Penelitian dan PkM", "Tanggal (HH/BB/TTTT)", "Unnamed: 4"])],
    )
    assert hasil == (
        "Luaran Penelitian dan PkM oleh DTPS Bagian Teknologi Tepat Guna Produk.\n"
        "berisi: Luaran Penelitian dan PkM, Tanggal (HH/BB/TTTT)."
    )


def test_teks_embedding_kolom_antar_subtabel_tanpa_duplikat():
    from ingestion.lkps_chunker import teks_embedding

    hasil = teks_embedding("2a1", [_DF(["A", "B"]), _DF(["B", "C"])])
    assert hasil == "2a1.\nberisi: A, B, C."
