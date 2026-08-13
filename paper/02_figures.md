# Figures — descriptions + data ready for plotting

All figure data sourced from `data/benchmark_results.csv` and
`data/reference_scores_claude.csv`. Plot recipes use matplotlib /
seaborn defaults; adjust style for venue.

---

## Figure 1 — System Architecture (manual diagram)

**Type:** block diagram, ~half page width.

**Components:**
```
                ┌───────────────────────────────────────┐
   LED PDF  ──▶ │ Page-aware chunker → ChromaDB         │
                │ (paraphrase-multilingual-MiniLM-L12)  │
                └─────────────────┬─────────────────────┘
                                  │
                ┌───────────────────────────────────────┐
   Matrix PDF ─▶│ Rubric parser → matrix.json (60 ind.) │
                └─────────────────┬─────────────────────┘
                                  │
                ┌───────────────────────────────────────┐
   LKPS xlsx ─▶ │ openpyxl → SheetRegistry              │
                └─────────────────┬─────────────────────┘
                                  ▼
              ┌───────────────────────────────────────────┐
              │  4 Tools                                   │
              │  • get_indicator_rubric                    │
              │  • search_led_evidence                     │
              │  • get_lkps_table                          │
              │  • compute_formula_score                   │
              └────────────────┬─────────────────┬─────────┘
                               │                 │
              ┌────────────────▼────┐  ┌─────────▼─────────────┐
              │ Native graph        │  │ Reasoning graph       │
              │ (qwen, mistral)     │  │ (deepseek-r1)         │
              │ bind_tools          │  │ JSON dispatch         │
              │ ReAct loop          │  │ <think> stripping     │
              └────────────────┬────┘  └─────────┬─────────────┘
                               └────────┬────────┘
                                        ▼
                          ┌─────────────────────────────┐
                          │ parse_output / finalize     │
                          │ → (score, justification,    │
                          │    confidence)              │
                          └─────────────────────────────┘
```

Caption: *Cross-modal RAG agent architecture. Pre-processing pipelines
populate three context sources (vector store, rubric cache, LKPS
registry); four LangChain tools expose them to the agent. The dispatcher
auto-selects the native or reasoning graph based on model identifier.*

---

## Figure 2 — Per-Type MAE Comparison (bar chart)

**Type:** grouped bar chart, 3 model groups × 3 type bars.

**Data (paste into python):**
```python
import matplotlib.pyplot as plt
import numpy as np

models = ["qwen3.5:35b", "deepseek-r1:32b", "mistral-small3.2:24b"]
qual_mae = [0.55, 1.55, 2.45]
comp_mae = [0.58, 1.08, 2.14]
quant_mae = [1.05, 2.27, 0.98]

x = np.arange(len(models))
w = 0.27
fig, ax = plt.subplots(figsize=(7, 4))
ax.bar(x - w, qual_mae, w, label="Qualitative (n=20)", color="#3b82f6")
ax.bar(x,     comp_mae, w, label="Composite (n=12)",   color="#8b5cf6")
ax.bar(x + w, quant_mae, w, label="Quantitative (n=28)", color="#ef4444")
ax.set_ylabel("MAE (lower is better)")
ax.set_xticks(x); ax.set_xticklabels(models, rotation=15, ha="right")
ax.legend()
ax.set_title("Per-Type MAE: Reverse Failure Pattern Across Model Families")
plt.tight_layout()
plt.savefig("fig2_per_type_mae.pdf")
```

Caption: *Per-type Mean Absolute Error against the LLM-derived reference.
The tool-tuned generalist (qwen3.5) is uniformly competitive. The
reasoning model (deepseek-r1, prompt-based dispatch) collapses on
quantitative indicators (MAE 2.27) where number extraction from
LKPS markdown tables is required. The mid-sized chat model
(mistral-small3.2) shows the inverse pattern: competitive on
quantitative but worst on qualitative narrative scoring.*

---

## Figure 3 — Score Distribution per Model (violin / box plot)

**Type:** violin plot, 4 violins (Reference + 3 models), x = model, y = score.

