"""Helper: dump rubric + LED + LKPS context for a list of indicators.

Used by Claude (LLM-as-annotator) to score the indicators manually with
full evidence available. Output goes to stdout in a markdown-ish format
that's easy for an LLM to parse.

Usage (inside container):
    python -m scripts.fetch_indicator_context 1 2 4 5 7 12 18 25 31 35
"""
from __future__ import annotations

import json
import sys
from agent.context import AssessmentContext, current_assessment_context
from agent.tools.lkps_tool import get_lkps_table, set_lkps_registry
from ingestion.lkps_loader import load_lkps
from vectorstore.pgvector_store import search_led

# Single-machine dev/eval script, operating on whatever was last uploaded
# locally — not a real tenant/document, just a fixed identity so it keeps
# working now that pgvector_store/lkps_tool are scoped per (tenant_id,
# dokumen_id). indicator_no is set per-indicator in main()'s loop below,
# since search_evidence_documents now scopes strictly to it.
_LOCAL_TENANT_ID = "local"
_LOCAL_DOKUMEN_ID = "local"


def _load_rubrics():
    with open("/app/data/rubric_cache/matrix.json") as f:
        return {r["no"]: r for r in json.load(f)}


def _ensure_lkps():
    """Side-effect: load LKPS registry into the lkps_tool module."""
    registry = load_lkps("/app/data/uploads/lkps.xlsx")
    set_lkps_registry(_LOCAL_TENANT_ID, _LOCAL_DOKUMEN_ID, registry)
    return registry


def _search_led(query: str, n: int = 5) -> list[dict]:
    results = search_led(
        query=query,
        tenant_id=_LOCAL_TENANT_ID,
        dokumen_id=_LOCAL_DOKUMEN_ID,
        n_results=n,
    )
    return [
        {
            "text": r["text"],
            "page": r["metadata"].get("page_start"),
            "section": r["metadata"].get("section_heading", ""),
        }
        for r in results
    ]


def dump_indicator(no: int, rubrics: dict) -> None:
    r = rubrics.get(no)
    if not r:
        print(f"### Indikator {no}: NOT FOUND")
        return

    print(f"\n{'='*72}")
    print(f"### INDIKATOR {no}: {r['kriteria']}")
    print(f"{'='*72}")
    print(f"Score type: {r.get('score_type')}")
    if r.get('formula'):
        print(f"Formula: {r['formula']}")
    if r.get('lkps_table_ref'):
        print(f"LKPS refs: {r['lkps_table_ref']}")
    print()

    # Rubrik (compact: only Skor 4 and 1)
    print("**RUBRIK:**")
    sc = r.get('score_criteria') or {}
    for k in sorted(sc.keys(), key=lambda x: int(x), reverse=True):
        crit = sc[k]
        print(f"  S{k}: {crit[:200]}")
    print()

    # LED evidence — top 2 chunks (compact)
    query = f"indikator {no}: {r['kriteria']}"
    chunks = _search_led(query, n=2)
    print(f"**LED EVIDENCE:**")
    for i, c in enumerate(chunks, 1):
        page = c.get("page", "?")
        text = c["text"][:400]
        print(f"  [p.{page}] {text}")
        print()

    # LKPS data
    refs = r.get('lkps_table_ref') or []
    if refs:
        print("**LKPS DATA:**")
        for ref in refs[:2]:
            try:
                # Extract table id e.g. "Tabel 1" -> "1", "Tabel 3.b" -> "3b"
                data = get_lkps_table.invoke({"table_reference": ref})
                # Truncate for context budget
                if len(data) > 800:
                    data = data[:800] + "\n...(trunc)"
                print(f"  {ref}:")
                print(f"  {data}")
                print()
            except Exception as exc:
                print(f"  ({ref}): error: {exc}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m scripts.fetch_indicator_context <indicator_no> [...]")
        sys.exit(1)

    indicator_nos = [int(x) for x in sys.argv[1:]]
    rubrics = _load_rubrics()
    _ensure_lkps()

    for no in indicator_nos:
        current_assessment_context.set(
            AssessmentContext(
                tenant_id=_LOCAL_TENANT_ID, dokumen_id=_LOCAL_DOKUMEN_ID, indicator_no=no,
                accreditation_set_id=_LOCAL_TENANT_ID,
            )
        )
        dump_indicator(no, rubrics)


if __name__ == "__main__":
    main()
