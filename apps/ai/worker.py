"""BullMQ worker consumer — tracker baris 17.

Membaca generation-queue / assessment-queue / ingestion-queue (nama harus
cocok dengan apps/backend/src/jobs/queue-names.ts). GENERASI_BAB &
ASSESSMENT_AMI diimplementasikan sungguhan; INGESTION_BUKTI_DUKUNG masih
stub (tracker row sendiri).

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
    elif job.name == "SIMULASI_SKOR":
        result = await _handle_simulasi_skor(job)
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


def _build_simulasi_skor_prompt(
    judul_bab: str,
    konten: str,
    kriteria: list[dict],
) -> str:
    kriteria_text = "\n\n".join(
        f"- {k['kode_kriteria']}: {k['deskripsi']}\n"
        + "\n".join(f"  Skor {lvl['skor']}: {lvl['deskripsi']}" for lvl in k["level"])
        for k in kriteria
    )

    return f"""Anda menilai kelayakan isi Bab "{judul_bab}" terhadap kriteria rubrik akreditasi LAM Teknik berikut.

KRITERIA DAN TINGKAT PENILAIANNYA:
{kriteria_text}

ISI BAB YANG DINILAI:
{konten[:6000]}

Untuk SETIAP kriteria di atas, pilih SATU skor yang paling sesuai dengan isi bab (cocokkan dengan deskripsi tiap tingkat), dan tulis justifikasi singkat yang merujuk isi bab. Jangan menilai kriteria yang tidak tercantum di atas, dan jangan mengarang isi yang tidak ada di bab.

