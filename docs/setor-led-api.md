# Setor ke LED: kontrak API untuk UI

Catatan serah terima untuk yang membangun UI/flow. Desain lengkap ada di
`docs/superpowers/specs/2026-10-13-setor-led-design.md`; berkas ini hanya memuat apa yang perlu diketahui klien.

**Apa ini:** job terpisah dari AMI yang, untuk tiap indikator rubrik yang kamu kirim, mencari **Capaian** (dari LKPS /
teks LED / bukti dukung prodi), memetakannya ke rubrik indikator itu menjadi **`score` 0–4**, lalu menulis narasi
analisis. Capaian dipakai sebagai bahan penilaian dan **tidak dikembalikan**; kolom Capaian di tabel diisi sisi UI.
Hasilnya **tidak** ditulis ke bab/canvas oleh backend; klien yang menaruhnya ke editor (dan penulis tetap bisa
mengedit).

Rancangannya: `docs/superpowers/specs/2026-10-16-setor-led-skor-rubrik-design.md` (menggantikan kategori Evaluasi pada
`2026-10-13-setor-led-design.md`). Contoh nilai di bawah berasal dari uji dengan model nyata (OpenRouter
`deepseek/deepseek-r1` dan `deepseek/deepseek-v4-flash`) dan rubrik nyata dari `matrix.json`; alat pencarian (LKPS/LED)
dipalsukan di uji itu.

---

## 1. Memulai job

```
POST /dokumen/:id/setor-led
Authorization: Bearer <accessToken>
Role: PENJAMIN_MUTU atau PENYUSUN (PENYUSUN hanya untuk prodi yang ditugaskan)
```

```json
{
  "ikuList": [
    { "kode": "29",
      "indikator": "Persentase DTPS berpendidikan Doktor",
      "target": "3" }
  ],
  "sumberLed": "EDITOR",
  "lkpsBuktiDukungId": "…",
  "model": "…"
}
```

| Field | Wajib | Aturan |
|---|---|---|
| `ikuList` | ya | 1-200 item. `kode` unik di dalam satu permintaan dan **harus `criterionCode` indikator di Instrumen Akreditasi dokumen** (mis. `"29"`, `"4.I"`); `indikator` tidak boleh kosong. `target` = **skor target, bilangan bulat 0–4 dalam string** (`"0"`–`"4"`); selain itu `400`. |
| `sumberLed` | tidak | `EDITOR` (default: teks bab di editor saat ini) atau `UNGGAHAN`. |
| `lkpsBuktiDukungId` | tidak | Dipakai hanya bila dokumen belum punya LKPS; bila dokumen sudah punya LKPS, LKPS dokumen yang menang. |
| `model` | tidak | Harus salah satu model yang dikonfigurasi server. Model *reasoning* (mis. `deepseek-r1`) diterima; server memilih cara memanggil tool-nya sendiri. |

**Respons `201`** = baris `Job`. Yang dipakai klien adalah `id` (cuid) untuk semua pemanggilan berikutnya:

```json
{ "id": "cmv69xodk0001um015pnr8xvc", "type": "SETOR_LED", "queueName": "assessment-queue",
  "bullJobId": "1", "status": "WAITING", "progress": 0, "result": null, "error": null }
```

**Galat langsung (HTTP):** `400` untuk validasi (list kosong, `kode` duplikat, field kosong, `target` bukan 0–4, >200 item,
properti tak dikenal, `sumberLed` salah), `401` tanpa token, `404` dokumen bukan milik tenant, `404` bila LKPS pilihan bukan LKPS
prodi dokumen ini.

> Setiap `POST` membuat job baru. Worker saat ini memproses **satu job pada satu waktu per antrean**, jadi job kedua
> menunggu `WAITING` sampai yang pertama selesai. Nonaktifkan tombol selama job berjalan.

## 2. Membaca status dan hasil

```
GET /jobs/:id        (id = Job.id dari respons POST)
```

```json
{ "id": "…", "type": "SETOR_LED",
  "status": "COMPLETED",
  "progress": { "completed": 4, "total": 4 },
  "result": { "status": "completed", "hasil": [ … ] },
  "error": null }
```

| `status` | Arti |
|---|---|
| `WAITING` | Belum diambil worker. `progress` bisa berupa angka `0`. |
| `ACTIVE` | Berjalan. `progress` berupa objek `{ completed, total }` (jumlah IKU selesai). `result` masih `null`. |
| `COMPLETED` | Worker selesai **menjalankan fungsinya**, apa pun hasilnya. Lihat `result.status` di bawah. |
| `FAILED` | Worker melempar exception (di luar kegagalan yang sudah ditangani). `error` berisi alasannya. |

**Penting: baca `result.status`, bukan hanya `status`.** Job yang prasyaratnya gagal, atau yang dibatalkan, tetap
berstatus `COMPLETED`:

| `result.status` | Arti | Isi |
|---|---|---|
| `"completed"` | Semua IKU sudah diproses (masing-masing bisa sukses atau `error`) | `hasil[]` |
| `"cancelled"` | Dibatalkan pengguna | `hasil[]` hanya untuk IKU yang sempat selesai (bisa kosong) |
| `"error"` | Prasyarat gagal, tidak ada IKU yang diproses | `error` (string, tanpa `hasil`) |

`GET` membaca hasil dari antrean (BullMQ), yang menyimpan **1000 job selesai terakhir per antrean**. Setelah itu hasil
tidak bisa diambil lagi (tidak ada tabel hasil). Simpan hasil ke dokumen begitu pengguna menerimanya.

**Untuk memuat ulang halaman, pakai `GET`, bukan SSE.** Stream SSE `GET /jobs/:id/events` mengirim status awal dari
baris Postgres yang tidak pernah diperbarui, lalu event langsung dari antrean. Klien yang menyambung *setelah* job
selesai tidak akan menerima event `completed`. Pola yang aman: `GET /jobs/:id` dulu; buka SSE hanya bila belum
`COMPLETED`/`FAILED`; atau cukup polling `GET` tiap beberapa detik.

## 3. Bentuk `result.hasil[]`

Satu elemen per IKU, **urutannya sama dengan `ikuList`** (IKU yang belum selesai pada `cancelled` tidak muncul).
Elemen yang sukses (contoh uji nyata, indikator 29 dengan NDS3 = 6 dan NDTPS = 40):

```json
{
  "kode": "29",
  "score": 3.5,
  "analisisKetercapaian": "Capaian PDS3 sebesar 15% (6 dari 40 DTPS) menghasilkan skor hasil 3,5 berdasarkan rubrik …",
  "usulanTargetTahunDepan": "Target tahun depan adalah meningkatkan skor hasil menjadi 4 dengan memenuhi PDS3 ≥ 20% …",
  "strategiPencapaian": "1) Mendorong DTPS yang sedang menempuh studi Doktor … 2) …",
  "sarprasDibutuhkan": "1) Anggaran untuk beasiswa studi lanjut … 2) …",
  "tambahan": { "faktorPendukung": "…", "faktorPenghambat": "…", "akarMasalah": "…", "tindakLanjut": "…" }
}
```

`score` adalah angka 0–4: **desimal (2 digit) bila dihitung dari rumus rubrik**, bulat bila model memilih level dari
deskripsi rubrik. **Tidak ada `capaian` dan tidak ada kategori `evaluasi`.** `tambahan` hanya ada bila `score` **lebih
rendah** dari `target` (mis. `3,5 < 4`); bila `score ≥ target` field itu tidak ada.

IKU yang gagal **hanya** punya dua field, tanpa narasi:

```json
{ "kode": "29", "error": "Variabel rumus tidak ditemukan: NDTPS" }
```

Selalu periksa `error` per elemen sebelum membaca field lain.

### Pemetaan ke kolom tabel LED

| Tabel LED | Sumber |
|---|---|
| No / Indikator / Target | dari request kamu (`kode`, `indikator`, `target`) |
| Capaian | **bukan dari respons ini**; diisi sisi UI dari sumbernya sendiri |
| Evaluasi (skor) | `score` |
| Analisis ketercapaian | `analisisKetercapaian` |
| Usulan target tahun depan | `usulanTargetTahunDepan` |
| Strategi pencapaian | `strategiPencapaian` |
| Sarpras yang dibutuhkan | `sarprasDibutuhkan` |
| Faktor pendukung / penghambat, Akar masalah, Tindak lanjut | `tambahan.*` (hanya bila `score < target`) |

Catatan format: `strategiPencapaian` dan `sarprasDibutuhkan` adalah **satu string** berpenomoran `1) … 2) …`, bukan
array. Sebaiknya tampilkan sebagai teks yang bisa diedit. Analisis menyebut Capaian yang ditemukan pipeline; bila
kolom Capaian di UI berasal dari sumber lain, angkanya bisa berbeda dari yang tertulis di analisis.

## 4. Kegagalan yang perlu ditangani

**Level job** (`result.status: "error"`, pesan di `result.error`):

| Penyebab | Pesan |
|---|---|
| `ikuList` kosong / field kosong / `kode` duplikat | `ikuList kosong -- …`, `IKU ke-N: '…' wajib diisi`, `Kode IKU duplikat: …` |
| Model tidak dikenal | `Unknown model: <nama>. Available: [...]` |
| Tidak ada model terkonfigurasi | `Tidak ada model yang dikonfigurasi (OLLAMA_MODEL / OPENROUTER_MODEL kosong).` |
| Dokumen tanpa Instrumen Akreditasi | `Dokumen ini belum memilih Instrumen Akreditasi — …` |
| LED kosong (sumber Editor) | `Belum ada tulisan di Editor yang bisa dinilai -- …` |
| LKPS tidak ada / tak terbaca | `LKPS belum dipilih untuk setor ke LED -- …` / `Gagal membaca LKPS: …` |

