"""Judge grounding AMI on-demand.

Dulu `judge_node` berjalan di ujung tiap graph scoring dan menahan tiap indikator
selama satu panggilan model juri. Sekarang graph hanya menyimpan cuplikan bukti
(`judge_evidence`) dan judge dijalankan di sini, dipicu pengguna:

POST /assessment/{session_id}/judge
    Body {"indicators": [{"indicator_no": int, "sub_no": str}]} (opsional; kosong = seluruh sesi).
    Mengembalikan {judge_id, total, skipped} segera; pekerjaan jalan di BackgroundTasks.
GET /assessment/judge/{judge_id}
    Progres dari dict memori (hilang bila proses restart, seperti _eval_results di eval.py;
    verdict yang sudah ditulis tetap ada di Postgres).

Verdict tidak pernah mengubah `confidence` -- itu tetap laporan model penilai.
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from agent.graph import run_judge
from db.postgres_client import get_judge_rows, get_session, set_judge_verdict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assessment", tags=["assessment"])

# judge_id -> {status, session_id, total, done, skipped, failed, error}
_judge_runs: dict[str, dict] = {}


class JudgeIndicatorRef(BaseModel):
    indicator_no: int
    sub_no: str = ""


class RunJudgeRequest(BaseModel):
    indicators: Optional[list[JudgeIndicatorRef]] = None


class RunJudgeResponse(BaseModel):
    judge_id: str
    total: int
    skipped: int


class JudgeStatusResponse(BaseModel):
    judge_id: str
    session_id: str
    status: str
    total: int
    done: int
    skipped: int
    failed: int
    error: Optional[str] = None


def plan_judge_rows(
    rows: list[dict], wanted: Optional[set[tuple[int, str]]]
) -> tuple[list[dict], int]:
    """Pisahkan baris sesi menjadi (yang dijudge, jumlah dilewati).

    - `wanted=None` (seluruh sesi): baris yang sudah punya verdict tidak dijalankan ulang dan
      tidak dihitung apa pun.
    - `wanted` berisi (daftar eksplisit): hanya baris itu, selalu dijalankan ulang; indikator
      yang diminta tetapi tidak ada di sesi dihitung dilewati.
    - Dilewati: tanpa skor, ada galat, atau `judge_evidence is None` (sesi lama). Bukti `""`
      sah dan tetap dijudge -- itu keadaan nyata "penilai tidak mengambil bukti".
    """
    to_judge: list[dict] = []
    skipped = 0
    present: set[tuple[int, str]] = set()
    for row in rows:
        key = (row["indicator_no"], row["sub_no"] or "")
        present.add(key)
        if wanted is not None and key not in wanted:
            continue
        if wanted is None and row["judge_verdict"] is not None:
            continue
        if row["score"] is None or row["error"] or row["judge_evidence"] is None:
            skipped += 1
            continue
        to_judge.append(row)
    if wanted is not None:
        skipped += len(wanted - present)
    return to_judge, skipped


def _judge_model_name() -> Optional[str]:
    try:
        from eval.ragas_eval import get_judge_llm_config

        return get_judge_llm_config()["model"]
    except Exception:
        logger.exception("Gagal membaca konfigurasi model juri")
        return None


def _max_parallel() -> int:
    """ASSESSMENT_MAX_PARALLEL, dijepit >= 1 (Semaphore(0) menggantung); nilai rusak -> 5."""
    try:
        return max(1, int(os.environ.get("ASSESSMENT_MAX_PARALLEL", "5")))
    except ValueError:
        return 5


async def _run_judge_background(
    judge_id: str, tenant_id: str, session_id: str, rows: list[dict], judge_model: Optional[str]
) -> None:
    run = _judge_runs[judge_id]

    async def _judge_one(row: dict) -> None:
        async with semaphore:
            try:
                verdict = await loop.run_in_executor(
                    None, run_judge, row["justification"] or "", row["judge_evidence"]
                )
                if "error" in verdict:
                    run["failed"] += 1
                else:
                    stored = {
                        **verdict,
                        "judge_model": judge_model,
                        "judged_at": datetime.now(timezone.utc).isoformat(),
                    }
                    written = await loop.run_in_executor(
                        None,
                        set_judge_verdict,
                        tenant_id,
                        session_id,
                        row["indicator_no"],
                        row["sub_no"],
                        row["justification"],
                        stored,
                    )
                    if not written:  # dinilai ulang saat judge berjalan -> verdict kedaluwarsa
                        run["failed"] += 1
            except Exception:
                logger.exception(
                    "Judge indikator %s.%s sesi %s gagal", row["indicator_no"], row["sub_no"], session_id
                )
                run["failed"] += 1
            finally:
                run["done"] += 1

    try:
        # Seluruh setup di dalam try: galat apa pun di sini harus berakhir 'failed', bukan 'running'.
        run["status"] = "running"
        loop = asyncio.get_running_loop()
        semaphore = asyncio.Semaphore(_max_parallel())
        await asyncio.gather(*(_judge_one(r) for r in rows))
        run["status"] = "completed"
    except Exception as exc:
        logger.exception("Judge run %s gagal", judge_id)
        run["status"] = "failed"
        run["error"] = str(exc) or type(exc).__name__


@router.post("/{session_id}/judge", response_model=RunJudgeResponse)
async def start_judge(
    session_id: str, body: RunJudgeRequest, background_tasks: BackgroundTasks
) -> RunJudgeResponse:
    sess = get_session(None, session_id)
    if sess is None:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")

    tenant_id = sess["tenant_id"]
    wanted = (
        {(i.indicator_no, i.sub_no) for i in body.indicators} if body.indicators is not None else None
    )
    to_judge, skipped = plan_judge_rows(get_judge_rows(tenant_id, session_id), wanted)

    judge_id = str(uuid.uuid4())
    _judge_runs[judge_id] = {
        "status": "pending" if to_judge else "completed",
        "session_id": session_id,
        "total": len(to_judge),
        "done": 0,
        "skipped": skipped,
        "failed": 0,
        "error": None,
    }
    if to_judge:
        background_tasks.add_task(
            _run_judge_background, judge_id, tenant_id, session_id, to_judge, _judge_model_name()
        )
    return RunJudgeResponse(judge_id=judge_id, total=len(to_judge), skipped=skipped)


@router.get("/judge/{judge_id}", response_model=JudgeStatusResponse)
async def get_judge_status(judge_id: str) -> JudgeStatusResponse:
    run = _judge_runs.get(judge_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Judge run not found: {judge_id}")
    return JudgeStatusResponse(judge_id=judge_id, **run)
