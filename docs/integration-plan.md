# 2-Week Integration Plan — `dev-v1`

Target: one repository, one PostgreSQL database, one AI service, one UI.
Written against the actual code in `AI-LED-develop`, `AI-LED-ariel`, `AI-LED-dimas` as of 2026-08-12.

---

## 0. Findings that change the brief

Read this section first. Three assumptions in the original brief do not hold, and each one moves several days of work.

### 0.1 `develop` has no backend and no database

`apps/web` is a **React Router v8 framework-mode** app (not Remix — `react-router@^8`, `@react-router/dev`, `routes.ts`). Its entire data layer is `localStorage` plus mocks:

- `app/features/*/data/sources/local/*.ts` → `localStorage.getItem('chapter_data_v2')`
- `app/features/*/data/sources/remote/*.mock.ts` → `setTimeout` fakes (`GENERATE_DELAY_MS = 2800`)
- No Prisma, no Drizzle, no `pg`, no SQL file anywhere in the tree.

`docs/database.md` (15 tables) and `docs/architecture.md` (NestJS + Redis + worker + R2) are **design documents, not implementations**. So "merge into the main app's PostgreSQL" is really "stand up the PostgreSQL that the docs describe, then point three codebases at it."

Good news: the domain layer is excellent and already correct. `chapter.entity.ts`, `chapter-draft.entity.ts`, `ragas-score.entity.ts`, `chapter-score.entity.ts` are zod schemas that map almost 1:1 onto the target tables. The repositories (`chapterRepository`, `chapterDraftRepository`, `chapterScoreRepository`) are a clean seam: **swap the source under the repository and the entire presentation layer keeps working untouched.** That seam is the single biggest reason 2 weeks is realistic.

### 0.2 Drop NestJS. Use the React Router server as the main backend

`docs/architecture.md` specifies NestJS main thread + second thread + Redis streams + Cloudflare R2. None of it exists. Building it costs ~2 of your 2 weeks and buys nothing an MVP can measure.

React Router v8 framework mode already ships the server that document describes: loaders/actions are the REST layer, cookie sessions are auth, and it is already deployed as `react-router-serve`. Recommendation:

| Doc says | Build instead | Add the doc version when |
|---|---|---|
| NestJS main thread | RR v8 loaders/actions + Prisma | Team needs a non-web API consumer (mobile, external LMS) |
| NestJS second thread | FastAPI writes results to Postgres directly | Write contention or you need business validation on job results |
| Redis job stream | `jobs` table + FastAPI `BackgroundTasks` + 2s polling | More than one FastAPI replica |
| Redis pub/sub → SSE | Poll `GET /jobs/:id`; SSE only for chat token streaming | Job counts make polling expensive |
| Cloudflare R2 presigned upload | Local volume / S3-compatible bucket behind one `storage.ts` | Production traffic |

Both existing FastAPI services *already* use the background-task-plus-poll pattern (`POST /assessment/start` → `GET /assessment/{id}/status`), so this is not a downgrade — it is adopting what already works.

**This decision needs your explicit sign-off in Week 1 Day 1.** Everything below assumes it. If you want NestJS, the plan becomes 6–7 weeks and Weeks 2–3 change completely.

### 0.3 Most of Dimas's UI does not need porting — `develop` already supersedes it

| Dimas component | Equivalent already in `develop` | Action |
|---|---|---|
| `DocumentPane.jsx` | `chapter-editor-canvas.tsx` (TipTap) | Discard |
| `Outline.jsx` | `chapter-editor-toc.tsx` | Discard |
| `TopBar.jsx` | `chapter-editor-header.tsx` + `-toolbar.tsx` | Discard |
| `Toaster.jsx` | `core/components/ui` (Base UI) | Discard |
| `ConfirmDialog.jsx` | `core/components/ui` | Discard |
| `ChatPane.jsx` | **nothing** — `grep -ri chat app/` returns zero hits | **Port (the only real port)** |
| `lib/api.js` `streamChat` | — | Port the SSE reading logic into a hook |

