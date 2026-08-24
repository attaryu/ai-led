# ERD — Skema Database Platform LED

Diagram pendamping [`database.md`](./database.md). Kolom di sini sengaja **dipangkas** ke primary key, foreign key, dan satu-dua kolom penanda saja — rincian lengkap tiap kolom tetap di `database.md`. Tujuan halaman ini melihat **relasi**, bukan menghafal kolom.

**Cara membaca garis:**

| Garis | Arti |
|---|---|
| Utuh (`──`) | Foreign key sungguhan, ditegakkan database |
| Putus-putus (`⋯`) | Terhubung lewat **kecocokan nilai**, bukan FK — database tidak menjaganya |

---

## 1. Skema Utama (tabel 1–15 + 10a)

Status: **rancangan.** Belum ada satu pun migration fisik yang membuatnya.

```mermaid
erDiagram
    TENANT ||--o{ USER : "menampung"
    TENANT ||--o{ PROGRAM_STUDI : "menampung"
    TENANT ||--o{ BUKTI_DUKUNG : "memiliki (owner_tipe=TENANT)"

    PROGRAM_STUDI ||--o{ USER : "menugaskan PENYUSUN"
    PROGRAM_STUDI ||--o{ DOKUMEN_LED : "memiliki"
    PROGRAM_STUDI ||--o{ BUKTI_DUKUNG : "memiliki (owner_tipe=PROGRAM_STUDI)"
    TENANT ||--o{ FOLDER_BUKTI : "memiliki (owner_tipe=TENANT)"
    PROGRAM_STUDI ||--o{ FOLDER_BUKTI : "memiliki (owner_tipe=PROGRAM_STUDI)"
    FOLDER_BUKTI ||--o{ FOLDER_BUKTI : "parent_id — sarang bebas"
    FOLDER_BUKTI ||--o{ BUKTI_DUKUNG : "mengelompokkan (folder_id nullable)"

    DOKUMEN_LED ||--o{ BAB_DOKUMEN : "terdiri dari"
    BAB_DOKUMEN ||--o{ BAB_DRAFT : "punya checkpoint"
    BAB_DOKUMEN |o--o| BAB_DRAFT : "checkpoint_aktif_id"
    USER ||--o{ BAB_DRAFT : "membuat"

    BUKTI_DUKUNG ||--o{ BUKTI_DUKUNG_BAB : "dirujuk"
    BAB_DOKUMEN  ||--o{ BUKTI_DUKUNG_BAB : "dipakai kondisi aktif"
    BUKTI_DUKUNG ||--o{ BUKTI_DUKUNG_DRAFT : "dirujuk"
    BAB_DRAFT    ||--o{ BUKTI_DUKUNG_DRAFT : "arsip permanen"

    RUBRIK_KRITERIA ||--o{ RUBRIK_LEVEL : "dipecah per level skor"
    RUBRIK_KRITERIA ||--o{ RUBRIK_KRITERIA_BAB : "berlaku untuk bab"
    RUBRIK_KRITERIA ||--o{ HASIL_SKOR_KRITERIA : "dinilai terhadap"
    USER ||--o{ HASIL_SKOR_KRITERIA : "menjalankan simulasi"
    BAB_DOKUMEN ||--o{ HASIL_SKOR_KRITERIA : "target_tipe=BAB_AKTIF"
    BAB_DRAFT   ||--o{ HASIL_SKOR_KRITERIA : "target_tipe=BAB_DRAFT"

    PANDUAN_REFERENSI ||--o{ PANDUAN_DETAIL : "dipecah jadi poin"
    PANDUAN_DETAIL ||--o{ PANDUAN_DETAIL_BAB : "berlaku untuk bab"

    RUBRIK_KRITERIA_BAB ||..o{ BAB_DOKUMEN : "cocok lewat urutan_bab"
    PANDUAN_DETAIL_BAB  ||..o{ BAB_DOKUMEN : "cocok lewat urutan_bab"

    TENANT {
        string id PK
        string nama_universitas
    }
    USER {
        string id PK
        string tenant_id FK
        string program_studi_id FK "nullable, khusus PENYUSUN"
        string email
        string role "ADMIN PIMPINAN PENJAMIN_MUTU PENYUSUN"
        datetime dibuat_pada
    }
    PROGRAM_STUDI {
        string id PK
        string tenant_id FK
        string nama
        string peringkat_akreditasi
        date berlaku_sampai_akreditasi "nullable"
        datetime dibuat_pada
    }
    DOKUMEN_LED {
        string id PK
        string program_studi_id FK
        string tahun_akademik
        string status_keseluruhan "DRAFT REVIEW SELESAI"
        date tenggat "nullable"
        datetime dibuat_pada
    }
    BAB_DOKUMEN {
        string id PK
        string dokumen_id FK
        int urutan_bab
        jsonb konten_kerja
        string checkpoint_aktif_id FK "nullable"
        bool terkunci
        jsonb ragas "nullable"
        datetime diajukan_review_pada "nullable"
        datetime terakhir_disimpan
    }
    BAB_DRAFT {
        string id PK
        string bab_id FK
        string dibuat_oleh_user_id FK
        string dibuat_oleh_nama "denormalisasi"
        int versi "urut per bab"
        jsonb konten_snapshot "immutable"
        string sumber "AI MANUAL"
        jsonb ragas "nullable"
        datetime dibuat_pada
    }
    BUKTI_DUKUNG {
        string id PK
        string owner_tipe "TENANT PROGRAM_STUDI"
        string tenant_id FK "nullable"
        string program_studi_id FK "nullable"
        string nama_dokumen
        string status_ekstraksi "MENUNGGU DIPROSES SIAP GAGAL"
        string diunggah_oleh_user_id FK
        string diunggah_oleh_nama "denormalisasi"
    }
    BUKTI_DUKUNG_BAB {
        string id PK
        string bukti_dukung_id FK
        string bab_dokumen_id FK
        string nama_dokumen "denormalisasi"
        string tipe_file "denormalisasi"
    }
    BUKTI_DUKUNG_DRAFT {
        string id PK
        string bukti_dukung_id FK
        string bab_draft_id FK
        string nama_dokumen "denormalisasi"
        string tipe_file "denormalisasi"
    }
    RUBRIK_KRITERIA {
        string id PK
        string kode_kriteria
        string deskripsi
    }
    RUBRIK_LEVEL {
        string id PK
        string kriteria_id FK
        int skor
        text deskripsi
    }
    RUBRIK_KRITERIA_BAB {
        string id PK
        string kriteria_id FK
        int urutan_bab "kunci cocok, bukan FK"
    }
    HASIL_SKOR_KRITERIA {
        string id PK
        string kriteria_id FK
        string target_tipe "BAB_AKTIF BAB_DRAFT"
        string bab_id FK "nullable"
        string bab_draft_id FK "nullable"
        int skor_didapat
        string dijalankan_oleh_user_id FK
        string dijalankan_oleh_nama "denormalisasi"
    }
    PANDUAN_REFERENSI {
        string id PK
        string tipe "PANDUAN_LAM TEMPLATE_LKPS DOKUMEN_RUBRIK"
        string judul
    }
    PANDUAN_DETAIL {
        string id PK
        string panduan_id FK
        string kode_poin
        text isi_teks
    }
    PANDUAN_DETAIL_BAB {
        string id PK
        string panduan_detail_id FK
        int urutan_bab "kunci cocok, bukan FK"
    }
```

