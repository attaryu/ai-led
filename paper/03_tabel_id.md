# Tabel — Siap Paste ke Paper (Versi Bahasa Indonesia)

Seluruh tabel dalam format Markdown + LaTeX-ready. Sumber:
- `data/benchmark_results.csv`
- `data/reference_scores_claude.csv`
- `data/benchmark_report.md`

---

## Tabel 1 — Spesifikasi Model

| ID | Model | Keluarga | Ukuran | Paradigma tool-calling | Hosted via |
|----|-------|----------|--------|------------------------|-----------|
| M1 | `qwen3.5:35b` | Qwen 3.5 | 35 B (Q4_K_M, 24 GB) | *Native function calling* | Ollama |
| M2 | `deepseek-r1:32b` | DeepSeek-R1 (*reasoning*) | 32 B (Q4_K_M, 20 GB) | *Prompt-based JSON dispatch* | Ollama |
| M3 | `mistral-small3.2:24b` | Mistral Small 3.2 | 24 B (Q4_K_M, 14 GB) | *Native function calling* | Ollama |

Seluruh model dilayani dari satu server GPU tunggal (24 GB VRAM),
diakses via *endpoint* HTTPS Cloudflare-tunneled. *Sampling*: temperatur
0,1, *top-p* / *top-k* default.

LaTeX:
```latex
\begin{table}[t]
\caption{LLM open-weight yang dievaluasi.}
\label{tab:models}
\centering\small
\begin{tabular}{llllll}
\toprule
ID & Model & Keluarga & Ukuran & Paradigma tool & Host \\
\midrule
M1 & qwen3.5:35b      & Qwen 3.5      & 35 B & Native        & Ollama \\
M2 & deepseek-r1:32b  & DeepSeek-R1   & 32 B & Prompt JSON   & Ollama \\
M3 & mistral-small3.2 & Mistral S 3.2 & 24 B & Native        & Ollama \\
\bottomrule
\end{tabular}
\end{table}
```

---

## Tabel 2 — Performa Agregat (60 Indikator)

| Model | MAE ↓ | RMSE ↓ | *Exact* ↑ | Akurasi ±1 ↑ | Pearson r | Rerata Conf | Runtime/ind |
|---|---|---|---|---|---|---|---|
| **qwen3.5:35b** | **0,79** | **1,14** | **36,7%** | **88,3%** | -0,06 | 0,73 | 26,6 d |
| deepseek-r1:32b | 1,79 | 2,18 | 15,0% | 46,7% | -0,08 | 0,81 | 74,8 d |
| mistral-small3.2:24b | 1,70 | 2,18 | 23,3% | 51,7% | 0,09 | 0,56 | 11,6 d |

LaTeX:
```latex
\begin{table}[t]
\caption{Performa skoring agregat terhadap referensi berbasis LLM (60 indikator).
Nilai terbaik per kolom dicetak \textbf{tebal}.}
\label{tab:aggregate}
\centering\small
\begin{tabular}{lrrrrrrr}
\toprule
Model & MAE$\downarrow$ & RMSE$\downarrow$ & Exact$\uparrow$ & $\pm$1$\uparrow$ & Pearson r & Conf & RT(d) \\
\midrule
qwen3.5:35b      & \textbf{0,79} & \textbf{1,14} & \textbf{36,7\%} & \textbf{88,3\%} & -0,06 & 0,73 & 26,6 \\
deepseek-r1:32b  & 1,79 & 2,18 & 15,0\% & 46,7\% & -0,08 & 0,81 & 74,8 \\
mistral-small3.2 & 1,70 & 2,18 & 23,3\% & 51,7\% &  0,09 & 0,56 & 11,6 \\
\bottomrule
\end{tabular}
\end{table}
```

**Catatan untuk teks paper:** Nilai Pearson r berdekatan dengan nol —
jelaskan bahwa hal ini mencerminkan ruang skor 5-kelas yang terpotong
(0–4), bukan ketiadaan kesepakatan; akurasi ±1 adalah ukuran yang
lebih informatif untuk skoring rubrik ordinal.

---

## Tabel 3 — Per-Type Breakdown

