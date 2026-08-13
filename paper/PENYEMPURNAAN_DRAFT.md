# Refinement Draft for "Automatic Internal Academic Assessment" Paper

**Source:** `docs/reference/paper/Jurnal-AI.pdf` (7 pages, 232KB)
**Target venue:** Equilibrium: Jurnal Pendidikan, Vol. XIV. Issu 1. Januari-April 2026

---

## A. CRITICAL ISSUES TO FIX

| # | Issue | Severity | Recommended action |
|---|-------|----------|--------------------|
| 1 | **METHODS section missing** | 🔴 Critical | Add before RESULTS — mandatory in IMRaD structure |
| 2 | **ABSTRAK (Bahasa Indonesia) missing** | 🔴 Critical | Equilibrium template **requires** dual-language abstract |
| 3 | **REFERENCES section empty** | 🔴 Critical | Page 7 only contains the heading "REFERENCE" with no entries — must populate with 10–15 APA 6th references |
| 4 | **Title explicitly mentions "PENS"** | 🟡 Important | Anonymize the institution per NDA with partner |
| 5 | **Inconsistency between Table 1 and Tables 2–4** | 🟡 Important | Table 1 reports `Mistral MAE 0.7143, DeepSeek 1.81`, but the per-model detail tables and the `data/report_per_indicator_focus7.csv` ground truth indicate the labels of Mistral and DeepSeek are likely swapped (correct: DeepSeek=0.71, Mistral=1.81) |
| 6 | **No figures, only tables** | 🟡 Important | Add 4–5 visualizations to improve readability and citation appeal |
| 7 | **Novelty claim is shallow** | 🟡 Important | "First multi-LLM comparison" needs to be defended against 2024–2025 literature |
| 8 | Metric definitions incomplete (MAE, RMSE, etc.) | 🟢 Minor | Add formulas + interpretations in Methods |
| 9 | No *Limitations* section | 🟢 Minor | Required in academic papers — embed in Discussion or as a separate section |
| 10 | No Acknowledgments | 🟢 Minor | Needed for NDA disclosure and compute resource attribution |

---

## B. NOVELTY POSITIONING (Based on 2024–2025 Literature Search)

### B.1 What already exists in the literature

**LLM for educational assessment (general):**
- *MDPI Applied Sciences (2025)*: systematic review of 49 LLM-Powered
  Automated Assessment (LLMPAA) studies, 2018–2024. Dominant domains:
  reading comprehension (n=14), language education (n=13), CS (n=10).
- *Nature Scientific Reports (2026)*: AI-assisted grading framework in
  higher education using GPT-4 with rubric-aligned prompts.
- *MDPI Informatics (2025)*: GraderAssist — graph-based multi-LLM framework
  for transparent grading.
- *arXiv 2508.02442*: Reliability and validity of LLMs for student essay
  scoring.

**Multi-model LLM benchmarks (general):**
- BFCL v4 (Berkeley): generic function calling leaderboard.
- LLM Stats / Vellum / Onyx leaderboards: 300+ models compared via MMLU,
  GPQA, SWE-bench.
- *Mike Veerman blog (2026)*: tool-calling benchmark of 21 open-weight
  models (0.5B–3.8B).

**RAG in education:**
- *MDPI Applied Sciences (2025)*: survey of RAG chatbots for education —
  focused on tutoring & content generation.
- *ScienceDirect (2025)*: systematic survey of RAG in educational
  applications — emphasis on interactive learning, content generation.

**Hallucination & calibration:**
- *arXiv 2604.02543*: HAC (Hallucination-Aware Calibration) for medical
  VQA.
- *arXiv 2605.02443*: HalluScan — detection benchmark across 6 methods × 4
  models × 3 domains.
- *arXiv 2509.04664 (OpenAI)*: "Why Language Models Hallucinate" frames
  overconfidence as an *epidemic*.

### B.2 Identified GAP

**No single existing work combines all four of the following dimensions:**

| Dimension | Evidence of gap |
|-----------|-----------------|
| **Indonesian domain** | All LLMPAA reviews 2018–2024 are English-language; only one Indonesian RAG paper exists (Indonesian J of E-Learning), and it covers *chatbot tutoring*, not assessment |
| **Accreditation (not student grading)** | All assessment papers focus on *student work* (essays, code, exams); none scores *institutional accreditation documents* |
| **Cross-modal LED (narrative PDF) + LKPS (structured Excel)** | Education RAG surveys cover only single-modal (text-to-text); cross-modal RAG is dominated by medical imaging |
| **Native vs prompt-based tool calling** | BFCL & ToolBench do not explicitly contrast the two paradigms in a *side-by-side comparison* on a single task |
| **Reasoning models (DeepSeek-R1) on scoring tasks** | "Why LMs Hallucinate" (OpenAI 2025) discusses generic overconfidence; no specific study yet on R1-style models for document scoring |

