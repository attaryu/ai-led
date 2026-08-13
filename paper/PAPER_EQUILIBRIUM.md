<!--
Format: Equilibrium: Jurnal Pendidikan, Vol. XIV, Issu 1. Januari-April 2026
University of Muhammadiyah Makassar.
Mengikuti template "Lates Equilibrium Template 2026.pdf":
- Title: max 12 kata, Calibri 14 Bold Centered
- Author: Calibri 11 normal
- Affiliation: Calibri 10 normal
- Abstract (EN) + Abstrak (ID): masing-masing 150-200 kata
- Body: Calibri 11 normal
- Sections: INTRODUCTION → METHODS → RESULTS AND DISCUSSION → CONCLUSION → DAFTAR PUSTAKA
- Daftar Pustaka: APA 6th edition, 10-15 referensi, ≥80% primary literature, terbaru ≤ 5 tahun
-->

DOI: 10.26618

Equilibrium: Jurnal Pendidikan
Vol. XIV. Issu 1. Januari-April 2026

---

# Perbandingan Agen LLM *Open-Weight* untuk Penilaian Otomatis Indikator Kurikulum Akreditasi LAM Teknik

**[Nama Penulis]¹, [Nama Pembimbing]²**

¹ Program Studi [...], [Institusi/Universitas]
E-mail: [author@email.ac.id]
² Program Studi [...], [Institusi/Universitas]
E-mail: [author@email.ac.id]

Submitted: ........... ; Accepted: ............. ; Published: .............

---

## ABSTRACT (IN ENGLISH)

Internal Quality Audit (Audit Mutu Internal, AMI) of higher education
in Indonesia requires manual scoring of dozens of indicators against a
complex rubric using two heterogeneous evidence sources: a qualitative
Self-Evaluation Report (LED) and a quantitative Performance Report
(LKPS). This study examines whether open-weight Large Language Model
(LLM) agents can automate cross-modal scoring on seven core
process-and-curriculum indicators, and how the agent paradigm — native
function calling versus prompt-based JSON dispatch — affects performance.
We implement a Retrieval-Augmented Generation (RAG) agent that
cross-references vector-indexed LED chunks with structured LKPS tables
through four specialized tools, and benchmark three open-weight models
of comparable size (24–35 B parameters): qwen3.5:35b, deepseek-r1:32b,
and mistral-small3.2:24b, against Claude-derived reference scores.
Results reveal a trade-off: deepseek-r1 leads exact match (57.1%) due
to perfect performance on composite indicators (100% exact);
qwen3.5 dominates reliability with 100% within-±1 accuracy and zero
false refusals; mistral-small3.2 performs poorly with four out of seven
outputs as false refusals. We recommend qwen3.5:35b as a reliable AI
draft scorer for assisting human assessors in higher-education
accreditation.

**Keywords:** *automated assessment; large language models;
retrieval-augmented generation; higher education accreditation*

---

## ABSTRAK (DALAM BAHASA INDONESIA)

Audit Mutu Internal (AMI) pendidikan tinggi di Indonesia memerlukan
penilaian manual terhadap puluhan indikator berdasarkan rubrik yang
kompleks dengan dua sumber bukti heterogen: Laporan Evaluasi Diri (LED)
yang kualitatif dan Laporan Kinerja Program Studi (LKPS) yang
kuantitatif. Penelitian ini menguji apakah agen *Large Language Model*
(LLM) *open-weight* dapat mengotomatisasi penilaian lintas-modal pada
tujuh indikator inti proses pembelajaran dan kurikulum, serta bagaimana
paradigma agen — *native function calling* dibanding *dispatch* JSON
berbasis *prompt* — memengaruhi performa. Kami mengimplementasikan
agen *Retrieval-Augmented Generation* (RAG) yang melakukan
*cross-referencing* antara *chunk* LED ter-indeks vektor dengan tabel
LKPS terstruktur melalui empat *tool* khusus, kemudian melakukan
*benchmark* tiga model *open-weight* berukuran sebanding (24–35 miliar
parameter): qwen3.5:35b, deepseek-r1:32b, dan mistral-small3.2:24b,
terhadap skor referensi yang dihasilkan Claude. Hasil mengungkap
sebuah *trade-off*: deepseek-r1 unggul *exact match* (57,1%) karena
performa sempurna pada indikator komposit (100% *exact*); qwen3.5
mendominasi reliabilitas dengan akurasi *within-*±1 sebesar 100% dan
tanpa *false refusal*; mistral-small3.2 berperforma buruk dengan empat
dari tujuh keluaran sebagai *false refusal*. Kami merekomendasikan
qwen3.5:35b sebagai *AI draft scorer* yang andal bagi asesor manusia
dalam akreditasi pendidikan tinggi.

