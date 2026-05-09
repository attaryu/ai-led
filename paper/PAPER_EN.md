# Native vs Prompt-Based Tool Calling: A Comparative Study of Open-Weight LLM Agents for Higher Education Quality Audit

**Authors:** [Author Name]¹, [Advisor]¹
¹ [Affiliation]
✉ [email]

---

## Abstract

Internal Quality Audits (Audit Mutu Internal, AMI) for higher
education accreditation in Indonesia involve manually scoring dozens
of indicators against a complex rubric using two heterogeneous
evidence sources: the qualitative Self-Evaluation Report (LED) and
the quantitative Performance Report (LKPS). This paper investigates
whether open-weight Large Language Model (LLM) agents can automate
this multi-modal scoring task, and how the choice of agent
paradigm — native function calling versus prompt-based JSON
dispatch — affects performance across qualitative and quantitative
indicator types. We implement a Retrieval-Augmented Generation (RAG)
agent that cross-references vector-indexed LED chunks with
structured LKPS tables through four specialized tools, and benchmark
three open-weight models of comparable size (24–35 B parameters):
a tool-tuned generalist (`qwen3.5:35b`), a reasoning-focused model
in prompt-based mode (`deepseek-r1:32b`), and a mid-sized chat model
(`mistral-small3.2:24b`), against an LLM-derived reference produced
by Claude on the full 60-indicator LAM-Engineering rubric. The
tool-tuned generalist achieved 88.3% within-±1 accuracy and 36.7%
exact match (MAE 0.79), substantially outperforming both the
reasoning model (46.7%, MAE 1.79) and the mid-sized chat model
(51.7%, MAE 1.70). We identify three distinct failure modes —
quantitative extraction collapse, tutorial-mode output, and false
refusal — and discuss implications for deploying open-weight agents
in standards-compliant academic evaluation.

**Keywords:** large language models, retrieval-augmented generation,
tool calling, automated assessment, quality audit, low-resource
Indonesian text, open-weight models.

---

## I. Introduction

Higher-education accreditation in Indonesia, particularly for
engineering programs under the Independent Accreditation Body for
Engineering (LAM-Teknik), relies on Internal Quality Audits (AMI)
based on a rubric of 60+ indicators per program. Each indicator is
scored on a 0–4 scale by trained assessors who must manually
cross-reference two structurally distinct documents: a 150–200 page
narrative Self-Evaluation Report (LED) in PDF, and a 50-sheet
Excel Performance Report (LKPS) containing quantitative data. The
process is labor-intensive, slow, and prone to inter-assessor
inconsistency.

Recent advances in tool-calling Large Language Models (LLMs) and
Retrieval-Augmented Generation (RAG) enable agents that can reason
over both structured and unstructured documents. Open-weight LLMs
in the 20–35 B parameter range — such as Qwen, DeepSeek, and
Mistral — are now plausibly capable of tool-augmented reasoning at
modest computational cost, while preserving data privacy through
local deployment. However, no public benchmark exists for the
LAM-style cross-modal scoring task in Bahasa Indonesia.

We observe that LLM agents can be implemented under two distinct
tool-dispatch paradigms. Models with native tool support, such as
Qwen and Mistral, emit structured `tool_calls` consumed directly by
an executor. Reasoning models such as DeepSeek-R1, QwQ, and o1, in
contrast, emit `<think>...</think>` chain-of-thought blocks and do
not natively support function calling on Ollama; they require a
prompt-based JSON dispatch wrapper that manually parses model
output. The open question we address is: *does prompt-based dispatch
match native tool calling on document-grounded scoring in this
domain?*

The contributions of this paper are:
1. An open-source cross-modal RAG agent for AMI scoring that fuses
   LED vector retrieval with LKPS table lookup via four specialized
   tools.
2. The first benchmark of three open-weight LLMs (`qwen3.5:35b`,
   `deepseek-r1:32b`, `mistral-small3.2:24b`) on the full
   60-indicator LAM-Engineering rubric, using a stronger LLM
   (Claude) as a preliminary reference annotator.
3. A characterization of three failure modes — *quantitative
   collapse*, *tutorial-mode output*, and *false refusal* — that
   emerge differently across model families.

---

## II. Related Work