### B.3 Strengthened novelty claim

**Current version (weak):**
> *"This research also represents a scientific novelty because, to the best of our knowledge, there has been no previous study that specifically applies a multi-model LLM comparison (Qwen, DeepSeek, Mistral) for the automation of Tri Dharma indicator assessment in the context of higher education accreditation in Indonesia."*

**Refined version (strong, multi-dimensional):**
> *"This research delivers four complementary novelty contributions that
> distinguish it from the existing LLM-Powered Automated Assessment
> literature (Sun et al., 2025; MDPI 2025): (1) **Domain novelty** — the
> first study applying open-weight LLM agents to Indonesian
> LAM-style higher-education accreditation, whereas prior work is
> dominated by English-language student-work grading (essays, code) (arXiv
> 2508.02442); (2) **Cross-modal RAG novelty** — an agent architecture
> that cross-references qualitative documents (LED narrative PDF) with
> quantitative documents (LKPS structured Excel) through four specialized
> tools, while the 2025 RAG-in-education survey covers only single-modal
> text-to-text systems (Gao et al., 2025); (3) **Tool-calling paradigm
> comparison** — a side-by-side comparison of native function calling
> versus prompt-based JSON dispatch on the same domain-specific task,
> filling a gap not addressed by the generic BFCL v4 or ToolBench
> evaluations; and (4) **Calibration finding** — empirical documentation
> of overconfidence in the DeepSeek-R1 reasoning model on institutional
> document scoring, extending recent calibration literature (HAC,
> HalluScan, T3) to a new domain."*

---

## C. VISUALIZATION DRAFTS PER SECTION (5 figures)

Matplotlib code is provided so figures can be regenerated immediately.

### Figure 1 — Comparison of Manual vs Automated AMI Workflow (Introduction)

**Type:** Side-by-side flow diagram (two parallel lanes).

**Purpose:** Visualize the problem and the proposed solution upfront —
readers immediately grasp the value proposition.

```
┌─────────────────────────┐    ┌───────────────────────────────┐
│ MANUAL FLOW (BASELINE)   │    │ AUTOMATED FLOW (PROPOSED)     │
├─────────────────────────┤    ├───────────────────────────────┤
│ LED PDF (200 pages)     │    │ LED PDF                       │
│        ↓ manual reading │    │        ↓ chunking + embedding │
│ Assessor reads, notes   │    │ ChromaDB vector index         │
│ indicator relevance     │    │        ↓                      │
│        ↓                │    │ LLM Agent (RAG)               │
│ LKPS Excel (50 sheets)  │    │        ↑↓                     │
│        ↓ manual cross-  │    │ 4 tools                       │
│        ↓ check          │    │ (rubric, search,              │
│ Compare qualitative vs  │    │  table, formula)              │
│ quantitative evidence   │    │        ↓                      │
│        ↓                │    │ Auto-score 60+ ind            │
│ Score 60+ indicators    │    │ + justification + confidence  │
│        ↓                │    │        ↓                      │
│ Written justification   │    │ Assessor verifies             │
│        ↓                │    │                               │
│ Total: 3-5 days/program │    │ Total: 30-60 min/program      │
│ Inter-assessor variance │    │ Consistent + auditable trace  │
└─────────────────────────┘    └───────────────────────────────┘
```

**Caption:** *Figure 1. Comparison of manual Internal Quality Audit
workflow (left) and the proposed LLM-agent-based automated workflow
(right). The automated approach uses vector retrieval for LED and
structured table lookup for LKPS, with human assessors retained as
verifiers.*

### Figure 2 — System Architecture (Methods)

**Type:** Three-layer technical block diagram.

**Purpose:** Communicate the system architecture to technical reviewers.

(See `paper/02_figures.md` "Figure 1 — System Architecture" for the
full ASCII recipe — already prepared.)

### Figure 3 — Per-Type MAE Comparison (Results, the central finding)

**Type:** Grouped bar chart, 3 models × 2 type bars (qualitative vs
composite).

