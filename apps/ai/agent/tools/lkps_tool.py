"""Tool: get_lkps_table — retrieve LKPS data by table reference string."""

from __future__ import annotations

import json
from typing import Optional

from langchain_core.tools import tool

# Registry is injected at startup via set_lkps_registry()
_lkps_registry: Optional[object] = None


def set_lkps_registry(registry) -> None:
    """Inject the loaded LKPSRegistry so the tool can access it."""
    global _lkps_registry
    _lkps_registry = registry


@tool
def get_lkps_table(table_reference: str, max_rows: int = 30) -> str:
    """Ambil data dari tabel LKPS berdasarkan referensi seperti 'Tabel 2.a. LKPS'.

    Gunakan tool ini untuk mendapatkan data kuantitatif/statistik pendukung.
    Data dikembalikan dalam format markdown table.
    Parameter max_rows membatasi jumlah baris untuk menghindari context overload.
    """
    if _lkps_registry is None:
        return json.dumps({"error": "LKPS registry belum diinisialisasi"})

    df = _lkps_registry.get_by_ref(table_reference)
    if df is None:
        return json.dumps(
            {
                "error": f"Tabel '{table_reference}' tidak ditemukan",
                "available_refs": list(_lkps_registry.sheets.keys())[:10],
            }
        )

    return df.head(max_rows).to_markdown(index=False)
