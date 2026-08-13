# LED Generator — Web App

Aplikasi web untuk menyusun **Laporan Evaluasi Diri (LED)** akreditasi
program studi secara semi-otomatis. Sistem membaca outline LED resmi
(210 section: BAB → sub-bab → poin), menjalankan **pipeline RAG 6-tahap**
ke LLM lokal (Ollama), dan menampilkan draft + bukti (LKPS/Evidence) +
evaluasi RAGAS dalam UI tiga panel.

```
┌───────────────────────────────────────────────────────────────────────┐
│ TopBar  │  Generate semua [35/210]   ●Ollama   ▓▓▓▓░░░░░ 35%          │
├──────────────┬──────────────────────────────────────┬─────────────────┤
│ Outline      │ Document Pane                        │ Chat Pane       │
│              │                                      │                 │
│ BAB I        │ Tabs: Draft │ Pedoman │ Rubric       │ Bubble chat utk │
│  └ 1)        │        Checklist │ Evidence │ Judge  │ minta revisi    │
│ BAB II       │                                      │ (streaming)     │
│  ├ A. Tim…   │ Markdown draft + tombol Edit/        │                 │
│  └ C. …      │ Approve/Regenerate/Hapus             │                 │
│ BAB III      │                                      │                 │
│ BAB IV       │                                      │                 │
└──────────────┴──────────────────────────────────────┴─────────────────┘
```

---

## Stack

| Lapisan | Teknologi |
|---|---|
| **Backend** | FastAPI · Python 3.12 · container `led-api` (port 8000) |
| **Frontend** | React 18 + Vite 5 + Tailwind 3 · container `led-web` (port 5173) |
| **Vector DB** | ChromaDB (file-based di `data/chroma_db/`) — 4 koleksi: `pedoman`, `rubric`, `lkps`, `evidence` |
| **State DB** | SQLite (`data/led.db`) — table `drafts`, `chat_messages` |
| **Embedding** | `BAAI/bge-m3` (multilingual, 1024-dim) — di-cache di `data/hf_cache/` |
| **LLM synthesis** | Ollama — `deepseek-r1:32b` atau `qwen3.5:35b` (remote/local) |
| **LLM judge** | Ollama — `gpt-oss:20b` (deterministic, JSON output) |
| **Tracing** | LangSmith (opsional) |

---

## Struktur direktori

```
web/
├── api/                  # FastAPI app
│   ├── main.py
│   ├── routes/           # /sections, /chat, /export
│   ├── lib/              # outline, generator (6-stage LCEL), retrieval, prompts, ollama
│   ├── Dockerfile
│   └── requirements.txt
├── web/                  # React frontend
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/   # Outline, DocumentPane, ChatPane, TopBar, Toaster, ConfirmDialog
│   │   └── lib/          # api, store (zustand)
│   ├── Dockerfile
│   └── package.json
├── scripts/              # CLI utilities
│   ├── index_chunks.py       # populate Chroma dari chunks_all.json
│   ├── generate_led.py       # batch generate dari CLI
│   ├── parse_led_existing.py # baca LED existing utk ground-truth eval
│   └── evaluate.py           # RAGAS eval
├── data/                 # runtime (di-mount; di-gitignore)
│   ├── led.db
│   ├── chroma_db/
│   ├── hf_cache/
│   ├── led_existing/         # mounted ../document/result (read-only)
│   └── instruction/          # mounted ../document/intruction (read-only)
├── docker-compose.yml
├── .env.example
└── .gitignore
```

---

## Prasyarat

- Docker + Docker Compose v2 (`docker compose version`)
- Akses ke Ollama yang punya 3 model berikut:
  - `deepseek-r1:32b` atau `qwen3.5:35b` (synthesis)
  - `gpt-oss:20b` (judge)
  - Cek: `curl http://<OLLAMA_HOST>/api/tags`
- File data hasil pipeline notebook di `../code/output/`:
  - `chunks_all.json` (1.882 chunks: pedoman + matrik + lkps + evidence)
  - `led_bab_tabel.json` (210 heading struktur LED)
