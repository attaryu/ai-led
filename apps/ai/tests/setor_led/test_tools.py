"""setor_led.tools.cari_bukti_dukung_prodi -- tool pencarian bukti dukung tingkat prodi."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from agent.context import AssessmentContext, current_assessment_context
from setor_led.tools import cari_bukti_dukung_prodi


@pytest.fixture()
def konteks():
    token = current_assessment_context.set(
        AssessmentContext("t1", "dok-1", 0, "set-1", "p1")
    )
    yield
    current_assessment_context.reset(token)


def _chunk(teks="Isi SK", bid="e1", distance=0.2):
    return {"text": teks, "entity": "x", "chunk_id": "c", "bukti_dukung_id": bid, "confidence": 1.0, "distance": distance}


def test_searches_only_inside_the_prodi_scope_and_labels_results_with_file_name(konteks):
    with (
        patch("setor_led.tools.list_prodi_evidence_ids", return_value={"e1": "SK K3L 2025.pdf", "e2": "MoU.pdf"}) as ids,
        patch("setor_led.tools.search_evidence", return_value=[_chunk(bid="e1")]) as cari,
    ):
        keluaran = json.loads(cari_bukti_dukung_prodi.invoke({"query": "SK K3L"}))

    ids.assert_called_once_with("t1", "p1")
    assert cari.call_args.kwargs["tenant_id"] == "t1"
    assert sorted(cari.call_args.kwargs["bukti_dukung_ids"]) == ["e1", "e2"]
    assert cari.call_args.kwargs["n_results"] == 5
    assert keluaran == [{"text": "Isi SK", "berkas": "SK K3L 2025.pdf", "relevance_score": 0.8}]


def test_prodi_without_bukti_dukung_returns_empty_list_not_error(konteks):
    with (
        patch("setor_led.tools.list_prodi_evidence_ids", return_value={}),
        patch("setor_led.tools.search_evidence") as cari,
    ):
        keluaran = cari_bukti_dukung_prodi.invoke({"query": "apa saja"})

    assert json.loads(keluaran) == []
    cari.assert_not_called()


def test_long_chunk_text_is_capped_at_1000_chars(konteks):
    with (
        patch("setor_led.tools.list_prodi_evidence_ids", return_value={"e1": "a.pdf"}),
        patch("setor_led.tools.search_evidence", return_value=[_chunk(teks="x" * 5000)]),
    ):
        keluaran = json.loads(cari_bukti_dukung_prodi.invoke({"query": "q"}))
    assert len(keluaran[0]["text"]) == 1000


@pytest.mark.parametrize("diminta, dipakai", [(500, 10), (10, 10), (3, 3), (0, 1), (-7, 1)])
def test_n_results_is_clamped_because_the_model_controls_it(konteks, diminta, dipakai):
    with (
        patch("setor_led.tools.list_prodi_evidence_ids", return_value={"e1": "a.pdf"}),
        patch("setor_led.tools.search_evidence", return_value=[]) as cari,
    ):
        cari_bukti_dukung_prodi.invoke({"query": "q", "n_results": diminta})
    assert cari.call_args.kwargs["n_results"] == dipakai


def test_unknown_file_id_falls_back_to_a_placeholder_label(konteks):
    with (
        patch("setor_led.tools.list_prodi_evidence_ids", return_value={"e1": "a.pdf"}),
        patch("setor_led.tools.search_evidence", return_value=[_chunk(bid="hilang")]),
    ):
        keluaran = json.loads(cari_bukti_dukung_prodi.invoke({"query": "q"}))
    assert keluaran[0]["berkas"] == "(berkas tidak dikenal)"


def test_requires_assessment_context():
    with pytest.raises(RuntimeError, match="AssessmentContext"):
        cari_bukti_dukung_prodi.invoke({"query": "q"})
