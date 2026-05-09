# Studi Komparatif Agen LLM Open-Weight untuk Penilaian Indikator Proses Pembelajaran dan Kurikulum Akreditasi LAM Teknik

**Penulis:** [Nama Penulis]¹, [Pembimbing]¹
¹ [Afiliasi]
✉ [email]

---

## Abstrak

Audit Mutu Internal (AMI) untuk akreditasi pendidikan tinggi di
Indonesia memerlukan penilaian manual terhadap puluhan indikator
berdasarkan rubrik kompleks dengan dua sumber bukti yang heterogen:
Laporan Evaluasi Diri (LED) yang bersifat kualitatif dan Laporan
Kinerja Program Studi (LKPS) yang kuantitatif. Penelitian ini
menyelidiki apakah agen *Large Language Model* (LLM) *open-weight*
dapat mengotomatisasi tugas penilaian lintas-modal pada subset
indikator proses pembelajaran dan kurikulum (kesesuaian CPL,
Rencana Proses Pembelajaran, Proses Pembelajaran, Integrasi
Penelitian/PkM, Capstone Design, Penelitian, dan PkM), serta
bagaimana pilihan paradigma agen — *native function calling*
versus dispatch JSON berbasis prompt — memengaruhi performa pada
indikator kualitatif dan komposit.

Kami mengimplementasikan agen *Retrieval-Augmented Generation* (RAG)
yang melakukan *cross-referencing* antara *chunk* LED yang ter-indeks
secara vektor dengan tabel LKPS terstruktur melalui empat *tool*
khusus, kemudian melakukan *benchmark* tiga model *open-weight*
berukuran sebanding (24–35 miliar parameter): generalis dengan
*tool-tuning* (`qwen3.5:35b`), model fokus *reasoning* dalam mode
berbasis prompt (`deepseek-r1:32b`), dan model *chat* berukuran
menengah (`mistral-small3.2:24b`), dibandingkan terhadap referensi
yang dihasilkan oleh Claude pada 7 indikator terpilih.

Hasil menunjukkan *trade-off* yang menarik: `deepseek-r1:32b`
memimpin *exact match* sebesar 57,1% (MAE 0,71) berkat performa
sempurna pada indikator komposit (100% *exact*); sebaliknya,
`qwen3.5:35b` mendominasi reliabilitas dengan akurasi *within-±1*
sebesar 100% (MAE 0,57) tanpa satu pun *false refusal*. Model *chat*
menengah `mistral-small3.2:24b` berperforma buruk (MAE 1,81; *exact*
14,3%) dengan 4 dari 7 keluaran berupa *false refusal*. Kami
mendiskusikan implikasinya bagi pemilihan model untuk *deployment*
*draft scorer* berbantuan AI.

**Kata kunci:** *large language models*, *retrieval-augmented
generation*, *tool calling*, penilaian otomatis, audit mutu,
teks Bahasa Indonesia berdaya rendah, model *open-weight*.

---

## I. Pendahuluan

Akreditasi pendidikan tinggi di Indonesia, khususnya untuk program
studi teknik di bawah Lembaga Akreditasi Mandiri Teknik (LAM-Teknik),
mengandalkan Audit Mutu Internal (AMI) berbasis rubrik dengan 60+
indikator per program studi. Setiap indikator dinilai pada skala 0–4
oleh asesor terlatih yang harus melakukan *cross-referencing* manual
terhadap dua dokumen yang sangat berbeda: Laporan Evaluasi Diri (LED)
berupa PDF naratif sepanjang 150–200 halaman yang bersifat
kualitatif, serta Laporan Kinerja Program Studi (LKPS) berupa berkas
Excel dengan 50 *sheet* yang berisi data kuantitatif. Proses ini
padat tenaga, lambat, dan rentan terhadap inkonsistensi antar asesor.

Kemajuan terbaru dalam *Large Language Model* (LLM) ber-*tool-calling*
dan *Retrieval-Augmented Generation* (RAG) memungkinkan agen yang
mampu bernalar atas dokumen terstruktur maupun tidak terstruktur secara
bersamaan. LLM *open-weight* skala 20–35 miliar parameter — seperti
Qwen, DeepSeek, dan Mistral — kini berpotensi menangani penalaran
ber-*tool* dengan biaya komputasi moderat dan tetap menjaga privasi
data dengan deployment lokal. Namun, hingga saat ini belum tersedia
*benchmark* publik untuk tugas penilaian lintas-modal bergaya LAM
dalam Bahasa Indonesia.

