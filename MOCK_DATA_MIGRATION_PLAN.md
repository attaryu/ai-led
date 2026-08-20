# Mock/Dummy Data Migration — Status & Plan

Ditulis 2026-08-20 sesi Claude, dilanjutkan besok. Konteks: user lapor "dokumen udah keupload padahal DB kosong" -> ternyata beberapa fitur masih localStorage mock walau backend-nya sudah jadi. Ini catatan lengkap biar sesi besok gak perlu audit ulang dari nol.

## ✅ SUDAH SELESAI & KEPUSH

**Evidence/Bukti Dukung** (`apps/web/app/features/evidence/`) — full migration dari localStorage mock ke `/bukti-dukung` + R2 presigned upload. Commit `bbce9ab`, sudah di-push ke `origin/dev-v1` (fast-forward, no new branch). **Checkout utama (`AI-LED-dev-v1`) perlu `git pull origin dev-v1` kalau belum.**

Tracker `Backend_Integration_Task_Tracker.xlsx` sudah diupdate (baris 49-50).

Known gap yang dicatat (bukan bug baru, keputusan sadar): `findAvailableForStudyProgram` untuk role PENYUSUN gak dapat evidence level tenant karena `GET /bukti-dukung` tanpa `programStudiId` 403 buat PENYUSUN by design (docs/database.md §7). Belum diubah.

## 🔴 BELUM — hasil audit 4 agent paralel (2026-08-20)

Setelah evidence beres, user tanya "ada lagi yang masih mockup?" — di-audit menyeluruh, ketemu 4 area lagi. **Yang paling parah: chapter editor (alur nulis inti aplikasi)**, lebih serius dari evidence karena bukan cuma daftar dokumen, tapi autosave & review workflow.

### 1. Chapter core (`apps/web/app/features/chapter/data/repositories/chapter.repository.ts`) — SETENGAH FAKE, PALING PRIORITAS

File ini 639 baris. `findByProjectId`/`refreshFromBackend` udah real (`GET /dokumen/:id/bab`, `GET /bab/:id`), generate AI juga real. **Tapi 6 method live lainnya masih localStorage (`chapter_data_v2`):**

| Method (repo.ts) | Dipanggil dari | Backend endpoint yang SUDAH ADA tapi belum dipanggil |
|---|---|---|
| `updateKonten` (baris 387) | `use-chapter-autosave.ts:94` — **ini autosave beneran, apa yg diketik user hilang kalau ganti device/browser** | `PATCH bab/:id` body `{kontenKerja}` — sudah ada, `UpdateBabDokumenDto` |
| `findById` (363, dipakai sbg snapshot) | `chapter-editor.tsx:351` (`ambilSnapshot`) | tinggal pakai hasil `findByProjectId`/`refreshFromBackend` yang udah di-fetch, gak perlu endpoint baru |
| `restoreFromDraft` (476) | `use-chapter-draft.ts:130` (tombol "Pulihkan") | gak ada endpoint restore khusus — compose dari `GET bab/:id/drafts` (ambil `kontenSnapshot`) lalu `PATCH bab/:id` |
| `setTerkunci` (518) | `use-chapter-review.ts:62` (kunci/buka PM) | `PATCH bab/:id/review-status` body `{terkunci}` |
| `setCatatanPenjaminMutu` (550) | `use-chapter-review.ts:69` | `PATCH bab/:id/review-status` body `{catatanPenjaminMutu}` — **satu endpoint yang sama** dengan `setTerkunci`, DTO `ReviewStatusDto` nerima keduanya sekaligus (`terkunci?`, `catatanPenjaminMutu?`), otomatis clear `diajukanReviewPada` |
| `setDiajukanReview` (597) | `use-chapter-review.ts:80` (submit-for-review Penyusun) | `POST bab/:id/submit-review` |
| `findAll` (296, dipakai LANGSUNG oleh `use-institution-readiness.ts:56`) | Dashboard Utama KPI cards | **BELUM ADA endpoint tenant-wide buat semua bab** — perlu backend baru, lihat #3 |

