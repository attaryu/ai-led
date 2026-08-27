"""Tool: search_evidence_documents — semantic search over Bukti Dukung
(evidence) files uploaded for this tenant/program studi. Complements
search_led_evidence (LED narrative) — cross-checks that a LED's claims are
backed by an independently-verifiable source document."""

from __future__ import annotations

import json

from langchain_core.tools import tool

from agent.context import require_current_context
from vectorstore.pgvector_evidence_store import list_available_evidence_ids, search_evidence


@tool
def search_evidence_documents(query: str, n_results: int = 5) -> str:
    """Cari dokumen Bukti Dukung (SK, sertifikat, MoU, dll) yang sudah
    diunggah untuk program studi/tenant ini, pakai semantic search.

    Beda dengan search_led_evidence: tool ini mencari dokumen bukti
    FISIK/independen (bukan narasi LED), untuk verifikasi klaim LED
    terhadap sumber aslinya. Query harus KAYA KONTEKS (nomor indikator +
    kata kunci konkret dari kriteria rubrik), sama seperti search_led_evidence.
    Kalau hasilnya list kosong, berarti belum ada Bukti Dukung yang relevan
    untuk prodi ini — itu BUKAN error, lanjutkan penilaian dengan LED+LKPS
    seperti biasa.
    """
    ctx = require_current_context()
    evidence_ids = list_available_evidence_ids(ctx.tenant_id, ctx.study_program_id)
    if not evidence_ids:
        return json.dumps([], ensure_ascii=False)

    results = search_evidence(
        query=query,
        tenant_id=ctx.tenant_id,
        bukti_dukung_ids=evidence_ids,
        n_results=n_results,
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
