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

from prose import content_to_nodes, content_to_text, text_to_doc

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
    elif job.name == "PENILAIAN_RAGAS":
        result = await _handle_penilaian_ragas(job)
    elif job.name == "SIMULASI_SKOR":
        result = await _handle_simulasi_skor(job)
    elif job.name == "ASSESSMENT_AMI":
        result = await _handle_assessment_ami(job)
    elif job.name == "SETOR_LED":
        result = await _handle_setor_led(job)
    elif job.name == "INGESTION_BUKTI_DUKUNG":
        result = await _handle_ingestion_bukti_dukung(job)
    elif job.name == "INGESTION_RUBRIK_DOKUMEN":
        result = await _handle_ingestion_rubrik_dokumen(job)
    elif job.name == "INGESTION_STRUKTUR_DOKUMEN":
        result = await _handle_ingestion_struktur_dokumen(job)
    elif job.name == "INGESTION_LKPS":
        result = await _handle_ingestion_lkps(job)
    elif job.name == "INGESTION_LED":
        result = await _handle_ingestion_led(job)
    else:
        logger.warning("job type tidak dikenal, diselesaikan tanpa aksi: %s", job.name)
        result = {"status": "skipped", "reason": f"unknown job type {job.name}"}

    logger.info("job selesai: id=%s result=%s", job.id, result)
    return result


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


def _err_msg(e: Exception) -> str:
    """`str(e)` is empty for exceptions like httpx.ReadError (network drop
    mid-stream against the remote Ollama endpoint) that carry no message --
    falls back to the class name so GAGAL/error fields are never blank."""
    return str(e) or type(e).__name__


def _parse_llm_json(raw: str) -> dict:
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, (dict, list)):  # a bare string/number is valid JSON but not an answer
            return parsed
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return {"raw": raw, "parse_error": "could not extract JSON"}


def _normalize_items_response(data: dict | list, raw: str) -> dict:
    """Rescue the most common assess_and_recommend malformed-schema case
    (port of Dimas 140d8ae): the LLM answers a syntactically valid items
    array but forgets to wrap it as {"items": [...]}. `_parse_llm_json`
    either returns that bare list as-is (json.loads succeeded) or fails to
    extract it at all (its own regex only looks for `{...}`, not `[...]`).
    Leaves `data` untouched otherwise so the caller's normal parse_error
    handling still applies."""
    if isinstance(data, list):
        return {"items": data}
    if isinstance(data, dict) and data.get("parse_error"):
        m = re.search(r"\[.*\]", raw, re.DOTALL)
        if m:
            try:
                parsed = json.loads(m.group(0))
                if isinstance(parsed, list):
                    return {"items": parsed}
            except json.JSONDecodeError:
                pass
    return data


# Port of Dimas 140d8ae -- cosine-distance thresholds (tuned by Dimas on bge-m3, the model we embed with).
# Values are Dimas's; scripts/sample_distances.py prints distances if they ever need checking.
_LKPS_RAG_DISTANCE_MAX = 0.38
_EVIDENCE_RAG_DISTANCE_MAX = 0.65


def _filter_by_distance(hits: list[dict], distance_max: float) -> list[dict]:
    """Drop candidates above the distance threshold; count stays uncapped here."""
    return [h for h in hits if h.get("distance") is None or h["distance"] <= distance_max]


def _select_candidates_per_item(
    checklist: list[str], candidates: dict[str, list[dict]], per_item_target: int
) -> list[dict]:
    """Port of Dimas 140d8ae -- per-item pick with collision fallback to the item's own next candidate."""
    used_ids: set = set()
    out: list[dict] = []
    for q in checklist:
        picked = 0
        for h in candidates.get(q, []):
            if picked >= per_item_target:
                break
            if h["chunk_id"] in used_ids:
                continue
            used_ids.add(h["chunk_id"])
            out.append(h)
            picked += 1
    return out


def _load_lkps_tables(
    bab: dict, needs_lkps: bool, lkps_list: list[str], checklist: list[str] | None = None
) -> list[dict]:
    """LKPS context shared by GENERASI_BAB and REKOMENDASI_DOKUMEN. Two
    mutually exclusive paths depending on `needs_lkps` (SubBabTemplate/
    ChapterSection.lkpsNeeded, precomputed once at Panduan extraction time
    by ingestion.panduan_chunker.detect_lkps -- port of Dimas 140d8ae,
    replacing the old worker.py::_lkps_refs_in_pedoman regex run on every
    call):

    1. needs_lkps=True -- the section's guidance ALREADY names the exact
       LKPS table(s) it needs (`lkps_list`, normalized sheet tokens).
       Direct lookup (`lookup_lkps_by_sheets`), no similarity search at
       all -- a vector search would be strictly less precise than an exact
       match by construction.
    2. needs_lkps=False -- the section might still benefit from
       quantitative LKPS context the pedoman didn't explicitly call out.
       Semantic RAG per checklist item (has_lkps_index gate, same as
       before), now filtered by `_LKPS_RAG_DISTANCE_MAX` -- previously this
       ran unconditionally with NO relevance threshold, always returning
       the top-n_results candidates regardless of how irrelevant.

    Scoped to the document's chosen LKPS file (bab["lkps_evidence_id"], dimas
    dokumen_led.lkps_id); no LKPS chosen -> no LKPS context at all."""
    lkps_id = bab.get("lkps_evidence_id")
    if not lkps_id:
        return []
    if needs_lkps:
        if not lkps_list:
            return []
        from vectorstore.pgvector_lkps_store import lookup_lkps_by_sheets

        try:
            hits = lookup_lkps_by_sheets(bab["tenant_id"], lkps_id, lkps_list)
        except Exception:
            logger.exception("Gagal lookup LKPS by sheet untuk bab %s", bab["id"])
            return []
        return [_lkps_fact(h) for h in hits]

    if not checklist:
        return []

    from vectorstore.pgvector_lkps_store import has_lkps_index, search_lkps

    try:
        if not has_lkps_index(bab["tenant_id"], lkps_id):
            return []
        candidates: dict[str, list[dict]] = {}
        for query in checklist:
            hits = search_lkps(query, bab["tenant_id"], lkps_id, n_results=15)
            candidates[query] = _filter_by_distance(hits, _LKPS_RAG_DISTANCE_MAX)
        selected = _select_candidates_per_item(checklist, candidates, per_item_target=2)
    except Exception:
        logger.exception("Gagal semantic search LKPS untuk bab %s", bab["id"])
        return []
    return [_lkps_fact(h) for h in selected]


def _full_title(section: dict) -> str:
    """dimas outline full_title: "marker title" ("C.1 Diferensiasi Misi"); a marker-only stub shows once."""
    marker, title = (section.get("marker") or "").strip(), (section.get("title") or "").strip()
    return f"{marker} {title}" if marker and title != marker else title or marker


def _section_prompt_title(section: dict) -> str:
    """dimas retrieval_query: the breadcrumb heading `guidance` (panduan_chunker.with_breadcrumb); plain title for
    sections extracted before the breadcrumb existed."""
    head = (section.get("guidance") or "").split("\n\n", 1)[0].strip()
    title = (section.get("title") or "").strip()
    return head if title and head.splitlines() and head.splitlines()[-1].endswith(title) else title


def _lkps_fact(hit: dict) -> dict:
    """{sheet, judul, text}: dimas's normalized sheet token, table title (lkps_detail.judul_poin) + full text."""
    from ingestion.panduan_chunker import normalize_lkps_sheet

    return {"sheet": normalize_lkps_sheet(hit["sheet"] or ""), "judul": hit.get("judul") or "", "text": hit["text"]}


# Port of AI-LED-dimas (140d8ae) KONTEKS_PROMPT -- glosarium istilah + batas bidang LAM Teknik, dipakai checklist & narasi.
_KONTEKS_PROMPT = """

ISTILAH YANG PERLU DIPAHAMI:
- SPM (Sistem Penjaminan Mutu) adalah keseluruhan mekanisme penjaminan mutu perguruan tinggi.
- SPMI (Sistem Penjaminan Mutu Internal) adalah penjaminan mutu yang dilaksanakan perguruan tinggi secara internal melalui siklus PPEPP: Penetapan, Pelaksanaan, Evaluasi, Pengendalian, dan Peningkatan.
- SPME (Sistem Penjaminan Mutu Eksternal) adalah penilaian mutu yang dilakukan oleh pihak eksternal, salah satunya melalui akreditasi.
- LED (Laporan Evaluasi Diri) adalah dokumen yang memuat evaluasi terhadap kondisi, kinerja, capaian, permasalahan, serta pengembangan institusi atau program studi sebagai bagian dari proses penjaminan mutu dan akreditasi.
- LKPS (Laporan Kinerja Program Studi) adalah dokumen yang memuat data dan informasi kuantitatif mengenai kinerja program studi untuk mendukung evaluasi dan akreditasi.
- TS (Tahun Sekarang) adalah tahun akademik atau periode pelaporan yang menjadi tahun acuan utama dalam data LKPS.
- TS-1 adalah satu tahun akademik atau periode pelaporan sebelum TS.
- TS-2 adalah dua tahun akademik atau periode pelaporan sebelum TS.
- TS-n adalah n tahun akademik sebelum TS. Pada tabel masa studi, TS-3 sampai TS-7 menunjukkan tahun masuk angkatan yang lulusannya dihitung.
- UPPS (Unit Pengelola Program Studi) adalah unit yang mengelola program studi yang diakreditasi.
- PS adalah program studi yang diakreditasi.
- DT (Dosen Tetap) adalah dosen tetap perguruan tinggi.
- DTPS (Dosen Tetap Program Studi) adalah dosen tetap perguruan tinggi yang mengampu mata kuliah dengan bidang keahlian sesuai kompetensi inti program studi yang diakreditasi.
- PkM adalah Pengabdian kepada Masyarakat.
- PBJJ (Pusat Belajar Jarak Jauh) adalah lokasi pendukung pembelajaran di luar kampus utama pada program PJJ.
- PLP (Pranata Laboratorium Pendidikan) dan Pranata TIK adalah tenaga kependidikan pendukung laboratorium dan teknologi informasi.
- HKI adalah Hak Kekayaan Intelektual, meliputi paten, paten sederhana, hak cipta, dan desain produk industri.
- TKT (Tingkat Kesiapan Teknologi) adalah skala 1 sampai 9 yang menunjukkan kematangan luaran teknologi.
- ISBN dan ISSN adalah nomor identitas buku dan terbitan berkala.
- SINTA adalah basis data publikasi ilmiah nasional yang menjadi rujukan konfirmasi publikasi DTPS.
- SPK (Surat Perjanjian Kerjasama) adalah dokumen perjanjian pelaksanaan kerja sama.
- RPS (Rencana Pembelajaran Semester) adalah dokumen perencanaan pembelajaran setiap mata kuliah.
- MKK adalah mata kuliah kompetensi.
- sks adalah satuan kredit semester.
- JP adalah jam pembelajaran praktik di industri, dan JB adalah jam pembelajaran total selama masa pendidikan.
- BK adalah beban kerja dosen dalam satuan sks, dan RBK adalah rata-rata beban kerja DTPS.
- MS (Masa Studi) adalah lama studi lulusan dalam tahun.
- WT (Waktu Tunggu) adalah lama waktu lulusan mendapatkan pekerjaan pertama dalam bulan.
- IPK adalah Indeks Prestasi Kumulatif.
- K3L adalah Keselamatan, Kesehatan Kerja, dan Lingkungan.
 
KEDUDUKAN LED:
LED merupakan evaluasi menyeluruh terhadap kondisi dan kinerja institusi/program studi. Narasi LED tidak sekadar mendeskripsikan dokumen atau kegiatan, tetapi harus menunjukkan keterkaitan antara kondisi, kebijakan, pelaksanaan, capaian, evaluasi, permasalahan, dan pengembangan sesuai kebutuhan PEDOMAN.
 
PEDOMAN merupakan sumber utama untuk menentukan informasi apa yang perlu dijelaskan dalam suatu SECTION. SECTION menentukan batas pembahasan yang sedang dianalisis. Dokumen dalam KATALOG hanya berfungsi sebagai sumber informasi atau bukti untuk memenuhi kebutuhan yang ditentukan oleh PEDOMAN.
 
PRINSIP BATAS BIDANG:
LED terdiri dari beberapa bidang, dan setiap bidang memiliki substansi utamanya sendiri. Setiap dokumen dalam KATALOG memiliki satu subjek utama, yaitu hal yang secara langsung diatur, ditetapkan, direncanakan, dilaporkan, atau dievaluasi oleh dokumen tersebut. Subjek utama ditentukan dari judul dan objek pengaturannya, bukan dari hal-hal yang disebut, dirujuk, atau dijabarkan di dalamnya.
 
Dokumen hanya boleh dipilih untuk SECTION apabila subjek utamanya adalah substansi SECTION tersebut, atau apabila PEDOMAN pada SECTION tersebut secara eksplisit meminta informasi yang hanya tersedia pada dokumen itu.
 
Dokumen yang subjek utamanya adalah substansi bidang lain adalah milik bidang tersebut dan tidak dipilih untuk SECTION yang sedang aktif, sekalipun dokumen itu memuat, merujuk, menjabarkan, atau diturunkan dari substansi SECTION yang sedang aktif. Semua dokumen perguruan tinggi pada dasarnya saling terkait dan sama-sama diturunkan dari arah strategis institusi, sehingga keterkaitan semacam itu tidak pernah menjadi alasan pemilihan.
 
Kecocokan kata kunci, kesamaan istilah, atau kemiripan struktur isi antara deskripsi dokumen dan PEDOMAN bukan indikator relevansi.
 
PRINSIP KELENGKAPAN INFORMASI:
Kelengkapan sumber tidak ditentukan oleh jumlah dokumen, tetapi oleh ketercakupan seluruh kebutuhan informasi yang dituntut PEDOMAN pada SECTION.
 
Kelengkapan ditentukan dengan urutan berikut:
1. Uraikan terlebih dahulu kebutuhan informasi yang diminta PEDOMAN pada SECTION menjadi daftar kebutuhan yang spesifik.
2. Untuk setiap kebutuhan, cari dokumen yang memenuhinya. Satu kebutuhan dapat membutuhkan lebih dari satu dokumen apabila informasinya tersebar, dan satu dokumen dapat memenuhi lebih dari satu kebutuhan.
3. Berhenti mencari untuk suatu kebutuhan apabila kebutuhan itu sudah terpenuhi. Dokumen tambahan yang hanya mengulang informasi yang sama tidak dipilih.
4. Dokumen yang tidak dapat dipetakan ke salah satu kebutuhan pada daftar tidak dipilih, seberapa pun relevan tampaknya.
 
Pencarian selalu berangkat dari kebutuhan menuju dokumen, bukan dari dokumen menuju alasan.
 
BIDANG DALAM LED LAM TEKNIK:
 
A. STRUKTUR TIM PENYUSUN
    Susunan tim penyusun LEDPS serta tugas dan tanggung jawab anggota atau unit penjaminan mutu yang ditetapkan dalam penyusunan LEDPS, mencakup penjabaran tugas tim SPM atau tim penyusun dokumen akreditasi dalam bentuk poin-poin.
 
B. ANALISIS LINGKUNGAN EKSTERNAL
    Membahas kondisi lingkungan makro dan mikro yang relevan terhadap pengembangan UPPS dan program studi, pengaruhnya terhadap arah pengembangan, serta alternatif pengembangan yang dapat dilakukan.
 
1. VISI, MISI, TUJUAN, DAN STRATEGI
   Berfokus pada arah strategis dan identitas program studi, meliputi rumusan Visi, Misi, Tujuan, dan Strategi, visi keilmuan, kekhasan program studi, keterkaitan arah strategis perguruan tinggi, UPPS, dan program studi, serta proses penyusunan dan pemutakhiran arah strategis tersebut. Bidang ini membahas arah strategis itu sendiri dan cara arah strategis dijabarkan ke dalam rencana pengembangan, bukan penyelenggaraan masing-masing bidang yang menjalankannya.
 
2. AKUNTABILITAS
   Berfokus pada cara institusi dan program studi dikelola dan dipertanggungjawabkan, meliputi:
   - tata pamong dan tata kelola: kelengkapan struktur organisasi dan kebijakan operasional yang berpedoman pada statuta, wewenang dan tugas organisasi pokok, serta perwujudan tata kelola yang efektif, transparan, dan akuntabel;
   - kepemimpinan: komitmen pimpinan UPPS terhadap tujuan strategis, integritas dan kode etik, serta kemampuan manajerial dalam pengambilan keputusan dan manajemen konflik;
   - kerja sama: relevansi kerja sama dengan visi UPPS dan visi keilmuan program studi, tingkat kerja sama, serta manfaat, peningkatan kinerja, dan kepuasan mitra;
   - keuangan: pengelolaan keuangan yang akuntabel dan transparan, biaya operasional pendidikan, serta besaran dana penelitian dan PkM.
   Bidang ini membahas pengelolaan dan pertanggungjawaban, bukan isi penyelenggaraan bidang yang dikelola. Pelaksanaan penelitian dan PkM, kualifikasi dan kinerja SDM, serta siklus penjaminan mutu dan audit mutu internal milik bidangnya masing-masing, meskipun melibatkan kewenangan, kerja sama, atau pendanaan.
 
3. SUMBER DAYA MANUSIA
   Berfokus pada dosen dan tenaga kependidikan, meliputi kecukupan, kualifikasi, kompetensi, jabatan fungsional, sertifikasi, beban kerja, pengembangan kompetensi, serta kinerja dan kontribusi SDM.
 
4. PENDIDIKAN
   Berfokus pada penyelenggaraan pendidikan dan pembelajaran, termasuk kurikulum, profil lulusan, capaian pembelajaran lulusan, struktur kurikulum, proses pembelajaran, capstone, suasana akademik, penilaian, evaluasi, dan pemutakhiran pendidikan.
 
5. PENELITIAN
   Berfokus pada penyelenggaraan penelitian, meliputi kebijakan, arah dan roadmap, pelaksanaan penelitian DTPS, kesesuaian dengan VMTS, keterlibatan mahasiswa, pendanaan, luaran, publikasi, HKI, dampak, evaluasi, dan pengembangan penelitian.
 
6. PENGABDIAN KEPADA MASYARAKAT
   Berfokus pada penyelenggaraan PkM, meliputi kebijakan, arah dan roadmap, pelaksanaan, kesesuaian dengan VMTS, keterlibatan mahasiswa, mitra, pendanaan, luaran, penerapan hasil, dampak, evaluasi, dan pengembangan PkM.
 
7. SARANA, PRASARANA, DAN K3L
   Berfokus pada fasilitas dan lingkungan pendukung pendidikan, penelitian, dan PkM, meliputi kecukupan, aksesibilitas, kualitas, pengelolaan, pemanfaatan, pemeliharaan, serta penerapan keselamatan, kesehatan kerja, dan lingkungan.
 
8. MAHASISWA DAN LUARAN
   Berfokus pada mahasiswa PROGRAM STUDI sejak penerimaan, proses pendidikan, perkembangan, prestasi, kompetensi, hingga kelulusan dan capaian lulusan setelah menyelesaikan pendidikan.
   Ruang lingkupnya meliputi penerimaan mahasiswa, layanan dan pembinaan, prestasi, kompetensi, masa studi, IPK, publikasi dan luaran penelitian/PkM mahasiswa, serta kualitas, relevansi, dan capaian lulusan.
   Dokumen hanya relevan jika objek utama yang diatur, direncanakan, dievaluasi, atau dilaporkan secara langsung berkaitan dengan mahasiswa atau luaran lulusan PROGRAM STUDI, bukan sekadar karena menyebutkan atau melibatkan mahasiswa.

   FOKUS PROGRAM STUDI:
   - Analisis WAJIB berfokus pada PROGRAM STUDI yang sedang dievaluasi.
   - Dokumen atau data yang mencakup seluruh program studi di perguruan tinggi atau UPPS tetap dapat digunakan sebagai sumber, tetapi hanya informasi yang berkaitan dengan PROGRAM STUDI yang sedang dievaluasi yang boleh digunakan dalam analisis.
   - Jangan menggeneralisasi data dari program studi lain menjadi kondisi PROGRAM STUDI yang sedang dievaluasi.
   - Data gabungan seluruh program studi hanya boleh digunakan jika secara eksplisit diperlukan oleh PEDOMAN dan konteks analisis memang berada pada tingkat UPPS atau institusi.
   - Jika satu dokumen memuat data beberapa program studi, identifikasi dan gunakan hanya bagian yang secara jelas menunjukkan data PROGRAM STUDI yang sedang dievaluasi.
 
9. SISTEM PENJAMINAN MUTU
   Berfokus pada penyelenggaraan penjaminan mutu internal, meliputi kebijakan, kelembagaan/unit penjaminan mutu, standar, siklus PPEPP, pelaksanaan AMI, RTM, evaluasi, pengendalian, tindak lanjut, efektivitas, serta peningkatan mutu.
 
STRUKTUR INFORMASI:
Setiap bidang dapat memiliki bagian berikut sesuai dengan struktur yang ditentukan PEDOMAN. PEDOMAN tetap menjadi penentu utama mengenai informasi yang harus dicari dan ditulis. PRINSIP BATAS BIDANG berlaku pada semua bagian di bawah ini.
 
- LATAR BELAKANG:
    Latar Belakang adalah pembuka kriteria yang menjelaskan rasional, tujuan, dan konteks mengapa substansi kriteria penting bagi UPPS dan program studi. Bagian ini tidak membuktikan, mengatur, atau mengevaluasi. Pilih hanya dokumen yang menjelaskan arah, profil, atau konteks pengembangan yang subjek utamanya substansi kriteria.

    Jangan pilih dokumen jenis berikut, apa pun isinya:
    A. hasil evaluasi atau pemeriksaan: laporan review, audit, AMI, RTM, temuan, rekomendasi, dan laporan tindak lanjut;
    B. bukti pelaksanaan: laporan kegiatan, MoU, rekap, sertifikat, dan data capaian.
 
- KEBIJAKAN:

  Pilih dokumen yang secara langsung mengatur, menetapkan, atau merencanakan substansi SECTION.

  Prioritas:
  1. Regulasi/keputusan tingkat nasional.
  2. Kebijakan perguruan tinggi, UPPS, atau program studi.
  3. Pedoman, standar, rencana, atau strategi pelaksanaan.

  Dokumen bukti pelaksanaan, hasil evaluasi, sertifikat, laporan kegiatan, dan data capaian bukan kebijakan.

  UJI SUBJEK UTAMA berlaku: dokumen hanya dipilih jika SECTION merupakan objek utama yang diatur atau direncanakan, bukan sekadar disebut, dirujuk, atau berkaitan.

  Regulasi nasional boleh dipilih sebagai payung hukum jika objek pengaturannya mencakup SECTION. Dokumen tingkat institusi/UPPS/program studi harus membahas SECTION secara langsung.

  Jika PEDOMAN meminta penjabaran ke program pengembangan, pilih dokumen perencanaan pengembangan yang relevan langsung dengan SECTION.
 
- INDIKATOR KINERJA UTAMA:
    Identifikasi seluruh kebutuhan informasi mengenai data, kondisi aktual, target, capaian, hasil pelaksanaan, tren, permasalahan, faktor pendukung atau penghambat, tindak lanjut, pengendalian, peningkatan, atau pengembangan yang dituntut PEDOMAN pada SECTION.
    Telusuri setiap kebutuhan tersebut ke sumber yang tersedia dan pilih seluruh sumber yang memberikan informasi berbeda dan diperlukan.
    Jangan berhenti hanya karena telah ditemukan satu sumber data atau dokumen yang relevan apabila kebutuhan informasi lainnya belum memiliki sumber.
    LKPS dapat dipilih apabila data di dalamnya diperlukan untuk menjelaskan indikator atau capaian yang diminta PEDOMAN.
    Jika data kuantitatif memerlukan bukti pendukung untuk memahami atau memperkuat informasi tersebut, dokumen pendukung dapat dipilih apabila kebutuhan tersebut memang relevan dengan PEDOMAN.
"""

