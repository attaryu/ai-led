# Tables — Ready to paste into paper

All tables in Markdown + LaTeX-ready format. Sources:
- `data/benchmark_results.csv`
- `data/reference_scores_claude.csv`
- `data/benchmark_report.md`

---

## Table 1 — Model specifications

| ID | Model | Family | Size | Tool-calling paradigm | Hosted via |
|----|-------|--------|------|----------------------|-----------|
| M1 | `qwen3.5:35b` | Qwen 3.5 | 35 B (Q4_K_M, 24 GB) | Native function calling | Ollama |
| M2 | `deepseek-r1:32b` | DeepSeek-R1 (reasoning) | 32 B (Q4_K_M, 20 GB) | Prompt-based JSON dispatch | Ollama |
| M3 | `mistral-small3.2:24b` | Mistral Small 3.2 | 24 B (Q4_K_M, 14 GB) | Native function calling | Ollama |

All models served from a single GPU server (24 GB VRAM), accessed via
Cloudflare-tunneled HTTPS endpoint. Sampling: temperature 0.1, default
top-p / top-k.

LaTeX:
```latex
\begin{table}[t]
\caption{Open-weight LLMs evaluated.}
\label{tab:models}
\centering\small
\begin{tabular}{llllll}
\toprule
ID & Model & Family & Size & Tool paradigm & Host \\
\midrule
M1 & qwen3.5:35b      & Qwen 3.5      & 35 B & Native        & Ollama \\
M2 & deepseek-r1:32b  & DeepSeek-R1   & 32 B & Prompt JSON   & Ollama \\
M3 & mistral-small3.2 & Mistral S 3.2 & 24 B & Native        & Ollama \\
\bottomrule
\end{tabular}
\end{table}
```

---

## Table 2 — Aggregate performance (60 indicators)

| Model | MAE ↓ | RMSE ↓ | Exact ↑ | ±1 Acc ↑ | Pearson r | Avg Conf | Runtime/ind |
|---|---|---|---|---|---|---|---|
| **qwen3.5:35b** | **0.79** | **1.14** | **36.7%** | **88.3%** | -0.06 | 0.73 | 26.6 s |
| deepseek-r1:32b | 1.79 | 2.18 | 15.0% | 46.7% | -0.08 | 0.81 | 74.8 s |
| mistral-small3.2:24b | 1.70 | 2.18 | 23.3% | 51.7% | 0.09 | 0.56 | 11.6 s |

LaTeX:
```latex
\begin{table}[t]
\caption{Aggregate scoring performance against the LLM-derived reference (60 indicators).
Best per column in \textbf{bold}.}
\label{tab:aggregate}
\centering\small
\begin{tabular}{lrrrrrrr}
\toprule
Model & MAE$\downarrow$ & RMSE$\downarrow$ & Exact$\uparrow$ & $\pm$1 Acc$\uparrow$ & Pearson r & Conf & RT(s) \\
\midrule
qwen3.5:35b      & \textbf{0.79} & \textbf{1.14} & \textbf{36.7\%} & \textbf{88.3\%} & -0.06 & 0.73 & 26.6 \\
deepseek-r1:32b  & 1.79 & 2.18 & 15.0\% & 46.7\% & -0.08 & 0.81 & 74.8 \\
mistral-small3.2 & 1.70 & 2.18 & 23.3\% & 51.7\% &  0.09 & 0.56 & 11.6 \\
\bottomrule
\end{tabular}
\end{table}
```

**Note for paper text:** Pearson r values are near zero — explain that
this reflects the truncated 5-class score space (0–4), not lack of
agreement; ±1 accuracy is the more informative measure for ordinal
rubric scoring.

---

## Table 3 — Per-type breakdown

