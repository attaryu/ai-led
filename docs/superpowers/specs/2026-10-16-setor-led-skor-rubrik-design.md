# Setor ke LED: output berupa skor rubrik 0–4 dan analisis

Tanggal: 2026-10-16 · Mengubah sebagian `2026-10-13-setor-led-design.md` (bagian yang tidak disebut di sini tetap berlaku).

## 1. Latar belakang dan tujuan

Desain awal setor ke LED mengeluarkan **kategori** Evaluasi (`MELAMPAUI` / `MEMENUHI` / `BELUM_MEMENUHI`) yang
ditentukan model, dan sengaja menyerahkan skor angka beserta skalanya ke sisi UI. Dimas kini meminta Evaluasi berupa
**skor 0–4** (nama field `score`), dengan analisis tetap, dan Capaian tidak lagi menjadi bagian output (ditampilkan
oleh sisi Dimas). Dua hal membuat permintaan itu masuk akal:

- UI Dimas (`ad5577a`, panel Penilaian Indikator di editor bab) sudah memakai **indikator matriks penilaian**
  (`RubricCriterion`) sebagai IKU: `kode` = `criterionCode`, `indikator` = deskripsi kriteria, `target` = skor target 0–4
  yang dipilih penulis lewat dropdown. Rubrik tiap kriteria menyimpan deskripsi level 0–4 (`rubric_levels`) dan, untuk
  kriteria kuantitatif/komposit, rumus.
- Dengan skala yang sama dengan rubrik, alasan awal memisahkan setor LED dari AMI (skala berbeda) tidak berlaku lagi
  untuk kolom Evaluasi. Pemisahan pipeline tetap dipertahankan (lihat §5).

Tujuan: setiap IKU menghasilkan **skor mentah 0–4** yang dipetakan dari Capaian ke rubrik indikatornya, dibandingkan
dengan skor target dari penulis, ditambah analisis tertulis, tanpa mengubah AMI. Output hanya **`score` + analisis**: Capaian tetap dicari di dalam
pipeline sebagai bahan penilaian, tetapi tidak dikembalikan; menampilkannya di tabel LED diurus sisi Dimas.

### Bukan tujuan

- Mengubah AMI (graph, parser, judge, RAGAS, UI AMI). Skor setor LED adalah **estimasi atas LED setengah jadi**,
  bukan skor final; ia boleh berbeda dari skor AMI untuk indikator yang sama.
- UI dan alur (milik Dimas). Menulis hasil ke editor tetap tugas UI.
- Tabel hasil baru. Hasil tetap di `Job.result`.

### Anti-tujuan (gagal walau tampak berfungsi)

- Skor yang **ditebak** ketika rubrik tidak ada, tidak lengkap, atau variabel rumusnya tidak ditemukan. Lebih baik
  IKU `error`.
- Skor yang tidak bisa direproduksi padahal angkanya jelas (indikator berumus dihitung kode, bukan model).

## 2. Keputusan (dari percakapan 2026-10-16)

| Topik | Keputusan |
|---|---|
| Bentuk `target` | **Skor target 0–4**, bilangan bulat dalam string (`"3"`), persis seperti yang dikirim UI Dimas sekarang. Bukan persentase, bukan teks ambang. |
| Capaian (internal) | Tetap **dicari AI** (LKPS, LED, bukti dukung prodi) sebagai bahan penilaian, tidak dikembalikan. Untuk indikator berumus, tahap 1 **mengambil semua variabel rumus** (lihat §4). |
| Skor | **Angka 0–4**, dikirim sebagai `score` (menggantikan `evaluasi`); kategori dibuang. Desimal (dibulatkan 2 digit) bila dihitung dari rumus; bulat bila dipilih model dari level. `target` tetap bilangan bulat. |
| Output | **Hanya `score` + analisis.** `capaian` (`nilai`, `sumber`) tidak lagi ada di output; ia hanya bahan internal. |
| Asal skor | Setor LED memetakan Capaian ke rubrik indikator (dicari lewat `kode`). Rumus aritmetika bersih (5 dari 31 berumus) dihitung **kode** langsung. Rumus berbentuk prosa (26 dari 31): **model menulis satu ekspresi aritmetika** dari rumus + level + angka mentah tahap 1, lalu **kode menghitungnya** (`compute_formula_score`, di-clamp 0–4). Kualitatif/tanpa rumus: **model** memilih level dari deskripsi. |
| Narasi | Empat bagian inti selalu. Empat bagian tambahan (faktor pendukung, faktor penghambat, akar masalah, tindak lanjut) ditulis bila **skor hasil < skor target**, dibandingkan sebagai integer oleh kode. |

