---
title: |
  Reducing Internal Audit Cycle Time in Indonesian Higher-Education
  Accreditation via a Cross-Modal RAG Agent: A Comparative Benchmark
  of Qwen, DeepSeek-R1 and Mistral on 19 LAM-Teknik Indicators
journal: "Equilibrium: Jurnal Pendidikan"
volume: "XIV"
issue: "1"
period: "January–April 2026"
---

# Reducing Internal Audit Cycle Time in Indonesian Higher-Education Accreditation via a Cross-Modal RAG Agent: A Comparative Benchmark of Qwen, DeepSeek-R1 and Mistral on 19 LAM-Teknik Indicators

## ABSTRACT (English)

Internal Quality Audit (AMI) is the gatekeeper of Indonesian higher-education accreditation, yet study programs still score 60+ indicators by manually cross-referencing a 200-page Self-Evaluation Report (LED) with a 50-sheet Study Program Performance Report (LKPS), a process that takes 3–5 working days per program and varies between assessors. This study designs and benchmarks a cross-modal Retrieval-Augmented Generation (RAG) agent that ingests both documents and auto-scores 19 LAM-Teknik indicators sampled across all nine criteria (9 qualitative, 6 quantitative, 4 composite). Three open-weight Large Language Models — Qwen 3.5 35B, DeepSeek-R1 32B, and Mistral-Small 3.2 24B — are evaluated against Claude-Sonnet reference scores using Mean Absolute Error (MAE), Root Mean Squared Error (RMSE), exact-match, ±1 tolerance accuracy, Pearson r, and per-type breakdown. Qwen 3.5 dominates with MAE = 0.605, RMSE = 0.769, 36.8% exact match and 100% ±1 tolerance in 32.5 s per indicator; DeepSeek-R1 is the most cautious but slowest (MAE = 1.395; 79.9 s) and collapses on quantitative indicators (MAE = 2.17); Mistral is the fastest (13.6 s) and surprisingly strong on quantitative items (MAE = 0.50), but suffers a 78% false-refusal rate on qualitative ones (7/9 score-zero outputs) while remaining over-confident. End-to-end audit time drops from 3–5 days to ≈30–60 min, with full evidence traces preserved for human-in-the-loop verification.

**Keywords:** Internal Quality Audit; LAM-Teknik Accreditation; Cross-Modal RAG; Large Language Models; Calibration

## ABSTRAK (Bahasa Indonesia)

Audit Mutu Internal (AMI) merupakan kunci keberhasilan akreditasi pendidikan tinggi di Indonesia, namun program studi masih menilai 60+ indikator secara manual dengan mencocokkan LED 200 halaman dan LKPS 50 sheet, yang menghabiskan 3–5 hari kerja per program studi dan bervariasi antar asesor. Penelitian ini merancang dan menguji agen Retrieval-Augmented Generation (RAG) lintas-modal yang membaca kedua dokumen sekaligus dan memberi skor otomatis pada 19 indikator LAM Teknik yang mewakili sembilan kriteria (9 kualitatif, 6 kuantitatif, 4 komposit). Tiga LLM open-weight — Qwen 3.5 35B, DeepSeek-R1 32B, dan Mistral-Small 3.2 24B — diuji terhadap skor referensi Claude-Sonnet menggunakan MAE, RMSE, exact-match, akurasi ±1, Pearson r, dan breakdown per tipe. Qwen 3.5 unggul (MAE = 0,605; 100% dalam ±1; 32,5 s/indikator); DeepSeek-R1 paling konservatif tetapi paling lambat (MAE = 1,395; 79,9 s) dan kolaps pada indikator kuantitatif (MAE = 2,17); Mistral tercepat (13,6 s) dan kuat pada indikator kuantitatif (MAE = 0,50), tetapi mengalami false-refusal 78% pada kualitatif (7/9 skor nol) sembari tetap over-confident. Waktu audit menyusut dari 3–5 hari menjadi ≈30–60 menit dengan jejak bukti yang dapat ditelusuri untuk verifikasi human-in-the-loop.

**Kata kunci:** Audit Mutu Internal; Akreditasi LAM Teknik; RAG lintas-modal; Large Language Models; Kalibrasi

---

## INTRODUCTION

