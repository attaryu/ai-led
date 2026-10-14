# Judge AMI hanya saat dipicu (on-demand)

Tanggal: 2026-10-13 · Branch: `feat/ami-judge-on-trigger` (dari `dev-2` @ `1190597`) · Status: draf untuk ditinjau

## 1. Tujuan dan latar

Scoring satu indikator AMI berakhir dengan `decimal_refine → judge → END`. `judge_node` memanggil
model juri terpisah (`build_judge_llm`, konfigurasi `RAGAS_*`) satu kali per indikator di jalur utama.
Tujuan: keluarkan judge dari jalur itu sehingga scoring selesai di `decimal_refine`, dan judge hanya
berjalan saat pengguna memicunya.

Cakupan: **hanya** dua graph AMI (`apps/ai/agent/graph.py`, `apps/ai/agent/reasoning_graph.py`).
`llm/chat_model.py::build_judge_llm` (judge generasi bab, dipakai `worker.py`) **tidak berubah**.

Batasan: perubahan sekecil yang masih benar; format keluaran `SKOR/JUSTIFIKASI/CONFIDENCE` tidak
berubah; tidak ada job BullMQ baru.

## 2. Fakta kode yang mendasari (commit 1190597)

- `judge_node` (`graph.py:945`, `reasoning_graph.py:603`) adalah node terakhir. Efeknya hanya dua:
  menambah `{"judge_verdict": ...}` ke `reasoning_steps`, dan bila `grounded is False` menurunkan
  `confidence` menjadi `min(confidence, 0.3)`.
- Masukan judge: `justification[:1500]` dan `evidence_text[:3000]`; `evidence_text` dirangkai dari
  hasil tool (`search_led_evidence`, `search_evidence_documents`, `get_lkps_table`) di
  `state["messages"]`.
- **Setelah graph selesai, teks bukti itu tidak tersimpan.** `sources_used` hanya memuat sitasi
  (halaman/paragraf/section, nama tabel LKPS, nama entity), bukan teks; `reasoning_steps` di graph
  reasoning hanya string seperti `"tool:search_led_evidence"`. Judge on-demand karena itu butuh bukti
  yang disimpan saat scoring.
- `judge_verdict` ada di `AssessmentState` tetapi tidak punya kolom di `IndicatorResult`; ia hanya
  tersimpan lewat `reasoning_steps` (`content=str(step)`, yaitu repr Python, bukan JSON).
- Tidak ada UI AMI yang membaca `judge_verdict`.
- Preseden on-demand sudah ada: "Jalankan Evaluasi" RAGAS (`POST assessment-sessions/:id/eval` →
  proxy ke apps/ai `POST /eval/run` → `BackgroundTasks`, status di dict memori `_eval_results`, hasil
  ke `assessment_sessions.kualitas`).

## 3. Keputusan

| # | Keputusan | Pilihan |
|---|---|---|
| 1 | Penyimpanan | Dua kolom nullable baru di `IndicatorResult`: `judge_evidence` (cuplikan bukti, ≤3000 char, persis masukan judge) dan `judge_verdict` (JSON). Cuplikan disimpan saat scoring; verdict ditulis saat judge dipicu. |
| 2a | Sumber trigger | Proxy HTTP NestJS → apps/ai, mengikuti pola RAGAS. **Tanpa job BullMQ.** |
| 2b | Granularitas | Satu endpoint; body opsional daftar indikator. Kosong = seluruh sesi, berisi = hanya itu. |
| 3 | `confidence` | **Tidak diubah** oleh judge. Tetap laporan model penilai. Efek "turun ke ≤0,3" dihapus sepenuhnya (otomatis maupun on-demand). |
| 4 | Sesi lama | Tanpa backfill. Semua baris tanpa verdict tampil "Belum dijudge". Baris dengan `judge_evidence IS NULL` dilewati saat judge diminta dan dilaporkan sebagai `skipped`. |
| 5 | Cakupan | Dua graph AMI saja (lihat §1). |
| UI | Cakupan web | UI lengkap: per indikator di detail sheet, per sesi, dan penanda di daftar. |

## 4. Desain

### 4.1 Jalur scoring (apps/ai)

```
sebelum:  parse_output → decimal_refine → judge ────────────────► END
sesudah:  parse_output → decimal_refine → evidence_snapshot ────► END   (tanpa LLM)
```

- Di kedua graph, `judge_node` diganti `evidence_snapshot_node`: mengisi
  `state["judge_evidence"] = <evidence_text>[:3000]`. Graph native memakai `collect_evidence_text`;
  graph reasoning memakai `_collect_reasoning_evidence_text` (keduanya sudah ada, tidak dipindah).
- Isi `judge_node` lama dipindah menjadi `run_judge(justification, evidence_text) -> dict` di
  `agent/graph.py` (di samping `build_judge_llm`, `JUDGE_PROMPT_TEMPLATE`, `parse_judge_verdict`):
  bangun LLM, isi prompt, panggil, parse; kegagalan menghasilkan `{"error": ...}`. `reasoning_graph.py`
  tetap mengimpor dari `agent.graph`.