Same for Ariel's Next.js frontend: `results-table.tsx`, `progress-panel.tsx`, `history-panel.tsx`, `ragas-panel.tsx` are the only pieces with no `develop` counterpart, and they belong in a new `features/ami-assessment/` folder rather than being copied file-for-file (they are Next.js + a different `ui/` primitive set).

The editor already has six tabs (`chapter-editor-panels.tsx`): Draft, Generasi, Rujukan, Rubrik, **Kualitas AI**, Review. Chat becomes a seventh. Every one of those tabs is currently fed by a mock — the integration work is *filling them*, not building them.

### 0.4 The merge itself is nearly conflict-free

All three branches live in one remote. Their root directories barely overlap:

```
develop : apps/  docs/  AGENTS.md  .gitignore  .graphifyignore
ariel   : backend/  frontend/  data/  paper/  docker-compose.yml  .env.example  .gitignore
dimas   : api/  web/  scripts/  README.md  docker-compose.yml  .env.example  .gitignore
```

Collisions: `.gitignore` (3×), `docker-compose.yml` (2×), `.env.example` (2×). That is the entire conflict surface. A plain `git merge` preserves all three histories; restructuring happens in a follow-up commit where `git mv` keeps blame intact.

### 0.5 Assumptions this plan makes

1. Team of ~4: 2 web (TS/React Router), 2 AI (Python/RAG). Weeks run two parallel tracks.
2. ORM is **Prisma** — `docs/database.md` is already table-first and Prisma's migration story is the least ceremony for a team that has never had a DB. Drizzle is a fine substitute; the schema below translates directly.
3. **Prisma owns all migrations.** FastAPI reads/writes the same database with SQLAlchemy Core or `asyncpg`, and never runs DDL. One migration owner, no exceptions.
4. Existing SQLite (`led.db`) and Supabase data are **development artifacts**. They get migrated once, for continuity of demos and the paper's benchmark numbers — not as a production data migration.
5. LLM inference stays where it is (Ollama on Vast.ai / OpenRouter). No model work in these 4 weeks.

---

## 1. Target architecture (end of Week 4)

```
                        ┌───────────────────────────────┐
   Browser ──HTTP───────▶  apps/web  (React Router v8)   │
           ◀──SSE────┐  │  loaders/actions = the API     │
                     │  │  Prisma client, cookie session │
                     │  └────────┬──────────────▲────────┘
                     │           │ SQL          │ enqueue job (HTTP)
                     │           ▼              │ + poll status
                     │  ┌────────────────┐      │
                     │  │  PostgreSQL 16 │◀─────┼──────┐
                     │  └────────────────┘      │      │ writes results
                     │                          ▼      │
                     └──token stream───┬──────────────────────────┐
                       (chat only)     │  apps/ai  (one FastAPI)  │
                                       │  /generation  /assessment│
                                       │  shared llm/ + retrieval/│
                                       └────────┬─────────────────┘
                                                ▼
                                    ChromaDB  +  LLM (Ollama/OpenRouter)
```

Two processes, one database, one vector store. Web never calls the LLM. AI service never renders UI.

Target repository layout:

```
apps/
  web/                      # unchanged React Router v8 app
  ai/
    main.py                 # single FastAPI app
    routers/
      generation.py         # ex dimas: sections.py + export.py
      chat.py               # ex dimas: chat.py (SSE)
      assessment.py         # ex ariel: assessment.py
      eval.py               # ex ariel: eval.py
      ingestion.py          # ex ariel: upload.py + dimas index_chunks.py
    agent/                  # ex ariel LangGraph (graph, reasoning_graph, tools)
    lib/                    # ex dimas generator, outline, prompts, retrieval
    llm/                    # ONE client (provider switch from ariel)
    db/                     # SQLAlchemy Core session, read/write helpers, NO DDL
packages/
  db/
    schema.prisma           # single source of truth for the schema
    migrations/
scripts/
  migrate_sqlite_to_pg.py
  migrate_supabase_to_pg.py
  index_chunks.py
docs/
data/                       # chroma_db, uploads, benchmark CSVs
docker-compose.yml          # web, ai, postgres, (chroma is embedded)
```

