# Setor ke LED: Skor Rubrik 0–4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Setor ke LED mengeluarkan `score` (0–4, dari rubrik indikator) + analisis menggantikan kategori Evaluasi, tanpa `capaian` di output.

**Architecture:** Per IKU: muat rubrik lewat `kode` (`criterion_code`) lebih dulu, cari Capaian (tahap 1, untuk indikator berumus sekaligus semua variabel rumus), tentukan skor (kode menghitung rumus; model memilih level untuk yang kualitatif), lalu satu panggilan model menulis narasi. Empat bagian `tambahan` ditulis bila `score < target`. AMI tidak diubah.

**Tech Stack:** Python 3.11 (`apps/ai`, pytest, LangChain), NestJS + class-validator + jest (`apps/backend`), Postgres.

**Spec:** `docs/superpowers/specs/2026-10-16-setor-led-skor-rubrik-design.md` (mengubah sebagian `2026-10-13-setor-led-design.md`). Cabang kerja: `feat/setor-led-score` dari `dev-2`; commit Conventional Commits Inggris (lihat `AGENTS.md`), jangan push tanpa diminta.

## Global Constraints

- `target` = bilangan bulat 0–4 dalam string (`"3"`); nilai lain ditolak dengan `400` di backend dan `ValueError` di worker.
- Output per IKU sukses: `kode`, `score`, `analisisKetercapaian`, `usulanTargetTahunDepan`, `strategiPencapaian`, `sarprasDibutuhkan`, dan `tambahan` (`faktorPendukung`, `faktorPenghambat`, `akarMasalah`, `tindakLanjut`) hanya bila `score < target`. **Tidak ada `capaian`.** IKU gagal tetap `{kode, error}`.
- `score` angka 0–4: desimal (2 digit) bila dihitung dari rumus, bulat bila dipilih model dari level.
- Skor tidak pernah ditebak: rubrik tak ditemukan / lebih dari satu baris / tanpa level yang dibutuhkan / variabel rumus hilang → IKU `error`, tanpa jatuh ke penilaian model.
- Baris komposit (`sub_score_formula`) tanpa level 0–4 sendiri → IKU `error` ("pilih sub-indikatornya").
- AMI tidak diubah: jangan menyentuh `agent/graph.py`, `agent/reasoning_graph.py`, `api/routes/assessment.py`, `agent/tools/*`.
- Rahasia (`.env`, key, password dari `DATABASE_URL`) tidak dicetak atau di-commit. Prompt memakai deskripsi gaya, bukan kutipan LED PENS ("Hanya untuk Internal PENS").
- Menjalankan tes `apps/ai`: `pytest` tidak ada di image `ai-led-ai:local`; pakai kontainer sekali pakai: `docker run --rm -v "$PWD/apps/ai":/app -w /app ai-led-ai:local sh -c "pip install -q pytest pytest-asyncio && pytest <target> -q"` (dari root repo).

## Review Focus

Masukan/kondisi yang tersirat spec tetapi tidak disebut eksplisit; tiap baris ada tesnya di task pemilik kode.

1. `target` `"5"`, `"-1"`, `"3.5"`, `"tiga"`, `"PJJ: RIPK ≥ 3,25"` → ditolak (Task 2, Task 6).
2. `kode` tidak ada di rubrik, atau dua baris berkode sama → hanya IKU itu `error`; IKU lain tetap jalan (Task 1, Task 5).
3. Variabel rumus sebagian hilang → `error` yang menyebut nama variabel yang hilang, bukan skor tebakan (Task 5).
4. Model (jalur level) membalas skor di luar 0–4 atau bukan angka → retry sekali lalu `error` (Task 5).
5. `score == target` dan `score` desimal sedikit di bawah target (mis. 3,99 vs 4) → `tambahan` hanya untuk yang benar-benar `<` (Task 5).

---

### Task 1: Verifikasi data rubrik dan pemuat rubrik

**Files:**
- Modify: `apps/ai/db/postgres_client.py` (tambah fungsi di dekat `get_rubric_criteria_for_set`, ±baris 447)
- Create: `apps/ai/setor_led/rubrik.py`
- Test: `apps/ai/tests/setor_led/test_rubrik.py`, `apps/ai/tests/db/test_postgres_client.py` (tes yang butuh Postgres, skip tanpa `DATABASE_URL`)
- Modify: `docs/superpowers/specs/2026-10-16-setor-led-skor-rubrik-design.md` (§7: catat hasil verifikasi)

