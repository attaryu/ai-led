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
    elif job.name == "GENERASI_OUTLINE_BAB":
        result = await _handle_generasi_outline_bab(job)
    elif job.name == "REKOMENDASI_DOKUMEN":
        result = await _handle_rekomendasi_dokumen(job)
    elif job.name == "SIMULASI_SKOR":
        result = await _handle_simulasi_skor(job)
    elif job.name == "ASSESSMENT_AMI":
        result = await _handle_assessment_ami(job)
    elif job.name == "INGESTION_BUKTI_DUKUNG":
        result = await _handle_ingestion_bukti_dukung(job)
    elif job.name == "INGESTION_RUBRIK_DOKUMEN":
        result = await _handle_ingestion_rubrik_dokumen(job)
    elif job.name == "INGESTION_STRUKTUR_DOKUMEN":
        result = await _handle_ingestion_struktur_dokumen(job)
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


def _evidence_citation_label(chunk: dict, labels: dict[str, str]) -> str:
    """Nama sumber literal untuk chunk Bukti Dukung — beda dari LED, di sini
    labelnya nama folder terdekat (kalau file diunggah ke dalam folder) atau
    nama berkas asli (get_evidence_citation_labels), karena satu bab bisa
    mengutip banyak berkas Evidence berbeda sekaligus."""
    bukti_dukung_id = chunk.get("bukti_dukung_id")
    return labels.get(bukti_dukung_id) or bukti_dukung_id or "Evidence"


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


def _institution_context_block(institution_context: dict | None, usage_note: str) -> list[str]:
    """Shared '## INSTITUSI' block for the checklist/generate prompts (port
    of Dimas's 766de26) — omitted entirely when neither name is known."""
    institution_context = institution_context or {}
    university_name = institution_context.get("university_name")
    study_program_name = institution_context.get("study_program_name")
    if not university_name and not study_program_name:
        return []
    parts = ["## INSTITUSI:"]
    if university_name:
        parts.append(f"Institusi: {university_name}")
    if study_program_name:
        parts.append(f"Program Studi: {study_program_name}")
    parts.append(usage_note)
    parts.append("")
    return parts


def _build_checklist_prompt(
    judul_bab: str,
    pedoman: list[dict],
    rubric: list[dict],
    institution_context: dict | None = None,
    selected_document_names: list[str] | None = None,
) -> str:
    parts = [_SYSTEM_CHECKLIST, "", f"## SECTION: {judul_bab}", ""]
    if selected_document_names:
        # Port of Dimas's 332ab2f: terminology hint only, NOT a scope
        # narrower — checklist must still be driven by PEDOMAN.
        parts.append("## DOKUMEN YANG SUDAH DIPILIH USER:")
        for name in selected_document_names:
            parts.append(f"- {name}")
        parts.append(
            "(Konteks saja — checklist TETAP harus diturunkan dari PEDOMAN, "
            "BUKAN dari daftar dokumen ini. Dokumen di atas hanya membantu "
            "Anda memperkirakan istilah/nama yang mungkin dipakai sumber "
            "saat menyusun pertanyaan — mis. kalau ada dokumen \"Renstra "
            "2020-2024\", boleh sertakan tahun itu di pertanyaan kalau "
            "relevan dengan kebutuhan PEDOMAN. JANGAN membatasi atau "
            "mengubah cakupan topik checklist supaya \"cocok\" dengan "
            "dokumen ini — kebutuhan informasi tetap ditentukan PEDOMAN.)"
        )
        parts.append("")
    parts += _institution_context_block(
        institution_context,
        "(Konteks saja — pakai HANYA kalau membantu pertanyaan lebih spesifik "
        "ke institusi ini. JANGAN sisipkan nama institusi/prodi ke setiap item "
        "checklist secara literal.)",
    )
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
# REKOMENDASI_DOKUMEN prompt (port of AI-LED-dimas SYSTEM_ASSESS_AND_RECOMMEND,
# 332ab2f) -- see _handle_rekomendasi_dokumen below. Dimas's route_and_plan
# stage (an LLM call producing free-text document_query, then fed into
# vectorstore/document_registry_store.py's semantic search over a tenant's
# already-uploaded folders) is GONE -- a tenant with nothing uploaded yet
# got zero candidates and a useless recommendation. Documents are now
# picked directly from document_catalog.DOCUMENT_CATALOG, a closed-set
# vocabulary that works from day one regardless of what has been uploaded.
# ──────────────────────────────────────────────────────────────────────


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

## KEPUTUSAN 3 -- recommendation_text & items (dokumen dari KATALOG)
KATALOG DOKUMEN di bawah adalah CLOSED SET. Anda hanya boleh memilih dokumen
yang terdapat dalam KATALOG. Jangan membuat, menebak, atau mengusulkan
dokumen di luar katalog.

Gunakan PEDOMAN untuk memahami seluruh informasi yang perlu dibahas dalam
SECTION. Kemudian periksa KATALOG dan pilih dokumen yang dapat menjadi
sumber atau bukti untuk informasi tersebut. Jangan hanya mencari kecocokan
kata -- pahami fungsi dokumen berdasarkan label, scope, tier, dan purpose.

Perhatikan seluruh informasi yang diminta PEDOMAN dalam SECTION. Jika
SECTION membutuhkan beberapa jenis informasi dan tersedia beberapa dokumen
yang mendukung informasi tersebut, pilih semuanya -- jangan membatasi
jumlah. Dokumen tingkat institusi dan program studi dapat sama-sama dipilih
jika keduanya diperlukan untuk menjelaskan SECTION. Namun jangan memilih
dokumen hanya karena berkaitan secara umum dengan institusi, program studi,
mutu, pendidikan, atau akreditasi -- dokumen harus punya hubungan yang
jelas dengan informasi yang perlu ditulis dalam SECTION.

ATURAN KATALOG:
- "label" pada tiap item output HARUS disalin PERSIS dari KATALOG. Jangan
  mengubah, memparafrase, menyingkat, menerjemahkan, atau membuat label baru.
- "no" dan "label" pada satu item HARUS berasal dari entri KATALOG yang sama.
- Gunakan scope, tier, dan purpose hanya untuk membantu memilih dokumen.
- Kalau tidak ada satupun dokumen di KATALOG yang cocok untuk SECTION ini,
  kembalikan items: [] -- itu jawaban yang sah, jangan memaksakan pilihan.

ATURAN REASON: jelaskan secara SPESIFIK informasi dalam SECTION yang dapat
didukung dokumen tsb. Jangan gunakan alasan yang terlalu umum seperti
"mendukung VMTS", "mendukung mutu", atau "mendukung pengembangan program
studi".

`recommendation_text`: ringkasan naratif BAHASA INDONESIA dari kesimpulan
`items` di atas, format ringkas & jelas.