---

## 2. Unified schema — how the three databases become one

### 2.1 Mapping summary

| Source table | Source DB | Destination | Rationale |
|---|---|---|---|
| `drafts.draft_text` | SQLite | `bab_dokumen.konten_kerja` / `bab_draft.konten_snapshot` | Content already has a home in `docs/database.md`. Do **not** create a `drafts` table. |
| `drafts.*` (rest) | SQLite | **new** `generation_runs` | `pedoman_used`, `rubric_used`, `checklist`, `chunks_used`, `judge_result`, `prompt_full`, `latency_sec`, `token_count` describe *one generate execution*, an entity `docs/database.md` never had. |
| `chat_messages` | SQLite | `chat_messages` (name kept) | Repoint `section_id TEXT` → `bab_id UUID`; add `tenant_id`. |
| `eval_results` | SQLite | `eval_results` (name kept, **offline track only**) | Written by `scripts/evaluate.py`, not by the API. Research artifact for the paper. |
| — | — | **new** `ragas_scores` | Runtime answer-quality per generate run. Closes the gap `docs/database.md §12a` explicitly flags. |
| `assessment_sessions` | Supabase | `assessment_sessions` (name kept) | Add tenant/prodi/dokumen scoping; keep the API contract Ariel's routes already use. |
| `indicator_results` | Supabase | `indicator_results` (name kept) | Add FK to `rubrik_kriteria` so AMI results can render against the product's rubric. |
| `reasoning_steps` | Supabase | `reasoning_steps` (name kept) | Unchanged apart from `session_id` type. |
| — | — | **new** `jobs` | Replaces the Redis stream for the MVP. |
| 15 tables in `docs/database.md` | (doc only) | created as specified | First actual implementation. |

Keeping Ariel's three table names verbatim is deliberate laziness: it keeps `agent/` and the assessment routes readable after the Supabase client is swapped out, and renaming buys nothing.

### 2.2 The two hard mismatches

**A. `section_id` (Dimas) vs `bab_id` (develop).** Dimas's sections come from `led_bab_tabel.json` via `lib/outline.py` — a deep tree (`bab` → `sub_bab` → `sub_sub_bab` → `list_*`, 10 levels) with slug IDs like `BAB-II-C1`. `develop` has a flat 14-chapter template (`CHAPTER_TEMPLATE` in `chapter.repository.ts`) with IDs `bab-{ledProjectId}-{urutan}`.

Do **not** flatten one into the other. Resolution:

- `bab_dokumen` gains `kode_seksi TEXT` — the stable outline key for the *top-level* chapter (`BAB-I`, `BAB-II`, …).
- The deep outline stays inside `apps/ai` as a **retrieval namespace**, not a product entity. `generate(bab_id)` resolves `kode_seksi`, expands to its sub-section keys via `outline.py`, and retrieves against those. The web app never sees sub-sections.
- Add `kode_seksi` to `CHAPTER_TEMPLATE` in the same commit so the 14 chapters and the JSON outline agree, verified by a test that every `kode_seksi` resolves in `outline.py`.

Sub-chapter editing, if you ever want it, becomes a `bab_seksi` table later. Not now.

**B. `indicator_no` 1–78 (Ariel) vs `RUBRIK_KRITERIA` (develop).** Ariel scores 78 AMI indicators; the product scores rubric criteria per chapter. Add `rubrik_kriteria_id UUID NULL` to `indicator_results` and a seed mapping (`data/penilaian_10_rubrik_sarjana_terapan.csv` is the input). Where no mapping exists, the result still renders in the AMI view but does not feed chapter scores. Do not block on a complete mapping.

