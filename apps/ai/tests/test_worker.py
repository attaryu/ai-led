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
        "Tata Pamong", [], [], selected_document_names=["Renstra 2020-2024"]
    )
    assert "Renstra 2020-2024" in prompt
    assert "checklist TETAP harus diturunkan dari PEDOMAN" in prompt


def test_build_checklist_prompt_omits_selected_documents_block_when_none():
    from worker import _build_checklist_prompt

    prompt = _build_checklist_prompt("Tata Pamong", [], [])
    assert "DOKUMEN YANG SUDAH DIPILIH USER" not in prompt


def test_build_section_prompt_forbids_any_heading():
    """Section content is inserted under its own `## judul` heading by
    _compile_chapter_from_sections — the LLM must not add its own."""
    from worker import _build_section_prompt

    prompt = _build_section_prompt("Kebijakan Tata Pamong", "Tata Pamong", [], [], [], [], [])
    assert "TANPA heading/judul apapun" in prompt
    assert "3-5 paragraf" in prompt


def test_build_assess_and_recommend_prompt_uses_closed_set_catalog():
    """Port of Dimas's 332ab2f: document picks come from the closed-set
    catalog, not a per-tenant registry search — the prompt must instruct
    the LLM accordingly and include the full numbered catalog."""
    from document_catalog import DOCUMENT_CATALOG
    from worker import _build_assess_and_recommend_prompt

    prompt = _build_assess_and_recommend_prompt(
        "Tata Pamong",
        [{"content_text": "Pedoman contoh."}],
        [{"description": "Rubrik skor 4 contoh."}],
        [],
        False,
    )
    assert "CLOSED SET" in prompt
    assert "Pedoman contoh." in prompt
    assert "Rubrik skor 4 contoh." in prompt
    assert f"{len(DOCUMENT_CATALOG)}. " in prompt
    assert DOCUMENT_CATALOG[0]["label"] in prompt
    # No leftover reference to the old registry-search inputs.
    assert "FOLDER KANDIDAT" not in prompt
    assert "QUERY KEBUTUHAN DOKUMEN" not in prompt


def test_build_assess_and_recommend_prompt_flags_missing_pedoman():
    from worker import _build_assess_and_recommend_prompt

    prompt = _build_assess_and_recommend_prompt("Tata Pamong", [], [], [], False)
    assert "PEDOMAN PENULISAN: TIDAK TERSEDIA" in prompt
    assert "JANGAN menebak dokumen dari judul SECTION" in prompt


def test_build_assess_and_recommend_prompt_includes_lkps_results_when_needed():
    from worker import _build_assess_and_recommend_prompt

    prompt = _build_assess_and_recommend_prompt(
        "Tata Pamong", [], [], ["Tabel 3.a.1: contoh data"], True,
    )
    assert "HASIL PENCARIAN LKPS" in prompt
    assert "Tabel 3.a.1: contoh data" in prompt


def test_build_suggest_custom_document_prompt_is_a_fallback_outside_catalog():
    """Port of Dimas's 332ab2f fallback -- separate prompt so the closed-set
    rule in the main prompt never softens."""
    from worker import _build_suggest_custom_document_prompt

    prompt = _build_suggest_custom_document_prompt(
        "Tata Pamong", [{"content_text": "Pedoman contoh."}], []
    )
    assert "TIDAK ADA satu pun entri" in prompt
    assert "Pedoman contoh." in prompt


def test_group_rubric_by_criterion_group_preserves_first_seen_order():
    from worker import _group_rubric_by_criterion_group

    rubric = [
        {"criterion_code": "1.1", "criterion_group": "Tata Pamong", "description": "a"},
        {"criterion_code": "2.1", "criterion_group": "Kerjasama", "description": "b"},
        {"criterion_code": "1.2", "criterion_group": "Tata Pamong", "description": "c"},
    ]
    grouped = _group_rubric_by_criterion_group(rubric)
    assert [g["name"] for g in grouped] == ["Tata Pamong", "Kerjasama"]
    assert len(grouped[0]["criteria"]) == 2


def test_build_outline_prompt_grounds_in_criterion_groups():
    from worker import _build_outline_prompt

    kelompok = [{"name": "Tata Pamong", "criteria": [{"criterion_code": "1.1", "description": "desc"}]}]
    prompt = _build_outline_prompt("Tata Pamong", kelompok, [])
    assert "KELOMPOK KRITERIA" in prompt
    assert "Tata Pamong" in prompt
    assert "1.1: desc" in prompt


def test_parse_outline_drops_items_missing_title_or_guidance():
    from worker import _parse_outline

    raw = """{"sections": [
        {"judul": "Kebijakan", "panduan": "Bahas dasar hukum"},
        {"judul": "", "panduan": "kosong judul"},
        {"judul": "Tanpa panduan"}
    ]}"""
    sections = _parse_outline(raw)
    assert sections == [{"title": "Kebijakan", "guidance": "Bahas dasar hukum"}]


def test_compile_chapter_from_sections_skips_ungenerated_and_orders_by_input():
    from worker import _compile_chapter_from_sections

    sections = [
        {"title": "Kebijakan", "status": "GENERATED", "content": {"markdown": "Isi kebijakan."}},
        {"title": "Belum jadi", "status": "PENDING", "content": None},
        {"title": "Pelaksanaan", "status": "GENERATED", "content": {"markdown": "Isi pelaksanaan."}},
    ]
    markdown_text, html = _compile_chapter_from_sections(sections)
    assert "## Kebijakan" in markdown_text
    assert "Isi kebijakan." in markdown_text
    assert "Belum jadi" not in markdown_text
    assert "## Pelaksanaan" in markdown_text
    assert "<h2>Kebijakan</h2>" in html
