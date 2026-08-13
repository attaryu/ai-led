"""Render 5 figures for the paper from PENYEMPURNAAN_DRAFT recipes.

Output: paper/figures/fig{1..6}_*.pdf + .png

Run from project root:
    python3 paper/_render_figures.py
"""
from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "paper" / "figures"
OUT.mkdir(exist_ok=True, parents=True)

# Use a clean academic style
plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 10,
    "axes.titlesize": 11,
    "axes.labelsize": 10,
    "savefig.dpi": 200,
    "savefig.bbox": "tight",
})

FOCUS = [1, 2, 4, 7, 8, 13, 17, 22, 28, 30, 32, 35, 39, 42, 48, 50, 53, 58, 60]
SUFFIX = "_focus19"


def save(fig, stem: str) -> None:
    for ext in ("pdf", "png"):
        path = OUT / f"{stem}.{ext}"
        fig.savefig(path)
    print(f"  → {stem}.pdf + {stem}.png")


# ─────────────────────────────────────────────────────────────────────────
# Figure 1 — Manual vs Automated AMI workflow (text-only diagram via mpl)
# ─────────────────────────────────────────────────────────────────────────
def fig1_workflow() -> None:
    fig, (ax_m, ax_a) = plt.subplots(1, 2, figsize=(11, 6.5))

    def draw_lane(ax, title, steps, color, total):
        ax.set_xlim(0, 10); ax.set_ylim(0, 11)
        ax.axis("off")
        ax.set_title(title, fontsize=12, fontweight="bold", pad=10, color=color)
        for i, step in enumerate(steps):
            y = 10 - i * 1.3
            ax.add_patch(plt.Rectangle((1, y - 0.5), 8, 1.0,
                                        facecolor=color, alpha=0.15,
                                        edgecolor=color, linewidth=1.5))
            ax.text(5, y, step, ha="center", va="center", fontsize=9.5, wrap=True)
            if i < len(steps) - 1:
                ax.annotate("", xy=(5, y - 0.7), xytext=(5, y - 0.5),
                            arrowprops=dict(arrowstyle="->", color="#666", lw=1.5))
        ax.text(5, 0.3, total, ha="center", va="center",
                fontsize=10, fontweight="bold", color=color,
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white",
                          edgecolor=color, linewidth=1.5))

    manual = [
        "LED PDF (200 pages)\n+ LKPS Excel (50 sheets)",
        "Assessor reads narrative\n& notes evidence",
        "Manual cross-check\nqualitative ↔ quantitative",
        "Score 60+ indicators\n(0–4 scale)",
        "Write justification\nfor each indicator",
        "Compile assessment report",
    ]
    automated = [
        "LED PDF\n→ chunking + embedding\n→ ChromaDB index",
        "LKPS Excel\n→ pandas + sheet registry",
        "LLM Agent (RAG)\n+ 4 tools",
        "Auto-score 60+ indicators\n+ justification + confidence",
        "Stream results to CSV\n(per-indicator durability)",
        "Assessor verifies\n(human-in-the-loop)",
    ]

    draw_lane(ax_m, "MANUAL FLOW (BASELINE)", manual, "#dc2626",
              "⏱ 3–5 days/program · variance across assessors")
    draw_lane(ax_a, "AUTOMATED FLOW (PROPOSED)", automated, "#16a34a",
              "⏱ 30–60 min/program · auditable trace")

    fig.suptitle("Figure 1 — Manual vs Automated Internal Quality Audit Workflow",
                 fontsize=12, fontweight="bold", y=1.0)
    plt.tight_layout()
    save(fig, "fig1_workflow")
    plt.close(fig)


