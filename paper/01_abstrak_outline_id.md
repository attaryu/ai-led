# Outline Paper & Abstrak — Versi Bahasa Indonesia

**Judul kerja:**
> "Pemanggilan Tool Native vs Berbasis Prompt: Studi Komparatif Agen LLM Open-Weight untuk Audit Mutu Internal Pendidikan Tinggi"

**Target venue:** preprint arXiv + prosiding konferensi Indonesia (ICITISEE / SENTIKA / SNATIA) atau jurnal Sinta 2-3.

**Anggaran halaman:** 6 halaman IMRaD (≈4500 kata di luar referensi).

---

## Abstrak (≈220 kata)

Audit Mutu Internal (AMI) untuk akreditasi pendidikan tinggi di
Indonesia memerlukan penilaian manual terhadap puluhan indikator
berdasarkan rubrik kompleks dengan dua sumber bukti yang heterogen:
Laporan Evaluasi Diri (LED) yang bersifat kualitatif dan Laporan
Kinerja Program Studi (LKPS) yang kuantitatif. Penelitian ini menyelidiki
apakah agen *Large Language Model* (LLM) *open-weight* dapat
mengotomatisasi tugas penilaian lintas-modal ini, dan bagaimana pilihan
paradigma agen — *native function calling* versus dispatch JSON
berbasis prompt — memengaruhi performa pada tipe indikator kualitatif
maupun kuantitatif.

Kami mengimplementasikan agen *Retrieval-Augmented Generation* (RAG)
yang melakukan *cross-referencing* antara *chunk* LED yang ter-indeks
secara vektor dengan tabel LKPS terstruktur melalui empat *tool*
khusus, kemudian melakukan *benchmark* tiga model *open-weight*
berukuran sebanding (24–35 miliar parameter): generalis dengan
*tool-tuning* (`qwen3.5:35b`), model fokus *reasoning* dalam mode
berbasis prompt (`deepseek-r1:32b`), dan model *chat* berukuran
menengah (`mistral-small3.2:24b`), dibandingkan terhadap referensi
yang dihasilkan oleh Claude pada seluruh 60 indikator rubrik LAM
Teknik.

Generalis dengan *tool-tuning* mencapai akurasi within-±1 sebesar 88,3%
dan *exact match* 36,7% (MAE 0,79), unggul jauh dari model *reasoning*
(46,7%; MAE 1,79) maupun model *chat* menengah (51,7%; MAE 1,70).
Kami mengidentifikasi tiga *failure mode* berbeda — *quantitative
extraction collapse*, *tutorial-mode output*, dan *false refusal* —
serta mendiskusikan implikasinya bagi pemanfaatan agen *open-weight*
dalam evaluasi akademik berstandar.

**Kata kunci:** *large language models*, *retrieval-augmented
generation*, *tool calling*, penilaian otomatis, audit mutu,
teks Bahasa Indonesia berdaya rendah, model *open-weight*.

---

## I. Pendahuluan (≈0,8 hal)

**Paragraf 1 — Motivasi masalah**
- Akreditasi pendidikan tinggi Indonesia (LAM Teknik) berbasis rubrik
  dengan 60+ indikator per program studi.
- Setiap indikator dinilai 0–4 oleh asesor terlatih yang melakukan
  *cross-referencing* manual terhadap dua dokumen berbeda:
  - LED: PDF naratif 150–200 halaman (kualitatif)
  - LKPS: Excel 50 sheet (kuantitatif)
- Proses ini padat tenaga, lambat, dan rentan inkonsistensi antar asesor.

**Paragraf 2 — Mengapa LLM relevan**
- Kemajuan terbaru dalam LLM *tool-calling* dan RAG memungkinkan agen
  untuk bernalar atas dokumen terstruktur dan tidak terstruktur.
- LLM *open-weight* skala 20–35 B kini berpotensi menangani penalaran
  ber-tool dengan biaya moderat.
