# Dokumentasi Skema Database — Platform Penyusunan Dokumen LED LAM-Teknik

## Daftar Isi

1. [Gambaran Umum](#gambaran-umum)
2. [TENANT](#1-tenant)
3. [USER](#2-user)
4. [PROGRAM_STUDI](#3-program_studi)
5. [DOKUMEN_LED](#4-dokumen_led)
6. [BAB_DOKUMEN](#5-bab_dokumen)
7. [BAB_DRAFT](#6-bab_draft)
8. [BUKTI_DUKUNG](#7-bukti_dukung)
9. [BUKTI_DUKUNG_BAB](#8-bukti_dukung_bab)
10. [BUKTI_DUKUNG_DRAFT](#9-bukti_dukung_draft)
11. [Ringkasan Alur Fitur Utama](#ringkasan-alur-fitur-utama)

---

## Gambaran Umum

Platform ini membantu perguruan tinggi menyusun **Laporan Evaluasi Diri (LED)** untuk kebutuhan akreditasi, khususnya berdasarkan panduan LAM Teknik. Sistem menyediakan struktur multi-tenant (multi-universitas), pengelolaan dokumen per program studi, editor per bab dengan sistem checkpoint (mirip *version control* sederhana), unggahan bukti dukung, serta fitur generasi konten berbasis AI (RAG) yang mengacu pada bukti dukung yang dipilih pengguna.

Skema database disusun secara hierarkis sebagai berikut:

```
TENANT (universitas)
 └── USER (admin, penjamin mutu, pimpinan, penyusun)
 └── PROGRAM_STUDI
      └── USER (opsional, user bisa terikat ke satu prodi)
      └── DOKUMEN_LED
           └── BAB_DOKUMEN
                └── BAB_DRAFT (checkpoint)
      └── BUKTI_DUKUNG (level prodi)
 └── BUKTI_DUKUNG (level tenant)

BUKTI_DUKUNG_BAB   → penghubung BUKTI_DUKUNG ↔ BAB_DOKUMEN
BUKTI_DUKUNG_DRAFT → penghubung BUKTI_DUKUNG ↔ BAB_DRAFT
```

Berikut dokumentasi setiap tabel, diurutkan dari entitas tertinggi (root) ke entitas turunannya.

---

## 1. TENANT

### Deskripsi
`TENANT` merepresentasikan satu **universitas/perguruan tinggi** yang menggunakan platform ini. Ini adalah entitas paling atas dalam hierarki — seluruh data (user, program studi, dokumen, bukti dukung) pada akhirnya terikat ke satu tenant, sehingga data antar universitas terisolasi satu sama lain (multi-tenancy).

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
`USER` merepresentasikan setiap individu yang login ke platform, baik di level universitas (admin, pimpinan, penjamin mutu) maupun di level program studi (penyusun, penjamin mutu, pimpinan prodi).

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik user |
| `tenant_id` | string (FK) | Universitas tempat user terdaftar |
| `program_studi_id` | string (FK, nullable) | Prodi tempat user ditugaskan; kosong jika user bersifat lintas-prodi (misal admin atau pimpinan universitas) |
| `nama_lengkap` | string | Nama user |
| `email` | string | Digunakan untuk login |
| `password_hash` | string | Kata sandi terenkripsi |
| `role` | string | `ADMIN` \| `PENJAMIN_MUTU` \| `PIMPINAN` \| `PENYUSUN` |

### Penjelasan Role

| Role | Cakupan | Kewenangan utama |
|---|---|---|
| **ADMIN** | Level tenant (universitas) | User pertama yang otomatis dibuat saat tenant dibuat. Bertugas membuat/mengelola akun user lain (penjamin mutu, pimpinan, penyusun), mengatur struktur prodi, dan administrasi organisasi secara umum. |
| **PENJAMIN_MUTU** | Level tenant atau prodi | Mereview isi bab dokumen, memberi catatan (`catatan_penjamin_mutu`), serta **mengunci (`terkunci`) bab** yang sedang/sudah direview agar tidak bisa diubah oleh penyusun. |
| **PIMPINAN** | Level tenant atau prodi | Memantau progres penyusunan dokumen LED, biasanya bersifat *read-heavy* — melihat status keseluruhan dokumen dan bab. |
| **PENYUSUN** | Level prodi | Mengerjakan isi bab dokumen (`konten_kerja`), memilih bukti dukung, menjalankan generasi konten AI, dan membuat checkpoint (`BAB_DRAFT`). |

### Relasi
- Satu user membuat banyak `BAB_DRAFT` (checkpoint) melalui kolom `dibuat_oleh_user_id`.
- Satu user dapat ditempatkan di satu `PROGRAM_STUDI` (opsional) atau berada di level tenant saja (misal admin, pimpinan universitas).

### Fitur terkait
- **Manajemen akun**: hanya admin yang dapat membuat user dengan role `PENJAMIN_MUTU`, `PIMPINAN`, dan `PENYUSUN` di dalam tenant-nya.
- **Kontrol akses berbasis role**: menu dan aksi yang tersedia di UI (misal tombol "Kunci Bab" hanya muncul untuk `PENJAMIN_MUTU`) ditentukan oleh `role`.
- **Penugasan ke prodi**: `program_studi_id` menentukan prodi mana yang bisa diakses/dikerjakan user tersebut; jika kosong, user dianggap punya cakupan di level universitas (lintas prodi), tergantung role dan aturan otorisasi tambahan di aplikasi.

---

## 3. PROGRAM_STUDI

### Deskripsi
`PROGRAM_STUDI` merepresentasikan satu program studi di bawah suatu universitas. Setiap dokumen LED disusun untuk satu program studi tertentu, karena akreditasi LAM Teknik dilakukan per prodi.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik program studi |
| `tenant_id` | string (FK) | Universitas pemilik prodi ini |
| `nama` | string | Nama program studi, misal "Teknik Informatika" |

### Relasi
- Satu program studi dimiliki oleh satu `TENANT`.
- Satu program studi dapat ditempati banyak `USER` (opsional, lewat `program_studi_id` di tabel USER).
- Satu program studi memiliki banyak `DOKUMEN_LED`.
- Satu program studi dapat memiliki `BUKTI_DUKUNG` miliknya sendiri (dokumen yang spesifik untuk prodi tersebut, misal SK dosen tetap prodi).

### Fitur terkait
- **Struktur organisasi**: admin membuat daftar program studi di bawah universitasnya sebagai bagian dari setup awal platform.
- **Pemisahan ruang kerja**: setiap prodi punya ruang kerja terpisah — dokumen LED, bukti dukung level prodi, dan user yang ditugaskan hanya melihat data prodi mereka (kecuali user level tenant seperti admin/pimpinan universitas).

---

## 4. DOKUMEN_LED

### Deskripsi
`DOKUMEN_LED` merepresentasikan satu dokumen Laporan Evaluasi Diri untuk suatu program studi pada tahun akademik tertentu. Satu prodi bisa punya beberapa `DOKUMEN_LED` seiring waktu (misal untuk siklus akreditasi berbeda).

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik dokumen |
| `program_studi_id` | string (FK) | Prodi pemilik dokumen ini |
| `judul` | string | Judul dokumen LED |
| `tahun_akademik` | string | Contoh: "2026/2027" |
| `status_keseluruhan` | string | `DRAFT` \| `REVIEW` \| `SELESAI` — status agregat seluruh dokumen |

### Relasi
- Satu dokumen LED dimiliki oleh satu `PROGRAM_STUDI`.
- Satu dokumen LED terdiri dari banyak `BAB_DOKUMEN`.

### Fitur terkait
- **Inisiasi dokumen baru**: penyusun/admin prodi membuat `DOKUMEN_LED` baru untuk memulai siklus penyusunan akreditasi, biasanya sekaligus membuat baris-baris `BAB_DOKUMEN` sesuai struktur bab standar LAM Teknik.
- **Dashboard progres**: `status_keseluruhan` dipakai untuk menampilkan ringkasan progres ke pimpinan/penjamin mutu tanpa perlu membuka detail tiap bab.

---

## 5. BAB_DOKUMEN

### Deskripsi
`BAB_DOKUMEN` merepresentasikan satu bab dalam dokumen LED (misal "Bab 1: Visi Misi", "Bab 2: Tata Pamong", dst). Ini adalah unit kerja utama tempat penyusun menulis dan meng-generate konten, serta tempat penjamin mutu melakukan review dan penguncian.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik bab |
| `dokumen_id` | string (FK) | Dokumen LED induk |
| `urutan_bab` | int | Urutan tampil bab, misal 1, 2, 3 |
| `judul_bab` | string | Contoh: "Visi Misi" |
| `konten_kerja` | jsonb | Konten aktif yang sedang dikerjakan; **selalu ditimpa otomatis** setiap kali ada perubahan (autosave) — ini adalah sumber kebenaran untuk apa yang sedang dikerjakan saat ini |
| `checkpoint_aktif_id` | string (FK, nullable) | Menunjuk ke `BAB_DRAFT` mana yang terakhir jadi acuan/basis `konten_kerja` (misal setelah melakukan restore) |
| `terkunci` | boolean | `true` jika penjamin mutu sedang mengunci bab ini untuk direview — saat terkunci, `konten_kerja` tidak boleh diubah dan checkpoint baru tidak boleh dibuat |
| `catatan_penjamin_mutu` | string | Catatan/masukan dari penjamin mutu terhadap isi bab |
| `terakhir_disimpan` | datetime | Waktu autosave terakhir |

### Relasi
- Satu bab dimiliki oleh satu `DOKUMEN_LED`.
- Satu bab memiliki banyak `BAB_DRAFT` (checkpoint).
- Satu bab dapat terhubung ke banyak `BUKTI_DUKUNG` lewat `BUKTI_DUKUNG_BAB`.

### Fitur terkait
- **Editor autosave**: setiap ketikan/perubahan penyusun di editor bab langsung menimpa `konten_kerja` tanpa perlu aksi simpan manual.
- **Checkpoint manual**: penyusun bisa sewaktu-waktu membuat checkpoint (snapshot) sebelum melakukan perubahan besar (misal sebelum generate ulang dengan AI), agar versi sebelumnya tidak hilang.
- **Restore ke checkpoint lama**: jika penyusun memilih untuk kembali ke checkpoint tertentu, `konten_kerja` ditimpa dengan `konten_snapshot` dari checkpoint tersebut, dan `checkpoint_aktif_id` diperbarui. Checkpoint lama tetap tersimpan (tidak dihapus, tidak membuat checkpoint baru otomatis).
- **Kunci review oleh penjamin mutu**: saat sebuah bab sedang/sudah direview, penjamin mutu dapat mengaktifkan `terkunci = true` disertai `catatan_penjamin_mutu`. Selama terkunci, penyusun tidak bisa mengedit `konten_kerja` maupun membuat checkpoint baru sampai penjamin mutu membuka kuncinya kembali.

---

## 6. BAB_DRAFT

### Deskripsi
`BAB_DRAFT` merepresentasikan satu **checkpoint** (snapshot) dari isi bab pada waktu tertentu. Berbeda dengan `konten_kerja` yang terus berubah, `konten_snapshot` di sini bersifat **immutable** — sekali dibuat, tidak akan berubah lagi. Ini berfungsi sebagai riwayat versi yang bisa ditinjau atau dijadikan titik pulih.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik checkpoint |
| `bab_id` | string (FK) | Bab yang menjadi induk checkpoint ini |
| `dibuat_oleh_user_id` | string (FK) | User yang membuat checkpoint (baik memicu generate AI maupun membuat checkpoint manual) |
| `versi` | int | Nomor urut checkpoint, bertambah setiap kali checkpoint baru dibuat untuk bab yang sama |
| `label` | string | Nama checkpoint yang opsional diberikan user, misal "Sebelum revisi PM" |
| `konten_snapshot` | jsonb | Salinan `konten_kerja` pada saat checkpoint dibuat; tidak berubah setelahnya |
| `sumber` | string | `AI` \| `MANUAL` — menandai apakah checkpoint ini hasil generate AI atau disimpan manual oleh user |
| `referensi_chunk_ids` | text | Opsional; daftar ID *chunk* dari vector database eksternal (RAG) yang menjadi rujukan saat AI menghasilkan konten ini |
| `dibuat_pada` | datetime | Waktu checkpoint dibuat |

### Relasi
- Satu checkpoint dimiliki oleh satu `BAB_DOKUMEN`.
- Satu checkpoint dibuat oleh satu `USER`.
- Satu checkpoint dapat mengacu ke banyak `BUKTI_DUKUNG` lewat `BUKTI_DUKUNG_DRAFT` (bukti dukung apa saja yang dipilih user saat generate checkpoint tersebut).

### Fitur terkait
- **Generasi konten AI**: saat penyusun memilih sejumlah bukti dukung lalu menekan tombol *generate*, sistem memanggil RAG (mencari *chunk* relevan dari panduan LAM Teknik/LKPS/rubrik dan bukti dukung terpilih di vector database eksternal), menghasilkan teks, lalu **menyimpannya sebagai `BAB_DRAFT` baru** dengan `sumber = AI` dan `referensi_chunk_ids` terisi.
- **Checkpoint manual**: penyusun juga bisa membuat checkpoint tanpa AI (`sumber = MANUAL`), misalnya untuk mengamankan hasil suntingan tangan sebelum mencoba generate ulang.
- **Riwayat versi & pemulihan**: daftar `BAB_DRAFT` per bab, diurutkan berdasarkan `versi`, memungkinkan penyusun melihat riwayat perubahan dan memilih untuk memulihkan (`restore`) salah satu versi ke `konten_kerja` bab induknya.
- **Traceability sumber AI**: `referensi_chunk_ids` dan tabel `BUKTI_DUKUNG_DRAFT` bersama-sama memberi jejak audit — dari sumber (panduan/bukti dukung) mana suatu draf AI dihasilkan, penting untuk pertanggungjawaban isi dokumen akreditasi.

---

## 7. BUKTI_DUKUNG

### Deskripsi
`BUKTI_DUKUNG` merepresentasikan satu berkas bukti pendukung (dokumen, sertifikat, SK, dsb) yang diunggah ke platform untuk dijadikan rujukan penyusunan maupun bahan generasi konten AI. Bukti dukung dapat dimiliki di level universitas (berlaku lintas prodi) atau di level satu program studi saja.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik bukti dukung |
| `owner_tipe` | string | `TENANT` \| `PROGRAM_STUDI` — menentukan level kepemilikan |
| `tenant_id` | string (FK, nullable) | Diisi jika `owner_tipe = TENANT` |
| `program_studi_id` | string (FK, nullable) | Diisi jika `owner_tipe = PROGRAM_STUDI` |
| `nama_dokumen` | string | Contoh: "SK_Rektor_2026.pdf" |
| `file_url` | string | Lokasi penyimpanan file (S3/lokal) |
| `tipe_file` | string | PDF, JPG, dll |
| `waktu_diunggah` | datetime | Waktu file diunggah |

> **Catatan desain**: `owner_tipe` bersama dua kolom FK nullable digunakan (bukan satu kolom polymorphic) agar integritas foreign key tetap terjaga oleh database. Perlu *constraint* di level aplikasi/`CHECK` agar hanya salah satu dari `tenant_id` atau `program_studi_id` yang terisi sesuai `owner_tipe`.

### Relasi
- Bukti dukung level tenant dimiliki oleh satu `TENANT`; bukti dukung level prodi dimiliki oleh satu `PROGRAM_STUDI`.
- Satu bukti dukung dapat terhubung ke banyak `BAB_DOKUMEN` lewat `BUKTI_DUKUNG_BAB`.
- Satu bukti dukung dapat terhubung ke banyak `BAB_DRAFT` lewat `BUKTI_DUKUNG_DRAFT`.

### Fitur terkait
- **Manajemen bukti dukung**: user (biasanya penyusun atau admin) mengunggah berkas bukti dukung, memilih apakah berlaku untuk seluruh universitas (`TENANT`) atau khusus satu prodi (`PROGRAM_STUDI`).
- **Perpustakaan bukti dukung bersama**: bukti dukung level tenant (misal Statuta, Renstra Universitas) bisa dipakai berulang oleh banyak prodi tanpa perlu diunggah ulang di tiap prodi.
- **Pemilihan bukti dukung sebagai konteks generate**: sebelum menekan tombol generate di suatu bab, penyusun memilih satu atau lebih `BUKTI_DUKUNG` (dari level tenant maupun prodi) yang relevan; pilihan ini menjadi dasar pencarian semantik (RAG) untuk menyusun konten bab.

---

## 8. BUKTI_DUKUNG_BAB

### Deskripsi
Tabel penghubung *many-to-many* antara `BUKTI_DUKUNG` dan `BAB_DOKUMEN`. Mencatat bukti dukung mana saja yang **dilampirkan/dikaitkan secara permanen** ke suatu bab (terlepas dari proses generate AI), misalnya sebagai lampiran resmi bab tersebut.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik baris relasi |
| `bukti_dukung_id` | string (FK) | Bukti dukung yang dikaitkan |
| `bab_dokumen_id` | string (FK) | Bab yang dikaitkan |

### Relasi
- Menghubungkan satu `BUKTI_DUKUNG` ke satu `BAB_DOKUMEN`, dengan kardinalitas many-to-many secara keseluruhan (satu bukti dukung bisa dipakai di banyak bab, satu bab bisa punya banyak bukti dukung).

### Fitur terkait
- **Lampiran bab**: menampilkan daftar bukti dukung resmi yang menyertai suatu bab di tampilan akhir dokumen LED (misalnya untuk keperluan asesor akreditasi memeriksa bukti pendukung suatu bab).
- Berbeda dari `BUKTI_DUKUNG_DRAFT` (lihat berikutnya) yang sifatnya mencatat konteks *proses generate*, tabel ini mencatat keterkaitan bukti dukung dengan bab secara umum/final.

---

## 9. BUKTI_DUKUNG_DRAFT

### Deskripsi
Tabel penghubung *many-to-many* antara `BUKTI_DUKUNG` dan `BAB_DRAFT`. Mencatat bukti dukung apa saja yang **dipilih user sebagai sumber** saat suatu checkpoint (baik hasil generate AI maupun manual) dibuat.

### Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | string (PK) | Identitas unik baris relasi |
| `bukti_dukung_id` | string (FK) | Bukti dukung yang dipakai sebagai sumber |
| `bab_draft_id` | string (FK) | Checkpoint yang dihasilkan dari bukti dukung tersebut |

### Relasi
- Menghubungkan satu `BUKTI_DUKUNG` ke satu `BAB_DRAFT`, many-to-many secara keseluruhan (satu checkpoint bisa memakai banyak bukti dukung sekaligus; satu bukti dukung bisa dipakai di banyak checkpoint berbeda).

### Fitur terkait
- **Traceability generasi AI**: menjawab pertanyaan "checkpoint versi ke berapa dihasilkan dari bukti dukung apa saja?" — penting untuk transparansi dan pertanggungjawaban isi LED saat diperiksa asesor.
- **Riwayat pemilihan bukti dukung**: memungkinkan user melihat kembali bukti dukung apa yang mereka pilih pada percobaan generate sebelumnya, dan membandingkannya dengan pilihan pada checkpoint lain.

---

## Ringkasan Alur Fitur Utama

### 1. Onboarding organisasi
1. Universitas mendaftar → sistem membuat satu baris `TENANT`.
2. Sistem otomatis membuat satu `USER` dengan `role = ADMIN` untuk tenant tersebut.
3. Admin membuat struktur `PROGRAM_STUDI` di bawah tenant-nya.
4. Admin membuat akun `USER` lain dengan role `PENJAMIN_MUTU`, `PIMPINAN`, atau `PENYUSUN`, masing-masing bisa ditugaskan ke satu prodi tertentu (`program_studi_id`) atau bersifat lintas prodi.

### 2. Penyusunan dokumen LED
1. Penyusun/admin prodi membuat `DOKUMEN_LED` baru untuk suatu tahun akademik.
2. Sistem (atau user) membuat baris-baris `BAB_DOKUMEN` sesuai struktur bab standar LAM Teknik.
3. Penyusun mengetik langsung di editor bab → `konten_kerja` ter-*autosave* terus-menerus.

### 3. Pengelolaan bukti dukung
1. User mengunggah berkas ke `BUKTI_DUKUNG`, menentukan level kepemilikan (`TENANT` atau `PROGRAM_STUDI`).
2. Bukti dukung dapat dikaitkan langsung ke bab tertentu sebagai lampiran resmi (`BUKTI_DUKUNG_BAB`).

### 4. Generasi konten dengan AI (RAG)
1. Penyusun membuka suatu `BAB_DOKUMEN`, memilih satu/lebih `BUKTI_DUKUNG` yang relevan.
2. Penyusun menekan tombol *generate*.
3. Sistem melakukan pencarian semantik (vector search di database eksternal) terhadap panduan LAM Teknik, LKPS, rubrik penilaian, dan isi bukti dukung terpilih.
4. Hasil generate disimpan sebagai `BAB_DRAFT` baru (`sumber = AI`, `referensi_chunk_ids` terisi, dan baris `BUKTI_DUKUNG_DRAFT` dibuat untuk tiap bukti dukung yang dipakai).
5. Penyusun dapat menerima hasil tersebut (menimpa `konten_kerja` bab) atau membandingkannya dengan checkpoint lain sebelum memutuskan.

### 5. Checkpoint & pemulihan versi
1. Sebelum melakukan perubahan besar (generate ulang, revisi drastis), penyusun dapat membuat checkpoint manual (`sumber = MANUAL`) untuk mengamankan versi saat ini.
2. Setiap checkpoint (`BAB_DRAFT`) bersifat permanen/immutable dan diberi nomor `versi` berurutan.
3. Jika penyusun ingin kembali ke versi lama, mereka memilih checkpoint yang diinginkan → sistem menimpa `konten_kerja` bab dengan `konten_snapshot` checkpoint tersebut, dan memperbarui `checkpoint_aktif_id`. Checkpoint lama tetap tersimpan sebagai riwayat.

### 6. Review & penguncian oleh penjamin mutu
1. Setelah suatu bab dianggap siap direview, penjamin mutu memeriksa isi `konten_kerja` dan riwayat `BAB_DRAFT`-nya.
2. Penjamin mutu dapat memberi `catatan_penjamin_mutu` dan mengaktifkan `terkunci = true` untuk mencegah perubahan lebih lanjut oleh penyusun selama proses review berlangsung.
3. Setelah review selesai (baik untuk direvisi lebih lanjut atau dianggap final), penjamin mutu dapat membuka kembali kunci (`terkunci = false`) agar penyusun dapat melanjutkan pengerjaan.