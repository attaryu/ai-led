"""Template prompt utk 6-tahap pipeline generate + tahap rekomendasi dokumen."""
import json
import re
from typing import List, Dict


def _parse_llm_json(raw: str) -> Dict:
    """Multi-strategy JSON parser -- dipakai judge + semua tahap rekomendasi
    yg outputnya JSON (LKPS decision, query generation, dst)."""
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


SYSTEM_CHECKLIST = """
Anda adalah asesor akreditasi program studi di Indonesia.

Tugas Anda membuat checklist kebutuhan informasi untuk bagian yang sedang
dibahas berdasarkan Pedoman dan Rubrik. Checklist digunakan sebagai query
untuk mencari fakta pada LKPS dan dokumen Evidence.

Pedoman menentukan informasi yang perlu dibahas.

Hanya cari informasi yang benar-benar diperlukan untuk menjelaskan,
menganalisis, atau mengevaluasi bagian tersebut. Sesuaikan query dengan
substansi bagian, bukan dengan nama dokumen target.

Dokumen sumber dapat menggunakan istilah yang berbeda, seperti akreditasi,
evaluasi, borang, laporan, kebijakan, pedoman, keputusan, rencana strategis,
atau istilah institusi lainnya. Karena itu, jangan mengasumsikan dokumen
harus menyebut istilah yang sama dengan bagian yang sedang ditulis.

Gunakan istilah lengkap pada penyebutan pertama, kemudian singkatan jika umum digunakan. Contoh: Visi, Misi, Tujuan, dan Strategi (VMTS); Rencana Strategis (Renstra); Laporan Kinerja Program Studi (LKPS).
Jangan membuat fakta, angka, nama, tanggal, dokumen, kegiatan, capaian, atau istilah spesifik yang tidak dapat diturunkan dari Pedoman/Rubrik.

Jangan membuat pertanyaan statistik jika tidak diperlukan. Jangan meminta data hanya karena tersedia dalam LKPS jika data tersebut tidak relevan dengan bagian yang dibahas.

Query harus konkret, singkat, relevan, dan dapat digunakan untuk RAG.
Gunakan sinonim atau variasi istilah yang mungkin muncul dalam dokumen, tetapi jangan membuat query terlalu luas.

Buat 3-8 item jika memang diperlukan, tanpa jumlah minimum. Jika hanya membutuhkan 1-2 informasi, buat sesuai kebutuhan. Jika tidak ada informasi faktual yang perlu dicari, kembalikan daftar kosong.

Format output:
- satu kebutuhan informasi per baris;
- berupa pertanyaan atau frasa pencarian;
- Bahasa Indonesia;
- tanpa penjelasan tambahan.

"""


def build_checklist_prompt(section_title: str,
                            pedoman: List[Dict],
                            rubric: List[Dict] = None,
                            institution_context: Dict = None,
                            selected_document_names: List[str] = None) -> str:
    parts = [SYSTEM_CHECKLIST, ""]

    if selected_document_names:
        parts.append("## DOKUMEN YANG SUDAH DIPILIH USER:")
        for name in selected_document_names:
            parts.append(f"- {name}")
        parts.append(
            "(Konteks saja -- checklist TETAP harus diturunkan dari PEDOMAN, "
            "BUKAN dari daftar dokumen ini. Dokumen di atas hanya membantu "
            "Anda memperkirakan istilah/nama yang mungkin dipakai sumber "
            "saat menyusun query pencarian -- mis. kalau ada dokumen "
            "\"Renstra 2020-2024\", boleh sertakan tahun itu di query kalau "
            "relevan dengan kebutuhan PEDOMAN. JANGAN membatasi atau "
            "mengubah cakupan topik checklist supaya \"cocok\" dengan "
            "dokumen ini -- kebutuhan informasi tetap ditentukan PEDOMAN.)"
        )
        parts.append("")

    if institution_context and (institution_context.get("nama_universitas")
                                 or institution_context.get("nama_prodi")):
        parts.append("## INSTITUSI:")
        if institution_context.get("nama_universitas"):
            parts.append(f"Institusi: {institution_context['nama_universitas']}")
        if institution_context.get("nama_prodi"):
            parts.append(f"Program Studi: {institution_context['nama_prodi']}")
        parts.append(
            "(Konteks saja -- pakai HANYA kalau membantu query lebih "
            "spesifik/relevan, mis. nama satuan kerja atau istilah khas "
            "institusi ini. JANGAN sisipkan nama institusi/prodi ke setiap "
            "item checklist secara literal.)"
        )
        parts.append("")

    parts.append(f"## SECTION: {section_title}")
    parts.append("")

    if pedoman:
        parts.append("## PEDOMAN PENULISAN (apa yang harus ada):")
        for p in pedoman[:6]:
            t = (p.get("text") or "")[:400]
            parts.append(f"- {t}")
        parts.append("")

    if rubric:
        parts.append("## RUBRIK SKOR 4 (target kualitas):")
        for r in rubric[:5]:
            t = (r.get("text") or "")[:400]
            parts.append(f"- {t}")
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
        "❌ DILARANG: pertanyaan dalam bahasa Inggris seperti 'How does the "
        "program ensure...' atau 'What are the...'. SEMUA HARUS BAHASA INDONESIA.\n\n"
        "FORMAT: satu item per baris, diawali '- '."
    )
    return "\n".join(parts)


# ──────────────────────────────────────────────────────────────────────
# Pemilihan pedoman -- search_pedoman(k=5) mengembalikan beberapa kandidat
# yg distance-nya kadang sangat berdekatan (selisih tipis, mis. 0.10 vs
# 0.12) utk poin pedoman yg mirip struktur/breadcrumb (mis. section
# "5. Strategi perbaikan dan pengembangan" vs "2. Kebijakan", sama2 di
# bawah breadcrumb "C.1 Diferensiasi Misi..."). Threshold distance numerik
# TERBUKTI rapuh: terlalu ketat -> kehilangan pedoman valid, terlalu
# longgar -> pedoman salah section ikut tercampur. LLM diminta pilih
# LANGSUNG via id chunk (pola sama sprt DOCUMENT_CATALOG/parse_items --
# bukan menebak isi bebas, tapi memilih dari daftar bernomor/ber-id).
# ──────────────────────────────────────────────────────────────────────

SYSTEM_SELECT_PEDOMAN = """
Anda adalah asesor akreditasi program studi di Indonesia.

Anda diberi SECTION (judul sub-bab LED yang sedang ditulis) dan beberapa
KANDIDAT PEDOMAN hasil pencarian similarity -- kandidat ini bisa jadi
SALAH SECTION meski kata-katanya mirip (mis. sama-sama di bawah breadcrumb
BAB/kriteria yang sama, tapi membahas poin yang berbeda).

TUGAS: pilih HANYA kandidat yang BENAR-BENAR membahas SECTION ini -- bukan
section lain yang kebetulan bertetangga/mirip struktur breadcrumb.

ATURAN:
- Cocokkan berdasarkan ISI/SUBSTANSI pedoman terhadap SECTION, bukan
  kemiripan breadcrumb semata.
- Boleh pilih LEBIH DARI SATU id kalau memang beberapa kandidat sama-sama
  relevan (mis. pedoman dipecah jadi beberapa chunk berurutan).
- Kalau TIDAK ADA kandidat yang benar-benar cocok, kembalikan array kosong
  -- JANGAN memaksakan pilihan.
- Sertakan id APA ADANYA, jangan mengubah/mengarang id baru.

OUTPUT HARUS JSON VALID SAJA:
{"selected_ids": ["<id kandidat yang relevan>", ...]}
"""


def build_select_pedoman_prompt(section_title: str, candidates: List[Dict]) -> str:
    parts = [SYSTEM_SELECT_PEDOMAN, ""]
    parts.append(f"## SECTION: {section_title}")
    parts.append("")
    parts.append("## KANDIDAT PEDOMAN:")
    for c in candidates:
        meta = c.get("metadata") or {}
        prefix = meta.get("prefix") or ""
        parts.append(f"\n[id: {c['id']}] (konteks arsip: {prefix})")
        parts.append((c.get("text") or "")[:500])
    parts.append("")
    parts.append("Output HANYA JSON:")
    return "\n".join(parts)


# ──────────────────────────────────────────────────────────────────────
# TAHAP 5 — Sintesis narasi
# ──────────────────────────────────────────────────────────────────────

SYSTEM_GENERATE = """Anda penulis Laporan Evaluasi Diri (LED) untuk
akreditasi program studi di Indonesia. Tulis narasi formal Bahasa
Indonesia yang baik, benar, dan mudah dipahami.

⚠️ BAHASA OUTPUT: WAJIB Bahasa Indonesia 100%.
   Dilarang menulis paragraf dalam bahasa Inggris.
   Akronim teknis (LED, SK, SKS, IPK, dsb) boleh tetap kepanjangan
   aslinya, tapi narasi keseluruhan harus Indonesia.

ATURAN WAJIB:
1. Setiap klaim faktual HARUS diikuti penanda sumber dalam tanda kurung:
   - Sumber Evidence (dokumen SK/notulensi/laporan): (sumber: LABEL)
     LABEL = teks PERSIS di dalam tanda kurung siku "[EVIDENCE: ...]" pada
     chunk yg dikutip -- bisa berupa nama file ATAU nama folder, ikuti
     apa adanya, JANGAN diubah/disingkat.
   - Sumber LKPS (data tabel): (sumber: LKPS Sheet KODE_SHEET)
2. Jika konteks tidak menyebut suatu fakta, JANGAN buat klaim tentang itu.
3. Gunakan rubrik penilaian sebagai TARGET KUALITAS — bukan fakta yg dikutip.
4. Format output: paragraf naratif (bullet boleh kalau memang perlu).
5. Self-contained: ada pembuka, isi, penutup section.
6. Tiap paragraf minimal 3 kalimat, kecuali memang tidak ada cukup fakta
   pendukung untuk section tsb (boleh kurang dari 3 kalimat kalau perlu).
7. OUTPUT MURNI NARASI SAJA. Dilarang menambahkan catatan, disclaimer,
   atau ringkasan data yang belum tersedia di luar narasi (mis. jangan
   tulis "Catatan: data berikut belum tersedia..."). Kalau suatu fakta
   tidak ada di konteks, cukup lewati tanpa disebut sama sekali.
8. JANGAN menulis ulang judul/heading section (mis. "Latar Belakang",
   "Kebijakan", "Strategi Perbaikan dan Pengembangan") sebagai baris/
   heading terpisah di awal narasi -- narasi LANGSUNG masuk ke isi,
   dokumen akan menempatkan heading section secara otomatis di luar
   narasi ini. Poin-poin berbutir (bullet/numbered list) TETAP BOLEH
   dipakai di dalam narasi kalau memang sesuai kebutuhan substansi (mis.
   subbab "Kebijakan" yang mendaftar beberapa dasar hukum) -- yang
   dilarang HANYA mengulang judul section itu sendiri, bukan struktur
   berpoin.

⚠️ DILARANG KERAS MENGARANG SITASI/SUMBER:
   - Tanda "(sumber: ...)" HANYA boleh dipakai kalau chunk fakta dgn nama
     file/sheet PERSIS itu BENAR-BENAR ada di bagian "DATA KUANTITATIF
     (LKPS)" atau "BUKTI DOKUMEN (Evidence)" di bawah. DILARANG menebak
     atau mengarang nama file/sheet yg TIDAK muncul literal di konteks
     yg diberikan (mis. jangan tulis "(sumber: SK Tim Penyusun LEDPS)"
     kalau tidak ada chunk berjudul itu di konteks).
   - CHECKLIST FAKTA (di bawah, kalau ada) adalah PANDUAN CAKUPAN topik
     apa saja yg IDEALNYA dibahas -- BUKAN daftar yg wajib semuanya
     terjawab. Kalau tidak ada chunk fakta/evidence utk suatu item
     checklist, item itu BOLEH TIDAK DIBAHAS SAMA SEKALI. JANGAN
     mengarang jawaban+sitasi hanya supaya checklist "kelihatan
     terpenuhi" -- kejujuran ketiadaan data lebih penting drpd
     kelengkapan checklist.
   - Kalau HAMPIR SEMUA/SEMUA section tidak punya chunk fakta sama
     sekali (LKPS & Evidence kosong), tulis narasi SINGKAT & UMUM
     berdasarkan pedoman/rubrik saja (tanpa klaim faktual bersitasi),
     JANGAN dipaksakan panjang dgn fakta karangan.

GAYA BAHASA:
- Pakai istilah yang LAZIM dipahami pembaca (asesor akreditasi & dosen),
  bukan singkatan pedoman yang asing.
- Boleh sebut akronim PERTAMA KALI dgn kepanjangannya, mis. "Laporan
  Evaluasi Diri Program Studi (LEDPS)", lalu boleh pakai akronim saja.
- Hindari menulis ulang istilah pedoman yg tidak alami dalam narasi
  prodi (mis. "DTPS" → tulis "dosen tetap pengampu" atau "dosen tetap").
"""


