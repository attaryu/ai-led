"""BullMQ worker consumer — tracker baris 17.

Membaca generation-queue / assessment-queue / ingestion-queue (nama harus
cocok dengan apps/backend/src/jobs/queue-names.ts). GENERASI_BAB,
ASSESSMENT_AMI, & INGESTION_BUKTI_DUKUNG semua diimplementasikan sungguhan.

Retry (3x, exponential backoff) disetel di producer (jobs.module.ts), bukan
di sini — BullMQ menyimpannya di job-nya sendiri di Redis.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import signal
import sys
import time

from bullmq import Worker
from dotenv import load_dotenv

# No-op under Docker (env_file already populates os.environ) — fills the gap
# for native/local runs, which never had a loader anywhere for this process.
load_dotenv()

# Warna per level (dimatikan otomatis kalau stdout bukan terminal, mis. saat
# di-pipe ke file log -- kode ANSI mentah di file cuma bikin sulit dibaca).
class _ColorFormatter(logging.Formatter):
    _COLORS = {
        logging.DEBUG: "[90m",
        logging.INFO: "[36m",
        logging.WARNING: "[33m",
        logging.ERROR: "[31m",
        logging.CRITICAL: "[1;31m",
    }
    _RESET = "[0m"
    _use_color = sys.stdout.isatty()

    def format(self, record: logging.LogRecord) -> str:
        message = super().format(record)
        color = self._COLORS.get(record.levelno) if self._use_color else None
        return f"{color}{message}{self._RESET}" if color else message


_handler = logging.StreamHandler()
_handler.setFormatter(
    _ColorFormatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
)
logging.basicConfig(level=logging.INFO, handlers=[_handler])
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
    elif job.name == "REKOMENDASI_DOKUMEN":
        result = await _handle_rekomendasi_dokumen(job)
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


# Pedoman LAM Teknik selalu menyebut eksplisit "(Tabel X.Y LKPS)" di poin
# yang butuh data LKPS, dan tidak pernah menyebutnya kalau tidak — jadi ini
# gerbang pasti kedua arah, bukan sekadar hint (diadaptasi dari
# origin/led-wiriting(dimas) commit f0ecbf3, generator.py::_pedoman_mentions_lkps).
_LKPS_MENTION_RE = re.compile(r"\(?\s*Tabel\s+[\dA-Za-z.]+\s+LKPS\s*\)?", re.IGNORECASE)


def _lkps_refs_in_pedoman(pedoman: list[dict]) -> list[str]:
    refs: list[str] = []
    for p in pedoman:
        for m in _LKPS_MENTION_RE.finditer(p.get("content_text") or ""):
            ref = m.group(0)
            if ref not in refs:
                refs.append(ref)
    return refs


def _led_citation_label(chunk: dict) -> str:
    """Nama sumber literal yang boleh dipakai LLM di penanda '(sumber: ...)'
    — LED cuma satu dokumen per bab, jadi labelnya lokasi (halaman/paragraf),
    bukan nama berkas seperti Bukti Dukung."""
    metadata = chunk.get("metadata") or {}
    page_start = metadata.get("page_start", -1)
    if page_start is not None and page_start >= 0:
        return f"LED hal. {page_start}"
    para_start = metadata.get("para_start", -1)
    if para_start is not None and para_start >= 0:
        return f"LED para. {para_start}"
    return "LED"


def _evidence_citation_label(chunk: dict, filenames: dict[str, str]) -> str:
    """Nama sumber literal untuk chunk Bukti Dukung — beda dari LED, di sini
    labelnya memang nama berkas asli yang diunggah (evidence_files.document_name),
    karena satu bab bisa mengutip banyak berkas Evidence berbeda sekaligus."""
    bukti_dukung_id = chunk.get("bukti_dukung_id")
    return filenames.get(bukti_dukung_id) or bukti_dukung_id or "Evidence"


# Multi-strategy JSON parser -- dipakai semua tahap REKOMENDASI_DOKUMEN yang
# outputnya JSON (route_and_plan, assess_and_recommend), diadaptasi dari
# AI-LED-dimas/api/lib/prompts.py::_parse_llm_json.
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def _strip_think(raw: str) -> str:
    return _THINK_RE.sub("", raw or "").strip()


def _parse_llm_json(raw: str) -> dict:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return {"raw": raw, "parse_error": "could not extract JSON"}


def _load_lkps_tables(bab: dict, lkps_refs: list[str]) -> list[str]:
    """Exact-ref LKPS table lookup shared by GENERASI_BAB and
    REKOMENDASI_DOKUMEN. dev-v1 has no LKPS vector search (Dimas's Chroma
    `lkps` collection has no pgvector equivalent here) -- both stages read
    the same uploaded lkps.xlsx by the explicit table ref pedoman mentions
    instead of a semantic search."""
    if not lkps_refs:
        return []
    from api.routes.upload import _doc_dir
    from ingestion.lkps_loader import load_lkps

    lkps_path = os.path.join(_doc_dir(bab["tenant_id"], bab["document_id"]), "lkps.xlsx")
    if not os.path.exists(lkps_path):
        return []
    tables: list[str] = []
    try:
        registry = load_lkps(lkps_path)
        for ref in lkps_refs:
            df = registry.get_by_ref(ref)
            if df is not None:
                tables.append(f"{ref}:\n{df.head(30).to_markdown(index=False)}")
    except Exception:
        logger.exception("Gagal memuat LKPS untuk bab %s", bab["id"])
    return tables


# ──────────────────────────────────────────────────────────────────────
# Checklist (port of AI-LED-dimas SYSTEM_CHECKLIST) -- dipakai GENERASI_BAB
# untuk menyusun daftar pertanyaan faktual, menggantikan stub lama
# [p["point_title"] for p in pedoman].
# ──────────────────────────────────────────────────────────────────────

_SYSTEM_CHECKLIST = """
Anda adalah asesor akreditasi program studi di Indonesia.

