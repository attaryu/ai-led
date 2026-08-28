"""Excel Table Extractor v6.0 -- deteksi tabel by baris numbering + tabel info
via anchor "Info". Diadaptasi persis dari code/new_extract_mechanism.ipynb
Cell 20-21 (dipakai jalur LKPS di notebook, dipakai ulang di sini utk file
xlsx/xls yang diupload lewat halaman Document)."""
from typing import Dict, List, Optional, Tuple

import pandas as pd


def _empty(val) -> bool:
    return val is None or (isinstance(val, str) and val.strip() == "")


def _is_info_marker(val) -> bool:
    if isinstance(val, str):
        return val.strip().lower().rstrip(":") == "info"
    return False


def _build_merge_map(ws) -> Tuple[dict, dict]:
    mmap = {}
    merge_cols = {}
    for rng in ws.merged_cells.ranges:
        top_val = ws.cell(row=rng.min_row, column=rng.min_col).value
        for r in range(rng.min_row, rng.max_row + 1):
            for c in range(rng.min_col, rng.max_col + 1):
                mmap[(r, c)] = top_val
                merge_cols[(r, c)] = (rng.min_col, rng.max_col)
    return mmap, merge_cols


def _cell_val(ws, r: int, c: int, mmap: dict):
    return mmap.get((r, c), ws.cell(row=r, column=c).value)


def _read_grid(ws, mmap: dict) -> List[list]:
    max_r = ws.max_row or 1
    max_c = ws.max_column or 1
    return [
        [_cell_val(ws, r, c, mmap) for c in range(1, max_c + 1)]
        for r in range(1, max_r + 1)
    ]


def _extract_table_name(ws) -> Optional[str]:
    lines = []
    started = False
    for r in range(1, min(ws.max_row + 1, 25)):
        val = ws.cell(row=r, column=1).value
        if isinstance(val, str) and val.strip().lower().startswith("tabel"):
            lines.append(val.strip())
            started = True
        else:
            if started:
                break
    return " | ".join(lines) if lines else None


def _numbering_run(row: list) -> Tuple[int, int, int]:
    start_col = None
    expected = 1
    end_col = None
    for ci, v in enumerate(row):
        if isinstance(v, (int, float)) and not isinstance(v, bool) and float(v) == int(v):
            n = int(v)
            if start_col is None:
                if n == 1:
                    start_col = ci
                    end_col = ci
                    expected = 2
                continue
            if n == expected:
                end_col = ci
                expected += 1
            else:
                break
    if start_col is None or end_col - start_col + 1 < 2:
        return (0, 0, 0)
    return (start_col, end_col, end_col - start_col + 1)


def _is_numbering_row(row: list) -> bool:
    return _numbering_run(row)[2] >= 2


def _find_all_numbering_rows(grid: List[list]) -> List[int]:
    return [i for i, row in enumerate(grid) if _is_numbering_row(row)]


def _numbering_col_range(row: list) -> Tuple[int, int]:
    cs, ce, length = _numbering_run(row)
    if length == 0:
        return (0, len(row) - 1)
    return (cs, ce)


def _row_header_score(row_slice: list, n_cols: int) -> int:
    return sum(1 for v in row_slice if not _empty(v))