Kami memfokuskan studi ini pada **tujuh indikator proses
pembelajaran dan kurikulum** — Indikator 14 (Kesesuaian dan
tinjauan CPL), 15 (RPS), 16 (Proses Pembelajaran), 17 (Integrasi
Penelitian dan PkM dalam pembelajaran), 20 (Capstone Design),
22 (Penelitian), dan 24 (PkM). Subset ini dipilih karena dua alasan:
*pertama*, indikator ini paling sering menjadi titik *bottleneck*
dalam audit dan paling banyak menyita waktu asesor; *kedua*, subset
ini memberikan *coverage* seimbang antara indikator kualitatif murni
(judgment teks) dan komposit (sub-skor + formula), tanpa indikator
kuantitatif murni yang membutuhkan ekstraksi angka kompleks dari
LKPS.

Kami mengamati bahwa agen LLM dapat dibangun dengan dua paradigma
*tool-dispatch* yang berbeda. Model dengan dukungan *tool* native
seperti Qwen dan Mistral menghasilkan struktur `tool_calls` yang
langsung dieksekusi oleh *executor*. Sebaliknya, model *reasoning*
seperti DeepSeek-R1 menghasilkan blok `<think>...</think>`
*chain-of-thought* dan tidak mendukung *function calling* native pada
Ollama; mereka memerlukan *wrapper* dispatch JSON berbasis prompt.
Pertanyaan terbuka adalah: apakah dispatch berbasis prompt menyamai
*tool calling* native pada penilaian *document-grounded* di domain
ini, dan model mana yang paling sesuai untuk indikator yang dominan
kualitatif/komposit?

Kontribusi paper ini adalah:
1. Sebuah agen RAG lintas-modal *open-source* untuk penilaian AMI
   yang memadukan *vector retrieval* atas LED dengan *table lookup*
   atas LKPS melalui empat *tool* spesialis.
2. *Benchmark* fokus tiga LLM *open-weight* (`qwen3.5:35b`,
   `deepseek-r1:32b`, `mistral-small3.2:24b`) pada 7 indikator
   proses pembelajaran dan kurikulum dari rubrik LAM Teknik,
   menggunakan LLM yang lebih kuat (Claude) sebagai *reference
   annotator* awal.
3. Karakterisasi *trade-off exact-match versus reliability* antar
   model dan identifikasi *failure mode false refusal* pada model
   *chat* menengah.

---

## II. Penelitian Terkait

**Agen LLM dan penggunaan tool.** Paradigma ReAct (Yao et al., 2023)
mempopulerkan agen LLM yang berinteraksi dengan tool secara iteratif.
*Function calling* native (OpenAI, 2023) kemudian menyederhanakan
implementasi dengan format JSON terstruktur yang langsung dipahami model.
Toolformer (Schick et al., 2023) menunjukkan bahwa model dapat dilatih
untuk menggunakan tool melalui *self-supervised augmentation*.

**Retrieval-Augmented Generation.** RAG (Lewis et al., 2020)
menggabungkan *retrieval* dokumen relevan dengan generasi LLM untuk
mengurangi halusinasi dan menjaga *grounding* faktual. *Survey*
terbaru (Gao et al., 2024) merangkum perkembangan ke arah agen
multi-langkah dengan *retrieval* adaptif.

**LLM-as-Judge dan LLM-as-Annotator.** Zheng et al. (2023) menunjukkan
bahwa LLM dapat berperan sebagai *judge* untuk evaluasi otomatis
dengan korelasi kuat terhadap penilai manusia. *Framework* RAGAS
(Es et al., 2024) memperluas pendekatan ini secara spesifik untuk
sistem RAG.

**AI dalam akreditasi pendidikan.** Sejauh pengetahuan kami, belum
ada karya yang fokus pada otomasi akreditasi pendidikan tinggi
Indonesia berbasis LLM. *Gap* ini yang kami isi.

**Model reasoning dengan tool.** Penelitian baru menunjukkan
keterbatasan model CoT seperti DeepSeek-R1 dalam *setting function
calling* — model cenderung "berpikir terlalu banyak" sehingga
gagal menghasilkan struktur JSON yang valid (Yu et al., 2024).