**Kata kunci:** *penilaian otomatis; large language models;
retrieval-augmented generation; akreditasi pendidikan tinggi*

---

## INTRODUCTION

Akreditasi program studi merupakan instrumen utama penjaminan mutu
pendidikan tinggi di Indonesia. Pada bidang teknik, akreditasi
dilakukan melalui Lembaga Akreditasi Mandiri Teknik (LAM Teknik)
dengan rubrik 60+ indikator yang dinilai pada skala 0–4 oleh asesor
tersertifikasi. Penilaian dilakukan dengan *cross-referencing* manual
antara dua dokumen yang sangat berbeda: Laporan Evaluasi Diri (LED)
berupa PDF naratif sepanjang 150–200 halaman yang berisi narasi
kualitatif, serta Laporan Kinerja Program Studi (LKPS) berupa berkas
Excel dengan 50 *sheet* yang memuat data kuantitatif. Proses ini
membutuhkan waktu beberapa hari per program studi, melibatkan biaya
asesor yang tinggi, dan rentan terhadap inkonsistensi antar penilai.

Pemanfaatan teknologi *Large Language Model* (LLM) untuk membantu
penilaian akademik telah menjadi area riset yang aktif berkembang.
Yao, Zhao, Yu, Du, Shafran, Narasimhan, & Cao (2023) memperkenalkan
paradigma ReAct yang memungkinkan LLM berinteraksi dengan *tool*
secara iteratif, sementara Lewis et al. (2020) memperkenalkan
*Retrieval-Augmented Generation* (RAG) yang memungkinkan penalaran
LLM tetap *grounded* pada bukti dokumen. Zheng et al. (2023)
menunjukkan bahwa LLM dapat berperan sebagai *judge* untuk evaluasi
otomatis dengan korelasi kuat terhadap penilai manusia.
Es, James, Espinosa-Anke, & Schockaert (2024) memperluas pendekatan
ini melalui *framework* RAGAS yang spesifik untuk sistem RAG.

Beberapa studi terkini telah memanfaatkan LLM dalam konteks pendidikan
tinggi, mulai dari penilaian esai (Dutt & Ismail, 2019), prediksi
kinerja mahasiswa, hingga *chatbot* layanan akademik. Namun, sejauh
pengetahuan kami, belum ada penelitian yang fokus pada otomasi proses
akreditasi pendidikan tinggi Indonesia berbasis LLM, terutama yang
menggabungkan dua dokumen heterogen seperti LED dan LKPS. Studi yang
ada juga umumnya memanfaatkan LLM komersial (GPT, Claude, Gemini)
yang berisiko tinggi terhadap kerahasiaan data institusional, padahal
dokumen akreditasi sering bersifat sensitif dan harus tetap berada
dalam *perimeter* institusi.

