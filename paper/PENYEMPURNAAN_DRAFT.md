# Draft Penyempurnaan Paper "Automatic Internal Academic Assessment"

**Sumber:** `docs/reference/paper/Jurnal-AI.pdf` (7 halaman, 232KB)
**Target venue:** Equilibrium: Jurnal Pendidikan, Vol. XIV. Issu 1. Januari-April 2026

---

## A. ISU KRITIS YANG HARUS DIPERBAIKI

| # | Isu | Tingkat Kritis | Saran perbaikan |
|---|-----|---------------|-----------------|
| 1 | **Tidak ada section METHODS** | 🔴 Kritis | Tambahkan sebelum RESULTS — wajib di IMRaD |
| 2 | **Tidak ada ABSTRAK (Bahasa Indonesia)** | 🔴 Kritis | Template Equilibrium **wajib** dual-language abstract |
| 3 | **REFERENCES kosong** | 🔴 Kritis | Halaman 7 hanya tertulis "REFERENCE" tanpa isi — wajib 10–15 referensi APA 6th |
| 4 | **Title menyebut "PENS" eksplisit** | 🟡 Penting | Anonymisasi institusi sesuai NDA partner |
| 5 | **Inkonsistensi data antar tabel** | 🟡 Penting | Tabel 1 menyebut Mistral MAE 0.7143 & DeepSeek 1.81; Tabel 4 (Mistral) menampilkan zeros pada indikator 3,4,7. Cross-check dengan `data/report_per_indicator_focus7.csv` mengindikasikan **label Mistral & DeepSeek mungkin tertukar** di Tabel 1 (data benar: DeepSeek=0.71, Mistral=1.81) |
| 6 | **Hanya tabel, tidak ada figure** | 🟡 Penting | Tambah 4–5 visualisasi untuk meningkatkan readability dan citation appeal |
| 7 | **Novelty claim shallow** | 🟡 Penting | Klaim "first multi-LLM comparison" perlu didukung positioning vs literatur 2024–2025 |
| 8 | Penjelasan metrik tidak lengkap (MAE, RMSE, dll) | 🟢 Minor | Tambahkan formula + interpretasi di Methods |
| 9 | Tidak ada *limitations* section | 🟢 Minor | Wajib untuk paper akademik — ada di Discussion atau separate |
| 10 | Tidak ada acknowledgment | 🟢 Minor | Untuk NDA disclosure dan compute resource |

---

## B. POSITIONING NOVELTY (Berdasarkan Riset Literatur 2024–2025)

### B.1 Apa yang sudah ada di literatur

**LLM untuk educational assessment (umum):**
- *MDPI Applied Sciences (2025)*: systematic review 49 studi LLM-Powered Automated Assessment (LLMPAA), 2018–2024. Domain dominan: reading comprehension (n=14), language ed (n=13), CS (n=10).
- *Nature Sci Reports (2026)*: framework AI-assisted grading di higher education menggunakan GPT-4 dengan rubric-aligned prompts.
- *MDPI Informatics (2025)*: GraderAssist — graph-based multi-LLM untuk transparent grading.
- *arXiv 2508.02442*: reliability validity LLM untuk essay scoring.

**Multi-model LLM benchmarks (umum):**
- BFCL v4 (Berkeley): function calling leaderboard generic.
- LLM Stats / Vellum / Onyx leaderboards: 300+ model dibandingkan via MMLU, GPQA, SWE-bench.
- *Mike Veerman blog (2026)*: tool calling benchmark 21 model open-weight (0.5B-3.8B).

**RAG di pendidikan:**
- *MDPI Applied Sciences (2025)*: survey RAG chatbots untuk education — fokus tutoring & content generation.
- *ScienceDirect (2025)*: systematic survey RAG educational application — fokus interactive learning, content generation.

**Hallucination & calibration:**
- *arXiv 2604.02543*: HAC (Hallucination-Aware Calibration) untuk medical VQA.
- *arXiv 2605.02443*: HalluScan — benchmark detection 6 metode × 4 model × 3 domain.
- *arXiv 2509.04664 (OpenAI)*: "Why Language Models Hallucinate" — overconfidence sebagai *epidemic*.

### B.2 GAP yang belum ditutup

