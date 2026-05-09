# Paper Outline & Abstract

**Working title:**
> "Native vs Prompt-Based Tool Calling: A Comparative Study of Open-Weight LLM Agents for Higher Education Quality Audit"

**Target venue:** arXiv preprint + Indonesian conference proceedings (ICITISEE / SENTIKA / SNATIA) or Sinta 2-3 journal.

**Page budget:** 6 pages IMRaD (≈4500 words excl. references).

---

## Abstract (≈220 words)

Internal Quality Audits (Audit Mutu Internal, AMI) for higher education
accreditation in Indonesia involve manually scoring dozens of indicators
against a complex rubric using two heterogeneous evidence sources: the
qualitative Self-Evaluation Report (LED) and the quantitative Performance
Report (LKPS). This paper investigates whether open-weight Large Language
Model (LLM) agents can automate this multi-modal scoring task, and how
the choice of agent paradigm — native function calling versus
prompt-based JSON dispatch — affects performance across qualitative and
quantitative indicator types.

We implement a Retrieval-Augmented Generation (RAG) agent that
cross-references vector-indexed LED chunks with structured LKPS tables
through four specialized tools, and benchmark three open-weight models
of comparable size (24–35 B parameters): a tool-tuned generalist
(`qwen3.5:35b`), a reasoning-focused model in prompt-based mode
(`deepseek-r1:32b`), and a mid-sized chat model (`mistral-small3.2:24b`),
against an LLM-derived reference produced by Claude on the full 60-indicator
LAM-Engineering rubric.

The tool-tuned generalist achieved 88.3% within-±1 accuracy and 36.7% exact
match (MAE 0.79), substantially outperforming both the reasoning model
(46.7%, MAE 1.79) and the mid-sized chat model (51.7%, MAE 1.70). We
identify three distinct failure modes — quantitative extraction collapse,
tutorial-mode output, and false refusal — and discuss implications for
deploying open-weight agents in standards-compliant academic evaluation.

**Keywords:** large language models, retrieval-augmented generation,
tool calling, automated assessment, quality audit, low-resource
Indonesian text, open-weight models.

---

## I. Introduction (≈0.8 page)

**Paragraph 1 — Problem motivation**
- Indonesian higher education accreditation (LAM Teknik) is rubric-based with 60+ indicators per program.
- Each indicator scored 0–4 by trained assessors who manually cross-reference two distinct documents:
  - LED: a 150–200 page narrative PDF (qualitative)
  - LKPS: a 50-sheet Excel workbook (quantitative)
- Process is labor-intensive, slow, and inconsistency-prone across assessors.

**Paragraph 2 — Why LLMs are interesting here**
- Recent advances in tool-calling LLMs and RAG enable agents that can
  reason over structured + unstructured documents.
- Open-weight LLMs (qwen, llama, deepseek, mistral) at 20–35 B scale are
  now plausibly capable of tool-augmented reasoning at modest cost.
- However, no public benchmark exists for the LAM-style cross-modal
  scoring task in Bahasa Indonesia.

**Paragraph 3 — Two dispatch paradigms**
- Models with native tool support (qwen, mistral) emit structured
  `tool_calls` consumed by an executor.
- Reasoning models (deepseek-r1, qwq, o1) emit `<think>...</think>`
  chain-of-thought and don't natively support function calling on Ollama;
  they require a prompt-based JSON dispatch wrapper.
- Whether prompt-based dispatch matches native tool calling on
  document-grounded scoring is open.

**Paragraph 4 — Our contributions**
1. An open-source cross-modal RAG agent for AMI scoring that fuses
   LED vector retrieval with LKPS table lookup via four specialized tools.
2. The first benchmark of three open-weight LLMs (qwen3.5:35b,
   deepseek-r1:32b, mistral-small3.2:24b) on the full 60-indicator
   LAM-Engineering rubric, with a stronger LLM (Claude) as preliminary
   reference annotator.