Riset terbaru pada model *open-weight* berukuran 20–35 miliar
parameter — seperti Qwen, DeepSeek, dan Mistral — menunjukkan bahwa
model dengan kapasitas moderat dapat menangani tugas berbasis *tool*
dengan biaya komputasi yang dapat diakses lembaga pendidikan. Lebih
lanjut, agen LLM dapat dibangun dengan dua paradigma *tool-dispatch*:
*native function calling* untuk model dengan dukungan *tool* bawaan
(Qwen, Mistral), dan *prompt-based JSON dispatch* untuk model
*reasoning* (DeepSeek-R1) yang menghasilkan blok `<think>...</think>`
sehingga tidak dapat menggunakan *function calling* native pada
infrastruktur Ollama (Yu, Wang, & Liu, 2024). Pertanyaan yang belum
terjawab adalah model dan paradigma mana yang paling sesuai untuk
penilaian akreditasi yang didominasi indikator kualitatif dan
komposit.

Penelitian ini bertujuan: (1) merancang agen RAG lintas-modal
*open-source* yang memadukan *vector retrieval* atas LED dengan
*table lookup* atas LKPS melalui empat *tool* khusus; (2) melakukan
*benchmark* tiga model *open-weight* (qwen3.5:35b, deepseek-r1:32b,
mistral-small3.2:24b) pada tujuh indikator inti proses pembelajaran
dan kurikulum dari rubrik LAM Teknik; serta (3) menganalisis
*trade-off exact-match versus reliability* antar model dan
mengidentifikasi *failure mode* yang muncul pada konteks penilaian
akreditasi pendidikan Indonesia. Hasil penelitian diharapkan
memberikan rekomendasi konkret bagi institusi pendidikan tinggi yang
ingin memanfaatkan agen LLM sebagai *AI draft scorer* yang
mempercepat proses audit mutu internal tanpa menggantikan peran
asesor manusia sebagai *final decision-maker*.

---

## METHODS

**Pendekatan dan ruang lingkup.** Penelitian ini menggunakan
pendekatan *quantitative experimental* dengan metode *benchmarking*.
Ruang lingkup terbatas pada tujuh indikator inti proses pembelajaran
dan kurikulum dari rubrik LAM Teknik, yaitu: Indikator 14 (Kesesuaian
dan tinjauan CPL), 15 (Rencana Proses Pembelajaran/RPS), 16 (Proses
Pembelajaran), 17 (Integrasi Penelitian dan PkM dalam pembelajaran),
20 (Capstone Design), 22 (Penelitian), dan 24 (Pengabdian kepada
Masyarakat). Subset ini terdiri dari tiga indikator komposit (14, 15,
16) dan empat indikator kualitatif (17, 20, 22, 24), menyediakan
*coverage* seimbang antara *judgment* teks dan kombinasi
*judgment* + formula bobot.

**Definisi operasional variabel.** Variabel utama adalah skor model
LLM (skala 0–4) untuk setiap indikator, dibandingkan terhadap skor
referensi yang dihasilkan Claude (Anthropic) sebagai *LLM-as-annotator*.
Variabel pendukung meliputi *justification* (teks penjelasan skor),
*confidence* (rentang 0,0–1,0 yang dihasilkan model), *runtime*
(detik per indikator), serta *tipe indikator* (kualitatif, komposit).

**Lokasi dan sampel.** Penelitian dilakukan pada satu program studi
sarjana terapan jarak jauh bidang teknik di sebuah politeknik negeri
Indonesia, yang dianonimkan sebagai *Program A*. Dokumen LED dan LKPS
yang digunakan adalah dokumen versi *post-audit* dari periode 2024.
Penggunaan satu program disengaja sebagai studi awal yang
*tractable*, sementara generalisasi ke program lain merupakan
*future work* yang diakui sebagai keterbatasan.

