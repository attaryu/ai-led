# LED Generator — Web App

Aplikasi web untuk menyusun **Laporan Evaluasi Diri (LED)** akreditasi
program studi secara semi-otomatis. Sistem membaca outline LED resmi
(~210 section: BAB → sub-bab → poin), menjalankan pipeline RAG berbasis
LLM lokal (Ollama) melalui dua tahap — **rekomendasi dokumen bukti dukung**
lalu **penulisan narasi** — dan menampilkan hasilnya di editor rich-text
tiga panel.

Multi-dokumen: satu program studi bisa mengelola beberapa `dokumen_led`
sekaligus (mis. draft tahun berjalan + arsip tahun lalu).

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Kembali   │ Model: deepseek-r1:32b ▾   Hapus draft        ●Ollama      │
├──────────────┬─────────────────────────────────────┬─────────────────────┤
│ Outline      │ Document Pane                        │ Dokumen Pendukung │
│ (~210 entri) │                                       │ Draft             │
│              │ Rekomendasikan Dokumen /             │ Query             │
│ BAB I        │ Konfirmasi & Tulis Narasi /           │ Pedoman           │
│  └ 1) …      │ Regenerate / Edit / Approve           │ LKPS              │
│ BAB II       │                                       │ Kualitas AI       │
│  ├ A. Tim…   │ Editor TipTap (rich-text, bukan       │ Chat              │
│  └ C. …      │ markdown mentah)                      │                   │
└──────────────┴─────────────────────────────────────┴─────────────────────┘
```

---

## Stack

| Lapisan | Teknologi |
|---|---|
| **Backend API** | FastAPI · Python 3.12 · container `led-api` (port 8000) |
| **Worker ekstraksi** | RQ (Redis Queue) · container `led-worker` — proses dokumen upload async (MinerU + LibreOffice + openpyxl), terpisah dari API supaya API tetap responsif |
| **Frontend** | React 18 + Vite 5 + Tailwind 3 · container `led-web` (port 5173) |
| **Editor narasi** | TipTap (ProseMirror) — rich-text, bukan markdown string atau `<textarea>` mentah |
| **State DB** | PostgreSQL 16 · container `led-postgres` (23 tabel) |
| **Queue/broker** | Redis 7 · container `led-redis` |
| **Vector DB** | ChromaDB (file-based di `data/chroma_db/`) — koleksi: `pedoman`, `rubric`, `lkps`, `evidence`, `document_registry` |
| **Embedding** | `BAAI/bge-m3` (multilingual, 1024-dim) — di-cache di `data/hf_cache/` |
| **LLM synthesis** | Ollama — `deepseek-r1:32b` atau `qwen3.5:35b` (remote/local) |
| **LLM judge** | Ollama — `gpt-oss:20b` (deterministic, JSON output) |
| **Tracing** | LangSmith (opsional) |

---

## Struktur direktori

```
web/
├── api/
│   ├── main.py                # registrasi router + /health
│   ├── worker_tasks.py        # job RQ process_document (dijalankan container worker)
│   ├── routes/                # led_documents, sections, chat, documents, me
│   ├── lib/
│   │   ├── generator.py       # recommend_chain + generate_chain (LCEL)
│   │   ├── prompts.py         # semua template prompt LLM
│   │   ├── prose.py           # konversi teks LLM <-> ProseMirror/TipTap JSON
│   │   ├── retrieval.py       # wrapper search_* ke Chroma
│   │   ├── outline.py         # bangun outline dari led_bab_tabel.json
│   │   ├── context.py         # resolve system user/tenant/prodi, dokumen_led CRUD
│   │   ├── auth.py            # guard akses berbasis role
│   │   ├── ollama_client.py   # wrapper LLM Ollama per-tahap
│   │   ├── db.py              # connection pool Postgres
│   │   └── extraction/        # pipeline ekstraksi dokumen (MinerU/LibreOffice/Excel)
│   ├── scripts/                # migrasi DB + import data notebook (lihat bawah)
│   ├── db/schema.sql
│   ├── Dockerfile              # image API (uvicorn)
│   ├── Dockerfile.worker       # image worker (+ LibreOffice, MinerU)
│   └── requirements.txt
├── web/                        # React frontend
│   └── src/
│       ├── components/         # Outline, DocumentPane, ProseEditor, RecommendationPanel,
│       │                       # SectionInfoPane, ChatPane, LedToolbar, Sidebar, ErrorBoundary, dst.
│       ├── pages/               # LedListPage, LedEditorPage, DocumentsPage, DocumentDetailPage
│       └── lib/                 # api.js (fetch client), store.js (zustand)
├── data/                       # runtime (di-mount; di-gitignore)
│   ├── chroma_db/
│   ├── hf_cache/
│   └── led.db                  # arsip SQLite lama, tidak dipakai lagi
├── led_bab_tabel.json          # struktur outline LED (210 heading), sumber outline.py
├── docker-compose.yml
├── .env.example
└── rancangan.txt               # catatan kerja/rancangan fitur (scratch, bukan dokumentasi resmi)
```

---

## Prasyarat

- Docker + Docker Compose v2 (`docker compose version`)
- Akses ke Ollama dengan model:
  - `deepseek-r1:32b` atau `qwen3.5:35b` (synthesis)
  - `gpt-oss:20b` (judge)
  - Cek: `curl http://<OLLAMA_HOST>/api/tags`