3. A characterization of three failure modes — quantitative collapse,
   tutorial output, false refusal — that emerge differently across
   model families.

---

## II. Related Work (≈0.5 page)

- LLM agents and tool use: ReAct (Yao 2023), function calling (OpenAI 2023).
- RAG: Lewis 2020, recent surveys.
- LLM-as-judge / LLM-as-annotator: Zheng 2023, RAGAS.
- AI in education accreditation: brief — note absence of work in
  Indonesian higher ed context (the gap we fill).
- Reasoning models with tool use: limitations of CoT models in
  function-calling settings.

*(Keep tight — 4–5 short paragraphs, ~10 references)*

---

## III. Method (≈1.5 pages)

### 3.1 System Architecture

Diagram (Figure 1) — see `02_figures.md`.

Three pre-processing pipelines:
1. **Rubric matrix:** PDF parser extracts 60 indicators with structured
   `score_criteria` (dict mapping 0–4 → criteria text), `formula`,
   and `lkps_table_ref`.
2. **LED indexing:** PDF chunked (page-aware, semantic), embedded
   with `paraphrase-multilingual-MiniLM-L12-v2` (384-d), persisted in
   ChromaDB with HNSW cosine.
3. **LKPS loading:** openpyxl + pandas; sheet registry indexed by
   `Tabel X.y. LKPS` reference name.

### 3.2 Tool Set

Four tools exposed to the agent:
- `get_indicator_rubric(indicator_no)` — returns score criteria + formula
- `search_led_evidence(query, n_results)` — vector search over LED chunks
- `get_lkps_table(table_reference)` — returns table as markdown
- `compute_formula_score(formula_expression, variables)` — sandboxed eval

### 3.3 Dual Agent Paradigms

**Paradigm A — Native tool calling** (qwen3.5, mistral):
- LangGraph state machine: `agent → tools → agent → ... → parse_output`
- Model emits `tool_calls` directly; ToolNode executes and appends `ToolMessage`.

**Paradigm B — Prompt-based JSON dispatch** (deepseek-r1):
- Same logical flow but model outputs `{"action": ..., "args": ...}` JSON.
- `<think>...</think>` blocks stripped before JSON extraction.
- Tool dispatch via name → registry lookup with arg-name normalization.

Auto-detection by model name pattern (Section 3.4 in detail).

### 3.4 Reference Annotation

Reference scores generated by Claude using rubric + retrieved LED
chunks (top-2 per indicator) + relevant LKPS table excerpts.
We disclose this is an LLM-derived preliminary reference, not a
certified-assessor ground truth, and discuss in Section VI.

### 3.5 Evaluation Metrics

- **Mean Absolute Error (MAE):** average |model_score − ref_score|
- **RMSE:** penalizes large disagreements
- **Exact match:** rate of identical scores
- **Within ±1 accuracy:** rate of |diff| ≤ 1 (assessor agreement threshold)
- **Pearson r:** linear correlation
- **Per-type breakdown:** qualitative / composite / quantitative
- **Zero-score rate:** proxy for false-refusal failure mode

---

## IV. Experimental Setup (≈0.5 page)

- **Test program:** an Indonesian distance-learning engineering bachelor
  program at a state polytechnic (anonymized as Program A); single program
  acknowledged as a limitation.
- **Models:** see Table 1 (`02_figures.md`)
- **Inference backend:** Ollama via Cloudflare-tunneled GPU server
  (24 GB VRAM); temperature 0.1, default sampling.
- **Hardware:** [fill in actual GPU model from Vast.ai].
- **Run:** all 60 indicators × 3 models = 180 invocations; resume mode.

---

## V. Results (≈1.5 pages) — see `03_tables.md` and `02_figures.md`

### 5.1 Aggregate Performance (Table 2)

qwen3.5:35b dominates across MAE, exact match, and ±1 accuracy.
deepseek-r1 has highest avg confidence (0.81) but worst MAE (1.79) —
overconfident wrong answers.

### 5.2 Per-Type Breakdown (Table 3 + Figure 2)