- `AssessmentState` mendapat `judge_evidence: Optional[str]`. Field `judge_verdict` dihapus bila tidak
  ada lagi yang menulisnya (diverifikasi saat implementasi; tes yang merujuknya disesuaikan).
- `_process_single_indicator` (`api/routes/assessment.py`) meneruskan `result.get("judge_evidence")`
  ke `log_indicator_result`.
- `log_indicator_result` (`db/postgres_client.py`): kolom `judge_evidence` ikut diinsert; pada
  `ON CONFLICT DO UPDATE`, `judge_evidence = EXCLUDED.judge_evidence` dan **`judge_verdict = NULL`**
  (penilaian ulang mengganti justifikasi, verdict lama tidak boleh menempel).
- `NULL` vs `""`: pada sesi baru, bukti kosong disimpan sebagai `""` (keadaan nyata: agen tidak
  menemukan apa pun; judge tetap boleh berjalan). `NULL` hanya untuk sesi lama dan baris galat.
  Semua pemeriksaan memakai `is None`, bukan kebenaran-nilai (`or`).
- Baris galat (`give_up`, `error`) tidak mengisi `judge_evidence`.

### 4.2 Trigger on-demand (apps/ai, modul baru `api/routes/assessment_judge.py`)

Modul terpisah (router `/assessment` yang sama, didaftarkan di `main.py`) supaya `api/routes/assessment.py`
yang sudah besar tidak membengkak dan diff-nya kecil.

- `POST /assessment/{session_id}/judge`, body opsional `{"indicators": [{"indicator_no": int, "sub_no": str}]}`.
  Tenant diambil dari sesi di DB (pola `/eval/run`; apps/ai tidak punya konsep tenant dari klien).
  Respons segera: `{judge_id, total, skipped}`. Pekerjaan berjalan di `BackgroundTasks`, dibatasi
  `asyncio.Semaphore(ASSESSMENT_MAX_PARALLEL)`, memanggil `run_judge` lewat `run_in_executor`.
- `GET /assessment/judge/{judge_id}` → `{status, session_id, total, done, skipped, failed}` dari dict
  memori (seperti `_eval_results`).
- Aturan baris:
  - `skipped`: `score IS NULL`, atau ada `error`, atau `judge_evidence IS NULL`.
  - Daftar kosong (judge sesi) tidak menjalankan ulang baris yang sudah punya verdict, dan baris itu
    **tidak dihitung** sebagai `total` maupun `skipped` (alasan `skipped` tetap hanya "tidak bisa dijudge").
    Daftar eksplisit (judge per indikator) selalu menjalankan ulang; indikator yang diminta tetapi tidak ada
    di sesi dihitung `skipped`.
  - Bila `run_judge` mengembalikan `{"error": ...}`, verdict **tidak disimpan** dan baris dihitung
    `failed` (tetap "Belum dijudge", bisa dicoba lagi).
  - Verdict tersimpan = keluaran judge + `judge_model` + `judged_at`.
- Penulisan: `UPDATE assessment_indicator_results SET judge_verdict = %s WHERE session_id, indicator_no,
  sub_no AND justification IS NOT DISTINCT FROM <justifikasi yang dinilai>` sehingga penilaian ulang
  yang terjadi saat judge berjalan tidak ditimpa verdict kedaluwarsa. Fungsi baru
  `set_judge_verdict` di `db/postgres_client.py`; `get_indicator_results` tidak mengembalikan
  `judge_evidence`.
- Status "sedang berjalan" hilang bila apps/ai restart (sama dengan RAGAS). Verdict yang sudah ditulis
  tetap ada.

### 4.3 Skema (`packages/db`)

`IndicatorResult` mendapat:

```prisma
judgeEvidence String? @map("judge_evidence") @db.Text
judgeVerdict  Json?   @map("judge_verdict")
```

Migrasi baru: `20261013110000_assessment_judge_on_demand` (`ALTER TABLE ... ADD COLUMN` ×2).
Setelah itu `npx prisma generate`.

### 4.4 NestJS (modul `assessment`)

- `POST assessment-sessions/:id/judge` (role `PENJAMIN_MUTU`, `PENYUSUN`), DTO `RunJudgeDto`
  (`indicators?: {indicatorNo: int, subNo?: string}[]`; array polos `@IsArray`, elemen divalidasi di service
  sesuai konvensi apps/backend yang tidak memakai `@ValidateNested`). `findSessionScoped` lalu proxy ke
  `${AI_SERVICE_URL}/assessment/:id/judge`.
- `GET assessment-judge/:judgeId`: proxy status, lalu `findSessionScoped(session_id)` dari respons
  (pola `findEvalResult`).
- `findResults` mengembalikan `judgeVerdict` tetapi **tidak** `judgeEvidence` (verifikasi `omit` Prisma
  6.19 saat implementasi).

### 4.5 Web (`apps/web/app/features/assessment`)