**Dead code, aman dihapus:** `applyGenerate` (423, nol caller, komentar sendiri ngaku vestigial), `deleteByProjectId` (620, nol caller).

`chapterRemoteSource` (`apps/web/app/features/chapter/data/sources/remote/chapter.remote-source.ts`) BELUM punya method `update`/`submitForReview`/`setReviewStatus`/`remove` — perlu ditambah, backend-nya udah lengkap (`apps/backend/src/bab-dokumen/bab-dokumen.controller.ts` baris 59-197: `PATCH bab/:id`, `POST bab/:id/submit-review`, `PATCH bab/:id/review-status`, `DELETE bab/:id`, semua `@Protected` role yang sesuai).

### 2. Dashboard Utama KPI (`use-institution-readiness.ts`) — butuh backend baru

`findAll()` di atas dipakai buat hitung KPI institution-wide dari SEMUA bab lintas prodi. Gak ada endpoint tenant-wide buat bab (yang ada cuma per-dokumen: `GET /dokumen/:id/bab`). Perlu tambah endpoint baru di `apps/backend/src/bab-dokumen/`, **mirror pola `GET /dokumen` tenant-wide yang udah dibikin buat kasus sama persis di dokumen-led (lihat tracker baris 19 — "GET /dokumen Tenant-Wide & Fix N+1")**. Contoh nama: `GET /bab` (tenant-scoped, `Protected` sesuai role, kemungkinan exclude PENYUSUN atau scope ke prodi sendiri — ikuti pola yang sama).

### 3. Chapter-draft / tab Draft (`chapter-draft.repository.ts`) — split-brain, kecil

- `findByChapterId` (baca daftar checkpoint di tab Draft) masih localStorage mock, PADAHAL ada `chapterRemoteSource.findDrafts(id)` yang REAL dan udah dipakai tab Rujukan (`use-chapter-reference.ts:59`) & tab Kualitas AI/Rubrik (`use-chapter-quality.ts:52`). Efeknya: checkpoint AI-generated cuma muncul di Rujukan/Rubrik, checkpoint manual cuma muncul di tab Draft — dua tab bisa beda cerita. **Fix: tinggal arahkan `findByChapterId` ke `chapterRemoteSource.findDrafts`, gak perlu endpoint baru.**
- `create()` (tombol "Simpan Draft" manual checkpoint, `use-chapter-draft.ts:88`) — **BELUM ADA endpoint backend buat bikin checkpoint manual.** Model Prisma `BabDraft.sumber` udah support `'AI' | 'MANUAL'`, tapi cuma worker (AI) yang pernah nulis row-nya. Perlu endpoint baru: `POST bab/:id/drafts` (sumber=MANUAL, isi `kontenSnapshot` dari `kontenKerja` chapter saat itu).

### 4. Chapter scoring — TERNYATA UDAH REAL, tinggal cleanup