OUTPUT HARUS JSON VALID SAJA (no explanation outside JSON):
{
  "lkps_sufficient": <true/false/null>,
  "lkps_evidence_query": ["identifier 1", ...],
  "recommendation_text": "<ringkasan naratif>",
  "items": [{"no": 1, "label": "SALIN PERSIS DARI KATALOG", "reason": "Alasan spesifik."}]
}"""

_FALLBACK_RECOMMENDATION_TEXT = (
    "LLM gagal menghasilkan rekomendasi yang valid untuk subbab ini. "
    'Klik "Rekomendasikan Ulang" untuk mencoba lagi.'
)


def _build_assess_and_recommend_prompt(
    judul_bab: str,
    pedoman: list[dict],
    rubric: list[dict],
    lkps_tables: list[str],
    needs_lkps: bool,
) -> str:
    from document_catalog import catalog_for_prompt

    parts = [_SYSTEM_ASSESS_AND_RECOMMEND, "", f"## SECTION: {judul_bab}", ""]
    if pedoman:
        parts.append("## PEDOMAN PENULISAN:")
        for p in pedoman[:8]:
            parts.append(f"- {(p.get('content_text') or '')[:1200]}")
        parts.append("")
    else:
        parts.append(
            "## PEDOMAN PENULISAN: TIDAK TERSEDIA -- Anda tidak punya dasar "
            "untuk memilih dokumen. Kembalikan items: [] dan jelaskan pada "
            "recommendation_text bahwa pedoman untuk subbab ini belum "
            "tersedia. JANGAN menebak dokumen dari judul SECTION."
        )
        parts.append("")
    if rubric:
        parts.append("## RUBRIK SKOR 4 (target kualitas subbab ini):")
        for r in rubric[:5]:
            parts.append(f"- {(r.get('description') or '')[:400]}")
        parts.append("")
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
    # Format satu baris per entri, label diapit kutip dan diakhiri "|" --
    # supaya LLM tidak ikut menyalin metadata [tier, scope] sbg bagian dari
    # label saat menyalin balik ke output JSON (bug nyata dialami dimas:
    # label keluar sbg "... Institusi [L1, institusi]").
    parts.append("## KATALOG DOKUMEN (closed set -- pilih HANYA dari daftar bernomor ini):")
    parts.append('Format tiap baris: NOMOR. "LABEL" | metadata (BUKAN bagian dari label)')
    parts.append("")
    for entry in catalog_for_prompt():
        parts.append(
            f"{entry['no']}. \"{entry['label']}\" | tier={entry['tier']} "
            f"scope={entry['scope']} -- {entry['purpose']}"
        )
    parts.append("")
    parts.append(
        "PENTING: field \"label\" pada output HANYA berisi teks di antara "
        "tanda kutip di atas -- JANGAN sertakan nomor, tanda kutip, atau "
        "metadata setelah tanda \"|\" sebagai bagian dari label."
    )
    parts.append(
        "Setiap item WAJIB punya \"no\" (bilangan bulat dari daftar di atas), "
        "\"label\", dan \"reason\". Pilih dokumen untuk SETIAP lapisan dan "
        "tingkat yang dipicu PEDOMAN, bukan satu dokumen per frasa."
    )
    parts.append("recommendation_text dan reason WAJIB Bahasa Indonesia.")
    parts.append("Output HANYA JSON:")
    return "\n".join(parts)


# ──────────────────────────────────────────────────────────────────────
# Fallback: usulan dokumen DI LUAR katalog -- HANYA dipanggil
# _handle_rekomendasi_dokumen setelah _build_assess_and_recommend_prompt()
# (di atas) sudah dijalankan SUKSES (bukan gagal parse/invoke) dan hasil
# `items`-nya BENAR-BENAR kosong -- LLM sudah menelusuri seluruh KATALOG
# closed-set dan tidak menemukan satupun yang cocok. Prompt TERPISAH dari
# _SYSTEM_ASSESS_AND_RECOMMEND supaya aturan closed-set di prompt utama
# tidak pernah melunak/tercampur dengan izin mengarang ini (port of
# AI-LED-dimas SYSTEM_SUGGEST_CUSTOM_DOCUMENT, 332ab2f).
# ──────────────────────────────────────────────────────────────────────

_SYSTEM_SUGGEST_CUSTOM_DOCUMENT = """Anda adalah asesor akreditasi program studi di Indonesia.

KONTEKS: Anda sebelumnya sudah memeriksa seluruh KATALOG DOKUMEN closed-set
milik institusi ini untuk SECTION di bawah, dan TIDAK ADA satu pun entri
katalog yang sesuai dengan kebutuhan dokumen SECTION ini. Katalog itu
TERBUKTI TIDAK LENGKAP untuk kasus ini.

TUGAS ANDA SEKARANG: usulkan sendiri nama dokumen pendukung yang benar-benar
dibutuhkan untuk SECTION ini, berdasarkan PEDOMAN yang diberikan.

ATURAN:
- Usulkan HANYA kalau memang ada kebutuhan dokumen formal yang jelas
  tersirat dari PEDOMAN. Jangan mengarang demi mengisi jumlah.
- Kalau memang tidak ada kebutuhan dokumen formal sama sekali (section
  murni naratif/analisis), kembalikan items: [] -- itu jawaban yang sah.
- Nama dokumen harus jenis dokumen yang wajar ada di institusi pendidikan
  Indonesia (SK, peraturan, pedoman, laporan, dsb), bukan istilah generik
  atau nama yang mengada-ada.
- reason WAJIB menjelaskan kenapa dokumen ini diperlukan DAN kenapa tidak
  ada padanan yang cocok di katalog institusi.

OUTPUT HARUS JSON VALID SAJA:
{
  "items": [{"label": "<nama dokumen yang diusulkan>", "reason": "<1-2 kalimat>"}, ...]
}"""


def _build_suggest_custom_document_prompt(
    judul_bab: str, pedoman: list[dict], rubric: list[dict]
) -> str:
    """Dipanggil _handle_rekomendasi_dokumen HANYA sbg fallback -- lihat
    catatan di atas."""
    parts = [_SYSTEM_SUGGEST_CUSTOM_DOCUMENT, "", f"## SECTION: {judul_bab}", ""]
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


# ──────────────────────────────────────────────────────────────────────
# Outline generation (GENERASI_OUTLINE_BAB) — LLM menyusun daftar section
# per bab, dituntun kelompok kriteria rubrik tenant itu sendiri (bukan JSON
# statis ala AI-LED-dimas, bukan pula kelompokkanKriteria dipakai apa
# adanya sebagai daftar section). Tiap section lalu digenerate detail satu-
# satu lewat _handle_generasi_bab di bawah.
# ──────────────────────────────────────────────────────────────────────

_SYSTEM_OUTLINE = """
Anda adalah asesor akreditasi program studi di Indonesia yang menyusun
DAFTAR ISI (outline) untuk satu bab Laporan Evaluasi Diri (LED).

Tugas Anda: pecah bab ini menjadi beberapa section (sub-bab) yang berurutan
dan logis, supaya tiap section bisa ditulis detail secara terpisah.

ATURAN WAJIB:
- Setiap section HARUS jelas berkaitan dengan minimal satu KELOMPOK KRITERIA
  yang diberikan di bawah — JANGAN mengarang struktur di luar kelompok itu.
