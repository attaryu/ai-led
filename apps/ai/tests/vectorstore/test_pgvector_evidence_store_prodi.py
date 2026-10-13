"""Unit test (tanpa DB) untuk list_prodi_evidence_ids -- cursor di-mock, yang diuji adalah SQL dan
parameternya: lingkup tenant + prodi + tenant-wide, TANPA tag indikator."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from vectorstore.pgvector_evidence_store import list_prodi_evidence_ids


def _run(study_program_id, rows):
    cur = MagicMock()
    cur.fetchall.return_value = rows
    with patch("vectorstore.pgvector_evidence_store._cursor") as c:
        c.return_value.__enter__.return_value = cur
        hasil = list_prodi_evidence_ids("t1", study_program_id)
    sql, params = cur.execute.call_args.args
    return hasil, " ".join(sql.split()), params


def test_scopes_to_tenant_prodi_and_tenant_wide_bukti_dukung():
    hasil, sql, params = _run("p1", [{"id": "e1", "document_name": "SK K3L.pdf"}, {"id": "e2", "document_name": "MoU.pdf"}])

    assert hasil == {"e1": "SK K3L.pdf", "e2": "MoU.pdf"}
    assert params == ("t1", "p1")
    assert "ef.tenant_id = %s" in sql
    assert "ef.kind = 'BUKTI_DUKUNG'" in sql
    assert "(ef.study_program_id = %s OR ef.study_program_id IS NULL)" in sql


def test_does_not_filter_by_indicator_tags():
    _, sql, _ = _run("p1", [])
    assert "evidence_indicator_tags" not in sql


def test_without_prodi_only_tenant_wide_files_are_visible():
    hasil, sql, params = _run(None, [{"id": "e9", "document_name": "Kebijakan.pdf"}])

    assert hasil == {"e9": "Kebijakan.pdf"}
    assert params == ("t1",)
    assert "ef.study_program_id IS NULL" in sql
    assert "ef.study_program_id = %s" not in sql  # None must NOT widen to every prodi


def test_empty_result_is_an_empty_dict():
    hasil, _, _ = _run("p1", [])
    assert hasil == {}