# ──────────────────────────────────────────────────────────────────────
# Checklist (port of AI-LED-dimas 140d8ae SYSTEM_CHECKLIST).
# ──────────────────────────────────────────────────────────────────────

_SYSTEM_CHECKLIST = f"""
{_KONTEKS_PROMPT}

TUGAS:
Susun checklist kebutuhan informasi untuk penulisan LED pada SECTION berdasarkan PEDOMAN dan seluruh DOKUMEN yang tersedia.

TUJUAN:
Checklist harus mencakup:
1. seluruh kebutuhan informasi yang diminta PEDOMAN.
2. informasi relevan yang perlu digali dari DOKUMEN untuk memenuhi kebutuhan tersebut.

PRINSIP UTAMA:
- PEDOMAN menentukan SCOPE SECTION.
- DOKUMEN digunakan sebagai sumber untuk menggali informasi.
- DOKUMEN tidak boleh memperluas scope SECTION.
- Checklist harus berisi SUBSTANSI YANG PERLU DIKETAHUI, bukan DESKRIPSI SUMBER INFORMASI.

1. ATOMIC REQUIREMENTS
- Pecah seluruh tuntutan PEDOMAN menjadi kebutuhan informasi yang spesifik, independen, dan dapat dicari menggunakan RAG.
- Setiap item harus menyatakan fakta, substansi, ketentuan, kondisi, mekanisme, hubungan, arah, target, atau bukti yang perlu diketahui untuk menyusun SECTION.
- Jangan menjadikan jenis, nama, keberadaan, karakteristik, fungsi, atau status dokumen sebagai kebutuhan informasi.
- Jangan menjadikan sumber informasi sebagai objek checklist.
- Jika beberapa frasa dalam PEDOMAN meminta substansi yang sama, gabungkan menjadi satu kebutuhan.

2. DOCUMENT MINING
- Analisis SETIAP DOKUMEN yang tersedia.
- Gali isi substantif dari setiap DOKUMEN yang dapat memenuhi kebutuhan PEDOMAN.
- Identifikasi fakta, ketentuan, mekanisme, program, target, hubungan, atau bukti yang benar-benar relevan dengan substansi SECTION.
- Jika informasi substantif yang relevan belum terwakili dalam checklist, tambahkan kebutuhan tersebut.
- Informasi dari DOKUMEN hanya boleh menghasilkan kebutuhan baru jika informasi tersebut diperlukan untuk memenuhi substansi PEDOMAN.
- Jangan mengubah keberadaan atau karakteristik suatu DOKUMEN menjadi kebutuhan informasi.

3. RELASI
Setiap item harus memiliki hubungan:

PEDOMAN → KEBUTUHAN INFORMASI → INFORMASI YANG DIGALI

- KEBUTUHAN INFORMASI harus menjelaskan apa yang perlu diketahui dari isi sumber.
- Jika item hanya menjelaskan sumber, jenis dokumen, bentuk dokumen, atau keberadaan dokumen, jangan masukkan.
- Jika hubungan dengan substansi PEDOMAN tidak jelas atau hanya bersifat tidak langsung, jangan masukkan.

4. SUMBER
- Satu kebutuhan dapat dipenuhi oleh banyak dokumen.
- Jangan membuat item terpisah hanya karena sumbernya berbeda.
- Beberapa dokumen yang memberikan informasi untuk kebutuhan yang sama harus dipetakan ke satu kebutuhan.

5. SECTION KEBIJAKAN
- Jika SECTION membahas KEBIJAKAN, WAJIB analisis setiap DOKUMEN yang tersedia untuk menemukan ketentuan substantif yang relevan dengan SECTION.
- Status dokumen sebagai dokumen resmi tidak cukup untuk menghasilkan kebutuhan.
- Hanya substansi dalam dokumen yang relevan dengan PEDOMAN yang dapat digunakan untuk memperkaya checklist.

6. LINTAS PERIODE
- Dokumen sejenis dari periode berbeda tetap dianalisis sebagai sumber terhadap kebutuhan yang sama.
- Kebutuhan lintas periode hanya dibuat jika PEDOMAN membutuhkan perubahan, perkembangan, kesinambungan, atau perbandingan.

7. BATASAN
Jangan:
- membuat kebutuhan berdasarkan pengetahuan umum;
- membuat kebutuhan hanya karena informasi tersedia dalam DOKUMEN;
- menjadikan nama, jenis, bentuk, status, atau keberadaan DOKUMEN sebagai kebutuhan;
- menjadikan sumber hukum sebagai kebutuhan;
- menjadikan dokumen pendukung sebagai kebutuhan;
- menggunakan pola deskripsi seperti "dokumen yang...", "dokumen formal yang...", "informasi mengenai...", atau "deskripsi...";
- memperluas scope ke SECTION atau kriteria lain;
- menggabungkan kebutuhan informasi yang berbeda;
- membuat kebutuhan yang duplikat.

8. VALIDASI
Sebelum menghasilkan output, pastikan:
- setiap item menyatakan SUBSTANSI yang perlu diketahui;
- setiap item dapat dijawab dengan isi suatu sumber;
- tidak ada item yang hanya mendeskripsikan dokumen atau sumber;
- seluruh tuntutan PEDOMAN telah dipecah menjadi kebutuhan atomik;
- setiap DOKUMEN telah dianalisis;
- informasi relevan dari DOKUMEN telah tercakup;
- informasi yang tidak relevan telah diabaikan;
- tidak terdapat duplikasi;
- setiap item dapat digunakan sebagai target pencarian atau query RAG.

OUTPUT:
Hanya daftar (-) kebutuhan informasi dalam Bahasa Indonesia.

Satu item per baris dan diawali "- ".

Jangan memberikan nomor, kategori, heading, nama file, sumber, penjelasan, alasan, atau teks tambahan.
"""


def _format_table_schema(table_spec: list[dict] | None) -> list[str]:
    """TABLE_SCHEMA block shared by checklist/generate prompts (port of
    Dimas's 9ae4fad _format_table_schema) — satu sumber format supaya kedua
    prompt selalu menyebut kolom yang identik. Kosong kalau section ini
    tidak punya table_spec (mayoritas section, fitur tabel opsional per
    section — lihat ChapterSection.tableSpec di schema.prisma)."""
    if not table_spec:
        return []
    parts = ["## TABLE_SCHEMA:"]
    for t in table_spec:
        caption = t.get("caption") or t.get("id") or "Tabel"
        columns = t.get("columns") or []
        if not columns:
            continue
        parts.append(f'- Tabel "{caption}" (id: {t.get("id")}) — kolom: ' + ", ".join(columns))
    parts.append("")
    return parts


def _build_checklist_prompt(
    judul_bab: str,
    pedoman: list[dict],
    institution_context: dict | None = None,
    selected_document_names: list[str] | None = None,
    table_spec: list[dict] | None = None,
) -> str:
    """Port of Dimas 140d8ae's build_checklist_prompt -- no rubric param, checklist is PEDOMAN+DOKUMEN only now."""
    parts = [_SYSTEM_CHECKLIST, "", f"## SECTION: {judul_bab}", ""]
    if pedoman:
        parts.append("## PEDOMAN PENULISAN:")
        for p in pedoman:
            parts.append(f"- {p.get('content_text') or ''}")
        parts.append("")
    if selected_document_names:
        parts.append("## DOKUMEN YANG TERSEDIA:")
        for name in selected_document_names:
            parts.append(f"- {name}")
        parts.append(
            "- Gunakan daftar ini hanya sebagai petunjuk sumber untuk menemukan informasi yang sudah ditentukan PEDOMAN"
            "-Jangan membuat kebutuhan informasi baru berdasarkan nama atau isi dokumen."
        )
    parts += _format_table_schema(table_spec)
    ic = institution_context or {}
    if ic.get("university_name") or ic.get("study_program_name"):
        parts.append("## KONTEKS INSTITUSI:")
        if ic.get("university_name"):
            parts.append(f"Institusi: {ic['university_name']}")
        if ic.get("study_program_name"):
            parts.append(f"Program Studi: {ic['study_program_name']}")
        parts.append(
            "(Gunakan hanya untuk membuat query lebih spesifik. "
            "Jangan memperluas atau mengubah tuntutan PEDOMAN.)"
        )
        parts.append("")
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
# = dimas 140d8ae SYSTEM_ASSESS_AND_RECOMMEND verbatim, incl. its label-only output contract: dimas dropped the
# numbered catalog because models renumbered entries and most picks got rejected.
# Revisi _SYSTEM_ASSESS_AND_RECOMMEND: perubahan hanya di ATURAN PEMILIHAN dan PRINSIP.
# OUTPUT CONTRACT dan FORMAT OUTPUT dipertahankan persis seperti aslinya.

_SYSTEM_ASSESS_AND_RECOMMEND = """
ATURAN PEMILIHAN:
 
- PEDOMAN menentukan kebutuhan informasi yang harus dipenuhi. Uraikan PEDOMAN menjadi daftar kebutuhan informasi yang terpisah (contoh: rumusan resmi visi dan misi, visi keilmuan program studi, dokumen perencanaan jangka panjang, program jangka pendek dan menengah).
- SECTION menentukan topik yang dibahas.
- DATA LKPS adalah evidence yang sudah tersedia.
- KATALOG adalah closed set.
- Hanya pilih dokumen dari KATALOG.
- Pilih SEMUA dokumen yang nama atau uraiannya di KATALOG secara eksplisit memuat substansi yang diminta salah satu kebutuhan informasi PEDOMAN.
- Satu kebutuhan boleh didukung lebih dari satu dokumen jika tiap dokumen memberi bukti yang berbeda (contoh: dokumen penetapan resmi, dokumen perencanaan, dan dokumen turunan di tingkat program studi). Dokumen yang isinya tumpang tindih penuh dengan dokumen yang sudah dipilih tidak perlu ditambahkan.
- Kesamaan objek, unit, istilah, atau konteks saja tidak cukup; nama atau uraian dokumen harus memuat substansi yang diminta.
- Jangan memasukkan dokumen untuk topik lain yang tidak diminta PEDOMAN.
- Aturan "DATA LKPS sudah memenuhi kebutuhan" hanya berlaku untuk kebutuhan data tabel LKPS, bukan untuk kebutuhan dokumen kebijakan, penetapan, atau perencanaan.
- Jangan memilih dokumen untuk memenuhi jumlah tertentu.
 
KATEGORI KATALOG:
 
- KATALOG dikelompokkan per kategori. KATEGORI UTAMA adalah bidang yang sedang ditulis. KATEGORI PENDUKUNG adalah bidang terkait yang menyimpan bukti lintas bidang.
- Penuhi setiap kebutuhan informasi lebih dulu dari KATEGORI UTAMA.
- Pilih dari KATEGORI PENDUKUNG hanya untuk kebutuhan yang PEDOMAN-nya menyebut substansi yang tidak ada di KATEGORI UTAMA (misalnya kerja sama, dana, atau luaran DTPS), dan hanya dokumen yang subjek utamanya adalah substansi itu.
- Kategori bukan alasan memilih. Dokumen dipilih karena nama atau uraiannya memuat kebutuhan PEDOMAN, bukan karena kategorinya tampak cocok dengan SECTION. Kategori pendukung yang tidak punya dokumen relevan dibiarkan kosong.
 
PRINSIP:
PEDOMAN → DAFTAR KEBUTUHAN INFORMASI → DOKUMEN YANG NAMA ATAU URAIANNYA MEMUAT KEBUTUHAN ITU, DIMULAI DARI KATEGORI UTAMA
 
OUTPUT CONTRACT:
- Respons harus dimulai dengan karakter `{`.
- Respons harus diakhiri dengan karakter `}`.
- Karakter pertama setelah whitespace harus `{`.
- Karakter terakhir sebelum whitespace harus `}`.
- Jangan menulis kalimat, penjelasan, pengantar, kesimpulan, atau permintaan maaf.
- Jangan mengakui atau menjelaskan instruksi.
- Jangan menulis apa pun selain satu objek JSON yang valid.
 
FORMAT OUTPUT:
Output HARUS berupa satu objek JSON dengan TEPAT satu field bernama "items", berisi array objek dengan TEPAT satu field bernama "label" per objek. Jangan gunakan nama field lain apa pun (bukan "kebutuhan", "dokumen", "pilihan", "pilihan_dokumen", atau nama lain).
 
Contoh kalau ada dokumen yang dipilih:
{"items": [{"label": "..."}, {"label": "..."}]}
 
Contoh kalau tidak ada dokumen yang diperlukan:
{"items": []}
 
JANGAN gunakan Markdown
JANGAN gunakan code fence seperti ```json.
JANGAN menambahkan teks sebelum atau sesudah objek JSON.
JANGAN menambahkan field lain selain "items" dan "label"
"""