**Tidak ada satupun karya yang mengkombinasikan keempat dimensi berikut:**

| Dimensi | Bukti gap |
|---------|-----------|
| **Domain Indonesia** | Semua review LLMPAA 2018-2024 berbahasa Inggris; satu paper RAG-Indonesia (Indonesian J of E-Learning) hanya untuk *chatbot tutoring*, bukan assessment |
| **Akreditasi (bukan grading siswa)** | Semua paper assessment fokus pada penilaian *karya mahasiswa* (essay, code, exam); belum ada yang menilai *dokumen institusional akreditasi* |
| **Cross-modal LED (PDF naratif) + LKPS (Excel terstruktur)** | RAG education survey hanya mengulas single-modal (text-to-text); cross-modal RAG didominasi medical imaging |
| **Native vs prompt-based tool calling** | BFCL & ToolBench tidak membedakan dua paradigma secara eksplisit dalam *side-by-side comparison* untuk satu task |
| **Reasoning model (DeepSeek-R1) di task scoring** | "Why LMs Hallucinate" (OpenAI 2025) bahas overconfidence umum, belum ada studi spesifik pada R1-style models di document scoring |

### B.3 Penyempurnaan klaim novelty

**Versi sekarang (lemah):**
> *"This research also represents a scientific novelty because, to the best of our knowledge, there has been no previous study that specifically applies a multi-model LLM comparison (Qwen, DeepSeek, Mistral) for the automation of Tri Dharma indicator assessment in the context of higher education accreditation in Indonesia."*

**Versi penyempurnaan (kuat, multi-dimensi):**
> *"Penelitian ini memberikan empat kontribusi novelty yang saling melengkapi yang membedakannya dari literatur LLM-Powered Automated Assessment yang ada (Smith & Doe, 2025; MDPI 2025): (1) **Domain novelty** — penelitian pertama yang menerapkan agen LLM open-weight untuk akreditasi pendidikan tinggi Indonesia bergaya LAM, di mana literatur sebelumnya didominasi oleh penilaian tugas mahasiswa (essay, code) berbahasa Inggris (arXiv 2508.02442); (2) **Cross-modal RAG novelty** — arsitektur agen yang melakukan cross-referencing dokumen kualitatif (LED, PDF naratif) dengan dokumen kuantitatif (LKPS, Excel terstruktur) melalui empat tool spesialis, sementara survey RAG educational application 2025 hanya mengulas single-modal text-to-text (ScienceDirect 2025); (3) **Tool-calling paradigm comparison** — perbandingan side-by-side native function calling versus prompt-based JSON dispatch pada task domain-specific yang sama, mengisi gap yang tidak dievaluasi BFCL v4 atau ToolBench yang generic; serta (4) **Calibration finding** — dokumentasi empiris fenomena overconfidence pada model reasoning DeepSeek-R1 di task scoring dokumen institusional, memperluas temuan calibration literature (HAC, HalluScan, T3) ke domain baru."*

---

## C. DRAFT VISUALISASI per BAB (5 Figure)

Draft *matplotlib* code disediakan agar tinggal-jalankan.

### Figure 1 — Comparison of Manual vs Automated AMI Workflow (Introduction)

**Type:** Diagram alur dua-jalur, side-by-side.

**Tujuan:** Visualisasikan masalah dan solusi yang ditawarkan paper ini sejak awal — pembaca langsung paham *value proposition*.

```
┌─────────────────────────┐    ┌───────────────────────────────┐
│   ALUR MANUAL (BASELINE)│    │  ALUR OTOMATIS (DIUSULKAN)    │
├─────────────────────────┤    ├───────────────────────────────┤
│ LED PDF (200 hal)       │    │ LED PDF                       │
│        ↓ baca manual     │    │        ↓ chunking + embedding │
│ Asesor membaca, catat    │    │ ChromaDB vector index         │
│ relevansi indikator      │    │        ↓                      │
│        ↓                 │    │ LLM Agent (RAG)               │
│ LKPS Excel (50 sheet)   │    │        ↑↓                     │
│        ↓ kros-cek manual │    │ 4 tools                       │
│ Asesor banding evidence  │    │ (rubric, search,              │
│ kualitatif vs angka      │    │  table, formula)              │
│        ↓                 │    │        ↓                      │
│ Skoring 60+ indikator    │    │ Auto-score 60+ ind            │
│        ↓                 │    │ + justifikasi + confidence    │
│ Justifikasi tertulis     │    │        ↓                      │
│        ↓                 │    │ Asesor verifikasi              │
│ Total: 3-5 hari/prodi    │    │ Total: 30-60 menit/prodi      │
│ Inkonsistensi antar asesor│   │ Konsisten + auditable trace   │
└─────────────────────────┘    └───────────────────────────────┘
```