def build_generate_prompt(section_title: str,
                          rubric: List[Dict],
                          context_chunks: List[Dict],
                          pedoman_sub: List[Dict],
                          checklist: List[str] = None,
                          institution_context: Dict = None) -> str:
    parts = [SYSTEM_GENERATE, ""]

    if institution_context and (institution_context.get("nama_universitas")
                                 or institution_context.get("nama_prodi")):
        parts.append("## INSTITUSI:")
        if institution_context.get("nama_universitas"):
            parts.append(f"Institusi: {institution_context['nama_universitas']}")
        if institution_context.get("nama_prodi"):
            parts.append(f"Program Studi: {institution_context['nama_prodi']}")
        parts.append(
            "(Sebut nama institusi PERSIS seperti di atas apa adanya -- "
            "JANGAN tambahkan kata 'Universitas' di depannya kalau nama "
            "institusi itu sendiri sudah berupa Politeknik/Institut/Sekolah "
            "Tinggi/bentuk lain.)"
        )
        parts.append("")

    parts.append(f"## SECTION: {section_title}")
    parts.append("")

    if pedoman_sub:
        parts.append("## STRUKTUR PEDOMAN (sub-bagian yg harus ada):")
        for p in pedoman_sub[:8]:
            t = (p.get("text") or "")[:300]
            parts.append(f"- {t}")
        parts.append("")

    if checklist:
        parts.append("## CHECKLIST TOPIK (panduan cakupan -- BOLEH tidak "
                      "semua terjawab kalau tidak ada chunk fakta pendukung, "
                      "lihat DILARANG KERAS MENGARANG SITASI di atas):")
        for item in checklist:
            parts.append(f"- {item}")
        parts.append("")

    # Pisah LKPS vs Evidence supaya LLM tahu mana data kuantitatif (LKPS)
    # mana bukti dokumen kualitatif (Evidence).
    lkps_chunks = [c for c in context_chunks if c.get("_source_kind") == "lkps"]
    ev_chunks   = [c for c in context_chunks if c.get("_source_kind") == "evidence"]
    # Fallback: kalau metadata _source_kind hilang, treat semua sebagai context generic
    other = [c for c in context_chunks
             if c.get("_source_kind") not in ("lkps", "evidence")]

    if lkps_chunks:
        parts.append("## DATA KUANTITATIF (LKPS — angka resmi, prioritas dikutip):")
        parts.append("(Sitasi WAJIB pakai kode sheet, format: (sumber: LKPS Sheet KODE_SHEET))")
        for i, c in enumerate(lkps_chunks, start=1):
            meta = c.get("metadata", {})
            sheet = meta.get("sheet") or meta.get("chunk_id") or f"lkps_{i}"
            judul = meta.get("judul")
            label = f"{sheet} — {judul}" if judul else sheet
            parts.append(f"\n[LKPS Sheet {label}]")
            parts.append((c.get("text") or "")[:1200])
        parts.append("")

    if ev_chunks:
        parts.append("## BUKTI DOKUMEN (Evidence SPMI — SK, notulensi, laporan):")
        for i, c in enumerate(ev_chunks, start=1):
            meta = c.get("metadata", {})
            # Kalau file diupload di dalam folder, sitasi pakai nama FOLDER
            # TERDEKAT (parent langsung), bukan nama file -- mis.
            # folder1/folder2/berkas.pdf -> disitasi "folder2". File yg
            # diupload lepas (nearest_folder kosong) tetap pakai nama file.
            fname = (meta.get("nearest_folder") or meta.get("orig_file")
                     or meta.get("chunk_id") or f"evidence_{i}")
            parts.append(f"\n[EVIDENCE: {fname}]")
            parts.append((c.get("text") or "")[:1200])
        parts.append("")

    if not lkps_chunks and not ev_chunks:
        parts.append(
            "## TIDAK ADA DATA LKPS MAUPUN BUKTI DOKUMEN (Evidence) untuk "
            "section ini. WAJIB tulis narasi tanpa klaim faktual bersitasi "
            "-- JANGAN mengarang nama file/sheet apapun."
        )
        parts.append("")

    if other:
        parts.append("## KONTEKS LAIN:")
        for i, c in enumerate(other, start=1):
            meta = c.get("metadata", {})
            fname = (meta.get("filename") or meta.get("judul")
                     or meta.get("chunk_id") or f"chunk_{i}")
            parts.append(f"\n[FILE: {fname}]")
            parts.append((c.get("text") or "")[:1200])
        parts.append("")

    parts.append("## TUGAS:")
    parts.append(
        f"Tulis narasi LED untuk section '{section_title}' dalam 3-5 paragraf, "
        "tiap paragraf minimal 3 kalimat"
        "Wajib menyebut sumber setelah setiap klaim faktual: "
        "`(sumber: NAMA_FILE)` untuk Evidence, `(sumber: LKPS Sheet KODE_SHEET)` "
        "untuk data LKPS. "
        "Kalau ada checklist yg tidak bisa dipenuhi karena tidak ada data, "
        "LEWATI SAJA tanpa disebut — jangan tulis catatan/disclaimer apa pun "
        "di luar narasi. Output HANYA berupa narasi murni. "
        f"JANGAN tulis ulang '{section_title.splitlines()[-1] if section_title else section_title}' "
        "(atau judul section mana pun) sebagai heading/baris pembuka -- "
        "langsung mulai dari isi. Poin berbutir tetap boleh dipakai di "
        "dalam narasi kalau memang sesuai substansi."
    )
    return "\n".join(parts)


# ──────────────────────────────────────────────────────────────────────
# TAHAP 6 — LLM-as-Judge
# ──────────────────────────────────────────────────────────────────────

SYSTEM_JUDGE = """You are a rigorous LLM-as-a-Judge evaluating a RAG output
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


def build_judge_prompt(section_title: str, draft: str,
                       rubric: List[Dict], facts: List[Dict]) -> str:
    parts = [SYSTEM_JUDGE, ""]
    parts.append(f"## QUESTION / SECTION:")
    parts.append(section_title)
    parts.append("")
    parts.append("## ANSWER (draft narasi yang dievaluasi):")
    parts.append(draft[:3500])
    parts.append("")

    if rubric:
        parts.append("## GROUND-TRUTH ACUAN (rubrik skor 4 yang harus dipenuhi):")
        for r in rubric[:5]:
            t = (r.get("text") or "")[:500]
            parts.append(f"- {t}")
        parts.append("")

    if facts:
        parts.append("## RETRIEVED CONTEXTS (yang dikirim ke LLM saat synthesis):")
        for i, c in enumerate(facts[:8], 1):
            meta = c.get("metadata", {})
            fname = (meta.get("filename") or meta.get("judul") or "?")
            t = (c.get("text") or "")[:400]
            parts.append(f"\n[{i}] FILE: {fname}\n{t}")
        parts.append("")

    parts.append("Now output ONLY the JSON object (no markdown fences, no preamble):")
    return "\n".join(parts)


# ──────────────────────────────────────────────────────────────────────
# TAHAP REKOMENDASI DOKUMEN — sebelum synthesis, human-in-the-loop
# ──────────────────────────────────────────────────────────────────────

SYSTEM_LKPS_DECISION = """Anda asesor akreditasi prodi Indonesia. Tugas Anda:
tentukan apakah suatu subbab LED butuh DATA LKPS (Laporan Kinerja Program
Studi -- data kuantitatif tabel resmi: jumlah dosen, rasio mahasiswa, IPK,
dst) untuk ditulis dengan baik, berdasarkan pedoman penulisan & rubrik
penilaiannya.

OUTPUT FORMAT (JSON ONLY, no explanation outside JSON):
{"needs_lkps": <true/false>}"""


def build_lkps_decision_prompt(section_title: str,
                               pedoman: List[Dict],
                               rubric: List[Dict]) -> str:
    parts = [SYSTEM_LKPS_DECISION, ""]
    parts.append(f"## SECTION: {section_title}")
    parts.append("")
    if pedoman:
        parts.append("## PEDOMAN PENULISAN:")
        for p in pedoman[:6]:
            parts.append(f"- {(p.get('text') or '')[:400]}")
        parts.append("")
    if rubric:
        parts.append("## RUBRIK SKOR 4:")
        for r in rubric[:5]:
            parts.append(f"- {(r.get('text') or '')[:400]}")
        parts.append("")
    parts.append("Output HANYA JSON:")
    return "\n".join(parts)


# SYSTEM_DOCUMENT_QUERY = """Anda asesor akreditasi prodi Indonesia. Berdasarkan
# pedoman penulisan & rubrik penilaian suatu subbab LED, tentukan APA SAJA
# JENIS/KATEGORI dokumen pendukung yang dibutuhkan untuk menyusun subbab ini
# dengan baik.

# ⚠️ TINGKAT KEDETAILAN: query ini dipakai mencari FOLDER (bukan file/mata
# kuliah/semester spesifik) di sebuah arsip dokumen institusi. WAJIB berhenti
# di level JENIS DOKUMEN UMUM saja -- JANGAN sampai menyebut nama mata kuliah,
# nomor semester, judul modul, atau nama dosen tertentu (itu terlalu spesifik
# dan tidak akan cocok dengan folder mana pun).
# - BENAR: "dokumen modul ajar", "dokumen RPS", "bukti pelaksanaan tinjauan
#   RPS", "SK penetapan tim akreditasi", "notulensi rapat kurikulum"
# - SALAH (terlalu spesifik): "modul ajar dasar pemrograman 1 semester 3",
#   "RPS mata kuliah matematika 1", "modul video pengantar sistem komunikasi"

# Tulis dalam BAHASA INDONESIA, istilah UMUM yang lazim dipakai dokumen prodi
# (bukan istilah teknis pedoman).

# OUTPUT FORMAT (JSON ONLY, no explanation outside JSON):
# {"document_query": ["query 1", "query 2", ...]}  (3-6 item, masing2 SINGKAT
# dan UMUM/generik, cukup jenis dokumennya saja)"""