# ─────────────────────────────────────────────────────────────────────────
# Figure 2 — System Architecture
# ─────────────────────────────────────────────────────────────────────────
def fig2_architecture() -> None:
    fig, ax = plt.subplots(figsize=(11, 6.5))
    ax.set_xlim(0, 14); ax.set_ylim(0, 10); ax.axis("off")

    def box(x, y, w, h, text, color, alpha=0.2, fontsize=9, fontweight="normal"):
        ax.add_patch(plt.Rectangle((x, y), w, h,
                                    facecolor=color, alpha=alpha,
                                    edgecolor=color, linewidth=1.5))
        ax.text(x + w/2, y + h/2, text, ha="center", va="center",
                fontsize=fontsize, fontweight=fontweight, wrap=True)

    def arrow(x1, y1, x2, y2):
        ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle="->", color="#444", lw=1.5))

    # Layer 1: input documents
    box(0.5, 8.5, 3, 1, "LED PDF\n(narrative)", "#3b82f6", fontsize=9)
    box(5.5, 8.5, 3, 1, "Matrix Rubric PDF\n(60 indicators)", "#8b5cf6", fontsize=9)
    box(10.5, 8.5, 3, 1, "LKPS Excel\n(50 sheets)", "#16a34a", fontsize=9)

    # Layer 2: pre-processing
    box(0.5, 6.5, 3, 1, "Page-aware chunker\n+ MiniLM embedding", "#3b82f6", fontsize=8.5)
    box(5.5, 6.5, 3, 1, "Rubric parser\n→ matrix.json", "#8b5cf6", fontsize=8.5)
    box(10.5, 6.5, 3, 1, "openpyxl loader\n+ sheet registry", "#16a34a", fontsize=8.5)

    arrow(2, 8.5, 2, 7.5)
    arrow(7, 8.5, 7, 7.5)
    arrow(12, 8.5, 12, 7.5)

    # Layer 3: tools
    box(0.5, 4.5, 13, 1, "Four LangChain Tools  ·  search_led_evidence  ·  get_indicator_rubric  ·  get_lkps_table  ·  compute_formula_score",
        "#f59e0b", fontsize=9, fontweight="bold")
    arrow(2, 6.5, 2, 5.5)
    arrow(7, 6.5, 7, 5.5)
    arrow(12, 6.5, 12, 5.5)

    # Layer 4: agent paradigms
    box(1, 2.5, 5.5, 1.4, "Native Graph\n(qwen3.5, mistral)\n  bind_tools, ToolNode loop",
        "#16a34a", fontsize=9, alpha=0.25)
    box(7.5, 2.5, 5.5, 1.4, "Reasoning Graph\n(deepseek-r1)\n  prompt JSON dispatch · <think> stripped",
        "#dc2626", fontsize=9, alpha=0.25)
    arrow(4, 4.5, 4, 3.9)
    arrow(10, 4.5, 10, 3.9)

    # Layer 5: output
    box(3, 0.4, 8, 1.2,
        "parse_output / finalize\n→ (score 0–4, justification, confidence)",
        "#1e40af", fontsize=10, fontweight="bold", alpha=0.3)
    arrow(3.75, 2.5, 5.5, 1.6)
    arrow(10.25, 2.5, 8.5, 1.6)

    ax.set_title("Figure 2 — System Architecture: Cross-Modal RAG Agent for Indonesian Higher-Ed Accreditation",
                 fontsize=11, fontweight="bold", pad=15)
    plt.tight_layout()
    save(fig, "fig2_architecture")
    plt.close(fig)


