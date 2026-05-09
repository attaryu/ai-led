# Gambar — Deskripsi + Data Siap Plot (Versi Bahasa Indonesia)

Seluruh data gambar bersumber dari `data/benchmark_results.csv` dan
`data/reference_scores_claude.csv`. Resep plot menggunakan default
matplotlib / seaborn; sesuaikan style sesuai venue.

---

## Gambar 1 — Arsitektur Sistem (diagram manual)

**Tipe:** diagram blok, lebar setengah halaman.

**Komponen:**
```
                ┌───────────────────────────────────────┐
   LED PDF  ──▶ │ Pemecah halaman → ChromaDB           │
                │ (paraphrase-multilingual-MiniLM-L12)  │
                └─────────────────┬─────────────────────┘
                                  │
                ┌───────────────────────────────────────┐
   Matriks PDF▶│ Parser rubrik → matrix.json (60 ind.) │
                └─────────────────┬─────────────────────┘
                                  │
                ┌───────────────────────────────────────┐
   LKPS xlsx ─▶ │ openpyxl → SheetRegistry              │
                └─────────────────┬─────────────────────┘
                                  ▼
              ┌───────────────────────────────────────────┐
              │  4 Tool                                    │
              │  • get_indicator_rubric                    │
              │  • search_led_evidence                     │
              │  • get_lkps_table                          │
              │  • compute_formula_score                   │
              └────────────────┬─────────────────┬─────────┘
                               │                 │
              ┌────────────────▼────┐  ┌─────────▼─────────────┐
              │ Native graph        │  │ Reasoning graph       │
              │ (qwen, mistral)     │  │ (deepseek-r1)         │
              │ bind_tools          │  │ Dispatch JSON         │
              │ ReAct loop          │  │ Strip <think>         │
              └────────────────┬────┘  └─────────┬─────────────┘
                               └────────┬────────┘
                                        ▼
                          ┌─────────────────────────────┐
                          │ parse_output / finalize     │
                          │ → (skor, justifikasi,       │
                          │    confidence)              │
                          └─────────────────────────────┘
```

**Caption:** *Arsitektur agen RAG lintas-modal. Pipeline pra-pemrosesan
mengisi tiga sumber konteks (vector store, rubric cache, LKPS
registry); empat tool LangChain memaparkannya ke agen. Dispatcher
otomatis memilih graph native atau reasoning berdasarkan identifier
model.*

---

## Gambar 2 — Perbandingan MAE Per-Tipe (bar chart)

**Tipe:** *grouped bar chart*, 3 kelompok model × 3 *bar* tipe.

**Data (paste ke Python):**
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
ax.bar(x - w, qual_mae, w, label="Kualitatif (n=20)", color="#3b82f6")
ax.bar(x,     comp_mae, w, label="Komposit (n=12)",   color="#8b5cf6")
ax.bar(x + w, quant_mae, w, label="Kuantitatif (n=28)", color="#ef4444")
ax.set_ylabel("MAE (lebih rendah lebih baik)")
ax.set_xticks(x); ax.set_xticklabels(models, rotation=15, ha="right")
ax.legend()
ax.set_title("MAE Per-Tipe: Pola Kegagalan Berkebalikan Antar Keluarga Model")
plt.tight_layout()
plt.savefig("fig2_per_type_mae.pdf")
```

**Caption:** *Mean Absolute Error per-tipe terhadap referensi berbasis
LLM. Generalis dengan tool-tuning (qwen3.5) konsisten kompetitif di
seluruh tipe. Model reasoning (deepseek-r1, dispatch berbasis prompt)
ambruk pada indikator kuantitatif (MAE 2,27) di mana ekstraksi angka
dari tabel markdown LKPS dibutuhkan. Model chat menengah
(mistral-small3.2) menunjukkan pola kebalikan: kompetitif pada
kuantitatif tetapi terburuk pada penilaian naratif kualitatif.*

---

## Gambar 3 — Distribusi Skor per Model (violin / box plot)

**Tipe:** *violin plot*, 4 *violin* (Referensi + 3 model), x = model, y = skor.

**Data (paste ke Python):**
```python
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

ref = pd.read_csv("data/reference_scores_claude.csv")[["indicator_no", "score"]]
ref["model"] = "Claude (referensi)"

bench = pd.read_csv("data/benchmark_results.csv")[["model", "indicator_no", "score"]]
df = pd.concat([ref, bench]).dropna(subset=["score"])
df["score"] = df["score"].astype(float)

plt.figure(figsize=(8, 4.5))
order = ["Claude (referensi)", "qwen3.5:35b", "deepseek-r1:32b", "mistral-small3.2:24b"]
sns.violinplot(data=df, x="model", y="score", order=order, inner="box", cut=0)
plt.ylim(-0.3, 4.3)
plt.xticks(rotation=15, ha="right")
plt.ylabel("Skor (0–4)")
plt.title("Distribusi Skor: Referensi vs Tiga Agen Open-Weight")
plt.tight_layout()
plt.savefig("fig3_score_distribution.pdf")
```

**Caption:** *Distribusi skor pada seluruh 60 indikator. Distribusi
referensi terpusat di sekitar nilai 3 (khas program studi yang sudah
mapan). qwen3.5 mengikuti bentuk distribusi referensi dengan dekat.
deepseek-r1 memiliki kluster nilai-nol yang menonjol (false-refusal
pada item kuantitatif). mistral-small menunjukkan distribusi bimodal:
banyak nilai-nol (penolakan kualitatif) bersama dengan skor menengah-
tinggi yang benar (keberhasilan kuantitatif).*

---

## Gambar 4 — Confidence vs Akurasi Scatter (kalibrasi)

**Tipe:** *scatter*, x = *confidence*, y = *abs error*, satu panel per model.

**Data (paste ke Python):**
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
axes[0].set_ylabel("|skor_model − skor_ref|")
plt.suptitle("Kalibrasi Confidence: Apakah Model 'Jujur' tentang Ketidakpastian?")
plt.tight_layout()
plt.savefig("fig4_calibration.pdf")
```

**Caption:** *Kalibrasi confidence. Kalibrasi ideal akan menampilkan
titik-titik ber-confidence tinggi terkumpul pada error rendah.
deepseek-r1 sering memberikan confidence tinggi (0,8–1,0) pada output
nilai-nol yang salah, mengindikasikan overconfidence. mistral memiliki
confidence bimodal (0 untuk penolakan, 0,5–1,0 untuk percobaan).
qwen3.5 menunjukkan sebaran kalibrasi terbaik.*

---

## Gambar 5 (opsional) — Pareto Runtime vs Akurasi

**Tipe:** *scatter* dengan label model, x = rerata *runtime*, y = akurasi within-±1.

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
plt.xlabel("Rerata runtime per indikator (detik)")
plt.ylabel("Akurasi within ±1 (%)")
plt.title("Frontier Pareto Kecepatan × Kualitas")
plt.grid(alpha=0.3)
plt.tight_layout()
plt.savefig("fig5_pareto.pdf")
```

**Caption:** *qwen3.5:35b mendominasi frontier Pareto kecepatan-kualitas
di antara model open-weight 24–35 B yang diuji.*
