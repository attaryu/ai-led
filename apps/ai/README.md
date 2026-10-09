# apps/ai — AI Service

Microservice AI monorepo `AI-LED-dev-v1` — dua peran:

1. **Penilaian AMI** — agent LangGraph per-indikator yang cross-reference
   narasi LED terhadap data tabular LKPS/rubrik, menghasilkan skor +
   justifikasi + rekomendasi lengkap dengan audit trail sumber bukti.
2. **Worker BullMQ** (`worker.py`) — konsumen job dari `apps/backend`
   (generation-queue, assessment-queue, ingestion-queue): generasi narasi
   bab (`GENERASI_BAB`), rekomendasi dokumen, simulasi skor rubrik,
   penilaian AMI penuh, dan ekstraksi bukti dukung/rubrik.

Diadaptasi dari catatan arsitektur `origin/assesment-ai` (dulu `ariel`,
referensi AI LED Assessment) — banyak bagian di bawah portingan langsung
dari sana, disesuaikan ke skema/stack `dev-v1` yang sebenarnya.

---

## Stack

| Lapisan | Teknologi |
|---|---|
| **API** | FastAPI · Python 3.11 · service `ai` di `docker-compose.yml` (port 8000) |
| **Worker** | `worker.py` — polling BullMQ (`generation-queue`, `assessment-queue`, `ingestion-queue`) via Redis, service `ai-worker` (image sama dengan `ai`, cuma beda `command`) |
| **Agent scoring** | LangGraph — dua implementasi graph: `graph.py` (native tool-calling, model chat biasa) dan `reasoning_graph.py` (protokol JSON manual, untuk model reasoning seperti deepseek-r1/qwq yang kurang reliable native tool-calling-nya) |
| **Vector DB** | pgvector (Postgres, `packages/db`) — bukan ChromaDB. Dua tabel: `writing_led_chunk_embeddings` (LED) dan `evidence_chunk_embeddings` (bukti dukung), isolasi lewat `WHERE tenant_id = ... AND document_id = ...` biasa, bukan collection-per-dokumen |
| **Embedding** | Writing (dimas): `BAAI/bge-m3` 1024-d, kolom `embedding` (`EMBEDDING_MODEL`). Asesmen AMI (ariel): `paraphrase-multilingual-MiniLM-L12-v2` 384-d, kolom `embedding_ami` (`AMI_EMBEDDING_MODEL`). Data lama: `python -m scripts.backfill_ami_embeddings`. Di-cache di volume `hf_cache` |
| **Ekstraksi PDF** | pdfplumber (Matriks/LED) · MinerU (evidence PDF → Markdown, butuh `poppler-utils`+`libgl1`, sudah dibake di `Dockerfile`) |
| **State DB** | Postgres via Prisma (`packages/db/prisma/schema.prisma`) — `apps/ai` menulis langsung lewat `db/postgres_client.py`, **bukan** lewat NestJS. Tidak ada Supabase lagi — sisa arsitektur ariel sudah dibuang sepenuhnya |
| **LLM assessment** | Ollama (self-hosted) atau OpenRouter — `OLLAMA_BASE_URL` bisa daftar beberapa endpoint dipisah koma (1 alamat = 1 GPU), round-robin per panggilan |
| **LLM judge (RAGAS)** | Dikonfigurasi independen dari model assessment (`RAGAS_*` env), sengaja dipisah untuk benchmark yang adil |
| **Evaluasi kualitas** | RAGAS — faithfulness, answer relevancy, context precision, context recall |
| **Storage berkas** | Cloudflare R2 (`db/r2_client.py`) — worker mengunduh Bukti Dukung dari sana sebelum diekstrak |

---

## Struktur direktori