---

## III. Metodologi

### 3.1 Arsitektur Sistem

Sistem (Gambar 1) terdiri dari tiga *pipeline* pra-pemrosesan yang
mengisi tiga sumber konteks, empat *tool* yang dipaparkan ke agen,
dan dua varian *graph* eksekusi.

**Pipeline pra-pemrosesan:**
1. **Matriks rubrik:** *parser* PDF mengekstraksi 60 indikator dengan
   `score_criteria` terstruktur (dict 0–4 → kriteria), `formula`,
   dan `lkps_table_ref` ke dalam *cache* JSON.
2. **Indeksasi LED:** PDF di-*chunk* per halaman dengan boundary
   semantik, di-*embed* menggunakan
   `paraphrase-multilingual-MiniLM-L12-v2` (384-d), dipersistensi
   pada ChromaDB dengan HNSW *cosine similarity*.
3. **Pemuatan LKPS:** openpyxl + pandas memuat seluruh *sheet*;
   *registry* menyediakan *lookup* berdasarkan referensi nama tabel
   (mis. `Tabel 4.a. LKPS`).

### 3.2 Himpunan Tool

Empat *tool* yang dipaparkan ke agen:
- `get_indicator_rubric(indicator_no)` — mengembalikan kriteria skor
  + formula + referensi tabel LKPS.
- `search_led_evidence(query, n_results)` — *vector search* atas
  *chunk* LED dengan top-k *retrieval*.
- `get_lkps_table(table_reference)` — mengembalikan tabel LKPS
  sebagai *markdown* yang siap dibaca model.
- `compute_formula_score(formula_expression, variables)` — eval
  Python tersandbox untuk indikator berbasis formula, dengan
  *clamp* hasil ke rentang 0–4.

### 3.3 Dua Paradigma Agen

**Paradigma A — Tool calling native** (untuk `qwen3.5:35b` dan
`mistral-small3.2:24b`): kami mendefinisikan *state machine* dengan
LangGraph berstruktur `agent → tools → agent → ... → parse_output`.
Model menghasilkan `tool_calls` terstruktur secara langsung;
`ToolNode` LangGraph menjalankan tool dan menambahkan `ToolMessage`
ke riwayat. Loop berlanjut hingga model menghasilkan respons tanpa
*tool call*, kemudian *node* `parse_output` mengekstrak skor,
justifikasi, dan *confidence* dari teks final menggunakan regex
permisif (case-insensitive, *strip* markdown).

**Paradigma B — Dispatch JSON berbasis prompt** (untuk
`deepseek-r1:32b`): alur logis sama tetapi model diminta menghasilkan
JSON satu baris: `{"action": "tool_name", "args": {...}}` untuk
panggilan tool atau
`{"action": "final", "score": ..., "justification": ..., "confidence": ...}`
untuk jawaban final. Blok `<think>...</think>` di-*strip* terlebih
dahulu dengan regex sebelum ekstraksi JSON. Dispatch dilakukan via
*registry lookup* nama tool dengan normalisasi alias argumen
(misalnya `formula` → `formula_expression`).

Pemilihan paradigma dilakukan otomatis berdasarkan pola nama model
(*pattern matching* untuk `r1`, `qwq`, `o1-`, `thinking`). Ambang
batas iterasi *force-finalize* sebesar dua kali diterapkan untuk
mencegah model keluar dari loop tanpa skor final.

### 3.4 Pemilihan Subset Indikator

Dari 60 indikator total dalam rubrik LAM Teknik, kami memilih 7
indikator inti yang berkaitan dengan **proses pembelajaran dan
kurikulum**:

| No | Indikator | Tipe |
|----|-----------|------|
| 14 | Kesesuaian dan tinjauan CPL | Komposit |
| 15 | Rencana Proses Pembelajaran (RPS) | Komposit |
| 16 | Proses Pembelajaran | Komposit |
| 17 | Integrasi Penelitian dan PkM dalam pembelajaran | Kualitatif |
| 20 | Proyek Rekayasa Penciri (Capstone Design) | Kualitatif |
| 22 | Penelitian | Kualitatif |
| 24 | Pengabdian kepada Masyarakat (PkM) | Kualitatif |

