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
| `model` | tidak | Harus salah satu model yang dikonfigurasi server; model *reasoning* ditolak. |

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
| Model reasoning | `Model reasoning (<nama>) belum didukung untuk setor ke LED -- …` |
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
berakhir dengan `result.status: "cancelled"`. IKU yang sudah selesai tetap ada di `hasil`. Panggilan LLM yang sedang
berjalan pada saat itu tidak ikut dihentikan seketika.

## 6. Hal yang perlu diketahui tentang kualitas

- Narasi dan Capaian ditulis model dan **non-deterministik**: IKU yang sama bisa sukses di satu run dan
  "capaian tidak ditemukan" di run lain. Perlakukan hasil sebagai **draf yang harus dibaca penulis**.
- Capaian yang hanya bisa ditebak sengaja dianggap tidak ditemukan (tidak ada narasi "diperkirakan").
- Sumber Capaian saat ini: tabel LKPS, teks LED di editor (atau unggahan), dan bukti dukung prodi. IKU yang angkanya
  hanya ada di dokumen di luar itu (mis. inventaris) akan `error`.

## 7. Di luar cakupan (belum ada)

Menulis hasil ke bab/canvas editor, skor angka beserta skalanya, dan UI/flow. Semuanya milik sisi UI.
