import os
from pathlib import Path

import pytest

from ingestion.led_chunker import CHUNK_MAX_CHARS, LEDChunk
from ingestion.led_docx_chunker import chunk_led_docx

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures" / "led_docx"

WITH_PREFIX_PATH = os.environ.get(
    "LED_DOCX_WITH_PREFIX_TEST_FILE", str(FIXTURES_DIR / "led_with_prefix.docx")
)
BARE_TITLE_PATH = os.environ.get(
    "LED_DOCX_BARE_TITLE_TEST_FILE", str(FIXTURES_DIR / "led_bare_title.docx")
)


@pytest.fixture(scope="session")
def chunks_with_prefix():
    if not Path(WITH_PREFIX_PATH).exists():
        pytest.skip(f"LED docx fixture not available: {WITH_PREFIX_PATH}")
    return chunk_led_docx(WITH_PREFIX_PATH)


@pytest.fixture(scope="session")
def chunks_bare_title():
    if not Path(BARE_TITLE_PATH).exists():
        pytest.skip(f"LED docx fixture not available: {BARE_TITLE_PATH}")
    return chunk_led_docx(BARE_TITLE_PATH)


# ── 1 ──────────────────────────────────────────────────────────────────────────
def test_chunking_produces_chunks(chunks_with_prefix):
    assert len(chunks_with_prefix) > 0


# ── 2 ──────────────────────────────────────────────────────────────────────────
def test_each_chunk_is_led_chunk(chunks_with_prefix):
    for c in chunks_with_prefix:
        assert isinstance(c, LEDChunk), f"Expected LEDChunk, got {type(c)}"


# ── 3 ──────────────────────────────────────────────────────────────────────────
def test_chunks_have_valid_text(chunks_with_prefix):
    for c in chunks_with_prefix:
        assert len(c.text) > 50, f"Chunk {c.chunk_id} text too short: {len(c.text)}"


# ── 4 ──────────────────────────────────────────────────────────────────────────
def test_chunks_not_too_long(chunks_with_prefix):
    upper = CHUNK_MAX_CHARS + 200
    for c in chunks_with_prefix:
        assert len(c.text) < upper, f"Chunk {c.chunk_id} text too long: {len(c.text)}"


# ── 5 ──────────────────────────────────────────────────────────────────────────
def test_chunks_have_no_page_but_have_paragraph_position(chunks_with_prefix):
    """docx-sourced chunks: page_start/page_end are the n/a sentinel (-1);
    para_start/para_end carry real, monotonically non-decreasing positions."""
    for c in chunks_with_prefix:
        assert c.page_start == -1, f"Chunk {c.chunk_id} unexpected page_start: {c.page_start}"
        assert c.page_end == -1, f"Chunk {c.chunk_id} unexpected page_end: {c.page_end}"
        assert c.para_start >= 0, f"Chunk {c.chunk_id} invalid para_start: {c.para_start}"
        assert c.para_end >= c.para_start, (
            f"Chunk {c.chunk_id} para_end {c.para_end} < para_start {c.para_start}"
        )


# ── 6 ──────────────────────────────────────────────────────────────────────────
def test_chunk_ids_are_unique(chunks_with_prefix):
    ids = [c.chunk_id for c in chunks_with_prefix]
    assert len(set(ids)) == len(chunks_with_prefix), "Duplicate chunk IDs found"


# ── 7 ──────────────────────────────────────────────────────────────────────────
def test_some_chunks_have_section_headings_with_prefix(chunks_with_prefix):
    with_headings = [c for c in chunks_with_prefix if c.section_heading]
    assert len(with_headings) >= 1, "Expected at least 1 chunk with a section heading"
    # The with-prefix fixture keeps markers like "BAB I" / "C.1" in the heading text.
    assert any(
        h.section_heading.startswith(("BAB", "C."))
        for h in with_headings
    ), f"Expected at least one BAB/C.x-prefixed heading, got: {[h.section_heading for h in with_headings]}"


# ── 8 ──────────────────────────────────────────────────────────────────────────
def test_some_chunks_have_section_headings_bare_title(chunks_bare_title):
    """The bare-title fixture mimics Dimas's export.py, which drops the BAB/C.x
    marker — headings should still be detected via paragraph style, just without
    a marker prefix."""
    with_headings = [c for c in chunks_bare_title if c.section_heading]
    assert len(with_headings) >= 1, "Expected at least 1 chunk with a section heading"
    assert not any(
        h.section_heading.startswith(("BAB", "C."))
        for h in with_headings
    ), f"Bare-title fixture should not have BAB/C.x-prefixed headings, got: {[h.section_heading for h in with_headings]}"


# ── 9 ──────────────────────────────────────────────────────────────────────────
def test_chunk_overlap_creates_adjacent_coverage(chunks_with_prefix):
    if len(chunks_with_prefix) < 2:
        pytest.skip("Need at least 2 chunks to check overlap")
    for i in range(len(chunks_with_prefix) - 1):
        assert chunks_with_prefix[i + 1].char_start < chunks_with_prefix[i].char_start + CHUNK_MAX_CHARS, (
            f"No overlap between chunk {i} and {i + 1}"
        )


# ── 10 ─ ChromaDB integration ──────────────────────────────────────────────────
def test_index_and_search_roundtrip(chunks_with_prefix, tmp_path):
    """Index docx-sourced chunks into ChromaDB and verify search returns correct
    structure, including the new para_start/para_end metadata fields."""
    from vectorstore.chroma_store import _get_ef, index_led_chunks, search_led

    try:
        _get_ef()
    except Exception as exc:
        pytest.skip(f"SentenceTransformer model unavailable: {exc}")

    persist_dir = str(tmp_path / "chroma_test_docx")
    index_led_chunks(chunks_with_prefix, persist_dir)

    results = search_led("visi misi program studi", persist_dir, n_results=3)
    assert len(results) > 0, "Search returned no results"
    for r in results:
        meta = r["metadata"]
        assert "para_start" in meta, f"metadata missing 'para_start': {meta}"
        assert "para_end" in meta, f"metadata missing 'para_end': {meta}"
        assert meta["page_start"] == -1
        assert meta["para_start"] >= 0
