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


# ──────────────────────────────────────────────────────────────────────
# TAHAP 3 — Bangun checklist fakta yg dibutuhkan
# ──────────────────────────────────────────────────────────────────────

# SYSTEM_CHECKLIST = """
# Anda adalah asesor akreditasi program studi di Indonesia.

# Tugas Anda adalah membuat checklist kebutuhan informasi untuk MENULIS
# SUBBAB yang sedang aktif berdasarkan Pedoman Penulisan dan Rubrik Penilaian.

# Checklist ini akan digunakan sebagai query untuk mencari fakta pada LKPS
# dan/atau dokumen Evidence.

# PRINSIP UTAMA:

# Checklist hanya berisi informasi yang benar-benar diperlukan untuk
# menjelaskan subbab yang sedang ditulis.

# Pedoman adalah sumber utama untuk menentukan ISI subbab.
# Rubrik hanya digunakan untuk menentukan KEDALAMAN dan KUALITAS analisis.

# Jangan mengubah setiap poin rubrik menjadi pertanyaan.

# Jangan membuat pertanyaan hanya karena suatu indikator terdapat dalam
# Rubrik tetapi tidak relevan dengan isi subbab.

# Jangan membuat fakta, angka, nama, capaian, atau kebutuhan dokumen yang
# tidak dapat diturunkan dari Pedoman/Rubrik.

# ATURAN:

# 1. Identifikasi terlebih dahulu tujuan dan ruang lingkup subbab dari Pedoman.

# 2. Tentukan informasi apa yang diperlukan agar subbab tersebut dapat
#    dijelaskan dan dianalisis.

# 3. Buat checklist hanya untuk informasi yang:
#    - diperlukan oleh isi subbab;
#    - relevan dengan analisis;
#    - dapat ditemukan pada LKPS atau Evidence.

# 4. Jika Pedoman hanya membutuhkan penjelasan konseptual atau regulasi,
#    jangan membuat pertanyaan statistik.

# 5. Jika Pedoman membutuhkan struktur, mekanisme, kebijakan, atau proses,
#    cari fakta yang menjelaskan hal tersebut.

# 6. Jika Pedoman membutuhkan data kuantitatif, baru buat pertanyaan
#    kuantitatif yang spesifik.

# 7. Jika Pedoman merujuk LKPS, pertanyaan dapat diarahkan ke LKPS.

# 8. Jika Pedoman membutuhkan bukti formal, pertanyaan diarahkan ke Evidence.

# 9. Jangan meminta informasi yang hanya muncul karena Rubrik memberikan
#    contoh karakteristik skor 4, jika informasi tersebut tidak diperlukan
#    untuk isi subbab.

# 10. Jangan membuat pertanyaan untuk setiap indikator Rubrik.

# Jangan membuat pertanyaan statistik atau data dosen jika tidak diperlukan
# untuk menjelaskan Rasional.

# KOSAKATA:

# Gunakan istilah yang lazim digunakan dalam dokumen institusi.
# Boleh menggunakan sinonim atau istilah alternatif agar mudah dicari pada
# dokumen.

# Contoh:
# "tim penyusun" → "tim akreditasi", "tim borang", "tim penyusun LED"
# "keputusan direktur" → "SK Direktur", "Surat Keputusan Direktur"

# OUTPUT:

# Buat 3-8 item jika memang diperlukan.
# Tidak ada jumlah minimum.

# Jika hanya membutuhkan 2 informasi, buat 2 item.
# Jika tidak ada informasi faktual yang perlu dicari, kembalikan daftar kosong.

# Format:
# - satu kebutuhan informasi per baris;
# - berupa pertanyaan atau frasa pencarian singkat;
# - Bahasa Indonesia;
# - konkret dan dapat digunakan untuk RAG.

# Jangan memberikan penjelasan tambahan.
# """

SYSTEM_CHECKLIST = """
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


def build_checklist_prompt(section_title: str,
                            pedoman: List[Dict],
                            rubric: List[Dict]) -> str:
    parts = [SYSTEM_CHECKLIST, ""]
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
   - Sumber Evidence (dokumen SK/notulensi/laporan): (sumber: NAMA_FILE)
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
                          checklist: List[str] = None) -> str:
    parts = [SYSTEM_GENERATE, ""]
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
            fname = (meta.get("filename") or meta.get("chunk_id")
                     or f"evidence_{i}")
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
        "di luar narasi. Output HANYA berupa narasi murni."
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
  },
  "missing_facts":  ["fakta yg seharusnya ada tapi tidak ter-cover"],
  "hallucinated":   ["klaim di answer yg tidak didukung context"]
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


SYSTEM_ASSESS_AND_RECOMMEND = """Anda adalah asesor akreditasi program studi di Indonesia.

Anda harus membuat TIGA keputusan SEKALIGUS dari context yang diberikan:

## KEPUTUSAN 1 — lkps_sufficient
KALAU ada HASIL PENCARIAN LKPS di bawah: nilai apakah data itu SUDAH CUKUP
untuk menulis subbab ini dengan baik, atau MASIH PERLU bukti dokumen
pendukung tambahan (mis. surat/SK yang disebut di data LKPS tapi isinya
sendiri tidak ada di sana). KALAU TIDAK ADA hasil pencarian LKPS (subbab
tidak butuh LKPS), set null.

## KEPUTUSAN 2 — lkps_evidence_query
HANYA isi field ini KALAU lkps_sufficient = false. Ekstrak IDENTIFIER
SPESIFIK yang disebut di data LKPS (No. Surat, nama dokumen, judul dokumen,
nomor SK, nama kegiatan, referensi dokumen) untuk dijadikan query pencarian
bukti pendukung spesifik -- BUKAN query umum, tapi identifier konkret yang
tersurat di data. Contoh: kalau data menyebut "MoU PT ABC, Nomor:
123/MOU/PENS/2025", maka query: "MoU PT ABC", "123/MOU/PENS/2025". Kalau
lkps_sufficient = true atau null, biarkan array ini kosong.

## KEPUTUSAN 3 — recommendation_text & items
Simpulkan JENIS dokumen pendukung apa saja yang perlu disiapkan user untuk
menyusun subbab ini, dan jelaskan singkat ISI/CAKUPAN dokumen tsb --
berdasarkan PEMAHAMAN ANDA atas kebutuhan subbab (dari QUERY KEBUTUHAN
DOKUMEN), BUKAN sekadar menyalin nama folder hasil pencarian arsip.

⚠️ PENTING -- HASIL HARUS GENERIC/PORTABLE, bukan spesifik ke satu arsip:
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


def build_assess_and_recommend_prompt(section_title: str,
                                      candidate_folders: List[Dict],
                                      document_query: List[str],
                                      lkps_results: List[Dict] = None,
                                      needs_lkps: bool = False) -> str:
    """Gabungan build_lkps_sufficiency_prompt + build_lkps_evidence_query_prompt
    + build_recommendation_prompt -- context LKPS results (kalau ada) +
    candidate folders ditulis SEKALI dalam 1 prompt."""
    parts = [SYSTEM_ASSESS_AND_RECOMMEND, ""]
    parts.append(f"## SECTION: {section_title}")
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
    if document_query:
        parts.append("## QUERY KEBUTUHAN DOKUMEN (dasar utama kesimpulan Anda):")
        for q in document_query:
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
        "sbg petunjuk tambahan gambaran ISI dokumen yg mungkin relevan. "
        "Lalu PECAH kesimpulan itu jadi `items`."
    )
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
