# A Comparative Study of Open-Weight LLM Agents for Scoring Process and Curriculum Indicators in LAM-Engineering Quality Audits

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
the cross-modal scoring task on a focused subset of seven process
and curriculum indicators (CPL alignment, Lesson Plans, Learning
Process, Research/PkM Integration, Capstone Design, Research, and
PkM), and how the choice of agent paradigm — native function
calling versus prompt-based JSON dispatch — affects performance on
qualitative and composite indicator types.

We implement a Retrieval-Augmented Generation (RAG) agent that
cross-references vector-indexed LED chunks with structured LKPS
tables through four specialized tools, and benchmark three
open-weight models of comparable size (24–35 B parameters): a
tool-tuned generalist (`qwen3.5:35b`), a reasoning-focused model in
prompt-based mode (`deepseek-r1:32b`), and a mid-sized chat model
(`mistral-small3.2:24b`), against an LLM-derived reference produced
by Claude on the seven selected indicators.

The results reveal an interesting trade-off: `deepseek-r1:32b`
leads in exact match (57.1%, MAE 0.71) thanks to perfect performance
on composite indicators (100% exact); conversely, `qwen3.5:35b`
dominates reliability with 100% within-±1 accuracy (MAE 0.57) and
zero false refusals. The mid-sized chat model `mistral-small3.2:24b`
performs poorly (MAE 1.81; exact 14.3%) with 4 of 7 outputs being
false refusals. We discuss implications for model selection in
AI-assisted draft scorer deployments.

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

We focus this study on **seven process and curriculum indicators**
— Indicator 14 (CPL alignment and review), 15 (Lesson Plan / RPS),
16 (Learning Process), 17 (Research and Community Service
integration), 20 (Capstone Design), 22 (Research), and 24
(Community Service / PkM). This subset was chosen for two reasons:
*first*, these indicators most frequently constitute the audit
bottleneck and consume the most assessor time; *second*, the
subset provides balanced coverage between purely qualitative
indicators (text judgment) and composite ones (sub-scores +
weighted formula), without any pure-quantitative indicators that
require complex number extraction from LKPS tables.

We observe that LLM agents can be implemented under two distinct
tool-dispatch paradigms. Models with native tool support, such as
Qwen and Mistral, emit structured `tool_calls` consumed directly by
an executor. Reasoning models such as DeepSeek-R1, in contrast,
emit `<think>...</think>` chain-of-thought blocks and do not
natively support function calling on Ollama; they require a
prompt-based JSON dispatch wrapper. The open question is: *does
prompt-based dispatch match native tool calling on document-grounded
scoring in this domain, and which model is best suited for
indicators dominated by qualitative/composite judgments?*

The contributions of this paper are:
1. An open-source cross-modal RAG agent for AMI scoring that fuses
   LED vector retrieval with LKPS table lookup via four specialized
   tools.
2. A focused benchmark of three open-weight LLMs (`qwen3.5:35b`,
   `deepseek-r1:32b`, `mistral-small3.2:24b`) on 7 process and
   curriculum indicators of the LAM-Engineering rubric, using a
   stronger LLM (Claude) as a preliminary reference annotator.
3. A characterization of the *exact-match vs reliability* trade-off
   between models, and identification of the *false refusal*
   failure mode in mid-sized chat models.

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

### 3.4 Indicator Subset Selection

From 60 total indicators in the LAM-Engineering rubric, we selected
7 core indicators related to **process and curriculum**:

| No | Indicator | Type |
|----|-----------|------|
| 14 | CPL alignment and review | Composite |
| 15 | Lesson Plans (RPS) | Composite |
| 16 | Learning Process | Composite |
| 17 | Research and PkM integration in learning | Qualitative |
| 20 | Capstone Design | Qualitative |
| 22 | Research | Qualitative |
| 24 | Community Service (PkM) | Qualitative |

The subset comprises 3 composite and 4 qualitative indicators
(without pure-quantitative indicators), providing balanced
coverage between text judgment and judgment + weighted formula
combinations.

### 3.5 Reference Annotation

Reference scores were generated using Claude (Anthropic) as an
LLM-as-annotator. For each indicator, Claude received the full
rubric, the top-2 LED chunks from vector search, and the relevant
LKPS table excerpts, and produced a 0–4 score with justification
and confidence. We explicitly state that this is a preliminary
LLM-derived reference, not certified-assessor ground truth, and
discuss limitations in Section VI.

