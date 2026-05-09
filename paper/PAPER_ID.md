# Pemanggilan Tool Native vs Berbasis Prompt: Studi Komparatif Agen LLM Open-Weight untuk Audit Mutu Internal Pendidikan Tinggi

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
dapat mengotomatisasi tugas penilaian lintas-modal ini, dan bagaimana
pilihan paradigma agen — *native function calling* versus dispatch
JSON berbasis prompt — memengaruhi performa pada tipe indikator
kualitatif maupun kuantitatif. Kami mengimplementasikan agen
*Retrieval-Augmented Generation* (RAG) yang melakukan
*cross-referencing* antara *chunk* LED yang ter-indeks secara vektor
dengan tabel LKPS terstruktur melalui empat *tool* khusus, kemudian
melakukan *benchmark* tiga model *open-weight* berukuran sebanding
(24–35 miliar parameter): generalis dengan *tool-tuning*
(`qwen3.5:35b`), model fokus *reasoning* dalam mode berbasis prompt
(`deepseek-r1:32b`), dan model *chat* berukuran menengah
(`mistral-small3.2:24b`), dibandingkan terhadap referensi yang
dihasilkan oleh Claude pada seluruh 60 indikator rubrik LAM Teknik.
Generalis dengan *tool-tuning* mencapai akurasi *within-±1* sebesar
88,3% dan *exact match* 36,7% (MAE 0,79), unggul jauh dari model
*reasoning* (46,7%; MAE 1,79) maupun model *chat* menengah (51,7%;
MAE 1,70). Kami mengidentifikasi tiga *failure mode* berbeda —
*quantitative extraction collapse*, *tutorial-mode output*, dan
*false refusal* — serta mendiskusikan implikasinya bagi pemanfaatan
agen *open-weight* dalam evaluasi akademik berstandar.

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

Kami mengamati bahwa agen LLM dapat dibangun dengan dua paradigma
*tool-dispatch* yang berbeda. Model dengan dukungan *tool* native
seperti Qwen dan Mistral menghasilkan struktur `tool_calls` yang
langsung dieksekusi oleh *executor*. Sebaliknya, model *reasoning*
seperti DeepSeek-R1, QwQ, dan o1 menghasilkan blok
`<think>...</think>` *chain-of-thought* dan tidak mendukung
*function calling* native pada Ollama; mereka memerlukan *wrapper*
dispatch JSON berbasis prompt yang melakukan parsing manual atas
output model. Pertanyaan terbuka adalah: apakah dispatch berbasis
prompt menyamai *tool calling* native pada penilaian
*document-grounded* di domain ini?

Kontribusi paper ini adalah:
1. Sebuah agen RAG lintas-modal *open-source* untuk penilaian AMI
   yang memadukan *vector retrieval* atas LED dengan *table lookup*
   atas LKPS melalui empat *tool* spesialis.
2. *Benchmark* pertama untuk tiga LLM *open-weight* (`qwen3.5:35b`,
   `deepseek-r1:32b`, `mistral-small3.2:24b`) pada seluruh 60
   indikator rubrik LAM Teknik, menggunakan LLM yang lebih kuat
   (Claude) sebagai *reference annotator* awal.
3. Karakterisasi tiga *failure mode* — *quantitative collapse*,
   *tutorial-mode output*, dan *false refusal* — yang muncul secara
   berbeda antar keluarga model.

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

### 3.4 Anotasi Referensi

Skor referensi dihasilkan menggunakan Claude (Anthropic) sebagai
*LLM-as-annotator*. Untuk setiap indikator, Claude menerima rubrik
lengkap, top-2 *chunk* LED hasil *vector search*, dan ekstrak tabel
LKPS yang relevan, kemudian memberikan skor 0–4 dengan justifikasi
dan *confidence*. Kami secara eksplisit menyatakan bahwa ini adalah
referensi awal berbasis LLM, bukan *ground truth* dari asesor LAM
tersertifikasi, dan akan kami diskusikan keterbatasannya di
Section VI.

### 3.5 Metrik Evaluasi