_FALLBACK_RECOMMENDATION_TEXT = (
    "LLM gagal menghasilkan rekomendasi yang valid untuk subbab ini. "
    'Klik "Rekomendasikan Ulang" untuk mencoba lagi.'
)


# Distinct from _FALLBACK_RECOMMENDATION_TEXT (Dimas): the LLM succeeded and concluded no document is needed.
_NO_DOCUMENT_NEEDED_TEXT = (
    "Tidak ada dokumen pendukung yang diperlukan untuk subbab ini -- "
    "bagian ini dapat ditulis langsung dari analisis/narasi tanpa bukti dokumen tambahan."
)


# ponytail: kontrak JSON di level API (OpenRouter `response_format`) untuk
# tahap-tahap yang keluarannya WAJIB satu objek JSON. Prompt-nya sudah
# melarang teks di luar JSON, tapi deepseek-v4-flash tetap sering menjawab
# narasi bertahap lalu menutup dengan `{"items":[]}` -- parser mengambil JSON
# terakhir itu, hasilnya nol item padahal narasinya menyebut dokumen yang
# benar. `strict` + `additionalProperties:false` menutup celah itu.
_ITEMS_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "rekomendasi_dokumen",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["recommendation_text", "items"],
            "properties": {
                "recommendation_text": {"type": "string"},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["no", "label", "reason"],
                        "properties": {
                            "no": {"type": "integer"},
                            "label": {"type": "string"},
                            "reason": {"type": "string"},
                        },
                    },
                },
            },
        },
    },
}


def _build_assess_and_recommend_prompt(
    judul_bab: str,
    pedoman: list[dict],
    lkps_tables: list[dict],
    needs_lkps: bool,
) -> str:
    """Port of Dimas 140d8ae's build_assess_and_recommend_prompt (TUGAS -> LKPS -> PEDOMAN -> SYSTEM -> KONTEKS -> KATALOG); no rubric block.
    Platform: numbered catalog + {no,label,reason} output contract (#11)."""
    from document_catalog import catalog_for_prompt  # ponytail: tidak dipakai lagi (daftar datar)
    from document_catalog_kategori import catalog_lines_for_prompt

    parts = [
        "TUGAS (SESUAIKAN FORMAT OUTPUT: tanpa kalimat pengantar, bridging sentence, atau pengulangan konteks.): \n",
        f"- Anda Wajib Pilih dokumen yang benar-benar secara langsung diperlukan untuk memenuhi kebutuhan informasi PEDOMAN pada {judul_bab}\n",
    ]
    if needs_lkps:
        parts.append(f"- PEDOMAN pada {judul_bab} mewajibkan anda mencari KATALOG sebagai bukti pendukung data LKPS berikut :")
        for i, t in enumerate(lkps_tables, 1):
            parts += [f"\n[{i}] {t['text']}", ""]
    else:
        parts.append("Untuk SECTION ini tidak perlu ada LKPS \n")

    parts.append("PEDOMAN PENULISAN:")
    for p in pedoman:
        parts.append(f"- {p.get('content_text') or ''}")
    # parts += [_SYSTEM_ASSESS_AND_RECOMMEND, f"\n {_KONTEKS_PROMPT} \n"]
    parts += [_SYSTEM_ASSESS_AND_RECOMMEND, f"\n {_KONTEKS_PROMPT} \n"]


    # Format SATU baris per entri, diapit kutip -- supaya LLM tahu batas persis teks label yg harus disalin ulang.
    parts.append("KATALOG (closed set, pilih HANYA dari daftar ini):")
    parts.append('Format tiap baris: "LABEL LENGKAP"')
    parts.append("")
    # ponytail: dulu daftar datar -- `for label in catalog_for_prompt(): parts.append(f'"{label}"')`.
    # Kini dikelompokkan per bidang LED ([Kategori] lalu labelnya) supaya lebih mudah dicari.
    parts.append("Dokumen dikelompokkan per bidang LED dalam [kurung siku]. Salin PERSIS satu baris dokumen (nama beserta uraian setelah koma, tanpa tanda kutip), bukan nama kategori.")
    parts.append("")
    parts += catalog_lines_for_prompt()
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

_SYSTEM_SUGGEST_CUSTOM_DOCUMENT = """
TUGAS ANDA SEKARANG:

Berdasarkan SECTION dan PEDOMAN, tentukan apakah diperlukan dokumen pendukung tambahan yang belum tersedia dalam KATALOG.

Tujuan utama Anda bukan mencari sebanyak mungkin dokumen, tetapi menemukan kebutuhan dokumen yang benar-benar belum dapat dipenuhi oleh KATALOG.

MEKANISME PEMILIHAN:
1. Identifikasi terlebih dahulu informasi atau bukti yang diperlukan oleh PEDOMAN untuk SECTION.
2. Periksa seluruh KATALOG dan tentukan apakah kebutuhan tersebut sudah dapat dipenuhi oleh dokumen yang tersedia.
3. Jika terdapat dokumen yang relevan dan dapat memenuhi kebutuhan tersebut, JANGAN mengusulkan dokumen baru.
4. Jika terdapat dokumen yang hanya sebagian memenuhi kebutuhan PEDOMAN, tetapi masih terdapat kebutuhan bukti yang belum tercakup, usulkan hanya dokumen tambahan yang diperlukan untuk menutup kekurangan tersebut.
5. Jika tidak terdapat dokumen yang dapat memenuhi kebutuhan PEDOMAN, dan PEDOMAN memang membutuhkan bukti atau dokumen formal, usulkan dokumen yang paling tepat.
6. Jika SECTION tidak membutuhkan dokumen formal dan dapat dijelaskan melalui narasi, analisis, atau data yang tersedia, kembalikan: {"items": []}

KRITERIA DOKUMEN YANG BOLEH DIUSULKAN:
- PEDOMAN secara eksplisit atau secara logis membutuhkan dasar kebijakan, bukti penetapan, bukti pelaksanaan, bukti capaian, bukti evaluasi, atau bukti tindak lanjut yang idealnya dituangkan dalam dokumen formal.
- Dokumen tersebut belum tersedia dalam KATALOG.
- Tidak terdapat dokumen lain dalam KATALOG yang substansinya setara dan dapat memenuhi kebutuhan tersebut.
- Dokumen yang diusulkan merupakan jenis dokumen yang lazim digunakan dalam tata kelola perguruan tinggi di Indonesia.
- Jangan mengusulkan dokumen hanya karena dokumen tersebut berhubungan secara umum dengan SECTION.
- Jangan mengusulkan dokumen hanya untuk melengkapi jumlah rekomendasi.

OUTPUT HARUS JSON VALID SAJA (reason WAJIB: kenapa dokumen ini diperlukan DAN kenapa tidak ada padanan di KATALOG):
{
  "items": [{"label": "<nama dokumen yang diusulkan>", "reason": "<1-2 kalimat>"}]
}"""


def _build_suggest_custom_document_prompt(judul_bab: str, pedoman: list[dict]) -> str:
    """Port of Dimas 140d8ae's build_suggest_custom_document_prompt (SYSTEM -> KONTEKS -> PEDOMAN -> SECTION -> KATALOG); no rubric block.
    Dipanggil _handle_rekomendasi_dokumen HANYA sbg fallback -- lihat catatan di atas."""
    from document_catalog import catalog_for_prompt  # ponytail: tidak dipakai lagi (daftar datar)
    from document_catalog_kategori import catalog_lines_for_prompt

    parts = [_SYSTEM_SUGGEST_CUSTOM_DOCUMENT, "", f"\n {_KONTEKS_PROMPT} \n", "PEDOMAN PENULISAN:"]
    parts += [f"- {p.get('content_text') or ''}" for p in pedoman]
    parts += [f"SECTION: {judul_bab}", "", "KATALOG (dokumen yang SUDAH tersedia, jangan usulkan ulang):"]
    # ponytail: dulu `[f"- {label}" for label in catalog_for_prompt()]` (datar); kini per kategori.
    parts += catalog_lines_for_prompt(quote=False)
    parts += ["", "Output HANYA JSON:"]
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
  }
}"""


def _build_judge_prompt(judul_bab: str, draft_text: str, facts: list[dict]) -> str:
    """Port of Dimas 140d8ae's build_judge_prompt -- no rubric grounding block, matches his SECTION+ANSWER+RETRIEVED CONTEXTS shape."""
    parts = [
        _SYSTEM_JUDGE, "",
        "## QUESTION / SECTION:", judul_bab, "",
        "## ANSWER (draft narasi yang dievaluasi):", draft_text, "",
    ]
    if facts:
        parts.append("## RETRIEVED CONTEXTS (yang dikirim ke LLM saat synthesis):")
        for i, c in enumerate(facts[:8], 1):
            parts.append(f"\n[{i}] FILE: {c.get('filename') or '?'}\n{c.get('text') or ''}")
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


_RAGAS_JUDGE_KEYS = ("faithfulness", "answer_relevancy", "context_precision", "context_recall")
# Hasil library RAGAS (eval.ragas_eval.score_single_sample) tidak punya context_recall -- metrik itu
# butuh jawaban acuan yang tidak dimiliki narasi LED. Tiga metrik ini wajib; recall ikut hanya bila ada
# (jalur LLM-judge lama).
_RAGAS_WAJIB_KEYS = ("faithfulness", "answer_relevancy", "context_precision")


def _judge_to_ragas_metrics(judge_result: dict) -> dict[str, dict]:
    """Reshapes judge output into writing_ragas_scores.metrics's JSON shape
    ({metric: {nilai, alasan}}) for the "Skor" tab (create_ragas_score below)
    -- all-or-nothing: skips entirely on judge error or a missing/non-numeric
    metric, same discipline the old library-based ragas_scores had."""
    if "error" in judge_result:
        return {}
    reasoning = judge_result.get("reasoning") or {}
    metrics: dict[str, dict] = {}
    for key in _RAGAS_JUDGE_KEYS:
        value = judge_result.get(key)
        if not isinstance(value, (int, float)):
            if key in _RAGAS_WAJIB_KEYS:
                return {}
            continue  # context_recall opsional
        metrics[key] = {"nilai": float(value), "alasan": reasoning.get(key) or ""}
    return metrics


def _reference_recall(pedoman: list[dict], checklist: list[str]) -> str:
    """Jawaban acuan untuk context_recall: apa yang SEHARUSNYA dicakup konteks -- badan pedoman
    section (tanpa baris breadcrumb judul) + butir checklist pencarian fakta. Narasi LED tidak punya
    ground truth buatan ahli; recall di sini berarti "seberapa banyak kebutuhan informasi section ini
    bisa ditelusuri ke potongan sumber yang diambil"."""
    baris: list[str] = []
    for p in pedoman:
        teks = (p.get("content_text") or "").strip()
        isi = teks.split("\n\n", 1)[1] if "\n\n" in teks else teks
        if isi.strip():
            baris.append(isi.strip())
    for butir in checklist or []:
        butir = str(butir).strip().lstrip("-*0123456789. ").strip()
        if butir:
            baris.append(butir if butir.endswith((".", "?")) else butir + ".")
    return "\n".join(baris)


def _score_section_with_ragas(question: str, answer: str, facts: list[dict], reference: str = "") -> dict:
    """Skor writing memakai library RAGAS asli (eval.ragas_eval.score_single_sample): faithfulness,
    answer_relevancy, context_precision (tanpa reference). Mengembalikan bentuk yang sama dengan
    hasil LLM-judge supaya hilirnya (`_judge_to_ragas_metrics`, penyimpanan, UI) tidak berubah;
    `{"error": ...}` bila gagal -- tidak pernah mengarang angka."""
    from eval.ragas_eval import score_single_sample

    batas = int(os.environ.get("RAGAS_MAX_CONTEXTS", "8"))
    contexts = [c.get("text") or "" for c in facts[:batas] if (c.get("text") or "").strip()]
    if not contexts:
        return {"error": "RAGAS: tidak ada konteks yang diambil untuk dinilai"}
    if not (answer or "").strip():
        return {"error": "RAGAS: narasi kosong"}
    skor = score_single_sample(question, answer, contexts, reference=reference or None)
    # context_recall wajib hanya bila acuannya ada (kalau acuan kosong metrik itu memang tidak dihitung).
    wajib = _RAGAS_WAJIB_KEYS + (("context_recall",) if (reference or "").strip() else ())
    if any(not isinstance(skor.get(k), (int, float)) for k in wajib):
        return {"error": f"RAGAS: metrik tidak lengkap ({sorted(skor)})"}
    return {**{k: float(skor[k]) for k in wajib}, "reasoning": {}, "engine": "ragas"}


# Tugas penilaian RAGAS susulan yang sedang berjalan (referensi kuat) + pembatas paralelisme.
_TUGAS_RAGAS: set = set()
_SEM_RAGAS: "asyncio.Semaphore | None" = None


async def _nilai_ragas_susulan(
    tenant_id: str, bab_id: str, draft_id: str, run_id: str, section_id: str,
    question: str, answer: str, facts: list[dict], reference: str = "",
) -> None:
    """Hitung skor RAGAS SETELAH generate selesai, lalu tulis ke GenerationRun (menggantikan penanda
    `pending`) dan buat skor bab. Tidak pernah melempar: kegagalan dicatat sebagai {"error": ...}
    di judge_result supaya UI tidak menunggu selamanya.

    Berjalan di proses worker yang sama; bila worker mati di tengah jalan penandanya tetap `pending`
    -- UI menganggap `pending` yang lebih tua dari batas waktu sebagai penilaian yang tidak selesai."""
    from db.generation_client import (
        create_ragas_score,
        get_latest_section_judges,
        update_generation_run_judge,
    )

    global _SEM_RAGAS
    if _SEM_RAGAS is None:
        _SEM_RAGAS = asyncio.Semaphore(int(os.environ.get("RAGAS_BACKGROUND_CONCURRENCY", "1")))
    async with _SEM_RAGAS:
        try:
            hasil = await asyncio.to_thread(_score_section_with_ragas, question, answer, facts, reference)
        except Exception as e:
            logger.exception("RAGAS susulan gagal untuk section %s", section_id)
            hasil = {"error": _err_msg(e), "engine": "ragas"}
        try:
            update_generation_run_judge(tenant_id, run_id, hasil)
            bab_ragas = _mean_ragas_metrics(
                [_judge_to_ragas_metrics(j) for j in get_latest_section_judges(tenant_id, bab_id)]
            )
            if bab_ragas:
                create_ragas_score(tenant_id, bab_id, draft_id, bab_ragas, jumlah_chunk=len(facts))
            logger.info("RAGAS susulan selesai: section=%s run=%s hasil=%s", section_id, run_id,
                        "error" if "error" in hasil else "ok")
        except Exception:
            logger.exception("Gagal menyimpan skor RAGAS susulan untuk run %s", run_id)


def _mean_ragas_metrics(per_section: list[dict[str, dict]]) -> dict[str, dict]:
    """Average each metric over the sections that have a complete judge score."""
    scored = [m for m in per_section if m]
    if not scored:
        return {}
    return {
        key: {
            "nilai": sum(m[key]["nilai"] for m in scored) / len(scored),
            "alasan": scored[-1][key]["alasan"] if len(scored) == 1 else f"Rata-rata {len(scored)} section.",
        }
        for key in scored[0]
    }


# Cross-check status rekomendasi dokumen -- port of Dimas 140d8ae's ATURAN, status 0/1/2 kept as dev-v1's existing string enum (no schema change).