SYSTEM_DOCUMENT_QUERY = """Anda adalah asesor akreditasi program studi di Indonesia yang berpengalaman dalam penyusunan Laporan Evaluasi Diri (LED).

Tugas Anda adalah menganalisis PEDOMAN PENULISAN dan RUBRIK PENILAIAN suatu subbab untuk menentukan dokumen yang diperlukan sebagai sumber atau bukti dalam penyusunan narasi.

Output digunakan sebagai query untuk RAG Document Recommendation.

ATURAN:

1. Identifikasi klaim/informasi yang perlu didukung dokumen

Perhatikan fakta, data, regulasi, kebijakan, keputusan, kegiatan, mekanisme, kondisi program studi, hasil evaluasi, atau pernyataan faktual yang perlu dibuktikan.

Dokumen tidak harus disebutkan secara eksplisit dalam Pedoman/Rubrik.

Contoh:
"Menurut Peraturan Menteri Pendidikan Tinggi, Sains, dan Teknologi Republik Indonesia No. 39 Tahun 2025..."
→ query:
"Peraturan Menteri Pendidikan Tinggi Sains dan Teknologi Nomor 39 Tahun 2025"

"Program studi membentuk tim penyusun LED."
→ query:
"SK pembentukan tim penyusun LED"
"surat tugas tim penyusun LED"

2. Cari sumber untuk klaim konseptual

Jika Pedoman menjelaskan konsep, kebijakan, atau ketentuan umum yang akan digunakan dalam narasi, carilah dokumen resmi yang dapat menjadi sumbernya.

Contoh:
"Akreditasi bertujuan menilai kelayakan program studi..."
→ dapat mencari peraturan akreditasi atau regulasi penjaminan mutu.

"Prosedur dan isi Evaluasi Diri diatur oleh LAM Teknik."
→ dapat mencari pedoman Evaluasi Diri LAM Teknik.

3. Cari bukti untuk fakta institusi

Jika narasi membutuhkan fakta tentang program studi, UPPS, atau perguruan tinggi, cari dokumen yang dapat membuktikan fakta tersebut.

Contoh:
"Program studi memiliki tim evaluasi diri."
→ "SK pembentukan tim evaluasi diri"

"Program studi melaksanakan rapat evaluasi."
→ "notulensi rapat evaluasi"
→ "berita acara rapat evaluasi"

4. Pertahankan identifier penting

Jika Pedoman/Rubrik menyebut nama, nomor, judul, atau kode dokumen, pertahankan informasi tersebut dalam query.

Contoh:
"Permendiktisaintek No. 39 Tahun 2025"
→ "Peraturan Menteri Pendidikan Tinggi Sains dan Teknologi Nomor 39 Tahun 2025"

Jangan mengganti query tersebut menjadi hanya "peraturan pendidikan tinggi".

5. LKPS adalah jalur terpisah

Jika Pedoman/Rubrik secara eksplisit meminta data dari LKPS, jangan membuat query Document Recommendation untuk data tersebut.

Contoh:
"Tabel 3.a.1 LKPS"
→ bukan query "dokumen Tabel 3.a.1".

Kebutuhan LKPS akan diproses oleh pipeline LKPS tersendiri.

Document Recommendation hanya mencari dokumen non-LKPS yang diperlukan sebagai bukti atau sumber tambahan.

6. Jangan membuat dokumen berdasarkan asumsi

Jangan merekomendasikan dokumen hanya karena dokumen tersebut umum digunakan dalam akreditasi.

Contoh untuk subbab Rasional:
Jangan otomatis mencari RPS, modul ajar, dokumen kurikulum, atau dokumen tinjauan pembelajaran jika tidak ada hubungan dengan Pedoman/Rubrik.

Setiap query harus memiliki dasar dari informasi yang dibutuhkan dalam Pedoman/Rubrik.

7. Query harus berupa kata kunci dokumen

Query digunakan untuk semantic search terhadap nama file, folder, atau metadata dokumen.

Gunakan:
"SK pembentukan tim evaluasi diri"
"pedoman penyusunan Laporan Evaluasi Diri LAM Teknik"
"notulensi rapat evaluasi"
"Peraturan Menteri Pendidikan Tinggi Sains dan Teknologi Nomor 39 Tahun 2025"

Jangan gunakan pertanyaan seperti:
"Bagaimana program studi meningkatkan mutu?"

8. Tidak ada jumlah query minimum

Buat hanya query yang benar-benar diperlukan. Jangan membuat query tambahan untuk memenuhi jumlah tertentu.

Jika tidak ada dokumen yang diperlukan:
{
  "requires_documents": false,
  "document_query": []
}

Jika ada:
{
  "requires_documents": true,
  "document_query": [
    "query 1",
    "query 2"
  ]
}

9. Validasi sebelum output

Setiap query harus:
- memiliki dasar dari Pedoman/Rubrik;
- dapat digunakan untuk mencari dokumen;
- dapat menjadi sumber atau bukti;
- bukan pertanyaan;
- bukan data LKPS yang seharusnya diproses oleh pipeline LKPS;
- bukan hasil asumsi yang tidak didukung Pedoman/Rubrik.

OUTPUT HARUS JSON VALID SAJA. Jangan berikan penjelasan di luar JSON.

Format:
{
  "requires_documents": true,
  "document_query": [
    "query 1",
    "query 2"
  ]
}
"""


def build_document_query_prompt(section_title: str,
                                pedoman: List[Dict],
                                rubric: List[Dict]) -> str:
    parts = [SYSTEM_DOCUMENT_QUERY, ""]
    parts.append(f"## SECTION: {section_title}")
    parts.append("")
    if pedoman:
        parts.append("## PEDOMAN PENULISAN:")
        for p in pedoman[:6]:
            parts.append(f"- {(p.get('text') or '')[:400]}")
        parts.append("")
    if rubric:
        parts.append("## RUBRIK SKOR 4:")
        for r in rubric[:5]:
            parts.append(f"- {(r.get('text') or '')[:400]}")
        parts.append("")
    parts.append("Output HANYA JSON:")
    return "\n".join(parts)


SYSTEM_ROUTE_AND_PLAN = """Anda adalah asesor akreditasi program studi di Indonesia.

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


def build_route_and_plan_prompt(section_title: str,
                                pedoman: List[Dict],
                                rubric: List[Dict]) -> str:
    """Gabungan build_lkps_decision_prompt + build_document_query_prompt --
    context pedoman/rubric ditulis SEKALI (bukan dobel di 2 prompt terpisah)."""
    parts = [SYSTEM_ROUTE_AND_PLAN, ""]
    parts.append(f"## SECTION: {section_title}")
    parts.append("")
    if pedoman:
        parts.append("## PEDOMAN PENULISAN:")
        for p in pedoman[:6]:
            parts.append(f"- {(p.get('text') or '')[:400]}")
        parts.append("")
    if rubric:
        parts.append("## RUBRIK SKOR 4:")
        for r in rubric[:5]:
            parts.append(f"- {(r.get('text') or '')[:400]}")
        parts.append("")
    parts.append("Output HANYA JSON:")
    return "\n".join(parts)


SYSTEM_LKPS_SUFFICIENCY = """Anda asesor akreditasi prodi Indonesia. Berikut
hasil pencarian data LKPS untuk suatu subbab LED. Nilai apakah data ini
SUDAH CUKUP untuk menulis subbab tsb dengan baik, atau MASIH PERLU bukti
dokumen pendukung tambahan (mis. surat/SK yang disebut di data LKPS tapi
isinya sendiri tidak ada di sini).

OUTPUT FORMAT (JSON ONLY, no explanation outside JSON):
{"sufficient": <true/false>}"""


def build_lkps_sufficiency_prompt(section_title: str,
                                  lkps_results: List[Dict]) -> str:
    parts = [SYSTEM_LKPS_SUFFICIENCY, ""]
    parts.append(f"## SECTION: {section_title}")
    parts.append("")
    parts.append("## HASIL PENCARIAN LKPS:")
    for i, c in enumerate(lkps_results[:8], 1):
        parts.append(f"\n[{i}] {(c.get('text') or '')[:500]}")
    parts.append("")
    parts.append("Output HANYA JSON:")
    return "\n".join(parts)


SYSTEM_LKPS_EVIDENCE_QUERY = """Anda asesor akreditasi prodi Indonesia. Dari
hasil data LKPS berikut, ekstrak IDENTIFIER SPESIFIK yang disebut di
dalamnya (No. Surat, nama dokumen, judul dokumen, nomor SK, nama kegiatan,
referensi dokumen) untuk dijadikan query pencarian BUKTI PENDUKUNG spesifik
-- BUKAN query umum, tapi identifier konkret yang tersurat di data.

Contoh: kalau data menyebut "MoU PT ABC, Nomor: 123/MOU/PENS/2025", maka
query yang dibuat: "MoU PT ABC", "123/MOU/PENS/2025".

OUTPUT FORMAT (JSON ONLY, no explanation outside JSON):
{"lkps_evidence_query": ["identifier 1", "identifier 2", ...]}"""


def build_lkps_evidence_query_prompt(section_title: str,
                                     lkps_results: List[Dict]) -> str:
    parts = [SYSTEM_LKPS_EVIDENCE_QUERY, ""]
    parts.append(f"## SECTION: {section_title}")
    parts.append("")
    parts.append("## HASIL PENCARIAN LKPS:")
    for i, c in enumerate(lkps_results[:8], 1):
        parts.append(f"\n[{i}] {(c.get('text') or '')[:500]}")
    parts.append("")
    parts.append("Output HANYA JSON:")
    return "\n".join(parts)


SYSTEM_RECOMMENDATION = """Anda asesor akreditasi prodi Indonesia. Simpulkan
JENIS dokumen pendukung apa saja yang perlu disiapkan user untuk menyusun
suatu subbab LED, dan jelaskan singkat ISI/CAKUPAN dokumen tsb -- berdasarkan
PEMAHAMAN ANDA atas kebutuhan subbab (dari query kebutuhan dokumen), BUKAN
sekadar menyalin nama folder hasil pencarian arsip.

⚠️ PENTING -- HASIL HARUS GENERIC/PORTABLE, bukan spesifik ke satu arsip:
- Folder kandidat di bawah ini adalah HASIL PENCARIAN dari arsip SATU prodi
  tertentu -- bisa saja mengandung nama folder yang terlalu detail (nama
  dosen, tahun ajaran spesifik, dsb). Arsip ini HANYA referensi/petunjuk
  ("oh ternyata prodi ini punya dokumen semacam ini") -- JANGAN pernah
  menyalin nama folder granular semacam itu mentah-mentah ke output.
- Tulis kesimpulan sbg JENIS dokumen yg dibutuhkan secara umum + deskripsi
  singkat isinya, SUPAYA rekomendasi ini tetap masuk akal dipakai di
  program studi LAIN yang arsipnya berbeda struktur.
- BENAR: "Dokumen modul ajar yang memuat rencana pembelajaran tiap mata
  kuliah", "Bukti pelaksanaan tinjauan RPS (notulensi/laporan rapat)"
- SALAH (menyalin folder granular apa adanya): "Tabel 4j/Prof Puja",
  "MODUL AJAR/Modul Ajar 2022/Semester 5/1. K3L", "Tabel 4h/1. Amang
  Sudarsono/TS 2024-2025"

OUTPUT ada 2 bagian:

1. `recommendation_text` -- ringkasan naratif BAHASA INDONESIA, format
   ringkas & jelas, mis:
   "Untuk menyusun subbab ini diperlukan:
   - Tabel 3.a.1 LKPS yang memuat data kerja sama pendidikan
   - Dokumen RPS tiap mata kuliah
   - Bukti pelaksanaan tinjauan RPS (notulensi atau laporan rapat)"

2. `items` -- PECAH kesimpulan yang SAMA di atas jadi kartu terpisah, SATU
   item per JENIS dokumen (bukan per folder arsip, bukan per kandidat hasil
   pencarian). WAJIB diisi (jangan kosong) kecuali benar-benar tidak ada
   kebutuhan dokumen apapun bisa disimpulkan dari query. Tiap item:
   - "label": nama jenis dokumen, SINGKAT (mis. "Dokumen Modul Ajar",
     "Bukti Pelaksanaan Tinjauan RPS") -- ini judul kartu.
   - "reason": 1 kalimat deskripsi ISI/CAKUPAN dokumen tsb & kenapa
     dibutuhkan utk subbab ini.
   Jumlah item = jumlah poin di recommendation_text (biasanya 2-5 item).
   JANGAN isi field folder_path/path apapun -- item HANYA berisi label+reason
   (kartu murni hasil kesimpulan LLM, tidak terikat ke lokasi file manapun).

OUTPUT FORMAT (JSON ONLY, no explanation outside JSON):
{
  "recommendation_text": "<ringkasan naratif, general/portable>",
  "items": [{"label": "<jenis dokumen, singkat>", "reason": "<isi/cakupan & alasan, 1 kalimat>"}, ...]
}"""


def build_recommendation_prompt(section_title: str,
                                candidate_folders: List[Dict],
                                document_query: List[str],
                                lkps_evidence_query: List[str] = None) -> str:
    parts = [SYSTEM_RECOMMENDATION, ""]
    parts.append(f"## SECTION: {section_title}")
    parts.append("")
    if document_query:
        parts.append("## QUERY KEBUTUHAN DOKUMEN (dasar utama kesimpulan Anda):")
        for q in document_query:
            parts.append(f"- {q}")
        parts.append("")
    if lkps_evidence_query:
        parts.append("## QUERY BUKTI SPESIFIK (dari data LKPS):")
        for q in lkps_evidence_query:
            parts.append(f"- {q}")
        parts.append("")
    if candidate_folders:
        parts.append("## FOLDER KANDIDAT (HANYA referensi arsip -- JANGAN disalin mentah, JANGAN dimasukkan ke items):")
        for i, c in enumerate(candidate_folders[:15], 1):
            meta = c.get("metadata", {})
            folder_path = meta.get("folder_path") or c.get("id")
            parts.append(f"\n[{i}] folder: {folder_path}")
            parts.append((c.get("text") or "")[:300])
        parts.append("")
    else:
        parts.append("## TIDAK ADA folder kandidat ditemukan.")
        parts.append("")
    parts.append(
        "Susun recommendation_text sbg KESIMPULAN jenis dokumen yg "
        "dibutuhkan (general, portable ke prodi lain -- lihat instruksi di "
        "atas), berdasarkan QUERY KEBUTUHAN DOKUMEN. FOLDER KANDIDAT hanya "
        "sbg petunjuk tambahan gambaran ISI dokumen yg mungkin relevan "
        "(bukan utk disalin nama foldernya, bukan utk dimasukkan ke items). "
        "Lalu PECAH kesimpulan itu jadi `items` (satu kartu per jenis "
        "dokumen, field label+reason SAJA -- lihat format di atas)."
    )
    parts.append("Output HANYA JSON:")
    return "\n".join(parts)


# Katalog dokumen master -- daftar tetap jenis dokumen pendukung LED yg
# lazim diminta LAM Teknik. Tahap rekomendasi TIDAK LAGI pakai RAG folder
# kandidat (search_document_registry) -- LLM langsung PILIH dari katalog
# statis ini, tanpa embedding/similarity search sama sekali.
"""
DOCUMENT_CATALOG versi bersih.