**Dua hal yang tidak terlihat dari garis:**

- `RUBRIK_KRITERIA_BAB.urutan_bab` dan `PANDUAN_DETAIL_BAB.urutan_bab` **bukan** foreign key ke `BAB_DOKUMEN.id`. Keduanya master data global yang berlaku sebelum satu pun `DOKUMEN_LED` dibuat, jadi pencocokannya `WHERE urutan_bab = 2`, bukan JOIN.
- `HASIL_SKOR_KRITERIA` menempel ke **salah satu** `BAB_DOKUMEN` atau `BAB_DRAFT`, tidak pernah keduanya — ditentukan `target_tipe`. Pola yang sama dipakai `BUKTI_DUKUNG` lewat `owner_tipe`.

---

## 2. Prototipe AI-LED (tabel 16–18)

Status: **berjalan**, di SQLite `/data/led.db` pada branch `led-wiriting(dimas)`. Tidak punya satu pun foreign key, dan tidak tersambung ke skema utama.

```mermaid
erDiagram
    drafts ||..o{ chat_messages : "cocok lewat section_id + model"
    drafts ||..|| eval_results  : "cocok lewat section_id + model"

    drafts {
        int id PK
        string section_id "slug outline, bukan FK"
        string model
        text draft_text
        text pedoman_used "JSON"
        text rubric_used "JSON"
        text checklist "JSON"
        text chunks_used "JSON"
        text judge_result "JSON"
        real latency_sec
        int token_count
        string status "draft approved"
    }
    chat_messages {
        int id PK
        string section_id
        string model
        string role
        text message
    }
    eval_results {
        int id PK
        string section_id
        string model
        real rouge_1
        real bleu_4
        real answer_relevancy
        real context_precision
        real context_recall
    }
```