# ─────────────────────────────────────────────────────────────────────────
# Figure 3 — Per-Type MAE bar chart
# ─────────────────────────────────────────────────────────────────────────
def fig3_per_type_mae() -> None:
    pt = pd.read_csv(DATA / f"report_per_type{SUFFIX}.csv")
    models = ["qwen3.5:35b", "deepseek-r1:32b", "mistral-small3.2:24b"]
    short = ["Qwen", "DeepSeek-R1", "Mistral"]

    def get(m, t):
        sub = pt[(pt.model == m) & (pt.score_type == t)]
        return sub["mae"].iloc[0] if len(sub) else 0.0

    qual = [get(m, "qualitative")  for m in models]
    comp = [get(m, "composite")    for m in models]
    quan = [get(m, "quantitative") for m in models]

    x = np.arange(len(models))
    w = 0.27
    fig, ax = plt.subplots(figsize=(8, 5))
    bars1 = ax.bar(x - w,     qual, w, label="Qualitative (n=9)",  color="#3b82f6", edgecolor="black")
    bars2 = ax.bar(x,         comp, w, label="Composite (n=4)",    color="#16a34a", edgecolor="black")
    bars3 = ax.bar(x + w,     quan, w, label="Quantitative (n=6)", color="#f59e0b", edgecolor="black")

    for bars in (bars1, bars2, bars3):
        for b in bars:
            ax.text(b.get_x() + b.get_width()/2, b.get_height() + 0.06,
                    f"{b.get_height():.2f}", ha="center", fontsize=8.5)

    ax.set_ylabel("Mean Absolute Error (MAE)  (lower is better)", fontsize=11)
    ax.set_xticks(x); ax.set_xticklabels(short, fontsize=11)
    ax.legend(loc="upper left")
    ax.set_ylim(0, max(qual + comp + quan) * 1.25)
    ax.set_title("Figure 3 — MAE per Indicator Type (n=19, multi-criteria sample)",
                 fontsize=11, fontweight="bold")
    ax.grid(axis="y", alpha=0.3)
    plt.tight_layout()
    save(fig, "fig3_per_type_mae")
    plt.close(fig)


# ─────────────────────────────────────────────────────────────────────────
# Figure 4 — Confidence calibration scatter (3 panels)
# ─────────────────────────────────────────────────────────────────────────
def fig4_calibration() -> None:
    bench = pd.read_csv(DATA / "benchmark_results.csv")
    ref   = pd.read_csv(DATA / "reference_scores_claude.csv").set_index("indicator_no")["score"]
    bench = bench[bench.indicator_no.isin(FOCUS)].copy()
    bench["ref"]     = bench.indicator_no.map(ref)
    bench["abs_err"] = (bench.score.astype(float) - bench.ref.astype(float)).abs()

    models = [("qwen3.5:35b", "#16a34a"),
              ("deepseek-r1:32b", "#dc2626"),
              ("mistral-small3.2:24b", "#3b82f6")]

    fig, axes = plt.subplots(1, 3, figsize=(12, 4), sharey=True)
    for ax, (m, c) in zip(axes, models):
        sub = bench[bench.model == m]
        ax.scatter(sub.confidence, sub.abs_err,
                   s=140, alpha=0.7, c=c, edgecolors="black", linewidths=1)
        ax.axhline(y=1, color="gray", linestyle="--", alpha=0.6, label="±1 threshold")
        ax.set_title(m, fontsize=10, fontweight="bold")
        ax.set_xlabel("Confidence (0–1)")
        ax.set_xlim(0, 1.05); ax.set_ylim(-0.2, 4.5)
        ax.grid(alpha=0.3)
        # Annotate cells with high confidence + high error
        for _, row in sub.iterrows():
            if row.confidence >= 0.7 and row.abs_err >= 2:
                ax.annotate(f"Ind.{row.indicator_no}",
                            (row.confidence, row.abs_err),
                            textcoords="offset points", xytext=(6, -3),
                            fontsize=8, color="darkred")
    axes[0].set_ylabel("|model_score − reference_score|")
    axes[0].legend(loc="upper left", fontsize=8)
    fig.suptitle("Figure 4 — Confidence Calibration: Mistral Shows High Confidence on Wrong Answers",
                 y=1.02, fontsize=11, fontweight="bold")
    plt.tight_layout()
    save(fig, "fig4_calibration")
    plt.close(fig)


