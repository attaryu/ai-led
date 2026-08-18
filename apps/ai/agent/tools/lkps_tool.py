"""Tool: get_lkps_table — retrieve LKPS data by table reference string.

LKPS (Laporan Kinerja Program Studi) is per-institution self-reported data,
not shared reference material — unlike the rubric (agent.tools.rubric_tool),
which genuinely is one shared national standard across institutions (same
as `RubrikKriteria`/`RubrikLevel` in packages/db/schema.prisma having no
tenantId at all). The registry below is keyed by (tenant_id, dokumen_id) so
one institution's LKPS never answers another's query.
"""

from __future__ import annotations

import json

from langchain_core.tools import tool

from agent.context import AssessmentContext, require_current_context

_registries: dict[AssessmentContext, object] = {}


def set_lkps_registry(tenant_id: str, dokumen_id: str, registry) -> None:
    """Inject a loaded LKPSRegistry for one (tenant_id, dokumen_id) pair."""
    _registries[AssessmentContext(tenant_id, dokumen_id)] = registry


@tool
def get_lkps_table(table_reference: str, max_rows: int = 30) -> str:
    """Ambil data dari tabel LKPS berdasarkan referensi seperti 'Tabel 2.a. LKPS'.

    Gunakan tool ini untuk mendapatkan data kuantitatif/statistik pendukung.
    Data dikembalikan dalam format markdown table.
    Parameter max_rows membatasi jumlah baris untuk menghindari context overload.

    Tabel yang dicari (tenant_id, dokumen_id) diambil dari konteks run saat
    ini (agent.context), BUKAN dari argumen tool.
    """
    ctx = require_current_context()
    registry = _registries.get(ctx)
    if registry is None:
        return json.dumps({"error": "LKPS registry belum diinisialisasi untuk dokumen ini"})

    df = registry.get_by_ref(table_reference)
    if df is None:
        return json.dumps(
            {
                "error": f"Tabel '{table_reference}' tidak ditemukan",
                "available_refs": list(registry.sheets.keys())[:10],
            }
        )

    return df.head(max_rows).to_markdown(index=False)