- Section boleh lebih detail dari sekadar nama kelompok kriteria (mis. satu
  kelompok besar boleh dipecah jadi beberapa section) kalau memang membantu
  kedalaman pembahasan, tapi jangan berlebihan (target 3-8 section per bab).
- Kalau STRUKTUR RESMI DARI PEDOMAN di bawah menunjukkan satu sub-bab
  punya beberapa sub-sub-bab bernomor sendiri (mis. "Kriteria Akreditasi"
  berisi "Diferensiasi Misi", "Akuntabilitas", dst), pecah section itu jadi
  section-section anak lewat "subseksi" — JANGAN daftar sub-sub-bab itu
  sebagai section sejajar terpisah dari induknya.
- "subseksi" cuma satu tingkat (section anak tidak boleh punya "subseksi"
  sendiri lagi).
- "judul" singkat (maks 10 kata), Bahasa Indonesia.
- "panduan" adalah 1-2 kalimat arahan topik apa yang harus dibahas section
  ini — ini akan dipakai sebagai query pencarian bukti, jadi harus konkret
  dan spesifik, BUKAN sekadar mengulang judul.
- Urutkan section secara logis (mis. dasar/kebijakan dulu, baru pelaksanaan,
  baru evaluasi/hasil).

OUTPUT HARUS JSON VALID SAJA (no explanation outside JSON):
{"sections": [{"judul": "...", "panduan": "...", "subseksi": [{"judul": "...", "panduan": "..."}]}]}
"""


def _group_rubric_by_criterion_group(rubric: list[dict]) -> list[dict]:
    """Groups rubric criteria by criterion_group, preserving first-seen
    order — Python equivalent of apps/web's kelompokkanKriteria, used here
    as grounding CONTEXT for the outline LLM call, not as the section list
    itself (see module note above)."""
    groups: dict[str, list[dict]] = {}
    order: list[str] = []
    for r in rubric:
        group = r.get("criterion_group") or "Umum"
        if group not in groups:
            groups[group] = []
            order.append(group)
        groups[group].append(r)
    return [{"name": g, "criteria": groups[g]} for g in order]


def _build_outline_prompt(
    judul_bab: str,
    kelompok_kriteria: list[dict],
    pedoman: list[dict],
    struktur_referensi: list[dict] | None = None,
) -> str:
    parts = [_SYSTEM_OUTLINE, "", f"## BAB: {judul_bab}", ""]
    if struktur_referensi:
        parts.append(
            "## STRUKTUR RESMI DARI PEDOMAN (referensi kuat dari dokumen yang "
            "diupload institusi ini, boleh disesuaikan bila memang perlu; sub-sub-bab "
            "menjorok berarti anak sub-bab di atasnya -- jadikan \"subseksi\", bukan "
            "section sejajar sendiri):"
        )
        for s in struktur_referensi:
            parts.append(f"- {s['title']}: {(s.get('guidance') or '')[:300]}")
            for anak in s.get("children") or []:
                parts.append(f"  - {anak['title']}: {(anak.get('guidance') or '')[:300]}")
        parts.append("")
    if pedoman:
        parts.append("## PEDOMAN PENULISAN:")
        for p in pedoman[:10]:
            parts.append(f"- {(p.get('content_text') or '')[:400]}")
        parts.append("")
    parts.append("## KELOMPOK KRITERIA:")
    for g in kelompok_kriteria:
        parts.append(f"- {g['name']}:")
        for c in g["criteria"][:6]:
            parts.append(f"  - {c['criterion_code']}: {(c.get('description') or '')[:250]}")
    parts.append("")
    parts.append("Output HANYA JSON:")
    return "\n".join(parts)


def _parse_outline_list(raw_items: object, kedalaman: int = 0) -> list[dict]:
    """Recursive helper for _parse_outline -- satu tingkat rekursi lagi buat
    "subseksi" (kedalaman=1), berhenti di situ (maks 3 tingkat total
    termasuk BAB), sesuai batas yang diminta prompt-nya sendiri."""
    result: list[dict] = []
    for item in raw_items or []:
        if not isinstance(item, dict):
            continue
        title = (item.get("judul") or item.get("title") or "").strip()
        guidance = (item.get("panduan") or item.get("guidance") or "").strip()
        if not (title and guidance):
            continue
        anak = _parse_outline_list(item.get("subseksi"), kedalaman + 1) if kedalaman == 0 else []
        result.append({"title": title, "guidance": guidance, "subseksi": anak})
    return result


def _parse_outline(raw: str) -> list[dict]:
    """Parses {"sections":[{"judul","panduan","subseksi":[...]}]} into
    [{"title","guidance","subseksi":[...]}] (subseksi nested one level deep),
    dropping any item missing title or guidance."""
    data = _parse_llm_json(_strip_think(raw))
    return _parse_outline_list(data.get("sections"))


async def _handle_generasi_outline_bab(job) -> dict:
    """Satu LLM call -> daftar ChapterSection (status PENDING). Menolak
    menimpa outline yang sudah ada kecuali payload `overwrite=true` (lihat
    db/generation_client.py::create_chapter_sections)."""
    from db.generation_client import (
        create_chapter_sections,
        get_bab_dokumen,
        get_chapter_template_subbab,
        get_pedoman_for_bab,
        get_rubrik_for_bab,
    )
    from llm.chat_model import build_plain_llm

    payload = job.data
    bab_id = payload["babDokumenId"]
    overwrite = bool(payload.get("overwrite"))

    bab = get_bab_dokumen(bab_id)
    if bab is None:
        return {"status": "error", "error": f"BabDokumen {bab_id} tidak ditemukan"}

    accreditation_set_id = bab.get("accreditation_set_id")
    pedoman = get_pedoman_for_bab(bab["chapter_order"])
    rubric = get_rubrik_for_bab(bab["chapter_order"], accreditation_set_id)
    kelompok = _group_rubric_by_criterion_group(rubric)
    struktur_referensi = get_chapter_template_subbab(accreditation_set_id, bab["chapter_order"])

    llm = build_plain_llm()
    try:
        raw = await llm.ainvoke(
            _build_outline_prompt(bab["chapter_title"], kelompok, pedoman, struktur_referensi)
        )
        sections = _parse_outline(raw.content)
    except Exception:
        logger.exception("Outline LLM gagal untuk bab %s", bab_id)
        sections = []

    if not sections:
        return {"status": "error", "error": "LLM gagal menyusun outline yang valid untuk bab ini"}

    try:
        created = create_chapter_sections(bab_id, sections, overwrite=overwrite)
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    return {"status": "completed", "sectionCount": len(created)}


def _compile_chapter_from_sections(sections: list[dict]) -> tuple[str, str]:
    """Gabung section GENERATED jadi markdown/HTML, disusuri sebagai pohon (## top-level, ### anak), bukan order global."""
    import markdown as md_lib

    anak_dari: dict[str, list[dict]] = {}
    for s in sections:
        if s.get("parent_id"):
            anak_dari.setdefault(s["parent_id"], []).append(s)

    parts: list[str] = []

    def tulis(s: dict, level: int) -> None:
        if s["status"] == "GENERATED" and s.get("content"):
            body_markdown = (s["content"] or {}).get("markdown") or ""
            parts.append(f"{'#' * level} {s['title']}\n\n{body_markdown}")
        for anak in anak_dari.get(s["id"], []):
            tulis(anak, 3)

    for s in sections:
        if not s.get("parent_id"):
            tulis(s, 2)

    markdown_text = "\n\n".join(parts)
    return markdown_text, md_lib.markdown(markdown_text)


def _build_section_prompt(
    judul_bab: str,
    chapter_title: str,
    pedoman: list[dict],
    rubric: list[dict],
    checklist: list[str],
    chunks: list[dict],
    lkps_tables: list[str],
    evidence_chunks: list[dict] | None = None,
    evidence_labels: dict[str, str] | None = None,
    user_prompt: str | None = None,
    institution_context: dict | None = None,
) -> str:
    evidence_chunks = evidence_chunks or []
    evidence_labels = evidence_labels or {}
    pedoman_text = "\n".join(f"- {p['point_title']}: {p['content_text'][:500]}" for p in pedoman) or "(tidak ada pedoman spesifik tersedia)"
    rubric_text = "\n".join(f"- {r['criterion_code']}: {r['description'][:300]}" for r in rubric) or "(tidak ada rubrik spesifik tersedia)"
    checklist_text = "\n".join(f"- {c}" for c in checklist)
    led_text = "\n\n".join(
        f"[Bukti {i+1}] (sumber: {_led_citation_label(c)}) {c['text'][:800]}"
        for i, c in enumerate(chunks)
    ) or "(tidak ada bukti dari dokumen LED yang ditemukan)"
    evidence_text = "\n\n".join(
        f"[Evidence {i+1}] (sumber: {_evidence_citation_label(c, evidence_labels)}) {c['text'][:800]}"
        for i, c in enumerate(evidence_chunks)
    ) or "(tidak ada bukti dokumen Evidence yang dipilih untuk bab ini)"
    lkps_text = "\n\n".join(lkps_tables) or "(tidak ada data LKPS relevan)"
    arahan_text = f"\n\nARAHAN TAMBAHAN DARI PENGGUNA:\n{user_prompt}" if user_prompt else ""
    institution_block = "\n".join(_institution_context_block(
        institution_context,
        "(Sebut nama institusi PERSIS seperti di atas apa adanya — JANGAN "
        "tambahkan kata 'Universitas' di depannya kalau nama institusi itu "
        "sendiri sudah berupa Politeknik/Institut/Sekolah Tinggi/bentuk lain.)",
    ))
    institution_block = f"{institution_block}\n" if institution_block else ""

    return f"""Anda menulis SATU SECTION (sub-bab) "{judul_bab}" dari Bab "{chapter_title}" untuk Laporan Evaluasi Diri (LED) akreditasi program studi di Indonesia.
{institution_block}

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
2. Setiap klaim faktual harus diikuti penanda sumber: "(sumber: LABEL)" untuk BUKTI (LED atau Evidence) — LABEL adalah teks PERSIS di dalam tanda kurung "(sumber: ...)" pada bukti yang dikutip, bisa berupa nama file ATAU nama folder, ikuti apa adanya, JANGAN diubah/disingkat — atau "(sumber: LKPS <referensi tabel>)" untuk DATA KUANTITATIF. Penanda HANYA boleh dipakai kalau nama/referensi itu BENAR-BENAR muncul literal di bagian BUKTI/DATA KUANTITATIF di atas — dilarang menebak atau mengarang nama sumber.
3. Jika BUKTI dan DATA KUANTITATIF sama-sama kosong/minim, tulis narasi singkat dan umum berdasarkan PEDOMAN/RUBRIK saja tanpa klaim faktual bersitasi — jangan dipaksakan panjang dengan fakta karangan.
4. OUTPUT MURNI NARASI SAJA dalam format Markdown, TANPA heading/judul apapun (section ini sendiri sudah jadi satu unit heading di dokumen akhir) — dilarang menambahkan catatan, disclaimer, atau ringkasan proses di luar narasi.
5. Tulis 3-5 paragraf yang FOKUS pada topik section ini saja ("{judul_bab}") — jangan melebar membahas topik section lain dalam bab yang sama, dan jangan mengulang judul section sebagai baris pembuka."""


async def _handle_generasi_bab(job) -> dict:
    """5-step RAG pipeline for ONE section: pedoman+rubric -> checklist(LLM)
    + LED/Evidence/LKPS facts (query = section.guidance, bukan judul bab) ->
    LLM synthesis+MD-to-HTML -> judge(LLM) -> RAGAS.

    Persists ChapterSection.content (status GENERATED) -> compiles SEMUA
    section GENERATED milik bab ini jadi satu BabDraft checkpoint + overwrite
    BabDokumen.workingContent (_compile_chapter_from_sections), supaya RAGAS
    level-bab, export PDF, review, dan chat tetap baca dari tempat yang sama
    seperti sebelum section ada — lihat catatan desain di plan.

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
        get_chapter_section,
        get_chapter_sections,
        get_confirmed_recommendation,
        get_evidence_citation_labels,
        get_pedoman_for_bab,
        get_rubrik_for_bab,
        get_user_nama,
        link_evidence_to_chapter_and_draft,
        update_bab_dokumen_aktif,
        update_chapter_section,
    )
    from eval.ragas_eval import score_single_sample
    from llm.chat_model import build_judge_llm, build_plain_llm
    from vectorstore.pgvector_evidence_store import search_evidence
    from vectorstore.pgvector_store import search_led

    payload = job.data
    bab_id = payload["babDokumenId"]
    user_id = payload["createdByUserId"]
    draft_id = payload.get("draftId")
    section_id = payload["sectionId"]

    bab = get_bab_dokumen(bab_id)
    if bab is None:
        return {"status": "error", "error": f"BabDokumen {bab_id} tidak ditemukan"}

    section = get_chapter_section(section_id)
    if section is None or section["chapter_id"] != bab_id:
        return {"status": "error", "error": f"Section {section_id} tidak ditemukan pada bab {bab_id}"}

    update_chapter_section(section_id, status="GENERATING")

    # Port of Dimas's 766de26 institution context — lets the checklist and
    # generate prompts know which prodi/university this LED is for, instead
    # of writing fully generic narration.
    institution_context = {
        "study_program_name": bab.get("study_program_name"),
        "university_name": bab.get("university_name"),
    }

    t0 = time.time()

    # 1. Pedoman & rubrik — relational lookup by chapter number (whole bab,
    # sama seperti sebelumnya — checklist/judge di bawah tetap butuh konteks
    # rubrik/pedoman satu bab penuh, bukan cuma section ini).
    pedoman = get_pedoman_for_bab(bab["chapter_order"])
    rubric = get_rubrik_for_bab(bab["chapter_order"], bab.get("accreditation_set_id"))

    llm = build_plain_llm()

    # Bukti Dukung selected via the CONFIRMED recommendation for `draftId`
    # (Dimas's _retrieve_facts: zero selected = zero evidence, no blanket
    # fallback) — resolved before the checklist call so the checklist prompt
    # can use the selected documents' names as a terminology hint (port of
    # Dimas's 332ab2f, see _build_checklist_prompt's selected_document_names).
    # No confirmed draft -> fall back to manual picker's `selectedEvidenceIds`.
    confirmed = get_confirmed_recommendation(draft_id) if draft_id else None
    selected_ids: list[str] = (
        (confirmed or {}).get("selected_evidence_ids") or payload.get("selectedEvidenceIds") or []
    )
    evidence_labels: dict[str, str] = get_evidence_citation_labels(selected_ids) if selected_ids else {}

    try:
        # 2. Checklist — real LLM call (port of SYSTEM_CHECKLIST), scoped to
        # this section's title (bukan judul bab) — same fallback safety net
        # as the old pedoman-titles stub for empty pedoman/LLM failure.
        checklist_prompt = _build_checklist_prompt(
            section["title"], pedoman, rubric, institution_context,
            list(evidence_labels.values()),
        )
        try:
            checklist_raw = await llm.ainvoke(checklist_prompt)
            checklist = _parse_checklist(checklist_raw.content)
        except Exception:
            logger.exception("Checklist LLM gagal untuk section %s, pakai fallback", section_id)
            checklist = []
        checklist = checklist or [f"Poin kunci untuk {section['title']}"]

        # 2a. LED self-reference chunks — query = panduan outline section ini,
        # bukan judul bab (lihat plan: retrieval query per-section).
        query = f"{section['title']}: {section['guidance']}"
        # search_led is synchronous (psycopg2 + blocking SentenceTransformer.encode) —
        # off the event loop, or it blocks BullMQ's lock-renewal long enough to stall.
        chunks = await asyncio.to_thread(search_led, query, bab["tenant_id"], bab["document_id"], n_results=5)

        # 2b. LKPS tables the pedoman explicitly references — only when it does
        # (see _lkps_refs_in_pedoman), so section yang murni naratif tidak ikut
        # menyeret data LKPS yang tidak relevan ke prompt.
        lkps_refs = _lkps_refs_in_pedoman(pedoman)
        lkps_tables = _load_lkps_tables(bab, lkps_refs)

        # 2c. Bukti Dukung evidence chunks for the selected ids above.
        evidence_chunks: list[dict] = []
        if selected_ids:
            seen_chunks: set[str] = set()
            for item in checklist:
                hits = await asyncio.to_thread(search_evidence, item, bab["tenant_id"], selected_ids, 2)
                for h in hits:
                    if h["chunk_id"] in seen_chunks:
                        continue
                    seen_chunks.add(h["chunk_id"])
                    evidence_chunks.append(h)

        # 3. LLM call, then Markdown -> HTML.
        prompt = _build_section_prompt(
            section["title"], bab["chapter_title"], pedoman, rubric, checklist, chunks, lkps_tables,
            evidence_chunks, evidence_labels, payload.get("prompt"), institution_context,
        )
        response = await llm.ainvoke(prompt)
        markdown_text = response.content
        html = md_lib.markdown(markdown_text)
        latency_sec = time.time() - t0

        # 4a. RAGAS: faithfulness / answer_relevancy / context_precision.
        try:
            ragas_scores = score_single_sample(
                question=section["title"],
                answer=markdown_text,
                contexts=[c["text"] for c in chunks],
            )
        except Exception:
            logger.exception("RAGAS scoring gagal untuk section %s, lanjut tanpa skor", section_id)
            ragas_scores = {}

        # 4b. LLM-as-judge (port of SYSTEM_JUDGE) — separate model
        # (llm/chat_model.py::build_judge_llm), degrades to {"error": ...} rather
        # than crashing the job, same style as the RAGAS try/except above.
        judge_facts = (
            [{"text": c["text"], "filename": _led_citation_label(c)} for c in chunks]
            + [{"text": c["text"], "filename": _evidence_citation_label(c, evidence_labels)} for c in evidence_chunks]
            + [{"text": t, "filename": "LKPS"} for t in lkps_tables]
        )
        try:
            judge_llm = build_judge_llm()
            judge_raw = await judge_llm.ainvoke(
                _build_judge_prompt(section["title"], markdown_text, rubric, judge_facts)
            )
            judge_result = _parse_judge_json(judge_raw.content)
        except Exception as e:
            logger.exception("Judge LLM gagal untuk section %s, lanjut tanpa skor judge", section_id)
            judge_result = {"error": str(e)}

        model_name = getattr(llm, "model", getattr(llm, "model_name", "unknown"))
        section_konten = {"format": "html", "body": html, "markdown": markdown_text}
        update_chapter_section(section_id, status="GENERATED", content=section_konten, model=model_name)
    except Exception as e:
        logger.exception("Generate section %s gagal", section_id)
        update_chapter_section(section_id, status="ERROR", error=str(e))
        raise

    # Compile: gabung SEMUA section GENERATED milik bab ini jadi satu
    # checkpoint bab, sama seperti sebelum section ada — lihat
    # _compile_chapter_from_sections.
    all_sections = get_chapter_sections(bab_id)
    compiled_markdown, compiled_html = _compile_chapter_from_sections(all_sections)
    konten = {"format": "html", "body": compiled_html, "markdown": compiled_markdown}
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
    link_evidence_to_chapter_and_draft(bab_id, draft["id"], selected_ids)
    update_bab_dokumen_aktif(bab_id, konten, draft["id"])
    create_generation_run(
        bab_draft_id=draft["id"],
        model=model_name,
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
        "sectionId": section_id,
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

    Document picks come from document_catalog.DOCUMENT_CATALOG (a closed-set
    taxonomy the LLM chooses from directly), not a per-tenant registry
    search — port of AI-LED-dimas 332ab2f, see _SYSTEM_ASSESS_AND_RECOMMEND's
    module comment above for why.

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
    from document_catalog import parse_items
    from llm.chat_model import build_plain_llm

    payload = job.data
    bab_id = payload["babDokumenId"]
    user_id = payload["createdByUserId"]
    reuse_draft_id = payload.get("draftId")

    bab = get_bab_dokumen(bab_id)
    if bab is None:
        return {"status": "error", "error": f"BabDokumen {bab_id} tidak ditemukan"}

    # 1. Pedoman & rubrik — same relational lookup as GENERASI_BAB.
    pedoman = get_pedoman_for_bab(bab["chapter_order"])
    rubric = get_rubrik_for_bab(bab["chapter_order"], bab.get("accreditation_set_id"))

    # 2. needs_lkps — same regex gate as GENERASI_BAB (definitive both ways,
    # no LLM guess needed: pedoman LAM Teknik always spells out explicit
    # "(Tabel X.Y LKPS)" mentions when a subbab needs LKPS data).
    lkps_refs = _lkps_refs_in_pedoman(pedoman)
    needs_lkps = bool(lkps_refs)

    llm = build_plain_llm()

    # LKPS content the pedoman references, fed to the assess-and-recommend
    # call below as "LKPS search results" — see _load_lkps_tables's note on
    # why this is an exact-ref lookup rather than Dimas's semantic search.
    lkps_tables = _load_lkps_tables(bab, lkps_refs) if needs_lkps else []

    # 3. lkps_sufficient / lkps_evidence_query / recommendation_text+items —
    # 1 LLM call picking documents from the closed-set catalog. Retry up to
    # 3x on JSON PARSE failure only (invoke/network exceptions fail fast,
    # not retried) — deepseek-r1 sometimes answers free-text narration
    # instead of JSON for this task, same fragility Dimas documented in
    # generator.py::_assess_and_recommend.
    assess_prompt = _build_assess_and_recommend_prompt(
        bab["chapter_title"], pedoman, rubric, lkps_tables, needs_lkps,
    )
    assess_data: dict = {}
    for attempt in range(3):
        try:
            raw = await llm.ainvoke(assess_prompt)
            assess_data = _parse_llm_json(_strip_think(raw.content))
        except Exception as e:
            logger.exception("assess_and_recommend LLM gagal untuk bab %s", bab_id)
            assess_data = {"recommendation_text": f"Gagal menyusun rekomendasi: {e}", "items": []}
            break
        if not assess_data.get("parse_error"):
            break
        logger.warning(
            "Gagal parse JSON assess_and_recommend (bab %s, percobaan %d/3)",
            bab_id, attempt + 1,
        )

    catalog_ok = not assess_data.get("parse_error")
    raw_items = assess_data.get("items") or []
    accepted, rejected = parse_items(raw_items)
    if rejected:
        logger.warning(
            "%d/%d item dibuang (no/label tidak sepakat dgn katalog) untuk bab %s: %s",
            len(rejected), len(raw_items), bab_id, rejected[:3],
        )

    recommendation_text = assess_data.get("recommendation_text") or ""

    if catalog_ok and not accepted:
        # LLM genuinely searched the whole closed set and found nothing —
        # ask it to propose a document name outside the catalog instead of
        # silently returning an empty recommendation (port of Dimas's
        # _suggest_custom_document fallback). A failure here is treated as
        # "no proposal" (items stays empty), not escalated to
        # _FALLBACK_RECOMMENDATION_TEXT — the main catalog stage already
        # succeeded validly, an empty custom-suggestion result is itself a
        # legitimate answer.
        custom_prompt = _build_suggest_custom_document_prompt(bab["chapter_title"], pedoman, rubric)
        try:
            raw = await llm.ainvoke(custom_prompt)
            custom_data = _parse_llm_json(_strip_think(raw.content))
        except Exception:
            logger.exception("suggest_custom_document LLM gagal untuk bab %s", bab_id)
            custom_data = {}
        items = [
            {"label": (it.get("label") or "").strip(), "reason": it.get("reason", "")}
            for it in (custom_data.get("items") or [])
            if isinstance(it, dict) and (it.get("label") or "").strip()
        ]
        if items and not recommendation_text:
            recommendation_text = (
                "Tidak ada dokumen yang cocok di katalog standar untuk subbab ini; "
                "berikut usulan dokumen di luar katalog."
            )
    else:
        items = [{"label": it["label"], "reason": it.get("reason", "")} for it in accepted]

    if not catalog_ok or (not recommendation_text and not items):
        recommendation_text = _FALLBACK_RECOMMENDATION_TEXT

    lkps_sufficient = assess_data.get("lkps_sufficient") if needs_lkps else None
    lkps_evidence_query = (assess_data.get("lkps_evidence_query") or []) if lkps_sufficient is False else []

    # 4. Persist: empty draft (reuse `draftId` if given) + DocumentRecommendation.
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
    # Audit trail of what was actually picked — catalog entries (no/label/
    # tier) accepted from the closed set, or the fallback's out-of-catalog
    # proposals. No more real folder_id references since there's no
    # per-tenant registry search anymore.
    candidate_catalog_picks = (
        [{"no": it["no"], "label": it["label"], "tier": it["tier"]} for it in accepted]
        if catalog_ok and accepted
        else [{"custom": True, **it} for it in items]
    )

    rec = create_document_recommendation(
        chapter_draft_id=draft_id,
        document_query=[],
        lkps_needed=needs_lkps,
        lkps_sufficient=lkps_sufficient,
        lkps_evidence_query=lkps_evidence_query or None,
        candidate_folders=candidate_catalog_picks,
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

    kriteria = get_rubrik_for_bab(bab["chapter_order"], bab.get("accreditation_set_id"))
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

    Rubrik: dari `rubric_tool.py::_get_rubrics_for_set`, di-scope ke
    `AccreditationSet` dokumen ini (sama seperti `/start`/`/resume` HTTP di
    api/routes/assessment.py) -- bukan lagi `_get_rubrics()` global tanpa
    scope, yang juga tidak lagi cocok dengan `_run_assessment_pipeline`
    (butuh `accreditation_set_id` wajib, dulu tidak pernah dikirim dari sini).
    """
    import uuid

    from agent.tools.lkps_tool import set_lkps_registry
    from agent.tools.rubric_tool import _get_rubrics_for_set
    from api.routes.assessment import _run_assessment_pipeline, _SimpleIndicator
    from api.routes.upload import _doc_dir
    from db.postgres_client import create_session, get_document_accreditation_set, get_session
    from ingestion.lkps_loader import load_lkps

    payload = job.data
    dokumen_id = payload["dokumenId"]
    tenant_id = payload["tenantId"]
    user_id = payload["createdByUserId"]
    study_program_id = payload.get("programStudiId")
    indikator_list = payload.get("indikatorList")

    accreditation_set_id = get_document_accreditation_set(dokumen_id)
    if accreditation_set_id is None:
        return {
            "status": "error",
            "error": "Dokumen ini belum memilih Set Akreditasi — pilih Set Akreditasi dulu sebelum menjalankan penilaian.",
        }

    lkps_path = os.path.join(_doc_dir(tenant_id, dokumen_id), "lkps.xlsx")
    if os.path.exists(lkps_path):
        try:
            set_lkps_registry(tenant_id, dokumen_id, load_lkps(lkps_path))
        except Exception:
            logger.exception(
                "Gagal memuat ulang LKPS untuk tenant=%s dokumen=%s", tenant_id, dokumen_id
            )

    rubrics = _get_rubrics_for_set(accreditation_set_id)
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
        bull_job_id=job.id,
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

    # Tombol Batalkan di progress bar (JobsService.cancel, apps/backend) --
    # NestJS tidak bisa menjangkau loop async di proses worker ini langsung,
    # jadi ia titip lewat Redis dengan key yang sama-sama tahu: job.id (bull
    # job id numerik, bukan session_id -- NestJS belum tahu session_id yang
    # baru dibuat di atas saat request Batalkan datang).
    import redis.asyncio as aioredis

    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    redis_client = aioredis.from_url(redis_url)

    async def _is_cancelled() -> bool:
        try:
            return bool(await redis_client.get(f"job:cancel:{job.id}"))
        except Exception:
            logger.exception("Gagal cek status batal job %s, lanjut seperti biasa", job.id)
            return False

    max_parallel = int(os.environ.get("ASSESSMENT_MAX_PARALLEL", "5"))
    try:
        await _run_assessment_pipeline(
            session_id=session_id,
            indicators=indicators,
            max_parallel=max_parallel,
            tenant_id=tenant_id,
            dokumen_id=dokumen_id,
            accreditation_set_id=accreditation_set_id,
            study_program_id=study_program_id,
            on_progress=_report_progress,
            is_cancelled=_is_cancelled,
        )
    finally:
        await redis_client.aclose()

    sess = get_session(session_id)
    if sess is not None and sess["status"] == "cancelled":
        return {
            "status": "cancelled",
            "sessionId": session_id,
            "totalIndicators": sess["total_indicators"],
            "completedIndicators": sess["completed_indicators"],
        }
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


async def _handle_ingestion_rubrik_dokumen(job) -> dict:
    """Download the DOKUMEN_RUBRIK PDF from R2, parse it with the same
    matriks parser /upload/matrix uses (ingestion/matrix_parser.py), and
    replace this AccreditationSet's rubric_criteria/rubric_levels wholesale.

    Same discipline as _handle_ingestion_bukti_dukung: catch everything,
    always end SIAP/GAGAL on accreditation_sets.criteria_parse_status,
    never leave it stuck on DIPROSES.
    """
    import tempfile
    from pathlib import Path

    from db.connection import get_conn
    from db.postgres_client import RubricSetInUseError, replace_rubric_criteria_for_set
    from db.r2_client import download_to
    from ingestion.matrix_parser import parse_matrix_pdf

    accreditation_set_id = job.data["accreditationSetId"]
    file_url = job.data["fileUrl"]

    def _set_status(status: str, catatan: str | None) -> None:
        with get_conn().cursor() as cur:
            cur.execute(
                "UPDATE accreditation_sets SET criteria_parse_status = %s, criteria_parse_error = %s WHERE id = %s",
                (status, catatan, accreditation_set_id),
            )

    try:
        with tempfile.TemporaryDirectory(prefix="rubrik_parse_") as tmp:
            local_path = Path(tmp) / Path(file_url).name
            download_to(file_url, local_path)
            rubrics = parse_matrix_pdf(str(local_path))
            if not rubrics:
                _set_status(
                    "GAGAL",
                    "Tidak ada kriteria yang berhasil diekstrak dari PDF ini — "
                    "pastikan formatnya sesuai matriks penilaian.",
                )
                return {"status": "empty", "accreditationSetId": accreditation_set_id}
            count = replace_rubric_criteria_for_set(accreditation_set_id, rubrics)
    except RubricSetInUseError as e:
        _set_status("GAGAL", str(e))
        return {"status": "in_use", "accreditationSetId": accreditation_set_id, "reason": str(e)}
    except Exception as e:
        logger.exception("Parsing rubrik gagal untuk set %s", accreditation_set_id)
        _set_status("GAGAL", str(e)[:500])
        return {"status": "error", "accreditationSetId": accreditation_set_id, "reason": str(e)}

    _set_status("SIAP", None)
    return {"status": "completed", "accreditationSetId": accreditation_set_id, "count": count}


# ──────────────────────────────────────────────────────────────────────
# INGESTION_STRUKTUR_DOKUMEN (LLM-based document structure extraction) --
# mirrors INGESTION_RUBRIK_DOKUMEN above (same download-parse-replace-status
# shape), triggered by attachDocument on the PANDUAN_LAM slot instead of
# DOKUMEN_RUBRIK. Extracts BAB + sub-bab titles/guidance from an arbitrary
# uploaded writing-guideline PDF via one LLM call (not a font-heuristic
# parser like scripts/parse_ledps_guide.py, which is tuned to one specific
# PDF and only ever ran manually/offline) -- see plan for why this needs to
# be LLM-based: different tenants upload different institutions' guides.
# ──────────────────────────────────────────────────────────────────────

_SYSTEM_STRUKTUR_DOKUMEN = """
Anda adalah asesor akreditasi program studi di Indonesia yang membaca dokumen
Panduan Penulisan Laporan Evaluasi Diri (LED) institusi/lembaga akreditasi
tertentu, dan menyusun STRUKTUR RESMI dokumen LED yang harus diikuti
berdasarkan panduan itu.

TUGAS: identifikasi urutan BAB (bab utama) dokumen LED, dan untuk tiap BAB,
daftar sub-bab (bagian) yang harus ada di dalamnya sesuai panduan. Sub-bab
BOLEH punya sub-sub-bab sendiri (mis. "C. Kriteria Akreditasi" berisi
"C.1 Diferensiasi Misi", "C.2 Akuntabilitas", dst) -- itu masuk field
"subbab" milik sub-bab induknya, BUKAN didaftar rata sejajar sub-bab lain.

ATURAN:
- "judul" BAB, sub-bab, dan sub-sub-bab disalin/dirangkum dari judul asli di
  panduan, Bahasa Indonesia, tanpa nomor/kode di depannya.
- "panduan" tiap sub-bab/sub-sub-bab adalah 1-2 kalimat ringkasan apa yang
  harus dibahas bagian itu menurut teks panduan -- konkret, bukan generik.
- Urutkan BAB, sub-bab, dan sub-sub-bab sesuai urutan kemunculan di panduan.
- Maksimal 3 tingkat (BAB > sub-bab > sub-sub-bab) -- kalau panduan punya
  tingkat lebih dalam lagi, gabungkan ke tingkat sub-sub-bab, jangan bikin
  tingkat ke-4.
- Kalau BAB yang sama muncul dua kali di teks (mis. ringkasan daftar isi di
  awal, lalu rincian lengkap sub-babnya lagi di bagian lain), itu SATU BAB
  -- gabungkan jadi satu entri "bab" pakai versi paling rinci, JANGAN
  didaftar dua kali dengan judul yang sama.
- Kalau teks panduan tidak menyebutkan struktur bab yang jelas, kembalikan
  bab: [] -- jangan mengarang struktur yang tidak ada di teks.

OUTPUT HARUS JSON VALID SAJA (no explanation outside JSON):
{"bab": [{"urutan": 1, "judul": "...", "subbab": [{"urutan": 1, "judul": "...", "panduan": "...", "subbab": [{"urutan": 1, "judul": "...", "panduan": "..."}]}]}]}
"""


def _build_struktur_dokumen_prompt(teks_pedoman: str) -> str:
    # ponytail: potong ke ~30000 karakter pertama, satu LLM call -- upgrade
    # ke map-reduce per halaman kalau ada pedoman yang kepotong di sini.
    return f"{_SYSTEM_STRUKTUR_DOKUMEN}\n\n## TEKS PANDUAN:\n{teks_pedoman[:30000]}\n\nOutput HANYA JSON:"


def _gabung_duplikat_judul(items: list[dict]) -> list[dict]:
    """Gabung entri (bab/subbab) berjudul sama (LLM kadang mendaftarnya dua kali); subbab digabung rekursif, bukan cuma pilih satu."""
    by_title: dict[str, dict] = {}
    order: list[str] = []
    for item in items:
        key = item["title"].strip().lower()
        if key not in by_title:
            by_title[key] = item
            order.append(key)
            continue
        existing = by_title[key]
        gabungan_subbab = _gabung_duplikat_judul([*existing.get("subbab", []), *item.get("subbab", [])])
        lebih_detail = len(item.get("guidance") or "") > len(existing.get("guidance") or "")
        by_title[key] = {**(item if lebih_detail else existing), "subbab": gabungan_subbab}
    return [{**by_title[k], "order": i + 1} for i, k in enumerate(order)]


def _parse_subbab_list(raw_subbab: object, kedalaman: int = 0) -> list[dict]:
    """Recursive helper for _parse_struktur_dokumen -- satu tingkat rekursi
    lagi buat sub-sub-bab (kedalaman=1), berhenti di situ (maks 3 tingkat
    total termasuk BAB), sesuai batas yang diminta prompt-nya sendiri."""
    result: list[dict] = []
    for sub in raw_subbab or []:
        if not isinstance(sub, dict):
            continue
        sub_title = (sub.get("judul") or "").strip()
        if not sub_title:
            continue
        anak = _parse_subbab_list(sub.get("subbab"), kedalaman + 1) if kedalaman == 0 else []
        result.append({
            "order": len(result) + 1,
            "title": sub_title,
            "guidance": (sub.get("panduan") or "").strip(),
            "subbab": anak,
        })
    return _gabung_duplikat_judul(result)


def _parse_struktur_dokumen(raw: str) -> list[dict]:
    """Parses {"bab":[{"urutan","judul","subbab":[{"urutan","judul","panduan","subbab":[...]}]}]}
    into [{"order","title","subbab":[{"order","title","guidance","subbab":[...]}]}]
    (subbab nested one level deep, sub-sub-bab), dropping any bab/subbab
    missing a title. Duplicate bab titles (see _gabung_duplikat_judul) are
    merged, not listed twice."""
    data = _parse_llm_json(_strip_think(raw))
    result: list[dict] = []
    for bab in data.get("bab") or []:
        if not isinstance(bab, dict):
            continue
        title = (bab.get("judul") or "").strip()
        if not title:
            continue
        subbab = _parse_subbab_list(bab.get("subbab"))
        result.append({"order": len(result) + 1, "title": title, "subbab": subbab})
    return _gabung_duplikat_judul(result)


def _extract_pdf_pages(path: str) -> list[str]:
    import pdfplumber

    with pdfplumber.open(path) as pdf:
        return [page.extract_text() or "" for page in pdf.pages]


_DAFTAR_ISI_RE = re.compile(r"daftar\s+isi", re.IGNORECASE)


def _find_daftar_isi_text(pages: list[str]) -> str | None:
    """Cari halaman Daftar Isi -- pedoman akreditasi (LAM Teknik dkk) hampir
    selalu punya SATU halaman ringkas yang sudah memuat seluruh struktur
    BAB/sub-bab dengan leader titik + nomor halaman (mis. "BAB I.
    PENDAHULUAN....1"), jauh lebih murah & akurat dibaca LLM daripada
    seluruh dokumen (bisa puluhan-ratusan halaman prosa) -- dikonfirmasi di
    kedua contoh pedoman LAM Teknik yang ada (PJJ & AV Unggul Internasional),
    keduanya satu halaman persis. `None` kalau tidak ketemu -- pemanggil
    fallback ke potongan awal dokumen penuh.
    ponytail: ambil satu halaman itu saja, tidak antisipasi Daftar Isi yang
    menyambung ke halaman berikutnya -- upgrade kalau ada pedoman institusi
    lain yang ternyata butuh itu."""
    for page in pages:
        if _DAFTAR_ISI_RE.search(page):
            return page
    return None


async def _handle_ingestion_struktur_dokumen(job) -> dict:
    """Download the PANDUAN_LAM PDF from R2, extract its plain text, ask an
    LLM to identify the official BAB/sub-bab structure, and replace this
    AccreditationSet's chapter_templates/sub_bab_templates wholesale.

    Same discipline as _handle_ingestion_rubrik_dokumen: catch everything,
    always end SIAP/GAGAL on accreditation_sets.structure_parse_status,
    never leave it stuck on DIPROSES.
    """
    import tempfile
    from pathlib import Path

    from db.connection import get_conn
    from db.postgres_client import replace_chapter_templates_for_set
    from db.r2_client import download_to
    from llm.chat_model import build_plain_llm

    accreditation_set_id = job.data["accreditationSetId"]
    file_url = job.data["fileUrl"]

    def _set_status(status: str, catatan: str | None) -> None:
        with get_conn().cursor() as cur:
            cur.execute(
                "UPDATE accreditation_sets SET structure_parse_status = %s, structure_parse_error = %s WHERE id = %s",
                (status, catatan, accreditation_set_id),
            )

    try:
        with tempfile.TemporaryDirectory(prefix="struktur_parse_") as tmp:
            local_path = Path(tmp) / Path(file_url).name
            download_to(file_url, local_path)
            pages = _extract_pdf_pages(str(local_path))

        # Halaman Daftar Isi (kalau ada) sudah memuat struktur BAB/sub-bab
        # lengkap dalam beberapa baris -- jauh lebih cepat & akurat dibaca
        # LLM daripada seluruh dokumen. Fallback ke potongan awal dokumen
        # penuh kalau tidak ketemu halaman Daftar Isi sama sekali.
        teks_pedoman = _find_daftar_isi_text(pages) or "\n\n".join(pages)

        if not teks_pedoman.strip():
            _set_status(
                "GAGAL",
                "Tidak ada teks yang bisa diekstrak dari PDF ini — pastikan bukan hasil scan tanpa OCR.",
            )
            return {"status": "empty", "accreditationSetId": accreditation_set_id}

        llm = build_plain_llm()
        raw = await llm.ainvoke(_build_struktur_dokumen_prompt(teks_pedoman))
        bab_list = _parse_struktur_dokumen(raw.content)

        if not bab_list:
            _set_status(
                "GAGAL",
                "LLM tidak menemukan struktur bab yang jelas dari panduan ini.",
            )
            return {"status": "empty", "accreditationSetId": accreditation_set_id}

        count = replace_chapter_templates_for_set(accreditation_set_id, bab_list)
    except Exception as e:
        logger.exception("Ekstraksi struktur dokumen gagal untuk set %s", accreditation_set_id)
        _set_status("GAGAL", str(e)[:500])
        return {"status": "error", "accreditationSetId": accreditation_set_id, "reason": str(e)}

    _set_status("SIAP", None)
    return {"status": "completed", "accreditationSetId": accreditation_set_id, "count": count}


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
