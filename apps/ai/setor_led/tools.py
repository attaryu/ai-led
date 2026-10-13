"""Tool khusus setor ke LED. search_evidence_documents (AMI) hanya melihat bukti yang di-tag ke
indikator rubrik; IKU tidak punya tag, jadi tool ini mencari ke seluruh Bukti Dukung prodi dokumen."""

from __future__ import annotations

import json

from langchain_core.tools import tool

from agent.context import require_current_context
from vectorstore.pgvector_evidence_store import list_prodi_evidence_ids, search_evidence


@tool
def cari_bukti_dukung_prodi(query: str, n_results: int = 5) -> str:
    """Cari dokumen bukti dukung (SK, laporan, sertifikat, MoU, dll) milik program studi ini
    dengan semantic search. Berguna untuk capaian yang bukan angka tabel LKPS, mis. keberadaan
    kebijakan K3L, SK, atau hasil audit.

    Query harus KAYA KONTEKS: sebut topik indikator dan kata kunci konkret dokumen yang dicari.
    Mengembalikan potongan teks beserta nama berkas sumbernya. Hasil list kosong berarti prodi
    belum punya bukti dukung yang relevan -- itu BUKAN error, lanjutkan dengan LKPS dan LED.
    """
    ctx = require_current_context()
    berkas = list_prodi_evidence_ids(ctx.tenant_id, ctx.study_program_id)
    if not berkas:
        return json.dumps([], ensure_ascii=False)

    hasil = search_evidence(
        query=query,
        tenant_id=ctx.tenant_id,
        bukti_dukung_ids=list(berkas),
        n_results=n_results,
    )
    return json.dumps(
        [
            {
                "text": r["text"][:1000],
                "berkas": berkas.get(r["bukti_dukung_id"], "(berkas tidak dikenal)"),
                "relevance_score": round(1 - r["distance"], 3),
            }
            for r in hasil
        ],
        ensure_ascii=False,
    )