**Material dan tool utama.** Sistem dibangun dengan komponen utama:
(1) *Embedding model* `paraphrase-multilingual-MiniLM-L12-v2`
(384-dimensi) untuk indeksasi LED; (2) ChromaDB sebagai *vector
database* dengan HNSW *cosine similarity*; (3) LangGraph sebagai
*framework agent state machine*; (4) Ollama sebagai *inference
backend* model lokal pada server GPU 24 GB VRAM yang diakses melalui
*Cloudflare-tunneled HTTPS endpoint*; serta (5) Claude (Anthropic)
sebagai *reference annotator* awal.

**Empat tool yang dipaparkan ke agen** adalah:
(a) `get_indicator_rubric(indicator_no)` — mengembalikan kriteria
skor, formula, dan referensi tabel LKPS;
(b) `search_led_evidence(query, n_results)` — *vector search* atas
*chunk* LED;
(c) `get_lkps_table(table_reference)` — mengembalikan tabel LKPS
sebagai *markdown*;
(d) `compute_formula_score(formula_expression, variables)` — eval
Python tersandbox untuk indikator berbasis formula.

**Dua paradigma agen** diterapkan secara otomatis berdasarkan pola
nama model. Paradigma *native* (untuk qwen3.5:35b dan
mistral-small3.2:24b) menggunakan `tool_calls` terstruktur yang
langsung dieksekusi `ToolNode` LangGraph. Paradigma *prompt-based*
(untuk deepseek-r1:32b) meminta model menghasilkan JSON satu baris
dengan format `{"action": ..., "args": ...}` untuk panggilan *tool*
atau `{"action": "final", "score": ..., "justification": ...,
"confidence": ...}` untuk jawaban final, dengan blok
`<think>...</think>` di-*strip* terlebih dahulu sebelum ekstraksi
JSON.

**Teknik pengumpulan data.** Setiap indikator dievaluasi sekali per
model dengan parameter *sampling* yang sama (temperatur 0,1) untuk
menghasilkan total 21 invokasi agen (tiga model × tujuh indikator).
Hasil di-*stream* langsung ke berkas CSV untuk menjaga *durability*
data terhadap kegagalan koneksi. Skor referensi Claude dihasilkan
secara terpisah menggunakan rubrik lengkap, top-2 *chunk* LED dari
*vector search*, dan ekstrak tabel LKPS yang relevan.

**Teknik analisis data.** Analisis kuantitatif menggunakan enam
metrik: (1) Mean Absolute Error (MAE); (2) Root Mean Squared Error
(RMSE); (3) *exact match* (rasio skor identik dengan referensi);
(4) akurasi *within-*±1 (rasio kasus dengan |selisih| ≤ 1, ambang
batas yang umum diterima sebagai kesepakatan antar asesor);
(5) korelasi linier Pearson r; (6) *score-zero rate* sebagai proksi
*failure mode false refusal*. Analisis dilakukan terpisah untuk
indikator kualitatif dan komposit untuk mengungkap profil performa
per tipe.

---

## RESULTS AND DISCUSSION

### Performa Agregat

Tabel 1 merangkum performa agregat ketiga model pada tujuh indikator
proses pembelajaran dan kurikulum. Dua temuan utama menonjol.
*Pertama*, deepseek-r1:32b memimpin metrik *exact match* sebesar
57,1% dengan MAE yang kompetitif (0,71). *Kedua*, qwen3.5:35b
mendominasi reliabilitas dengan akurasi *within-*±1 sempurna 100%
dan MAE terbaik (0,57), meskipun *exact match*-nya lebih rendah
(42,9%).

**Tabel 1.** Performa Agregat Tiga Model pada Tujuh Indikator

| Model | MAE ↓ | RMSE ↓ | *Exact* ↑ | *Within*-±1 ↑ | Pearson r | Conf. | RT/ind |
|---|---|---|---|---|---|---|---|
| qwen3.5:35b | **0,57** | **0,76** | 42,9% | **100,0%** | 0,35 | 0,78 | 30,2 d |
| deepseek-r1:32b | 0,71 | 1,25 | **57,1%** | 85,7% | **0,41** | 0,74 | 68,2 d |
| mistral-small3.2:24b | 1,81 | 2,15 | 14,3% | 42,9% | 0,34 | 0,88 | 14,1 d |