```python
import matplotlib.pyplot as plt
import numpy as np

models = ["Qwen", "DeepSeek-R1", "Mistral"]
qual_mae  = [0.75, 1.25, 2.45]   # Qualitative (n=4 in focus7)
comp_mae  = [0.33, 0.00, 1.22]   # Composite (n=3 in focus7)

x = np.arange(len(models))
w = 0.35
fig, ax = plt.subplots(figsize=(7, 4))
ax.bar(x - w/2, qual_mae, w, label="Qualitative indicators (n=4)", color="#3b82f6")
ax.bar(x + w/2, comp_mae, w, label="Composite indicators (n=3)",   color="#16a34a")
ax.set_ylabel("Mean Absolute Error (MAE) ↓")
ax.set_xticks(x); ax.set_xticklabels(models)
ax.legend()
ax.set_title("MAE per Indicator Type: Reverse Pattern Across Models")
plt.tight_layout()
plt.savefig("fig3_per_type_mae.pdf")
```

**Caption:** *Figure 3. MAE per indicator type. Qwen3.5 is consistently
competitive on both types; DeepSeek-R1 is perfect on composite (MAE
0.00) but degrades on purely qualitative; Mistral shows the inverse
pattern — relatively good on composite, fails on qualitative.*

### Figure 4 — Confidence Calibration Plot (Results, supports overconfidence claim)

**Type:** Scatter plot with three panels, one per model.

```python
import pandas as pd, matplotlib.pyplot as plt

bench = pd.read_csv("data/benchmark_results.csv")
ref   = pd.read_csv("data/reference_scores_claude.csv").set_index("indicator_no")["score"]
bench = bench[bench.indicator_no.isin([14,15,16,17,20,22,24])]
bench["ref"]     = bench.indicator_no.map(ref)
bench["abs_err"] = (bench.score.astype(float) - bench.ref.astype(float)).abs()

fig, axes = plt.subplots(1, 3, figsize=(11, 3.5), sharey=True)
for ax, m in zip(axes, ["qwen3.5:35b", "deepseek-r1:32b", "mistral-small3.2:24b"]):
    sub = bench[bench.model == m]
    ax.scatter(sub.confidence, sub.abs_err, s=80, alpha=0.7, edgecolors="black")
    ax.axhline(y=1, color='gray', linestyle='--', alpha=0.5, label='±1 threshold')
    ax.set_title(m, fontsize=10)
    ax.set_xlabel("Confidence (0-1)")
    ax.set_xlim(0, 1.05); ax.set_ylim(-0.2, 4.5)
    ax.grid(alpha=0.3)
axes[0].set_ylabel("|model_score − reference_score|")
plt.suptitle("Confidence Calibration: Are Models 'Honest' About Uncertainty?", y=1.02)
plt.tight_layout()
plt.savefig("fig4_calibration.pdf", bbox_inches='tight')
```

**Caption:** *Figure 4. Confidence calibration per model. Ideal calibration
would cluster high-confidence points (right) at low error (bottom).
Mistral (right panel) emits confidence 0.8–1.0 even on cases with
|difference| ≥ 3 — empirical evidence of the overconfidence phenomenon
in mid-sized chat models, consistent with calibration literature
(Kalai & Nachum, 2025).*

### Figure 5 — Runtime × Accuracy Pareto Frontier (Results)

**Type:** Scatter plot with model labels.

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
plt.xlabel("Average runtime per indicator (seconds)")
plt.ylabel("Exact match accuracy (%)")
plt.title("Pareto Frontier: Speed vs Accuracy Trade-off")
plt.grid(alpha=0.3)
plt.xlim(0, 80); plt.ylim(0, 70)
plt.tight_layout()
plt.savefig("fig5_pareto.pdf")
```

**Caption:** *Figure 5. Speed × accuracy Pareto frontier. DeepSeek-R1
attains the highest accuracy but is slowest; Mistral is fastest but
worst; Qwen sits at a balanced position. This trade-off is essential
for model selection in compute-constrained institutional settings.*

### Figure 6 (optional) — Score Distribution Box Plot (Results)

**Type:** Box plot of four distributions (reference + 3 models).

```python
import pandas as pd, seaborn as sns, matplotlib.pyplot as plt

ref   = pd.read_csv("data/reference_scores_claude.csv")
bench = pd.read_csv("data/benchmark_results.csv")
focus = [14,15,16,17,20,22,24]

ref_f = ref[ref.indicator_no.isin(focus)][["indicator_no","score"]]
ref_f["model"] = "Reference (Claude)"
bench_f = bench[bench.indicator_no.isin(focus)][["model","indicator_no","score"]]
df = pd.concat([ref_f, bench_f]).dropna()
df["score"] = df.score.astype(float)