- Belum ada *benchmark* publik untuk tugas penilaian lintas-modal
  bergaya LAM dalam Bahasa Indonesia.

**Paragraf 3 — Dua paradigma dispatch**
- Model dengan dukungan *tool* native (qwen, mistral) menghasilkan
  `tool_calls` terstruktur yang dieksekusi *executor*.
- Model *reasoning* (deepseek-r1, qwq, o1) menghasilkan blok
  `<think>...</think>` *chain-of-thought* dan tidak mendukung *function
  calling* native di Ollama; mereka membutuhkan *wrapper* dispatch JSON
  berbasis prompt.
- Apakah dispatch berbasis prompt menyamai *tool calling* native pada
  penilaian *document-grounded* masih merupakan pertanyaan terbuka.

**Paragraf 4 — Kontribusi**
1. Agen RAG lintas-modal sumber-terbuka untuk penilaian AMI yang
   memadukan vektor *retrieval* LED dengan *lookup* tabel LKPS melalui
   empat *tool* spesialis.
2. *Benchmark* pertama untuk tiga LLM *open-weight* (qwen3.5:35b,
   deepseek-r1:32b, mistral-small3.2:24b) pada 60 indikator penuh
   rubrik LAM Teknik, dengan LLM yang lebih kuat (Claude) sebagai
   *reference annotator* awal.
3. Karakterisasi tiga *failure mode* — *quantitative collapse*,
   *tutorial output*, dan *false refusal* — yang muncul berbeda
   antar keluarga model.

---

## II. Penelitian Terkait (≈0,5 hal)

- Agen LLM dan penggunaan *tool*: ReAct (Yao 2023), *function calling*
  (OpenAI 2023).
- RAG: Lewis 2020, *survey* terbaru.
- LLM-as-judge / LLM-as-annotator: Zheng 2023, RAGAS.
- AI dalam akreditasi pendidikan: singkat — catat ketiadaan karya pada
  konteks pendidikan tinggi Indonesia (gap yang kami isi).
- Model *reasoning* dengan *tool*: keterbatasan model CoT dalam
  *setting* *function calling*.

*(Padatkan — 4–5 paragraf pendek, ~10 referensi)*

---

## III. Metodologi (≈1,5 hal)

### 3.1 Arsitektur Sistem

Diagram (Gambar 1) — lihat `02_gambar_id.md`.

Tiga *pipeline* pra-pemrosesan:
1. **Matriks rubrik:** *parser* PDF mengekstraksi 60 indikator dengan
   `score_criteria` terstruktur (dict 0–4 → kriteria), `formula`,
   dan `lkps_table_ref`.
2. **Indeksasi LED:** PDF di-*chunk* (per halaman, semantik), di-*embed*
   menggunakan `paraphrase-multilingual-MiniLM-L12-v2` (384-d),
   dipersistensi di ChromaDB dengan HNSW cosine.
3. **Pemuatan LKPS:** openpyxl + pandas; *registry sheet* di-indeks
   berdasarkan nama referensi `Tabel X.y. LKPS`.

### 3.2 Himpunan Tool

Empat *tool* yang dipaparkan ke agen:
- `get_indicator_rubric(indicator_no)` — mengembalikan kriteria skor + formula
- `search_led_evidence(query, n_results)` — vektor *search* atas *chunk* LED
- `get_lkps_table(table_reference)` — mengembalikan tabel sebagai *markdown*
- `compute_formula_score(formula_expression, variables)` — *eval* tersandbox

### 3.3 Dua Paradigma Agen

**Paradigma A — Tool calling native** (qwen3.5, mistral):
- LangGraph *state machine*: `agent → tools → agent → ... → parse_output`
- Model menghasilkan `tool_calls` langsung; `ToolNode` menjalankan dan
  menambahkan `ToolMessage`.

**Paradigma B — Dispatch JSON berbasis prompt** (deepseek-r1):
- Alur logis sama tetapi model menghasilkan JSON
  `{"action": ..., "args": ...}`.