Perubahan terhadap versi lama, ringkas:
  - 5 pasang duplikat digabung, label lama dipindah ke aliases
  - 2 entri yang sebenarnya dua dokumen dipecah
  - typo dan kesalahan istilah dibetulkan (Statuta, Pengabdian, Keinsinyuran, Ijazah)
  - tabrakan singkatan RIP dihilangkan
  - field baru: id, tier, parent_id, aliases
  - field lama label, scope, purpose dipertahankan agar kode existing tidak pecah

tier:
  L1 regulasi dan dasar kelembagaan
  L2 penetapan, isi atau substansi
  L3 tata cara, mekanisme, pedoman, panduan
  L4 perencanaan turunan
  L5 bukti pelaksanaan

parent_id menunjuk dokumen yang menjadi induk turunan, baik turunan tingkat
(institusi -> program studi) maupun turunan horizon (jangka panjang -> tahunan).
"""

"""
DOCUMENT_CATALOG versi bersih.

Perubahan terhadap versi lama, ringkas:
  - 5 pasang duplikat digabung, label lama dipindah ke aliases
  - 2 entri yang sebenarnya dua dokumen dipecah
  - typo dan kesalahan istilah dibetulkan (Statuta, Pengabdian, Keinsinyuran, Ijazah)
  - tabrakan singkatan RIP dihilangkan
  - field baru: id, tier, parent_id, aliases
  - field lama label, scope, purpose dipertahankan agar kode existing tidak pecah

tier:
  L1 regulasi dan dasar kelembagaan
  L2 penetapan, isi atau substansi
  L3 tata cara, mekanisme, pedoman, panduan
  L4 perencanaan turunan
  L5 bukti pelaksanaan

parent_id menunjuk dokumen yang menjadi induk turunan, baik turunan tingkat
(institusi -> program studi) maupun turunan horizon (jangka panjang -> tahunan).
"""

"""
DOCUMENT_CATALOG versi bersih.

Perubahan terhadap versi lama, ringkas:
  - 5 pasang duplikat digabung, label lama dipindah ke aliases
  - 2 entri yang sebenarnya dua dokumen dipecah
  - typo dan kesalahan istilah dibetulkan (Statuta, Pengabdian, Keinsinyuran, Ijazah)
  - tabrakan singkatan RIP dihilangkan
  - field baru: id, tier, parent_id, aliases
  - field lama label, scope, purpose dipertahankan agar kode existing tidak pecah

tier:
  L1 regulasi dan dasar kelembagaan
  L2 penetapan, isi atau substansi
  L3 tata cara, mekanisme, pedoman, panduan
  L4 perencanaan turunan
  L5 bukti pelaksanaan