Keputusan "pemicu tambahan = Capaian < target dalam persen" yang diambil lebih awal pada hari yang sama **digantikan**
oleh baris terakhir tabel di atas, karena `target` ternyata skor, bukan persen.

## 3. Kontrak

**Request** tidak berubah bentuknya (`ikuList[]` = `kode`, `indikator`, `target`), tetapi artinya sekarang:
`kode` **harus** `criterionCode` yang ada di Instrumen Akreditasi dokumen, dan `target` **harus** bilangan bulat 0–4
(backend menolak nilai lain dengan `400`; worker memeriksa ulang sebagai pengaman).

**Hasil per IKU yang sukses** (`Job.result.hasil[i]`): `evaluasi` (kategori) diganti `score` (angka 0–4), dan `capaian` dihapus dari output.

```
{ "kode": "...",
  "score": 3.7,                        // angka 0–4 (desimal bila dari rumus); menggantikan `evaluasi`
  "analisisKetercapaian": "...", "usulanTargetTahunDepan": "...",
  "strategiPencapaian": "...", "sarprasDibutuhkan": "...",
  "tambahan": { ... } }                // hanya bila score < target
```

Ini **perubahan yang merusak** untuk klien. Sisi UI (Dimas) yang terdampak: `EvaluasiSetor` dan `labelEvaluasi`
diganti angka `score`, kolom Capaian di `bangunTabelSetor` diisi dari sumber Dimas (bukan dari respons), cabang
`BELUM_MEMENUHI` diganti `score < target`, dan `docs/setor-led-api.md` diperbarui. `susunPayload` tetap mengirim `target: String(skor)` sehingga dropdown Skor tidak berubah.

IKU `error` tetap `{ kode, error }`.

## 4. Mekanisme per IKU

1. **Muat rubrik indikator lebih dulu.** Ambil `RubricCriterion` set akreditasi dokumen dengan `criterion_code = kode`,
   beserta level 0–4 (`rubric_levels`), `score_type`, `formula`, `sub_score_formula`. `criterion_code` unik per set
   lewat konvensi penulis (`"4"` atau `"4.I"`, `postgres_client.py:590`). `get_rubric_criteria_for_set` yang ada tidak
   memilih kolom ini, jadi perlu fungsi baru; kode AMI tidak diubah.
2. **Cari Capaian (tahap 1).** Loop tool yang sama (`cari_capaian` / `cari_capaian_json`). Untuk indikator berumus, prompt
   memuat teks rumus (dan, bila rumusnya aritmetika bersih, daftar nama variabelnya), dan jawaban akhir ditambah
   `variabel`: `{NAMA: angka | null}`, yaitu angka mentah yang dibutuhkan rumus/level; `null` bila tidak dinyatakan
   eksplisit di sumber. `nilai` tetap satu baris ringkas, dipakai sebagai bahan tahap 2 (tidak dikembalikan di output).
