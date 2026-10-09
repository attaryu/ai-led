"""Unit tests for pure helpers in worker.py — no Redis/Postgres needed."""

from __future__ import annotations


def test_evidence_citation_label_uses_real_filename():
    from worker import _evidence_citation_label

    chunk = {"bukti_dukung_id": "ev-1"}
    assert _evidence_citation_label(chunk, {"ev-1": "SK Tim Akreditasi.pdf"}) == "SK Tim Akreditasi.pdf"


def test_evidence_citation_label_falls_back_to_id_when_filename_missing():
    from worker import _evidence_citation_label

    chunk = {"bukti_dukung_id": "ev-2"}
    assert _evidence_citation_label(chunk, {}) == "ev-2"


def test_parse_llm_json_parses_clean_json():
    from worker import _parse_llm_json

    assert _parse_llm_json('{"document_query": ["a", "b"]}') == {"document_query": ["a", "b"]}


def test_parse_llm_json_extracts_json_from_surrounding_text():
    from worker import _parse_llm_json

    raw = 'berikut hasilnya:\n{"requires_documents": true}\nselesai.'
    assert _parse_llm_json(raw) == {"requires_documents": True}


def test_parse_llm_json_reports_parse_error_when_no_json_found():
    from worker import _parse_llm_json

    result = _parse_llm_json("bukan json sama sekali")
    assert result["parse_error"]


def test_parse_checklist_extracts_dashed_bullets_dedups_and_caps_eight():
    from worker import _parse_checklist

    raw = "\n".join([f"- pertanyaan nomor {i} yang cukup panjang" for i in range(1, 11)] + [
        "- pertanyaan nomor 1 yang cukup panjang",  # duplicate, should be dropped
        "bukan bullet, harus diabaikan",
        "- x",  # too short (<=5 chars), should be dropped
    ])
    result = _parse_checklist(raw)
    assert len(result) == 8
    assert result[0] == "pertanyaan nomor 1 yang cukup panjang"


def test_parse_checklist_strips_think_block_before_parsing():
    from worker import _parse_checklist

    raw = "<think>mikir dulu\n- item palsu</think>\n- pertanyaan asli yang valid"
    result = _parse_checklist(raw)
    assert result == ["pertanyaan asli yang valid"]


def test_parse_judge_json_parses_clean_json():
    from worker import _parse_judge_json

    raw = '{"faithfulness": 0.8, "answer_relevancy": 0.7, "context_precision": 0.6, "context_recall": 0.5}'
    result = _parse_judge_json(raw)
    assert result["faithfulness"] == 0.8


def test_parse_judge_json_regex_fallback_on_truncated_json():
    from worker import _parse_judge_json

    raw = '{"faithfulness": 0.8, "answer_relevancy": 0.7, "context_preci'
    result = _parse_judge_json(raw)
    assert result["faithfulness"] == 0.8
    assert result["answer_relevancy"] == 0.7
    assert result["parse_warning"]


def test_parse_judge_json_empty_response():
    from worker import _parse_judge_json

    assert _parse_judge_json("")["error"] == "empty response"


def test_build_checklist_prompt_includes_selected_document_names_as_hint_only():
    """Port of Dimas's 332ab2f: selected document names are a terminology
    hint, not a scope narrower — the prompt must say so explicitly."""
    from worker import _build_checklist_prompt

    prompt = _build_checklist_prompt(
        "Tata Pamong", [], selected_document_names=["Renstra 2020-2024"]
    )
    assert "Renstra 2020-2024" in prompt
    assert "Jangan membuat kebutuhan informasi baru berdasarkan nama atau isi dokumen" in prompt


def test_build_checklist_prompt_omits_selected_documents_block_when_none():
    from worker import _build_checklist_prompt

    prompt = _build_checklist_prompt("Tata Pamong", [])
    assert "DOKUMEN YANG TERSEDIA" not in prompt