parent_id menunjuk dokumen yang menjadi induk turunan, baik turunan tingkat
(institusi -> program studi) maupun turunan horizon (jangka panjang -> tahunan).
"""

DOCUMENT_CATALOG = [

    # ---------------------------------------------------------------- L1
    {
        "id": "statuta_institusi",
        "label": "Permendikbud tentang Statuta Institusi",
        "tier": "L1",
        "scope": "institusi",
        "purpose": "dasar regulasi dan statuta kelembagaan institusi",
        "aliases": [
            "Permendikbud tentang Status Institusi",
            "Statuta",
            "Statuta Institusi",
        ],
    },
    {
        "id": "sk_pendirian_institusi",
        "label": "SK Pendirian Institusi",
        "tier": "L1",
        "scope": "institusi",
        "purpose": "dasar legal pendirian institusi",
        "aliases": [],
    },

    # ---------------------------------------------------------------- L2
    {
        "id": "vm_institusi_penetapan",
        "label": "Surat penetapan visi misi institusi",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "penetapan rumusan visi dan misi institusi",
        "aliases": [
            "Keputusan Direktur tentang Penetapan Visi dan Misi Institusi",
            "Surat Penetapan Visi dan Misi Institusi",
        ],
    },
    {
        "id": "vm_prodi_penetapan",
        "label": "Surat penetapan visi misi program studi",
        "tier": "L2",
        "scope": "program_studi",
        "parent_id": "vm_institusi_penetapan",
        "purpose": "penetapan rumusan visi keilmuan dan misi program studi",
        "aliases": [
            "Keputusan Direktur tentang Penetapan Visi Keilmuan dan Misi Program Studi",
            "Surat Penetapan Visi dan Misi Program Studi",
            "Visi Keilmuan Program Studi",
        ],
    },
    {
        "id": "struktur_organisasi_institusi",
        "label": "Peraturan Direktur/Rektor Tentang Struktur Organisasi Di Lingkungan Institusi",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "struktur organisasi dan hubungan kelembagaan institusi",
        "aliases": [],
    },
    {
        "id": "struktur_upm",
        "label": "Keputusan Direktur tentang Struktur Organisasi Unit Penjaminan Mutu Institusi",
        "tier": "L2",
        "scope": "institusi",
        "parent_id": "struktur_organisasi_institusi",
        "purpose": "penetapan struktur organisasi unit penjaminan mutu",
        "aliases": [
            "Struktur Tentang Struktur Organisasi Unit Penjaminan Mutu institusi",
        ],
    },
    {
        "id": "tupoksi_pimpinan",
        "label": "Keputusan Direktur/Rektor tentang Tugas dan Fungsi Direktur & Wakil Direktur",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "tugas dan fungsi pimpinan institusi",
        "aliases": [],
    },
    {
        "id": "tupoksi_unit_penunjang",
        "label": "Keputusan Direktur/Rektor Tentang Tugas dan Fungsi Unit Penunjang di Lingkungan Institusi",
        "tier": "L2",
        "scope": "institusi",
        "parent_id": "struktur_organisasi_institusi",
        "purpose": "tugas dan fungsi unit penunjang institusi",
        "aliases": [
            "Keputusan Direktur/Rektor tentang Tugas dan Fungsi Unit Penunjang",
        ],
    },
    {
        "id": "tupoksi_pengawas_internal",
        "label": "Keputusan Direktur/Rektor tentang Fungsi, Tugas dan Wewenang Pengawas Internal",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "fungsi, tugas, dan wewenang pengawas internal",
        "aliases": [],
    },
    {
        "id": "tupoksi_unit_prodi",
        "label": "Keputusan Direktur/Rektor tentang Fungsi, Tugas dan Wewenang Program Studi",
        "tier": "L2",
        "scope": "program_studi",
        "parent_id": "struktur_organisasi_institusi",
        "purpose": "fungsi, tugas, dan wewenang program studi sebagai unit, bukan sebagai jabatan",
        "aliases": [],
    },
    {
        "id": "tupoksi_pejabat_prodi",
        "label": "Keputusan Direktur/Rektor tentang Fungsi, Tugas, dan Wewenang Kepala Departemen dan Ketua Program Studi",
        "tier": "L2",
        "scope": "program_studi",
        "parent_id": "struktur_organisasi_institusi",
        "purpose": "fungsi, tugas, dan wewenang pemangku jabatan kepala departemen dan ketua program studi",
        "aliases": [],
    },
    {
        "id": "tupoksi_jabatan_umum",
        "label": "Surat Keterangan atau Keputusan Tupoksi Jabatan",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "bukti tugas pokok dan fungsi suatu jabatan",
        "aliases": [],
    },
    {
        "id": "penunjukan_prodi",
        "label": "Keputusan Direktur/Rektor tentang Penunjukan Program Studi",
        "tier": "L2",
        "scope": "program_studi",
        "purpose": "penetapan atau pengakuan keberadaan program studi",
        "aliases": [
            "Keputusan Direktur/Rektor tentang Penunjukkan program studi",
        ],
    },
    {
        "id": "penetapan_tim_led",
        "label": "Penetapan Tim Penyusun LED atau akreditasi",
        "tier": "L2",
        "scope": "akreditasi_program_studi",
        "purpose": "penetapan tim penyusun, susunan keanggotaan, pembagian tugas, dan jadwal kerja dalam proses akreditasi",
        "aliases": [
            "SK Tim Penyusun LED",
            "SK Tim Akreditasi",
        ],
    },
    {
        "id": "penetapan_pusat_ppm",
        "label": "Surat Penetapan Pusat Penelitian dan Pengabdian kepada Masyarakat",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "penetapan kelembagaan pusat penelitian dan pengabdian kepada masyarakat",
        "aliases": [
            "Surat Penetapan Pusat Penelitian dan Pengabdian Masyarakat",
        ],
    },
    {
        "id": "penetapan_research_group",
        "label": "Penetapan Research Group",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "penetapan kelompok penelitian",
        "aliases": [],
    },
    {
        "id": "penetapan_research_center",
        "label": "Penetapan Research Center",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "penetapan pusat penelitian",
        "aliases": [],
    },
    {
        "id": "sk_industrial_advisory_board",
        "label": "SK Industrial Advisory Board",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "penetapan dan keberadaan Industrial Advisory Board",
        "aliases": [],
    },
    {
        "id": "penetapan_satuan_ppks",
        "label": "Keputusan Direktur/Rektor tentang Satuan Pencegahan dan Penanganan Kekerasan Seksual di Lingkungan Institusi",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "penetapan satuan pencegahan dan penanganan kekerasan seksual",
        "aliases": [],
    },
    {
        "id": "penetapan_tim_k3",
        "label": "Keputusan Direktur/Rektor tentang Tim Keamanan dan Keselamatan Kerja Lingkungan Institusi",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "penetapan tim keamanan, keselamatan kerja, dan lingkungan",
        "aliases": [],
    },
    {
        "id": "kurikulum_prodi",
        "label": "Dokumen Kurikulum Program Studi",
        "tier": "L2",
        "scope": "program_studi",
        "purpose": "rumusan dan struktur kurikulum program studi",
        "aliases": [
            "Dokumen Kurikulum Program Studi, Evaluasi Pembelajaran",
        ],
    },

    # ---------------------------------------------------------------- L3
    {
        "id": "tata_cara_vm",
        "label": "Peraturan Direktur/Rektor tentang Tata Cara Penyusunan, Pemutakhiran, dan Penggunaan Visi dan Misi",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "mekanisme penyusunan, pemutakhiran, dan penggunaan visi dan misi",
        "aliases": [
            "Peraturan Direktur/Rektor tentang Mekanisme Penyusunan, Pemutakhiran, dan Penggunaan Visi dan Misi",
        ],
    },
    {
        "id": "spmi",
        "label": "Peraturan Direktur/Rektor Tentang Sistem Penjaminan Mutu Internal",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan dan penyelenggaraan sistem penjaminan mutu internal",
        "aliases": [
            "Peraturan Direktur Tentang Sistem Penjaminan Mutu Internal Institusi",
            "SPMI",
        ],
    },
    {
        "id": "sistem_akuntansi",
        "label": "Peraturan Direktur/Rektor tentang Kebijakan dan Sistem Akuntansi Institusi",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan dan sistem akuntansi institusi",
        "aliases": [],
    },
    {
        "id": "pengelolaan_sumber_daya",
        "label": "Peraturan Direktur tentang Pengelolaan Sumber Daya di Lingkungan Institusi",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan pengelolaan sumber daya institusi",
        "aliases": [],
    },
    {
        "id": "penyelenggaraan_penelitian",
        "label": "Peraturan Penyelenggaraan Penelitian",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan penyelenggaraan penelitian",
        "aliases": [],
    },
    {
        "id": "penyelenggaraan_pkm",
        "label": "Peraturan Direktur/Rektor Tentang Penyelenggaraan Pengabdian Kepada Masyarakat",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan penyelenggaraan pengabdian kepada masyarakat",
        "aliases": [],
    },
    {
        "id": "pedoman_kegiatan_anggaran",
        "label": "Peraturan Direktur/Rektor tentang Pedoman Implementasi Kegiatan dan Anggaran",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "pedoman pelaksanaan kegiatan dan pengelolaan anggaran",
        "aliases": [],
    },
    {
        "id": "suasana_akademik",
        "label": "Peraturan Direktur/Rektor tentang Pengembangan Suasana Akademik",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan pengembangan suasana akademik",
        "aliases": [
            "Peraturan Direktur/Rektor Tentang pengembangan Suasana Akademik-Stamp",
        ],
    },
    {
        "id": "pengelolaan_sarpras",
        "label": "Peraturan Direktur/Rektor tentang Pengelolaan Sarana Prasarana Institusi",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan pengelolaan sarana dan prasarana",
        "aliases": [
            "Peraturan direktur/rektor tentang pengelolaan sarana dan prasarana",
        ],
    },
    {
        "id": "distribusi_dana_kerjasama",
        "label": "Peraturan Direktur/Rektor tentang Distribusi Dana Kontribusi Institusi Hasil Kerjasama Pendidikan, Penelitian, Layanan Masyarakat",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "pengaturan distribusi dana hasil kerja sama pendidikan, penelitian, dan layanan masyarakat",
        "aliases": [],
    },
    {
        "id": "tik_institusi",
        "label": "Peraturan Direktur/Rektor tentang Teknologi Informasi dan Komunikasi Institusi",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan pengelolaan teknologi informasi dan komunikasi",
        "aliases": [],
    },
    {
        "id": "pengelolaan_pendidikan",
        "label": "Peraturan Direktur/Rektor tentang Pengelolaan Pendidikan",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan dan mekanisme pengelolaan pendidikan",
        "aliases": [],
    },
    {
        "id": "peraturan_akademik",
        "label": "Peraturan Direktur/Rektor tentang Peraturan Akademik",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "ketentuan dan kebijakan akademik institusi",
        "aliases": [],
    },
    {
        "id": "peraturan_akademik_pjj",
        "label": "Peraturan Akademik PJJ",
        "tier": "L3",
        "scope": "program_studi",
        "parent_id": "peraturan_akademik",
        "purpose": "ketentuan akademik penyelenggaraan pendidikan jarak jauh",
        "aliases": [],
    },
    {
        "id": "dokumen_mutu_ppm",
        "label": "Dokumen Mutu Pusat Penelitian dan Pengabdian kepada Masyarakat",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "dokumen mutu unit penelitian dan pengabdian kepada masyarakat",
        "aliases": [],
    },
    {
        "id": "manual_mutu_ppm",
        "label": "Dokumen Manual Mutu Pusat Penelitian dan Pengabdian Masyarakat",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "manual pelaksanaan sistem mutu unit penelitian dan pengabdian kepada masyarakat",
        "aliases": [],
    },
    {
        "id": "juknis_seleksi_maba",
        "label": "Keputusan Direktur/Rektor Tentang Penetapan Petunjuk Teknis Pelaksanaan Seleksi Mahasiswa baru Institusi",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "penetapan petunjuk teknis seleksi mahasiswa baru",
        "aliases": [],
    },
    {
        "id": "panduan_penyusunan_kurikulum",
        "label": "Panduan Mekanisme Penyusunan Kurikulum di Lingkungan Institusi",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "mekanisme dan panduan penyusunan kurikulum",
        "aliases": [
            "Panduan MEKANISME DAN PANDUAN PENYUSUNAN KURIKULUM di Lingkungan Institusi",
        ],
    },
    {
        "id": "pedoman_kurikulum",
        "label": "Pedoman Kurikulum",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "pedoman pengembangan dan pengelolaan kurikulum",
        "aliases": [],
    },
    {
        "id": "pedoman_capstone",
        "label": "Pedoman Capstone Project PENS FIN",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "pedoman pelaksanaan Capstone Project",
        "aliases": [],
    },
    {
        "id": "pedoman_kerjasama",
        "label": "Pedoman Pengelolaan Kerjasama",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "pedoman pengelolaan kerja sama",
        "aliases": [],
    },
    {
        "id": "kebijakan_jejaring_kemitraan",
        "label": "Peraturan Direktur/Rektor Tentang Perencanaan Pengembangan Jejaring Dan Kemitraan",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan perencanaan pengembangan jejaring dan kemitraan",
        "aliases": [],
    },
    {
        "id": "panduan_pelaksanaan_ppm",
        "label": "Panduan Pelaksanaan Penelitian dan Pengabdian kepada Masyarakat",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "panduan pelaksanaan penelitian dan pengabdian kepada masyarakat",
        "aliases": [],
    },
    {
        "id": "kebijakan_ppks",
        "label": "Peraturan Direktur/Rektor tentang Pencegahan dan Penanganan Kekerasan Seksual di Lingkungan Institusi",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan pencegahan dan penanganan kekerasan seksual",
        "aliases": [],
    },
    {
        "id": "pedoman_smk3",
        "label": "Pedoman Sistem Manajemen Keselamatan dan Kesehatan Kerja Serta Pengelolaan Lingkungan",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "pedoman keselamatan dan kesehatan kerja serta pengelolaan lingkungan",
        "aliases": [],
    },

    # ---------------------------------------------------------------- L4
    {
        "id": "rip_pengembangan",
        "label": "Keputusan Direktur/Rektor tentang Penetapan Rencana Induk Pengembangan (RIP)",
        "tier": "L4",
        "scope": "institusi",
        "purpose": "rencana pengembangan institusi horizon jangka panjang",
        "aliases": [
            "Rencana Induk Pengembangan (RIP)",
            "Rencana Induk Pengembangan",
            "RIP",
        ],
    },
    {
        "id": "renstra_institusi",
        "label": "Rencana Strategis (Renstra) Institusi",
        "tier": "L4",
        "scope": "institusi",
        "parent_id": "rip_pengembangan",
        "purpose": "rencana pengembangan strategis institusi horizon jangka menengah",
        "aliases": [
            "Renstra",
            "Renstra Institusi",
        ],
    },
    {
        "id": "rkt_institusi",
        "label": "Dokumen Rencana Kinerja Tahunan (RKT)",
        "tier": "L4",
        "scope": "institusi",
        "parent_id": "renstra_institusi",
        "purpose": "rencana kerja dan program kegiatan institusi horizon tahunan",
        "aliases": [
            "Rencana Kerja Tahunan (RKT)",
            "Rencana Kerja Tahunan",
            "RKT",
        ],
    },
    {
        "id": "renstra_pkm",
        "label": "Surat Direktur/Rektor tentang Penetapan Rencana Strategis Pengabdian Kepada Masyarakat",
        "tier": "L4",
        "scope": "institusi",
        "parent_id": "renstra_institusi",
        "purpose": "arah dan rencana strategis pengabdian kepada masyarakat",
        "aliases": [],
    },
    {
        "id": "renduk_penelitian",
        "label": "Rencana Induk Penelitian Institusi",
        "tier": "L4",
        "scope": "institusi",
        "parent_id": "rip_pengembangan",
        "purpose": "arah dan rencana pengembangan penelitian jangka panjang",
        "aliases": [
            "Rencana Induk Penelitian (RIP) Institusi",
            "RIP Penelitian",
        ],
    },
    {
        "id": "iku",
        "label": "Dokumen Indikator Kinerja Utama",
        "tier": "L4",
        "scope": "institusi",
        "parent_id": "renstra_institusi",
        "purpose": "indikator dan target pengukuran kinerja utama",
        "aliases": ["IKU"],
    },
    {
        "id": "program_kerja_spi",
        "label": "Program Kerja Pengawasan Tahunan Satuan Pengawas Internal",
        "tier": "L4",
        "scope": "institusi",
        "purpose": "rencana pengawasan internal tahunan",
        "aliases": [],
    },

    # ---------------------------------------------------------------- L5
    {
        "id": "laporan_pkm",
        "label": "Laporan Pengabdian kepada Masyarakat",
        "tier": "L5",
        "scope": "institusi",
        "purpose": "laporan pelaksanaan pengabdian kepada masyarakat",
        "aliases": [
            "Laporan Penganbidan & Surat Penetapan Pusat Penelitian dan Pengabdian Masyarakat",
        ],
    },
    {
        "id": "laporan_review_keuangan",
        "label": "Laporan Hasil Review Laporan Keuangan",
        "tier": "L5",
        "scope": "institusi",
        "purpose": "hasil review dan evaluasi laporan keuangan",
        "aliases": [],
    },
    {
        "id": "evaluasi_pembelajaran_prodi",
        "label": "Dokumen Evaluasi Pembelajaran Program Studi",
        "tier": "L5",
        "scope": "program_studi",
        "parent_id": "kurikulum_prodi",
        "purpose": "hasil evaluasi pelaksanaan pembelajaran program studi",
        "aliases": [
            "Dokumen Kurikulum Program Studi, Evaluasi Pembelajaran",
        ],
    },
    {
        "id": "rps_prodi",
        "label": "Rencana Pembelajaran Semester Program Studi",
        "tier": "L5",
        "scope": "program_studi",
        "parent_id": "kurikulum_prodi",
        "purpose": "rencana pelaksanaan pembelajaran setiap mata kuliah",
        "aliases": ["RPS"],
    },
    {
        "id": "modul_ajar",
        "label": "Dokumen Modul Ajar",
        "tier": "L5",
        "scope": "program_studi",
        "purpose": "bukti modul atau bahan ajar pembelajaran",
        "aliases": [],
    },
    {
        "id": "inventaris_tefa",
        "label": "Daftar Inventaris Teaching Factory",
        "tier": "L5",
        "scope": "institusi",
        "purpose": "inventaris sarana dan fasilitas Teaching Factory",
        "aliases": [],
    },
    {
        "id": "rekap_kunjungan_industri",
        "label": "Rekap Kunjungan Industri",
        "tier": "L5",
        "scope": "institusi",
        "purpose": "rekap kegiatan kunjungan industri",
        "aliases": [],
    },
    {
        "id": "rekap_prestasi",
        "label": "Rekap Prestasi Institusi",
        "tier": "L5",
        "scope": "institusi",
        "purpose": "rekap prestasi institusi",
        "aliases": [],
    },
    {
        "id": "mou_pendidikan",
        "label": "Laporan, Nota, Mou Kerjasama Institusi di bidang Pendidikan",
        "tier": "L5",
        "scope": "institusi",
        "purpose": "bukti kerja sama institusi di bidang pendidikan",
        "aliases": [],
    },
    {
        "id": "mou_penelitian",
        "label": "Laporan, Nota, Mou Kerjasama Institusi di bidang Penelitian",
        "tier": "L5",
        "scope": "institusi",
        "purpose": "bukti kerja sama institusi di bidang penelitian",
        "aliases": [],
    },
    {
        "id": "mou_pkm",
        "label": "Laporan, Nota, Mou Pengabdian kepada Masyarakat (PKM)",
        "tier": "L5",
        "scope": "institusi",
        "purpose": "bukti kerja sama institusi di bidang pengabdian kepada masyarakat",
        "aliases": [],
    },
    {
        "id": "kolaborasi_dosen_industri",
        "label": "Dokumen dan laporan kolaborasi dosen industri",
        "tier": "L5",
        "scope": "program_studi",
        "purpose": "bukti kolaborasi dosen dengan industri",
        "aliases": [],
    },
    {
        "id": "ijazah_s3_dosen",
        "label": "Ijazah Doktoral (S3) Dosen",
        "tier": "L5",
        "scope": "dosen",
        "purpose": "bukti kualifikasi pendidikan doktor dosen",
        "aliases": ["Ijasah Doktoral (S3) Dosen"],
    },
    {
        "id": "jafung_guru_besar",
        "label": "Dokumen Jabatan Fungsional (Guru Besar)",
        "tier": "L5",
        "scope": "dosen",
        "purpose": "bukti jabatan fungsional profesor atau guru besar",
        "aliases": [],
    },
    {
        "id": "jafung_dosen",
        "label": "Dokumen Jabatan Fungsional",
        "tier": "L5",
        "scope": "dosen",
        "purpose": "bukti jabatan fungsional dosen",
        "aliases": [],
    },
    {
        "id": "sertifikat_keinsinyuran",
        "label": "Sertifikat Keinsinyuran",
        "tier": "L5",
        "scope": "dosen",
        "purpose": "bukti sertifikasi atau kompetensi keinsinyuran dosen",
        "aliases": ["Sertifikat Keisyinyuran"],
    },
    {
        "id": "sertifikat_kompetensi_dosen",
        "label": "Sertifikat Kompetensi",
        "tier": "L5",
        "scope": "dosen",
        "purpose": "bukti sertifikasi kompetensi dosen",
        "aliases": [],
    },
    {
        "id": "sertifikat_serdos",
        "label": "Sertifikat Serdos",
        "tier": "L5",
        "scope": "dosen",
        "purpose": "bukti sertifikasi pendidik dosen",
        "aliases": [],
    },
    {
        "id": "lkps_3a2_integrasi_mk",
        "label": "Surat atau Dokumen Penetapan Daftar Mata Kuliah Hasil Integrasi Program Studi dan Bukti Sahih (Bukti dukung LKPS 3a2)",
        "tier": "L5",
        "scope": "program_studi",
        "purpose": "bukti penetapan dan pelaksanaan integrasi mata kuliah program studi",
        "aliases": ["LKPS 3a2"],
    },
    {
        "id": "lkps_3b_penelitian_dtps",
        "label": "Dokumen pendukung kegiatan penelitian DTPS (Bukti dukung LKPS 3b)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti pendukung kegiatan penelitian dosen tetap program studi",
        "aliases": ["LKPS 3b"],
    },
    {
        "id": "lkps_3c_pkm_dtps",
        "label": "Dokumen pendukung pengabdian masyarakat DTPS (Bukti dukung LKPS 3C)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti pendukung kegiatan pengabdian kepada masyarakat dosen tetap program studi",
        "aliases": ["LKPS 3c"],
    },
    {
        "id": "lkps_4b_sertifikasi_tendik",
        "label": "Dokumen Sertifikasi Tenaga Kependidikan (Bukti dukung LKPS 4B)",
        "tier": "L5",
        "scope": "tenaga_kependidikan",
        "purpose": "bukti sertifikasi tenaga kependidikan",
        "aliases": ["LKPS 4b"],
    },
    {
        "id": "lkps_4c_beban_kerja",
        "label": "Dokumen pendukung beban kerja dosen (Bukti dukung LKPS 4C)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti pendukung beban kerja dosen",
        "aliases": ["LKPS 4c"],
    },
    {
        "id": "lkps_4e_pagelaran_dtps",
        "label": "Dokumen pendukung Pagelaran/Pameran/Presentasi/Publikasi Ilmiah DTPS (Bukti dukung LKPS 4e)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti kegiatan pagelaran, pameran, presentasi, atau publikasi ilmiah dosen tetap program studi",
        "aliases": ["LKPS 4e"],
    },
    {
        "id": "lkps_4f1_paten",
        "label": "Bukti dukung Luaran penelitian dan PkM berupa Paten, Paten Sederhana (Bukti dukung LKPS 4f-1)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti luaran penelitian dan pengabdian kepada masyarakat berupa paten atau paten sederhana",
        "aliases": ["LKPS 4f-1"],
    },
    {
        "id": "lkps_4f2_hak_cipta",
        "label": "Bukti dukung penelitian dan PkM berupa Hak Cipta, Desain Produk Industri (Bukti dukung LKPS 4f-2)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti luaran penelitian dan pengabdian kepada masyarakat berupa hak cipta atau desain produk industri",
        "aliases": ["LKPS 4f-2"],
    },
    {
        "id": "lkps_4f3_ttg",
        "label": "Bukti dukung penelitian dan PkM Bagian teknologi tepat guna (Bukti dukung LKPS 4f-3)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti luaran penelitian dan pengabdian kepada masyarakat berupa teknologi tepat guna",
        "aliases": ["LKPS 4f-3"],
    },
    {
        "id": "lkps_4f4_buku_isbn",
        "label": "Bukti dukung penelitian dan PkM berupa buku ber ISBN (Bukti dukung LKPS 4f-4)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti luaran penelitian dan pengabdian kepada masyarakat berupa buku ber-ISBN",
        "aliases": ["LKPS 4f-4"],
    },
    {
        "id": "lkps_4g_produk_diadopsi_dtps",
        "label": "Dokumen Bukti dukung Produk/Jasa DTPS yang Diadopsi oleh Industri/Masyarakat (Bukti dukung LKPS 4g)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti produk atau jasa dosen tetap program studi yang diadopsi industri atau masyarakat",
        "aliases": ["LKPS 4g"],
    },
    {
        "id": "lkps_4h_karya_internasional",
        "label": "Dokumen Bukti dukung Karya ilmiah DTPS di jurnal internasional bereputasi atau publikasi dalam prosiding internasional ber-ISSN/ISBN terindeks Scopus / IEEE Explore / SPIE atau paten dalam 3 tahun terakhir (Bukti dukung LKPS 4h)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti karya ilmiah internasional bereputasi atau paten dosen tetap program studi",
        "aliases": ["LKPS 4h"],
    },
    {
        "id": "lkps_4i_sitasi",
        "label": "Dokumen Bukti dukung Karya Ilmiah DTPS yang Disitasi dalam 3 tahun terakhir (Bukti dukung LKPS 4i)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti sitasi karya ilmiah dosen tetap program studi",
        "aliases": ["LKPS 4i"],
    },
    {
        "id": "lkps_4j_rekognisi",
        "label": "Dokumen bukti pendukung Pengakuan/Rekognisi DTPS (Bukti dukung LKPS 4j)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti pengakuan atau rekognisi dosen tetap program studi",
        "aliases": ["LKPS 4j"],
    },
    {
        "id": "lkps_6b_ipk",
        "label": "Dokumen bukti pendukung IPK Lulusan (Bukti dukung LKPS 6b)",
        "tier": "L5",
        "scope": "lulusan",
        "purpose": "bukti pendukung indeks prestasi kumulatif lulusan",
        "aliases": ["LKPS 6b"],
    },
    {
        "id": "lkps_6c_sertifikat_lulusan",
        "label": "Dokumen bukti pendukung Sertifikat kompetensi / microcredential (Bukti dukung LKPS 6c)",
        "tier": "L5",
        "scope": "lulusan",
        "purpose": "bukti sertifikat kompetensi atau microcredential lulusan",
        "aliases": ["LKPS 6c"],
    },
    {
        "id": "lkps_6d_masa_studi",
        "label": "Dokumen bukti pendukung masa studi lulusan (Bukti dukung LKPS 6d)",
        "tier": "L5",
        "scope": "lulusan",
        "purpose": "bukti pendukung masa studi lulusan",
        "aliases": ["LKPS 6d"],
    },
    {
        "id": "lkps_6e1_publikasi_mhs",
        "label": "Dokumen bukti pendukung Publikasi Ilmiah Mahasiswa (Bukti dukung LKPS 6e1)",
        "tier": "L5",
        "scope": "mahasiswa",
        "purpose": "bukti publikasi ilmiah mahasiswa",
        "aliases": ["LKPS 6e1"],
    },
    {
        "id": "lkps_6e2_pagelaran_mhs",
        "label": "Dokumen bukti pendukung Pagelaran/Pameran/Presentasi/Publikasi Ilmiah Mahasiswa (Bukti dukung LKPS 6e2)",
        "tier": "L5",
        "scope": "mahasiswa",
        "purpose": "bukti pagelaran, pameran, presentasi, atau publikasi ilmiah mahasiswa",
        "aliases": ["LKPS 6e2"],
    },
    {
        "id": "lkps_6e3_luaran_mhs",
        "label": "Dokumen bukti pendukung Luaran Penelitian/PkM yang Dihasilkan Mahasiswa (Bukti dukung LKPS 6e3)",
        "tier": "L5",
        "scope": "mahasiswa",
        "purpose": "bukti luaran penelitian atau pengabdian kepada masyarakat yang dihasilkan mahasiswa",
        "aliases": ["LKPS 6e3"],
    },
    {
        "id": "lkps_6e4_produk_mhs",
        "label": "Dokumen bukti pendukung produk/Jasa yang Dihasilkan Mahasiswa yang Diadopsi oleh Industri/Masyarakat (Bukti dukung LKPS 6e4)",
        "tier": "L5",
        "scope": "mahasiswa",
        "purpose": "bukti produk atau jasa mahasiswa yang diadopsi industri atau masyarakat",
        "aliases": ["LKPS 6e4"],
    },
    {
        "id": "lkps_6h_penelitian_dtps_mhs",
        "label": "Dokumen bukti pendukung Penelitian DTPS yang Melibatkan Mahasiswa (Bukti dukung LKPS 6h)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti penelitian dosen tetap program studi yang melibatkan mahasiswa",
        "aliases": ["LKPS 6h"],
    },
    {
        "id": "lkps_6i_pkm_dtps_mhs",
        "label": "Dokumen bukti pendukung PkM DTPS yang Melibatkan Mahasiswa (Bukti dukung LKPS 6i)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti pengabdian kepada masyarakat dosen tetap program studi yang melibatkan mahasiswa",
        "aliases": ["LKPS 6i"],
    },
]


# ---------------------------------------------------------------- utilitas

VALID_TIERS = {"L1", "L2", "L3", "L4", "L5"}

VALID_SCOPES = {
    "institusi",
    "upps",
    "program_studi",
    "dosen",
    "dosen_tetap_program_studi",
    "mahasiswa",
    "lulusan",
    "tenaga_kependidikan",
    "akreditasi_program_studi",
}

BY_ID = {d["id"]: d for d in DOCUMENT_CATALOG}

LABEL_LOOKUP = {}
for _d in DOCUMENT_CATALOG:
    LABEL_LOOKUP[_d["label"].strip().lower()] = _d["id"]
    for _a in _d.get("aliases", []):
        LABEL_LOOKUP.setdefault(_a.strip().lower(), _d["id"])


import difflib
import re as _re

# kata yang tidak membedakan makna antar entri
_NOISE = {
    "dokumen", "surat", "keputusan", "peraturan", "direktur", "rektor",
    "tentang", "di", "dan", "yang", "institusi", "lingkungan", "sk",
}


def _norm(s):
    s = s.lower()
    s = _re.sub(r"[^\w\s]", " ", s)
    return _re.sub(r"\s+", " ", s).strip()


def _keyset(s):
    return frozenset(_norm(s).split()) - _NOISE


_KEYSETS = []
for _d in DOCUMENT_CATALOG:
    for _name in [_d["label"], *_d.get("aliases", [])]:
        _KEYSETS.append((_keyset(_name), _d["id"]))

_NORM_LOOKUP = {}
for _d in DOCUMENT_CATALOG:
    for _name in [_d["label"], *_d.get("aliases", [])]:
        _NORM_LOOKUP.setdefault(_norm(_name), _d["id"])


def resolve(name, fuzzy=True):
    """Petakan label, alias, atau variasi penulisan ke id kanonik.

    Bertingkat: cocok persis, lalu ternormalisasi, lalu irisan kata kunci,
    lalu kemiripan string. Mengembalikan None bila tidak yakin, termasuk
    bila ada dua kandidat yang sama kuat.
    """
    hit = LABEL_LOOKUP.get(name.strip().lower()) or _NORM_LOOKUP.get(_norm(name))
    if hit or not fuzzy:
        return hit

    target = _keyset(name)
    if not target:
        return None

    scored = {}
    for keys, doc_id in _KEYSETS:
        if not keys:
            continue
        jac = len(target & keys) / len(target | keys)
        scored[doc_id] = max(scored.get(doc_id, 0.0), jac)

    ranked = sorted(scored.items(), key=lambda kv: -kv[1])
    if ranked and ranked[0][1] >= 0.6:
        if len(ranked) == 1 or ranked[0][1] - ranked[1][1] >= 0.1:
            return ranked[0][0]

    close = difflib.get_close_matches(_norm(name), list(_NORM_LOOKUP), n=1, cutoff=0.88)
    return _NORM_LOOKUP[close[0]] if close else None


ABBREVIATIONS = {
    "Permendikbud": "Peraturan Menteri Pendidikan dan Kebudayaan",
    "SK": "Surat Keputusan",
    "LED": "Laporan Evaluasi Diri",
    "LEDPS": "Laporan Evaluasi Diri Program Studi",
    "LKPS": "Laporan Kinerja Program Studi",
    "UPPS": "Unit Pengelola Program Studi",
    "DTPS": "Dosen Tetap Program Studi",
    "PkM": "Pengabdian kepada Masyarakat",
    "PKM": "Pengabdian kepada Masyarakat",
    "RIP": "Rencana Induk Pengembangan",
    "Renstra": "Rencana Strategis",
    "RKT": "Rencana Kinerja Tahunan",
    "IKU": "Indikator Kinerja Utama",
    "RPS": "Rencana Pembelajaran Semester",
    "SPMI": "Sistem Penjaminan Mutu Internal",
    "SPI": "Satuan Pengawas Internal",
    "PJJ": "Pendidikan Jarak Jauh",
    "TIK": "Teknologi Informasi dan Komunikasi",
    "K3": "Keselamatan dan Kesehatan Kerja",
    "SMK3": "Sistem Manajemen Keselamatan dan Kesehatan Kerja",
    "PPKS": "Pencegahan dan Penanganan Kekerasan Seksual",
    "IPK": "Indeks Prestasi Kumulatif",
    "Serdos": "Sertifikasi Dosen",
    "MoU": "Nota Kesepahaman",
    "Mou": "Nota Kesepahaman",
    "ISBN": "International Standard Book Number",
    "ISSN": "International Standard Serial Number",
}

# Singkatan yang muncul di katalog tetapi belum dipastikan kepanjangannya.
# Sengaja tidak ditebak. Isi sendiri lalu pindahkan ke ABBREVIATIONS.
ABBREVIATIONS_UNVERIFIED = {
    "FIN": None,   # pada "Pedoman Capstone Project PENS FIN"
    "SPIE": None,  # penerbit/indeks pada label LKPS 4h
}

_ABBR_RE = _re.compile(
    r"(?<![A-Za-z0-9])(" + "|".join(
        sorted(map(_re.escape, ABBREVIATIONS), key=len, reverse=True)
    ) + r")(?![A-Za-z0-9])"
)


def abbrevs_in(text):
    """Singkatan yang muncul di sebuah teks, beserta kepanjangannya."""
    found = {}
    for m in _ABBR_RE.finditer(text or ""):
        found[m.group(1)] = ABBREVIATIONS[m.group(1)]
    return found


def expand_label(label):
    """Label dengan kepanjangan disisipkan. Untuk tampilan ke pengguna saja,
    JANGAN dipakai sebagai nilai yang dikirim atau dicocokkan.

    Singkatan yang kepanjangannya sudah tertulis di label dibiarkan apa
    adanya, supaya tidak muncul pengulangan.
    """
    low = _norm(label)

    def sub(m):
        full = ABBREVIATIONS[m.group(1)]
        if _norm(full) in low:
            return m.group(1)
        return f"{full} ({m.group(1)})"

    return _ABBR_RE.sub(sub, label)


def glossary_for(entries):
    """Glosarium gabungan untuk sekumpulan entri, siap ditempel ke prompt."""
    found = {}
    for e in entries:
        for field in ("label", "purpose"):
            found.update(abbrevs_in(e.get(field, "")))
    return dict(sorted(found.items()))


def catalog_for_prompt():
    """Katalog yang dikirim ke model.

    id, parent_id, dan aliases SENGAJA tidak dikirim. Field itu untuk
    keperluan internal. Kalau model melihatnya, ia cenderung mengeluarkan id
    di kolom label, dan id snake_case gampang dikarang sendiri sehingga
    sifat closed set bocor tanpa terdeteksi.

    Sebagai gantinya tiap entri diberi nomor. Nomor tidak bisa dikarang jadi
    sesuatu yang terlihat masuk akal, dan ketidakcocokan antara nomor dan
    label yang dikembalikan model langsung terbaca sebagai error.
    """
    out = []
    for i, d in enumerate(DOCUMENT_CATALOG, start=1):
        entry = {
            "no": i,
            "label": d["label"],
            "tier": d["tier"],
            "scope": d["scope"],
            "purpose": d["purpose"],
        }
        abbr = abbrevs_in(d["label"] + " " + d["purpose"])
        if abbr:
            entry["singkatan"] = abbr
        out.append(entry)
    return out


def parse_items(items):
    """Validasi keluaran model.

    items: list of dict dengan field 'no' dan 'label'.
    Kembalikan (accepted, rejected). accepted berisi entri katalog asli.
    """
    accepted, rejected = [], []
    for it in items or []:
        if not isinstance(it, dict):
            rejected.append({"raw": it, "why": "bukan object"})
            continue
        no, label = it.get("no"), (it.get("label") or "").strip()

        if not isinstance(no, int) or not 1 <= no <= len(DOCUMENT_CATALOG):
            rejected.append({"raw": it, "why": f"nomor di luar katalog: {no!r}"})
            continue

        entry = DOCUMENT_CATALOG[no - 1]
        # Cocokkan case-insensitive (+ whitespace ganda dirapatkan) -- model
        # bahasa terbukti kadang mengoreksi kapitalisasi kata sambung
        # ("Tentang" -> "tentang") tanpa bermaksud mengubah makna/identitas
        # dokumen. Isi kata TETAP harus sama persis (bukan fuzzy/similarity)
        # -- ini cuma toleransi kapitalisasi, bukan pelonggaran closed-set.
        if _re.sub(r"\s+", " ", label).casefold() != _re.sub(r"\s+", " ", entry["label"]).casefold():
            # nomor dan label tidak sepakat, jangan tebak mana yang benar
            rejected.append({
                "raw": it,
                "why": "nomor dan label tidak cocok",
                "label_pada_nomor": entry["label"],
            })
            continue

        accepted.append({**entry, "reason": it.get("reason", "")})
    return accepted, rejected


def validate():
    """Kembalikan daftar masalah. Kosong berarti katalog konsisten."""
    problems = []
    seen_ids, seen_labels = set(), set()
    for d in DOCUMENT_CATALOG:
        for field in ("id", "label", "tier", "scope", "purpose"):
            if not d.get(field):
                problems.append(f"{d.get('id', '?')}: field '{field}' kosong")
        if d["id"] in seen_ids:
            problems.append(f"id ganda: {d['id']}")
        seen_ids.add(d["id"])
        key = d["label"].strip().lower()
        if key in seen_labels:
            problems.append(f"label ganda: {d['label']}")
        seen_labels.add(key)
        if d.get("tier") not in VALID_TIERS:
            problems.append(f"{d['id']}: tier tidak valid '{d.get('tier')}'")
        if d.get("scope") not in VALID_SCOPES:
            problems.append(f"{d['id']}: scope tidak valid '{d.get('scope')}'")
        parent = d.get("parent_id")
        if parent and parent not in seen_ids | {x["id"] for x in DOCUMENT_CATALOG}:
            problems.append(f"{d['id']}: parent_id menggantung '{parent}'")
        if parent == d["id"]:
            problems.append(f"{d['id']}: parent_id menunjuk dirinya sendiri")
    return problems


if __name__ == "__main__":
    issues = validate()
    print(f"{len(DOCUMENT_CATALOG)} entri")
    from collections import Counter
    for tier, n in sorted(Counter(d["tier"] for d in DOCUMENT_CATALOG).items()):
        print(f"  {tier}: {n}")
    print(f"{len(LABEL_LOOKUP)} label + alias terdaftar")
    if issues:
        print("\nMASALAH:")
        for p in issues:
            print("  -", p)
    else:
        print("\nkatalog konsisten")

SYSTEM_ASSESS_AND_RECOMMEND = """
Anda adalah asesor akreditasi program studi di Indonesia.

