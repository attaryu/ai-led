"""Pipeline per-IKU untuk job SETOR_LED. Tiap IKU berdiri sendiri (tanpa state bersama) dan dijalankan
paralel, dibatasi semaphore -- pola yang sama dengan api/routes/assessment.py::_run_assessment_pipeline.

Tahap 1 (cari_capaian): loop tool kecil mencari Capaian di LKPS / LED / bukti dukung prodi.
Tahap 2 (tulis_evaluasi_narasi): satu panggilan LLM JSON -> kategori Evaluasi + narasi.
"""

from __future__ import annotations

import asyncio
import contextvars
import json
import logging
import re
import threading
from typing import Awaitable, Callable, Optional

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage

from agent.context import AssessmentContext, current_assessment_context
from agent.graph import is_reasoning_model
from agent.tools.led_tool import search_led_evidence
from agent.tools.lkps_tool import _registries, get_lkps_table
from llm.chat_model import no_think
from setor_led.llm import build_setor_llm
from setor_led.prompts import SYSTEM_CAPAIAN, SYSTEM_CAPAIAN_JSON, bangun_prompt_capaian, bangun_prompt_evaluasi
from setor_led.schema import (
    IkuInput,
    SetorLedError,
    hasil_gagal,
    hasil_sukses,
    validasi_keluaran_llm,
)
from setor_led.tools import cari_bukti_dukung_prodi

logger = logging.getLogger(__name__)

MAX_TOOL_STEPS = 6          # panggilan tool maksimum per IKU sebelum model dipaksa menjawab
MAX_BAHAN_CHARS = 6000      # batas bahan tool yang diteruskan ke tahap 2
MAX_BAHAN_PER_TOOL = 2000   # jatah tiap hasil tool: satu tabel LKPS besar tidak boleh menggusur hasil LED/bukti
CANCEL_POLL_SECONDS: float = 3  # cek flag batal tiap ini detik, walau belum ada IKU yang selesai
MAX_JSON_RETRY = 2          # balasan non-JSON yang ditoleransi (tiap kali diingatkan) di loop protokol JSON
MAX_PESAN_TOOL = 4000       # hasil tool yang dikembalikan ke model di loop protokol JSON (sama dengan AMI)
REASONING_NUM_PREDICT = 8192  # model reasoning memakai banyak token <think>; sama dengan agent/reasoning_graph.py

_NUDGE_JSON = "Output sebelumnya tidak valid JSON. Ulangi dengan JSON satu baris saja, tanpa markdown atau penjelasan."
_BATAS_TOOL = "Batas pemanggilan tool tercapai. Berikan jawaban akhir JSON sekarang."

# Salah nama argumen yang lazim dari model; dinormalkan seperti agent/reasoning_graph.py::tool_node.
_ALIAS_ARGUMEN = {
    "get_lkps_table": {"table_id": "table_reference", "table": "table_reference"},
    "search_led_evidence": {"q": "query"},
    "cari_bukti_dukung_prodi": {"q": "query"},
}

TOOLS = [get_lkps_table, search_led_evidence, cari_bukti_dukung_prodi]
TOOLS_BY_NAME = {t.name: t for t in TOOLS}


class SetorLedCancelled(Exception):
    """Pekerjaan satu IKU dihentikan karena job dibatalkan. Bukan galat: dilempar thread LLM saat ia melihat sinyal batal."""


def _cek_batal(cancel_event: threading.Event | None) -> None:
    """Titik berhenti kooperatif. Membatalkan task asyncio tidak menghentikan thread executor yang sedang memanggil
    LLM; thread hanya bisa berhenti dengan memeriksa sinyal ini sebelum tiap langkah mahal (panggilan LLM / tool).
    Panggilan yang SUDAH berjalan tetap selesai (klien HTTP sinkron tidak bisa diputus), tapi tidak ada langkah baru."""
    if cancel_event is not None and cancel_event.is_set():
        raise SetorLedCancelled()


def _extract_json(teks: str):
    # Import malas: agent.reasoning_graph berat dan hanya parser ini yang dibutuhkan.
    from agent.reasoning_graph import _extract_json as ekstrak

    return ekstrak(teks)