- GPU NVIDIA (opsional, untuk embedding cepat — auto-detect, atau set `EMBEDDING_DEVICE=cpu`)

---

## Setup awal

```bash
cd /home/dimas/proyek-akhir/web

# 1. Salin .env dan isi OLLAMA_HOST + OLLAMA_TOKEN
cp .env.example .env
vi .env       # set OLLAMA_HOST, OLLAMA_TOKEN, dll

# 2. Build images (sekali, ~10–15 menit)
docker compose build

# 3. Index chunks ke Chroma (sekali, ~5 menit dgn GPU)
docker compose run --rm api python /scripts/index_chunks.py

# 4. Jalan
docker compose up -d
```

UI: <http://localhost:5173> · API: <http://localhost:8000> · health: <http://localhost:8000/health>

---

## Variabel `.env` penting

| Variabel | Default | Keterangan |
|---|---|---|
| `OLLAMA_HOST` | `http://host.docker.internal:11434` | URL Ollama (lokal/remote) |
| `OLLAMA_TOKEN` | — | Bearer token kalau Ollama remote (Vast.ai/RunPod) |
| `JUDGE_MODEL` | `gpt-oss:20b` | Model untuk RAGAS judge |
| `EMBEDDING_MODEL` | `BAAI/bge-m3` | HF model id, harus konsisten dgn `index_chunks.py` |
| `EMBEDDING_DEVICE` | (auto) | `cpu` untuk paksa CPU |
| `LANGCHAIN_TRACING_V2` | `false` | `true` untuk kirim trace ke LangSmith |
| `LANGCHAIN_API_KEY` | — | API key LangSmith |

> ⚠️ `.env` di-gitignore — jangan commit token.

---

## Pipeline generate (6 tahap LCEL)

Tiap section di outline di-generate melalui chain di
`api/lib/generator.py`:

```
01_route          → ambil section dari outline (id, breadcrumb, retrieval_query)
02_retrieve_rules → search_pedoman (RAG 1) + search_rubric (RAG 2) paralel
03_build_checklist→ LLM bikin 4–8 pertanyaan faktual dari pedoman+rubric
04_retrieve_facts → search_lkps (RAG 3) + search_evidence (RAG 4) per item checklist
05_synthesize     → LLM tulis narasi LED (2500 token)
06_judge          → gpt-oss:20b nilai 4 metrik RAGAS + missing_facts + hallucinated
07_save_db        → simpan ke SQLite
```

`retrieval_query` adalah **breadcrumb multi-baris** (BAB → sub-bab → … → poin),
bukan judul pendek — ini penting agar embedding query kaya konteks dan
retrieval mengembalikan chunk yang relevan.

---

## Fitur UI

- **Outline tree** (210 entri) dengan indentasi per kedalaman, chip
  marker berwarna per level (BAB / sub-bab / C.x / a) / i. / …), garis
  panduan vertikal, BAB collapsible, search filter.
- **Tombol Generate pintar** di TopBar:
  - Ada section kosong → "Generate semua \[done/total]" (biru).
  - Semua sudah ada draft → "Regenerate semua" (merah, konfirmasi modal).
  - Sedang berjalan → "Stop generate" — hentikan loop + abort fetch in-flight.
- **Progress live**: badge tombol naik tiap section selesai;
  progress bar header global update; toast progress dengan bar dan
  pesan section yang sedang diproses.
- **DocumentPane** 6 tab:
  - **Draft** — narasi LED (Markdown), bisa diedit/approve/hapus.
  - **Pedoman / Rubric / Checklist** — bukti RAG 1/2 + pertanyaan turunan.
  - **Evidence** — LKPS + Evidence terpisah dengan badge `LKPS`/`EV`,
    query item checklist yang memunculkannya, file source.
  - **Judge** — 4 metrik RAGAS (Faithfulness / Answer Relevancy /
    Context Precision / Context Recall) sebagai kartu dengan bar
    berwarna; daftar missing_facts dan hallucinated.
- **Toaster** + **ConfirmDialog** menggantikan `alert()`/`confirm()`.
- **Chat revisi** (panel kanan) — streaming Server-Sent Events ke Ollama,
  bubble user/assistant, typing dots indicator.