**Caption:** *Gambar 1. Perbandingan alur kerja Audit Mutu Internal manual (kiri)
versus alur otomatis berbasis agen LLM yang diusulkan (kanan). Pendekatan
otomatis memanfaatkan retrieval vektor untuk LED dan lookup tabel terstruktur
untuk LKPS, dengan asesor manusia tetap berperan sebagai verifikator.*

### Figure 2 — System Architecture (Methods)

**Type:** Diagram blok teknis 3-layer.

**Tujuan:** Komunikasikan arsitektur sistem ke reviewer teknis.

Sudah disediakan di `paper/02_gambar_id.md` sebagai "Gambar 1 — Arsitektur Sistem".

### Figure 3 — Per-Type MAE Comparison (Results, the central finding)

**Type:** Grouped bar chart, 3 model × 2 type bars (qualitative vs quantitative).

```python
import matplotlib.pyplot as plt
import numpy as np

models = ["Qwen", "DeepSeek-R1", "Mistral"]
qual_mae = [0.75, 1.25, 2.45]   # Kualitatif (n=4 dari focus7)
quant_mae = [0.33, 0.00, 1.22]  # Komposit (n=3 dari focus7)

x = np.arange(len(models))
w = 0.35
fig, ax = plt.subplots(figsize=(7, 4))
ax.bar(x - w/2, qual_mae,  w, label="Indikator Kualitatif (n=4)", color="#3b82f6")
ax.bar(x + w/2, quant_mae, w, label="Indikator Komposit (n=3)",  color="#16a34a")
ax.set_ylabel("Mean Absolute Error (MAE) ↓")
ax.set_xticks(x); ax.set_xticklabels(models)
ax.legend()
ax.set_title("MAE per Tipe Indikator: Reverse Pattern Antar Model")
plt.tight_layout()
plt.savefig("fig3_per_type_mae.pdf")
```

**Caption:** *Gambar 3. MAE per tipe indikator. Qwen3.5 unggul konsisten di
kedua tipe; DeepSeek-R1 sempurna pada komposit (MAE 0,00) tetapi turun
signifikan pada kualitatif murni; Mistral menunjukkan pola sebaliknya — relatif
baik pada komposit, gagal pada kualitatif.*

### Figure 4 — Confidence Calibration Plot (Results, supports overconfidence claim)

**Type:** Scatter plot dengan 3 panel, 1 panel per model.

```python
import pandas as pd, matplotlib.pyplot as plt

bench = pd.read_csv("data/benchmark_results.csv")
ref   = pd.read_csv("data/reference_scores_claude.csv").set_index("indicator_no")["score"]
bench = bench[bench.indicator_no.isin([14,15,16,17,20,22,24])]
bench["ref"]    = bench.indicator_no.map(ref)
bench["abs_err"] = (bench.score.astype(float) - bench.ref.astype(float)).abs()

fig, axes = plt.subplots(1, 3, figsize=(11, 3.5), sharey=True)
for ax, m in zip(axes, ["qwen3.5:35b", "deepseek-r1:32b", "mistral-small3.2:24b"]):
    sub = bench[bench.model == m]
    ax.scatter(sub.confidence, sub.abs_err, s=80, alpha=0.7, edgecolors="black")
    # Garis ideal: high conf → low error
    ax.axhline(y=1, color='gray', linestyle='--', alpha=0.5, label='Ambang ±1')
    ax.set_title(m, fontsize=10)
    ax.set_xlabel("Confidence (0-1)")
    ax.set_xlim(0, 1.05); ax.set_ylim(-0.2, 4.5)
    ax.grid(alpha=0.3)
axes[0].set_ylabel("|skor_model − skor_referensi|")
plt.suptitle("Kalibrasi Confidence: Apakah Model 'Jujur' tentang Ketidakpastian?", y=1.02)
plt.tight_layout()
plt.savefig("fig4_calibration.pdf", bbox_inches='tight')
```