def daftar_tabel_lkps(tenant_id: str, dokumen_id: str) -> list[str]:
    """Nama sheet LKPS yang termuat untuk dokumen ini, untuk diberikan ke model di awal supaya tidak
    menebak tabel. Memakai cache internal lkps_tool karena tidak ada getter publik dan kode tool AMI
    sengaja tidak diubah. [] bila registry belum dimuat."""
    registry = _registries.get((tenant_id, dokumen_id))
    return list(registry.sheets.keys()) if registry is not None else []


# Capaian yang hanya ditebak/disimpulkan model ("diperkirakan tinggi", "tidak terdapat angka eksplisit"). Prompt
# sudah melarangnya, tapi model kadang tetap menulis ditemukan=true dengan nilai ragu-ragu; tanpa penjaga ini
# narasi "diperkirakan memenuhi" ikut tertulis ke dokumen akreditasi. Berlaku untuk keluaran bahasa Indonesia.
_RAGU = re.compile(
    r"diperkirakan|perkiraan"
    r"|tidak\s+(?:terdapat|ada|ditemukan|tercantum|disebutkan|dicantumkan)\s+(?:\w+\s+){0,3}?(?:angka|nilai)"
    r"|tidak\s+(?:secara\s+)?eksplisit",
    re.IGNORECASE,
)


def parse_capaian(content: object, kode: str = "") -> dict | None:
    """Jawaban akhir tahap 1 -> {"nilai", "sumber"[, "dasar"]}, atau None bila tidak ditemukan, tidak terbaca,
    atau ragu-ragu (lihat _RAGU). `dasar` (rincian perhitungan/bukti) hanya untuk tahap 2, tidak masuk hasil job.
    `kode` hanya untuk log: alasan penolakan dicatat supaya "Capaian tidak ditemukan" bisa ditelusuri."""
    teks = content if isinstance(content, str) else str(content or "")
    data = _extract_json(teks)
    if not isinstance(data, dict):
        logger.info("Capaian %s ditolak: jawaban tahap 1 tidak terbaca sebagai JSON: %.300r", kode, teks)
        return None
    if not data.get("ditemukan"):
        logger.info("Capaian %s: model menjawab ditemukan=false", kode)
        return None
    nilai = str(data.get("nilai") or "").strip()
    if not nilai:
        logger.info("Capaian %s ditolak: ditemukan=true tetapi nilai kosong", kode)
        return None
    dasar = str(data.get("dasar") or "").strip()
    if _RAGU.search(nilai):
        logger.warning("Capaian %s ditolak: ragu-ragu di nilai: %.300r", kode, nilai)
        return None
    if _RAGU.search(dasar):
        logger.warning("Capaian %s ditolak: ragu-ragu di dasar (nilai=%.100r): %.300r", kode, nilai, dasar)
        return None
    capaian = {"nilai": nilai, "sumber": str(data.get("sumber") or "").strip() or "tidak disebutkan"}
    if dasar:
        capaian["dasar"] = dasar
    return capaian


def _jalankan_tool(call: dict) -> str:
    """Satu panggilan tool dari model. Galat tool dikembalikan sebagai teks hasil tool (bukan raise),
    supaya satu tool yang gagal tidak menjatuhkan IKU -- model bisa mencoba tool lain."""
    tool = TOOLS_BY_NAME.get(call.get("name"))
    if tool is None:
        return json.dumps({"error": f"tool '{call.get('name')}' tidak tersedia"}, ensure_ascii=False)
    try:
        return str(tool.invoke(call.get("args") or {}))
    except Exception as exc:  # noqa: BLE001 -- sengaja luas, lihat docstring
        logger.warning("Tool %s gagal: %s", call.get("name"), exc)
        return json.dumps({"error": f"{type(exc).__name__}: tool gagal dijalankan"}, ensure_ascii=False)


