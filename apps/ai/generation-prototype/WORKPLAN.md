# Work Plan — LED Generator Platform (Agustus 2026)

| Priority | Task | Definition of Done | Notes / Attachment | Start Date | End Date | Status |
|---|---|---|---|---|---|---|
| High | Migrasi storage SQLite → PostgreSQL | Koneksi DB (`db.py`) & script migrasi (`migrate_to_postgres.py`) jalan, `.env.example` diperbarui dengan kredensial Postgres | `api/lib/db.py`, `api/scripts/migrate_to_postgres.py` | 2026-08-06 | 2026-08-06 | Done |
| High | Modul ekstraksi dokumen bukti dukung (MinerU pipeline) | Ekstraksi PDF/DOCX/XLSX otomatis: convert-to-PDF, watermark removal, chunking evidence, extractor Excel | `api/lib/extraction/{mineru,watermark,evidence_chunking,excel_extractor}.py` | 2026-08-07 | 2026-08-10 | Done |
| High | Autentikasi user dasar | Endpoint `/me` & modul `lib/auth.py` bisa identifikasi user yang login | `api/lib/auth.py`, `api/routes/me.py` | 2026-08-07 | 2026-08-07 | Done |
| Medium | UI Upload & Sidebar navigasi dokumen | Komponen `UploadZone` & `Sidebar` terpasang di `main.jsx`, bisa upload file dari browser | `web/src/components/{UploadZone,Sidebar}.jsx` | 2026-08-07 | 2026-08-07 | Done |
| High | Pipeline ekstraksi end-to-end + background worker | `extraction/pipeline.py` orkestrasi penuh, `worker_tasks.py` jalan sebagai proses async terpisah dari API | `api/lib/extraction/pipeline.py`, `api/worker_tasks.py`, `api/Dockerfile.worker` | 2026-08-10 | 2026-08-12 | Done |
| High | Document registry & endpoint dokumen bukti dukung | CRUD dokumen via `routes/documents.py` + `routes/led_documents.py`, migrasi tabel registry | `api/routes/documents.py`, `api/scripts/migrate_add_document_registry.py`, `import_document_registry.py` | 2026-08-10 | 2026-08-12 | Done |
| Medium | Retrieval & integrasi Ollama client | Query retrieval chunk (`retrieval.py`) terhubung ke LLM lokal via `ollama_client.py`, dipakai chat & context | `api/lib/retrieval.py`, `api/lib/ollama_client.py`, `api/lib/context.py` | 2026-08-10 | 2026-08-13 | Done |
| Medium | Halaman daftar LED & routing app | `LedListPage` tampil, `App.jsx` routing multi-halaman (list → editor → detail) | `web/src/pages/LedListPage.jsx`, `web/src/App.jsx` | 2026-08-10 | 2026-08-10 | Done |
| Medium | Chat asisten per-bab | `ChatPane` terhubung endpoint chat baru, riwayat chat tersimpan per bab | `web/src/components/ChatPane.jsx`, `api/routes/chat.py` | 2026-08-10 | 2026-08-13 | Done |
| Medium | Editor LED (toolbar + halaman editor) | `LedToolbar` & `LedEditorPage` bisa generate/edit/approve draft per section | `web/src/components/LedToolbar.jsx`, `web/src/pages/LedEditorPage.jsx` | 2026-08-11 | 2026-08-11 | Done |
| Low | Modul rekomendasi dokumen bukti dukung | Tabel `bab_document_recommendation` & `recommendation_chunks`, alur rekomendasi sebelum synthesis bab | `api/scripts/migrate_add_recommendation_chunks.py`, `migrate_add_recommendation_items.py` | 2026-08-11 | 2026-08-13 | Done |
| Medium | Halaman kelola dokumen (Documents Page) | `DocumentsPage` list + aksi per dokumen (upload, hapus, status ekstraksi) | `web/src/pages/DocumentsPage.jsx`, `api/routes/documents.py` | 2026-08-12 | 2026-08-12 | Done |
| High | Arsitektur multi-container (worker terpisah) | `docker-compose.yml` punya service worker terpisah dari API, image `Dockerfile.worker` dengan LibreOffice utk convert dokumen | `docker-compose.yml`, `api/Dockerfile.worker` | 2026-08-12 | 2026-08-12 | Done |
| High | Finalisasi schema Postgres (22 tabel) | `schema.sql` lengkap 15 tabel dasar + 7 tabel tambahan (chat, evidence chunk, LKPS, referensi, registry, rekomendasi) disetujui & diterapkan | `api/db/schema.sql` | 2026-08-13 | 2026-08-13 | Done |
| Medium | Panel rekomendasi & info section di editor | `RecommendationPanel` & `SectionInfoPane` tampil di `DocumentPane`, user bisa pilih bukti dukung per section | `web/src/components/{RecommendationPanel,SectionInfoPane,DocumentPane}.jsx`, `migrate_add_selected_bukti_dukung.py` | 2026-08-13 | 2026-08-13 | Done |
| Medium | Perbaikan prompt & generator draft bab | `prompts.py` & `generator.py` disesuaikan dengan skema baru (referensi chunk, bukti dukung terpilih) | `api/lib/prompts.py`, `api/lib/generator.py`, `api/routes/sections.py` | 2026-08-13 | 2026-08-13 | Done |
| Medium | Perbaikan CORS akses LAN (dev) | `allow_origin_regex` mengizinkan akses dari IP LAN mana pun di port 5173, bukan cuma `localhost` | `api/main.py` | 2026-08-14 | 2026-08-14 | Done |
| Low | Cleanup komponen lama (TopBar) | Komponen `TopBar.jsx` dihapus, digantikan `Sidebar` + `LedToolbar` | `web/src/components/TopBar.jsx` (dihapus) | 2026-08-07 | 2026-08-12 | Done |

**Catatan umum:**
- Tanggal diestimasi dari timestamp modifikasi file (belum ada commit git sejak Mei 2026 — seluruh pekerjaan Agustus masih *uncommitted*, disarankan mulai commit bertahap per fitur).
- Status "Done" berarti kode/file sudah ada dan terpasang di alur aplikasi, bukan berarti sudah full-tested di production.