**Striking finding:** the two non-winning models fail in *opposite*
indicator types:
- **deepseek-r1:32b** collapses on quantitative (0% exact, 12/28 zeros) but is decent on qualitative (25% exact)
- **mistral-small3.2:24b** fails on qualitative (10% exact, 12/20 zeros) but matches qwen on quantitative (35.7% exact)
- Interpretation: reasoning models can score from text but can't reliably extract numbers from tables in prompt-based mode; mid-sized chat models can apply formulas when data is given but refuse when forced to read narrative

### 5.3 Three Failure Modes (Table 4)

1. **Quantitative collapse** (deepseek-r1): 12 of 28 quantitative indicators score 0 with "Bukti tidak ditemukan" — model couldn't extract numbers from LKPS markdown via JSON dispatch
2. **Tutorial-mode output** (mistral): model emits step-by-step "how to compute" instructions instead of decisions; parser sometimes lifts numbers out of these tutorials inflating false matches
3. **False refusal / hallucination** (mistral): score=0 with "Tidak ada informasi" despite evidence existing in retrieved chunks; in 3 cases, model fabricated specific numbers (e.g., "PPDMhs = (10/20) × 100% = 50%") not present in source

### 5.4 Runtime and Cost (Table 5)

- qwen3.5:35b: 26.6s/indikator (best speed/accuracy trade-off)
- mistral: 11.6s (fastest, but worst quality)
- deepseek-r1: 74.8s (3× slower, reasoning loop overhead)

---

## VI. Discussion (≈0.7 page)

**6.1 Why native tool calling wins.** The reasoning model's
prompt-based dispatch must (a) emit valid JSON, (b) parse tool results
as text, and (c) re-invoke tools while reasoning — multi-stage failure
points absent in native paradigm.

**6.2 Why mid-size models fail differently.** Mistral's tutorial output
suggests instruction-tuning emphasized "explanatory helpfulness" over
"agentic decisiveness". This is a known instruction-tuning trade-off but
underdocumented in non-English domain agent settings.

**6.3 Implications for institutional deployment.** Open-weight LLMs at
35 B scale with native tool support reach 88% within-±1 of expert-LLM
reference at 26s per indicator — promising as a draft scorer for human
review, not as autonomous decision-maker.

**6.4 Limitations.**
- Single program (n=1); generalization unverified
- LLM-as-annotator reference; future work: human expert validation
- Single inference run per (model, indicator); no temperature variance study
- Tool-calling models tested only on Ollama; managed providers
  (Anthropic / OpenAI / Google) excluded by design (open-weight focus)

---

## VII. Conclusion (≈0.3 page)

Native tool-calling 35 B-scale open-weight LLMs (qwen3.5:35b in our
tests) approach a useful baseline for AI-assisted Indonesian higher
education accreditation. Prompt-based dispatch over reasoning models
underperforms specifically on numerical extraction. We release the
agent code, anonymized scoring traces, and benchmark scripts to
facilitate further work.

**Code & data:** [github URL after anonymization]

---

## Acknowledgments

We thank the partner institution for providing accreditation evidence
under non-disclosure terms. Computational resources via [Vast.ai / lab
infrastructure].

---

## References (target ~15)

Place-holder list:
1. Yao et al. ReAct (2023)
2. Lewis et al. RAG (2020)
3. Zheng et al. LLM-as-Judge (2023)
4. RAGAS Es et al. (2024)
5. Schick et al. Toolformer (2023)
6. Qwen2.5 / Qwen3 technical report
7. DeepSeek-R1 technical report
8. Mistral Small 3 technical report
9. Sentence-BERT multilingual (Reimers 2020)
10. ChromaDB / vector database
11. LangGraph paper / docs
12. BAN-PT / LAM-Teknik regulation
13. PERMENRISTEKDIKTI accreditation guidelines
14. Indonesian NLP benchmark (IndoNLU / IndoLEM)
15. Bommasani et al. foundation models report
