"""Tool: search_led_evidence — semantic search over the LED vector store."""

from __future__ import annotations

import json
import os

from langchain_core.tools import tool

from vectorstore.chroma_store import search_led


@tool
def search_led_evidence(query: str, n_results: int = 5) -> str:
    """Cari bukti/narasi dari dokumen LED menggunakan semantic search.

    Query harus KAYA KONTEKS, bukan cuma keyword pendek — masukkan nomor
    indikator DAN kata kunci konkret dari kriteria rubrik (bukan cuma nama
    topik umum), karena embedding query yang kaya konteks menghasilkan
    retrieval yang jauh lebih relevan.
    Contoh query buruk: "visi misi".
    Contoh query baik: "indikator 3 - proses penyusunan visi misi tujuan
    strategi program studi yang melibatkan pemangku kepentingan internal
    eksternal".
    Mengembalikan top-N chunk teks dari LED beserta metadata halaman/paragraf.
    """
    persist_dir = os.environ.get("CHROMA_PERSIST_DIR", "data/chroma_db")
    results = search_led(query=query, persist_dir=persist_dir, n_results=n_results)
    return json.dumps(
        [
            {
                "text": r["text"][:1000],  # cap per chunk to avoid context overload
                **_location_fields(r["metadata"]),
                "section": r["metadata"].get("section_heading"),
                "relevance_score": round(1 - r["distance"], 3),
            }
            for r in results
        ],
        ensure_ascii=False,
    )


def _location_fields(metadata: dict) -> dict:
    """Return a {"page": N} or {"paragraph": N} citation hint for the agent.

    page_start/page_end are -1 for docx-sourced chunks (no physical pages);
    para_start/para_end are -1 for pdf-sourced ones — see LEDChunk. Never
    surface the -1 sentinel itself, since it would read as a nonsense
    citation ("LED hal. -1").
    """
    page_start = metadata.get("page_start", -1)
    if page_start is not None and page_start >= 0:
        return {"page": page_start}
    para_start = metadata.get("para_start", -1)
    if para_start is not None and para_start >= 0:
        return {"paragraph": para_start}
    return {}
