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

- Root URL `/` adalah **halaman muka publik** — satu-satunya halaman yang tidak mengandaikan pengguna sudah masuk, sekaligus jalan masuk resmi ke `/login` dan `/register`. Isinya perkenalan produk (hero, empat kemampuan utama, ajakan mendaftar), bukan bagian dari ruang kerja mana pun, jadi ia tidak memakai `AppShell` maupun sidebar lapis mana pun.
  - Bila sudah ada sesi tersimpan, tombol **Masuk/Daftar** di navbar-nya diganti satu tombol **Buka Dashboard** yang menuju halaman pendaratan role bersangkutan (aturan yang sama persis di bawah ini). Pembedanya ada tidaknya sesi tersimpan, bukan `sessionRepository.get()` — yang terakhir selalu mengembalikan sesi contoh selama autentikasi masih mock.
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

> **Catatan desain — kartu penaut dibuang.** Versi awal halaman ini berisi empat kartu penaut (Program Studi, Dokumen LED, User, Bukti Dukung) yang isinya persis menu sidebar, difilter per role dengan aturan yang sama. Itu salinan kedua tanpa nilai tambah, sementara satu-satunya halaman yang bisa menjawab pertanyaan pimpinan justru dibiarkan kosong. Alasannya sama dengan yang membuang daftar riwayat penyusunan dari Dashboard Prodi (§5.1c): kalau sidebar sudah jadi jalan masuk yang jelas, mendaftarnya ulang di badan halaman hanya meramaikan.

**Aturan utama halaman ini: satu blok, satu kerangka waktu** — aturan yang sama dengan §5.1, dan yang secara khusus diperingatkan PRD §3.8 untuk level institusi. Halaman disusun jadi tiga blok yang masing-masing menyebut kerangkanya sendiri:

| Blok | Kerangka waktu | Sumber |
| --- | --- | --- |
| **Posisi Akreditasi** (§4.0a) | Masa lalu — capaian yang sudah disahkan | `PROGRAM_STUDI` |
| **Sedang Menyusun** + **Perlu Segera Disusun** (§4.0c) | Sekarang, per prodi — inti halaman | `PROGRAM_STUDI` + `DOKUMEN_LED` aktif, satu baris per prodi |
| **Sumber Daya Institusi** (§4.0d) | Lintas penyusunan — bekal universitas | `BUKTI_DUKUNG` tenant, `USER` |

**Rincian per bab tidak dirender di lapis ini.** Kesiapan review dan kelengkapan bab satu per satu adalah pertanyaan tentang **satu dokumen**, dan rumahnya §6.1 — lihat catatan desain di §4.0b. Yang tersisa cuma satu bar kelengkapan yang menyebutkan pembagiannya lewat tooltip.

**Tidak ada aturan hitung baru di halaman ini.** Seluruh angkanya memanggil ulang fungsi domain yang sudah dipakai Dashboard Prodi dan Dashboard Project LED — `summarizeChapters`, `summarizeEvidence`, `pickPenyusunanAktif`, `deriveDeadline`, `deriveAccreditationValidity`. Yang benar-benar baru hanya cara membagi prodi ke dua tabel dan cara mengurutkan masing-masing. Konsekuensi yang disengaja: keadaan satu baris di §4.0c **wajib** cocok dengan Dashboard Prodi yang dituju barisnya; kalau berbeda, berarti ada aturan yang tersalin, bukan dipakai ulang.

**Satu-satunya aksi ubah data di halaman ini** adalah tombol **Buat Proyek LED** di tabel kedua §4.0c, dirender hanya untuk `PENJAMIN_MUTU` (§1). Selain itu hanya tautan Manajemen User di §4.0d yang disembunyikan per role; penjagaan selebihnya sudah selesai di lapis rutenya.

#### 4.0a Blok Posisi Akreditasi

Satu kartu yang menjawab dua pertanyaan berurutan: **bagaimana komposisinya**, lalu **siapa yang paling dekat kehabisan masa berlaku**.

**Komposisi** — satu **bar bertumpuk horizontal** selebar kartu, dibagi menurut `peringkat_akreditasi` dalam urutan enum (`UNGGUL` → `BAIK_SEKALI` → `BAIK` → `BELUM_TERAKREDITASI`, terbaik ke terburuk). Di atasnya jumlah total prodi; di bawahnya legenda dua kolom berisi seluruh peringkat beserta jumlah prodi **dan persentasenya**.

Bentuknya bar, bukan lingkaran: pertanyaannya part-to-whole dengan nama kategori yang panjang, dan bidang persegi panjang bisa dibandingkan panjangnya secara langsung sedangkan juring lingkaran tidak.

| Aturan | Alasan |
| --- | --- |
| Peringkat berjumlah nol **tidak** merender segmen | Sliver selebar nol tidak menyampaikan apa pun dan hanya mengacaukan celah antar segmen |
| Peringkat berjumlah nol **tetap** muncul di legenda | "Tidak ada satu pun prodi Unggul" adalah kabar, bukan ketiadaan data |
| Pemisah antar segmen adalah **celah** berwarna kartu, bukan garis tepi | Garis menambah tinta yang bukan data; ruang kosong memisahkan tanpa ikut terbaca sebagai isi |
| `BELUM_TERAKREDITASI` berwarna abu-abu netral, bukan warna keempat | Itu **ketiadaan** peringkat; memberinya identitas warna sendiri membuatnya terbaca sebagai capaian keempat — sama seperti `BELUM_DIISI` di bar kelengkapan bab (§5.1b) |
| Warna tiap peringkat sekeluarga dengan badge-nya | Satu peringkat harus berwarna sama di mana pun ia muncul; nuansanya saja yang berbeda (badge pucat karena menampung teks, segmen pekat karena bidangnya yang harus terbaca) |

Disajikan sebagai distribusi, **bukan rata-rata**: peringkat itu ordinal, dan "rata-rata Unggul dan Baik" bukan besaran yang punya arti.

Persen berdiri sebagai keterangan di belakang jumlah prodi, bukan menggantikannya. Angkanya dibulatkan sehingga keempatnya bisa tidak berjumlah tepat 100 (tiga prodi → 33+33+33), dan "25%" sendirian tidak memberi tahu apakah itu 1 dari 4 atau 50 dari 200.

> **Aturan persentase di seluruh dashboard.** Persen hanya dipasang pada angka yang **penyebutnya jelas** dan pertanyaannya memang "berapa bagian dari keseluruhan". Praktisnya: kalau sebuah angka sudah punya bar persentase, angkanya ikut ditulis — menyembunyikannya memaksa pembaca menaksir dari panjang bar. Yang sengaja **tanpa** persen: Sisa Tenggat (§5.1b, satuannya hari), sisa masa berlaku akreditasi (§4.0a/§4.0c, satuannya hari), dan Bukti Dukung Dipakai (§6.1, penyebutnya "tersedia" bukan target — 20 dari 50 berkas dipakai tidak berarti 40% selesai).

Prodi `BELUM_TERAKREDITASI` masuk komposisi sebagai kategorinya sendiri dan **tidak** ikut dihitung kedaluwarsa — `berlaku_sampai_akreditasi` kosong berarti "tidak ada", bukan "sudah lewat" (§5.1e).

**Masa berlaku terdekat berakhir** — daftar prodi dengan sisa masa berlaku terpendek lebih dulu, dipotong lima baris. Tiap baris: nama prodi (tautan ke Dashboard Prodi-nya), tanggal berakhirnya, dan sisa waktu diwarnai urgensi. Prodi yang belum pernah terakreditasi tidak ikut: tidak punya masa berlaku bukan masa berlaku yang pendek, dan menaruhnya di daftar ini memaksa pembaca membandingkan dua hal yang tidak sebanding (§5.1e). Daftarnya tidak dirender bila kosong.

Daftar ini **tidak** menyebut apakah prodinya sudah menyusun, dan **tidak** memberi tombol. Yang dijawabnya cuma "kapan masa berlaku kami berakhir", untuk seluruh prodi yang punya masa berlaku — yang sedang menyusun maupun tidak. Pertanyaan "siapa yang harus mulai sekarang" dijawab tabel Perlu Segera Disusun (§4.0c) beserta aksinya; menjawabnya di dua tempat membuat pembaca menebak mana yang mengikat.

> **Catatan desain — angka urgensi diganti daftar bernama.** Versi sebelumnya menutup kartu ini dengan dua baris agregat: "N prodi masa berlakunya sudah habis" dan "N prodi tersisa ≤ 365 hari". Angkanya benar, tapi tidak bisa ditindaklanjuti — pembacanya tetap harus membuka halaman lain untuk mencari prodi mana yang dimaksud. Daftar bernama menjawab "berapa banyak" **dan** "siapa" sekaligus, jadi mempertahankan baris agregat di atasnya berarti menghitung hal yang sama dua kali.

#### 4.0b Rincian penyusunan tidak dirender di lapis ini

> **Catatan desain — blok "Sedang Menyusun Se-Universitas" dibuang.** Blok ini pernah berisi empat kartu angka se-universitas: Prodi Sedang Menyusun, Kelengkapan Bab agregat, Kesiapan Review agregat, dan Tenggat Berisiko. Tabel §4.0c lalu mengulang ketiga yang terakhir lagi sebagai kolom per baris.
>
> Akibatnya lapis tenant terbaca sebagai Dashboard Project LED (§6.1) yang diperbanyak barisnya — masalah yang persis sama, dan dibuang dengan alasan yang persis sama, seperti rincian penyusunan di Dashboard Prodi (§5.1b). Subjek halaman ini universitas: angka `12/28 bab terisi se-universitas` bukan fakta tentang universitas, melainkan penjumlahan fakta-fakta tentang dokumen yang masing-masing punya halamannya sendiri, dan tidak ada satu pun keputusan level pimpinan yang berubah karenanya.
>
> Yang tersisa dari blok ini cuma satu angka yang memang menjawab pertanyaan level tenant — "berapa prodi yang sedang menyusun" — dan itu jadi hitungan di judul tabel pertama §4.0c. Satu angka tidak butuh kartu.
>
> Angka per bab hanya hidup di §6.1. Kalau suatu saat blok agregat ini dihidupkan lagi, aturan lamanya ada di riwayat git: agregasi memakai **jumlah bab lintas prodi**, bukan rata-rata persen antar prodi, dan prodi yang tidak sedang menyusun menyumbang nol ke pembilang **dan** penyebut.

#### 4.0c Blok Sedang Menyusun & Perlu Segera Disusun

**Dua tabel bertumpuk, bukan satu tabel dengan kolom Status.** Keduanya pernah jadi satu, dan kolom-kolomnya saling meniadakan: "sejauh mana penyusunan berjalan" butuh progres dan tenggat, "siapa yang harus mulai" butuh masa berlaku akreditasi dan tombol untuk memulainya. Satu tabel tidak bisa melayani keduanya tanpa separuh selnya berisi `—`, dan sel `—` yang banyak selalu berarti tabelnya menjawab dua pertanyaan sekaligus.

Tiap prodi masuk **tepat satu** ember, sehingga jumlah kedua tabel plus baris keterangan selalu bisa dicocokkan dengan total prodi di §4.0a:

| Ember | Syarat | Ke mana |
| --- | --- | --- |
| **Sedang menyusun** | ada `DOKUMEN_LED` aktif | tabel pertama |
| **Perlu segera menyusun** | tidak menyusun **dan** (masa berlaku tidak lagi `AMAN` **atau** belum pernah terakreditasi) | tabel kedua |
| **Belum perlu** | tidak menyusun, masa berlakunya masih `AMAN` | tidak didaftar; jumlahnya disebut satu baris di bawah tabel kedua |

Ember ketiga sengaja tidak punya tabel: tidak ada yang perlu dilakukan terhadapnya, dan mendaftarnya hanya memanjangkan halaman dengan baris yang tidak menuntut apa pun. Tapi jumlahnya tetap disebut — prodi yang hilang dari layar tanpa keterangan terbaca sebagai data yang tidak terhitung.

##### Tabel 1 — Sedang Menyusun

Judulnya membawa hitungan prodi, sisa satu-satunya dari blok agregat yang dibuang (§4.0b).

| Kolom | Isi |
| --- | --- |
| **Program Studi** | nama (tautan ke Dashboard Prodi), `jenjang · fakultas` |
| **Penyusunan** | badge `status_keseluruhan` + `TA {tahun_akademik}` |
| **Progres Bab** | bar kelengkapan bertumpuk (§5.1b) tanpa legenda, + `n/total bab terisi` |
| **Tenggat** | tanggal `tenggat` **dan** sisa waktunya, diwarnai urgensi; tanpa tenggat → "Tidak dipatok" |
| **Aksi** | tombol **Buka** → Dashboard Project LED (Lapis 3) |

Bar kelengkapan memakai komponen yang sama persis dengan §5.1b, warna dan aturan segmen ikut. Legendanya dimatikan karena tidak muat di dalam sel; **tooltip per segmen** yang menggantikannya — tiap segmen adalah tombol pemicu, jadi keterangannya terjangkau kursor maupun keyboard. Angka `n/total` tetap ditulis di bawah bar: bar sendirian memaksa pembaca menaksir dari panjangnya.

Tanggal dan sisa waktu dirender **berdampingan**, bukan salah satunya. "terlambat 10 hari" saja tidak bisa dipakai menjadwalkan apa pun, dan "31 Juli 2026" saja memaksa pembaca menghitung sendiri dari hari ini.

Urutannya: tenggat paling menekan di atas — `LEWAT` → `DEKAT` → `AMAN` → tanpa tenggat, lalu sisa hari menaik, lalu kelengkapan menaik, lalu nama prodi. Penyusunan tanpa tenggat turun paling bawah alih-alih dianggap aman: tidak dipatok adalah pilihan yang sah (§14), jadi ia tidak boleh mendahului tenggat yang nyata tapi juga tidak boleh terbaca terlambat. Aturan nulls-last yang sama dipakai `findPaged` di §4.6.

Kedua kunci pertamanya sengaja hanya memakai kolom yang **terlihat**. Urutan yang bersandar pada angka yang tidak dirender memaksa pembaca mempercaya begitu saja bahwa barisnya benar.

##### Tabel 2 — Perlu Segera Disusun

| Kolom | Isi |
| --- | --- |
| **Program Studi** | nama (tautan ke Dashboard Prodi), `jenjang · fakultas` |
| **Akreditasi Terakhir** | badge `peringkat_akreditasi` |
| **Berlaku Sampai** | tanggal `berlaku_sampai_akreditasi` + sisa waktunya, diwarnai urgensi; belum pernah terakreditasi → "Belum pernah terakreditasi" tanpa tanggal |
| **Aksi** | tombol **Buat Proyek LED** → formulir §4.6 dengan prodi itu sudah terpilih; **hanya `PENJAMIN_MUTU`** |

Urutannya: sisa masa berlaku menaik — yang paling telat di atas. Prodi yang belum pernah terakreditasi turun **paling bawah**, bukan paling atas: ia memang harus menyusun, tapi tidak punya tanggal yang sedang berjalan, dan menyelipkannya di antara baris bertanggal memaksa pembaca membandingkan "belum pernah" dengan "terlambat 39 hari".