Tugas Anda membuat checklist kebutuhan informasi untuk bagian yang sedang
dibahas berdasarkan Pedoman dan Rubrik. Checklist digunakan sebagai query
untuk mencari fakta pada LKPS dan dokumen Evidence.

Pedoman menentukan informasi yang perlu dibahas. Rubrik menentukan
kedalaman analisis. Jangan menjadikan Rubrik sebagai sumber fakta dan
jangan membuat query untuk setiap indikator Rubrik.

Hanya cari informasi yang benar-benar diperlukan untuk menjelaskan,
menganalisis, atau mengevaluasi bagian tersebut. Sesuaikan query dengan
substansi bagian, bukan dengan nama dokumen target.

Dokumen sumber dapat menggunakan istilah yang berbeda, seperti akreditasi,
evaluasi, borang, laporan, kebijakan, pedoman, keputusan, rencana strategis,
atau istilah institusi lainnya. Karena itu, jangan mengasumsikan dokumen
harus menyebut istilah yang sama dengan bagian yang sedang ditulis.

Gunakan istilah lengkap pada penyebutan pertama, kemudian singkatan jika
umum digunakan. Contoh: Visi, Misi, Tujuan, dan Strategi (VMTS);
Rencana Strategis (Renstra); Laporan Kinerja Program Studi (LKPS).

Checklist dapat mencari:
- kebijakan atau dasar penetapan;
- proses atau mekanisme;
- pelaksanaan;
- hasil atau capaian;
- evaluasi;
- tindak lanjut;
sesuai kebutuhan bagian.

Jangan membuat fakta, angka, nama, tanggal, dokumen, kegiatan, capaian,
atau istilah spesifik yang tidak dapat diturunkan dari Pedoman/Rubrik.

Jangan membuat pertanyaan statistik jika tidak diperlukan. Jangan meminta
data hanya karena tersedia dalam LKPS jika data tersebut tidak relevan
dengan bagian yang dibahas.

Query harus konkret, singkat, relevan, dan dapat digunakan untuk RAG.
Gunakan sinonim atau variasi istilah yang mungkin muncul dalam dokumen,
tetapi jangan membuat query terlalu luas.

Buat 3-8 item jika memang diperlukan, tanpa jumlah minimum. Jika hanya
membutuhkan 1-2 informasi, buat sesuai kebutuhan. Jika tidak ada informasi
faktual yang perlu dicari, kembalikan daftar kosong.

Format output:
- satu kebutuhan informasi per baris;
- berupa pertanyaan atau frasa pencarian;
- Bahasa Indonesia;
- tanpa penjelasan tambahan.

OUTPUT HANYA CHECKLIST.
"""


def _build_checklist_prompt(judul_bab: str, pedoman: list[dict], rubric: list[dict]) -> str:
    parts = [_SYSTEM_CHECKLIST, "", f"## SECTION: {judul_bab}", ""]
    if pedoman:
        parts.append("## PEDOMAN PENULISAN (apa yang harus ada):")
        for p in pedoman[:6]:
            parts.append(f"- {(p.get('content_text') or '')[:400]}")
        parts.append("")
    if rubric:
        parts.append("## RUBRIK SKOR 4 (target kualitas):")
        for r in rubric[:5]:
            parts.append(f"- {(r.get('description') or '')[:400]}")
        parts.append("")
    parts.append("## TUGAS:")
    parts.append(
        "Buat daftar 4-8 pertanyaan faktual SPESIFIK dalam BAHASA INDONESIA "
        "yang harus dijawab untuk menulis section ini. Pertanyaan harus "
        "konkret & bisa di-search di dokumen LKPS / evidence.\n\n"
        "GUNAKAN ISTILAH UMUM YANG SERING DIPAKAI DOKUMEN PRODI, "
        "bukan istilah teknis pedoman. Contoh pertanyaan yang baik:\n"
        "- 'Berapa rasio dosen tetap dengan mahasiswa?'\n"
        "- 'Bukti SK pembentukan tim akreditasi / tim borang?'\n"
        "- 'Notulensi rapat penyusunan visi misi prodi?'\n"
        "- 'Tren IPK lulusan 5 tahun terakhir?'\n"
        "- 'Dokumen SK Direktur tentang struktur organisasi?'\n\n"
        "DILARANG: pertanyaan dalam bahasa Inggris seperti 'How does the "
        "program ensure...' atau 'What are the...'. SEMUA HARUS BAHASA INDONESIA.\n\n"
        "FORMAT: satu item per baris, diawali '- '."
    )
    return "\n".join(parts)


def _parse_checklist(raw: str) -> list[str]:
    """Bullet/numbered-line parser + dedup + cap 8, port of AI-LED-dimas
    generator.py::_build_checklist's parsing half."""
    raw = _strip_think(raw)
    items = []
    for line in raw.split("\n"):
        line = line.strip()
        m = re.match(r"^[-*•]\s+(.+)$|^\d+[.)]\s+(.+)$", line)
        if m:
            item = (m.group(1) or m.group(2) or "").strip()
            if len(item) > 5:
                items.append(item)
    seen: set[str] = set()
    uniq: list[str] = []
    for it in items:
        if it not in seen:
            seen.add(it)
            uniq.append(it)
    return uniq[:8]


# ──────────────────────────────────────────────────────────────────────
# REKOMENDASI_DOKUMEN prompts (port of AI-LED-dimas SYSTEM_ROUTE_AND_PLAN /
# SYSTEM_ASSESS_AND_RECOMMEND) -- see _handle_rekomendasi_dokumen below.
# ──────────────────────────────────────────────────────────────────────

