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

Tiap lapis berdiri sebagai **root URL sendiri**, bukan bersarang di bawah URL lapis di atasnya. Jadi begitu pengguna masuk lebih dalam, alamatnya ikut berganti akar — sejalan dengan sidebar yang juga berganti total.

```
/dashboard ................................ ← level TENANT
 ├─ /dashboard/study-programs              Manajemen + Daftar Program Studi
 ├─ /dashboard/users                       Manajemen User
 ├─ /dashboard/led-projects                Daftar Dokumen LED lintas prodi ────┐
 └─ /dashboard/evidence                    Perpustakaan Bukti Dukung (TENANT)  │
      │ klik nama Program Studi                                                │
      ▼                                                                        │
/study-programs/:programId ................ ← level PROGRAM_STUDI              │
 ├─ tombol "← Kembali" (ke Dashboard Utama; disembunyikan untuk PENYUSUN)      │
 ├─ (index)                                Dashboard Prodi (kesiapan akreditasi)│
 ├─ /led-projects                          Daftar Dokumen LED prodi ini        │
 └─ /evidence                              Perpustakaan Bukti Dukung (PRODI)   │
      │ klik salah satu Dokumen LED                                            │
      ▼                                                                        ▼
/led-projects/:projectId .................. ← level DOKUMEN_LED, sidebar terpisah total
 ├─ tombol "← Kembali" (ke Dashboard Prodi pemilik dokumen)
 ├─ Progres Dokumen (ringkasan + progres per bab)
 └─ Navigasi ke Editor per Bab
      │ klik salah satu Bab
      ▼
/editor/:projectId/:chapterId ............. ← level BAB_DOKUMEN, dua sidebar ala Figma
 ├─ Sidebar kiri: Daftar Isi / navigasi antar bab
 ├─ Kanvas tengah: rich text editor
 └─ Sidebar kanan: tab Generasi, Draft, Rujukan, Rubrik, Skor
```

> **Catatan desain — kenapa Editor Bab akar sendiri, bukan anak `/led-projects/:projectId`.** Rancangan awal menuliskannya `/led-projects/:projectId/chapters/:babId`, bersarang di bawah lapis 3. Yang dipakai justru akar keempat, dengan alasan yang sama seperti tiga lapis sebelumnya berdiri sendiri: tampilan Editor Bab nol chrome — tiga kolom penuh layar tanpa satu pun bagian `AppShell` lapis 3 — sehingga bersarang hanya menyisakan induk yang merender `<Outlet/>` telanjang plus sidebar yang harus disembunyikan sendiri.
>
> Ada satu jalan masuk tambahan: `/editor/:projectId` tanpa menyebut bab meneruskan ke bab yang paling baru disimpan (bab pertama untuk dokumen yang belum pernah disentuh). Itulah yang dipakai menu **Editor Dokumen** di sidebar lapis 3, supaya aturan "bab mana yang dibuka" cuma hidup di satu tempat.

Setiap lapis punya sidebar/navigasi yang **berbeda total** dari lapis sebelumnya (bukan sub-tab di halaman yang sama) — perpindahan antar lapis selalu lewat aksi klik eksplisit (klik nama prodi, klik card dokumen, klik nama bab), dan selalu ada tombol kembali ke satu level di atasnya.

> **Catatan desain — kenapa prodi ada di URL, bukan di session.** `USER.program_studi_id` hanya terisi untuk `PENYUSUN`; `PIMPINAN` dan `PENJAMIN_MUTU` justru harus bisa membuka prodi mana pun (§5), sehingga konteks prodi mereka tidak bisa diturunkan dari session dan harus dipilih lewat navigasi. Menaruh `:programId` di URL membuat pilihan itu bertahan saat halaman dimuat ulang dan bisa dibagikan lewat tautan, sekaligus memberi satu titik penjagaan hak akses per lapis alih-alih menyebar penyaringan ke tiap daftar. Konsekuensinya, `/dashboard/led-projects` (lintas prodi) dan `/study-programs/:id` (satu prodi) adalah dua jalan masuk berbeda ke dokumen yang sama — keduanya sengaja dipertahankan.
>
> `/dashboard/study-programs/:programId/edit` (manajemen) dan `/study-programs/:programId` (ruang kerja) tidak bertabrakan karena berada di akar yang berbeda.

---

## 4. Dashboard Utama

**Diakses oleh**: `ADMIN`, `PIMPINAN`, `PENJAMIN_MUTU`. (`PENYUSUN` tidak pernah melihat halaman ini.)

### 4.0 Ringkasan Kesiapan Institusi

Halaman index lapis ini (`/dashboard`) menjawab satu pertanyaan: **seberapa siap universitas ini menghadapi akreditasi, dan prodi mana yang tertinggal.** Subjeknya universitas, bukan daftar menunya.

> **Catatan desain — kartu penaut dibuang.** Versi awal halaman ini berisi empat kartu penaut (Program Studi, Dokumen LED, User, Bukti Dukung) yang isinya persis menu sidebar, difilter per role dengan aturan yang sama. Itu salinan kedua tanpa nilai tambah, sementara satu-satunya halaman yang bisa menjawab pertanyaan pimpinan justru dibiarkan kosong. Alasannya sama dengan yang membuang daftar riwayat siklus dari Dashboard Prodi (§5.1c): kalau sidebar sudah jadi jalan masuk yang jelas, mendaftarnya ulang di badan halaman hanya meramaikan.

**Aturan utama halaman ini: satu blok, satu kerangka waktu** — aturan yang sama dengan §5.1, dan yang secara khusus diperingatkan PRD §3.8 untuk level institusi. Halaman disusun jadi empat blok yang masing-masing menyebut kerangkanya sendiri:

| Blok | Kerangka waktu | Sumber |
| --- | --- | --- |
| **Posisi Akreditasi** (§4.0a) | Masa lalu — capaian yang sudah disahkan | `PROGRAM_STUDI` |
| **Siklus Berjalan Se-Universitas** (§4.0b) | Sekarang — usaha seluruh prodi | `DOKUMEN_LED` aktif beserta `BAB_DOKUMEN`-nya |
| **Kesiapan per Prodi** (§4.0c) | Sekarang, per prodi — inti halaman | gabungan keduanya, satu baris per prodi |
| **Sumber Daya Institusi** (§4.0d) | Lintas siklus — bekal universitas | `BUKTI_DUKUNG` tenant, `USER` |

**Tidak ada aturan hitung baru di halaman ini.** Seluruh angkanya memanggil ulang fungsi domain yang sudah dipakai Dashboard Prodi dan Dashboard Project LED — `summarizeChapters`, `summarizeEvidence`, `pickSiklusAktif`, `buildProgramAttention`, `deriveDeadline`, `deriveAccreditationValidity`. Yang benar-benar baru hanya cara mengagregasi dan cara mengurutkan baris. Konsekuensi yang disengaja: angka satu baris di §4.0c **wajib** sama persis dengan Dashboard Prodi yang dituju barisnya; kalau berbeda, berarti ada aturan yang tersalin, bukan dipakai ulang.

**Tidak ada satu pun aksi ubah data di halaman ini**, jadi satu-satunya yang disembunyikan per role (§1) adalah tautan Manajemen User di §4.0d — penjagaan selebihnya sudah selesai di lapis rutenya.

#### 4.0a Blok Posisi Akreditasi

Satu kartu berisi **distribusi** peringkat: `UNGGUL`, `BAIK_SEKALI`, `BAIK`, `BELUM_TERAKREDITASI`, masing-masing jumlah prodi. Di bawahnya dua angka urgensi bila memang ada isinya: jumlah prodi yang masa berlakunya sudah habis, dan jumlah yang tersisa ≤ 365 hari.

Disajikan sebagai distribusi, **bukan rata-rata**: peringkat itu ordinal, dan "rata-rata Unggul dan Baik" bukan besaran yang punya arti.

Prodi `BELUM_TERAKREDITASI` masuk komposisi sebagai kategorinya sendiri dan **tidak** ikut dihitung kedaluwarsa — `berlaku_sampai_akreditasi` kosong berarti "tidak ada", bukan "sudah lewat" (§5.1e).

Baris urgensi tidak dirender bila nol. Baris "0 prodi kedaluwarsa" yang selalu ada justru melatih pembaca mengabaikan tempat itu.

#### 4.0b Blok Siklus Berjalan Se-Universitas

Empat kartu angka yang **seluruhnya bercakupan siklus berjalan** — tidak ada peringkat akreditasi maupun akumulasi lintas siklus di baris ini:

| Kartu | Isi | Dihitung dari |
| --- | --- | --- |
| **Prodi Bersiklus** | `n/total` prodi yang punya siklus berjalan, bar persentase | `pickSiklusAktif().aktif != null` per prodi |
| **Kelengkapan Bab** | `n/total` bab terisi **agregat lintas prodi**, bar persentase | jumlah `konten_kerja` tidak kosong pada seluruh siklus aktif |
| **Kesiapan Review** | `n/total` bab terkunci agregat, bar persentase | `terkunci = true` |
| **Tenggat Berisiko** | jumlah siklus dengan tenggat `LEWAT` atau `DEKAT`, diwarnai urgensi | `DOKUMEN_LED.tenggat` |

Agregasi memakai **jumlah bab lintas prodi**, bukan rata-rata persen antar prodi. Pertanyaannya "berapa banyak pekerjaan yang sudah jadi", sehingga prodi dengan bab lebih banyak memang harus berbobot lebih; rata-rata persen memberi bobot sama ke tiap prodi sehingga satu prodi kecil yang tuntas bisa menutupi prodi besar yang mandek.

Prodi tanpa siklus berjalan menyumbang nol ke pembilang **dan** penyebut kartu bab. Ia sudah terhitung di kartu Prodi Bersiklus, dan menghitungnya lagi sebagai bab kosong berarti satu keadaan yang sama dihukum dua kali.

Siklus tanpa `tenggat` tidak ikut dihitung berisiko: tidak dipatok adalah pilihan yang sah (§14), bukan keterlambatan.

#### 4.0c Blok Kesiapan per Prodi

Tabel, satu baris per prodi, seluruh prodi tenant. Inilah yang menjawab "prodi mana yang tertinggal".

| Kolom | Isi | Keadaan kosong |
| --- | --- | --- |
| **Program Studi** | nama, `jenjang`, `fakultas`; tautan ke Dashboard Prodi | — |
| **Akreditasi** | badge `peringkat_akreditasi` + sisa masa berlaku, diwarnai urgensi | `Belum pernah terakreditasi` |
| **Siklus Berjalan** | badge `status_keseluruhan` + `tahun_akademik` | `Belum ada` |
| **Kelengkapan Bab** | `n/total` + bar persentase | `—` bila tanpa siklus |
| **Kesiapan Review** | `n/total` | `—` bila tanpa siklus |
| **Sisa Tenggat** | sisa waktu ke `tenggat`, diwarnai urgensi | `Tidak dipatok` (ada siklus) / `—` (tanpa siklus) |
| **Perlu Perhatian** | jumlah item + jumlah yang mendesak, diwarnai severitas tertinggi | `Tidak ada` |