- Blok `<think>...</think>` di-*strip* sebelum ekstraksi JSON.
- *Tool dispatch* via *registry lookup* nama dengan normalisasi nama argumen.

Auto-deteksi berdasarkan pola nama model (detail di Section 3.4).

### 3.4 Anotasi Referensi

Skor referensi dihasilkan oleh Claude menggunakan rubrik + *chunk* LED
ter-*retrieve* (top-2 per indikator) + ekstrak tabel LKPS yang relevan.
Kami menyatakan secara eksplisit bahwa ini adalah referensi awal
berbasis LLM, bukan *ground truth* dari asesor tersertifikasi, dan
membahasnya di Section VI.

### 3.5 Metrik Evaluasi

- **Mean Absolute Error (MAE):** rerata |skor_model − skor_ref|
- **RMSE:** memberi penalti pada disagreement besar
- **Exact match:** rasio skor identik
- **Akurasi within ±1:** rasio |selisih| ≤ 1 (ambang batas kesepakatan asesor)
- **Pearson r:** korelasi linier
- ***Per-type breakdown***: kualitatif / komposit / kuantitatif
- **Tingkat skor=0:** proksi *failure mode* *false-refusal*

---

## IV. Setup Eksperimen (≈0,5 hal)

- **Program uji:** sebuah program studi sarjana terapan jarak jauh
  bidang teknik di salah satu politeknik negeri Indonesia (dianonimkan
  sebagai *Program A*); program tunggal diakui sebagai keterbatasan.
- **Model:** lihat Tabel 1 (`02_gambar_id.md`).
- ***Inference backend***: Ollama via *Cloudflare-tunneled* server GPU
  (24 GB VRAM); temperatur 0,1, *sampling* default.
- **Hardware:** [isi GPU aktual dari Vast.ai].
- **Run:** seluruh 60 indikator × 3 model = 180 invokasi; mode resume.

---

## V. Hasil (≈1,5 hal) — lihat `03_tabel_id.md` dan `02_gambar_id.md`

### 5.1 Performa Agregat (Tabel 2)

`qwen3.5:35b` mendominasi pada MAE, *exact match*, dan akurasi ±1.
`deepseek-r1` memiliki rerata *confidence* tertinggi (0,81) tetapi MAE
terburuk (1,79) — jawaban salah dengan kepercayaan tinggi.

### 5.2 Per-Type Breakdown (Tabel 3 + Gambar 2)

**Temuan mencolok:** dua model non-pemenang gagal pada tipe indikator
yang *berkebalikan*:
- **deepseek-r1:32b** ambruk pada kuantitatif (0% *exact*, 12/28 nilai 0) tetapi cukup baik pada kualitatif (25% *exact*)
- **mistral-small3.2:24b** gagal pada kualitatif (10% *exact*, 12/20 nilai 0) tetapi sebanding dengan qwen pada kuantitatif (35,7% *exact*)
- Interpretasi: model *reasoning* dapat memberi skor dari teks tetapi tidak dapat ekstrak angka dari tabel secara konsisten dalam mode berbasis prompt; model *chat* menengah dapat menerapkan formula bila data tersedia tetapi menolak bila harus membaca naratif

### 5.3 Tiga Failure Mode (Tabel 4)

1. ***Quantitative collapse*** (deepseek-r1): 12 dari 28 indikator
   kuantitatif diberi nilai 0 dengan justifikasi "Bukti tidak
   ditemukan" — model gagal mengekstrak angka dari *markdown* LKPS via
   dispatch JSON
2. ***Tutorial-mode output*** (mistral): model menghasilkan instruksi
   *step-by-step* "cara menghitung" alih-alih keputusan; *parser*
   kadang mengangkat angka dari tutorial sehingga muncul *false match*