_SYSTEM_CROSS_CHECK_DOCUMENT_STATUS = f"""
TUGAS (jangan berikan meta-commentary atau meta-response):
Periksa SETIAP dokumen dalam DAFTAR REKOMENDASI berdasarkan PEDOMAN, NARASI, POTONGAN RAG, dan FILE YANG DICENTANG USER.

Tujuan:
- menentukan apakah kebutuhan dokumen sudah terpenuhi;
- menentukan apakah dokumen benar-benar digunakan;
- menentukan apakah dokumen memang tidak diperlukan;
- menemukan kebutuhan dokumen baru jika PEDOMAN belum terpenuhi.

STATUS:
0 = DIREKOMENDASIKAN / BELUM TERBUKTI DIGUNAKAN
1 = DIGUNAKAN / DILAMPIRKAN
2 = TIDAK DIPERLUKAN

ATURAN:

1. Status 1 dan 2 FINAL. Jangan mengubahnya.
   Hanya status 0 yang boleh berubah.

2. CEK PEMENUHAN DOKUMEN:
   - Cocokkan SETIAP rekomendasi dengan FILE YANG DICENTANG USER.
   - Label rekomendasi adalah DESKRIPSI KEBUTUHAN, bukan nama file yang harus sama persis.

   Dokumen dianggap SUDAH TERSEDIA jika terdapat file yang secara
   substansi memenuhi kebutuhan rekomendasi, meskipun nama file berbeda.

   Gunakan:
   - nama file;
   - judul dokumen;
   - nomor dokumen;
   - tahun/periode;
   - jenis dokumen;
   - identitas institusi;
   - POTONGAN RAG;
   - NARASI.

3. JIKA REKOMENDASI SUDAH TERPENUHI OLEH FILE YANG DICENTANG USER: 
    - JANGAN memberikan status 2.

4. STATUS 0 → 1:
   Berikan 1 Jika dokumen tersebut dipilih atau digunakan dalam NARASI.

5. STATUS 0 → 2:
   Hanya jika PEDOMAN menunjukkan bahwa kebutuhan dokumen tersebut memang tidak diperlukan.

   Jangan memberikan 2 hanya karena:
   - belum dikutip;
   - belum muncul di RAG;
   - belum digunakan;
   - narasi sudah lengkap;
   - terdapat sumber lain.

6. Jika kebutuhan PEDOMAN masih relevan tetapi dokumen belum tersedia → tetap 0.

7. Jika kebutuhan informasi dari PEDOMAN belum disampaikan dalam NARASI dan belum didukung dokumen yang tersedia, tambahkan dokumen baru dengan status 0.

8. Semua LABEL dokumen yang sudah ada harus SAMA PERSIS dengan DAFTAR REKOMENDASI. Jangan mengubah atau menghapusnya.

9. Jika daftar rekomendasi kosong dan tidak ada kebutuhan baru:
   {{"items": []}}

PRINSIP:
- SUDAH TERSEDIA ≠ SUDAH DIGUNAKAN
- BELUM DIGUNAKAN ≠ TIDAK DIPERLUKAN
- SUDAH TERSEDIA → TIDAK BOLEH STATUS 2
- Kecocokan dokumen berdasarkan SUBSTANSI, bukan hanya kecocokan nama.

OUTPUT:
Hanya JSON valid:
{{
  "items": [
    {{"label": "", "status": 0}},
    {{"label": "", "status": 1}},
    {{"label": "", "status": 2}}
  ]
}}
"""


_CROSS_CHECK_STATUS = {0: "DIREKOMENDASIKAN", 1: "DIGUNAKAN", 2: "TIDAK_DIPERLUKAN"}
_CROSS_CHECK_STATUS_NUM = {v: k for k, v in _CROSS_CHECK_STATUS.items()}


def _cross_check_status(v) -> str | None:
    """LLM output 0/1/2 (dimas contract) -> DB enum; also tolerates "1" and the enum names."""
    if isinstance(v, str):
        v = v.strip()
        v = int(v) if v.isdigit() else _CROSS_CHECK_STATUS_NUM.get(v)
    return _CROSS_CHECK_STATUS.get(v)


def _build_cross_check_prompt(
    judul_bab: str, pedoman: list[dict], compiled_markdown: str,
    used_sources: list[dict], existing_items: list[dict],
    selected_document_names: list[str] | None = None,
    institution_context: dict | None = None,
) -> str:
    parts = [_SYSTEM_CROSS_CHECK_DOCUMENT_STATUS, ""]
    if institution_context:
        if institution_context.get("university_name"):
            parts.append(f"Institusi: {institution_context['university_name']}")
        if institution_context.get("study_program_name"):
            parts.append(f"Program Studi: {institution_context['study_program_name']}")
        parts.append("")
    parts += [f"## SECTION: {judul_bab}", ""]
    if pedoman:
        parts.append("## PEDOMAN PENULISAN:")
        for p in pedoman:
            parts.append(f"- {p.get('content_text') or ''}")
        parts.append("")
    parts.append("## NARASI:")
    parts.append(compiled_markdown)
    parts.append("")
    if used_sources:
        parts.append("## POTONGAN RAG YANG DIPAKAI:")
        for src in used_sources:
            parts.append(f"[{src.get('filename') or '?'}]")
            if src.get("text"):
                parts.append(src["text"])
            parts.append("")
    if selected_document_names:
        parts.append("## FILE YANG DICENTANG USER:")
        for name in selected_document_names:
            parts.append(f"- {name}")
        parts.append("")
    parts.append("## DAFTAR REKOMENDASI DOKUMEN:")
    for it in existing_items:
        parts.append(f"- {it['label']} (status saat ini: {_CROSS_CHECK_STATUS_NUM[it['status']]})")
    parts.append("")
    parts.append("Output HANYA JSON.")
    return "\n".join(parts)


def _parse_cross_check_json(raw: str) -> dict:
    raw = _strip_think(raw)
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    return {}


async def _cross_check_recommendation_items(
    tenant_id: str, recommendation_id: str, judul_bab: str,
    pedoman: list[dict], compiled_markdown: str, used_sources: list[dict],
    selected_document_names: list[str] | None = None,
    institution_context: dict | None = None,
) -> None:
    """Fire-and-forget: never raises, called after a section's narrative is
    persisted so a failure here can't undo a successful GENERATED section."""
    from db.generation_client import (
        delete_recommendation_item,
        get_recommendation_items,
        insert_recommendation_items,
        update_recommendation_item_status,
    )
    from llm.chat_model import CROSS_CHECK, build_plain_llm, no_think

    try:
        items = get_recommendation_items(tenant_id, recommendation_id)
        if not items:
            return

        llm = build_plain_llm(CROSS_CHECK)
        raw = await llm.ainvoke(no_think(
            _build_cross_check_prompt(
                judul_bab, pedoman, compiled_markdown, used_sources, items, selected_document_names,
                institution_context,
            )
        ))
        data = _parse_cross_check_json(raw.content)
        proposed = data.get("items") if isinstance(data, dict) else None
        if not isinstance(proposed, list):
            return

        # Port of Dimas (_apply_document_status_updates): case-insensitive label match; "tidak diperlukan"
        # deletes the row; an unknown label is inserted as a fresh recommendation (status 0).
        by_label = {it["label"].strip().casefold(): it for it in items}
        next_order = max((it["order"] for it in items), default=-1) + 1
        new_items: list[dict] = []
        for p in proposed:
            if not isinstance(p, dict):
                continue
            label = (p.get("label") or "").strip()
            status = _cross_check_status(p.get("status"))
            if not label or status is None:
                continue
            existing = by_label.get(label.casefold())
            if existing is None:
                if status != "TIDAK_DIPERLUKAN":
                    new_items.append({"label": label, "reason": None})
                    by_label[label.casefold()] = {"status": "DIREKOMENDASIKAN"}  # no duplicate inserts
                continue
            if existing["status"] != "DIREKOMENDASIKAN":
                continue  # DIGUNAKAN / TIDAK_DIPERLUKAN are final (rule 1 of the cross-check prompt)
            if status == "DIGUNAKAN":
                update_recommendation_item_status(tenant_id, existing["id"], status)
            elif status == "TIDAK_DIPERLUKAN":
                delete_recommendation_item(tenant_id, existing["id"])

        if new_items:
            insert_recommendation_items(tenant_id, recommendation_id, new_items, next_order)
    except Exception:
        logger.exception("Cross-check rekomendasi dokumen gagal untuk recommendation %s", recommendation_id)


# ──────────────────────────────────────────────────────────────────────
# Outline generation (GENERASI_OUTLINE_BAB) — TIDAK ADA LLM di sini.
# Section-nya disalin LANGSUNG dari struktur PANDUAN_LAM yang sudah
# dikonfirmasi user (ChapterTemplate/SubBabTemplate, lihat
# api/routes/structure.py) -- bekas panggilan LLM + kelompok-kriteria +
# ChapterOutlineCache dihapus atas permintaan user, menyamai arsitektur
# dimas commit 57a55b0 (outline.py::get_sections_for_dokumen baca langsung
# dari panduan_detail yang sudah dikonfirmasi, tanpa sintesis/LLM lagi).
# ──────────────────────────────────────────────────────────────────────


async def _handle_generasi_outline_bab(job) -> dict:
    """Daftar ChapterSection (status PENDING) untuk satu bab, disalin apa
    adanya dari SubBabTemplate bab ini (get_chapter_template_subbab) --
    tidak ada lagi sintesis LLM atau syarat align-ke-kelompok-kriteria,
    struktur yang sudah dikonfirmasi user DI ChapterTemplate/SubBabTemplate
    itulah outline-nya. Error (bukan fallback diam-diam) kalau bab ini belum
    punya struktur resmi sama sekali -- user harus unggah+konfirmasi Panduan
    Penulisan set ini dulu. Menolak menimpa outline yang sudah ada kecuali
    payload `overwrite=true` (lihat db/generation_client.py::create_chapter_sections)."""
    from db.generation_client import create_chapter_sections, get_bab_dokumen, get_chapter_template_subbab

    payload = job.data
    bab_id = payload["babDokumenId"]
    overwrite = bool(payload.get("overwrite"))

    bab = get_bab_dokumen(bab_id)
    if bab is None:
        return {"status": "error", "error": f"BabDokumen {bab_id} tidak ditemukan"}

    struktur = get_chapter_template_subbab(bab["tenant_id"], bab.get("guide_id"), bab["chapter_order"])
    if not struktur:
        return {
            "status": "error",
            "error": (
                "Belum ada struktur bab resmi dari Panduan Penulisan untuk bab ini -- "
                "pilih atau unggah dan konfirmasi Panduan Penulisan di Instrumen Akreditasi dulu."
            ),
        }

    def to_section(s: dict) -> dict:
        # Any depth, like dimas's sections (every Panduan node is a section).
        return {
            "title": s["title"],
            "marker": s.get("marker"),
            "guidance": s["guidance"],
            "lkps_needed": s.get("lkps_needed"),
            "lkps_list": s.get("lkps_list") or [],
            "subseksi": [to_section(anak) for anak in s.get("children") or []],
        }

    sections = [to_section(s) for s in struktur]

    try:
        created = create_chapter_sections(bab["tenant_id"], bab_id, sections, overwrite=overwrite)
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    return {"status": "completed", "sectionCount": len(created)}


def _compile_chapter_from_sections(sections: list[dict]) -> tuple[str, dict]:
    """Gabung section GENERATED jadi (teks polos, ProseMirror doc), disusuri sebagai pohon (h2 top-level, tiap tingkat +1, maks h6), bukan order global."""
    anak_dari: dict[str, list[dict]] = {}
    for s in sections:
        if s.get("parent_id"):
            anak_dari.setdefault(s["parent_id"], []).append(s)

    texts: list[str] = []
    nodes: list[dict] = []

    def tulis(s: dict, level: int) -> None:
        if s["status"] == "GENERATED" and s.get("content"):
            judul = _full_title(s)
            texts.append(f"{'#' * level} {judul}" + "\n\n" + content_to_text(s["content"]))
            nodes.append({"type": "heading", "attrs": {"level": level}, "content": [{"type": "text", "text": judul}]})
            nodes.extend(content_to_nodes(s["content"]))
        for anak in anak_dari.get(s["id"], []):
            tulis(anak, min(level + 1, 6))

    for s in sections:
        if not s.get("parent_id"):
            tulis(s, 2)

    return "\n\n".join(texts), {"type": "doc", "content": nodes or [{"type": "paragraph"}]}