**Prodi yang belum pernah terakreditasi ikut tabel ini.** Sebelumnya tidak — `deriveAccreditationValidity(null)` mengembalikan `null` sehingga tidak ada urgensi yang bisa dihitung — dan akibatnya prodi yang belum pernah terakreditasi dan belum punya dokumen tidak muncul di tabel mana pun. Itu keadaan paling awal yang bisa dialami sebuah prodi, bukan keadaan yang aman.

Tombol **Buat Proyek LED** membawa `?studyProgramId=` dan `?returnTo=/dashboard`, sehingga Penjamin Mutu tidak perlu memilih ulang prodi yang sudah ia tunjuk dan tidak terlempar ke daftar lintas prodi setelah menyimpan. `returnTo` disaring hanya menerima path internal (§4.6).

##### Keadaan kosong

Ketiganya dirender, tidak ada yang dihilangkan — section yang lenyap tergantung data terbaca sebagai fitur yang rusak.

| Keadaan | Yang muncul |
| --- | --- |
| Tenant tanpa prodi sama sekali | **Satu** kotak "Belum ada program studi" menggantikan kedua tabel — dua kotak berturut-turut yang berbunyi sama tidak membuatnya lebih benar |
| Tabel 1 kosong | Kotak netral: belum ada prodi yang sedang menyusun, dan dokumen baru dibuat Penjamin Mutu |
| Tabel 2 kosong | Kotak positif: "Tidak ada prodi yang tertinggal" — semua yang masa berlakunya menipis sudah mulai menyusun |

Kotak tabel 2 sengaja **positif**, bukan netral. Kosongnya tabel itu adalah satu-satunya kabar baik yang bisa diberikan halaman ini, dan menyatakannya sekali jauh berbeda dari baris "0 prodi kedaluwarsa" yang selalu ada — yang terakhir muncul bahkan ketika tidak ada yang berubah, dan karena itu dilatih untuk diabaikan.

Kedua tabel sengaja **tanpa pencarian, pengurutan, dan paginasi**, dengan alasan yang sama seperti tabel bab di §6.1: jumlah prodi tetap dan urutan risikonya adalah cara tabel ini dibaca, jadi mengacaknya justru merusaknya. Ini memang berbeda dari §4.6/§5.3 yang daftarnya untuk dijelajahi.

> **Catatan desain — kolom Perlu Perhatian dan mesin aturannya dibuang.** Tabel lama menutup tiap baris dengan kolom "Perlu Perhatian": jumlah hal yang menghambat prodi itu, dihitung `buildProgramAttention` dari delapan pemicu (tenggat lewat/dekat, akreditasi kedaluwarsa/mendekati, belum menyusun, prodi tanpa Penyusun, bukti dukung gagal, kondisi bab).
>
> Setelah tabelnya dipecah, sebagian besar pemicu itu **berubah jadi bentuk halaman** alih-alih jadi angka: "belum menyusun padahal akreditasi menipis" adalah tabel kedua, "tenggat lewat" adalah kolom Tenggat yang merah, "akreditasi kedaluwarsa" adalah kolom Berlaku Sampai, "prodi belum punya Penyusun" sudah lama ada di §4.0d, dan kondisi bab memang milik §6.1. Yang benar-benar hilang cuma penjumlahannya jadi satu angka — dan angka itu tidak pernah bisa ditindaklanjuti tanpa membuka prodinya satu per satu.
>
> Karena kolom itu satu-satunya yang merendernya (panel senama di §5.1c sudah dibuang lebih dulu), `buildProgramAttention` beserta seluruh tipenya ikut dihapus. Aturan atensi **per bab** (§6.1c) tidak tersentuh — ia punya panelnya sendiri di Dashboard Project LED.

#### 4.0d Blok Sumber Daya Institusi

Dua kartu, diberi label kerangka waktunya sendiri supaya tidak terbaca sebagai ukuran pekerjaan yang sedang disusun:

- **Bukti Dukung Universitas** — `n/total` berkas `SIAP` **beserta persentasenya**, jumlah yang masih diproses, jumlah `GAGAL`, waktu unggah terakhir, dan tombol ke Perpustakaan Bukti Dukung tenant. Angkanya **hanya berkas `owner_tipe = TENANT`** supaya cocok dengan daftar di halaman yang dituju (§4.4) — aturan yang sama dengan panel Bukti Dukung Prodi di §5.1c.
- **Tim Penyusun** — jumlah prodi yang belum punya `USER` berrole `PENYUSUN`, **beserta persentasenya terhadap total prodi** — penyebut yang sama dengan total prodi di §4.0a, supaya dua angka di halaman yang sama tidak diam-diam mengukur hal berbeda. Prodi tanpa Penyusun bukan angka biasa: dokumennya tidak akan pernah bergerak, jadi keadaan itu ditampilkan sebagai peringatan. Tautan ke Manajemen User **hanya dirender untuk `PIMPINAN`** (§1) — `PENJAMIN_MUTU` tidak punya menu itu sama sekali (§4.2), jadi menyodorkan tautannya hanya berujung pengalihan.

#### 4.0e Hak akses di level ini

- `PIMPINAN` dan `PENJAMIN_MUTU` melihat **angka** yang sama (§4.0a–d). Yang berbeda hanya dua tombol, dan keduanya berlawanan arah: tautan Manajemen User di §4.0d hanya untuk `PIMPINAN`, sedangkan tombol Buat Proyek LED di §4.0c hanya untuk `PENJAMIN_MUTU` — Pimpinan read-only atas `DOKUMEN_LED` di level ini (§6.2). Sesuai §1 keduanya tidak dirender sama sekali bagi role yang tidak berhak, bukan dinonaktifkan.
- `ADMIN` **tidak** melihat satu pun angka progres LED. Ia murni back office dan sudah ditolak di seluruh lapis prodi/dokumen (§6.2) serta di perpustakaan bukti dukung (§4.4); menampilkan agregat kesiapan kepadanya berarti membocorkan lewat ringkasan apa yang sudah ditutup lewat rute. Gantinya ia melihat **ringkasan organisasi** yang memang wewenangnya: jumlah prodi, jumlah akun per role, dan jumlah prodi yang belum punya Penyusun, beserta tautan ke §4.1 dan §4.2.
- Datanya pun tidak dibaca untuk `ADMIN`, bukan sekadar tidak dirender. Selama session belum terbaca, tidak ada cabang yang dirender lebih dulu — agar Admin tidak sempat melihat angka yang bukan haknya.
- `PENYUSUN` tidak pernah sampai ke sini (§2).

#### 4.0f Yang sengaja belum ditampilkan

Mengikuti alasan yang sama dengan §5.1f dan §6.1 — kolom yang selalu berisi "—" hanya menambah derau:

- **Ringkasan skor rubrik per prodi** — diminta PRD §3.8 ("skor rata-rata per prodi"). Sumbernya kini Penilaian AMI, bukan simulasi skor bab yang sudah dihapus (§9): angka per prodi berarti merata-ratakan sesi penilaian seluruh Dokumen LED-nya, dan itu baru bermakna setelah lebih dari satu dokumen pernah dinilai.
- **Grafik tren antar penyusunan** — baru bermakna setelah ada beberapa penyusunan dengan skor.
- **Siapa sedang menyunting** — datanya hidup di Redis (§13), bukan di basis data.

Satu hal lagi yang sengaja **tidak** dilakukan: halaman ini tidak memanggil pembuatan bab otomatis (§6.1b). Ia murni baca, dan memicu penulisan dari halaman ringkasan berarti membuka dashboard diam-diam mengubah penyimpanan. Bab baru lahir saat dashboard dokumennya dibuka.

#### 4.0g Kasus Uji — Ringkasan Kesiapan Institusi

| #   | Kondisi                                                        | Aksi                                             | Hasil yang diharapkan                                                                                                              |
| --- | -------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pimpinan atau Penjamin Mutu                                     | Buka `/dashboard`                                | Posisi Akreditasi, dua tabel §4.0c, lalu Sumber Daya Institusi. **Tidak ada** baris kartu angka bab/tenggat se-universitas di mana pun |
| 1b  | Prodi mana pun                                                  | Jumlahkan judul kedua tabel + baris "N prodi lain" | Hasilnya **sama persis** dengan total prodi di §4.0a — tiap prodi masuk tepat satu ember                                          |
| 2   | Prodi yang sedang menyusun                                      | Bandingkan barisnya dengan `/study-programs/:id`  | Badge status, tahun akademik, bar kelengkapan, dan tenggat **sama persis** dengan kartu Penyusunan Berjalan di Dashboard Prodi     |
| 2b  | Bar komposisi §4.0a                                             | Bandingkan lebar segmen dengan legendanya        | Lebar tiap segmen sebanding dengan jumlah prodi di legenda; segmennya berjumlah sama dengan peringkat yang jumlahnya > 0            |
| 2c  | Satu peringkat tidak dipakai prodi mana pun                     | Lihat bar dan legenda                            | Segmennya **tidak** dirender di bar, tapi peringkatnya **tetap** ada di legenda dengan `0 prodi · 0%`                                |
| 2d  | Baris di tabel Sedang Menyusun                                  | Arahkan kursor ke tiap warna bar Progres Bab      | Muncul tooltip `{status} — {n} bab ({p}%)`; jumlahnya cocok dengan badge status di §6.1. Segmennya juga terjangkau dengan Tab       |
| 3   | Satu prodi punya tenggat yang sudah lewat                       | Buka `/dashboard`                                | Prodi itu berada di **puncak** tabel Sedang Menyusun; kolom Tenggat merah dengan tanggal **dan** "terlambat N hari"                 |
| 4   | Lanjutan #3                                                     | Ubah tenggatnya ke masa depan lewat Edit Dokumen LED | Urutan tabel ikut berubah tanpa muat ulang manual                                                                              |
| 4b  | Penyusunan tanpa `tenggat`                                      | Lihat tabel Sedang Menyusun                       | Selnya berbunyi "Tidak dipatok" tanpa warna urgensi, dan barisnya turun **paling bawah** — tidak mendahului tenggat yang nyata, tidak pula terbaca terlambat |
| 5   | Prodi belum punya `DOKUMEN_LED` dan akreditasinya masih panjang | Cari prodi itu di kedua tabel                     | Ia tidak ada di tabel mana pun, tapi ikut terhitung di baris "N prodi lain akreditasinya masih panjang"                             |
| 5b  | Prodi belum punya `DOKUMEN_LED`, akreditasi tersisa ≤ 365 hari  | Lihat tabel Perlu Segera Disusun                  | Ia ada di sana, dengan tanggal berakhir + sisa waktunya                                                                             |
| 5c  | Dua prodi di tabel kedua: satu sudah lewat, satu tersisa 40 hari | Lihat urutannya                                  | Yang sudah lewat di atas — urutannya sisa hari menaik, bukan alfabet                                                                |
| 6   | Prodi `BELUM_TERAKREDITASI`                                     | Lihat bar komposisi dan daftar masa berlaku §4.0a | Prodi itu masuk komposisi sebagai segmen abu-abu tapi **tidak** ikut hitungan kedaluwarsa dan **tidak** muncul di daftar masa berlaku terdekat |
| 6b  | Lanjutan #6, prodi itu juga belum punya `DOKUMEN_LED`           | Lihat tabel Perlu Segera Disusun                  | Ia **ada** di sana, di baris **paling bawah**, dengan sel Berlaku Sampai berbunyi "Belum pernah terakreditasi" tanpa tanggal        |
| 7   | Penjamin Mutu, baris mana pun di tabel kedua                    | Klik **Buat Proyek LED**                          | Formulir §4.6 terbuka dengan prodi itu **sudah terpilih**; simpan memulangkan ke `/dashboard` dan prodinya pindah ke tabel pertama tanpa muat ulang |
| 7b  | Pimpinan                                                        | Lihat tabel Perlu Segera Disusun                  | Kolom Aksi **tidak dirender sama sekali** — bukan tombol yang dinonaktifkan                                                          |
| 8   | Lebih dari lima prodi punya masa berlaku                        | Lihat daftar masa berlaku terdekat §4.0a          | Hanya lima baris dirender, terurut dari sisa waktu **terpendek**; tidak ada penanda menyusun dan tidak ada tombol di daftar itu     |
| 9   | Tenant belum punya satu pun prodi yang terakreditasi            | Lihat blok Posisi Akreditasi                     | Bagian "Masa berlaku terdekat berakhir" tidak dirender sama sekali, bukan judul dengan daftar kosong                                |
| 9b  | Tidak ada prodi yang sedang menyusun                            | Lihat tabel pertama                               | Kotak netral, bukan tabel berkepala tanpa baris — dan section-nya **tetap** dirender                                                |
| 9c  | Semua prodi yang menipis sudah mulai menyusun                   | Lihat tabel kedua                                 | Kotak positif "Tidak ada prodi yang tertinggal", bukan section yang hilang                                                          |
| 10  | Pimpinan                                                        | Lihat kartu Tim Penyusun                         | Tombol "Kelola penugasan" dirender                                                                                                 |
| 11  | Penjamin Mutu                                                   | Lihat kartu yang sama                            | Angkanya identik, tombol "Kelola penugasan" **tidak** dirender                                                                     |
| 12  | Admin                                                           | Buka `/dashboard`                                | Hanya ringkasan organisasi; tidak ada satu pun blok kesiapan — bar komposisi maupun tabel prodi — yang pernah dirender               |
| 13  | Bukti dukung level **prodi** yang `GAGAL`, tenant tidak punya   | Lihat kartu Bukti Dukung Universitas             | Kartunya tidak menyebut kegagalan itu — cakupannya hanya `owner_tipe = TENANT`                                                     |
| 14  | Unggah bukti dukung tenant dari `/dashboard/evidence`           | Kembali ke `/dashboard`                          | Kartu Bukti Dukung Universitas ikut berubah tanpa muat ulang                                                                       |
| 15  | Tenant belum punya `PROGRAM_STUDI` sama sekali                  | Buka `/dashboard`                                | **Satu** kotak "Belum ada program studi" menggantikan kedua tabel, bukan dua kotak kosong berturut-turut                            |
| 16  | Dokumen LED yang belum punya baris `BAB_DOKUMEN`                | Buka `/dashboard`, lalu dashboard dokumennya     | `/dashboard` tetap murni baca: babnya baru dibuat saat dashboard dokumen dibuka (§6.1b), bukan saat `/dashboard` dibuka             |
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
- **Titik masuknya tidak cuma dua perpustakaan.** Alur yang sama persis — modal, panel melayang, antrean ekstraksi — juga bisa dimulai dari tab Generasi di Editor Bab, supaya bukti dukung bisa diunggah sambil menulis (§12.1a). Yang berbeda hanya pilihan targetnya, yang di sana menyempit ke prodi dokumen atau universitas.

### 4.6 Tampilan Perpustakaan Bukti Dukung

Berlaku sama di lapis tenant maupun prodi:

