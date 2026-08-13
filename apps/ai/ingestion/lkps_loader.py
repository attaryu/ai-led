from dataclasses import dataclass, field
from typing import Optional
import re
import warnings
import pandas as pd

# Sheets that are navigation/index, not data
_SKIP_SHEETS = {"Menu", "Daftar Tabel", "PS"}

# Mapping: normalized reference text → list of sheet names
# "tabel 2.a" → ["2a1", "2a2", "2a3"]
_REF_TO_SHEETS: dict[str, list[str]] = {
    "tabel 1":     ["1"],
    "tabel 2.a":   ["2a1", "2a2", "2a3"],
    "tabel 2.b":   ["2b"],
    "tabel 3.a.1": ["3a1"],
    "tabel 3.a.2": ["3a2"],
    "tabel 3.a.3": ["3a3"],
    "tabel 3.a.4": ["3a4"],
    "tabel 3.b":   ["3b"],
    "tabel 3.c":   ["3c"],
    "tabel 4.a":   ["4a"],
    "tabel 4.b":   ["4b"],
    "tabel 4.c":   ["4c"],
    "tabel 4.d":   ["4d"],
    "tabel 4.e":   ["4e"],
    "tabel 4.f":   ["4f-1", "4f-2", "4f-3", "4f-4"],
    "tabel 4.g":   ["4g"],
    "tabel 4.h":   ["4h"],
    "tabel 4.i":   ["4i"],
    "tabel 4.j":   ["4j"],
    "tabel 5.a":   ["5a"],
    "tabel 5.b":   ["5b"],
    "tabel 5.c":   ["5c"],
    "tabel 6.a":   ["6a"],
    "tabel 6.b":   ["6b"],
    "tabel 6.c":   ["6c"],
    "tabel 6.d":   ["6d"],
    "tabel 6.e.1": ["6e1"],
    "tabel 6.e.2": ["6e2"],
    "tabel 6.e.3": ["6e3-1", "6e3-2", "6e3-3", "6e3-4"],
    "tabel 6.e.4": ["6e4"],
    "tabel 6.f.1": ["6f1"],
    "tabel 6.f.2": ["6f2"],
    "tabel 6.g.1": ["6g1"],
    "tabel 6.g.2": ["6g2"],
    "tabel 6.h.1": ["6h1"],
    "tabel 6.h.2": ["6h2"],
    "tabel 6.i":   ["6i"],
    "tabel 7.a":   ["7a"],
    "tabel 7.b":   ["7b"],
}


def _normalize_ref(text: str) -> str:
    text = re.sub(r"\s*LKPS\s*$", "", text, flags=re.IGNORECASE)
    return re.sub(r"[\s\.]+", " ", text).strip().lower()


# Pre-normalized registry keys to avoid re-normalizing on every get_by_ref call
_REF_TO_SHEETS_NORMALIZED: dict[str, list[str]] = {
    _normalize_ref(k): v for k, v in _REF_TO_SHEETS.items()
}


@dataclass
class LKPSRegistry:
    sheets: dict[str, pd.DataFrame] = field(default_factory=dict)

    def get_by_ref(self, ref_text: str) -> Optional[pd.DataFrame]:
        """
        Lookup DataFrame by reference text like "Tabel 2.a. LKPS".
        Strips trailing "LKPS", normalizes whitespace/dots, does greedy key match.
        Returns concatenated DataFrame if multiple sheets map to the ref.
        Returns None if no match.
        """
        normalized = _normalize_ref(ref_text)

        best_key = None
        best_key_norm = None
        for key_norm, sheets in _REF_TO_SHEETS_NORMALIZED.items():
            if key_norm in normalized:
                if best_key_norm is None or len(key_norm) > len(best_key_norm):
                    best_key = key_norm
                    best_key_norm = key_norm

        if best_key is None:
            return None

        sheet_names = _REF_TO_SHEETS_NORMALIZED[best_key]
        frames = [
            self.sheets[s]
            for s in sheet_names
            if s in self.sheets and not self.sheets[s].empty
        ]
        if not frames:
            return None
        return pd.concat(frames, ignore_index=True) if len(frames) > 1 else frames[0]

    def get_summary(self) -> dict[str, dict]:
        """Return dict of {sheet_name: {rows, columns}} for non-empty sheets."""
        return {
            name: {
                "rows": len(df),
                "columns": list(df.columns[:5]),
            }
            for name, df in self.sheets.items()
            if not df.empty
        }

    def get_sheet_as_text(self, sheet_name: str, max_rows: int = 20) -> str:
        """Convert sheet to markdown text for LLM context."""
        if sheet_name not in self.sheets:
            return f"Sheet '{sheet_name}' tidak ditemukan."
        df = self.sheets[sheet_name]
        if df.empty:
            return f"Sheet '{sheet_name}' kosong."
        return df.head(max_rows).to_markdown(index=False)


def _detect_header_row(df: pd.DataFrame) -> Optional[int]:
    """Find first row with >= 3 non-null values as the header row."""
    for i, row in df.iterrows():
        if row.notna().sum() >= 3:
            return i
    return None


def load_lkps(xlsx_path: str) -> LKPSRegistry:
    """Load all data sheets from LKPS xlsx into LKPSRegistry."""
    registry = LKPSRegistry()
    with pd.ExcelFile(xlsx_path, engine="openpyxl") as xf:
        for sheet_name in xf.sheet_names:
            if sheet_name in _SKIP_SHEETS:
                registry.sheets[sheet_name] = pd.DataFrame()
                continue
            try:
                # Read without header first to detect header row
                df_raw = pd.read_excel(xf, sheet_name=sheet_name, header=None)
                header_row = _detect_header_row(df_raw)
                if header_row is not None:
                    df = pd.read_excel(xf, sheet_name=sheet_name, header=header_row)
                else:
                    df = df_raw
                df = df.dropna(how="all").reset_index(drop=True)
                registry.sheets[sheet_name] = df
            except Exception as e:
                warnings.warn(f"Failed to load sheet '{sheet_name}': {e}")
                registry.sheets[sheet_name] = pd.DataFrame()

    return registry
