# Setor ke LED: kontrak API untuk UI

Catatan serah terima untuk yang membangun UI/flow. Desain lengkap ada di
`docs/superpowers/specs/2026-10-13-setor-led-design.md`; berkas ini hanya memuat apa yang perlu diketahui klien.

**Apa ini:** job terpisah dari AMI yang, untuk tiap IKU yang kamu kirim, mencari **Capaian** (dari LKPS / teks LED /
bukti dukung prodi), menentukan **Evaluasi**, lalu menulis narasi untuk tabel analisis IKU di LED (mis. Tabel C5.1 dan
C6.1). Hasilnya **tidak** ditulis ke bab/canvas oleh backend; klien yang menaruhnya ke editor (dan penulis tetap bisa
mengedit).

Contoh nilai di bawah berasal dari run uji nyata (LKPS-STR + narasi LED), bukan karangan.

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
    { "kode": "IKU.REL.MHS.3",
      "indikator": "Rata-rata minimal IPK lulusan dalam 3 tahun terakhir",
      "target": "PJJ: RIPK ≥ 3,25" }
  ],
  "sumberLed": "EDITOR",
  "lkpsBuktiDukungId": "…",
  "model": "…"
}
```

| Field | Wajib | Aturan |
|---|---|---|
| `ikuList` | ya | 1-200 item. `kode` unik di dalam satu permintaan; `kode`, `indikator`, `target` tidak boleh kosong atau spasi saja. Teks `target` dikirim apa adanya (mis. `3,5 < MS ≤ 4,5`). |
| `sumberLed` | tidak | `EDITOR` (default: teks bab di editor saat ini) atau `UNGGAHAN`. |
| `lkpsBuktiDukungId` | tidak | Dipakai hanya bila dokumen belum punya LKPS; bila dokumen sudah punya LKPS, LKPS dokumen yang menang. |
| `model` | tidak | Harus salah satu model yang dikonfigurasi server. Model *reasoning* (mis. `deepseek-r1`) diterima; server memilih cara memanggil tool-nya sendiri. |

**Respons `201`** = baris `Job`. Yang dipakai klien adalah `id` (cuid) untuk semua pemanggilan berikutnya:

```json
{ "id": "cmv69xodk0001um015pnr8xvc", "type": "SETOR_LED", "queueName": "assessment-queue",
  "bullJobId": "1", "status": "WAITING", "progress": 0, "result": null, "error": null }
