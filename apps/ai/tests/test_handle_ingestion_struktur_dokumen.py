"""Integration-style tests for worker.py::_handle_ingestion_struktur_dokumen --
BAB/sub-bab structure extraction from an uploaded PANDUAN_LAM PDF, scoped per
Panduan (ReferenceGuide, guideId) -- reusable across AccreditationSet, not
owned 1:1 by one (migration `20260915140000_reusable_panduan_penulisan`). No
LLM involved anymore -- extraction itself is
ingestion.panduan_chunker.extract_panduan_structure (see its own tests);
these tests only cover the handler's own orchestration: download, dedupe
duplicate BAB titles, flatten to staged nodes, stage them, and error
handling. All R2/Postgres/chunker dependencies are mocked; no Redis/Postgres/
real file needed.

Since the staging/confirm redesign (see api/routes/structure.py), this
handler no longer writes ChapterTemplate/SubBabTemplate directly -- it
flattens the parsed tree into guide_references.structure_staging via
save_structure_staging and stops at MENUNGGU_KONFIRMASI, so these tests
assert against the flat staged-node list, not a committed template.
"""

from __future__ import annotations

import asyncio
import contextlib
from unittest.mock import MagicMock, patch


def _fake_job(guide_id="guide-1", file_url="tenant-1/panduan.pdf"):
    job = MagicMock()
    job.data = {"guideId": guide_id, "fileUrl": file_url}
    return job


def _run(job, bab_list, **overrides):
    defaults = dict(
        download_to=MagicMock(),
        get_reference_guide_tenant=MagicMock(return_value="tenant-1"),
        save_structure_staging=MagicMock(return_value=None),
        extract_panduan_structure=MagicMock(return_value=bab_list),
        status_updates=MagicMock(),
    )
    defaults.update(overrides)

    from worker import _handle_ingestion_struktur_dokumen

    with contextlib.ExitStack() as stack:
        stack.enter_context(patch("db.r2_client.download_to", defaults["download_to"]))
        stack.enter_context(
            patch("db.postgres_client.get_reference_guide_tenant", defaults["get_reference_guide_tenant"])
        )
        stack.enter_context(
            patch("db.postgres_client.save_structure_staging", defaults["save_structure_staging"])
        )
        stack.enter_context(
            patch("ingestion.panduan_chunker.extract_panduan_structure", defaults["extract_panduan_structure"])
        )

        fake_cursor = MagicMock()
        fake_cursor.__enter__ = MagicMock(return_value=fake_cursor)
        fake_cursor.__exit__ = MagicMock(return_value=False)
        fake_cursor.execute = defaults["status_updates"]
        fake_tenant_cursor_cm = MagicMock()
        fake_tenant_cursor_cm.__enter__ = MagicMock(return_value=fake_cursor)
        fake_tenant_cursor_cm.__exit__ = MagicMock(return_value=False)
        stack.enter_context(patch("db.connection.tenant_cursor", MagicMock(return_value=fake_tenant_cursor_cm)))

        result = asyncio.run(_handle_ingestion_struktur_dokumen(job))

    return result, defaults


def _status_calls(status_updates):
    """Extract (status, error) pairs from the mocked cursor.execute calls
    (only the GAGAL path still writes status through this closure now --
    the success path's MENUNGGU_KONFIRMASI write happens inside the mocked
    save_structure_staging instead)."""
    calls = []
    for call in status_updates.call_args_list:
        sql, params = call.args
        if "structure_parse_status" in sql:
            calls.append((params[0], params[1]))
    return calls


def _staged_nodes(defaults):
    ((_tenant_id, _guide_id, nodes),) = [
        call.args for call in defaults["save_structure_staging"].call_args_list
    ]
    return nodes


def test_extracts_structure_and_stages_it():
    bab_list = [
        {"order": 1, "title": "Pendahuluan", "subbab": [
            {"order": 1, "title": "Latar Belakang", "guidance": "Jelaskan konteks institusi", "subbab": []},
        ]},
        {"order": 2, "title": "Struktur LED", "subbab": []},
    ]
    result, defaults = _run(_fake_job(), bab_list)

    assert result == {"status": "menunggu_konfirmasi", "guideId": "guide-1", "count": 2}
    defaults["save_structure_staging"].assert_called_once_with(
        "tenant-1",
        "guide-1",
        [
            {
                "id": "1", "parent_id": None, "level": 1, "order": 1, "title": "Pendahuluan", "guidance": None,
                "lkps_needed": False, "lkps_list": [],
            },
            {
                "id": "1.1", "parent_id": "1", "level": 2, "order": 1,
                "title": "Latar Belakang", "marker": None, "guidance": "Jelaskan konteks institusi",
                "lkps_needed": False, "lkps_list": [],
            },
            {
                "id": "2", "parent_id": None, "level": 1, "order": 2, "title": "Struktur LED", "guidance": None,
                "lkps_needed": False, "lkps_list": [],
            },
        ],
    )
    # MENUNGGU_KONFIRMASI is set inside save_structure_staging (mocked away
    # here) -- the local status closure only ever writes GAGAL now.
    assert _status_calls(defaults["status_updates"]) == []