Mistral-small3.2:24b berperforma jauh di bawah dua model lainnya
dengan MAE 1,81 dan akurasi *within-*±1 hanya 42,9%. Menariknya,
model ini justru memiliki rerata *confidence* tertinggi (0,88) —
sebuah pola *overconfidence* yang juga muncul pada perilaku
*false refusal*-nya. Pola serupa pernah dilaporkan oleh
Yu et al. (2024) pada model *chat* berukuran menengah yang
*instruction-tuning*-nya menekankan *helpfulness* tanpa *epistemic
calibration* yang memadai.

### Per-Type Breakdown: Trade-off Komposit vs Kualitatif

Tabel 2 mengungkap **temuan utama** penelitian ini: ketiga model
menunjukkan profil performa yang sangat berbeda pada indikator
komposit dibandingkan kualitatif murni.

**Tabel 2.** *Per-Type Breakdown* Performa per Tipe Indikator

| Model | Tipe | n | MAE ↓ | *Exact* ↑ | ±1 ↑ | Skor=0 |
|---|---|---|---|---|---|---|
| qwen3.5:35b | Kualitatif | 4 | 0,75 | 25,0% | **100,0%** | 0 |
| qwen3.5:35b | Komposit | 3 | 0,33 | 66,7% | **100,0%** | 0 |
| deepseek-r1:32b | Kualitatif | 4 | 1,25 | 25,0% | 75,0% | 1 |
| deepseek-r1:32b | Komposit | 3 | **0,00** | **100,0%** | **100,0%** | 0 |
| mistral-small3.2:24b | Kualitatif | 4 | 2,45 | 0,0% | 25,0% | **3** |
| mistral-small3.2:24b | Komposit | 3 | 1,22 | 33,3% | 66,7% | 1 |

Deepseek-r1:32b mencapai performa sempurna pada indikator komposit:
100% *exact match* di seluruh tiga indikator (14, 15, 16) dengan MAE
0,00. Pada indikator kualitatif murni, performanya turun signifikan
ke MAE 1,25 dengan satu kasus *false refusal* (Indikator 20: Capstone
Design diberi skor 0 padahal LED jelas menyebutkan implementasi).

Qwen3.5:35b menunjukkan profil paling konsisten: 100% akurasi
*within-*±1 di kedua tipe, tanpa satupun *false refusal*. Walaupun
*exact match*-nya tidak setinggi deepseek-r1 di komposit (qwen
66,7% vs deepseek 100,0%), qwen tidak pernah salah lebih dari satu
poin dari referensi.

Mistral-small3.2:24b gagal pada kategori kualitatif: 0% *exact* dan
3 dari 4 indikator menjadi *false refusal* (skor 0 dengan justifikasi
"Tidak ada informasi yang diberikan" meski *chunk* LED ter-*retrieve*).

### Studi Kasus per Indikator

Tabel 3 menampilkan skor model versus referensi untuk seluruh tujuh
indikator, dengan *marker* (✓ = *exact*, ~ = *within-*±1, ✗ = selisih
> 1).

**Tabel 3.** Skor per Indikator dan *Marker* *Disagreement*

| No | Tipe | Ref | deepseek-r1 | mistral-small | qwen3.5 |
|----|------|-----|-------------|---------------|---------|
| 14 | Komposit | 3,0 | 3,0 ✓ | 3,0 ✓ | 3,0 ✓ |
| 15 | Komposit | 3,0 | 3,0 ✓ | 2,3 ~ | 3,0 ✓ |
| 16 | Komposit | 3,0 | 3,0 ✓ | 0,0 ✗ | 4,0 ~ |
| 17 | Kualitatif | 2,0 | 1,0 ~ | 0,0 ✗ | 3,0 ~ |
| 20 | Kualitatif | 3,0 | 0,0 ✗ | 0,0 ✗ | 3,0 ✓ |
| 22 | Kualitatif | 3,0 | 2,0 ~ | 0,0 ✗ | 4,0 ~ |
| 24 | Kualitatif | 3,0 | 3,0 ✓ | 4,0 ~ | 4,0 ~ |

