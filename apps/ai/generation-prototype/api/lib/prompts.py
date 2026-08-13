"""Template prompt utk 6-tahap pipeline."""
from typing import List, Dict


# ──────────────────────────────────────────────────────────────────────
# TAHAP 3 — Bangun checklist fakta yg dibutuhkan
# ──────────────────────────────────────────────────────────────────────

SYSTEM_CHECKLIST = """
Anda asesor akreditasi prodi Indonesia yang berpengalaman.

⚠️ BAHASA OUTPUT: WAJIB Bahasa Indonesia 100%.
   Dilarang menulis pertanyaan dalam bahasa Inggris.
   Semua dokumen sumber & pembaca akhir berbahasa Indonesia.

Tugas Anda: berdasarkan pedoman penulisan + rubrik penilaian, buat
daftar pertanyaan/topik faktual berbahasa INDONESIA yang harus dicari
di dokumen LKPS & evidence untuk menulis section ini agar memenuhi
skor maksimal.

PENTING tentang KOSAKATA:
- Dokumen prodi biasanya pakai istilah UMUM, bukan istilah teknis
  pedoman. Saat menulis pertanyaan, GUNAKAN istilah umum supaya
  pertanyaan dapat match dokumen real.
- Contoh transformasi:
    "LEDPS"   → tulis "dokumen akreditasi", "borang akreditasi",
                "laporan evaluasi diri", "LED"
    "UPPS"    → "fakultas", "departemen", "unit pengelola"
    "DTPS"    → "dosen tetap", "dosen pengampu", "tenaga pengajar"
    "VMTS"    → "visi misi", "visi tujuan strategi"
- BOLEH tambahkan kata kunci alternatif dalam tanda kurung.
  Contoh: "Bukti SK pembentukan tim penyusun (tim akreditasi /
          tim borang / tim self-assessment)?"
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
   (sumber: NAMA_FILE)
2. Jika konteks tidak menyebut suatu fakta, JANGAN buat klaim tentang itu.
3. Gunakan rubrik penilaian sebagai TARGET KUALITAS — bukan fakta yg dikutip.
4. Format output: paragraf naratif (bullet boleh kalau memang perlu).
5. Self-contained: ada pembuka, isi, penutup section.

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

    if rubric:
        parts.append("## RUBRIK PENILAIAN (target skor 4):")
        for r in rubric[:5]:
            t = (r.get("text") or "")[:500]
            parts.append(f"- {t}")
        parts.append("")

    if checklist:
        parts.append("## CHECKLIST FAKTA YANG HARUS DIPENUHI:")
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
        for i, c in enumerate(lkps_chunks, start=1):
            meta = c.get("metadata", {})
            fname = (meta.get("judul") or meta.get("sheet")
                     or meta.get("chunk_id") or f"lkps_{i}")
            parts.append(f"\n[LKPS: {fname}]")
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
        f"Tulis narasi LED untuk section '{section_title}' dalam 2-4 paragraf. "
        "Penuhi rubrik penilaian sebisa mungkin BERDASARKAN konteks. "
        "Wajib menyebut `(sumber: NAMA_FILE)` setelah setiap klaim faktual. "
        "Kalau ada checklist yg tidak bisa dipenuhi karena tidak ada data, "
        "tulis ringkasan singkat di akhir: 'Catatan: data berikut belum "
        "tersedia: [...]'."
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
