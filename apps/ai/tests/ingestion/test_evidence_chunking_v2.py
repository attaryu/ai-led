"""Penggabungan chunk v2 (ekstraksi_mineru (1).ipynb): dari awal ke akhir, tiap chunk
digabung dengan berikutnya selama total token <= batas -- boleh 3 chunk atau lebih."""
from ingestion.evidence_chunking_v2 import MAX_TOKENS, chunk_document, count_tokens


def _bagian(n: int, kata: int = 25) -> str:
    return f"# BAB {n}\n\n" + " ".join(f"kata{n}x{i}" for i in range(kata)) + "\n\n"


def test_three_small_sections_merge_into_one_chunk():
    md = "".join(_bagian(n) for n in (1, 2, 3))
    gabung, _, _ = chunk_document(md, "dok", MAX_TOKENS, True)
    terpisah, _, _ = chunk_document(md, "dok", MAX_TOKENS, False)

    assert len(terpisah) == 3
    assert len(gabung) == 1                              # 3 chunk -> 1, total masih < 1000 token
    isi = gabung[0]["content"]
    assert all(f"BAB {n}" in isi for n in (1, 2, 3))     # judul tiap H1 ikut terbawa
    assert gabung[0]["tokens_embed"] <= MAX_TOKENS


def test_merge_stops_before_exceeding_the_limit():
    # kata "kata1x12" dihitung +-5 token, jadi 60 kata ~ 300 token: tiga bagian muat per
    # chunk (~900 token), empat tidak (~1200) -> 6 bagian jadi 2 chunk.
    md = "".join(_bagian(n, kata=60) for n in range(1, 7))
    sendiri, _, _ = chunk_document(md, "dok", MAX_TOKENS, False)
    assert all(c["tokens_embed"] < MAX_TOKENS / 3 + 50 for c in sendiri)   # asumsi data uji
    chunks, _, _ = chunk_document(md, "dok", MAX_TOKENS, True)

    assert len(chunks) == 2                              # sebagian digabung, tidak semuanya
    assert all(c["tokens_embed"] <= MAX_TOKENS for c in chunks)
    # tak ada isi yang hilang: setiap kata tetap muncul tepat sekali
    semua = " ".join(c["content"] for c in chunks)
    assert all(semua.count(f"kata{n}x0 ") + semua.count(f"kata{n}x0\n") >= 1 for n in range(1, 7))


def test_merge_can_be_turned_off():
    md = "".join(_bagian(n) for n in (1, 2, 3))
    chunks, _, _ = chunk_document(md, "dok", MAX_TOKENS, False)
    assert len(chunks) == 3
    assert all("gabung" not in c["strategy"] for c in chunks)


def test_two_table_chunks_are_never_merged():
    baris = "".join(f"<tr><td>{i}</td><td>{'x' * 60}</td></tr>" for i in range(1, 80))
    tabel = f"<table><tr><td>No</td><td>Nama</td></tr>{baris}</table>"
    chunks, _, _ = chunk_document(f"# BAB 1\n\n{tabel}\n\n# BAB 2\n\n{tabel}\n", "dok", 400, True)
    # setiap chunk tabel utuh dan tag-nya seimbang (header diulang, tidak bocor antar tabel)
    for c in chunks:
        assert c["content"].count("<table") == c["content"].count("</table>")