```

**Galat langsung (HTTP):** `400` untuk validasi (list kosong, `kode` duplikat, field kosong, >200 item, properti tak
dikenal, `sumberLed` salah), `401` tanpa token, `404` dokumen bukan milik tenant, `404` bila LKPS pilihan bukan LKPS
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
Elemen yang sukses:

```json
{
  "kode": "IKU.REL.MHS.3",
  "capaian": { "nilai": "RIPK = 3,46 (≥ target PJJ 3,25)", "sumber": "LKPS Tabel 6.b" },
  "evaluasi": "MELAMPAUI",
  "analisisKetercapaian": "Capaian rata-rata IPK lulusan sebesar 3,46 melampaui target PJJ …",
  "usulanTargetTahunDepan": "Mempertahankan rata-rata IPK lulusan di atas 3,25 …",
  "strategiPencapaian": "1) Meningkatkan kualitas pembelajaran … 2) Memperkuat program pembimbingan … 3) …",
  "sarprasDibutuhkan": "1) Sistem informasi akademik yang terintegrasi … 2) … 3) …"
}
```

IKU yang `BELUM_MEMENUHI` punya objek tambahan:

```json
"tambahan": { "faktorPendukung": "…", "faktorPenghambat": "…", "akarMasalah": "…", "tindakLanjut": "…" }
```

IKU yang gagal **hanya** punya dua field, tanpa narasi:

```json
{ "kode": "IKU.REL.SPR.2", "error": "Capaian tidak ditemukan di LKPS/LED/bukti dukung" }
```

Selalu periksa `error` per elemen sebelum membaca field lain.

### Pemetaan ke kolom tabel LED

| Tabel LED | Sumber |
|---|---|
| No / Indikator / Target | dari request kamu (`kode`, `indikator`, `target`) |
| Capaian | `capaian.nilai` (ringkas), `capaian.sumber` bila mau ditampilkan sebagai keterangan |
| Evaluasi | `MELAMPAUI` → "Melampaui standar", `MEMENUHI` → "Memenuhi standar", `BELUM_MEMENUHI` → "Belum memenuhi standar" |
| Analisis ketercapaian | `analisisKetercapaian` |
| Usulan target tahun depan | `usulanTargetTahunDepan` |
| Strategi pencapaian | `strategiPencapaian` |
| Sarpras yang dibutuhkan | `sarprasDibutuhkan` |
| Faktor pendukung / penghambat, Akar masalah, Tindak lanjut | `tambahan.*` (hanya `BELUM_MEMENUHI`) |

Catatan format: `strategiPencapaian` dan `sarprasDibutuhkan` adalah **satu string** berpenomoran `1) … 2) …`, bukan
array. Sebaiknya tampilkan sebagai teks yang bisa diedit.

## 4. Kegagalan yang perlu ditangani

**Level job** (`result.status: "error"`, pesan di `result.error`):

| Penyebab | Pesan |
|---|---|
| `ikuList` kosong / field kosong / `kode` duplikat | `ikuList kosong -- …`, `IKU ke-N: '…' wajib diisi`, `Kode IKU duplikat: …` |
| Model tidak dikenal | `Unknown model: <nama>. Available: [...]` |
| Tidak ada model terkonfigurasi | `Tidak ada model yang dikonfigurasi (OLLAMA_MODEL / OPENROUTER_MODEL kosong).` |
| Dokumen tanpa Set Akreditasi | `Dokumen ini belum memilih Set Akreditasi — …` |
| LED kosong (sumber Editor) | `Belum ada tulisan di Editor yang bisa dinilai -- …` |
| LKPS tidak ada / tak terbaca | `LKPS belum dipilih untuk setor ke LED -- …` / `Gagal membaca LKPS: …` |

**Level IKU** (`hasil[i].error`): `Capaian tidak ditemukan di LKPS/LED/bukti dukung` (paling umum; penulis mengisi
manual), `Gagal diproses (<Jenis>) -- lihat log server untuk detail.`, atau galat keluaran model
(`Model tidak mengembalikan JSON yang bisa dibaca`, `Evaluasi di luar daftar yang diizinkan: …`).

Tampilkan IKU `error` sebagai baris kosong yang bisa diisi manual, bukan sebagai kegagalan seluruh proses.

## 5. Membatalkan

```
POST /jobs/:id/cancel      →  202 { "status": "cancel_requested" }
```

`:id` boleh `Job.id` maupun `bullJobId`. Pembatalan bersifat kooperatif: worker memeriksa tiap beberapa detik dan job
berakhir dengan `result.status: "cancelled"`. IKU yang sudah selesai tetap ada di `hasil` (termasuk yang selesai tepat
saat pembatalan diperiksa). Thread yang sedang memanggil LLM juga dihentikan lewat sinyal batal: ia berhenti sebelum
langkah berikutnya (panggilan LLM atau tool), jadi tidak ada lagi biaya LLM baru setelah job berstatus `cancelled`.
Satu panggilan LLM yang **sudah terkirim** pada saat batal tetap diselesaikan (klien HTTP sinkron tidak bisa diputus),
sehingga pembatalan bisa memakan waktu sampai selesainya panggilan itu.

## 6. Hal yang perlu diketahui tentang kualitas

- Narasi dan Capaian ditulis model dan **non-deterministik**: IKU yang sama bisa sukses di satu run dan
  "capaian tidak ditemukan" di run lain. Perlakukan hasil sebagai **draf yang harus dibaca penulis**.
- Capaian yang hanya bisa ditebak sengaja dianggap tidak ditemukan (tidak ada narasi "diperkirakan").
- Server menyertakan nama dan jenjang program studi dokumen (D3/D4/S1/S2/S3) ke model, supaya target atau tabel
  yang punya varian per jenis program dibaca sesuai prodi. Jenis seperti PJJ tidak tersimpan di data prodi: kirim
  di teks `target` (mis. `PJJ: RIPK ≥ 3,25`) bila relevan. Bila varian tak bisa dipastikan, IKU menjadi
  "capaian tidak ditemukan", bukan ditebak.
- Sumber Capaian saat ini: tabel LKPS, teks LED di editor (atau unggahan), dan bukti dukung prodi. IKU yang angkanya
  hanya ada di dokumen di luar itu (mis. inventaris) akan `error`.

## 7. Di luar cakupan (belum ada)

Menulis hasil ke bab/canvas editor, skor angka beserta skalanya, dan UI/flow. Semuanya milik sisi UI.

## 8. Usulan penempatan di UI (belum dibangun)

Bagian ini usulan untuk yang membangun UI, bukan perilaku yang sudah ada. Fakta tentang kode yang dirujuk sudah
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
- Prasyarat (Set Akreditasi, LKPS, isi bab) lebih baik dicek UI sebelum tombol aktif; tanpa itu job langsung berakhir
  `result.status: "error"` (lihat bagian 4).