def cari_capaian(
    llm,
    iku: IkuInput,
    tabel_lkps: list[str],
    cancel_event: threading.Event | None = None,
    prodi: str | None = None,
) -> tuple[dict | None, str]:
    """Tahap 1. Mengembalikan (capaian atau None, bahan) -- bahan = gabungan hasil tool untuk tahap 2.
    Raise SetorLedCancelled bila `cancel_event` menyala (diperiksa sebelum tiap panggilan LLM dan tool).
    `prodi` = nama + jenjang prodi (lihat prompts.format_prodi), agar model tidak menebak varian jenis program."""
    pesan = [
        SystemMessage(content=SYSTEM_CAPAIAN),
        HumanMessage(content=bangun_prompt_capaian(iku, tabel_lkps, prodi)),
    ]
    bahan: list[str] = []

    def _bahan() -> str:
        return "\n\n".join(bahan)[:MAX_BAHAN_CHARS]

    for _ in range(MAX_TOOL_STEPS):
        _cek_batal(cancel_event)
        jawaban = llm.invoke(pesan)
        pesan.append(jawaban)
        panggilan = getattr(jawaban, "tool_calls", None) or []
        if not panggilan:
            return parse_capaian(jawaban.content, kode=iku.kode), _bahan()
        for call in panggilan:
            _cek_batal(cancel_event)
            keluaran = _jalankan_tool(call)
            bahan.append(f"[{call.get('name')}] {keluaran[:MAX_BAHAN_PER_TOOL]}")
            pesan.append(ToolMessage(content=keluaran, tool_call_id=call.get("id"), name=call.get("name")))

    # Batas langkah habis: paksa jawaban akhir. Bila model masih meminta tool, parse_capaian -> None.
    pesan.append(HumanMessage(content="Batas pemanggilan tool tercapai. Berikan jawaban akhir JSON sekarang."))
    _cek_batal(cancel_event)
    return parse_capaian(llm.invoke(pesan).content, kode=iku.kode), _bahan()


def _normalkan_argumen(nama: str, args: object) -> dict:
    """`args` dari model -> dict untuk tool: bukan dict jadi {}, nama argumen yang salah lazim diperbaiki."""
    if not isinstance(args, dict):
        return {}
    args = dict(args)
    for salah, benar in _ALIAS_ARGUMEN.get(nama, {}).items():
        if salah in args and benar not in args:
            args[benar] = args.pop(salah)
    return args


def cari_capaian_json(
    llm,
    iku: IkuInput,
    tabel_lkps: list[str],
    cancel_event: threading.Event | None = None,
    prodi: str | None = None,
) -> tuple[dict | None, str]:
    """Tahap 1 untuk model reasoning, yang tidak punya function calling bawaan: tool dipanggil lewat JSON di teks
    (`{"action": "<tool>", "args": {...}}` / `{"action": "final", ...}`), protokol yang sama dengan
    agent/reasoning_graph.py milik AMI. `llm` polos (tanpa bind_tools). Kontrak hasil dan pembatalan sama dengan
    cari_capaian. Jumlah panggilan LLM terbatas: MAX_TOOL_STEPS tool + 1 jawaban paksa + MAX_JSON_RETRY pengingat."""
    pesan = [
        SystemMessage(content=SYSTEM_CAPAIAN_JSON),
        HumanMessage(content=bangun_prompt_capaian(iku, tabel_lkps, prodi)),
    ]
    bahan: list[str] = []
    langkah = 0       # tool yang sudah dijalankan
    salah_format = 0  # balasan yang bukan objek JSON beraksi
    dipaksa = False   # batas tool tercapai: model sudah diminta menjawab akhir

    def _bahan() -> str:
        return "\n\n".join(bahan)[:MAX_BAHAN_CHARS]

    while True:
        _cek_batal(cancel_event)
        if langkah >= MAX_TOOL_STEPS and not dipaksa:
            pesan.append(HumanMessage(content=_BATAS_TOOL))
            dipaksa = True
        jawaban = llm.invoke(pesan)
        teks = str(jawaban.content or "")
        data = _extract_json(teks)
        aksi = data.get("action") if isinstance(data, dict) else None

        if aksi == "final" or (isinstance(data, dict) and aksi is None and "ditemukan" in data):
            return parse_capaian(teks, kode=iku.kode), _bahan()

        if not isinstance(aksi, str):
            if salah_format >= MAX_JSON_RETRY:
                logger.info("Capaian %s: model tidak membalas JSON yang valid: %.300r", iku.kode, teks)
                return None, _bahan()
            salah_format += 1
            pesan += [jawaban, HumanMessage(content=_NUDGE_JSON)]
            continue

        if dipaksa:
            logger.info("Capaian %s: model masih meminta tool '%s' setelah batas langkah", iku.kode, aksi)
            return None, _bahan()

        _cek_batal(cancel_event)
        keluaran = _jalankan_tool({"name": aksi, "args": _normalkan_argumen(aksi, data.get("args"))})
        bahan.append(f"[{aksi}] {keluaran[:MAX_BAHAN_PER_TOOL]}")
        langkah += 1
        pesan += [jawaban, HumanMessage(content=f"Hasil tool ({aksi}):\n{keluaran[:MAX_PESAN_TOOL]}")]