**Urutan default: paling perlu ditindak di atas**, bukan alfabet. Halaman ini dibaca dari atas, jadi hal pertama yang terlihat harus hal yang perlu ditindak; mengurutkan menurut nama memindahkan pekerjaan mencari "siapa yang tertinggal" kembali ke pembacanya. Urutannya deterministik:

| Urutan | Pembanding |
| --- | --- |
| 1 | jumlah item `MENDESAK` (terbanyak dulu) |
| 2 | jumlah item `PERLU_DITINDAK` (terbanyak dulu) |
| 3 | persentase kelengkapan bab siklus berjalan (terkecil dulu; prodi tanpa siklus dianggap 0) |
| 4 | nama prodi, sebagai pemutus agar urutannya tidak berubah antar render |

Kolom Perlu Perhatian memadatkan panel senama di §5.1c — aturan pemicunya sama persis, rinciannya memang tempatnya di prodi masing-masing.

Tabel ini sengaja **tanpa pencarian, pengurutan, dan paginasi**, dengan alasan yang sama seperti tabel bab di §6.1: jumlah prodi tetap dan urutan risikonya adalah cara tabel ini dibaca, jadi mengacaknya justru merusaknya. Ini memang berbeda dari §4.6/§5.3 yang daftarnya untuk dijelajahi.

#### 4.0d Blok Sumber Daya Institusi

Dua kartu, diberi label kerangka waktunya sendiri supaya tidak terbaca sebagai ukuran siklus berjalan:

- **Bukti Dukung Universitas** — `n/total` berkas `SIAP`, jumlah yang masih diproses, jumlah `GAGAL`, waktu unggah terakhir, dan tombol ke Perpustakaan Bukti Dukung tenant. Angkanya **hanya berkas `owner_tipe = TENANT`** supaya cocok dengan daftar di halaman yang dituju (§4.4) — aturan yang sama dengan panel Bukti Dukung Prodi di §5.1c.
- **Tim Penyusun** — jumlah prodi yang belum punya `USER` berrole `PENYUSUN`. Prodi tanpa Penyusun bukan angka biasa: dokumennya tidak akan pernah bergerak, jadi keadaan itu ditampilkan sebagai peringatan. Tautan ke Manajemen User **hanya dirender untuk `PIMPINAN`** (§1) — `PENJAMIN_MUTU` tidak punya menu itu sama sekali (§4.2), jadi menyodorkan tautannya hanya berujung pengalihan.

#### 4.0e Hak akses di level ini

- `PIMPINAN` dan `PENJAMIN_MUTU` melihat isi yang sama (§4.0a–d). Bedanya cuma tautan Manajemen User di §4.0d.
- `ADMIN` **tidak** melihat satu pun angka progres LED. Ia murni back office dan sudah ditolak di seluruh lapis prodi/dokumen (§6.2) serta di perpustakaan bukti dukung (§4.4); menampilkan agregat kesiapan kepadanya berarti membocorkan lewat ringkasan apa yang sudah ditutup lewat rute. Gantinya ia melihat **ringkasan organisasi** yang memang wewenangnya: jumlah prodi, jumlah akun per role, dan jumlah prodi yang belum punya Penyusun, beserta tautan ke §4.1 dan §4.2.
- Datanya pun tidak dibaca untuk `ADMIN`, bukan sekadar tidak dirender. Selama session belum terbaca, tidak ada cabang yang dirender lebih dulu — agar Admin tidak sempat melihat angka yang bukan haknya.
- `PENYUSUN` tidak pernah sampai ke sini (§2).

#### 4.0f Yang sengaja belum ditampilkan

Mengikuti alasan yang sama dengan §5.1f dan §6.1 — kolom yang selalu berisi "—" hanya menambah derau:

- **Ringkasan skor rubrik per prodi** — diminta PRD §3.8 ("skor rata-rata per prodi"), tapi `RUBRIK_KRITERIA`/`HASIL_SKOR_KRITERIA` belum ada. Masuk bersama Simulasi Skor (§9).
- **Grafik tren antar siklus** — baru bermakna setelah ada beberapa siklus dengan skor.
- **Siapa sedang menyunting** — datanya hidup di Redis (§13), bukan di basis data.

Satu hal lagi yang sengaja **tidak** dilakukan: halaman ini tidak memanggil pembuatan bab otomatis (§6.1b). Ia murni baca, dan memicu penulisan dari halaman ringkasan berarti membuka dashboard diam-diam mengubah penyimpanan. Dokumen yang belum punya baris `BAB_DOKUMEN` terbaca `0/0` sampai dashboard dokumennya dibuka — itu memang keadaan sebenarnya.

#### 4.0g Kasus Uji — Ringkasan Kesiapan Institusi

| #   | Kondisi                                                        | Aksi                                             | Hasil yang diharapkan                                                                                                              |
| --- | -------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pimpinan atau Penjamin Mutu                                     | Buka `/dashboard`                                | Keempat blok tampil; baris kartu Siklus Berjalan **tidak** memuat peringkat akreditasi maupun akumulasi bukti dukung lintas siklus   |
| 2   | Prodi mana pun di tabel                                         | Bandingkan barisnya dengan `/study-programs/:id`  | Kelengkapan Bab, Kesiapan Review, Sisa Tenggat, dan jumlah Perlu Perhatian **sama persis** dengan Dashboard Prodi                    |
| 3   | Satu prodi punya tenggat yang sudah lewat                       | Buka `/dashboard`                                | Prodi itu berada di **puncak** tabel, kolom Perlu Perhatian merah dan menyebut jumlah yang mendesak                                  |
| 4   | Lanjutan #3                                                     | Ubah tenggatnya ke masa depan lewat Edit Dokumen LED | Urutan tabel dan kartu Tenggat Berisiko ikut berubah tanpa muat ulang manual                                                     |
| 5   | Prodi belum punya `DOKUMEN_LED` sama sekali                     | Lihat barisnya                                    | Kolom Siklus berbunyi `Belum ada`; kolom bab, review, dan tenggat berisi `—`, bukan `0/0` atau `0 hari`                              |
| 6   | Prodi `BELUM_TERAKREDITASI`                                     | Lihat barisnya dan blok Posisi Akreditasi        | Baris berbunyi "Belum pernah terakreditasi"; prodi itu masuk komposisi tapi **tidak** ikut hitungan kedaluwarsa                      |
| 7   | Siklus berjalan tanpa `tenggat`                                 | Lihat barisnya dan kartu Tenggat Berisiko        | Baris berbunyi `Tidak dipatok` tanpa warna urgensi; siklus itu tidak ikut dihitung berisiko                                         |
| 8   | Ada prodi yang seluruh dokumennya `SELESAI`                     | Lihat kartu Kelengkapan Bab                      | Bab prodi itu tidak ikut penyebut; angkanya hanya menghitung prodi yang bersiklus                                                   |
| 9   | Tidak ada prodi yang kedaluwarsa maupun mendekati               | Lihat blok Posisi Akreditasi                     | Baris urgensi tidak dirender sama sekali, bukan "0 prodi kedaluwarsa"                                                              |
| 10  | Pimpinan                                                        | Lihat kartu Tim Penyusun                         | Tombol "Kelola penugasan" dirender                                                                                                 |
| 11  | Penjamin Mutu                                                   | Lihat kartu yang sama                            | Angkanya identik, tombol "Kelola penugasan" **tidak** dirender                                                                     |
| 12  | Admin                                                           | Buka `/dashboard`                                | Hanya ringkasan organisasi; tidak ada satu pun angka kelengkapan bab, kesiapan review, tenggat, atau tabel prodi yang pernah dirender |
| 13  | Bukti dukung level **prodi** yang `GAGAL`, tenant tidak punya   | Lihat kartu Bukti Dukung Universitas             | Kartunya tidak menyebut kegagalan itu — cakupannya hanya `owner_tipe = TENANT`                                                     |
| 14  | Unggah bukti dukung tenant dari `/dashboard/evidence`           | Kembali ke `/dashboard`                          | Kartu Bukti Dukung Universitas ikut berubah tanpa muat ulang                                                                       |
| 15  | Tenant belum punya `PROGRAM_STUDI` sama sekali                  | Buka `/dashboard`                                | Tabel diganti kalimat "Belum ada program studi", bukan tabel kosong tanpa konteks                                                  |
| 16  | Dokumen LED yang belum punya baris `BAB_DOKUMEN`                | Lihat barisnya, lalu buka dashboard dokumennya   | Terbaca `0/0` di tabel institusi; babnya baru dibuat saat dashboard dokumen dibuka (§6.1b), bukan saat `/dashboard` dibuka          |
| 17  | Layar sempit (< 1280px)                                         | Buka `/dashboard`                                | Tabel bergulir horizontal di dalam wadahnya sendiri; halaman tidak ikut menggulir ke samping                                       |
| 18  | Penyusun                                                        | Ketik `/dashboard` di address bar                | Dialihkan ke Dashboard Prodi-nya; isi halaman tidak pernah dirender                                                                |

### 4.1 Manajemen Program Studi

- **Akses**: `ADMIN`, `PIMPINAN`.
- Membuat, mengedit `PROGRAM_STUDI` (kolom `nama`, terikat ke `TENANT` lewat `tenant_id`).
- `PENJAMIN_MUTU` tidak punya menu ini sama sekali (sesuai keputusan: Penjamin Mutu tidak mengelola user/prodi).

### 4.2 Manajemen User

- **Membuat user baru** (`USER.role`, `email`, `password_hash`, dsb) — hanya `ADMIN`.
- **Assign/edit `program_studi_id`** seorang user (khusus untuk menempatkan `PENYUSUN` ke prodi tertentu) — hanya `PIMPINAN`.
- `PENJAMIN_MUTU` tidak punya menu ini sama sekali.

### 4.3 Daftar Program Studi (navigasi)

- Daftar seluruh `PROGRAM_STUDI` di tenant tersebut; nama prodi diklik untuk masuk ke **Dashboard Prodi** terkait.
- Terlihat oleh `ADMIN`, `PIMPINAN`, `PENJAMIN_MUTU`.