_SYSTEM_ROUTE_AND_PLAN = """Anda adalah asesor akreditasi program studi di Indonesia.

Berdasarkan PEDOMAN PENULISAN dan RUBRIK PENILAIAN suatu subbab LED, tentukan
dokumen non-LKPS apa saja yang diperlukan sebagai bukti/sumber dalam
penyusunan narasi (SK, notulensi, peraturan, RPS, dst).

Catatan: kebutuhan data LKPS TIDAK ditentukan oleh Anda -- itu sudah
diputuskan lewat pengecekan otomatis terpisah, di luar tugas Anda di sini.

ATURAN document_query:
1. Identifikasi klaim/informasi yang perlu didukung dokumen (fakta, data,
   regulasi, kebijakan, keputusan, kegiatan, mekanisme, kondisi program
   studi, hasil evaluasi, pernyataan faktual).
2. Cari sumber untuk klaim konseptual (regulasi/pedoman resmi yang
   melandasi penjelasan pedoman).
3. Cari bukti untuk fakta institusi (SK, notulensi, berita acara, dst).
4. Pertahankan identifier penting (nomor peraturan, nomor SK, judul
   dokumen) -- JANGAN diganti jadi istilah generik.
5. LKPS adalah jalur terpisah -- JANGAN buat document_query untuk data yang
   secara eksplisit diminta dari LKPS (mis. "Tabel 3.a.1 LKPS").
6. Jangan membuat dokumen berdasarkan asumsi -- setiap query harus punya
   dasar dari Pedoman/Rubrik, bukan sekadar dokumen umum akreditasi.
7. Query harus berupa kata kunci dokumen (utk semantic search ke nama
   file/folder/metadata), BUKAN pertanyaan.
8. Tidak ada jumlah query minimum -- buat hanya yang benar-benar perlu.

OUTPUT HARUS JSON VALID SAJA (no explanation outside JSON):
{
  "requires_documents": <true/false>,
  "document_query": ["query 1", "query 2", ...]
}"""


def _build_route_and_plan_prompt(judul_bab: str, pedoman: list[dict], rubric: list[dict]) -> str:
    parts = [_SYSTEM_ROUTE_AND_PLAN, "", f"## SECTION: {judul_bab}", ""]
    if pedoman:
        parts.append("## PEDOMAN PENULISAN:")
        for p in pedoman[:6]:
            parts.append(f"- {(p.get('content_text') or '')[:400]}")
        parts.append("")
    if rubric:
        parts.append("## RUBRIK SKOR 4:")
        for r in rubric[:5]:
            parts.append(f"- {(r.get('description') or '')[:400]}")
        parts.append("")
    parts.append("Output HANYA JSON:")
    return "\n".join(parts)


_SYSTEM_ASSESS_AND_RECOMMEND = """Anda adalah asesor akreditasi program studi di Indonesia.

Anda harus membuat TIGA keputusan SEKALIGUS dari context yang diberikan:

## KEPUTUSAN 1 -- lkps_sufficient
KALAU ada HASIL PENCARIAN LKPS di bawah: nilai apakah data itu SUDAH CUKUP
untuk menulis subbab ini dengan baik, atau MASIH PERLU bukti dokumen
pendukung tambahan (mis. surat/SK yang disebut di data LKPS tapi isinya
sendiri tidak ada di sana). KALAU TIDAK ADA hasil pencarian LKPS (subbab
tidak butuh LKPS), set null.

## KEPUTUSAN 2 -- lkps_evidence_query
HANYA isi field ini KALAU lkps_sufficient = false. Ekstrak IDENTIFIER
SPESIFIK yang disebut di data LKPS (No. Surat, nama dokumen, judul dokumen,
nomor SK, nama kegiatan, referensi dokumen) untuk dijadikan query pencarian
bukti pendukung spesifik -- BUKAN query umum, tapi identifier konkret yang
tersurat di data. Contoh: kalau data menyebut "MoU PT ABC, Nomor:
123/MOU/PENS/2025", maka query: "MoU PT ABC", "123/MOU/PENS/2025". Kalau
lkps_sufficient = true atau null, biarkan array ini kosong.

## KEPUTUSAN 3 -- recommendation_text & items
Simpulkan JENIS dokumen pendukung apa saja yang perlu disiapkan user untuk
menyusun subbab ini, dan jelaskan singkat ISI/CAKUPAN dokumen tsb --
berdasarkan PEMAHAMAN ANDA atas kebutuhan subbab (dari QUERY KEBUTUHAN
DOKUMEN), BUKAN sekadar menyalin nama folder hasil pencarian arsip.

PENTING -- HASIL HARUS GENERIC/PORTABLE, bukan spesifik ke satu arsip:
- Folder kandidat di bawah ini adalah HASIL PENCARIAN dari arsip SATU prodi
  tertentu -- bisa saja mengandung nama folder yang terlalu detail (nama
  dosen, tahun ajaran spesifik, dsb). Arsip ini HANYA referensi/petunjuk --
  JANGAN pernah menyalin nama folder granular semacam itu mentah-mentah ke
  output.
- Tulis kesimpulan sbg JENIS dokumen yg dibutuhkan secara umum + deskripsi
  singkat isinya, SUPAYA rekomendasi ini tetap masuk akal dipakai di
  program studi LAIN yang arsipnya berbeda struktur.
- BENAR: "Dokumen modul ajar yang memuat rencana pembelajaran tiap mata
  kuliah", "Bukti pelaksanaan tinjauan RPS (notulensi/laporan rapat)"
- SALAH (menyalin folder granular apa adanya): "Tabel 4j/Prof Puja",
  "MODUL AJAR/Modul Ajar 2022/Semester 5/1. K3L"

`recommendation_text`: ringkasan naratif BAHASA INDONESIA, format ringkas &
jelas, mis: "Untuk menyusun subbab ini diperlukan:\\n- Tabel 3.a.1 LKPS yang
memuat data kerja sama pendidikan\\n- Dokumen RPS tiap mata kuliah"

`items`: PECAH kesimpulan yang SAMA di atas jadi kartu terpisah, SATU item
per JENIS dokumen (bukan per folder arsip). WAJIB diisi (jangan kosong)
kecuali benar-benar tidak ada kebutuhan dokumen apapun. Tiap item:
- "label": nama jenis dokumen, SINGKAT (mis. "Dokumen Modul Ajar")
- "reason": 1 kalimat deskripsi ISI/CAKUPAN dokumen tsb & kenapa dibutuhkan
JANGAN isi field folder_path/path apapun -- item HANYA berisi label+reason.

OUTPUT HARUS JSON VALID SAJA (no explanation outside JSON):
{
  "lkps_sufficient": <true/false/null>,
  "lkps_evidence_query": ["identifier 1", ...],
  "recommendation_text": "<ringkasan naratif, general/portable>",
  "items": [{"label": "<jenis dokumen, singkat>", "reason": "<isi/cakupan & alasan, 1 kalimat>"}, ...]
}"""