- `indicator-result.entity.ts`: field `judge` nullable `{grounded, klaimTakTerdukung[], faktaTerlewat[],
  catatan, model, dinilaiPada}`. `backend-mappers.ts` memetakan `judgeVerdict` (`hallucinated_claims`,
  `missing_facts`, `notes`, `judge_model`, `judged_at`) dan toleran terhadap bentuk rusak/`null`.
- Remote source + repository: `runJudge(sessionId, indicators?)`, `findJudgeStatus(judgeId)`.
- Hook `use-assessment-judge.ts` (pola `use-assessment-quality.ts`): `diam | berjalan | gagal`, progres
  `{done,total,skipped,failed}`, polling 2 detik, berhenti bila sesi berganti, memuat ulang hasil saat
  selesai; polling 404 → berhenti dan muat ulang hasil. Izin: `izin.canRun` dan sesi `COMPLETED`.
- `assessment-detail-sheet.tsx`: blok di bawah "Justifikasi AI": "Belum dijudge" + "Jalankan Judge", atau
  hasil (label "Didukung bukti" / "Tidak sepenuhnya didukung bukti", klaim tak terdukung, fakta terlewat,
  catatan, model, waktu) + "Jalankan ulang". Teks bantuan: pemeriksaan independen apakah klaim didukung
  bukti yang diambil AI; bukan ukuran ketepatan skor.
- Kepala daftar hasil: tombol "Judge semua" dengan progres ("34/58 · 6 dilewati") dan ringkasan akhir.
- `assessment-result-row.tsx`: ikon penanda bila `judge.grounded === false` (tooltip sama).
- Tidak berubah: badge confidence, PDF ekspor, verdict Penjamin Mutu, urutan menurut keyakinan.

## 5. Pengujian

- apps/ai (pytest): `tests/agent/test_graph.py` (~751, 820) dan `tests/agent/test_reasoning_graph.py`
  (~522, 620) berubah dari "judge menurunkan confidence" menjadi "snapshot mengisi `judge_evidence`,
  tidak memanggil LLM juri, `confidence` tidak berubah". Tes baru: `run_judge` (sukses, error, JSON
  rusak), `log_indicator_result` (upsert mengosongkan `judge_verdict`), `set_judge_verdict` (guard
  justifikasi), endpoint judge (lewati: score NULL/error/evidence NULL/sudah dijudge; daftar eksplisit
  menjalankan ulang; verdict error tidak disimpan; 404 sesi tak dikenal).
- NestJS (jest): `assessment.service.spec.ts` untuk proxy judge, scoping tenant/prodi, `findResults`
  tanpa `judgeEvidence`.
- Web: vitest untuk mapper `judgeVerdict` (valid, `null`, rusak) dan `npm run typecheck`.
- Tes lain yang menyebut "judge" (`test_worker.py`, `test_ragas_eval.py`, `test_chat_model.py`,
  `test_handle_generasi_bab_section.py`, `test_excel_io.py`) bukan judge AMI dan tidak diubah.

## 6. Dampak yang perlu diketahui

- Scoring tidak lagi menunggu panggilan juri; juga tidak ada lagi pertukaran model juri di tengah
  sesi yang sebelumnya bisa memaksa Ollama mengevict model penilai.
- `confidence` pada sesi baru tidak lagi dipotong ke ≤0,3 oleh judge. Sinyal "tidak didukung bukti"
  pindah ke penanda judge yang terpisah.
- Sesi lama: baris yang dulu di-judge otomatis tampil "Belum dijudge" (verdict lamanya tetap hanya di
  log reasoning, dan `confidence`-nya tetap yang sudah dipotong). Mereka tidak bisa di-judge on-demand
  karena bukti tidak tersimpan; judge menandainya `skipped`.
- Verdict hanya mencerminkan bukti ≤3000 karakter yang sama dengan masukan judge lama, bukan seluruh
  bukti yang diambil agen.

## 7. Koordinasi dengan SETOR_LED (`feat/setor-led`)

Satu-satunya file bersama: `packages/db/prisma/schema.prisma`. SETOR_LED menambah satu nilai enum
`JobType` (`SETOR_LED`) dan migrasi `20261013100000_job_type_setor_led`; perubahan ini ada di model
`IndicatorResult` dan migrasi `20261013110000_assessment_judge_on_demand`. Merge teks seharusnya bersih;
urutan merge bebas karena `ALTER TYPE` dan `ALTER TABLE` tidak saling bergantung (`prisma migrate dev`
bisa mengeluhkan urutan bila migrasi bertimestamp lebih awal masuk belakangan; `migrate deploy` tidak).
Tidak disentuh: `queue-names.ts`, `jobs.service.ts`, `dokumen-led/*`, dispatch `worker.py`.

## 8. Di luar cakupan

- Judge untuk generasi bab; job BullMQ; backfill verdict lama; filter "tidak didukung bukti" di daftar;
  perubahan PDF ekspor.

## 9. Pekerjaan lanjutan yang diketahui

- Bila ingin audit di `infra_jobs` atau status yang tahan restart, judge dapat dipindah ke job BullMQ
  (`JUDGE_AMI`) kemudian; kontrak endpoint `POST .../judge` dan penyimpanan kolom tidak perlu berubah.