`chapter-score.repository.ts` + `chapter-score-local.source.ts` + `chapter-scoring.mock.ts` — **100% dead code, nol caller.** Fitur simulasi skor rubrik yang sebenarnya (`chapter-rubric-panel.tsx` -> `use-chapter-score.ts` -> `chapterRemoteSource.findRubrik`/`simulateScore` -> BullMQ -> Python worker LLM -> `HasilSkorKriteria`) sudah full real & jalan. Gak ada kerjaan migrasi di sini — cuma **hapus 3 file dead code itu**, plus hapus dead call site `deleteByTargets` di `chapter.repository.ts:634` (dipanggil dari `deleteByProjectId` yang juga dead, lihat #1).

### 5. Users (`apps/web/app/features/users/`) — PALING GEDE, butuh backend baru juga

**Nol method yang real.** Gak ada file `remote/` sama sekali di `data/sources/`. Semua baca/tulis ke localStorage key `user_data`, di-seed 6 akun palsu.

- `create-user.tsx` malah gak lewat repository sama sekali — baca/tulis `localStorage` inline di komponennya sendiri (baris 98-109). Submit "Tambah User Baru" gak pernah manggil `POST /users` yang udah ada & jalan di backend.
- `edit-user.tsx`, `user-management.tsx` (list+delete), `use-program-readiness.ts`, `use-institution-readiness.ts` (roster Penyusun) — semua baca `userRepository` yang localStorage.

Backend yang udah ada (`apps/backend/src/users/`): `POST /users` (Admin, bikin akun) dan `PATCH /users/:id` (Pimpinan, **cuma pindah `programStudiId`**, bukan edit profil penuh).

**Yang belum ada di backend, perlu dibikin:**
- `GET /users` (list, kemungkinan tenant/prodi-scoped) — belum ada endpoint list sama sekali.
- Cara edit profil penuh (nama/email/role/password) — `PATCH /users/:id` sekarang cuma nerima `programStudiId`. Perlu extend DTO-nya atau bikin endpoint terpisah — ini keputusan desain, belum diputuskan.

**Frontend:** bikin `apps/web/app/features/users/data/sources/remote/user.remote-source.ts`, rewire `user.repository.ts` (findAll/findById/findPenyusunByStudyProgramId/update/delete) ke situ, tulis ulang `create-user.tsx` biar manggil repository/API beneran bukan localStorage langsung.

## Urutan yang direncanakan (user pilih "semuanya sekaligus")

1. Hapus dead code chapter-score (kecil, aman, gak nyentuh apa-apa yang live)
2. Chapter editor: tambah 4 method di `chapterRemoteSource` (update/submitForReview/setReviewStatus/remove), rewire 6 method mock di `chapterRepository`, update caller (`use-chapter-autosave.ts`, `use-chapter-review.ts`, `use-chapter-draft.ts` restore, `chapter-editor.tsx` snapshot)
3. Backend: endpoint tenant-wide `GET /bab` buat Dashboard Utama, mirror pola `GET /dokumen` (tracker baris 19)
4. Chapter-draft: rewire `findByChapterId` ke `chapterRemoteSource.findDrafts` (gak perlu backend baru); backend baru `POST bab/:id/drafts` (MANUAL) buat tombol "Simpan Draft"
5. Users: backend `GET /users` + keputusan desain endpoint edit profil, lalu full rewire frontend (repository + 4 file: create-user.tsx, edit-user.tsx, user-management.tsx, + 2 hook readiness)
6. Verifikasi: `npm run typecheck` (apps/web), `npx nest build` + `npx jest` (apps/backend), commit + push ke `origin/dev-v1` (langsung, no branch baru — sesuai CLAUDE.md), update tracker lagi.

## State teknis

- Kerja jalan di worktree: `.claude/worktrees/evidence-migration` (branch lokal `worktree-evidence-migration`, HEAD = commit `bbce9ab`, sinkron sama `origin/dev-v1`).
- Belum ada perubahan kode buat item #2-5 di atas — baru sampai tahap audit + rencana. File ini sendiri (`MOCK_DATA_MIGRATION_PLAN.md`) akan di-commit+push biar gak hilang kalau worktree-nya dibersihin.
- Task tracker internal sesi (harness TaskList) ada 4 task dibuat (#1-4, semuanya masih `pending`) yang isinya sama persis kayak rencana di atas — gak akan kebawa ke sesi besok, jadi rujukan utamanya file MD ini.

## Kalau lanjut besok

Buka dokumen ini, mulai dari langkah 1 di "Urutan yang direncanakan". Kalau sesi baru gak punya worktree yang sama, boleh bikin worktree baru dari `origin/dev-v1` (yang udah termasuk commit evidence `bbce9ab`) dan lanjut dari sana — semua detail teknis (nama method, endpoint, file:line) udah lengkap di atas, gak perlu audit ulang.