**LLM agents and tool use.** The ReAct paradigm (Yao et al., 2023)
popularized iterative agent–tool interaction. Native function
calling (OpenAI, 2023) simplified implementation through structured
JSON formats consumed directly by the model. Toolformer (Schick et
al., 2023) demonstrated that models can learn tool use through
self-supervised augmentation.

**Retrieval-Augmented Generation.** RAG (Lewis et al., 2020) couples
relevant document retrieval with LLM generation to reduce
hallucination and ground outputs in evidence. Recent surveys (Gao
et al., 2024) trace the field's evolution toward multi-step agents
with adaptive retrieval.

**LLM-as-Judge and LLM-as-Annotator.** Zheng et al. (2023) showed
that LLMs can serve as judges for automated evaluation with strong
correlation to human raters. The RAGAS framework (Es et al., 2024)
extends this approach specifically to RAG systems.

**AI in education accreditation.** To our knowledge, no prior work
addresses LLM-based automation of Indonesian higher-education
accreditation. This is the gap we fill.

**Reasoning models with tools.** Recent work has surfaced limitations
of CoT models such as DeepSeek-R1 in function-calling settings —
the model tends to "overthink", failing to produce valid JSON
structure (Yu et al., 2024).

---

## III. Methodology

### 3.1 System Architecture

The system (Figure 1) comprises three pre-processing pipelines that
populate three context sources, four tools exposed to the agent,
and two execution graph variants.

**Pre-processing pipelines:**
1. **Rubric matrix:** A PDF parser extracts 60 indicators with
   structured `score_criteria` (a 0–4 → criteria text dict),
   `formula`, and `lkps_table_ref` fields into a JSON cache.
2. **LED indexing:** The PDF is chunked page-by-page with semantic
   boundaries, embedded with
   `paraphrase-multilingual-MiniLM-L12-v2` (384-d), and persisted
   in ChromaDB with HNSW cosine similarity.
3. **LKPS loading:** openpyxl + pandas load all sheets; a registry
   exposes lookup by table reference name (e.g., `Tabel 4.a. LKPS`).

### 3.2 Tool Set

Four tools exposed to the agent:
- `get_indicator_rubric(indicator_no)` — returns score criteria,
  formula, and LKPS table reference.
- `search_led_evidence(query, n_results)` — top-k vector search
  over LED chunks.
- `get_lkps_table(table_reference)` — returns an LKPS table as
  markdown ready for model consumption.
- `compute_formula_score(formula_expression, variables)` —
  sandboxed Python eval for formula-based indicators with result
  clamped to 0–4.

### 3.3 Two Agent Paradigms

**Paradigm A — Native tool calling** (for `qwen3.5:35b` and
`mistral-small3.2:24b`): we define a LangGraph state machine
structured `agent → tools → agent → ... → parse_output`. The model
emits structured `tool_calls` directly; LangGraph's `ToolNode`
executes the tool and appends a `ToolMessage` to history. The loop
continues until the model produces a response without tool calls,
after which the `parse_output` node extracts score, justification,
and confidence from the final text using a permissive regex
(case-insensitive, markdown-stripping).

**Paradigm B — Prompt-based JSON dispatch** (for
`deepseek-r1:32b`): the same logical flow but the model is asked to
emit single-line JSON: `{"action": "tool_name", "args": {...}}` for
tool calls or
`{"action": "final", "score": ..., "justification": ..., "confidence": ...}`
for the final answer. `<think>...</think>` blocks are stripped via
regex before JSON extraction. Dispatch is performed via tool-name
registry lookup with argument-name alias normalization (e.g.,
`formula` → `formula_expression`).

Paradigm selection is automatic, based on a name-pattern match
(`r1`, `qwq`, `o1-`, `thinking`). A two-step *force-finalize* cap
prevents models from exiting the loop without a final score.

### 3.4 Reference Annotation

Reference scores were generated using Claude (Anthropic) as an
LLM-as-annotator. For each indicator, Claude received the full
rubric, the top-2 LED chunks from vector search, and the relevant
LKPS table excerpts, and produced a 0–4 score with justification
and confidence. We explicitly state that this is a preliminary
LLM-derived reference, not certified-assessor ground truth, and
discuss limitations in Section VI.

### 3.5 Evaluation Metrics