```
apps/ai/
├── agent/
│   ├── graph.py                 # LangGraph native tool-calling
│   ├── reasoning_graph.py       # LangGraph protokol JSON manual (model reasoning)
│   ├── state.py                 # AssessmentState (TypedDict) — shared oleh 2 graph di atas
│   ├── context.py                # AssessmentContext (contextvar) — tenant/dokumen/indikator aktif
│   └── tools/                    # rubric_tool, led_tool, lkps_tool, formula_tool, evidence_tool
├── api/routes/                  # assessment.py, upload.py, eval.py, chat.py
├── db/
│   ├── postgres_client.py       # akses live ke Postgres monorepo — assessment_sessions/
│   │                              indicator_results/reasoning_steps, dipakai jalur assessment
│   ├── generation_client.py     # akses Postgres untuk jalur GENERASI_BAB (worker.py)
│   ├── r2_client.py             # download berkas Bukti Dukung dari Cloudflare R2
│   └── connection.py             # koneksi Postgres bersama (psycopg2)
├── eval/ragas_eval.py           # build_eval_samples + run_ragas_evaluation
├── ingestion/                    # matrix_parser, led_chunker, led_docx_chunker, lkps_loader,
│                                    evidence_chunking/excel/mineru/pipeline
├── vectorstore/                  # pgvector_store (LED), pgvector_evidence_store (evidence)
├── llm/                          # ollama_client (round-robin multi-endpoint), chat_model
├── excel/                        # reader (Laporan AK), writer
├── scripts/                      # run_benchmark, analyze_benchmark, fetch_indicator_context, dst.
├── tests/                        # struktur mirror source, pytest
├── generation-prototype/         # prototipe alur GENERASI_BAB (di-sync dari led-wiriting(dimas))
├── document_catalog.py           # katalog statis dokumen untuk rekomendasi (bukan RAG lagi)
├── worker.py                      # entrypoint worker BullMQ (6 job handler, 3 queue)
├── main.py                        # entrypoint FastAPI
└── Dockerfile

data/                             # runtime, bind-mount, gitignored
├── rubric_cache/                 # matrix.json hasil parse Matriks Penilaian (shared, bukan per-tenant)
└── uploads/{tenant_id}/{dokumen_id}/   # LED/LKPS/laporan per dokumen
```

---

## Setup awal

Dari root monorepo (`AI-LED-dev-v1/`), bukan dari `apps/ai/` — lihat README
root untuk urutan lengkap (`docker compose up -d postgres redis`, migrasi
Prisma, lalu service ini):

```bash
docker compose up -d --build ai ai-worker
```

Env var dibaca dari `apps/ai/.env` (lihat `.env.example` untuk daftar
lengkap + penjelasan tiap variabel dalam Bahasa Indonesia) — `DATABASE_URL`
dan `REDIS_URL` **harus** sama dengan yang dipakai `apps/backend`, karena
keduanya baca/tulis tabel dan antrean yang sama.

API: <http://localhost:8000> · Scalar API reference: `/reference` · Swagger UI: `/docs`.

---

## Variabel `.env` penting