Subset ini terdiri dari 3 indikator komposit dan 4 indikator
kualitatif (tanpa indikator kuantitatif murni), memberikan
*coverage* seimbang antara *judgment* teks dan kombinasi
*judgment* + formula bobot.

### 3.5 Anotasi Referensi

Skor referensi dihasilkan menggunakan Claude (Anthropic) sebagai
*LLM-as-annotator*. Untuk setiap indikator, Claude menerima rubrik
lengkap, top-2 *chunk* LED hasil *vector search*, dan ekstrak tabel
LKPS yang relevan, kemudian memberikan skor 0–4 dengan justifikasi
dan *confidence*. Kami secara eksplisit menyatakan bahwa ini adalah
referensi awal berbasis LLM, bukan *ground truth* dari asesor LAM
tersertifikasi, dan akan kami diskusikan keterbatasannya di
Section VI.

### 3.6 Metrik Evaluasi

- **Mean Absolute Error (MAE):** rerata `|score_model − score_ref|`.
- **Root Mean Squared Error (RMSE):** memberi penalti pada *disagreement* besar.
- ***Exact match*:** rasio skor identik dengan referensi.
- **Akurasi *within-±1*:** rasio kasus dengan |selisih| ≤ 1; ambang
  batas yang umum diterima sebagai kesepakatan antar asesor.
- **Pearson r:** korelasi linier model–referensi.
- ***Per-type breakdown*:** kualitatif vs komposit.
- **Tingkat skor=0:** sebagai proksi *failure mode false-refusal*.

---

## IV. Setup Eksperimen

**Data uji.** Sebagai *testbed*, kami menggunakan satu program studi
sarjana terapan jarak jauh bidang teknik di sebuah politeknik negeri
Indonesia (selanjutnya dianonimkan sebagai *Program A*). Kami
mengakui bahwa pengujian pada satu program merupakan keterbatasan
dan akan kami diskusikan di Section VI.

**Model.** Tiga model *open-weight* berukuran sebanding dievaluasi
(Tabel 1):

**Tabel 1 — Spesifikasi Model**

| ID | Model | Keluarga | Ukuran | Paradigma tool-calling | Hosted via |
|----|-------|----------|--------|------------------------|-----------|
| M1 | `qwen3.5:35b` | Qwen 3.5 | 35 B (Q4_K_M, 24 GB) | *Native function calling* | Ollama |
| M2 | `deepseek-r1:32b` | DeepSeek-R1 | 32 B (Q4_K_M, 20 GB) | *Prompt-based JSON dispatch* | Ollama |
| M3 | `mistral-small3.2:24b` | Mistral Small 3.2 | 24 B (Q4_K_M, 14 GB) | *Native function calling* | Ollama |

***Inference backend*:** Ollama dilayani dari satu server GPU
tunggal (24 GB VRAM) yang diakses melalui *endpoint* HTTPS
*Cloudflare-tunneled*. *Sampling*: temperatur 0,1 dengan parameter
*top-p* dan *top-k* default. *Embedding model* untuk LED dimuat
dengan biaya pra-deployment yang sama untuk semua model.

**Run.** 7 indikator dievaluasi untuk masing-masing dari tiga model,
menghasilkan 21 invokasi agen secara keseluruhan. *Resume mode*
digunakan untuk menangani *failure* tunneling; setiap hasil
di-*stream* ke CSV sehingga *interruption* tidak menghapus progres
yang sudah ada.

---

## V. Hasil

### 5.1 Performa Agregat

Tabel 2 merangkum performa agregat ketiga model pada 7 indikator
proses pembelajaran dan kurikulum. Dua temuan menonjol: (1)
`deepseek-r1:32b` memimpin metrik *exact match* (57,1%) dan MAE
yang kompetitif (0,71); (2) `qwen3.5:35b` mendominasi reliabilitas
dengan akurasi *within-±1* sempurna (100%) dan MAE terbaik (0,57),
walaupun *exact match*-nya lebih rendah (42,9%).

**Tabel 2 — Performa Agregat (7 Indikator)**

| Model | MAE ↓ | RMSE ↓ | *Exact* ↑ | Akurasi ±1 ↑ | Pearson r | Rerata Conf | Runtime/ind |
|---|---|---|---|---|---|---|---|
| **`qwen3.5:35b`** | **0,57** | **0,76** | 42,9% | **100,0%** | 0,35 | 0,78 | 30,2 d |
| `deepseek-r1:32b` | 0,71 | 1,25 | **57,1%** | 85,7% | **0,41** | 0,74 | 68,2 d |
| `mistral-small3.2:24b` | 1,81 | 2,15 | 14,3% | 42,9% | 0,34 | 0,88 | 14,1 d |