### 3.6 Evaluation Metrics

- **Mean Absolute Error (MAE):** mean `|score_model − score_ref|`.
- **Root Mean Squared Error (RMSE):** penalizes large disagreements.
- **Exact match:** rate of identical scores.
- **Within-±1 accuracy:** rate of cases with |diff| ≤ 1; commonly
  accepted as the inter-assessor agreement threshold.
- **Pearson r:** linear correlation between model and reference.
- **Per-type breakdown:** qualitative vs composite.
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

**Run.** All 7 indicators were evaluated for each of the three
models, yielding 21 agent invocations total. Resume mode handled
tunnel failures; each result is streamed to CSV so interruptions
do not erase prior progress.

---

## V. Results

### 5.1 Aggregate Performance

Table 2 summarizes aggregate performance across the 7 process and
curriculum indicators. Two findings stand out: (1)
`deepseek-r1:32b` leads in exact match (57.1%) and competitive MAE
(0.71); (2) `qwen3.5:35b` dominates reliability with perfect 100%
within-±1 accuracy and the best MAE (0.57), although its exact
match is lower (42.9%).

**Table 2 — Aggregate Performance (7 Indicators)**

| Model | MAE ↓ | RMSE ↓ | Exact ↑ | ±1 Acc ↑ | Pearson r | Avg Conf | Runtime/ind |
|---|---|---|---|---|---|---|---|
| **`qwen3.5:35b`** | **0.57** | **0.76** | 42.9% | **100.0%** | 0.35 | 0.78 | 30.2 s |
| `deepseek-r1:32b` | 0.71 | 1.25 | **57.1%** | 85.7% | **0.41** | 0.74 | 68.2 s |
| `mistral-small3.2:24b` | 1.81 | 2.15 | 14.3% | 42.9% | 0.34 | 0.88 | 14.1 s |

`mistral-small3.2:24b` performs far below the other two models with
MAE 1.81 and within-±1 accuracy of only 42.9% (3 of 7 indicators).
Notably, this model has the highest mean confidence (0.88) — an
overconfidence pattern that also surfaces in its false-refusal
behavior.

### 5.2 Per-Type Breakdown

Table 3 reveals the **central finding** of this paper: the models
exhibit very different performance profiles on composite versus
purely qualitative indicators.

**Table 3 — Per-Type Breakdown**

| Model | Type | n | MAE ↓ | Exact ↑ | ±1 Acc ↑ | Score=0 |
|---|---|---|---|---|---|---|
| `qwen3.5:35b` | Qualitative | 4 | 0.75 | 25.0% | **100.0%** | 0 |
| `qwen3.5:35b` | Composite | 3 | 0.33 | 66.7% | **100.0%** | 0 |
| `deepseek-r1:32b` | Qualitative | 4 | 1.25 | 25.0% | 75.0% | 1 |
| `deepseek-r1:32b` | Composite | 3 | **0.00** | **100.0%** | **100.0%** | 0 |
| `mistral-small3.2:24b` | Qualitative | 4 | 2.45 | 0.0% | 25.0% | **3** |
| `mistral-small3.2:24b` | Composite | 3 | 1.22 | 33.3% | 66.7% | 1 |

**`deepseek-r1:32b`** achieves perfect performance on composite
indicators: 100% exact match across all three indicators (14, 15,
16) with MAE 0.00. On purely qualitative indicators, performance
drops significantly to MAE 1.25 with one false-refusal case
(Indicator 20: Capstone Design scored 0 although the LED clearly
mentions implementation).

**`qwen3.5:35b`** shows the most consistent profile: 100%
within-±1 accuracy on both types, with no false refusals. While
its exact match is not as high as DeepSeek-R1's on composites
(`qwen` 66.7% vs `deepseek` 100.0%), `qwen` never deviates from
the reference by more than one point.

**`mistral-small3.2:24b`** fails on the qualitative category: 0%
exact and 3 of 4 indicators become false refusals (score 0 with
"No information provided" despite retrieved LED chunks).