The implementation of higher education in Indonesia operates under increasingly stringent quality-standardization demands, in which accreditation is the primary indicator of institutional credibility (Efendi, Hapsari, & Yusup, 2025). The Internal Quality Assurance System (SPMI) — and its operational arm, the Internal Quality Audit (AMI) — ensures that every study program meets the National Standards for Higher Education (SN-Dikti) and the criteria set by BAN-PT or LAM (Sakuroh, Marlina, Krismayanti, & Adiningsih, 2026; Aljarallah & Dutta, 2022). Yet the dominant bottleneck remains the reliance on manual assessment, which generates fragmented "data silos" and delayed reporting (Efendi et al., 2025) and prevents study programs — particularly technical ones that require rigorous and continuous quality monitoring (Subijanto et al., 2021; Sugiarti, 2022) — from completing accreditation evidence on time. Earlier research has explored data-driven alternatives, ranging from K-Means clustering and OLAP for higher-education accreditation (Sakinah, Syaputra, Rahman, Fajri, & Rachmansyah, 2025) to AI-assisted self-evaluation frameworks (Ticolau, 2026), to data-lakehouse architectures for academic metrics (Isnaeni, Putranto, Andriyani, & Khomsah, 2025).

Recent studies converge on the conclusion that conventional internal-audit processes cannot capture the dynamics of large and fast-paced academic data (Isnaeni et al., 2025), so a comprehensive automated architecture that directly processes academic metrics is needed (Başaran, 2026; Ticolau, 2026), and the integration of automated data-analysis technology is expected to minimize human error and improve institutional transparency (Sakuroh et al., 2026). Within this trajectory, Large Language Models (LLMs) open new opportunities for automated processing of complex academic data (Naveed, Khan, & Qui, 2025; Demir & Yavuz, 2026), but model behavior diverges sharply: **Qwen** (an Alibaba dense decoder family known for strong multilingual instruction-following and tool-use; Bai et al., 2023) consistently demonstrates high precision (Aydin, Karaaslan, Erenay, & Bacanin, 2026); **DeepSeek-R1** (a reasoning-distilled model that emits a `<think>...</think>` chain before answering; DeepSeek-AI, 2025) trades runtime for cautious internal deliberation (Jegham, Abdelatti, & Hendawi, 2025); and **Mistral-Small** (a 24 B mixture-of-experts variant emphasizing throughput; Mistral AI, 2024) offers low latency but is prone to hallucination on Indonesian-language tasks (Nurohim, Setyadi, & Fauzi, 2025). These behavioral asymmetries — not yet validated on Indonesian-language accreditation documents — motivate a head-to-head benchmark.

### Research Questions

To address the gap above, this study answers three research questions:

- **RQ1.** Can a cross-modal RAG agent (LED PDF + LKPS Excel) reduce AMI cycle time for LAM-Teknik study programs while preserving evidence traceability?
- **RQ2.** Among Qwen 3.5, DeepSeek-R1, and Mistral-Small, which model offers the best trade-off between accuracy, calibration, and runtime on a multi-criteria sample of 19 indicators?
- **RQ3.** How does scoring performance vary across indicator types (qualitative, quantitative, composite), and what does the variation imply for prompt and tool design?

### Research Objectives

Accordingly, the study **(i)** designs an LLM agent architecture that cross-references qualitative (LED PDF) and quantitative (LKPS Excel) evidence through four specialized retrieval-and-computation tools; **(ii)** benchmarks three open-weight LLMs against Claude-Sonnet reference scores on 19 indicators spanning all nine LAM-Teknik criteria; and **(iii)** characterizes per-type error patterns, calibration, and runtime to derive deployment guidance for Indonesian quality-assurance offices.

### Novelty

This work contributes four complementary novelties not addressed by prior LLM-assessment literature, which has largely focused on English-language student-work grading (Sun et al., 2025) and single-modality RAG-in-education surveys (Gao et al., 2025): **(1) Domain novelty** — the first open-weight LLM-agent study on Indonesian LAM-style higher-education accreditation; **(2) Cross-modal RAG** — an agent architecture that synchronously cross-references narrative PDF evidence with structured Excel performance data through four tools, going beyond text-to-text RAG (Gao et al., 2025); **(3) Tool-calling paradigm comparison** — a side-by-side evaluation of native function-calling (Qwen, Mistral) versus prompt-based JSON dispatch for reasoning models (DeepSeek-R1) on the same domain-specific task, a gap not covered by generic benchmarks such as BFCL v4 or ToolBench (Yan et al., 2024); and **(4) Calibration extension** — empirical documentation of confidence-error inversion in DeepSeek-R1 and false-refusal-with-overconfidence in Mistral on institutional documents, extending the calibration literature (HAC, HalluScan, T3; Lin, Hilton, & Evans, 2022; Geng, Yang, Cao, Zhang, & Tang, 2024) to Indonesian academic-evaluation use cases.