Balas HANYA dengan JSON berbentuk:
{{"skor": [{{"kode_kriteria": "...", "skor": <angka>, "justifikasi": "..."}}]}}"""


async def _handle_simulasi_skor(job) -> dict:
    """Menilai isi bab (kondisi aktif, atau salah satu checkpoint bila
    `babDraftId` disertakan) terhadap kriteria rubrik LAM Teknik yang berlaku
    untuk nomor bab ini (RubrikKriteriaBab, dicocokkan lewat urutan_bab —
    lihat db/generation_client.py::get_rubrik_for_bab).

    Menimpa (bukan menumpuk) HasilSkorKriteria untuk target yang dipilih —
    sama seperti seluruh state aktif lain di schema.prisma.
    """
    from agent.reasoning_graph import _extract_json
    from db.generation_client import (
        get_bab_dokumen,
        get_bab_draft,
        get_rubrik_for_bab,
        get_rubrik_levels,
        get_user_nama,
        replace_hasil_skor_kriteria,
    )
    from llm.chat_model import build_plain_llm

    payload = job.data
    bab_id = payload["babDokumenId"]
    user_id = payload["createdByUserId"]
    bab_draft_id = payload.get("babDraftId")

    bab = get_bab_dokumen(bab_id)
    if bab is None:
        return {"status": "error", "error": f"BabDokumen {bab_id} tidak ditemukan"}

    if bab_draft_id:
        draft = get_bab_draft(bab_draft_id)
        if draft is None or draft["bab_id"] != bab_id:
            return {"status": "error", "error": f"Checkpoint {bab_draft_id} tidak ditemukan"}
        snapshot = draft["konten_snapshot"]
        konten = snapshot.get("body", "") if isinstance(snapshot, dict) else ""
        target_tipe = "BAB_DRAFT"
    else:
        snapshot = bab["konten_kerja"]
        konten = snapshot.get("body", "") if isinstance(snapshot, dict) else ""
        target_tipe = "BAB_AKTIF"

    if not konten.strip():
        return {"status": "error", "error": "Belum ada tulisan yang bisa dinilai untuk lingkup yang dipilih"}

    kriteria = get_rubrik_for_bab(bab["urutan_bab"])
    if not kriteria:
        return {"status": "error", "error": f"Bab {bab['urutan_bab']} tidak dinilai kriteria rubrik apa pun"}

    levels_by_kriteria = get_rubrik_levels([k["id"] for k in kriteria])
    for k in kriteria:
        k["level"] = levels_by_kriteria.get(k["id"], [])

    prompt = _build_simulasi_skor_prompt(bab["judul_bab"], konten, kriteria)
    llm = build_plain_llm()
    response = await llm.ainvoke(prompt)
    parsed = _extract_json(response.content)
    dinilai = parsed.get("skor") if isinstance(parsed, dict) else None
    if not isinstance(dinilai, list):
        return {"status": "error", "error": "Model tidak mengembalikan hasil penilaian yang bisa dibaca"}

    kode_ke_id = {k["kode_kriteria"]: k["id"] for k in kriteria}
    skor_valid = {k["id"]: {lvl["skor"] for lvl in k["level"]} for k in kriteria}

    rows = []
    for item in dinilai:
        if not isinstance(item, dict):
            continue
        kriteria_id = kode_ke_id.get(item.get("kode_kriteria"))
        skor = item.get("skor")
        if kriteria_id is None or skor not in skor_valid.get(kriteria_id, set()):
            continue
        rows.append(
            {
                "kriteria_id": kriteria_id,
                "skor_didapat": skor,
                "justifikasi": item.get("justifikasi") or "",
            }
        )

    if not rows:
        return {"status": "error", "error": "Model tidak menghasilkan skor yang valid untuk kriteria manapun"}

    user_nama = get_user_nama(user_id)
    hasil = replace_hasil_skor_kriteria(
        target_tipe,
        bab_id=bab_id if target_tipe == "BAB_AKTIF" else None,
        bab_draft_id=bab_draft_id if target_tipe == "BAB_DRAFT" else None,
        rows=rows,
        dijalankan_oleh_user_id=user_id,
        dijalankan_oleh_nama=user_nama,
    )

    return {"status": "completed", "jumlahDinilai": len(hasil)}


async def _handle_assessment_ami(job) -> dict:
    """Menilai seluruh (atau sebagian, lewat `indikatorList`) indikator AMI
    untuk satu Dokumen LED lewat agent LangGraph yang sudah ada
    (agent/graph.py) — worker ini cuma pemicunya. Konkurensi, resume, isolasi
    galat per indikator, dan penulisan Postgres semuanya sudah dibangun di
    `api.routes.assessment._run_assessment_pipeline`; dipakai ulang persis,
    bukan ditulis ulang.

    LKPS: `lkps_tool.py` meng-cache registrinya di memori proses, diisi lewat
    `POST /upload/lkps` yang berjalan di proses `main.py` (uvicorn) — proses
    worker ini terpisah dan mulai dengan cache kosong. Dimuat ulang di sini
    dari berkas yang sama (`UPLOAD_DIR/{tenant_id}/{dokumen_id}/lkps.xlsx`)
    sebelum pipeline jalan, kalau berkasnya ada.

    Rubrik: `rubric_tool.py::_get_rubrics()` masih cache proses tunggal, satu
    matriks untuk semua tenant (bukan per dokumen) — celah pra-ada, dicatat
    di tracker, bukan diperbaiki di sini.
    """
    import uuid

    from agent.tools.lkps_tool import set_lkps_registry
    from agent.tools.rubric_tool import _get_rubrics
    from api.routes.assessment import _run_assessment_pipeline, _SimpleIndicator
    from api.routes.upload import _doc_dir
    from db.postgres_client import create_session, get_session
    from ingestion.lkps_loader import load_lkps

    payload = job.data
    dokumen_id = payload["dokumenId"]
    tenant_id = payload["tenantId"]
    user_id = payload["createdByUserId"]
    indikator_list = payload.get("indikatorList")

    lkps_path = os.path.join(_doc_dir(tenant_id, dokumen_id), "lkps.xlsx")
    if os.path.exists(lkps_path):
        try:
            set_lkps_registry(tenant_id, dokumen_id, load_lkps(lkps_path))
        except Exception:
            logger.exception(
                "Gagal memuat ulang LKPS untuk tenant=%s dokumen=%s", tenant_id, dokumen_id
            )

    rubrics = _get_rubrics()
    wanted = set(indikator_list) if indikator_list else None
    indicators = [
        _SimpleIndicator(indicator_no=r.no, kriteria=r.kriteria)
        for r in rubrics
        if wanted is None or r.no in wanted
    ]
    if not indicators:
        return {
            "status": "error",
            "error": "Tidak ada indikator yang bisa dinilai (rubrik kosong, atau indikatorList tidak cocok dengan rubrik yang ada)",
        }

    session_id = str(uuid.uuid4())
    create_session(
        session_id,
        tenant_id=tenant_id,
        dokumen_id=dokumen_id,
        created_by_user_id=user_id,
        total_indicators=len(indicators),
    )

    max_parallel = int(os.environ.get("ASSESSMENT_MAX_PARALLEL", "5"))
    await _run_assessment_pipeline(
        session_id=session_id,
        indicators=indicators,
        max_parallel=max_parallel,
        tenant_id=tenant_id,
        dokumen_id=dokumen_id,
    )

    sess = get_session(session_id)
    if sess is None or sess["status"] != "completed":
        return {
            "status": "error",
            "sessionId": session_id,
            "error": (sess or {}).get("error") or "Sesi asesmen tidak selesai dengan bersih",
        }
    return {
        "status": "completed",
        "sessionId": session_id,
        "totalIndicators": sess["total_indicators"],
        "completedIndicators": sess["completed_indicators"],
    }


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
