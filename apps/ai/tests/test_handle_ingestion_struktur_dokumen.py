"""Integration-style tests for worker.py::_handle_ingestion_struktur_dokumen --
LLM-based BAB/sub-bab structure extraction from an uploaded PANDUAN_LAM PDF,
scoped per AccreditationSet. All R2/Postgres/LLM/PDF dependencies are mocked;
no Redis/Postgres/real file needed.
"""

from __future__ import annotations

import asyncio
import contextlib
from unittest.mock import AsyncMock, MagicMock, patch


def _fake_job(accreditation_set_id="set-1", file_url="tenant-1/panduan.pdf"):
    job = MagicMock()
    job.data = {"accreditationSetId": accreditation_set_id, "fileUrl": file_url}
    return job


def _run(job, llm_content, pdf_pages=None, **overrides):
    llm = MagicMock()
    llm.ainvoke = AsyncMock(return_value=MagicMock(content=llm_content))

    defaults = dict(
        download_to=MagicMock(),
        replace_chapter_templates_for_set=MagicMock(return_value=1),
        extract_pdf_pages=MagicMock(return_value=pdf_pages if pdf_pages is not None else ["Teks pedoman contoh."]),
        status_updates=MagicMock(),
    )
    defaults.update(overrides)

    from worker import _handle_ingestion_struktur_dokumen

    with contextlib.ExitStack() as stack:
        stack.enter_context(patch("llm.chat_model.build_plain_llm", return_value=llm))
        stack.enter_context(patch("db.r2_client.download_to", defaults["download_to"]))
        stack.enter_context(
            patch("db.postgres_client.replace_chapter_templates_for_set", defaults["replace_chapter_templates_for_set"])
        )
        stack.enter_context(patch("worker._extract_pdf_pages", defaults["extract_pdf_pages"]))

        fake_cursor = MagicMock()
        fake_cursor.__enter__ = MagicMock(return_value=fake_cursor)
        fake_cursor.__exit__ = MagicMock(return_value=False)
        fake_cursor.execute = defaults["status_updates"]
        fake_conn = MagicMock()
        fake_conn.cursor = MagicMock(return_value=fake_cursor)
        stack.enter_context(patch("db.connection.get_conn", return_value=fake_conn))

        result = asyncio.run(_handle_ingestion_struktur_dokumen(job))

    return result, {**defaults, "llm": llm}


def _status_calls(status_updates):
    """Extract (status, error) pairs from the mocked cursor.execute calls."""
    calls = []
    for call in status_updates.call_args_list:
        sql, params = call.args
        if "structure_parse_status" in sql:
            calls.append((params[0], params[1]))
    return calls


def test_extracts_structure_and_replaces_templates():
    raw = """{"bab": [
        {"urutan": 1, "judul": "Pendahuluan", "subbab": [
            {"urutan": 1, "judul": "Latar Belakang", "panduan": "Jelaskan konteks institusi"}
        ]},
        {"urutan": 2, "judul": "Struktur LED", "subbab": []}
    ]}"""
    result, defaults = _run(_fake_job(), raw)

    assert result == {"status": "completed", "accreditationSetId": "set-1", "count": 1}
    defaults["replace_chapter_templates_for_set"].assert_called_once_with(
        "set-1",
        [
            {
                "order": 1,
                "title": "Pendahuluan",
                "subbab": [
                    {
                        "order": 1,
                        "title": "Latar Belakang",
                        "guidance": "Jelaskan konteks institusi",
                        "subbab": [],
                    }
                ],
            },
            {"order": 2, "title": "Struktur LED", "subbab": []},
        ],
    )
    assert _status_calls(defaults["status_updates"])[-1] == ("SIAP", None)


def test_nested_subsubbab_is_kept_one_level_deep_and_capped_below_that():
    raw = """{"bab": [
        {"urutan": 1, "judul": "Laporan Evaluasi Diri", "subbab": [
            {"urutan": 1, "judul": "Kriteria Akreditasi", "panduan": "...", "subbab": [
                {"urutan": 1, "judul": "Diferensiasi Misi", "panduan": "...", "subbab": [
                    {"urutan": 1, "judul": "Harusnya tidak muncul (tingkat ke-4)", "panduan": "..."}
                ]},
                {"urutan": 2, "judul": "Akuntabilitas", "panduan": "..."}
            ]}
        ]}
    ]}"""
    result, defaults = _run(_fake_job(), raw)

    assert result["status"] == "completed"
    ((_set_id, bab_list),) = [
        call.args for call in defaults["replace_chapter_templates_for_set"].call_args_list
    ]
    kriteria = bab_list[0]["subbab"][0]
    assert kriteria["title"] == "Kriteria Akreditasi"
    assert [s["title"] for s in kriteria["subbab"]] == ["Diferensiasi Misi", "Akuntabilitas"]
    # Tingkat ke-4 (anak dari sub-sub-bab) tidak diekstrak sama sekali.
    assert kriteria["subbab"][0]["subbab"] == []


