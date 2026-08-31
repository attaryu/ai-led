"""Unit tests for document_catalog.py -- no Redis/Postgres needed."""

from __future__ import annotations


def test_catalog_for_prompt_numbers_match_catalog_order():
    from document_catalog import DOCUMENT_CATALOG, catalog_for_prompt

    entries = catalog_for_prompt()
    assert len(entries) == len(DOCUMENT_CATALOG)
    for i, entry in enumerate(entries, start=1):
        assert entry["no"] == i
        assert entry["label"] == DOCUMENT_CATALOG[i - 1]["label"]
        # id/parent_id/aliases are internal-only, must never leak to the prompt view.
        assert "id" not in entry
        assert "aliases" not in entry
        assert "parent_id" not in entry


def test_parse_items_accepts_matching_no_and_label():
    from document_catalog import DOCUMENT_CATALOG, parse_items

    entry = DOCUMENT_CATALOG[3]
    accepted, rejected = parse_items([{"no": 4, "label": entry["label"], "reason": "cocok"}])
    assert len(accepted) == 1
    assert accepted[0]["id"] == entry["id"]
    assert accepted[0]["reason"] == "cocok"
    assert rejected == []


def test_parse_items_tolerates_case_and_whitespace_differences():
    from document_catalog import DOCUMENT_CATALOG, parse_items

    entry = DOCUMENT_CATALOG[0]
    messy_label = "  ".join(entry["label"].upper().split(" "))
    accepted, rejected = parse_items([{"no": 1, "label": messy_label}])
    assert len(accepted) == 1
    assert rejected == []


def test_parse_items_rejects_no_out_of_range():
    from document_catalog import DOCUMENT_CATALOG, parse_items

    accepted, rejected = parse_items([{"no": len(DOCUMENT_CATALOG) + 1, "label": "apapun"}])
    assert accepted == []
    assert len(rejected) == 1
    assert "di luar katalog" in rejected[0]["why"]


def test_parse_items_rejects_no_and_label_disagreeing():
    """Regression guard for the exact bug Dimas documented: a model that
    paraphrases the label or gets the number wrong must be dropped, not
    silently accepted with a made-up identity."""
    from document_catalog import parse_items

    accepted, rejected = parse_items([{"no": 1, "label": "Dokumen yang dikarang model"}])
    assert accepted == []
    assert len(rejected) == 1
    assert rejected[0]["why"] == "nomor dan label tidak cocok"


def test_parse_items_rejects_non_dict_items():
    from document_catalog import parse_items

    accepted, rejected = parse_items(["bukan dict", 123, None])
    assert accepted == []
    assert len(rejected) == 3


def test_parse_items_empty_input():
    from document_catalog import parse_items

    assert parse_items([]) == ([], [])
    assert parse_items(None) == ([], [])