### 2.3 SQLite → PostgreSQL type conversion

| SQLite | PostgreSQL | Note |
|---|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `UUID DEFAULT gen_random_uuid()` | Matches `develop`'s string IDs. Keep the old integer in `legacy_id INT` during migration for traceability, drop it in Week 4. |
| `TEXT` holding JSON (`pedoman_used`, `rubric_used`, `checklist`, `chunks_used`, `judge_result`) | `JSONB` | `sections.py` already does `json.loads` on read — that code deletes. |
| `REAL` (metrics) | `DOUBLE PRECISION` | ROUGE/BLEU/RAGAS are 0–1. |
| `REAL` (`latency_sec`) | `NUMERIC(8,3)` | |
| `NUMERIC(5,2)` score (Ariel) | unchanged | 0.00–4.00 |
| `DATETIME DEFAULT CURRENT_TIMESTAMP` | `TIMESTAMPTZ DEFAULT now()` | **SQLite's `CURRENT_TIMESTAMP` is UTC.** Convert with `AT TIME ZONE 'UTC'`. Getting this wrong shifts every timestamp by 7 hours (WIB). |
| `status TEXT DEFAULT 'draft'` | enum + `CHECK` | |
| `UNIQUE(section_id, model)` | `UNIQUE(bab_id, model)` on `generation_runs` | |
| `BIGINT GENERATED ALWAYS AS IDENTITY` (Ariel) | `UUID` | Align with the rest; `session_id TEXT` becomes the UUID PK. |

### 2.4 Prisma models — the new and changed ones

Existing 15 tables follow `docs/database.md` verbatim; only additions and changes are shown.

