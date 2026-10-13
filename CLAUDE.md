# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before starting work

Check `docs/` for dot-prefixed files (e.g. `docs/.something.md`) first. They are gitignored private working notes (decisions, in-progress plans, context not in code or git history) — see `AGENTS.md`. Never copy their contents into committed files, and don't delete old entries when updating them. None existed when this file was written.

## Repository layout

`AI-LED` — an npm-workspaces monorepo that helps Indonesian universities write **LED** (Laporan Evaluasi Diri) accreditation documents and run AI-assisted **AMI** scoring against LAM Teknik's rubric. This checkout (`AMI/dev-2`, branch `dev-2`) is its own git repo, a sibling of `AMI/dev-v1` (older layout, no MinerU service). The parent `AMI/` has a CLAUDE.md for the standalone `ami-assessment` prototype that is being ported into `apps/ai` — it doesn't apply here, but it explains where the agent/graph code came from.

- **`apps/web`** — React Router v8 SPA (Tailwind, shadcn/Base UI, TanStack Query, Zustand, Tiptap).
- **`apps/backend`** — NestJS API. Owns domain state; the only thing clients talk to (besides direct-to-R2 uploads).
- **`apps/ai`** — Python/FastAPI service **plus** a separate BullMQ worker process (`worker.py`). AI compute: LangGraph AMI scoring, narrative generation, document ingestion/embedding.
- **`apps/mineru`** — standalone MinerU 4.x HTTP gateway (`gateway.py`) wrapping the `mineru parse` CLI; `apps/ai` calls it via `MINERU_SERVICE_URL` (`ingestion/mineru_service.py`). If that env var is empty, ingestion falls back to the old in-process MinerU 3.4.5 path.
- **`packages/db`** — Prisma schema/migrations/client (`@ai-led/db`), single source of schema truth for backend *and* ai (the Python side uses raw SQL against the same tables).

Root `package.json` only declares workspaces; no Turborepo/Nx — each app runs independently.

Docs are in Indonesian. `docs/architecture.md` (read its §9 "Status Implementasi terhadap Rancangan" before cross-service changes — it lists where code diverges from the design) and `docs/database.md` / `docs/database-erd.md` (table-by-table, with reasoning). `docs/integration-plan.md` is a historical Aug-2026 plan whose "drop NestJS" recommendation was **not** followed; don't treat it as current.

## Common commands

### Full stack (Docker)

There is no usable default compose file. Pick **one** MinerU variant (all share project name `ai-led-dev-v2`, so run only one at a time):

```bash
docker compose -f docker-compose.mineru-gpu.yml up -d --build      # local NVIDIA GPU
docker compose -f docker-compose.mineru-cpu.yml up -d --build
MINERU_API_KEY=... docker compose -f docker-compose.mineru-api.yml up -d --build   # mineru.net
# put COMPOSE_FILE=docker-compose.mineru-gpu.yml in root .env so plain `docker compose ps/logs/down` work
```

Each variant `include`s `compose/base.yml` (all shared services) plus a small `compose/mineru-*.override.yml`; `compose/varian-*.env` supplies `VARIAN`, which suffixes container names. Never run `compose/base.yml` directly. `bootstrap` seeds the model volumes from an untracked `./models/` dir (~4.9GB; see `compose/bootstrap.sh`) and `migrate` runs `prisma migrate deploy` before backend/ai start. `apps/ai/.env` and `apps/backend/.env` must exist (untracked). The root `docker-compose.yml` is a stale pre-variant file (no mineru/bootstrap/migrate) — ignore it.

### Native / per-service

`dev.bat` is the Windows launcher (`--migrate`, `--docker-ai`); on Linux/macOS run the pieces by hand:

```bash
docker compose -f docker-compose.mineru-gpu.yml up -d postgres redis   # infra only

cd packages/db && npx prisma migrate dev       # new migration (dev)
cd packages/db && npx prisma migrate deploy    # apply existing
cd packages/db && npx prisma generate          # after schema.prisma changes (backend tests need the client)

npm run start:dev --prefix apps/backend        # :3000
npm run lint --prefix apps/backend             # eslint --fix (writes!)
npm run test --prefix apps/backend
npm run test --prefix apps/backend -- users.service   # single suite by pattern
npm run test:e2e --prefix apps/backend

cd apps/ai && uvicorn main:app --reload --port 8000
cd apps/ai && python worker.py                 # BullMQ consumer; run exactly ONE
cd apps/ai && pytest
cd apps/ai && pytest tests/agent/test_graph.py -k "decimal"
cd apps/ai && python -m scripts.run_benchmark  # scripts run as modules

npm run dev --prefix apps/web                  # :5173, backend at VITE_API_URL (default :3000)
npm run typecheck --prefix apps/web            # react-router typegen && tsc
```

`apps/ai` needs Python 3.11+ and `pip install -e ".[dev]"` (plus `poppler-utils` for pdfplumber/MinerU, or just use the container). Tests that need real Postgres/pgvector (e.g. `tests/db/test_postgres_client.py`) skip unless `DATABASE_URL` is set, e.g. `postgresql://postgres:postgres@localhost:5434/ai_led?schema=public`.

Ports: web 5173, backend 3000, ai 8000, mineru gateway 8100 (internal), Postgres 5434 on host (5432 in-container), Redis 6379.

Only run **one** AI worker against the Redis queue — a second (or an old container image) silently splits jobs and processes some with stale code. When running the worker natively, stop the `ai-worker` container.

No lint/format config exists for `apps/web` or `apps/ai` (backend has ESLint + Prettier) — don't invent commands. CI (`.github/workflows/ci-cd.yml`) runs backend jest + `apps/ai` pytest, but triggers only on `dev-v1` pushes/PRs, so it does not run on this branch.

## Architecture

### Responsibility split (`docs/architecture.md` §1)

Backend = owner of all domain state and the single door into job dispatch (`JobsService.enqueue()` in `apps/backend/src/jobs/jobs.service.ts` writes an audit `Job` row, then enqueues to BullMQ). AI worker = compute, plus owner of the vector tables. Job progress reaches clients over SSE (`JobEventsService`/`JobsGateway` subscribing to BullMQ `QueueEvents`). File bytes never pass through backend/AI HTTP handlers: clients upload to Cloudflare R2 via presigned URLs and job payloads carry the R2 key.

Queue names live in `apps/backend/src/jobs/queue-names.ts` (`JobType` → queue map) and **must match** `QUEUE_NAMES` in `apps/ai/worker.py`: `generation-queue`, `assessment-queue`, `ingestion-queue`. Adding a job type means: Prisma `JobType` enum + migration, the map in `queue-names.ts`, and a `_handle_*` function in `worker.py` (currently 11: generasi bab/outline, penilaian RAGAS, rekomendasi dokumen, simulasi skor, assessment AMI, and ingestion of bukti dukung / LKPS / LED / rubrik / struktur dokumen).