def tulis_evaluasi_narasi(
    llm,
    iku: IkuInput,
    capaian: dict,
    bahan: str,
    model: str | None = None,
    cancel_event: threading.Event | None = None,
    prodi: str | None = None,
):
    """Tahap 2. Satu percobaan + satu ulang bila JSON/enum tidak valid; lalu SetorLedError.
    Raise SetorLedCancelled bila `cancel_event` menyala (diperiksa sebelum tiap panggilan LLM, termasuk retry)."""
    prompt_awal = no_think(bangun_prompt_evaluasi(iku, capaian, bahan, prodi), model)
    prompt = prompt_awal
    terakhir: SetorLedError | None = None
    for _ in range(2):
        _cek_batal(cancel_event)
        jawaban = llm.invoke(prompt)
        try:
            return validasi_keluaran_llm(_extract_json(str(jawaban.content or "")))
        except SetorLedError as exc:
            terakhir = exc
            # Retry dengan prompt identik hampir pasti mengulang kesalahan yang sama: sebutkan alasannya.
            prompt = (
                f"{prompt_awal}\n\nJawaban sebelumnya ditolak: {exc}. "
                "Jawab ulang HANYA dengan satu objek JSON yang valid sesuai format di atas."
            )
            logger.warning(
                "Keluaran tahap 2 untuk %s tidak valid: %s | jawaban mentah (%d char): %.400r",
                iku.kode, exc, len(str(jawaban.content or "")), str(jawaban.content or ""),
            )
    raise terakhir  # type: ignore[misc]  # loop selalu berjalan >= 1 kali


def _proses_iku_sync(
    iku: IkuInput,
    model: str | None,
    tabel_lkps: list[str],
    cancel_event: threading.Event | None = None,
    prodi: str | None = None,
) -> dict:
    """Seluruh pekerjaan satu IKU (sinkron, jalan di thread executor karena tool & LLM sinkron).
    Raise SetorLedCancelled bila `cancel_event` menyala: thread berhenti di titik aman berikutnya."""
    _cek_batal(cancel_event)
    # Routing seperti AMI (agent/graph.py::build_graph_auto): model reasoning -> tool lewat protokol JSON, selain itu
    # tool calling bawaan. is_reasoning_model membaca LLM_REASONING_MODE / REASONING_MODEL_PATTERNS.
    reasoning = is_reasoning_model(model or "")
    if reasoning:
        llm_tool = build_setor_llm(model, num_predict=REASONING_NUM_PREDICT, disable_reasoning=False)
        capaian, bahan = cari_capaian_json(llm_tool, iku, tabel_lkps, cancel_event, prodi=prodi)
    else:
        llm_tool = build_setor_llm(model, tools=TOOLS)
        capaian, bahan = cari_capaian(llm_tool, iku, tabel_lkps, cancel_event, prodi=prodi)
    if capaian is None:
        raise SetorLedError("Capaian tidak ditemukan di LKPS/LED/bukti dukung")

    _cek_batal(cancel_event)
    # Model reasoning tidak boleh dimatikan reasoning-nya: OpenRouter menjawab 400 "Reasoning is mandatory for this
    # endpoint" untuk deepseek-r1. Model chat tetap memakai bawaan (dimatikan di tahap JSON tanpa tools).
    llm_narasi = build_setor_llm(
        model,
        temperature=0.2,
        num_predict=REASONING_NUM_PREDICT if reasoning else 3000,
        **({"disable_reasoning": False} if reasoning else {}),
    )
    evaluasi, inti, tambahan = tulis_evaluasi_narasi(llm_narasi, iku, capaian, bahan, model, cancel_event, prodi=prodi)
    return hasil_sukses(iku.kode, capaian, evaluasi, inti, tambahan)