3. **Tentukan skor.** Tiga mode, dipilih dari data rubrik:
   - **Rumus bersih** (rumus berupa aritmetika sederhana setelah normalisasi `x` → `*` dan pemisah ribuan, mis.
     `(2 x BOP) / 5.000.000`): kode menghitung langsung dengan `compute_formula_score` dari `variabel` tahap 1.
   - **Rumus prosa** (definisi variabel turunan dan aturan bersyarat; teks level memuat ambang): model, tanpa tool,
     membaca rumus + level + `variabel` lalu menuliskan satu ekspresi aritmetika untuk cabang aturan yang berlaku
     (hanya angka, nama variabel, `+ - * / ( )`); kode menghitung ekspresi itu dengan `compute_formula_score`.
   - **Level** (kualitatif, atau tanpa rumus): model memilih satu skor 0–4 dari deskripsi level beserta alasan singkat.
   - Variabel yang `null`/hilang pada mode rumus: IKU `error` yang menyebut variabel apa yang hilang (tidak jatuh ke
     model). Ekspresi model yang memuat variabel tak dikenal atau karakter di luar daftar: retry sekali, lalu `error`.
   - Rubrik tidak ditemukan untuk `kode`, lebih dari satu baris, atau tanpa level 0–4 (bila diperlukan): IKU `error`.
4. **Tulis narasi (tahap 2).** Satu panggilan model berformat JSON: masukannya indikator, skor target, Capaian, skor
   hasil, deskripsi level terpilih. Analisis menyebut Capaian, skor hasil, dan skor target. Empat bagian tambahan
   diminta hanya bila kode menentukan skor hasil < skor target.

Validasi keluaran model: narasi inti tidak kosong; `tambahan` lengkap bila diminta; skor yang dipilih model (jalur
kualitatif) harus integer 0–4. Retry sekali dengan alasan penolakan, lalu `error`, seperti sekarang.

## 5. Kenapa pipeline tetap terpisah dari AMI

AMI menilai LED penuh dan menghasilkan justifikasi sebagai bukti audit yang dikonsumsi judge, RAGAS, UI, PDF, dan
benchmark (lihat §8 spec awal). Setor LED menilai LED setengah jadi dan menulis narasi prospektif. Yang dipakai
ulang hanya **data rubrik** (dibaca langsung dari tabel) dan evaluator rumus, bukan graph atau prompt AMI.

## 6. Perubahan kode (perkiraan)

- `apps/ai/setor_led/schema.py`: `EVALUASI` kategori diganti `score` (validasi 0–4); `hasil_sukses` tidak lagi memuat `capaian`;
  `IkuInput.target` divalidasi 0–4.
- `apps/ai/setor_led/rubrik.py` (baru): muat kriteria + level lewat `kode`; kenali rumus bersih dan normalkan;
  hitung skor; bandingkan skor dengan target.
- `apps/ai/db/postgres_client.py`: fungsi baru pengambil satu kriteria beserta level lewat `criterion_code`.
- `apps/ai/setor_led/prompts.py`, `pipeline.py`: tahap 1 menerima rubrik dan meminta `variabel`; `parse_capaian`
  membawa `variabel`; tahap 2 dipecah menjadi skor lalu narasi.
- `apps/ai/tests/setor_led/*`: tes baru; tes yang memakai kategori disesuaikan.
- `apps/backend/src/dokumen-led/dto/trigger-setor-led.dto.ts` (+ spec): `target` harus bilangan bulat 0–4.
- `docs/setor-led-api.md`: kontrak §1–§4 diperbarui (`score` integer menggantikan `evaluasi`, tanpa `capaian`, `kode` = `criterionCode`, `target` skor).

## 7. Yang harus diverifikasi sebelum membangun

Belum diperiksa pada data nyata; hasilnya bisa mengubah §4:

- Apakah semua kriteria di set yang dipakai punya `rubric_levels` terisi untuk skor 0–4, termasuk KUALITATIF,
  KUANTITATIF, dan KOMPOSIT (set uji punya 72 kriteria, status SIAP).
- ~~Bentuk nyata teks `formula`~~ — sudah diverifikasi (lihat hasil verifikasi di bawah); hanya 5 dari 31 rumus berupa aritmetika
  bersih, sisanya prosa. Dampak ke tingkat `error` variabel hilang baru terukur lewat uji manual API (Task 7 plan).
- Apakah `criterionCode` dari `GET bab/:id/sections/:sectionId/indikator` (UI Dimas) selalu sama dengan
  `rubric_criteria.criterion_code`.

### Hasil verifikasi data rubrik (2026-10-16)

