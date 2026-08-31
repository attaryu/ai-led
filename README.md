# AI-LED (Sistem Penilaian & Penulisan LED Terintegrasi AI)

Aplikasi monorepo untuk otomatisasi dan pendampingan penyusunan dokumen **Laporan Evaluasi Diri (LED)** serta **Penilaian Penjaminan Mutu Internal/Eksternal (AMI/LAM)** berbasis AI.

---

## 🏗️ Struktur Arsitektur Monorepo

* **`apps/web`**: Frontend UI (React Router, TailwindCSS, Lucide Icons).
* **`apps/backend`**: Core Backend API & Business Logic (NestJS, Prisma ORM, BullMQ).
* **`apps/ai`**: AI Microservice & Background Worker (FastAPI, Python, LangChain, PgVector, BullMQ Consumer).
* **`packages/db`**: Database Schema, Migrations, & Prisma Models (PostgreSQL + PgVector).

---

## ⚡ Cara Menjalankan Aplikasi

### Opsi 1: Satu Command (Rekomendasi)

Masuk ke folder `AI-LED-dev-v1` dan jalankan script otomatisation:

```cmd
cd AI-LED-dev-v1

# Jalankan semua service harian
.\dev.bat

# Jika ada perubahan skema database (migration baru)
.\dev.bat --migrate
```

Script `dev.bat` akan otomatis:
1. Menyalakan kontainer Docker (**Postgres** & **Redis**).
2. *(Optional)* Menjalankan `prisma migrate deploy` & `prisma generate`.
3. Menjalankan semua service secara serentak (**Backend**, **AI API**, **AI Worker**, dan **Web App**) dalam 1 terminal.

---

### Opsi 2: Manual (Per Terminal)

Jika ingin menjalankan service secara terpisah:

1. **Nyalakan Database & Redis:**
   ```bash
   docker compose up -d postgres redis
   ```

2. **Setup Database (Migration & Generate):**
   ```bash
   cd packages/db
   npx prisma migrate deploy
   npx prisma generate
   cd ../..
   ```

3. **Backend API (NestJS):**
   ```bash
   cd apps/backend
   npm run start:dev
   ```

4. **AI Service API (FastAPI):**
   ```bash
   cd apps/ai
   .venv\Scripts\activate
   uvicorn main:app --reload --port 8000
   ```

5. **AI Worker (BullMQ Consumer):**
   ```bash
   cd apps/ai
   .venv\Scripts\activate
   python worker.py
   ```

6. **Web App (React Router):**
   ```bash
   cd apps/web
   npm run dev
   ```

---

## 🐳 Menjalankan via Docker Compose (Full Stack)

Untuk mem-build dan menjalankan seluruh service sekaligus dalam kontainer Docker:

### 1. Build Image & Jalankan Kontainer

```bash
# Build dan jalankan seluruh container (Backend, AI API, AI Worker, Web, Postgres, Redis)
docker compose up -d --build
```

> **Catatan HuggingFace Token:** Service AI menggunakan model `bge-m3`. Set environment variable `HF_TOKEN` jika diperlukan:
> ```bash
> HF_TOKEN=your_token docker compose up -d --build
> ```

### 2. Jalankan Database Migration dalam Kontainer

Setelah kontainer berjalan, jalankan migration Prisma:

```bash
docker compose exec backend npx prisma migrate deploy
```

---

## 🌐 Port Service

| Service | Protocol / URL |
| :--- | :--- |
| **Web Frontend** | `http://localhost:5173` |
| **Backend API** | `http://localhost:3000` |
| **AI Service API** | `http://localhost:8000` |
| **PostgreSQL** | `localhost:5434` (host) / `5432` (container) |
| **Redis** | `localhost:6379` |

