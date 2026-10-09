from prose import content_to_nodes, content_to_text, doc_to_text, is_empty_doc, text_to_doc


def test_paragraphs_and_hard_break():
    doc = text_to_doc("A satu.\nlanjut\n\nB dua.")
    assert [n["type"] for n in doc["content"]] == ["paragraph", "paragraph"]
    assert doc["content"][0]["content"][1] == {"type": "hardBreak"}
    assert doc_to_text(doc) == "A satu.\nlanjut\nB dua."


def test_bullets_ordered_and_mixed():
    assert text_to_doc("• a\n• b")["content"][0]["type"] == "bulletList"
    assert text_to_doc("1. a\n2) b")["content"][0]["type"] == "orderedList"
    assert text_to_doc("• a\nteks")["content"][0]["type"] == "paragraph"


def test_table_block_uses_spec_columns():
    spec = [{"id": "T1", "columns": ["Nama", "Nilai"]}]
    doc = text_to_doc('{"table": "T1", "rows": [{"Nilai": "9", "Nama": "x"}]}', spec)
    table = doc["content"][0]
    assert table["type"] == "table"
    header = [c["content"][0]["content"][0]["text"] for c in table["content"][0]["content"]]
    assert header == ["Nama", "Nilai"]


def test_invalid_table_json_falls_back_to_paragraph():
    assert text_to_doc('{"table": "T1", "rows": []}')["content"][0]["type"] == "paragraph"


def test_empty_doc():
    assert is_empty_doc(text_to_doc(""))


def test_legacy_content_is_still_readable():
    legacy_md = {"format": "html", "body": "<p>x</p>", "markdown": "Teks lama."}
    legacy_html = {"format": "html", "body": "<p>Halo <b>dunia</b></p>"}
    assert content_to_text(legacy_md) == "Teks lama."
    assert content_to_text(legacy_html) == "Halo dunia"
    assert content_to_nodes(legacy_md)[0]["type"] == "paragraph"
    assert content_to_nodes({}) == []
    assert content_to_nodes(text_to_doc("Baru."))[0]["type"] == "paragraph"
