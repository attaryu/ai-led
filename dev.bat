@echo off
echo [1/2] Starting Docker containers (Postgres ^& Redis)...
docker compose up -d postgres redis

if "%1"=="--migrate" (
  echo [2/2] Running DB migrations ^& generating Prisma Client...
  cd packages\db
  call npx prisma migrate deploy
  call npx prisma generate
  cd ..\..
) else (
  echo [2/2] Skipping DB migrations (run "dev.bat --migrate" if schema changed)
)

echo Launching Backend, AI Service, AI Worker, and Web App in separate terminals...
start "BACKEND" cmd /k "npm run start:dev --prefix apps/backend"
start "AI-API" cmd /k "cd apps/ai && .venv\Scripts\activate && uvicorn main:app --reload --port 8000"
start "AI-WORKER" cmd /k "cd apps/ai && .venv\Scripts\activate && python worker.py"
start "WEB" cmd /k "npm run dev --prefix apps/web"