```prisma
// ---------------------------------------------------------------- generation

/// One AI generate execution. Replaces SQLite `drafts` minus its content,
/// which lives in BabDokumen.kontenKerja / BabDraft.kontenSnapshot.
model GenerationRun {
  id            String    @id @default(uuid())
  tenantId      String    @map("tenant_id")
  babId         String    @map("bab_id")
  /// Model identifier, e.g. "qwen2.5:14b". Kept because multi-model
  /// comparison is the paper's core experiment; the product path uses one.
  model         String
  status        JobStatus @default(MENUNGGU)

  /// RAG 1 — writing rules retrieved from the pedoman corpus.
  pedomanUsed   Json?     @map("pedoman_used")
  /// RAG 2 — score-4 rubric text retrieved for this section.
  rubrikUsed    Json?     @map("rubric_used")
  /// LLM-produced list of facts the section needs.
  checklist     Json?
  /// RAG 3+4 — LKPS rows and evidence chunks actually used.
  chunksUsed    Json?     @map("chunks_used")
  /// Chunk ids only, denormalised for BabDraft.referensiChunkIds.
  chunkIds      String[]  @map("chunk_ids")
  /// LLM-as-judge raw output.
  judgeResult   Json?     @map("judge_result")
  promptFull    String?   @map("prompt_full")
  latencySec    Decimal?  @map("latency_sec") @db.Decimal(8, 3)
  tokenCount    Int?      @map("token_count")
  error         String?

  dijalankanOlehUserId String    @map("dijalankan_oleh_user_id")
  createdAt            DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt            DateTime  @updatedAt      @map("updated_at") @db.Timestamptz

  bab        BabDokumen  @relation(fields: [babId], references: [id], onDelete: Cascade)
  ragas      RagasScore?
  babDrafts  BabDraft[]

  @@unique([babId, model])
  @@index([tenantId, babId])
  @@map("generation_runs")
}

/// Runtime answer quality for ONE generate run. Fills the gap that
/// docs/database.md §12a marks as having no table.
///
/// Three metrics only, matching ragas-score.entity.ts. context_recall is
/// deliberately absent: it requires a ground-truth reference, and the LED is
/// the document being written — there is no correct version to compare to.
/// ROUGE/BLEU/context_recall live in `eval_results` (offline track) instead.
model RagasScore {
  id              String   @id @default(uuid())
  generationRunId String   @unique @map("generation_run_id")
  /// [{ metrik, nilai (0..1), alasan }]
  metrik          Json
  jumlahChunk     Int      @map("jumlah_chunk")
  dihitungPada    DateTime @default(now()) @map("dihitung_pada") @db.Timestamptz

  run GenerationRun @relation(fields: [generationRunId], references: [id], onDelete: Cascade)

  @@map("ragas_scores")
}

/// Conversational revision per chapter. Ex SQLite chat_messages.
model ChatMessage {
  id        String      @id @default(uuid())
  tenantId  String      @map("tenant_id")
  babId     String      @map("bab_id")
  model     String
  role      ChatRole
  message   String
  createdAt DateTime    @default(now()) @map("created_at") @db.Timestamptz

  bab BabDokumen @relation(fields: [babId], references: [id], onDelete: Cascade)

  @@index([babId, createdAt])
  @@map("chat_messages")
}

enum ChatRole { user assistant system }

// ---------------------------------------------------------------- async jobs

/// Replaces the Redis stream for the MVP. FastAPI owns `status`/`result`,
/// the web app polls. ponytail: DB-as-queue, ceiling ~1 FastAPI replica and
/// a few jobs/sec; move to Redis Streams when either is exceeded.
model Job {
  id        String    @id @default(uuid())
  tenantId  String    @map("tenant_id")
  tipe      JobTipe
  status    JobStatus @default(MENUNGGU)
  /// Job input, shape per tipe. Contract lives in docs/job-contract.md.
  payload   Json
  result    Json?
  error     String?
  /// Progress for long jobs: 12 of 78 indicators.
  progress  Int       @default(0)
  total     Int       @default(0)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime  @updatedAt      @map("updated_at") @db.Timestamptz

  @@index([tenantId, status])
  @@map("jobs")
}

enum JobTipe   { GENERASI_BAB SKORING_RUBRIK AMI_ASSESSMENT INGEST_FILE }
enum JobStatus { MENUNGGU DIPROSES SELESAI GAGAL }

// ---------------------------------------------------------------- AMI (ariel)

model AssessmentSession {
  id                  String    @id @default(uuid())
  tenantId            String    @map("tenant_id")
  programStudiId      String?   @map("program_studi_id")
  dokumenLedId        String?   @map("dokumen_led_id")
  laporanPath         String    @map("laporan_path")
  totalIndicators     Int       @default(0) @map("total_indicators")
  completedIndicators Int       @default(0) @map("completed_indicators")
  status              JobStatus @default(MENUNGGU)
  error               String?
  dijalankanOlehUserId String   @map("dijalankan_oleh_user_id")
  createdAt           DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt           DateTime  @updatedAt      @map("updated_at") @db.Timestamptz

  results IndicatorResult[]
  steps   ReasoningStep[]

  @@index([tenantId, status])
  @@map("assessment_sessions")
}

model IndicatorResult {
  id               String   @id @default(uuid())
  sessionId        String   @map("session_id")
  indicatorNo      Int      @map("indicator_no")
  /// Nullable link to the product rubric; unmapped indicators still render.
  rubrikKriteriaId String?  @map("rubrik_kriteria_id")
  score            Decimal? @db.Decimal(5, 2)
  justification    String?
  confidence       Decimal? @db.Decimal(4, 3)
  recommendation   String?
  error            String?
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz

  session AssessmentSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@unique([sessionId, indicatorNo])
  @@map("indicator_results")
}

model ReasoningStep {
  id          String   @id @default(uuid())
  sessionId   String   @map("session_id")
  indicatorNo Int      @map("indicator_no")
  stepIndex   Int      @map("step_index")
  content     String
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz

  session AssessmentSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, indicatorNo])
  @@map("reasoning_steps")
}

// ------------------------------------------------------- offline eval (paper)

/// Benchmark metrics from scripts/evaluate.py. NOT written by the API and NOT
/// shown in the product UI — this is the research track. Kept in the same
/// database only so the paper's numbers stay queryable next to the drafts
/// that produced them.
model EvalResult {
  id               String   @id @default(uuid())
  babId            String?  @map("bab_id")
  kodeSeksi        String   @map("kode_seksi")
  model            String
  rouge1           Float?   @map("rouge_1")
  rouge2           Float?   @map("rouge_2")
  rougeL           Float?   @map("rouge_l")
  bleu4            Float?   @map("bleu_4")
  answerRelevancy  Float?   @map("answer_relevancy")
  contextPrecision Float?   @map("context_precision")
  contextRecall    Float?   @map("context_recall")
  evaluatedAt      DateTime @default(now()) @map("evaluated_at") @db.Timestamptz

  @@unique([kodeSeksi, model])
  @@map("eval_results")
}
```