- `led_bab_tabel.json` (struktur outline LED) di root `web/`
- GPU NVIDIA (opsional untuk embedding & MinerU lebih cepat — auto-detect, atau set `EMBEDDING_DEVICE=cpu`)

---

## Setup awal

```bash
cd /home/dimas/proyek-akhir/web

# 1. Salin .env dan isi OLLAMA_HOST + OLLAMA_TOKEN
cp .env.example .env
vi .env

# 2. Build images (api, worker, web)
docker compose build

# 3. Jalankan stack (postgres+redis health-check dulu, baru api/worker/web)
docker compose up -d

# 4. Migrasi & seed data awal (sekali, di dalam container api)
docker compose exec api python scripts/migrate_to_postgres.py
docker compose exec api python scripts/import_chunks.py
docker compose exec api python scripts/import_document_registry.py
```

UI: <http://localhost:5173> · API: <http://localhost:8000> · health: <http://localhost:8000/health>

> Schema (`api/db/schema.sql`) otomatis diterapkan **hanya** saat volume
> `pgdata` masih kosong (first boot). Untuk DB yang sudah berjalan lama,
> perubahan skema diterapkan manual lewat script `scripts/migrate_add_*.py`
> (idempotent, aman dijalankan berulang) — lihat daftar di bawah.

---

## Variabel `.env` penting

| Variabel | Default | Keterangan |
|---|---|---|
| `OLLAMA_HOST` | `http://host.docker.internal:11434` | URL Ollama (lokal/remote) |
| `OLLAMA_TOKEN` | — | Bearer token kalau Ollama remote (Vast.ai/RunPod) |
| `JUDGE_MODEL` | `gpt-oss:20b` | Model untuk evaluasi RAGAS |
| `RUBRIK_WRITING` | `true` | Set `false` untuk skip rubrik penilaian **sepenuhnya** — checklist, narasi, judge, dan rekomendasi dokumen semua jalan murni dari pedoman + fakta, tanpa acuan rubrik |
| `EMBEDDING_MODEL` | `BAAI/bge-m3` | HF model id, harus konsisten dgn hasil index Chroma |
| `EMBEDDING_DEVICE` | (auto) | `cpu` untuk paksa CPU |
| `PEDOMAN_COLLECTION` | `pedoman` | Alternatif `pedoman_new` (chunking dinamis, embed heading saja) |
| `LANGCHAIN_TRACING_V2` | `false` | `true` untuk kirim trace ke LangSmith |
| `LANGCHAIN_API_KEY` | — | API key LangSmith |
| `GROQ_API_KEY` | — | Dipakai `scripts/evaluate.py` (eval RAGAS) |