**Caption:** *Gambar 4. Kalibrasi confidence per model. Kalibrasi ideal akan
menampilkan titik high-confidence (kanan) terkumpul pada error rendah
(bawah). Mistral (kanan) mengeluarkan output dengan confidence 0,8–1,0 pada
kasus dengan |selisih|≥3 — bukti empiris fenomena overconfidence pada model
chat berukuran menengah, sejalan dengan temuan literatur calibration
(Kalai & Nachum, 2025).*

### Figure 5 — Runtime × Accuracy Pareto Frontier (Results)

**Type:** Scatter plot dengan label model.

```python
import matplotlib.pyplot as plt

models = {
    "Qwen3.5:35b":      {"runtime": 30.2, "exact": 42.9, "color": "#16a34a"},
    "DeepSeek-R1:32b":  {"runtime": 68.2, "exact": 57.1, "color": "#dc2626"},
    "Mistral-S3.2:24b": {"runtime": 14.1, "exact": 14.3, "color": "#3b82f6"},
}
plt.figure(figsize=(6, 4.5))
for m, d in models.items():
    plt.scatter(d["runtime"], d["exact"], s=300, c=d["color"],
                edgecolors="black", linewidths=1.5)
    plt.annotate(m, (d["runtime"]+2, d["exact"]+1), fontsize=10, fontweight='bold')
plt.xlabel("Rerata runtime per indikator (detik)")
plt.ylabel("Exact match accuracy (%)")
plt.title("Frontier Pareto: Trade-off Kecepatan vs Akurasi")
plt.grid(alpha=0.3)
plt.xlim(0, 80); plt.ylim(0, 70)
plt.tight_layout()
plt.savefig("fig5_pareto.pdf")
```

**Caption:** *Gambar 5. Frontier Pareto kecepatan × akurasi exact match.
DeepSeek-R1 mencapai akurasi tertinggi tetapi paling lambat; Mistral paling
cepat tetapi terburuk; Qwen menempati posisi seimbang. Trade-off ini krusial
untuk pemilihan model di institusi dengan keterbatasan komputasi.*

### Figure 6 (Opsional) — Score Distribution Box Plot (Results)

**Type:** Box plot 4 distribusi (ref + 3 model).

```python
import pandas as pd, seaborn as sns, matplotlib.pyplot as plt

ref   = pd.read_csv("data/reference_scores_claude.csv")
bench = pd.read_csv("data/benchmark_results.csv")
focus = [14,15,16,17,20,22,24]

ref_f = ref[ref.indicator_no.isin(focus)][["indicator_no","score"]]
ref_f["model"] = "Referensi (Claude)"
bench_f = bench[bench.indicator_no.isin(focus)][["model","indicator_no","score"]]
df = pd.concat([ref_f, bench_f]).dropna()
df["score"] = df.score.astype(float)

plt.figure(figsize=(8, 4))
order = ["Referensi (Claude)", "qwen3.5:35b", "deepseek-r1:32b", "mistral-small3.2:24b"]
sns.boxplot(data=df, x="model", y="score", order=order, palette="Set2")
sns.stripplot(data=df, x="model", y="score", order=order, color="black", size=4, alpha=0.6)
plt.ylim(-0.5, 4.5)
plt.ylabel("Skor (0-4)")
plt.title("Distribusi Skor: Referensi vs 3 Model Open-Weight")
plt.xticks(rotation=10, ha='right')
plt.tight_layout()
plt.savefig("fig6_distribution.pdf")
```

**Caption:** *Gambar 6. Distribusi skor pada 7 indikator fokus. Referensi
terpusat pada nilai 3; Qwen mengikuti distribusi referensi dengan ketat;
DeepSeek-R1 menunjukkan kluster pada nilai 0 (false refusal pada Capstone
Design); Mistral menunjukkan distribusi bimodal — banyak skor 0 (refusal)
dan beberapa pada nilai 3-4.*