> **Catatan desain — digabung dengan §4.1.** Daftar navigasi ini dan menu manajemen di §4.1 ditempatkan pada satu halaman yang sama (`/dashboard/study-programs`), bukan dua halaman terpisah. `PENJAMIN_MUTU` ikut melihat daftarnya sebagai jalan masuk ke Dashboard Prodi, tetapi tombol "Tambah Prodi" dan kolom aksi (edit/hapus) disembunyikan sepenuhnya untuknya sesuai prinsip §1 — sehingga larangan "tidak punya menu manajemen" di §4.1 tetap terjaga tanpa menduplikasi daftar yang isinya identik.

### 4.4 Perpustakaan Bukti Dukung (level Tenant)

- Menampilkan seluruh `BUKTI_DUKUNG` dengan `owner_tipe = TENANT` dan `tenant_id` sesuai tenant user.
- **Upload**: `PIMPINAN`, `PENJAMIN_MUTU`. `ADMIN` tidak punya akses ke bukti dukung sama sekali (murni back office).

> **Catatan desain — penolakan Admin ditegaskan di halaman, bukan cuma di sidebar.** Penjaga lapis tenant meloloskan `ADMIN` karena ia memang berwenang atas menu organisasi lain di lapis yang sama, sementara menu "Bukti Dukung" hanya disembunyikan dari sidebar-nya. Menyembunyikan menu saja tidak cukup — URL tetap bisa diketik langsung — jadi halaman ini menolak `ADMIN` secara eksplisit dan memulangkannya ke Dashboard Utama.

#### 4.4.1 Target unggahan dari lapis tenant

Satu batch unggahan punya **satu target** yang dipilih sebelum berkas dikirim, berlaku untuk seluruh berkas dalam batch itu:

- **Universitas** → `owner_tipe = TENANT`, berlaku lintas prodi.
- **Salah satu prodi** → `owner_tipe = PROGRAM_STUDI`; berkasnya tidak muncul di perpustakaan tenant, melainkan langsung di perpustakaan prodi tujuan.

Mau mencampur dua level dalam sekali kerja? Unggah dua kali. Pemilihan target per berkas sengaja tidak disediakan karena membuat baris antrean ramai dan memperbesar peluang salah pilih, sementara kebutuhan mencampur level dalam satu batch jarang terjadi.

### 4.5 Alur Unggah Bukti Dukung (berlaku di kedua lapis)

Berkas tidak melewati server aplikasi. Urutannya:

```
pilih berkas (batch) → minta presigned URL ke backend → PUT langsung ke object storage (R2)
   → lapor ke backend → baris BUKTI_DUKUNG dibuat berstatus MENUNGGU
   → antrean ekstraksi: MENUNGGU → DIPROSES → SIAP | GAGAL
```

- **Batch**: beberapa berkas sekaligus, lewat tarik-lepas maupun pilih berkas. Tiap berkas berdiri sendiri — satu gagal tidak menggugurkan sisanya.
- **Validasi sebelum kirim**: tipe berkas (PDF, DOC/DOCX, XLS/XLSX, JPG, PNG) dan batas ukuran 25 MB per berkas diperiksa di modal. Berkas yang tidak lolos ditandai dengan alasannya dan tidak ikut terkirim; berkas lain tetap jalan.
- **Progres di panel melayang**: begitu tombol unggah ditekan, modal tertutup dan progres tiap berkas pindah ke panel kecil di pojok kanan bawah. Panel ini dipasang di akar aplikasi, jadi unggahan terus berjalan dan tetap terlihat meski pengguna berpindah halaman atau berpindah lapis ruang kerja.
- **Gagal saat unggah** (jaringan/storage) → baris di panel menampilkan alasannya dengan tombol coba lagi; tidak ada baris `BUKTI_DUKUNG` yang tercipta.
- **Gagal saat ekstraksi** → barisnya sudah ada dan tetap tampil di perpustakaan berstatus `GAGAL` beserta catatan; ekstraksi bisa diulang tanpa mengunggah berkasnya lagi.
- Bukti dukung berstatus selain `SIAP` tetap terlihat di daftar, tapi belum bisa dipakai sebagai konteks AI (PRD §3.3).

### 4.6 Tampilan Perpustakaan Bukti Dukung

Berlaku sama di lapis tenant maupun prodi:

- **Dua mode tampilan**: kartu ala penjelajah berkas (bawaan) dan tabel. Tombol ganti mode ada di toolbar; pilihannya tersimpan di peramban sebagai selera pribadi, bukan bagian dari konteks halaman.
- **Pencarian, urutan, halaman, dan jumlah baris hidup di URL** (`?q=&sort=&dir=&page=&limit=`) — sehingga tautan bisa dibagikan dan muat ulang halaman tidak menghilangkan konteks. Mengubah kata kunci atau urutan otomatis mengembalikan ke halaman 1.
- Penyaringan, pencarian, pengurutan, dan pemotongan halaman dianggap **pekerjaan sisi sumber data**, bukan sisi tampilan: daftar hanya menerima satu halaman data beserta jumlah totalnya.
- **Detail berkas** dibuka lewat panel geser dari kanan (klik kartu atau baris): metadata lengkap, tahap pemrosesan, serta tombol coba lagi/hapus sesuai hak akses. Panelnya ikut memperbarui status bila ekstraksi selesai selagi panel terbuka.
- **Keadaan kosong dibedakan**: "belum ada bukti dukung" (mengajak mengunggah, tombolnya hanya untuk yang berhak) berbeda dari "tidak ada yang cocok dengan pencarian" (mengajak membersihkan kata kunci).

### 4.7 Kasus Uji — Perpustakaan & Unggah Bukti Dukung

| #   | Kondisi                                          | Aksi                                          | Hasil yang diharapkan                                                                                                     |
| --- | ------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pimpinan di `/dashboard/evidence`                | Unggah 3 berkas, target Universitas           | Modal tertutup, panel melayang muncul, tiap baris naik 0→100%, ketiganya masuk daftar berstatus `MENUNGGU`                  |
| 2   | Lanjutan #1                                      | Tunggu ~8 detik                               | Status berpindah `MENUNGGU` → `DIPROSES` → `SIAP` tanpa muat ulang halaman                                                  |
| 3   | Pimpinan di `/dashboard/evidence`                | Unggah dengan target prodi Teknik Informatika | Berkas **tidak** muncul di daftar tenant, tapi muncul di `/study-programs/1/evidence`                                       |
| 4   | Penyusun di perpustakaan prodinya                | Buka modal unggah                             | Pemilih level tidak dirender; target terkunci ke prodi yang sedang dibuka                                                   |
| 5   | Admin                                            | Ketik `/dashboard/evidence` di address bar    | Dialihkan ke `/dashboard`; isi perpustakaan tidak pernah dirender                                                           |
| 6   | Pimpinan                                         | Unggah berkas `.exe` atau > 25 MB             | Ditolak di modal sebelum terkirim beserta alasannya; berkas lain dalam batch tetap bisa lanjut                              |
| 7   | Ada berkas berstatus `GAGAL`                     | Klik "Coba proses lagi"                       | Status kembali `MENUNGGU` lalu berjalan lagi sampai `SIAP`/`GAGAL`                                                          |
| 8   | Daftar berisi lebih dari satu halaman            | Ketik kata kunci di pencarian                 | Hasil tersaring, halaman balik ke 1, total & jumlah halaman menyesuaikan, kata kunci tercatat di URL                        |
| 9   | Sedang di halaman 2 hasil pencarian              | Muat ulang halaman                            | Kata kunci, halaman, urutan, dan jumlah baris tetap sama karena dibaca dari URL                                             |
| 10  | Mode kartu aktif                                 | Ganti ke tabel, pindah halaman, lalu kembali  | Mode tabel tetap terpilih; `q`/`page`/`sort` tidak hilang                                                                   |
| 11  | Unggahan sedang berjalan                         | Pindah ke halaman lain (mis. Manajemen User)  | Panel melayang tetap tampil dan progresnya terus jalan                                                                      |
| 12  | Penyusun melihat berkas unggahan orang lain      | Buka menu aksi berkas tersebut                | Tombol hapus tidak dirender untuk berkas itu, tapi dirender untuk unggahannya sendiri                                       |
| 13  | Berkas sedang `DIPROSES`, panel detail terbuka   | Tunggu sampai ekstraksi selesai               | Badge status dan tahap pemrosesan di panel ikut berubah tanpa menutup panel                                                 |
| 14  | Perpustakaan prodi yang belum punya bukti dukung | Buka halamannya                               | Keadaan kosong berisi ajakan mengunggah (tombol hanya untuk yang berhak), bukan daftar kosong tanpa konteks                 |

---

## 5. Dashboard Prodi

**Diakses oleh**: `ADMIN`? — tidak. `PIMPINAN`, `PENJAMIN_MUTU` (lewat klik dari Dashboard Utama), dan `PENYUSUN` (landing langsung setelah login).

### 5.1 Ringkasan Kesiapan Prodi

Halaman index lapis ini menjawab satu pertanyaan: **seberapa siap prodi ini menghadapi akreditasi.** Subjeknya prodi, bukan daftar dokumennya.

> **Catatan desain — kenapa bukan daftar kartu.** Versi awal §5.1 merender seluruh `DOKUMEN_LED` prodi sebagai kartu sederajat. Itu memodelkan dunia yang salah: akreditasi LAM Teknik dilakukan per prodi dan berjalan **satu siklus pada satu waktu**, sehingga grid sederajat memberi kesan beberapa dokumen sedang dikerjakan berdampingan. Sekarang siklus yang berjalan ditonjolkan, sisanya turun jadi riwayat ringkas — seluruh dokumen prodi tetap terlihat dan bisa dibuka, sesuai syarat awal.

**Aturan utama halaman ini: satu blok, satu kerangka waktu.** Halaman disusun jadi tiga blok yang masing-masing menyebut kerangkanya sendiri:

| Blok | Kerangka waktu | Sumber |
| --- | --- | --- |
| **Akreditasi Berjalan** (§5.1a) | Masa lalu — capaian yang sudah disahkan | `PROGRAM_STUDI` |
| **Siklus Berjalan** (§5.1b) | Sekarang — usaha menuju akreditasi berikutnya | `DOKUMEN_LED` aktif beserta `BAB_DOKUMEN`-nya |
| **Sumber daya & riwayat** (§5.1c) | Lintas siklus — bekal dan jejak prodi | `BUKTI_DUKUNG` prodi, `USER`, dokumen arsip |