`mistral-small3.2:24b` berperforma jauh di bawah dua model lainnya
dengan MAE 1,81 dan akurasi *within-±1* hanya 42,9% (3 dari 7
indikator). Menariknya, model ini justru memiliki rerata *confidence*
tertinggi (0,88) — sebuah pola *overconfidence* yang juga muncul
pada hasil *false refusal*-nya.

### 5.2 Per-Type Breakdown

Tabel 3 mengungkap **temuan utama** paper ini: model menunjukkan
profil performa yang sangat berbeda pada indikator komposit versus
kualitatif murni.

**Tabel 3 — Per-Type Breakdown**

| Model | Tipe | n | MAE ↓ | *Exact* ↑ | Akurasi ±1 ↑ | Skor=0 |
|---|---|---|---|---|---|---|
| `qwen3.5:35b` | Kualitatif | 4 | 0,75 | 25,0% | **100,0%** | 0 |
| `qwen3.5:35b` | Komposit | 3 | 0,33 | 66,7% | **100,0%** | 0 |
| `deepseek-r1:32b` | Kualitatif | 4 | 1,25 | 25,0% | 75,0% | 1 |
| `deepseek-r1:32b` | Komposit | 3 | **0,00** | **100,0%** | **100,0%** | 0 |
| `mistral-small3.2:24b` | Kualitatif | 4 | 2,45 | 0,0% | 25,0% | **3** |
| `mistral-small3.2:24b` | Komposit | 3 | 1,22 | 33,3% | 66,7% | 1 |

**`deepseek-r1:32b`** mencapai performa sempurna pada indikator
komposit: 100% *exact match* di seluruh tiga indikator (14, 15, 16)
dengan MAE 0,00. Pada indikator kualitatif murni, performanya turun
signifikan ke MAE 1,25 dengan satu kasus *false refusal* (Indikator
20: Capstone Design diberi skor 0 padahal LED jelas menyebutkan
implementasi).

**`qwen3.5:35b`** menunjukkan profil paling konsisten: 100% akurasi
*within-±1* di kedua tipe, tanpa satupun *false refusal*. Walaupun
*exact match*-nya tidak setinggi DeepSeek-R1 di komposit
(`qwen` 66,7% vs `deepseek` 100,0%), `qwen` tidak pernah salah lebih
dari satu poin dari referensi.

**`mistral-small3.2:24b`** gagal pada kategori kualitatif: 0% *exact*
dan 3 dari 4 indikator menjadi *false refusal* (skor 0 dengan
"Tidak ada informasi yang diberikan" meski *chunk* LED ter-*retrieve*).

Interpretasi: indikator komposit (yang memerlukan dua sub-skor +
formula sederhana) cocok untuk model *reasoning* yang dapat
mengikuti *chain-of-thought* terstruktur; sebaliknya indikator
kualitatif murni paling menguntungkan model dengan instruksi yang
tegas dan *agentic decisiveness* — domain di mana `qwen3.5:35b`
unggul karena tidak pernah menolak menilai.

### 5.3 Studi Kasus per Indikator

Tabel 4 menampilkan skor model versus referensi untuk seluruh 7
indikator. Marker (✓ = exact, ~ = within-±1, ✗ = off > 1) memberikan
visualisasi cepat profil disagreement.

**Tabel 4 — Skor per Indikator**

| No | Tipe | Ref | `deepseek-r1:32b` | `mistral-small3.2:24b` | `qwen3.5:35b` |
|----|------|-----|-------------------|------------------------|----------------|
| 14 | Komposit | 3,0 | 3,0 ✓ | 3,0 ✓ | 3,0 ✓ |
| 15 | Komposit | 3,0 | 3,0 ✓ | 2,3 ~ | 3,0 ✓ |
| 16 | Komposit | 3,0 | 3,0 ✓ | 0,0 ✗ | 4,0 ~ |
| 17 | Kualitatif | 2,0 | 1,0 ~ | 0,0 ✗ | 3,0 ~ |
| 20 | Kualitatif | 3,0 | 0,0 ✗ | 0,0 ✗ | 3,0 ✓ |
| 22 | Kualitatif | 3,0 | 2,0 ~ | 0,0 ✗ | 4,0 ~ |
| 24 | Kualitatif | 3,0 | 3,0 ✓ | 4,0 ~ | 4,0 ~ |