Interpretation: composite indicators (which require two sub-scores
+ a simple formula) suit a reasoning model that can follow a
structured chain-of-thought; conversely, purely qualitative
indicators favor models with strong instruction-following and
*agentic decisiveness* — the domain in which `qwen3.5:35b`
excels because it never refuses to score.

### 5.3 Per-Indicator Case Studies

Table 4 shows model scores versus reference for all 7 indicators.
Markers (✓ = exact, ~ = within-±1, ✗ = off > 1) provide a quick
disagreement profile visualization.

**Table 4 — Per-Indicator Scores**

| No | Type | Ref | `deepseek-r1:32b` | `mistral-small3.2:24b` | `qwen3.5:35b` |
|----|------|-----|-------------------|------------------------|----------------|
| 14 | Composite | 3.0 | 3.0 ✓ | 3.0 ✓ | 3.0 ✓ |
| 15 | Composite | 3.0 | 3.0 ✓ | 2.3 ~ | 3.0 ✓ |
| 16 | Composite | 3.0 | 3.0 ✓ | 0.0 ✗ | 4.0 ~ |
| 17 | Qualitative | 2.0 | 1.0 ~ | 0.0 ✗ | 3.0 ~ |
| 20 | Qualitative | 3.0 | 0.0 ✗ | 0.0 ✗ | 3.0 ✓ |
| 22 | Qualitative | 3.0 | 2.0 ~ | 0.0 ✗ | 4.0 ~ |
| 24 | Qualitative | 3.0 | 3.0 ✓ | 4.0 ~ | 4.0 ~ |

**Indicator 14** (CPL alignment and review): All three models agree
with the reference (3.0). This shows that indicators with very
explicit rubrics and evidence can be scored consistently across
model families.

**Indicator 16** (Learning Process): `qwen` (4.0) over-scores by
one point, while `mistral` (0.0) suffers a false refusal despite
available evidence. `deepseek` is most accurate (3.0).

**Indicator 20** (Capstone Design): The most interesting case —
**both `deepseek` and `mistral` suffer false refusals** (score 0),
even though LED p.77 explicitly mentions Capstone implementation
via the PENS Capstone Project Guide. Only `qwen` provides a correct
score (3.0) with appropriate justification.

### 5.4 Failure Mode: False Refusal

In this 7-indicator subset, the dominant *failure mode* is
***false refusal*** — models give a score of 0 with justifications
like "No evidence" or "Evidence not found" despite evidence being
available in the retrieved LED chunks shown to the model.

**Table 5 — False Refusal per Model**

| Model | Total score=0 | False-refused indicators |
|---|---|---|
| `qwen3.5:35b` | **0** | (none) |
| `deepseek-r1:32b` | 1 | 20 (Capstone) |
| `mistral-small3.2:24b` | 4 | 16, 17, 20, 22 |

**`qwen3.5:35b`** demonstrates perfect reliability — never refuses
to score. This is consistent with Qwen's training on agentic tasks
that emphasize *decisiveness*.

**`deepseek-r1:32b`** suffers a false refusal only on Indicator 20.
Inspection of the chain-of-thought (`<think>...</think>` block)
shows that the model reads the relevant LED chunks but concludes
"evidence is too generic to verify all four aspects" — an
*over-cautious refusal*.

**`mistral-small3.2:24b`** shows severe false refusal on 4 of 7
indicators. The recurring justification pattern "No information
provided to evaluate this criterion" appears repeatedly even
though LED chunks and LKPS tables are available in context. This
pattern suggests that `mistral-small3.2:24b`'s instruction-tuning
emphasizes *"explanatory caution"* over *"agentic decisiveness"*.

### 5.5 Runtime and Cost

`mistral-small3.2:24b` is fastest (14.1 seconds per indicator) but
has the worst quality; `deepseek-r1:32b` is slowest (68.2 seconds)
due to the reasoning-loop overhead intrinsic to CoT models
(Table 6). `qwen3.5:35b` occupies the speed-quality Pareto
frontier with 30.2 seconds per indicator.

**Table 6 — Runtime and Cost Comparison**

| Model | Total runtime (7 ind) | Avg/ind | Tokens (est.) | Cost @ Vast.ai 24 GB |
|---|---|---|---|---|
| `qwen3.5:35b` | 3.5 min | 30.2 s | ~17k | < $0.05 |
| `deepseek-r1:32b` | 8.0 min | 68.2 s | ~45k | < $0.05 |
| `mistral-small3.2:24b` | 1.6 min | 14.1 s | ~8k | < $0.01 |