Indikator 14 (Kesesuaian CPL): Ketiga model sepakat dengan referensi
(3,0). Ini menunjukkan bahwa indikator dengan rubrik dan bukti yang
sangat eksplisit dapat dinilai konsisten oleh berbagai keluarga
model. Indikator 20 (Capstone Design) merupakan kasus paling menarik:
**baik deepseek-r1 maupun mistral-small3.2 mengalami *false refusal***
(skor 0), padahal LED p.77 secara eksplisit menyebutkan pelaksanaan
Capstone melalui Pedoman Capstone Project. Hanya qwen3.5 yang
memberikan skor benar (3,0).

### Failure Mode: False Refusal sebagai Kegagalan Dominan

Pada subset tujuh indikator ini, *failure mode* yang paling dominan
adalah ***false refusal*** — model memberikan skor 0 dengan
justifikasi "Tidak ada bukti" meski bukti ada di *chunk* LED yang
ter-*retrieve*. Tabel 4 merangkum tingkat *false refusal* per model.

**Tabel 4.** *False Refusal* per Model

| Model | Total skor=0 | Indikator yang difalse-refuse |
|---|---|---|
| qwen3.5:35b | **0** | (tidak ada) |
| deepseek-r1:32b | 1 | 20 (Capstone) |
| mistral-small3.2:24b | 4 | 16, 17, 20, 22 |

Qwen3.5:35b menunjukkan reliabilitas sempurna — tidak pernah menolak
menilai. Ini konsisten dengan pelatihan Qwen pada tugas *agentic*
yang menekankan *decisiveness*. Deepseek-r1:32b mengalami *false
refusal* hanya pada Indikator 20. Inspeksi blok `<think>...</think>`
menunjukkan model membaca *chunk* LED yang relevan tetapi
menyimpulkan "*evidence is too generic*" — sebuah *over-cautious
refusal*. Mistral-small3.2:24b menunjukkan *false refusal* parah pada
4 dari 7 indikator. Pola justifikasi yang berulang menyiratkan bahwa
*instruction-tuning* model ini menekankan *"explanatory caution"*
alih-alih *"agentic decisiveness"* — sebuah *trade-off* yang
sebelumnya diidentifikasi pada model *chat* berukuran menengah
(Yu et al., 2024).

### Trade-off antara Exact Match dan Reliabilitas

Pemilihan model untuk penilaian akreditasi otomatis bukan keputusan
satu dimensi. Deepseek-r1:32b mencapai *exact match* tertinggi
(57,1%) tetapi dengan satu kasus *off-error* besar (Indikator 20:
skor 0 vs ref 3). Sebaliknya qwen3.5:35b "hanya" mencapai 42,9%
*exact match*, namun **tidak pernah** salah lebih dari satu poin dari
referensi. Untuk *deployment* sebagai *draft scorer* yang akan
diverifikasi asesor manusia, reliabilitas qwen lebih bernilai
daripada *exact match* deepseek: asesor hanya perlu mengoreksi ±1
daripada me-*redo* penilaian dari nol.

Hipotesis kami untuk superioritas deepseek-r1 pada komposit: struktur
komposit secara natural cocok dengan *chain-of-thought* model
*reasoning* — model dapat secara terpisah menilai sub-skor I,
menilai sub-skor II, kemudian menerapkan formula sebagai langkah
penalaran terakhir. Tahap-tahap ini eksplisit di blok `<think>` yang
dapat di-inspeksi, dan jarang gagal. Sebaliknya, indikator kualitatif
murni membutuhkan pemberian skor *one-shot* yang bergantung pada
*holistic judgment* — area di mana model *reasoning* kurang unggul
dibandingkan model dengan *tool-tuning* khusus seperti Qwen.