async def proses_iku(
    iku: IkuInput,
    semaphore: asyncio.Semaphore,
    *,
    tenant_id: str,
    dokumen_id: str,
    accreditation_set_id: str,
    study_program_id: Optional[str],
    model: Optional[str],
    tabel_lkps: list[str],
    cancel_event: threading.Event | None = None,
    konteks_prodi: str | None = None,
) -> dict:
    """Satu IKU, dibatasi semaphore. Tidak pernah raise (selain CancelledError): kegagalan menjadi
    hasil_gagal supaya IKU lain tetap jalan. Pesan galat tak terduga sengaja generik (tanpa teks mentah)."""
    async with semaphore:
        try:
            # run_in_executor tidak mewarisi contextvars: salin eksplisit agar tool melihat konteks ini.
            # indicator_no=0: IKU bukan indikator rubrik, dan tool yang dipakai tidak membacanya.
            current_assessment_context.set(
                AssessmentContext(tenant_id, dokumen_id, 0, accreditation_set_id, study_program_id)
            )
            ctx = contextvars.copy_context()
            return await asyncio.get_running_loop().run_in_executor(
                None, ctx.run, _proses_iku_sync, iku, model, tabel_lkps, cancel_event, konteks_prodi
            )
        except SetorLedCancelled:
            return hasil_gagal(iku.kode, "Dibatalkan")
        except SetorLedError as exc:
            return hasil_gagal(iku.kode, str(exc))
        except Exception as exc:  # noqa: BLE001
            logger.exception("Gagal memproses IKU %s", iku.kode)
            return hasil_gagal(iku.kode, f"Gagal diproses ({type(exc).__name__}) -- lihat log server untuk detail.")


async def jalankan_setor_led(
    iku_list: list[IkuInput],
    *,
    max_parallel: int,
    tenant_id: str,
    dokumen_id: str,
    accreditation_set_id: str,
    study_program_id: Optional[str],
    model: Optional[str],
    on_progress: Optional[Callable[[int, int], Awaitable[None]]] = None,
    is_cancelled: Optional[Callable[[], Awaitable[bool]]] = None,
    konteks_prodi: Optional[str] = None,
) -> tuple[list[dict], bool]:
    """Jalankan semua IKU paralel. Mengembalikan (hasil berurutan sesuai input untuk IKU yang selesai,
    dibatalkan). `is_cancelled` dipoll tiap CANCEL_POLL_SECONDS meski belum ada IKU yang selesai (endpoint
    LLM yang macet bisa membuat tak satu pun selesai berminit-menit); bila true, tugas yang belum selesai
    dibatalkan dan yang sudah selesai tetap dikembalikan. Thread LLM yang sedang berjalan ikut dihentikan lewat
    `cancel_event` (lihat _cek_batal), bukan hanya task-nya."""
    tabel_lkps = daftar_tabel_lkps(tenant_id, dokumen_id)
    semaphore = asyncio.Semaphore(max_parallel)
    cancel_event = threading.Event()
    tugas = {
        asyncio.ensure_future(
            proses_iku(
                iku,
                semaphore,
                tenant_id=tenant_id,
                dokumen_id=dokumen_id,
                accreditation_set_id=accreditation_set_id,
                study_program_id=study_program_id,
                model=model,
                tabel_lkps=tabel_lkps,
                cancel_event=cancel_event,
                konteks_prodi=konteks_prodi,
            )
        ): iku.kode
        for iku in iku_list
    }

    hasil_per_kode: dict[str, dict] = {}
    pending = set(tugas)
    selesai = 0
    dibatalkan = False
    try:
        while pending:
            done, pending = await asyncio.wait(
                pending, timeout=CANCEL_POLL_SECONDS, return_when=asyncio.FIRST_COMPLETED
            )
            for t in done:
                hasil_per_kode[tugas[t]] = t.result()
                selesai += 1
                if on_progress is not None:
                    await on_progress(selesai, len(iku_list))
            if is_cancelled is not None and await is_cancelled():
                dibatalkan = True
                break

        if dibatalkan:
            cancel_event.set()  # hentikan thread LLM dulu; task.cancel() saja tidak menghentikannya
            for t in pending:
                if t.done() and not t.cancelled() and t.exception() is None:
                    # Selesai selagi flag batal diperiksa (await is_cancelled): hasilnya sudah jadi, jangan dibuang.
                    hasil_per_kode[tugas[t]] = t.result()
                    selesai += 1
                else:
                    t.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            logger.info("Setor LED dibatalkan (%d/%d IKU selesai)", selesai, len(iku_list))
    finally:
        # Juga bila coroutine ini sendiri dibatalkan/gagal: thread yang tersisa tidak boleh lanjut memanggil LLM.
        cancel_event.set()

    return [hasil_per_kode[i.kode] for i in iku_list if i.kode in hasil_per_kode], dibatalkan