> **Catatan desain — kenapa akreditasi tidak ikut baris ringkasan.** Versi sebelumnya menaruh "Masa Berlaku Akreditasi" sebagai kartu keempat, sebaris dengan kelengkapan bab dan kesiapan review. Empat kartu sederajat membuat pembaca menyimpulkan keempatnya mengukur hal yang sama, padahal peringkat "Baik Sekali" beserta masa berlakunya adalah **hasil siklus sebelumnya** — bukan ukuran pekerjaan yang sedang berjalan. Kartu ketiganya pun menghitung akumulasi bukti dukung lintas siklus, sehingga satu baris itu memuat tiga kerangka waktu sekaligus. Sejak itu baris ringkasan hanya boleh memuat angka siklus berjalan; capaian lampau naik ke blok akreditasi, sumber daya lintas siklus turun ke panel samping.

**Tidak ada satu pun aksi ubah data di halaman ini**, jadi tidak ada tombol yang perlu disembunyikan per role (§1) — penjagaannya sudah selesai di lapis rutenya, dan seluruh role yang berhak melihat isi yang sama.

#### 5.1a Blok Akreditasi Berjalan

Satu kartu berlabel "Akreditasi Berjalan": nama, `jenjang`, `fakultas`, `kode`, `ketua_prodi`, badge `peringkat_akreditasi`, `nomor_sk_akreditasi`, serta `berlaku_sampai_akreditasi` beserta sisa waktunya. Sisa waktu diwarnai sesuai urgensi (§5.1d).

Prodi `BELUM_TERAKREDITASI` menampilkan "Belum pernah terakreditasi" secara eksplisit, bukan baris kosong: tidak pernah punya peringkat berbeda dari peringkat yang masa berlakunya habis.

#### 5.1b Blok Siklus Berjalan

Kepala blok memuat judul dokumen, `tahun_akademik`, badge `status_keseluruhan`, dan tombol **Buka Dokumen** menuju Dashboard Project LED. Di bawahnya empat kartu angka yang **seluruhnya bercakupan siklus ini**:

| Kartu | Isi | Dihitung dari |
| --- | --- | --- |
| **Bab Terisi** | `n/total` bab yang sudah ada isinya, beserta bar persentase | `konten_kerja` tidak kosong pada bab dokumen aktif |
| **Kesiapan Review** | `n/total` bab yang sudah dikunci Penjamin Mutu | `terkunci = true` |
| **Bukti Dukung Dipakai** | Jumlah berkas **unik** yang dirujuk seluruh bab siklus ini, dengan "dari N tersedia" sebagai keterangan | `BUKTI_DUKUNG_BAB`; pembanding = tenant + prodi, sama dengan §6.1 |
| **Sisa Tenggat** | Sisa waktu ke `tenggat`, diwarnai sesuai urgensi; tanggalnya jadi keterangan | `DOKUMEN_LED.tenggat` |

Bab hanya dihitung dari siklus berjalan. Mencampur dokumen lama yang sudah tuntas akan membuat angkanya selalu terlihat bagus dan justru menyembunyikan pekerjaan yang belum jalan.

Dokumen tanpa `tenggat` menampilkan **"Tidak dipatok"**, bukan "—": tidak dipatok adalah pilihan yang sah (§14), sedangkan "—" terbaca sebagai data yang hilang.

Seluruh blok ini diganti satu kartu keadaan kosong bila tidak ada siklus berjalan. Prodi yang belum punya dokumen sama sekali dan prodi yang seluruh dokumennya `SELESAI` adalah dua keadaan berbeda, dan kalimatnya pun berbeda.

#### 5.1c Blok sumber daya & riwayat

Kolom utama:

- **Aktivitas Siklus Ini** — bab-bab yang paling baru disimpan, ditutup penanda kapan siklusnya dimulai; dipotong empat baris. Cakupannya sengaja hanya siklus berjalan. Ini bukan jejak audit — jejak permanen hidup di `BAB_DRAFT` — melainkan penanda apakah proses ini masih bergerak.

> **Catatan desain — riwayat siklus tidak didaftar di dashboard.** Versi awal blok ini memuat daftar dokumen lama yang bisa diklik. Setelah §5.3 berdiri, daftar itu jadi salinan kedua dengan isi yang sama tapi tanpa pencarian maupun paginasi, sementara menu sidebar sudah jadi jalan masuk yang jelas ke daftar penuhnya. Dashboard tetap **membaca** daftar dokumen prodi untuk membedakan dua keadaan kosong siklus berjalan, hanya tidak merendernya.

Panel samping:

- **Perlu Perhatian** — berbeda dari panel senama di §6.1 yang murni per bab. Di sini bab hanyalah salah satu sumber, dan urutannya menaruh tanggal di atas kondisi bab: bab kosong wajar bagi dokumen yang baru berjalan, tanggal yang sudah lewat tidak pernah wajar.

  | Urutan | Pemicu |
  | --- | --- |
  | 1 | `tenggat` siklus berjalan sudah lewat |
  | 2 | `berlaku_sampai_akreditasi` sudah lewat |
  | 3 | Belum ada siklus berjalan padahal akreditasi tersisa ≤ 365 hari |
  | 4 | Prodi belum punya `PENYUSUN` |
  | 5 | `tenggat` tersisa ≤ 30 hari |
  | 6 | Masa berlaku akreditasi tersisa ≤ 365 hari |
  | 7 | Ada bukti dukung **milik prodi** berstatus `GAGAL` (diringkas satu baris) |
  | 8 | Sisanya dari aturan bab §6.1c |

  Ditampilkan maksimal lima baris, sisanya diringkas jadi satu baris penunjuk ke Progres Dokumen.

- **Bukti Dukung Prodi** — `n/total` berkas `SIAP`, jumlah yang masih diproses, jumlah yang `GAGAL`, waktu unggah terakhir, dan tombol ke Perpustakaan Bukti Dukung prodi. Angkanya **hanya berkas `owner_tipe = PROGRAM_STUDI`** supaya cocok dengan daftar di halaman yang dituju (§5.2); berkas level tenant tidak ikut. Konsekuensi yang disengaja: kartu "Bukti Dukung Dipakai" di §5.1b memakai pembanding yang lebih luas karena pertanyaannya berbeda — "apa yang boleh dipakai bab" versus "apa isi perpustakaan prodi".

- **Tim Penyusun** — `USER` berrole `PENYUSUN` dengan `program_studi_id` prodi ini. Prodi tanpa Penyusun bukan daftar kosong biasa: dokumennya tidak akan pernah bergerak, jadi keadaan itu ditampilkan sebagai peringatan. Tautan ke Manajemen User sengaja tidak dipasang — halaman ini juga dibuka Penyusun dan Penjamin Mutu yang tidak berhak ke sana (§15).

#### 5.1d Hak akses di level ini

- `PENYUSUN` hanya melihat halaman ini untuk **satu** prodi tempatnya ditugaskan (`USER.program_studi_id`), dan mendarat langsung di sini setelah login (§2).
- `PIMPINAN`/`PENJAMIN_MUTU` bisa membuka Dashboard Prodi mana pun (lintas prodi), karena mereka beroperasi di level tenant.
- `ADMIN` ditolak di lapis ini dan dipulangkan ke Dashboard Utama.

#### 5.1e Siklus berjalan dan sisa waktu adalah turunan, bukan kolom

Tiga nilai yang menggerakkan halaman ini semuanya dihitung saat render:

| Nilai | Aturan |
| --- | --- |
| Siklus berjalan | `status_keseluruhan != SELESAI` dengan `tahun_akademik` terbesar; `createdAt` jadi pemutus untuk tahun yang sama |
| Sisa masa berlaku | Selisih hari ke `berlaku_sampai_akreditasi`. `AMAN` > 365 hari, `MENDEKATI` ≤ 365, `KEDALUWARSA` < 0 |
| Sisa tenggat | Selisih hari ke `tenggat`. `DEKAT` ≤ 30 hari, `LEWAT` < 0 |

> **Catatan desain — kenapa tidak jadi kolom.** Sama seperti status bab di §6.1a, ketiganya murni kebutuhan tampilan. Kolom `is_aktif` akan jadi sumber kebenaran kedua yang bisa tidak sinkron dengan `status_keseluruhan`, sedangkan sisa hari yang disimpan pasti basi begitu tanggal berganti — menjaganya segar butuh pekerjaan terjadwal yang tidak sepadan. Karena itu tiga aturan di atas tidak menambah kolom apa pun ke `docs/database.md`.

**Dibedakan dengan sengaja**: `berlaku_sampai_akreditasi` dan `tenggat` yang kosong berarti "tidak ada", bukan "sudah lewat". Prodi `BELUM_TERAKREDITASI` menyatakan "Belum pernah terakreditasi", dan dokumen tanpa tenggat menyatakan "Tidak dipatok" — bukan keduanya dirender sebagai angka nol atau keterlambatan.

#### 5.1f Yang sengaja belum ditampilkan

Mengikuti alasan yang sama dengan §6.1 — kolom yang selalu berisi "—" hanya menambah derau:

- **Ringkasan skor rubrik prodi** — `RUBRIK_KRITERIA`/`HASIL_SKOR_KRITERIA` belum ada. Masuk bersama Simulasi Skor (§9).
- **Data kuantitatif LKPS** — model datanya masih Pertanyaan Terbuka #3.
- **Grafik tren antar siklus** — baru bermakna setelah ada beberapa siklus dengan skor; sampai itu, bar persentase sudah cukup.

### 5.2 Perpustakaan Bukti Dukung (level Prodi)

- Menampilkan `BUKTI_DUKUNG` dengan `owner_tipe = PROGRAM_STUDI` dan `program_studi_id` sesuai prodi ini.
- **Upload**: `PIMPINAN`, `PENJAMIN_MUTU`, dan `PENYUSUN` (untuk prodinya sendiri).
- Karena `BUKTI_DUKUNG` tidak terikat ke `DOKUMEN_LED` tertentu, bukti dukung yang diunggah di sini otomatis tersedia untuk **semua** `DOKUMEN_LED` milik prodi tersebut (misalnya jika prodi punya beberapa siklus akreditasi/tahun akademik berbeda) — tidak perlu upload ulang.
- **Target unggahan terkunci** ke prodi yang sedang dibuka (`:programId` di URL), jadi pemilih level tidak dirender sama sekali di sini. Mau mengunggah untuk prodi lain atau untuk universitas? Lewat perpustakaan level tenant (§4.4.1). Alur unggah, status ekstraksi, dan bentuk tampilannya sama persis dengan §4.5 dan §4.6.
- **Hapus**: `PIMPINAN` dan `PENJAMIN_MUTU` boleh menghapus bukti dukung apa pun; `PENYUSUN` hanya berkas yang ia unggah sendiri. Sesuai §1, tombol hapus untuk berkas milik orang lain **tidak dirender** bagi Penyusun, bukan sekadar dinonaktifkan.

### 5.3 Daftar Dokumen LED (khusus prodi ini)