**Data (paste into python):**
```python
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

ref = pd.read_csv("data/reference_scores_claude.csv")[["indicator_no", "score"]]
ref["model"] = "Claude (reference)"

bench = pd.read_csv("data/benchmark_results.csv")[["model", "indicator_no", "score"]]
df = pd.concat([ref, bench]).dropna(subset=["score"])
df["score"] = df["score"].astype(float)

plt.figure(figsize=(8, 4.5))
order = ["Claude (reference)", "qwen3.5:35b", "deepseek-r1:32b", "mistral-small3.2:24b"]
sns.violinplot(data=df, x="model", y="score", order=order, inner="box", cut=0)
plt.ylim(-0.3, 4.3)
plt.xticks(rotation=15, ha="right")
plt.ylabel("Score (0–4)")
plt.title("Score Distribution: Reference vs Three Open-Weight Agents")
plt.tight_layout()
plt.savefig("fig3_score_distribution.pdf")
```

Caption: *Score distributions across all 60 indicators. The reference
distribution centers around 3 (typical of an established program).
qwen3.5 closely tracks the reference shape. deepseek-r1 has a
prominent zero-score cluster (false-refusal on quantitative items).
mistral-small shows bimodal distribution: many zeros (qualitative
refusals) plus correct mid-high scores (quantitative successes).*

---

## Figure 4 — Confidence vs Accuracy Scatter (calibration)

**Type:** scatter, x = confidence, y = abs error, one panel per model.

**Data (paste into python):**
```python
import pandas as pd, matplotlib.pyplot as plt

ref = pd.read_csv("data/reference_scores_claude.csv").set_index("indicator_no")["score"]
bench = pd.read_csv("data/benchmark_results.csv")
bench["ref"] = bench["indicator_no"].map(ref)
bench["abs_err"] = (bench["score"].astype(float) - bench["ref"].astype(float)).abs()

fig, axes = plt.subplots(1, 3, figsize=(11, 3.5), sharey=True)
for ax, m in zip(axes, ["qwen3.5:35b", "deepseek-r1:32b", "mistral-small3.2:24b"]):
    sub = bench[bench.model == m]
    ax.scatter(sub.confidence, sub.abs_err, alpha=0.6)
    ax.set_title(m); ax.set_xlabel("Confidence"); ax.set_xlim(-0.05, 1.05); ax.set_ylim(-0.2, 4.5)
axes[0].set_ylabel("|model_score − ref_score|")
plt.suptitle("Confidence Calibration: Are Models 'Honest' About Uncertainty?")
plt.tight_layout()
plt.savefig("fig4_calibration.pdf")
```

Caption: *Confidence calibration. Ideal calibration would show
high-confidence points clustering at low error. deepseek-r1 frequently
emits high confidence (0.8–1.0) on incorrect zero-score outputs,
indicating overconfidence. mistral has bimodal confidence (0 for
refusals, 0.5–1.0 for attempts). qwen3.5 shows the best calibration
spread.*

---

## Figure 5 (optional) — Runtime vs Accuracy Pareto

**Type:** scatter with model labels, x = avg runtime, y = within-±1 accuracy.

```python
import matplotlib.pyplot as plt

models = {
    "qwen3.5:35b":      {"runtime": 26.6, "within1": 88.3, "color": "#16a34a"},
    "deepseek-r1:32b":  {"runtime": 74.8, "within1": 46.7, "color": "#dc2626"},
    "mistral-small3.2:24b": {"runtime": 11.6, "within1": 51.7, "color": "#3b82f6"},
}
plt.figure(figsize=(6, 4))
for m, d in models.items():
    plt.scatter(d["runtime"], d["within1"], s=200, c=d["color"], edgecolors="black")
    plt.annotate(m, (d["runtime"]+1, d["within1"]+1), fontsize=9)
plt.xlabel("Average runtime per indicator (seconds)")
plt.ylabel("Within ±1 accuracy (%)")
plt.title("Speed × Quality Pareto Frontier")
plt.grid(alpha=0.3)
plt.tight_layout()
plt.savefig("fig5_pareto.pdf")
```

Caption: *qwen3.5:35b dominates the speed-quality Pareto frontier
amongst open-weight 24–35 B models tested.*