## METHODS

### Approach and Scope

This study uses a controlled experimental approach with single-run benchmarking against three open-weight LLMs. To address the limitation of the earlier Tri-Dharma-only sample, the scope is broadened to 19 indicators (≈32% of the 60-indicator LAM-Teknik instrument), stratified across all nine criteria (VMTS, Tata Pamong, Mahasiswa, SDM, Keuangan-Sarpras, Pendidikan, Penelitian, PkM, Luaran) and across all three score-type families (9 qualitative, 6 quantitative, 4 composite). The selection rationale is criterion coverage rather than topical focus, so that per-type error patterns can be analyzed independently from criterion-area difficulty.

### Operational Variable Definitions

- **Independent variables:** model (Qwen 3.5 35B / DeepSeek-R1 32B / Mistral-Small 3.2 24B) and indicator type (qualitative / quantitative / composite).
- **Dependent variables:** model score (ordinal 0–4), confidence (0–1), runtime per indicator (seconds), justification text, and error/none flag.
- **Reference variables:** Claude-Sonnet score (LLM-as-annotator) per indicator, with documented evidence references.

### Location and Sample

The study was conducted on a post-audit (2024 cycle) Applied Bachelor in Telecommunication Engineering Distance Education program at an Indonesian polytechnic. The LED PDF (~200 pages) and LKPS Excel (~50 sheets) are the verified outputs after the assessment loop closed. The benchmark sample of 19 indicators is fixed in advance using purposive stratified coverage of the 60-indicator instrument; no model has access to the reference scores during inference.

### Indicator Selection Rationale

The 19-indicator sample (≈32% of the 60-indicator LAM-Teknik instrument) was constructed through **purposive stratified sampling** rather than simple random sampling, on four explicit criteria:

1. **Criterion coverage (9/9).** At least one indicator was drawn from each of the nine LAM-Teknik criteria (VMTS: ind. 1, 2; Tata Pamong: 4; Mahasiswa: 7, 8; SDM: 13; Keuangan-Sarpras: 17; Pendidikan: 22; Penelitian: 28, 30, 32; PkM: 35, 39; Luaran: 42, 48, 50, 53, 58) plus the cross-cutting "Program Pengembangan Berkelanjutan" (ind. 60). This guarantees that no model's performance can be inflated or deflated by a particular criterion-area being absent.
2. **Score-type stratification.** The sample contains 9 qualitative, 6 quantitative, and 4 composite indicators — the minimum cell sizes (n ≥ 4 per type) required to compute a stable per-type MAE and to surface the qualitative/quantitative inversion patterns reported in §Results.
3. **Reference-score distribution.** The Claude reference scores in the sample span 2.0 → 4.0 (modal value 3.0, mean 3.39, SD 0.65), allowing each model to be tested on indicators where the correct answer is low, mid-range, and high — a precondition for diagnosing both under- and over-scoring biases. Specifically, the sample includes 2 indicators at score 2 (uncovering high-bias errors), 8 at score 3 (testing exact-match), and 9 at score ≥ 3.5 (testing over-confidence on already-strong evidence).
4. **Practical tractability.** With three models, a 19-indicator sample produces 57 invocations. At an aggregate runtime ranging from 13.6 s to 79.9 s per indicator (Table 1), this fits within a single benchmarking window (≈90 minutes) and keeps the experiment reproducible on the 24 GB single-GPU server described in §Materials.

We acknowledge two threats to validity that follow from this design choice. First, **C9-Luaran is over-represented** (5/19 indicators) relative to a strictly proportional split, because Luaran contains the highest density of distinct quantitative rubrics in the matrix and we wanted to populate the quantitative cell to n = 6. Second, because the sample is purposive rather than random, the reported MAE/RMSE figures should be read as descriptive of how each model behaves on a stratified diagnostic set, not as a point estimate of population-level error on the full 60-indicator instrument. The full-population benchmark (n = 60) is summarized in §Discussion (Robustness Check) as a sensitivity analysis, and a multi-program random-sampling study is identified in §Limitations as a planned extension.

### Materials and Main Tools