**Level IKU** (`hasil[i].error`): `Capaian tidak ditemukan di LKPS/LED/bukti dukung` (paling umum; penulis mengisi
manual), salah satu galat rubrik/skor (di bawah), `Gagal diproses (<Jenis>) -- lihat log server untuk detail.`, atau
galat keluaran model (`Model tidak mengembalikan JSON yang bisa dibaca`, `Skor di luar rentang 0-4: …`).

| Galat rubrik/skor | Penyebab |
|---|---|
| `Rubrik untuk kode '<kode>' tidak ditemukan di Instrumen Akreditasi dokumen` | `kode` bukan `criterionCode` di set dokumen |
| `Kode '<kode>' ambigu di rubrik (<n> baris)` | lebih dari satu baris rubrik berkode sama |
| `Indikator '<kode>' komposit tanpa level sendiri -- pilih sub-indikatornya` | baris komposit tanpa level 0–4 |
| `Rubrik '<kode>' tidak punya level 0-4` | rubrik tidak punya dasar penilaian |
| `Variabel rumus tidak ditemukan: A, B` | angka rumus tidak bisa diturunkan dari capaian/bahan (skor tidak ditebak). Umum pada angka yang butuh hitungan lintas tabel, mis. BOP per mahasiswa |
| `Rumus gagal dihitung: …` / `Ekspresi skor …` | ekspresi hasil model tidak valid setelah satu retry |

Tampilkan IKU `error` sebagai baris kosong yang bisa diisi manual, bukan sebagai kegagalan seluruh proses.

## 5. Membatalkan

```
POST /jobs/:id/cancel      →  202 { "status": "cancel_requested" }
```

`:id` boleh `Job.id` maupun `bullJobId`. **Job yang masih `WAITING` saat dibatalkan dihapus dari antrean**, sehingga `GET /jobs/:id` untuknya tetap menampilkan `WAITING` dari baris Postgres (tidak pernah menjadi `cancelled`); UI sebaiknya menganggap `cancel_requested` pada job `WAITING` sebagai selesai. Untuk job `ACTIVE`, pembatalan bersifat kooperatif: worker memeriksa tiap beberapa detik dan job
berakhir dengan `result.status: "cancelled"`. IKU yang sudah selesai tetap ada di `hasil` (termasuk yang selesai tepat
saat pembatalan diperiksa). Thread yang sedang memanggil LLM juga dihentikan lewat sinyal batal: ia berhenti sebelum
langkah berikutnya (panggilan LLM atau tool), jadi tidak ada lagi biaya LLM baru setelah job berstatus `cancelled`.
Satu panggilan LLM yang **sudah terkirim** pada saat batal tetap diselesaikan (klien HTTP sinkron tidak bisa diputus),
sehingga pembatalan bisa memakan waktu sampai selesainya panggilan itu.

## 6. Hal yang perlu diketahui tentang kualitas

- Capaian, skor kualitatif, dan narasi ditulis model dan **non-deterministik**: IKU yang sama bisa sukses di satu run
  dan "capaian tidak ditemukan" di run lain, dan dua model bisa memberi skor berbeda untuk indikator kualitatif yang
  sama (uji nyata: `deepseek-r1` memberi 2, `deepseek-v4-flash` memberi 4 untuk input yang sama). Perlakukan hasil
  sebagai **draf yang harus dibaca penulis**.
- Skor dihitung tiga cara, sesuai rubrik indikator. **Rumus aritmetika bersih** (19 dari 32 indikator berumus di set
  nyata "Lam Teknik 2025"): model mengisi angka variabelnya dari capaian, kode menghitung. **Rumus berbentuk prosa**
  (13 dari 32): model mengisi angka dasar lalu menulis satu ekspresi aritmetika untuk cabang aturan yang berlaku, kode
  menghitungnya. **Kualitatif / tanpa rumus**: model memilih level 0–4 dari deskripsi rubrik. Skor adalah **estimasi
  atas LED setengah jadi** dan boleh berbeda dari skor AMI.
- Bila teks level rubrik menyatakan "Tidak ada skor kurang dari N", `score` tidak pernah lebih rendah dari N (disebut di
  prompt dan dijaga kode). AMI menerapkan batas yang sama (dengan satu kalimat penjelasan di justifikasi bila skor dinaikkan), sehingga aturan ini tidak membedakan skor setor ke LED dari skor AMI.