def test_build_section_prompt_forbids_any_heading():
    """Section content is inserted under its own `## judul` heading by
    _compile_chapter_from_sections — the LLM must not add its own."""
    from worker import _build_section_prompt

    prompt = _build_section_prompt("Kebijakan Tata Pamong", [], [])
    assert "Tidak ada judul, heading" in prompt
    assert "minimum 3 paragraf" in prompt
    assert "PEMERIKSAAN" in prompt


def test_build_assess_and_recommend_prompt_uses_closed_set_catalog():
    """Pilihan dokumen datang dari katalog tertutup BERKATEGORI (document_catalog_kategori), bukan pencarian
    registry per-tenant: prompt memuat judul kategori [..] dan label dokumen berkutip, tanpa nomor."""
    from document_catalog_kategori import catalog_by_category
    from worker import _build_assess_and_recommend_prompt

    prompt = _build_assess_and_recommend_prompt(
        "Tata Pamong",
        [{"content_text": "Pedoman contoh."}],
        [],
        False,
    )
    assert "closed set" in prompt
    assert "TS-1" in prompt  # _KONTEKS_PROMPT injected
    assert "Pedoman contoh." in prompt
    kategori = catalog_by_category()
    for nama, labels in kategori.items():
        assert f"[{nama}]" in prompt
        assert f'"{labels[0]}"' in prompt  # label berkutip, tanpa nomor
    semua = [lab for labels in kategori.values() for lab in labels]
    assert f"{len(semua)}. " not in prompt
    assert "FOLDER KANDIDAT" not in prompt
    assert "QUERY KEBUTUHAN DOKUMEN" not in prompt


def test_build_assess_and_recommend_prompt_has_no_invented_missing_pedoman_text():
    """dimas emits just the PEDOMAN header when empty -- no extra instruction of our own."""
    from worker import _build_assess_and_recommend_prompt

    prompt = _build_assess_and_recommend_prompt("Tata Pamong", [], [], False)
    assert "TIDAK TERSEDIA" not in prompt
    assert "Untuk SECTION ini tidak perlu ada LKPS" in prompt


def test_build_assess_and_recommend_prompt_includes_lkps_results_when_needed():
    from worker import _build_assess_and_recommend_prompt

    prompt = _build_assess_and_recommend_prompt(
        "Tata Pamong", [], [{"sheet": "3a1", "text": "Tabel 3.a.1: contoh data"}], True,
    )
    assert "sebagai bukti pendukung data LKPS berikut" in prompt
    assert "[1] Tabel 3.a.1: contoh data" in prompt


def test_build_suggest_custom_document_prompt_is_a_fallback_outside_catalog():
    """Port of Dimas's 332ab2f fallback -- separate prompt so the closed-set
    rule in the main prompt never softens."""
    from worker import _build_suggest_custom_document_prompt

    prompt = _build_suggest_custom_document_prompt(
        "Tata Pamong", [{"content_text": "Pedoman contoh."}]
    )
    assert "belum tersedia dalam KATALOG" in prompt
    assert "TS-1" in prompt  # _KONTEKS_PROMPT injected
    assert "Pedoman contoh." in prompt


def test_compile_chapter_from_sections_skips_ungenerated_and_orders_by_input():
    from prose import text_to_doc
    from worker import _compile_chapter_from_sections

    sections = [
        {"id": "s1", "parent_id": None, "title": "Kebijakan", "status": "GENERATED", "content": text_to_doc("Isi kebijakan.")},
        {"id": "s2", "parent_id": None, "title": "Belum jadi", "status": "PENDING", "content": None},
        {"id": "s3", "parent_id": None, "title": "Pelaksanaan", "status": "GENERATED", "content": {"markdown": "Isi pelaksanaan (data lama)."}},
    ]
    markdown_text, doc = _compile_chapter_from_sections(sections)
    assert "## Kebijakan" in markdown_text
    assert "Isi kebijakan." in markdown_text
    assert "Belum jadi" not in markdown_text
    assert "## Pelaksanaan" in markdown_text
    assert [n["type"] for n in doc["content"]] == ["heading", "paragraph", "heading", "paragraph"]
    assert doc["content"][0]["attrs"] == {"level": 2}
    assert "Isi pelaksanaan (data lama)." in markdown_text


