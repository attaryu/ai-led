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

1. **Nyalakan Database & Redis** (pakai salah satu varian MinerU, lihat bagian Docker Compose di bawah; contoh GPU):
   ```bash
   docker compose -f docker-compose.mineru-gpu.yml up -d postgres redis
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

### 1. Pilih varian MinerU, lalu build & jalankan

Tidak ada `docker-compose.yml` bawaan: pilih **satu** dari tiga berkas di root proyek. Masing-masing menjalankan
seluruh aplikasi (Backend, AI API, AI Worker, Web, Postgres, Redis, MinerU), hanya MinerU-nya yang berbeda:

| Berkas | MinerU | Syarat |
|---|---|---|
| `docker-compose.mineru-gpu.yml` | GPU lokal | GPU NVIDIA + NVIDIA Container Toolkit |
| `docker-compose.mineru-cpu.yml` | CPU (lebih lambat) | model ONNX MinerU (lihat komentar di berkasnya) |
| `docker-compose.mineru-api.yml` | API mineru.net | `MINERU_API_KEY` (jangan di-commit) |

```bash
docker compose -f docker-compose.mineru-gpu.yml up -d --build
docker compose -f docker-compose.mineru-cpu.yml up -d --build
MINERU_API_KEY=... docker compose -f docker-compose.mineru-api.yml up -d --build
```

Nama container mengikuti `ai-led-dev-v2-<service>-<varian>`, mis. `ai-led-dev-v2-web-gpu`, `ai-led-dev-v2-ai-cpu`,
`ai-led-dev-v2-mineru-api`. Volume data (`*_postgres_data`, `*_hf_cache`, ...) memakai awalan `ai-led-dev-v1` secara bawaan supaya
data yang sudah ada tetap terpakai; mesin baru yang ingin awalan v2 menulis `AI_LED_VOLUME_PREFIX=ai-led-dev-v2` di `.env` sebelum
menjalankan pertama kali.

Jalankan **satu saja** pada satu waktu (semuanya satu proyek dan memakai port yang sama). Agar perintah `docker compose ps/logs/down`
tanpa `-f` tetap bekerja, tulis di berkas `.env` di root proyek (diabaikan git): `COMPOSE_FILE=docker-compose.mineru-gpu.yml`.

> **Catatan HuggingFace Token:** `HF_TOKEN` tidak wajib untuk build, karena model tidak diunduh saat build.

### 2. Penyiapan otomatis (model dan database)

Tidak ada langkah manual sesudah `up`:

- **`bootstrap`** mengisi volume model dari folder **`models/`** di proyek (bge-m3, PDF-Extract-Kit, model MinerU) sekali saja,
  bila volume masih kosong. Folder `models/` (~4,9 GB) tidak ikut git; salin dari mesin lain atau lihat `compose/bootstrap.sh`
  untuk layout-nya. Tanpa bge-m3 service ini berhenti dengan pesan jelas.
- **`migrate`** menerapkan migrasi Prisma sebelum backend dan AI naik (database kosong maupun yang sudah ada).
- Berkas `apps/ai/.env` dan `apps/backend/.env` tetap perlu ada (tidak ikut git).

---

## 🌐 Port Service

| Service | Protocol / URL |
| :--- | :--- |
| **Web Frontend** | `http://localhost:5173` |
| **Backend API** | `http://localhost:3000` |
| **AI Service API** | `http://localhost:8000` |
| **PostgreSQL** | `localhost:5434` (host) / `5432` (container) |
| **Redis** | `localhost:6379` |