**Known divergences from that design** (so they don't surprise you): the worker writes ~20 domain tables via raw SQL (`apps/ai/db/generation_client.py`, `postgres_client.py`) rather than only vector tables; the backend proxies some domain reads to the AI service (structure preview/confirm, assessment indicators, eval results, chat history); chat lives in `apps/ai/api/routes/chat.py`; `POST /eval/run` (RAGAS) is a synchronous HTTP call, not queued; BullMQ `Worker`s run with default concurrency, one process listening on all three queues.

### Multi-tenancy (`apps/backend`)

JWT access+refresh with `tenantId`/`role`/`studyProgramId` in the token (roles `ADMIN`, `PIMPINAN`, `PENJAMIN_MUTU`, `PENYUSUN`). Tenant context flows through `TenantContextService` (`AsyncLocalStorage`). Isolation is enforced by **Postgres Row-Level Security**: `PrismaService` transparently wraps each non-transactional call in a transaction that first runs `set_config('app.tenant_id', ...)`, so debug tenant-scoping bugs there, not by hunting for a missing `WHERE`. Calls inside an explicit `$transaction` must set it themselves (`TenantContextService.runInManagedTransaction`). Two DB roles: `app_runtime` (RLS-restricted, backend) and `app_ai_worker` (`BYPASSRLS`, ai/ai-worker) — AI-side raw SQL must filter `tenant_id` manually.

### AI service (`apps/ai`)

- **Per-indicator AMI scoring** is a LangGraph invoked once per indicator with no shared state, parallelized via `ASSESSMENT_MAX_PARALLEL`. `build_graph_auto` picks `agent/graph.py` (native tool calling) or `agent/reasoning_graph.py` (hand-rolled JSON tool protocol for `deepseek-r1`/`qwq`-style models) by model-name pattern; both share `agent/state.py` and the tools in `agent/tools/` (rubric, LED search, LKPS table, sandboxed formula evaluator, evidence search).
- **Vector storage is pgvector in the app's Postgres** (`vectorstore/pgvector_*.py`), isolated by `WHERE tenant_id = ... AND document_id = ...`, not Chroma. There is a single embedding model, `BAAI/bge-m3` (1024-d, column `embedding`, `EMBEDDING_MODEL`); the MiniLM `embedding_ami` column was dropped (migration `20261007090000_drop_minilm_embeddings`). The `ami=` parameter in the evidence-search functions is deprecated and ignored (kept for old callers), and `scripts/backfill_ami_embeddings.py` is obsolete; after changing the embedding model use `scripts/reindex_embeddings.py`.
- **LLM config**: `LLM_PROVIDER` (`ollama` | `openrouter` | `huggingface`); `OLLAMA_BASE_URL` takes comma-separated endpoints for round-robin across GPUs. RAGAS judge (`RAGAS_*`) and the narrative judge (`JUDGE_*`) are intentionally configured independently from the assessment model — don't default them to the same env vars.
- **MinerU** work is slow and GPU-bound; the `mineru` gateway serializes local parses behind a lock (6GB VRAM OOMs otherwise). In `compose/base.yml`, do not set `MINERU_MODEL_SOURCE=local` on `ai`/`ai-worker` (see the comment there).
- `generation-prototype/` is a synced prototype of the chapter-generation flow, `static/` a standalone demo UI; neither is the production path.

### Database (`packages/db`)

`TENANT` → `USER`/`PROGRAM_STUDI` → `DOKUMEN_LED` → `BAB_DOKUMEN` (always-overwritten *active* chapter state) → `BAB_DRAFT` (immutable, versioned checkpoints). Evidence links (`BUKTI_DUKUNG_BAB` vs `BUKTI_DUKUNG_DRAFT`) follow the same active-vs-checkpoint duality. Two deliberate patterns — don't "clean them up": name snapshots stored beside FKs (e.g. `dibuat_oleh_nama`) so audit records stay readable after deletion, and derivable values (accreditation expiry, "is this LED active") are *not* stored to avoid a second source of truth.

### Frontend (`apps/web`)

Feature-based Clean Architecture: `app/features/<feature>/{data,domain,presentation}`; `app/routes/*.tsx` are thin and registered in `app/routes.ts`. All backend calls go through `app/core/lib/api-client.ts`. The access token is kept in memory only (never `localStorage`); reloads recover the session via an httpOnly refresh cookie and `/auth/refresh`. Job/status updates use SSE (`app/core/lib/sse-client.ts`), not polling.

## Commit conventions

See `AGENTS.md`: Conventional Commits in English, `type(scope): imperative lowercase subject` with no trailing period, short optional body, one logically complete change per commit, no session links (a `Co-Authored-By` trailer is fine). Types: `feat`, `fix`, `refactor`, `chore`, `docs`.