| Variabel | Keterangan |
|---|---|
| `LLM_PROVIDER` | `ollama` atau `openrouter` — backend LLM assessment |
| `OLLAMA_BASE_URL` | Bisa daftar beberapa endpoint dipisah koma (1 alamat = 1 GPU) — round-robin per panggilan |
| `OLLAMA_MODEL` | Bisa daftar beberapa model dipisah koma; yang pertama jadi default, semua muncul di dropdown model-select |
| `OLLAMA_TIMEOUT_SECONDS` | Diteruskan ke `client_kwargs` tiap `ChatOllama` (graph.py x2, reasoning_graph.py, ragas_eval.py) — request macet ke Ollama akan timeout, bukan hang selamanya |
| `RAGAS_PROVIDER` / `RAGAS_*` | Config judge RAGAS — sengaja terpisah dari model assessment untuk benchmark yang adil |
| `DATABASE_URL` | Postgres monorepo (Prisma) — **sama dengan** `apps/backend/.env`, dipakai `db/postgres_client.py` untuk assessment_sessions/indicator_results/reasoning_steps dan `db/generation_client.py` untuk jalur GENERASI_BAB |
| `REDIS_URL` | Antrean BullMQ yang sama dipakai `apps/backend` — worker.py butuh ini buat konsumsi job |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` | Sama dengan `R2_*` di `apps/backend/.env` — worker.py unduh berkas Bukti Dukung dari sana |
| `ASSESSMENT_MAX_PARALLEL` | Batas concurrency (`asyncio.Semaphore`) untuk menilai banyak indikator sekaligus |
| `RUBRIC_CACHE_PATH` / `UPLOAD_DIR` | Path state on-disk di bawah `data/` |
| `HF_TOKEN` | Opsional, mempercepat download model embedding saat build image |

---

## Cara kerja sistem (agent per-indikator)

Tiap indikator dinilai lewat satu invocation graph LangGraph independen —
tidak ada state yang dibagi antar-indikator, bisa dijalankan paralel
(`ASSESSMENT_MAX_PARALLEL`). `build_graph_auto` memilih graph berdasarkan
nama model (`deepseek-r1`/`qwq`/`o1-`/dst dianggap model reasoning →
`reasoning_graph.py`, selain itu → `graph.py`):

| # | Node | Yang terjadi |
|---|---|---|
| 1 | `agent` | Panggil LLM dengan riwayat pesan saat ini. LLM boleh manggil tool atau langsung kasih jawaban final. |
| 2 | `tools` | Jalankan tool yang diminta (`get_indicator_rubric`, `search_led_evidence`, `get_lkps_table`, `compute_formula_score`, `search_evidence_documents`), catat sumbernya ke `sources_used`, sambung hasil ke riwayat pesan, balik ke node `agent`. |
| 3 | `checklist` (sekali, setelah tool round pertama) | LLM susun checklist 4-8 poin dari rubrik untuk dicek, **plus** otomatis fetch dokumen evidence yang sudah di-tag ke indikator ini (tidak menunggu LLM inisiatif — LKPS/formula punya sinyal eksplisit di rubrik untuk dipanggil, evidence tidak, jadi harus dipaksa). |
| 4 | `force` (maks 2x) | Kalau LLM belum kasih jawaban final berformat benar, belum pernah manggil satu tool pun, atau indikator quantitative/composite selesai tanpa pernah manggil `compute_formula_score`, kasih nudge spesifik dan ulangi. |
| 5 | `parse_output` / `finalize` | Ekstrak SKOR/JUSTIFIKASI/CONFIDENCE/REKOMENDASI dari jawaban final. Pencarian nilai SKOR dibatasi ke teks sebelum label JUSTIFIKASI/CONFIDENCE/REKOMENDASI pertama — supaya rumus yang disebut ulang di dalam justifikasi tidak ketuker jadi skor akhir. |
| 6 | `decimal_refine` | Untuk indikator **qualitative**: hitung interpolasi desimal proporsional antar-band (mis. 3.5) lewat 2 panggilan LLM kecil yang terstruktur (diff kriteria band, verifikasi tiap aspek vs bukti) — dihitung di Python, bukan dipercaya dari teks bebas model. Indikator **quantitative/composite** melapor hasil rumus apa adanya (boleh desimal), tidak dibulatkan. |
| 7 | `judge` | Model terpisah (config `RAGAS_*`) mengecek apakah justifikasi benar-benar didukung bukti yang di-retrieve — menurunkan confidence kalau tidak, tidak pernah memblokir hasil. |
| 8 | `give_up` / `error_node` | Kalau tetap gagal setelah semua retry, error eksplisit disimpan lewat node nyata (bukan router conditional-edge — LangGraph tidak mem-persist mutation dari router) — tidak pernah diam-diam kasih hasil kosong/salah. |

**Sumber bukti** (`sources_used`) — LED chunk (halaman/paragraf/section),
tabel LKPS, dan entitas dokumen evidence yang benar-benar diambil lewat tool
call — disimpan per-hasil (kolom `IndicatorResult.sourcesUsed`, JSONB)
untuk audit trail ("skor ini berdasar sumber mana"), di-expose lewat
`GET /assessment/{id}/results`.

**Evaluasi RAGAS** — proses terpisah, tidak pakai tool-calling. Justifikasi
nyata (kalau `session_id` diisi) atau sintetis diukur terhadap konteks yang
dibangun ulang lewat kode Python (`build_eval_samples`): LED + evidence
document + tabel LKPS (untuk indikator quantitative) — retrieval-nya
konsisten dengan apa yang benar-benar dilihat agent, bukan query baru.

---

## Struktur database (ringkas)

Dikelola Prisma di `packages/db/prisma/schema.prisma` — `apps/ai` **tidak**
punya migrasi sendiri, hanya baca/tulis lewat `db/postgres_client.py`:

- **`AssessmentSession`** (`assessment_sessions`) — satu baris per
  `/assessment/start`: `status`, `totalIndicators`/`completedIndicators`,
  `ledSource`/`ledFileName`, scoped ke `tenantId`+`documentId`
- **`IndicatorResult`** (`assessment_indicator_results`) — satu baris per
  indikator per sesi: `score`, `justification`, `confidence`,
  `recommendation`, `model` (LLM yang menilai indikator ini), `sourcesUsed`
  (JSONB, lihat di atas)
- **`ReasoningStep`** (`assessment_reasoning_steps`) — log chain-of-thought
  per indikator (checklist, evidence auto-check, judge verdict, dst.),
  untuk debugging/transparansi

Tidak ada Supabase — `eval/ragas_eval.py::build_eval_samples` juga baca
justifikasi nyata (`session_id`) dari `db.postgres_client.get_indicator_
results()`, tabel yang sama dengan jalur assessment live. Sisa arsitektur
`ariel` (`db/supabase_client.py`, `db/migrate.py`, `db/verify_schema.py`,
migrasi SQL lama) sudah dihapus sepenuhnya — DDL cuma lewat Prisma di
`packages/db`.

---

## Endpoint API

### `/upload` — dokumen input

| Method | Path | Keterangan |
|---|---|---|
| GET | `/upload/status?tenant_id=&dokumen_id=` | Status semua dokumen untuk satu (tenant, dokumen) — auto-recover dari disk/pgvector kalau backend baru restart |
| POST | `/upload/matrix` | Upload Matriks Penilaian (PDF) — parse + cache rubrik. **Tidak** tenant-scoped, shared national reference data |
| POST | `/upload/led` | Upload LED (.pdf/.docx) — chunking + indexing ke pgvector di background |
| POST | `/upload/lkps` | Upload LKPS (Excel) — load ke registry, scoped per (tenant, dokumen) |
| POST | `/upload/laporan` | Upload Laporan AK (Excel) — tentukan subset indikator yang dinilai |

Upload dokumen Bukti Dukung **tidak** lewat sini — itu jalur NestJS
(`apps/backend`'s modul `bukti-dukung` + presigned R2), lalu di-enqueue ke
`ingestion-queue` untuk diekstrak `worker.py`.

### `/assessment` — penilaian AMI

| Method | Path | Keterangan |
|---|---|---|
| GET | `/assessment/models` | Model assessment yang tersedia |
| GET | `/assessment/indicators` | List ringkas indikator dari `matrix.json` ter-cache — bootstrap source `seed-rubric-criteria.ts`, **jangan** dialihkan ke Postgres atau seed script jadi sirkular |
| POST | `/assessment/start` | Mulai pipeline penilaian (background task), balikin `session_id` |
| POST | `/assessment/{session_id}/resume` | Lanjutkan sesi yang terhenti |
| GET | `/assessment/list` | Riwayat sesi |
| GET | `/assessment/{session_id}/status` | Status + progress satu sesi |
| GET | `/assessment/{session_id}/results` | Hasil lengkap per indikator + `model` + `sourcesUsed` |

### `/eval` — evaluasi RAGAS

| Method | Path | Keterangan |
|---|---|---|
| POST | `/eval/run` | Mulai evaluasi RAGAS (background task); `session_id` opsional untuk pakai justifikasi nyata dari sesi assessment tersebut |
| GET | `/eval/models` | Model judge yang tersedia |
| GET | `/eval/config?session_id=` | Config judge + model assessment aktif — kalau `session_id` diisi, `assessment_model` diambil dari model yang beneran menilai sesi itu (`IndicatorResult.model`) |
| GET | `/eval/list` | Riwayat semua run RAGAS di proses ini |
| GET | `/eval/{eval_id}/results` | Skor + progress satu run, termasuk `assessor_model` (model yang dinilai, per-sesi) terpisah dari `model` (judge) |

### `/chat` — chat revisi bab (jalur GENERASI_BAB, bukan AMI assessment)

| Method | Path | Keterangan |
|---|---|---|
| GET | `/chat/{bab_id}/history` | Riwayat chat revisi untuk satu bab |
| POST | `/chat/{bab_id}` | Kirim pesan revisi (SSE token stream) |

---

## Worker (`worker.py`)

Konsumen BullMQ, 3 antrean (`QUEUE_NAMES`), 7 job handler:

| Queue | Job Type | Handler |
|---|---|---|
| `generation-queue` | `GENERASI_OUTLINE_BAB` | `_handle_generasi_outline_bab` — LLM menyusun daftar section (sub-bab) per bab, dituntun kelompok kriteria rubrik |
| `generation-queue` | `GENERASI_BAB` | `_handle_generasi_bab` — generate narasi SATU section (payload wajib `sectionId`); hasil semua section GENERATED digabung otomatis jadi checkpoint bab |
| `generation-queue` | rekomendasi dokumen | `_handle_rekomendasi_dokumen` |
| `generation-queue` | simulasi skor rubrik | `_handle_simulasi_skor` |
| `assessment-queue` | `ASSESSMENT_AMI` | `_handle_assessment_ami` — jalankan pipeline penilaian penuh |
| `ingestion-queue` | `INGESTION_BUKTI_DUKUNG` | `_handle_ingestion_bukti_dukung` — unduh dari R2, ekstrak (MinerU), embed ke pgvector |
| `ingestion-queue` | `INGESTION_RUBRIK_DOKUMEN` | `_handle_ingestion_rubrik_dokumen` — auto-parse PDF rubrik jadi kriteria |

---

## Scripts

```bash
# Benchmark model lintas kombinasi (model, indikator)
python -m scripts.run_benchmark
python -m scripts.run_benchmark --indicators 1,2,4,7 --models qwen3.6:35b,deepseek-r1:32b