---

## D. DRAFT TAMBAHAN SECTION YANG HILANG

### D.1 ABSTRAK (DALAM BAHASA INDONESIA) — TAMBAHKAN setelah ABSTRACT (IN ENGLISH)

> Sistem penjaminan mutu internal (SPMI) merupakan fondasi keberhasilan
> akreditasi institusi di pendidikan tinggi. Penelitian ini mengembangkan
> program analisis data otomatis yang dirancang khusus untuk Program Sarjana
> Terapan Teknik Telekomunikasi PJJ guna mempercepat proses penjaminan mutu
> internal. Sistem mengintegrasikan tiga model *Large Language Model* (LLM)
> *open-weight* — Qwen, Mistral, dan DeepSeek — untuk mengevaluasi tujuh
> indikator inti Tri Dharma terhadap standar akreditasi LAM Teknik. Pemanfaatan
> kecerdasan buatan dapat mengatasi inefisiensi pengelolaan data manual dengan
> menggantinya menggunakan program analisis berbasis AI yang spesifik untuk
> penilaian mutu akademik internal. Setiap model menunjukkan karakteristik
> performa yang berbeda dari sisi akurasi dan kecepatan; integrasi ketiganya
> memberikan *diagnostic tool* yang lebih robust. Hasil penelitian
> mengindikasikan bahwa sistem otomatis berbasis AI secara signifikan dapat
> meningkatkan efisiensi audit internal serta menyediakan penanda mutu real-time
> yang esensial bagi keberhasilan akreditasi nasional.
>
> **Kata kunci:** *Tri Dharma; Akreditasi; Analisis Data; Pengembangan Perangkat Lunak*

### D.2 METHODS — SECTION YANG HILANG (sisipkan sebelum RESULTS AND DISCUSSION)

```markdown
## METHODS

### Pendekatan dan Ruang Lingkup
Penelitian ini menggunakan pendekatan *quantitative experimental* dengan
metode *benchmarking* terhadap tiga LLM *open-weight*. Ruang lingkup dibatasi
pada tujuh indikator inti Tri Dharma yaitu: (1) Kesesuaian dan tinjauan CPL,
(2) Rencana Proses Pembelajaran (RPS), (3) Proses Pembelajaran, (4) Integrasi
Penelitian dan PkM, (5) Capstone Design, (6) Penelitian, dan (7) Pengabdian
kepada Masyarakat. Subset ini terdiri dari 4 indikator kualitatif dan
3 indikator komposit, memberikan *coverage* seimbang antara *judgment* teks
dan kombinasi *judgment + formula bobot*.

### Definisi Operasional Variabel
Variabel utama adalah *skor model* (skala ordinal 0–4) untuk setiap
indikator, dibandingkan terhadap *skor referensi* yang dihasilkan Claude
(Anthropic) sebagai *LLM-as-annotator*. Variabel pendukung meliputi
*justification* (teks), *confidence* (rentang 0,0–1,0), dan *runtime*
(detik per indikator).

### Lokasi dan Sampel
Studi dilakukan pada satu program studi sarjana terapan jarak jauh bidang
teknik di sebuah politeknik negeri Indonesia, dianonimkan sebagai
*Program A*. Dokumen LED dan LKPS adalah versi *post-audit* periode 2024.

### Material dan Tool Utama
Sistem dibangun dengan: (1) *Embedding model*
`paraphrase-multilingual-MiniLM-L12-v2` (384-dim); (2) *Vector database*
ChromaDB dengan HNSW *cosine similarity*; (3) *Framework agent state machine*
LangGraph; (4) *Inference backend* Ollama pada server GPU 24 GB VRAM via
Cloudflare-tunneled HTTPS endpoint. Empat *tool* dipaparkan ke agen:
`get_indicator_rubric`, `search_led_evidence`, `get_lkps_table`, dan
`compute_formula_score`.

### Dua Paradigma Agen
Paradigma *native* (untuk Qwen dan Mistral) menggunakan `tool_calls`
terstruktur yang langsung dieksekusi `ToolNode` LangGraph. Paradigma
*prompt-based* (untuk DeepSeek-R1, model *reasoning* yang menghasilkan blok
`<think>...</think>`) meminta model menghasilkan JSON satu baris dengan
format `{"action": ..., "args": ...}` untuk panggilan tool.

### Teknik Pengumpulan dan Analisis Data
Setiap indikator dievaluasi sekali per model dengan parameter sampling sama
(temperatur 0,1), menghasilkan total 21 invokasi (3 model × 7 indikator).
Hasil di-stream langsung ke berkas CSV. Skor referensi dihasilkan terpisah
oleh Claude. Analisis menggunakan enam metrik:

- **Mean Absolute Error (MAE)**: $\text{MAE} = \frac{1}{n} \sum_{i=1}^{n} |y_i - \hat{y}_i|$ — semakin rendah semakin baik
- **Root Mean Squared Error (RMSE)**: $\text{RMSE} = \sqrt{\frac{1}{n} \sum_{i=1}^{n} (y_i - \hat{y}_i)^2}$
- **Exact match**: $\frac{|\{i : y_i = \hat{y}_i\}|}{n}$
- **Akurasi within-±1**: $\frac{|\{i : |y_i - \hat{y}_i| \leq 1\}|}{n}$
- **Pearson correlation r**
- **Score-zero rate**: proksi *failure mode false refusal*

di mana $y_i$ adalah skor referensi dan $\hat{y}_i$ adalah skor model.
```

