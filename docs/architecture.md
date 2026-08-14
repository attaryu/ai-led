# Dokumentasi Arsitektur Sistem — Platform Penyusunan Dokumen LED LAM-Teknik

## Daftar Isi

1. [Gambaran Umum](#1-gambaran-umum)
2. [Diagram Arsitektur](#2-diagram-arsitektur)
3. [Komponen Sistem](#3-komponen-sistem)
   - [Client-side (Web Interface)](#31-client-side-web-interface)
   - [NestJS — Main Thread](#32-nestjs--main-thread)
   - [NestJS — Second Thread/Worker](#33-nestjs--second-threadworker)
   - [Redis](#34-redis)
   - [PostgreSQL](#35-postgresql)
   - [Cloudflare R2](#36-cloudflare-r2)
   - [FastAPI — Tiga RAG Pipeline](#37-fastapi--tiga-rag-pipeline)
   - [ChromaDB](#38-chromadb)
   - [LLM Layer](#39-llm-layer)
4. [Makna "Other Caching Checking/Storing"](#4-makna-other-caching-checkingstoring)
5. [Alur Kerja Utama](#5-alur-kerja-utama)
   - [Upload & Ingest File (Bukti Dukung/Panduan)](#51-upload--ingest-file-bukti-dukungpanduan)
   - [Generate Konten LED](#52-generate-konten-led)
   - [Skoring Rubrik LLM](#53-skoring-rubrik-llm)
   - [Skor RAGAS](#54-skor-ragas)
   - [AMI Assessment](#55-ami-assessment)
   - [Notifikasi Real-time via SSE](#56-notifikasi-real-time-via-sse)
6. [Kanal Komunikasi via Redis](#6-kanal-komunikasi-via-redis)
7. [Alternatif: RabbitMQ untuk Queue & Pub/Sub](#7-alternatif-rabbitmq-untuk-queue--pubsub)
8. [Opsi Multi-Deploy / Scaling ke Depan](#8-opsi-multi-deploy--scaling-ke-depan)
9. [Autentikasi, Keamanan, & Logging](#9-autentikasi-keamanan--logging)
10. [Hal yang Masih Ditunda](#10-hal-yang-masih-ditunda)

---

## 1. Gambaran Umum

Arsitektur sistem terdiri dari **NestJS** sebagai backend utama (menangani seluruh interaksi client, autentikasi, orkestrasi bisnis, dan CRUD), dan **FastAPI** sebagai backend RAG terpisah (menangani seluruh pekerjaan berat: ingest dokumen, retrieval, dan pemanggilan LLM). Kedua backend ini **tidak pernah berkomunikasi langsung** satu sama lain — seluruh komunikasi selalu melalui **Redis** sebagai perantara (job queue + pub/sub + cache), sehingga masing-masing bisa berkembang dan di-scale secara independen.

Di dalam NestJS sendiri, ada dua "alur pendengar" berbeda yang berjalan berdampingan dalam satu proses (bukan proses OS terpisah): **Main Thread** yang melayani request HTTP/SSE dari client secara cepat, dan **Second Thread/Worker** yang mendengarkan laporan hasil job dari FastAPI lalu menuliskannya ke PostgreSQL.

---

## 2. Diagram Arsitektur

![Diagram Arsitektur Sistem](./assets/top-level-architecture.png)

Diagram menggambarkan alur dari Client-side (React) → NestJS (Main Thread + Second Thread) → Redis (sebagai hub komunikasi) → FastAPI (tiga pipeline RAG: AMI Assessment, Content Generation/Scoring, File Processing) → ChromaDB & LLM Layer, dengan PostgreSQL dan Cloudflare R2 sebagai penyimpanan data dan file.

---

## 3. Komponen Sistem

### 3.1 Client-side (Web Interface)

- Dibangun dengan **React**.
- Berkomunikasi dengan NestJS lewat dua jalur:
  - **HTTP** — untuk seluruh request transaksional (login, CRUD, submit form, klik tombol generate/simulasi, dst).
  - **SSE** — koneksi terbuka satu arah (server → client) untuk menerima notifikasi real-time (status job selesai, dst).
- **Upload file** dilakukan langsung dari client ke **Cloudflare R2** menggunakan presigned URL yang diterbitkan NestJS — file tidak melewati NestJS sama sekali, hanya proses validasi dan penerbitan URL yang lewat backend.

### 3.2 NestJS — Main Thread

- Bertanggung jawab atas seluruh **RESTful API, fast I/O** — autentikasi, CRUD tenant/prodi/dokumen/bab, validasi bisnis.
- Menerima request aksi yang memicu pekerjaan berat (Scoring, File Processing, Content Generation, AMI Assessment) → mendorong job ke **Redis** sebagai stream, lalu segera membalas response ke client tanpa menunggu hasil job selesai.
- Memegang **koneksi SSE** milik tiap client yang terhubung — inilah satu-satunya komponen yang benar-benar mengirim event ke client.
- Melakukan **"Data storing & retrieval"** langsung ke PostgreSQL untuk operasi CRUD biasa (di luar jalur job asinkron).
- Berkomunikasi dengan Cloudflare R2 untuk **validasi file dan penerbitan presigned URL**.
- Memakai Redis untuk **"other caching checking/storing"** — lihat penjelasan detail di [bagian 4](#4-makna-other-caching-checkingstoring).

### 3.3 NestJS — Second Thread/Worker

- Bertugas sebagai **"Event capture to write data"** — mendengarkan stream laporan hasil job (_"...report job (stream)"_) dari FastAPI lewat Redis.
- Begitu laporan diterima, melakukan **pengecekan** (status kunci bab, status auto-lock, dst — masuk kategori "other caching checking/storing" juga) sebelum **"Checking and update status or metadata"** ke PostgreSQL.
- Setelah data berhasil ditulis, mengirim **"Job done signal to SSE (pub/sub)"** ke Redis — sinyal ini yang kemudian ditangkap oleh Main Thread untuk diteruskan ke client yang tepat lewat koneksi SSE yang ia pegang.
- Berjalan sebagai "pendengar" berbeda dalam proses NestJS yang sama dengan Main Thread — bukan proses/service terpisah, meski secara logis punya tanggung jawab yang jelas berbeda.

### 3.4 Redis

Bertindak sebagai **hub komunikasi sentral** dengan beberapa fungsi berbeda dalam satu instance:

- **Job stream** — menyalurkan job dari NestJS ke FastAPI (`AMI assessment Job`, `Content Generation Job`, `File processing Job`), dan laporan hasil balik dari FastAPI ke NestJS (`...report job (stream)`).
- **Pub/Sub** — menyalurkan sinyal "Job done signal to SSE" dari Second Thread ke Main Thread.
- **Other caching checking/storing** — lihat [bagian 4](#4-makna-other-caching-checkingstoring).

### 3.5 PostgreSQL

- Database utama, menyimpan seluruh skema aplikasi (dijelaskan terpisah di dokumentasi database).
- Diakses oleh NestJS Main Thread (CRUD biasa) dan Second Thread (update status/metadata hasil job) — keduanya membaca/menulis Postgres yang sama, NestJS tetap menjadi satu-satunya pemilik tulis untuk tabel-tabel inti dokumen.

### 3.6 Cloudflare R2

- Object storage untuk seluruh file mentah (bukti dukung, dokumen panduan).
- Client upload **langsung** ke R2 menggunakan presigned URL dari NestJS — NestJS tidak menjadi perantara byte file.
- FastAPI (khususnya pipeline **File Processing**) mengambil file dari R2 untuk **"Take file to ingestion process"** (OCR, chunking, dst).

### 3.7 FastAPI — Tiga RAG Pipeline

Satu service FastAPI dengan tiga pipeline berbeda, masing-masing mengonsumsi jenis job tersendiri dari Redis dan mengirim laporan hasil lewat stream terpisah:

- **RAG Pipeline (AMI Assessment)** — memproses job penilaian audit mutu internal.
- **RAG Pipeline (LED Content Generation or Scoring)** — memproses job generate konten bab **dan** job scoring rubrik LLM (kedua jenis job ini disatukan dalam satu pipeline karena sama-sama membutuhkan retrieval + prompt konteks yang serupa).
- **File Processing (Bukti dukung ingestion, etc)** — memproses job ingest file: OCR, chunking, embedding, lalu **"Store vector"** ke ChromaDB.

Ketiga pipeline melakukan **"Vector retrieval"** dari ChromaDB dan **"Prompt with context"** ke LLM Layer sesuai kebutuhan masing-masing (kecuali File Processing yang fokus pada penyimpanan vektor, bukan retrieval untuk generate).

### 3.8 ChromaDB

- Vector database, menyimpan hasil embedding dari proses ingest (`Store vector`), dan menyediakan hasil pencarian semantik (`Vector retrieval`) untuk pipeline AMI Assessment dan Content Generation/Scoring.

### 3.9 LLM Layer

- Lapisan abstraksi pemanggilan model bahasa, mendukung beberapa provider: **Ollama** (jika dibutuhkan, kemungkinan untuk model lokal/self-hosted), **DeepSeek**, **GPT OSS**, **Qwen**.
- Menerima **"Prompt with context"** dari kedua pipeline RAG (AMI Assessment dan Content Generation/Scoring), mengembalikan hasil generasi/penilaian.
- File Processing pipeline dapat memanggil LLM layer jika ada kebutuhan dari pemrosesan dokumen, tapi ini bukan jalur utama dan bersifat **"use in ingestion process if needed"**.

---

## 4. Makna "Other Caching Checking/Storing"

Label ini dipakai berulang di diagram sebagai representasi **generalisasi** dari seluruh interaksi Redis yang sifatnya bukan job-queue utama maupun pub/sub notifikasi SSE. Di baliknya, ada beberapa jenis penggunaan Redis yang berbeda, disatukan labelnya di level diagram supaya tidak terlalu padat, tapi berikut rinciannya:

- **Auto-lock kolaborasi** — NestJS Main Thread dan Second Thread membaca/menulis key lock (`lock:bab:{bab_id}`) untuk mekanisme _sliding window_ 10 menit yang mencegah dua user mengedit bab yang sama bersamaan.
- **Status proses job** — status sementara (`MENUNGGU`/`DIPROSES`/`SELESAI`/`GAGAL`) untuk keperluan polling/pemeriksaan cepat tanpa perlu query ke PostgreSQL setiap saat.
- **Session/token cache** (jika diperlukan) — mempercepat validasi autentikasi berulang tanpa selalu membebani PostgreSQL.
- **Cache umum lain** — hasil query yang sering diakses (misal daftar rubrik/panduan yang jarang berubah), untuk mengurangi beban baca ke PostgreSQL.

Baik NestJS (Main Thread & Second Thread) maupun FastAPI (ketiga pipeline) **sama-sama punya akses bebas** ke kategori ini sesuai kebutuhan masing-masing — sengaja tidak dipetakan detail per fungsi di level diagram tingkat tinggi ini, karena tujuan diagram adalah menjelaskan **alur komunikasi fitur utama**, bukan spesifikasi teknis tiap key Redis (yang lebih pas didokumentasikan terpisah saat implementasi).

---

## 5. Alur Kerja Utama

### 5.1 Upload & Ingest File (Bukti Dukung/Panduan)

```
1. Client minta izin upload → NestJS Main Thread validasi & terbitkan presigned URL
2. Client upload file LANGSUNG ke Cloudflare R2 (tidak lewat NestJS)
3. Client beri tahu NestJS bahwa upload selesai
4. NestJS lakukan HEAD request ke Cloudflare R2 untuk memverifikasi
   file benar-benar ada (dan opsional: cocokkan ukuran file)
5. Jika terverifikasi → dorong "File Processing Job (stream)" ke Redis
   Jika tidak → tandai BUKTI_DUKUNG.status_proses = GAGAL, jangan dorong job
6. FastAPI (File Processing) ambil job → "Take file to ingestion process" dari R2
   → OCR, chunking, embedding → "Store vector" ke ChromaDB
7. FastAPI kirim "File processing report job (stream)" balik ke Redis
8. NestJS Second Thread terima laporan → validasi → update status/metadata di PostgreSQL
9. Second Thread kirim "Job done signal to SSE (pub/sub)"
10. Main Thread terima sinyal pub/sub → kirim event SSE ke client yang relevan
```

### 5.2 Generate Konten LED

```
1. Client pilih bukti dukung, klik Generate → request HTTP ke NestJS Main Thread
2. Main Thread validasi (lock, status kunci bab) → dorong "Content generation job (stream)" ke Redis
   → balas response cepat ke client, client mulai dengar SSE untuk update
3. FastAPI (RAG Pipeline - LED Content Generation) ambil job
   → "Vector retrieval" dari ChromaDB (bukti dukung + panduan terkait)
   → "Prompt with context" ke LLM Layer
   → dapat hasil generasi + otomatis hitung skor RAGAS
4. FastAPI kirim "Content generation report job (stream)" ke Redis
5. NestJS Second Thread terima laporan → validasi ulang → tulis ke PostgreSQL
   (konten_kerja, BUKTI_DUKUNG_BAB, skor RAGAS)
6. Second Thread kirim sinyal pub/sub → Main Thread teruskan lewat SSE ke client
```

### 5.3 Skoring Rubrik LLM

- Job **"Scoring job (stream)"** dikirim terpisah dari job Content Generation, tapi diproses oleh **pipeline FastAPI yang sama** (RAG Pipeline - LED Content Generation or Scoring), karena kebutuhan retrieval-nya serupa (mengambil `RUBRIK_KRITERIA` yang relevan berdasar `urutan_bab`).
- Alur laporan dan penulisan hasil (`HASIL_SKOR_KRITERIA`) mengikuti pola yang sama seperti alur generate di atas.

### 5.4 Skor RAGAS

- **Tidak punya job stream terpisah** — dihitung otomatis oleh FastAPI sebagai bagian dari proses Content Generation, karena metrik ini menilai kualitas jawaban LLM itu sendiri (bukan kelayakan akreditasi), sehingga wajar dihasilkan bersamaan dalam satu siklus job yang sama.

### 5.5 AMI Assessment

- Job **"AMI assessment Job (stream)"** diproses oleh pipeline FastAPI terpisah (**RAG Pipeline - AMI Assessment**), dengan retrieval dan prompt konteks tersendiri, mengingat sifat audit mutu internal berbeda dari sekadar generate konten atau skoring rubrik akreditasi.
- Alur laporan (`AMI assessment report job (stream)`) dan penulisan hasil ke PostgreSQL mengikuti pola yang sama seperti alur lain. Detail struktur data hasil AMI Assessment masih perlu dirumuskan lebih lanjut di dokumentasi database (lihat [bagian 10](#10-hal-yang-masih-ditunda)).

### 5.6 Notifikasi Real-time via SSE

```
Second Thread (setelah tulis PostgreSQL)
   → publish "Job done signal to SSE (pub/sub)" ke Redis
   → Main Thread (subscribe channel yang sama) menangkap sinyal ini
   → Main Thread cari koneksi SSE milik user/job terkait
   → kirim event ke client
```

Pemilihan **Pub/Sub** (bukan job queue biasa) untuk jalur ini disengaja: Pub/Sub bersifat _broadcast_ ke seluruh subscriber, cocok untuk skenario multi-instance NestJS di masa depan di mana koneksi SSE seorang user bisa jadi dipegang instance mana saja — lihat [bagian 8](#8-opsi-multi-deploy--scaling-ke-depan).

---

## 6. Kanal Komunikasi via Redis

Ringkasan seluruh jenis "kanal" logis yang lewat Redis dalam sistem ini:

| Jenis Kanal                 | Arah                        | Sifat                                                                | Contoh                                                                                                               |
| --------------------------- | --------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Job Stream (perintah)       | NestJS → FastAPI            | Harus sampai, tidak boleh hilang                                     | `Content Generation Job (stream)`, `File processing job (stream)`, `AMI assesment Job (stream)`                      |
| Job Stream (laporan hasil)  | FastAPI → NestJS            | Harus sampai, tidak boleh hilang                                     | `Content generation report job (stream)`, `File processing report job (stream)`, `AMI assesment report job (stream)` |
| Pub/Sub (notifikasi)        | Second Thread → Main Thread | Broadcast, boleh terlewat karena data utama sudah aman di PostgreSQL | `Job done signal to SSE (pub/sub)`                                                                                   |
| Cache/Lock (dua arah bebas) | Semua komponen ↔ Redis      | Sementara, boleh hilang                                              | `other caching checking/storing`                                                                                     |

---

## 7. Alternatif: RabbitMQ untuk Queue & Pub/Sub

Saat ini seluruh kebutuhan job stream dan pub/sub ditangani oleh **Redis** (Streams untuk job, Pub/Sub asli untuk notifikasi SSE) — pilihan ini dipertahankan untuk MVP karena tidak menambah infrastruktur baru (satu instance Redis melayani semua kebutuhan).

**RabbitMQ** tetap dipertimbangkan sebagai opsi migrasi di masa depan, khususnya jika kebutuhan berikut mulai muncul:

- **Routing job yang lebih kompleks** — misalnya prioritas antrian (job AMI Assessment harus didahulukan dari job Scoring biasa), atau routing berdasarkan tipe tenant/kelas layanan.
- **Volume job sangat tinggi** — RabbitMQ punya mekanisme _acknowledgement_, _dead-letter queue_, dan manajemen antrian yang lebih matang dibanding Redis Streams untuk skala besar.
- **Kebutuhan fan-out lebih kaya** — mengirim satu event ke banyak jenis consumer dengan pola _routing key_/_exchange_ yang fleksibel (topic exchange, fanout exchange), yang lebih native di RabbitMQ dibanding harus disimulasikan manual di Redis.
- **Pemisahan operasional queue dari cache** — bila skala Redis untuk cache/lock sudah cukup besar sehingga ingin dipisahkan bebannya dari sistem antrian, RabbitMQ bisa berdiri sebagai komponen terpisah tanpa berbagi resource dengan Redis.

Migrasi ke RabbitMQ, jika dilakukan nanti, secara desain **tidak mengubah alur logis** yang sudah digambarkan di [bagian 5](#5-alur-kerja-utama) — hanya mengganti "pembawa pesan" di balik layar. Perubahan kode akan terbatas pada lapisan publisher/consumer (bagian yang mengirim/menerima job), sementara logika bisnis (validasi, penulisan PostgreSQL) tidak perlu disentuh, selama pola job/hasil job tetap mengikuti kontrak payload yang konsisten.

---

## 8. Opsi Multi-Deploy / Scaling ke Depan

Untuk MVP, seluruh komponen NestJS (Main Thread + Second Thread) dijalankan sebagai **satu instance/deployment**, begitu juga FastAPI (ketiga pipeline dalam satu service). Seiring bertambahnya beban, komponen-komponen berikut bisa **di-scale secara independen** tanpa perubahan besar pada logika aplikasi, karena seluruh komunikasi antar komponen sudah lewat Redis (bukan panggilan langsung):

- **Main Thread instance** — bisa digandakan (horizontal scaling) untuk menangani lebih banyak trafik HTTP/SSE bersamaan. Koneksi SSE yang tersebar di banyak instance tetap bisa menerima notifikasi yang benar karena mekanisme Pub/Sub (bukan in-memory event) sudah dipakai sejak awal — lihat [bagian 5.6](#56-notifikasi-real-time-via-sse).
- **Worker instance (Second Thread)** — bisa dipisah jadi deployment tersendiri (di luar Main Thread) bila proses penulisan laporan hasil job mulai menjadi beban tersendiri yang signifikan.
- **RAG Pipeline instance** — ketiga pipeline FastAPI (AMI Assessment, Content Generation/Scoring, File Processing) yang saat ini satu service, bisa dipecah jadi **deployment terpisah per pipeline** bila salah satu jenis job jauh lebih sering dipakai dibanding yang lain (misalnya Content Generation jauh lebih ramai dibanding AMI Assessment), sehingga scaling bisa dilakukan spesifik per jenis beban kerja.
- **File Processing instance** — mengingat proses ingest (OCR, chunking, embedding) cenderung _CPU/IO intensive_ dan bisa terjadi dalam jumlah besar sekaligus (bulk upload), ini adalah kandidat kuat untuk dipisah dan di-scale secara independen lebih awal dibanding pipeline lain.

Prasyarat agar opsi-opsi ini bisa diterapkan dengan mulus: seluruh komunikasi job dan notifikasi **konsisten lewat Redis** (bukan pemanggilan langsung antar service), dan kontrak payload job/laporan hasil (`job_id`, `tipe_job`, `payload`, dst) dijaga stabil sejak awal — sehingga menambah/mengurangi jumlah instance konsumen di sisi mana pun tidak memerlukan perubahan pada sisi pengirim.

---

## 9. Autentikasi, Keamanan, & Logging

- **Autentikasi**: JWT dengan refresh token rotation; `tenant_id` disisipkan di dalam token/header, wajib difilter di setiap query PostgreSQL untuk menjaga isolasi multi-tenant.
- **Dua jalur pembuatan akun, satu entitas `USER`**: registrasi mandiri (publik, selalu membuat `TENANT` baru beserta `ADMIN` pertamanya) terpisah dari pembuatan akun oleh Admin (butuh token, `tenant_id` diambil dari token dan **tidak pernah** dari request body). Keduanya menghasilkan baris `USER` biasa — tidak ada pemisahan entitas "user asli" vs "user buatan Admin", karena seluruh relasi konten (`BAB_DRAFT`, `BUKTI_DUKUNG`, `HASIL_SKOR_KRITERIA`, dan lain-lain) menunjuk ke satu `USER`, dan role sudah cukup membedakan kewenangannya.
- **Password**: di-hash dengan **bcrypt**. Password akun buatan Admin diisi oleh Admin (§4.2 `application_flow.md`), bukan lewat token undangan.
- **Akses file**: seluruh interaksi dengan Cloudflare R2 menggunakan **presigned URL** bermasa berlaku terbatas.
- **Logging**: file-based selama development, dengan transport yang dirancang mudah di-_swap_ untuk kebutuhan production (detail transport production belum ditentukan).

---

## 10. Hal yang Masih Ditunda

1. **Struktur data hasil AMI Assessment** — apakah menggunakan pola tabel serupa `HASIL_SKOR_KRITERIA` (dengan `target_tipe` tambahan) atau memerlukan struktur/alur approval tersendiri, mengingat AMI secara konsep adalah proses audit, bukan sekadar skoring.
2. **Detail payload tiap jenis job** (`AMI assessment Job`, `Content Generation Job`, `Scoring job`, `File processing job`) — kerangka umum kontrak job/laporan sudah disepakati sebelumnya, tapi field spesifik per jenis job masih perlu dirumuskan bersama tim RAG.
3. **Rate limiting & concurrency ke LLM Layer** — terutama karena ada empat provider berbeda (Ollama, DeepSeek, GPT OSS, Qwen), perlu dipikirkan strategi pemilihan provider dan penanganan kuota/rate limit masing-masing.
4. **Kebijakan caching lebih rinci** — key-key spesifik apa saja yang masuk kategori "other caching checking/storing", TTL masing-masing, dan strategi invalidasi cache.
5. **Environment terpisah** (development/staging/production) dan pengelolaan konfigurasi/secret per environment.
6. **Backup & disaster recovery** untuk PostgreSQL dan ChromaDB.
7. **Kapan tepatnya migrasi ke RabbitMQ atau pemisahan multi-deploy** (bagian 7 dan 8) benar-benar dieksekusi — saat ini murni opsi yang sudah disiapkan jalurnya, bukan rencana dengan linimasa pasti.