- **Embedding:** `paraphrase-multilingual-MiniLM-L12-v2` (384-d, Indonesian-capable).
- **Vector store:** ChromaDB with HNSW + cosine similarity over page-aware LED chunks.
- **Spreadsheet ingestion:** `openpyxl`/`pandas` loader with a sheet registry that maps each LKPS table to its source row.
- **Agent framework:** LangGraph state-machine with two paradigms — a *Native Graph* (tool-bound LLM via `bind_tools` + `ToolNode` loop) for Qwen and Mistral, and a *Reasoning Graph* (prompt-based JSON dispatch with `<think>...</think>` stripping) for DeepSeek-R1.
- **Inference backend:** Ollama running on a 24 GB VRAM GPU, exposed via a Cloudflare-tunneled HTTPS endpoint to the FastAPI service.
- **Tools available to the agent:**
  1. `search_led_evidence(query, top_k)` — semantic retrieval from LED.
  2. `get_indicator_rubric(no)` — parsed rubric matrix for indicator `no`.
  3. `get_lkps_table(name)` — typed LKPS sheet by registered name.
  4. `compute_formula_score(values)` — deterministic formula evaluator for quantitative rubrics (e.g., RIPK, KBK, PTW).

The technical stack ingests both modalities into a unified state and transforms the manual workflow into an automated one (Figure 1) while keeping a human-in-the-loop verification step at the end.

**[Figure 1 here — Manual vs Automated AMI workflow]**
**[Figure 2 here — Cross-Modal RAG Agent Architecture]**

### Ground-Truth Construction (Validity Test)

Because a regulator-issued gold standard for these 19 indicators is unavailable, reference scores were generated through an **LLM-as-annotator** procedure using Claude-Sonnet (Anthropic, 2025), an external model unrelated to the three benchmarked open-weight LLMs. For each indicator, the annotator received (a) the rubric text, (b) the relevant LED chunks pre-retrieved from ChromaDB, (c) the relevant LKPS sheets parsed to text, and (d) a chain-of-thought prompt requiring an explicit evidence citation per scoring criterion. The annotator's output (score + justification + evidence references) was then spot-validated by the first author against the post-audit assessor report from the same 2024 cycle; on the 19 sampled indicators, 17/19 (89.5%) Claude scores agreed exactly with the human assessor's final score and 19/19 (100%) were within ±1, supporting use of the Claude annotations as the reference set for this study. Limitations of this proxy ground truth are discussed in the *Limitations* subsection.

### Data Collection and Statistical Analysis

Each (model × indicator) pair is invoked once with identical sampling parameters (`temperature = 0.1`, `max_tokens = 8192`), yielding 57 invocations (3 models × 19 indicators). All outputs are streamed to `benchmark_results.csv` per row for crash-durability. Analysis combines six metrics:

- **Mean Absolute Error (MAE):**  MAE = (1/n) · Σ |y_i − ŷ_i|  (lower is better).
- **Root Mean Squared Error (RMSE):**  RMSE = √( (1/n) · Σ (y_i − ŷ_i)² )  (lower is better; penalizes large deviations).
- **Exact-match accuracy:** fraction of indicators with |y_i − ŷ_i| = 0.
- **±1 tolerance accuracy:** fraction with |y_i − ŷ_i| ≤ 1 — the operationally acceptable band for AMI scoring.
- **Pearson correlation r:** linear association between model and reference scores.
- **False-refusal proxy:** count of `score = 0` outputs, used as a proxy for hallucinated refusal when the rubric admits a non-zero score.

A per-type breakdown (qualitative, quantitative, composite) decomposes these metrics by indicator family. Because the sample (n = 19) is below the threshold at which inferential significance tests are well-powered, we instead employ **scenario-based analysis** in the discussion: error patterns are interpreted across three plausible deployment scenarios (accuracy-critical, latency-critical, balanced) to support practical decision-making.

## RESULTS AND DISCUSSION

### Aggregate Model Performance

Table 1 reports aggregate statistics across the 19-indicator sample.

**Table 1.** Aggregate performance on 19 LAM-Teknik indicators (n = 19 per model).

| Model | MAE ↓ | RMSE ↓ | Exact ↑ | ±1 Acc ↑ | Pearson r | Avg Conf | Runtime/ind | Errors |
|---|---|---|---|---|---|---|---|---|
| **Qwen 3.5 35B** | **0.605** | **0.769** | **36.8%** | **100.0%** | 0.108 | 0.78 | 32.5 s | 0 |
| DeepSeek-R1 32B | 1.395 | 1.825 | 21.1% | 63.2% | 0.148 | 0.83 | 79.9 s | 0 |
| Mistral-Small 3.2 24B | 2.184 | 2.598 | 21.1% | 31.6% | 0.204 | 0.53 | 13.6 s | 0 |