_FALLBACK_RECOMMENDATION_TEXT = (
    "LLM gagal menghasilkan rekomendasi yang valid untuk subbab ini. "
    "Klik \"Rekomendasikan Ulang\" untuk mencoba lagi."
)


def _build_assess_and_recommend_prompt(
    judul_bab: str,
    candidate_folders: list[dict],
    document_query: list[str],
    lkps_tables: list[str],
    needs_lkps: bool,
) -> str:
    parts = [_SYSTEM_ASSESS_AND_RECOMMEND, "", f"## SECTION: {judul_bab}", ""]
    if needs_lkps:
        parts.append("## HASIL PENCARIAN LKPS:")
        if lkps_tables:
            for i, t in enumerate(lkps_tables[:8], 1):
                parts.append(f"\n[{i}] {t[:500]}")
        else:
            parts.append("(tidak ada hasil)")
        parts.append("")
    else:
        parts.append(
            "## Subbab ini TIDAK butuh data LKPS -- set lkps_sufficient: null, "
            "lkps_evidence_query: []."
        )
        parts.append("")
    if document_query:
        parts.append("## QUERY KEBUTUHAN DOKUMEN (dasar utama kesimpulan Anda):")
        for q in document_query:
            parts.append(f"- {q}")
        parts.append("")
    if candidate_folders:
        parts.append(
            "## FOLDER KANDIDAT (HANYA referensi arsip -- JANGAN disalin mentah, "
            "JANGAN dimasukkan ke items):"
        )
        for i, c in enumerate(candidate_folders[:15], 1):
            parts.append(f"\n[{i}] folder: {c.get('label')}")
        parts.append("")
    else:
        parts.append("## TIDAK ADA folder kandidat ditemukan.")
        parts.append("")
    parts.append(
        "Susun recommendation_text sbg KESIMPULAN jenis dokumen yg "
        "dibutuhkan (general, portable ke prodi lain -- lihat instruksi di "
        "atas), berdasarkan QUERY KEBUTUHAN DOKUMEN. FOLDER KANDIDAT hanya "
        "sbg petunjuk tambahan gambaran ISI dokumen yg mungkin relevan. "
        "Lalu PECAH kesimpulan itu jadi `items`."
    )
    parts.append("Output HANYA JSON:")
    return "\n".join(parts)


# ──────────────────────────────────────────────────────────────────────
# Judge (port of AI-LED-dimas SYSTEM_JUDGE) -- tahap terakhir GENERASI_BAB,
# model terpisah (llm/chat_model.py::build_judge_llm).
# ──────────────────────────────────────────────────────────────────────

_SYSTEM_JUDGE = """You are a rigorous LLM-as-a-Judge evaluating a RAG output
for an Indonesian accreditation report (LED). Score 4 RAGAS metrics on
a 0.0 to 1.0 scale.

METRICS (definisi RAGAS):

1. faithfulness (0..1)
   = #klaim di answer yang DIDUKUNG oleh retrieved context / #total klaim
   Rendah jika banyak fabrikasi / klaim tanpa basis di context.

2. answer_relevancy (0..1)
   = seberapa relevan answer dengan pertanyaan/section title?
   Rendah jika answer melebar atau menjawab pertanyaan beda.

3. context_precision (0..1)
   = #chunks retrieved yang RELEVAN dengan ground-truth / #total chunks retrieved
   Rendah jika banyak chunks off-topic/noise.

4. context_recall (0..1)
   = #klaim di ground-truth yang COVERED oleh retrieved context / #total klaim
   Rendah jika context kurang lengkap (gap fakta).

OUTPUT FORMAT (JSON ONLY, no explanation outside JSON):
{
  "faithfulness":      <float 0..1>,
  "answer_relevancy":  <float 0..1>,
  "context_precision": <float 0..1>,
  "context_recall":    <float 0..1>,
  "reasoning": {
    "faithfulness":      "1-2 kalimat justifikasi singkat",
    "answer_relevancy":  "...",
    "context_precision": "...",
    "context_recall":    "..."
  },
  "missing_facts":  ["fakta yg seharusnya ada tapi tidak ter-cover"],
  "hallucinated":   ["klaim di answer yg tidak didukung context"]
}"""


def _build_judge_prompt(judul_bab: str, draft_text: str, rubric: list[dict], facts: list[dict]) -> str:
    parts = [
        _SYSTEM_JUDGE, "",
        "## QUESTION / SECTION:", judul_bab, "",
        "## ANSWER (draft narasi yang dievaluasi):", draft_text[:3500], "",
    ]
    if rubric:
        parts.append("## GROUND-TRUTH ACUAN (rubrik skor 4 yang harus dipenuhi):")
        for r in rubric[:5]:
            parts.append(f"- {(r.get('description') or '')[:500]}")
        parts.append("")
    if facts:
        parts.append("## RETRIEVED CONTEXTS (yang dikirim ke LLM saat synthesis):")
        for i, c in enumerate(facts[:8], 1):
            parts.append(f"\n[{i}] FILE: {c.get('filename') or '?'}\n{(c.get('text') or '')[:400]}")
        parts.append("")
    parts.append("Now output ONLY the JSON object (no markdown fences, no preamble):")
    return "\n".join(parts)