`section_id` menunjuk simpul di pohon outline `led_bab_tabel.json` yang **berjenjang sampai 10 level** — bukan tabel, dan bukan `BAB_DOKUMEN.urutan_bab` yang cuma satu tingkat. Ini ketidakcocokan terbesar antara prototipe dan skema utama.

---

## 3. Prototipe AMI Assessment (tabel 19–21)

Status: **berjalan**, di Supabase PostgreSQL pada branch `ariel`. Punya FK internal, tapi tidak tersambung ke skema utama.

```mermaid
erDiagram
    assessment_sessions ||--o{ indicator_results : "FK, ON DELETE CASCADE"
    assessment_sessions ||..o{ reasoning_steps : "tanpa FK sama sekali"

    assessment_sessions {
        bigint id PK
        string session_id UK "UUID, kunci yang dipakai"
        string laporan_path
        int total_indicators
        int completed_indicators
        string status "running completed failed"
    }
    indicator_results {
        bigint id PK
        string session_id FK
        int indicator_no "1-78"
        decimal score "0.00-4.00"
        text justification
        decimal confidence
        text recommendation
    }
    reasoning_steps {
        bigint id PK
        string session_id "tanpa FK, bisa yatim"
        int indicator_no
        int step_index
        text content
    }
```

Teks kriteria tiap indikator **tidak ada di database** — di-*parse* dari Excel dan di-*cache* di memori, lalu digabungkan saat hasil dibaca.

---

## 4. Yang belum ada di mana pun

Tiga tabel diusulkan [`integration-plan.md`](./integration-plan.md) §2.4 tapi belum masuk `database.md` maupun kode:

```mermaid
erDiagram
    BAB_DOKUMEN ||--o{ generation_runs : "satu baris per eksekusi generate"
    generation_runs ||--o| ragas_scores : "mutu jawaban per run"
    BAB_DRAFT }o--o| generation_runs : "generate mana yang menghasilkan"

    generation_runs {
        uuid id PK
        uuid bab_id FK
        string model "menutup celah model tak tercatat"
        jsonb pedoman_used
        jsonb chunks_used
        jsonb judge_result
        numeric latency_sec
    }
    ragas_scores {
        uuid id PK
        uuid generation_run_id FK
        jsonb metrik "faithfulness response_relevancy context_precision"
        int jumlah_chunk
    }
    jobs {
        uuid id PK
        string tipe
        string status "MENUNGGU DIPROSES SELESAI GAGAL"
        jsonb payload
    }
```

`jobs` berdiri sendiri tanpa relasi — ia menggantikan Redis stream untuk MVP.

---

## Ringkasan status

| Kelompok | Jumlah tabel | Sudah jalan? | Tersambung ke skema utama? |
|---|---|---|---|
| Skema utama | 16 | ❌ rancangan | — |
| Prototipe AI-LED | 3 | ✅ SQLite | ❌ |
| Prototipe AMI | 3 | ✅ Supabase | ❌ |
| Usulan baru | 3 | ❌ belum ditulis | — |

Total yang harus ada di `schema.prisma` nanti: **25 tabel**.