`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` (default `led`/`led`/`led`) juga bisa dioverride.

> ⚠️ `.env` di-gitignore — jangan commit token.

---

## Cara kerja sistem (2 tahap, per subbab)

Tiap subbab LED disusun lewat **dua LCEL chain terpisah** di
`api/lib/generator.py`, dengan jeda user di antaranya (pilih dokumen bukti
dukung). Level **BAB** (Heading 1) murni container/judul — tidak pernah
punya narasi sendiri, hanya sub-bab ke bawah yang bisa digenerate.

### Tahap A — Rekomendasi Dokumen (`recommend_chain`)

Dipicu tombol **"Rekomendasikan Dokumen"** pada subbab yang belum punya
draft. Hasil akhirnya: draft **kosong** (status `EMPTY`) yang nanti diisi
di Tahap B, plus kartu rekomendasi jenis dokumen di tab "Dokumen Pendukung".

| # | Tahap | Yang terjadi |
|---|---|---|
| 1 | `r01_route` | Ambil judul + breadcrumb (BAB → sub-bab → poin) subbab dari outline sebagai konteks. |
| 2 | `r02_retrieve_rules` | Cari cuplikan **pedoman** penulisan (+ **rubrik**, kalau `RUBRIK_WRITING=true`) paling relevan dari vector DB. |
| 3 | `r03_route_and_plan` | LLM susun daftar kata kunci pencarian dokumen bukti (`document_query`) dari isi pedoman. Kebutuhan **LKPS** ditentukan lewat regex (bukan LLM) — pedoman LAM Teknik selalu eksplisit menyebut "(Tabel X.Y LKPS)" kalau memang butuh data itu, jadi ini gate keras dua arah, bukan sekadar hint ke LLM. |
| 4 | `r04_retrieve_lkps` | Kalau memang butuh LKPS, cari data LKPS relevan dari vector DB. |
| 5 | `r05_search_registry` | Cari folder dokumen kandidat di Document Registry pakai `document_query` (folder yang jaraknya terlalu jauh/tidak relevan otomatis dibuang). |
| 6 | `r06_assess_and_recommend` | LLM nilai kecukupan data LKPS + susun kartu "Dokumen yang direkomendasikan" (jenis dokumen, bukan nama file mentah). |
| 7 | `r06b_topup_registry` | Kalau LKPS ternyata kurang & ada query tambahan, cari lagi folder kandidat dari query itu. |
| 8 | `r07_save` | Buat `bab_dokumen` + `bab_draft` **kosong**, kaitkan pedoman/rubrik/LKPS yang dipakai ke draft itu, simpan kartu rekomendasi. |

User lalu memilih dokumen yang sudah ada dan/atau mengunggah dokumen baru,
lalu klik **"Konfirmasi & Tulis Narasi"**.

### Tahap B — Tulis Narasi (`generate_chain`)

Mengisi draft kosong yang dibuat Tahap A.

| # | Tahap | Yang terjadi |
|---|---|---|
| 1 | `01_route` | Sama seperti Tahap A langkah 1. |
| 2 | `02_retrieve_rules` | Sama seperti Tahap A langkah 2 (retrieval independen, tidak berbagi hasil dengan Tahap A). |
| 3 | `03_build_checklist` | LLM susun daftar pertanyaan faktual (maks 8) yang harus terjawab, berdasarkan pedoman+rubrik. |
| 4 | `04_retrieve_facts` | Untuk tiap poin checklist: cari data LKPS (kalau dibutuhkan) dan isi dokumen Evidence — **hanya** dari dokumen yang sudah dikonfirmasi user di Tahap A, bukan blanket search. |
| 5 | `05_synthesize` | LLM tulis narasi final dari pedoman + rubrik + checklist + seluruh fakta. Hasil teks dikonversi jadi dokumen ProseMirror (`lib/prose.py::text_to_doc`) sebelum disimpan. |
| 6 | `06_judge` | Model evaluator terpisah (`JUDGE_MODEL`) menilai narasi dengan 4 metrik ala RAGAS: faithfulness, answer relevancy, context precision, context recall. |
| 7 | `07_save_db` | Narasi + checklist + referensi chunk + hasil judge disimpan ke draft yang sama; status berubah jadi `FILLED`. |