Changes to tables from `docs/database.md`:

```prisma
model BabDokumen {
  // ... as specified in docs/database.md ...
  /// Stable outline key ("BAB-I"). Bridges to apps/ai's deep outline tree.
  kodeSeksi       String   @map("kode_seksi")
  generationRuns  GenerationRun[]
  chatMessages    ChatMessage[]
}

model BabDraft {
  // ... as specified ...
  /// Which generate produced this checkpoint. NULL for MANUAL checkpoints.
  generationRunId String?  @map("generation_run_id")
  run             GenerationRun? @relation(fields: [generationRunId], references: [id])
  /// Permanent copy of the run's RAGAS metrics — a snapshot can never go stale.
  ragasSnapshot   Json?    @map("ragas_snapshot")
}
```

### 2.5 Data migration scripts

`scripts/migrate_sqlite_to_pg.py` — one-shot, idempotent, run inside `apps/ai`:

```python
# Order matters: chapters must exist before runs reference them.
# 1. Resolve section_id -> bab_id via kode_seksi on a chosen seed DokumenLed.
#    Unresolvable sections are reported and skipped, never guessed.
# 2. drafts    -> generation_runs (+ bab_dokumen.konten_kerja for latest per bab)
#                 json.loads on pedoman_used/rubric_used/checklist/chunks_used/judge_result
#                 datetime: "SELECT created_at" -> datetime.fromisoformat(...).replace(tzinfo=UTC)
# 3. drafts.judge_result -> ragas_scores where the judge emitted the 3 metrics
# 4. chat_messages -> chat_messages
# 5. eval_results  -> eval_results (kode_seksi kept as-is, bab_id best-effort)
# Prints a table: source rows / migrated / skipped-with-reason. Exit 1 if
# skipped > 0 unless --allow-partial.
```

`scripts/migrate_supabase_to_pg.py` — simpler, three tables, `session_id TEXT` becomes the UUID PK (Ariel already generates `uuid.uuid4()` strings, so they cast cleanly):

```bash
pg_dump "$SUPABASE_URL" --data-only \
  -t assessment_sessions -t indicator_results -t reasoning_steps \
  > /tmp/ami.sql   # then transform ids + add tenant_id via the python script
```

Both scripts leave a `legacy_id` column populated so any surprise can be traced back. Drop those columns in Week 4.

### 2.6 Vector store — the one thing not to simplify