- Capaian yang hanya bisa ditebak sengaja dianggap tidak ditemukan (tidak ada narasi "diperkirakan"). Untuk indikator
  berumus, angka mentah yang tidak dinyatakan eksplisit membuat IKU `error` yang menyebut nama variabelnya.
- Server menyertakan nama dan jenjang program studi dokumen (D3/D4/S1/S2/S3) ke model. Jenis seperti PJJ tidak
  tersimpan di data prodi.
- Sumber Capaian saat ini: tabel LKPS, teks LED di editor (atau unggahan), dan bukti dukung prodi. IKU yang angkanya
  hanya ada di dokumen di luar itu (mis. inventaris) akan `error`.

## 7. Di luar cakupan (belum ada)

Menulis hasil ke bab/canvas editor dan UI/flow (panel Penilaian Indikator di editor bab, commit `ad5577a`, milik sisi UI).

## 8. Usulan penempatan di UI (belum dibangun)

Bagian ini adalah usulan awal untuk yang membangun UI (sebagian sudah diwujudkan sisi UI di panel Penilaian Indikator; di sana kolom Capaian harus diisi dari sumber UI karena respons tidak lagi memuat `capaian`). Fakta tentang kode yang dirujuk sudah
diperiksa (`apps/web`, `apps/ai/prose.py`), tetapi belum ada kode UI setor ke LED.

**Posisi dalam alur LED:** (1) generasi LED setengah jadi, (2) setor ke LED (fitur ini), (3) generasi LED penuh,
(4) skoring AMI akhir. AMI membaca teks Editor (`sumberLed: EDITOR`), jadi narasi hasil setor yang sudah diterapkan
ikut menjadi isi LED yang dinilai; AMI tidak tahu mana teks yang berasal dari setor ke LED.

**Titik pasang:** editor bab (`app/features/chapter/presentation/pages/chapter-editor.tsx`), pada section yang
memegang tabel analisis IKU. Editor memakai Tiptap dengan `@tiptap/extension-table`, dan tabel di bab adalah tabel
Tiptap biasa. Tabel dibuat penulis lewat dialog "Instruksi tabel" (`section-table-spec-dialog.tsx`), yang menyimpan
`tableSpec` per section sebagai `{ id, caption, columns[] }`. Nama kolomnya bebas, `tableSpec` opsional per section,
dan tidak ada definisi bawaan untuk tabel IKU.

**Konsekuensinya:** baris tabel hanya bisa diubah otomatis menjadi `ikuList`, dan hasil hanya bisa ditaruh ke sel
yang benar, bila nama kolomnya baku. Usulan: sediakan template `tableSpec` untuk tabel analisis IKU dengan kolom

`No | Indikator | Target | Capaian | Evaluasi | Analisis ketercapaian | Usulan target tahun depan | Strategi pencapaian | Sarpras yang dibutuhkan`

(tambah kolom Faktor pendukung / Faktor penghambat / Akar masalah / Tindak lanjut untuk tabel yang memuatnya).
Daftar IKU lalu berasal dari baris tabel yang diisi penulis, bukan dari DB.

**Alur yang diusulkan untuk langkah 2:**
1. Penulis membuka section bertabel IKU dan menekan aksi "Isi otomatis dari LKPS/LED".
2. UI membaca baris tabel (No, Indikator, Target) menjadi `ikuList`, lalu `POST /dokumen/:id/setor-led`.
3. Progres tampil dari `progress { completed, total }` dengan tombol Batal (`POST /jobs/:id/cancel`).
4. Hasil tampil sebagai pratinjau per baris yang bisa diedit; IKU `error` tampil sebagai baris kosong untuk diisi manual.
5. Penulis menekan "Terapkan"; UI menulis nilai ke sel tabel Tiptap dan menyimpan bab seperti biasa.

**Keputusan yang masih terbuka:**
- Siapa yang mengisi kolom No / Indikator / Target: generator dari Pedoman atau penulis. Belum diperiksa apakah
  generator mengisi ketiganya, dan apakah dialog `tableSpec` berlaku untuk sub-sub-bab.
- Penyimpanan hasil. Tidak ada tabel hasil, jadi hasil yang belum diterapkan hilang saat job tersingkir dari antrean.
  Pilihannya: UI menyimpan segera saat "Terapkan", atau ditambah tabel draf.
- Setor ulang. Teks Editor yang sudah berisi hasil setor sebelumnya menjadi sumber Capaian untuk job berikutnya,
  jadi model bisa mengutip keluarannya sendiri. Perlu aturan, misalnya hanya mengisi sel yang masih kosong.
- Prasyarat (Instrumen Akreditasi, LKPS, isi bab) lebih baik dicek UI sebelum tombol aktif; tanpa itu job langsung berakhir
  `result.status: "error"` (lihat bagian 4).