def test_compile_chapter_from_sections_nests_children_as_h3():
    from prose import text_to_doc
    from worker import _compile_chapter_from_sections

    sections = [
        {"id": "top", "parent_id": None, "title": "Kriteria Akreditasi", "status": "PENDING", "content": None},
        {
            "id": "child",
            "parent_id": "top",
            "title": "Diferensiasi Misi",
            "status": "GENERATED",
            "content": text_to_doc("Isi VMTS."),
        },
    ]
    markdown_text, doc = _compile_chapter_from_sections(sections)
    assert "### Diferensiasi Misi" in markdown_text
    assert "Isi VMTS." in markdown_text
    assert doc["content"][0] == {
        "type": "heading",
        "attrs": {"level": 3},
        "content": [{"type": "text", "text": "Diferensiasi Misi"}],
    }


def test_flatten_bab_list_keeps_every_level_like_dimas():
    from worker import _flatten_bab_list

    leaf = {"order": 1, "title": "a", "guidance": "g5", "subbab": []}
    bab_list = [{"order": 1, "title": "BAB", "subbab": [
        {"order": 1, "title": "A", "guidance": "g2", "subbab": [
            {"order": 1, "title": "A.1", "guidance": "g3", "subbab": [
                {"order": 1, "title": "1", "guidance": "g4", "subbab": [leaf]},
            ]},
        ]},
    ]}]
    nodes = _flatten_bab_list(bab_list)
    assert [(n["id"], n["parent_id"], n["level"]) for n in nodes] == [
        ("1", None, 1), ("1.1", "1", 2), ("1.1.1", "1.1", 3), ("1.1.1.1", "1.1.1", 4), ("1.1.1.1.1", "1.1.1.1", 5),
    ]


def test_bukti_dukung_with_zero_chunks_is_gagal_not_siap():
    import asyncio
    from unittest.mock import MagicMock, patch

    from worker import _handle_ingestion_bukti_dukung

    job = MagicMock()
    job.data = {"buktiDukungId": "ev-1", "tenantId": "tenant-1", "fileUrl": "tenant-1/kosong.pdf"}
    cur = MagicMock()
    with (
        patch("db.r2_client.download_to"),
        patch("ingestion.evidence_pipeline.process_file", return_value=[]),
        patch("vectorstore.pgvector_evidence_store.index_evidence_chunks") as index,
        patch("db.connection.tenant_cursor") as tc,
    ):
        tc.return_value.__enter__.return_value = cur
        result = asyncio.run(_handle_ingestion_bukti_dukung(job))

    index.assert_not_called()
    assert result["status"] == "error"
    status, note, evidence_id = cur.execute.call_args.args[1]
    assert (status, evidence_id) == ("GAGAL", "ev-1") and "teks" in note


def test_pilih_rubrik_per_sub_indikator_per_nomor_dan_semua():
    from ingestion.matrix_parser import IndicatorRubric
    from worker import _pilih_rubrik

    def r(no, sub):
        return IndicatorRubric(no=no, kriteria="k", indikator="i", score_type="qualitative",
                               score_criteria={}, formula=None, lkps_table_ref=[], sub_score_formula=None, sub_no=sub)

    rubrik = [r(5, "I"), r(43, "I"), r(43, "II")]
    # satu sub saja: 43.I tanpa 43.II
    assert [(x.no, x.sub_no) for x in _pilih_rubrik(rubrik, None, ["43|I"])] == [(43, "I")]
    # kunci sub mengalahkan daftar nomor
    assert [(x.no, x.sub_no) for x in _pilih_rubrik(rubrik, [5], ["43|II"])] == [(43, "II")]
    # hanya nomor: seluruh sub dari nomor itu (perilaku lama)
    assert [(x.no, x.sub_no) for x in _pilih_rubrik(rubrik, [43], None)] == [(43, "I"), (43, "II")]
    # keduanya kosong: semua
    assert len(_pilih_rubrik(rubrik, None, None)) == 3
