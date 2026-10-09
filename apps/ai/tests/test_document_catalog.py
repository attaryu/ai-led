"""Unit tests for document_catalog.py -- no Redis/Postgres needed."""

from __future__ import annotations


def test_catalog_for_prompt_is_plain_labels_in_catalog_order():
    """dimas: no numbers -- the model copies labels, it can't renumber them."""
    from document_catalog import DOCUMENT_CATALOG, catalog_for_prompt

    assert catalog_for_prompt() == list(DOCUMENT_CATALOG)


def test_parse_items_accepts_an_exact_label():
    from document_catalog import DOCUMENT_CATALOG, parse_items

    label = DOCUMENT_CATALOG[3]
    accepted, rejected = parse_items([{"label": label}])
    assert accepted == [{"label": label, "reason": ""}]
    assert rejected == []


def test_parse_items_ignores_a_stray_number():
    """The failure dimas removed: a correct label is no longer dropped over a wrong/"string" number."""
    from document_catalog import DOCUMENT_CATALOG, parse_items

    accepted, _ = parse_items([{"no": "3", "label": DOCUMENT_CATALOG[0]}])
    assert [a["label"] for a in accepted] == [DOCUMENT_CATALOG[0]]


def test_parse_items_tolerates_case_and_whitespace_differences():
    from document_catalog import DOCUMENT_CATALOG, parse_items

    messy_label = "  ".join(DOCUMENT_CATALOG[0].upper().split(" "))
    accepted, rejected = parse_items([{"label": messy_label}])
    assert accepted[0]["label"] == DOCUMENT_CATALOG[0]
    assert rejected == []


def test_parse_items_rejects_a_paraphrased_label():
    from document_catalog import parse_items

    accepted, rejected = parse_items([{"label": "Dokumen yang dikarang model"}])
    assert accepted == []
    assert rejected[0]["why"] == "label tidak ditemukan di katalog"


def test_parse_items_rejects_non_dict_items():
    from document_catalog import parse_items

    accepted, rejected = parse_items(["bukan dict", 123, None])
    assert accepted == []
    assert len(rejected) == 3


def test_parse_items_empty_input():
    from document_catalog import parse_items

    assert parse_items([]) == ([], [])
    assert parse_items(None) == ([], [])