_SYSTEM_GENERATE = f"""
 
ATURAN:
1. BATASAN DAN SUBSTANSI
   - PEDOMAN menentukan seluruh isi yang wajib dibahas.
   - Evidence/LKPS adalah satu-satunya sumber FAKTA: angka, nama, dokumen, program, kebijakan, tahun, dan kondisi.
   - Jangan menulis sebab, risiko, dampak masa depan, atau prediksi yang tidak tertulis di Evidence/LKPS, misalnya "berpotensi menurunkan", "dapat menyebabkan masalah", "perlu mengantisipasi", "menjadi kendala", atau "berisiko".
   - Perubahan angka yang menurun, tidak merata, atau berada di bawah kategori lain BOLEH ditulis sebagai fakta netral dengan kata deskriptif (menurun, lebih rendah, tidak merata), tanpa menyebut penyebab dan tanpa menilai.
   - Setiap paragraf wajib memiliki minimal 4 kalimat atau setara dengan lebih dari 130 kata yang mencakup pernyataan, fakta bersitasi, analisis, dan implikasi.
   - Jangan menyebut nama atau identitas seperti nomor induk (NIP, NRP, NIK, NIM) seseorang dalam narasi.
   - Kompetensi, kualifikasi, sertifikasi, jabatan, bidang keahlian, dan capaian individu boleh disebut tanpa nama atau identitas nomor induk.
 
2. SITASI SUMBER
    - Setiap fakta yang berasal dari Evidence atau DATA LKPS WAJIB memiliki sitasi pada akhir kalimat.
    - Gunakan nilai SUMBER persis seperti tertulis. Jangan menggunakan nama file, judul dokumen, atau teks lain dari KONTEN sebagai sitasi.
 
3. ALUR NARASI
   - Ikuti urutan substansi PEDOMAN, bukan urutan sumber.
   - Selesaikan satu topik sebelum berpindah ke topik berikutnya.
   - Jangan berpola TOPIK A → TOPIK B → kembali ke TOPIK A.
   - Jangan mengulang informasi karena berasal dari sumber berbeda.
   - Jika tersedia informasi dari beberapa periode untuk topik yang sama, jangan mendaftar per tahun. Bahas sebagai tren: nilai awal, nilai akhir, besar dan arah perubahan, serta kesinambungannya.
   - Jika terdapat poin atau tabel, jelaskan atau analisis isinya.
 
4. PERISTIWA
   Jangan menjadikan nama seseorang, nomor induk (NIP, NRP, NIM, dan lain lain), rapat, sidang, kegiatan, sosialisasi, penandatanganan, penyusunan, penerbitan, penetapan, pengesahan, tanggal, tempat, pihak yang hadir, atau kronologi sebagai isi narasi.
 
   Prinsip: PERISTIWA = ABAIKAN; SUBSTANSI = GUNAKAN.
 
5. KHUSUS SECTION = KEBIJAKAN, INI WAJIB
   Terapkan aturan ini hanya jika SECTION memang KEBIJAKAN.
   Jangan menganggap SECTION sebagai KEBIJAKAN hanya karena sumber
   berupa atau mengandung peraturan/kebijakan.
 
   Struktur WAJIB:
   a. Satu paragraf pembukaan yang menjelaskan cakupan kebijakan yang relevan dengan PEDOMAN.
   b. Setiap dokumen kebijakan yang relevan ditulis dalam satu bullet.
      Bullet harus memuat identitas dokumen, nama dokumen, dan substansi dokumen yang relevan dengan PEDOMAN.
   c. Setelah seluruh bullet, tulis dua paragraf untuk analisa yang menghubungkan kebijakan-kebijakan tersebut dengan substansi PEDOMAN.
 
   Jangan menampilkan placeholder, tanda kurung siku, format template, atau simbol yang digunakan hanya sebagai penanda struktur.
 
   SATUAN BULLET:
   Satu bullet mewakili satu jenis dokumen, bukan satu file. Dua atau lebih file dianggap satu jenis dokumen apabila subjek utamanya sama, penerbitnya setingkat, dan perbedaannya hanya pada periode, tahun, versi, nomor, atau revisi.
 
    Untuk jenis dokumen yang tersedia dalam beberapa periode:
    - tulis satu bullet;
    - sebutkan seluruh periode yang tersedia dalam bullet itu;
    - jelaskan isi berdasarkan versi terbaru;
    - sebutkan perubahan antarperiode hanya apabila PEDOMAN pada SECTION meminta perubahan perkembangan, atau kesinambungan;
    - cantumkan semua file sebagai sumber pada bullet yang sama.
 
    Jangan membuat bullet terpisah hanya karena tersedia file dari periode lain.
 
6. FAKTA DAN ANALISIS
   - FAKTA adalah angka, nama, dokumen, program, kebijakan, tahun, dan kondisi yang tertulis di Evidence/LKPS. Fakta bersitasi.
   - ANALISIS adalah hasil membandingkan, menghitung, atau menghubungkan fakta: rasio, komposisi, tren, sebaran, keterkaitan antartopik, dan makna bagi PS. Paragraf yang hanya mendaftar fakta belum memenuhi tugas.
   - Setiap paragraf yang memuat data angka wajib memuat minimal satu analisis kuantitatif (aturan 7) dan satu kalimat implikasi yang menjelaskan makna analisis itu bagi substansi PEDOMAN.
   - Kalimat analisis yang hanya menafsirkan angka yang sudah disebut dan sudah bersitasi boleh ditulis tanpa sitasi. Kalimat yang memuat angka baru hasil hitungan tetap wajib bersitasi (aturan 7).
   - Analisis tidak boleh memuat nama, atau nomor induk mahasiswa, dosen atau civitas akademika.
   - Jika kebutuhan PEDOMAN tidak didukung Evidence/LKPS, jangan mengarang atau menggantinya dengan pengetahuan umum.
 
7. ANALISIS KUANTITATIF
   Terapkan pada data angka yang relevan dengan PEDOMAN. Pilih teknik sesuai bentuk data, dan utamakan analisis yang paling bermakna, paling banyak tiga per paragraf.
 
   TEKNIK:
   a. TREN, untuk data dua periode atau lebih (TS-2, TS-1, TS): sebut nilai periode awal dan akhir, selisih absolut, persentase perubahan, dan arah (naik, turun, stabil, berfluktuasi). Bila nilai awal 0, tulis "dari 0 menjadi X" tanpa persentase.
   b. KOMPOSISI, untuk data berkategori (sumber dana, tingkat, jenis publikasi, jabatan, jenjang): sebut persentase tiap kategori terhadap totalnya bersama jumlah absolutnya, kategori dominan, dan kategori terkecil.
   c. RASIO, untuk dua besaran yang bermakna bila dibandingkan (mahasiswa per dosen, luaran per dosen, dana per judul, lulusan terlacak per lulusan): tulis besaran pembilang dan penyebut dalam kalimat, lalu hasilnya.
   d. SEBARAN, untuk data per unit atau per individu (beban kerja, sitasi, jumlah luaran), hanya dari ANALISIS TERHITUNG: sebut nilai terendah, tertinggi, rata-rata, dan median bila berbeda jauh dari rata-rata, serta berapa unit berada di ujung sebaran. Tulis tanpa nama, misalnya "satu DTPS" atau "tiga DTPS".
   e. PEMBANDING, untuk membandingkan capaian dengan target, standar, atau rata-rata (misalnya RBK): hanya bila pembandingnya tertulis di PEDOMAN, Evidence, atau LKPS. Jangan memakai ambang dari pengetahuan umum.
 
   ATURAN HITUNG:
   - Hanya hitung dari angka yang tertulis. Jika ada blok ANALISIS TERHITUNG, pakai angkanya apa adanya, jangan hitung ulang, dan jangan ubah.
   - Data per individu atau per unit (baris per dosen, per mahasiswa, per judul) tidak boleh Anda jumlahkan sendiri menjadi nilai terendah, tertinggi, rata-rata, median, atau jumlah unit. Angka seperti itu hanya boleh berasal dari ANALISIS TERHITUNG. Jika tidak tersedia, pakai total atau rata-rata yang sudah tertulis di tabel, atau lewati analisis sebaran.
   - Perhitungan yang boleh Anda lakukan sendiri terbatas pada operasi sederhana atas angka yang sudah tertulis: selisih, persentase perubahan, persentase terhadap total yang tertulis, dan rasio dua angka.
   - Bulatkan persentase dan rasio ke satu desimal. Sertakan satuan (sks, orang, judul, Rp). Rupiah ditulis ringkas, misalnya Rp 5,9 miliar.
   - Penyebut 0 atau kosong, sel kosong, dan sel berisi kode galat (seperti #REF!, #NUM!, #DIV/0!) tidak dihitung. Lewati angka itu tanpa menyebut galatnya.
   - Jika dua sumber menyajikan angka berbeda untuk besaran yang sama (misalnya jumlah lulusan), jangan digabung, dirata-rata, atau dibandingkan. Gunakan angka tiap sumber dengan sitasinya masing-masing.
   - Jika total kurang dari 10, utamakan jumlah absolut. Persentase hanya pendamping dan jangan dijadikan dasar kesimpulan tren.
   - Total yang sudah tertulis di tabel dipakai sebagai penyebut. Jangan menjumlah ulang bila total tersedia.
 
   SITASI ANGKA TURUNAN:
   - Kalimat yang memuat angka turunan (persentase, rasio, selisih, rata-rata hasil hitung) wajib bersitasi pada semua sumber angka dasarnya, ditulis dengan format sitasi yang sama dipisah titik koma, misalnya (sumber: A; B).
 
   TAFSIR:
   - Gunakan kata deskriptif netral: meningkat, menurun, stabil, dominan, merata, timpang, terkonsentrasi.
   - Jangan menyebut sebab, risiko, prediksi, atau menilai baik atau buruk, kecuali tertulis di Evidence/LKPS.
 
8. FORMAT
   - Plain text tanpa mengulang judul/SECTION.
   - Pisahkan paragraf dengan satu baris kosong.
   - Pada SECTION KEBIJAKAN, bullet "• " tidak dihitung sebagai paragraf.
 
9. TABEL
   Tabel HANYA dibuat jika TABLE_SCHEMA diberikan.
   Jika tidak diberikan, jangan membuat tabel atau JSON tabel.
 
   Jika diberikan:
   - gunakan persis nama dan urutan kolom;
   - jangan menambah, menghapus, mengubah, atau menggabungkan kolom;
   - isi berdasarkan PEDOMAN, KEBUTUHAN INFORMASI, dan sumber yang tersedia;
   - satu baris = satu entitas/data yang relevan;
   - gabungkan sumber yang saling melengkapi dalam baris yang sama;
   - setiap fakta dalam sel wajib memiliki sitasi;
   - jika tidak tersedia, isi "Tidak tersedia";
   - jangan mengarang berdasarkan nama kolom atau file.
 
10. FORMAT OUTPUT TABEL
   Untuk setiap tabel dalam TABLE_SCHEMA, sisipkan SATU JSON di posisi yang
   sesuai dalam narasi. Tabel tidak boleh menjadi satu-satunya isi SECTION.
 
   {{"table": "ID_TABEL", "rows": [
     {{"NAMA_KOLOM_1": "isi (sumber: ...)", "NAMA_KOLOM_2": "isi"}},
     {{"NAMA_KOLOM_1": "isi (sumber: ...)", "NAMA_KOLOM_2": "isi"}}
   ]}}
 
   - "table" harus sama persis dengan ID_TABEL.
   - Key rows harus sama persis dengan nama kolom.
   - JSON harus valid tanpa komentar atau teks tambahan di dalam blok.
 
PEMERIKSAAN:
1. Seluruh informasi sesuai dengan PEDOMAN dan setiap fakta memiliki sitasi.
2. Setiap paragraf narasi memiliki minimal 4 kalimat; kalimat tanpa sitasi hanya berisi analisis atas fakta yang telah disebut dan tidak memuat angka baru.
3. Tidak ada judul, heading, pengantar, meta-commentary, atau penutup.
4. Tidak ada daftar dokumen atau sumber terpisah.
5. Narasi mengikuti urutan PEDOMAN, tidak mengulang topik, dan tidak menjadikan peristiwa administratif sebagai substansi.
6. Narasi berupa plain text tanpa Markdown atau karakter formatting seperti "*", "|", "{{", "}}", "[", "]", "#", "`", "_", "~", "—", atau "---".
7. Jika TABLE_SCHEMA diberikan, tabel disisipkan sebagai JSON dengan kolom persis sesuai schema, bukan Markdown.
8. Setiap paragraf yang memuat data angka memuat minimal satu analisis (tren, komposisi, rasio, atau sebaran) yang angkanya dapat ditelusuri ke angka sumber, dan data multi-periode tidak didaftar per tahun.
9. Tidak ada nama individu, tidak ada angka dihitung dari sel kosong atau berkode galat, dan tidak ada sebab, risiko, atau prediksi yang tidak tertulis di Evidence/LKPS.
 
FORMAT OUTPUT
- Kalimat pertama langsung berisi substansi SECTION. Jangan membuka dengan "Berdasarkan", "Berikut", "Sesuai pedoman", "Pada section ini", atau kalimat yang merujuk PEDOMAN, SECTION, sumber, atau tugas.
- Tulis sebagai paragraf biasa dipisah satu baris kosong. Tidak ada heading, penomoran, huruf tebal, atau miring.
- Satu-satunya penanda daftar yang boleh dipakai adalah "• " dan hanya pada SECTION KEBIJAKAN.
- Satu-satunya tempat kurung kurawal dan kurung siku adalah blok JSON tabel.
- Akhiri output pada kalimat narasi terakhir atau blok JSON terakhir. Tidak ada penutup, ringkasan, atau catatan.
"""