- **Dua mode tampilan**: kartu ala penjelajah berkas (bawaan) dan tabel. Tombol ganti mode ada di toolbar; pilihannya tersimpan di peramban sebagai selera pribadi, bukan bagian dari konteks halaman.
- **Pencarian, urutan, halaman, dan jumlah baris hidup di URL** (`?q=&sort=&dir=&page=&limit=`) — sehingga tautan bisa dibagikan dan muat ulang halaman tidak menghilangkan konteks. Mengubah kata kunci atau urutan otomatis mengembalikan ke halaman 1.
- Penyaringan, pencarian, pengurutan, dan pemotongan halaman dianggap **pekerjaan sisi sumber data**, bukan sisi tampilan: daftar hanya menerima satu halaman data beserta jumlah totalnya.
- **Detail berkas** dibuka lewat panel geser dari kanan (klik kartu atau baris): metadata lengkap, tahap pemrosesan, serta tombol coba lagi/hapus sesuai hak akses. Panelnya ikut memperbarui status bila ekstraksi selesai selagi panel terbuka.
- **Keadaan kosong dibedakan**: "belum ada bukti dukung" (mengajak mengunggah, tombolnya hanya untuk yang berhak) berbeda dari "tidak ada yang cocok dengan pencarian" (mengajak membersihkan kata kunci).

### 4.6a Folder bukti dukung