def _parse_judge_json(raw: str) -> dict:
    """Multi-strategy JSON parser for judge output, port of AI-LED-dimas
    generator.py::_parse_judge_json -- regex-extracts the 4 metrics as a
    last resort when the model truncates its JSON mid-output."""
    raw = _strip_think(raw)
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
    if not raw:
        return {"error": "empty response"}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    metrics: dict = {}
    for key in ("faithfulness", "answer_relevancy", "context_precision", "context_recall"):
        rx = re.search(rf'"{key}"\s*:\s*([0-9]*\.?[0-9]+)', raw)
        if rx:
            try:
                metrics[key] = float(rx.group(1))
            except ValueError:
                pass
    if metrics:
        metrics["raw"] = raw
        metrics["parse_warning"] = "JSON truncated, extracted via regex"
        return metrics
    return {"raw": raw, "parse_error": "could not extract any metric"}


def _build_generasi_prompt(
    judul_bab: str,
    pedoman: list[dict],
    rubric: list[dict],
    checklist: list[str],
    chunks: list[dict],
    lkps_tables: list[str],
    evidence_chunks: list[dict] | None = None,
    evidence_filenames: dict[str, str] | None = None,
    user_prompt: str | None = None,
) -> str:
    evidence_chunks = evidence_chunks or []
    evidence_filenames = evidence_filenames or {}
    pedoman_text = "\n".join(f"- {p['point_title']}: {p['content_text'][:500]}" for p in pedoman) or "(tidak ada pedoman spesifik tersedia)"
    rubric_text = "\n".join(f"- {r['criterion_code']}: {r['description'][:300]}" for r in rubric) or "(tidak ada rubrik spesifik tersedia)"
    checklist_text = "\n".join(f"- {c}" for c in checklist)
    led_text = "\n\n".join(
        f"[Bukti {i+1}] (sumber: {_led_citation_label(c)}) {c['text'][:800]}"
        for i, c in enumerate(chunks)
    ) or "(tidak ada bukti dari dokumen LED yang ditemukan)"
    evidence_text = "\n\n".join(
        f"[Evidence {i+1}] (sumber: {_evidence_citation_label(c, evidence_filenames)}) {c['text'][:800]}"
        for i, c in enumerate(evidence_chunks)
    ) or "(tidak ada bukti dokumen Evidence yang dipilih untuk bab ini)"
    lkps_text = "\n\n".join(lkps_tables) or "(tidak ada data LKPS relevan)"
    arahan_text = f"\n\nARAHAN TAMBAHAN DARI PENGGUNA:\n{user_prompt}" if user_prompt else ""

    return f"""Anda menulis draf Bab "{judul_bab}" untuk Laporan Evaluasi Diri (LED) akreditasi program studi di Indonesia.

PEDOMAN:
{pedoman_text}

RUBRIK PENILAIAN (target kualitas, BUKAN sumber fakta — jangan mengklaim prodi memenuhi suatu skor kalau tidak didukung BUKTI/DATA LKPS di bawah):
{rubric_text}

CHECKLIST FAKTA YANG SEBAIKNYA DIBAHAS (panduan cakupan, bukan wajib semua terjawab — item tanpa dukungan BUKTI/DATA LKPS boleh dilewati, jangan mengarang jawaban supaya checklist "kelihatan terpenuhi"):
{checklist_text}

DATA KUANTITATIF (LKPS):
{lkps_text}

BUKTI DARI DOKUMEN LED:
{led_text}

BUKTI DOKUMEN (Evidence SPMI — SK, notulensi, laporan; hanya dokumen yang sudah dikonfirmasi user):
{evidence_text}{arahan_text}

ATURAN WAJIB:
1. WAJIB Bahasa Indonesia 100% — dilarang menulis paragraf berbahasa Inggris (akronim teknis seperti LED/SK/SKS/IPK boleh tetap dipakai).
2. Setiap klaim faktual harus diikuti penanda sumber: "(sumber: NAMA_FILE)" untuk BUKTI (LED atau Evidence), atau "(sumber: LKPS <referensi tabel>)" untuk DATA KUANTITATIF. Penanda HANYA boleh dipakai kalau nama/referensi itu BENAR-BENAR muncul literal di bagian BUKTI/DATA KUANTITATIF di atas — dilarang menebak atau mengarang nama sumber.
3. Jika BUKTI dan DATA KUANTITATIF sama-sama kosong/minim, tulis narasi singkat dan umum berdasarkan PEDOMAN/RUBRIK saja tanpa klaim faktual bersitasi — jangan dipaksakan panjang dengan fakta karangan.
4. OUTPUT MURNI NARASI SAJA dalam format Markdown (heading/paragraf/daftar poin sesuai kebutuhan) — dilarang menambahkan catatan, disclaimer, atau ringkasan proses di luar narasi."""