# ─────────────────────────────────────────────────────────────────────────
# Figure 5 — Runtime × Accuracy Pareto frontier
# ─────────────────────────────────────────────────────────────────────────
def fig5_pareto() -> None:
    agg = pd.read_csv(DATA / f"report_aggregate{SUFFIX}.csv")
    fig, ax = plt.subplots(figsize=(7, 5))

    colors = {"qwen3.5:35b": "#16a34a",
              "deepseek-r1:32b": "#dc2626",
              "mistral-small3.2:24b": "#3b82f6"}

    for _, row in agg.iterrows():
        m = row.model
        ax.scatter(row.avg_runtime_sec, row.exact_pct,
                   s=400, c=colors.get(m, "gray"),
                   edgecolors="black", linewidths=1.5, alpha=0.85)
        # Annotation with offset based on position
        offset_x, offset_y = (3, 1)
        if "deepseek" in m:
            offset_x, offset_y = (-15, 4)
        elif "mistral" in m:
            offset_x, offset_y = (3, -4)
        ax.annotate(m,
                    (row.avg_runtime_sec, row.exact_pct),
                    xytext=(offset_x, offset_y), textcoords="offset points",
                    fontsize=10, fontweight="bold")
        ax.annotate(f"MAE={row.mae:.2f}",
                    (row.avg_runtime_sec, row.exact_pct),
                    xytext=(3, -16), textcoords="offset points",
                    fontsize=8, color="#555")

    ax.set_xlabel("Average runtime per indicator (seconds)  →  slower")
    ax.set_ylabel("Exact match accuracy (%)  ↑  better")
    ax.set_title("Figure 5 — Speed vs Accuracy Pareto Frontier",
                 fontsize=11, fontweight="bold")
    ax.set_xlim(0, max(agg.avg_runtime_sec) * 1.25)
    ax.set_ylim(0, max(agg.exact_pct) * 1.25)
    ax.grid(alpha=0.3)
    plt.tight_layout()
    save(fig, "fig5_pareto")
    plt.close(fig)


# ─────────────────────────────────────────────────────────────────────────
# Figure 6 — Score distribution box+strip plot
# ─────────────────────────────────────────────────────────────────────────
def fig6_distribution() -> None:
    ref   = pd.read_csv(DATA / "reference_scores_claude.csv")
    bench = pd.read_csv(DATA / "benchmark_results.csv")

    ref_f = ref[ref.indicator_no.isin(FOCUS)][["indicator_no", "score"]].copy()
    ref_f["model"] = "Reference (Claude)"
    bench_f = bench[bench.indicator_no.isin(FOCUS)][["model", "indicator_no", "score"]].copy()
    df = pd.concat([ref_f, bench_f], ignore_index=True).dropna(subset=["score"])
    df["score"] = df.score.astype(float)

    fig, ax = plt.subplots(figsize=(9, 4.5))
    order = ["Reference (Claude)", "qwen3.5:35b", "deepseek-r1:32b", "mistral-small3.2:24b"]
    palette = {"Reference (Claude)": "#fde68a",
               "qwen3.5:35b": "#a7f3d0",
               "deepseek-r1:32b": "#fecaca",
               "mistral-small3.2:24b": "#bfdbfe"}
    sns.boxplot(data=df, x="model", y="score", order=order,
                palette=palette, ax=ax, width=0.55)
    sns.stripplot(data=df, x="model", y="score", order=order,
                  color="black", size=5, alpha=0.7, ax=ax)
    ax.set_ylim(-0.5, 4.5)
    ax.set_ylabel("Score (0–4)")
    ax.set_xlabel("")
    ax.set_xticklabels(["Reference\n(Claude)", "Qwen\n3.5:35b", "DeepSeek\nR1:32b", "Mistral\nSmall 3.2"], fontsize=10)
    ax.set_title(f"Figure 6 — Score Distribution Across {len(FOCUS)} Focus Indicators (multi-criteria sample)",
                 fontsize=11, fontweight="bold")
    ax.grid(axis="y", alpha=0.3)
    plt.tight_layout()
    save(fig, "fig6_distribution")
    plt.close(fig)


def main() -> None:
    print(f"Output dir: {OUT}")
    print("Rendering 6 figures…\n")
    fig1_workflow()
    fig2_architecture()
    fig3_per_type_mae()
    fig4_calibration()
    fig5_pareto()
    fig6_distribution()
    print("\n✓ All figures rendered.")


if __name__ == "__main__":
    main()
