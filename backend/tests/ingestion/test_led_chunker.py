import os
from pathlib import Path
import pytest
from ingestion.led_chunker import chunk_led_pdf, LEDChunk, CHUNK_MAX_CHARS

LED_PATH = os.environ.get(
    "LED_TEST_FILE",
    "/home/arielsulton/Documents/Stargazing Project/VScode Project/tugas_akhir/AMI/docs/reference/[Setelah AL] LED STr PJJ Teknik Telekomunikasi-passwd_unlocked.pdf",
)


@pytest.fixture(scope="session")
def chunks():
    if not Path(LED_PATH).exists():
        pytest.skip(f"LED PDF not available: {LED_PATH}")
    return chunk_led_pdf(LED_PATH)


# ── 1 ──────────────────────────────────────────────────────────────────────────
def test_chunking_produces_chunks(chunks):
    assert len(chunks) > 0


# ── 2 ──────────────────────────────────────────────────────────────────────────
def test_each_chunk_is_led_chunk(chunks):
    for c in chunks:
        assert isinstance(c, LEDChunk), f"Expected LEDChunk, got {type(c)}"


# ── 3 ──────────────────────────────────────────────────────────────────────────
def test_chunks_have_valid_text(chunks):
    for c in chunks:
        assert len(c.text) > 50, f"Chunk {c.chunk_id} text too short: {len(c.text)}"


# ── 4 ──────────────────────────────────────────────────────────────────────────
def test_chunks_not_too_long(chunks):
    # Allow a small buffer for the sentence-boundary snap (up to 200 chars)
    upper = CHUNK_MAX_CHARS + 200
    for c in chunks:
        assert len(c.text) < upper, f"Chunk {c.chunk_id} text too long: {len(c.text)}"


# ── 5 ──────────────────────────────────────────────────────────────────────────
def test_chunks_have_page_numbers(chunks):
    for c in chunks:
        assert c.page_start >= 0, f"Chunk {c.chunk_id} has invalid page_start: {c.page_start}"


# ── 6 ──────────────────────────────────────────────────────────────────────────
def test_chunk_ids_are_unique(chunks):
    ids = [c.chunk_id for c in chunks]
    assert len(set(ids)) == len(chunks), "Duplicate chunk IDs found"


# ── 7 ──────────────────────────────────────────────────────────────────────────
def test_some_chunks_have_section_headings(chunks):
    with_headings = [c for c in chunks if c.section_heading]
    assert len(with_headings) >= 1, "Expected at least 1 chunk with a section heading"


# ── 8 ──────────────────────────────────────────────────────────────────────────
def test_chunk_overlap_creates_adjacent_coverage(chunks):
    """Consecutive chunks should overlap: chunk[i+1].char_start < chunk[i].char_start + CHUNK_MAX_CHARS."""
    if len(chunks) < 2:
        pytest.skip("Need at least 2 chunks to check overlap")
    for i in range(len(chunks) - 1):
        assert chunks[i + 1].char_start < chunks[i].char_start + CHUNK_MAX_CHARS, (
            f"No overlap between chunk {i} (char_start={chunks[i].char_start}) "
            f"and chunk {i+1} (char_start={chunks[i+1].char_start})"
        )


# ── 9 ─ ChromaDB integration ───────────────────────────────────────────────────
def test_index_and_search_roundtrip(chunks, tmp_path):
    """Index chunks into ChromaDB and verify search returns correct structure."""
    from vectorstore.chroma_store import index_led_chunks, search_led, _get_ef

    try:
        _get_ef()  # smoke-test model load before committing to indexing
    except Exception as exc:
        pytest.skip(f"SentenceTransformer model unavailable: {exc}")

    persist_dir = str(tmp_path / "chroma_test")
    index_led_chunks(chunks, persist_dir)

    results = search_led("visi misi program studi", persist_dir, n_results=3)
    assert len(results) > 0, "Search returned no results"
    for r in results:
        assert "text" in r, f"Result missing 'text' key: {r.keys()}"
        assert "chunk_id" in r, f"Result missing 'chunk_id' key: {r.keys()}"
        assert "distance" in r, f"Result missing 'distance' key: {r.keys()}"
        assert "metadata" in r, f"Result missing 'metadata' key: {r.keys()}"
        meta = r["metadata"]
        assert "page_start" in meta, f"metadata missing 'page_start': {meta}"
        assert "page_end" in meta, f"metadata missing 'page_end': {meta}"
        assert "section_heading" in meta, f"metadata missing 'section_heading': {meta}"
        assert "char_start" in meta, f"metadata missing 'char_start': {meta}"