async def _handle_generasi_bab(job) -> dict:
    """5-step RAG pipeline: pedoman+rubric -> checklist(LLM)+LED/Evidence/LKPS
    facts -> LLM synthesis+MD-to-HTML -> judge(LLM) -> RAGAS.

    Persists BabDraft (sumber=AI) + overwrites BabDokumen's active state +
    GenerationRun + RagasScore(BAB_AKTIF) — packages/db/prisma/schema.prisma.

    `draftId` in the payload is optional — when the chapter went through
    REKOMENDASI_DOKUMEN -> confirm first, it names the draft whose confirmed
    DocumentRecommendation.selectedEvidenceIds scopes Evidence retrieval
    (Dimas's _retrieve_facts). Missing/omitted (manual generate without
    recommend first) -> Evidence retrieval is skipped entirely, same as
    before this change; LED/LKPS retrieval still runs either way.
    """
    import markdown as md_lib

    from db.generation_client import (
        create_bab_draft,
        create_generation_run,
        create_ragas_score,
        get_bab_dokumen,
        get_confirmed_recommendation,
        get_evidence_filenames,
        get_pedoman_for_bab,
        get_rubrik_for_bab,
        get_user_nama,
        link_evidence_to_chapter_and_draft,
        update_bab_dokumen_aktif,
    )
    from eval.ragas_eval import score_single_sample
    from llm.chat_model import build_judge_llm, build_plain_llm
    from vectorstore.pgvector_evidence_store import search_evidence
    from vectorstore.pgvector_store import search_led

    payload = job.data
    bab_id = payload["babDokumenId"]
    user_id = payload["createdByUserId"]
    draft_id = payload.get("draftId")

    bab = get_bab_dokumen(bab_id)
    if bab is None:
        return {"status": "error", "error": f"BabDokumen {bab_id} tidak ditemukan"}

    t0 = time.time()

    # 1. Pedoman & rubrik — relational lookup by chapter number, not vector
    # search (see db/generation_client.py's own note on why).
    pedoman = get_pedoman_for_bab(bab["chapter_order"])
    rubric = get_rubrik_for_bab(bab["chapter_order"])

    llm = build_plain_llm()

    # 2. Checklist — real LLM call (port of SYSTEM_CHECKLIST), same fallback
    # safety net as the old pedoman-titles stub for empty pedoman/LLM failure.
    checklist_prompt = _build_checklist_prompt(bab["chapter_title"], pedoman, rubric)
    try:
        checklist_raw = await llm.ainvoke(checklist_prompt)
        checklist = _parse_checklist(checklist_raw.content)
    except Exception:
        logger.exception("Checklist LLM gagal untuk bab %s, pakai fallback", bab_id)
        checklist = []
    checklist = checklist or [f"Poin kunci untuk {bab['chapter_title']}"]

    # 2a. LED self-reference chunks (existing behavior, unchanged).
    query = f"{bab['chapter_title']}: " + " ".join(checklist[:5])
    # search_led is synchronous (psycopg2 + blocking SentenceTransformer.encode) —
    # off the event loop, or it blocks BullMQ's lock-renewal long enough to stall.
    chunks = await asyncio.to_thread(search_led, query, bab["tenant_id"], bab["document_id"], n_results=5)

    # 2b. LKPS tables the pedoman explicitly references — only when it does
    # (see _lkps_refs_in_pedoman), so bab yang murni naratif tidak ikut
    # menyeret data LKPS yang tidak relevan ke prompt.
    lkps_refs = _lkps_refs_in_pedoman(pedoman)
    lkps_tables = _load_lkps_tables(bab, lkps_refs)

    # 2c. Bukti Dukung evidence — scoped strictly to the CONFIRMED
    # recommendation's selectedEvidenceIds for `draftId` (Dimas's
    # _retrieve_facts: zero selected = zero evidence, no blanket fallback).
    confirmed = get_confirmed_recommendation(draft_id) if draft_id else None
    selected_ids: list[str] = (confirmed or {}).get("selected_evidence_ids") or []
    evidence_chunks: list[dict] = []
    evidence_filenames: dict[str, str] = {}
    if selected_ids:
        evidence_filenames = get_evidence_filenames(selected_ids)
        seen_chunks: set[str] = set()
        for item in checklist:
            hits = await asyncio.to_thread(search_evidence, item, bab["tenant_id"], selected_ids, 2)
            for h in hits:
                if h["chunk_id"] in seen_chunks:
                    continue
                seen_chunks.add(h["chunk_id"])
                evidence_chunks.append(h)

    # 3. LLM call, then Markdown -> HTML.
    prompt = _build_generasi_prompt(
        bab["chapter_title"], pedoman, rubric, checklist, chunks, lkps_tables,
        evidence_chunks, evidence_filenames, payload.get("prompt"),
    )
    response = await llm.ainvoke(prompt)
    markdown_text = response.content
    html = md_lib.markdown(markdown_text)
    latency_sec = time.time() - t0

    # 4a. RAGAS: faithfulness / answer_relevancy / context_precision.
    try:
        ragas_scores = score_single_sample(
            question=bab["chapter_title"],
            answer=markdown_text,
            contexts=[c["text"] for c in chunks],
        )
    except Exception:
        logger.exception("RAGAS scoring gagal untuk bab %s, lanjut tanpa skor", bab_id)
        ragas_scores = {}

    # 4b. LLM-as-judge (port of SYSTEM_JUDGE) — separate model
    # (llm/chat_model.py::build_judge_llm), degrades to {"error": ...} rather
    # than crashing the job, same style as the RAGAS try/except above.
    judge_facts = (
        [{"text": c["text"], "filename": _led_citation_label(c)} for c in chunks]
        + [{"text": c["text"], "filename": _evidence_citation_label(c, evidence_filenames)} for c in evidence_chunks]
        + [{"text": t, "filename": "LKPS"} for t in lkps_tables]
    )
    try:
        judge_llm = build_judge_llm()
        judge_raw = await judge_llm.ainvoke(
            _build_judge_prompt(bab["chapter_title"], markdown_text, rubric, judge_facts)
        )
        judge_result = _parse_judge_json(judge_raw.content)
    except Exception as e:
        logger.exception("Judge LLM gagal untuk bab %s, lanjut tanpa skor judge", bab_id)
        judge_result = {"error": str(e)}

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
    # Records which confirmed Bukti Dukung actually backed this generate —
    # no-op if selected_ids is empty (manual generate, no recommendation).
    # This never happened at all before, silently: apps/web reads these rows
    # for chapter.buktiDukung (the count shown after generate, and the
    # checkbox baseline restored on reload), so it always read 0/empty
    # regardless of whether evidence was actually retrieved for the prompt.
    link_evidence_to_chapter_and_draft(bab_id, draft["id"], selected_ids)
    update_bab_dokumen_aktif(bab_id, konten, draft["id"])
    create_generation_run(
        bab_draft_id=draft["id"],
        model=getattr(llm, "model", getattr(llm, "model_name", "unknown")),
        pedoman_used=pedoman,
        rubric_used=rubric,
        checklist=checklist,
        chunks_used=chunks + evidence_chunks,
        judge_result=judge_result,
        prompt_full=prompt,
        latency_sec=latency_sec,
        token_count=len(markdown_text.split()),
    )
    if ragas_scores:
        create_ragas_score(bab_id, draft["id"], ragas_scores, jumlah_chunk=len(chunks))

    return {
        "status": "completed",
        "babDraftId": draft["id"],
        "versi": draft["version"],
        "ragasScores": ragas_scores,
        "judgeResult": judge_result,
    }