- **Mean Absolute Error (MAE):** rerata `|score_model − score_ref|`.
- **Root Mean Squared Error (RMSE):** memberi penalti pada *disagreement* besar.
- ***Exact match*:** rasio skor identik dengan referensi.
- **Akurasi *within-±1*:** rasio kasus dengan |selisih| ≤ 1; ambang
  batas yang umum diterima sebagai kesepakatan antar asesor.
- **Pearson r:** korelasi linier model–referensi.
- ***Per-type breakdown*:** kualitatif / komposit / kuantitatif.
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

**Run.** Seluruh 60 indikator dievaluasi untuk masing-masing dari
tiga model, menghasilkan 180 invokasi agen secara keseluruhan.
*Resume mode* digunakan untuk menangani *failure* tunneling; setiap
hasil di-*stream* ke CSV sehingga *interruption* tidak menghapus
progres yang sudah ada.

---

## V. Hasil

### 5.1 Performa Agregat

Tabel 2 merangkum performa agregat ketiga model pada seluruh 60
indikator. Generalis dengan *tool-tuning* `qwen3.5:35b` mendominasi
seluruh metrik kualitas: MAE 0,79 (vs 1,70–1,79 untuk model lain),
*exact match* 36,7%, dan akurasi *within-±1* 88,3%. Menariknya,
`deepseek-r1:32b` justru memiliki rerata *confidence* tertinggi
(0,81) tetapi MAE terburuk (1,79) — sebuah indikasi *overconfidence*
yang sering muncul pada model *reasoning* yang gagal dispatch tool.

**Tabel 2 — Performa Agregat (60 Indikator)**

| Model | MAE ↓ | RMSE ↓ | *Exact* ↑ | Akurasi ±1 ↑ | Pearson r | Rerata Conf | Runtime/ind |
|---|---|---|---|---|---|---|---|
| **`qwen3.5:35b`** | **0,79** | **1,14** | **36,7%** | **88,3%** | -0,06 | 0,73 | 26,6 d |
| `deepseek-r1:32b` | 1,79 | 2,18 | 15,0% | 46,7% | -0,08 | 0,81 | 74,8 d |
| `mistral-small3.2:24b` | 1,70 | 2,18 | 23,3% | 51,7% | 0,09 | 0,56 | 11,6 d |

Nilai Pearson r yang berdekatan dengan nol mencerminkan ruang skor
ordinal 5-kelas yang terpotong (0–4), bukan ketiadaan kesepakatan;
akurasi *within-±1* adalah ukuran yang lebih informatif untuk
skoring rubrik bertingkat.

### 5.2 Per-Type Breakdown

Tabel 3 mengungkap **temuan utama** paper ini: dua model
non-pemenang gagal pada tipe indikator yang *berkebalikan*.

**Tabel 3 — Per-Type Breakdown**

| Model | Tipe | n | MAE ↓ | *Exact* ↑ | Akurasi ±1 ↑ | Skor=0 |
|---|---|---|---|---|---|---|
| `qwen3.5:35b` | Kualitatif | 20 | 0,55 | 50,0% | 95,0% | 0 |
| `qwen3.5:35b` | Komposit | 12 | 0,58 | 33,3% | 100,0% | 0 |
| `qwen3.5:35b` | Kuantitatif | 28 | 1,05 | 28,6% | 78,6% | 3 |
| `deepseek-r1:32b` | Kualitatif | 20 | 1,55 | 25,0% | 55,0% | 4 |
| `deepseek-r1:32b` | Komposit | 12 | 1,08 | 33,3% | 58,3% | 1 |
| `deepseek-r1:32b` | Kuantitatif | 28 | 2,27 | **0,0%** | 35,7% | **12** |
| `mistral-small3.2:24b` | Kualitatif | 20 | 2,45 | 10,0% | 30,0% | **12** |
| `mistral-small3.2:24b` | Komposit | 12 | 2,14 | 16,7% | 33,3% | 7 |
| `mistral-small3.2:24b` | Kuantitatif | 28 | 0,98 | 35,7% | 75,0% | 4 |

**`deepseek-r1:32b`** ambruk pada indikator kuantitatif: 0% *exact
match* dan 12 dari 28 (42,9%) indikator diberi skor 0, didominasi
justifikasi "Bukti tidak ditemukan". Sebaliknya, performanya pada
indikator kualitatif (25% *exact*) dan komposit (33,3% *exact*)
masih memadai.