def test_duplicate_bab_title_is_merged_not_listed_twice():
    """Reproduces a real production case: the LLM listed "BAB II. LAPORAN
    EVALUASI DIRI" twice -- once flat (compact daftar-isi overview), once
    with real C.1-C.7 nesting (detailed breakdown further in the source
    text) -- instead of recognizing both as the same chapter."""
    raw = """{"bab": [
        {"urutan": 1, "judul": "Pendahuluan", "subbab": []},
        {"urutan": 2, "judul": "Laporan Evaluasi Diri", "subbab": [
            {"urutan": 1, "judul": "Struktur Tim Penyusun", "panduan": "..."},
            {"urutan": 2, "judul": "Kriteria Akreditasi", "panduan": "..."}
        ]},
        {"urutan": 3, "judul": "Laporan Evaluasi Diri", "subbab": [
            {"urutan": 1, "judul": "Struktur Tim Penyusun", "panduan": "..."},
            {"urutan": 2, "judul": "Kriteria Akreditasi", "panduan": "lebih rinci", "subbab": [
                {"urutan": 1, "judul": "Diferensiasi Misi", "panduan": "..."},
                {"urutan": 2, "judul": "Akuntabilitas", "panduan": "..."}
            ]}
        ]},
        {"urutan": 4, "judul": "Penutup", "subbab": []}
    ]}"""
    result, defaults = _run(_fake_job(), raw)

    assert result["status"] == "completed"
    ((_set_id, bab_list),) = [
        call.args for call in defaults["replace_chapter_templates_for_set"].call_args_list
    ]
    titles = [b["title"] for b in bab_list]
    assert titles == ["Pendahuluan", "Laporan Evaluasi Diri", "Penutup"]
    assert [b["order"] for b in bab_list] == [1, 2, 3]

    ler = bab_list[1]
    assert [s["title"] for s in ler["subbab"]] == ["Struktur Tim Penyusun", "Kriteria Akreditasi"]
    kriteria = ler["subbab"][1]
    assert [s["title"] for s in kriteria["subbab"]] == ["Diferensiasi Misi", "Akuntabilitas"]


def test_empty_pdf_text_marks_gagal_without_calling_llm():
    result, defaults = _run(_fake_job(), llm_content="{}", pdf_pages=["   "])
    assert result["status"] == "empty"
    assert _status_calls(defaults["status_updates"])[-1][0] == "GAGAL"
    defaults["replace_chapter_templates_for_set"].assert_not_called()


def test_uses_only_the_daftar_isi_page_when_found():
    pages = [
        "HALAMAN SAMPUL, bukan bagian penting" * 50,
        "KATA PENGANTAR, juga bukan bagian penting" * 50,
        "DAFTAR ISI\nBAB I. PENDAHULUAN....1\nBAB II. STRUKTUR LED....5",
        "BAB I. PENDAHULUAN\nA. Rasional\n" + "isi bab sungguhan " * 500,
    ]
    _, defaults = _run(_fake_job(), llm_content='{"bab": []}', pdf_pages=pages)

    prompt = defaults["llm"].ainvoke.call_args.args[0]
    assert "DAFTAR ISI" in prompt
    assert "BAB II. STRUKTUR LED" in prompt
    assert "isi bab sungguhan" not in prompt


def test_falls_back_to_whole_document_when_no_daftar_isi_page():
    pages = ["BAB I. PENDAHULUAN\nA. Rasional\nIsi bab langsung tanpa daftar isi apa pun."]
    _, defaults = _run(_fake_job(), llm_content='{"bab": []}', pdf_pages=pages)

    prompt = defaults["llm"].ainvoke.call_args.args[0]
    assert "Isi bab langsung tanpa daftar isi apa pun." in prompt


def test_llm_returning_no_bab_marks_gagal():
    result, defaults = _run(_fake_job(), llm_content='{"bab": []}')
    assert result["status"] == "empty"
    assert _status_calls(defaults["status_updates"])[-1][0] == "GAGAL"
    defaults["replace_chapter_templates_for_set"].assert_not_called()


def test_unexpected_exception_marks_gagal_with_message():
    result, defaults = _run(
        _fake_job(),
        llm_content='{"bab": [{"urutan": 1, "judul": "A", "subbab": []}]}',
        replace_chapter_templates_for_set=MagicMock(side_effect=RuntimeError("db down")),
    )
    assert result["status"] == "error"
    assert "db down" in result["reason"]
    assert _status_calls(defaults["status_updates"])[-1][0] == "GAGAL"