`/study-programs/:programId/led-projects` — seluruh `DOKUMEN_LED` dengan `program_studi_id` sesuai prodi yang sedang dibuka, dalam bentuk tabel penuh. Inilah yang memenuhi syarat "seluruh Dokumen LED prodi terlihat"; Dashboard Prodi (§5.1) hanya menonjolkan siklus yang berjalan.

| Kolom | Isi |
| --- | --- |
| **Judul Proyek** | Tautan langsung ke Dashboard Project LED (Lapis 3) |
| **Tahun Akademik** | `tahun_akademik` |
| **Status** | Badge `status_keseluruhan` |
| **Tenggat** | Tanggal `tenggat`; kosong ditulis `—`, dan yang sudah lewat/mendekat diberi warna peringatan |
| **Tanggal Dibuat** | `createdAt` |
| **Aksi** | Ubah & hapus — hanya dirender untuk `PENJAMIN_MUTU` (§15) |

> **Catatan desain — kolom Program Studi dibuang.** Daftar lintas prodi di §4 memakainya sebagai jalan masuk ke Dashboard Prodi, tapi di sini seluruh baris memuat nilai yang sama sehingga kolomnya hanya mengulang judul halaman. Sebaliknya kolom **Tenggat** hanya ada di sini: di daftar lintas prodi ia belum tentu terbaca sebagai milik siapa, sedangkan di konteks satu prodi ia langsung menjawab "mana yang tersendat".

> **Catatan desain — "—" di tabel, bukan "Tidak dipatok".** Kartu ringkasan §5.1b menulis kalimat penuh karena berdiri sendiri; di dalam tabel judul kolom sudah menyebut artinya, dan kalimat panjang di tiap baris justru meramaikannya.

- **Tambah Dokumen LED** — hanya `PENJAMIN_MUTU`. Formulirnya tetap yang di lapis tenant, tapi dibuka dengan prodi yang sedang dibuka sebagai nilai awal (`?studyProgramId=`) dan tujuan pulang ke daftar ini (`?returnTo=`), supaya ia tidak perlu memilih ulang prodi yang sudah ia ketahui dan tidak terlempar ke lapis tenant setelah menyimpan. `returnTo` disaring hanya menerima path internal.
- **Pencarian, urutan, halaman, dan jumlah baris hidup di URL** (`?q=&sort=&dir=&page=&limit=`), sama seperti §4.6. Penyaringan sampai pemotongan halaman dikerjakan repository, bukan komponen tabel.
- `PENYUSUN` melihat daftar ini hanya untuk prodinya sendiri; `PIMPINAN` melihatnya lintas prodi tapi tanpa aksi apa pun.

### 5.4 Kasus Uji — Dashboard Prodi & Daftar Dokumen LED