**`mistral-small3.2:24b`** menunjukkan pola berkebalikan:
performa kuantitatif (35,7% *exact*) mendekati `qwen3.5:35b`
(28,6%), tetapi pada indikator kualitatif menjadi yang terburuk
(10% *exact*, 12 dari 20 *false-refusal*).

Interpretasi: model *reasoning* dapat memberi skor dari teks
naratif tetapi tidak dapat ekstrak angka dari tabel secara konsisten
dalam mode berbasis prompt; model *chat* berukuran menengah dapat
menerapkan formula bila data tersedia dalam bentuk numerik tetapi
menolak bila harus membaca naratif panjang.

### 5.3 Tiga Failure Mode

Tabel 4 memberikan taksonomi tiga *failure mode* berbeda yang
diobservasi.

**Tabel 4 — Taksonomi Failure Mode**

| Mode | Diobservasi pada | Gejala | Contoh |
|---|---|---|---|
| ***Quantitative collapse*** | `deepseek-r1:32b` | Skor=0 dengan "Bukti tidak ditemukan" pada indikator numerik | Ind. 42 (IPK lulusan): ref=4,0; model=0; LKPS Tabel 6.b jelas berisi nilai IPK 3,33–3,58. |
| ***Tutorial-mode output*** | `mistral-small3.2:24b` | Model menghasilkan instruksi *step-by-step* alih-alih keputusan | Ind. 18 (PJP): tutorial 200 kata; *parser* mengangkat "4" dari contoh rubrik. |
| ***False refusal* & halusinasi** | `mistral-small3.2:24b` | Skor=0 meski bukti ada; kadang mengarang angka spesifik | Ind. 23 (PPDMhs): model menulis "PPDMhs=(10/20)×100%=50%"; baik 10 maupun 20 tidak ada di sumber. |

### 5.4 Runtime dan Biaya

`qwen3.5:35b` menempati frontier Pareto kecepatan-kualitas dengan
26,6 detik per indikator (Tabel 5). `mistral-small3.2:24b` paling
cepat (11,6 d) tetapi kualitas terburuk; `deepseek-r1:32b` 3 kali
lebih lambat dari pemenang akibat *reasoning loop overhead* yang
intrinsik pada model CoT.

**Tabel 5 — Perbandingan Runtime dan Biaya**

| Model | Total runtime (60 ind) | Rerata/ind | Token (estimasi) | Biaya @ Vast.ai 24 GB |
|---|---|---|---|---|
| `qwen3.5:35b` | 26,6 menit | 26,6 d | ~150k | ≈ $0,10 |
| `deepseek-r1:32b` | 74,8 menit | 74,8 d | ~400k | ≈ $0,30 |
| `mistral-small3.2:24b` | 11,6 menit | 11,6 d | ~80k | ≈ $0,05 |

### 5.5 Studi Kasus Justifikasi

Tabel 6 menampilkan dua studi kasus kontras. Pada Indikator 8
(kualitatif: pengelolaan keuangan), `qwen3.5` dan `deepseek-r1`
memberikan skor benar (4) dengan justifikasi yang sebanding,
sementara `mistral` memberikan *false refusal* meski bukti retrieved
sama. Pada Indikator 42 (kuantitatif: IPK), justru `mistral` yang
benar; `qwen3.5` *under-score* satu poin (masih dalam ±1); dan
`deepseek-r1` mengalami *quantitative collapse*.

**Tabel 6 — Studi Kasus Justifikasi**

**Indikator 8 — Pengelolaan keuangan (kualitatif). Ref = 4.**

| Model | Skor | Justifikasi (terpotong) |
|---|---|---|
| `qwen3.5:35b` | 4,0 | "Bukti menunjukkan pengelolaan keuangan dengan realisasi 100%, sistem audit mutu internal yang komprehensif…" |
| `deepseek-r1:32b` | 4,0 | "Bukti menunjukkan pengelolaan keuangan yang akuntabel, transparan, patuh regulasi…" |
| `mistral-small3.2:24b` | 0,0 | "Tidak ada bukti yang disediakan yang mengacu pada aspek transparansi…" |