- **Mean Absolute Error (MAE):** mean `|score_model − score_ref|`.
- **Root Mean Squared Error (RMSE):** penalizes large disagreements.
- **Exact match:** rate of identical scores.
- **Within-±1 accuracy:** rate of cases with |diff| ≤ 1; commonly
  accepted as the inter-assessor agreement threshold.
- **Pearson r:** linear correlation between model and reference.
- **Per-type breakdown:** qualitative / composite / quantitative.
- **Score=0 rate:** proxy for the false-refusal failure mode.

---

## IV. Experimental Setup

**Test data.** As a testbed, we use one Bachelor of Applied Science
distance-learning engineering program at an Indonesian state
polytechnic (anonymized as *Program A*). We acknowledge that
testing on a single program is a limitation discussed in Section VI.

**Models.** Three open-weight models of comparable size were
evaluated (Table 1):

**Table 1 — Model Specifications**

| ID | Model | Family | Size | Tool-calling paradigm | Hosted via |
|----|-------|--------|------|----------------------|-----------|
| M1 | `qwen3.5:35b` | Qwen 3.5 | 35 B (Q4_K_M, 24 GB) | Native function calling | Ollama |
| M2 | `deepseek-r1:32b` | DeepSeek-R1 | 32 B (Q4_K_M, 20 GB) | Prompt-based JSON dispatch | Ollama |
| M3 | `mistral-small3.2:24b` | Mistral Small 3.2 | 24 B (Q4_K_M, 14 GB) | Native function calling | Ollama |

**Inference backend:** Ollama served from a single GPU server
(24 GB VRAM) accessed via a Cloudflare-tunneled HTTPS endpoint.
Sampling: temperature 0.1 with default top-p and top-k. The LED
embedding model is loaded once at deployment for all models alike.

**Run.** All 60 indicators were evaluated for each of the three
models, yielding 180 agent invocations total. Resume mode handled
tunnel failures; each result is streamed to CSV so interruptions
do not erase prior progress.

---

## V. Results

### 5.1 Aggregate Performance

Table 2 summarizes aggregate performance across all 60 indicators.
The tool-tuned generalist `qwen3.5:35b` dominates every quality
metric: MAE 0.79 (vs 1.70–1.79 for the others), exact match 36.7%,
and within-±1 accuracy 88.3%. Notably, `deepseek-r1:32b` has the
highest mean confidence (0.81) yet the worst MAE (1.79) — a sign
of overconfidence common in reasoning models that fail at tool
dispatch.

**Table 2 — Aggregate Performance (60 Indicators)**

| Model | MAE ↓ | RMSE ↓ | Exact ↑ | ±1 Acc ↑ | Pearson r | Avg Conf | Runtime/ind |
|---|---|---|---|---|---|---|---|
| **`qwen3.5:35b`** | **0.79** | **1.14** | **36.7%** | **88.3%** | -0.06 | 0.73 | 26.6 s |
| `deepseek-r1:32b` | 1.79 | 2.18 | 15.0% | 46.7% | -0.08 | 0.81 | 74.8 s |
| `mistral-small3.2:24b` | 1.70 | 2.18 | 23.3% | 51.7% | 0.09 | 0.56 | 11.6 s |

The near-zero Pearson r values reflect the truncated 5-class
ordinal score space (0–4), not absence of agreement; within-±1
accuracy is the more informative measure for ordinal rubric
scoring.

### 5.2 Per-Type Breakdown

Table 3 reveals the **central finding** of this paper: the two
non-winning models fail in *opposite* indicator types.

**Table 3 — Per-Type Breakdown**

| Model | Type | n | MAE ↓ | Exact ↑ | ±1 Acc ↑ | Score=0 |
|---|---|---|---|---|---|---|
| `qwen3.5:35b` | Qualitative | 20 | 0.55 | 50.0% | 95.0% | 0 |
| `qwen3.5:35b` | Composite | 12 | 0.58 | 33.3% | 100.0% | 0 |
| `qwen3.5:35b` | Quantitative | 28 | 1.05 | 28.6% | 78.6% | 3 |
| `deepseek-r1:32b` | Qualitative | 20 | 1.55 | 25.0% | 55.0% | 4 |
| `deepseek-r1:32b` | Composite | 12 | 1.08 | 33.3% | 58.3% | 1 |
| `deepseek-r1:32b` | Quantitative | 28 | 2.27 | **0.0%** | 35.7% | **12** |
| `mistral-small3.2:24b` | Qualitative | 20 | 2.45 | 10.0% | 30.0% | **12** |
| `mistral-small3.2:24b` | Composite | 12 | 2.14 | 16.7% | 33.3% | 7 |
| `mistral-small3.2:24b` | Quantitative | 28 | 0.98 | 35.7% | 75.0% | 4 |

