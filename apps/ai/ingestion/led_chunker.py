"""
LED (Laporan Evaluasi Diri) PDF chunker.

Extracts text from the LED PDF page-by-page, tracks page offsets, then applies
a sliding-window chunking strategy with sentence-boundary snapping and overlap.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from typing import Callable, Optional

import pdfplumber

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CHUNK_MAX_CHARS = 3000
CHUNK_OVERLAP_CHARS = 300

# ---------------------------------------------------------------------------
# Section-heading detection patterns for Bahasa Indonesia academic documents
# ---------------------------------------------------------------------------

_SECTION_PATTERNS = [
    # BAB headings like "BAB I. PENDAHULUAN" or "BAB II. STRUKTUR LAPORAN"
    re.compile(r"^(BAB\s+[IVXLCD]+[\.\s]+[A-Z][A-Za-z\s,\(\)]{3,})", re.MULTILINE),
    # Criteria sub-sections like "C.1. Diferensiasi Misi" or "C.1 Diferensiasi Misi"
    re.compile(r"^(C\.\d+[\.\s]+[A-Z][A-Za-z,\s\(\)]{3,})$", re.MULTILINE),
    # Single-letter sections like "A. Struktur Tim" or "B. Analisis Lingkungan"
    re.compile(r"^([A-Z]\.\s+[A-Z][A-Za-z\s,\(\)]{3,})$", re.MULTILINE),
    # All-caps section headings like "KATA PENGANTAR", "DAFTAR ISI", "IDENTITAS PENGUSUL"
    re.compile(r"^([A-Z][A-Z\s]{4,})$", re.MULTILINE),
    # Numbered heading like "1.1 Visi Program Studi"
    re.compile(r"^(\d+\.\d*\s+[A-Z][A-Za-z\s]{5,})$", re.MULTILINE),
    # Roman-numeral heading like "IV. Kurikulum" or "I. Struktur organisasi"
    re.compile(r"^([IVXLCD]+\.\s+[A-Z][A-Za-z\s,\(\)]{5,})$", re.MULTILINE),
]

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

_PAGE_BREAK = "\n<<<PAGE_BREAK>>>\n"
# Docx equivalent of _PAGE_BREAK, used by led_docx_chunker.py — defined here
# so both extraction front-ends and _sliding_window_chunks agree on the marker.
_PARA_BREAK = "\n<<<PARA_BREAK>>>\n"


@dataclass
class LEDChunk:
    chunk_id: str
    text: str
    page_start: int
    page_end: int
    section_heading: Optional[str]
    char_start: int
    # Paragraph-index position, populated only for chunks sourced from a
    # .docx LED (which has no physical pages). -1 = n/a, mirrors the
    # page_start/page_end "n/a" convention below rather than using None
    # (keeps every field a plain int, which is what the pgvector columns need).
    para_start: int = -1
    para_end: int = -1


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def chunk_led_pdf(pdf_path: str) -> list[LEDChunk]:
    """Extract text from LED PDF and chunk it with overlap.

    Steps:
    1. Extract text per page with pdfplumber.
    2. Concatenate pages with page-break markers, recording char offsets.
    3. Sliding-window chunk the combined text.
    4. Resolve page numbers for each chunk window.
    5. Detect section headings and return LEDChunk objects.
    """
    combined_text, page_offsets = _extract_pages(pdf_path)
    chunks = _sliding_window_chunks(
        combined_text,
        position_offsets=page_offsets,
        heading_resolver=lambda text, char_start, char_end: _detect_section_heading(text),
    )
    return chunks


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _extract_pages(pdf_path: str) -> tuple[str, dict[int, int]]:
    """Return (combined_text, {char_offset: page_number}).

    char_offset is the character position in combined_text where that page starts.
    Page numbers are 0-based internally.
    """
    parts: list[str] = []
    page_offsets: dict[int, int] = {}  # char_offset -> page_num (0-based)
    current_offset = 0

    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages):
            page_offsets[current_offset] = page_num
            raw = page.extract_text() or ""
            # Normalise whitespace runs to single spaces; keep newlines
            raw = re.sub(r"[ \t]+", " ", raw)
            parts.append(raw)
            current_offset += len(raw)
            # Add page-break marker between pages
            if page_num < len(pdf.pages) - 1:
                parts.append(_PAGE_BREAK)
                current_offset += len(_PAGE_BREAK)

    return "".join(parts), page_offsets


_BREAK_MARKERS = (_PAGE_BREAK, _PARA_BREAK)


def _sliding_window_chunks(
    text: str,
    position_offsets: dict[int, int],
    heading_resolver: Callable[[str, int, int], Optional[str]],
    position_field: str = "page",
) -> list[LEDChunk]:
    """Produce overlapping chunks of ≤ CHUNK_MAX_CHARS characters.

    `position_offsets` maps a char offset to a "position" number (PDF page or
    docx paragraph index); `position_field` selects whether that position is
    written to page_start/page_end or para_start/para_end on the resulting
    LEDChunk (the other pair is left at its -1 "n/a" default).
    `heading_resolver(chunk_text, char_start, char_end)` returns a section
    heading for the chunk — regex-on-text for PDF, offset lookup for docx.
    """
    assert position_field in ("page", "para")
    chunks: list[LEDChunk] = []
    sorted_offsets = sorted(position_offsets.keys())
    text_len = len(text)
    pos = 0

    while pos < text_len:
        end = min(pos + CHUNK_MAX_CHARS, text_len)

        # Snap the end boundary to the last sentence-ending period before `end`
        if end < text_len:
            snap_zone = text[max(pos, end - 200): end]
            last_period = snap_zone.rfind(".")
            if last_period != -1:
                end = max(pos, end - 200) + last_period + 1

        raw_chunk = text[pos:end]

        # Strip break markers from the chunk text (use full marker to avoid orphan \n)
        clean_text = raw_chunk
        for marker in _BREAK_MARKERS:
            clean_text = clean_text.replace(marker, " ")
        clean_text = clean_text.strip()
        # Collapse repeated whitespace
        clean_text = re.sub(r"\n{3,}", "\n\n", clean_text)

        if len(clean_text) >= 50:
            start_pos = _value_at_offset(pos, sorted_offsets, position_offsets)
            end_pos = _value_at_offset(end - 1, sorted_offsets, position_offsets)
            heading = heading_resolver(clean_text, pos, end)
            position_kwargs = (
                {"page_start": start_pos, "page_end": end_pos, "para_start": -1, "para_end": -1}
                if position_field == "page"
                else {"page_start": -1, "page_end": -1, "para_start": start_pos, "para_end": end_pos}
            )
            chunks.append(
                LEDChunk(
                    chunk_id=str(uuid.uuid4()),
                    text=clean_text,
                    section_heading=heading,
                    char_start=pos,
                    **position_kwargs,
                )
            )

        # Advance by (CHUNK_MAX_CHARS - CHUNK_OVERLAP_CHARS) so chunks overlap
        step = CHUNK_MAX_CHARS - CHUNK_OVERLAP_CHARS
        pos += step

    return chunks


def _value_at_offset(
    offset: int,
    sorted_offsets: list[int],
    offset_map: dict[int, int],
) -> int:
    """Binary-search: return the value mapped to the last offset <= `offset`."""
    lo, hi = 0, len(sorted_offsets) - 1
    result = 0
    while lo <= hi:
        mid = (lo + hi) // 2
        if sorted_offsets[mid] <= offset:
            result = offset_map[sorted_offsets[mid]]
            lo = mid + 1
        else:
            hi = mid - 1
    return result


# Lines to skip when looking for headings (document-wide boilerplate)
_SKIP_LINES = re.compile(
    r"Dokumen Milik|Hanya Untuk Internal|^\s*$",
    re.IGNORECASE,
)


def _detect_section_heading(text: str) -> Optional[str]:
    """Detect a section heading from the first 400 chars of chunk text.

    Scans lines at the beginning of the chunk, skipping boilerplate, and
    returns the first line that matches a known heading pattern.
    """
    sample = text[:400]
    lines = sample.split("\n")[:10]
    for line in lines:
        stripped = line.strip()
        if not stripped or _SKIP_LINES.search(stripped):
            continue
        for pattern in _SECTION_PATTERNS:
            match = pattern.match(stripped)
            if match:
                heading = match.group(0).strip()
                # Reject if too short or just a number (page number)
                if len(heading) >= 5 and not re.match(r"^\d+$", heading):
                    return heading
    return None