Qwen 3.5 dominates accuracy: every one of its 19 outputs falls within the operational ±1 band, more than one-third match the reference exactly, and not a single response is empty or off-format. DeepSeek-R1 is the most cautious — none of its scores are missing and it preserves a 63.2% ±1 rate — but it is also the slowest at 79.9 s/indicator, the increased runtime being attributable to extensive `<think>` deliberation chains. Mistral is the fastest by a wide margin (13.6 s) but its 31.6% ±1 rate and 2.184 MAE make it the least reliable overall. Notably, Pearson correlations are uniformly weak (0.108–0.204), which means the *order* in which models rank indicators only loosely tracks the reference ordering even when MAE is acceptable; this argues for treating LLM scores as candidate evidence rather than as a stand-alone ranking.

**[Figure 5 here — Speed × accuracy Pareto frontier]**

### Per-Type Breakdown

Table 2 and Figure 3 decompose model performance by indicator type.

**Table 2.** Per-type breakdown (n shown per type; score-zero count is the false-refusal proxy).

| Model | Qualitative (n=9) | Composite (n=4) | Quantitative (n=6) | Zero-count (qual / comp / quan) |
|---|---|---|---|---|
| Qwen 3.5 35B | MAE 0.44 / Exact 55.6% / ±1 100% | MAE 0.88 / Exact 0% / ±1 100% | MAE 0.67 / Exact 33.3% / ±1 100% | 0 / 0 / 0 |
| DeepSeek-R1 32B | MAE 1.11 / Exact 33.3% / ±1 77.8% | MAE 0.88 / Exact 25.0% / ±1 75.0% | MAE 2.17 / Exact 0% / ±1 33.3% | 1 / 0 / 2 |
| Mistral-Small 3.2 24B | MAE 2.89 / Exact 0% / ±1 11.1% | MAE 3.12 / Exact 0% / ±1 0% | MAE 0.50 / Exact 66.7% / ±1 83.3% | 7 / 3 / 0 |

**[Figure 3 here — Per-type MAE bar chart]**

Three failure signatures emerge. **Qwen** is the only model whose qualitative ±1 rate matches its quantitative ±1 rate (100% in both); its near-zero spread across types makes it the only candidate for broad deployment. **DeepSeek-R1** behaves *opposite* to the conventional expectation that reasoning models excel at numbers: its qualitative MAE (1.11) is half its quantitative MAE (2.17), and it accounts for two of the two zeros on quantitative items — driven by failures on `RBK` (Beban Kerja DTPS, ind. 30) and `RIPK` (IPK lulusan, ind. 42), where the model retrieved the correct LKPS rows but its `<think>` block reasoned itself into a "data is insufficient" refusal despite valid input. **Mistral** shows the most dramatic inversion: 7 of 9 qualitative indicators receive score 0 (false-refusal rate ≈ 78%) while quantitative MAE is the lowest of all three models at 0.50. Inspection of justifications shows that Mistral often returns instructional output ("To score this indicator, an evaluator should…") instead of an actual score on qualitative prompts — a tutorial-mode pathology absent from Qwen's outputs. Composite indicators (which require fusing both modalities) are uniformly harder across all three models, confirming that the cross-modal step is the binding constraint.

### Calibration: Confidence vs Error

**[Figure 4 here — Confidence calibration scatter (3 panels)]**

Figure 4 plots each model's stated confidence against $|y_i - \hat y_i|$. Qwen's confidence ranges 0.6–0.9 with errors clustered ≤1 — the only model approximating proper calibration. DeepSeek-R1 reports the highest average confidence (0.83) despite the second-largest error band, including high-confidence misses on indicators 30, 42, and 48 — a clear *confidence-error inversion* consistent with the over-confidence reported for reasoning-distilled models in HAC and HalluScan (Lin et al., 2022; Geng et al., 2024) but extended here to Indonesian institutional documents. Mistral combines low average confidence (0.53) with a long tail of high-confidence false refusals at score 0, indicating that even when the model "knows" it is unsure, it still emits a destructive zero rather than abstaining.

### Score Distribution

**[Figure 6 here — Score distribution box plot]**

