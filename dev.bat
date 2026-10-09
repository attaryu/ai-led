@echo off
rem Usage: dev.bat [--migrate] [--docker-ai]
rem   --migrate    run Prisma migrate deploy + generate
rem   --docker-ai  run AI API + worker in Docker instead of local .venv
set MIGRATE=
set DOCKER_AI=
for %%A in (%*) do (
  if "%%A"=="--migrate" set MIGRATE=1
  if "%%A"=="--docker-ai" set DOCKER_AI=1
)

rem docker-compose.yml sudah tidak ada: gunakan salah satu varian MinerU (gpu/cpu/api). Bawaan GPU; ganti dengan
rem   set COMPOSE_FILE=docker-compose.mineru-cpu.yml   (atau tulis COMPOSE_FILE=... di berkas .env di root proyek)
if not defined COMPOSE_FILE set "COMPOSE_FILE=docker-compose.mineru-gpu.yml"

echo [1/3] Starting Docker containers (Postgres ^& Redis)...
docker compose up -d postgres redis

if defined MIGRATE (
  echo [2/3] Running DB migrations ^& generating Prisma Client...
  pushd packages\db
  call npx prisma migrate deploy
  call npx prisma generate
  popd
) else (
  echo [2/3] Skipping DB migrations (run "dev.bat --migrate" if schema changed)
)

rem Only ONE AI worker may consume the Redis queue -- two workers split jobs, and an old image silently
rem processes some of them with stale code.
if defined DOCKER_AI (
  echo [3/3] AI API + worker in Docker (rebuild with "docker compose build ai" after AI code changes)
  docker compose up -d ai ai-worker
) else (
  echo [3/3] AI API + worker local -- stopping Docker AI containers so they don't take jobs
  docker compose stop ai ai-worker
  start "AI-API" cmd /k "cd apps/ai && .venv\Scripts\activate && uvicorn main:app --reload --port 8000"
  start "AI-WORKER" cmd /k "cd apps/ai && .venv\Scripts\activate && python worker.py"
)

echo Launching Backend and Web App in separate terminals...
start "BACKEND" cmd /k "npm run start:dev --prefix apps/backend"
start "WEB" cmd /k "npm run dev --prefix apps/web"