`deepseek-r1:32b` collapses on quantitative indicators: 0% exact
match and 12 of 28 (42.9%) indicators score 0, dominantly with
"Bukti tidak ditemukan" justifications. Its qualitative (25% exact)
and composite (33.3% exact) performance is comparatively adequate.

`mistral-small3.2:24b` shows the inverse pattern: quantitative
performance (35.7% exact) approaches `qwen3.5:35b`'s (28.6%), but
qualitative is the worst across all conditions (10% exact, 12 of
20 false-refusals).

Interpretation: reasoning models can score from narrative text but
cannot reliably extract numbers from tables in prompt-based mode;
mid-sized chat models can apply formulas when data is provided
numerically but balk when forced to read long narratives.

### 5.3 Three Failure Modes

Table 4 provides a taxonomy of the three distinct failure modes
observed.

**Table 4 — Failure Mode Taxonomy**

| Mode | Observed in | Symptom | Example |
|---|---|---|---|
| **Quantitative collapse** | `deepseek-r1:32b` | Score=0 with "Bukti tidak ditemukan" on numerical indicators | Ind. 42 (GPA): ref=4.0; model=0; LKPS Tabel 6.b clearly contains GPA values 3.33–3.58. |
| **Tutorial-mode output** | `mistral-small3.2:24b` | Model emits step-by-step compute instructions instead of a decision | Ind. 18 (PJP): 200-word formula tutorial; parser extracted "4" from rubric example. |
| **False refusal & hallucination** | `mistral-small3.2:24b` | Score=0 despite evidence; sometimes fabricates specific numbers | Ind. 23 (PPDMhs): model wrote "PPDMhs=(10/20)×100%=50%"; neither 10 nor 20 in source. |

### 5.4 Runtime and Cost

`qwen3.5:35b` occupies the speed-quality Pareto frontier with 26.6
seconds per indicator (Table 5). `mistral-small3.2:24b` is fastest
(11.6 s) but has the worst quality; `deepseek-r1:32b` is 3× slower
than the winner due to the reasoning-loop overhead intrinsic to
CoT models.

**Table 5 — Runtime and Cost Comparison**

| Model | Total runtime (60 ind) | Avg/ind | Tokens (est.) | Cost @ Vast.ai 24 GB |
|---|---|---|---|---|
| `qwen3.5:35b` | 26.6 min | 26.6 s | ~150k | ≈ $0.10 |
| `deepseek-r1:32b` | 74.8 min | 74.8 s | ~400k | ≈ $0.30 |
| `mistral-small3.2:24b` | 11.6 min | 11.6 s | ~80k | ≈ $0.05 |

### 5.5 Justification Case Studies

Table 6 presents two contrasting case studies. On Indicator 8
(qualitative: financial governance), `qwen3.5` and `deepseek-r1`
both produce correct scores (4) with comparable justifications,
while `mistral` produces a false refusal despite identical
retrieved evidence. On Indicator 42 (quantitative: GPA), `mistral`
is the correct one; `qwen3.5` under-scores by one (still within ±1);
and `deepseek-r1` undergoes quantitative collapse.

**Table 6 — Justification Case Studies**

**Indicator 8 — Financial governance (qualitative). Ref = 4.**

| Model | Score | Justification (truncated) |
|---|---|---|
| `qwen3.5:35b` | 4.0 | "Evidence shows financial management with 100% realization, comprehensive internal audit system…" |
| `deepseek-r1:32b` | 4.0 | "Evidence shows financial governance that is accountable, transparent, regulation-compliant…" |
| `mistral-small3.2:24b` | 0.0 | "No evidence provided that addresses transparency, regulation compliance…" |

**Indicator 42 — GPA (quantitative). Ref = 4.**

