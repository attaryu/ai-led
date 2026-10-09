"""Integration-style tests for worker.py::_handle_generasi_outline_bab --
copies ChapterSection rows directly from this bab's confirmed
ChapterTemplate/SubBabTemplate structure. No LLM call at all (removed --
see api/routes/structure.py's confirm step, which is now the only place an
outline gets shaped). All Postgres dependencies are mocked; no
Redis/Postgres needed.
"""

from __future__ import annotations

import asyncio
import contextlib
from unittest.mock import MagicMock, patch


def _fake_job(bab_id="bab-1", overwrite=False):
    job = MagicMock()
    job.data = {"babDokumenId": bab_id}
    if overwrite:
        job.data["overwrite"] = True
    return job


def _fake_bab(guide_id="guide-1"):
    return {
        "id": "bab-1",
        "tenant_id": "tenant-1",
        "document_id": "doc-1",
        "chapter_order": 1,
        "chapter_title": "Tata Pamong",
        "study_program_id": "prodi-1",
        "accreditation_set_id": "set-1",
        "guide_id": guide_id,
    }


def _run(job, **db_overrides):
    defaults = dict(
        get_bab_dokumen=MagicMock(return_value=_fake_bab()),
        get_chapter_template_subbab=MagicMock(return_value=[
            {"id": "sbt-1", "parent_id": None, "title": "Kebijakan Tata Pamong",
             "guidance": "Bahas dasar hukum penetapan tata pamong", "children": []},
        ]),
        create_chapter_sections=MagicMock(return_value=[{"id": "sec-1"}, {"id": "sec-2"}]),
    )
    defaults.update(db_overrides)

    from worker import _handle_generasi_outline_bab

    with contextlib.ExitStack() as stack:
        for name, fn in defaults.items():
            stack.enter_context(patch(f"db.generation_client.{name}", fn))
        result = asyncio.run(_handle_generasi_outline_bab(job))

    return result, defaults


def test_copies_struktur_and_persists_sections():
    result, defaults = _run(_fake_job())
    create_sections = defaults["create_chapter_sections"]

    assert result == {"status": "completed", "sectionCount": 2}
    args, kwargs = create_sections.call_args
    assert args[0] == "tenant-1"
    assert args[1] == "bab-1"
    assert args[2] == [
        {
            "title": "Kebijakan Tata Pamong", "marker": None, "guidance": "Bahas dasar hukum penetapan tata pamong",
            "lkps_needed": None, "lkps_list": [], "subseksi": [],
        },
    ]
    assert kwargs["overwrite"] is False


def test_nested_children_become_subseksi_at_any_depth():
    """dimas: every Panduan node is a section, however deep -- not capped at sub-sub-bab."""
    leaf = {"id": "sbt-1.1.1.1", "title": "Rumusan", "guidance": "G4", "children": []}
    lvl3 = {"id": "sbt-1.1.1", "title": "Keunikan", "guidance": "G3", "children": [leaf]}
    struktur = [
        {"id": "sbt-1", "parent_id": None, "title": "Kriteria Akreditasi", "guidance": "G", "children": [
            {"id": "sbt-1.1", "title": "Diferensiasi Misi", "guidance": "G1", "children": [lvl3]},
            {"id": "sbt-1.2", "title": "Akuntabilitas", "guidance": "G2", "children": []},
        ]},
    ]
    _, defaults = _run(_fake_job(), get_chapter_template_subbab=MagicMock(return_value=struktur))

    def sec(title, guidance, subseksi=()):
        return {"title": title, "marker": None, "guidance": guidance, "lkps_needed": None, "lkps_list": [], "subseksi": list(subseksi)}

    assert defaults["create_chapter_sections"].call_args.args[2] == [
        sec("Kriteria Akreditasi", "G", [
            sec("Diferensiasi Misi", "G1", [sec("Keunikan", "G3", [sec("Rumusan", "G4")])]),
            sec("Akuntabilitas", "G2"),
        ]),
    ]


def test_overwrite_flag_passed_through():
    _, defaults = _run(_fake_job(overwrite=True))
    assert defaults["create_chapter_sections"].call_args.kwargs["overwrite"] is True


def test_no_confirmed_structure_returns_error_without_creating_sections():
    result, defaults = _run(_fake_job(), get_chapter_template_subbab=MagicMock(return_value=[]))
    assert result["status"] == "error"
    assert "Panduan Penulisan" in result["error"]
    defaults["create_chapter_sections"].assert_not_called()


def test_existing_sections_without_overwrite_surfaces_value_error_as_result():
    def _raise(*args, **kwargs):
        raise ValueError("Bab bab-1 sudah punya 2 section — pakai overwrite=true untuk mengganti")

    result, _ = _run(_fake_job(), create_chapter_sections=MagicMock(side_effect=_raise))
    assert result["status"] == "error"
    assert "overwrite=true" in result["error"]


def test_bab_not_found_returns_error_without_looking_up_struktur():
    result, defaults = _run(_fake_job(), get_bab_dokumen=MagicMock(return_value=None))
    assert result == {"status": "error", "error": "BabDokumen bab-1 tidak ditemukan"}
    defaults["get_chapter_template_subbab"].assert_not_called()


def test_struktur_lookup_scoped_to_documents_panduan():
    _, defaults = _run(_fake_job())
    defaults["get_chapter_template_subbab"].assert_called_once_with("tenant-1", "guide-1", 1)


def test_no_panduan_has_no_structure_to_copy():
    """A LedDocument whose set never picked/uploaded a Panduan (guide_id
    None -- either no set at all, or a set with no panduanId) has nothing
    to seed sections from -- same "error, not a silent fallback" behavior
    as a Panduan whose structure was never extracted/confirmed."""
    result, defaults = _run(
        _fake_job(),
        get_bab_dokumen=MagicMock(return_value=_fake_bab(guide_id=None)),
        get_chapter_template_subbab=MagicMock(return_value=[]),
    )
    defaults["get_chapter_template_subbab"].assert_called_once_with("tenant-1", None, 1)
    assert result["status"] == "error"