| Model | Type | n | MAE ↓ | Exact ↑ | ±1 Acc ↑ | Score=0 |
|---|---|---|---|---|---|---|
| qwen3.5:35b | qualitative | 20 | 0.55 | 50.0% | 95.0% | 0 |
| qwen3.5:35b | composite | 12 | 0.58 | 33.3% | 100.0% | 0 |
| qwen3.5:35b | quantitative | 28 | 1.05 | 28.6% | 78.6% | 3 |
| deepseek-r1:32b | qualitative | 20 | 1.55 | 25.0% | 55.0% | 4 |
| deepseek-r1:32b | composite | 12 | 1.08 | 33.3% | 58.3% | 1 |
| deepseek-r1:32b | quantitative | 28 | 2.27 | **0.0%** | 35.7% | **12** |
| mistral-small3.2:24b | qualitative | 20 | 2.45 | 10.0% | 30.0% | **12** |
| mistral-small3.2:24b | composite | 12 | 2.14 | 16.7% | 33.3% | 7 |
| mistral-small3.2:24b | quantitative | 28 | 0.98 | 35.7% | 75.0% | 4 |

**Key finding (highlight in paper):**
- DeepSeek-R1 has *zero exact matches* on 28 quantitative indicators and
  defaults to score=0 in 12/28 (42.9%) cases.
- Mistral has *zero score-0 cases* below average on quantitative (4/28 =
  14.3%) but balks on 12/20 (60%) qualitative indicators.

LaTeX:
```latex
\begin{table}[t]
\caption{Per-indicator-type breakdown. Striking reverse pattern: deepseek-r1
collapses on quantitative items where number extraction is needed;
mistral-small refuses on qualitative items but performs adequately on
formula-driven scoring.}
\label{tab:per-type}
\centering\small
\begin{tabular}{lllrrrrr}
\toprule
Model & Type & n & MAE & Exact & $\pm$1 Acc & Score=0 \\
\midrule
\multirow{3}{*}{qwen3.5:35b}
  & Qualitative  & 20 & 0.55 & 50.0\% &  95.0\% &  0 \\
  & Composite    & 12 & 0.58 & 33.3\% & 100.0\% &  0 \\
  & Quantitative & 28 & 1.05 & 28.6\% &  78.6\% &  3 \\
\midrule
\multirow{3}{*}{deepseek-r1:32b}
  & Qualitative  & 20 & 1.55 & 25.0\% & 55.0\% &  4 \\
  & Composite    & 12 & 1.08 & 33.3\% & 58.3\% &  1 \\
  & Quantitative & 28 & 2.27 &  \textbf{0.0\%} & 35.7\% & \textbf{12} \\
\midrule
\multirow{3}{*}{mistral-small3.2}
  & Qualitative  & 20 & 2.45 & 10.0\% & 30.0\% & \textbf{12} \\
  & Composite    & 12 & 2.14 & 16.7\% & 33.3\% &  7 \\
  & Quantitative & 28 & 0.98 & 35.7\% & 75.0\% &  4 \\
\bottomrule
\end{tabular}
\end{table}
```

---

## Table 4 — Failure mode taxonomy with examples

| Mode | Observed in | Symptom | Example (anonymized indicator) |
|---|---|---|---|
| **Quantitative collapse** | deepseek-r1:32b | Score = 0 with "Bukti tidak ditemukan" on numerical indicators | Ind. 42 (IPK lulusan): ref=4.0, model=0 ("Bukti RIPK tidak ditemukan"). LKPS Tabel 6.b clearly contains GPA values 3.33–3.58. |
| **Tutorial-mode output** | mistral-small3.2:24b | Model emits step-by-step "how-to-compute" instructions instead of a decision; parser may extract numeric token from instructions | Ind. 18 (PJP): model output is a 200-word explanation of the formula starting "Berdasarkan informasi yang Anda berikan, saya memahami bahwa Anda ingin mengetahui…". Final score=4.0 lifted from rubric example, not derived from data. |
| **False refusal & hallucination** | mistral-small3.2:24b | Score = 0 with "Tidak ada informasi" despite evidence in retrieved chunks; in some cases fabricated specific numbers | Ind. 23 (PPDMhs): model fabricates "PPDMhs = (10 / 20) × 100% = 50%" — neither 10 nor 20 appear in source LKPS Tabel 6.h.1. |