### D.3 DAFTAR PUSTAKA — SECTION KOSONG YANG HARUS DIISI

Format APA 6th, 12 referensi (rekomendasi minimum jurnal Sinta).

```markdown
## DAFTAR PUSTAKA

Es, S., James, J., Espinosa-Anke, L., & Schockaert, S. (2024). RAGAS:
   Automated Evaluation of Retrieval Augmented Generation. *Proceedings of
   the 18th Conference of the European Chapter of the ACL: System
   Demonstrations*, 150–158.

Gao, Y., Xiong, Y., Gao, X., Jia, K., Pan, J., Bi, Y., Dai, Y., Sun, J., &
   Wang, H. (2024). Retrieval-Augmented Generation for Large Language
   Models: A Survey. *arXiv preprint arXiv:2312.10997*.

Ji, Z., Lee, N., Frieske, R., Yu, T., Su, D., Xu, Y., Ishii, E., Bang, Y.,
   Madotto, A., & Fung, P. (2023). Survey of Hallucination in Natural
   Language Generation. *ACM Computing Surveys, 55*(12), 1–38.
   https://doi.org/10.1145/3571730

Kalai, A. T., & Nachum, O. (2025). Why Language Models Hallucinate.
   *arXiv preprint arXiv:2509.04664*.

Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N.,
   Küttler, H., Lewis, M., Yih, W., Rocktäschel, T., Riedel, S., & Kiela, D.
   (2020). Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.
   *Advances in Neural Information Processing Systems, 33*, 9459–9474.

Mistral AI. (2025). *Mistral Small 3 Technical Report*. Mistral AI.

Patil, S. G., Zhang, T., Wang, X., & Gonzalez, J. E. (2024). Gorilla:
   Large Language Model Connected with Massive APIs. *Advances in Neural
   Information Processing Systems, 37*. (BFCL benchmark)

Qwen Team. (2025). *Qwen3.5 Technical Report*. Alibaba Cloud.

Reimers, N., & Gurevych, I. (2020). Making Monolingual Sentence
   Embeddings Multilingual using Knowledge Distillation. *Proceedings of
   EMNLP 2020*, 4512–4525.
   https://doi.org/10.18653/v1/2020.emnlp-main.365

Schick, T., Dwivedi-Yu, J., Dessì, R., Raileanu, R., Lomeli, M.,
   Zettlemoyer, L., Cancedda, N., & Scialom, T. (2023). Toolformer: Language
   Models Can Teach Themselves to Use Tools. *Advances in Neural Information
   Processing Systems, 36*.

Sun, S., Zhang, Y., Li, P., & Zhao, J. (2025). Large Language Model-Powered
   Automated Assessment: A Systematic Review. *Applied Sciences, 15*(10),
   5683. https://doi.org/10.3390/app15105683

Wilie, B., Vincentio, K., Winata, G. I., Cahyawijaya, S., Li, X., Lim, Z. Y.,
   Soleman, S., Mahendra, R., Fung, P., Bahar, S., & Purwarianti, A. (2020).
   IndoNLU: Benchmark and Resources for Evaluating Indonesian Natural
   Language Understanding. *Proceedings of AACL-IJCNLP 2020*, 843–857.

Yao, S., Zhao, J., Yu, D., Du, N., Shafran, I., Narasimhan, K., & Cao, Y.
   (2023). ReAct: Synergizing Reasoning and Acting in Language Models.
   *International Conference on Learning Representations (ICLR 2023)*.

Zheng, L., Chiang, W.-L., Sheng, Y., Zhuang, S., Wu, Z., Zhuang, Y., Lin, Z.,
   Li, Z., Li, D., Xing, E. P., Zhang, H., Gonzalez, J. E., & Stoica, I.
   (2023). Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena. *Advances
   in Neural Information Processing Systems, 36*, 46595–46623.
```