Tugas Anda memilih dokumen pendukung yang relevan untuk menulis SECTION
berdasarkan SECTION, PEDOMAN, dan DATA LKPS.

KATALOG DOKUMEN adalah CLOSED SET. Anda hanya boleh memilih dokumen yang
terdapat dalam KATALOG. Jangan membuat atau mengusulkan dokumen baru.

PRINSIP UTAMA:

Gunakan SECTION sebagai konteks utama.

Gunakan PEDOMAN untuk memahami seluruh informasi yang perlu dibahas dalam
SECTION.

Kemudian periksa KATALOG dan pilih dokumen yang dapat menjadi sumber atau
bukti untuk informasi tersebut.

Jangan hanya mencari kecocokan kata. Pahami fungsi dokumen berdasarkan
label, scope, tier, dan purpose.

CAKUPAN:

Perhatikan seluruh informasi yang diminta PEDOMAN dalam SECTION.

Jika SECTION membutuhkan beberapa jenis informasi dan tersedia beberapa
dokumen yang mendukung informasi tersebut, pilih semuanya.

Dokumen pada tingkat institusi dan program studi dapat sama-sama dipilih
jika keduanya diperlukan untuk menjelaskan SECTION.

Jangan membatasi jumlah dokumen.

Namun, jangan memilih dokumen hanya karena berkaitan secara umum dengan
institusi, program studi, mutu, pendidikan, atau akreditasi.