| Model | Tipe | n | MAE ↓ | *Exact* ↑ | Akurasi ±1 ↑ | Skor=0 |
|---|---|---|---|---|---|---|
| qwen3.5:35b | Kualitatif | 20 | 0,55 | 50,0% | 95,0% | 0 |
| qwen3.5:35b | Komposit | 12 | 0,58 | 33,3% | 100,0% | 0 |
| qwen3.5:35b | Kuantitatif | 28 | 1,05 | 28,6% | 78,6% | 3 |
| deepseek-r1:32b | Kualitatif | 20 | 1,55 | 25,0% | 55,0% | 4 |
| deepseek-r1:32b | Komposit | 12 | 1,08 | 33,3% | 58,3% | 1 |
| deepseek-r1:32b | Kuantitatif | 28 | 2,27 | **0,0%** | 35,7% | **12** |
| mistral-small3.2:24b | Kualitatif | 20 | 2,45 | 10,0% | 30,0% | **12** |
| mistral-small3.2:24b | Komposit | 12 | 2,14 | 16,7% | 33,3% | 7 |
| mistral-small3.2:24b | Kuantitatif | 28 | 0,98 | 35,7% | 75,0% | 4 |

**Temuan utama (sorot di paper):**
- DeepSeek-R1 memiliki *zero exact match* pada 28 indikator kuantitatif
  dan jatuh ke skor=0 pada 12/28 (42,9%) kasus.
- Mistral memiliki *zero score-0* yang lebih rendah dari rerata pada
  kuantitatif (4/28 = 14,3%) tetapi *balks* pada 12/20 (60%) indikator
  kualitatif.

LaTeX:
```latex
\begin{table}[t]
\caption{Per-type breakdown indikator. Pola berkebalikan yang mencolok:
deepseek-r1 ambruk pada item kuantitatif yang membutuhkan ekstraksi
angka; mistral-small menolak pada item kualitatif tetapi cukup baik
pada skoring berbasis formula.}
\label{tab:per-type}
\centering\small
\begin{tabular}{lllrrrrr}
\toprule
Model & Tipe & n & MAE & Exact & $\pm$1 & Skor=0 \\
\midrule
\multirow{3}{*}{qwen3.5:35b}
  & Kualitatif   & 20 & 0,55 & 50,0\% &  95,0\% &  0 \\
  & Komposit     & 12 & 0,58 & 33,3\% & 100,0\% &  0 \\
  & Kuantitatif  & 28 & 1,05 & 28,6\% &  78,6\% &  3 \\
\midrule
\multirow{3}{*}{deepseek-r1:32b}
  & Kualitatif   & 20 & 1,55 & 25,0\% & 55,0\% &  4 \\
  & Komposit     & 12 & 1,08 & 33,3\% & 58,3\% &  1 \\
  & Kuantitatif  & 28 & 2,27 &  \textbf{0,0\%} & 35,7\% & \textbf{12} \\
\midrule
\multirow{3}{*}{mistral-small3.2}
  & Kualitatif   & 20 & 2,45 & 10,0\% & 30,0\% & \textbf{12} \\
  & Komposit     & 12 & 2,14 & 16,7\% & 33,3\% &  7 \\
  & Kuantitatif  & 28 & 0,98 & 35,7\% & 75,0\% &  4 \\
\bottomrule
\end{tabular}
\end{table}
```

---

## Tabel 4 — Taksonomi Failure Mode dengan Contoh

| Mode | Diobservasi pada | Gejala | Contoh (indikator dianonimkan) |
|---|---|---|---|
| ***Quantitative collapse*** | deepseek-r1:32b | Skor = 0 dengan "Bukti tidak ditemukan" pada indikator numerik | Ind. 42 (IPK lulusan): ref=4,0; model=0 ("Bukti RIPK tidak ditemukan"). LKPS Tabel 6.b jelas berisi nilai IPK 3,33–3,58. |
| ***Tutorial-mode output*** | mistral-small3.2:24b | Model menghasilkan instruksi *step-by-step* "cara menghitung" alih-alih keputusan; *parser* dapat mengekstrak token numerik dari instruksi | Ind. 18 (PJP): output model adalah penjelasan formula 200 kata yang dimulai "Berdasarkan informasi yang Anda berikan, saya memahami bahwa Anda ingin mengetahui...". Skor akhir=4,0 diangkat dari contoh rubrik, bukan diturunkan dari data. |
| ***False refusal* & halusinasi** | mistral-small3.2:24b | Skor = 0 dengan "Tidak ada informasi" meski bukti ada di *chunk* yang ter-*retrieve*; pada beberapa kasus mengarang angka spesifik | Ind. 23 (PPDMhs): model menulis "PPDMhs = (10/20) × 100% = 50%" — baik 10 maupun 20 tidak muncul di sumber LKPS Tabel 6.h.1. |