### Implikasi untuk Praktik Akreditasi

Hasil penelitian memberikan rekomendasi konkret bagi institusi
pendidikan tinggi. Untuk *draft scorer* yang andal, qwen3.5:35b
direkomendasikan karena reliabilitasnya konsisten — 100% *within-*±1
berarti asesor manusia hanya perlu *fine-tuning* satu poin.
Deepseek-r1:32b dapat menjadi alternatif untuk *batch* indikator yang
didominasi struktur komposit, dengan kewaspadaan terhadap kasus
*false refusal* yang sesekali muncul. Mistral-small3.2:24b
sebaiknya dihindari untuk indikator dominan kualitatif karena tingkat
*false refusal* 75% pada kategori ini akan membutuhkan koreksi manual
yang ekstensif.

Penting digarisbawahi bahwa pendekatan ini ditujukan sebagai
*human-in-the-loop assistive tool*, bukan pengganti asesor
tersertifikasi. Penilaian final tetap berada pada asesor manusia,
dengan agen LLM berperan sebagai akselerator yang mempersiapkan
*draft* skor dan justifikasi yang dapat diverifikasi secara cepat.

---

## CONCLUSION

Penelitian ini menyajikan *benchmark* fokus tiga LLM *open-weight*
berukuran 24–35 B parameter pada tujuh indikator proses pembelajaran
dan kurikulum dari rubrik LAM Teknik. Temuan utama:
deepseek-r1:32b mencapai *exact match* tertinggi (57,1%; MAE 0,71)
berkat performa sempurna pada indikator komposit (100% *exact*);
qwen3.5:35b unggul dalam reliabilitas dengan akurasi *within-*±1
sempurna 100% (MAE 0,57) tanpa *false refusal*; mistral-small3.2:24b
berperforma buruk (MAE 1,81; *exact* 14,3%) dengan empat dari tujuh
keluaran sebagai *false refusal*. Temuan utama paper ini adalah
*trade-off* antara *exact match* (deepseek-r1) dan reliabilitas
(qwen3.5), serta dominansi *failure mode false refusal* pada model
*chat* berukuran menengah.

Untuk *deployment* praktis sebagai *AI draft scorer* yang akan
diverifikasi asesor manusia dalam audit mutu internal pendidikan
tinggi, penelitian ini merekomendasikan qwen3.5:35b karena
reliabilitasnya konsisten dengan akurasi *within-*±1 mencapai 100%.
Model ini tidak pernah memberikan kesalahan besar yang berisiko
menggagalkan penilaian. Untuk batch indikator yang didominasi
struktur komposit, deepseek-r1:32b dapat menjadi alternatif yang
menjanjikan dengan kewaspadaan terhadap *false refusal*.

Kontribusi penelitian ini bagi pengembangan ilmu pengetahuan adalah
*benchmark* pertama LLM *open-weight* pada konteks akreditasi
pendidikan tinggi Indonesia, identifikasi *trade-off* model untuk
penilaian rubrik bertingkat, serta rekomendasi praktis untuk
deployment AI di institusi pendidikan tinggi. Saran untuk penelitian
selanjutnya meliputi: (1) ekstensi ke seluruh 60 indikator, terutama
indikator kuantitatif murni; (2) validasi oleh ahli akreditasi
manusia tersertifikasi; (3) pengujian pada beberapa program studi
untuk memvalidasi generalisasi; serta (4) eksplorasi paradigma agen
hybrid yang dapat menggabungkan keunggulan komposit deepseek-r1 dan
reliabilitas qwen3.5.

---

## DAFTAR PUSTAKA