**Interfaces:**
- Produces:
  - `db.postgres_client.get_rubric_criteria_by_code(tenant_id: str, accreditation_set_id: str, kode: str) -> list[dict]` — tiap dict: `criterion_code`, `description`, `score_type` (`"KUALITATIF" | "KUANTITATIF" | "KOMPOSIT"`), `formula: str | None`, `sub_score_formula: str | None`, `levels: dict[int, str]`.
  - `setor_led.rubrik.RubrikIndikator` (frozen dataclass): `kode: str`, `deskripsi: str`, `score_type: str`, `levels: dict[int, str]`, `formula: str | None`, `sub_score_formula: str | None`.
  - `setor_led.rubrik.muat_rubrik(tenant_id: str, accreditation_set_id: str, kode: str) -> RubrikIndikator` — raise `SetorLedError` bila nol baris (`"Rubrik untuk kode '<kode>' tidak ditemukan di Instrumen Akreditasi dokumen"`) atau lebih dari satu (`"Kode '<kode>' ambigu di rubrik (<n> baris)"`).

- [ ] **Step 1: Periksa data rubrik nyata (hanya baca).** Nyalakan hanya Postgres dari varian compose yang dipakai, lalu jalankan di `psql` (jangan cetak `DATABASE_URL`) untuk set uji berstatus SIAP: jumlah kriteria per `score_type`; kriteria tanpa baris `rubric_levels` (per `score_type`); 15 contoh nilai `formula` dan `sub_score_formula`; pasangan `(accreditation_set_id, criterion_code)` duplikat. Ringkas temuan di §7 spec, termasuk: berapa persen kuantitatif berumus, dan apakah nama variabel di `formula` berupa identifier aritmetika sederhana (mis. `BOP`). Bila rumus nyata tidak berbentuk identifier (mis. memakai simbol/kata Indonesia), berhenti dan laporkan ke pengguna sebelum Task 3.
- [ ] **Step 2: Tulis tes gagal** di `test_rubrik.py`: `test_muat_rubrik_returns_levels_and_formula`, `test_muat_rubrik_unknown_kode_is_a_clear_error`, `test_muat_rubrik_ambiguous_kode_is_an_error` dengan `patch("setor_led.rubrik.get_rubric_criteria_by_code")`; assert pesan mengandung kode dan `isinstance(exc, SetorLedError)`.
- [ ] **Step 3: Jalankan, pastikan gagal** (`ImportError`).
- [ ] **Step 4: Implementasi** `get_rubric_criteria_by_code` (satu query `rubric_criteria` + `rubric_levels`, pola seperti `get_rubric_criteria_for_set`, filter `criterion_code = %s`, lewat `tenant_cursor`) dan `rubrik.py`. Kode AMI (`rubric_tool.py`) tidak diubah.
- [ ] **Step 5: Tes Postgres** (skip tanpa `DATABASE_URL`) `test_get_rubric_criteria_by_code_returns_levels` di `tests/db/test_postgres_client.py`, mengikuti pola fixture di file itu.
- [ ] **Step 6: Jalankan** `pytest tests/setor_led/test_rubrik.py tests/db -q`; semua lulus atau skip.
- [ ] **Step 7: Commit** `feat(ai): load the rubric of a setor-led indicator by criterion code`.

### Task 2: Skema: target skor dan validasi keluaran baru

**Files:**
- Modify: `apps/ai/setor_led/schema.py`
- Modify: `apps/ai/tests/setor_led/test_schema.py`, `apps/ai/tests/test_handle_setor_led.py` (payload `ikuList` memakai `target` valid)

**Interfaces:**
- Produces (semua di `setor_led.schema`):
  - `SKOR_MIN = 0`, `SKOR_MAX = 4`.
  - `IkuInput.target_skor` (property) `-> int` dari `target`.
  - `validasi_skor(nilai: object) -> float` — terima `int`/`float`/string angka dalam [0, 4]; raise `SetorLedError("Skor di luar rentang 0-4: <nilai>")`; tolak `bool`, `NaN`, bukan angka.
  - `validasi_narasi(data: object, dengan_tambahan: bool) -> tuple[dict[str, str], dict[str, str] | None]` — empat narasi inti wajib tidak kosong; `tambahan` wajib lengkap bila `dengan_tambahan`, diabaikan (None) bila tidak.
