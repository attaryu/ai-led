"""Print cosine distances of the top hits per query, to sanity-check / re-tune the retrieval thresholds
(worker._LKPS_RAG_DISTANCE_MAX = 0.38, worker._EVIDENCE_RAG_DISTANCE_MAX = 0.65 -- Dimas's values, tuned on bge-m3).

    python -m scripts.sample_distances --tenant T --lkps L "kebijakan mutu" "data mahasiswa"
    python -m scripts.sample_distances --tenant T --evidence-ids id1,id2 "dokumen renstra"

Run it after reindexing, with queries whose right answer you know; a threshold belongs between the
distances of the hits that should be kept and the ones that should be dropped.
"""

from __future__ import annotations

import argparse


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("queries", nargs="+")
    ap.add_argument("--tenant", required=True)
    ap.add_argument("--lkps", help="LKPS file id (evidence_files.id, kind=LKPS) -- enables the LKPS table")
    ap.add_argument("--evidence-ids", help="comma-separated evidence file ids (enables the evidence table)")
    ap.add_argument("-k", type=int, default=10)
    a = ap.parse_args()

    from vectorstore.pgvector_evidence_store import search_evidence
    from vectorstore.pgvector_lkps_store import search_lkps

    for q in a.queries:
        print(f"\n## {q}")
        if a.lkps:
            for h in search_lkps(q, a.tenant, a.lkps, a.k):
                print(f"  LKPS     {h['distance']:.3f}  {h.get('sheet')}")
        if a.evidence_ids:
            for h in search_evidence(q, a.tenant, a.evidence_ids.split(","), a.k):
                print(f"  EVIDENCE {h['distance']:.3f}  {h['chunk_id']}")


if __name__ == "__main__":
    main()