Volume Postgres lokal dev-v2 sudah tidak ada, jadi diperiksa sumber seed-nya, `ami-assessment/data/rubric_cache/matrix.json`
(data yang sama yang diisikan ke `rubric_criteria`): 64 baris, 31 kuantitatif, 23 kualitatif, 10 komposit.

- Semua baris punya teks level 0–4 (tidak ada yang kosong). Tidak ada pasangan (nomor, sub) ganda.
- Kolom `formula` terisi di 31 baris, tetapi hanya **5** yang berupa aritmetika sederhana (`(2 x BOP) / 5.000.000`;
  baris 9, 10, 11, 34, 38) dan memakai `x` sebagai kali serta titik sebagai pemisah ribuan. **26** baris berisi definisi
  berbentuk prosa: beberapa variabel turunan (`PDS3 = (NDS3 / NDTPS) x 100%`), aturan bersyarat ("Jika RI ≥ a dan RN < b,
  maka RI = a"), dan kadang hanya `"4"`. Ambang skornya justru ada di teks level (mis. baris 29: "Jika PDS3 ≥ 20%, maka
  Skor = 4"; level 3: "Skor = 2 + (PDS3 x 10)").
- 10 baris komposit punya `sub_score_formula` (mis. `((I x 2)+ (II)) / 3`) dan sekaligus teks level.

Akibatnya nama variabel tidak bisa diturunkan dengan regex dari `formula` untuk 26 rumus prosa. Diputuskan pengguna:
rumus bersih dihitung kode langsung, rumus prosa ditulis modelnya sebagai ekspresi dan dihitung kode (§4 langkah 3). Lihat §4 langkah 3 (diperbarui setelah verifikasi ini).

## 8. Diserahkan ke pembangun

Nama fungsi/berkas, format pesan error persis, cara menormalkan rumus bersih, dan susunan tes.

### Keputusan saya (bukan dari pengguna; mohon dikoreksi)

- `target` divalidasi ketat 0–4 di backend dan worker (konsekuensi dari "skor target 0–4 saja").
- `score` boleh desimal. `compute_formula_score` menghasilkan skor kontinu yang di-clamp ke 0–4 dan dibulatkan 2 digit,
  dan AMI juga mendukung skor desimal, jadi memaksa bilangan bulat akan membuang informasi dan berbeda dari rubrik.
  Draf awal dokumen ini menulis "integer"; diubah saat menyusun rencana implementasi.
- `criterion_code` unik hanya lewat konvensi penulis, bukan constraint DB. Bila pencarian lewat `kode`
  mengembalikan nol atau lebih dari satu baris, IKU `error`; tidak memilih salah satu.
- Baris komposit (punya `sub_score_formula`, skornya gabungan skor sub-indikator saudaranya) tidak dinilai sebagai
  IKU tunggal: bila baris itu tidak punya level 0–4 sendiri, IKU `error` ("pilih sub-indikatornya"). Baris
  sub-indikator (`subNo` terisi, punya level sendiri) dinilai seperti kriteria biasa. Batching saudara tidak dilakukan.
- Variabel rumus yang hilang membuat IKU `error`, bukan jatuh ke penilaian model, supaya indikator berumus tidak
  pernah diberi skor tebakan.

## 9. Catatan terbuka

- Skor setor LED dan skor AMI bisa berbeda; perlu disepakati dengan Dimas bahwa yang pertama adalah estimasi.
- Setor ulang masih bisa mengutip tabel hasil sebelumnya yang sudah ada di teks Editor (docs/setor-led-api.md §8).
- Capaian tidak ada di output, tetapi analisis tetap menyebut Capaian yang ditemukan pipeline. Bila kolom Capaian
  di tabel LED diisi Dimas dari sumber lain, angkanya bisa berbeda dari yang disebut analisis. Perlu disepakati
  dengan Dimas dari mana Capaian di kolomnya berasal.
- Tahap 1 yang mengambil banyak variabel rumus bisa menaikkan jumlah IKU "variabel tidak ditemukan"; ukuran
  dampaknya baru diketahui setelah uji pada data nyata.