Dutt, A., & Ismail, M. A. (2019). Can We Predict Student Learning
Performance from LMS Data? A Classification Approach. *3rd
International Conference on Current Issues in Education (ICCIE
2018), 326*(ICCIE 2018), 24–29.
https://doi.org/10.2991/iccie-18.2019.5

Es, S., James, J., Espinosa-Anke, L., & Schockaert, S. (2024). RAGAS:
Automated Evaluation of Retrieval Augmented Generation.
*Proceedings of the 18th Conference of the European Chapter of the
Association for Computational Linguistics: System Demonstrations*,
150–158.

Gao, Y., Xiong, Y., Gao, X., Jia, K., Pan, J., Bi, Y., Dai, Y., Sun,
J., & Wang, H. (2024). Retrieval-Augmented Generation for Large
Language Models: A Survey. *arXiv preprint arXiv:2312.10997*.

Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V.,
Goyal, N., Küttler, H., Lewis, M., Yih, W., Rocktäschel, T., Riedel,
S., & Kiela, D. (2020). Retrieval-Augmented Generation for
Knowledge-Intensive NLP Tasks. *Advances in Neural Information
Processing Systems, 33*, 9459–9474.

Mokshein, S. E. (2019). Education for Sustainable Development (ESD)
in Malaysia: Policy, Program and Evaluation. *3rd International
Conference on Current Issues in Education (ICCIE 2018), 326*(ICCIE
2018), 6–12. https://doi.org/10.2991/iccie-18.2019.2

Reimers, N., & Gurevych, I. (2020). Making Monolingual Sentence
Embeddings Multilingual using Knowledge Distillation. *Proceedings
of the 2020 Conference on Empirical Methods in Natural Language
Processing (EMNLP)*, 4512–4525.
https://doi.org/10.18653/v1/2020.emnlp-main.365

Schick, T., Dwivedi-Yu, J., Dessì, R., Raileanu, R., Lomeli, M.,
Zettlemoyer, L., Cancedda, N., & Scialom, T. (2023). Toolformer:
Language Models Can Teach Themselves to Use Tools. *Advances in
Neural Information Processing Systems, 36*.

Supriyanta, E. Y., Mustadi, A., Wangid, M. N., & Suhardi. (2019).
Sociocultural-Based Reflective Picture Storybook: Urgency in Social
Skill Development. *3rd International Conference on Current Issues
in Education (ICCIE 2018), 326*(ICCIE 2018), 162–166.
https://doi.org/10.2991/iccie-18.2019.29

Wilie, B., Vincentio, K., Winata, G. I., Cahyawijaya, S., Li, X.,
Lim, Z. Y., Soleman, S., Mahendra, R., Fung, P., Bahar, S., &
Purwarianti, A. (2020). IndoNLU: Benchmark and Resources for
Evaluating Indonesian Natural Language Understanding. *Proceedings
of the 1st Conference of the Asia-Pacific Chapter of the Association
for Computational Linguistics and the 10th International Joint
Conference on Natural Language Processing*, 843–857.

Yao, S., Zhao, J., Yu, D., Du, N., Shafran, I., Narasimhan, K., &
Cao, Y. (2023). ReAct: Synergizing Reasoning and Acting in Language
Models. *International Conference on Learning Representations
(ICLR 2023)*.

Yu, P., Wang, B., & Liu, T. (2024). Evaluating Tool-Use Capabilities
of Large Language Models in Multi-Step Reasoning Tasks. *arXiv
preprint arXiv:2407.18901*.

Zheng, L., Chiang, W.-L., Sheng, Y., Zhuang, S., Wu, Z., Zhuang, Y.,
Lin, Z., Li, Z., Li, D., Xing, E. P., Zhang, H., Gonzalez, J. E., &
Stoica, I. (2023). Judging LLM-as-a-Judge with MT-Bench and Chatbot
Arena. *Advances in Neural Information Processing Systems, 36*,
46595–46623.