async def _handle_rekomendasi_dokumen(job) -> dict:
    """Recommend-documents pipeline — port of AI-LED-dimas's recommend_chain
    (api/lib/generator.py). Produces a DocumentRecommendation (status
    DIREKOMENDASIKAN) tied to an empty ChapterDraft checkpoint the editor can
    render before any narrative exists — contentSnapshot={} matches
    DocumentChapter.workingContent's own "no content yet" convention
    (apps/backend/src/bab-dokumen/bab-dokumen.service.ts).

    `draftId` in the payload names an existing EMPTY draft to reuse
    ("Rekomendasikan Ulang") instead of creating a new one — the prior
    DIKONFIRMASI recommendation on that draft, if any, is marked DIGANTIKAN
    by create_document_recommendation before the new row is inserted.
    """
    from db.generation_client import (
        create_bab_draft,
        create_document_recommendation,
        get_bab_dokumen,
        get_pedoman_for_bab,
        get_rubrik_for_bab,
        get_user_nama,
        update_bab_dokumen_aktif,
    )
    from llm.chat_model import build_plain_llm
    from vectorstore.document_registry_store import search_document_registry_candidates

    payload = job.data
    bab_id = payload["babDokumenId"]
    user_id = payload["createdByUserId"]
    reuse_draft_id = payload.get("draftId")

    bab = get_bab_dokumen(bab_id)
    if bab is None:
        return {"status": "error", "error": f"BabDokumen {bab_id} tidak ditemukan"}

    # 1. Pedoman & rubrik — same relational lookup as GENERASI_BAB.
    pedoman = get_pedoman_for_bab(bab["chapter_order"])
    rubric = get_rubrik_for_bab(bab["chapter_order"])

    # 2. needs_lkps — same regex gate as GENERASI_BAB (definitive both ways,
    # no LLM guess needed: pedoman LAM Teknik always spells out explicit
    # "(Tabel X.Y LKPS)" mentions when a subbab needs LKPS data).
    lkps_refs = _lkps_refs_in_pedoman(pedoman)
    needs_lkps = bool(lkps_refs)

    llm = build_plain_llm()

    # 3. document_query — LLM call porting SYSTEM_ROUTE_AND_PLAN.
    route_prompt = _build_route_and_plan_prompt(bab["chapter_title"], pedoman, rubric)
    try:
        raw = await llm.ainvoke(route_prompt)
        route_data = _parse_llm_json(_strip_think(raw.content))
    except Exception:
        logger.exception("document_query LLM gagal untuk bab %s", bab_id)
        route_data = {}
    document_query = route_data.get("document_query") or [bab["chapter_title"]]

    # 4. Candidate folders from Document Registry (already dedup'd/cutoff'd).
    candidates = search_document_registry_candidates(
        document_query, bab["tenant_id"], bab.get("study_program_id"), k=5,
    )

    # LKPS content the pedoman references, fed to the assess-and-recommend
    # call below as "LKPS search results" — see _load_lkps_tables's note on
    # why this is an exact-ref lookup rather than Dimas's semantic search.
    lkps_tables = _load_lkps_tables(bab, lkps_refs) if needs_lkps else []

    # 5. lkps_sufficient / lkps_evidence_query / recommendation_text+items —
    # LLM call porting SYSTEM_ASSESS_AND_RECOMMEND.
    assess_prompt = _build_assess_and_recommend_prompt(
        bab["chapter_title"], candidates, document_query, lkps_tables, needs_lkps,
    )
    try:
        raw = await llm.ainvoke(assess_prompt)
        assess_data = _parse_llm_json(_strip_think(raw.content))
    except Exception as e:
        logger.exception("assess_and_recommend LLM gagal untuk bab %s", bab_id)
        assess_data = {"recommendation_text": f"Gagal menyusun rekomendasi: {e}", "items": []}

    items = assess_data.get("items") or []
    recommendation_text = assess_data.get("recommendation_text") or ""
    if assess_data.get("parse_error") or (not recommendation_text and not items):
        recommendation_text = _FALLBACK_RECOMMENDATION_TEXT

    lkps_sufficient = assess_data.get("lkps_sufficient") if needs_lkps else None
    lkps_evidence_query = (assess_data.get("lkps_evidence_query") or []) if lkps_sufficient is False else []

    # 6. Topup registry search from lkps_evidence_query, merged + dedup'd by
    # folder_id (search_document_registry_candidates already dedups within
    # one call, so only the merge across the two calls needs doing here).
    if lkps_evidence_query:
        topup = search_document_registry_candidates(
            lkps_evidence_query, bab["tenant_id"], bab.get("study_program_id"), k=3,
        )
        seen_folder_ids = {c["folder_id"] for c in candidates}
        candidates = candidates + [c for c in topup if c["folder_id"] not in seen_folder_ids]

    # 7. Persist: empty draft (reuse `draftId` if given) + DocumentRecommendation.
    if reuse_draft_id:
        draft_id = reuse_draft_id
    else:
        user_nama = get_user_nama(user_id)
        draft = create_bab_draft(bab_id, user_id, user_nama, konten_snapshot={})
        draft_id = draft["id"]
        update_bab_dokumen_aktif(bab_id, {}, draft_id)

    pedoman_used = [{"id": p.get("point_code"), "text": (p.get("content_text") or "")[:300]} for p in pedoman]
    rubric_used = [{"id": r.get("id"), "text": (r.get("description") or "")[:300]} for r in rubric]
    lkps_used = [{"text": t[:300]} for t in lkps_tables]

    rec = create_document_recommendation(
        chapter_draft_id=draft_id,
        document_query=document_query,
        lkps_needed=needs_lkps,
        lkps_sufficient=lkps_sufficient,
        lkps_evidence_query=lkps_evidence_query or None,
        candidate_folders=candidates,
        recommendation_text=recommendation_text,
        pedoman_used=pedoman_used,
        rubric_used=rubric_used,
        lkps_used=lkps_used,
        items=items,
    )

    return {
        "status": "completed",
        "recommendationId": rec["id"],
        "babDraftId": draft_id,
        "lkpsNeeded": needs_lkps,
        "itemCount": len(items),
    }