Two Chroma instances exist today (`AI-LED-ariel/data/chroma_db`, Dimas's `/data/chroma_db`) with different embedding models (Ariel: sentence-transformers default; Dimas: `BAAI/bge-m3`, 1024-dim). **They cannot be merged without re-embedding.** Plan: standardise on `bge-m3` (multilingual, already the better choice for Indonesian) and re-index Ariel's corpora in Week 2.

Collections after unification:

| Collection | Scope | `where` filter required |
|---|---|---|
| `pedoman` | global | none |
| `rubrik` | global | none |
| `lkps` | per p## 3. Week 1 — Core Setup, Database, Auth & Tenancy, and Job Pipeline

**Core focus:** Establish a unified workspace, switch the web app to a real PostgreSQL database with authentication, and set up the background job queue (DB-as-queue) for both web and AI services.

**Tracks:** Web (2 devs), AI (2 devs) running in parallel.

### Tasks

**W1-D1 — Decision + merge + restruct (whole team)**
1. Sign off §0.2 (no NestJS). Record it as ADR in `docs/adr/001-no-nestjs.md`.
2. Merge remote branches:
   ```bash
   git merge --no-ff origin/ariel
   git merge --no-ff "origin/led-wiriting(dimas)"
   ```
3. Restructure layout using `git mv`:
   ```bash
   git mv api apps/ai
   git mv backend/agent apps/ai/agent
   git mv backend/api/routes/assessment.py apps/ai/routers/assessment.py
   git mv backend/api/routes/eval.py apps/ai/routers/eval.py
   git mv backend/api/routes/upload.py apps/ai/routers/ingestion.py
   git mv backend/{eval,excel,ingestion,vectorstore,llm} apps/ai/
   git mv apps/ai/routes/sections.py apps/ai/routers/generation.py
   git mv apps/ai/routes/chat.py apps/ai/routers/chat.py
   git mv apps/ai/routes/export.py apps/ai/routers/export.py
   git rm -r frontend # Ariel's Next.js UI is superseded
   ```
4. Merge environment variables and build a single `docker-compose.yml` (Postgres, Web, AI).

**W1-D2–D3 — Web Track: Prisma, Database Scoping, and Auth**
5. Setup Prisma in `apps/web`. Create `packages/db/schema.prisma` with 15 tables from `docs/database.md` + new tables (§2.4).
6. Run `prisma migrate dev --name init` and seed master data (CHAPTER_TEMPLATE, rubrics, guides).
7. Swap mock repositories (`app/features/*/data/sources/local/*.ts`) with server-side Prisma versions (`*.server.ts`). Ensure zero changes to UI components.
8. Implement real cookie session auth (`createCookieSessionStorage`) with bcrypt.
9. Implement multi-tenant scoping wrapper `db.forTenant(tenantId)` for all database operations. Add test to verify isolation.

**W1-D2–D3 — AI Track: FastAPI & Database Consolidation**
10. Unify into a single FastAPI `apps/ai/main.py`.
11. Replace SQLite/Supabase connections with SQLAlchemy Core (`asyncpg`) to Postgres.
12. Write and execute migration scripts (`scripts/migrate_sqlite_to_pg.py`, `scripts/migrate_supabase_to_pg.py`).
13. Merge LLM clients, standardize Chroma on `bge-m3` embedding model, and rebuild collections.
14. Ensure search helper in `retrieval.py` enforces `tenant_id` filter.

**W1-D4–D5 — Joint Track: Job Pipeline & Local File Storage**
15. Create `jobs` table in PostgreSQL for async execution tracking.
16. Implement `POST /api/jobs` and `GET /api/jobs/:id` (polling) in the Web app.
17. Implement job handler in FastAPI: claim jobs with conditional update `status='DIPROSES'`, run `BackgroundTasks`, update to `SELESAI` or `GAGAL`.
18. Implement local disk storage for evidence file uploads via `storage.server.ts`.

### Key deliverables (testable Friday)
- `docker compose up` starts all three services.
- Real login/register, multi-tenant workspace isolation verified.
- Real CRUD for study programs, LED projects, and chapters saved in Postgres (no more localStorage).
- Async job queue verified with dummy 5-second test jobs.
- Migrated legacy data visible in Postgres.

---

## 4. Week 2 — Core Features Integration, UI Porting, and Hardening

**Core focus:** Wire AI generation (RAG), Chat history, and AMI Assessment into the Web UI. Hard, end-to-end integration and smoke tests.

### Tasks

**W2-D1–D3 — AI Track: RAG, Chat, and AMI Integration**
1. Implement `POST /jobs/GENERASI_BAB` job in FastAPI: outline parsing -> pedoman/rubric RAG retrieval -> LLM generation -> LLM-as-a-judge score computation (RAGAS). Write output directly to PostgreSQL `generation_runs` and `ragas_scores`.
2. Convert LLM markdown output to HTML server-side before storing.
3. Implement `POST /jobs/SKORING_RUBRIK` job for rubrics-only simulation.
4. Implement Chat SSE routing (`routers/chat.py`) streaming directly to browser client, persisting history in `chat_messages`.
5. Implement `POST /jobs/AMI_ASSESSMENT` wrapping Ariel's LangGraph assessment agent. Limit concurrency with `MAX_PARALLEL` (default 5) to save resources. Update live progress on job table (e.g. "12/78 indicators").

**W2-D1–D3 — Web Track: UI Porting and Wiring**
6. Connect chapter editor tabs to the async job engine:
   - **Generasi & Rubrik** tabs trigger and track `GENERASI_BAB` and `SKORING_RUBRIK` jobs.
   - **Kualitas AI** reads real `ragas_scores` and flags stale scores on edit.
   - **Rujukan** displays chunks used from `generation_runs.chunks_used`.
7. Build **Chat** tab inside editor. Port SSE streaming hook from Dimas's Vite app. Save message history.
8. Rebuild Ariel's Next.js AMI dashboards in Remix `features/ami-assessment/` with progress bar, results table, reasoning steps, and history logs.
9. Link AMI recommendations into the chapter editor's **Review** tab.

**W2-D4–D5 — Joint Track: Hardening, Cleanup, and Demos**
10. Drop temporary migration columns (`legacy_id`). Delete unused files, repositories (`supabase_client.py`), and old frontends.
11. Create a seed script that creates a comprehensive demo tenant with full data (1 university, 2 study programs, 1 LED project, 14 chapters, uploaded evidence, a completed AMI session).
12. Update all documentation (`architecture.md`, `database.md`, and API contracts).
13. Create a cold-start validation script `scripts/smoke.sh`.

### Key deliverables (testable Friday)
- Full end-to-end flow: Select evidence -> Generate -> TipTap renders text -> Kualitas AI displays RAGAS scores.
- Chat streaming works natively in the editor tab.
- AMI assessment evaluates full LED documents and displays results.
- `scripts/smoke.sh` passes successfully.

---

## 5. Standing rules for the 2 weeks
1. **One migration owner:** Prisma. FastAPI never runs DDL.
2. **No LLM calls inside loaders/actions:** Use jobs table and polling.
3. **Strict tenant scoping:** All DB and Chroma queries must specify `tenant_id`.
4. **Delete as you go:** Do not wait until the end of the sprint to clean up old code.

---

## 6. What this plan deliberately does not build
- NestJS backend & Redis job queue (FastAPI + DB queue is enough for MVP).
- Cloudflare R2 uploads (local disk volume used instead).
- JWT auth tokens (cookie sessions are used instead).

---

## 7. Week-one checklist (copy into your tracker)
- [ ] ADR 001 signed (no NestJS)
- [ ] `dev-v1` contains all three histories; 3 conflicts resolved by union
- [ ] Repo restructured to layout via `git mv`
- [ ] `packages/db/schema.prisma` fully written and migration run
- [ ] Web features switched from localStorage to Prisma
- [ ] FastAPI consolidated and database rewritten to postgres
- [ ] SQLite/Supabase migration scripts executed successfully
- [ ] Job queue polling/processing verified with a dummy task
- [ ] Docker compose starts all services cleanly