---

## Endpoint API

| Method | Path | Keterangan |
|---|---|---|
| GET  | `/sections?model=…` | Outline + status draft per section |
| GET  | `/sections/{id}?model=…` | Detail section (drafts, pedoman, rubric, dst) |
| POST | `/sections/{id}/generate` | Trigger pipeline 6-tahap |
| PUT  | `/sections/{id}/draft` | Edit manual draft |
| POST | `/sections/{id}/approve` | Tandai approved |
| DELETE | `/sections/{id}` | Hapus draft 1 section |
| DELETE | `/sections` | Hapus SEMUA draft untuk model |
| POST | `/sections/{id}/chat` | Stream chat revisi (SSE) |
| GET  | `/sections/{id}/chat` | Riwayat chat |
| GET  | `/export?model=…` | Export gabungan `.docx` |
| GET  | `/health` | API + Ollama status |

---

## CLI scripts

```bash
# Indexing ke Chroma (idempotent kalau pakai --reset)
docker compose run --rm api python /scripts/index_chunks.py

# Batch generate dari CLI (tanpa UI)
docker compose run --rm api python /scripts/generate_led.py --model deepseek-r1:32b
docker compose run --rm api python /scripts/generate_led.py --model deepseek-r1:32b --section C.3.3
docker compose run --rm api python /scripts/generate_led.py --model deepseek-r1:32b --force

# Parse LED existing untuk ground-truth
docker compose run --rm api python /scripts/parse_led_existing.py

# Evaluasi RAGAS lengkap (butuh requirements-eval.txt sekali)
docker compose run --rm api pip install -r /app/requirements-eval.txt
docker compose run --rm api python /scripts/evaluate.py
```

---

## Troubleshooting

### Qwen3.5 menghasilkan draft kosong meski RAG jalan

Sudah dipatch. Qwen3+ menaruh output di field `thinking` (bukan `response`)
selama thinking belum selesai, dan `langchain-ollama 0.2` cuma membaca
`response`. Solusi: `api/lib/ollama_client.py` punya `_RawOllamaLLM` yang
panggil HTTP langsung dengan `think=false` untuk model `qwen3*`.

### "0/210" walaupun ada draft

Endpoint `/sections?model=…` harus mengembalikan field `model` di tiap
draft. Sudah dipatch di `api/routes/sections.py`. Kalau masih `0`, restart
container API: `docker compose restart api`.

### RAG mengembalikan chunk tidak relevan

`outline.py` mem-build `retrieval_query` multi-baris (breadcrumb
penuh) untuk tiap section. Kalau retrieval terlihat tipis/aneh, pastikan
field ini tidak hilang setelah edit `outline.py`.

### Build lambat / pip timeout

Dockerfile sudah pakai `PIP_DEFAULT_TIMEOUT=600`, `PIP_RETRIES=20`, dan
BuildKit cache mount. Linux: tambah `build.network: host` di
`docker-compose.yml` kalau bridge network tidak bisa keluar saat build.

### Ollama tidak reachable dari container

- Lokal: pakai `OLLAMA_HOST=http://host.docker.internal:11434`.
  `extra_hosts: host.docker.internal:host-gateway` sudah di compose untuk Linux.
- Remote (Vast.ai/RunPod): set `OLLAMA_HOST=http://<ip>:<port>` dan
  `OLLAMA_TOKEN=<bearer>`.

### Re-index setelah ganti embedding model

Dimensi embedding harus konsisten antara index time dan query time.
Kalau ganti `EMBEDDING_MODEL`:

```bash
rm -rf data/chroma_db
docker compose run --rm api python /scripts/index_chunks.py
```

---

## Pengembangan

```bash
# Hot reload — kode di api/ dan web/ di-mount sebagai volume
docker compose up

# Lihat log
docker compose logs -f api
docker compose logs -f web

# Restart 1 service tanpa rebuild
docker compose restart api
```

Lihat juga `../code/extract_bab_tabel.ipynb` untuk pipeline ekstraksi
`led_bab_tabel.json` (struktur BAB + tabel dari PDF LED).