Dokumen harus memiliki hubungan yang jelas dengan informasi yang perlu
ditulis dalam SECTION.

PEMILIHAN:

Untuk setiap dokumen dalam KATALOG, tanyakan:

"Apakah dokumen ini dapat digunakan sebagai sumber atau bukti untuk
menjelaskan salah satu informasi yang diminta dalam SECTION berdasarkan
PEDOMAN?"

Jika YA, pertimbangkan dokumen tersebut.

Jika TIDAK, jangan pilih.

Jangan menganggap dokumen yang lazim digunakan dalam akreditasi tersedia
jika tidak ada di KATALOG.

Jangan membuat dokumen alternatif jika tidak tersedia di KATALOG.

Jika beberapa dokumen mendukung aspek yang berbeda, pilih semuanya.

Jika beberapa dokumen hanya berbeda nama tetapi memiliki fungsi yang sama
untuk kebutuhan yang sama, pilih yang paling sesuai.

ATURAN KATALOG:

"label" harus disalin persis dari KATALOG.

Jangan mengubah, memparafrase, menyingkat, menerjemahkan, atau membuat
label baru.

"no" dan "label" harus berasal dari entri KATALOG yang sama.

Gunakan scope, tier, dan purpose hanya untuk membantu memilih dokumen.

ATURAN REASON:

Reason menjelaskan secara spesifik informasi dalam SECTION yang dapat
didukung oleh dokumen tersebut.

Jangan menggunakan alasan yang terlalu umum seperti "mendukung VMTS",
"mendukung mutu", atau "mendukung pengembangan program studi".

Reason harus menjelaskan hubungan dokumen dengan kebutuhan SECTION.

ATURAN LKPS:

Jika tidak ada DATA LKPS:
lkps_sufficient = null
lkps_evidence_query = []

Jika ada DATA LKPS, tentukan apakah data LKPS sudah cukup untuk menulis
bagian yang membutuhkan data tersebut.

Jika belum cukup:
lkps_sufficient = false

lkps_evidence_query hanya boleh berisi identifier yang tertulis secara
eksplisit dalam DATA LKPS.

Jangan membuat atau menebak identifier.

VALIDASI:

Sebelum menghasilkan output, periksa kembali seluruh KATALOG.

Pastikan tidak ada dokumen yang relevan dengan kebutuhan SECTION yang
terlewat hanya karena namanya menggunakan istilah yang berbeda.

Sebaliknya, hapus dokumen yang hanya memiliki hubungan umum atau tidak
dapat digunakan untuk mendukung informasi SECTION.

OUTPUT JSON VALID SAJA:

{
  "lkps_sufficient": true,
  "lkps_evidence_query": [],
  "recommendation_text": "...",
  "items": [
    {
      "no": 1,
      "label": "SALIN PERSIS DARI KATALOG",
      "reason": "Alasan spesifik."
    }
  ]
}
"""

#claude
# SYSTEM_ASSESS_AND_RECOMMEND = """
# Anda adalah asesor akreditasi program studi di Indonesia.

# Tugas Anda memilih dokumen pendukung yang paling sesuai untuk SECTION
# berdasarkan SECTION, PEDOMAN, DATA LKPS, dan DOCUMENT_CATALOG.

# DOCUMENT_CATALOG adalah CLOSED SET. Anda hanya boleh memilih dokumen yang
# terdapat di katalog. Jangan membuat, menambahkan, menebak, atau mengusulkan
# dokumen di luar katalog.

# PRINSIP UTAMA:

# SECTION adalah batas utama pemilihan dokumen.

# Pedoman digunakan untuk menentukan informasi yang perlu dijelaskan dalam
# SECTION.

# Dokumen harus dipilih karena diperlukan untuk menjelaskan atau membuktikan
# informasi tersebut, bukan hanya karena memiliki hubungan umum dengan topik
# SECTION.

# Setiap dokumen harus FIT dengan substansi SECTION yang sedang ditulis.

# Dokumen yang lebih sesuai untuk SECTION lain tidak boleh dipilih hanya
# karena masih memiliki hubungan dengan topik akreditasi secara umum.

# Jangan menggunakan pengetahuan umum tentang dokumen akreditasi untuk
# menambahkan dokumen yang tidak diperlukan oleh SECTION.

# ANALISIS:

# 1. Pahami fokus SECTION.
# 2. Baca PEDOMAN dan tentukan informasi yang perlu dijelaskan atau
#    dibuktikan dalam SECTION.
# 3. Identifikasi jenis dokumen yang dapat secara langsung mendukung informasi
#    tersebut.
# 4. Cocokkan kebutuhan tersebut dengan DOCUMENT_CATALOG.
# 5. Nilai kecocokan setiap kandidat terhadap SECTION.
# 6. Hanya pilih kandidat dengan skor 1 atau 2.
# 7. Validasi kembali agar dokumen dari SECTION lain tidak ikut terpilih.

# KECOCOKAN DOKUMEN:

# Berikan skor 1 sampai 4 untuk setiap kandidat:

# 1 = sangat sesuai dengan substansi SECTION dan diperlukan.
# 2 = sesuai dengan substansi SECTION dan dapat mendukungnya secara langsung.
# 3 = berhubungan tetapi lebih sesuai untuk SECTION lain atau hanya
#     mendukung secara tidak langsung.
# 4 = tidak sesuai dengan substansi SECTION.

# Hanya dokumen dengan skor 1 atau 2 yang boleh masuk OUTPUT.

# Jangan memilih dokumen hanya karena:
# - memiliki kata yang sama dengan PEDOMAN;
# - memiliki hubungan umum dengan SECTION;
# - mendukung institusi atau program studi secara umum;
# - dapat digunakan untuk implementasi secara tidak langsung;
# - merupakan dokumen yang umum digunakan dalam akreditasi.

# Jika dokumen lebih tepat digunakan untuk SECTION lain, beri skor 3
# meskipun dokumen tersebut masih memiliki hubungan dengan topik yang sedang
# dibahas.

# CAKUPAN:

# Gunakan scope, tier, dan purpose pada DOCUMENT_CATALOG untuk menentukan
# kecocokan dokumen.

