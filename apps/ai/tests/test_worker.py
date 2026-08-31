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


def test_build_generasi_prompt_forbids_repeating_chapter_title_as_heading():
    """Port of Dimas's 332ab2f: the LLM shouldn't restate the chapter title
    as its opening heading — that's already rendered by the editor."""
    from worker import _build_generasi_prompt

    prompt = _build_generasi_prompt("Tata Pamong", [], [], [], [], [])
    assert "JANGAN mengulang judul bab" in prompt
    assert '"Tata Pamong"' in prompt
