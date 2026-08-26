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
- [FOLDER_BUKTI](#7a-folder_bukti)
- [FOLDER_BUKTI](#7a-folder_bukti)
   - [BUKTI_DUKUNG_BAB](#8-bukti_dukung_bab)
   - [BUKTI_DUKUNG_DRAFT](#9-bukti_dukung_draft)
5. [Kelompok: Skoring (Simulasi Penilaian)](#kelompok-skoring-simulasi-penilaian)
   - [RUBRIK_KRITERIA](#10-rubrik_kriteria)
   - [RUBRIK_LEVEL](#10a-rubrik_level)
   - [RUBRIK_KRITERIA_BAB](#11-rubrik_kriteria_bab)
   - [HASIL_SKOR_KRITERIA](#12-hasil_skor_kriteria)
   - [Skor RAGAS — belum punya tempat di skema ini](#12a-skor-ragas--belum-punya-tempat-di-skema-ini)
6. [Kelompok: Panduan Referensi (Master Data RAG)](#kelompok-panduan-referensi-master-data-rag)
   - [PANDUAN_REFERENSI](#13-panduan_referensi)
   - [PANDUAN_DETAIL](#14-panduan_detail)
   - [PANDUAN_DETAIL_BAB](#15-panduan_detail_bab)
7. [Ringkasan Alur Fitur Utama](#ringkasan-alur-fitur-utama)
8. [Kelompok: AI-LED — Generasi & Evaluasi (prototipe)](#kelompok-ai-led--generasi--evaluasi-prototipe)
   - [drafts](#16-drafts)
   - [chat_messages](#17-chat_messages)
   - [eval_results](#18-eval_results)
9. [Kelompok: AMI Assessment (prototipe)](#kelompok-ami-assessment-prototipe)
   - [assessment_sessions](#19-assessment_sessions)
   - [indicator_results](#20-indicator_results)
   - [reasoning_steps](#21-reasoning_steps)
10. [Catatan Integrasi](#catatan-integrasi)

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

Berikut dokumentasi setiap tabel, dikelompokkan dan diurutkan dari entitas tertinggi ke turunannya. Untuk melihat relasinya sekilas tanpa membaca seluruh dokumen ini, ada diagram di [`database-erd.md`](./database-erd.md).

### Konvensi: menyimpan nama, bukan hanya id

Beberapa tabel menyimpan **nama** di samping foreign key ke sumbernya — `BAB_DRAFT.dibuat_oleh_nama`, `BUKTI_DUKUNG.diunggah_oleh_nama`, `HASIL_SKOR_KRITERIA.dijalankan_oleh_nama`, serta `nama_dokumen`/`tipe_file` di `BUKTI_DUKUNG_BAB` dan `BUKTI_DUKUNG_DRAFT`. Ini disengaja, bukan kelalaian normalisasi.

Alasannya satu: **tabel-tabel itu arsip.** Gunanya justru menjawab "bab ini dulu disusun dari berkas apa, oleh siapa" bertahun kemudian saat diperiksa asesor. Kalau yang tersimpan cuma id, satu penghapusan user atau berkas membuat seluruh jejaknya berhenti bisa dibaca — tidak ada tempat lain di sistem yang masih tahu namanya.

Yang **tidak** ikut disalin: nilai yang berubah sepanjang umur entitasnya (`ukuran_bytes`, `status_ekstraksi`, role user). Menyalin itu berarti mengarsipkan keadaan yang langsung basi. Yang diarsipkan hanya **identitas**; keadaan terkini dibaca langsung dari sumbernya saat ditampilkan.

### Dua kelompok tambahan: skema yang sudah berjalan di prototipe

Empat kelompok di atas adalah **rancangan** — belum ada migration fisik yang men-deploy-nya, karena backend NestJS-nya sendiri belum dibuat.

Dua kelompok terakhir dokumen ini (tabel 16–21) justru kebalikannya: **sudah diimplementasikan dan berjalan**, tapi belum pernah didokumentasikan dan belum tersambung sama sekali ke skema utama. Keduanya hidup di database sendiri:

```
KELOMPOK AI-LED — GENERASI & EVALUASI
(branch led-wiriting(dimas), SQLite di /data/led.db)
drafts (kunci: section_id × model)
 |── chat_messages   (riwayat chat per section per model)
 └── eval_results    (metrik benchmark ROUGE/BLEU + RAGAS)

KELOMPOK AMI ASSESSMENT
(branch ariel, Supabase PostgreSQL + RLS)
assessment_sessions (satu baris per sekali jalan penilaian)
 |── indicator_results  (skor per indikator, FK ke sesi)
 └── reasoning_steps    (log penalaran per indikator)
```

Tabel 16–21 didokumentasikan **apa adanya sesuai kode yang berjalan**, bukan sebagai rancangan final. Selisihnya dengan skema utama dirangkum di [Catatan Integrasi](#catatan-integrasi) di bagian akhir.

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
| `dibuat_pada` | datetime | Waktu akun dibuat; ditampilkan di tabel Manajemen User |

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
- **Manajemen akun**: hanya `ADMIN` yang bisa membuat user baru dengan role apa pun di dalam tenant-nya. Khusus role `PENYUSUN`, `program_studi_id` wajib ikut ditunjuk saat pembuatan — akun Penyusun tanpa prodi tidak boleh ada, karena tidak ada satu pun halaman yang boleh ia buka (`application_flow.md` §4.2).
- **Penugasan ke prodi**: hanya `PIMPINAN` yang bisa mengubah `program_studi_id` seorang user setelah akunnya dibuat. Wewenangnya *memindahkan* Penyusun antar prodi, bukan mengaktifkan yang belum punya prodi.
- **Penghapusan prodi**: `PROGRAM_STUDI` yang masih dihuni `PENYUSUN` tidak boleh dihapus. Relasi `USER.program_studi_id` bersifat opsional sehingga default Prisma akan meng-`SetNull` penghuninya — tepat menghasilkan keadaan yang dilarang di atas.
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
| `dibuat_pada` | datetime | Waktu prodi didaftarkan; dipakai sebagai kolom urut di tabel Manajemen Program Studi |

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
| `tahun_akademik` | string | Contoh: "2026/2027". Selalu dua tahun berurutan; disusun aplikasi dari satu angka tahun, bukan diketik utuh |
| `status_keseluruhan` | string | `DRAFT` \| `REVIEW` \| `SELESAI` — status agregat seluruh dokumen |
| `tenggat` | date (nullable) | Target internal kapan dokumen ini harus selesai; kosong berarti tidak dipatok |
| `dibuat_pada` | datetime | Waktu dokumen dibuat; dipakai sebagai kolom urut di daftar Dokumen LED |

> **Catatan desain — tenggat di dokumen, bukan di prodi.** PRD §3.1 menyebut "tenggat waktu (opsional)" tapi tidak pernah menetapkan tempatnya. Diletakkan di sini karena masa berlaku akreditasi prodi jaraknya tahunan dan tidak berubah tiap siklus, sedangkan yang mendorong kerja sehari-hari adalah target penyelesaian dokumen yang sedang berjalan — dua hal berbeda yang keduanya tetap ditampilkan berdampingan di Dashboard Prodi (§5.1).
>
> Kosong berarti **tidak dipatok**, bukan "tenggatnya hari ini". Tampilan tidak boleh menghitungnya sebagai keterlambatan, dan barisnya tidak dirender sama sekali alih-alih diisi "—".

> **Catatan desain — tidak ada kolom "penyusunan aktif".** Dashboard Prodi perlu tahu dokumen mana yang sedang dikerjakan, tapi itu diturunkan (`status_keseluruhan != SELESAI` dengan `tahun_akademik` terbesar), bukan disimpan. Kolom `is_aktif` akan jadi sumber kebenaran kedua yang bisa tidak sinkron dengan `status_keseluruhan` — dokumen bisa tertandai aktif padahal sudah `SELESAI`. Alasannya sama dengan status bab di §6.1a.

> **Catatan desain — `tahun_akademik` selalu dua tahun berurutan, dan itu dijaga di hulu.** Formulir tidak pernah menerima `YYYY/YYYY` diketik utuh: yang diminta satu angka tahun mulai, sisanya disusun aplikasi (`application_flow.md` §5.3a). Karena itu `2026/2026` dan `2030/2020` tidak bisa masuk lewat formulir. Bentuk stringnya sengaja dipertahankan — urutan leksikalnya sama dengan urutan kronologis, dan itulah yang dipakai penentuan "penyusunan aktif" di catatan sebelumnya.
>
> **Belum ada unique constraint `(program_studi_id, tahun_akademik)`, dan seharusnya ada.** Aturan "satu prodi satu dokumen per tahun akademik" saat ini hanya ditegakkan di formulir, yaitu lapis yang bisa dilewati kalau data datang dari API. Dua dokumen bertahun sama membuat pemutus penyusunan aktif jatuh ke `dibuat_pada`, sehingga salah satunya tidak pernah muncul di Dashboard Prodi — tanpa error dan tanpa tanda apa pun.

### Relasi
- Satu dokumen LED dimiliki oleh satu `PROGRAM_STUDI`.
- Satu dokumen LED terdiri dari banyak `BAB_DOKUMEN`.

### Fitur terkait
- **Inisiasi dokumen baru**: memulai penyusunan dokumen akreditasi, biasanya sekaligus membuat baris-baris `BAB_DOKUMEN` sesuai struktur bab standar LAM Teknik.
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
| `catatan_penjamin_mutu` | string (nullable) | Catatan/masukan dari Penjamin Mutu terhadap isi bab; `null` berarti belum/tidak ada catatan |
| `catatan_oleh_nama` | string (nullable) | Nama penulis catatan terakhir. **Denormalisasi**, bukan FK, dengan alasan yang sama seperti `BAB_DRAFT.dibuat_oleh_nama`: catatan harus tetap terbaca setelah usernya dihapus |
| `catatan_pada` | datetime (nullable) | Waktu catatan terakhir ditulis. Bersama kolom di atas selalu bergerak mengikuti `catatan_penjamin_mutu` — ketiganya ikut dikosongkan saat catatan dicabut |
| `diajukan_review_pada` | datetime (nullable) | Kapan Penyusun menyatakan bab ini siap direview (§12.3); `null` berarti tidak sedang diantrekan. Selama terisi, **seluruh** `PENYUSUN` tidak bisa mengubah isinya — termasuk yang mengajukan — sementara `PENJAMIN_MUTU` tetap bisa. Dikosongkan otomatis begitu Penjamin Mutu merespons: mengunci bab, atau menulis `catatan_penjamin_mutu`. **Tanpa kolom pengaju** — pembekuannya berlaku untuk peran, bukan satu user, jadi tidak ada `user_id` yang perlu dibandingkan |
| `ragas` | jsonb (nullable) | Skor RAGAS kondisi aktif, bentuknya sesuai §12a. `null` bila isi bab tidak lahir dari generate. Ditimpa tiap generate |
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
| `dibuat_oleh_nama` | string | Nama pembuat checkpoint. **Denormalisasi**, bukan FK — lihat [catatan konvensi](#konvensi-menyimpan-nama-bukan-hanya-id) |
| `ragas` | jsonb (nullable) | Salinan permanen skor RAGAS saat checkpoint dibuat, bentuknya sesuai §12a. `null` bila isi yang di-snapshot memang tidak pernah dinilai |
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
| `folder_id` | string (FK, nullable) | Folder tempat berkas ini berada di [`FOLDER_BUKTI`](#7a-folder_bukti); `NULL` = di akar cakupannya. Ditambahkan bersama fitur folder (application_flow.md §4.6a) |
| `file_url` | string | **Object key** di object storage (Cloudflare R2), misal `tenant/1721-SK_Rektor_2026.pdf` — bukan URL publik. Tautan unduh dibuat sesaat (presigned) ketika dibutuhkan. **Tidak ikut berubah saat berkas dipindahkan antar folder**: folder adalah pengelompokan logis, bukan jalur penyimpanan |
| `tipe_file` | string | PDF, JPG, dll |
| `ukuran_bytes` | int | Ukuran berkas; dipakai UI untuk menampilkan ukuran dan menegakkan batas unggah |
| `status_ekstraksi` | string | `MENUNGGU` \| `DIPROSES` \| `SIAP` \| `GAGAL` — tahap pipeline ekstraksi teks/OCR (PRD §3.3). Bukti dukung baru bisa dipakai sebagai konteks AI setelah `SIAP` |
| `catatan_gagal` | string (nullable) | Alasan singkat saat `status_ekstraksi = GAGAL`, ditampilkan ke user beserta tombol coba lagi |
| `diunggah_oleh_user_id` | string (FK) | User yang mengunggah; dipakai jejak audit (PRD §2.1) sekaligus penentu hak hapus bagi `PENYUSUN` |
| `diunggah_oleh_nama` | string | Nama pengunggah. **Denormalisasi**, bukan FK — lihat [catatan konvensi](#konvensi-menyimpan-nama-bukan-hanya-id) |
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

## 7a. FOLDER_BUKTI

### Deskripsi
`FOLDER_BUKTI` merepresentasikan satu folder di dalam perpustakaan bukti dukung. Nama dan kedalamannya bebas — sarangnya dibentuk `parent_id` yang menunjuk ke barisnya sendiri, model Google Drive (application_flow.md §4.6a).

### Konteks pengguna
Menjawab [Pertanyaan Terbuka #9](./application_flow.md#16-pertanyaan-terbuka-yang-belum-diputuskan): perpustakaan yang sebelumnya datar jadi bisa dirapikan, dan satu folder di komputer penyusun bisa diunggah utuh beserta strukturnya.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik folder |
| `owner_tipe` | string | `TENANT` \| `PROGRAM_STUDI` — **sama persis dengan `BUKTI_DUKUNG`** |
| `tenant_id` | string (FK, nullable) | Diisi jika `owner_tipe = TENANT` |
| `program_studi_id` | string (FK, nullable) | Diisi jika `owner_tipe = PROGRAM_STUDI` |
| `nama` | string | Maksimal 100 karakter, tanpa garis miring. Wajib unik di antara saudara satu induk (dibandingkan tanpa peduli besar-kecil huruf) |
| `parent_id` | string (FK, nullable) | Folder induk; `NULL` = folder ini di akar cakupannya |
| `dibuat_oleh_user_id` | string (FK) | User yang membuat folder |
| `dibuat_oleh_nama` | string | **Denormalisasi**, bukan FK — lihat [catatan konvensi](#konvensi-menyimpan-nama-bukan-hanya-id) |
| `waktu_dibuat` | datetime | Waktu folder dibuat |

> **Catatan desain — kenapa tabel sendiri, bukan `BUKTI_DUKUNG` bertipe.** Godaan yang jelas adalah menambah kolom `tipe = FOLDER | BERKAS` ke `BUKTI_DUKUNG` dan memakai `parent_id` untuk keduanya. Itu ditolak karena setiap konsumen daftar bukti dukung menghitung barisnya sebagai berkas — yang paling tegas ringkasan kesiapan, yang memasukkan **setiap** baris ke salah satu ember `status_ekstraksi` lalu membaginya jadi persentase. Folder tidak punya status ekstraksi, sehingga satu folder akan terhitung sebagai dokumen yang belum siap dan menarik turun angka kesiapan institusi — kesalahan yang tidak pernah muncul sebagai error, hanya sebagai angka yang salah. Tabel terpisah membuat seluruh query kesiapan tidak perlu tahu folder itu ada.

> **Catatan desain — hapus berantai dijalankan aplikasi, bukan database.** `parent_id` dan `BUKTI_DUKUNG.folder_id` keduanya `ON DELETE RESTRICT`. Menghapus folder berisi lewat `ON DELETE CASCADE` akan membuang berkas tanpa satu pun kesempatan mengabarkan berapa banyak yang ikut hilang, padahal justru angka itulah satu-satunya penahan salah tekan di UI — sistem ini belum punya tempat sampah. Aplikasi yang mengumpulkan keturunannya, menyebut jumlahnya di konfirmasi, lalu menghapusnya dalam satu transaksi.

> **Catatan desain — `jalur` dan `kedalaman` sengaja tidak disimpan.** Keduanya turunan `parent_id`, dan menyimpan turunan berarti memelihara dua sumber kebenaran yang bisa berselisih: satu pemindahan folder harus menulis ulang seluruh keturunannya. Untuk pohon sedalam ini biayanya tidak sebanding. Perlu `CHECK` di level aplikasi agar `parent_id` tidak pernah menunjuk keturunannya sendiri — pohon yang berputar membuat seluruh cabangnya lenyap dari query mana pun tanpa jalan pulih lewat UI.

### Relasi
- Folder level tenant dimiliki oleh satu `TENANT`; folder level prodi dimiliki oleh satu `PROGRAM_STUDI`. **Tidak ada folder yang melintasi batas itu** — tiap cakupan punya pohonnya sendiri, mengikuti aturan isolasi antar prodi di [§7](#7-bukti_dukung).
- Satu folder dapat memuat banyak `FOLDER_BUKTI` lain lewat `parent_id` (self-referencing).
- Satu folder dapat memuat banyak `BUKTI_DUKUNG` lewat `BUKTI_DUKUNG.folder_id`.

### Fitur terkait
- **Unggah folder**: peramban mengirim jalur relatif tiap berkas, dan backend/aplikasi membuat folder yang belum ada lalu memakai ulang yang sudah ada (dicocokkan per nama di bawah induk yang sama). Folder kosong tidak pernah terbawa — peramban hanya memancarkan berkas, sehingga direktori tanpa berkas tidak meninggalkan jejak untuk dibaca.
- **Pencarian mengabaikan folder**: kata kunci dicocokkan ke seluruh cakupan, bukan ke folder yang sedang dibuka, dan tiap hasil membawa jalur foldernya. Folder yang menyembunyikan berkas adalah satu-satunya bahaya nyata dari fitur ini; pencarian yang ikut terbatasi folder justru memperkuatnya.
- **Pindah**: mengubah `folder_id` (untuk berkas) atau `parent_id` (untuk folder). Cakupannya tidak pernah ikut berubah.

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
| `nama_dokumen` | string | Nama berkas saat rujukan dibuat. **Denormalisasi** — lihat [catatan konvensi](#konvensi-menyimpan-nama-bukan-hanya-id) |
| `tipe_file` | string | Ekstensi huruf kecil (`pdf`, `xlsx`, …), untuk ikon dan keterangan arsip |

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
| `nama_dokumen` | string | Nama berkas saat checkpoint dibuat. **Denormalisasi** — lihat [catatan konvensi](#konvensi-menyimpan-nama-bukan-hanya-id) |
| `tipe_file` | string | Ekstensi huruf kecil (`pdf`, `xlsx`, …), untuk ikon dan keterangan arsip |

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
User (Penjamin Mutu atau Penyusun) tidak mengelola tabel ini langsung — mereka hanya melihat hasilnya lewat penilaian yang dijalankan atas dokumennya. Daftar kriteria di sini yang menentukan berapa banyak butir penilaian akan muncul.

> **Catatan — pembacanya kini Penilaian AMI.** Kalimat di atas semula menyebut fitur "Simulasi Skor" di editor bab; tab itu sudah dihapus (`docs/application_flow.md §9`). Tabelnya sendiri tidak berubah sedikit pun dan justru makin sentral: Penilaian AMI menilai satu Dokumen LED terhadap **seluruh** kriteria di sini, dan Editor Bab menyaringnya lewat `RUBRIK_KRITERIA_BAB` hanya untuk menampilkan skor AMI bab yang sedang ditulis (tab Review, murni baca).

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik kriteria |
| `kode_kriteria` | string | Kode sesuai rubrik asli, misal "C1", "4.1a" |
| `deskripsi` | string | Bunyi kriteria/pertanyaan penilaian |
| `skor_maksimal` | int | ⚠️ **Jangan dibuat saat implementasi.** Skor tertinggi untuk kriteria ini — sudah bisa diturunkan dari `RUBRIK_LEVEL`, alasannya di catatan bawah |

> **Celah yang ditemukan saat tab Rubrik dibangun — `level_skor` belum ada.**
>
> `docs/application_flow.md §9.1` menuntut tiap kriteria ditampilkan "**dengan deskripsi tiap level skor**", tapi tabel di atas tidak punya tempat untuk menyimpannya: yang ada hanya bunyi kriteria dan angka tertingginya. Tanpa data itu, penyusun cuma melihat "3 dari 4" tanpa tahu apa yang membedakan skor 3 dari skor 4 — padahal justru itu gunanya rubrik. Tab Rubrik-nya sendiri sudah dihapus, tapi celah ini **tetap berlaku**: Penilaian AMI menampilkan level skor yang sama di rincian tiap indikator, dan yang menuntutnya sekarang fitur itu.
>
> Implementasinya menambahkan **`level_skor`**, satu baris per level: `{ skor: int, deskripsi: text }`. Di kode ia jadi larik pada `RubricCriterion` (`features/chapter/domain/entities/rubric-criterion.entity.ts`); saat pindah ke basis data ia wajar jadi tabel `RUBRIK_LEVEL` tersendiri (`kriteria_id`, `skor`, `deskripsi`), sejajar dengan pemecahan `PANDUAN_REFERENSI` → `PANDUAN_DETAIL`.
>
> **`skor_maksimal` sebaiknya ikut dibuang saat itu.** Ia bisa diturunkan dari `level_skor` (nilai `skor` tertinggi), dan menyimpannya terpisah membuka kemungkinan `skor_maksimal = 5` pada kriteria yang cuma punya empat level — kesalahan yang tidak akan pernah tertangkap siapa pun. Alasan yang sama sudah dipakai `BAB_DOKUMEN` untuk tidak menyimpan kolom status. Di kode ia sudah diturunkan lewat `skorMaksimal(kriteria)`.
>
> Skala 1–4 yang dipakai seluruh kriteria contoh **bukan** aturan sistem: bentuknya tetap mengizinkan kriteria dengan jumlah level berbeda, sesuai kalimat "bisa berbeda tiap kriteria" di baris `skor_maksimal`.

### Relasi
- Satu kriteria dipecah menjadi beberapa `RUBRIK_LEVEL` — satu baris per level skor.
- Satu kriteria dapat berlaku untuk banyak nomor bab lewat `RUBRIK_KRITERIA_BAB`.
- Satu kriteria dapat memiliki banyak `HASIL_SKOR_KRITERIA` (satu per setiap kali bab/checkpoint disimulasikan).

### Fitur terkait
- **Sumber acuan simulasi skor**: saat user menjalankan simulasi pada suatu bab, sistem mengambil semua `RUBRIK_KRITERIA` yang terkait dengan nomor bab tersebut (lewat `RUBRIK_KRITERIA_BAB`), lalu meminta AI menilai `konten_kerja`/`konten_snapshot` bab terhadap tiap kriteria itu.
- **Bab tanpa kriteria = tidak ada hasil skor**: jika suatu nomor bab tidak punya baris terkait di `RUBRIK_KRITERIA_BAB`, maka simulasi skor untuk bab itu otomatis kosong/tidak berlaku.

---

## 10a. RUBRIK_LEVEL

### Deskripsi
Pemecahan `RUBRIK_KRITERIA` menjadi level-level skornya — satu baris per level. Inilah yang menjawab "apa bedanya skor 3 dan skor 4 untuk kriteria ini", pertanyaan yang tidak bisa dijawab kalau yang tersimpan hanya angka tertingginya.

Tabel ini adalah formalisasi dari celah yang dicatat di `RUBRIK_KRITERIA` — di kode ia sudah ada sebagai larik `levelSkor` pada `RubricCriterion` (`features/chapter/domain/entities/rubric-criterion.entity.ts`), tinggal dinormalisasi saat masuk basis data. Polanya sejajar `PANDUAN_REFERENSI` → `PANDUAN_DETAIL`.

### Konteks pengguna
Isi tabel inilah yang tampil di tab Rubrik (`docs/application_flow.md` §9.1): tiap kriteria dibentangkan level demi level, supaya penyusun tahu apa yang harus dipenuhi untuk naik satu tingkat, bukan cuma melihat skor akhirnya.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik baris level |
| `kriteria_id` | string (FK) | Kriteria induk → `RUBRIK_KRITERIA` |
| `skor` | int | Nilai level ini, misal 1, 2, 3, 4 |
| `deskripsi` | text | Bunyi level tersebut — apa yang harus dipenuhi untuk mendapat skor ini |

Constraint: `UNIQUE(kriteria_id, skor)` — satu kriteria tidak boleh punya dua level dengan angka sama.

### Relasi
- Banyak `RUBRIK_LEVEL` dimiliki satu `RUBRIK_KRITERIA`.

### Fitur terkait
- **Tampilan rubrik per bab**: tab Rubrik menampilkan tiap kriteria beserta seluruh levelnya, diurutkan `skor`.
- **Skor maksimal dihitung, bukan disimpan**: nilai `skor` tertinggi milik suatu kriteria adalah skor maksimalnya. Menyimpannya terpisah di `RUBRIK_KRITERIA` membuka celah tidak sinkron — misal `skor_maksimal = 5` pada kriteria yang cuma punya empat level, kesalahan yang tidak akan tertangkap siapa pun.
- **Jumlah level boleh berbeda antar kriteria**: skala 1–4 yang dipakai kriteria contoh bukan aturan sistem.

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

> **Catatan — frontend tidak lagi menulis tabel ini.** Tab Rubrik yang mengisinya sudah dihapus (`docs/application_flow.md §9`), berikut seluruh lapis datanya di frontend. Tabelnya tetap tinggal di `packages/db/prisma/schema.prisma` dan pasal ini tetap berlaku sebagai rancangan, tapi bentuk yang hidup sekarang adalah hasil **Penilaian AMI** — satu baris per indikator per sesi penilaian, menempel ke `DokumenLed` dan bukan ke bab atau checkpoint. Selisih bentuk itu belum diselaraskan; lihat "Catatan Integrasi" di kaki berkas ini.

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
| `dijalankan_oleh_nama` | string | Nama penjalan simulasi. **Denormalisasi**, bukan FK — lihat [catatan konvensi](#konvensi-menyimpan-nama-bukan-hanya-id) |
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

## 12b. Penilaian AMI — tiga celah di sekitar `AssessmentSession`

> **Celah yang ditemukan saat halaman Penilaian AMI dibangun** (`/led-projects/:projectId/assessment`).
>
> Berbeda dari §12a, tabel intinya **sudah ada** — dan ada di **dua tempat yang tidak sama**, jadi keduanya perlu dibedakan lebih dulu sebelum celahnya masuk akal:
>
> | | `assessment_sessions` §19–21 | `AssessmentSession` (Prisma) |
> |---|---|---|
> | Sumber | Prototipe branch `ariel`, Supabase | `packages/db/prisma/schema.prisma` |
> | Kunci | `session_id` TEXT (UUID) | `id` cuid |
> | Terikat dokumen? | **Tidak** — tanpa `tenant_id`, `program_studi_id`, `dokumen_id`, maupun penanda penjalannya | Ya — `dokumen_id` → `DOKUMEN_LED`, `tenant_id`, `created_by_user_id` |
> | Dipakai siapa | FastAPI `apps/ai` | belum dipakai kode mana pun |
>
> **Yang dipakai halaman Penilaian AMI adalah bentuk Prisma**, karena `dokumen_id`-nya itulah yang menjadikan satu sesi = satu Dokumen LED — dan itu pula alasan permukaannya hidup di lapis 3, bukan di lapis prodi maupun di dalam Editor Bab. Tabel §19–21 tetap dipertahankan di dokumen ini sebagai catatan prototipe; menyatukan keduanya adalah pekerjaan integrasi tersendiri, tercatat di "Catatan Integrasi" di bawah.
>
> Yang belum ada di **keduanya** tiga hal berikut.

### (1) Sumber bahan penilaian belum lengkap

`AssessmentSession` baru punya `laporan_bukti_dukung_id`. Dua sumber lain belum punya kolom, padahal keduanya menentukan hasil:

| Field | Tipe | Keterangan |
|---|---|---|
| `sumber_led` | enum | `EDITOR` \| `UNGGAHAN`. `EDITOR` menilai `konten_kerja` seluruh bab; `UNGGAHAN` untuk dokumen LED yang sudah selesai disusun di luar aplikasi |
| `led_file_url` | text? | Terisi hanya bila `sumber_led = UNGGAHAN`. **Bukan** `BUKTI_DUKUNG`: bukti dukung adalah bahan yang dirujuk dokumen, sedangkan ini dokumennya sendiri — menaruhnya di pustaka membuatnya muncul sebagai kandidat rujukan bagi bab di dokumen yang sama |
| `lkps_bukti_dukung_id` | fk? | `BUKTI_DUKUNG` berisi data LKPS prodi. Sejajar `laporan_bukti_dukung_id` yang sudah ada |

Matriks penilaian sengaja **tidak** punya kolom di sini: ia master global (`PANDUAN_REFERENSI` bertipe `DOKUMEN_RUBRIK`, tanpa `tenant_id`), di-seed sekali. Itu pula yang membuat kartu "Upload Matriks Penilaian" di prototipe AMI tidak dibawa ke produk.

### (2) Keputusan Penjamin Mutu belum punya tabel

`IndicatorResult` kebijakannya **ditimpa** tiap sesi — sama seperti `konten_kerja` dan `HASIL_SKOR_KRITERIA`. Karena itu keputusan Penjamin Mutu tidak boleh tinggal di sana: satu klik "Nilai Ulang" akan menghapusnya tanpa jejak.

**Barisnya menyatakan peninjauan, bukan koreksi.** Rancangan pertama hanya mencatat perubahan angka, dan itu meninggalkan lubang yang serius untuk dokumen akreditasi: "tidak ada baris" berarti dua hal sekaligus — belum ada yang melihat indikator ini, **atau** sudah dilihat dan mesinnya dianggap benar. Penjamin Mutu jadi tidak bisa menjawab "berapa indikator yang masih perlu saya periksa?", dan pembaca dokumen tidak bisa membedakan angka yang sudah dipertanggungjawabkan manusia dari angka yang lolos begitu saja.

Statusnya **tiga, dan ketiganya diturunkan** — tidak satu pun jadi kolom:

| Status | Diturunkan dari | Skor yang berlaku |
|---|---|---|
| **Belum ditinjau** | tidak ada baris keputusan | skor mesin apa adanya |
| **Disetujui** | ada baris, `skor_mesin_saat_ditinjau` = skor mesin sekarang | skor Penjamin Mutu |
| **Perlu ditinjau ulang** | ada baris, snapshot ≠ skor mesin sekarang | skor Penjamin Mutu, **tidak** dicabut |

Dua hal yang sengaja **bukan** status:

- **"Dikoreksi" bukan status pekerjaan.** Menyetujui dan mengoreksi sama-sama berarti indikatornya sudah ditangani; yang membedakan cuma angkanya. Ia tetap dihitung sebagai fakta (`skor_final ≠ skor_mesin_saat_ditinjau`) untuk menjawab "seberapa sering manusia mengoreksi mesin", tapi tidak memakai penanda sendiri di daftar.
- **"Basi" bukan pelengkap status.** Menempelkannya pada "Disetujui" menghasilkan kontradiksi; keadaan itu sebenarnya pekerjaan yang belum selesai, jadi ia berdiri sebagai status tersendiri. Konsekuensinya angka progres jadi jujur — yang dasarnya sudah bergeser berhenti dihitung selesai.

Bentuk yang dipakai implementasi — kunci `(dokumen_id, indikator_no)`, menempel ke **dokumen** bukan ke sesi, supaya keputusan bertahan melewati penilaian ulang:

| Field | Tipe | Keterangan |
|---|---|---|
| `dokumen_id` + `indikator_no` | fk + int | Kunci uniknya. Bukan `session_id` — itulah yang membuat keputusan selamat dari penilaian ulang |
| `skor_final` | decimal | Skor yang berlaku menurut Penjamin Mutu |
| `catatan` | text | **Wajib untuk koreksi, opsional untuk persetujuan.** Koreksi menggantikan angka yang punya justifikasi tertulis dengan angka yang tidak; menyetujui tidak — justifikasi mesinnya sudah ada, dan menuntut kalimat untuk menyatakan setuju hanya menghasilkan tujuh puluh delapan "sudah sesuai" |
| `skor_mesin_saat_ditinjau` | decimal? | Snapshot. Satu-satunya cara mendeteksi bahwa penilaian ulang sudah menggeser dasar pertimbangannya |
| `sesi_id_saat_ditinjau` | fk | Sesi yang jadi dasar, sebagai keterangan — bukan pemilik |
| `ditinjau_oleh_user_id` / `_nama` / `ditinjau_pada` | | Atribusi; nama ikut disimpan dengan alasan yang sama seperti `BAB_DRAFT.dibuat_oleh_nama` |

**Tidak ada kolom status maupun kolom "disetujui atau dikoreksi".** Keduanya diturunkan, mengikuti aturan yang sudah ditegakkan berkali-kali di dokumen ini (status bab, skor maksimal, total skor): kolom yang bisa dihitung dari fakta yang ada akan jadi kebenaran kedua yang bisa menyimpang. Konsekuensinya menyenangkan — menggeser skor **kembali** ke angka mesin otomatis berhenti terhitung sebagai koreksi, tanpa aksi terpisah dan tanpa pengguna perlu tahu ada dua konsep.

**Penilaian final dihitung saat dibaca**: hasil mesin ditimpa keputusan — alasan yang sama dengan "total skor dihitung on-the-fly" di §12.

**Keputusan yang dasarnya berubah ditandai, bukan dihapus, dan skornya tetap berlaku.** Barisnya utuh beserta catatan dan atribusinya; yang berubah hanya statusnya. Skor Penjamin Mutu **tidak** dikembalikan ke angka mesin terbaru — kalau ia berbalik sendiri, rata-rata dokumen akan bergeser tanpa ada seorang pun yang memutuskan apa pun. Menyimpannya kembali menuliskan ulang `skor_mesin_saat_ditinjau` ke angka yang berlaku sekarang, sehingga statusnya pulih jadi Disetujui — itulah cara menegaskan ulang keputusan yang sudah diperiksa lagi.

### (3) RAGAS untuk penilaian belum punya tempat

`EvalResult` **tidak bisa dipakai**: kolomnya `@unique` pada `generation_run_id`, jadi ia milik evaluasi *generasi*. Metrik untuk `AssessmentSession` butuh tempatnya sendiri, dan bentuknya berbeda dari §12a dalam dua hal:

- **Empat metrik, bukan tiga.** Pengecualian `context_recall` di §12a berlaku karena LED tidak punya jawaban acuan. Untuk penilaian, acuannya ada — bunyi indikator beserta level skor 0–4 di matriks sudah menyatakan apa yang seharusnya dicari — dan `apps/ai/eval/ragas_eval.py` memang menjalankan keempatnya.
- **Ada rincian per indikator.** Agregat sesi saja tidak bisa ditindaklanjuti; yang berguna adalah mengetahui indikator mana yang `context_recall`-nya rendah, karena di sanalah skor rendah berarti "mesin tidak menemukan tulisannya", bukan "dokumennya kurang".

Wajar berbentuk kolom `kualitas` jsonb pada `AssessmentSession` (seperti `ragas` pada `BAB_DOKUMEN`), atau tabel `HASIL_RAGAS_AMI` bila kelak perlu di-query lintas sesi.

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
0. `PENYUSUN` menandai babnya siap lewat `diajukan_review_pada` (§12.3). Bab itu membeku bagi seluruh `PENYUSUN` dan muncul sebagai antrean di dashboard, sehingga `PENJAMIN_MUTU` tidak perlu menebak bab mana yang menunggu. Langkah ini opsional — review tetap bisa dimulai kapan pun `PENJAMIN_MUTU` memutuskan melihat.
1. `PENJAMIN_MUTU` memeriksa isi `konten_kerja` dan riwayat `BAB_DRAFT` suatu bab.
2. `PENJAMIN_MUTU` memberi `catatan_penjamin_mutu` dan/atau mengaktifkan `terkunci = true` — berlaku untuk semua role tanpa kecuali, termasuk dirinya sendiri. Keduanya aksi terpisah, dan keduanya menghanguskan antrean di langkah 0.
3. Setelah review selesai, `PENJAMIN_MUTU` membuka kembali kunci (`terkunci = false`) agar pengerjaan bisa dilanjutkan.

---

## Kelompok: AI-LED — Generasi & Evaluasi (prototipe)

**Sumber**: branch `led-wiriting(dimas)`, berkas `api/lib/db.py`. Database **SQLite** (`/data/led.db`), skema dibentuk lewat `init_db()` saat service FastAPI start.

Berbeda dari tabel 1–15 yang merupakan rancangan, tabel di kelompok ini **sudah berjalan** — hanya saja hidup di database sendiri dan belum pernah didokumentasikan.

Satu perbedaan konsep perlu dipahami sebelum membaca: prototipe ini adalah **harness perbandingan multi-model**. Satu bagian dokumen bisa punya beberapa draf **berdampingan sekaligus**, satu per model LLM, untuk dibandingkan kualitasnya. Ini berbeda dari `BAB_DRAFT` yang versinya berurut menurut waktu (`versi` 1, 2, 3) dan tidak mengenal konsep "model mana yang menghasilkan".

---

## 16. drafts

### Deskripsi
Satu baris = satu hasil generate untuk **satu bagian dokumen oleh satu model**. Kombinasi (`section_id`, `model`) dijaga `UNIQUE`, jadi tiap model hanya punya satu draf terkini per bagian — generate ulang dengan `overwrite=true` menimpa baris yang sama, bukan menambah riwayat.

### Konteks pengguna
Isi utama panel dokumen di UI prototipe. User memilih model di bar atas, melihat draf model tersebut, bisa mengedit manual, meminta revisi lewat chat, lalu menandainya `approved`.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | INTEGER (PK, autoincrement) | Identitas unik draf |
| `section_id` | TEXT | Bagian dokumen yang ditulis — **bukan foreign key**, lihat catatan di bawah |
| `section_title` | TEXT | Judul bagian, disalin saat generate |
| `model` | TEXT | Nama model LLM yang menghasilkan draf ini |
| `draft_text` | TEXT | Isi draf hasil generate, atau hasil edit manual user |
| `pedoman_used` | TEXT (JSON) | Hasil retrieval aturan/struktur penulisan; daftar `{id, text}` dengan teks dipotong 300 karakter |
| `rubric_used` | TEXT (JSON) | Hasil retrieval rubrik penilaian, format sama seperti `pedoman_used` |
| `checklist` | TEXT (JSON) | Daftar fakta yang perlu dicari, disusun LLM dari judul + pedoman + rubrik (maksimal 8 item) |
| `chunks_used` | TEXT (JSON) | Hasil retrieval LKPS + bukti dukung; tiap entri mencatat `query`, yaitu item checklist mana yang memicu pengambilan chunk itu |
| `judge_result` | TEXT (JSON) | Output *LLM-as-judge* — model penilai terpisah, plus metadata `_judge_model` dan `_judge_latency` |
| `prompt_full` | TEXT | Prompt lengkap yang dikirim ke LLM, untuk reproduksi/debug |
| `latency_sec` | REAL | Lama proses sintesis dalam detik |
| `token_count` | INTEGER | Jumlah token terpakai |
| `status` | TEXT | `draft` (default) \| `approved` |
| `created_at` / `updated_at` | DATETIME | Waktu dibuat dan terakhir diubah |

Constraint & index: `UNIQUE(section_id, model)`, `idx_drafts_section` pada `section_id`.

> **Catatan penting soal `section_id`.** Kolom ini tidak menunjuk ke tabel mana pun. Isinya slug yang dibangun dari berkas outline `led_bab_tabel.json` (mis. `C1`, `BAB-II`), dan strukturnya **berjenjang sampai 10 level** (`bab` → `sub_bab` → `sub_sub_bab` → `subsub_num` → `list_num`/`list_alpha`/`list_roman`/dst), lengkap dengan `parent_id`, `depth`, dan `breadcrumb`. Draf bisa menempel di level mana pun dalam pohon itu, bukan hanya di level bab.
>
> Ini menjawab sebagian **Pertanyaan Terbuka #2 di `docs/application_flow.md`** — pertanyaan apakah TOC berjenjang itu master data statis atau turunan heading. Di prototipe ini ia **statis, dari berkas**. Yang belum diputuskan: apakah bentuk itu yang dipakai produk, atau outline diratakan jadi satu level agar cocok dengan `BAB_DOKUMEN.urutan_bab`.

### Relasi
- Dirujuk `chat_messages` dan `eval_results` lewat pasangan (`section_id`, `model`) — kecocokan nilai kolom, bukan foreign key.
- Tidak punya relasi apa pun ke tabel 1–15.

### Fitur terkait
- **Generate bertahap**: pipeline mengambil pedoman → mengambil rubrik → menyusun checklist fakta lewat LLM → mencari LKPS & bukti dukung per item checklist → mensintesis draf → menilainya dengan LLM-as-judge. Hasil antara tiap tahap ikut tersimpan di baris yang sama, sehingga satu baris berisi jejak lengkap satu proses generate.
- **Perbandingan antar model**: beberapa hasil model bisa ditampilkan berdampingan untuk bagian yang sama.
- **Edit manual**: `PUT /sections/{id}/draft` menimpa `draft_text`.
- **Approve**: mengubah `status` jadi `approved`.
- **Hapus**: draf **bisa dihapus**, bahkan massal (per model, per section, atau seluruhnya) — bertolak belakang dengan kebijakan `BAB_DRAFT` yang melarang penghapusan demi jejak audit.

---

## 17. chat_messages

### Deskripsi
Riwayat percakapan revisi antara user dan LLM untuk satu bagian dokumen pada satu model. Dipakai fitur "chat revise": user meminta perubahan dalam bahasa natural, sistem mengambil ulang konteks (LKPS + bukti dukung) berdasarkan pesan itu, lalu menghasilkan revisi secara *streaming*.

### Konteks pengguna
Panel chat di sebelah dokumen pada UI prototipe. Riwayatnya ikut dikirim sebagai konteks pada tiap giliran, jadi percakapan berkesinambungan.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | INTEGER (PK, autoincrement) | Identitas unik pesan |
| `section_id` | TEXT | Bagian dokumen yang dibahas |
| `model` | TEXT | Model yang dipakai pada percakapan ini |
| `role` | TEXT | Peran pengirim pesan (`user`, dan balasan asisten) |
| `message` | TEXT | Isi pesan |
| `created_at` | DATETIME | Waktu pesan dibuat; dipakai juga sebagai urutan tampil |

Index: `idx_chat_section` pada `section_id`.

### Relasi
- Terikat ke `drafts` lewat kecocokan (`section_id`, `model`) — chat hanya bisa dimulai kalau draf untuk kombinasi itu sudah ada.
- Ikut terhapus saat draf terkait dihapus, tapi lewat perintah `DELETE` terpisah di kode, bukan `ON DELETE CASCADE`.

### Fitur terkait
- **Revisi percakapan**: alternatif dari generate ulang dari nol — user mengarahkan perubahan spesifik tanpa kehilangan bentuk draf yang ada.

> **Catatan**: fitur ini tidak ada di `docs/application_flow.md` maupun rancangan Editor Bab. Perlu dikonfirmasi apakah ia akan dibawa ke aplikasi utama atau murni alat bantu eksperimen.

---

## 18. eval_results

### Deskripsi
Hasil evaluasi otomatis kualitas draf, satu baris per (`section_id`, `model`). Berisi dua rumpun metrik yang **tujuannya berbeda**: kemiripan teks terhadap dokumen acuan (ROUGE, BLEU) dan kualitas RAG bergaya RAGAS.

### Konteks pengguna
Dipakai membandingkan performa antar model secara terukur, bukan penilaian subjektif. Dijalankan lewat `scripts/evaluate.py`, di luar alur pemakaian normal.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | INTEGER (PK, autoincrement) | Identitas unik baris evaluasi |
| `section_id` | TEXT | Bagian dokumen yang dievaluasi |
| `model` | TEXT | Model yang menghasilkan draf yang dievaluasi |
| `rouge_1` / `rouge_2` / `rouge_l` | REAL | Skor ROUGE — kemiripan n-gram terhadap teks acuan |
| `bleu_4` | REAL | Skor BLEU-4 |
| `answer_relevancy` | REAL | RAGAS — relevansi jawaban terhadap bagian yang ditulis |
| `context_precision` | REAL | RAGAS — ketepatan konteks yang diambil |
| `context_recall` | REAL | RAGAS — kelengkapan konteks yang diambil |
| `evaluated_at` | DATETIME | Waktu evaluasi dijalankan |

Constraint: `UNIQUE(section_id, model)` — evaluasi ulang menimpa baris lama.

### Relasi
- Terikat ke `drafts` lewat kecocokan (`section_id`, `model`).

### Fitur terkait
- **Benchmark antar model**: hasilnya dipakai memilih model terbaik.

> **Hubungannya dengan §12a.** Dokumen ini sudah memutuskan skor RAGAS produksi disimpan sebagai kolom `ragas` pada `BAB_DOKUMEN` dan `BAB_DRAFT`, dengan metrik `faithfulness`, `response_relevancy`, dan `context_precision` — dan sengaja **membuang `context_recall`** karena metrik itu menuntut jawaban acuan, sedangkan LED justru sedang disusun.
>
> Tabel ini tidak menggantikan keputusan itu. Ia punya `context_recall`, ROUGE, dan BLEU justru karena tujuannya berbeda: Dimas **punya** acuan (`scripts/parse_led_existing.py` membaca LED yang sudah jadi) karena ia sedang membandingkan model, bukan melayani pengguna. Ketiga metrik itu **alat benchmark saat pengembangan** dan tidak perlu ikut ke skema aplikasi.

---

## Kelompok: AMI Assessment (prototipe)

**Sumber**: branch `ariel`, berkas `backend/db/migrations/001_initial_schema.sql` dan `002_add_recommendation.sql`. Database **PostgreSQL di Supabase** dengan Row-Level Security aktif — backend FastAPI memakai *service-role key* sehingga menembus RLS, sementara klien anon/authenticated tidak bisa baca-tulis sama sekali.

Alurnya: satu kali penilaian AMI = satu `assessment_sessions`. Di dalamnya sampai 78 indikator dinilai **paralel** (default 5 sekaligus lewat semaphore), masing-masing oleh satu invokasi graph LangGraph yang independen. Tiap indikator menghasilkan satu `indicator_results` plus sejumlah `reasoning_steps`.

---

## 19. assessment_sessions

### Deskripsi
Satu baris per sekali jalan pipeline penilaian AMI, menyimpan status proses beserta progres berapa indikator yang sudah selesai.

### Konteks pengguna
Karena penilaian 78 indikator makan waktu lama, proses berjalan di latar belakang dan client melakukan *polling*. Baris inilah yang dibaca saat polling, sekaligus menjadi baris di halaman riwayat penilaian.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | BIGINT (PK, identity) | Primary key numerik internal |
| `session_id` | TEXT (UNIQUE) | UUID sesi — **inilah kunci yang dipakai** seluruh tabel lain dan semua endpoint |
| `laporan_path` | TEXT | Path berkas `Laporan_AK.xlsx` di server; string kosong bila memakai 78 indikator bawaan |
| `total_indicators` | INTEGER | Jumlah indikator yang akan dinilai |
| `completed_indicators` | INTEGER | Jumlah yang sudah selesai; diperbarui tiap satu indikator rampung sehingga progres terpantau |
| `status` | TEXT | `running` \| `completed` \| `failed`, ditegakkan `CHECK` constraint |
| `error` | TEXT | Pesan galat bila seluruh pipeline gagal |
| `created_at` / `updated_at` | TIMESTAMPTZ | `updated_at` diperbarui otomatis lewat trigger `_set_updated_at()` |

Index: `idx_sessions_status` pada `status`, untuk polling.

### Relasi
- Satu sesi memiliki banyak `indicator_results` lewat `session_id`, dengan `ON DELETE CASCADE`.
- Satu sesi memiliki banyak `reasoning_steps` lewat `session_id`, tapi **tanpa** foreign key — lihat catatan di tabel 21.
- Tidak punya relasi apa pun ke tabel 1–15: tidak ada `tenant_id`, `program_studi_id`, `dokumen_id`, maupun penanda siapa yang menjalankan.

### Fitur terkait
- **Mulai penilaian**: `POST /assessment/start` membuat baris ini, melempar pipeline ke background task, dan langsung membalas `session_id` agar client bisa polling.
- **Pantau progres**: `GET /assessment/{session_id}/status`.
- **Riwayat penilaian**: `GET /assessment/list` menampilkan sesi terbaru beserta **rata-rata skor** yang dihitung *on-the-fly* dari `indicator_results` — pola yang sama dengan total skor di `HASIL_SKOR_KRITERIA`.

---

## 20. indicator_results

### Deskripsi
Hasil penilaian satu indikator dalam satu sesi: skor, justifikasi, tingkat keyakinan, dan rekomendasi perbaikan. Bila penilaian gagal, baris tetap dibuat dengan `score` kosong dan `error` terisi — kegagalan satu indikator tidak menggagalkan sesi.

### Konteks pengguna
Tabel hasil yang ditampilkan ke user: daftar skor per indikator, sekaligus sumber isi laporan PDF yang bisa diunduh.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | BIGINT (PK, identity) | Primary key numerik internal |
| `session_id` | TEXT (FK) | Sesi induk → `assessment_sessions.session_id`, `ON DELETE CASCADE` |
| `indicator_no` | INTEGER | Nomor indikator, 1–78 |
| `score` | NUMERIC(5,2) | Skor 0.00–4.00; `NULL` bila terjadi galat |
| `justification` | TEXT | Narasi alasan skor tersebut |
| `confidence` | NUMERIC(4,3) | Tingkat keyakinan model, 0.000–1.000 |
| `recommendation` | TEXT | Saran perbaikan per indikator (ditambahkan lewat migration `002`) |
| `error` | TEXT | Pesan galat bila indikator ini gagal dinilai |
| `created_at` | TIMESTAMPTZ | Waktu hasil disimpan |

Constraint & index: `UNIQUE(session_id, indicator_no)`, `idx_results_session` pada `session_id`.

### Relasi
- Satu baris hasil dimiliki satu `assessment_sessions`.
- **Deskripsi indikatornya sendiri tidak ada di database** — teks kriteria di-*parse* dari berkas Excel (`_get_rubrics()`), di-*cache* di memori, lalu digabungkan saat endpoint hasil dipanggil.

### Fitur terkait
- **Lihat hasil**: `GET /assessment/{session_id}/results` mengembalikan seluruh baris terurut `indicator_no`, digabung dengan teks kriteria dari matriks rubrik.
- **Toleransi galat per indikator**: karena tiap indikator berdiri sendiri, satu kegagalan tidak membatalkan 77 lainnya.

> **Dua hal yang tidak tersimpan.** Pertama, `agent/state.py` menghitung `sub_score_i` dan `sub_score_ii` (komponen sebelum digabung jadi `final_score`) tapi keduanya tidak ikut masuk database. Kedua, **model LLM yang menilai tidak dicatat sama sekali** — ia dibaca dari *environment* saat pipeline berjalan, sehingga skor dari model lama dan model baru tidak bisa dibedakan setelahnya.

---

## 21. reasoning_steps

### Deskripsi
Log langkah penalaran (*chain-of-thought*) agen saat menilai satu indikator — satu baris per langkah, berurut lewat `step_index`.

### Konteks pengguna
Memberi transparansi "kenapa AI sampai pada skor ini", bukan sekadar angka akhir. Untuk audit mutu, jejak semacam ini penting karena hasilnya bisa dipertanyakan.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | BIGINT (PK, identity) | Identitas unik langkah |
| `session_id` | TEXT | Sesi terkait — **tanpa foreign key**, lihat catatan di bawah |
| `indicator_no` | INTEGER | Indikator yang sedang dinilai |
| `step_index` | INTEGER | Urutan langkah dalam satu penilaian indikator |
| `content` | TEXT | Isi langkah penalaran, di-*stringify* dari dict |
| `created_at` | TIMESTAMPTZ | Waktu langkah dicatat |

Index: `idx_steps_session_indicator` pada (`session_id`, `indicator_no`).

### Relasi
- Secara logis milik satu `assessment_sessions` dan satu indikator, tapi hubungan itu **tidak ditegakkan database**.

### Fitur terkait
- **Transparansi penilaian**: menelusuri ulang bagaimana agen sampai pada skor tertentu; ditulis satu per satu selama graph berjalan, sebelum baris `indicator_results` final disimpan.
- **Debug pipeline**: saat sebuah indikator menghasilkan skor janggal, langkah-langkah di sini yang diperiksa lebih dulu.

> **Catatan integritas.** Berbeda dari `indicator_results` yang punya `REFERENCES assessment_sessions(session_id) ON DELETE CASCADE`, kolom `session_id` di sini tidak punya foreign key sama sekali. Akibatnya baris yatim bisa muncul bila sesinya dihapus, dan `session_id` tidak valid bisa masuk tanpa ditolak. Kemungkinan disengaja demi kecepatan tulis, tapi perlu dikonfirmasi — bila bukan, ini perbaikan yang murah.

---

## Catatan Integrasi

Bagian ini merangkum selisih antara skema utama (tabel 1–15) dan dua prototipe di atas, diurutkan dari yang paling berdampak. Ini daftar kerja, bukan keputusan yang sudah diambil.

### 1. Struktur bab berjenjang vs `urutan_bab` satu level — paling berdampak

Skema utama mengasumsikan satu bab = satu ruang kerja, dengan `BAB_DOKUMEN.urutan_bab` berupa satu angka, dan `RUBRIK_KRITERIA_BAB`/`PANDUAN_DETAIL_BAB` mencocokkan diri ke angka itu.

Prototipe Dimas berjalan dengan asumsi berbeda: outline berjenjang sampai 10 level, tiap simpul punya `parent_id`/`depth`/`breadcrumb`, dan draf menempel di level mana pun. Perlu diputuskan:

- **Ikut prototipe** → `BAB_DOKUMEN` butuh `parent_id` sendiri (atau tabel master TOC terpisah), dan pencocokan rubrik/panduan tidak lagi cukup memakai satu angka.
- **Ikut skema utama** → outline prototipe diratakan jadi satu level saat integrasi.

Keputusan ini menyentuh 5 dari 15 tabel utama, jadi paling baik diselesaikan sebelum migration apa pun ditulis.

### 2. Model LLM tidak pernah dicatat — termasuk di skema utama

`indicator_results` tidak punya kolom model; ia dibaca dari *environment*. Sebaliknya `drafts` justru menjadikan `model` bagian dari kunci uniknya.

Yang lebih penting: **skema utama punya celah yang sama.** `BAB_DRAFT` hanya membedakan `sumber` = `AI` \| `MANUAL` tanpa mencatat AI yang mana, dan `HASIL_SKOR_KRITERIA` tidak punya kolom model sama sekali. Padahal `docs/architecture.md` §3.9 menyebut empat provider sekaligus (Ollama, DeepSeek, GPT OSS, Qwen) — pergantian model pasti terjadi.

Tanpa kolom ini, konten dari model berbeda tidak bisa dibedakan setelahnya, dan perbandingan kualitas antar model mustahil dilakukan di aplikasi utama. **Usulan: tambahkan kolom `model` di `BAB_DRAFT` dan `HASIL_SKOR_KRITERIA`.**

### 3. Master data hidup di berkas, bukan di tabel

Ariel: 78 indikator beserta teks kriterianya di-*parse* dari Excel, tidak pernah masuk database. Dimas: struktur outline dibaca dari `led_bab_tabel.json`. Bila berkas sumbernya direvisi, hasil lama kehilangan acuan — "indikator nomor 34 waktu itu bunyinya apa?" tidak terjawab, dan `section_id` lama bisa jadi yatim.

Skema utama sudah benar di sini: `RUBRIK_KRITERIA` dan `PANDUAN_DETAIL` memang dirancang sebagai tabel. Jadi pekerjaannya bukan merancang yang baru, melainkan memindahkan isinya dari berkas ke tabel.

Keputusan yang menyertai: apakah 78 indikator AMI menjadi baris di `RUBRIK_KRITERIA` (dengan penanda asal rubrik, karena strukturnya mirip), atau tetap terpisah karena konteks penilaiannya berbeda.

### 4. Riwayat percobaan hilang di prototipe Dimas

`UNIQUE(section_id, model)` membuat generate ulang menimpa percobaan sebelumnya secara permanen — hasil generate pertama dan kedua dari model yang sama tidak bisa dibandingkan. `BAB_DRAFT.versi` di skema utama justru dirancang untuk ini, jadi celahnya tertutup dengan sendirinya saat integrasi.

### 5. Tidak ada titik sambung ke skema utama

Kedua prototipe tidak punya `tenant_id`, `program_studi_id`, `dokumen_id`, maupun penanda user. Keduanya berasumsi satu universitas, satu dokumen, satu pemakai. Perlu diputuskan titik sambungnya — `drafts` menempel ke `BAB_DOKUMEN` atau melebur ke `BAB_DRAFT`, dan `assessment_sessions` per `DOKUMEN_LED` / `PROGRAM_STUDI` / `TENANT`. Tanpa ini, isolasi multi-tenant tidak bisa ditegakkan untuk kedua fitur.

### 6. Tiga database terpisah

Skema utama direncanakan PostgreSQL (belum ada), Dimas memakai SQLite lokal, Ariel memakai Supabase PostgreSQL. `docs/architecture.md` §3.5 menyatakan PostgreSQL tunggal dengan NestJS sebagai satu-satunya pemilik tulis. Perlu keputusan bersama backend: disatukan, atau tiap layanan pegang database sendiri — yang berarti `architecture.md` perlu direvisi.

### 7. Selisih kecil

- **Kebijakan hapus bertentangan**: skema utama melarang penghapusan `BAB_DRAFT` demi jejak audit; prototipe Dimas menyediakan endpoint hapus draf, termasuk massal.
- **Penamaan**: skema utama memakai bahasa Indonesia huruf besar (`BAB_DOKUMEN`), prototipe memakai bahasa Inggris huruf kecil (`drafts`).
- **`reasoning_steps.session_id` tanpa foreign key** — lihat catatan di tabel 21.
- **`sub_score_i`/`sub_score_ii` tidak disimpan** — lihat catatan di tabel 20.
- **Keamanan**: Ariel memakai Row-Level Security; skema utama mengasumsikan penyaringan `tenant_id` murni di level aplikasi. Perlu satu pendekatan konsisten.
- **Fitur chat revisi** (`chat_messages`) tidak ada di rancangan mana pun — perlu dikonfirmasi apakah fitur produk atau alat eksperimen.