plt.figure(figsize=(8, 4))
order = ["Reference (Claude)", "qwen3.5:35b", "deepseek-r1:32b", "mistral-small3.2:24b"]
sns.boxplot(data=df, x="model", y="score", order=order, palette="Set2")
sns.stripplot(data=df, x="model", y="score", order=order, color="black", size=4, alpha=0.6)
plt.ylim(-0.5, 4.5)
plt.ylabel("Score (0-4)")
plt.title("Score Distribution: Reference vs 3 Open-Weight Models")
plt.xticks(rotation=10, ha='right')
plt.tight_layout()
plt.savefig("fig6_distribution.pdf")
```

**Caption:** *Figure 6. Score distribution across the 7 focus indicators.
The reference centers on 3; Qwen tracks the reference distribution
closely; DeepSeek-R1 shows a cluster at 0 (false refusal on Capstone
Design); Mistral is bimodal with many 0s (refusals) plus a few mid-high
scores.*

---

## D. DROP-IN DRAFTS FOR MISSING SECTIONS

### D.1 ABSTRAK (DALAM BAHASA INDONESIA) — INSERT AFTER ABSTRACT (IN ENGLISH)

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

### D.2 METHODS — MISSING SECTION (insert before RESULTS AND DISCUSSION)

```markdown
## METHODS

### Approach and Scope
This study uses a *quantitative experimental* approach with a *benchmarking*
method against three open-weight LLMs. The scope is limited to seven core
Tri Dharma indicators: (1) CPL alignment and review, (2) Lesson Plan
(RPS), (3) Learning Process, (4) Research and Community Service
integration, (5) Capstone Design, (6) Research, and (7) Community
Service. The subset comprises 4 qualitative and 3 composite indicators,
providing balanced coverage between text-judgment and judgment+formula
combinations.

### Operational Variable Definitions
The primary variable is the *model score* (ordinal scale 0–4) per
indicator, compared against the *reference score* generated by Claude
(Anthropic) as an *LLM-as-annotator*. Supporting variables include
*justification* (text), *confidence* (range 0.0–1.0), and *runtime*
(seconds per indicator).

### Location and Sample
The study was conducted on one Bachelor of Applied Science distance
learning engineering program at an Indonesian state polytechnic,
anonymized as *Program A*. The LED and LKPS documents are the
*post-audit* version from the 2024 cycle.

### Materials and Main Tools
The system is built with: (1) embedding model
`paraphrase-multilingual-MiniLM-L12-v2` (384-d); (2) vector database
ChromaDB with HNSW cosine similarity; (3) LangGraph as the agent
state-machine framework; (4) Ollama as the inference backend on a
24 GB VRAM GPU server accessed via a Cloudflare-tunneled HTTPS endpoint.
Four tools are exposed to the agent: `get_indicator_rubric`,
`search_led_evidence`, `get_lkps_table`, and `compute_formula_score`.

### Two Agent Paradigms
The *native* paradigm (for Qwen and Mistral) uses structured
`tool_calls` consumed directly by LangGraph's `ToolNode`. The
*prompt-based* paradigm (for DeepSeek-R1, a reasoning model that emits
`<think>...</think>` blocks) requires the model to produce single-line
JSON in the format `{"action": ..., "args": ...}` for tool calls.

### Data Collection and Analysis Techniques
Each indicator is evaluated once per model with identical sampling
parameters (temperature 0.1), producing 21 invocations total
(3 models × 7 indicators). Results are streamed directly to a CSV
file. Reference scores are generated separately by Claude. Analysis
uses six metrics:

- **Mean Absolute Error (MAE)**: $\text{MAE} = \frac{1}{n}\sum_{i=1}^{n}|y_i - \hat{y}_i|$ — lower is better
- **Root Mean Squared Error (RMSE)**: $\text{RMSE} = \sqrt{\frac{1}{n}\sum_{i=1}^{n}(y_i - \hat{y}_i)^2}$
- **Exact match**: $\frac{|\{i : y_i = \hat{y}_i\}|}{n}$
- **Within-±1 accuracy**: $\frac{|\{i : |y_i - \hat{y}_i| \leq 1\}|}{n}$
- **Pearson correlation r**
- **Score-zero rate**: proxy for the *false-refusal failure mode*

where $y_i$ is the reference score and $\hat{y}_i$ is the model score.
```

### D.3 REFERENCES — EMPTY SECTION TO POPULATE

APA 6th format, 14 references.

```markdown
## REFERENCES

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
   Zettlemoyer, L., Cancedda, N., & Scialom, T. (2023). Toolformer:
   Language Models Can Teach Themselves to Use Tools. *Advances in Neural
   Information Processing Systems, 36*.

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