- Catatan: `EVALUASI`, `BELUM_MEMENUHI`, `validasi_keluaran_llm`, `hasil_sukses` lama **belum dihapus** di task ini (dihapus di Task 5) supaya `prompts.py`/`pipeline.py` tetap berjalan.

- [ ] **Step 1: Tes gagal.** `test_parse_iku_list_accepts_target_0_to_4` (parametrize `"0"`..`"4"`), `test_parse_iku_list_rejects_non_score_target` (parametrize `"5"`, `"-1"`, `"3.5"`, `"tiga"`, `"PJJ: RIPK ≥ 3,25"`; `pytest.raises(ValueError, match="target")`), `test_target_skor_is_int`, `test_validasi_skor_accepts_decimal_and_rejects_out_of_range` (`3.7` ok, `4.01`, `-0.1`, `"abc"`, `True`, `float("nan")` ditolak), `test_validasi_narasi_requires_tambahan_only_when_asked`, `test_validasi_narasi_ignores_tambahan_when_not_asked`.
- [ ] **Step 2: Jalankan, pastikan gagal.**
- [ ] **Step 3: Implementasi** di `schema.py`; `parse_iku_list` memeriksa `target` dengan `re.fullmatch(r"[0-4]", ...)` setelah trim dan melempar `ValueError(f"IKU ke-{nomor}: 'target' harus bilangan bulat 0-4")`.
- [ ] **Step 4: Perbaiki tes yang memakai target lama** (`test_schema.py` "unicode target verbatim" dihapus karena tak berlaku; payload `ikuList` di `test_handle_setor_led.py` diganti `"target": "3"`). Fixture `IkuInput(...)` di tes lain tidak divalidasi dan boleh tetap sampai Task 5.
- [ ] **Step 5: Jalankan** `pytest tests/setor_led/test_schema.py tests/test_handle_setor_led.py -q` → lulus.
- [ ] **Step 6: Commit** `feat(ai): validate setor-led target as a 0-4 score`.

### Task 3: Mode penilaian dan perhitungan skor dari rumus

**Files:**
- Modify: `apps/ai/setor_led/rubrik.py`
- Test: `apps/ai/tests/setor_led/test_rubrik.py`

**Interfaces:**
- Consumes: `RubrikIndikator` (Task 1), `SetorLedError`, `agent.tools.formula_tool.compute_formula_score` (dipakai lewat `.invoke({"formula_expression": ..., "variables": ...})`, mengembalikan JSON string berisi `clamped_score` atau `error`).
- Produces:
  - `ekspresi_bersih(formula: str | None) -> str | None` — ekspresi aritmetika Python bila `formula` berupa aritmetika sederhana setelah normalisasi (` x `/` X ` → `*`, pemisah ribuan `5.000.000` → `5000000`, koma desimal → titik): hanya karakter `[\sA-Za-z0-9_+\-*/().]`, panjang < 80, memuat ≥ 1 huruf; selain itu `None`. `"(2 x BOP) / 5.000.000"` → `"(2 * BOP) / 5000000"`; `"(64 - (3 x BK))/4"` → `"(64 - (3 * BK))/4"`; `"4"`, `"4."`, dan kalimat definisi prosa → `None`.
  - `variabel_ekspresi(ekspresi: str) -> list[str]` — identifier unik urut kemunculan; `"(2 * BOP) / 5000000"` → `["BOP"]`.
  - `mode_penilaian(rubrik: RubrikIndikator) -> str` — `"rumus_bersih"` bila `ekspresi_bersih(rubrik.formula)`; `"rumus_prosa"` bila `formula` terisi, bukan bersih, dan memuat huruf; `"level"` bila selain itu tetapi `levels` punya teks; selain itu `SetorLedError` (pesan "pilih sub-indikatornya" bila `sub_score_formula` terisi, selain itu "Rubrik … tidak punya level 0-4").
  - `hitung_skor_rumus(ekspresi: str, variabel: dict[str, float]) -> float` — nilai `clamped_score`; `SetorLedError("Rumus gagal dihitung: <alasan>")` bila tool mengembalikan `error`.