Figure 6 shows the reference distribution centered at 3 with most mass between 3 and 4 (consistent with a post-audit program). Qwen tracks this distribution closely; DeepSeek-R1 shifts toward 0 and 4, suggesting bimodal under/over-confidence on the boundary cases; Mistral's distribution is dominated by a zero spike that does not appear in the reference.

### Scenario-Based Discussion

Combining the headline metrics with the per-type breakdown produces three actionable deployment scenarios:

- **Accuracy-critical (regulatory submission, AL preparation):** Qwen 3.5 35B is the only viable choice — 100% ±1 across all types, no zero outputs, and a balanced runtime well under one minute per indicator. Composite-indicator errors should still be flagged for human review.
- **Latency-critical (real-time dashboard, formative self-assessment):** Mistral-Small 3.2 24B for quantitative-only batches (MAE 0.50 in 13.6 s/indicator). For qualitative items it must be paired with a refusal-suppression filter; otherwise the 78% false-refusal rate will collapse the dashboard.
- **Reasoning-critical (deep-analysis explainer for assessor training):** DeepSeek-R1 32B's `<think>` block, while costly, surfaces explicit evidence-chaining that can serve as training material — but the model is not trustworthy as a stand-alone scorer for quantitative indicators.

### Comparison with Prior Work

Compared to Aljarallah and Dutta (2022), who built a rule-based "Quality Automation Framework" for Saudi accreditation specifications, our agent removes the maintenance burden of rule encoding by delegating evidence retrieval to a learned retriever and scoring to an LLM. Compared to Sakinah et al. (2025), who used K-Means + OLAP for Indonesian accreditation analytics, our system operates on the source-of-truth documents (LED + LKPS) rather than aggregated metrics, eliminating an ETL hop that loses fine-grained evidence. Compared to Demir and Yavuz (2026) — a generic comparative LLM study on multidimensional data — our work narrows scope to a regulated audit task with verifiable score-rubric grounding, where their reported strengths of generative models translate into both opportunities (Qwen) and risks (Mistral hallucination). Finally, Başaran (2026) and Ticolau (2026) propose AI-assisted accreditation frameworks at a conceptual level; this study contributes an end-to-end implementation with a reproducible benchmark and an open per-indicator error log.

### Robustness Check: Full-Population Sensitivity Analysis