---

## VI. Discussion

**6.1 Trade-off between exact match and reliability.** Our results
show that model selection for automated accreditation scoring is
not a one-dimensional decision. `deepseek-r1:32b` achieves the
highest exact match (57.1%) but with one large off-error case
(Indicator 20: score 0 vs ref 3). Conversely `qwen3.5:35b` achieves
"only" 42.9% exact match, but **never** deviates from the reference
by more than one point. For deployment as a draft scorer to be
verified by human assessors, `qwen`'s reliability is more valuable
than `deepseek`'s exact match: assessors only need to fine-tune by
±1 instead of redoing the scoring from scratch.

**6.2 Why reasoning models excel on composites.** On composite
indicators (formula `Score = (I + II) / 2` or similar),
`deepseek-r1:32b` achieves 100% exact match. Our hypothesis: the
composite structure naturally fits DeepSeek's chain-of-thought —
the model can separately evaluate sub-score I, evaluate sub-score
II, then apply the formula as a final reasoning step. These stages
are explicit in the inspectable `<think>` block and rarely fail.
Conversely, purely qualitative indicators require a "one-shot"
score that depends on holistic judgment — an area where reasoning
models are actually less adept than models with dedicated
tool-tuning.

**6.3 False refusal as the dominant failure mode.** In this subset,
*quantitative collapse* (which we identify as a failure mode in our
broader 60-indicator study) is not observed because no
pure-quantitative indicators are in the subset. However, *false
refusal* — the model declining to score despite evidence —
becomes the dominant failure mode, especially for
`mistral-small3.2:24b` (4 of 7). The recurring justification
pattern ("No information provided") suggests that this model's
instruction-tuning tends toward *over-cautiousness*. This is a
common instruction-tuning trade-off: models trained to "acknowledge
uncertainty" can consistently refuse to answer in settings with
ambiguous evidence or imperfect retrieval.

**6.4 Implications for institutional deployment.** Results on this
7-indicator subset provide concrete recommendations for higher
education institutions wishing to leverage LLM agents for internal
quality audits:
- For a **reliable draft scorer**: choose `qwen3.5:35b` (or
  similar generalist with native tool-tuning). 100% within-±1
  means human assessors only need a single-point fine-tuning.
- For indicators **dominated by composite structure**:
  `deepseek-r1:32b` can be more accurate *if* the analyzed
  indicators fall within its strong zone, though the risk of
  off-error on complex qualitative cases must still be flagged.
- **Avoid** `mistral-small3.2:24b` for qualitative-dominant
  indicators — the 75% false-refusal rate in this category will
  require extensive manual correction.

**6.5 Limitations.** This study has several important limitations
that should be considered when interpreting the results:
- **Limited subset (n=7):** we focus on process and curriculum
  indicators; generalization to other indicators (especially
  pure-quantitative ones with LKPS extraction) is not verified
  in this paper.
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

This paper presents a focused benchmark of three 24–35 B
parameter open-weight LLMs on 7 process and curriculum indicators
of the LAM-Engineering rubric. Key findings:
- `deepseek-r1:32b` (a reasoning model with prompt-based dispatch)
  achieves the highest exact match of 57.1% (MAE 0.71), thanks to
  perfect 100% performance on composite indicators.
- `qwen3.5:35b` (a generalist with native tool-tuning) excels in
  reliability with perfect 100% within-±1 accuracy (MAE 0.57) and
  no false refusals.
- `mistral-small3.2:24b` performs poorly on this subset (MAE 1.81;
  exact 14.3%) with 4 of 7 outputs being false refusals,
  particularly on qualitative indicators.

For practical deployment as a draft scorer to be verified by human
assessors, we recommend `qwen3.5:35b` for its consistent
reliability. For batches of indicators dominated by composite
structure, `deepseek-r1:32b` can be a promising alternative, with
caution regarding occasional false-refusal cases.

We release the agent code, anonymized scoring traces, and benchmark
scripts to facilitate further work, including extension to all 60
indicators, validation by human accreditation experts, and
comparison with managed models such as GPT, Claude, and Gemini.

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