**Indikator 42 — IPK lulusan (kuantitatif). Ref = 4.**

| Model | Skor | Justifikasi (terpotong) |
|---|---|---|
| `qwen3.5:35b` | 3,0 | "IPK rata-rata lulusan berada pada kisaran 3.33-3.58…" *(under-scored)* |
| `deepseek-r1:32b` | 0,0 | "Bukti RIPK tidak ditemukan dalam dokumen yang disediakan." *(collapse)* |
| `mistral-small3.2:24b` | 4,0 | "Rata-rata IPK lulusan dalam 3 tahun terakhir memenuhi kriteria…" *(benar)* |

---

## VI. Pembahasan

**6.1 Mengapa native tool calling unggul.** Dispatch berbasis prompt
pada model *reasoning* harus melalui tiga tahap rapuh: (a)
menghasilkan JSON valid, (b) mem-*parse* hasil tool sebagai teks
murni, dan (c) memanggil ulang tool sambil bernalar. Setiap tahap
adalah titik kegagalan potensial yang absen pada paradigma native.
Pada `deepseek-r1`, kami sering melihat model "berpikir terlalu
lama" tentang JSON syntax sehingga akhirnya menghasilkan struktur
yang valid secara format tetapi salah secara semantik (misalnya
nama argumen `formula` alih-alih `formula_expression`, yang harus
kami normalisasi sebelum eksekusi).

**6.2 Mengapa model menengah gagal berbeda.** Output mode tutorial
pada `mistral-small3.2:24b` menyiratkan bahwa *instruction-tuning*
model ini menekankan *"explanatory helpfulness"* alih-alih
*"agentic decisiveness"*. Pola ini terlihat pada Indikator 6, 18,
27, 31, dan 32 di mana model mengembalikan instruksi
*step-by-step* "cara menghitung" alih-alih jawaban final. Halusinasi
angka pada Indikator 23 lebih mengkhawatirkan: model *fabricated*
nilai NPMhs=10 dan NPD=20 yang tidak ada di sumber LKPS. Ini adalah
*trade-off instruction-tuning* yang umum dikenal tetapi belum
banyak terdokumentasi pada konteks agen domain non-Inggris.

**6.3 Implikasi untuk deployment institusional.** Hasil kami
menunjukkan bahwa LLM *open-weight* skala 35 B dengan *tool-calling*
native dapat mencapai 88% *within-±1* dari referensi LLM ahli pada
26 detik per indikator. Angka ini menjanjikan untuk pemanfaatan
sebagai *draft scorer* yang membantu asesor manusia, namun belum
memadai untuk pengambilan keputusan otonom. Asesor manusia tetap
diperlukan untuk verifikasi, terutama pada indikator dengan
*disagreement* tinggi atau *confidence* rendah.

**6.4 Keterbatasan.** Penelitian ini memiliki beberapa keterbatasan
penting yang harus dipertimbangkan dalam interpretasi hasil:
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
  berdiamamain di perimeter institusional.

---

## VII. Kesimpulan

Penelitian ini menyajikan *benchmark* pertama tiga LLM *open-weight*
berukuran 24–35 B parameter pada tugas penilaian akreditasi
pendidikan tinggi Indonesia bergaya LAM-Teknik. Temuan utama:
LLM *open-weight* dengan *tool-calling* native (`qwen3.5:35b` dalam
pengujian kami) mendekati *baseline* yang berguna bagi penilaian
akreditasi berbantuan AI dengan akurasi *within-±1* sebesar 88,3%.
Sebaliknya, dispatch berbasis prompt pada model *reasoning*
(`deepseek-r1:32b`) berperforma rendah secara spesifik pada
ekstraksi numerik dari tabel terstruktur, dan model *chat* menengah
(`mistral-small3.2:24b`) menunjukkan *failure mode* unik berupa
*tutorial output* dan *false refusal* pada indikator kualitatif.

Kami merilis kode agen, *trace* skor yang sudah dianonimkan, serta
skrip *benchmark* untuk memfasilitasi penelitian lanjutan, termasuk
ekstensi ke beberapa program studi, validasi oleh ahli akreditasi
manusia, dan eksplorasi paradigma agen alternatif.

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