def _build_simulasi_skor_prompt(
    judul_bab: str,
    konten: str,
    kriteria: list[dict],
) -> str:
    kriteria_text = "\n\n".join(
        f"- {k['criterion_code']}: {k['description']}\n"
        + "\n".join(f"  Skor {lvl['score']}: {lvl['description']}" for lvl in k["level"])
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
        if draft is None or draft["chapter_id"] != bab_id:
            return {"status": "error", "error": f"Checkpoint {bab_draft_id} tidak ditemukan"}
        snapshot = draft["content_snapshot"]
        konten = snapshot.get("body", "") if isinstance(snapshot, dict) else ""
        target_tipe = "BAB_DRAFT"
    else:
        snapshot = bab["working_content"]
        konten = snapshot.get("body", "") if isinstance(snapshot, dict) else ""
        target_tipe = "BAB_AKTIF"

    if not konten.strip():
        return {"status": "error", "error": "Belum ada tulisan yang bisa dinilai untuk lingkup yang dipilih"}

    kriteria = get_rubrik_for_bab(bab["chapter_order"])
    if not kriteria:
        return {"status": "error", "error": f"Bab {bab['chapter_order']} tidak dinilai kriteria rubrik apa pun"}

    levels_by_kriteria = get_rubrik_levels([k["id"] for k in kriteria])
    for k in kriteria:
        k["level"] = levels_by_kriteria.get(k["id"], [])

    prompt = _build_simulasi_skor_prompt(bab["chapter_title"], konten, kriteria)
    llm = build_plain_llm()
    response = await llm.ainvoke(prompt)
    parsed = _extract_json(response.content)
    dinilai = parsed.get("skor") if isinstance(parsed, dict) else None
    if not isinstance(dinilai, list):
        return {"status": "error", "error": "Model tidak mengembalikan hasil penilaian yang bisa dibaca"}

    kode_ke_id = {k["criterion_code"]: k["id"] for k in kriteria}
    skor_valid = {k["id"]: {lvl["score"] for lvl in k["level"]} for k in kriteria}

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
    study_program_id = payload.get("programStudiId")
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
        laporan_bukti_dukung_id=payload.get("laporanBuktiDukungId"),
        sumber_led=payload.get("sumberLed", "EDITOR"),
        led_file_name=payload.get("ledFileName"),
        lkps_bukti_dukung_id=payload.get("lkpsBuktiDukungId"),
    )

    # Ditangkap ke Postgres per indikator (update_session_status, di dalam
    # _run_assessment_pipeline) sudah cukup buat GET status polling. Ini
    # kanal kedua: BullMQ job.updateProgress() men-trigger event 'progress'
    # asli yang diteruskan job-events.service.ts lewat SSE, biar Live
    # Progress Panel-nya bergerak tiap indikator selesai, bukan cuma di
    # awal/akhir job.
    async def _report_progress(completed: int, total: int) -> None:
        try:
            await job.updateProgress({"completed": completed, "total": total})
        except Exception:
            logger.exception("Gagal mengirim progress job %s", job.id)

    max_parallel = int(os.environ.get("ASSESSMENT_MAX_PARALLEL", "5"))
    await _run_assessment_pipeline(
        session_id=session_id,
        indicators=indicators,
        max_parallel=max_parallel,
        tenant_id=tenant_id,
        dokumen_id=dokumen_id,
        study_program_id=study_program_id,
        on_progress=_report_progress,
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
    """Download dari R2, chunk + embed (ingestion/evidence_pipeline.py),
    index ke bukti_dukung_chunk_embeddings, lalu tandai status.

    Menangkap semua exception di sini dan selalu berakhir SIAP/GAGAL —
    tidak pernah membiarkan barisnya nyangkut di MENUNGGU, pelajaran yang
    sama dengan stub yang digantikan handler ini.

    ponytail: agent/tools/evidence_tool.py sekarang baca tabel ini saat
    ASESMEN AMI (agent/graph.py). GENERASI_BAB (nulis bab) masih belum —
    itu pipeline RAG terpisah, bukan agent tool-calling ini.
    """
    import tempfile
    from pathlib import Path

    from db.connection import get_conn
    from db.r2_client import download_to
    from ingestion.evidence_pipeline import UnsupportedFileError, process_file
    from vectorstore.pgvector_evidence_store import index_evidence_chunks

    bukti_dukung_id = job.data["buktiDukungId"]
    tenant_id = job.data["tenantId"]
    file_url = job.data["fileUrl"]

    def _set_status(status: str, catatan: str | None) -> None:
        with get_conn().cursor() as cur:
            cur.execute(
                "UPDATE evidence_files SET extraction_status = %s, failure_note = %s WHERE id = %s",
                (status, catatan, bukti_dukung_id),
            )

    try:
        with tempfile.TemporaryDirectory(prefix="evidence_ingest_") as tmp:
            work_dir = Path(tmp)
            local_path = work_dir / Path(file_url).name
            download_to(file_url, local_path)
            chunks = process_file(local_path, work_dir)
            index_evidence_chunks(chunks, tenant_id, bukti_dukung_id)
    except UnsupportedFileError as e:
        _set_status("GAGAL", str(e))
        return {"status": "unsupported", "buktiDukungId": bukti_dukung_id, "reason": str(e)}
    except Exception as e:
        logger.exception("Ingestion gagal untuk bukti_dukung %s", bukti_dukung_id)
        _set_status("GAGAL", str(e)[:500])
        return {"status": "error", "buktiDukungId": bukti_dukung_id, "reason": str(e)}

    _set_status("SIAP", None)
    return {"status": "completed", "buktiDukungId": bukti_dukung_id, "chunks": len(chunks)}


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