| #   | Kondisi                                                              | Aksi                                          | Hasil yang diharapkan                                                                                                          |
| --- | -------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Prodi mana pun                                                        | Baca baris ringkasan Siklus Berjalan          | Keempat kartunya bercakupan siklus itu saja — tidak ada peringkat/masa berlaku akreditasi maupun akumulasi lintas siklus di sana |
| 2   | Prodi punya satu dokumen `DRAFT` dan satu `SELESAI`                   | Buka `/study-programs/:id`                    | Yang `DRAFT` jadi blok Siklus Berjalan; yang `SELESAI` tidak dirender di dashboard sama sekali, hanya di §5.3                   |
| 3   | Seluruh dokumen prodi berstatus `SELESAI`                            | Buka Dashboard Prodi                          | Blok Siklus Berjalan diganti "Tidak ada siklus yang berjalan"; seluruh dokumen tetap bisa dibuka lewat menu Dokumen LED         |
| 4   | Prodi belum punya `DOKUMEN_LED` sama sekali                          | Buka Dashboard Prodi                          | Muncul "Belum ada Dokumen LED" (kalimat berbeda dari #3); Aktivitas Siklus Ini menyatakan belum ada siklus, bukan daftar kosong |
| 5   | Prodi `BELUM_TERAKREDITASI` (`berlaku_sampai_akreditasi` kosong)      | Buka Dashboard Prodi                          | Kartu akreditasi berbunyi "Belum pernah terakreditasi"; tidak ada item "kedaluwarsa" di Perlu Perhatian                         |
| 6   | Siklus berjalan tanpa `tenggat`                                      | Buka Dashboard Prodi                          | Kartu Sisa Tenggat berbunyi "Tidak dipatok" tanpa warna urgensi, dan tidak ada item tenggat di Perlu Perhatian                  |
| 7   | Siklus berjalan dengan `tenggat` di masa lalu                        | Buka Dashboard Prodi                          | Kartu Sisa Tenggat merah "terlambat N hari", dan item "Tenggat dokumen sudah lewat" berada di **puncak** Perlu Perhatian        |
| 8   | Lanjutan #6                                                          | Isi `tenggat` lewat Edit Dokumen LED          | Dashboard Prodi ikut berubah tanpa perlu muat ulang manual                                                                     |
| 9   | Prodi tanpa `USER` berrole `PENYUSUN`                                | Buka Dashboard Prodi                          | Panel Tim Penyusun berisi peringatan beserta cara menugaskannya, dan muncul item "Prodi belum punya Penyusun" di Perlu Perhatian |
| 10  | Prodi punya bukti dukung sendiri                                     | Bandingkan panel Bukti Dukung Prodi dengan `/study-programs/:id/evidence` | Total di panel **sama persis** dengan jumlah data di perpustakaan; berkas level tenant tidak ikut terhitung                     |
| 11  | Hanya berkas level **tenant** yang `GAGAL`, prodi tidak punya berkas | Buka Dashboard Prodi                          | Perlu Perhatian **tidak** memuat item bukti dukung gagal — kegagalan itu bukan pekerjaan prodi ini                              |
| 12  | Bukti dukung **milik prodi** ada yang `GAGAL`                        | Buka Dashboard Prodi                          | Panel Bukti Dukung Prodi menyebut jumlah yang gagal, dan Perlu Perhatian memuat satu baris ringkas — bukan satu baris per berkas |
| 13  | Perlu Perhatian berisi lebih dari lima hal                           | Buka Dashboard Prodi                          | Hanya lima baris dirender, ditutup baris "…dan N hal lain" yang menunjuk ke Progres Dokumen                                     |
| 14  | Siklus berjalan punya beberapa bab yang pernah disimpan              | Baca Aktivitas Siklus Ini                     | Berisi bab-bab terbaru + penanda siklus dimulai; **tidak** memuat unggahan bukti dukung yang berlaku lintas siklus              |
| 15  | Penyusun prodi tersebut                                              | Login                                         | Mendarat langsung di Dashboard Prodi-nya; tombol "← Dashboard Utama" dan breadcrumb "Dashboard" tidak dirender                  |
| 16  | Admin                                                                | Ketik `/study-programs/1` di address bar      | Dialihkan ke `/dashboard`; isi Dashboard Prodi tidak pernah dirender                                                            |
| 17  | Prodi tersimpan sebelum kolom identitas akreditasi ada               | Buka Dashboard Prodi                          | Field yang belum terisi tampil sebagai "Belum diisi", bukan `undefined`; halaman tetap merender penuh                            |
| 18  | Layar sempit (< 1280px)                                              | Buka Dashboard Prodi                          | Panel samping turun ke bawah kolom utama; tidak ada scroll horizontal pada halaman                                             |
| 19  | Penjamin Mutu                                                        | Buka `/study-programs/1/led-projects`         | Hanya dokumen prodi 1 yang tampil (bukan lintas prodi); tombol Tambah dan kolom Aksi dirender                                   |
| 20  | Pimpinan atau Penyusun                                               | Buka halaman yang sama                        | Tabel identik tanpa tombol Tambah dan tanpa kolom Aksi                                                                          |
| 21  | Penjamin Mutu di daftar prodi                                        | Klik Tambah Dokumen LED                       | Formulir terbuka dengan prodi tersebut sudah terpilih; simpan maupun Batal memulangkan ke daftar prodi, bukan ke lapis tenant   |
| 22  | Tautan formulir dikarang dengan `?returnTo=https://situs-lain`       | Tekan Batal                                   | Dipulangkan ke `/dashboard/led-projects`; tujuan di luar aplikasi diabaikan                                                     |
| 23  | Daftar berisi lebih dari satu halaman                                | Ketik kata kunci, ubah urutan, muat ulang     | Hasil benar-benar tersaring dan terurut, `Total n data` menyesuaikan, dan `q`/`sort`/`page` bertahan di URL                     |

---

## 6. Dashboard Project LED

**Diakses oleh**: seluruh role yang berhak atas dokumen tersebut (`PIMPINAN`, `PENJAMIN_MUTU` lintas prodi; `PENYUSUN` hanya untuk prodinya).

### 6.1 Progres Dokumen

Judulnya sengaja di level **dokumen**, bukan "per bab": baris ringkasan dan panel Status Dokumen mengukur dokumen secara keseluruhan, sedangkan tabel bab hanyalah salah satu bagiannya. Konteks satu dokumen sudah dipastikan breadcrumb dan sidebar, jadi tidak perlu diulang di judul.

Halaman tersusun dari tiga bagian, dari atas ke bawah:

**a. Baris ringkasan (empat kartu angka)**

| Kartu                    | Isi                                                                        | Dihitung dari                                                     |
| ------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Kelengkapan Bab**      | `n/total` bab yang sudah ada isinya, beserta bar persentase                | `konten_kerja` tidak kosong                                       |
| **Kesiapan Review**      | `n/total` bab yang sudah dikunci Penjamin Mutu                             | `terkunci = true`                                                 |
| **Bukti Dukung Dipakai** | jumlah bukti dukung **unik** yang dirujuk seluruh bab, dari N yang tersedia | `BUKTI_DUKUNG_BAB`; pembanding = bukti level tenant + prodi (§5.2) |
| **Aktivitas Terakhir**   | waktu relatif simpan terakhir + judul bab yang tersentuh terakhir           | `terakhir_disimpan` terbesar lintas bab                           |

**b. Tabel progres bab** (berjudul "Progres per Bab") — seluruh `BAB_DOKUMEN` milik dokumen ini, diurutkan `urutan_bab`. Kolomnya: nomor, `judul_bab`, badge status (lihat §6.1a), jumlah bukti dukung terpakai, dan `terakhir_disimpan` sebagai waktu relatif. Tabel ini sengaja **tanpa pencarian, pengurutan, dan paginasi**: jumlah babnya tetap dan urutannya adalah urutan dokumen akreditasi itu sendiri, jadi mengacaknya justru merusak cara halaman ini dibaca.

**c. Panel samping** — dua kartu: **Perlu Perhatian** (bab yang menunggu ditindaklanjuti, maksimal 5 baris lalu diringkas) dan **Status Dokumen** (`status_keseluruhan` + tautan ke Perpustakaan Bukti Dukung prodi). Di layar sempit panel ini turun ke bawah tabel.

Klik judul bab → masuk ke **Editor Bab** di `/editor/:projectId/:chapterId` (§7). Yang ditautkan judulnya, bukan seluruh baris: baris yang hanya bereaksi pada klik tidak bisa dicapai lewat keyboard dan tidak punya alamat untuk dibuka di tab baru. Bab yang terkunci tetap ditautkan — §12.2 memblokir aksi ubah, bukan membaca.

**Menyusul**: ringkasan skor rubrik per bab belum ditampilkan karena `RUBRIK_KRITERIA`/`HASIL_SKOR_KRITERIA` belum ada — kolom yang selalu berisi "—" hanya menambah derau. Masuk bersamaan dengan fitur Simulasi Skor (§9). Begitu pula indikator "siapa sedang menyunting": datanya hidup di Redis (§13), bukan di basis data, jadi menunggu backend.

### 6.1a Status bab adalah turunan, bukan kolom

`BAB_DOKUMEN` **tidak** punya kolom status. Badge di tabel dihitung saat render dari fakta yang sudah ada:

| Status turunan   | Aturan                                | Arti bagi pembaca                   |
| ---------------- | ------------------------------------- | ----------------------------------- |
| `BELUM_DIISI`    | `konten_kerja` kosong/null            | Belum disentuh sama sekali          |
| `SEDANG_DISUSUN` | ada `konten_kerja`, `terkunci = false` | Sedang dikerjakan, masih bisa diedit |
| `TERKUNCI`       | `terkunci = true`                     | Dikunci Penjamin Mutu untuk review  |

`terkunci` **menang atas kondisi konten** — bab yang dikunci tetap tampil `TERKUNCI` walau isinya kosong, konsisten dengan §12.2 yang memblokir semua aksi ubah data apa pun isi babnya.

> **Catatan desain — kenapa tidak jadi kolom.** Status ini murni kebutuhan tampilan dashboard. Menyimpannya sebagai kolom berarti ada dua sumber kebenaran yang harus dijaga tetap sinkron dengan `terkunci` dan `konten_kerja`; begitu ada satu jalur yang lupa memperbaruinya (mis. buka kunci lewat aksi lain), dashboard berbohong. Karena itu `docs/database.md` tidak berubah untuk fitur ini.

### 6.1b Bab dibuat otomatis, termasuk untuk dokumen lama

Struktur bab standar dibuat saat `DOKUMEN_LED` baru dibuat (§7.3), lewat satu-satunya jalur pembuatan dokumen. Selain itu, dokumen yang belum punya baris `BAB_DOKUMEN` sama sekali akan dibuatkan saat dashboardnya pertama kali dibuka — supaya dokumen yang telanjur ada sebelum fitur ini tidak perlu migrasi terpisah. Sebaliknya, menghapus `DOKUMEN_LED` ikut menghapus seluruh babnya.

### 6.2 Hak akses di level ini

- `PIMPINAN`: seluruhnya **read-only** — bisa melihat progres dan membuka Editor Bab, tapi begitu masuk Editor Bab semua tombol aksi (generate, simulasi, buat draft, kunci) disembunyikan.
- `PENJAMIN_MUTU`, `PENYUSUN`: bisa masuk Editor Bab dengan hak edit penuh sesuai matriks di [bagian 15](#15-matriks-hak-akses-ringkas).

Halaman Progres Dokumen sendiri **tidak punya satu pun aksi ubah data**, jadi tidak ada tombol yang perlu disembunyikan per role (§1) — penjagaannya sudah selesai di lapis rutenya. Pembedaan read-vs-write baru muncul begitu masuk Editor Bab.

### 6.3 Kasus Uji — Dashboard Project LED

| #   | Kondisi                                              | Aksi                                     | Hasil yang diharapkan                                                              |
| --- | ---------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Penjamin Mutu di Dashboard Utama                     | Buat Dokumen LED baru, lalu buka         | Seluruh bab standar sudah ada, semua `BELUM_DIISI`, Kelengkapan 0%                  |
| 2   | Dokumen lama tanpa baris `BAB_DOKUMEN` di penyimpanan | Buka dashboardnya                        | Bab ikut dibuat saat itu juga; tidak ada keadaan kosong tanpa konteks               |
| 3   | Satu bab `terkunci` walau `konten_kerja` kosong      | Lihat tabel                              | Badge `TERKUNCI` (kunci menang atas kondisi konten), bukan `BELUM_DIISI`            |
| 4   | Dokumen dengan seluruh bab terisi & terkunci         | Buka dashboardnya                        | Kelengkapan 100%, Kesiapan Review penuh, panel Perlu Perhatian menampilkan kalimat positif |
| 5   | Sebuah bab punya `catatan_penjamin_mutu`             | Lihat panel samping                      | Bab itu muncul di Perlu Perhatian dengan alasan catatan, di atas bab yang kosong    |
| 6   | Belum ada satu bab pun yang pernah disimpan          | Lihat kartu Aktivitas Terakhir           | Menampilkan "—" beserta keterangannya, bukan tanggal yang dikarang                  |
| 7   | Lebih dari 5 bab perlu perhatian                     | Lihat panel samping                      | 5 baris tampil, sisanya diringkas jadi satu baris penunjuk ke tabel                 |
| 8   | Dokumen LED dihapus dari Dashboard Utama             | Periksa penyimpanan bab                  | Tidak ada baris bab tersisa milik dokumen itu                                       |
| 9   | Bukti dukung baru diunggah dari halaman lain         | Kembali ke dashboard                     | Kartu Bukti Dukung ikut memperbarui angka pembandingnya tanpa muat ulang            |
| 10  | Penyusun membuka dokumen milik prodi lain            | Ketik URL-nya langsung                   | Dialihkan oleh penjaga lapis dokumen; isi dashboard tidak pernah dirender           |
| 11  | Layar sempit (mobile/tablet)                         | Buka dashboard                           | Panel samping turun ke bawah tabel; halaman tidak menggulir ke samping              |

---

## 7. Editor Bab

Tampilan mengikuti konsep dua-sidebar ala Figma:

```
┌────────────┬─────────────────────────────┬──────────────────────┐
│ Sidebar    │        Kanvas Editor         │   Sidebar Kanan       │
│ Kiri       │   (rich text, satu bab =     │   Tab: Generasi |     │
│ (Daftar    │    satu ruang kerja/         │   Draft | Rujukan |   │
│  Isi/nav   │    "kertas" sendiri)         │   Rubrik | Skor       │
│  antar bab)│                               │                       │
└────────────┴─────────────────────────────┴──────────────────────┘
```

> **Catatan — penamaan dan urutan tab.** Bagian ini semula menulis "Generate | Rujukan | Rubrik | Skor | Draft". Yang dipakai sekarang: **"Generate" jadi "Generasi"** supaya seluruh label berbahasa Indonesia, **Draft naik ke urutan kedua** karena ia pasangan langsung dari hasil generate, dan **"Skor" jadi "Kualitas AI"** karena nama lamanya tertukar rasanya dengan "Rubrik" — justru tab itu yang menampilkan skor 1–4 beserta totalnya, sedangkan yang ini mengukur mutu kerja AI-nya (§10.1). Urutan tampilnya kini **Draft | Generasi | Rujukan | Rubrik | Kualitas AI**. Isi pasal 8–12 di bawah tidak berubah, hanya label dan urutannya. Satu-satunya sumber urutan dan label di kode ada di `PANEL_TABS` (`features/chapter/presentation/components/chapter-editor-panels.tsx`); `value` tiap tab tetap memakai nama lamanya karena ia kunci internal.
>
> **Catatan — serialisasi `konten_kerja`.** Editor menulis **string HTML**, bukan JSON ProseMirror, walau docs/database.md menyebut kolomnya `jsonb` (kolom JSON nanti tinggal memuat `{ format: 'html', body: '<p>…</p>' }`). Alasannya bab yang lahir sebelum editor ada — termasuk seluruh data contoh — berisi kalimat biasa: sebagai HTML ia dibungkus jadi paragraf tanpa kode migrasi apa pun, sedangkan `JSON.parse` akan melempar dan memaksa cabang penyelamat permanen di tiap tempat baca.

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

> **Catatan — yang berbeda saat tab ini dibangun.** Bagian di atas ditulis sebelum implementasinya ada; berikut yang menyusul, dan tidak menggantikannya.
>
> - **Tombol tambah bukan ikon "+"**, melainkan tombol **"Simpan Draft"** di kaki panel, sebaris dengan isian `label` yang terlipat — bentuk yang sama persis dengan blok prompt di tab Generasi (§12.1), supaya kedua tab tidak memakai dua pola berbeda untuk hal yang sama: satu isian opsional plus satu tombol utama.
> - **"Lihat skor" belum ada di menu "..."**. Ia menuntut `HASIL_SKOR_KRITERIA` beserta tab Rubrik/Skor, yang belum dibangun; slotnya ditandai komentar di `chapter-draft-panel.tsx`, bukan dipasang sebagai item mati. Sampai itu masuk, menunya berisi satu item saja.
> - **"Gunakan draft ini" ikut memulihkan bukti dukung aktif** (`BUKTI_DUKUNG_BAB` diisi ulang dari `BUKTI_DUKUNG_DRAFT` checkpoint terpilih), di luar `konten_kerja` + `checkpoint_aktif_id` yang disebut docs/database.md. Alasannya: tanpa itu, bukti dukung aktif akan menyatakan tulisan yang barusan dipulihkan disusun dari berkas yang sama sekali tidak berhubungan — tab Rujukan (§11.1) akan salah sejak hari pertama ia dibangun. Arsip checkpointnya sendiri tidak tersentuh.
> - **Memulihkan lalu menyunting tidak menyentuh checkpointnya.** Suntingan sesudah "Gunakan draft ini" selalu jatuh ke `konten_kerja` bab aktif; `konten_snapshot` checkpoint tidak pernah ikut berubah, dan tidak ada checkpoint baru yang lahir sendiri. Penegakannya di lapis data, bukan di UI: `chapterDraftRepository` tidak punya method `update` sama sekali, dan autosave hanya memanggil `chapterRepository.updateKonten` yang cuma menyentuh baris bab.
> - **Generate mengosongkan `checkpoint_aktif_id`.** Kolom itu mencatat checkpoint mana yang **terakhir dipulihkan** ke bab ini, dan generate menulis isi yang sama sekali baru — membiarkannya menunjuk checkpoint lama membuat riwayat mengaku sesuatu yang tidak lagi benar. Menyunting tangan **tidak** mengosongkannya: peristiwa pemulihannya memang tetap terjadi. Karena itu penandanya di UI berbunyi "Terakhir dipulihkan ke bab ini" — kalimat peristiwa, bukan pernyataan bahwa checkpoint itu sama dengan isi bab sekarang.
> - **Daftar bukti dukung tiap checkpoint tidak ditampilkan** di tab ini — kolomnya terlalu sempit untuk riwayat sekaligus rinciannya. Datanya tetap disimpan penuh; tab Rujukan/Generasi yang akan membacanya.
> - **`referensi_chunk_ids` hanya terisi lewat jalur generate** (lihat §8.2 di bawah); checkpoint manual selalu mengosongkannya.

### 8.2 Kapan checkpoint dibuat

- **Selalu manual**, lewat tombol "Simpan sebagai Draft" (bukan otomatis oleh sistem, dan bukan otomatis setiap kali generate AI selesai — meskipun hasil generate AI _bisa_ langsung disimpan sebagai draft jika user memilih demikian, sesuai alur generate di bawah).

> **Catatan — bagaimana `sumber = AI` didapat.** Ada dua jalur, dan keduanya tetap satu klik user sesuai pasal ini:
>
> - Tombol **"Simpan Draft"** di tab Draft → `sumber = MANUAL`, `referensi_chunk_ids` kosong.
> - Tautan **"Simpan sebagai draft"** yang muncul di tab Generasi tepat setelah generate selesai, di baris "Digenerate … dari _n_ bukti dukung" → `sumber = AI`, `referensi_chunk_ids` terisi dari retrieval-nya. Tautannya hilang begitu diklik (berganti "Tersimpan sebagai Versi _n_") dan muncul lagi setiap generate berikutnya.
>
> Perlu disadari, `sumber` dengan begitu merekam **tombol mana yang ditekan**, bukan jaminan asal isi: generate lalu langsung menekan "Simpan Draft" di tab Draft tetap tercatat `MANUAL`. Diterima karena jalur bersumber `AI` diletakkan tepat di tempat hasil generate muncul, sehingga jalur yang benar adalah jalur yang paling dekat. Yang **tidak** boleh tertukar: `sumber` menjawab dari mana isinya berasal, `dibuat_oleh_user_id` menjawab siapa yang membuatnya — dan yang kedua selalu terisi, termasuk untuk checkpoint bersumber `AI`.

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

> **Catatan — yang berbeda saat tab ini dibangun.** Bagian §9.1–§9.3 di atas ditulis sebelum implementasinya ada; berikut yang menyusul, dan tidak menggantikannya.
>
> - **Skor checkpoint dilihat lewat dropdown lingkup**, bukan deretan card di kaki tab yang membuka modal (§9.2). Pertanyaan yang dijawabnya sama persis dengan yang sudah dijawab dropdown di tab Rujukan sebelahnya — dua kontrol berbeda untuk hal yang sama hanya menambah yang harus dipelajari, dan modal belum dipakai satu pun panel sidebar.
> - **Tombol simulasi berlaku untuk lingkup yang sedang dipilih**, termasuk checkpoint. Docs memang mengizinkan checkpoint di-run ulang (§9.2, database.md §12); tanpa ini, checkpoint yang belum pernah dinilai tidak akan pernah bisa dinilai sama sekali.
> - **Hak menjalankan tidak diperiksa sendiri**, melainkan memakai `useChapterPermission().canEdit` yang sudah ada. Ia sekaligus merangkum §9.3 (Pimpinan hanya melihat) dan §12.2 (bab terkunci memblokir semua orang, termasuk Penjamin Mutu). Aturan kedua yang ditulis terpisah cepat atau lambat akan menyimpang dari yang pertama.
> - **Penyebut total skor adalah kriteria yang sudah dinilai**, bukan seluruh kriteria bab. Bedanya terasa saat rubrik bertambah setelah simulasi terakhir: memakai seluruh kriteria membuat persentase turun sendiri padahal isi babnya tidak berubah.
> - **"Lihat skor" di menu tab Draft (§8.1) akhirnya dipasang**, tapi **berpindah ke tab Rubrik dengan checkpoint itu terpilih**, bukan membuka modal. Hasil akhirnya sama — breakdown yang sama, tanpa mengubah apa pun — dan skornya mendarat di tempat yang memang menjelaskan kriterianya.
> - **Bab tanpa kriteria menyatakan dirinya begitu.** database.md §10 memang menyebut bab tanpa baris `RUBRIK_KRITERIA_BAB` otomatis tidak punya hasil skor; tampilannya harus membedakan itu dari kegagalan memuat data.
> - **Penilaiannya masih tiruan** di `features/chapter/data/sources/remote/chapter-scoring.mock.ts`, dan **deterministik** — skor diturunkan dari isi konten, bukan diacak. Penilai acak akan membuat janji "skor checkpoint tidak berubah kecuali di-run ulang" jadi bohong, karena menjalankan ulang pada `konten_snapshot` yang sama persis akan memberi angka berbeda.

---

## 10. Mekanisme Skor RAGAS

### 10.1 Tab "Skor" di sidebar kanan

- Berbeda dari tab Rubrik (yang menilai **kelayakan konten** terhadap kriteria akreditasi LAM Teknik), tab ini menampilkan metrik **kualitas jawaban AI** itu sendiri (relevansi, faithfulness, dsb — gaya evaluasi RAGAS untuk sistem RAG).
- **Dihitung otomatis** setiap kali proses Generate selesai — tidak ada tombol trigger manual terpisah.
- Bersifat informatif, kemungkinan lebih relevan untuk tim pengembang memantau kualitas RAG dibanding untuk pengambilan keputusan akreditasi oleh user akhir. Belum final apakah tab ini akan dipertahankan di rilis produksi.

> **Catatan — yang berbeda saat tab ini dibangun.**
>
> - **Tabnya tampil sebagai "Kualitas AI", bukan "Skor".** Nama lamanya tertukar rasanya dengan "Rubrik" — justru tab itu yang menampilkan skor 1–4 beserta totalnya, sedangkan tab ini mengukur mutu kerja AI-nya. `value`-nya tetap `'skor'` di `PANEL_TABS` karena ia kunci internal yang tidak pernah dilihat pengguna.
> - **Tiga metrik, bukan empat.** Yang ditampilkan: **Kesetiaan pada sumber** (faithfulness), **Relevansi jawaban** (response relevancy), dan **Ketepatan konteks** (context precision). `context_recall` **sengaja tidak ada**: metrik itu menuntut `reference` — jawaban acuan yang dianggap benar untuk dibandingkan — dan LED tidak punya itu, justru dokumen inilah yang sedang disusun. Menampilkannya berarti menyediakan tempat yang tidak akan pernah terisi jujur.
> - **Tiap metrik disertai dua penjelasan**: apa yang diukur, dan kenapa angkanya segitu **pada generate ini**. Angka 0–1 tanpa keduanya tidak berarti apa pun bagi siapa pun di luar tim RAG, dan alasan yang cuma mengulang definisi metriknya sama saja dengan tidak ada. Definisinya disembunyikan di balik **ikon info bertooltip** — ia hanya perlu dibaca sekali, dan menampilkannya permanen di tiap kartu mendorong temuan yang sebenarnya keluar layar. Ikonnya tombol sungguhan, jadi tooltipnya juga terbuka lewat Tab, bukan hover saja.
> - **Skornya menempel ke kondisi aktif dan ikut ke checkpoint**, pola yang sama dengan `konten_kerja`, `BUKTI_DUKUNG_BAB`, dan skor rubrik. Tab punya pemilih lingkup seperti Rubrik dan Rujukan. Ia ikut ke checkpoint **bukan** karena `sumber = AI`, melainkan karena isi yang di-snapshot memang pernah dinilai — checkpoint manual dari tulisan yang tadinya digenerate mewarisinya secara sah, dan yang ditulis tangan otomatis kosong.
> - **Ada penanda "isi sudah disunting sejak penilaian ini".** Skor menggambarkan tulisan saat ia dinilai; begitu babnya disunting, angkanya berhenti menggambarkan isi yang sekarang. Skornya **tidak dihapus** — ia tetap fakta tentang generate yang pernah terjadi — hanya ditandai. Lingkup checkpoint tidak pernah basi karena `konten_snapshot` memang tidak bisa berubah.
> - **Tab ini nol tombol**, sesuai kalimat "dihitung otomatis" di atas. Yang mengisinya tab Generasi.
> - **Penilaiannya masih tiruan** di `chapter-generation.mock.ts`, dan **deterministik** dari isi — skor yang ikut disalin ke checkpoint permanen tidak boleh dibaca berbeda tiap kali.

---

## 11. Mekanisme Rujukan

### 11.1 Tab "Rujukan" di sidebar kanan

- Menampilkan dua bagian, murni **read-only**:
  - **Panduan** yang dipakai — daftar `PANDUAN_DETAIL` yang relevan, ditampilkan sebagai nama file sumber (`PANDUAN_REFERENSI.judul`/`file_url`) + info halaman.
  - **Bukti Dukung** yang dipakai — daftar `BUKTI_DUKUNG` yang tercatat di `BUKTI_DUKUNG_BAB` (kondisi aktif saat ini), ditampilkan sebagai card (nama file, waktu upload). Ini termasuk data LKPS, yang meski isinya bisa jadi tabel data terstruktur, tetap ditampilkan sebagai card bukti dukung biasa (bukan tabel detail terpisah).
- Isi tab ini **otomatis terisi** berdasarkan bukti dukung yang dipilih user saat generate, **maupun** yang diambil otomatis oleh AI di luar pilihan eksplisit user (jika sistem RAG menentukan ada bukti dukung lain yang relevan).
- Tab ini hanya menampilkan **daftar**, tanpa detail isi/preview di dalamnya — untuk melihat detail, user membuka bukti dukung tersebut lewat Perpustakaan Bukti Dukung terkait.

> **Catatan — yang berbeda saat tab ini dibangun.** Bagian di atas ditulis sebelum implementasinya ada; berikut yang menyusul, dan tidak menggantikannya.
>
> - **Lingkupnya bisa dipilih: kondisi aktif atau salah satu checkpoint.** Pasal ini hanya menyebut `BUKTI_DUKUNG_BAB`, tapi tiap `BAB_DRAFT` menyimpan `BUKTI_DUKUNG_DRAFT`-nya sendiri yang permanen dan **berbeda-beda antar versi** — dan §8.1 sudah menunda penampilannya justru ke tab ini. Kalau tab ini berhenti di kondisi aktif, arsip per checkpoint tidak akan pernah terlihat di mana pun. Pemilihnya hanya muncul untuk bab yang memang punya riwayat checkpoint.
> - **Bagian "Panduan" belum dibangun.** Ia menuntut `PANDUAN_REFERENSI`/`PANDUAN_DETAIL`/`PANDUAN_DETAIL_BAB` yang belum ada sama sekali di kode, dan `referensi_chunk_ids` yang tersimpan sekarang masih string tiruan tanpa entitas di baliknya — menyeed panduan lebih dulu berarti mengarang keterkaitan yang belum ada. Ketiadaannya **dinyatakan di kaki panel**, bukan didiamkan, supaya tidak terbaca sebagai fitur yang terlupa.
> - **Rujukan menyimpan nama dan tipe berkas, bukan hanya id.** Bukti dukung bisa dihapus dari Perpustakaan; kalau yang tersimpan cuma id, rujukan yang berkasnya hilang berhenti bisa dibaca sama sekali — tidak ada tempat lain di sistem yang masih tahu namanya. Karena itu `BUKTI_DUKUNG_BAB` maupun `BUKTI_DUKUNG_DRAFT` di sini berbentuk `{ id, nama_dokumen, tipe_file }`, dengan preseden yang sama seperti `BAB_DRAFT.dibuat_oleh_user_id` yang juga menyimpan namanya. `ukuran_bytes` dan `status` sengaja **tidak** ikut: keduanya berubah sepanjang umur berkas, jadi menyalinnya berarti mengarsipkan keadaan yang langsung basi — keduanya dibaca langsung dari Perpustakaan saat ditampilkan.
> - **Berkas yang sudah dihapus tetap ditampilkan**, memakai nama arsipnya, dengan badge "Sudah dihapus" dan barisnya diredupkan. Menghilangkannya akan membuat riwayat berbohong: bab itu memang pernah disusun dari berkas tersebut, dan justru itu yang perlu diketahui saat dokumennya diperiksa asesor.
> - **Tidak ada tautan langsung ke satu bukti dukung.** Seleksi berkas di Perpustakaan masih state lokal komponennya, jadi yang ditawarkan hanya tombol membuka pustakanya. Jangan berpura-pura lebih dari itu sampai deep-link-nya benar-benar ada.
> - **Kalimat "bukti dukung yang diambil otomatis oleh AI di luar pilihan eksplisit user"** belum punya data di baliknya: jalur generate yang ada sekarang hanya mencatat berkas yang dicentang user. Baris itu menunggu retrieval sungguhan.

---

## 12. Kunci Review oleh Penjamin Mutu

### 12.1 Tab "Generate" di sidebar kanan

- Checklist pemilihan `BUKTI_DUKUNG` yang relevan (gabungan level tenant + level prodi terkait) → tombol **Generate**.
- Setelah diklik: sistem masuk mode **loading**, memanggil RAG (mencari `PANDUAN_DETAIL` relevan berdasar `urutan_bab` + isi bukti dukung terpilih di vector database eksternal), lalu **langsung menimpa `konten_kerja`** begitu hasil didapat — **tidak ada tahap preview/konfirmasi** sebelum menimpa.
- Baris `BUKTI_DUKUNG_BAB` untuk bab ini diperbarui (hapus lama, insert sesuai pilihan bukti dukung yang dipakai generate ini).
- Skor RAGAS (tab Skor) otomatis terhitung begitu proses ini selesai.

> **Catatan — yang ditambahkan saat tab ini dibangun.** Bagian di atas ditulis sebelum implementasinya ada; tiga hal berikut menyusul dan tidak menggantikannya.
>
> - **Prompt tambahan (opsional).** Di bawah daftar bukti dukung ada satu textarea bebas, sebaris dengan tombol Generate. Isinya ikut dikirim sebagai arahan ke pipeline RAG; dikosongkan berarti generate berjalan hanya dari bukti dukung + panduan, persis seperti tulisan asli pasal ini.
> - **Bukti dukung yang belum `SIAP`.** Sesuai §4.5 seluruh berkas tetap tampil, tapi yang statusnya bukan `SIAP` dinonaktifkan dengan badge statusnya ikut terlihat — badge itulah keterangan kenapa ia belum bisa dicentang. Berkas `GAGAL` menampilkan `catatan_gagal`-nya. Daftarnya punya pencarian sendiri (nama berkas, pengunggah, tipe) dan mengurutkan yang `SIAP` paling atas. Saat tab dibuka, pilihan generate terakhir (`BUKTI_DUKUNG_BAB`) tercentang kembali; id yang sudah hilang atau statusnya mundur dilaporkan sebagai catatan, bukan dibuang diam-diam.
> - **Lebar sidebar kanan bisa diseret** (320–560 px, tersimpan per browser). Sketsa di §7 menggambarnya tetap; 320 px tidak cukup memuat daftar bukti dukung, pencarian, dan prompt sekaligus.
>
> **Status implementasi.** Yang sudah jalan: pemilihan bukti dukung, prompt, dan generate yang menimpa `konten_kerja` sekaligus memperbarui `BUKTI_DUKUNG_BAB` — mengikuti pasal ini, **bukan** `docs/database.md` §4 yang menyimpan hasilnya sebagai `BAB_DRAFT` baru untuk di-restore user. Keduanya berselisih dan yang dipakai kode adalah pasal ini; §4 di `database.md` menunggu iterasi checkpoint. Yang **belum**: skor RAGAS otomatis (butuh tab Skor) dan kunci `lock:bab:{bab_id}` di §13 (belum ada lapis Redis). Pemanggilan AI-nya sendiri masih tiruan di `features/chapter/data/sources/remote/chapter-generation.mock.ts`.

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
| Lihat daftar Program Studi (navigasi)          | ✅              | ✅              | ✅              | ❌                         |
| Buat User baru                                 | ✅              | ❌              | ❌              | ❌                         |
| Assign/edit User ke Prodi                      | ✅\*            | ✅              | ❌              | ❌                         |
| Landing setelah login                          | Dashboard Utama | Dashboard Utama | Dashboard Utama | Dashboard Prodi (langsung) |
| Lihat Dashboard Prodi/Project LED lintas prodi | ❌              | ✅              | ✅              | ❌ (hanya prodinya)        |
| Buat Dokumen LED baru                          | ❌              | ❌              | ✅              | ❌                         |
| Edit konten bab / generate / buat draft        | ❌              | ❌ (read-only)  | ✅              | ✅                         |
| Jalankan simulasi skor (Rubrik)                | ❌              | ❌ (read-only)  | ✅              | ✅                         |
| Kunci/buka kunci bab                           | ❌              | ❌              | ✅              | ❌                         |
| Ubah status dokumen                            | ❌              | ❌              | ✅              | ❌                         |
| Upload bukti dukung level Tenant               | ❌              | ✅              | ✅              | ❌                         |
| Upload bukti dukung level Prodi                | ❌              | ✅              | ✅              | ✅ (prodinya)              |
| Hapus bukti dukung                             | ❌              | ✅              | ✅              | ✅ (unggahannya sendiri)   |
| Ulangi ekstraksi bukti dukung yang gagal       | ❌              | ✅              | ✅              | ✅ (prodinya)              |

_\* Admin hanya bisa membuat user, belum tentu punya kemampuan assign ke prodi — perlu dikonfirmasi ulang bila ada kebutuhan lanjutan._

> **Catatan desain — dua baris bukti dukung yang ditetapkan menyusul.** Baris "Hapus bukti dukung" dan "Ulangi ekstraksi" tidak ada di matriks awal. PRD hanya menyebut penghapusan dilakukan "pengguna berwenang" tanpa merinci siapa. Keputusannya: `PIMPINAN`/`PENJAMIN_MUTU` boleh menghapus apa pun di cakupannya karena keduanya memang beroperasi di level tenant, sedangkan `PENYUSUN` dibatasi pada unggahannya sendiri — cukup untuk membereskan salah unggah, tanpa memberinya kuasa menghapus bukti yang dipakai prodi secara keseluruhan. Mengulang ekstraksi tidak menghapus apa pun dan tidak mengubah isi berkas, jadi haknya disamakan dengan hak unggah di lapis bersangkutan.

> **Catatan desain — siklus Dokumen LED milik Penjamin Mutu.** Baris "Buat Dokumen LED baru" ditetapkan menyusul karena matriks awal tidak memuatnya. Wewenangnya diberikan ke `PENJAMIN_MUTU` saja agar konsisten dengan dua baris di bawahnya (kunci bab dan ubah status dokumen): satu role memegang seluruh siklus hidup dokumen dari pembuatan sampai penyelesaian. `PIMPINAN` tetap read-only di level ini (§6.2), dan `PENYUSUN` tidak pernah masuk Dashboard Utama sehingga tidak punya jalan ke form pembuatan.

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

7. **Menghapus bukti dukung yang sedang dipakai suatu bab** — bukti dukung bisa sedang tercatat di `BUKTI_DUKUNG_BAB` (kondisi aktif) maupun `BUKTI_DUKUNG_DRAFT` (checkpoint permanen, jejak audit akreditasi). Apakah penghapusan diblokir selama masih dirujuk, atau tetap diizinkan dengan rujukan yang jadi menggantung? Untuk sekarang UI hanya memperingatkan lewat dialog konfirmasi.

   > **Terjawab sebagian saat tab Rujukan dibangun (§11.1).** Penghapusan **tetap diizinkan**, tapi rujukannya tidak lagi menggantung: `BUKTI_DUKUNG_BAB` dan `BUKTI_DUKUNG_DRAFT` sekarang ikut menyimpan `nama_dokumen` + `tipe_file`, sehingga berkas yang sudah dihapus tetap bisa disebut namanya di tab Rujukan, ditandai badge "Sudah dihapus". Jejak auditnya terselamatkan tanpa memblokir penghapusan. Yang **masih terbuka**: apakah berkas yang dirujuk checkpoint sebaiknya tetap tidak boleh dihapus sama sekali demi kelengkapan arsip akreditasi — pertanyaan kebijakan, bukan lagi pertanyaan data.

8. **Batas ukuran dan kuota penyimpanan** — batas 25 MB per berkas dipakai sebagai angka awal yang belum divalidasi ke kebutuhan nyata (LKPS hasil pindai bisa jauh lebih besar). Apakah perlu kuota total per tenant/prodi, dan apa yang terjadi saat kuota habis?

9. **Pengelompokan bukti dukung** — perpustakaan saat ini datar dengan pencarian sebagai satu-satunya alat penyaring. Apakah nanti perlu folder, tag, atau kategori (mis. per kriteria LAM Teknik) begitu jumlah berkasnya membesar?

10. **Pembatalan unggahan yang sedang berjalan** — panel progres saat ini hanya bisa disembunyikan, bukan membatalkan unggahan, karena pembatalan perlu dukungan pembatalan permintaan ke object storage sekaligus pembersihan objek separuh jalan di sisi backend.