**Indikator 14** (Kesesuaian dan tinjauan CPL): Ketiga model
sepakat dengan referensi (3,0). Ini menunjukkan bahwa indikator
dengan rubrik dan bukti yang sangat eksplisit dapat dinilai
konsisten oleh berbagai keluarga model.

**Indikator 16** (Proses Pembelajaran): `qwen` (4,0) *over-score*
satu poin, sedangkan `mistral` (0,0) mengalami *false refusal*
walaupun bukti tersedia. `deepseek` paling akurat (3,0).

**Indikator 20** (Capstone Design): Kasus paling menarik —
**baik `deepseek` maupun `mistral` mengalami *false refusal***
(skor 0), padahal LED p.77 menyebutkan eksplisit pelaksanaan
Capstone via Pedoman Capstone Project PENS. Hanya `qwen` yang
memberikan skor benar (3,0) dengan justifikasi yang sesuai.

### 5.4 Failure Mode: False Refusal

Pada subset 7 indikator ini, *failure mode* yang paling dominan
adalah ***false refusal*** — model memberikan skor 0 dengan
justifikasi "Tidak ada bukti" atau "Bukti tidak ditemukan" meski
bukti ada di *chunk* LED yang ter-*retrieve* dan ditampilkan ke
model.

**Tabel 5 — False Refusal per Model**

| Model | Total skor=0 | Indikator yang difalse-refuse |
|---|---|---|
| `qwen3.5:35b` | **0** | (tidak ada) |
| `deepseek-r1:32b` | 1 | 20 (Capstone) |
| `mistral-small3.2:24b` | 4 | 16, 17, 20, 22 |

**`qwen3.5:35b`** menunjukkan reliabilitas sempurna — tidak pernah
menolak menilai. Ini konsisten dengan training Qwen pada tugas
agentic yang menekankan *decisiveness*.

**`deepseek-r1:32b`** mengalami *false refusal* hanya pada Indikator
20. Inspeksi *chain-of-thought* (`<think>...</think>` block)
menunjukkan bahwa model membaca *chunk* LED yang relevan tetapi
menyimpulkan "evidence is too generic to verify all four aspects"
— sebuah *over-cautious refusal*.

**`mistral-small3.2:24b`** menunjukkan *false refusal* parah pada
4 dari 7 indikator. Pola justifikasi "Tidak ada informasi yang
diberikan untuk mengevaluasi kriteria ini" muncul berulang meski
*chunk* LED dan tabel LKPS tersedia di konteks. Pola ini menyiratkan
bahwa *instruction-tuning* `mistral-small3.2:24b` menekankan
*"explanatory caution"* alih-alih *"agentic decisiveness"*.

### 5.5 Runtime dan Biaya

`mistral-small3.2:24b` paling cepat (14,1 detik per indikator),
tetapi kualitas terburuk; `deepseek-r1:32b` paling lambat
(68,2 detik) karena *reasoning loop overhead* yang intrinsik pada
model CoT (Tabel 6). `qwen3.5:35b` menempati frontier Pareto
kecepatan-kualitas dengan 30,2 detik per indikator.

**Tabel 6 — Perbandingan Runtime dan Biaya**

| Model | Total runtime (7 ind) | Rerata/ind | Token (estimasi) | Biaya @ Vast.ai 24 GB |
|---|---|---|---|---|
| `qwen3.5:35b` | 3,5 menit | 30,2 d | ~17k | < $0,05 |
| `deepseek-r1:32b` | 8,0 menit | 68,2 d | ~45k | < $0,05 |
| `mistral-small3.2:24b` | 1,6 menit | 14,1 d | ~8k | < $0,01 |

---

## VI. Pembahasan