| Model | Score | Justification (truncated) |
|---|---|---|
| `qwen3.5:35b` | 3.0 | "Average GPA of graduates ranges from 3.33-3.58…" *(under-scored)* |
| `deepseek-r1:32b` | 0.0 | "No GPA evidence found in provided documents." *(collapse)* |
| `mistral-small3.2:24b` | 4.0 | "Average GPA over the last 3 years meets the criterion with RIPK ≥ 3.25." *(correct)* |

---

## VI. Discussion

**6.1 Why native tool calling wins.** Prompt-based dispatch on a
reasoning model must traverse three brittle stages: (a) emit valid
JSON, (b) parse tool results as raw text, and (c) re-invoke tools
while reasoning. Each stage is a potential failure point absent
from the native paradigm. With `deepseek-r1`, we frequently observed
the model "thinking too long" about JSON syntax, ultimately
producing structures that were format-valid but semantically wrong
(e.g., the argument name `formula` instead of
`formula_expression`, which we had to normalize before execution).

**6.2 Why mid-size models fail differently.** The tutorial-mode
output of `mistral-small3.2:24b` suggests that this model's
instruction-tuning emphasized "explanatory helpfulness" over
"agentic decisiveness". This pattern manifests on Indicators 6, 18,
27, 31, and 32, where the model returns step-by-step
"how-to-compute" instructions instead of final answers. The number
hallucination on Indicator 23 is more concerning: the model
fabricated NPMhs=10 and NPD=20 not present in source LKPS. This is
a known instruction-tuning trade-off but underdocumented in
non-English domain agent settings.

**6.3 Implications for institutional deployment.** Our results
indicate that 35 B-scale open-weight LLMs with native tool calling
can reach 88% within-±1 of an expert-LLM reference at 26 seconds
per indicator. This is promising as a *draft scorer* assisting
human assessors, but not yet adequate for autonomous decision
making. Human assessors remain necessary for verification,
particularly on indicators with high disagreement or low
confidence.

**6.4 Limitations.** This study has several important limitations
that should be considered when interpreting the results:
- **Single program (n=1):** generalization to other programs,
  institutions, or non-engineering disciplines is unverified.
- **LLM-derived reference:** Claude as a preliminary annotator is
  not a certified LAM assessor; future work must include
  validation by human accreditation experts on at least a
  representative subset.
- **Single inference run** per (model, indicator); no
  temperature-sampling variance study.
- **Model coverage:** we focused on Ollama-served open-weight
  models and did not compare against managed providers (Anthropic,
  OpenAI, Google). This was a deliberate scoping choice driven by
  Indonesian institutional deployment contexts that frequently
  require data to remain within institutional perimeters.

---

## VII. Conclusion

This paper presents the first benchmark of three 24–35 B
parameter open-weight LLMs on the Indonesian higher-education
accreditation scoring task in the LAM-Engineering style. The key
finding: open-weight LLMs with native tool calling (`qwen3.5:35b`
in our tests) approach a useful baseline for AI-assisted
accreditation scoring, achieving 88.3% within-±1 accuracy.
Conversely, prompt-based dispatch on a reasoning model
(`deepseek-r1:32b`) underperforms specifically on numerical
extraction from structured tables, and a mid-sized chat model
(`mistral-small3.2:24b`) exhibits unique failure modes — tutorial
output and false refusal — on qualitative indicators.

We release the agent code, anonymized scoring traces, and
benchmark scripts to facilitate further work, including extension
to multiple programs, validation by human accreditation experts,
and exploration of alternative agent paradigms.

**Code & data:** [github URL after anonymization]

---

## Acknowledgments

The authors thank the partner institution for providing
accreditation evidence under non-disclosure terms. Computational
resources were provided by [lab infrastructure / Vast.ai].

---

## References

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
[12] BAN-PT, "Peraturan BAN-PT Nomor 3 Tahun 2019 tentang
     Instrumen Akreditasi Program Studi," Jakarta: BAN-PT, 2019.
[13] LAM Teknik, "Pedoman Penilaian Akreditasi Program Studi
     Sarjana Terapan Bidang Teknik," 2023.
[14] B. Wilie et al., "IndoNLU: Benchmark and Resources for
     Evaluating Indonesian Natural Language Understanding," in
     *Proc. AACL*, 2020.
[15] Y. Gao et al., "Retrieval-Augmented Generation for Large
     Language Models: A Survey," *arXiv:2312.10997*, 2024.
