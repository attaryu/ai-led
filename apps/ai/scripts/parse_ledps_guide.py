"""One-off parser: 'Pedoman Penyusunan LEDPS' PDF -> guide_details JSON.

Not a general-purpose module like matrix_parser.py — this document's heading
levels (numbered / lettered / lower-roman / upper-roman / bullets, depth
varies per section) don't share one consistent numbering scheme the way the
scoring matrix's table columns do. Reconstructing that exact nesting isn't
needed anyway: _build_section_prompt (worker.py) only ever renders
point_title + content_text as a flat list, never point_code's hierarchy.

So headings are detected by **boldness** (Arial-BoldMT / Arial-BoldItalicMT),
not by matching every numbering variant — far more robust across a document
that mixes "1.", "a)", "i.", "I.", and bare bullets for the same conceptual
depth. Each bold line starts a new point; the italic
"(Penjelasan/Data disampaikan oleh pengusul ...)" boilerplate that follows
almost every point is dropped — it's a form instruction (who fills this in),
not guidance content.

chapter_order mapping — verified against the real LED structure
(led_bab_tabel.json), not assumed 1:1 with this document's own BAB numbering:
  PDF BAB I   (Rasional, Peran ED)        -> chapter_order 1 (Pendahuluan)
  PDF BAB II  (Tujuan dan Makna ED)       -> skipped (process guidance, not
                                              tied to any one chapter)
  PDF BAB III (A/B/C.1-C.7)               -> chapter_order 2
  PDF BAB IV  (Program Pengembangan)      -> chapter_order 3
  PDF BAB V   (Penutup)                   -> chapter_order 4

Run: python scripts/parse_ledps_guide.py <pdf_path> <out_json_path>
"""
from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, asdict

import pdfplumber

_BAB_MARKERS: list[tuple[re.Pattern, int | None]] = [
    (re.compile(r"^BAB\s+I\.\s+PENDAHULUAN", re.IGNORECASE), 1),
    (re.compile(r"^BAB\s+II\.\s+TUJUAN DAN MAKNA", re.IGNORECASE), None),
    (re.compile(r"^BAB\s+III\.\s+LAPORAN EVALUASI DIRI", re.IGNORECASE), 2),
    (re.compile(r"^BAB\s+IV\s+PROGRAM PENGEMBANGAN", re.IGNORECASE), 3),
    (re.compile(r"^BAB\s+V\.\s+PENUTUP", re.IGNORECASE), 4),
    # Stops extraction dead — everything from here on is the fill-in-the-blank
    # LEDPS form template (cover page, identity fields, etc.), not guidance
    # prose. "HALAMAN MUKA" is its first heading — verified against the
    # actual extracted text, not the DAFTAR ISI's fuller phrasing (which
    # reads "...AKREDITASI PROGRAM STUDI" and doesn't match the real one).
    (re.compile(r"^HALAMAN MUKA", re.IGNORECASE), "STOP"),
]


@dataclass
class GuideDetail:
    chapter_order: int
    point_code: str
    point_title: str
    content_text: str


def _line_is_bold(line_chars: list[dict]) -> bool:
    if not line_chars:
        return False
    bold_chars = sum(1 for c in line_chars if "Bold" in c["fontname"])
    return bold_chars / len(line_chars) > 0.6


def _line_is_italic_only(line_chars: list[dict]) -> bool:
    if not line_chars:
        return False
    italic_not_bold = sum(
        1 for c in line_chars if "Italic" in c["fontname"] and "Bold" not in c["fontname"]
    )
    return italic_not_bold / len(line_chars) > 0.6


def _group_lines(page) -> list[list[dict]]:
    """pdfplumber gives chars, not lines — group by rounded `top` (y position)."""
    by_top: dict[int, list[dict]] = {}
    for c in page.chars:
        key = round(c["top"])
        by_top.setdefault(key, []).append(c)
    lines = []
    for top in sorted(by_top):
        chars = sorted(by_top[top], key=lambda c: c["x0"])
        lines.append(chars)
    return lines


def _line_text(chars: list[dict]) -> str:
    return "".join(c["text"] for c in chars).strip()


def parse(pdf_path: str) -> list[GuideDetail]:
    results: list[GuideDetail] = []
    current_chapter: int | None = None
    current_title: str | None = None
    current_body: list[str] = []
    counter = 0
    stopped = False

    def flush():
        nonlocal current_title, current_body, counter
        if current_chapter is not None and current_title and current_body:
            counter += 1
            results.append(
                GuideDetail(
                    chapter_order=current_chapter,
                    point_code=f"bab{current_chapter}-{counter:03d}",
                    point_title=current_title,
                    content_text=" ".join(current_body).strip(),
                )
            )
        current_title = None
        current_body = []

    with pdfplumber.open(pdf_path) as pdf:
        # DAFTAR ISI (page index 2) lists every BAB title bold, same as the
        # real headings — no styling distinguishes them from the genuine
        # ones, so front matter is skipped by page index instead of guessed
        # at from formatting. Real "BAB I. PENDAHULUAN" starts at index 3.
        for page in pdf.pages[3:]:
            if stopped:
                break
            for chars in _group_lines(page):
                text = _line_text(chars)
                if not text:
                    continue

                marker_hit = False
                for pattern, target in _BAB_MARKERS:
                    # Bold-only: DAFTAR ISI lists "LAPORAN EVALUASI DIRI
                    # PROGRAM STUDI AKREDITASI ... 25" as plain (non-bold)
                    # text, which false-matched the STOP pattern before any
                    # real content was ever scanned.
                    if _line_is_bold(chars) and pattern.match(text):
                        flush()
                        if target == "STOP":
                            stopped = True
                        else:
                            current_chapter = target
                        marker_hit = True
                        break
                if marker_hit:
                    if stopped:
                        break
                    continue

                if _line_is_italic_only(chars):
                    continue  # form-instruction boilerplate, not content

                if _line_is_bold(chars):
                    flush()
                    current_title = text
                elif current_title is not None:
                    current_body.append(text)
                # else: body text before any heading in this chapter (e.g. BAB
                # IV's lead-in paragraph) — genuinely has no point_title to
                # attach to, dropped rather than guessed.
        flush()

    return results


def main() -> None:
    if len(sys.argv) != 3:
        print("Usage: parse_ledps_guide.py <pdf_path> <out_json_path>", file=sys.stderr)
        raise SystemExit(1)
    pdf_path, out_path = sys.argv[1], sys.argv[2]

    points = parse(pdf_path)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump([asdict(p) for p in points], f, ensure_ascii=False, indent=2)

    by_chapter: dict[int, int] = {}
    for p in points:
        by_chapter[p.chapter_order] = by_chapter.get(p.chapter_order, 0) + 1
    print(f"{len(points)} poin ditulis ke {out_path}")
    for chapter in sorted(by_chapter):
        print(f"  bab {chapter}: {by_chapter[chapter]} poin")


if __name__ == "__main__":
    main()