def _build_section_prompt(
    section_title: str,
    pedoman: list[dict],
    lkps_tables: list[dict],
    evidence_chunks: list[dict] | None = None,
    evidence_labels: dict[str, str] | None = None,
    user_prompt: str | None = None,
    institution_context: dict | None = None,
    table_spec: list[dict] | None = None,
    needs_lkps: bool = False,
) -> str:
    """Verbatim port of Dimas 140d8ae's build_generate_prompt (incl. his typos): TUGAS -> PEDOMAN -> SYSTEM_GENERATE
    -> KONTEKS -> TABLE_SCHEMA -> DATA LKPS -> BUKTI. Platform only: the "(sumber: ...)" format line the web's
    citation hover-card parses, and the user's free-text prompt from the UI."""
    evidence_chunks = evidence_chunks or []
    evidence_labels = evidence_labels or {}
    ic = institution_context or {}
    prodi, univ = ic.get("study_program_name"), ic.get("university_name")

    parts = [
        "TUGAS (jangan berikan meta-commentary atau meta-response ataupun marrkdown style): ",
        f"Tulis narasi Laporan Evaluasi Diri (LED) untuk Program Studi {prodi} pada Perguruan Tinggi {univ} untuk SECTION {section_title}.",
        "Narasi harus memenuhi kebutuhan yang ditetapkan PEDOMAN dan KEBUTUHAN INFORMASI dengan menggunakan fakta yang tersedia pada Evidence dan DATA LKPS minimum 3 paragraf.",
        "",
        "Berikut adalah PEDOMAN yang menjadi panduan penulisan dan batas cakupan (scope) narasi. PEDOMAN menentukan informasi yang perlu dibahas, bukan sumber fakta.",
    ]
    parts += [f"- {p.get('content_text') or ''}" for p in pedoman]
    parts += [
        _SYSTEM_GENERATE,
        '- Format sitasi: "(sumber: NILAI_SUMBER)" di akhir kalimat.',
        "",
        "KONTEKS: ",
        _KONTEKS_PROMPT,
        "",
        "TABLE_SCHEMA:",
    ]
    schema_block = _format_table_schema(table_spec)
    if schema_block:
        parts.append("Selain narasi, anda WAJIB membuat tabel dengan kolom berikut :")
        parts += schema_block
    else:
        parts.append("Jangan tulis JSON / Tabel apapun:")

    if lkps_tables:
        if needs_lkps:
            parts.append("Berikut Data LKPS yang wajib dianalisis sesuai PEDOMAN")
        parts.append("DATA LKPS: \n Hiraukan identitas seprti nama, nomor induk dll, cukup analisis tampa identitas penting")
        # dimas prompts.py: "[SUMBER {label}] {judul}" when the sheet has a title.
        parts += [
            f"[SUMBER {t['sheet']}] {t['judul']}\n{t['text']}" if t.get("judul") else f"[SUMBER {t['sheet']}]\n{t['text']}"
            for t in lkps_tables
        ]
        parts.append("")

    if evidence_chunks:
        parts.append("BUKTI DOKUMEN: \n Hiraukan identitas seprti nama, nomor induk dll, cukup analisis tampa identitas penting")
        for c in evidence_chunks:
            parts.append(f"SUMBER: {_evidence_citation_label(c, evidence_labels)}")
            parts.append(f"KONTEN:\n{c['text']}")
            parts.append("")
        parts.append("")

    if user_prompt:
        parts.append(f"ARAHAN TAMBAHAN DARI PENGGUNA:\n{user_prompt}")

    return "\n".join(parts)


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

    from db.generation_client import (
        clear_section_chat,
        create_bab_draft,
        create_generation_run,
        create_ragas_score,
        create_section_draft_ai,
        get_bab_dokumen,
        get_chapter_section,
        get_chapter_sections,
        get_confirmed_recommendation,
        get_evidence_citation_labels,
        get_latest_section_judges,
        get_rubrik_for_bab,
        get_user_nama,
        link_evidence_to_chapter_and_draft,
        update_bab_dokumen_aktif,
        update_chapter_section,
    )
    from llm.chat_model import CHECKLIST, build_judge_llm, build_plain_llm, no_think
    from vectorstore.pgvector_evidence_store import search_evidence

    payload = job.data
    bab_id = payload["babDokumenId"]
    user_id = payload["createdByUserId"]
    draft_id = payload.get("draftId")
    section_id = payload["sectionId"]

    bab = get_bab_dokumen(bab_id)
    if bab is None:
        return {"status": "error", "error": f"BabDokumen {bab_id} tidak ditemukan"}

    section = get_chapter_section(bab["tenant_id"], section_id)
    if section is None or section["chapter_id"] != bab_id:
        return {"status": "error", "error": f"Section {section_id} tidak ditemukan pada bab {bab_id}"}

    update_chapter_section(bab["tenant_id"], section_id, status="GENERATING")

    # Port of Dimas's 766de26 institution context — lets the checklist and
    # generate prompts know which prodi/university this LED is for, instead
    # of writing fully generic narration.
    institution_context = {
        "study_program_name": bab.get("study_program_name"),
        "university_name": bab.get("university_name"),
    }

    t0 = time.time()

    # 1. Pedoman = teks pedoman SECTION ini sendiri (guidance dari Panduan yang sudah dikonfirmasi),
    # dipakai apa adanya seperti Dimas (generator.py::_get_pedoman_for_section) -- bukan poin per-bab.
    # Rubrik hanya dicatat di GenerationRun (rubric_used), tidak masuk prompt.
    guidance = (section.get("guidance") or "").strip()
    pedoman = [{"point_title": section["title"], "content_text": guidance}] if guidance else []
    prompt_title = _section_prompt_title(section)
    rubric = get_rubrik_for_bab(bab["tenant_id"], bab["chapter_order"], bab.get("accreditation_set_id"))

    llm = build_plain_llm()

    # Bukti Dukung selected via the CONFIRMED recommendation for `draftId`
    # (Dimas's _retrieve_facts: zero selected = zero evidence, no blanket
    # fallback) — resolved before the checklist call so the checklist prompt
    # can use the selected documents' names as a terminology hint (port of
    # Dimas's 332ab2f, see _build_checklist_prompt's selected_document_names).
    # No confirmed draft -> fall back to manual picker's `selectedEvidenceIds`.
    confirmed = get_confirmed_recommendation(bab["tenant_id"], draft_id, section_id) if draft_id else None
    selected_ids: list[str] = (
        (confirmed or {}).get("selected_evidence_ids") or payload.get("selectedEvidenceIds") or []
    )
    # Dimas keeps LKPS out of evidence: it already arrives per sheet via _load_lkps_tables.
    selected_ids = [i for i in selected_ids if i != bab.get("lkps_evidence_id")]
    evidence_labels: dict[str, str] = (
        get_evidence_citation_labels(bab["tenant_id"], selected_ids) if selected_ids else {}
    )

    try:
        # 2. Checklist -- real LLM call (port of SYSTEM_CHECKLIST), scoped to this section's title.
        table_spec = section.get("table_spec")
        checklist_prompt = _build_checklist_prompt(
            prompt_title, pedoman, institution_context,
            list(evidence_labels.values()), table_spec,
        )
        # Retry sekali kalau LLM merespons TAPI parsing-nya kosong (mis. LLM
        # menjawab paragraf/menolak, bukan format "- item") -- sebelumnya
        # kasus ini langsung fallback ke breadcrumb "Poin kunci untuk {title}"
        # yang membingungkan (kelihatan spt query section sungguhan, bukan
        # indikasi checklist gagal). Beda dari retry connection-swap di bawah
        # (stop_after_attempt=6, sudah menangani error KONEKSI/CUDA) -- ini
        # menangani respons SUKSES tapi tidak bisa di-parse (port Dimas 9ae4fad).
        # Kegagalan (checklist tetap kosong setelah 2x) disimpan sebagai
        # `checklist_error` di GenerationRun -- lihat penggunaannya di bawah --
        # sekarang benar-benar sampai ke UI (banner peringatan di panel
        # generate), bukan cuma dicatat ke log server seperti sebelumnya.
        checklist: list[str] = []
        last_checklist_error: str | None = None
        checklist_llm = build_plain_llm(CHECKLIST)
        for attempt in range(2):
            if attempt:
                await asyncio.sleep(2)  # dimas: short pause, no long retry chain
            try:
                # This is the FIRST call the writing model makes in a job -- if
                # the previous job's judge call left a different model resident
                # (VRAM too small to hold both, see worker.py's shared-GPU note),
                # Ollama has to evict+reload here, and that swap has been
                # observed crashing with a CUDA "illegal memory access" on some
                # GPUs almost every time, recovering only after a few retries
                # (the very next call, synthesis, then succeeds immediately
                # since the model is already resident). 3 retries (LangChain's
                # default) usually isn't enough to outlast the swap; 6 gives it
                # more room before falling back to the generic checklist.
                checklist_raw = await checklist_llm.ainvoke(no_think(checklist_prompt))
            except Exception as e:
                last_checklist_error = str(e)
                continue
            checklist = _parse_checklist(checklist_raw.content)
            if checklist:
                break
            last_checklist_error = f"LLM tidak menghasilkan item checklist berformat valid (attempt {attempt + 1})"
        if not checklist:
            logger.warning(
                "Checklist gagal untuk section %s setelah 2x percobaan: %s", section_id, last_checklist_error
            )

        # dimas facts = LKPS + evidence only (no LED retrieval); top-up query = retrieval_query (breadcrumb).
        # 2b. LKPS tables — needs_lkps/lkps_list are this section's OWN
        # precomputed properties (ChapterSection.lkpsNeeded/lkpsList, copied
        # from SubBabTemplate at outline-creation time, see
        # ingestion.panduan_chunker.detect_lkps), not recomputed from
        # `pedoman` text on every call. `checklist` also passed -- RAG
        # fallback per item when needs_lkps is False, lihat docstring
        # _load_lkps_tables. Off the event loop: encode() + query Postgres
        # sama beratnya dengan search_evidence di bawah.
        lkps_tables = await asyncio.to_thread(
            _load_lkps_tables, bab, bool(section.get("lkps_needed")), section.get("lkps_list") or [], checklist,
        )

        # 2c. Bukti Dukung evidence chunks -- port of Dimas 140d8ae's evidence _retrieve_facts.
        evidence_chunks: list[dict] = []
        if selected_ids:
            evidence_queries = checklist  # dimas: empty checklist -> no per-item search, only the top-up below
            hasil_per_item = await asyncio.gather(
                *(asyncio.to_thread(search_evidence, item, bab["tenant_id"], selected_ids, 15) for item in evidence_queries)
            )
            ev_candidates = {
                item: _filter_by_distance(hits, _EVIDENCE_RAG_DISTANCE_MAX)
                for item, hits in zip(evidence_queries, hasil_per_item)
            }
            evidence_chunks = _select_candidates_per_item(evidence_queries, ev_candidates, per_item_target=2)

            if len(evidence_chunks) < 5:  # top-up pakai breadcrumb query, tetap di-scope selected_ids
                seen_chunks = {h["chunk_id"] for h in evidence_chunks}
                topup = await asyncio.to_thread(
                    search_evidence, prompt_title, bab["tenant_id"], selected_ids, 5 - len(evidence_chunks)
                )
                for h in topup:
                    if h["chunk_id"] not in seen_chunks:
                        seen_chunks.add(h["chunk_id"])
                        evidence_chunks.append(h)

        # 3. LLM call, then dimas-format text (paragraphs, "• " bullets, JSON table blocks) -> ProseMirror doc.
        prompt = _build_section_prompt(
            prompt_title, pedoman, lkps_tables,
            evidence_chunks, evidence_labels, payload.get("prompt"), institution_context, table_spec,
            bool(section.get("lkps_needed")),
        )
        try:
            response = await llm.ainvoke(no_think(prompt))
        except Exception as e:
            # Dimas records _synthesis_error and carries on; here the section is marked ERROR and the job ends
            # cleanly -- re-raising would make BullMQ rerun retrieval + checklist + synthesis up to 3x.
            logger.exception("Sintesis section %s gagal", section_id)
            update_chapter_section(bab["tenant_id"], section_id, status="ERROR", error=_err_msg(e))
            return {"status": "error", "error": f"Sintesis gagal: {_err_msg(e)}", "sectionId": section_id}
        markdown_text = _strip_think(response.content) or response.content
        latency_sec = time.time() - t0

        # 4. LLM-as-judge (port of Dimas's SYSTEM_JUDGE, generator.py::_judge) —
        # separate model (llm/chat_model.py::build_judge_llm), degrades to
        # {"error": ...} rather than crashing the job. Also backs the "Skor"
        # tab (writing_ragas_scores) below -- dev-v1 used to run the real
        # `ragas` library live here too, but its internal JSON-format prompts
        # are too strict for local LLMs (frequent RagasOutputParserException
        # noise); Dimas never ran it live either, only offline via
        # scripts/evaluate.py, so that live call is dropped in favor of this
        # judge's own 4 metrics.
        # `citation_label` computed ONCE here (folder-name-preference etc.
        # already applied) and stored verbatim in `chunks_used` below -- backs
        # the citation hover-card (apps/web), which matches a clicked
        # "(sumber: X)" against this field instead of re-deriving it.
        evidence_used = [
            {**c, "citation_label": _evidence_citation_label(c, evidence_labels), "kind": "evidence"}
            for c in evidence_chunks
        ]
        # dimas chunks_used also carries the LKPS sheets (kind "lkps", "LKPS Sheet X") so the section's
        # Referensi tab shows which LKPS data the narrative used.
        lkps_used = [
            {"kind": "lkps", "sheet": t["sheet"], "citation_label": f"LKPS Sheet {t['sheet']}", "text": t["text"]}
            for t in lkps_tables
        ]
        chunks_used = lkps_used + evidence_used
        # dimas facts order: LKPS first, then evidence; LKPS named "LKPS Sheet X" (generator.py::_chunk_citation).
        judge_facts = [{"text": c["text"], "filename": c["citation_label"]} for c in chunks_used]
        section_konten = text_to_doc(markdown_text, table_spec)
        # dimas doc_to_text(draft_text): judge/cross-check read the rendered narrative, not the raw LLM
        # output with its JSON table blocks.
        narasi_teks = content_to_text(section_konten)

        # Dimas order (generator.py generate_chain): synthesize -> cross-check documents -> judge -> save.
        # The chapter text is compiled in memory with this section's fresh content overlaid, because
        # recommendation items are chapter-level and the section is not saved yet.
        overlaid = [
            {**s, "status": "GENERATED", "content": section_konten} if s["id"] == section_id else s
            for s in get_chapter_sections(bab["tenant_id"], bab_id)
        ]
        compiled_markdown, konten = _compile_chapter_from_sections(overlaid)
        # Cross-check rekomendasi dokumen (port of Dimas 190dcd2) -- hanya kalau bab ini datang dari alur
        # rekomendasi->konfirmasi (confirmed tidak None). Tidak pernah menggagalkan job ini.
        if confirmed:
            # Per-section recommendation (dimas): cross-check against this section's own narrative.
            per_section = bool(confirmed.get("chapter_section_id"))
            await _cross_check_recommendation_items(
                bab["tenant_id"], confirmed["id"],
                prompt_title if per_section else bab["chapter_title"], pedoman,
                narasi_teks if per_section else compiled_markdown, judge_facts,
                list(evidence_labels.values()), institution_context,
            )

        # WRITING_EVAL_ENGINE: "ragas" (bawaan) = library RAGAS asli; "llm" = LLM-as-a-judge satu prompt (lama).
        if os.environ.get("WRITING_EVAL_ENGINE", "ragas").lower() == "ragas":
            # RAGAS asli lambat (beberapa menit): TIDAK dijalankan saat generate. Bawaannya penilaian
            # dipicu pengguna lewat tombol di tab Kualitas AI (job PENILAIAN_RAGAS), jadi di sini
            # `judge_result` dibiarkan kosong ("belum dinilai"). WRITING_EVAL_AUTO=1 mengembalikan
            # penilaian otomatis susulan seperti sebelumnya.
            if os.environ.get("WRITING_EVAL_AUTO", "0") == "1":
                judge_result = {
                    "pending": True,
                    "engine": "ragas",
                    "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
            else:
                judge_result = None
        else:
            try:
                judge_llm = build_judge_llm()
                judge_raw = await judge_llm.ainvoke(
                    no_think(_build_judge_prompt(prompt_title, narasi_teks, judge_facts),
                             os.environ.get("JUDGE_OLLAMA_MODEL"))
                )
                judge_result = _parse_judge_json(judge_raw.content)
            except Exception as e:
                logger.exception("Judge LLM gagal untuk section %s, lanjut tanpa skor judge", section_id)
                judge_result = {"error": _err_msg(e)}
        ragas_scores = _judge_to_ragas_metrics(judge_result or {})

        model_name = getattr(llm, "model", getattr(llm, "model_name", "unknown"))
        update_chapter_section(
            bab["tenant_id"], section_id, status="GENERATED", content=section_konten, model=model_name
        )
    except Exception as e:
        logger.exception("Generate section %s gagal", section_id)
        update_chapter_section(bab["tenant_id"], section_id, status="ERROR", error=_err_msg(e))
        raise

    # `konten` (dikompilasi sebelum judge, lihat _compile_chapter_from_sections) = SEMUA section GENERATED
    # bab ini jadi satu checkpoint bab, sama seperti sebelum section ada.
    user_nama = get_user_nama(user_id)
    # dimas: each generate is a new version of THIS section (Draft tab lists it; regenerate never loses
    # the previous narrative) and the old chat turns about the previous text are dropped.
    section_draft = create_section_draft_ai(bab["tenant_id"], section_id, user_id, user_nama, section_konten)
    clear_section_chat(bab["tenant_id"], section_id)
    draft = create_bab_draft(
        bab["tenant_id"],
        bab_id,
        user_id,
        user_nama,
        konten_snapshot=konten,
        referensi_chunk_ids=[c["chunk_id"] for c in chunks_used if c.get("chunk_id")],
    )
    # Records which confirmed Bukti Dukung actually backed this generate —
    # no-op if selected_ids is empty (manual generate, no recommendation).
    link_evidence_to_chapter_and_draft(bab["tenant_id"], bab_id, draft["id"], selected_ids)
    update_bab_dokumen_aktif(bab["tenant_id"], bab_id, konten, draft["id"])
    # Terisi hanya kalau checklist gagal 2x (lihat retry loop di atas) --
    # section ini digenerate TANPA panduan pencarian fakta, dan sekarang
    # disimpan (bukan cuma di-log) supaya UI bisa memperingatkan penggunanya
    # (port dari Dimas's `_checklist_error`, lihat catatan retry loop di atas).
    checklist_error_final = last_checklist_error if not checklist else None
    run = create_generation_run(
        tenant_id=bab["tenant_id"],
        bab_draft_id=draft["id"],
        section_id=section_id,
        model=model_name,
        pedoman_used=pedoman,
        rubric_used=rubric,
        checklist=checklist,
        checklist_error=checklist_error_final,
        chunks_used=chunks_used,
        judge_result=judge_result,
        prompt_full=prompt,
        latency_sec=latency_sec,
        token_count=len(markdown_text.split()),
    )
    if judge_result is None:
        pass  # belum dinilai: menunggu tombol "Nilai kualitas" di tab Kualitas AI
    elif judge_result.get("pending"):
        # Skor RAGAS menyusul: jadwalkan tugas latar; hasilnya menimpa judge_result run ini dan
        # membuat skor bab setelah selesai (UI membaca "pending" sebagai "sedang dinilai").
        tugas = asyncio.create_task(
            _nilai_ragas_susulan(
                bab["tenant_id"], bab_id, draft["id"], run["id"], section_id,
                prompt_title, narasi_teks, judge_facts, _reference_recall(pedoman, checklist),
            )
        )
        _TUGAS_RAGAS.add(tugas)  # referensi kuat: tugas tanpa referensi bisa dibuang GC sebelum selesai
        tugas.add_done_callback(_TUGAS_RAGAS.discard)
    else:
        # Chapter score = mean of every section's latest judge, not just the section generated last.
        bab_ragas = _mean_ragas_metrics(
            [_judge_to_ragas_metrics(j) for j in get_latest_section_judges(bab["tenant_id"], bab_id)]
        )
        if bab_ragas:
            create_ragas_score(bab["tenant_id"], bab_id, draft["id"], bab_ragas, jumlah_chunk=len(judge_facts))

    return {
        "status": "completed",
        "sectionId": section_id,
        "babDraftId": draft["id"],
        "versi": draft["version"],
        "sectionDraftId": section_draft["id"],
        "ragasScores": ragas_scores,
        "judgeResult": judge_result,
        "checklistError": checklist_error_final,
    }


async def _handle_penilaian_ragas(job) -> dict:
    """Penilaian kualitas RAGAS atas SATU section, dipicu pengguna (tombol di tab Kualitas AI).

    Yang dinilai: teks section SAAT INI (termasuk suntingan pengguna) terhadap konteks (chunk) dan
    acuan recall dari generate terakhir section itu. Hasilnya menimpa `judge_result` run tersebut
    (backend sudah menandainya `pending` sebelum job masuk antrean) dan memperbarui skor bab.
    Kegagalan ditulis sebagai {"error": ...} supaya UI tidak menunggu selamanya."""
    from db.generation_client import (
        create_ragas_score,
        get_bab_dokumen,
        get_chapter_section,
        get_latest_generation_run_for_section,
        get_latest_section_judges,
        update_generation_run_judge,
    )

    payload = job.data
    bab_id, section_id = payload["babDokumenId"], payload["sectionId"]
    bab = get_bab_dokumen(bab_id)
    if bab is None:
        return {"status": "error", "error": f"BabDokumen {bab_id} tidak ditemukan"}
    tenant_id = bab["tenant_id"]
    run = get_latest_generation_run_for_section(tenant_id, section_id)
    section = get_chapter_section(tenant_id, section_id)
    if run is None or section is None:
        return {"status": "error", "error": "Section atau generate terakhirnya tidak ditemukan"}

    try:
        teks = content_to_text(section["content"]).strip()
        facts = [c for c in (run["chunks_used"] or []) if isinstance(c, dict) and c.get("kind") != "led"]
        hasil = await asyncio.to_thread(
            _score_section_with_ragas,
            _section_prompt_title(section),
            teks,
            facts,
            _reference_recall(run["guidelines_used"] or [], run["checklist"] or []),
        )
    except Exception as e:
        logger.exception("Penilaian RAGAS gagal untuk section %s", section_id)
        hasil = {"error": _err_msg(e), "engine": "ragas"}

    update_generation_run_judge(tenant_id, run["id"], hasil)
    bab_ragas = _mean_ragas_metrics(
        [_judge_to_ragas_metrics(j) for j in get_latest_section_judges(tenant_id, bab_id)]
    )
    if bab_ragas:
        create_ragas_score(tenant_id, bab_id, run["chapter_draft_id"], bab_ragas, jumlah_chunk=len(facts))
    ok = "error" not in hasil
    logger.info("Penilaian RAGAS %s: section=%s run=%s", "selesai" if ok else "GAGAL", section_id, run["id"])
    return {"status": "completed" if ok else "error", "sectionId": section_id, "runId": run["id"],
            **({} if ok else {"error": hasil["error"]})}


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
        get_bab_draft,
        get_chapter_section,
        get_chapter_sections,
        get_rubrik_for_bab,
        get_user_nama,
        set_bab_dokumen_checkpoint_aktif,
    )
    # ponytail: dulu `from document_catalog import parse_items`; kini katalog berkategori (label lama tetap diterima).
    from document_catalog_kategori import parse_items
    from llm.chat_model import ASSESS, SUGGEST, build_plain_llm, no_think

    payload = job.data
    bab_id = payload["babDokumenId"]
    user_id = payload["createdByUserId"]
    reuse_draft_id = payload.get("draftId")
    section_id = payload.get("sectionId")

    bab = get_bab_dokumen(bab_id)
    if bab is None:
        return {"status": "error", "error": f"BabDokumen {bab_id} tidak ditemukan"}

    section = get_chapter_section(bab["tenant_id"], section_id) if section_id else None
    if section_id and (section is None or section["chapter_id"] != bab_id):
        return {"status": "error", "error": f"Section {section_id} tidak ditemukan pada bab {bab_id}"}

    if reuse_draft_id and not section:
        # Dimas (_save_recommendation): "Rekomendasikan Ulang" may only reuse an EMPTY draft of this chapter;
        # a draft that already holds narrative is Generate's business, not this handler's.
        reused = get_bab_draft(bab["tenant_id"], reuse_draft_id)
        if reused is None or reused["chapter_id"] != bab_id:
            return {"status": "error", "error": f"Draft {reuse_draft_id} tidak ditemukan untuk bab ini"}
        if content_to_text(reused["content_snapshot"]).strip():
            return {
                "status": "error",
                "error": f"Draft {reuse_draft_id} sudah berisi narasi, tidak bisa direkomendasi ulang di sini",
            }

    # 1. Pedoman & rubrik — same relational lookup as GENERASI_BAB.
    rubric = get_rubrik_for_bab(bab["tenant_id"], bab["chapter_order"], bab.get("accreditation_set_id"))

    # 2. needs_lkps — REKOMENDASI_DOKUMEN operates at the whole-bab level
    # (recommend runs before checklist/synthesis, before a user drills into
    # one section), so needs_lkps/lkps_list are an aggregate across this
    # bab's sections (ChapterSection.lkpsNeeded/lkpsList, precomputed once
    # at Panduan extraction -- see ingestion.panduan_chunker.detect_lkps):
    # any section needing LKPS makes the whole bab "need" it, and the union
    # of every section's lkps_list is what gets looked up. Replaces the old
    # per-call regex over `pedoman` text (_lkps_refs_in_pedoman, deleted).
    # dimas recommend_documents(dokumen_id, section_id): title = breadcrumb (retrieval_query), pedoman =
    # that section's own pedoman_text, needs_lkps/lkps_list = that section's. No sectionId = legacy whole-bab run.
    sections = [section] if section else get_chapter_sections(bab["tenant_id"], bab_id)
    title = _section_prompt_title(section) if section else bab["chapter_title"]
    pedoman = [
        {"point_code": s["id"], "content_text": s["guidance"]} for s in sections if (s.get("guidance") or "").strip()
    ]
    needs_lkps = any(s.get("lkps_needed") for s in sections)
    lkps_list: list[str] = sorted({tok for s in sections for tok in (s.get("lkps_list") or [])})

    llm = build_plain_llm(ASSESS, json_schema=_ITEMS_JSON_SCHEMA)

    # dimas _retrieve_lkps: sheet lookup only when needs_lkps, otherwise no LKPS at all.
    lkps_tables = (
        await asyncio.to_thread(_load_lkps_tables, bab, needs_lkps, lkps_list, [title])
        if needs_lkps
        else []
    )

    # 3. recommendation_text+items (dimas HEAD dropped lkps_sufficient/lkps_evidence_query; columns stay NULL) —
    # 1 LLM call picking documents from the closed-set catalog. Retry up to
    # 3x (port of Dimas 140d8ae, generator.py::_assess_and_recommend):
    # - invoke/network exceptions now retried too (a short sleep first) —
    #   observed transient 429s from remote providers succeed immediately
    #   on retry with the identical prompt, so failing fast wastes a
    #   recoverable attempt.
    # - a syntactically-valid JSON response missing the "items" key
    #   entirely (LLM invents its own schema, e.g. {"analisis": [...]})
    #   now also retries — previously only `parse_error` triggered a
    #   retry, so this case failed permanently on attempt 1 even though
    #   later attempts might answer the requested schema correctly.
    # - a parsed but EMPTY items:[] is retried too (DeepSeek is inconsistent between identical prompts);
    #   only on the last attempt is it accepted as the final "nothing fits" conclusion.
    assess_prompt = _build_assess_and_recommend_prompt(title, pedoman, lkps_tables, needs_lkps)
    assess_data: dict = {}
    last_exc: Exception | None = None
    for attempt in range(3):
        if attempt:
            await asyncio.sleep(2)
        try:
            raw = await llm.ainvoke(no_think(assess_prompt))
            content = _strip_think(raw.content)
            assess_data = _normalize_items_response(_parse_llm_json(content), content)
            last_exc = None
        except Exception as e:
            logger.exception(
                "assess_and_recommend LLM gagal untuk bab %s (percobaan %d/3)", bab_id, attempt + 1
            )
            last_exc = e
            continue
        if not assess_data.get("parse_error") and "items" in assess_data:
            if assess_data.get("items") or attempt == 2:
                break
            logger.warning("items kosong dari LLM (bab %s, percobaan %d/3), coba ulang", bab_id, attempt + 1)
            continue
        reason = "parse gagal" if assess_data.get("parse_error") else "field 'items' tidak ada"
        logger.warning(
            "%s pada assess_and_recommend (bab %s, percobaan %d/3)", reason, bab_id, attempt + 1,
        )

    if last_exc is not None:
        assess_data = {"recommendation_text": f"Gagal menyusun rekomendasi: {_err_msg(last_exc)}", "items": []}

    catalog_ok = not assess_data.get("parse_error")
    raw_items = assess_data.get("items") or []
    accepted, rejected = parse_items(raw_items)
    if rejected:
        logger.warning(
            "%d/%d item dibuang (no/label tidak sepakat dgn katalog) untuk bab %s: %s",
            len(rejected), len(raw_items), bab_id, rejected[:3],
        )

    recommendation_text = assess_data.get("recommendation_text") or ""

    if catalog_ok and not raw_items:
        # LLM genuinely searched the whole closed set and found nothing (zero items -- NOT "items that all
        # failed validation", which is a format failure, not "nothing needed") —
        # ask it to propose a document name outside the catalog instead of
        # silently returning an empty recommendation (port of Dimas's
        # _suggest_custom_document fallback). A failure here is treated as
        # "no proposal" (items stays empty), not escalated to
        # _FALLBACK_RECOMMENDATION_TEXT — the main catalog stage already
        # succeeded validly, an empty custom-suggestion result is itself a
        # legitimate answer.
        custom_prompt = _build_suggest_custom_document_prompt(title, pedoman)
        try:
            raw = await build_plain_llm(SUGGEST).ainvoke(no_think(custom_prompt))
            custom_data = _parse_llm_json(_strip_think(raw.content))
        except Exception:
            logger.exception("suggest_custom_document LLM gagal untuk bab %s", bab_id)
            custom_data = {}
        if not isinstance(custom_data, dict) or custom_data.get("parse_error"):
            custom_data = {}  # a list / scalar / unparseable answer counts as "no proposal"
        items = [
            {"label": (it.get("label") or "").strip(), "reason": it.get("reason", "")}
            for it in (custom_data.get("items") or [])
            if isinstance(it, dict) and (it.get("label") or "").strip()
        ]
    else:
        items = [{"label": it["label"], "reason": it.get("reason", "")} for it in accepted]

    if not catalog_ok:
        recommendation_text = _FALLBACK_RECOMMENDATION_TEXT  # retrying may succeed
    elif not recommendation_text and not items:
        recommendation_text = _NO_DOCUMENT_NEEDED_TEXT  # a valid conclusion; retrying would not change it

    # 4. Persist: empty draft (reuse `draftId` if given) + DocumentRecommendation.
    # Per section: drafts are chapter-level in dev-v1, so hang it on the chapter's active checkpoint
    # (a new empty one only if the chapter has none) instead of a new chapter version per section.
    if section and bab.get("checkpoint_aktif_id"):
        draft_id = bab["checkpoint_aktif_id"]
    elif reuse_draft_id and not section:
        draft_id = reuse_draft_id
    else:
        user_nama = get_user_nama(user_id)
        draft = create_bab_draft(bab["tenant_id"], bab_id, user_id, user_nama, konten_snapshot={})
        draft_id = draft["id"]
        set_bab_dokumen_checkpoint_aktif(bab["tenant_id"], bab_id, draft_id)  # pointer only, working_content untouched

    pedoman_used = [{"id": p.get("point_code"), "text": (p.get("content_text") or "")[:300]} for p in pedoman]
    rubric_used = [{"id": r.get("id"), "text": (r.get("description") or "")[:300]} for r in rubric]
    lkps_used = [{"sheet": t["sheet"], "text": t["text"][:300]} for t in lkps_tables]
    # Audit trail of what was actually picked -- tier dropped, never read back by any caller (dead weight).
    candidate_catalog_picks = (
        [{"label": it["label"]} for it in accepted]
        if catalog_ok and accepted
        else [{"custom": True, **it} for it in items]
    )

    rec = create_document_recommendation(
        tenant_id=bab["tenant_id"],
        chapter_draft_id=draft_id,
        document_query=[],
        lkps_needed=needs_lkps,
        candidate_folders=candidate_catalog_picks,
        recommendation_text=recommendation_text,
        pedoman_used=pedoman_used,
        rubric_used=rubric_used,
        lkps_used=lkps_used,
        items=items,
        chapter_section_id=section_id,
    )

    return {
        "status": "completed",
        "recommendationId": rec["id"],
        "sectionId": section_id,
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
    from llm.chat_model import build_plain_llm, no_think

    payload = job.data
    bab_id = payload["babDokumenId"]
    user_id = payload["createdByUserId"]
    bab_draft_id = payload.get("babDraftId")

    bab = get_bab_dokumen(bab_id)
    if bab is None:
        return {"status": "error", "error": f"BabDokumen {bab_id} tidak ditemukan"}

    if bab_draft_id:
        draft = get_bab_draft(bab["tenant_id"], bab_draft_id)
        if draft is None or draft["chapter_id"] != bab_id:
            return {"status": "error", "error": f"Checkpoint {bab_draft_id} tidak ditemukan"}
        konten = content_to_text(draft["content_snapshot"])
        target_tipe = "BAB_DRAFT"
    else:
        konten = content_to_text(bab["working_content"])
        target_tipe = "BAB_AKTIF"

    if not konten.strip():
        return {"status": "error", "error": "Belum ada tulisan yang bisa dinilai untuk lingkup yang dipilih"}

    kriteria = get_rubrik_for_bab(bab["tenant_id"], bab["chapter_order"], bab.get("accreditation_set_id"))
    if not kriteria:
        return {"status": "error", "error": f"Bab {bab['chapter_order']} tidak dinilai kriteria rubrik apa pun"}

    levels_by_kriteria = get_rubrik_levels(bab["tenant_id"], [k["id"] for k in kriteria])
    for k in kriteria:
        k["level"] = levels_by_kriteria.get(k["id"], [])

    prompt = _build_simulasi_skor_prompt(bab["chapter_title"], konten, kriteria)
    llm = build_plain_llm()
    response = await llm.with_retry().ainvoke(no_think(prompt))
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
        bab["tenant_id"],
        target_tipe,
        bab_id=bab_id if target_tipe == "BAB_AKTIF" else None,
        bab_draft_id=bab_draft_id if target_tipe == "BAB_DRAFT" else None,
        rows=rows,
        dijalankan_oleh_user_id=user_id,
        dijalankan_oleh_nama=user_nama,
    )

    return {"status": "completed", "jumlahDinilai": len(hasil)}


