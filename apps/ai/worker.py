"""BullMQ worker consumer — tracker baris 17.

Membaca generation-queue / assessment-queue / ingestion-queue (nama harus
cocok dengan apps/backend/src/jobs/queue-names.ts). Handler masih stub —
pipeline sungguhan menunggu Rencana Integrasi (integration-plan.md).

Retry (3x, exponential backoff) disetel di producer (jobs.module.ts), bukan
di sini — BullMQ menyimpannya di job-nya sendiri di Redis.
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal

from bullmq import Worker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("apps.ai.worker")

QUEUE_NAMES = ["generation-queue", "assessment-queue", "ingestion-queue"]


async def process_job(job, token: str):
    """Log job, route by job.name, mark done."""
    logger.info(
        "job diterima: id=%s name=%s queue=%s payload=%s",
        job.id,
        job.name,
        job.queue.name,
        job.data,
    )

    if job.name == "GENERASI_BAB":
        result = await _handle_generasi_bab(job)
    elif job.name == "ASSESSMENT_AMI":
        result = await _handle_assessment_ami(job)
    elif job.name == "INGESTION_BUKTI_DUKUNG":
        result = await _handle_ingestion_bukti_dukung(job)
    else:
        logger.warning("job type tidak dikenal, diselesaikan tanpa aksi: %s", job.name)
        result = {"status": "skipped", "reason": f"unknown job type {job.name}"}

    logger.info("job selesai: id=%s result=%s", job.id, result)
    return result


async def _handle_generasi_bab(job) -> dict:
    # TODO(tracker baris 20, Week 4): panggil pipeline RAG 4-langkah sungguhan.
    return {"status": "received", "handler": "GENERASI_BAB (belum diimplementasikan)"}


async def _handle_assessment_ami(job) -> dict:
    # TODO(tracker baris 24, Week 5 + Rencana Integrasi): panggil agent/graph.py
    # setelah isolasi tenant & lapis akses Postgres beres — lihat integration-plan.md.
    return {"status": "received", "handler": "ASSESSMENT_AMI (belum diimplementasikan)"}


async def _handle_ingestion_bukti_dukung(job) -> dict:
    # TODO: panggil ingestion/*.py setelah modul BuktiDukung NestJS ada.
    return {"status": "received", "handler": "INGESTION_BUKTI_DUKUNG (belum diimplementasikan)"}


async def main() -> None:
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    workers = [
        Worker(queue_name, process_job, {"connection": redis_url})
        for queue_name in QUEUE_NAMES
    ]
    logger.info("worker jalan, memantau antrean: %s", ", ".join(QUEUE_NAMES))

    stop = asyncio.Event()

    def _request_stop(*_args) -> None:
        logger.info("sinyal berhenti diterima, menutup worker...")
        stop.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _request_stop)
        except NotImplementedError:
            # Windows tidak mendukung add_signal_handler untuk semua sinyal.
            signal.signal(sig, _request_stop)

    await stop.wait()
    await asyncio.gather(*(w.close() for w in workers))


if __name__ == "__main__":
    asyncio.run(main())