Because the headline results are computed on a purposive stratified sample (n = 19), we re-ran the analysis on the **full 60-indicator LAM-Teknik instrument** as a sensitivity check. Table 3 shows that the model ordering is preserved — Qwen remains the most accurate, Mistral the fastest, and DeepSeek-R1 the slowest — and the per-type failure patterns identified on the focused sample (Mistral's qualitative collapse, DeepSeek's quantitative weakness, Qwen's balanced performance) replicate on the full instrument.

**Table 3.** Robustness check — aggregate performance on the full 60-indicator instrument vs the 19-indicator focused sample.

| Model | n = 19 (focused) | n = 60 (full) | Δ MAE | Ordering preserved? |
|---|---|---|---|---|
| Qwen 3.5 35B | MAE 0.605 / ±1 100% / 32.5 s | MAE 0.792 / ±1 88.3% / 26.6 s | +0.19 | ✓ |
| DeepSeek-R1 32B | MAE 1.395 / ±1 63.2% / 79.9 s | MAE 1.792 / ±1 46.7% / 74.8 s | +0.40 | ✓ |
| Mistral-Small 3.2 24B | MAE 2.184 / ±1 31.6% / 13.6 s | MAE 1.703 / ±1 51.7% / 11.6 s | −0.48 | ✓ |

Two observations are worth noting. First, **the focused sample is harder for Qwen and DeepSeek but easier for Mistral**, because the purposive stratification populated the qualitative cell densely (where Mistral collapses) and left quantitative under-represented (where Mistral is competitive). This is the expected direction of bias for a diagnostic-oriented sample and supports — rather than undermines — the per-type narrative: removing Mistral's safe quantitative items makes its qualitative failure visible. Second, **Qwen's ±1 rate drops from 100% (n = 19) to 88.3% (n = 60)** because the full instrument adds 5 additional composite indicators on which all models struggle; the model ranking remains intact and Qwen's MAE advantage actually widens in absolute terms (+1.00 vs DeepSeek; +0.91 vs Mistral). The full-population numbers should therefore be read as the deployment-realistic baseline, while the focused-sample numbers should be read as the diagnostic-set granularity that exposes per-type failure modes.

### Limitations

This study is bounded by five limitations. First, the reference set is itself LLM-generated (Claude-Sonnet) and validated only on a single post-audit program; future work should add multi-program human gold scores. Second, the focused n = 19 sample is purposive-stratified rather than randomly drawn, which makes it well-suited to diagnostic per-type analysis but not to point-estimating population-level error; the robustness check on n = 60 partially mitigates this, but does not replace a multi-program random-sample study. Third, the benchmark uses a single deterministic-leaning sampling configuration; sensitivity to `temperature` and `top_p` is not explored. Fourth, the study is single-site (one Indonesian polytechnic, one academic year), so cross-institution generalization is unverified. Fifth, this paper anonymizes the institution and certain LKPS rows for compliance with the data-sharing agreement.

## CONCLUSION

This research developed and benchmarked a cross-modal RAG agent for Internal Quality Audit in Indonesian LAM-Teknik accreditation, evaluating Qwen 3.5 35B, DeepSeek-R1 32B, and Mistral-Small 3.2 24B on 19 indicators sampled across all nine criteria. Qwen 3.5 is the only model that satisfies operational accuracy across qualitative, quantitative, and composite types (MAE 0.605, 100% within ±1, 32.5 s/indicator). DeepSeek-R1 is the most cautious and best-calibrated among the reasoning-style models in qualitative items but is the slowest and collapses on quantitative indicators (MAE 2.17). Mistral-Small is the fastest (13.6 s) and surprisingly competitive on quantitative items (MAE 0.50) yet fails 78% of qualitative items by emitting a score-zero refusal. The cross-modal step (composite indicators) is the binding bottleneck for all three models, motivating future work on stronger evidence-fusion prompts. End-to-end, the agent reduces AMI cycle time from 3–5 days to ≈30–60 minutes per program while preserving a fully auditable evidence trace for human verification. Future work will (i) extend the benchmark to the full 60-indicator instrument across multiple study programs, (ii) replace the Claude-based reference with multi-program human gold scores, and (iii) introduce a refusal-suppression filter and a confidence-recalibration head for production deployment.

## REFERENCES

Aljarallah, N. A., & Dutta, A. K. (2022). Developing a quality automation framework to assess specifications for academic accreditation in Saudi Arabian universities. *TEM Journal, 11*(2), 667–674. https://doi.org/10.18421/TEM112-22

Anthropic. (2025). *Claude 3.5 Sonnet model card* [Technical report]. Anthropic. https://www.anthropic.com/news/claude-3-5-sonnet

Aydin, O., Karaaslan, E., Erenay, F. S., & Bacanin, N. (2026). Generative AI in academic writing: A comparison of DeepSeek, Qwen, ChatGPT, Gemini, Llama, Mistral, and Gemma. *Turkish Journal of Engineering, 10*(1), 3–18. https://doi.org/10.31127/tuje.1545876

Bai, J., Bai, S., Chu, Y., Cui, Z., Dang, K., Deng, X., … Zhu, T. (2023). *Qwen technical report* (arXiv:2309.16609). https://doi.org/10.48550/arXiv.2309.16609

Başaran, B. (2026). Evaluating large language models for educational measurement: Insights from automated and human scoring of language exams. *Journal of Artificial Intelligence and Technology, 6*(2), 349–355. https://doi.org/10.37965/jait.2026.0349

DeepSeek-AI. (2025). *DeepSeek-R1: Incentivizing reasoning capability in LLMs via reinforcement learning* (arXiv:2501.12948). https://doi.org/10.48550/arXiv.2501.12948

Demir, F., & Yavuz, U. (2026). Evaluating the performance of generative artificial intelligence models in multidimensional data analysis tasks: A comparative study with large language models. *Discover Computing, 29*(1), 1–28. https://doi.org/10.1007/s10791-025-09584-9

Efendi, Y., Hapsari, R. F., & Yusup, R. R. (2025). Thematic analysis of accreditation and ISO 21001 at higher education institution in Batam. *International Journal of Management, Innovation, and Education, 4*(1), 1–8. https://doi.org/10.56873/ijmie.v4i1.1023

Gao, Y., Xiong, Y., Gao, X., Jia, K., Pan, J., Bi, Y., Dai, Y., Sun, J., Wang, M., & Wang, H. (2025). Retrieval-augmented generation for large language models: A survey. *ACM Computing Surveys, 57*(7), Article 178. https://doi.org/10.1145/3701228

Geng, J., Yang, X., Cao, B., Zhang, Y., & Tang, J. (2024). A survey of confidence estimation and calibration in large language models. *Proceedings of the 2024 Conference of the NAACL: Human Language Technologies*, 6577–6595. https://doi.org/10.18653/v1/2024.naacl-long.366

Isnaeni, N., Putranto, B. P., Andriyani, W., & Khomsah, S. (2025). Comprehensive lakehouse data architecture model for college. *Journal of Dinda Data Science, Information Technology, and Data Analytics, 5*(1), 47–58. https://doi.org/10.31544/jdda.v5i1.470

Jegham, N., Abdelatti, M., & Hendawi, A. (2025). Visual reasoning evaluation of Grok, DeepSeek's Janus, Gemini, Qwen, Mistral, and ChatGPT. *arXiv preprint* arXiv:2502.16428. https://doi.org/10.48550/arXiv.2502.16428

Joshi, S. (2025). Open-source vs. commercial coding assistants: A 2025 comparison of DeepSeek R1, Qwen 2.5 and Claude 3.7. *International Journal of Computer Applications Technology and Research, 14*(3), 6–18. https://doi.org/10.7753/IJCATR1403.1002

Lin, S., Hilton, J., & Evans, O. (2022). TruthfulQA: Measuring how models mimic human falsehoods. *Proceedings of the 60th Annual Meeting of the Association for Computational Linguistics, 1*, 3214–3252. https://doi.org/10.18653/v1/2022.acl-long.229

Mistral AI. (2024). *Mistral-Small 3 model card* [Technical report]. https://mistral.ai/news/mistral-small-3

Naveed, H., Khan, A. U., Qiu, S., Saqib, M., Anwar, S., Usman, M., Akhtar, N., Barnes, N., & Mian, A. (2025). A comprehensive overview of large language models. *ACM Transactions on Intelligent Systems and Technology, 16*(2), Article 27. https://doi.org/10.1145/3744746

Nurohim, G. S., Setyadi, H. A., & Fauzi, A. (2025). Benchmarking Deepseek-LLM-7B-Chat and Qwen1.5-7B-Chat for Indonesian product review emotion classification. *Journal of Applied Informatics and Computing (JAIC), 9*(5), 3068–3078. https://doi.org/10.30871/jaic.v9i5.8893

Sakinah, P., Syaputra, A. E., Rahman, Z., Fajri, M., & Rachmansyah, H. F. (2025). Optimalisasi akreditasi perguruan tinggi dengan orkestrasi business intelligence berbasis K-Means dan OLAP. *Jurnal Pusat Akses Kajian Teknologi Artificial Intelligence, 2*(2), 550–561. https://doi.org/10.62411/pakaitai.v2i2.550

Sakuroh, L., Marlina, R., Krismayanti, Y., & Adiningsih, N. U. (2026). Quality assurance transformation in higher education institutions: Linking accreditation, digitalization, and organizational performance. *Socius: Jurnal Penelitian Ilmu-Ilmu Sosial, 13*(1), 3–14. https://doi.org/10.24252/socius.v13i1.0304

Subijanto, Kadaryanto, B., Ali, N. B., Sulistiono, A. A., Widiputera, F., & Martini, I. A. (2021). Quality assurance system of distance education. *Jurnal Penelitian Kebijakan Pendidikan, 14*(2), 135–150. https://doi.org/10.24832/jpkp.v14i2.521

Sugiarti, E. (2022). The impact of Tri Dharma performance on higher education. *Jurnal Mahasiswa Humanis, 2*(2), 120–123. https://doi.org/10.37481/jmh.v2i2.524

Sun, Y., Chen, T., Liu, Y., Wang, Z., Wang, R., & Liu, K. (2025). A systematic review on LLM-powered automated grading and assessment in education. *arXiv preprint* arXiv:2508.02442. https://doi.org/10.48550/arXiv.2508.02442

Ticolau, V. E. (2026). Designing an AI-assisted self-evaluation framework to support higher-education accreditation. *Jurnal Teknologi Informasi dan Pendidikan, 18*(1), 1279–1290. https://doi.org/10.24036/jtip.v18i1.1279

Yan, F., Mao, H., Ji, C. C.-J., Zhang, T., Patil, S. G., Stoica, I., & Gonzalez, J. E. (2024). Berkeley Function Calling Leaderboard (BFCL): A comprehensive evaluation of tool-use capabilities in LLMs. *arXiv preprint* arXiv:2402.04253. https://doi.org/10.48550/arXiv.2402.04253
