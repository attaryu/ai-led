# Dokumentasi Skema Database — Platform Penyusunan Dokumen LED LAM-Teknik

## Daftar Isi

1. [Gambaran Umum](#gambaran-umum)
2. [Kelompok: Organisasi & Pengguna](#kelompok-organisasi--pengguna)
   - [TENANT](#1-tenant)
   - [USER](#2-user)
   - [PROGRAM_STUDI](#3-program_studi)
3. [Kelompok: Dokumen LED](#kelompok-dokumen-led)
   - [DOKUMEN_LED](#4-dokumen_led)
   - [BAB_DOKUMEN](#5-bab_dokumen)
   - [BAB_DRAFT](#6-bab_draft)
4. [Kelompok: Bukti Dukung](#kelompok-bukti-dukung)
   - [BUKTI_DUKUNG](#7-bukti_dukung)
   - [BUKTI_DUKUNG_BAB](#8-bukti_dukung_bab)
   - [BUKTI_DUKUNG_DRAFT](#9-bukti_dukung_draft)
5. [Kelompok: Skoring (Simulasi Penilaian)](#kelompok-skoring-simulasi-penilaian)
   - [RUBRIK_KRITERIA](#10-rubrik_kriteria)
   - [RUBRIK_KRITERIA_BAB](#11-rubrik_kriteria_bab)
   - [HASIL_SKOR_KRITERIA](#12-hasil_skor_kriteria)
   - [Skor RAGAS — belum punya tempat di skema ini](#12a-skor-ragas--belum-punya-tempat-di-skema-ini)
6. [Kelompok: Panduan Referensi (Master Data RAG)](#kelompok-panduan-referensi-master-data-rag)
   - [PANDUAN_REFERENSI](#13-panduan_referensi)
   - [PANDUAN_DETAIL](#14-panduan_detail)
   - [PANDUAN_DETAIL_BAB](#15-panduan_detail_bab)
7. [Ringkasan Alur Fitur Utama](#ringkasan-alur-fitur-utama)

---

## Gambaran Umum

Platform ini membantu perguruan tinggi menyusun **Laporan Evaluasi Diri (LED)** untuk kebutuhan akreditasi LAM Teknik. Sistem menyediakan struktur multi-tenant (multi-universitas), pengelolaan dokumen per program studi, editor per bab dengan sistem checkpoint (mirip *version control* sederhana), unggahan bukti dukung, fitur generasi konten berbasis AI (RAG), dan simulasi skor per bab berdasarkan rubrik penilaian resmi.

Skema database terbagi menjadi empat kelompok besar:

```
KELOMPOK ORGANISASI & PENGGUNA (per tenant)
TENANT (universitas)
 └── USER (admin, pimpinan, penjamin mutu, penyusun)
 └── PROGRAM_STUDI
      |── USER (opsional, ditugaskan ke prodi)
      |── DOKUMEN_LED
      |    └── BAB_DOKUMEN
      |         └── BAB_DRAFT (checkpoint)
      └── BUKTI_DUKUNG (level prodi)
 └── BUKTI_DUKUNG (level tenant)

KELOMPOK BUKTI DUKUNG (penghubung)
BUKTI_DUKUNG_BAB   → BUKTI_DUKUNG ↔ BAB_DOKUMEN (kondisi aktif, ditimpa)
BUKTI_DUKUNG_DRAFT → BUKTI_DUKUNG ↔ BAB_DRAFT (checkpoint, permanen)

KELOMPOK SKORING (transaksional, per tenant/prodi tapi kriterianya global)
RUBRIK_KRITERIA ── RUBRIK_KRITERIA_BAB (nomor bab standar)
HASIL_SKOR_KRITERIA → menempel ke BAB_DOKUMEN (aktif, ditimpa) ATAU BAB_DRAFT (checkpoint, permanen)

KELOMPOK PANDUAN REFERENSI (master data global, di-seed sekali, lintas tenant)
PANDUAN_REFERENSI ── PANDUAN_DETAIL ── PANDUAN_DETAIL_BAB (nomor bab standar)
```

Berikut dokumentasi setiap tabel, dikelompokkan dan diurutkan dari entitas tertinggi ke turunannya.

---

## Kelompok: Organisasi & Pengguna

## 1. TENANT

### Deskripsi
`TENANT` merepresentasikan satu **universitas/perguruan tinggi** yang menggunakan platform ini. Ini adalah entitas paling atas dalam hierarki — seluruh data (user, program studi, dokumen, bukti dukung) pada akhirnya terikat ke satu tenant, sehingga data antar universitas terisolasi satu sama lain (multi-tenancy).

### Konteks pengguna
Tabel ini tidak pernah dilihat langsung oleh user biasa sebagai entitas — ia mewakili "ruang kerja" sebuah universitas secara keseluruhan. Setiap kali seorang user login, aplikasi otomatis membatasi seluruh data yang ia lihat (prodi, dokumen, bukti dukung) hanya milik `TENANT` tempat ia terdaftar.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik tenant |
| `nama_universitas` | string | Nama resmi perguruan tinggi |

### Relasi
- Satu tenant memiliki banyak `PROGRAM_STUDI`.
- Satu tenant memiliki banyak `USER`.
- Satu tenant dapat memiliki `BUKTI_DUKUNG` di level universitas (dokumen yang berlaku lintas program studi, misal Statuta, SK Rektor, Renstra Universitas).

### Fitur terkait
- **Onboarding organisasi**: saat sebuah universitas pertama kali mendaftar ke platform, sebuah baris `TENANT` baru dibuat bersamaan dengan satu `USER` pertama berperan sebagai **admin** (lihat bagian USER).
- **Isolasi data**: seluruh query di level aplikasi harus di-*scope* berdasarkan `tenant_id` untuk mencegah kebocoran data antar universitas.

---

## 2. USER

### Deskripsi
`USER` merepresentasikan setiap individu yang login ke platform. Ada empat role, dengan kewenangan yang berbeda-beda terhadap manajemen organisasi maupun konten LED.

### Konteks pengguna
Ini adalah tabel identitas — menentukan siapa yang login, dan lewat kolom `role` menentukan menu, halaman, serta tombol aksi apa saja yang muncul di UI untuk user tersebut (komponen yang tidak diizinkan otomatis disembunyikan, bukan sekadar dinonaktifkan).

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik user |
| `tenant_id` | string (FK) | Universitas tempat user terdaftar |
| `program_studi_id` | string (FK, nullable) | Prodi tempat user ditugaskan (khusus role `PENYUSUN`); kosong jika user bersifat lintas-prodi |
| `nama_lengkap` | string | Nama user |
| `email` | string | Digunakan untuk login |
| `password_hash` | string | Kata sandi terenkripsi |
| `role` | string | `ADMIN` \| `PIMPINAN` \| `PENJAMIN_MUTU` \| `PENYUSUN` |

### Penjelasan Role (final)

| Role | Cakupan | Kewenangan utama |
|---|---|---|
| **ADMIN** | Level tenant | Murni *back office*: user pertama yang otomatis dibuat saat tenant dibuat. Hanya bisa membuat akun `USER` baru dan membuat/mengelola `PROGRAM_STUDI`. Tidak punya akses sama sekali ke dashboard progres LED, editor bab, atau bukti dukung. |
| **PIMPINAN** | Level tenant | Setara Admin untuk urusan struktural, malah lebih lengkap: bisa membuat/kelola `PROGRAM_STUDI` **dan** meng-assign/mengedit penempatan `USER` ke prodi (Admin hanya bisa membuat user, tidak bisa assign ulang). Di sisi konten, Pimpinan melihat dashboard progres LED lintas prodi dan detail tiap dokumen, tapi seluruhnya **read-only** (tidak bisa edit konten, generate, jalankan simulasi skor, atau upload bukti dukung dari sisi generate — namun tetap bisa **upload bukti dukung** di level tenant maupun prodi). |
| **PENJAMIN_MUTU** | Level tenant atau prodi | **Tidak** mengelola user/prodi sama sekali. Fokus pada konten: bisa edit konten bab, generate konten AI, jalankan simulasi skor, upload bukti dukung (tenant maupun prodi), serta wewenang khusus **mengunci (`terkunci`) bab** yang sedang direview. |
| **PENYUSUN** | Level prodi (satu prodi saja) | Mengerjakan isi bab dokumen (`konten_kerja`) pada prodi yang di-assign, memilih bukti dukung level prodi, menjalankan generasi konten AI dan simulasi skor, serta membuat checkpoint (`BAB_DRAFT`). Tidak bisa mengunci bab maupun upload bukti dukung level tenant. |

### Relasi
- Satu user membuat banyak `BAB_DRAFT` (checkpoint) melalui kolom `dibuat_oleh_user_id`.
- Satu user (`PENYUSUN`) ditempatkan di **tepat satu** `PROGRAM_STUDI` lewat `program_studi_id`; role lain umumnya beroperasi di level tenant (`program_studi_id` kosong).

### Fitur terkait
- **Manajemen akun**: hanya `ADMIN` yang bisa membuat user baru dengan role apa pun di dalam tenant-nya.
- **Penugasan ke prodi**: hanya `PIMPINAN` yang bisa mengubah `program_studi_id` seorang user (assign/pindah prodi) setelah user tersebut dibuat oleh Admin.
- **Kontrol akses berbasis role**: seluruh menu dan tombol aksi di UI mengikuti tabel kewenangan di atas.

---

## 3. PROGRAM_STUDI

### Deskripsi
`PROGRAM_STUDI` merepresentasikan satu program studi di bawah suatu universitas. Setiap dokumen LED disusun untuk satu program studi tertentu, karena akreditasi LAM Teknik dilakukan per prodi.

### Konteks pengguna
Prodi adalah unit pemisah ruang kerja utama di bawah tenant — `PENYUSUN` hanya bisa melihat/mengerjakan satu prodi tempat ia ditugaskan, sementara `ADMIN` dan `PIMPINAN` bisa melihat/mengelola seluruh prodi di universitasnya.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik program studi |
| `tenant_id` | string (FK) | Universitas pemilik prodi ini |
| `nama` | string | Nama program studi, misal "Teknik Informatika" |
| `kode` | string | Kode prodi PDDikti, misal "55201" |
| `jenjang` | string | `D3` \| `D4` \| `S1` \| `S2` \| `S3` |
| `fakultas` | string | Fakultas induk, misal "Fakultas Teknik" |
| `ketua_prodi` | string | Nama penanggung jawab prodi |
| `peringkat_akreditasi` | string | `UNGGUL` \| `BAIK_SEKALI` \| `BAIK` \| `BELUM_TERAKREDITASI` — peringkat yang sedang berlaku |
| `nomor_sk_akreditasi` | string (nullable) | Nomor SK peringkat yang berlaku; kosong bila belum terakreditasi |
| `berlaku_sampai_akreditasi` | date (nullable) | Akhir masa berlaku; kosong bila belum terakreditasi |

> **Catatan desain — kenapa identitas akreditasi ada di sini.** Enam kolom terakhir ditambahkan bersama Dashboard Prodi (`docs/application_flow.md` §5.1). Sebelumnya `PROGRAM_STUDI` hanya menyimpan `nama`, sehingga halaman level prodi tidak punya bahan untuk bicara tentang prodinya sendiri dan mau tak mau kembali jadi daftar dokumen.
>
> Yang **tidak** ikut ditambahkan: sisa masa berlaku dan status "mendekati kedaluwarsa". Keduanya diturunkan saat render dari `berlaku_sampai_akreditasi`, mengikuti alasan yang sama dengan status bab di §6.1a — nilai tersimpan yang bergantung pada waktu berjalan pasti basi, dan menjaganya tetap segar butuh pekerjaan terjadwal yang tidak sepadan dengan manfaatnya.
>
> `BELUM_TERAKREDITASI` sengaja punya makna berbeda dari masa berlaku yang habis: prodi baru belum pernah punya peringkat, sedangkan prodi kedaluwarsa pernah punya dan harus segera memperbarui. Karena itu `berlaku_sampai_akreditasi` boleh kosong, dan tampilan tidak boleh memperlakukan kosong sebagai keterlambatan.

### Relasi
- Satu program studi dimiliki oleh satu `TENANT`.
- Satu program studi dapat ditempati banyak `USER` (khusus role `PENYUSUN`, lewat `program_studi_id`).
- Satu program studi memiliki banyak `DOKUMEN_LED`.
- Satu program studi dapat memiliki `BUKTI_DUKUNG` miliknya sendiri.

### Fitur terkait
- **Struktur organisasi**: `ADMIN` dan `PIMPINAN` bisa membuat daftar program studi di bawah universitasnya.
- **Pemisahan ruang kerja**: dokumen LED dan bukti dukung level prodi hanya terlihat oleh user yang berwenang atas prodi tersebut.

---

## Kelompok: Dokumen LED

## 4. DOKUMEN_LED

### Deskripsi
`DOKUMEN_LED` merepresentasikan satu dokumen Laporan Evaluasi Diri untuk suatu program studi pada tahun akademik tertentu. Satu prodi bisa punya beberapa `DOKUMEN_LED` seiring waktu (misal untuk siklus akreditasi berbeda).

### Konteks pengguna
Ini adalah "pintu masuk" ke ruang kerja khusus — begitu user mengklik salah satu Dokumen LED dari daftar/dashboard, aplikasi membuka tampilan terpisah (sidebar berbeda dari dashboard utama) yang fokus sepenuhnya pada dokumen ini: progres bab, bukti dukung, dan editor.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik dokumen |
| `program_studi_id` | string (FK) | Prodi pemilik dokumen ini |
| `judul` | string | Judul dokumen LED |
| `tahun_akademik` | string | Contoh: "2026/2027" |
| `status_keseluruhan` | string | `DRAFT` \| `REVIEW` \| `SELESAI` — status agregat seluruh dokumen |
| `tenggat` | date (nullable) | Target internal kapan dokumen ini harus selesai; kosong berarti tidak dipatok |

> **Catatan desain — tenggat di dokumen, bukan di prodi.** PRD §3.1 menyebut "tenggat waktu (opsional)" tapi tidak pernah menetapkan tempatnya. Diletakkan di sini karena masa berlaku akreditasi prodi jaraknya tahunan dan tidak berubah tiap siklus, sedangkan yang mendorong kerja sehari-hari adalah target penyelesaian dokumen yang sedang berjalan — dua hal berbeda yang keduanya tetap ditampilkan berdampingan di Dashboard Prodi (§5.1).
>
> Kosong berarti **tidak dipatok**, bukan "tenggatnya hari ini". Tampilan tidak boleh menghitungnya sebagai keterlambatan, dan barisnya tidak dirender sama sekali alih-alih diisi "—".

> **Catatan desain — tidak ada kolom "siklus aktif".** Dashboard Prodi perlu tahu dokumen mana yang sedang dikerjakan, tapi itu diturunkan (`status_keseluruhan != SELESAI` dengan `tahun_akademik` terbesar), bukan disimpan. Kolom `is_aktif` akan jadi sumber kebenaran kedua yang bisa tidak sinkron dengan `status_keseluruhan` — dokumen bisa tertandai aktif padahal sudah `SELESAI`. Alasannya sama dengan status bab di §6.1a.

### Relasi
- Satu dokumen LED dimiliki oleh satu `PROGRAM_STUDI`.
- Satu dokumen LED terdiri dari banyak `BAB_DOKUMEN`.

### Fitur terkait
- **Inisiasi dokumen baru**: memulai siklus penyusunan akreditasi, biasanya sekaligus membuat baris-baris `BAB_DOKUMEN` sesuai struktur bab standar LAM Teknik.
- **Dashboard progres**: `status_keseluruhan` dipakai untuk menampilkan ringkasan progres ke Pimpinan/Penjamin Mutu tanpa perlu membuka detail tiap bab.

---

## 5. BAB_DOKUMEN

### Deskripsi
`BAB_DOKUMEN` merepresentasikan satu bab dalam dokumen LED (misal "Bab 1: Visi Misi", "Bab 2: Tata Pamong", dst). Ini adalah unit kerja utama tempat Penyusun/Penjamin Mutu menulis dan meng-generate konten, dan tempat Penjamin Mutu melakukan review dan penguncian.

### Konteks pengguna
Ini adalah **kondisi aktif/terkini** dari sebuah bab — semua yang sedang dikerjakan (tulisan, bukti dukung yang dipakai, skor simulasi) hidup di sini dan **terus ditimpa** setiap kali ada aksi baru. Kalau user ingin mengamankan suatu kondisi supaya tidak tertimpa, mereka membuat checkpoint (`BAB_DRAFT`).

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik bab |
| `dokumen_id` | string (FK) | Dokumen LED induk |
| `urutan_bab` | int | Urutan tampil bab, misal 1, 2, 3 — juga dipakai sebagai acuan pencocokan ke rubrik dan panduan (lihat kelompok Skoring & Panduan Referensi) |
| `judul_bab` | string | Contoh: "Visi Misi" |
| `konten_kerja` | jsonb | Konten aktif yang sedang dikerjakan; **selalu ditimpa otomatis** setiap kali ada perubahan (autosave) |
| `checkpoint_aktif_id` | string (FK, nullable) | Menunjuk ke `BAB_DRAFT` mana yang terakhir jadi acuan/basis `konten_kerja` (misal setelah melakukan restore) |
| `terkunci` | boolean | `true` jika Penjamin Mutu sedang mengunci bab ini untuk direview — saat terkunci, **tidak seorang pun** (termasuk Penjamin Mutu yang menguncinya sendiri) bisa mengubah `konten_kerja`, bukti dukung terpakai, atau membuat checkpoint baru, sampai kunci dibuka kembali |
| `catatan_penjamin_mutu` | string | Catatan/masukan dari Penjamin Mutu terhadap isi bab |
| `terakhir_disimpan` | datetime | Waktu autosave terakhir |

### Relasi
- Satu bab dimiliki oleh satu `DOKUMEN_LED`.
- Satu bab memiliki banyak `BAB_DRAFT` (checkpoint).
- Satu bab terhubung ke bukti dukung yang **sedang dipakai** lewat `BUKTI_DUKUNG_BAB` (kondisi aktif, ditimpa tiap generate ulang).
- Satu bab memiliki hasil skor aktif lewat `HASIL_SKOR_KRITERIA` (`target_tipe = BAB_AKTIF`).

### Fitur terkait
- **Editor autosave**: setiap perubahan di editor bab langsung menimpa `konten_kerja` tanpa aksi simpan manual.
- **Generate konten & pemilihan bukti dukung**: saat Penyusun/Penjamin Mutu memilih bukti dukung lalu generate ulang, baris lama di `BUKTI_DUKUNG_BAB` untuk bab ini dihapus dan diganti baris baru sesuai pilihan terkini — mengikuti pola "kondisi aktif selalu ditimpa" yang sama seperti `konten_kerja`.
- **Simulasi skor**: hasil simulasi disimpan ke `HASIL_SKOR_KRITERIA` dengan `target_tipe = BAB_AKTIF`; setiap kali disimulasikan ulang, baris skor lama untuk bab ini ditimpa dengan hasil baru.
- **Checkpoint manual**: sewaktu-waktu bisa membuat checkpoint sebelum melakukan perubahan besar, agar kondisi aktif saat ini (konten + bukti dukung + skor) diamankan sebagai snapshot permanen.
- **Restore ke checkpoint lama**: `konten_kerja` ditimpa dengan `konten_snapshot` dari checkpoint yang dipilih, dan `checkpoint_aktif_id` diperbarui. Checkpoint lama tetap tersimpan (tidak dihapus, tidak membuat checkpoint baru otomatis).
- **Kunci review oleh Penjamin Mutu**: mencegah perubahan apa pun pada kondisi aktif bab selama proses review, berlaku untuk semua role tanpa kecuali.

---

## 6. BAB_DRAFT

### Deskripsi
`BAB_DRAFT` merepresentasikan satu **checkpoint** (snapshot) dari kondisi bab pada waktu tertentu — bukan hanya kontennya, tapi juga bukti dukung yang dipakai dan hasil skornya saat itu. Berbeda dari kondisi aktif yang terus berubah, seluruh data yang menempel pada satu checkpoint bersifat **immutable** (kecuali skornya, lihat catatan di bawah).

### Konteks pengguna
Ini adalah "titik pulih" — daftar riwayat versi suatu bab yang bisa ditinjau ulang atau dijadikan dasar untuk kembali (restore) jika hasil pengeditan/generate terbaru dianggap tidak lebih baik dari versi sebelumnya.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik checkpoint |
| `bab_id` | string (FK) | Bab yang menjadi induk checkpoint ini |
| `dibuat_oleh_user_id` | string (FK) | User yang membuat checkpoint (memicu generate AI maupun menyimpan manual) |
| `versi` | int | Nomor urut checkpoint, bertambah setiap kali checkpoint baru dibuat untuk bab yang sama |
| `label` | string | Nama checkpoint yang opsional diberikan user, misal "Sebelum revisi PM" |
| `konten_snapshot` | jsonb | Salinan `konten_kerja` pada saat checkpoint dibuat; **tidak pernah berubah** setelahnya |
| `sumber` | string | `AI` \| `MANUAL` — menandai apakah checkpoint ini hasil generate AI atau disimpan manual oleh user |
| `referensi_chunk_ids` | text | Opsional; daftar ID *chunk* dari vector database eksternal (RAG) yang menjadi rujukan saat AI menghasilkan konten ini |
| `dibuat_pada` | datetime | Waktu checkpoint dibuat |

### Relasi
- Satu checkpoint dimiliki oleh satu `BAB_DOKUMEN`.
- Satu checkpoint dibuat oleh satu `USER`.
- Satu checkpoint mengacu ke bukti dukung yang dipakai saat itu lewat `BUKTI_DUKUNG_DRAFT` — dibuat sekali saat checkpoint terbentuk, **permanen**.
- Satu checkpoint memiliki hasil skor lewat `HASIL_SKOR_KRITERIA` (`target_tipe = BAB_DRAFT`).

### Fitur terkait
- **Generasi konten AI**: saat user memilih bukti dukung lalu menekan tombol *generate*, sistem mencari *chunk* relevan (panduan LAM Teknik, LKPS, rubrik, dan bukti dukung terpilih) di vector database eksternal, menghasilkan teks, lalu **menyimpannya sebagai `BAB_DRAFT` baru** dengan `sumber = AI`, `referensi_chunk_ids` terisi, dan baris `BUKTI_DUKUNG_DRAFT` dibuat sesuai bukti dukung yang dipakai.
- **Checkpoint manual**: user juga bisa membuat checkpoint tanpa AI (`sumber = MANUAL`).
- **Riwayat versi & pemulihan**: daftar `BAB_DRAFT` per bab, diurutkan berdasarkan `versi`, memungkinkan user melihat riwayat dan memilih untuk memulihkan (`restore`) salah satu versi ke `konten_kerja` bab induknya.
- **Skor checkpoint yang menempel permanen**: begitu checkpoint dibuat dan disimulasikan, hasil skornya tersimpan di `HASIL_SKOR_KRITERIA` dengan `target_tipe = BAB_DRAFT`. Karena `konten_snapshot` tidak pernah berubah, secara desain skor checkpoint idealnya juga tidak perlu di-run ulang — namun jika user tetap menjalankannya lagi, sistem **menimpa** baris skor lama (bukan menambah baris baru), mengikuti kebijakan "main timpa" yang berlaku konsisten di seluruh sistem.
- **Traceability**: `referensi_chunk_ids`, `BUKTI_DUKUNG_DRAFT`, dan `HASIL_SKOR_KRITERIA` bersama-sama memberi jejak audit lengkap — dari sumber mana suatu draf AI dihasilkan dan berapa skornya saat itu, penting untuk pertanggungjawaban isi dokumen akreditasi.

---

## Kelompok: Bukti Dukung

## 7. BUKTI_DUKUNG

### Deskripsi
`BUKTI_DUKUNG` merepresentasikan satu berkas bukti pendukung (dokumen, sertifikat, SK, dsb) yang diunggah ke platform untuk dijadikan rujukan penyusunan maupun bahan generasi konten AI. Bukti dukung dapat dimiliki di level universitas (berlaku lintas prodi) atau di level satu program studi saja.

### Konteks pengguna
Ini adalah "perpustakaan" bukti — dikelola di dua tempat berbeda sesuai levelnya: perpustakaan level tenant (dashboard utama, diakses Pimpinan & Penjamin Mutu) dan perpustakaan level prodi (dashboard project LED, diakses Pimpinan, Penjamin Mutu, dan Penyusun). Saat generate konten di editor bab, daftar bukti dukung yang muncul untuk dipilih adalah gabungan keduanya (bukti tenant + bukti prodi terkait).

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik bukti dukung |
| `owner_tipe` | string | `TENANT` \| `PROGRAM_STUDI` — menentukan level kepemilikan |
| `tenant_id` | string (FK, nullable) | Diisi jika `owner_tipe = TENANT` |
| `program_studi_id` | string (FK, nullable) | Diisi jika `owner_tipe = PROGRAM_STUDI` |
| `nama_dokumen` | string | Contoh: "SK_Rektor_2026.pdf" |
| `file_url` | string | **Object key** di object storage (Cloudflare R2), misal `tenant/1721-SK_Rektor_2026.pdf` — bukan URL publik. Tautan unduh dibuat sesaat (presigned) ketika dibutuhkan |
| `tipe_file` | string | PDF, JPG, dll |
| `ukuran_bytes` | int | Ukuran berkas; dipakai UI untuk menampilkan ukuran dan menegakkan batas unggah |
| `status_ekstraksi` | string | `MENUNGGU` \| `DIPROSES` \| `SIAP` \| `GAGAL` — tahap pipeline ekstraksi teks/OCR (PRD §3.3). Bukti dukung baru bisa dipakai sebagai konteks AI setelah `SIAP` |
| `catatan_gagal` | string (nullable) | Alasan singkat saat `status_ekstraksi = GAGAL`, ditampilkan ke user beserta tombol coba lagi |
| `diunggah_oleh_user_id` | string (FK) | User yang mengunggah; dipakai jejak audit (PRD §2.1) sekaligus penentu hak hapus bagi `PENYUSUN` |
| `waktu_diunggah` | datetime | Waktu file diunggah |

> **Catatan desain — unggahan lewat presigned URL.** Berkas tidak melewati server aplikasi: frontend meminta presigned URL ke backend, mengunggah langsung ke R2, lalu melapor balik. Baris `BUKTI_DUKUNG` baru dibuat pada langkah pelaporan itu — dengan `status_ekstraksi = MENUNGGU` — sehingga tidak ada baris menggantung untuk unggahan yang gagal di tengah jalan. Unggahan bersifat batch (banyak berkas sekaligus), tapi tiap berkas berdiri sendiri: satu berkas gagal tidak menggugurkan sisanya.

> **Catatan desain**: `owner_tipe` bersama dua kolom FK nullable digunakan (bukan satu kolom polymorphic) agar integritas foreign key tetap terjaga oleh database. Perlu *constraint* di level aplikasi/`CHECK` agar hanya salah satu dari `tenant_id` atau `program_studi_id` yang terisi sesuai `owner_tipe`. Filter isolasi antar prodi (agar Prodi A tidak melihat bukti dukung Prodi B) ditegakkan lewat query terpusat berdasarkan kombinasi `owner_tipe` + `tenant_id`/`program_studi_id`, bukan lewat tabel terpisah per prodi.

### Relasi
- Bukti dukung level tenant dimiliki oleh satu `TENANT`; bukti dukung level prodi dimiliki oleh satu `PROGRAM_STUDI`.
- Satu bukti dukung dapat sedang dipakai di banyak `BAB_DOKUMEN` lewat `BUKTI_DUKUNG_BAB`.
- Satu bukti dukung dapat tercatat dipakai di banyak `BAB_DRAFT` lewat `BUKTI_DUKUNG_DRAFT`.

### Fitur terkait
- **Manajemen bukti dukung**: `PIMPINAN` dan `PENJAMIN_MUTU` bisa upload di level tenant maupun prodi; `PENYUSUN` hanya bisa upload di level prodi tempatnya ditugaskan; `ADMIN` tidak punya akses ke bukti dukung sama sekali.
- **Perpustakaan bukti dukung bersama**: bukti dukung level tenant (misal Statuta, Renstra Universitas) bisa dipakai berulang oleh banyak prodi tanpa perlu diunggah ulang.
- **Pemilihan bukti dukung sebagai konteks generate**: sebelum menekan tombol generate di suatu bab, user memilih satu atau lebih `BUKTI_DUKUNG` yang relevan; pilihan ini menjadi dasar pencarian semantik (RAG) untuk menyusun konten bab.
- **Ekstraksi asinkron & coba ulang**: setelah unggahan dilaporkan, backend mengantrekan ekstraksi teks/OCR dan memperbarui `status_ekstraksi`. Kegagalan tidak menghapus barisnya — berkas tetap tampil dengan status `GAGAL` beserta `catatan_gagal`, dan user berwenang bisa memicu ekstraksi ulang tanpa mengunggah berkasnya lagi.
- **Hapus bukti dukung**: `PIMPINAN` dan `PENJAMIN_MUTU` boleh menghapus bukti dukung apa pun di cakupannya; `PENYUSUN` hanya boleh menghapus berkas yang ia unggah sendiri (dicocokkan lewat `diunggah_oleh_user_id`).

---

## 8. BUKTI_DUKUNG_BAB

### Deskripsi
Tabel penghubung *many-to-many* antara `BUKTI_DUKUNG` dan `BAB_DOKUMEN`. Mencatat bukti dukung mana saja yang **sedang dipakai/dipilih** untuk kondisi aktif (`konten_kerja`) suatu bab — bukan lampiran final permanen.

### Konteks pengguna
Isi tabel ini mencerminkan "apa yang sedang dijadikan rujukan saat ini" untuk bab tersebut, sejalan dengan sifat `konten_kerja` yang terus berubah — begitu user generate ulang dengan pilihan bukti dukung berbeda, baris-baris lama di sini dihapus dan diganti yang baru.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik baris relasi |
| `bukti_dukung_id` | string (FK) | Bukti dukung yang dikaitkan |
| `bab_dokumen_id` | string (FK) | Bab yang dikaitkan |

### Relasi
- Menghubungkan satu `BUKTI_DUKUNG` ke satu `BAB_DOKUMEN`, dengan kardinalitas many-to-many secara keseluruhan.

### Fitur terkait
- **Konteks generate aktif**: saat user membuka editor bab, daftar ini menunjukkan bukti dukung apa yang jadi dasar `konten_kerja` saat ini.
- **Ditimpa tiap generate ulang**: berbeda dari `BUKTI_DUKUNG_DRAFT` yang permanen menempel ke satu checkpoint, baris di tabel ini berumur mengikuti kondisi aktif bab — silih berganti setiap kali bukti dukung yang dipilih berubah.

---

## 9. BUKTI_DUKUNG_DRAFT

### Deskripsi
Tabel penghubung *many-to-many* antara `BUKTI_DUKUNG` dan `BAB_DRAFT`. Mencatat bukti dukung apa saja yang **dipilih user sebagai sumber** saat suatu checkpoint (baik hasil generate AI maupun manual) dibuat — sekali tercatat, **permanen** menempel pada checkpoint tersebut.

### Konteks pengguna
Ini adalah bagian dari "arsip" satu checkpoint — memungkinkan user melihat kembali, bertahun kemudian, bukti dukung apa yang dipakai saat suatu versi bab tertentu dihasilkan, tanpa terpengaruh perubahan bukti dukung yang dipilih di kondisi aktif setelahnya.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik baris relasi |
| `bukti_dukung_id` | string (FK) | Bukti dukung yang dipakai sebagai sumber |
| `bab_draft_id` | string (FK) | Checkpoint yang dihasilkan dari bukti dukung tersebut |

### Relasi
- Menghubungkan satu `BUKTI_DUKUNG` ke satu `BAB_DRAFT`, many-to-many secara keseluruhan.

### Fitur terkait
- **Traceability generasi AI**: menjawab "checkpoint versi ke berapa dihasilkan dari bukti dukung apa saja?" — penting untuk transparansi dan pertanggungjawaban isi LED saat diperiksa asesor.
- **Riwayat pemilihan bukti dukung**: memungkinkan user membandingkan pilihan bukti dukung antar checkpoint berbeda.

---

## Kelompok: Skoring (Simulasi Penilaian)

## 10. RUBRIK_KRITERIA

### Deskripsi
`RUBRIK_KRITERIA` adalah **master data global** yang berisi daftar kriteria penilaian resmi LAM Teknik. Karena seluruh tenant memakai skema akreditasi yang sama (fokus LAM Teknik), tabel ini tidak terikat ke tenant mana pun — diisi sekali (di-*seed* saat development) dan dipakai bersama oleh semua universitas.

### Konteks pengguna
User (Penjamin Mutu atau Penyusun) tidak mengelola tabel ini langsung — mereka hanya melihat hasilnya lewat fitur "Simulasi Skor" di editor bab. Daftar kriteria di sini yang menentukan berapa banyak butir penilaian akan muncul saat simulasi dijalankan untuk suatu bab.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik kriteria |
| `kode_kriteria` | string | Kode sesuai rubrik asli, misal "C1", "4.1a" |
| `deskripsi` | string | Bunyi kriteria/pertanyaan penilaian |
| `skor_maksimal` | int | Skor tertinggi yang mungkin didapat untuk kriteria ini (bisa berbeda tiap kriteria) |

> **Celah yang ditemukan saat tab Rubrik dibangun — `level_skor` belum ada.**
>
> `docs/application_flow.md §9.1` menuntut tab Rubrik menampilkan tiap kriteria "**dengan deskripsi tiap level skor**", tapi tabel di atas tidak punya tempat untuk menyimpannya: yang ada hanya bunyi kriteria dan angka tertingginya. Tanpa data itu, penyusun cuma melihat "3 dari 4" tanpa tahu apa yang membedakan skor 3 dari skor 4 — padahal justru itu gunanya rubrik.
>
> Implementasinya menambahkan **`level_skor`**, satu baris per level: `{ skor: int, deskripsi: text }`. Di kode ia jadi larik pada `RubricCriterion` (`features/chapter/domain/entities/rubric-criterion.entity.ts`); saat pindah ke basis data ia wajar jadi tabel `RUBRIK_LEVEL` tersendiri (`kriteria_id`, `skor`, `deskripsi`), sejajar dengan pemecahan `PANDUAN_REFERENSI` → `PANDUAN_DETAIL`.
>
> **`skor_maksimal` sebaiknya ikut dibuang saat itu.** Ia bisa diturunkan dari `level_skor` (nilai `skor` tertinggi), dan menyimpannya terpisah membuka kemungkinan `skor_maksimal = 5` pada kriteria yang cuma punya empat level — kesalahan yang tidak akan pernah tertangkap siapa pun. Alasan yang sama sudah dipakai `BAB_DOKUMEN` untuk tidak menyimpan kolom status. Di kode ia sudah diturunkan lewat `skorMaksimal(kriteria)`.
>
> Skala 1–4 yang dipakai seluruh kriteria contoh **bukan** aturan sistem: bentuknya tetap mengizinkan kriteria dengan jumlah level berbeda, sesuai kalimat "bisa berbeda tiap kriteria" di baris `skor_maksimal`.

### Relasi
- Satu kriteria dapat berlaku untuk banyak nomor bab lewat `RUBRIK_KRITERIA_BAB`.
- Satu kriteria dapat memiliki banyak `HASIL_SKOR_KRITERIA` (satu per setiap kali bab/checkpoint disimulasikan).

### Fitur terkait
- **Sumber acuan simulasi skor**: saat user menjalankan simulasi pada suatu bab, sistem mengambil semua `RUBRIK_KRITERIA` yang terkait dengan nomor bab tersebut (lewat `RUBRIK_KRITERIA_BAB`), lalu meminta AI menilai `konten_kerja`/`konten_snapshot` bab terhadap tiap kriteria itu.
- **Bab tanpa kriteria = tidak ada hasil skor**: jika suatu nomor bab tidak punya baris terkait di `RUBRIK_KRITERIA_BAB`, maka simulasi skor untuk bab itu otomatis kosong/tidak berlaku.

---

## 11. RUBRIK_KRITERIA_BAB

### Deskripsi
Tabel penghubung *many-to-many* antara `RUBRIK_KRITERIA` dan **nomor bab standar** LED. Satu kriteria bisa relevan untuk lebih dari satu bab, dan satu bab bisa dinilai oleh lebih dari satu kriteria.

### Konteks pengguna
Tabel ini murni infrastruktur di balik layar — menentukan kriteria mana saja yang muncul saat user menjalankan simulasi skor pada bab tertentu.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik baris relasi |
| `kriteria_id` | string (FK) | Kriteria yang dikaitkan |
| `urutan_bab` | string/int | Nomor bab standar yang relevan (mengacu ke `BAB_DOKUMEN.urutan_bab`, bukan FK langsung ke instance bab tertentu — karena ini master data global yang berlaku sebelum ada satu pun `DOKUMEN_LED` dibuat) |

> **Catatan desain**: `urutan_bab` **bukan** foreign key ke `BAB_DOKUMEN.id`. Ia hanya angka pencocok (matching key) — saat sistem butuh kriteria untuk bab urutan ke-2 di prodi/dokumen manapun, query-nya `WHERE urutan_bab = 2`, bukan JOIN by ID.

### Relasi
- Menghubungkan satu `RUBRIK_KRITERIA` ke satu nomor bab, many-to-many secara keseluruhan.

### Fitur terkait
- **Pencocokan kriteria ke bab**: memungkinkan satu kriteria dipakai untuk menilai beberapa bab berbeda (jika memang relevan di rubrik asli), dan satu bab dinilai oleh gabungan banyak kriteria sekaligus.

---

## 12. HASIL_SKOR_KRITERIA

### Deskripsi
`HASIL_SKOR_KRITERIA` menyimpan **hasil transaksional** dari simulasi skor — satu baris per kriteria, per target (bab aktif atau checkpoint tertentu), setiap kali simulasi dijalankan.

### Konteks pengguna
Inilah yang benar-benar ditampilkan ke user di halaman editor bab: breakdown skor per kriteria beserta total (dihitung *on-the-fly* dengan menjumlah baris-baris terkait, tidak disimpan sebagai field agregat terpisah). Hanya `PENJAMIN_MUTU` dan `PENYUSUN` yang bisa menjalankan simulasi; `PIMPINAN` hanya bisa melihat hasilnya (read-only).

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik baris hasil skor |
| `kriteria_id` | string (FK) | Kriteria yang dinilai, mengacu ke `RUBRIK_KRITERIA` |
| `target_tipe` | string | `BAB_AKTIF` \| `BAB_DRAFT` — menentukan target yang dinilai |
| `bab_id` | string (FK, nullable) | Diisi jika `target_tipe = BAB_AKTIF` |
| `bab_draft_id` | string (FK, nullable) | Diisi jika `target_tipe = BAB_DRAFT` |
| `skor_didapat` | int | Skor yang diberikan untuk kriteria ini pada simulasi tersebut |
| `justifikasi` | text | Opsional, alasan/narasi kenapa mendapat skor segini (misal dari AI) |
| `dijalankan_oleh_user_id` | string (FK) | User yang menjalankan simulasi |
| `dijalankan_pada` | datetime | Waktu simulasi dijalankan |

### Relasi
- Satu baris hasil skor mengacu ke satu `RUBRIK_KRITERIA`.
- Satu baris hasil skor menempel ke **salah satu** dari `BAB_DOKUMEN` (kondisi aktif) atau `BAB_DRAFT` (checkpoint), sesuai `target_tipe`.

### Fitur terkait
- **Simulasi untuk bab aktif**: setiap kali dijalankan ulang pada `konten_kerja` yang sama atau sudah berubah, seluruh baris lama untuk `bab_id` tersebut **dihapus lalu diganti** baris baru — mengikuti pola "ditimpa" seperti `konten_kerja` dan `BUKTI_DUKUNG_BAB`.
- **Simulasi untuk checkpoint**: dibuat sekali saat checkpoint pertama kali disimulasikan. Karena `konten_snapshot` checkpoint tidak berubah, hasil skor idealnya juga tidak perlu di-*run* ulang — tapi jika user tetap menjalankannya lagi (misal karena `RUBRIK_KRITERIA` sendiri diperbarui), baris lama untuk `bab_draft_id` tersebut **ditimpa** dengan hasil baru (bukan disimpan sebagai riwayat berlapis).
- **Total skor per bab**: dihitung on-the-fly di aplikasi dengan menjumlah/merata-rata seluruh `skor_didapat` untuk `bab_id`/`bab_draft_id` yang sama — tidak disimpan sebagai kolom terpisah agar skema tetap sederhana.

---

## 12a. Skor RAGAS — belum punya tempat di skema ini

> **Celah yang ditemukan saat tab "Kualitas AI" dibangun.**
>
> Dokumen ini memuat lima belas tabel, dan **tidak satu pun menyimpan skor RAGAS** — padahal `docs/architecture.md §5.2` langkah 5 menuliskan hasilnya ditulis ke PostgreSQL bersama `konten_kerja` dan `BUKTI_DUKUNG_BAB`, dan `§5.4` menegaskan ia dihitung FastAPI di dalam siklus job Content Generation yang sama. Jadi datanya memang ada di alur, tapi belum pernah dirancang tempatnya.
>
> Berbeda dari `HASIL_SKOR_KRITERIA` yang menilai kelayakan bab terhadap rubrik akreditasi, metrik ini menilai **mutu kerja AI-nya sendiri**. Keduanya bisa berlawanan: jawaban yang sangat setia pada sumber tetap bisa berskor rubrik rendah kalau sumbernya memang belum memadai.
>
> **Bentuk yang dipakai implementasi** — satu objek per target, bukan satu baris per metrik:
>
> | Field | Tipe | Keterangan |
> |---|---|---|
> | `metrik` | jsonb | Larik `{ metrik, nilai, alasan }`. `metrik` salah satu dari `faithfulness` \| `response_relevancy` \| `context_precision`; `nilai` 0–1 sesuai rentang bawaan Ragas; `alasan` adalah `reason` dari penilainya |
> | `jumlah_chunk` | int | Berapa potongan konteks yang ikut dinilai |
> | `dihitung_pada` | datetime | Distempel **sama persis** dengan `terakhir_disimpan` saat generate, supaya penanda "isi sudah berubah sejak dinilai" tidak menyala palsu |
>
> **`context_recall` sengaja tidak ada.** Metrik itu menuntut `reference` — jawaban acuan yang dianggap benar — dan LED tidak punya itu: justru dokumen inilah yang sedang disusun, tidak ada versi "yang benar" untuk diperbandingkan.
>
> **Di mana ia menempel.** Mengikuti pola "kondisi aktif vs checkpoint" yang berlaku di seluruh dokumen ini: kolom `ragas` pada **`BAB_DOKUMEN`** (ditimpa tiap generate, `null` bila isinya tidak lahir dari generate) dan kolom `ragas` pada **`BAB_DRAFT`** (salinan permanen, tidak pernah basi). Kalau kelak metriknya bertambah atau perlu di-query lintas bab, bentuk ini wajar dipecah jadi tabel `HASIL_RAGAS` dengan `target_tipe`/`bab_id`/`bab_draft_id` — persis seperti `HASIL_SKOR_KRITERIA`.
>
> Salinan ke checkpoint **tidak** ditentukan oleh `BAB_DRAFT.sumber`, melainkan oleh apakah isi yang di-snapshot memang pernah dinilai: checkpoint `MANUAL` dari tulisan yang tadinya digenerate mewarisi skornya secara sah, dan yang ditulis tangan otomatis `null` tanpa perlu aturan tambahan.

---

## Kelompok: Panduan Referensi (Master Data RAG)

## 13. PANDUAN_REFERENSI

### Deskripsi
`PANDUAN_REFERENSI` adalah **master data global** yang menyimpan metadata dokumen sumber resmi — panduan penyusunan LED LAM Teknik, template LKPS, dan dokumen rubrik penilaian. Sama seperti `RUBRIK_KRITERIA`, tabel ini di-*seed* sekali saat development, tidak dikelola lewat UI aplikasi oleh user mana pun, dan berlaku untuk semua tenant.

### Konteks pengguna
User tidak pernah membuka tabel ini secara langsung — perannya di balik layar, sebagai referensi file asli yang menjadi sumber pemecahan konten di `PANDUAN_DETAIL`, dan dipakai sistem RAG saat men-generate konten bab.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik dokumen panduan |
| `tipe` | string | `PANDUAN_LAM` \| `TEMPLATE_LKPS` \| `DOKUMEN_RUBRIK` |
| `judul` | string | Contoh: "Panduan Penyusunan LED LAM Teknik 2024" |
| `file_url` | string | Lokasi file asli (S3/lokal), untuk arsip/unduh utuh |
| `tipe_file` | string | PDF, DOCX, dll |
| `dibuat_pada` | datetime | Waktu data ini di-seed/diunggah |

> **Catatan**: Struktur khusus untuk LKPS (yang cenderung berupa data terstruktur/tabel angka, bukan teks naratif) belum final — kemungkinan tetap masuk sistem RAG dengan pendekatan berbeda, dan akan dibahas terpisah.

### Relasi
- Satu dokumen panduan terdiri dari banyak `PANDUAN_DETAIL`.

### Fitur terkait
- **Arsip sumber**: menyimpan jejak dokumen asli yang jadi rujukan seluruh poin di `PANDUAN_DETAIL`, memudahkan audit "poin ini berasal dari dokumen resmi yang mana".

---

## 14. PANDUAN_DETAIL

### Deskripsi
`PANDUAN_DETAIL` adalah pemecahan `PANDUAN_REFERENSI` menjadi poin-poin granular — satu baris per bagian/poin panduan, supaya sistem RAG bisa merujuk poin spesifik (bukan seluruh dokumen sekaligus) saat men-generate konten.

### Konteks pengguna
Sama seperti `PANDUAN_REFERENSI`, tabel ini bekerja di balik layar. Isi `isi_teks` di sinilah yang sebenarnya di-*chunk* dan di-index ke vector database eksternal untuk pencarian semantik, bukan file mentah utuh.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik poin panduan |
| `panduan_id` | string (FK) | Dokumen panduan induk |
| `kode_poin` | string | Sesuai penomoran asli dokumen, misal "2.3", "IV.b" |
| `judul_poin` | string | Contoh: "Ketersediaan Dokumen Formal Visi Misi" |
| `isi_teks` | text | Isi lengkap poin panduan tersebut |

### Relasi
- Satu poin panduan dimiliki oleh satu `PANDUAN_REFERENSI`.
- Satu poin panduan dapat berlaku untuk banyak nomor bab lewat `PANDUAN_DETAIL_BAB`.

### Fitur terkait
- **Sumber RAG granular**: saat generate konten bab tertentu, sistem mencari `PANDUAN_DETAIL` yang relevan dengan nomor bab itu (lewat `PANDUAN_DETAIL_BAB`) sebagai konteks tambahan bagi AI, di samping bukti dukung yang dipilih user.

---

## 15. PANDUAN_DETAIL_BAB

### Deskripsi
Tabel penghubung *many-to-many* antara `PANDUAN_DETAIL` dan **nomor bab standar** LED — satu poin panduan bisa relevan untuk lebih dari satu bab, dan satu bab bisa dirujuk oleh banyak poin panduan sekaligus.

### Konteks pengguna
Sama seperti `RUBRIK_KRITERIA_BAB`, ini murni infrastruktur di balik layar untuk menentukan konteks panduan mana yang diikutkan saat generate konten suatu bab.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik baris relasi |
| `panduan_detail_id` | string (FK) | Poin panduan yang dikaitkan |
| `urutan_bab` | string/int | Nomor bab standar yang relevan (mengacu ke `BAB_DOKUMEN.urutan_bab`, bukan FK langsung — pola yang sama seperti `RUBRIK_KRITERIA_BAB`) |

### Relasi
- Menghubungkan satu `PANDUAN_DETAIL` ke satu nomor bab, many-to-many secara keseluruhan.

### Fitur terkait
- **Konteks RAG per bab**: memastikan AI yang men-generate konten Bab 2, misalnya, hanya diberi konteks poin-poin panduan yang memang relevan untuk Bab 2 — bukan seluruh isi panduan LAM Teknik sekaligus.

---

## Ringkasan Alur Fitur Utama

### 1. Onboarding organisasi
1. Universitas mendaftar → sistem membuat satu baris `TENANT`.
2. Sistem otomatis membuat satu `USER` dengan `role = ADMIN` untuk tenant tersebut.
3. Admin membuat struktur `PROGRAM_STUDI`, dan membuat akun `USER` lain (`PIMPINAN`, `PENJAMIN_MUTU`, `PENYUSUN`).
4. `PIMPINAN` selanjutnya yang bertugas meng-assign/memindahkan `PENYUSUN` ke prodi tertentu.

### 2. Penyusunan dokumen LED
1. `DOKUMEN_LED` baru dibuat untuk suatu tahun akademik, sekaligus baris-baris `BAB_DOKUMEN` sesuai struktur bab standar LAM Teknik.
2. `PENYUSUN`/`PENJAMIN_MUTU` mengetik langsung di editor bab → `konten_kerja` ter-*autosave* terus-menerus.

### 3. Pengelolaan bukti dukung
1. `PIMPINAN`/`PENJAMIN_MUTU` mengunggah bukti dukung di level tenant atau prodi; `PENYUSUN` hanya level prodi.
2. Bukti dukung yang dipilih untuk konteks generate tercatat di `BUKTI_DUKUNG_BAB` (kondisi aktif, ditimpa) atau `BUKTI_DUKUNG_DRAFT` (checkpoint, permanen).

### 4. Generasi konten dengan AI (RAG)
1. `PENYUSUN`/`PENJAMIN_MUTU` memilih satu/lebih `BUKTI_DUKUNG` yang relevan, lalu menekan tombol *generate*.
2. Sistem melakukan pencarian semantik terhadap `PANDUAN_DETAIL` yang relevan (berdasar nomor bab) dan bukti dukung terpilih di vector database eksternal.
3. Hasil generate disimpan sebagai `BAB_DRAFT` baru (`sumber = AI`), sekaligus mencatat `BUKTI_DUKUNG_DRAFT` yang dipakai.
4. User dapat menerima hasil tersebut (restore ke `konten_kerja`) atau membandingkannya dengan checkpoint lain.

### 5. Checkpoint & pemulihan versi
1. Sebelum perubahan besar, user membuat checkpoint (`BAB_DRAFT`) untuk mengamankan kondisi saat ini.
2. Checkpoint bersifat permanen/immutable untuk konten dan bukti dukungnya, diberi nomor `versi` berurutan.
3. Restore ke checkpoint lama menimpa `konten_kerja` bab dengan `konten_snapshot` checkpoint terpilih; checkpoint lama tetap tersimpan sebagai riwayat.

### 6. Simulasi skor
1. `PENJAMIN_MUTU`/`PENYUSUN` menjalankan simulasi pada bab aktif atau salah satu checkpoint.
2. Sistem mengambil `RUBRIK_KRITERIA` yang relevan (berdasar nomor bab) lewat `RUBRIK_KRITERIA_BAB`, menilai konten terhadap tiap kriteria, dan menyimpan hasilnya di `HASIL_SKOR_KRITERIA`.
3. Untuk bab aktif: hasil lama ditimpa tiap re-run. Untuk checkpoint: hasil dibuat sekali, tapi tetap bisa ditimpa jika di-run ulang secara manual.
4. `PIMPINAN` bisa melihat hasil skor (read-only), tidak bisa menjalankan simulasi.

### 7. Review & penguncian oleh Penjamin Mutu
1. `PENJAMIN_MUTU` memeriksa isi `konten_kerja` dan riwayat `BAB_DRAFT` suatu bab.
2. `PENJAMIN_MUTU` memberi `catatan_penjamin_mutu` dan mengaktifkan `terkunci = true` — berlaku untuk semua role tanpa kecuali, termasuk dirinya sendiri.
3. Setelah review selesai, `PENJAMIN_MUTU` membuka kembali kunci (`terkunci = false`) agar pengerjaan bisa dilanjutkan.