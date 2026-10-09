"""Tool: get_lkps_table — retrieve LKPS data by table reference string.

LKPS is per-institution data (unlike the rubric, which is shared), so the
registry is keyed by (tenant_id, dokumen_id).
"""

from __future__ import annotations

import json

from langchain_core.tools import tool

from agent.context import require_current_context

# Keyed by plain (tenant_id, dokumen_id) tuple, not AssessmentContext — LKPS
# is per-document, not per-indicator, so it must not vary with indicator_no.
_registries: dict[tuple[str, str], object] = {}


def set_lkps_registry(tenant_id: str, dokumen_id: str, registry) -> None:
    """Inject a loaded LKPSRegistry for one (tenant_id, dokumen_id) pair."""
    _registries[(tenant_id, dokumen_id)] = registry


@tool
def get_lkps_table(table_reference: str, max_rows: int = 30) -> str:
    """Ambil data dari tabel LKPS berdasarkan referensi seperti 'Tabel 2.a. LKPS'.

    Gunakan tool ini untuk mendapatkan data kuantitatif/statistik pendukung.
    Data dikembalikan dalam format markdown table.
    Parameter max_rows membatasi jumlah baris untuk menghindari context overload.
    """
    # tenant/dokumen dari context, bukan argumen tool.
    ctx = require_current_context()
    registry = _registries.get((ctx.tenant_id, ctx.dokumen_id))
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


def load_lkps_for_document(tenant_id: str, dokumen_id: str, lkps_evidence_id: str | None) -> bool:
    """Load ariel's LKPSRegistry for one document into this process: the given Evidence xlsx
    (R2), else the legacy UPLOAD_DIR lkps.xlsx. Returns whether a registry is now loaded."""
    import os
    import tempfile
    from pathlib import Path

    from ingestion.lkps_loader import load_lkps

    if lkps_evidence_id:
        from db.connection import tenant_cursor
        from db.r2_client import download_to

        with tenant_cursor(tenant_id) as cur:
            cur.execute("SELECT file_url FROM evidence_files WHERE id = %s", (lkps_evidence_id,))
            row = cur.fetchone()
        if row:
            with tempfile.TemporaryDirectory(prefix="lkps_") as tmp:
                path = download_to(row["file_url"], Path(tmp) / Path(row["file_url"]).name)
                set_lkps_registry(tenant_id, dokumen_id, load_lkps(str(path)))
            return True

    from api.routes.upload import _doc_dir

    legacy = os.path.join(_doc_dir(tenant_id, dokumen_id), "lkps.xlsx")
    if os.path.exists(legacy):
        set_lkps_registry(tenant_id, dokumen_id, load_lkps(legacy))
        return True
    return False
