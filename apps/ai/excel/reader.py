"""
Laporan AK (Kertas Kerja) Excel reader.

Sheet structure (one block per indicator):

  Judge row  — col A (index 0) = integer indicator number
               col C (index 2) = indicator description string
               col E (index 4) = score INPUT cell (yellow, written by assessor)
               col F (index 5) = =IF(ISBLANK(E7),"judge",...) validation formula
               col H (index 7) = justification INPUT cell (written by assessor)

  Rubric rows — col C = integer 0–4 (rubric score), col D = rubric description

  Skor row   — col C = 'Skor' literal
               col E = =IF(...,0,E7) formula that copies from judge row's E

Detection logic:
  - Judge rows: isinstance(row[0], int) — exactly 78 such rows in Laporan_AK
  - Sheet identification: first sheet with col C == 'Skor' (literal, works with
    any openpyxl load_workbook mode)
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Optional

import openpyxl

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Column indices (0-based)
# ---------------------------------------------------------------------------

_COL_INDICATOR_NO = 0   # col A — integer indicator number on the judge row
_COL_KRITERIA = 2       # col C — indicator description on the judge row
_COL_SCORE = 4          # col E — score input on the judge row (1–4)
_COL_JUST = 7           # col H — justification input on the judge row

_SENTINEL_SKOR = "Skor"  # literal string in col C that marks a Skor row


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class IndicatorRow:
    row_index: int                       # 0-based index of the JUDGE row in the sheet
    indicator_no: int                    # indicator number (1–78)
    kriteria: str                        # indicator description from col C
    current_score: Optional[int]         # existing score in col E (None if blank)
    current_justification: Optional[str] # existing text in col H (None if blank)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def read_indicator_rows(xlsx_path: str) -> list[IndicatorRow]:
    """Parse Laporan_AK.xlsx Kertas Kerja sheet and return 78 indicator rows.

    Returns an empty list (with a warning log) if the file is absent or no
    Kertas Kerja sheet is found — keeps FastAPI startup safe before upload.
    """
    if not os.path.exists(xlsx_path):
        logger.warning("Laporan AK file not found: %s — returning empty list", xlsx_path)
        return []

    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = _find_kertas_kerja_sheet(wb)

    if ws is None:
        logger.warning("No Kertas Kerja sheet found in %s — returning empty list", xlsx_path)
        wb.close()
        return []

    rows = _extract_rows(ws)
    wb.close()
    return rows


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _find_kertas_kerja_sheet(wb: openpyxl.Workbook):
    """Return the first worksheet whose col C contains the literal 'Skor'.

    Only the 'Skor' sentinel is checked — the 'judge' sentinel is a formula
    result (not a literal) so it is unreliable when loaded with data_only=False.
    """
    for ws in wb.worksheets:
        for row in ws.iter_rows(values_only=True):
            if _cell(row, _COL_KRITERIA) == _SENTINEL_SKOR:
                return ws
    return None


def _extract_rows(ws) -> list[IndicatorRow]:
    """Return one IndicatorRow per judge row (col A = integer)."""
    indicators: list[IndicatorRow] = []

    for i, row in enumerate(ws.iter_rows(values_only=True)):
        indicator_no = _to_int(_cell(row, _COL_INDICATOR_NO))
        if indicator_no is None:
            continue
        # Exclude header rows where col C is not a description string
        desc = _cell(row, _COL_KRITERIA)
        if not isinstance(desc, str):
            continue

        kriteria = desc.strip()
        score = _to_int(_cell(row, _COL_SCORE))
        just = _to_str(_cell(row, _COL_JUST))

        indicators.append(
            IndicatorRow(
                row_index=i,
                indicator_no=indicator_no,
                kriteria=kriteria,
                current_score=score,
                current_justification=just,
            )
        )

    return indicators


# ---------------------------------------------------------------------------
# Tiny utility helpers
# ---------------------------------------------------------------------------


def _cell(row: tuple, col: int):
    """Safely retrieve a cell value by 0-based column index."""
    if row is None or col >= len(row):
        return None
    return row[col]


def _to_int(value) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _to_str(value) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None
