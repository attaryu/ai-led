"""Unit tests for vectorstore.chroma_store — mainly the tenant/document
collection-naming scheme (see module docstring in chroma_store.py for why
this replaced a single fixed collection name)."""

import re

from vectorstore.chroma_store import collection_name

_SAFE_CHARS = re.compile(r"[a-zA-Z0-9._-]+")


def test_collection_name_is_deterministic():
    assert collection_name("tenant-a", "doc-1") == collection_name("tenant-a", "doc-1")


def test_collection_name_differs_per_tenant():
    assert collection_name("tenant-a", "doc-1") != collection_name("tenant-b", "doc-1")


def test_collection_name_differs_per_document():
    assert collection_name("tenant-a", "doc-1") != collection_name("tenant-a", "doc-2")


def test_collection_name_is_chroma_safe():
    """Chroma collection names must be alnum/./_/- only, 3-512 chars, and
    start/end alphanumeric."""
    name = collection_name("tenant-a", "doc-1")
    assert 3 <= len(name) <= 512
    assert _SAFE_CHARS.fullmatch(name)
    assert name[0].isalnum()
    assert name[-1].isalnum()


def test_collection_name_sanitizes_unsafe_characters():
    """_path_segment() in upload.py already rejects anything but
    [A-Za-z0-9_-] before this is ever called in production, but the function
    degrades safely on its own too, rather than trusting that guard alone."""
    name = collection_name("tenant/../etc", "doc id with spaces")
    assert _SAFE_CHARS.fullmatch(name)
    assert name[0].isalnum()
    assert name[-1].isalnum()