3. ***False refusal* / halusinasi** (mistral): nilai 0 dengan
   justifikasi "Tidak ada informasi" meski bukti ada di *chunk* yang
   ter-*retrieve*; pada 3 kasus, model mengarang angka spesifik
   (misalnya "PPDMhs = (10/20) × 100% = 50%") yang tidak ada di sumber

### 5.4 Runtime dan Biaya (Tabel 5)

- qwen3.5:35b: 26,6 detik/indikator (*trade-off* terbaik antara kecepatan dan akurasi)
- mistral: 11,6 detik (paling cepat tetapi kualitas terendah)
- deepseek-r1: 74,8 detik (3× lebih lambat karena *overhead* *reasoning loop*)

---

## VI. Pembahasan (≈0,7 hal)

**6.1 Mengapa native tool calling unggul.** Dispatch berbasis prompt
pada model *reasoning* harus (a) menghasilkan JSON valid, (b) mem-parse
hasil *tool* sebagai teks, dan (c) memanggil ulang *tool* sambil
bernalar — titik kegagalan multi-tahap yang absen pada paradigma
*native*.

**6.2 Mengapa model menengah gagal berbeda.** Output mode tutorial
pada mistral menyiratkan bahwa *instruction-tuning* menekankan
"*explanatory helpfulness*" alih-alih "*agentic decisiveness*". Ini
adalah *trade-off instruction-tuning* yang umum tetapi kurang
terdokumentasi pada *setting* agen domain non-Inggris.

**6.3 Implikasi untuk deployment institusional.** LLM *open-weight*
skala 35 B dengan dukungan *tool* native mencapai 88% *within-±1*
terhadap referensi LLM ahli pada 26 detik per indikator — menjanjikan
sebagai *draft scorer* untuk *review* oleh asesor manusia, namun
belum sebagai pengambil keputusan otonom.

**6.4 Keterbatasan.**
- Program tunggal (n=1); generalisasi belum terverifikasi
- Referensi berbasis LLM; *future work*: validasi oleh ahli manusia
- Satu *inference run* per (model, indikator); tanpa studi varians temperatur
- Model *tool-calling* hanya diuji pada Ollama; provider terkelola
  (Anthropic / OpenAI / Google) sengaja dikecualikan karena fokus
  *open-weight*

---

## VII. Kesimpulan (≈0,3 hal)

LLM *open-weight* berukuran 35 B dengan *tool-calling* native (dalam
pengujian kami: qwen3.5:35b) mendekati *baseline* yang berguna bagi
penilaian akreditasi pendidikan tinggi Indonesia berbasis AI. Dispatch
berbasis prompt pada model *reasoning* berperforma rendah khusus pada
ekstraksi numerik. Kami merilis kode agen, *trace* skor yang sudah
dianonimkan, dan skrip *benchmark* untuk memfasilitasi penelitian
lanjutan.

**Kode & data:** [URL github setelah anonimisasi]

---

## Ucapan Terima Kasih

Kami berterima kasih kepada institusi mitra atas pemberian bukti
akreditasi dengan ketentuan kerahasiaan. Sumber daya komputasi
disediakan oleh [Vast.ai / infrastruktur lab].

---

## Referensi (target ~15)

Daftar sementara:
1. Yao et al. ReAct (2023)
2. Lewis et al. RAG (2020)
3. Zheng et al. LLM-as-Judge (2023)
4. RAGAS Es et al. (2024)
5. Schick et al. Toolformer (2023)
6. Qwen2.5 / Qwen3 *technical report*
7. DeepSeek-R1 *technical report*
8. Mistral Small 3 *technical report*
9. Sentence-BERT multilingual (Reimers 2020)
10. ChromaDB / *vector database*
11. LangGraph paper / dokumentasi
12. BAN-PT / regulasi LAM-Teknik
13. Pedoman akreditasi PERMENRISTEKDIKTI
14. *Indonesian NLP benchmark* (IndoNLU / IndoLEM)
15. Bommasani et al. *foundation models report*