- [ ] **Step 1: Tes gagal** untuk tiap contoh di atas, ditambah `test_mode_penilaian_covers_all_three_modes` (rumus bersih baris 9, prosa baris 29, kualitatif), `test_mode_penilaian_ignores_a_formula_that_is_only_a_number` (`"4"` → `"level"`), `test_mode_penilaian_composite_without_levels_asks_for_sub_indicator`, `test_hitung_skor_rumus_clamps_to_4` (`"BOP / 1"`, `{"BOP": 99}` → `4.0`), `test_hitung_skor_rumus_reports_tool_error`.
- [ ] **Step 2: Jalankan, pastikan gagal.**
- [ ] **Step 3: Implementasi.** Contoh rumus nyata (baris 9, 10, 11, 34, 38 bersih; baris 29, 35 prosa) dimasukkan ke tes sebagai kasus.
- [ ] **Step 4: Jalankan** `pytest tests/setor_led/test_rubrik.py -q` → lulus.
- [ ] **Step 5: Commit** `feat(ai): score setor-led indicators from the rubric formula`.

### Task 4: Prompt baru (tahap 1 dengan variabel, ekspresi, pilih level, narasi)

**Files:**
- Modify: `apps/ai/setor_led/prompts.py`
- Test: `apps/ai/tests/setor_led/test_prompts.py`

**Interfaces:**
- Consumes: `IkuInput`, `RubrikIndikator`.
- Produces (di `setor_led.prompts`; `bangun_prompt_evaluasi` lama dibiarkan sampai Task 5):
  - `bangun_prompt_capaian(iku, tabel_lkps, prodi=None, rumus: str | None = None, variabel: list[str] | None = None) -> str` — bila `rumus` terisi: sertakan teks rumus dan minta kunci `"variabel": {"<NAMA>": <angka>|null}` berisi angka mentah yang dibutuhkan rumus/level (`null` bila tidak dinyatakan eksplisit di sumber; jangan menebak); bila `variabel` (rumus bersih) juga diberikan, nama persis itu yang dipakai. Tanpa `rumus` perilaku lama (tes yang ada tetap hijau).
  - `bangun_prompt_ekspresi(iku, capaian: dict, rubrik: RubrikIndikator, bahan: str, prodi=None) -> str` — memuat rumus prosa, deskripsi level, dan `capaian["variabel"]`; meminta JSON `{"ekspresi": "<satu ekspresi aritmetika: angka, nama variabel, + - * / ( ) saja>", "alasan": "<satu kalimat>"}`; model memilih cabang aturan yang berlaku dan menulis ekspresi cabang itu tanpa kondisi/perbandingan.
  - `bangun_prompt_pilih_level(iku, capaian: dict, rubrik: RubrikIndikator, bahan: str, prodi=None) -> str` — memuat deskripsi level 0–4 dan meminta JSON `{"score": <bilangan bulat 0-4>, "alasan": "<satu kalimat>"}`.
  - `bangun_prompt_narasi(iku, capaian: dict, score: float, rubrik: RubrikIndikator, bahan: str, dengan_tambahan: bool, prodi=None) -> str` — menyebut skor hasil dan skor target (`iku.target`), meminta empat narasi inti (gaya `_GAYA`, tanpa kategori), plus objek `tambahan` hanya bila `dengan_tambahan`.
- [ ] **Step 1: Tes gagal**: `test_capaian_prompt_includes_formula_text_and_asks_for_variables_with_null_for_missing`, `test_capaian_prompt_uses_exact_names_when_given`, `test_capaian_prompt_without_formula_is_unchanged`, `test_ekspresi_prompt_has_formula_levels_and_variables_and_forbids_conditions`, `test_pilih_level_prompt_lists_every_level_and_demands_json_score`, `test_narasi_prompt_states_score_and_target`, `test_narasi_prompt_asks_for_tambahan_only_when_requested`, `test_narasi_prompt_has_no_category_words` (tidak memuat `MELAMPAUI`/`MEMENUHI`).
- [ ] **Step 2: Jalankan, pastikan gagal.**
- [ ] **Step 3: Implementasi.** Teks prompt memakai deskripsi gaya, bukan kutipan LED PENS (tes `test_evaluasi_prompt_does_not_embed_led_pens_sample_text` diperluas ke `bangun_prompt_narasi`).
- [ ] **Step 4: Jalankan** `pytest tests/setor_led/test_prompts.py -q` → lulus.
- [ ] **Step 5: Commit** `feat(ai): add setor-led prompts for rubric scoring and narrative`.

### Task 5: Pipeline: rubrik, skor, narasi, dan keluaran `score`

**Files:**
- Modify: `apps/ai/setor_led/pipeline.py`, `apps/ai/setor_led/schema.py`, `apps/ai/setor_led/prompts.py`
- Modify: `apps/ai/worker.py` (docstring `_handle_setor_led`: tidak lagi "kategori Evaluasi"; tidak ada perubahan logika)
- Test: `apps/ai/tests/setor_led/test_pipeline.py`, `test_schema.py`, `test_prompts.py`, `apps/ai/tests/test_handle_setor_led.py`

