"""BullMQ worker consumer — tracker baris 17.

Membaca generation-queue / assessment-queue / ingestion-queue (nama harus
cocok dengan apps/backend/src/jobs/queue-names.ts). GENERASI_BAB
diimplementasikan sungguhan; ASSESSMENT_AMI & INGESTION_BUKTI_DUKUNG masih
stub (masing-masing tracker row sendiri).

Retry (3x, exponential backoff) disetel di producer (jobs.module.ts), bukan
di sini — BullMQ menyimpannya di job-nya sendiri di Redis.
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal
import time

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


def _build_generasi_prompt(
    judul_bab: str,
    pedoman: list[dict],
    rubric: list[dict],
    checklist: list[str],
    chunks: list[dict],
    user_prompt: str | None = None,
) -> str:
    pedoman_text = "\n".join(f"- {p['judul_poin']}: {p['isi_teks'][:500]}" for p in pedoman) or "(tidak ada pedoman spesifik tersedia)"
    rubric_text = "\n".join(f"- {r['kode_kriteria']}: {r['deskripsi'][:300]}" for r in rubric) or "(tidak ada rubrik spesifik tersedia)"
    checklist_text = "\n".join(f"- {c}" for c in checklist)
    evidence_text = "\n\n".join(f"[Bukti {i+1}] {c['text'][:800]}" for i, c in enumerate(chunks)) or "(tidak ada bukti dari dokumen LED yang ditemukan)"
    arahan_text = f"\n\nARAHAN TAMBAHAN DARI PENGGUNA:\n{user_prompt}" if user_prompt else ""

    return f"""Anda menulis draf Bab "{judul_bab}" untuk Laporan Evaluasi Diri (LED) akreditasi.

PEDOMAN:
{pedoman_text}

RUBRIK PENILAIAN:
{rubric_text}

CHECKLIST FAKTA YANG HARUS DIPENUHI:
{checklist_text}

BUKTI DARI DOKUMEN LED:
{evidence_text}{arahan_text}

Tulis draf bab dalam format Markdown, berdasarkan bukti di atas. Jangan mengarang data yang tidak ada di BUKTI. Gunakan heading, paragraf, dan daftar poin sesuai kebutuhan."""


async def _handle_generasi_bab(job) -> dict:
    """4-step RAG pipeline: pedoman+rubric -> checklist+evidence -> LLM+MD-to-HTML -> RAGAS.

    Persists BabDraft (sumber=AI) + overwrites BabDokumen's active state +
    GenerationRun + RagasScore(BAB_AKTIF) — packages/db/prisma/schema.prisma.
    """
    import markdown as md_lib

    from db.generation_client import (
        create_bab_draft,
        create_generation_run,
        create_ragas_score,
        get_bab_dokumen,
        get_pedoman_for_bab,
        get_rubrik_for_bab,
        get_user_nama,
        update_bab_dokumen_aktif,
    )
    from eval.ragas_eval import score_single_sample
    from llm.chat_model import build_plain_llm
    from vectorstore.pgvector_store import search_led

    payload = job.data
    bab_id = payload["babDokumenId"]
    user_id = payload["createdByUserId"]

    bab = get_bab_dokumen(bab_id)
    if bab is None:
        return {"status": "error", "error": f"BabDokumen {bab_id} tidak ditemukan"}

    t0 = time.time()

    # 1. Pedoman & rubrik — relational lookup by chapter number, not vector
    # search (see db/generation_client.py's own note on why).
    pedoman = get_pedoman_for_bab(bab["urutan_bab"])
    rubric = get_rubrik_for_bab(bab["urutan_bab"])

    # 2. Checklist + evidence chunks from the LED document itself.
    checklist = [p["judul_poin"] for p in pedoman] or [f"Poin kunci untuk {bab['judul_bab']}"]
    query = f"{bab['judul_bab']}: " + " ".join(checklist[:5])
    # search_led is synchronous (psycopg2 + blocking SentenceTransformer.encode) —
    # off the event loop, or it blocks BullMQ's lock-renewal long enough to stall.
    chunks = await asyncio.to_thread(search_led, query, bab["tenant_id"], bab["dokumen_id"], n_results=5)

    # 3. LLM call, then Markdown -> HTML.
    prompt = _build_generasi_prompt(
        bab["judul_bab"], pedoman, rubric, checklist, chunks, payload.get("prompt")
    )
    llm = build_plain_llm()
    response = await llm.ainvoke(prompt)
    markdown_text = response.content
    html = md_lib.markdown(markdown_text)
    latency_sec = time.time() - t0

    # 4. RAGAS: faithfulness / answer_relevancy / context_precision.
    try:
        ragas_scores = score_single_sample(
            question=bab["judul_bab"],
            answer=markdown_text,
            contexts=[c["text"] for c in chunks],
        )
    except Exception:
        logger.exception("RAGAS scoring gagal untuk bab %s, lanjut tanpa skor", bab_id)
        ragas_scores = {}

    # Persist: BabDraft (checkpoint) -> overwrite BabDokumen active state.
    # kontenKerja uses {format:'html', body} — the shape apps/web's
    # chapterRepository.toEntityFromBackend already expects; `markdown` rides
    # along for chat.py's context building, which the frontend ignores.
    konten = {"format": "html", "body": html, "markdown": markdown_text}
    user_nama = get_user_nama(user_id)
    draft = create_bab_draft(
        bab_id,
        user_id,
        user_nama,
        konten_snapshot=konten,
        referensi_chunk_ids=[c["chunk_id"] for c in chunks],
    )
    update_bab_dokumen_aktif(bab_id, konten, draft["id"])
    create_generation_run(
        bab_draft_id=draft["id"],
        model=getattr(llm, "model", getattr(llm, "model_name", "unknown")),
        pedoman_used=pedoman,
        rubric_used=rubric,
        checklist=checklist,
        chunks_used=chunks,
        judge_result=None,
        prompt_full=prompt,
        latency_sec=latency_sec,
        token_count=len(markdown_text.split()),
    )
    if ragas_scores:
        create_ragas_score(bab_id, draft["id"], ragas_scores, jumlah_chunk=len(chunks))

    return {
        "status": "completed",
        "babDraftId": draft["id"],
        "versi": draft["versi"],
        "ragasScores": ragas_scores,
    }


async def _handle_assessment_ami(job) -> dict:
    # TODO(tracker baris 24, Week 5 + Rencana Integrasi): panggil agent/graph.py
    # setelah isolasi tenant & lapis akses Postgres beres — lihat integration-plan.md.
    return {"status": "received", "handler": "ASSESSMENT_AMI (belum diimplementasikan)"}


async def _handle_ingestion_bukti_dukung(job) -> dict:
    # TODO: panggil ingestion/*.py setelah modul BuktiDukung NestJS ada.
    return {"status": "received", "handler": "INGESTION_BUKTI_DUKUNG (belum diimplementasikan)"}


async def main() -> None:
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    # bullmq's default lockDuration/stalledInterval is 30s — too short for LLM
    # calls (OLLAMA_TIMEOUT_SECONDS=300 default), which caused jobs to be
    # marked stalled and redelivered mid-generation. All queues here do
    # LLM/AI work, so raise both globally rather than per-queue.
    workers = [
        Worker(
            queue_name,
            process_job,
            {"connection": redis_url, "lockDuration": 600_000, "stalledInterval": 600_000},
        )
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