# Pertimbangkan tingkat dokumen hanya jika tingkat tersebut diperlukan oleh
# substansi SECTION.

# Jangan menganggap semua tingkat dokumen harus digunakan.

# Jangan memperluas SECTION hanya karena terdapat hubungan antara objek pada
# tingkat yang berbeda.

# Jika SECTION membutuhkan beberapa informasi yang berbeda, dokumen yang
# mendukung masing-masing informasi dapat dipilih.

# Jika satu dokumen sudah memenuhi suatu kebutuhan, jangan memilih dokumen
# lain yang hanya memberikan dukungan yang sama.

# PEDOMAN:

# Jangan mengubah seluruh isi PEDOMAN menjadi kebutuhan dokumen.

# Bedakan informasi yang memang perlu didukung dengan uraian, analisis,
# rasional, atau konteks yang cukup ditulis berdasarkan informasi yang
# tersedia.

# Dokumen hanya dipilih jika PEDOMAN dan SECTION memberikan dasar yang jelas
# bahwa informasi tersebut perlu didukung.

# Jika PEDOMAN menyebut suatu bidang sebagai bagian dari konteks, jangan
# otomatis memilih dokumen dari bidang tersebut.

# Dokumen dari bidang tertentu hanya dipilih jika bidang tersebut merupakan
# bagian dari substansi yang harus dijelaskan atau dibuktikan dalam SECTION.

# DOCUMENT_CATALOG:

# Setiap entri katalog memiliki:
# - no
# - label
# - scope
# - tier
# - purpose

# Gunakan seluruh metadata tersebut untuk menentukan kecocokan.

# "no" harus berasal dari entri katalog yang sama dengan "label".

# "label" harus disalin persis dari katalog.

# Jangan mengubah, memparafrase, menyingkat, menerjemahkan, menggabungkan,
# atau membuat label baru.

# Jika tidak terdapat dokumen yang sesuai di katalog, jangan membuat
# alternatif.

# ATURAN REASON:

# Reason harus menjelaskan secara spesifik informasi SECTION yang didukung
# oleh dokumen.

# Reason harus singkat dan langsung.

# Jangan menggunakan alasan yang hanya menyatakan hubungan umum.

# Reason tidak boleh memperluas fungsi dokumen melebihi purpose pada katalog.

# VALIDASI:

# Sebelum menghasilkan output, lakukan pemeriksaan berikut:

# 1. Apakah dokumen benar-benar sesuai dengan SECTION aktif?
# 2. Apakah dokumen diperlukan berdasarkan PEDOMAN?
# 3. Apakah dokumen lebih cocok untuk SECTION lain?
# 4. Apakah hubungan dokumen dengan SECTION hanya tidak langsung?
# 5. Apakah ada kandidat yang lebih tepat dalam katalog?

# Hapus dokumen jika:
# - skor 3 atau 4;
# - lebih sesuai untuk SECTION lain;
# - hanya memiliki hubungan tidak langsung;
# - tidak diperlukan untuk informasi yang diminta PEDOMAN.

# Jangan mengejar jumlah dokumen.

# Tujuan akhir adalah memilih seluruh dokumen yang benar-benar diperlukan
# untuk SECTION, tetapi tidak memilih dokumen yang hanya berhubungan secara
# umum.

# ATURAN LKPS:

# Jika tidak ada DATA LKPS:
# lkps_sufficient = null
# lkps_evidence_query = []

# Jika ada DATA LKPS, tentukan apakah data LKPS sudah cukup untuk kebutuhan
# SECTION yang memerlukan data tersebut.

# Jika data belum cukup:
# lkps_sufficient = false

# lkps_evidence_query hanya boleh berisi identifier yang tertulis secara
# eksplisit dalam DATA LKPS.

# Jangan membuat, menebak, atau mengubah identifier.

# OUTPUT:

# Keluarkan JSON valid saja.

# {
#   "lkps_sufficient": true,
#   "lkps_evidence_query": [],
#   "recommendation_text": "...",
#   "items": [
#     {
#       "no": 1,
#       "label": "SALIN PERSIS DARI KATALOG",
#       "score": 1,
#       "reason": "Alasan spesifik."
#     }
#   ]
# }

# Field score wajib bernilai 1 atau 2 pada OUTPUT AKHIR.

# Jangan menampilkan dokumen dengan skor 3 atau 4.

# Jangan menampilkan proses analisis.
# """

def build_assess_and_recommend_prompt(section_title: str,
                                      pedoman: List[Dict] = None,
                                      rubric: List[Dict] = None,
                                      lkps_results: List[Dict] = None,
                                      needs_lkps: bool = False) -> str:
    """Pemilihan dokumen dari DOCUMENT_CATALOG (statis, TANPA RAG/embedding)
    + penilaian kecukupan LKPS, dalam 1 prompt.

    CATATAN ALIRAN: pedoman di sini sudah melewati build_select_pedoman_prompt
    (TAHAP terpisah), jadi kandidat yang salah subbab semestinya sudah dibuang
    di hulu. Karena itu prompt di bawah TIDAK lagi menyaring ulang berdasarkan
    tebakan subbab -- penyaringan ganda justru membuang dokumen yang sah.

    Konsekuensi pemisahan itu: kalau tahap seleksi mengembalikan array kosong
    (atau gagal parse), pedoman di sini ikut kosong. Dulu blok PEDOMAN tinggal
    dihilangkan diam-diam dan LLM menebak dari judul SECTION + 94 entri katalog
    -- persis mode over-selection. Sekarang kondisi itu dinyatakan eksplisit
    supaya LLM mengembalikan items kosong, bukan menebak."""
    parts = [SYSTEM_ASSESS_AND_RECOMMEND, ""]
    parts.append(f"## SECTION: {section_title}")
    parts.append("")
    if pedoman:
        parts.append("## PEDOMAN PENULISAN (sudah diverifikasi cocok dgn SECTION ini):")
        for p in pedoman[:8]:
            # 400 char dulu aman krn kandidat masih mentah & banyak. Sesudah
            # tahap seleksi, sisa kandidat sedikit tapi tiap frasa jadi penting
            # -- memotong di 400 bisa membuang frasa KELAS A yg jadi penambat.
            t = (p.get("text") or "")[:1200]
            parts.append(f"- {t}")
        parts.append("")
    else:
        parts.append("## PEDOMAN PENULISAN: TIDAK TERSEDIA")
        parts.append(
            "Tahap seleksi pedoman tidak menemukan pedoman yang cocok untuk "
            "SECTION ini. Anda TIDAK punya dasar untuk memilih dokumen. "
            "Kembalikan \"items\": [] dan jelaskan pada recommendation_text "
            "bahwa pedoman untuk subbab ini belum tersedia. JANGAN menebak "
            "dokumen dari judul SECTION."
        )
        parts.append("")
    if rubric:
        parts.append("## RUBRIK SKOR 4 (target kualitas subbab ini):")
        for r in rubric[:5]:
            t = (r.get("text") or "")[:400]
            parts.append(f"- {t}")
        parts.append("")
    if needs_lkps:
        parts.append("## HASIL PENCARIAN LKPS:")
        if lkps_results:
            for i, c in enumerate(lkps_results[:8], 1):
                parts.append(f"\n[{i}] {(c.get('text') or '')[:500]}")
        else:
            parts.append("(tidak ada hasil)")
        parts.append("")
    else:
        parts.append("## Subbab ini TIDAK butuh data LKPS -- set lkps_sufficient: null, lkps_evidence_query: [].")
        parts.append("")
    # Format SATU baris per entri, label diapit kutip dan diakhiri "|" --
    # supaya LLM tidak ikut menyalin tag [tier, scope] sbg bagian dari
    # label saat menyalin balik ke output JSON (bug nyata yg pernah
    # terjadi: label keluar sbg "... Institusi [L1, institusi]").
    parts.append("## KATALOG (closed set -- pilih HANYA dari daftar bernomor ini):")
    parts.append('Format tiap baris: NOMOR. "LABEL" | metadata (BUKAN bagian dari label)')
    parts.append("")
    for entry in catalog_for_prompt():
        line = f"{entry['no']}. \"{entry['label']}\" | tier={entry['tier']} scope={entry['scope']} -- {entry['purpose']}"
        parts.append(line)
        if entry.get("singkatan"):
            abbr_str = ", ".join(f"{k}={v}" for k, v in entry["singkatan"].items())
            parts.append(f"   (singkatan: {abbr_str})")
    parts.append("")
    parts.append(
        "PENTING: field \"label\" pada output HANYA berisi teks di antara "
        "tanda kutip di atas -- JANGAN sertakan nomor, tanda kutip, atau "
        "metadata setelah tanda \"|\" sebagai bagian dari label."
    )
    # Kontrak output diulang di sini krn katalog ~9rb token memisahkan blok
    # OUTPUT di atas dari titik model mulai menulis. Ini yg terakhir dibaca.
    parts.append(
        "Setiap item WAJIB punya \"no\" (bilangan bulat dari daftar di atas), "
        "\"label\", \"score\" (hanya 1 atau 2), dan \"reason\". Pilih dokumen "
        "untuk SETIAP lapisan dan tingkat yang dipicu PEDOMAN, bukan satu "
        "dokumen per frasa."
    )
    parts.append(
        "recommendation_text dan reason WAJIB Bahasa Indonesia."
    )
    parts.append("Output HANYA JSON:")
    return "\n".join(parts)


# ──────────────────────────────────────────────────────────────────────
# Fallback: usulan dokumen DI LUAR katalog -- HANYA dipanggil generator.py
# setelah build_assess_and_recommend_prompt() (di atas) sudah dijalankan
# dan hasilnya BENAR-BENAR kosong (bukan gagal parse, bukan kegagalan LLM
# invoke) -- artinya LLM sudah menelusuri seluruh KATALOG closed-set dan
# tidak menemukan satupun entri yang cocok. Prompt TERPISAH dari
# SYSTEM_ASSESS_AND_RECOMMEND supaya aturan closed-set di prompt utama
# tidak pernah melunak/tercampur dgn izin mengarang ini.
# ──────────────────────────────────────────────────────────────────────

SYSTEM_SUGGEST_CUSTOM_DOCUMENT = """
Anda adalah asesor akreditasi program studi di Indonesia.

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
}
"""


def build_suggest_custom_document_prompt(section_title: str,
                                         pedoman: List[Dict] = None,
                                         rubric: List[Dict] = None) -> str:
    """Dipanggil generator.py HANYA sbg fallback -- lihat catatan di atas."""
    parts = [SYSTEM_SUGGEST_CUSTOM_DOCUMENT, ""]
    parts.append(f"## SECTION: {section_title}")
    parts.append("")
    if pedoman:
        parts.append("## PEDOMAN PENULISAN:")
        for p in pedoman[:6]:
            t = (p.get("text") or "")[:400]
            parts.append(f"- {t}")
        parts.append("")
    if rubric:
        parts.append("## RUBRIK SKOR 4:")
        for r in rubric[:5]:
            t = (r.get("text") or "")[:400]
            parts.append(f"- {t}")
        parts.append("")
    parts.append("Output HANYA JSON:")
    return "\n".join(parts)


# ──────────────────────────────────────────────────────────────────────
# Revise via chatbot
# ──────────────────────────────────────────────────────────────────────

SYSTEM_REVISE = """Anda penulis LED akreditasi. User meminta revisi draft.
Output: DRAFT BARU UTUH (bukan diff). Tetap pertahankan struktur paragraf.
Setiap klaim faktual harus tetap menyebut sumber (sumber: NAMA_FILE)."""


def build_revise_prompt(section_title: str,
                        current_draft: str,
                        user_request: str,
                        new_context: List[Dict] = None,
                        history: List[Dict] = None) -> str:
    parts = [SYSTEM_REVISE, ""]
    parts.append(f"## SECTION: {section_title}")
    parts.append("")
    parts.append("## DRAFT SAAT INI:")
    parts.append(current_draft)
    parts.append("")

    if new_context:
        parts.append("## KONTEKS TAMBAHAN (dari retrieval ulang):")
        for c in new_context:
            meta = c.get("metadata", {})
            fname = (meta.get("filename") or meta.get("judul")
                     or meta.get("chunk_id") or "?")
            parts.append(f"\n[FILE: {fname}]\n{(c.get('text') or '')[:1500]}")
        parts.append("")

    if history:
        parts.append("## RIWAYAT PERCAKAPAN SEBELUMNYA:")
        for h in history[-6:]:
            parts.append(f"{h['role'].upper()}: {h['message']}")
        parts.append("")

    parts.append("## PERMINTAAN USER:")
    parts.append(user_request)
    parts.append("")
    parts.append("Tulis ulang DRAFT BARU UTUH sekarang:")
    return "\n".join(parts)