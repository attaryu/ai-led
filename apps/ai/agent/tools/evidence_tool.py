"""Tool: search_evidence_documents — semantic search over Bukti Dukung
(evidence) files uploaded for this tenant/program studi. Complements
search_led_evidence (LED narrative) — cross-checks that a LED's claims are
backed by an independently-verifiable source document."""

from __future__ import annotations

import json

from langchain_core.tools import tool

from agent.context import require_current_context
from vectorstore.pgvector_evidence_store import list_available_evidence_ids, search_evidence


# Docstring below is ariel's verbatim (LLM-visible tool description); only indicator_no moved to the
# run context. Scope (not told to the model): tenant + AccreditationSet + indicator tags, plus the
# document's own prodi or tenant-wide evidence -- no fallback to an untagged search.
@tool
def search_evidence_documents(query: str, n_results: int = 5) -> str:
    """Cari dokumen bukti pendukung (SK, sertifikat, MoU, dll) yang sudah
    di-tag ke indikator ini, pakai semantic search.

    Beda dengan search_led_evidence: tool ini mencari dokumen bukti
    FISIK/independen (bukan narasi LED), untuk verifikasi klaim LED
    terhadap sumber aslinya. Kalau hasilnya list kosong, berarti belum ada
    dokumen bukti yang di-tag ke indikator ini — itu BUKAN error, lanjutkan
    penilaian dengan LED+LKPS seperti biasa.
    """
    ctx = require_current_context()
    evidence_ids = list_available_evidence_ids(
        ctx.tenant_id, ctx.accreditation_set_id, ctx.indicator_no, ctx.study_program_id
    )
    if not evidence_ids:
        return json.dumps([], ensure_ascii=False)

    results = search_evidence(
        query=query,
        tenant_id=ctx.tenant_id,
        bukti_dukung_ids=evidence_ids,
        n_results=n_results,
        # ponytail: MiniLM dihapus -- satu kolom `embedding` (bge-m3) untuk semua.
        # `ami` tidak lagi memilih kolom; dibiarkan True agar perilaku lain
        # (top-k polos tanpa ambang jarak) tetap sama seperti sebelumnya.
        ami=True,
    )
    return json.dumps(
        [
            {
                "text": r["text"][:1000],
                "entity": r["entity"],
                "relevance_score": round(1 - r["distance"], 3),
            }
            for r in results
        ],
        ensure_ascii=False,
    )