**Interfaces:**
- Consumes: Task 1–4.
- Produces:
  - `parse_capaian(content, kode="") -> dict | None` — selain `nilai`, `sumber`, `dasar`, kini membawa `variabel: dict[str, float | None]` bila ada di JSON.
  - `lengkapi_variabel(capaian: dict, wajib: list[str] | None = None) -> dict[str, float]` — `capaian["variabel"]` sebagai dict angka; kosong, nilai `None`/bukan angka, atau nama di `wajib` yang absen → `SetorLedError("Variabel rumus tidak ditemukan: A, B")`.
  - `tulis_ekspresi(llm, iku, capaian, rubrik, bahan, model=None, cancel_event=None, prodi=None) -> str` — satu panggilan + satu retry bila ekspresi memuat karakter di luar `[\sA-Za-z0-9_+\-*/().]` atau identifier yang bukan kunci `capaian["variabel"]`.
  - `tentukan_skor(llm, iku, capaian, rubrik, bahan, model=None, cancel_event=None, prodi=None) -> float` — memilih jalur dari `mode_penilaian`: `"rumus_bersih"` → `hitung_skor_rumus(ekspresi_bersih(...), lengkapi_variabel(capaian, variabel_ekspresi(...)))`; `"rumus_prosa"` → `lengkapi_variabel` + `tulis_ekspresi` + `hitung_skor_rumus`; `"level"` → `pilih_level`.
  - `pilih_level(llm, iku, capaian, rubrik, bahan, model=None, cancel_event=None, prodi=None) -> float` — satu panggilan + satu retry bila `validasi_skor` gagal (pola `tulis_evaluasi_narasi` lama, alasan penolakan masuk prompt retry).
  - `tulis_narasi(llm, iku, capaian, score, rubrik, bahan, model=None, cancel_event=None, prodi=None) -> tuple[dict[str, str], dict[str, str] | None]` — `dengan_tambahan = score < iku.target_skor`; validasi `validasi_narasi`; satu retry.
  - `_proses_iku_sync(iku, model, tabel_lkps, cancel_event=None, prodi=None, *, tenant_id, accreditation_set_id) -> dict`; urutan: `_cek_batal` → `muat_rubrik` → `mode_penilaian` → tahap 1 (`cari_capaian`/`cari_capaian_json`, dengan `rumus`/`variabel` bila mode rumus) → skor (`tentukan_skor`) → `tulis_narasi` → `hasil_sukses(kode, score, inti, tambahan)`.
  - `schema.hasil_sukses(kode: str, score: float, inti: dict[str, str], tambahan: dict[str, str] | None) -> dict` tanpa `capaian`.
  - Dihapus: `EVALUASI`, `BELUM_MEMENUHI`, `validasi_keluaran_llm`, `tulis_evaluasi_narasi`, `bangun_prompt_evaluasi` beserta tesnya.

