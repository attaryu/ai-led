"""ingestion/matrix_mineru.py -- port ekstrak_mineru_rubrik.ipynb.

Tabel HTML sintetis (bentuk keluaran MinerU), tanpa MinerU/GPU. Yang diuji
adalah perilaku yang terbukti penting pada matriks LAM Teknik nyata:
hierarki dari baris colspan, sel ter-merge menyebar ke tiap kolom skor, dan
sub-indikator komposit (I., II.) dipecah jadi record sendiri dengan sub_no.
"""
from ingestion.matrix_mineru import Chunker, iter_rows, table_blocks

HEADER = "<tr><td>No</td><td>Kriteria</td><td>Indikator</td><td>4</td><td>3</td><td>2</td><td>1</td><td>0</td></tr>"


def _records(html: str):
    ch = Chunker()
    for row in iter_rows("\n\n".join(table_blocks(html)) + "\n"):
        ch.feed(row)
    return ch.finalize()


def test_hierarchy_from_colspan_rows_and_merged_score_cell():
    html = (
        "<table>" + HEADER
        + '<tr><td colspan="8">A. KRITERIA</td></tr>'
        + '<tr><td colspan="8">I. Diferensiasi Misi</td></tr>'
        + "<tr><td>1</td><td>Kekhasan VMTS</td><td>Pernyataan VMTS. Tabel 1 LKPS.</td>"
        + '<td>skor empat</td><td>skor tiga</td><td colspan="2">skor dua dan satu</td><td>nol</td></tr>'
        + "</table>"
    )
    [rec] = _records(html)
    assert rec["kelompok"] == "A. KRITERIA"
    assert rec["kriteria"] == "I. Diferensiasi Misi"
    assert rec["sub_kriteria"] == "Kekhasan VMTS"
    assert rec["no"] == 1 and rec["sub_no"] is None
    # sel merge dua kolom -> teksnya berlaku untuk KEDUA band (dulu band 2 kosong)
    assert rec["score_criteria"]["2"] == rec["score_criteria"]["1"] == "skor dua dan satu"
    assert rec["lkps_table_ref"] == ["Tabel 1 LKPS"]


def test_composite_indicator_split_into_sub_no_records():
    html = (
        "<table>" + HEADER
        + '<tr><td>4</td><td rowspan="2">Sistem tata pamong Skor = ((I x 2) + II) / 3</td>'
        + "<td>I. Kelengkapan struktur</td><td>a4</td><td>a3</td><td>a2</td><td>a1</td><td>a0</td></tr>"
        + "<tr><td></td><td>II. Kebijakan operasional</td><td>b4</td><td>b3</td><td>b2</td><td>b1</td><td>b0</td></tr>"
        + "</table>"
    )
    recs = _records(html)
    assert [(r["no"], r["sub_no"]) for r in recs] == [(4, "I"), (4, "II")]
    assert all(r["score_type"] == "composite" for r in recs)
    assert all(r["sub_score_formula"] == "((I x 2) + II) / 3" for r in recs)
    assert recs[0]["indikator"] == "Kelengkapan struktur"   # penanda "I." pindah ke sub_no
    assert recs[1]["score_criteria"]["4"] == "b4"


def test_formula_lines_are_not_treated_as_parent_headings():
    """Baris 1-sel berisi keterangan rumus ('BOP = ...') bukan induk hierarki."""
    html = (
        "<table>" + HEADER
        + '<tr><td colspan="8">A. KRITERIA</td></tr>'
        + "<tr><td>9</td><td>Biaya</td><td>BOP. Tabel 2.b. LKPS.</td>"
        + "<td>Jika BOP >= 5, maka Skor = 4</td><td>x</td><td>x</td><td>x</td><td>x</td></tr>"
        + "</table>"
    )
    [rec] = _records(html)
    assert rec["kelompok"] == "A. KRITERIA"
    assert rec["score_type"] == "quantitative"
    assert rec["formula"] == "4"