Sifat pipeline saat ini: **urutan tahap tetap** untuk semua subbab, tiap
tahap jalan tepat sekali (kecuali top-up LKPS yang sudah kondisional), dan
skor judge murni informatif — belum memicu retry otomatis.

### Chat revisi

Panel "Chat" mengirim draft aktif (di-flatten ke plain text) + pesan user
ke LLM, streaming token demi token lewat SSE persis seperti proses normal.
Setelah stream selesai, hasilnya dikonversi sekali ke ProseMirror JSON dan
menimpa draft aktif.

---

## Model akses (role)

Belum ada login sungguhan — semua request dianggap berasal dari satu
**system user** statis. Akses ke LED diatur oleh role user itu di database:

| Role | Akses LED |
|---|---|
| `ADMIN` | Tidak ada akses sama sekali (403 di semua method) |
| `PIMPINAN` | Read-only (GET saja, method lain 403) |
| `PENJAMIN_MUTU` | Akses penuh |
| `PENYUSUN` | Akses penuh |

Endpoint `/documents` (upload/kelola dokumen bukti dukung) **tidak**
dibatasi role.

---

## Struktur database (ringkas)

23 tabel di `api/db/schema.sql`, dikelompokkan:

- **Organisasi/User**: `tenant`, `program_studi`, `app_user`
- **Dokumen LED**: `dokumen_led`, `bab_dokumen` (checkpoint aktif per section+model), `bab_draft` (versi snapshot, status `EMPTY`/`FILLED`), `bab_chat_message`, `bab_referensi_chunk`
- **Evidence**: `bukti_dukung`, `bukti_dukung_bab`, `bukti_dukung_draft`, `chunk_bukti_dukung`, `document_registry`, `bab_document_recommendation`, `bab_recommendation_item`
- **Scoring**: `rubrik_kriteria`, `rubrik_kriteria_bab`, `hasil_skor_kriteria`
- **Referensi**: `panduan_referensi`, `panduan_detail`, `panduan_detail_bab`
- **LKPS**: `lkps`, `lkps_detail`

Poin penting: `bab_document_recommendation` **dimiliki oleh draft**
(`bab_draft_id`, `ON DELETE CASCADE`) — bukan oleh section. Klik
"Rekomendasikan Dokumen" pada section kosong langsung membuat draft
kosong; hapus draft otomatis membersihkan rekomendasinya juga, sehingga
section bisa minta rekomendasi baru dari nol tanpa mempengaruhi draft lain.

---

## Endpoint API

| Method | Path | Keterangan |
|---|---|---|
| GET | `/health` | Status API + Postgres + Ollama |
| GET/POST | `/led-documents` | List / buat dokumen LED |
| GET | `/led-documents/{id}` | Detail 1 dokumen LED |
| GET | `/me` | Profil + role user aktif |
| GET | `/led-documents/{id}/sections?model=…` | Outline + status draft per section |
| GET | `/led-documents/{id}/sections/{sid}` | Detail draft section |
| GET | `/led-documents/{id}/sections/{sid}/draft-versions` | Histori versi draft |
| POST | `/led-documents/{id}/sections/{sid}/draft-versions/empty` | Buat versi draft kosong manual |
| POST | `/led-documents/{id}/sections/{sid}/draft-versions/{vid}/duplicate` | Simpan sebagai draft baru |
| POST | `/led-documents/{id}/sections/{sid}/draft-versions/{vid}/activate` | Jadikan draft aktif |
| DELETE | `/led-documents/{id}/sections/{sid}/draft-versions/{vid}` | Hapus 1 versi draft |
| GET/POST | `/led-documents/{id}/sections/{sid}/recommend` | Ambil / trigger rekomendasi dokumen (Tahap A) |
| POST | `/led-documents/{id}/sections/{sid}/recommend/confirm` | Konfirmasi dokumen bukti dukung |
| POST | `/led-documents/{id}/sections/{sid}/generate` | Trigger penulisan narasi (Tahap B) |
| PUT | `/led-documents/{id}/sections/{sid}/draft` | Edit manual draft |
| POST | `/led-documents/{id}/sections/{sid}/approve` | Tandai approved |
| DELETE | `/led-documents/{id}/sections/{sid}` \| `/sections` | Hapus draft 1 section / semua |
| GET/POST | `/led-documents/{id}/sections/{sid}/chat` | Riwayat / stream chat revisi (SSE) |
| GET | `/documents` | List semua dokumen (evidence + pedoman + LKPS) |
| GET | `/documents/registry` | List folder Document Registry |
| POST | `/documents/upload` | Upload file/folder (async, via worker) |
| GET | `/documents/{id}` \| `/{id}/chunks` | Detail dokumen / chunk hasil ekstraksi |
| DELETE | `/documents/{id}` | Hapus dokumen |

