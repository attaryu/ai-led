"""Re-ingest every LED / LKPS / evidence file into the current embedding model.

Needed once after the MiniLM -> bge-m3 migration (migration 20260921060000 requires the embedding
tables to be empty). Indexing replaces a document's previous rows, so re-running is safe.

    python -m scripts.reindex_embeddings          # from apps/ai, DATABASE_URL + R2 env set

LED from R2 via INGESTION_LED (plus legacy UPLOAD_DIR/{tenant}/{dokumen}/led.*); every LKPS file
(evidence_files kind=LKPS) via INGESTION_LKPS; Bukti Dukung via the normal ingestion handler.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from types import SimpleNamespace

logger = logging.getLogger("reindex")


def _reindex_uploads() -> None:
    from api.routes.upload import UPLOAD_DIR, _existing_led_path, _index_led_background

    for tenant in sorted(p for p in Path(UPLOAD_DIR).glob("*") if p.is_dir() and not p.name.startswith("_")):
        for doc in sorted(p for p in tenant.glob("*") if p.is_dir()):
            led = _existing_led_path(tenant.name, doc.name)
            if led:
                _index_led_background(led, tenant.name, doc.name)
            logger.info("reindexed %s/%s (led=%s)", tenant.name, doc.name, bool(led))


async def _reindex_documents() -> None:
    """LED by file key (writing_led_documents.led_file_key) + every LKPS file (kind=LKPS)."""
    from db.connection import tenant_cursor
    from worker import _handle_ingestion_led, _handle_ingestion_lkps

    with tenant_cursor(None) as cur:
        cur.execute(
            """SELECT d.id, ps.tenant_id, d.led_file_key
               FROM writing_led_documents d
               JOIN org_study_programs ps ON ps.id = d.study_program_id
               WHERE d.led_file_key IS NOT NULL"""
        )
        docs = cur.fetchall()
        cur.execute("SELECT id, tenant_id, file_url FROM evidence_files WHERE kind = 'LKPS'")
        lkps_files = cur.fetchall()
    for r in docs:
        data = {"dokumenId": r["id"], "tenantId": r["tenant_id"], "fileUrl": r["led_file_key"]}
        await _handle_ingestion_led(SimpleNamespace(data=data))
        logger.info("reindexed LED of document %s", r["id"])
    for r in lkps_files:
        data = {"evidenceId": r["id"], "tenantId": r["tenant_id"], "fileUrl": r["file_url"]}
        result = await _handle_ingestion_lkps(SimpleNamespace(data=data))
        logger.info("LKPS %s -> %s", r["id"], result["status"])


async def _reindex_evidence() -> None:
    from db.connection import tenant_cursor
    from worker import _handle_ingestion_bukti_dukung

    with tenant_cursor(None) as cur:
        cur.execute(
            "SELECT id, tenant_id, file_url FROM evidence_files WHERE tenant_id IS NOT NULL AND kind = 'BUKTI_DUKUNG'"
        )
        rows = cur.fetchall()
    for r in rows:
        data = {"buktiDukungId": r["id"], "tenantId": r["tenant_id"], "fileUrl": r["file_url"]}
        result = await _handle_ingestion_bukti_dukung(SimpleNamespace(data=data))
        logger.info("evidence %s -> %s", r["id"], result["status"])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    os.environ.setdefault("UPLOAD_DIR", "data/uploads")
    _reindex_uploads()
    asyncio.run(_reindex_documents())
    asyncio.run(_reindex_evidence())