**6.1 Trade-off antara *exact match* dan reliabilitas.** Hasil kami
menunjukkan bahwa pemilihan model untuk penilaian akreditasi
otomatis bukan keputusan satu dimensi. `deepseek-r1:32b` mencapai
*exact match* tertinggi (57,1%) tetapi dengan satu kasus *off-error*
besar (Indikator 20: skor 0 vs ref 3). Sebaliknya `qwen3.5:35b`
"hanya" mencapai 42,9% *exact match*, namun **tidak pernah** salah
lebih dari satu poin dari referensi. Untuk *deployment* sebagai
*draft scorer* yang akan diverifikasi asesor manusia, reliabilitas
`qwen` lebih bernilai daripada *exact match* `deepseek`: asesor
hanya perlu mengoreksi ±1 daripada me-redo penilaian dari nol.

**6.2 Mengapa model reasoning unggul pada komposit.** Pada
indikator komposit (formula `Skor = (I + II) / 2` atau serupa),
`deepseek-r1:32b` mencapai 100% *exact match*. Hipotesis kami:
struktur komposit secara natural cocok dengan *chain-of-thought*
DeepSeek — model dapat secara terpisah menilai sub-skor I,
menilai sub-skor II, kemudian menerapkan formula sebagai langkah
penalaran terakhir. Tahap-tahap ini eksplisit di blok `<think>`
yang dapat kami inspeksi, dan sangat jarang gagal. Sebaliknya,
indikator kualitatif murni membutuhkan pemberian skor "satu-tembak"
yang bergantung pada *holistic judgment* — area di mana model
*reasoning* justru kurang unggul dibanding model dengan
*tool-tuning* khusus.

**6.3 *False refusal* sebagai *failure mode* dominan.** Pada subset
ini, *quantitative collapse* (yang kami identifikasi sebagai
*failure mode* di studi kami yang lebih luas dengan 60 indikator)
tidak teramati karena tidak ada indikator kuantitatif murni dalam
subset. Namun *false refusal* — model menolak menilai meski bukti
ada — menjadi *failure mode* dominan, terutama pada
`mistral-small3.2:24b` (4 dari 7). Pola justifikasi yang
berulang ("Tidak ada informasi yang diberikan") menyiratkan bahwa
*instruction-tuning* model ini cenderung *over-cautious*. Ini
merupakan *trade-off instruction-tuning* yang umum: model yang
dilatih untuk "mengakui ketidaktahuan" dapat secara konsisten
menolak menjawab dalam *setting* dengan bukti yang ambigu atau
*retrieval* yang tidak sempurna.

**6.4 Implikasi untuk *deployment* institusional.** Hasil pada
subset 7 indikator ini memberikan rekomendasi konkret bagi
institusi pendidikan tinggi yang ingin memanfaatkan agen LLM
untuk audit mutu internal:
- Untuk **draft scorer reliable**: pilih `qwen3.5:35b` (atau
  generalis dengan *tool-tuning* native serupa). 100% *within-±1*
  berarti asesor manusia hanya perlu fine-tuning satu poin.
- Untuk indikator yang **didominasi struktur komposit**:
  `deepseek-r1:32b` bisa lebih akurat *jika* indikator yang
  dianalisis ada dalam zona kuat-nya, namun risiko *off-error*
  pada kasus kualitatif kompleks tetap perlu di-*flag*.
- **Hindari** `mistral-small3.2:24b` untuk indikator dominan
  kualitatif — tingkat *false refusal* 75% di kategori ini akan
  membutuhkan koreksi manual yang ekstensif.

**6.5 Keterbatasan.** Penelitian ini memiliki beberapa keterbatasan
penting yang harus dipertimbangkan dalam interpretasi hasil:
- **Subset terbatas (n=7):** kami fokus pada indikator proses
  pembelajaran dan kurikulum; generalisasi ke indikator lain
  (terutama kuantitatif murni dengan ekstraksi dari LKPS) belum
  terverifikasi dalam paper ini.
- **Program tunggal (n=1):** generalisasi ke program studi lain,
  perguruan tinggi lain, atau bidang ilmu di luar teknik belum
  terverifikasi.
- **Referensi berbasis LLM:** Claude sebagai *annotator* awal
  bukan asesor LAM tersertifikasi; *future work* harus mencakup
  validasi oleh ahli akreditasi manusia setidaknya pada subset
  representatif.
- ***Single inference run*** per (model, indikator); tanpa studi
  varians akibat *temperature sampling*.
- **Cakupan model:** kami fokus pada model *open-weight* di Ollama
  dan tidak membandingkan dengan provider terkelola seperti
  Anthropic, OpenAI, atau Google. Pilihan ini disengaja karena
  konteks deployment di institusi Indonesia sering memerlukan data
  berdiam di perimeter institusional.