# Bandingkan hasil vs ground truth — MAE, exact-match, ±1-accuracy, Pearson r
python -m scripts.analyze_benchmark

# Ambil konteks rubrik untuk indikator tertentu (debugging)
python -m scripts.fetch_indicator_context 1 2 4 5
```

---

## Pengembangan & test

```bash
# Test — butuh venv lokal (poppler-utils + dependency Python), atau di dalam container
pytest
pytest tests/agent/test_graph.py -k "decimal"

# Test yang butuh Postgres/pgvector nyala (di-skip otomatis kalau DATABASE_URL tidak di-set)
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/ai_led?schema=public" pytest
```

### Troubleshooting singkat

- **`ImportError: libGL.so.1`** saat ekstraksi evidence — MinerU butuh
  `libgl1`+`libglib2.0-0`, sudah ada di `Dockerfile`.
- **Model reasoning (deepseek-r1) sering gagal manggil tool** — native
  tool-calling untuk model reasoning terbukti kurang reliable dibanding
  protokol JSON manual (`reasoning_graph.py`) — jangan paksa native tanpa
  uji ulang.
- **`GET /assessment/indicators` vs Postgres** — endpoint ini sengaja tetap
  baca `matrix.json`, bukan `RubricCriterion` per-set — itu bootstrap source
  `seed-rubric-criteria.ts`, mengalihkannya bikin seed script sirkular.

Lihat `../../AGENTS.md` dan `../../docs/` di root monorepo untuk arsitektur
lengkap lintas service.