def _row_is_table_header(row_slice: list, n_cols: int, prev_score: int) -> bool:
    score = _row_header_score(row_slice, n_cols)
    if score == 0:
        return False
    min_required = max(2, n_cols // 2)
    if score >= min_required:
        return True
    if prev_score == 0 and n_cols <= 2:
        return True
    return False


def _build_col_names(ws, merge_cols, header_row_indices, col_start, col_end, header_sep=" | "):
    n_cols = col_end - col_start + 1
    levels: List[List[str]] = []
    for grid_r in header_row_indices:
        level = [""] * n_cols
        r_sheet = grid_r + 1
        for ci_rel in range(n_cols):
            c_sheet = col_start + ci_rel + 1
            raw_val = ws.cell(row=r_sheet, column=c_sheet).value
            if not _empty(raw_val):
                text = str(raw_val).strip()
                span = merge_cols.get((r_sheet, c_sheet))
                if span:
                    mc_start, mc_end = span
                    for mc in range(mc_start, mc_end + 1):
                        ci_fill = mc - col_start - 1
                        if 0 <= ci_fill < n_cols:
                            level[ci_fill] = text
                else:
                    level[ci_rel] = text
        levels.append(level)

    col_names = []
    for ci in range(n_cols):
        parts, seen = [], set()
        for lvl in levels:
            p = lvl[ci]
            if p and p not in seen:
                parts.append(p)
                seen.add(p)
        col_names.append(header_sep.join(parts) if parts else f"col_{ci}")
    return col_names


def _extract_one_table(ws, grid, merge_cols, num_row_abs, header_sep=" | "):
    n_rows = len(grid)
    num_row = grid[num_row_abs]
    col_start, col_end = _numbering_col_range(num_row)

    n_cols_data = col_end - col_start + 1
    header_rows = []
    prev_score = 0
    for r in range(num_row_abs - 1, -1, -1):
        row_slice = grid[r][col_start:col_end + 1]
        if all(_empty(v) for v in row_slice):
            break
        if not _row_is_table_header(row_slice, n_cols_data, prev_score):
            break
        header_rows.insert(0, r)
        prev_score = _row_header_score(row_slice, n_cols_data)

    data_rows = []
    for r in range(num_row_abs + 1, n_rows):
        row_slice = grid[r][col_start:col_end + 1]
        if all(_empty(v) for v in row_slice):
            break
        data_rows.append(r)

    if not data_rows:
        return None

    if header_rows:
        col_names = _build_col_names(ws, merge_cols, header_rows, col_start, col_end, header_sep)
    else:
        col_names = [f"col_{i}" for i in range(col_end - col_start + 1)]

    seen: Dict[str, int] = {}
    uniq = []
    for name in col_names:
        if name in seen:
            seen[name] += 1
            uniq.append(f"{name}_{seen[name]}")
        else:
            seen[name] = 0
            uniq.append(name)

    rows_data = [grid[r][col_start:col_end + 1] for r in data_rows]
    df = pd.DataFrame(rows_data, columns=uniq)
    df = df.dropna(how="all")
    df = df[df.apply(lambda r: any(not _empty(v) for v in r), axis=1)]
    df = df.reset_index(drop=True)
    return df


def _find_info_table(grid, occupied_rows: set, occupied_cols: set):
    n_rows = len(grid)
    n_cols = len(grid[0]) if grid else 0

    candidates = []
    for r in range(n_rows):
        for c in range(n_cols):
            if _is_info_marker(grid[r][c]):
                penalty = (1 if r in occupied_rows else 0) + (1 if c in occupied_cols else 0)
                candidates.append((penalty, r, c))

    if not candidates:
        return None

    candidates.sort()
    _, ar, ac = candidates[0]

    info_col_end = ac
    for c in range(ac, min(ac + 5, n_cols)):
        if any(not _empty(grid[r][c]) for r in range(ar, min(ar + 30, n_rows))):
            info_col_end = c

    info_row_end, gap = ar, 0
    for r in range(ar + 1, n_rows):
        cells = grid[r][ac:info_col_end + 1]
        if any(not _empty(v) for v in cells):
            info_row_end = r
            gap = 0
        else:
            gap += 1
            if gap > 3:
                break

    rows = []
    for r in range(ar, info_row_end + 1):
        row_vals = [grid[r][c] for c in range(ac, info_col_end + 1)]
        if any(not _empty(v) for v in row_vals):
            rows.append(row_vals)

    if not rows:
        return None

    n_info_cols = info_col_end - ac + 1
    df = pd.DataFrame(rows, columns=[f"info_col_{i}" for i in range(n_info_cols)])
    cols = list(df.columns)
    rename = {cols[0]: "label"}
    if len(cols) > 1:
        rename[cols[-1]] = "value"
    df = df.rename(columns=rename)

    df = df[~df["label"].apply(lambda v: _is_info_marker(v) if isinstance(v, str) else False)]
    df = df.dropna(how="all")

    cols_to_drop = [
        col for col in df.columns
        if col not in ("label", "value") and df[col].equals(df["label"])
    ]
    df = df.drop(columns=cols_to_drop)
    df = df.drop_duplicates().reset_index(drop=True)
    return df


def extract_tables(wb, sheet_name: str, header_sep: str = " | ") -> Dict:
    """`wb` is an already-loaded Workbook (`load_workbook(path, data_only=True)`)
    — reloading + reparsing the whole file per sheet is what made multi-sheet
    LKPS uploads (tens of sheets) crawl; the caller now loads it once."""
    ws = wb[sheet_name]
    mmap, merge_cols = _build_merge_map(ws)
    grid = _read_grid(ws, mmap)

    table_name = _extract_table_name(ws)
    all_num_rows = _find_all_numbering_rows(grid)

    tables = []
    occupied_rows = set()
    occupied_cols = set()

    for num_row_abs in all_num_rows:
        df = _extract_one_table(ws, grid, merge_cols, num_row_abs, header_sep)
        if df is not None and not df.empty:
            tables.append(df)
            cs, ce = _numbering_col_range(grid[num_row_abs])
            for c in range(cs, ce + 1):
                occupied_cols.add(c)
            occupied_rows.add(num_row_abs)

    if not tables:
        n_cols = len(grid[0]) if grid else 0
        col_names = [f"col_{i}" for i in range(n_cols)]
        df = pd.DataFrame(grid, columns=col_names).dropna(how="all")
        if not df.empty:
            tables.append(df)

    df_info = _find_info_table(grid, occupied_rows, occupied_cols)
    return {"name": table_name, "tables": tables, "info": df_info}


def _is_empty_val(val) -> bool:
    if val is None:
        return True
    try:
        if pd.isna(val):
            return True
    except (TypeError, ValueError):
        pass
    return str(val).strip() == ""


def drop_first_col_only_rows(tables: list) -> list:
    cleaned = []
    for df in tables:
        if df.empty or len(df.columns) < 2:
            cleaned.append(df)
            continue
        rest_cols = df.columns[1:]
        mask = df[rest_cols].apply(lambda row: all(_is_empty_val(v) for v in row), axis=1)
        df_clean = df[~mask].reset_index(drop=True)
        cleaned.append(df_clean)
    return cleaned


def df_to_konten(df: pd.DataFrame) -> str:
    lines = []
    for _, row in df.iterrows():
        pairs = [f"{col} : {row[col]}" for col in df.columns if not _is_empty_val(row[col])]
        if pairs:
            lines.append(", ".join(pairs))
    return "\n".join(lines)