---

## VII. Kesimpulan

Penelitian ini menyajikan *benchmark* fokus tiga LLM *open-weight*
berukuran 24–35 B parameter pada 7 indikator proses pembelajaran
dan kurikulum dari rubrik LAM Teknik. Temuan utama:
- `deepseek-r1:32b` (model *reasoning* dengan dispatch berbasis
  prompt) mencapai *exact match* tertinggi 57,1% (MAE 0,71), berkat
  performa sempurna 100% pada indikator komposit.
- `qwen3.5:35b` (generalis dengan *tool-tuning* native) unggul
  dalam reliabilitas dengan akurasi *within-±1* sempurna 100%
  (MAE 0,57) dan tanpa *false refusal*.
- `mistral-small3.2:24b` berperforma buruk pada subset ini
  (MAE 1,81; *exact* 14,3%) dengan 4 dari 7 keluaran berupa
  *false refusal*, terutama pada indikator kualitatif.

Untuk deployment praktis sebagai *draft scorer* yang akan
diverifikasi asesor manusia, kami merekomendasikan `qwen3.5:35b`
karena reliabilitasnya yang konsisten. Untuk batch indikator yang
didominasi struktur komposit, `deepseek-r1:32b` dapat menjadi
alternatif yang menjanjikan dengan kewaspadaan terhadap kasus
*false refusal* yang sesekali muncul.

Kami merilis kode agen, *trace* skor yang sudah dianonimkan, serta
skrip *benchmark* untuk memfasilitasi penelitian lanjutan, termasuk
ekstensi ke seluruh 60 indikator, validasi oleh ahli akreditasi
manusia, dan perbandingan dengan model *managed* seperti GPT,
Claude, dan Gemini.

**Kode & data:** [URL github setelah anonimisasi]

---

## Ucapan Terima Kasih

Penulis berterima kasih kepada institusi mitra atas pemberian bukti
akreditasi dengan ketentuan kerahasiaan (NDA). Sumber daya komputasi
disediakan oleh [infrastruktur lab/Vast.ai].

---

## Referensi

[1] S. Yao et al., "ReAct: Synergizing Reasoning and Acting in
    Language Models," in *Proc. ICLR*, 2023.
[2] P. Lewis et al., "Retrieval-Augmented Generation for
    Knowledge-Intensive NLP Tasks," in *Proc. NeurIPS*, 2020.
[3] L. Zheng et al., "Judging LLM-as-a-Judge with MT-Bench and
    Chatbot Arena," in *Proc. NeurIPS*, 2023.
[4] S. Es et al., "RAGAS: Automated Evaluation of Retrieval
    Augmented Generation," in *Proc. EACL*, 2024.
[5] T. Schick et al., "Toolformer: Language Models Can Teach
    Themselves to Use Tools," in *Proc. NeurIPS*, 2023.
[6] Qwen Team, "Qwen2.5 Technical Report," 2024.
[7] DeepSeek-AI, "DeepSeek-R1: Incentivizing Reasoning Capability
    in LLMs via Reinforcement Learning," 2025.
[8] Mistral AI, "Mistral Small 3 Technical Report," 2025.
[9] N. Reimers and I. Gurevych, "Making Monolingual Sentence
    Embeddings Multilingual using Knowledge Distillation," in
    *Proc. EMNLP*, 2020.
[10] OpenAI, "Function Calling and Other API Updates," OpenAI Blog,
     June 2023.
[11] LangChain, "LangGraph: Building Stateful, Multi-Actor
     Applications with LLMs," 2024.
[12] BAN-PT, "Peraturan BAN-PT Nomor 3 Tahun 2019 tentang Instrumen
     Akreditasi Program Studi," Jakarta: BAN-PT, 2019.
[13] LAM Teknik, "Pedoman Penilaian Akreditasi Program Studi
     Sarjana Terapan Bidang Teknik," 2023.
[14] B. Wilie et al., "IndoNLU: Benchmark and Resources for
     Evaluating Indonesian Natural Language Understanding," in
     *Proc. AACL*, 2020.
[15] Y. Gao et al., "Retrieval-Augmented Generation for Large
     Language Models: A Survey," *arXiv:2312.10997*, 2024.
