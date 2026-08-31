@echo off
echo [1/2] Starting Docker containers (Postgres & Redis)...
docker compose up -d postgres redis

if "%1"=="--migrate" (
  echo [2/2] Running DB migrations & generating Prisma Client...
  cd packages\db
  call npx prisma migrate deploy
  call npx prisma generate
  cd ..\..
) else (
  echo [2/2] Skipping DB migrations (run "dev.bat --migrate" if schema changed)
)

echo Launching Backend, AI Service, AI Worker, and Web App...
npx -y concurrently -n "BACKEND,AI-API,AI-WORKER,WEB" -c "blue,magenta,yellow,green" ^
  "npm run start:dev --prefix apps/backend" ^
  "cd apps/ai && .venv\Scripts\activate && uvicorn main:app --reload --port 8000" ^
  "cd apps/ai && .venv\Scripts\activate && python worker.py" ^
  "npm run dev --prefix apps/web"