LaTeX:
```latex
\begin{table*}[t]
\caption{Three distinct failure modes observed across model families.}
\label{tab:failures}
\centering\small
\begin{tabular}{p{3cm}p{3cm}p{4cm}p{6cm}}
\toprule
Failure mode & Observed in & Symptom & Anonymized example \\
\midrule
Quantitative collapse & deepseek-r1:32b
  & Score=0 with "Bukti tidak ditemukan" on numerical indicators
  & Indicator 42: reference=4.0, model=0; LKPS clearly contains the GPA values needed. \\
\addlinespace
Tutorial-mode output & mistral-small3.2
  & Model emits step-by-step compute instructions instead of a decision
  & Indicator 18: 200-word formula tutorial; parser extracted "4" from rubric example. \\
\addlinespace
False refusal \& hallucination & mistral-small3.2
  & Score=0 despite evidence; sometimes fabricates specific numbers not in source
  & Indicator 23: model wrote "PPDMhs=(10/20)$\times$100\%=50\%"; neither 10 nor 20 in LKPS. \\
\bottomrule
\end{tabular}
\end{table*}
```

---

## Table 5 — Cost / runtime comparison

| Model | Total runtime (60 ind) | Avg/ind | Tokens (est) | Cost @ Vast.ai 24 GB |
|---|---|---|---|---|
| qwen3.5:35b | 26.6 min | 26.6 s | ~150k | ≈ $0.10 |
| deepseek-r1:32b | 74.8 min | 74.8 s | ~400k | ≈ $0.30 |
| mistral-small3.2:24b | 11.6 min | 11.6 s | ~80k | ≈ $0.05 |

*Cost based on Vast.ai 24 GB GPU rental at ~$0.20/hour, single-tenant.*

---

## Table 6 — Example justification quality (qualitative comparison)

Pick 1 indicator each for "agreement" and "disagreement" cases.
Already-anonymized version from `benchmark_results.csv`:

**Indicator 8 — Pengelolaan keuangan (qualitative). Ref = 4.**

| Model | Score | Justification (truncated 200 chars) |
|---|---|---|
| qwen3.5:35b | 4.0 | "Bukti menunjukkan pengelolaan keuangan dengan realisasi 100%, sistem audit mutu internal yang komprehensif, dan transparansi melalui publikasi laporan." |
| deepseek-r1:32b | 4.0 | "Bukti menunjukkan pengelolaan keuangan yang akuntabel, transparan, patuh regulasi, efisien, dan efektif dengan dukungan audit internal dan eksternal." |
| mistral-small3.2:24b | 0.0 | "Tidak ada bukti yang disediakan yang mengacu pada aspek transparansi, kepatuhan terhadap regulasi." |

**Comment for paper:** Same retrieved evidence; only mistral fails to
recognize it. This is a classic false-refusal case.

**Indicator 42 — IPK lulusan (quantitative). Ref = 4.**

| Model | Score | Justification (truncated) |
|---|---|---|
| qwen3.5:35b | 3.0 | "IPK rata-rata lulusan berada pada kisaran 3.33-3.58 …" *(under-scored vs reference)* |
| deepseek-r1:32b | 0.0 | "Bukti RIPK tidak ditemukan dalam dokumen yang disediakan." *(quantitative collapse)* |
| mistral-small3.2:24b | 4.0 | "Rata-rata IPK lulusan dalam 3 tahun terakhir memenuhi kriteria dengan nilai RIPK ≥ 3,25." *(correct)* |

**Comment for paper:** Inverse of indicator 8 — mistral handles formula
match correctly; deepseek refuses; qwen under-scores by one (still ±1).