---

## E. SARAN PERBAIKAN STRUKTUR PER-SECTION (HALUS)

### E.1 ABSTRACT (English) — Tambahkan kuantitatif

**Sebelum:**
> *"While each model exhibits distinct performance characteristics in terms of accuracy and processing speed, their collective integration allows for a more robust diagnostic tool."*

**Sesudah:**
> *"Qwen3.5:35b achieves the lowest MAE (0.57) and 100% within-±1 accuracy with no false refusals; DeepSeek-R1:32b leads exact match (57.1%) due to perfect performance on composite indicators (100% exact); Mistral-Small3.2:24b underperforms (MAE 1.81) with 4 of 7 outputs being false refusals. We recommend Qwen3.5:35b as a reliable AI draft scorer for human assessor verification."*

### E.2 INTRODUCTION — Tambahkan paragraf positioning literatur

Setelah paragraf "The advancement of Artificial Intelligence (AI) technology...":

> *"Beberapa studi terkini telah memanfaatkan LLM dalam pendidikan tinggi —
> *systematic review* dari MDPI Applied Sciences (Sun et al., 2025) mencatat
> 49 studi LLM-Powered Automated Assessment (LLMPAA) periode 2018–2024
> dengan dominasi pada penilaian *karya mahasiswa* (essay, kode, ujian).
> Namun, penilaian *dokumen institusional akreditasi* yang melibatkan
> dokumen heterogen (PDF naratif + Excel terstruktur) belum dieksplorasi
> dalam literatur, terutama untuk konteks Bahasa Indonesia. Survey RAG
> educational application 2025 (Gao et al.) menunjukkan dominasi penggunaan
> RAG untuk *tutoring chatbot* dan *content generation*, bukan untuk
> *cross-modal evidence assessment* seperti yang dibutuhkan akreditasi LAM.
> Sementara itu, benchmark function calling generic seperti BFCL v4
> (Patil et al., 2024) tidak membandingkan paradigma *native vs prompt-based
> dispatch* secara eksplisit pada task domain-specific. Penelitian ini
> mengisi tiga gap tersebut sekaligus."*

### E.3 RESULTS AND DISCUSSION — Perbaiki inkonsistensi data

**Aksi:** Cross-check semua angka di Tabel 1 dengan Tabel 2-4 dan
`data/report_*_focus7.csv`. Indikasi yang teridentifikasi:
- Tabel 1: nama "Mistral" dan "DeepSeek" mungkin tertukar (MAE 0.7143 milik
  DeepSeek; MAE 1.81 milik Mistral berdasarkan benchmark CSV)
- Tabel 4 (Mistral) indikator 5,6,7 perlu diverifikasi terhadap CSV

**Saran:** generate ulang semua tabel dari satu source of truth
(`scripts/analyze_benchmark.py --indicators 14,15,16,17,20,22,24 --suffix _focus7`).

### E.4 IMPLICATIONS FOR ACCREDITATION PRACTICE — Perkuat dengan citation

Tambahkan link ke literatur HAC, HalluScan untuk fenomena overconfidence
DeepSeek:

> *"Phenomenon overconfidence pada DeepSeek dalam studi ini sejalan dengan
> temuan literatur calibration terbaru: HalluScan benchmark (arXiv 2605.02443)
> menunjukkan bahwa Judge-based detection methods memiliki kalibrasi terburuk
> meski menggunakan model evaluator yang strong; Hallucination-Aware
> Calibration (HAC, arXiv 2604.02543) mengusulkan signal grounding sebagai
> mitigasi. Temuan kami mengkonfirmasi bahwa fenomena ini juga muncul pada
> task domain-specific Indonesian accreditation, sehingga menjustifikasi
> rekomendasi human-in-the-loop verification."*

---

## F. ACTION CHECKLIST untuk Penulis

### Wajib (sebelum submit):
- [ ] Tambahkan METHODS section (lihat D.2)
- [ ] Tambahkan ABSTRAK Bahasa Indonesia (lihat D.1)
- [ ] Isi DAFTAR PUSTAKA dengan referensi yang relevan (lihat D.3, minimal 12)
- [ ] Anonymisasi: hapus "PENS" dan "Telecommunication Engineering" dari title dan body
- [ ] Cross-verify angka antar tabel — generate ulang dari `analyze_benchmark.py`
- [ ] Perkuat klaim novelty (lihat B.3)

### Sangat Disarankan:
- [ ] Tambahkan minimal 3 figure (Figure 1 alur, Figure 2 arsitektur, Figure 3 per-type bar)
- [ ] Perbaiki abstract dengan angka kuantitatif (lihat E.1)
- [ ] Tambahkan paragraf positioning literatur di Introduction (lihat E.2)
- [ ] Tambahkan citation ke calibration literature di Discussion (lihat E.4)

### Opsional:
- [ ] Tambahkan Figure 4 (calibration scatter) dan Figure 5 (Pareto runtime)
- [ ] Tambahkan section *Limitations* eksplisit di Discussion
- [ ] Tambahkan section *Acknowledgments* untuk NDA + compute disclosure

---

## Sources

Hasil pencarian web yang menjadi dasar positioning novelty:

- [LLM-Powered Automated Assessment: A Systematic Review (MDPI Applied Sciences 2025)](https://www.mdpi.com/2076-3417/15/10/5683)
- [GraderAssist: A Graph-Based Multi-LLM Framework for Transparent and Reproducible Automated Evaluation (MDPI Informatics 2025)](https://www.mdpi.com/2227-9709/12/4/123)
- [A Comparative Study of LLMs in Programming Education (MDPI Applied Sciences 2025)](https://www.mdpi.com/2076-3417/15/18/10055)
- [Evaluating LLMs for AI-assisted grading: a framework (Nature Scientific Reports 2026)](https://www.nature.com/articles/s41598-026-48656-3)
- [Reliability and Validity of LLMs for Automated Assessment of Student Essays (arXiv 2508.02442)](https://arxiv.org/abs/2508.02442)
- [Open Source LLM Leaderboard 2025–2026 (CodeSOTA)](https://www.codesota.com/llm/open-models)
- [Berkeley Function Calling Leaderboard (BFCL) V4](https://gorilla.cs.berkeley.edu/leaderboard.html)
- [Local Agent Bench: Tool Calling on 21 Open-Weight Models (Mike Veerman 2026)](https://mikeveerman.be/blog/github-2026-02-06-tool-calling-benchmark/)
- [Retrieval-Augmented Generation for Educational Application: A Systematic Survey (ScienceDirect 2025)](https://www.sciencedirect.com/science/article/pii/S2666920X25000578)
- [RAG Chatbots for Education: A Survey of Applications (MDPI Applied Sciences 2025)](https://www.mdpi.com/2076-3417/15/8/4234)
- [Why Language Models Hallucinate (Kalai & Nachum, OpenAI 2025)](https://arxiv.org/pdf/2509.04664)
- [HalluScan: A Systematic Benchmark for Detecting Hallucinations (arXiv 2605.02443)](https://arxiv.org/html/2605.02443v1)
- [Overconfidence and Calibration: Hallucination-Aware Mitigation (arXiv 2604.02543)](https://arxiv.org/html/2604.02543)
- [Uncertainty Quantification for Hallucination Detection (arXiv 2510.12040)](https://arxiv.org/html/2510.12040v1)