def _pilih_rubrik(rubrics: list, indikator_list: list | None, sub_indikator_list: list | None) -> list:
    """Baris rubrik yang akan dinilai. `sub_indikator_list` (kunci "nomor|sub", mis. "43|I") memilih per
    sub-indikator dan mengalahkan `indikator_list`; selain itu per nomor indikator; keduanya kosong = semua."""
    from ingestion.matrix_parser import sub_no_dari

    if sub_indikator_list:
        kunci = set(sub_indikator_list)
        return [r for r in rubrics if f"{r.no}|{sub_no_dari(r)}" in kunci]
    if indikator_list:
        nomor = set(indikator_list)
        return [r for r in rubrics if r.no in nomor]
    return list(rubrics)


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
    sebelum pipeline jalan. Seperti ariel, LKPS dan LED wajib: tanpa salah
    satunya job berhenti dengan error, bukan menilai dari konteks kosong.

    Rubrik: dari `rubric_tool.py::_get_rubrics_for_set`, di-scope ke
    `AccreditationSet` dokumen ini (sama seperti `/start`/`/resume` HTTP di
    api/routes/assessment.py) -- bukan lagi `_get_rubrics()` global tanpa
    scope, yang juga tidak lagi cocok dengan `_run_assessment_pipeline`
    (butuh `accreditation_set_id` wajib, dulu tidak pernah dikirim dari sini).
    """
    import uuid

    from agent.tools.lkps_tool import load_lkps_for_document
    from agent.tools.rubric_tool import _get_rubrics_for_set
    from api.routes.assessment import _run_assessment_pipeline, _SimpleIndicator
    from ingestion.matrix_parser import sub_no_dari
    from db.postgres_client import create_session, get_document_accreditation_set, get_session

    payload = job.data
    dokumen_id = payload["dokumenId"]
    tenant_id = payload["tenantId"]
    user_id = payload["createdByUserId"]
    study_program_id = payload.get("programStudiId")
    indikator_list = payload.get("indikatorList")
    sub_indikator_list = payload.get("subIndikatorList")  # kunci "nomor|sub"; mengalahkan indikatorList
    # ariel /start: assessor model chosen per session, validated against the configured list.
    model = payload.get("model")
    if model is not None:
        from llm.ollama_client import get_available_models

        available = get_available_models()
        if model not in available:
            return {"status": "error", "error": f"Unknown model: {model}. Available: {available}"}

    accreditation_set_id = get_document_accreditation_set(dokumen_id)
    if accreditation_set_id is None:
        return {
            "status": "error",
            "error": "Dokumen ini belum memilih Instrumen Akreditasi — pilih Instrumen Akreditasi dulu sebelum menjalankan penilaian.",
        }

    # ariel led_index_state gate: never score against an empty/stale LED index.
    led_error = await _prepare_led_index(tenant_id, dokumen_id, payload.get("sumberLed", "EDITOR"))
    if led_error:
        return {"status": "error", "error": led_error}

    # LKPS (algoritma ariel): pilihan sesi -> LKPS dokumen -> lkps.xlsx lama di disk (/upload/lkps).
    # ariel requires LKPS before a run -- a load failure stops the job instead of scoring without it.
    try:
        lkps_loaded = load_lkps_for_document(
            tenant_id, dokumen_id,
            payload.get("lkpsBuktiDukungId") or _document_lkps_evidence_id(tenant_id, dokumen_id),
        )
    except Exception as e:
        logger.exception(
            "Gagal memuat LKPS untuk tenant=%s dokumen=%s", tenant_id, dokumen_id
        )
        return {"status": "error", "error": f"Gagal membaca LKPS: {_err_msg(e)}"}
    if not lkps_loaded:
        return {"status": "error", "error": "LKPS belum dipilih untuk penilaian ini -- pilih atau unggah Data LKPS dulu."}

    rubrics = _get_rubrics_for_set(accreditation_set_id, tenant_id, refresh=True)
    indicators = [
        _SimpleIndicator(indicator_no=r.no, kriteria=r.kriteria, sub_no=sub_no_dari(r))
        for r in _pilih_rubrik(rubrics, indikator_list, sub_indikator_list)
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
            model=model,
        )
    finally:
        await redis_client.aclose()

    sess = get_session(tenant_id, session_id)
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


def _program_studi_label(tenant_id: str, study_program_id: str | None) -> str | None:
    """"Nama prodi (jenjang D4 / Diploma 4 / Sarjana Terapan)" untuk prompt setor ke LED, atau None bila prodi tidak
    ada/gagal dibaca. Konteks tambahan (agar model tidak menebak varian jenis program pada target/tabel LKPS),
    bukan prasyarat: kegagalan di sini tidak boleh menghentikan job."""
    if not study_program_id:
        return None
    from db.connection import tenant_cursor
    from setor_led.prompts import format_prodi

    try:
        with tenant_cursor(tenant_id) as cur:
            cur.execute("SELECT name, level FROM org_study_programs WHERE id = %s", (study_program_id,))
            row = cur.fetchone()
    except Exception:
        logger.exception("Gagal membaca prodi %s untuk konteks setor ke LED; lanjut tanpa", study_program_id)
        return None
    return format_prodi(row["name"], row["level"]) if row else None


async def _handle_setor_led(job) -> dict:
    """"Setor ke LED": mengisi tabel analisis IKU (kategori Evaluasi + narasi) untuk satu Dokumen LED.
    Terpisah dari _handle_assessment_ami -- tidak memakai rubrik/skor 0-4 dan tidak menulis
    AssessmentSession; hasilnya dikembalikan sebagai return value job (-> Job.result). Worker ini hanya
    pemicu: prasyarat (LED terindeks, LKPS termuat, model valid) dicek di sini, logika per-IKU ada di
    setor_led/pipeline.py.

    Prasyarat sama dengan AMI (LED + LKPS wajib; tanpa salah satunya job berhenti dengan error, bukan
    menulis dari konteks kosong). Model reasoning diterima: pipeline memilih jalurnya per model seperti AMI
    (tool calling bawaan, atau protokol JSON untuk deepseek-r1/qwq dst.), bukan di sini.
    """
    from agent.tools.lkps_tool import load_lkps_for_document
    from db.postgres_client import get_document_accreditation_set
    from llm.ollama_client import get_available_models
    from setor_led.pipeline import jalankan_setor_led
    from setor_led.schema import parse_iku_list

    payload = job.data
    dokumen_id = payload["dokumenId"]
    tenant_id = payload["tenantId"]
    study_program_id = payload.get("programStudiId")

    try:
        iku_list = parse_iku_list(payload.get("ikuList"))
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    available = get_available_models()
    model = payload.get("model") or (available[0] if available else None)
    if model is None:
        return {"status": "error", "error": "Tidak ada model yang dikonfigurasi (OLLAMA_MODEL / OPENROUTER_MODEL kosong)."}
    if model not in available:
        return {"status": "error", "error": f"Unknown model: {model}. Available: {available}"}

    accreditation_set_id = get_document_accreditation_set(dokumen_id)
    if accreditation_set_id is None:
        return {
            "status": "error",
            "error": "Dokumen ini belum memilih Instrumen Akreditasi — pilih Instrumen Akreditasi dulu sebelum setor ke LED.",
        }

    led_error = await _prepare_led_index(tenant_id, dokumen_id, payload.get("sumberLed", "EDITOR"))
    if led_error:
        return {"status": "error", "error": led_error}

    try:
        lkps_loaded = load_lkps_for_document(
            tenant_id, dokumen_id,
            payload.get("lkpsBuktiDukungId") or _document_lkps_evidence_id(tenant_id, dokumen_id),
        )
    except Exception as e:
        logger.exception("Gagal memuat LKPS untuk tenant=%s dokumen=%s", tenant_id, dokumen_id)
        return {"status": "error", "error": f"Gagal membaca LKPS: {_err_msg(e)}"}
    if not lkps_loaded:
        return {"status": "error", "error": "LKPS belum dipilih untuk setor ke LED -- pilih atau unggah Data LKPS dulu."}

    async def _report_progress(completed: int, total: int) -> None:
        try:
            await job.updateProgress({"completed": completed, "total": total})
        except Exception:
            logger.exception("Gagal mengirim progress job %s", job.id)

    # Tombol Batalkan (JobsService.cancel di apps/backend) menitip flag lewat Redis dengan key job.id --
    # NestJS tidak bisa menjangkau loop async di proses worker ini langsung. Sama dengan ASSESSMENT_AMI.
    import redis.asyncio as aioredis

    redis_client = aioredis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379"))

    async def _is_cancelled() -> bool:
        try:
            return bool(await redis_client.get(f"job:cancel:{job.id}"))
        except Exception:
            logger.exception("Gagal cek status batal job %s, lanjut seperti biasa", job.id)
            return False

    try:
        hasil, dibatalkan = await jalankan_setor_led(
            iku_list,
            max_parallel=int(os.environ.get("ASSESSMENT_MAX_PARALLEL", "5")),
            tenant_id=tenant_id,
            dokumen_id=dokumen_id,
            accreditation_set_id=accreditation_set_id,
            study_program_id=study_program_id,
            model=model,
            on_progress=_report_progress,
            is_cancelled=_is_cancelled,
            konteks_prodi=_program_studi_label(tenant_id, study_program_id),
        )
    finally:
        await redis_client.aclose()

    return {"status": "cancelled" if dibatalkan else "completed", "hasil": hasil}


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

    from db.connection import tenant_cursor
    from db.r2_client import download_to
    from ingestion.evidence_pipeline import UnsupportedFileError, process_file
    from vectorstore.pgvector_evidence_store import index_evidence_chunks

    bukti_dukung_id = job.data["buktiDukungId"]
    tenant_id = job.data["tenantId"]
    file_url = job.data["fileUrl"]

    def _set_status(status: str, catatan: str | None) -> None:
        with tenant_cursor(tenant_id) as cur:
            cur.execute(
                "UPDATE evidence_files SET extraction_status = %s, failure_note = %s WHERE id = %s",
                (status, catatan, bukti_dukung_id),
            )

    try:
        with tempfile.TemporaryDirectory(prefix="evidence_ingest_") as tmp:
            work_dir = Path(tmp)
            local_path = work_dir / Path(file_url).name
            download_to(file_url, local_path)
            # Off the event loop: MinerU/embedding would block every other queue and the lock renewal.
            chunks = await asyncio.to_thread(process_file, local_path, work_dir)
            if not chunks:
                # SIAP with zero chunks would claim the file is AI-searchable when nothing got indexed.
                raise ValueError("Tidak ada teks yang bisa diekstrak dari berkas ini")
            await asyncio.to_thread(index_evidence_chunks, chunks, tenant_id, bukti_dukung_id)
    except UnsupportedFileError as e:
        _set_status("GAGAL", str(e))
        return {"status": "unsupported", "buktiDukungId": bukti_dukung_id, "reason": str(e)}
    except Exception as e:
        logger.exception("Ingestion gagal untuk bukti_dukung %s", bukti_dukung_id)
        _set_status("GAGAL", _err_msg(e)[:500])
        return {"status": "error", "buktiDukungId": bukti_dukung_id, "reason": _err_msg(e)}

    _set_status("SIAP", None)
    return {"status": "completed", "buktiDukungId": bukti_dukung_id, "chunks": len(chunks)}


def _document_lkps_evidence_id(tenant_id: str, dokumen_id: str) -> str | None:
    from db.connection import tenant_cursor

    with tenant_cursor(tenant_id) as cur:
        cur.execute("SELECT lkps_evidence_id FROM writing_led_documents WHERE id = %s", (dokumen_id,))
        row = cur.fetchone()
    return row["lkps_evidence_id"] if row else None


async def _handle_ingestion_lkps(job) -> dict:
    """LKPS for the writing pipeline (dimas worker_tasks.process_lkps): on upload, R2 file key -> 1 chunk
    per sheet -> lkps_chunk_embeddings keyed by the LKPS file; status SIAP/GAGAL on evidence_files."""
    import tempfile
    from pathlib import Path

    from db.connection import tenant_cursor
    from db.r2_client import download_to
    from ingestion.lkps_chunker import process_lkps_file
    from vectorstore.pgvector_lkps_store import index_lkps_chunks

    data = job.data
    tenant_id, evidence_id = data["tenantId"], data["evidenceId"]

    def _set_status(status: str, catatan: str | None) -> None:
        with tenant_cursor(tenant_id) as cur:
            cur.execute(
                "UPDATE evidence_files SET extraction_status = %s, failure_note = %s WHERE id = %s",
                (status, catatan, evidence_id),
            )

    try:
        with tempfile.TemporaryDirectory(prefix="lkps_ingest_") as tmp:
            local_path = download_to(data["fileUrl"], Path(tmp) / Path(data["fileUrl"]).name)
            chunks = await asyncio.to_thread(process_lkps_file, local_path)
            if not chunks:
                raise ValueError("Tidak ada sheet LKPS berisi data yang bisa dibaca")
            await asyncio.to_thread(index_lkps_chunks, chunks, tenant_id, evidence_id)
    except Exception as e:
        logger.exception("Ingestion LKPS gagal untuk %s", evidence_id)
        _set_status("GAGAL", _err_msg(e)[:500])
        return {"status": "error", "evidenceId": evidence_id, "reason": _err_msg(e)}
    _set_status("SIAP", None)
    return {"status": "completed", "evidenceId": evidence_id, "chunks": len(chunks)}


async def _index_led_file(tenant_id: str, dokumen_id: str, file_url: str) -> int:
    """LED (.pdf/.docx) by R2 file key -> led_chunk_embeddings (same chunkers as /upload/led)."""
    import tempfile
    from pathlib import Path

    from db.r2_client import download_to
    from vectorstore.pgvector_store import index_led_chunks

    with tempfile.TemporaryDirectory(prefix="led_ingest_") as tmp:
        local_path = download_to(file_url, Path(tmp) / Path(file_url).name)
        if local_path.suffix.lower() == ".docx":
            from ingestion.led_docx_chunker import chunk_led_docx as chunk
        else:
            from ingestion.led_chunker import chunk_led_pdf as chunk
        chunks = await asyncio.to_thread(chunk, str(local_path))
        await asyncio.to_thread(index_led_chunks, chunks, tenant_id, dokumen_id)
    return len(chunks)


async def _handle_ingestion_led(job) -> dict:
    data = job.data
    n = await _index_led_file(data["tenantId"], data["dokumenId"], data["fileUrl"])
    return {"status": "completed", "dokumenId": data["dokumenId"], "chunks": n}


def _editor_led_paragraphs(tenant_id: str, dokumen_id: str) -> list[tuple[str, bool]]:
    """Every chapter's working content, in chapter order, as (text, is_heading) paragraphs."""
    from db.connection import tenant_cursor

    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            "SELECT chapter_title, working_content FROM writing_document_chapters "
            "WHERE document_id = %s ORDER BY chapter_order",
            (dokumen_id,),
        )
        rows = cur.fetchall()
    paragraphs: list[tuple[str, bool]] = []
    for row in rows:
        body = [
            (content_to_text({"type": "doc", "content": [node]}), node.get("type") == "heading")
            for node in content_to_nodes(row["working_content"])
        ]
        if any(text.strip() for text, _ in body):
            paragraphs.append((row["chapter_title"], True))
            paragraphs.extend(body)
    return paragraphs