- [ ] **Step 1: Tes gagal** di `test_pipeline.py` (LLM tiruan `FakeLLM` yang ada, `patch("setor_led.pipeline.muat_rubrik")`): `test_clean_formula_scores_in_code_and_never_asks_the_model_for_a_score` (assert jumlah panggilan LLM: tahap 1 + narasi; `score == 3.7` dari rumus `(2 x BOP) / 5.000.000` dengan `BOP = 9.250.000`), `test_prose_formula_model_writes_expression_and_code_computes` (ekspresi tiruan `2 + ((NDS3 / NDTPS) * 10)`, skor dihitung kode), `test_prose_expression_with_unknown_variable_retries_then_errors, `test_missing_formula_variable_is_a_named_error_without_model_fallback` (Review Focus 3), `test_qualitative_indicator_picks_a_level_with_the_model`, `test_level_score_out_of_range_retries_once_then_errors` (Review Focus 4), `test_unknown_or_ambiguous_kode_fails_only_that_iku` (Review Focus 2: dua IKU, satu gagal, satu sukses), `test_tambahan_only_when_score_below_target` (parametrize `(3.99, "4") → tambahan`, `(4.0, "4") → tidak`, `(3.0, "3") → tidak`; Review Focus 5), `test_result_has_score_and_no_capaian`, `test_capaian_not_found_still_errors_before_scoring`, `test_rubric_is_loaded_before_any_llm_call` (rubrik error → LLM tidak dipanggil), `test_cancel_between_steps_stops_before_next_llm_call`, `test_parse_capaian_carries_variabel`.
- [ ] **Step 2: Jalankan, pastikan gagal.**
- [ ] **Step 3: Implementasi** fungsi di atas; `proses_iku` meneruskan `tenant_id`/`accreditation_set_id` ke `_proses_iku_sync` (lewat `run_in_executor` seperti sekarang). Perbarui `test_schema.py`/`test_prompts.py`/`test_handle_setor_led.py` yang merujuk simbol yang dihapus.
- [ ] **Step 4: Jalankan** `pytest tests/setor_led tests/test_handle_setor_led.py tests/test_worker.py -q` → lulus.
- [ ] **Step 5: Pastikan AMI tak tersentuh**: `git diff --stat dev-2 -- apps/ai/agent apps/ai/api` kosong.
- [ ] **Step 6: Commit** `feat(ai): return a rubric score instead of an evaluation category from setor-led`.

### Task 6: Backend: validasi `target` 0–4

**Files:**
- Modify: `apps/backend/src/dokumen-led/dto/trigger-setor-led.dto.ts`
- Modify: `apps/backend/src/dokumen-led/dto/trigger-setor-led.dto.spec.ts`, `apps/backend/src/dokumen-led/dokumen-led.service.spec.ts` (fixture `target` lama)

**Interfaces:**
- Produces: `IkuInputDto.target` hanya menerima `"0"`–`"4"` (`@Matches(/^[0-4]$/, { message: 'target harus bilangan bulat 0-4' })` setelah `trim`); contoh Swagger `'3'`.

- [ ] **Step 1: Tes gagal** di `trigger-setor-led.dto.spec.ts`: `rejects a target that is not a 0-4 integer` (`'5'`, `'-1'`, `'3.5'`, `'tiga'`, `'PJJ: RIPK ≥ 3,25'`), `accepts every target from 0 to 4`; ganti tes "keeps the unicode target verbatim". Fixture `iku` memakai `target: '3'`.
- [ ] **Step 2: Jalankan, pastikan gagal.** Prasyarat sekali: `npm ci` di root dan `npm run generate --prefix packages/db`. Perintah: `npm run test --prefix apps/backend -- trigger-setor-led`.
- [ ] **Step 3: Implementasi** di DTO; perbarui fixture di `dokumen-led.service.spec.ts`.
- [ ] **Step 4: Jalankan** `npm run test --prefix apps/backend -- dokumen-led trigger-setor-led` dan `npx tsc --noEmit -p apps/backend` → lulus.
- [ ] **Step 5: Commit** `feat(backend): accept only a 0-4 score as the setor-led target`.

### Task 7: Dokumentasi kontrak dan verifikasi akhir

**Files:**
- Modify: `docs/setor-led-api.md` (§1 contoh `target: "3"` dan tabel field; §2–§3 bentuk hasil `score` tanpa `capaian`; pemetaan kolom tabel LED; §6 kualitas)
- Modify: `docs/superpowers/specs/2026-10-13-setor-led-design.md` (satu baris di atas: bagian Evaluasi/Capaian digantikan oleh spec 2026-10-16)

- [ ] **Step 1:** Perbarui `docs/setor-led-api.md` mengikuti Global Constraints: contoh request/respons nyata dari satu run uji (lihat Step 3), catatan breaking change untuk UI (`labelEvaluasi`/`EvaluasiSetor` diganti `score`; kolom Capaian diisi dari sumber UI).
- [ ] **Step 2:** Tambah pointer di spec 2026-10-13.
- [ ] **Step 3: Uji manual API** (stack Docker varian `mineru-api`, satu `ai-worker`): dokumen uji `uji-setor-led-doc`, set uji SIAP; satu `kode` kuantitatif berumus, satu kualitatif, satu `kode` ngawur, `target` `"3"` dan `"5"` (400). Catat respons nyata (tanpa token/kredensial) ke `docs/setor-led-api.md`. Bila LKPS/variabel tidak cukup untuk indikator berumus, laporkan apa adanya.
- [ ] **Step 4: Jalankan seluruh tes terkait**: `pytest tests/setor_led tests/test_handle_setor_led.py tests/test_worker.py tests/api -q` dan jest backend dokumen-led → lulus.
- [ ] **Step 5: Commit** `docs(ai): document the score output of setor-led`.