def test_nested_subsubbab_flattens_to_dotted_ids_three_levels_deep():
    """extract_panduan_structure already caps depth at 3 (see its own
    tests) -- this only checks _flatten_bab_list turns that nested shape
    into the dotted-id/level staged-node list correctly."""
    bab_list = [
        {"order": 1, "title": "Laporan Evaluasi Diri", "subbab": [
            {"order": 1, "title": "Kriteria Akreditasi", "guidance": "...", "subbab": [
                {"order": 1, "title": "Diferensiasi Misi", "guidance": "...", "subbab": []},
                {"order": 2, "title": "Akuntabilitas", "guidance": "...", "subbab": []},
            ]},
        ]},
    ]
    result, defaults = _run(_fake_job(), bab_list)

    assert result["status"] == "menunggu_konfirmasi"
    nodes = _staged_nodes(defaults)
    titles_by_id = {n["id"]: n["title"] for n in nodes}
    levels_by_id = {n["id"]: n["level"] for n in nodes}
    assert titles_by_id == {
        "1": "Laporan Evaluasi Diri",
        "1.1": "Kriteria Akreditasi",
        "1.1.1": "Diferensiasi Misi",
        "1.1.2": "Akuntabilitas",
    }
    assert levels_by_id == {"1": 1, "1.1": 2, "1.1.1": 3, "1.1.2": 3}


def test_duplicate_bab_title_is_merged_not_listed_twice():
    """Reproduces a real production case: the same BAB title appearing
    twice in the extracted structure (once flat, once with real C.1-C.7
    nesting) must be merged into one chapter, not listed twice --
    _gabung_duplikat_judul is the safety net on top of the chunker's own
    Daftar-Isi exclusion (see panduan_chunker's tests)."""
    bab_list = [
        {"order": 1, "title": "Pendahuluan", "subbab": []},
        {"order": 2, "title": "Laporan Evaluasi Diri", "subbab": [
            {"order": 1, "title": "Struktur Tim Penyusun", "guidance": "...", "subbab": []},
            {"order": 2, "title": "Kriteria Akreditasi", "guidance": "...", "subbab": []},
        ]},
        {"order": 3, "title": "Laporan Evaluasi Diri", "subbab": [
            {"order": 1, "title": "Struktur Tim Penyusun", "guidance": "...", "subbab": []},
            {"order": 2, "title": "Kriteria Akreditasi", "guidance": "lebih rinci", "subbab": [
                {"order": 1, "title": "Diferensiasi Misi", "guidance": "...", "subbab": []},
                {"order": 2, "title": "Akuntabilitas", "guidance": "...", "subbab": []},
            ]},
        ]},
        {"order": 4, "title": "Penutup", "subbab": []},
    ]
    result, defaults = _run(_fake_job(), bab_list)

    assert result["status"] == "menunggu_konfirmasi"
    assert result["count"] == 3  # merged down from 4 bab entries to 3 distinct chapters
    nodes = _staged_nodes(defaults)
    top_level_titles = [n["title"] for n in nodes if n["level"] == 1]
    assert top_level_titles == ["Pendahuluan", "Laporan Evaluasi Diri", "Penutup"]

    kriteria = next(n for n in nodes if n["title"] == "Kriteria Akreditasi")
    assert [n["title"] for n in nodes if n["parent_id"] == kriteria["id"]] == ["Diferensiasi Misi", "Akuntabilitas"]


def test_empty_structure_marks_gagal():
    result, defaults = _run(_fake_job(), bab_list=[])
    assert result["status"] == "empty"
    assert _status_calls(defaults["status_updates"])[-1][0] == "GAGAL"
    defaults["save_structure_staging"].assert_not_called()


def test_extraction_exception_marks_gagal_with_message():
    result, defaults = _run(
        _fake_job(),
        bab_list=[],
        extract_panduan_structure=MagicMock(side_effect=RuntimeError("mineru gagal")),
    )
    assert result["status"] == "error"
    assert "mineru gagal" in result["reason"]
    assert _status_calls(defaults["status_updates"])[-1][0] == "GAGAL"


def test_unexpected_exception_marks_gagal_with_message():
    result, defaults = _run(
        _fake_job(),
        bab_list=[{"order": 1, "title": "A", "subbab": []}],
        save_structure_staging=MagicMock(side_effect=RuntimeError("db down")),
    )
    assert result["status"] == "error"
    assert "db down" in result["reason"]
    assert _status_calls(defaults["status_updates"])[-1][0] == "GAGAL"


def test_exception_with_no_message_falls_back_to_class_name():
    """Real production case: httpx.ReadError (network drop mid-stream, no
    exception message) left `reason: ''` and a blank criteria_parse_error in
    the DB -- worker.py::_err_msg falls back to the exception's class name
    so GAGAL is never blank."""
    result, defaults = _run(
        _fake_job(),
        bab_list=[{"order": 1, "title": "A", "subbab": []}],
        save_structure_staging=MagicMock(side_effect=RuntimeError()),
    )
    assert result["status"] == "error"
    assert result["reason"] == "RuntimeError"
    assert _status_calls(defaults["status_updates"])[-1] == ("GAGAL", "RuntimeError")