async def _prepare_led_index(tenant_id: str, dokumen_id: str, sumber_led: str) -> str | None:
    """Make the LED index match this run's LED source (ariel always scored an indexed LED).
    Returns an error message when there is no LED to score against.

    EDITOR: index the chapters' current text (chunk ids prefixed EDITOR_CHUNK_PREFIX), skipped when
    the stored index already holds exactly that text.
    UNGGAHAN: reuse the uploaded file's index; re-index from led_file_key when it is missing
    (INGESTION_LED not finished yet) or was overwritten by an Editor run."""
    from db.connection import tenant_cursor
    from ingestion.led_docx_chunker import chunk_led_paragraphs
    from vectorstore.pgvector_store import (
        EDITOR_CHUNK_PREFIX,
        index_led_chunks,
        led_index_is_from_file,
        led_index_matches_editor,
    )

    if sumber_led == "EDITOR":
        chunks = chunk_led_paragraphs(_editor_led_paragraphs(tenant_id, dokumen_id))
        if not chunks:
            return "Belum ada tulisan di Editor yang bisa dinilai -- tulis bab LED dulu, atau pilih LED dari unggahan."
        if led_index_matches_editor(tenant_id, dokumen_id, chunks):
            return None
        for c in chunks:
            c.chunk_id = EDITOR_CHUNK_PREFIX + c.chunk_id
        await asyncio.to_thread(index_led_chunks, chunks, tenant_id, dokumen_id)
        return None

    if led_index_is_from_file(tenant_id, dokumen_id):
        return None
    with tenant_cursor(tenant_id) as cur:
        cur.execute("SELECT led_file_key FROM writing_led_documents WHERE id = %s", (dokumen_id,))
        row = cur.fetchone()
    if not row or not row["led_file_key"]:
        return "Berkas LED belum diunggah -- unggah PDF/DOCX LED dulu, atau pilih LED dari Editor."
    if await _index_led_file(tenant_id, dokumen_id, row["led_file_key"]) == 0:
        return "Berkas LED tidak berisi teks yang bisa dibaca."
    return None


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

    from db.connection import tenant_cursor
    from db.postgres_client import (
        RubricSetInUseError,
        get_accreditation_set_tenant,
        replace_rubric_criteria_for_set,  # noqa: F401 -- jalur pdfplumber lama, dipertahankan
        replace_rubric_hierarchy_for_set,
    )
    from db.r2_client import download_to
    from ingestion.matrix_mineru import parse_matrix_mineru
    from ingestion.matrix_parser import parse_matrix_pdf  # noqa: F401 -- jalur pdfplumber lama

    accreditation_set_id = job.data["accreditationSetId"]
    file_url = job.data["fileUrl"]
    # accreditation-set.service.ts's enqueue() only sends accreditationSetId —
    # bootstrap it the same way get_document_accreditation_set does for
    # dokumen_id.
    tenant_id = get_accreditation_set_tenant(accreditation_set_id)

    def _set_status(status: str, catatan: str | None) -> None:
        with tenant_cursor(tenant_id) as cur:
            cur.execute(
                "UPDATE accreditation_sets SET criteria_parse_status = %s, criteria_parse_error = %s, updated_at = now() WHERE id = %s",
                (status, catatan, accreditation_set_id),
            )

    try:
        with tempfile.TemporaryDirectory(prefix="rubrik_parse_") as tmp:
            local_path = Path(tmp) / Path(file_url).name
            download_to(file_url, local_path)
            # ponytail: pdfplumber (matrix_parser.py) -> MinerU (matrix_mineru.py, port
            # ekstrak_mineru_rubrik.ipynb). pdfplumber membuang baris induk dan tidak
            # tahu sel ter-merge; MinerU + Chunker menghasilkan hierarki
            # kelompok > kriteria > IKU > sub_kriteria dan memisahkan sub-indikator
            # komposit (sub_no). Baris lama dibiarkan sebagai jejak.
            # rubrics = parse_matrix_pdf(str(local_path))
            rubrics = parse_matrix_mineru(local_path, Path(tmp) / "mineru")
            if not rubrics:
                _set_status(
                    "GAGAL",
                    "Tidak ada kriteria yang berhasil diekstrak dari PDF ini — "
                    "pastikan formatnya sesuai matriks penilaian.",
                )
                return {"status": "empty", "accreditationSetId": accreditation_set_id}
            # count = replace_rubric_criteria_for_set(tenant_id, accreditation_set_id, rubrics)
            count = replace_rubric_hierarchy_for_set(tenant_id, accreditation_set_id, rubrics)
    except RubricSetInUseError as e:
        _set_status("GAGAL", str(e))
        return {"status": "in_use", "accreditationSetId": accreditation_set_id, "reason": str(e)}
    except Exception as e:
        logger.exception("Parsing rubrik gagal untuk set %s", accreditation_set_id)
        _set_status("GAGAL", _err_msg(e)[:500])
        return {"status": "error", "accreditationSetId": accreditation_set_id, "reason": _err_msg(e)}

    _set_status("SIAP", None)
    return {"status": "completed", "accreditationSetId": accreditation_set_id, "count": count}


# ──────────────────────────────────────────────────────────────────────
# INGESTION_STRUKTUR_DOKUMEN -- deterministic, NO LLM. Mirrors
# INGESTION_RUBRIK_DOKUMEN above (same download-parse-replace-status
# shape), triggered by attachDocument on the PANDUAN_LAM slot instead of
# DOKUMEN_RUBRIK. ingestion.panduan_chunker (ported from dimas's
# MineruChunker, commit 57a55b0) walks MinerU's PDF->Markdown output with
# a regex/heuristic state machine -- same MinerU dev-v1 already runs for
# evidence docs (ingestion.evidence_mineru), not a new dependency. This
# replaced an earlier LLM-based version that only ever read the compact
# Daftar Isi page and asked an LLM to guess 1-2-sentence blurbs per
# section -- the chunker instead walks the WHOLE document and keeps the
# real text under each heading as `guidance`.
# ──────────────────────────────────────────────────────────────────────


def _gabung_duplikat_judul(items: list[dict]) -> list[dict]:
    """Gabung entri (bab/subbab) berjudul sama; subbab digabung rekursif,
    bukan cuma pilih satu. Dulu menambal LLM yang kadang mendaftar BAB yang
    sama dua kali; sekarang jaring pengaman TAMBAHAN di atas
    panduan_chunker._exclude_daftar_isi (yang mencegah kasus paling umum --
    Daftar Isi ikut ter-parse sbg BAB dobel -- lebih awal), bukan garis
    pertahanan satu-satunya lagi."""
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


def _flatten_bab_list(bab_list: list[dict]) -> list[dict]:
    """bab_list (nested, any depth -- see panduan_chunker._bab_list_from_nodes) -> flat staged nodes
    [{"id","parent_id","level","order","title","guidance","lkps_needed","lkps_list"}] for
    guide_references.structure_staging. Dotted ids ("1", "1.2", "1.2.3.1", ...) stay stable across the
    preview/confirm round trip without real ChapterTemplate/SubBabTemplate rows yet. Level 1 = BAB."""
    nodes: list[dict] = []

    def walk(items: list[dict], parent_id: str, level: int) -> None:
        for item in items:
            node_id = f"{parent_id}.{item['order']}"
            nodes.append({
                "id": node_id, "parent_id": parent_id, "level": level,
                "order": item["order"], "title": item["title"], "marker": item.get("marker"),
                "guidance": item.get("guidance"),
                "lkps_needed": bool(item.get("lkps_needed")), "lkps_list": item.get("lkps_list") or [],
            })
            walk(item.get("subbab", []), node_id, level + 1)

    for bab in bab_list:
        bab_id = str(bab["order"])
        nodes.append({
            "id": bab_id, "parent_id": None, "level": 1,
            "order": bab["order"], "title": bab["title"], "guidance": bab.get("guidance"),
            "lkps_needed": False, "lkps_list": [],
        })
        walk(bab.get("subbab", []), bab_id, 2)
    return nodes


async def _handle_ingestion_struktur_dokumen(job) -> dict:
    """Download the PANDUAN_LAM PDF from R2, extract its full BAB/sub-bab/
    sub-sub-bab structure (real text per section, not a summarized blurb --
    see ingestion.panduan_chunker), and park it in
    guide_references.structure_staging (status MENUNGGU_KONFIRMASI) -- does
    NOT touch chapter_templates/sub_bab_templates. A user must review and
    POST /structure/{guideId}/confirm (api/routes/structure.py) before
    anything commits -- see PanduanStructureModal-equivalent on the
    frontend. This mirrors dimas's staging_sections/confirm flow
    (commit `57a55b0`), ported because uploading a Pedoman used to commit
    its extracted structure sight-unseen.

    Scoped to the Panduan (ReferenceGuide) itself, not one AccreditationSet
    -- a Panduan is reusable across many sets (AccreditationSet.panduanId),
    so extraction/confirm status belongs to the file, not whichever set
    happened to trigger the upload.

    Same discipline as _handle_ingestion_rubrik_dokumen otherwise: catch
    everything, always end MENUNGGU_KONFIRMASI/GAGAL on
    guide_references.structure_parse_status, never leave it stuck on
    DIPROSES.
    """
    import tempfile
    from pathlib import Path

    from db.connection import tenant_cursor
    from db.postgres_client import get_reference_guide_tenant, save_structure_staging
    from db.r2_client import download_to
    from ingestion.panduan_chunker import extract_panduan_structure

    guide_id = job.data["guideId"]
    file_url = job.data["fileUrl"]
    tenant_id = get_reference_guide_tenant(guide_id)

    def _set_status(status: str, catatan: str | None) -> None:
        with tenant_cursor(tenant_id) as cur:
            cur.execute(
                "UPDATE guide_references SET structure_parse_status = %s, structure_parse_error = %s WHERE id = %s",
                (status, catatan, guide_id),
            )

    try:
        with tempfile.TemporaryDirectory(prefix="struktur_parse_") as tmp:
            tmp_path = Path(tmp)
            local_path = tmp_path / Path(file_url).name
            download_to(file_url, local_path)
            bab_list = await asyncio.to_thread(extract_panduan_structure, local_path, tmp_path)

        bab_list = _gabung_duplikat_judul(bab_list)

        if not bab_list:
            _set_status(
                "GAGAL",
                "Tidak ditemukan struktur BAB (\"BAB I\", \"BAB II\", dst) di dokumen ini "
                "-- pastikan ini Panduan Penulisan LED asli, bukan hasil scan tanpa OCR.",
            )
            return {"status": "empty", "guideId": guide_id}

        staged_nodes = _flatten_bab_list(bab_list)
        save_structure_staging(tenant_id, guide_id, staged_nodes)
    except Exception as e:
        logger.exception("Ekstraksi struktur dokumen gagal untuk Panduan %s", guide_id)
        _set_status("GAGAL", _err_msg(e)[:500])
        return {"status": "error", "guideId": guide_id, "reason": _err_msg(e)}

    return {"status": "menunggu_konfirmasi", "guideId": guide_id, "count": len(bab_list)}


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
