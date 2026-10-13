# Setor ke LED — Desain

Tanggal: 2026-10-13 · Branch: `feat/setor-led` (worktree terpisah dari `dev-2`)

## 1. Tujuan dan konteks

Alur penyusunan LED:

1. Generasi LED setengah jadi (bab-bab ditulis, tabel analisis IKU masih kosong).
2. **Scoring "setor ke LED"** (terpisah dari AMI) — fitur yang dirancang di sini.
3. Generasi LED penuh (tabel IKU terisi).
4. AMI scoring (skor final rubrik LAM Teknik 0–4 atas LED penuh).

Setor ke LED mengisi tabel analisis IKU di LED, mis. Tabel C5.1 (Sarana, Prasarana, K3L) dan
Tabel C6.1 (Mahasiswa dan Luaran Mahasiswa). Tiap IKU di tabel itu punya kolom Target,
Capaian, Evaluasi, lalu empat narasi: **Analisis ketercapaian**, **Usulan target tahun depan**,
**Strategi pencapaian**, **Sarpras yang dibutuhkan**. IKU yang *Belum memenuhi standar* punya
tambahan: **Faktor pendukung**, **Faktor penghambat**, **Akar masalah**, **Tindak lanjut**
(contoh: IKU.REL.MHS.4, Tabel C6.1).

Dipisah dari AMI karena skalanya berbeda: kolom Evaluasi LED berupa kategori
(Melampaui / Memenuhi / Belum memenuhi standar), bukan skor 0–4 rubrik LAM Teknik. Satu
pipeline untuk keduanya membuat AI bingung menentukan nilai.

Cakupan pekerjaan ini: **API endpoint + testing saja**. UI dan flow digarap Dimas.

## 2. Keputusan yang sudah disepakati

| Topik | Keputusan |
|---|---|
| Sumber daftar IKU | Dikirim di body request (kode, indikator, target). Tanpa tabel IKU baru. |
| Capaian | **Selalu dicari AI** dari LKPS/LED. Hasil bisa diedit penulis di canvas editor LED. |
| Bentuk nilai | **Kategori Evaluasi saja** (3 nilai tetap). Skor angka dan skalanya (0–1/0–2/0–4/…) urusan Dimas, di luar cakupan. |
| Narasi | 4 bagian inti selalu; 4 bagian tambahan hanya bila `BELUM_MEMENUHI`. |
| AMI | **Tidak diubah** (justifikasi + rekomendasi tetap). Lihat §8. |
| Arsitektur | Job BullMQ `SETOR_LED` + modul Python sendiri; hasil di `Job.result`, tanpa tabel baru. |

## 3. Kontrak API

Sejajar dengan `POST dokumen/:id/assessment` di `apps/backend/src/dokumen-led/dokumen-led.controller.ts`,
role tulis yang sama (`WRITE_ROLES`).

```
POST /dokumen/:id/setor-led
{
  "ikuList": [
    { "kode": "IKU.REL.MHS.3",
      "indikator": "Rata-rata minimal IPK lulusan dalam 3 tahun terakhir",
      "target": "PJJ: RIPK ≥ 3,25" }
  ],
  "sumberLed": "EDITOR",          // opsional, sama seperti AMI
  "lkpsBuktiDukungId": "...",     // opsional, sama seperti AMI
  "model": "..."                  // opsional
}
→ 201  baris Job { id, type: "SETOR_LED", status: "WAITING", ... }
```

Validasi DTO: `ikuList` 1-200 item; `kode`, `indikator`, `target` wajib tidak kosong (spasi saja ditolak);
`kode` unik dalam satu request. Progress lewat SSE yang ada (`JobEventsService`); batal lewat flag Redis
`job:cancel:{bullJobId}` yang ada (`POST /jobs/:id/cancel` menerima `Job.id` maupun `bullJobId`, kini juga untuk
`SETOR_LED`).

**Hasil: `GET /jobs/:id`** (baru, tenant-scoped; `id` = `Job.id` dari respons enqueue) mengembalikan
`{ id, type, status, progress, result, error }`. Premis awal spec ("hasil lewat GET job yang ada") ternyata salah:
baris Postgres `Job` hanya ditulis saat enqueue dan tidak pernah diperbarui, dan satu-satunya jalur hasil adalah
event SSE `completed` sekali jalan, sehingga tab yang ditutup/dimuat ulang kehilangan hasil. `GET` membaca status
dan return value dari BullMQ (disimpan sesuai `removeOnComplete`, kini 1000 job terakhir per antrean) dan jatuh ke
baris Postgres bila BullMQ sudah membuang job-nya. Konsekuensi: hasil sebuah job bisa diambil selama BullMQ masih
menyimpannya; setelah itu hilang (tidak ada tabel hasil, sesuai §2).

Aturan LKPS sama dengan `triggerAssessment`: LKPS milik dokumen menang atas kiriman klien;
kiriman klien hanya dipakai (dan menjadi LKPS dokumen) bila dokumen belum punya.

### Hasil di `Job.result`

