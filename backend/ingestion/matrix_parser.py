"""
Matriks Penilaian PDF parser.

Parses the LAM Teknik scoring rubric PDF into structured IndicatorRubric objects.

Table column layout (variable — detected from header row):
  8-col  pages: No | Kriteria | Indikator | 4 | 3 | 2 | 1 | 0
  10-col pages: No | (merge) | Kriteria | Indikator | 4 | 3 | 2 | 1 | 0 | (merge)
  20-col pages: No | Kriteria | Indikator | … | 4 | … | 3 | … | 2 | … | 1 | … | 0 | …
  16-col pages: similar wide layout

Indicator types:
  - qualitative  : text rubric ("mempertimbangkan aspek …")
  - quantitative : formula-based ("Jika BOP ≥ N, maka Skor =")
  - composite    : sub-score aggregation ("Skor = ((I x 2) + II) / 3")
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional

import pdfplumber

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

# LKPS table references: "Tabel 1 LKPS", "Tabel 4.a. LKPS", "Tabel 3.a.1. LKPS"
_LKPS_PATTERN = re.compile(r"Tabel\s+[\d\w]+(?:\.[\w]+)*\.?\s+LKPS", re.IGNORECASE)

# Quantitative detection — any of these signals a formula-based score
_QUANT_PATTERNS = [
    re.compile(r"[Jj]ika\s+\w+\s*[≥≤<>=]+\s*[\d.,]+"),  # "Jika X >= N"
    re.compile(r"maka\s+[Ss]kor\s*="),                     # "maka Skor ="
    re.compile(r"(?<!ada\s)[Ss]kor\s*=\s*\S"),             # "Skor = <non-space>" (not "ada Skor")
]

# Composite detection — kriteria text contains sub-score aggregation formula
_COMPOSITE_PATTERNS = [
    re.compile(r"[Ss]kor\s*=\s*\(?\(?[Ii]"),              # "Skor = (I", "Skor = ((I"
    re.compile(r"[Ss]kor\s*=\s*[\(\(]?\s*I\s*[x+\-/]"),   # "Skor = I x"
]

# Formula extraction from quantitative score texts
_FORMULA_EXTRACT = re.compile(
    r"[Ss]kor\s*=\s*(.+?)(?:\n|$|,\s*[Jj]ika)", re.DOTALL
)

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class IndicatorRubric:
    no: int
    kriteria: str
    indikator: str
    score_type: str                       # "qualitative" | "quantitative" | "composite"
    score_criteria: dict                  # {4: "...", 3: "...", 2: "...", 1: "...", 0: "..."}
    formula: Optional[str]               # e.g. "BOP / 5000000"
    lkps_table_ref: list                 # e.g. ["Tabel 2.b. LKPS"]
    sub_score_formula: Optional[str]     # e.g. "((I x 2) + II) / 3"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _clean(text: Optional[str]) -> str:
    """Normalise whitespace in extracted text."""
    if not text:
        return ""
    return re.sub(r"\s+", " ", text.strip())


def _detect_header_mapping(header_row: list) -> dict[str, int]:
    """
    Map logical column names to physical column indices from a header row.

    Returns a dict with keys: no, kriteria, indikator, s4, s3, s2, s1, s0.
    Returns an empty dict when the row does not look like a valid header.
    """
    mapping: dict[str, int] = {}
    for i, cell in enumerate(header_row):
        val = str(cell).strip() if cell else ""
        if val == "No":
            mapping["no"] = i
        elif val == "Kriteria":
            mapping["kriteria"] = i
        elif val == "Indikator":
            mapping["indikator"] = i
        elif val == "4":
            mapping["s4"] = i
        elif val == "3":
            mapping["s3"] = i
        elif val == "2":
            mapping["s2"] = i
        elif val == "1":
            mapping["s1"] = i
        elif val == "0":
            mapping["s0"] = i
    return mapping


def _is_valid_header(mapping: dict) -> bool:
    required = {"no", "indikator", "s4", "s3", "s2", "s1", "s0"}
    return required.issubset(mapping.keys())


def _safe_get(row: list, idx: int) -> str:
    """Get cell text by index, return empty string on missing/None."""
    if idx < 0 or idx >= len(row):
        return ""
    return _clean(row[idx])


def _extract_lkps_refs(text: str) -> list[str]:
    return [m.group() for m in _LKPS_PATTERN.finditer(text)]


def _is_quantitative(text: str) -> bool:
    return any(p.search(text) for p in _QUANT_PATTERNS)


def _is_composite(kriteria_text: str) -> bool:
    return any(p.search(kriteria_text) for p in _COMPOSITE_PATTERNS)


def _extract_formula(score_texts: dict[int, str]) -> Optional[str]:
    """
    Extract a representative formula expression from quantitative score cells.
    Looks for "Skor = <expr>" and returns the expression part.
    """
    for score_val in (4, 3, 2, 1, 0):
        text = score_texts.get(score_val, "")
        if not text:
            continue
        m = _FORMULA_EXTRACT.search(text)
        if m:
            expr = _clean(m.group(1))
            if expr:
                return expr
    return None


def _extract_sub_score_formula(kriteria: str) -> Optional[str]:
    """
    Extract the composite aggregation formula from kriteria text.
    E.g. "Skor = ((I x 2) + II) / 3" → "((I x 2) + II) / 3"
    """
    m = re.search(r"[Ss]kor\s*=\s*(.+?)(?:\n|$)", kriteria)
    if m:
        return _clean(m.group(1))
    return None


# ---------------------------------------------------------------------------
# Row accumulation state
# ---------------------------------------------------------------------------


@dataclass
class _RowAccumulator:
    """Holds mutable state while accumulating a multi-row indicator."""
    no: int = 0
    kriteria: str = ""
    indikator: str = ""
    scores: dict = field(default_factory=lambda: {4: "", 3: "", 2: "", 1: "", 0: ""})

    def append_score(self, key: int, text: str) -> None:
        existing = self.scores[key]
        if existing and text:
            self.scores[key] = existing + " " + text
        elif text:
            self.scores[key] = text

    def build(self) -> IndicatorRubric:
        all_text = " ".join([self.kriteria, self.indikator] + list(self.scores.values()))
        lkps_refs = list(dict.fromkeys(_extract_lkps_refs(all_text)))  # unique, ordered

        # Score type classification
        if _is_composite(self.kriteria):
            score_type = "composite"
            sub_score_formula = _extract_sub_score_formula(self.kriteria)
        elif _is_quantitative(all_text):
            score_type = "quantitative"
            sub_score_formula = None
        else:
            score_type = "qualitative"
            sub_score_formula = None

        formula: Optional[str] = None
        if score_type == "quantitative":
            formula = _extract_formula(self.scores)

        return IndicatorRubric(
            no=self.no,
            kriteria=self.kriteria,
            indikator=self.indikator,
            score_type=score_type,
            score_criteria={k: v for k, v in self.scores.items()},
            formula=formula,
            lkps_table_ref=lkps_refs,
            sub_score_formula=sub_score_formula,
        )


# ---------------------------------------------------------------------------
# Core parsing logic
# ---------------------------------------------------------------------------


def _process_table(
    table: list[list],
    current: Optional[_RowAccumulator],
    completed: list[IndicatorRubric],
    col_map: dict[str, int],
) -> tuple[Optional[_RowAccumulator], dict[str, int]]:
    """
    Process one pdfplumber table.

    Returns (updated_current_accumulator, updated_col_map).
    When a new indicator row is found, the previous one is flushed to `completed`.
    """
    for row in table:
        if not row:
            continue

        # --- Detect header row ---
        row_strs = [str(c).strip() if c else "" for c in row]
        if "No" in row_strs and "Indikator" in row_strs:
            new_map = _detect_header_mapping(row)
            if _is_valid_header(new_map):
                col_map = new_map
            continue  # skip the header row itself

        # --- Skip section header rows (only first cell non-empty) ---
        if len(row) < 4:
            continue

        no_idx = col_map.get("no", 0)
        no_val = _safe_get(row, no_idx).strip()

        # --- New indicator row: col[no] is a plain integer ---
        if no_val.isdigit():
            if current is not None:
                completed.append(current.build())

            no = int(no_val)
            kriteria_idx = col_map.get("kriteria", -1)
            indikator_idx = col_map.get("indikator", -1)

            kriteria = _safe_get(row, kriteria_idx)
            indikator = _safe_get(row, indikator_idx)

            current = _RowAccumulator(no=no, kriteria=kriteria, indikator=indikator)
            for score_val, key in ((4, "s4"), (3, "s3"), (2, "s2"), (1, "s1"), (0, "s0")):
                idx = col_map.get(key, -1)
                current.append_score(score_val, _safe_get(row, idx))

        # --- Continuation row (no number in col[0]) ---
        elif current is not None:
            # Continuation: append score cells to current accumulator
            for score_val, key in ((4, "s4"), (3, "s3"), (2, "s2"), (1, "s1"), (0, "s0")):
                idx = col_map.get(key, -1)
                text = _safe_get(row, idx)
                current.append_score(score_val, text)

            # Also pick up indikator continuation
            indikator_idx = col_map.get("indikator", -1)
            ind_text = _safe_get(row, indikator_idx)
            if ind_text and not current.indikator:
                current.indikator = ind_text
            elif ind_text:
                current.indikator += " " + ind_text

    return current, col_map


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def parse_matrix_pdf(pdf_path: str) -> list[IndicatorRubric]:
    """
    Parse the Matriks Penilaian PDF into a list of IndicatorRubric objects.

    Args:
        pdf_path: Absolute path to the matrik-penilaian.pdf file.

    Returns:
        List of IndicatorRubric, one per unique indicator number.
    """
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    completed: list[IndicatorRubric] = []
    current: Optional[_RowAccumulator] = None
    col_map: dict[str, int] = {}

    with pdfplumber.open(str(path)) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            try:
                tables = page.extract_tables()
            except Exception as exc:
                logger.warning("Page %d: table extraction failed — %s", page_num, exc)
                continue

            if not tables:
                continue

            # On most pages the first table is the main matrix table.
            # Use only tables with >= 6 columns (the overflow 1-col side tables are ignored).
            for table in tables:
                if not table or len(table[0]) < 6:
                    continue
                try:
                    current, col_map = _process_table(table, current, completed, col_map)
                except Exception as exc:
                    logger.warning(
                        "Page %d: row processing error — %s", page_num, exc
                    )

    # Flush last accumulator
    if current is not None:
        completed.append(current.build())

    # De-duplicate by indicator number (keep last occurrence, which is more complete)
    seen: dict[int, IndicatorRubric] = {}
    for rubric in completed:
        seen[rubric.no] = rubric

    result = sorted(seen.values(), key=lambda r: r.no)
    logger.info("Parsed %d unique indicators from '%s'", len(result), pdf_path)
    return result


def cache_rubrics(rubrics: list[IndicatorRubric], cache_path: str) -> None:
    """
    Serialise rubrics to a JSON cache file.

    Args:
        rubrics:    List of IndicatorRubric objects.
        cache_path: Destination file path.
    """
    data = [asdict(r) for r in rubrics]
    Path(cache_path).parent.mkdir(parents=True, exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    logger.info("Cached %d rubrics to '%s'", len(rubrics), cache_path)


def load_cached_rubrics(cache_path: str) -> list[IndicatorRubric]:
    """
    Load rubrics from a JSON cache file produced by :func:`cache_rubrics`.

    Args:
        cache_path: Path to the JSON cache file.

    Returns:
        List of IndicatorRubric objects with integer keys in score_criteria.
    """
    with open(cache_path, encoding="utf-8") as fh:
        data = json.load(fh)

    rubrics = []
    for item in data:
        # JSON keys are always strings; convert score_criteria keys back to int
        raw_scores = item.get("score_criteria", {})
        score_criteria = {int(k): v for k, v in raw_scores.items()}
        rubrics.append(
            IndicatorRubric(
                no=item["no"],
                kriteria=item["kriteria"],
                indikator=item["indikator"],
                score_type=item["score_type"],
                score_criteria=score_criteria,
                formula=item.get("formula"),
                lkps_table_ref=item.get("lkps_table_ref", []),
                sub_score_formula=item.get("sub_score_formula"),
            )
        )
    return rubrics