LaTeX:
```latex
\begin{table*}[t]
\caption{Tiga failure mode berbeda yang diobservasi antar keluarga model.}
\label{tab:failures}
\centering\small
\begin{tabular}{p{3cm}p{3cm}p{4cm}p{6cm}}
\toprule
Failure mode & Diobservasi pada & Gejala & Contoh dianonimkan \\
\midrule
Quantitative collapse & deepseek-r1:32b
  & Skor=0 dengan "Bukti tidak ditemukan" pada indikator numerik
  & Indikator 42: referensi=4,0; model=0; LKPS jelas berisi nilai IPK yang dibutuhkan. \\
\addlinespace
Tutorial-mode output & mistral-small3.2
  & Model menghasilkan instruksi compute step-by-step alih-alih keputusan
  & Indikator 18: tutorial formula 200 kata; parser mengekstrak "4" dari contoh rubrik. \\
\addlinespace
False refusal \& halusinasi & mistral-small3.2
  & Skor=0 meski bukti tersedia; kadang mengarang angka spesifik yang tidak ada di sumber
  & Indikator 23: model menulis "PPDMhs=(10/20)$\times$100\%=50\%"; baik 10 maupun 20 tidak ada di LKPS. \\
\bottomrule
\end{tabular}
\end{table*}
```

---

## Tabel 5 — Perbandingan Biaya / Runtime

| Model | Total runtime (60 ind) | Rerata/ind | Token (estimasi) | Biaya @ Vast.ai 24 GB |
|---|---|---|---|---|
| qwen3.5:35b | 26,6 menit | 26,6 d | ~150k | ≈ $0,10 |
| deepseek-r1:32b | 74,8 menit | 74,8 d | ~400k | ≈ $0,30 |
| mistral-small3.2:24b | 11,6 menit | 11,6 d | ~80k | ≈ $0,05 |

*Biaya berdasarkan sewa GPU 24 GB Vast.ai pada ~$0,20/jam, single-tenant.*

---

## Tabel 6 — Contoh Kualitas Justifikasi (perbandingan kualitatif)

Pilih 1 indikator masing-masing untuk kasus "kesepakatan" dan
"ketidaksepakatan". Versi sudah dianonimkan dari `benchmark_results.csv`:

**Indikator 8 — Pengelolaan keuangan (kualitatif). Ref = 4.**

| Model | Skor | Justifikasi (terpotong 200 karakter) |
|---|---|---|
| qwen3.5:35b | 4,0 | "Bukti menunjukkan pengelolaan keuangan dengan realisasi 100%, sistem audit mutu internal yang komprehensif, dan transparansi melalui publikasi laporan." |
| deepseek-r1:32b | 4,0 | "Bukti menunjukkan pengelolaan keuangan yang akuntabel, transparan, patuh regulasi, efisien, dan efektif dengan dukungan audit internal dan eksternal." |
| mistral-small3.2:24b | 0,0 | "Tidak ada bukti yang disediakan yang mengacu pada aspek transparansi, kepatuhan terhadap regulasi." |

**Komentar untuk paper:** Bukti yang ter-*retrieve* sama; hanya
mistral yang gagal mengenalinya. Ini adalah kasus klasik *false-refusal*.

**Indikator 42 — IPK lulusan (kuantitatif). Ref = 4.**

| Model | Skor | Justifikasi (terpotong) |
|---|---|---|
| qwen3.5:35b | 3,0 | "IPK rata-rata lulusan berada pada kisaran 3.33-3.58 …" *(under-scored vs referensi)* |
| deepseek-r1:32b | 0,0 | "Bukti RIPK tidak ditemukan dalam dokumen yang disediakan." *(quantitative collapse)* |
| mistral-small3.2:24b | 4,0 | "Rata-rata IPK lulusan dalam 3 tahun terakhir memenuhi kriteria dengan nilai RIPK ≥ 3,25." *(benar)* |

**Komentar untuk paper:** Kebalikan dari indikator 8 — mistral
menangani pencocokan formula dengan benar; deepseek menolak; qwen
*under-score* satu poin (masih ±1).