```
{ "status": "completed" | "cancelled" | "error",
  "hasil": [{
    "kode": "IKU.REL.MHS.3",
    "capaian": { "nilai": "RIPK = 3,46", "sumber": "LKPS Tabel 6.b" },
    "evaluasi": "MELAMPAUI" | "MEMENUHI" | "BELUM_MEMENUHI",
    "analisisKetercapaian": "...",
    "usulanTargetTahunDepan": "...",
    "strategiPencapaian": "...",
    "sarprasDibutuhkan": "...",
    "tambahan": { "faktorPendukung": "...", "faktorPenghambat": "...",
                  "akarMasalah": "...", "tindakLanjut": "..." },   // hanya BELUM_MEMENUHI
    "error": "..."                                                // kegagalan per IKU
  }] }
```

Pada `error` per IKU, field capaian/evaluasi/narasi tidak ada. Pada `cancelled`, IKU yang sudah
selesai tetap dikembalikan.

## 4. Perubahan wiring (mengikuti pola `ASSESSMENT_AMI`)

- `packages/db/prisma/schema.prisma`: enum `JobType` + `SETOR_LED`; migrasi Prisma baru
  (`prisma migrate dev`, lalu `prisma generate`).
- `apps/backend/src/jobs/queue-names.ts`: `[JobType.SETOR_LED]: ASSESSMENT_QUEUE`.
- `apps/backend/src/jobs/jobs.service.ts`: `queueFor` → `assessmentQueue` untuk `SETOR_LED`.
- `apps/backend/src/dokumen-led/`: DTO `trigger-setor-led.dto.ts`, `triggerSetorLed()` di
  service, route di controller.
- `apps/ai/worker.py`: dispatch `SETOR_LED` ke `_handle_setor_led` (handler tipis).
- `apps/ai/setor_led/` (baru): `schema.py`, `prompts.py`, `pipeline.py`, `tools.py`
  (tool pencarian bukti dukung tingkat prodi, lihat §5).
- `apps/ai/vectorstore/pgvector_evidence_store.py`: fungsi baru `list_prodi_evidence_ids`
  (fungsi `list_available_evidence_ids` milik AMI tidak diubah).

`QUEUE_NAMES` di `worker.py` dan `queue-names.ts` tidak berubah (memakai `assessment-queue`).

## 5. Pipeline AI

`_handle_setor_led` meniru `_handle_assessment_ami`: validasi payload, `get_document_accreditation_set`,
`_prepare_led_index` (EDITOR/UNGGAHAN), `load_lkps_for_document` (LKPS wajib), lalu memanggil
pipeline dengan `ASSESSMENT_MAX_PARALLEL` (semaphore), `job.updateProgress`, dan cek batal Redis.
Tidak membuat `AssessmentSession` — setor LED tidak memakai tabel AMI.

Per IKU (independen, tanpa state bersama):

1. **Cari Capaian.** Loop tool kecil (maks. ±6 langkah) dengan tiga tool: `get_lkps_table` dan
   `search_led_evidence` (dipakai ulang apa adanya) dan `cari_bukti_dukung_prodi` (baru, di
   `setor_led/tools.py`). Daftar nama tabel LKPS yang tersedia diberikan di awal agar LLM tidak
   menebak. Keluaran `{nilai, sumber}` atau "tidak ditemukan". Tool bawaan membaca
   `AssessmentContext` (tenant, dokumen); diisi dengan `indicator_no=0` — kode tool tidak diubah.
   `cari_bukti_dukung_prodi(query)` mencari ke seluruh Bukti Dukung (`kind=BUKTI_DUKUNG`) milik
   prodi dokumen ini plus yang berlaku tenant-wide (`study_program_id IS NULL`), **tanpa tag
   indikator**: `list_prodi_evidence_ids(tenant, prodi)` (mengembalikan `{id: document_name}`)
   lalu `search_evidence(...)` yang sudah ada. `search_evidence` hanya mengembalikan
   `bukti_dukung_id`; tool memetakannya ke `document_name` dari hasil `list_prodi_evidence_ids`
   supaya `sumber` bisa berbunyi mis. "Bukti dukung: <nama berkas>".
   Bila prodi tidak punya bukti, tool mengembalikan list kosong (bukan error).
2. **Evaluasi + narasi.** Satu panggilan LLM berformat JSON (pola `_handle_simulasi_skor`:
   `build_plain_llm`, `no_think`, `with_retry`, `_extract_json`). Masukan: indikator, target,
   capaian, potongan bukti dari tahap 1. Keluaran: `evaluasi` (enum) + narasi; plus bagian
   tambahan bila `BELUM_MEMENUHI`.

Aturan:
- **Evaluasi ditentukan LLM**, dibatasi enum 3 nilai (format target terlalu beragam untuk aturan
  kode: `≥ 3,25`, `3,5 < MS ≤ 4,5`, `NAPJ ≥ 3`). Nilai di luar enum dicoba ulang sekali, lalu
  `error` pada IKU itu.
- **Capaian tidak ditemukan → tidak ada narasi.** IKU dikembalikan dengan
  `error: "Capaian tidak ditemukan di LKPS/LED/bukti dukung"`; penulis mengisi manual di editor.