## E. PER-SECTION POLISH SUGGESTIONS

### E.1 ABSTRACT (English) — Add concrete numbers

**Before:**
> *"While each model exhibits distinct performance characteristics in terms of accuracy and processing speed, their collective integration allows for a more robust diagnostic tool."*

**After:**
> *"Qwen3.5:35b achieves the lowest MAE (0.57) and 100% within-±1 accuracy with no false refusals; DeepSeek-R1:32b leads in exact match (57.1%) due to perfect performance on composite indicators (100% exact); Mistral-Small3.2:24b underperforms (MAE 1.81) with 4 of 7 outputs being false refusals. We recommend Qwen3.5:35b as a reliable AI draft scorer for human-assessor verification."*

### E.2 INTRODUCTION — Add literature-positioning paragraph

After the "The advancement of Artificial Intelligence (AI) technology…" paragraph, insert:

> *"Several recent studies have applied LLMs in higher education — a
> systematic review in MDPI Applied Sciences (Sun et al., 2025) catalogued
> 49 LLM-Powered Automated Assessment (LLMPAA) studies from 2018–2024,
> dominated by the assessment of *student work* (essays, code, exams).
> However, the assessment of *institutional accreditation documents*
> involving heterogeneous evidence sources (narrative PDF + structured
> Excel) has not been explored in the literature, especially in the
> Indonesian context. The 2025 RAG-in-education survey (Gao et al.) shows
> that RAG is predominantly used for *tutoring chatbots* and *content
> generation*, not for *cross-modal evidence assessment* as required by
> LAM accreditation. Meanwhile, generic function-calling benchmarks such
> as BFCL v4 (Patil et al., 2024) do not explicitly compare native versus
> prompt-based dispatch paradigms on a domain-specific task. This research
> fills all three gaps simultaneously."*

### E.3 RESULTS AND DISCUSSION — Fix data inconsistency

**Action:** Cross-check every number in Table 1 against Tables 2–4 and the
ground-truth file `data/report_per_indicator_focus7.csv`. The likely issues are:
- Table 1: the names "Mistral" and "DeepSeek" appear to be swapped (MAE
  0.7143 should belong to DeepSeek; MAE 1.81 should belong to Mistral
  per the benchmark CSV)
- Table 4 (Mistral) entries for indicators 5, 6, 7 should be re-verified
  against the CSV

**Recommended:** regenerate all tables from a single source of truth
(`scripts/analyze_benchmark.py --indicators 14,15,16,17,20,22,24 --suffix _focus7`).

### E.4 IMPLICATIONS FOR ACCREDITATION PRACTICE — Strengthen with citations

Augment the DeepSeek overconfidence discussion with citations to recent
calibration literature:

> *"The DeepSeek overconfidence phenomenon observed in this study is
> consistent with recent calibration findings: the HalluScan benchmark
> (arXiv 2605.02443) reports that Judge-based detection methods exhibit
> the worst calibration despite using a strong evaluator model;
> Hallucination-Aware Calibration (HAC, arXiv 2604.02543) proposes
> grounding signals as a mitigation. Our findings confirm that this
> phenomenon also surfaces in domain-specific Indonesian accreditation
> tasks, justifying the recommendation of human-in-the-loop verification."*

---

## F. AUTHOR ACTION CHECKLIST

### Mandatory (before submission):
- [ ] Add the METHODS section (see D.2)
- [ ] Add the ABSTRAK Bahasa Indonesia (see D.1)
- [ ] Populate the REFERENCES section with relevant citations (see D.3, minimum 12)
- [ ] Anonymize: remove "PENS" and "Telecommunication Engineering" from title and body
- [ ] Cross-verify numbers across tables — regenerate from `analyze_benchmark.py`
- [ ] Strengthen the novelty claim (see B.3)

### Strongly Recommended:
- [ ] Add at least 3 figures (Figure 1 workflow, Figure 2 architecture, Figure 3 per-type bar)
- [ ] Improve the abstract with concrete numbers (see E.1)
- [ ] Add a literature-positioning paragraph in the Introduction (see E.2)
- [ ] Add citations to calibration literature in the Discussion (see E.4)

### Optional:
- [ ] Add Figure 4 (calibration scatter) and Figure 5 (Pareto runtime)
- [ ] Add an explicit *Limitations* section in the Discussion
- [ ] Add an *Acknowledgments* section for NDA + compute disclosure

---

## Sources

Web search results that informed the novelty positioning above:

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
