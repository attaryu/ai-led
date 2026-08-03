# Dokumentasi Flow Aplikasi — Platform Penyusunan Dokumen LED LAM-Teknik

## Daftar Isi

1. [Gambaran Umum & Prinsip Desain](#1-gambaran-umum--prinsip-desain)
2. [Autentikasi](#2-autentikasi)
3. [Struktur Navigasi (Tiga Lapis)](#3-struktur-navigasi-tiga-lapis)
4. [Dashboard Utama](#4-dashboard-utama)
5. [Dashboard Prodi](#5-dashboard-prodi)
6. [Dashboard Project LED](#6-dashboard-project-led)
7. [Editor Bab](#7-editor-bab)
8. [Mekanisme Checkpoint (Draft)](#8-mekanisme-checkpoint-draft)
9. [Mekanisme Simulasi Skor (Rubrik)](#9-mekanisme-simulasi-skor-rubrik)
10. [Mekanisme Skor RAGAS](#10-mekanisme-skor-ragas)
11. [Mekanisme Rujukan](#11-mekanisme-rujukan)
12. [Kunci Review oleh Penjamin Mutu](#12-kunci-review-oleh-penjamin-mutu)
13. [Auto-Lock Kolaborasi (Redis)](#13-auto-lock-kolaborasi-redis)
14. [Perubahan Status Dokumen](#14-perubahan-status-dokumen)
15. [Matriks Hak Akses Ringkas](#15-matriks-hak-akses-ringkas)
16. [Pertanyaan Terbuka](#16-pertanyaan-terbuka)

---

## 1. Gambaran Umum & Prinsip Desain

Platform ini punya empat role (`ADMIN`, `PIMPINAN`, `PENJAMIN_MUTU`, `PENYUSUN`) yang beroperasi di tiga lapis ruang kerja: **Dashboard Utama** (level tenant/universitas) → **Dashboard Prodi** (level program studi) → **Dashboard Project LED** (level satu dokumen LED, dengan **Editor Bab** di dalamnya).

Dua prinsip desain yang berlaku konsisten di seluruh aplikasi:

- **Komponen UI mengikuti hak akses**: tombol/menu yang tidak boleh diakses suatu role **disembunyikan sepenuhnya**, bukan sekadar dinonaktifkan (disabled).
- **Pola "kondisi aktif vs checkpoint"**: hampir semua entitas kerja (konten bab, bukti dukung terpakai, skor rubrik) punya dua wujud — kondisi **aktif** yang terus-menerus ditimpa (autosave), dan **checkpoint** (`BAB_DRAFT`) yang begitu dibuat bersifat permanen/immutable untuk kontennya.

---

## 2. Autentikasi

- Hanya **login** (email + password). **Tidak ada fitur lupa password** untuk versi pengembangan saat ini — dianggap out of scope demi kecepatan development.
- Setelah login berhasil, sistem membaca `USER.role` dan `USER.program_studi_id` untuk menentukan halaman pendaratan (landing page):
  - `ADMIN`, `PIMPINAN`, `PENJAMIN_MUTU` → diarahkan ke **Dashboard Utama**.
  - `PENYUSUN` → **langsung** diarahkan ke **Dashboard Prodi** miliknya (skip Dashboard Utama sepenuhnya, karena `PENYUSUN` memang tidak berwenang melihat prodi lain atau menu manajemen organisasi).

---

## 3. Struktur Navigasi (Tiga Lapis)

```
[Dashboard Utama]                         ← level TENANT
 ├─ Manajemen Program Studi
 ├─ Manajemen User
 ├─ Daftar Program Studi (untuk navigasi masuk ke tiap prodi)
 └─ Perpustakaan Bukti Dukung (level TENANT)
      │ klik salah satu Program Studi
      ▼
[Dashboard Prodi]                         ← level PROGRAM_STUDI
 ├─ Daftar Dokumen LED (khusus prodi ini)
 └─ Perpustakaan Bukti Dukung (level PROGRAM_STUDI)
      │ klik salah satu Dokumen LED
      ▼
[Dashboard Project LED]                   ← level DOKUMEN_LED, sidebar terpisah total
 ├─ tombol "← Kembali" (ke Dashboard Prodi)
 ├─ Ringkasan/Progres per bab
 └─ Navigasi ke Editor per Bab
      │ klik salah satu Bab
      ▼
[Editor Bab]                              ← level BAB_DOKUMEN, dua sidebar ala Figma
 ├─ Sidebar kiri: Daftar Isi / navigasi antar bab
 ├─ Kanvas tengah: rich text editor
 └─ Sidebar kanan: tab Generate, Rujukan, Rubrik, Skor, Draft
```

Setiap lapis punya sidebar/navigasi yang **berbeda total** dari lapis sebelumnya (bukan sub-tab di halaman yang sama) — perpindahan antar lapis selalu lewat aksi klik eksplisit (klik card prodi, klik card dokumen, klik nama bab), dan selalu ada tombol kembali ke satu level di atasnya.

---

## 4. Dashboard Utama

**Diakses oleh**: `ADMIN`, `PIMPINAN`, `PENJAMIN_MUTU`. (`PENYUSUN` tidak pernah melihat halaman ini.)

### 4.1 Manajemen Program Studi

- **Akses**: `ADMIN`, `PIMPINAN`.
- Membuat, mengedit `PROGRAM_STUDI` (kolom `nama`, terikat ke `TENANT` lewat `tenant_id`).
- `PENJAMIN_MUTU` tidak punya menu ini sama sekali (sesuai keputusan: Penjamin Mutu tidak mengelola user/prodi).

### 4.2 Manajemen User

- **Membuat user baru** (`USER.role`, `email`, `password_hash`, dsb) — hanya `ADMIN`.
- **Assign/edit `program_studi_id`** seorang user (khusus untuk menempatkan `PENYUSUN` ke prodi tertentu) — hanya `PIMPINAN`.
- `PENJAMIN_MUTU` tidak punya menu ini sama sekali.

### 4.3 Daftar Program Studi (navigasi)

- Kartu/daftar seluruh `PROGRAM_STUDI` di tenant tersebut, diklik untuk masuk ke **Dashboard Prodi** terkait.
- Terlihat oleh `ADMIN`, `PIMPINAN`, `PENJAMIN_MUTU`.

### 4.4 Perpustakaan Bukti Dukung (level Tenant)

- Menampilkan seluruh `BUKTI_DUKUNG` dengan `owner_tipe = TENANT` dan `tenant_id` sesuai tenant user.
- **Upload**: `PIMPINAN`, `PENJAMIN_MUTU`. `ADMIN` tidak punya akses ke bukti dukung sama sekali (murni back office).

---

## 5. Dashboard Prodi

**Diakses oleh**: `ADMIN`? — tidak. `PIMPINAN`, `PENJAMIN_MUTU` (lewat klik dari Dashboard Utama), dan `PENYUSUN` (landing langsung setelah login).

### 5.1 Daftar Dokumen LED (khusus prodi ini)

- Menampilkan seluruh `DOKUMEN_LED` dengan `program_studi_id` sesuai prodi yang sedang dibuka, beserta `status_keseluruhan`.
- `PENYUSUN` hanya melihat daftar ini untuk **satu** prodi tempatnya ditugaskan (`USER.program_studi_id`).
- `PIMPINAN`/`PENJAMIN_MUTU` bisa membuka Dashboard Prodi mana pun (lintas prodi), karena mereka beroperasi di level tenant.
- Klik salah satu kartu Dokumen LED → masuk ke **Dashboard Project LED**.

### 5.2 Perpustakaan Bukti Dukung (level Prodi)

- Menampilkan `BUKTI_DUKUNG` dengan `owner_tipe = PROGRAM_STUDI` dan `program_studi_id` sesuai prodi ini.
- **Upload**: `PIMPINAN`, `PENJAMIN_MUTU`, dan `PENYUSUN` (untuk prodinya sendiri).
- Karena `BUKTI_DUKUNG` tidak terikat ke `DOKUMEN_LED` tertentu, bukti dukung yang diunggah di sini otomatis tersedia untuk **semua** `DOKUMEN_LED` milik prodi tersebut (misalnya jika prodi punya beberapa siklus akreditasi/tahun akademik berbeda) — tidak perlu upload ulang.

---

## 6. Dashboard Project LED

**Diakses oleh**: seluruh role yang berhak atas dokumen tersebut (`PIMPINAN`, `PENJAMIN_MUTU` lintas prodi; `PENYUSUN` hanya untuk prodinya).

### 6.1 Ringkasan/Progres

- Daftar seluruh `BAB_DOKUMEN` milik `DOKUMEN_LED` ini, diurutkan berdasarkan `urutan_bab`.
- Tiap baris menampilkan: `judul_bab`, indikator `terkunci` (ikon gembok jika `true`), waktu `terakhir_disimpan`, dan (jika sudah pernah disimulasikan) ringkasan skor rubrik.
- Klik salah satu bab → masuk ke **Editor Bab**.

### 6.2 Hak akses di level ini

- `PIMPINAN`: seluruhnya **read-only** — bisa melihat progres dan membuka Editor Bab, tapi begitu masuk Editor Bab semua tombol aksi (generate, simulasi, buat draft, kunci) disembunyikan.
- `PENJAMIN_MUTU`, `PENYUSUN`: bisa masuk Editor Bab dengan hak edit penuh sesuai matriks di [bagian 15](#15-matriks-hak-akses-ringkas).

---

## 7. Editor Bab

Tampilan mengikuti konsep dua-sidebar ala Figma:

```
┌────────────┬─────────────────────────────┬──────────────────────┐
│ Sidebar    │        Kanvas Editor         │   Sidebar Kanan       │
│ Kiri       │   (rich text, satu bab =     │   Tab: Generate |     │
│ (Daftar    │    satu ruang kerja/         │   Rujukan | Rubrik |  │
│  Isi/nav   │    "kertas" sendiri)         │   Skor | Draft        │
│  antar bab)│                               │                       │
└────────────┴─────────────────────────────┴──────────────────────┘
```

### 7.1 Sidebar Kiri — Navigasi antar bab

- Menampilkan struktur Daftar Isi berjenjang (lihat [Pertanyaan Terbuka #2](#16-pertanyaan-terbuka) — struktur persis pemetaannya masih perlu diklarifikasi).
- Klik item lain di sini akan berpindah bab tanpa keluar dari Editor (tetap di dalam `DOKUMEN_LED` yang sama).

### 7.2 Kanvas Editor — kondisi "satu bab, satu ruang kerja"

- Satu `BAB_DOKUMEN` = satu ruang kerja utuh dengan `konten_kerja` (jsonb) sebagai sumber kebenaran.
- Meskipun secara visual bisa memuat banyak "kertas"/section yang memanjang (mis. bab yang berisi banyak sub-poin), **semua tetap satu kesatuan `konten_kerja`** milik bab tersebut — **tidak** dipecah jadi entitas terpisah per section. Ini disengaja agar fleksibel: satu bab bisa berisi satu poin singkat atau memanjang jadi banyak sub-bagian, tanpa mengubah model data.
- **Autosave**: setiap perubahan ketikan langsung menimpa `konten_kerja`, ditandai indikator "Tersimpan X menit yang lalu" di header.

### 7.3 Bab baru (kosong)

- Saat `DOKUMEN_LED` baru dibuat, sistem **otomatis membuat seluruh baris `BAB_DOKUMEN`** sesuai struktur bab standar LAM Teknik, tapi `konten_kerja` masih kosong.
- Untuk bab yang masih kosong: seluruh tab sidebar kanan (Rujukan, Rubrik, Skor, Draft) tampil **kosong/nonaktif** sampai ada aksi generate atau tulisan pertama dimasukkan.

---

## 8. Mekanisme Checkpoint (Draft)

### 8.1 Tab "Draft" di sidebar kanan

- **Daftar Draft Tersimpan**: menampilkan seluruh `BAB_DRAFT` milik bab ini, diurutkan `versi` terbaru di atas. Tiap baris menampilkan `label`, `dibuat_oleh_user_id` (nama), dan waktu relatif (`dibuat_pada`).
- **Tombol tambah draft baru** (ikon "+"): memicu pembuatan checkpoint manual — user memberi `label` opsional (misal "Rencana revisi kedua"), lalu sistem menyalin `konten_kerja` saat ini ke `konten_snapshot` sebuah baris `BAB_DRAFT` baru, sekaligus menyalin bukti dukung yang sedang dipakai (dari `BUKTI_DUKUNG_BAB`) ke `BUKTI_DUKUNG_DRAFT`.
- **Menu "..." pada tiap baris draft**, berisi minimal:
  - **"Gunakan draft ini"** — menimpa `konten_kerja` bab dengan `konten_snapshot` draft terpilih, dan memperbarui `checkpoint_aktif_id` di `BAB_DOKUMEN` menjadi draft ini. Draft yang lama **tidak dihapus**, tetap ada di riwayat.
  - **"Lihat skor"** — membuka **modal** yang menampilkan breakdown `HASIL_SKOR_KRITERIA` (`target_tipe = BAB_DRAFT`, `bab_draft_id` = draft ini), murni tampilan baca, **tidak** memicu restore konten maupun re-run simulasi.
- **Draft tidak bisa dihapus** — karena selama masih dirujuk oleh dokumen (jejak audit akreditasi), penghapusan tidak diizinkan.

### 8.2 Kapan checkpoint dibuat

- **Selalu manual**, lewat tombol "Simpan sebagai Draft" (bukan otomatis oleh sistem, dan bukan otomatis setiap kali generate AI selesai — meskipun hasil generate AI _bisa_ langsung disimpan sebagai draft jika user memilih demikian, sesuai alur generate di bawah).

### 8.3 Perbandingan antar checkpoint

- Dilakukan manual dengan dua aksi terpisah di menu "..." tiap draft:
  - Mau **pakai isinya** → "Gunakan draft ini" (mengubah kondisi aktif).
  - Mau **sekadar lihat skornya** → "Lihat skor" (modal, tanpa mengubah apa pun).
- Tidak ada tampilan "diff" otomatis antar dua checkpoint — perbandingan dilakukan user secara manual dengan berpindah-pindah antar draft dan tab.

---

## 9. Mekanisme Simulasi Skor (Rubrik)

### 9.1 Tab "Rubrik" di sidebar kanan

- Menampilkan daftar `RUBRIK_KRITERIA` yang relevan untuk `urutan_bab` bab ini (dicocokkan lewat `RUBRIK_KRITERIA_BAB`), masing-masing dengan deskripsi tiap level skor.
- Di bagian bawah tab, ada **tombol "Jalankan Simulasi"**.
- Setelah dijalankan (menunggu AI menilai `konten_kerja` terhadap tiap kriteria), hasil disimpan ke `HASIL_SKOR_KRITERIA` dengan `target_tipe = BAB_AKTIF`, `bab_id` = bab ini. Baris lama untuk bab ini **dihapus & diganti** (ditimpa) tiap kali di-run ulang.
- Total skor bab dihitung **on-the-fly** (SUM/AVG dari seluruh `HASIL_SKOR_KRITERIA` terkait) — tidak disimpan sebagai kolom agregat terpisah.

### 9.2 Card draft/checkpoint lain di tab Rubrik

- Di bagian paling bawah tab, muncul daftar card kecil berisi draft-draft lain yang **sudah pernah disimulasikan** (punya `HASIL_SKOR_KRITERIA` dengan `target_tipe = BAB_DRAFT`).
- Klik salah satu card → **pop-up modal** muncul di atas halaman yang sama (bukan pindah tab), menampilkan breakdown skor milik draft tersebut.
- Skor pada checkpoint bersifat **immutable** dalam arti tidak berubah kecuali user secara eksplisit menjalankan ulang simulasi untuk checkpoint tersebut (yang akan menimpa baris lama, konsisten dengan kebijakan "main timpa").

### 9.3 Siapa yang bisa menjalankan simulasi

- `PENJAMIN_MUTU`, `PENYUSUN` — bisa klik "Jalankan Simulasi".
- `PIMPINAN` — hanya melihat hasil yang sudah ada (read-only), tombol simulasi disembunyikan.

---

## 10. Mekanisme Skor RAGAS

### 10.1 Tab "Skor" di sidebar kanan

- Berbeda dari tab Rubrik (yang menilai **kelayakan konten** terhadap kriteria akreditasi LAM Teknik), tab ini menampilkan metrik **kualitas jawaban AI** itu sendiri (relevansi, faithfulness, dsb — gaya evaluasi RAGAS untuk sistem RAG).
- **Dihitung otomatis** setiap kali proses Generate selesai — tidak ada tombol trigger manual terpisah.
- Bersifat informatif, kemungkinan lebih relevan untuk tim pengembang memantau kualitas RAG dibanding untuk pengambilan keputusan akreditasi oleh user akhir. Belum final apakah tab ini akan dipertahankan di rilis produksi.

---

## 11. Mekanisme Rujukan

### 11.1 Tab "Rujukan" di sidebar kanan

- Menampilkan dua bagian, murni **read-only**:
  - **Panduan** yang dipakai — daftar `PANDUAN_DETAIL` yang relevan, ditampilkan sebagai nama file sumber (`PANDUAN_REFERENSI.judul`/`file_url`) + info halaman.
  - **Bukti Dukung** yang dipakai — daftar `BUKTI_DUKUNG` yang tercatat di `BUKTI_DUKUNG_BAB` (kondisi aktif saat ini), ditampilkan sebagai card (nama file, waktu upload). Ini termasuk data LKPS, yang meski isinya bisa jadi tabel data terstruktur, tetap ditampilkan sebagai card bukti dukung biasa (bukan tabel detail terpisah).
- Isi tab ini **otomatis terisi** berdasarkan bukti dukung yang dipilih user saat generate, **maupun** yang diambil otomatis oleh AI di luar pilihan eksplisit user (jika sistem RAG menentukan ada bukti dukung lain yang relevan).
- Tab ini hanya menampilkan **daftar**, tanpa detail isi/preview di dalamnya — untuk melihat detail, user membuka bukti dukung tersebut lewat Perpustakaan Bukti Dukung terkait.

---

## 12. Kunci Review oleh Penjamin Mutu

### 12.1 Tab "Generate" di sidebar kanan

- Checklist pemilihan `BUKTI_DUKUNG` yang relevan (gabungan level tenant + level prodi terkait) → tombol **Generate**.
- Setelah diklik: sistem masuk mode **loading**, memanggil RAG (mencari `PANDUAN_DETAIL` relevan berdasar `urutan_bab` + isi bukti dukung terpilih di vector database eksternal), lalu **langsung menimpa `konten_kerja`** begitu hasil didapat — **tidak ada tahap preview/konfirmasi** sebelum menimpa.
- Baris `BUKTI_DUKUNG_BAB` untuk bab ini diperbarui (hapus lama, insert sesuai pilihan bukti dukung yang dipakai generate ini).
- Skor RAGAS (tab Skor) otomatis terhitung begitu proses ini selesai.

### 12.2 Penguncian bab (`terkunci`)

- Hanya `PENJAMIN_MUTU` yang punya tombol **Kunci/Buka Kunci Bab**, biasanya disertai pengisian `catatan_penjamin_mutu`.
- Saat `terkunci = true`: **tidak seorang pun** — termasuk Penjamin Mutu yang menguncinya sendiri — bisa mengedit `konten_kerja`, menjalankan generate, menjalankan simulasi skor, atau membuat checkpoint baru pada bab tersebut. Seluruh tab tetap bisa **dibuka untuk dibaca** (Rujukan, Draft lama, Rubrik lama, Skor lama), hanya aksi-aksi yang mengubah data yang diblokir.
- Membuka kunci (`terkunci = false`) mengembalikan seluruh hak akses edit sesuai role masing-masing.

---

## 13. Auto-Lock Kolaborasi (Redis)

Ini adalah lapisan kunci **kedua**, berbeda dan independen dari `terkunci` (kunci review Penjamin Mutu, tersimpan permanen di database). Auto-lock kolaborasi bersifat **sementara**, murni ditangani di **Redis** (tidak masuk skema database utama karena sifatnya volatile).

### 13.1 Mekanisme

- **Trigger**: begitu User A mulai mengetik, menjalankan **generate**, atau menjalankan **simulasi skor** pada suatu bab, sistem membuat/memperbarui key semacam `lock:bab:{bab_id}` di Redis berisi `{user_id, waktu_mulai, last_activity}`.
- **Durasi**: **sliding window** dengan _debounce_ — timer 10 menit terus diperbarui (extend) selama ada aktivitas dari user tersebut, bukan hitung mundur tetap sejak awal.
- **Proses generate/simulasi yang sedang berjalan (loading)** juga otomatis mengaktifkan/memperpanjang lock, termasuk saat terjadi **timeout** pada proses tersebut — lock tetap aktif seperti kondisi mengetik biasa (tidak otomatis lepas hanya karena timeout teknis; perlu penanganan terpisah untuk retry/gagal, lihat [Pertanyaan Terbuka](#16-pertanyaan-terbuka)).
- **Status proses generate** (sedang berjalan / selesai / gagal) juga disimpan di Redis, memungkinkan frontend melakukan polling status sampai hasil generate siap.

### 13.2 Efek ke User lain

- User B yang membuka bab yang sama saat lock aktif: **tetap bisa melihat/membaca** seluruh isi bab dan tab-tab sidebar kanan.
- Namun **aksi** yang mengubah kondisi aktif — mengetik di kanvas editor, klik Generate, klik Jalankan Simulasi, klik tambah Draft baru — **diblokir** selama lock aktif.
- UI menampilkan indikator jelas: **nama** user yang sedang memegang lock, beserta **estimasi kapan lock akan lepas**.

### 13.3 Ringkasan dua lapis kunci

|                         | Kunci Review (`terkunci`)                   | Auto-Lock Kolaborasi (Redis)                |
| ----------------------- | ------------------------------------------- | ------------------------------------------- |
| Disimpan di             | `BAB_DOKUMEN.terkunci` (database, permanen) | Redis (cache, sementara)                    |
| Siapa yang mengaktifkan | `PENJAMIN_MUTU` (manual)                    | Sistem (otomatis, saat ada aktivitas)       |
| Durasi                  | Sampai dibuka manual                        | 10 menit sejak aktivitas terakhir (sliding) |
| Berlaku untuk           | Semua role tanpa kecuali                    | Semua role selain yang sedang memegang lock |
| Efek ke pembacaan       | Tetap bisa dibaca                           | Tetap bisa dibaca                           |
| Efek ke aksi            | Semua aksi ubah data diblokir               | Semua aksi ubah data diblokir               |

Kedua lapis ini **independen** dan bisa aktif bersamaan (misal bab sedang di-lock review sekaligus kebetulan masih ada sisa lock kolaborasi dari sebelumnya).

---

## 14. Perubahan Status Dokumen

- `DOKUMEN_LED.status_keseluruhan` (`DRAFT` \| `REVIEW` \| `SELESAI`) hanya bisa diubah oleh `PENJAMIN_MUTU`.
- Perubahan ini **manual sepenuhnya** untuk saat ini — Penjamin Mutu memilih status baru kapan saja tanpa validasi otomatis (misal tidak divalidasi apakah semua bab sudah `terkunci` sebelum status bisa diset `SELESAI`). Aturan validasi tambahan bisa dipertimbangkan di iterasi berikutnya.

---

## 15. Matriks Hak Akses Ringkas

| Aksi                                           | Admin           | Pimpinan        | Penjamin Mutu   | Penyusun                   |
| ---------------------------------------------- | --------------- | --------------- | --------------- | -------------------------- |
| Buat/kelola Program Studi                      | ✅              | ✅              | ❌              | ❌                         |
| Buat User baru                                 | ✅              | ❌              | ❌              | ❌                         |
| Assign/edit User ke Prodi                      | ✅\*            | ✅              | ❌              | ❌                         |
| Landing setelah login                          | Dashboard Utama | Dashboard Utama | Dashboard Utama | Dashboard Prodi (langsung) |
| Lihat Dashboard Prodi/Project LED lintas prodi | ❌              | ✅              | ✅              | ❌ (hanya prodinya)        |
| Edit konten bab / generate / buat draft        | ❌              | ❌ (read-only)  | ✅              | ✅                         |
| Jalankan simulasi skor (Rubrik)                | ❌              | ❌ (read-only)  | ✅              | ✅                         |
| Kunci/buka kunci bab                           | ❌              | ❌              | ✅              | ❌                         |
| Ubah status dokumen                            | ❌              | ❌              | ✅              | ❌                         |
| Upload bukti dukung level Tenant               | ❌              | ✅              | ✅              | ❌                         |
| Upload bukti dukung level Prodi                | ❌              | ✅              | ✅              | ✅ (prodinya)              |

_\* Admin hanya bisa membuat user, belum tentu punya kemampuan assign ke prodi — perlu dikonfirmasi ulang bila ada kebutuhan lanjutan._

---

## 16. Pertanyaan Terbuka

Bagian ini mencatat hal-hal yang belum diputuskan/dibahas tuntas, untuk didiskusikan lebih lanjut sebelum implementasi:

1. **Integrasi AMI (Audit Mutu Internal)** — belum jelas bagaimana proses AMI terintegrasi ke aplikasi:
   - Apakah AMI adalah role baru (auditor internal), atau dilakukan di luar aplikasi (offline) dan hasilnya diunggah sebagai bukti dukung/catatan saja?
   - Apakah AMI bekerja di level dokumen LED secara keseluruhan (sekali sebelum submit), atau per bab (mirip mekanisme lock Penjamin Mutu tapi tahapan berbeda)?
   - Apakah kriteria/checklist AMI berbeda dari `RUBRIK_KRITERIA` (LAM Teknik) yang sudah ada, atau memakai rubrik yang sama sebagai simulasi internal?

2. **Pemetaan Table of Content (TOC) di sidebar kiri Editor Bab** — dari contoh UI terlihat struktur berjenjang dalam (Bab → sub-bab huruf → sub-sub-bab angka → poin a/b/c), lebih dalam dari `BAB_DOKUMEN.urutan_bab` yang saat ini cuma satu level:
   - Apakah struktur TOC ini statis/template baku (bisa jadi master data seperti `RUBRIK_KRITERIA_BAB`/`PANDUAN_DETAIL_BAB`), atau dihasilkan otomatis dari heading yang ditulis user di dalam `konten_kerja` (seperti outline Google Docs)?
   - Jika statis: apakah satu baris TOC setara satu `BAB_DOKUMEN` utuh, atau ternyata satu `urutan_bab` berisi banyak sub-item TOC sekaligus — yang berarti unit "satu ruang kerja/kertas" sebenarnya ada di granularitas sub-bab, bukan bab utuh seperti asumsi saat ini?

3. **Struktur data LKPS** — LKPS cenderung berupa data terstruktur (tabel angka: rasio dosen-mahasiswa, jumlah publikasi, dst), bukan teks naratif seperti panduan lain. Apakah tetap diperlakukan sebagai dokumen yang di-chunk untuk RAG seperti bukti dukung biasa, atau butuh struktur data terpisah untuk perhitungan/rujukan langsung?

4. **Penanganan gagal/timeout saat generate atau simulasi** — lock tetap aktif saat timeout, tapi bagaimana proses pemulihannya di sisi user? Apakah ada notifikasi kegagalan, tombol retry manual, atau lock otomatis lepas setelah durasi tertentu meski prosesnya gagal total (bukan sekadar lambat)?

5. **Export dokumen LED** — fitur ekspor (kemungkinan ke Word/PDF) disebutkan ada, tapi detail mekanismenya belum dibahas sama sekali (format, apakah per bab atau seluruh dokumen, styling, dsb) — dilupakan dulu sesuai kesepakatan, dibahas belakangan.

6. **Validasi perubahan status dokumen** — saat ini murni manual tanpa syarat. Apakah ke depannya perlu ditambah validasi (misal tidak bisa set `SELESAI` jika masih ada bab yang belum `terkunci`)?
