"""Unit tests for pure helpers in worker.py — no Redis/Postgres needed."""

from __future__ import annotations


def test_lkps_refs_in_pedoman_finds_explicit_mention():
    from worker import _lkps_refs_in_pedoman

    pedoman = [
        {"point_title": "Rasio dosen", "content_text": "Jelaskan rasio dosen (Tabel 2.a LKPS) terhadap mahasiswa."},
    ]
    refs = _lkps_refs_in_pedoman(pedoman)
    assert len(refs) == 1
    assert "2.a" in refs[0]


def test_lkps_refs_in_pedoman_empty_when_no_mention():
    from worker import _lkps_refs_in_pedoman

    pedoman = [{"point_title": "Visi", "content_text": "Jelaskan proses penyusunan visi program studi."}]
    assert _lkps_refs_in_pedoman(pedoman) == []


def test_lkps_refs_in_pedoman_dedupes_repeated_mentions():
    from worker import _lkps_refs_in_pedoman

    pedoman = [
        {"point_title": "A", "content_text": "Lihat Tabel 2.a LKPS untuk rincian."},
        {"point_title": "B", "content_text": "Bandingkan dengan Tabel 2.a LKPS pada bagian lain."},
    ]
    assert len(_lkps_refs_in_pedoman(pedoman)) == 1


def test_led_citation_label_prefers_page():
    from worker import _led_citation_label

    chunk = {"metadata": {"page_start": 5, "para_start": -1}}
    assert _led_citation_label(chunk) == "LED hal. 5"


def test_led_citation_label_falls_back_to_paragraph():
    from worker import _led_citation_label

    chunk = {"metadata": {"page_start": -1, "para_start": 3}}
    assert _led_citation_label(chunk) == "LED para. 3"


def test_led_citation_label_falls_back_to_plain_led():
    from worker import _led_citation_label

    chunk = {"metadata": {"page_start": -1, "para_start": -1}}
    assert _led_citation_label(chunk) == "LED"