---

## Scripts

### Migrasi & seed (`api/scripts/`)

```bash
# Seed awal: user/tenant/prodi + outline 210 section (sekali, DB baru)
docker compose exec api python scripts/migrate_to_postgres.py

# Import pedoman/rubrik/LKPS hasil notebook ekstraksi
docker compose exec api python scripts/import_chunks.py

# Import Document Registry (folder-level evidence index)
docker compose exec api python scripts/import_document_registry.py

# Migrasi skema tambahan (idempotent, hanya perlu di DB lama yg sudah berjalan
# sebelum fitur terkait ditambahkan — DB baru dapat semuanya dari schema.sql)
docker compose exec api python scripts/migrate_add_document_registry.py
docker compose exec api python scripts/migrate_add_draft_owned_recommendation.py
docker compose exec api python scripts/migrate_add_recommendation_chunks.py
docker compose exec api python scripts/migrate_add_recommendation_items.py
docker compose exec api python scripts/migrate_add_selected_bukti_dukung.py

# Migrasi data narasi lama (string markdown) -> ProseMirror JSON
docker compose exec api python scripts/migrate_prose_to_tiptap.py

# Perbaikan data (kasus khusus, lihat komentar di masing-masing file)
docker compose exec api python scripts/fix_konten_field.py
docker compose exec api python scripts/purge_evidence.py --dry-run
docker compose exec api python scripts/reimport_rubrik.py
```

### Evaluasi RAGAS

```bash
docker compose exec api pip install -r requirements-eval.txt
docker compose exec api python scripts/evaluate.py
```

---

## Pengembangan

```bash
# Hot reload — kode di api/ dan web/ di-mount sebagai volume
docker compose up

# Lihat log
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f web

# Restart 1 service tanpa rebuild
docker compose restart api

# Rebuild (perlu setelah ubah requirements.txt/package.json/Dockerfile)
docker compose build api
docker compose up -d api
```

### Troubleshooting singkat

- **`nvidia-cudnn-cu12` gagal saat build** — index NVIDIA kadang tidak lagi
  menghost versi lama; `Dockerfile`/`Dockerfile.worker` sudah pakai
  `--extra-index-url https://pypi.org/simple` sebagai fallback ke PyPI resmi.
- **Akses dari IP LAN kena CORS** — `api/main.py` pakai `allow_origin_regex`
  yang menerima `http://<localhost|127.0.0.1|IP apapun>:5173`.
- **Ganti `EMBEDDING_MODEL`** — dimensi embedding harus konsisten index-time
  vs query-time; hapus `data/chroma_db` dan import ulang chunk kalau ganti model.
- **Ollama tidak reachable dari container** — lokal pakai
  `OLLAMA_HOST=http://host.docker.internal:11434` (sudah ada `extra_hosts`
  di compose untuk Linux); remote set `OLLAMA_HOST`+`OLLAMA_TOKEN`.

Lihat `rancangan.txt` untuk catatan kerja/rancangan fitur yang sedang berjalan
(bukan dokumentasi resmi — isinya berubah-ubah seiring diskusi).