- `search_evidence_documents` (milik AMI) **tidak dipakai**: ia hanya mencari bukti yang di-tag ke
  indikator rubrik (`evidence_indicator_tags`), sedangkan IKU bukan indikator rubrik. Gantinya
  `cari_bukti_dukung_prodi` di atas. Konsekuensi: pencarian melintasi seluruh bukti prodi sehingga
  hasil bisa bercampur dokumen tak relevan; kualitas bergantung pada query yang disusun LLM.
- **Hanya model chat dengan tool calling asli.** Model reasoning (`is_reasoning_model()`)
  ditolak dengan pesan jelas; protokol JSON-tool `reasoning_graph.py` tidak diduplikasi.
- Validasi `model` terhadap `get_available_models()` seperti AMI.

## 6. Penanganan error

- **Level job** → `{status: "error", error}`: `ikuList` kosong atau `kode` duplikat, LED belum
  terindeks, LKPS tidak tersedia, dokumen belum punya Set Akreditasi, model tidak dikenal atau
  model reasoning.
- **Level IKU** → field `error`, IKU lain tetap jalan: capaian tidak ditemukan, JSON model tidak
  terbaca, evaluasi di luar enum setelah retry, timeout LLM.
- **Dibatalkan** → `{status: "cancelled", hasil: [...sebagian]}`.

## 7. Testing

Tes otomatis tanpa LLM asli (LLM tiruan, seperti `tests/test_handle_assessment_ami.py`).

`apps/ai/tests/setor_led/`:
- Skema: enum evaluasi valid; `tambahan` hanya ada bila `BELUM_MEMENUHI`.
- Pipeline: capaian ketemu → narasi lengkap; capaian tidak ketemu → `error` tanpa narasi; enum
  salah → retry sekali lalu error; satu IKU gagal tidak menjatuhkan IKU lain; batal; progress.
- Tool bukti dukung: mengembalikan hasil dari bukti milik prodi dan tenant-wide saja (bukti prodi
  lain tidak ikut); prodi tanpa bukti → list kosong, bukan error. Tes `list_prodi_evidence_ids`
  yang butuh Postgres/pgvector di-skip tanpa `DATABASE_URL`, seperti `test_postgres_client.py`.
- Handler (`test_handle_setor_led.py`): tiap prasyarat gagal (LED, LKPS, list kosong, model
  reasoning) dan bentuk hasil akhir.

Backend (jest, `dokumen-led.service.spec.ts` + DTO):
- `triggerSetorLed` mengantre `SETOR_LED` dengan payload benar; LKPS dokumen menang atas kiriman
  klien; validasi DTO (list kosong, kode duplikat); peta antrean mencakup `SETOR_LED`.

**Uji manual (bukan otomatis):** jalankan dengan LKPS di `docs/reference/` untuk IKU.REL.MHS.3,
IKU.REL.SPR.2, dan IKU.REL.SPR.5 (kasus tanpa LKPS) dari LED PENS, bandingkan Capaian dan Evaluasi dengan yang tertulis di PDF. Satu-satunya
cek kualitas LLM yang nyata.

## 8. Kenapa AMI tidak diubah

Justifikasi AMI adalah bukti audit skor rubrik, dan dikonsumsi oleh: parser `graph.py:868-924` dan
`reasoning_graph.py`, penyimpanan `postgres_client.py:217-274`, **judge independen**
(`graph.py:945`, menurunkan confidence bila tidak didukung bukti), **RAGAS**
(`eval/ragas_eval.py:398-470`), UI `assessment-detail-sheet.tsx`, PDF `assessment-pdf.ts`,
skema zod FE `indicator-result.entity.ts`, dan benchmark `scripts/run_benchmark.py`. Narasi setor LED
bersifat prospektif (usulan target, strategi, sarpras) sehingga tidak bisa diverifikasi ke bukti
dan tidak cocok menggantikannya. Memisahkan pipeline sudah menyelesaikan masalah skala tanpa
menyentuh area itu.

## 9. Di luar cakupan

UI dan flow; memasukkan hasil ke bab/canvas editor LED; skor angka dan skalanya; tabel DB baru;
tag bukti dukung per IKU dan pemilihan bukti per IKU di request; model reasoning; segala
perubahan pada AMI.

## 10. Catatan terbuka

- Prompt memakai deskripsi gaya per bagian, **bukan** contoh dari LED PENS (dokumen bertanda
  "Hanya untuk Internal PENS"), agar konten itu tidak masuk ke kode yang di-commit.
- Capaian IKU non-LKPS (mis. K3L, SK) kini bisa ditemukan lewat `cari_bukti_dukung_prodi`, tapi
  hanya bila bukti terkait sudah diunggah dan terindeks di prodi. Kualitas pencarian lintas seluruh
  bukti prodi belum teruji; IKU.REL.SPR.5 (K3L, capaian "100%" tanpa tautan LKPS di LED contoh)
  dipakai sebagai kasus uji manual utama. Kalau banyak IKU tetap berakhir `error` capaian tidak
  ditemukan, opsi lanjutan: lunakkan aturan §5 (narasi tetap ditulis dengan capaian `null`) atau
  pilihan bukti per IKU di request.