Menjawab [Pertanyaan Terbuka #9](#16-pertanyaan-terbuka-yang-belum-diputuskan) — pengelompokan bukti dukung — dengan **folder**, model Google Drive: nama dan kedalaman bebas, plus unggah satu folder utuh yang membawa struktur relatifnya.

**Satu pohon per cakupan, bukan satu pohon untuk semuanya.** Folder memakai `owner_tipe` + `tenant_id`/`program_studi_id` yang sama persis dengan berkasnya, jadi perpustakaan universitas dan tiap perpustakaan prodi punya akarnya masing-masing dan tidak ada folder yang melintasi batas itu. Bukan penyederhanaan: `database.md` §7 menetapkan isolasi antar prodi ditegakkan lewat kombinasi kolom itu, dan folder tenant yang memuat berkas prodi akan melubanginya.

> **Catatan desain — folder disimpan terpisah dari berkas, bukan sebagai baris bertipe.** Godaan yang jelas adalah satu koleksi dengan pembeda `tipe = FOLDER | BERKAS`. Itu ditolak karena tujuh tempat di luar fitur ini menghitung tiap baris `BUKTI_DUKUNG` sebagai berkas — yang paling tegas `summarizeEvidence`, yang memasukkan **setiap** baris ke salah satu ember status lalu membaginya jadi persentase kesiapan. Folder tidak punya status ekstraksi, sehingga satu folder akan terhitung sebagai dokumen yang belum siap dan **menarik turun angka kesiapan institusi** — kesalahan yang tidak muncul sebagai error, hanya sebagai angka yang salah. Tabel `FOLDER_BUKTI` yang berdiri sendiri (`database.md` §7a) membuat ketujuhnya tidak berubah sama sekali. Pembeda `tipe` tetap ada, tapi hanya di lapis tampilan, tempat daftar memang harus merender dua macam baris berdampingan.

- **Folder aktif hidup di URL** (`?folder=<id>`), tanpa nilai berarti akar — menyambung §4.6, tempat `q`/`sort`/`dir`/`page`/`limit` sudah lebih dulu di URL. Rutenya sendiri tidak berubah; id folder itu opaque, jadi ia tidak layak jadi segmen path. Masuk folder mengubah tiga hal sekaligus: set `folder`, kembali ke halaman 1, dan **bersihkan kata kunci**.
- **Navigasi lewat remah tautan**, bukan kolom pohon di kiri. Halaman ini sudah berada di dalam sidebar aplikasi, dan sidebar kedua membuat isinya terjepit di layar sempit.
- **Pencarian merata ke seluruh cakupan, mengabaikan folder.** Ini titik terpenting rancangannya: satu-satunya bahaya nyata dari folder adalah berkas jadi hilang di dalamnya, dan pencarian yang hanya melihat folder yang sedang dibuka justru memperkuat bahaya itu. Selagi mencari, remah tautan diganti keterangan "hasil pencarian di seluruh perpustakaan", nama folder ikut dicocokkan, dan tiap baris berkas membawa jalur foldernya.
- **Folder selalu di depan berkas**, apa pun kunci dan arah urutannya, dan antar folder selalu menurut nama. Ukuran/status/tipe/pengunggah tidak punya arti bagi folder; memaksakannya menghasilkan urutan yang tidak terbaca. Halaman memotong daftar gabungan itu, jadi penomoran halaman tidak perlu tahu ada dua macam baris.
- **Jumlah berkas di kartu folder dihitung rekursif** — seluruh keturunan, bukan anak langsung. Folder yang isinya hanya subfolder akan berbunyi "0 berkas" kalau tidak, dan terbaca kosong padahal memuat puluhan.
- **Folder ikut mengabarkan kegagalan di dalamnya** lewat penanda "*n* perlu perhatian". Folder menyembunyikan kegagalan, sementara seluruh guna kolom status adalah menjawab "bukti saya sudah siap belum" — satu berkas `GAGAL` tiga tingkat di dalam akan lenyap dari pandangan begitu daftarnya bertingkat.
- **Keadaan kosong jadi tiga, bukan dua**: perpustakaan yang memang belum berisi, folder yang kosong, dan pencarian yang tidak menemukan apa pun. Yang kedua perlu dibedakan — folder kosong yang menampilkan ajakan "belum ada bukti dukung" terbaca seolah seluruh perpustakaan kosong, padahal isinya cuma ada di cabang sebelah.

#### Unggah folder

Modal unggah punya dua tombol pilih: berkas, dan **folder** beserta seluruh isinya. Struktur foldernya diselesaikan **sekali, sebelum batch dimulai** — kalau tiap berkas menyelesaikan jalurnya sendiri saat unggahannya jalan, dua berkas dalam satu folder akan berlomba membuat folder yang sama dua kali.

- **Cakupan satu per batch, folder per berkas.** Pembagian itulah yang membuat satu folder utuh bisa mendarat apa adanya, karena berkasnya memang tersebar ke beberapa folder sekaligus.
- **Nama yang sama di bawah induk yang sama dipakai ulang, tidak diduplikasi.** Berbeda dari Google Drive, yang menduplikasi — di sini mengunggah ulang `Kriteria 4/` yang sudah ada jauh lebih sering berarti "tambahkan isinya" daripada "buatkan folder kembar".
- **Folder kosong tidak bisa terbawa.** Peramban hanya memancarkan berkas; direktori tanpa berkas tidak meninggalkan jejak apa pun untuk dibaca. Yang tercipta hanya folder yang memuat setidaknya satu berkas yang lolos validasi. Ini batas peramban, bukan pilihan rancangan — dan dicatat supaya tidak "diperbaiki" nanti.
- **Berkas terbuang diringkas per alasan**, tidak lagi satu baris per berkas: folder nyata selalu berisi `.DS_Store`, `Thumbs.db`, dan sejenisnya, dan daftar satu-satu berhenti terbaca pada 150 penolakan. Rinciannya tetap bisa dibuka.
- **Batas 100 berkas per unggahan**, dinyatakan di modal, dan sisanya dilaporkan — bukan dipotong diam-diam. Daftar yang tiba-tiba lebih pendek dari yang dipilih terbaca seperti berkas yang hilang.
- **Target ke prodi lain mendarat di akar prodi itu.** §4.4.1 membolehkan lapis tenant menyasar prodi mana pun; pohon prodi itu sedang tidak terlihat, dan memilih folder di perpustakaan yang tidak kelihatan adalah menebak. Dalam keadaan itu pemilih foldernya tidak dirender dan diganti keterangannya. Struktur folder yang ikut diunggah tetap terbawa.

#### Menata isi

- **Buat folder & ganti nama** memakai satu dialog yang sama; bentuknya identik, dan dua dialog berarti dua salinan pesan validasi yang harus dijaga tetap sama. Nama ditolak bila kosong, lebih dari 100 karakter, memuat garis miring, atau sudah dipakai saudara di induk yang sama (tanpa peduli besar-kecil huruf).
- **Pindah lewat dialog "Pindahkan ke…"**, bukan tarik-lepas. Tarik-lepas hanya menjangkau folder yang kebetulan sedang terlihat di layar yang sama, tidak bisa dipakai tanpa tetikus, dan menuntut tiga sasaran jatuh berbeda. Dialog dengan pohon ciut menjawab ketiganya, dan ia pula yang membuat memindahkan dua belas berkas sekaligus mungkin. Folder yang sedang dipindahkan beserta keturunannya **tidak dirender** di pemilih — tujuan yang tampak ada tapi tidak bisa dipilih mengabarkan pilihan yang tidak pernah ada.
- **Pilih massal** lewat centang di kartu maupun baris tabel, dengan satu bilah aksi. Seleksi dibersihkan saat berpindah folder, berpindah halaman, dan saat kata kunci berubah: aksi massal atas berkas yang tidak terlihat di layar adalah cara paling mudah menghapus hal yang salah. Tombol hapus massal mati bila sebagian pilihan bukan unggahan penggunanya sendiri (§15) — menghapus sebagiannya diam-diam adalah hasil yang tidak diminta siapa pun.
- **Hapus folder ikut menghapus isinya**, dengan jumlah subfolder dan berkas disebut di konfirmasi sebelum apa pun dihapus. Tidak ada tempat sampah, jadi angka itulah satu-satunya penahan. Peringatan rujukan bab yang sama seperti hapus satu berkas ikut ditampilkan.
- **Ganti nama berkas sengaja belum ada.** `nama_dokumen` adalah nama berkas lengkap dengan ekstensinya sementara `file_url` adalah object key yang tidak ikut berubah — satu berkas akan punya dua nama, dan yang dilihat pengguna bukan yang ada di penyimpanan. Itu keputusan sendiri, bukan efek samping folder.

#### Di luar perpustakaan

Pemilih bukti dukung di tab Generasi Editor Bab (§12.1) **tetap datar**, hanya ditambah jalur folder sebagai keterangan di bawah nama berkas. Pekerjaan panel itu memilih berkas mana yang menyuapi AI, bukan menjelajahi perpustakaan; menuntut penggunanya menelusuri pohon di kolom 320 px menambah langkah tanpa menambah kejelasan. Yang benar-benar hilang tanpa folder cuma satu hal — kemampuan membedakan dua `LKPS_2026.xlsx` dari tempat berbeda — dan itu dijawab satu baris jalur, bukan satu mode navigasi baru.

Unggah dari tab Generasi (§12.1a) dan dari halaman Penilaian AMI tetap memakai modal yang sama, lengkap dengan pemilih folder tujuannya; bawaannya akar, karena keduanya memang tidak sedang menjelajahi perpustakaan.

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

Kasus uji folder (§4.6a):

| #   | Kondisi                                          | Aksi                                          | Hasil yang diharapkan                                                                                                     |
| --- | ------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 15  | Dashboard Utama, angka kesiapan tercatat         | Buat tiga folder, kembali ke Dashboard        | Angka "n dari m berkas siap dipakai AI" **sama persis**. Folder tidak pernah terhitung sebagai berkas — ini uji terpenting |
| 16  | Sedang di dalam sebuah folder                    | Muat ulang halaman                            | Tetap di folder itu; `?folder=` dibaca dari URL seperti `q`/`sort`/`page`                                                  |
| 17  | URL memuat `?folder=` yang folder-nya tak ada    | Buka URL itu                                  | Dipulangkan ke akar dan `?folder=` dibersihkan dari URL, bukan menampilkan folder kosong yang tak bisa dijelaskan          |
| 18  | Sedang di dalam folder A                         | Cari kata kunci yang cocok di folder B        | Hasil dari seluruh cakupan, remah tautan diganti keterangan, tiap baris membawa jalur foldernya; kosongkan → kembali ke A  |
| 19  | Sudah ada folder "Laporan & Notulen" di akar     | Buat folder "LAPORAN & notulen" di akar       | Ditolak beserta alasannya; nama yang sama di induk berbeda tetap diterima                                                 |
| 20  | Direktori berisi `Kriteria 4/SK/a.pdf`, `Kriteria 4/b.docx`, satu `.txt`, dan satu subfolder kosong | Pilih folder lalu unggah | Dua folder tercipta bersarang benar, `.txt` diringkas sebagai penolakan per alasan, **subfolder kosong tidak ikut**        |
| 21  | Lanjutan #20                                     | Unggah ulang jalur yang sama                  | Folder dipakai ulang, tidak jadi kembar                                                                                    |
| 22  | Beberapa berkas tercentang                       | Pindahkan ke folder lain                      | Semuanya pindah dalam satu langkah; bilah seleksi hilang setelahnya                                                        |
| 23  | Memindahkan sebuah folder                        | Buka pemilih tujuan                           | Folder itu beserta seluruh keturunannya **tidak dirender** — bukan sekadar dinonaktifkan                                   |
| 24  | Folder berisi 2 subfolder dan 3 berkas           | Hapus folder itu                              | Konfirmasi menyebut angka pastinya; setelah dihapus tak satu pun keturunannya tersisa dan tak ada berkas yatim             |
| 25  | Penyusun memilih berkasnya sendiri + milik orang | Lihat bilah aksi terpilih                     | Tombol hapus mati beserta alasannya; memilih hanya miliknya sendiri membuatnya hidup lagi                                  |
| 26  | Folder baru yang masih kosong                    | Masuk ke dalamnya                             | "Folder ini masih kosong", bukan ajakan yang sama dengan perpustakaan yang memang belum berisi                             |
| 27  | Editor Bab → tab Generasi                        | Lihat daftar bukti dukung                     | Daftarnya tetap datar, tiap berkas membawa jalur foldernya; berkas di akar tidak menampilkan apa pun                       |

---

## 5. Dashboard Prodi

**Diakses oleh**: `ADMIN`? — tidak. `PIMPINAN`, `PENJAMIN_MUTU` (lewat klik dari Dashboard Utama), dan `PENYUSUN` (landing langsung setelah login).

### 5.1 Ringkasan Kesiapan Prodi

Halaman index lapis ini menjawab satu pertanyaan: **seberapa siap prodi ini menghadapi akreditasi.** Subjeknya prodi, bukan daftar dokumennya.

> **Catatan desain — kenapa bukan daftar kartu.** Versi awal §5.1 merender seluruh `DOKUMEN_LED` prodi sebagai kartu sederajat. Itu memodelkan dunia yang salah: akreditasi LAM Teknik dilakukan per prodi dan berjalan **satu dokumen pada satu waktu**, sehingga grid sederajat memberi kesan beberapa dokumen sedang dikerjakan berdampingan. Sekarang dokumen yang sedang disusun ditonjolkan sebagai kartu (§5.1b) dan sisanya turun jadi baris tabel riwayat (§5.1c) — seluruh dokumen prodi tetap terlihat dan bisa dibuka, sesuai syarat awal, tapi bentuknya sendiri sudah menyatakan mana yang sedang dikerjakan.

**Aturan utama halaman ini: satu blok, satu kerangka waktu.** Halaman disusun jadi tiga blok yang masing-masing menyebut kerangkanya sendiri:

| Blok | Kerangka waktu | Sumber |
| --- | --- | --- |
| **Akreditasi Aktif** (§5.1a) | Masa lalu — capaian yang sudah disahkan | `PROGRAM_STUDI` |
| **Penyusunan Berjalan** (§5.1b) | Sekarang — usaha menuju akreditasi berikutnya | `DOKUMEN_LED` aktif beserta `BAB_DOKUMEN`-nya |
| **Riwayat & sumber daya** (§5.1c) | Lintas penyusunan — jejak dan bekal prodi | Seluruh `DOKUMEN_LED` prodi, `BUKTI_DUKUNG` prodi, `USER` |

§5.1a dan §5.1b dirender **berdampingan dua kolom** (menumpuk di bawah `lg`). Berdampingan justru karena kerangkanya berbeda: pertanyaan "prodi ini sekarang terakreditasi apa" dan "usaha menuju akreditasi berikutnya sudah sejauh mana" hanya berguna kalau terbaca bersamaan, dan dua kartu sederajat menyatakan keduanya setara tanpa menyatakan keduanya mengukur hal yang sama.

> **Catatan desain — kenapa akreditasi tidak ikut baris ringkasan.** Versi sebelumnya menaruh "Masa Berlaku Akreditasi" sebagai kartu keempat, sebaris dengan kelengkapan bab dan kesiapan review. Empat kartu sederajat membuat pembaca menyimpulkan keempatnya mengukur hal yang sama, padahal peringkat "Baik Sekali" beserta masa berlakunya adalah **hasil penyusunan sebelumnya** — bukan ukuran pekerjaan yang sedang berjalan. Kartu ketiganya pun menghitung akumulasi bukti dukung lintas penyusunan, sehingga satu baris itu memuat tiga kerangka waktu sekaligus. Sejak itu capaian lampau punya kartunya sendiri, dan angka penyusunan tidak pernah berbagi baris dengannya.

**Aksi ubah data di halaman ini hanya ada di tabel riwayat** (§5.1c): ubah dan hapus `DOKUMEN_LED`. Sesuai §1 keduanya **tidak dirender sama sekali** di luar `PENJAMIN_MUTU`, bukan sekadar dinonaktifkan. Selebihnya halaman ini murni baca.

#### 5.1a Blok Akreditasi Aktif

Satu kartu berlabel "Akreditasi Aktif": nama, `jenjang`, `fakultas`, `kode`, `ketua_prodi`, badge `peringkat_akreditasi`, `nomor_sk_akreditasi`, serta `berlaku_sampai_akreditasi` beserta sisa waktunya. Sisa waktu diwarnai sesuai urgensi (§5.1d).

Prodi `BELUM_TERAKREDITASI` menampilkan "Belum pernah terakreditasi" secara eksplisit, bukan baris kosong: tidak pernah punya peringkat berbeda dari peringkat yang masa berlakunya habis.

> **Catatan desain — kenapa bukan "Akreditasi Berjalan".** Label lamanya berbunyi "Akreditasi Berjalan". Sejak kartu ini berdampingan dengan "Penyusunan Berjalan", kata yang sama di dua kartu bersebelahan justru meleburkan dua kerangka waktu yang sengaja dipisahkan halaman ini — "aktif" menyebut sesuatu yang sedang berlaku, "berjalan" menyebut sesuatu yang sedang dikerjakan.

#### 5.1b Blok Penyusunan Berjalan

Satu kartu sederajat dengan §5.1a, memuat judul dokumen, `tahun_akademik`, badge `status_keseluruhan`, `tenggat` beserta sisa waktunya (diwarnai sesuai urgensi, §5.1d), satu **bar kelengkapan bertumpuk**, dan tombol **Lihat Detail** menuju Dashboard Project LED.

Bar dibagi jadi empat segmen sesuai status bab turunan (§6.1a), berurutan dari yang paling tuntas: `TERKUNCI` → `MENUNGGU_REVIEW` → `SEDANG_DISUSUN` → `BELUM_DIISI`, dengan legenda angka di bawahnya. Status yang jumlahnya nol tidak dirender — legenda yang selalu empat baris menenggelamkan yang berubah.

**Tiap segmen punya tooltip** berisi `{status} — {n} bab ({p}%)`. Pemicunya tombol sungguhan, bukan bidang mati, sehingga keterangannya terjangkau kursor maupun keyboard. Komponen yang sama dipakai tabel §4.0c dengan legendanya dimatikan — di dalam sel tabel legenda tidak muat, dan di sana tooltip inilah satu-satunya cara warna menyebutkan namanya.

Angkanya diambil dari hitungan **per status turunan**, bukan dari `terisi`/`terkunci`/`menunggu review` yang masing-masing menjawab pertanyaannya sendiri dan boleh tumpang tindih (bab terkunci yang kontennya kosong terhitung di dua tempat). Bar bertumpuk hanya jujur bila segmennya saling lepas dan totalnya persis jumlah bab; memakai aturan yang sama dengan badge §6.1a sekaligus menjamin bar dan badge tidak pernah berbeda pendapat.

Bab hanya dihitung dari dokumen yang sedang disusun. Mencampur dokumen lama yang sudah tuntas akan membuat angkanya selalu terlihat bagus dan justru menyembunyikan pekerjaan yang belum jalan. Dokumen yang belum punya bab sama sekali menyatakan "Dokumen ini belum punya bab", bukan bar kosong yang terbaca "semua bab belum diisi".

Dokumen tanpa `tenggat` menampilkan **"Tenggat tidak dipatok"**, bukan "—": tidak dipatok adalah pilihan yang sah (§14), sedangkan "—" terbaca sebagai data yang hilang.

Kartu ini diganti satu kartu keadaan kosong bila tidak ada yang sedang disusun. Prodi yang belum punya dokumen sama sekali dan prodi yang seluruh dokumennya `SELESAI` adalah dua keadaan berbeda, dan kalimatnya pun berbeda.

> **Catatan desain — kenapa rincian penyusunan dibuang dari sini.** Versi sebelumnya membongkar empat kartu angka di blok ini: Bab Terisi, Kesiapan Review, Bukti Dukung Dipakai, dan Sisa Tenggat — plus timeline "Aktivitas Penyusunan Ini" di bawahnya. Seluruhnya bercakupan satu dokumen, dan seluruhnya sudah punya rumah yang lebih lengkap di Dashboard Project LED (§6.1). Akibatnya lapis prodi berubah jadi salinan lapis di bawahnya dan kehilangan subjeknya sendiri: pembaca yang datang untuk menilai **prodi** malah disuguhi rapor satu dokumen. Sekarang yang tersisa hanya penanda apakah dokumennya bergerak — satu bar dan satu tenggat; siapa pun yang butuh lebih dalam menekan Lihat Detail. Bukti dukung terpakai ikut hilang dari sini karena pembandingnya (tenant + prodi) berbeda dari panel Bukti Dukung Prodi di §5.1c, dan dua angka bukti dukung dengan pembanding berbeda di satu halaman selalu terbaca sebagai salah satunya keliru.

#### 5.1c Blok riwayat & sumber daya

Kolom utama — **Riwayat Penyusunan LED**, tabel ringkas seluruh `DOKUMEN_LED` prodi ini, **termasuk yang sedang disusun**, dipotong lima baris dengan sisanya diringkas satu baris:

| Kolom | Isi |
| --- | --- |
| **Judul** | Tautan langsung ke Dashboard Project LED (Lapis 3) |
| **Tahun** | `tahun_akademik` |
| **Status** | Badge `status_keseluruhan` |
| **Aksi** | Menu ⋮ berisi Ubah & hapus — hanya dirender untuk `PENJAMIN_MUTU` (§15) |

Dokumen yang sedang disusun ikut terdaftar, bukan dikecualikan: akreditasi berjalan per prodi lintas tahun, dan penyusunan sekarang baru bermakna kalau terbaca sebagai kelanjutan yang sebelumnya. Kartu §5.1b tetap yang menonjolkannya — baris di tabel adalah tempatnya dalam urutan, bukan pengulangan.

Tabelnya sengaja **tanpa pencarian, pengurutan, maupun paginasi**, dan ditutup tautan **Lihat semua** ke §5.3. Menyalin perkakas daftar penuh ke sini hanya akan melahirkan dua halaman yang sama; yang dibutuhkan dashboard cuma jejaknya.

> **Catatan desain — riwayat kembali ke dashboard, dalam bentuk ringkas.** Versi awal blok ini memuat daftar dokumen lama yang bisa diklik, lalu daftar itu dibuang seluruhnya setelah §5.3 berdiri karena jadi salinan kedua tanpa pencarian maupun paginasi. Yang tersisa hanya timeline aktivitas satu dokumen. Sejak rincian penyusunan dibuang dari §5.1b, kolom utama justru kosong sementara pertanyaan "prodi ini sudah menyusun berapa kali" tidak terjawab di mana pun tanpa pindah halaman — padahal itu pertanyaan **tentang prodi**, persis subjek halaman ini. Riwayat karena itu kembali, tapi sebagai tabel ringkas yang mengaku dirinya ringkas: lima baris, empat kolom, dan satu tautan ke daftar penuhnya.

Panel samping:

- **Bukti Dukung Prodi** — `n/total` berkas `SIAP`, jumlah yang masih diproses, jumlah yang `GAGAL`, waktu unggah terakhir, dan tombol ke Perpustakaan Bukti Dukung prodi. Angkanya **hanya berkas `owner_tipe = PROGRAM_STUDI`** supaya cocok dengan daftar di halaman yang dituju (§5.2); berkas level tenant tidak ikut. Inilah satu-satunya angka bukti dukung di halaman ini: kartu "Bukti Dukung Dipakai" yang dulu ada di §5.1b memakai pembanding yang lebih luas (tenant + prodi, karena pertanyaannya "apa yang boleh dipakai bab"), dan dua angka bukti dukung dengan pembanding berbeda di satu halaman selalu terbaca sebagai salah satunya keliru. Pertanyaan yang lebih luas itu kini hanya dijawab §6.1.

- **Tim Penyusun** — `USER` berrole `PENYUSUN` dengan `program_studi_id` prodi ini. Prodi tanpa Penyusun bukan daftar kosong biasa: dokumennya tidak akan pernah bergerak, jadi keadaan itu ditampilkan sebagai peringatan. Tautan ke Manajemen User sengaja tidak dipasang — halaman ini juga dibuka Penyusun dan Penjamin Mutu yang tidak berhak ke sana (§15).

**Tidak ada panel "Perlu Perhatian" di sini** — dan sejak §4.0c dipecah jadi dua tabel, aturannya sendiri sudah dihapus dari aplikasi (alasan lengkapnya di catatan desain blok itu). Yang murni per bab tetap punya panelnya sendiri di Dashboard Project LED (§6.1).

#### 5.1d Hak akses di level ini

- `PENYUSUN` hanya melihat halaman ini untuk **satu** prodi tempatnya ditugaskan (`USER.program_studi_id`), dan mendarat langsung di sini setelah login (§2).
- `PIMPINAN`/`PENJAMIN_MUTU` bisa membuka Dashboard Prodi mana pun (lintas prodi), karena mereka beroperasi di level tenant.
- `ADMIN` ditolak di lapis ini dan dipulangkan ke Dashboard Utama.
- Kolom **Aksi** tabel riwayat (§5.1c) hanya dirender untuk `PENJAMIN_MUTU`, aturan yang sama persis dengan §5.3 dan §15. `PIMPINAN` read-only di level ini (§6.2), dan `PENYUSUN` tidak pernah punya aksi atas `DOKUMEN_LED`. Untuk keduanya kolomnya hilang seluruhnya, bukan berisi tombol mati — kolom kosong bertajuk "Aksi" tetap menjanjikan sesuatu yang tidak ada.

#### 5.1e Yang sedang disusun dan sisa waktu adalah turunan, bukan kolom

Tiga nilai yang menggerakkan halaman ini semuanya dihitung saat render:

| Nilai | Aturan |
| --- | --- |
| Yang sedang disusun | `status_keseluruhan != SELESAI` dengan `tahun_akademik` terbesar; `createdAt` jadi pemutus untuk tahun yang sama |
| Sisa masa berlaku | Selisih hari ke `berlaku_sampai_akreditasi`. `AMAN` > 365 hari, `MENDEKATI` ≤ 365, `KEDALUWARSA` < 0 |
| Sisa tenggat | Selisih hari ke `tenggat`. `DEKAT` ≤ 30 hari, `LEWAT` < 0 |

> **Catatan desain — kenapa tidak jadi kolom.** Sama seperti status bab di §6.1a, ketiganya murni kebutuhan tampilan. Kolom `is_aktif` akan jadi sumber kebenaran kedua yang bisa tidak sinkron dengan `status_keseluruhan`, sedangkan sisa hari yang disimpan pasti basi begitu tanggal berganti — menjaganya segar butuh pekerjaan terjadwal yang tidak sepadan. Karena itu tiga aturan di atas tidak menambah kolom apa pun ke `docs/database.md`.

**Dibedakan dengan sengaja**: `berlaku_sampai_akreditasi` dan `tenggat` yang kosong berarti "tidak ada", bukan "sudah lewat". Prodi `BELUM_TERAKREDITASI` menyatakan "Belum pernah terakreditasi", dan dokumen tanpa tenggat menyatakan "Tidak dipatok" — bukan keduanya dirender sebagai angka nol atau keterlambatan.

#### 5.1f Yang sengaja belum ditampilkan

Mengikuti alasan yang sama dengan §6.1 — kolom yang selalu berisi "—" hanya menambah derau:

- **Ringkasan skor rubrik prodi** — sumbernya kini Penilaian AMI, bukan simulasi skor bab yang sudah dihapus (§9); menunggu ada beberapa Dokumen LED yang sudah dinilai supaya rata-ratanya berarti.
- **Data kuantitatif LKPS** — model datanya masih Pertanyaan Terbuka #3.
- **Grafik tren antar penyusunan** — baru bermakna setelah ada beberapa penyusunan dengan skor; sampai itu, bar persentase sudah cukup.

### 5.2 Perpustakaan Bukti Dukung (level Prodi)

- Menampilkan `BUKTI_DUKUNG` dengan `owner_tipe = PROGRAM_STUDI` dan `program_studi_id` sesuai prodi ini.
- **Upload**: `PIMPINAN`, `PENJAMIN_MUTU`, dan `PENYUSUN` (untuk prodinya sendiri).
- Karena `BUKTI_DUKUNG` tidak terikat ke `DOKUMEN_LED` tertentu, bukti dukung yang diunggah di sini otomatis tersedia untuk **semua** `DOKUMEN_LED` milik prodi tersebut (misalnya jika prodi punya beberapa penyusunan/tahun akademik berbeda) — tidak perlu upload ulang.
- **Target unggahan terkunci** ke prodi yang sedang dibuka (`:programId` di URL), jadi pemilih level tidak dirender sama sekali di sini. Mau mengunggah untuk prodi lain atau untuk universitas? Lewat perpustakaan level tenant (§4.4.1). Alur unggah, status ekstraksi, dan bentuk tampilannya sama persis dengan §4.5 dan §4.6.
- **Hapus**: `PIMPINAN` dan `PENJAMIN_MUTU` boleh menghapus bukti dukung apa pun; `PENYUSUN` hanya berkas yang ia unggah sendiri. Sesuai §1, tombol hapus untuk berkas milik orang lain **tidak dirender** bagi Penyusun, bukan sekadar dinonaktifkan.

### 5.3 Daftar Dokumen LED (khusus prodi ini)

`/study-programs/:programId/led-projects` — seluruh `DOKUMEN_LED` dengan `program_studi_id` sesuai prodi yang sedang dibuka, dalam bentuk tabel penuh. Dashboard Prodi (§5.1c) memang sudah memuat riwayat, tapi ringkas: lima baris teratas, empat kolom, tanpa perkakas. Halaman inilah daftar penuhnya — pencarian, pengurutan, paginasi, plus kolom **Tenggat** dan **Tanggal Dibuat** — dan tautan "Lihat semua" di dashboard bermuara ke sini.

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


#### 5.3a Kolom Tahun Akademik — satu angka, bukan `YYYY/YYYY`

Formulir Tambah/Ubah Dokumen LED **tidak** meminta `2025/2026` diketik utuh. Yang diminta satu angka tahun mulai; `tahun_akademik` yang tersimpan disusun darinya sebagai `${t}/${t+1}`, dan hasilnya diperlihatkan hidup di sebelah kolom sementara diketik.

Sebelumnya kolom ini ketikan bebas yang divalidasi regex `^\d{4}/\d{4}$`. Regex itu menjaga **bentuk tulisannya**, bukan artinya, sehingga tiga hal berikut lolos: tahun kembar (`2026/2026`), urutan mundur (`2030/2020`), dan selisih yang bukan satu (`2025/2030`). Karena tahun kedua kini tidak pernah diketik pengguna, ketiganya bukan ditolak melainkan **tidak mungkin terbentuk**. Regex-nya tetap dipertahankan di `ledProjectSchema` sebagai lapis kedua untuk baris lama dan untuk data yang nanti datang dari API, bukan dari formulir.

| Aturan | Nilai | Alasan |
|---|---|---|
| Batas bawah | `2015`, angka tetap | Siklus akreditasi lima tahunan; dua siklus arsip ke belakang. Sengaja **tidak** dihitung mundur dari tahun berjalan — batas yang bergeser tiap Januari membuat dokumen lama tiba-tiba ditolak, dan yang kena justru orang yang cuma mengubah tenggat |
| Batas atas | tahun berjalan + 1 | LED disusun untuk tahun berjalan atau tahun berikutnya; lebih jauh dari itu bukti dukungnya belum ada |
| Kembar per prodi | ditolak | Satu prodi tidak boleh punya dua `DOKUMEN_LED` dengan `tahun_akademik` sama — lihat catatan di bawah |

Pratinjau di sebelah kolom bukan hiasan. Tanpa itu tidak ada cara mengetahui apakah yang diminta tahun awal atau tahun akhir, dan yang bermaksud menyusun 2025/2026 lalu mengetik `2026` akan meleset setahun tanpa pernah melihat kesalahannya.

> **Catatan desain — kenapa tidak dropdown.** Rencana awal mengganti kolom ini dengan `Select` berisi tahun yang dibangkitkan. Ditolak karena daftar opsi pasti terbatas: dokumen contoh `2021/2022` sudah berada di luar jendela tahun berjalan ±2, sehingga formulir ubahnya akan membuka `Select` tanpa nilai terpilih dan bisa diam-diam mengganti tahunnya saat disimpan. Menambalnya butuh opsi "tahun lain" yang membuka ketikan bebas — yaitu kembali ke keadaan semula. Penurunan dari satu angka memberi jaminan yang sama tanpa daftar yang bisa kehabisan.

> **Catatan desain — kenapa tahun kedua tidak bisa diketik.** Tahun akademik di Indonesia selalu dua tahun berurutan; `2025/2027` tidak ada. Selama itu berlaku, kolom kedua hanya punya satu jawaban benar untuk setiap tahun pertama — bukan isian, melainkan ujian yang menambah peluang salah tanpa menambah satu pun kemungkinan yang bisa dinyatakan. Kalau suatu saat ditemukan penulisan yang tidak berurutan, kolom keduanya ditambahkan di formulir dan **penyimpanannya tidak perlu berubah**: yang tersimpan tetap string `YYYY/YYYY` yang sama, jadi pengurutan, pencarian, dan kop PDF Penilaian AMI (§8.4a) tidak ikut tersentuh.

> **Catatan desain — kembar per prodi baru ditolak sekarang.** Sebelum ini tidak ada apa pun yang mencegah satu prodi punya dua dokumen bertahun sama, dan akibatnya lebih merugikan daripada tahun yang salah bentuk. §5.1e menetapkan "penyusunan aktif" **diturunkan**, yaitu dokumen belum `SELESAI` dengan `tahun_akademik` terbesar. Dua dokumen bertahun sama membuat pemutusnya jatuh ke `createdAt`, sehingga salah satunya tidak pernah muncul di Dashboard Prodi — tanpa error dan tanpa tanda. Karena bukti dukung dipakai bersama seluruh dokumen prodi, tidak ada yang terasa janggal sampai ada yang bertanya kenapa pekerjaannya seperti hilang. Ditegakkan di formulir supaya pesannya menempel ke kolom tahun; di backend nanti ia jadi unique constraint `(program_studi_id, tahun_akademik)` (`database.md` §5).
### 5.4 Kasus Uji — Dashboard Prodi & Daftar Dokumen LED

| #   | Kondisi                                                              | Aksi                                          | Hasil yang diharapkan                                                                                                          |
| --- | -------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Prodi mana pun                                                        | Buka `/study-programs/:id` di layar ≥ 1024px  | Kartu Akreditasi Aktif dan Penyusunan Berjalan berdampingan dua kolom; kartu kanan tidak memuat peringkat/masa berlaku akreditasi maupun akumulasi bukti dukung lintas penyusunan |
| 2   | Prodi punya satu dokumen `DRAFT` dan satu `SELESAI`                   | Buka `/study-programs/:id`                    | Yang `DRAFT` jadi kartu Penyusunan Berjalan; **keduanya** terdaftar di tabel riwayat, yang `DRAFT` di baris teratas          |
| 3   | Seluruh dokumen prodi berstatus `SELESAI`                            | Buka Dashboard Prodi                          | Kartu Penyusunan Berjalan diganti "Tidak ada yang sedang disusun"; tabel riwayat tetap memuat seluruh dokumennya               |
| 3b  | Dokumen yang sedang disusun punya bab dengan status campuran         | Bandingkan bar kelengkapan dengan tabel Progres per Bab (§6.1) | Jumlah tiap segmen sama persis dengan jumlah badge status yang sama; total segmen = jumlah bab; status bernilai nol tidak muncul di legenda |
| 3c  | Dokumen yang sedang disusun belum punya bab sama sekali              | Buka Dashboard Prodi                          | Berbunyi "Dokumen ini belum punya bab", bukan bar kosong yang terbaca "semua bab belum diisi"                                  |
| 4   | Prodi belum punya `DOKUMEN_LED` sama sekali                          | Buka Dashboard Prodi                          | Muncul "Belum ada Dokumen LED" (kalimat berbeda dari #3); tabel riwayat diganti satu kalimat, bukan tabel berkepala tanpa baris |
| 5   | Prodi `BELUM_TERAKREDITASI` (`berlaku_sampai_akreditasi` kosong)      | Buka Dashboard Prodi                          | Kartu akreditasi berbunyi "Belum pernah terakreditasi", bukan tanggal kosong atau sisa hari negatif                             |
| 6   | Dokumen yang sedang disusun tanpa `tenggat`                          | Buka Dashboard Prodi                          | Baris tenggat berbunyi "Tenggat tidak dipatok" tanpa warna urgensi                                                             |
| 7   | Dokumen yang sedang disusun dengan `tenggat` di masa lalu            | Buka Dashboard Prodi                          | Baris tenggat merah "terlambat N hari"                                                                                          |
| 8   | Lanjutan #6                                                          | Isi `tenggat` lewat Edit Dokumen LED          | Dashboard Prodi ikut berubah tanpa perlu muat ulang manual                                                                     |
| 9   | Prodi tanpa `USER` berrole `PENYUSUN`                                | Buka Dashboard Prodi                          | Panel Tim Penyusun berisi peringatan beserta cara menugaskannya                                                                |
| 10  | Prodi punya bukti dukung sendiri                                     | Bandingkan panel Bukti Dukung Prodi dengan `/study-programs/:id/evidence` | Total di panel **sama persis** dengan jumlah data di perpustakaan; berkas level tenant tidak ikut terhitung                     |
| 12  | Bukti dukung **milik prodi** ada yang `GAGAL`                        | Buka Dashboard Prodi                          | Panel Bukti Dukung Prodi menyebut jumlah yang gagal                                                                             |
| 13  | Prodi mana pun                                                       | Buka Dashboard Prodi                          | **Tidak ada** panel "Perlu Perhatian" di halaman ini; panel samping hanya Bukti Dukung Prodi dan Tim Penyusun                   |
| 14  | Prodi punya lebih dari lima `DOKUMEN_LED`                            | Baca tabel riwayat                            | Hanya lima baris dirender, ditutup "…dan N dokumen lain di daftar lengkapnya"; tautan Lihat semua membuka §5.3                  |
| 14b | Penjamin Mutu                                                        | Buka menu ⋮ satu baris riwayat lalu Hapus     | Konfirmasi muncul; setelah disetujui barisnya hilang **tanpa muat ulang manual**, dan kartu Penyusunan Berjalan ikut menyesuaikan bila yang dihapus dokumen aktifnya |
| 14c | Penjamin Mutu                                                        | Buka menu ⋮ lalu Ubah, simpan formulirnya     | Dipulangkan ke Dashboard Prodi (bukan ke §5.3 maupun lapis tenant), dengan perubahannya sudah terlihat                          |
| 14d | Pimpinan atau Penyusun                                               | Buka Dashboard Prodi                          | Tabel riwayat identik **tanpa kolom Aksi sama sekali** — bukan kolom berisi tombol mati                                          |
| 15  | Penyusun prodi tersebut                                              | Login                                         | Mendarat langsung di Dashboard Prodi-nya; tombol "← Dashboard Utama" dan breadcrumb "Dashboard" tidak dirender                  |
| 16  | Admin                                                                | Ketik `/study-programs/1` di address bar      | Dialihkan ke `/dashboard`; isi Dashboard Prodi tidak pernah dirender                                                            |
| 17  | Prodi tersimpan sebelum kolom identitas akreditasi ada               | Buka Dashboard Prodi                          | Field yang belum terisi tampil sebagai "Belum diisi", bukan `undefined`; halaman tetap merender penuh                            |
| 18  | Layar sempit (< 1280px)                                              | Buka Dashboard Prodi                          | Panel samping turun ke bawah kolom utama; tidak ada scroll horizontal pada halaman                                             |
| 19  | Penjamin Mutu                                                        | Buka `/study-programs/1/led-projects`         | Hanya dokumen prodi 1 yang tampil (bukan lintas prodi); tombol Tambah dan kolom Aksi dirender                                   |
| 20  | Pimpinan atau Penyusun                                               | Buka halaman yang sama                        | Tabel identik tanpa tombol Tambah dan tanpa kolom Aksi                                                                          |
| 21  | Penjamin Mutu di daftar prodi                                        | Klik Tambah Dokumen LED                       | Formulir terbuka dengan prodi tersebut sudah terpilih; simpan maupun Batal memulangkan ke daftar prodi, bukan ke lapis tenant   |
| 22  | Tautan formulir dikarang dengan `?returnTo=https://situs-lain`       | Tekan Batal                                   | Dipulangkan ke `/dashboard/led-projects`; tujuan di luar aplikasi diabaikan                                                     |
| 23  | Daftar berisi lebih dari satu halaman                                | Ketik kata kunci, ubah urutan, muat ulang     | Hasil benar-benar tersaring dan terurut, `Total n data` menyesuaikan, dan `q`/`sort`/`page` bertahan di URL                     |
| 24  | Formulir Tambah/Ubah Dokumen LED                                     | Ketik `2025` di kolom Tahun Akademik          | Pratinjau di sebelahnya berbunyi "Tahun akademik 2025/2026"; tidak ada kolom kedua yang bisa diketik                             |
| 25  | Tahun berjalan 2026                                                  | Isi `2014`, lalu `2028`                       | Keduanya ditolak dengan menyebut rentang yang berlaku; halaman tidak berpindah dan isian lain tidak hilang                       |
| 26  | Formulir Tambah Dokumen LED                                          | Isi kurang dari empat angka, mis. `202`       | Ditolak dengan contoh pengisian satu angka tahun — bukan pesan format `YYYY/YYYY` yang lama                                      |
| 27  | Prodi sudah punya dokumen untuk tahun akademik tersebut              | Buat dokumen baru dengan tahun yang sama      | Ditolak dengan menyebut nama prodi dan tahunnya; pesannya menempel di kolom Tahun Akademik, bukan muncul sebagai `alert`         |
| 28  | Dokumen arsip lama (mis. `2021/2022`)                                | Buka Ubah, simpan tanpa mengubah apa pun      | Kolom berisi `2021` dengan pratinjau `2021/2022`; tersimpan tanpa ditolak — tahun arsip tetap sah dan dokumen tidak dianggap bentrok dengan dirinya sendiri |

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

**Menyusul**: ringkasan skor rubrik per bab belum ditampilkan di tabel ini — kolom yang selalu berisi "—" hanya menambah derau. Sumbernya kini Penilaian AMI, bukan simulasi skor bab yang sudah dihapus (§9), dan skor AMI per bab sudah bisa dilihat dari tab Review di Editor Bab. Begitu pula indikator "siapa sedang menyunting": datanya hidup di Redis (§13), bukan di basis data, jadi menunggu backend.

### 6.1a Status bab adalah turunan, bukan kolom

`BAB_DOKUMEN` **tidak** punya kolom status. Badge di tabel dihitung saat render dari fakta yang sudah ada:

| Status turunan   | Aturan                                | Arti bagi pembaca                   |
| ---------------- | ------------------------------------- | ----------------------------------- |
| `BELUM_DIISI`    | `konten_kerja` kosong/null            | Belum disentuh sama sekali          |
| `SEDANG_DISUSUN` | ada `konten_kerja`, `terkunci = false`, `diajukan_review_pada = null` | Sedang dikerjakan, masih bisa diedit |
| `MENUNGGU_REVIEW` | `diajukan_review_pada` terisi, `terkunci = false` | Penyusun menyatakan siap; giliran Penjamin Mutu |
| `TERKUNCI`       | `terkunci = true`                     | Dikunci Penjamin Mutu untuk review  |

Urutannya dari yang paling membatasi. `terkunci` **menang atas segalanya** — bab yang dikunci tetap tampil `TERKUNCI` walau isinya kosong atau pernah diajukan, konsisten dengan §12.2 yang memblokir semua aksi ubah data apa pun isi babnya. `MENUNGGU_REVIEW` menyusul di bawahnya karena ia hanya membekukan Penyusun; Penjamin Mutu masih bisa menyunting babnya (§12.3).

> **Catatan desain — kenapa tidak jadi kolom.** Status ini murni kebutuhan tampilan dashboard. Menyimpannya sebagai kolom berarti ada dua sumber kebenaran yang harus dijaga tetap sinkron dengan `terkunci`, `diajukan_review_pada`, dan `konten_kerja`; begitu ada satu jalur yang lupa memperbaruinya (mis. buka kunci lewat aksi lain), dashboard berbohong. Yang bertambah di `docs/database.md` hanyalah **fakta** yang diturunkan (`diajukan_review_pada`), bukan statusnya.

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

> **Catatan — penamaan dan urutan tab.** Bagian ini semula menulis "Generate | Rujukan | Rubrik | Skor | Draft". Yang dipakai sekarang: **"Generate" jadi "Generasi"** supaya seluruh label berbahasa Indonesia, **Draft naik ke urutan kedua** karena ia pasangan langsung dari hasil generate, dan **"Skor" jadi "Kualitas AI"** karena nama lamanya tertukar rasanya dengan "Rubrik" — justru tab itu yang menampilkan skor 1–4 beserta totalnya, sedangkan yang ini mengukur mutu kerja AI-nya (§10.1). Urutan tampilnya kini **Draft | Generasi | Rujukan | Kualitas AI | Review** — tab **Review** menyusul sesudah catatan ini ditulis (keadaan bab: kunci dan catatan Penjamin Mutu, ditaruh paling akhir karena ia bukan alat menyusun), dan tab **Rubrik** kemudian dihapus (§9). Isi pasal 8–12 di bawah tidak berubah, hanya label dan urutannya. Satu-satunya sumber urutan dan label di kode ada di `PANEL_TABS` (`features/chapter/presentation/components/chapter-editor-panels.tsx`); `value` tiap tab tetap memakai nama lamanya karena ia kunci internal.
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

> **Catatan — tab Rubrik dihapus dari produk.** Ditulis sesudah kedua catatan di atas, dan menggantikan hasilnya, bukan pasal §9.1–§9.3 yang tetap dibiarkan utuh sebagai catatan keputusan.
>
> **Yang pergi:** tab Rubrik di sidebar kanan beserta tombol "Jalankan Simulasi", seluruh penulisan `HASIL_SKOR_KRITERIA` dari frontend (`chapter-score.entity.ts`, repository, dan sumber lokalnya dihapus), dan item **"Lihat skor"** di menu tab Draft — satu-satunya alasan item itu ada adalah membuka tab ini dengan checkpoint terpilih, jadi ia ikut pergi bersama tujuannya. Sidebar kanan kini enam tab: **Draft | Generasi | Panduan | Bukti | Kualitas AI | Review** — label "Bukti" ditetapkan belakangan di §11.1a menggantikan "Rujukan", dan tab **Panduan** menyusul di §11.1c. Yang terakhir itu bukan tab Rubrik ini yang kembali: ia murni baca, tanpa simulasi skor dan tanpa satu pun penulisan.
>
> **Yang tinggal:** `RUBRIK_KRITERIA` beserta deskripsi tiap level skor tetap jadi master data di `rubric-criterion.entity.ts` — pembacanya sekarang Penilaian AMI. Mesin penilainya juga tetap di `chapter-scoring.mock.ts` dan tetap deterministik; hanya pembungkus `scoreChapterContent()` yang dibuang, sedangkan `nilaiKriteria()` dipanggil `assessment-run.mock.ts`. Skor final AMI **per bab** tetap terlihat dari dalam editor lewat pita di **tab Review** (`assessment-bab-banner.tsx`), murni baca, dengan tautan ke halaman Penilaian AMI.
>
> **Kenapa:** dua angka resmi untuk bab yang sama, dan tidak ada cara menjelaskan selisihnya. Simulasi di editor memakai indikator dan mesin skor yang sama dengan Penilaian AMI, tapi menilai satu bab atas isinya saat itu, sementara yang masuk dokumen akreditasi adalah hasil AMI beserta koreksi Penjamin Mutu. Penyusun bisa mengejar angka simulasinya sampai penuh dan tetap mendapati penilaian resmi bab yang sama menyebut angka lain — sesuatu yang pita di §9 sendiri sudah dipasang untuk menambal. Menyisakan satu angka yang benar-benar berlaku lebih jujur daripada menerangkan dua.
>
> Catatan di atas (`§8.1`, `§9`) sengaja **tidak** disunting: keduanya mencatat keputusan yang memang pernah diambil, dan menulis ulangnya akan menghapus jejak kenapa fitur ini pernah ada.

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
>   *(Sudah tidak berlaku — §11.1c membangunnya sebagai tab tersendiri. Butir ini dibiarkan sebagai jejak kenapa ia menunggu selama itu.)*
> - **Rujukan menyimpan nama dan tipe berkas, bukan hanya id.** Bukti dukung bisa dihapus dari Perpustakaan; kalau yang tersimpan cuma id, rujukan yang berkasnya hilang berhenti bisa dibaca sama sekali — tidak ada tempat lain di sistem yang masih tahu namanya. Karena itu `BUKTI_DUKUNG_BAB` maupun `BUKTI_DUKUNG_DRAFT` di sini berbentuk `{ id, nama_dokumen, tipe_file }`, dengan preseden yang sama seperti `BAB_DRAFT.dibuat_oleh_user_id` yang juga menyimpan namanya. `ukuran_bytes` dan `status` sengaja **tidak** ikut: keduanya berubah sepanjang umur berkas, jadi menyalinnya berarti mengarsipkan keadaan yang langsung basi — keduanya dibaca langsung dari Perpustakaan saat ditampilkan.
> - **Berkas yang sudah dihapus tetap ditampilkan**, memakai nama arsipnya, dengan badge "Sudah dihapus" dan barisnya diredupkan. Menghilangkannya akan membuat riwayat berbohong: bab itu memang pernah disusun dari berkas tersebut, dan justru itu yang perlu diketahui saat dokumennya diperiksa asesor.
> - **Tidak ada tautan langsung ke satu bukti dukung.** Seleksi berkas di Perpustakaan masih state lokal komponennya, jadi yang ditawarkan hanya tombol membuka pustakanya. Jangan berpura-pura lebih dari itu sampai deep-link-nya benar-benar ada.
> - **Kalimat "bukti dukung yang diambil otomatis oleh AI di luar pilihan eksplisit user"** belum punya data di baliknya: jalur generate yang ada sekarang hanya mencatat berkas yang dicentang user. Baris itu menunggu retrieval sungguhan.

#### 11.1a Kutipan yang dipakai tiap bukti dukung

Menyusul permintaan agar tab ini tidak berhenti pada **berkas apa** yang dipakai, tapi juga menunjukkan **bagian mana** yang dipakai. Selama daftarnya cuma nama berkas, janji ketertelusuran `referensi_chunk_ids` — yang docs/database.md sebut sebagai bagian dari "jejak audit lengkap" — tidak pernah benar-benar sampai ke layar.

- **Satu baris tetap satu dokumen; kutipannya di laci.** Menampilkan satu baris per kutipan sempat dipertimbangkan dan ditolak: hitungan di kepala panel akan berhenti berarti "berapa berkas" — pertanyaan pertama yang dijawab tab ini — dan satu berkas dengan empat kutipan akan mendominasi daftarnya. Barisnya kini menyebut jumlah kutipannya dan bisa ditekan; lacinya memakai bentuk yang sama persis dengan laci detail indikator Penilaian AMI, lengkap dengan navigasi ‹ › supaya meninjau berkas berurutan tidak menuntut tutup-buka satu per satu.
- **Ini memperluas kalimat "tanpa detail isi" di atas, bukan melanggarnya.** Yang dibuka bukan isi berkasnya, melainkan potongan yang dipakai menyusun bab. Membuka berkas utuhnya tetap lewat Perpustakaan.
- **Kutipannya diturunkan, bukan dibaca dari `referensi_chunk_ids`.** Itu terpaksa, dan perlu dinyatakan: untuk **kondisi aktif** id chunk sama sekali tidak tersimpan — `BAB_DOKUMEN` tidak punya kolomnya, generate tidak menuliskannya, dan restore checkpoint tidak memulihkannya. Untuk **checkpoint** id-nya memang tersimpan, tapi hanya untuk yang bersumber `AI`, isinya opaque tanpa entitas di baliknya, dan data contohnya sendiri sudah berselisih dengan `jumlah_chunk` di RAGAS-nya. Menurunkannya dari nomor bab + id berkas adalah satu-satunya cara kedua lingkup berperilaku sama. **Isinya tiruan**, dan lacinya menyatakan itu di kakinya sendiri.
- **Satu berkas memberi kutipan berbeda di bab yang berbeda**, karena benih penurunannya memuat nomor bab — meniru retrieval sungguhan, yang mencari bagian paling relevan dengan bab yang sedang disusun.
- **Berkas yang sudah dihapus tetap bisa dibuka kutipannya**, dengan alasan yang sama yang membuat barisnya tetap ditampilkan: keduanya diturunkan dari `{ id, nama_dokumen, tipe_file }` yang diarsipkan, bukan dari berkas hidupnya.
- **Total kutipan sengaja tidak ditampilkan** di kepala panel — hanya jumlah per berkas. Tab Kualitas AI sudah menyebut "N potongan sumber" dari `jumlah_chunk`, dan angka itu di data contoh pun sudah tidak cocok dengan panjang `referensi_chunk_ids`. Menambah angka ketiga yang tidak bisa dicocokkan dengan keduanya hanya menimbulkan pertanyaan yang tidak ada jawabannya.
- **Bagian "Panduan" tetap belum ada.** Kutipan yang ditampilkan seluruhnya dari bukti dukung; panduan LAM Teknik tidak ikut dikarang. *(Sudah tidak berlaku — lihat §11.1c.)*
- **Label tabnya jadi "Bukti"**, sementara `value`-nya tetap `rujukan` — kunci internal yang tidak pernah dilihat pengguna, preseden yang sama dengan `skor`/"Kualitas AI". Labelnya dipendekkan karena barisnya dibagi dengan bilah alat editor; judul di dalam panel, laci, dan seluruh kalimatnya tetap berbunyi "bukti dukung" lengkap. Kata "rujukan" hilang dari layar, tapi §11 tetap bernama "Mekanisme Rujukan" karena daftar isi menautkan anchornya.

> **Status implementasi.** Jalan. Isi kutipannya tiruan deterministik di `features/chapter/data/sources/remote/chapter-chunk.mock.ts`, dipilih dari pustaka prosa yang dikunci kata kunci nama berkas — batas yang sama dengan §12.1b, dan tertaut ke Pertanyaan Terbuka #9 yang sama. Bentuk datanya sengaja meniru chunk sungguhan yang sudah ada di `apps/ai` (`LEDChunk`: teks, halaman, judul bagian), dikurangi `char_start` yang tak berguna bagi pembaca dan skor kemiripan yang, kalau dikarang, hanya terlihat presisi tanpa dasar. **Sengaja tidak asinkron**: panel ini dilepas dari pohon tiap kali tab berpindah, jadi sumber asinkron berarti spinner tiap kali tab dibuka. Saat backend siap, yang menggantikannya `generation_runs.chunks_used`.

#### 11.1c Tab "Panduan"

Menyusul permintaan agar panduan yang dipakai AI ikut terlihat, lengkap dengan kutipannya — separuh janji §11.1 yang selama ini menganggur. Mock generate bahkan sudah memancarkan `chunk-panduan-{urutan_bab}-01` sejak awal: konsepnya setengah ada, tapi tak pernah sampai ke layar.

- **Tab tersendiri, bukan bagian kedua tab Bukti.** §11.1 merancang keduanya sebagai dua bagian satu tab, dan itu ditulis saat bagian panduan belum punya apa pun untuk ditampilkan. Begitu tiap butirnya membawa kutipan sendiri, menumpuk keduanya di satu panel 320 px membuat hitungan di kepala tab Bukti berhenti berarti "berapa berkas" — kesalahan yang sama yang sudah ditolak §11.1a. Keduanya juga menjawab pertanyaan berbeda: *apa yang seharusnya ditulis* versus *dari mana tulisannya berasal*. Tabnya diletakkan **sebelum** Bukti, mengikuti urutan pipeline sungguhan. Ini bukan tab Rubrik §9 yang kembali: yang itu menjalankan simulasi skor dan menulis `HASIL_SKOR_KRITERIA`; yang ini murni baca.
- **Dua kelompok, karena pipeline-nya memang dua.** *Pedoman penulisan* dan *Rubrik penilaian* memetakan satu-satu ke `generation_runs.pedoman_used` (RAG 1) dan `rubric_used` (RAG 2) — dua kolom terpisah yang diambil dua fungsi retrieval berbeda. Menyatukannya berarti membuang perbedaan yang backend-nya sendiri pelihara. Kelompok kosong tidak dirender sama sekali.
- **Barisnya poin LED-PS, bukan indikator.** Memetakan indikator jadi baris membuat bab 7 dapat dua belas baris, padahal `search_pedoman` mengambil `k=5` per bagian. Jalan keluarnya bukan memotong daftar, melainkan memakai satuan yang benar: barisnya lima poin per bab kriteria (`{n}.1`–`{n}.5`), dan nama indikator hidup **di dalam** poin IKU sebagai kutipan. Tidak ada baris yang dibuang, dan tiap bab mendarat di 1–8 baris.
- **Nomor indikator sengaja tidak pernah dicetak.** Repo ini punya dua penomoran yang tidak kompatibel: `RUBRIK_KRITERIA.no` (1–18, karangan, dipakai sebagai kunci hasil AMI) dan matriks LAM sungguhan (1–60, sumber nama-namanya). Mencetak nomor yang kedua akan membuat bab yang sama menyebut indikator bernomor berbeda di tab Panduan dan tab Review. Yang dipakai hanya **namanya**, persis cara `RINCIAN_C1` menuliskan `a) Kekhasan VMTS` tanpa nomor.
- **Apa yang nyata dan apa yang tiruan**, dipisah tegas — ini fitur pertama yang isinya **normatif**, jadi pemisahan itu syarat ia boleh ada:
  - **Nyata**: kerangka LED-PS (`CHAPTER_TOC` menguraikan C.1 penuh), 60 nama indikator LAM beserta tipe skornya (`apps/ai/data/reference_scores_claude.csv`), rincian aspek S4 untuk tiga indikator (`penilaian_10_rubrik_sarjana_terapan.csv`), dan seluruh isi kelompok rubrik (turunan `RUBRIK_KRITERIA`, nol karangan).
  - **Inferensi**: pengulangan kerangka lima poin ke C.2–C.9, dan pemetaan bab → indikator. CSV-nya tidak membawa pengelompokan kriteria sama sekali.
  - **Tiruan**: seluruh kalimat `isi_teks`. Tidak ada satu kalimat pedoman LAM pun di repo ini.
  - Penambatnya: nama indikator 1–3 cocok persis dengan `a) b) c)` di `RINCIAN_C1` — dua berkas yang tidak saling tahu menyebut hal yang sama.
- **Kalimat tiruannya memerikan, tidak mewajibkan.** Kata *wajib*, *harus*, *minimal*, *sekurang-kurangnya*, dan angka ambang apa pun dilarang: bedanya bukan nada melainkan modus kalimat, dan keterangan tidak bisa menyesatkan soal kepatuhan karena ia tidak mengklaim apa pun tentang kepatuhan. Yang membawa isi nyata — daftar IKU — satu-satunya yang menyebut sumbernya, jadi atribusi itu sendiri jadi penanda.
- **Kutipan rubrik tidak punya halaman, dan itu bukan kelalaian.** Matriks penilaian sebuah **tabel**; `search_rubric` pun mengembalikan potongan bermetadata `sub_bab` tanpa halaman. Nomor halaman untuk satu sel rubrik tidak punya dasar apa pun, sejenis dengan skor kemiripan yang sengaja ditinggalkan §11.1a. Asalnya diisi provenans — `Bunyi kriteria`, `Skor 4`, `Sumber angka`.
- **Halaman pedoman dihitung, bukan diacak.** Urutannya sudah intrinsik — poin `4.1` mendahului `4.5` — jadi tidak ada yang perlu dijinakkan `sidikJari`, mengikuti aturan yang sudah ditulis §12.1b.
- **`D.2` dipetakan ke dua bab sekaligus** (2 dan 13). Bab 2 bernama "Kondisi Eksternal" dan simpul Daftar Isi yang menunjuknya berbunyi "B. Analisis Lingkungan Eksternal" — poin yang sama, dibaca dari sudut berbeda. Ini satu-satunya hal di fitur ini yang membuktikan `PANDUAN_DETAIL_BAB` memang many-to-many, bukan larik hiasan.
- **Bab 6 sengaja tipis dan tidak ditambal.** Yang tersisa untuk Kriteria 3 cuma dua nama, dan keduanya tidak menyentuh keketatan seleksi maupun layanan kemahasiswaan yang justru ditanya rubrik untuk bab yang sama. Selisih itu keterangan jujur tentang seberapa sebagian data yang terparsing, dan akan jadi yang pertama terkoreksi saat matriks aslinya masuk.
- **Bab 1, 3, dan 14 kosong**, dengan kalimat yang menyatakan sebabnya: panduan LAM memang tidak mengatur setiap bab. Tanpa kalimat itu, panel kosong terbaca seperti pemuatan yang gagal.
- **Tanpa pemilih lingkup.** Bukti dukung berbeda antar checkpoint karena penyusunnya yang memilih; panduan murni turunan `urutan_bab` dan sama di setiap checkpoint. Pemilih yang seluruh pilihannya menghasilkan daftar identik menyiratkan variasi yang tidak ada.
- **Tanpa tombol membuka dokumen sumbernya.** `PANDUAN_REFERENSI.file_url` ada di skema, tapi berkasnya belum ada di mana pun — tombol unduh yang mati lebih buruk daripada tidak ada tombol.

> **Status implementasi.** Jalan. Katalognya konstanta modul di `features/chapter/domain/entities/guidance-point.entity.ts`, sejajar `RUBRIK_KRITERIA` dan dengan alasan yang sama: master data global, di-seed sekali, tidak pernah disunting lewat UI. Kutipannya di `chapter-guidance.mock.ts`, terpisah dari `chapter-chunk.mock.ts` karena keduanya menggantikan kolom yang berbeda — satu berkas gabungan nantinya cuma separuhnya yang boleh dihapus. **Sengaja tidak asinkron**, alasan yang sama dengan §11.1a. Yang menggantikannya saat backend siap: `generation_runs.pedoman_used` dan `rubric_used`.

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
> - **Bukti dukung yang belum `SIAP`.** Sesuai §4.5 seluruh berkas tetap tampil, tapi yang statusnya bukan `SIAP` dinonaktifkan dengan badge statusnya ikut terlihat — badge itulah keterangan kenapa ia belum bisa dicentang. Berkas `GAGAL` menampilkan `catatan_gagal`-nya. Daftarnya punya pencarian sendiri (nama berkas, pengunggah, tipe) dan mengurutkan yang `SIAP` paling atas. Saat tab dibuka, pilihan generate terakhir (`BUKTI_DUKUNG_BAB`) tercentang kembali; id yang sudah **hilang dari pustaka** dilaporkan sebagai catatan, bukan dibuang diam-diam.
>
>   Yang statusnya sekadar mundur **tidak** ikut dilaporkan — semula ia dilaporkan, dan itu keliru dua kali: barisnya masih tampil persis di daftar atas dengan badge dan `catatan_gagal`-nya sendiri, sedangkan status seperti `GAGAL` tidak berubah sendiri sehingga catatannya menyala terus-menerus sampai berhenti terbaca sebagai kabar. Alasan yang sama sudah dipakai auto-centang §12.1a saat memilih diam untuk berkas `GAGAL`. Berkas yang benar-benar dihapus lain perkara: tidak ada satu pun tempat di layar yang bisa menunjukkannya, dan generate berikutnya akan berjalan dengan konteks lebih sedikit tanpa pemberitahuan.
> - **Lebar sidebar kanan bisa diseret** (320–560 px, tersimpan per browser). Sketsa di §7 menggambarnya tetap; 320 px tidak cukup memuat daftar bukti dukung, pencarian, dan prompt sekaligus.
>
> **Status implementasi.** Yang sudah jalan: pemilihan bukti dukung, prompt, dan generate yang menimpa `konten_kerja` sekaligus memperbarui `BUKTI_DUKUNG_BAB` — mengikuti pasal ini, **bukan** `docs/database.md` §4 yang menyimpan hasilnya sebagai `BAB_DRAFT` baru untuk di-restore user. Keduanya berselisih dan yang dipakai kode adalah pasal ini; §4 di `database.md` menunggu iterasi checkpoint. Yang **belum**: skor RAGAS otomatis (butuh tab Skor) dan kunci `lock:bab:{bab_id}` di §13 (belum ada lapis Redis). Pemanggilan AI-nya sendiri masih tiruan di `features/chapter/data/sources/remote/chapter-generation.mock.ts`.

#### 12.1a Unggah bukti dukung dari dalam tab ini

Menyusul permintaan agar bukti dukung bisa diunggah **sambil menulis**, tidak harus keluar dulu ke Perpustakaan Bukti Dukung lalu kembali. Sebelum ini, keadaan kosong daftarnya secara harfiah menyuruh begitu.

- **Tombol unggah menempel pada judul "Bukti Dukung"** di kepala tab, dan keadaan kosongnya berisi ajakan yang membuka modal yang sama. Modal, antrean, panel progres melayang, dan pipeline ekstraksinya **persis** yang di §4.5 — tidak ada alur unggah kedua.
- **Hak unggah dibaca terpisah dari hak edit bab.** Mengunggah tidak menyentuh `konten_kerja`, jadi §12.2 tidak melarangnya saat bab terkunci, dan `PIMPINAN` yang di editor hanya membaca tetap melihat tombolnya sesuai §4.4. Yang tidak berhak tidak melihatnya sama sekali (§1).
- **Targetnya**: bawaannya prodi pemilik dokumen. Pengunggah level tenant (`PIMPINAN`, `PENJAMIN_MUTU`) mendapat pilihan kedua, **Universitas**. Prodi lain tidak pernah jadi pilihan dari sini — untuk itu ada perpustakaan tenant (§4.4.1) — karena dari dalam editor sebuah prodi, mengunggah ke prodi tetangga hampir selalu salah pencet, bukan niat.
- **Auto-centang.** Berkas yang diunggah dari tab ini tercentang sendiri begitu status ekstraksinya `SIAP`; sepanjang menunggu, ada keterangan yang mengumumkannya supaya centang yang muncul belakangan tidak terasa datang sendiri. Yang `GAGAL` tidak dicentang — badge dan `catatan_gagal`-nya sudah jadi keterangannya. Pilihan ini terhitung "baru", jadi ikut terangkut tombol pembatalan seperti centang manual.
- **Batasnya**: berpindah bab selagi unggahan berjalan tidak membatalkan apa pun — berkasnya tetap tuntas dan masuk pustaka — tapi auto-centangnya hangus. Ia memang milik bab tempat berkas itu diunggah.

#### 12.1b Rekomendasi bukti dukung yang belum ada

Menyusul permintaan agar tab ini tidak cuma memperlihatkan bukti dukung yang **ada**, tapi juga menyebut yang **kurang**. Sebelum ini, penyusun tidak punya cara tahu berkas apa yang sebenarnya dicari kriteria babnya: daftar centang hanya bisa menjawab itu untuk berkas yang sudah telanjur diunggah, dan rekomendasi Penilaian AMI pun tidak pernah menyebut nama dokumen — cuma "Lampirkan bukti dukung".

Bentuknya satu blok di puncak daftar, berisi kartu-kartu bernama. **Ia nasihat, bukan gerbang** — Generate tidak pernah dihalanginya.

- **Isinya diturunkan dari rubrik, bukan dikarang per bab.** Tiap butir katalog menempel pada satu atau beberapa `RUBRIK_KRITERIA.no`, dan bab mendapat rekomendasinya lewat `findKriteriaForBab(urutan_bab)` yang sudah dipakai tab Review. Akibatnya bab yang memang tidak dinilai rubrik — 1, 2, 3, dan 14 — tidak pernah memunculkan blok ini, tanpa perlu daftar pengecualian kedua yang harus dijaga selaras.
- **"Belum ada" dicocokkan atas nama berkas.** `BUKTI_DUKUNG` belum punya kolom kategori — itu Pertanyaan Terbuka #9 di §16 — jadi tiap butir katalog membawa daftar penanda yang dicocokkan sebagai frasa utuh di batas kata atas `nama_dokumen`. Daftarnya sengaja murah hati: keliru menganggap sebuah dokumen sudah ada hanya berarti satu dorongan yang tidak muncul, sedangkan keliru menyatakan sebuah dokumen belum ada **sementara barisnya terlihat di daftar yang sama** adalah pertentangan di satu layar. Batasnya jujur: berkas yang dinamai tak terduga mengalahkannya, dan **blok itu tidak menerangkan dirinya sendiri** — kalimat kepala yang dulu menyebutkan "belum ada yang *namanya* cocok" sudah dibuang karena terlalu penuh untuk kolom selebar 320 px. Salah-positif karena itu tampil tanpa penjelasan; pertukaran yang diambil sadar, dengan taruhan sekadar satu saran yang keliru muncul.
- **Panduan bukan bukti.** Berkas yang menamai dirinya `panduan`, `pedoman`, `template`, atau `format` tidak dianggap memenuhi kebutuhan yang menuntut **hasil**: `Panduan_Tracer_Study.pdf` menerangkan cara melakukan tracer study, ia bukan hasilnya. Pengecualian ini hanya berlaku untuk butir yang memang menuntut hasil — sebagian kebutuhan justru berupa pedoman, dan di sana pedoman adalah pemenuhan yang sah.
- **Status berkas tidak ikut disaring.** Yang `MENUNGGU`, `DIPROSES`, maupun `GAGAL` tetap terhitung ada — semuanya sudah diunggah, dan §4.5 menampilkan semuanya di daftar tepat di bawah blok ini. Untuk yang `GAGAL` ini ketidaktepatan yang disengaja: yang dibutuhkannya **ekstraksi ulang, bukan unggah ulang**, dan barisnya sudah menyediakan itu. Daftar itu otoritas soal kesiapan; blok ini hanya soal kepemilikan.
- **Muncul hanya ketika perlu.** Tidak ada rekomendasi tersisa → blok hilang, dan **tidak** diganti pengumuman "sudah lengkap": pencocokan atas nama berkas tidak cukup kuat untuk menyatakan itu, dan baris hijau permanen akan menyewa ruang daftar selamanya. Kotak cari terisi → blok juga hilang, karena saat itu badan panel sedang berarti "hasil pencarian" dan acuannya ke daftar di bawah berhenti benar. Bab terkunci, bab yang sedang diajukan, dan pembaca yang tidak berhak unggah **tetap** melihatnya — ini keterangan, bukan aksi; yang hilang untuk mereka hanya tombolnya (§1).
- **Paling banyak tiga kartu terlihat**, sisanya dilipat di balik "N kebutuhan lain" dengan pola disclosure yang sama seperti prompt tambahan. Kebutuhan yang bersandar tabel LKPS diurutkan paling atas dan keterangannya selalu berbunyi "angka indikator, bukan narasi" — itu seluruh argumen indikator kuantitatif dalam empat kata, dan pembacanya belajar bedanya dari dua kartu tanpa legenda.
- **Nadanya netral, bukan peringatan.** Tanpa ikon peringatan, tanpa warna amber, tanpa kata *wajib*, *harus*, atau *kurang*. Bukti dukung yang belum lengkap adalah keadaan normal sebuah dokumen yang sedang disusun — pelajaran dari panel "Perlu Perhatian", yang merender setiap barisnya dengan ikon peringatan sehingga kabar baik pun terbaca seperti alarm.
- **Dua butir §12.1a berubah karenanya.** Tombol unggah di kepala tab kini **berlabel**, tidak lagi ikon telanjang 24 px — begitu pustakanya terisi, keadaan kosong tidak lagi dirender dan tombol itulah satu-satunya jalan unggah dari dalam tab, sementara tidak ada apa pun di layar yang menamainya. Dan ajakan unggah pada keadaan kosong **tidak dirender** saat blok rekomendasi sedang tampil: tombol "Unggah sekarang" di kaki blok membuka modal yang sama sambil menyebut berkas apa yang dicari, jadi ajakan kedua di bawahnya cuma menambah keraguan. Modal, antrean, dan auto-centangnya tetap persis yang di §4.5 — tidak ada alur unggah kedua.

> **Status implementasi.** Katalognya konstanta modul di `features/chapter/domain/entities/evidence-recommendation.entity.ts`, sejajar dengan `RUBRIK_KRITERIA` di berkas tetangganya dan dengan alasan yang sama: master data global, di-seed sekali, tidak pernah disunting lewat UI. Belum ada panggilan AI sungguhan di baliknya — **dan sengaja belum ada tiruan asinkronnya**, tidak seperti generate. Panel ini dilepas dari pohon setiap kali tab berpindah (`Tabs.Panel` tanpa `keepMounted`), jadi sumber asinkron berarti spinner di kolom selebar 320 px pada tiap kali tab dibuka; sementara pencocokan "sudah ada atau belum" justru harus menyegar seketika saat unggahan selesai, dan itu hanya bisa kalau ia turunan murni dari pustaka yang sudah dimuat. Saat endpoint sungguhan ada, yang berubah `useChapterGeneration` — bukan panelnya, yang sudah menampilkan larik kosong sebagai "tidak ada apa-apa".

### 12.2 Penguncian bab (`terkunci`)

- Hanya `PENJAMIN_MUTU` yang punya tombol **Kunci/Buka Kunci Bab**, biasanya disertai pengisian `catatan_penjamin_mutu`.
- Saat `terkunci = true`: **tidak seorang pun** — termasuk Penjamin Mutu yang menguncinya sendiri — bisa mengedit `konten_kerja`, menjalankan generate, menjalankan simulasi skor, atau membuat checkpoint baru pada bab tersebut. Seluruh tab tetap bisa **dibuka untuk dibaca** (Rujukan, Draft lama, Rubrik lama, Skor lama), hanya aksi-aksi yang mengubah data yang diblokir.
- Membuka kunci (`terkunci = false`) mengembalikan seluruh hak akses edit sesuai role masing-masing.

> **Status implementasi.** Sudah jalan seluruhnya di frontend, tapi **kunci dan catatan dipisah jadi dua aksi**, bukan satu seperti bacaan harfiah pasal ini:
>
> - **Tombol Kunci/Buka Kunci Bab** berdiri di header Editor Bab, sekali klik tanpa dialog maupun konfirmasi (`chapterRepository.setTerkunci`). Hanya dirender untuk `PENJAMIN_MUTU` (§1: yang tidak boleh diakses disembunyikan, bukan dinonaktifkan). Tanpa perantara karena mengunci sepenuhnya reversibel dan akibatnya langsung terlihat di layar yang sama — toolbar editor hilang, spanduk muncul di kanvas, badge bab berganti.
> - **Catatan** sepenuhnya tinggal di tab **Review** (sidebar kanan, `chapterRepository.setCatatanPenjaminMutu`). Penjamin Mutu menulisnya di textarea yang selalu aktif; role lain membacanya sebagai teks. Sebelum tab ini ada, `catatan_penjamin_mutu` cuma menyalakan penanda "Ada catatan Penjamin Mutu" di panel Perlu Perhatian tanpa badan catatannya pernah dirender.
>
> Alasan memisahkannya: yang dituntut pasal ini adalah kedua hal itu **tersedia**, bukan bahwa keduanya harus terjadi dalam satu klik. Praktiknya bab dikunci sekali sementara catatannya ditulis dan direvisi berkali-kali — termasuk saat babnya sedang terkunci, dan justru bab itulah yang sedang direview.
>
> Dua hal yang melampaui pasal ini, keduanya disengaja:
>
> - **Catatan punya penulis dan waktu** (`catatan_oleh_nama`, `catatan_pada` di `docs/database.md` §5). Tanpa keduanya, Penyusun membaca catatan tanpa tahu siapa yang menulisnya dan sejak kapan — dan pasal ini sendiri menjadikan catatan sebagai alasan babnya dikunci.
> - **Catatan bisa ada tanpa kunci**, dan sesudah pemisahan di atas itu jadi bentuk bawaannya, bukan kasus khusus. Pasal ini menulis "biasanya disertai", bukan "harus"; data contoh pun punya bab bercatatan yang tidak terkunci.
>
> Yang **belum**:
>
> - **Penyiaran kunci antar tab peramban.** `chapterRepository.notify()` memakai `CustomEvent` yang tidak menyeberang tab, jadi "Penjamin Mutu mengunci dari tab lain" baru merambat setelah halaman dimuat ulang.
> - **Auto-lock kolaborasi §13** di bawah, masih menunggu lapis Redis.

### 12.3 Pengajuan review oleh Penyusun (`diajukan_review_pada`)

Pasal tambahan, tidak ada di rancangan awal. Tanpa ini alur review buntu di tengah: Penjamin Mutu memberi catatan, Penyusun memperbaiki, lalu **tidak ada cara memberi tahu bahwa perbaikannya selesai** selain menunggu Penjamin Mutu kebetulan melihat lagi. Untuk review pertama pun sinyalnya cuma proksi — bab "terisi" bukan berarti bab "selesai".

- Hanya `PENYUSUN` pemilik dokumen yang punya tombol **Ajukan Review** (dan **Batalkan Pengajuan**), di tab Review. Bab yang masih kosong tidak bisa diajukan.
- Saat `diajukan_review_pada` terisi: **seluruh `PENYUSUN` tidak bisa mengubah `konten_kerja`, menjalankan generate/simulasi, atau membuat checkpoint** — termasuk yang mengajukan. `PENJAMIN_MUTU` **tidak** ikut terbekukan; merapikan bab justru bagian dari mereview. Seperti §12.2, yang diblokir hanya aksi ubah, bukan membaca.
- Pengajuan **hangus otomatis begitu Penjamin Mutu merespons**: saat ia mengunci bab (review dimulai) atau menulis `catatan_penjamin_mutu` (umpan balik turun, bola kembali ke Penyusun). **Mencabut** catatan tidak menghanguskannya — itu bukan umpan balik.

> **Dua lapis kunci, mekanisme sama, beda pemegang kunci.** Ini yang membuat pasal ini dan §12.2 tidak perlu diingat sebagai dua aturan terpisah:
>
> | | Penyusun | Penjamin Mutu | Pemegang kunci |
> | --- | --- | --- | --- |
> | Biasa | boleh edit | boleh edit | — |
> | Diajukan (§12.3) | beku | boleh edit | Penyusun |
> | Terkunci (§12.2) | beku | beku | Penjamin Mutu |
>
> Keduanya berbeda dari auto-lock kolaborasi §13, yang sementara, per-user, dan dipicu aktivitas mengetik alih-alih pernyataan manusia.

> **Status implementasi.** Sudah jalan. Antreannya tampil sebagai badge `MENUNGGU_REVIEW` di tabel Progres per Bab (§6.1), sebagai `hint` kartu "Kesiapan Review" di dashboard dokumen itu, dan sebagai segmen biru di bar kelengkapan bab — di Dashboard Prodi (§5.1b) maupun di tabel Sedang Menyusun (§4.0c), yang di sana hanya bisa dibaca lewat tooltip segmennya.
>
> **Sengaja tidak masuk panel Perlu Perhatian §6.1**, dan jangan "dilengkapi" nanti: panel itu merender tiap baris dengan ikon peringatan tanpa konsep severity, jadi kabar baik akan tampil sebagai gangguan. Bab yang diajukan review punya rumahnya sendiri — badge `MENUNGGU_REVIEW` di tabel Progres per Bab, segmen biru di bar kelengkapan (§5.1b, §4.0c), dan `hint` kartu Kesiapan Review.
>
> Tidak ada kolom pengaju: pembekuannya berlaku untuk **peran** Penyusun, bukan satu user, jadi tidak ada `user_id` yang perlu dibandingkan.

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
| Ajukan/batalkan review bab (§12.3)             | ❌              | ❌              | ❌              | ✅ (prodinya)              |
| Ubah status dokumen                            | ❌              | ❌              | ✅              | ❌                         |
| Upload bukti dukung level Tenant               | ❌              | ✅              | ✅              | ❌                         |
| Upload bukti dukung level Prodi                | ❌              | ✅              | ✅              | ✅ (prodinya)              |
| Hapus bukti dukung                             | ❌              | ✅              | ✅              | ✅ (unggahannya sendiri)   |
| Ulangi ekstraksi bukti dukung yang gagal       | ❌              | ✅              | ✅              | ✅ (prodinya)              |

_\* Admin hanya bisa membuat user, belum tentu punya kemampuan assign ke prodi — perlu dikonfirmasi ulang bila ada kebutuhan lanjutan._

> **Catatan desain — baris "Jalankan simulasi skor (Rubrik)" tidak berlaku lagi.** Tab Rubrik dihapus dari produk (§9), jadi tidak ada lagi aksi yang diatur baris itu. Barisnya sengaja dibiarkan alih-alih dihapus, sama seperti §9.1–§9.3 yang tetap utuh. Penggantinya baris **"Jalankan Penilaian AMI"** dengan pembagian yang sama persis (`PENJAMIN_MUTU` dan `PENYUSUN` menjalankan, `PIMPINAN` read-only) ditambah satu hak yang tidak pernah ada di simulasi: **mengoreksi skor mesin**, yang hanya dipegang `PENJAMIN_MUTU` — menjalankan penilaian itu memeriksa pekerjaan sendiri, sedangkan mengubah angkanya menyatakan vonis. Penilaian AMI sendiri belum punya pasalnya di berkas ini (lihat catatan §9).

> **Catatan desain — dua baris bukti dukung yang ditetapkan menyusul.** Baris "Hapus bukti dukung" dan "Ulangi ekstraksi" tidak ada di matriks awal. PRD hanya menyebut penghapusan dilakukan "pengguna berwenang" tanpa merinci siapa. Keputusannya: `PIMPINAN`/`PENJAMIN_MUTU` boleh menghapus apa pun di cakupannya karena keduanya memang beroperasi di level tenant, sedangkan `PENYUSUN` dibatasi pada unggahannya sendiri — cukup untuk membereskan salah unggah, tanpa memberinya kuasa menghapus bukti yang dipakai prodi secara keseluruhan. Mengulang ekstraksi tidak menghapus apa pun dan tidak mengubah isi berkas, jadi haknya disamakan dengan hak unggah di lapis bersangkutan.

> **Catatan desain — penyusunan Dokumen LED milik Penjamin Mutu.** Baris "Buat Dokumen LED baru" ditetapkan menyusul karena matriks awal tidak memuatnya. Wewenangnya diberikan ke `PENJAMIN_MUTU` saja agar konsisten dengan dua baris di bawahnya (kunci bab dan ubah status dokumen): satu role memegang seluruh daur hidup dokumen dari pembuatan sampai penyelesaian. `PIMPINAN` tetap read-only di level ini (§6.2), dan `PENYUSUN` tidak pernah masuk Dashboard Utama sehingga tidak punya jalan ke form pembuatan.

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

   > **Catatan — yang sudah ada: ekspor *hasil penilaian*, bukan dokumen LED-nya.** Halaman Penilaian AMI kini punya tombol **Unduh PDF** di kepalanya. Yang diekspor tabel hasil per indikator: **No, Kriteria, Skor, Justifikasi, Rekomendasi, Confidence** — A4 tegak, dipenggal otomatis antar halaman, dengan kop berisi universitas, prodi, dokumen, tahun akademik, waktu penilaian, siapa yang menjalankan, dan sumber LED-nya, ditambah baris ringkasan skor.
   >
   > Tiga keputusan yang menempel padanya:
   >
   > - **Selalu seluruh indikator, urut nomor** — tidak mengikuti saringan dan pengurutan di daftar. Saringan itu keadaan tampilan yang sengaja tidak masuk URL, dan pembaca yang menerima PDF berisi empat baris tidak punya cara tahu bahwa yang lain disaring.
   > - **Kolom Skor berisi skor final**, yakni angka yang berlaku termasuk koreksi Penjamin Mutu, bertanda `*` bila dikoreksi beserta catatan kakinya. Justifikasi, rekomendasi, dan confidence tetap milik AI — dan catatan kakinya menyatakan itu, supaya satu baris tidak terbaca seolah AI yang memberi angka hasil koreksi.
   > - **Dibangkitkan di peramban, tanpa backend** (`jspdf` + `jspdf-autotable`, diimpor dinamis di `presentation/utils/assessment-pdf.ts`). Seluruh bahannya memang sudah ada di memori halaman. Fontnya Helvetica bawaan PDF, bukan DM Sans milik aplikasi.
   >
   > Ekspor **dokumen LED** — isi babnya — tetap belum ada, dan pasal ini masih berlaku sepenuhnya untuk itu.

6. **Validasi perubahan status dokumen** — saat ini murni manual tanpa syarat. Apakah ke depannya perlu ditambah validasi (misal tidak bisa set `SELESAI` jika masih ada bab yang belum `terkunci`)?

7. **Menghapus bukti dukung yang sedang dipakai suatu bab** — bukti dukung bisa sedang tercatat di `BUKTI_DUKUNG_BAB` (kondisi aktif) maupun `BUKTI_DUKUNG_DRAFT` (checkpoint permanen, jejak audit akreditasi). Apakah penghapusan diblokir selama masih dirujuk, atau tetap diizinkan dengan rujukan yang jadi menggantung? Untuk sekarang UI hanya memperingatkan lewat dialog konfirmasi.

   > **Terjawab sebagian saat tab Rujukan dibangun (§11.1).** Penghapusan **tetap diizinkan**, tapi rujukannya tidak lagi menggantung: `BUKTI_DUKUNG_BAB` dan `BUKTI_DUKUNG_DRAFT` sekarang ikut menyimpan `nama_dokumen` + `tipe_file`, sehingga berkas yang sudah dihapus tetap bisa disebut namanya di tab Rujukan, ditandai badge "Sudah dihapus". Jejak auditnya terselamatkan tanpa memblokir penghapusan. Yang **masih terbuka**: apakah berkas yang dirujuk checkpoint sebaiknya tetap tidak boleh dihapus sama sekali demi kelengkapan arsip akreditasi — pertanyaan kebijakan, bukan lagi pertanyaan data.

8. **Batas ukuran dan kuota penyimpanan** — batas 25 MB per berkas dipakai sebagai angka awal yang belum divalidasi ke kebutuhan nyata (LKPS hasil pindai bisa jauh lebih besar). Apakah perlu kuota total per tenant/prodi, dan apa yang terjadi saat kuota habis?

9. **Pengelompokan bukti dukung** — perpustakaan saat ini datar dengan pencarian sebagai satu-satunya alat penyaring. Apakah nanti perlu folder, tag, atau kategori (mis. per kriteria LAM Teknik) begitu jumlah berkasnya membesar?

   > **Catatan —** §12.1b sudah menjawabnya sementara dengan pencocokan **nama berkas** terhadap katalog penanda, karena ia butuh tahu bukti dukung apa yang belum ada dan tidak ada kolom kategori untuk ditanyai. Itu tambalan, bukan jawaban: begitu kategori sungguhan ada, daftar penanda di `evidence-recommendation.entity.ts` adalah yang pertama dihapus.

   > **Terjawab sebagian di §4.6a — folder, bukan tag maupun kategori.** Perpustakaan sekarang berupa pohon dengan nama dan kedalaman bebas, satu pohon per cakupan, plus unggah folder utuh. Yang **masih terbuka**: folder menempatkan satu berkas di **satu** tempat, sehingga berkas yang relevan ke beberapa kriteria LAM sekaligus — SK yang sama dipakai kriteria 2 dan kriteria 6 — tetap tidak punya jawaban. Itu kebutuhan tag, bukan folder, dan keduanya bisa hidup berdampingan. Karena itu tambalan §12.1b di atas **belum boleh dihapus**: folder tidak memberi kolom kategori untuk ditanyai.

10. **Pembatalan unggahan yang sedang berjalan** — panel progres saat ini hanya bisa disembunyikan, bukan membatalkan unggahan, karena pembatalan perlu dukungan pembatalan permintaan ke object storage sekaligus pembersihan objek separuh jalan di sisi backend.
