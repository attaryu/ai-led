-- =====================================================================
-- schema.sql — LED Generator Platform (PostgreSQL)
--
-- 22 tabel: 15 sesuai /home/dimas/proyek-akhir/database.md + 7 tambahan
-- disetujui eksplisit oleh user (lihat database.md untuk detail naratif):
--   - bab_chat_message    : riwayat chat per bab_dokumen (gap: tidak ada
--                           tabel chat di skema asli)
--   - chunk_bukti_dukung  : isi chunk hasil ekstraksi EVIDENCE saja, sumber
--                           embedding vector DB eksternal
--   - lkps, lkps_detail   : dokumen sumber + chunk LKPS, kelompok sendiri
--                           (mirip panduan_referensi/panduan_detail) --
--                           LKPS BUKAN bukti dukung upload user
--   - bab_referensi_chunk : traceability top-N chunk per tipe sumber
--                           (PEDOMAN/RUBRIK/LKPS/EVIDENCE) yg dipakai LLM
--                           utk 1 bab -- gantikan field jsonb
--                           pedoman_used/rubric_used/chunks_used
--   - document_registry   : representasi BULK evidence per-FOLDER (bukan
--                           per-file-content) -- dipakai tahap rekomendasi
--                           dokumen sebelum synthesis, lihat alur "Document
--                           Recommendation" di database.md
--   - bab_document_recommendation : histori tahap rekomendasi dokumen,
--                           DIMILIKI oleh 1 bab_draft (bab_draft_id) --
--                           klik "Rekomendasikan Dokumen" pada section
--                           kosong langsung membuat bab_dokumen + bab_draft
--                           kosong (status='EMPTY'), rekomendasi terikat ke
--                           draft itu. Hapus draft -> CASCADE hapus
--                           rekomendasinya juga (1 section boleh py banyak
--                           draft, masing2 dgn rekomendasi independen).
--
-- Deviasi dari skema asli (juga disetujui user):
--   - bab_dokumen.model, bab_draft.model  : kolom eksplisit (bukan jsonb)
--   - bab_dokumen.status                  : kolom eksplisit draft/approved
--   - UNIQUE(dokumen_id, urutan_bab, model) di bab_dokumen, bukan cuma
--     (dokumen_id, urutan_bab) -- 1 section bisa py banyak model aktif
--   - panduan_referensi.kategori          : kolom baru, isi saat ini "LAM TEKNIK"
--   - panduan_detail.chunk_id             : kolom baru, matching key ke
--                                           bab_referensi_chunk.chunk_id
--   - Pedoman & Rubrik disimpan di panduan_referensi/panduan_detail
--     (tipe PANDUAN_LAM / DOKUMEN_RUBRIK), BUKAN di bukti_dukung --
--     bukti_dukung/chunk_bukti_dukung sekarang MURNI Evidence.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Kelompok: Organisasi & Pengguna ──────────────────────────────────

CREATE TABLE tenant (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_universitas  TEXT NOT NULL
);

CREATE TABLE program_studi (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    nama        TEXT NOT NULL
);
CREATE INDEX idx_program_studi_tenant ON program_studi(tenant_id);

-- "user" adalah reserved word di Postgres -> app_user
CREATE TABLE app_user (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    program_studi_id   UUID REFERENCES program_studi(id) ON DELETE SET NULL,
    nama_lengkap       TEXT NOT NULL,
    email              TEXT NOT NULL,
    password_hash      TEXT NOT NULL,
    role               TEXT NOT NULL CHECK (role IN ('ADMIN','PIMPINAN','PENJAMIN_MUTU','PENYUSUN')),
    CONSTRAINT uq_app_user_email_tenant UNIQUE (tenant_id, email)
);
CREATE INDEX idx_app_user_tenant  ON app_user(tenant_id);
CREATE INDEX idx_app_user_prodi   ON app_user(program_studi_id);

-- ── Kelompok: Dokumen LED ─────────────────────────────────────────────

CREATE TABLE dokumen_led (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_studi_id      UUID NOT NULL REFERENCES program_studi(id) ON DELETE CASCADE,
    judul                 TEXT NOT NULL,
    tahun_akademik        TEXT NOT NULL,
    status_keseluruhan    TEXT NOT NULL DEFAULT 'DRAFT'
                              CHECK (status_keseluruhan IN ('DRAFT','REVIEW','SELESAI'))
);
CREATE INDEX idx_dokumen_led_prodi ON dokumen_led(program_studi_id);

CREATE TABLE bab_dokumen (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dokumen_id             UUID NOT NULL REFERENCES dokumen_led(id) ON DELETE CASCADE,
    urutan_bab             INTEGER NOT NULL,
    judul_bab              TEXT NOT NULL,
    model                  TEXT NOT NULL,        -- deviasi: nama model LLM (mis. "deepseek-r1:32b")
    status                 TEXT NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft','approved')),  -- deviasi: eks status lama
    konten_kerja           JSONB NOT NULL DEFAULT '{}'::jsonb,
    checkpoint_aktif_id    UUID,   -- FK ditambah belakangan (sirkular dgn bab_draft, lihat ALTER di bawah)
    terkunci               BOOLEAN NOT NULL DEFAULT FALSE,
    catatan_penjamin_mutu  TEXT,
    terakhir_disimpan      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_bab_dokumen_urutan_model UNIQUE (dokumen_id, urutan_bab, model)
);
CREATE INDEX idx_bab_dokumen_dokumen ON bab_dokumen(dokumen_id);
CREATE INDEX idx_bab_dokumen_konten_kerja_gin ON bab_dokumen USING GIN (konten_kerja);

CREATE TABLE bab_draft (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bab_id                UUID NOT NULL REFERENCES bab_dokumen(id) ON DELETE CASCADE,
    dibuat_oleh_user_id   UUID NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
    model                 TEXT NOT NULL,        -- deviasi: disalin dari bab_dokumen.model induknya
    versi                 INTEGER NOT NULL,
    label                 TEXT,
    konten_snapshot       JSONB NOT NULL DEFAULT '{}'::jsonb,
    sumber                TEXT NOT NULL CHECK (sumber IN ('AI','MANUAL')),
    -- 'EMPTY': draft baru dibuat via Rekomendasikan Dokumen/Buat Draft Baru,
    -- belum ada narasi. 'FILLED': sudah diisi hasil generate.
    status                TEXT NOT NULL DEFAULT 'EMPTY' CHECK (status IN ('EMPTY','FILLED')),
    referensi_chunk_ids   TEXT,
    dibuat_pada           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_bab_draft_versi UNIQUE (bab_id, versi)
);
CREATE INDEX idx_bab_draft_bab       ON bab_draft(bab_id);
CREATE INDEX idx_bab_draft_user      ON bab_draft(dibuat_oleh_user_id);
CREATE INDEX idx_bab_draft_bab_versi ON bab_draft(bab_id, versi DESC);

-- FK sirkular bab_dokumen.checkpoint_aktif_id -> bab_draft.id
ALTER TABLE bab_dokumen
    ADD CONSTRAINT fk_bab_dokumen_checkpoint_aktif
    FOREIGN KEY (checkpoint_aktif_id) REFERENCES bab_draft(id) ON DELETE SET NULL;

-- Tabel baru (gap: skema asli tidak punya tabel chat sama sekali)
CREATE TABLE bab_chat_message (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bab_id        UUID NOT NULL REFERENCES bab_dokumen(id) ON DELETE CASCADE,
    role          TEXT NOT NULL CHECK (role IN ('user','assistant')),
    message       TEXT NOT NULL,
    dibuat_pada   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bab_chat_message_bab ON bab_chat_message(bab_id, dibuat_pada);

-- Tabel baru: traceability top-N chunk (per tipe sumber RAG) yg dipakai LLM
-- utk 1 bab -- gantikan field jsonb pedoman_used/rubric_used/chunks_used
-- (field jsonb TETAP ada di konten_kerja/konten_snapshot sbg cache ringkas,
-- tapi tabel ini jadi sumber kebenaran relasional).
-- chunk_id BUKAN FK UUID keras ke panduan_detail/lkps_detail/chunk_bukti_dukung.id
-- -- disengaja "matching key" (pola sama spt rubrik_kriteria_bab.urutan_bab),
-- karena search_pedoman/search_rubric/search_lkps/search_evidence (retrieval.py)
-- mengembalikan id dari Chroma metadata.chunk_id (string), bukan UUID Postgres.
CREATE TABLE bab_referensi_chunk (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bab_id         UUID REFERENCES bab_dokumen(id) ON DELETE CASCADE,
    bab_draft_id   UUID REFERENCES bab_draft(id) ON DELETE CASCADE,
    target_tipe    TEXT NOT NULL CHECK (target_tipe IN ('BAB_AKTIF','BAB_DRAFT')),
    tipe_sumber    TEXT NOT NULL CHECK (tipe_sumber IN ('PEDOMAN','RUBRIK','LKPS','EVIDENCE')),
    chunk_id       TEXT NOT NULL,
    urutan         INTEGER NOT NULL,   -- ranking top-N (1 = paling relevan)
    distance       REAL,               -- skor jarak/similarity dari Chroma (audit)
    CONSTRAINT chk_bab_referensi_target CHECK (
        (target_tipe = 'BAB_AKTIF' AND bab_id IS NOT NULL AND bab_draft_id IS NULL) OR
        (target_tipe = 'BAB_DRAFT' AND bab_draft_id IS NOT NULL AND bab_id IS NULL)
    )
);
CREATE INDEX idx_brc_bab       ON bab_referensi_chunk(bab_id) WHERE bab_id IS NOT NULL;
CREATE INDEX idx_brc_bab_draft ON bab_referensi_chunk(bab_draft_id) WHERE bab_draft_id IS NOT NULL;
-- "ditimpa" utk bab aktif: DELETE semua baris lama bab_id ini lalu INSERT ulang
-- tiap kali digenerate ulang; checkpoint (bab_draft) permanen, tidak ditimpa.
CREATE UNIQUE INDEX uq_brc_bab_aktif ON bab_referensi_chunk(bab_id, tipe_sumber, urutan)       WHERE target_tipe='BAB_AKTIF';
CREATE UNIQUE INDEX uq_brc_bab_draft ON bab_referensi_chunk(bab_draft_id, tipe_sumber, urutan) WHERE target_tipe='BAB_DRAFT';

-- ── Kelompok: Bukti Dukung ────────────────────────────────────────────

CREATE TABLE bukti_dukung (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_tipe         TEXT NOT NULL CHECK (owner_tipe IN ('TENANT','PROGRAM_STUDI')),
    tenant_id          UUID REFERENCES tenant(id) ON DELETE CASCADE,
    program_studi_id   UUID REFERENCES program_studi(id) ON DELETE CASCADE,
    nama_dokumen       TEXT NOT NULL,
    file_url           TEXT NOT NULL,
    tipe_file          TEXT,
    waktu_diunggah     TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- deviasi: kolom berikut utk fitur upload halaman "Document" (Google-Drive
    -- style) -- lihat database.md #7 utk detail alur upload->queue->worker.
    folder_path        TEXT NOT NULL DEFAULT '',   -- path folder relatif, mis. "Tabel 6d/"
    status             TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','processing','done','failed')),
    error_message      TEXT,
    CONSTRAINT chk_bukti_dukung_owner CHECK (
        (owner_tipe = 'TENANT'        AND tenant_id IS NOT NULL AND program_studi_id IS NULL) OR
        (owner_tipe = 'PROGRAM_STUDI' AND program_studi_id IS NOT NULL AND tenant_id IS NULL)
    )
);
CREATE INDEX idx_bukti_dukung_tenant ON bukti_dukung(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_bukti_dukung_prodi  ON bukti_dukung(program_studi_id) WHERE program_studi_id IS NOT NULL;

CREATE TABLE bukti_dukung_bab (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bukti_dukung_id   UUID NOT NULL REFERENCES bukti_dukung(id) ON DELETE CASCADE,
    bab_dokumen_id    UUID NOT NULL REFERENCES bab_dokumen(id) ON DELETE CASCADE,
    CONSTRAINT uq_bukti_dukung_bab UNIQUE (bukti_dukung_id, bab_dokumen_id)
);
CREATE INDEX idx_bdb_bab   ON bukti_dukung_bab(bab_dokumen_id);
CREATE INDEX idx_bdb_bukti ON bukti_dukung_bab(bukti_dukung_id);

CREATE TABLE bukti_dukung_draft (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bukti_dukung_id   UUID NOT NULL REFERENCES bukti_dukung(id) ON DELETE CASCADE,
    bab_draft_id      UUID NOT NULL REFERENCES bab_draft(id) ON DELETE CASCADE,
    CONSTRAINT uq_bukti_dukung_draft UNIQUE (bukti_dukung_id, bab_draft_id)
);
CREATE INDEX idx_bdd_draft ON bukti_dukung_draft(bab_draft_id);
CREATE INDEX idx_bdd_bukti ON bukti_dukung_draft(bukti_dukung_id);

-- Tabel baru: isi chunk hasil ekstraksi EVIDENCE (Pedoman/Rubrik/LKPS
-- dipindah ke panduan_referensi/panduan_detail dan lkps/lkps_detail --
-- lihat kelompok masing2 di bawah -- karena bukan "bukti dukung" upload
-- user, melainkan dokumen institusional/rujukan).
-- Vector DB eksternal (Chroma) HANYA menyimpan embedding + id kolom ini,
-- bukan isi teks -- isi teks hidup di sini supaya bisa diaudit/diedit relasional.
CREATE TABLE chunk_bukti_dukung (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_bukti_dukung   UUID NOT NULL REFERENCES bukti_dukung(id) ON DELETE CASCADE,
    chunk_id          TEXT NOT NULL,
    entity            TEXT NOT NULL,
    content           TEXT NOT NULL,
    CONSTRAINT uq_chunk_bukti_dukung UNIQUE (id_bukti_dukung, chunk_id)
);
CREATE INDEX idx_cbd_bukti ON chunk_bukti_dukung(id_bukti_dukung);

-- Tabel baru: representasi BULK evidence default sekarang adalah per-FOLDER
-- (1 baris = 1 folder yg LANGSUNG berisi >=1 file, bukan rekursif) --
-- menggantikan pendekatan lama (chunk per heading isi file) sbg default.
-- Isi file tetap di-chunk ON-DEMAND (chunk_bukti_dukung, tidak berubah)
-- hanya saat user pilih file itu di alur rekomendasi (lihat
-- BAB_DOCUMENT_RECOMMENDATION). Institusional, TANPA kolom owner (spt
-- panduan_referensi/lkps) -- app single-tenant/single-prodi.
-- Vector DB eksternal (Chroma, collection "document_registry") HANYA
-- menyimpan embedding + chunk_id, isi teks hidup di sini.
CREATE TABLE document_registry (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id          TEXT NOT NULL UNIQUE,   -- matching key ke Chroma "document_registry", format docreg__<slug>
    folder_path       TEXT NOT NULL,          -- relatif thd evidence root, mis. "Tabel 6d/Sub A"
    folder_name       TEXT NOT NULL,          -- last path segment
    document_text     TEXT NOT NULL,          -- hierarki folder + nama file yg sudah dibersihkan
    document_count    INTEGER NOT NULL DEFAULT 0,
    dibuat_pada       TIMESTAMPTZ NOT NULL DEFAULT now(),
    diperbarui_pada   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_document_registry_folder ON document_registry(folder_path);

-- Tabel baru: histori & state tahap rekomendasi dokumen, DIMILIKI oleh 1
-- bab_draft (bab_draft_id) -- klik "Rekomendasikan Dokumen" pada section
-- kosong langsung membuat bab_dokumen + bab_draft kosong (status='EMPTY'),
-- rekomendasi ini terikat ke draft itu. Kolom (dokumen_id, urutan_bab, model)
-- dipertahankan sbg denormalized lookup/audit trail, TIDAK lagi jadi kunci
-- utama kepemilikan -- itu sekarang bab_draft_id. Hapus draft -> CASCADE
-- hapus rekomendasinya juga (ON DELETE CASCADE di bab_draft_id), user bisa
-- minta rekomendasi baru dari draft baru tanpa mempengaruhi draft lain.
-- BEDA dari BAB_REFERENSI_CHUNK (itu utk RAG chunks yg IKUT PROMPT synthesis
-- akhir dari 4 sumber PEDOMAN/RUBRIK/LKPS/EVIDENCE; tabel ini histori
-- keputusan REKOMENDASI + pilihan folder evidence SEBELUM synthesis).
CREATE TABLE bab_document_recommendation (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dokumen_id            UUID NOT NULL REFERENCES dokumen_led(id) ON DELETE CASCADE,
    urutan_bab            INTEGER NOT NULL,
    model                 TEXT NOT NULL,
    bab_draft_id          UUID REFERENCES bab_draft(id) ON DELETE CASCADE,  -- pemilik draft (empty/filled)
    document_query        JSONB NOT NULL DEFAULT '[]'::jsonb,   -- selalu ada, hasil LLM
    lkps_needed           BOOLEAN NOT NULL DEFAULT FALSE,        -- hasil LLM "apakah butuh LKPS?"
    lkps_sufficient       BOOLEAN,                                -- NULL kalau lkps_needed=FALSE
    lkps_evidence_query   JSONB,                                  -- kondisional, NULL kalau tdk perlu
    candidate_folders     JSONB NOT NULL DEFAULT '[]'::jsonb,   -- hasil RAG document_registry
    recommendation_text   TEXT,                                   -- pesan human-readable dari LLM
    selected_folder_paths JSONB NOT NULL DEFAULT '[]'::jsonb,   -- folder_path yg user confirm (informational)
    -- bukti_dukung.id (UUID as text) yg user checklist/confirm di tab
    -- "Dokumen Pendukung" -- disimpan supaya checklist file PERSISTEN
    -- lepas dari memory browser (survive refresh/pindah section/setelah
    -- narasi jadi), dibaca ulang via GET .../recommendation.
    selected_bukti_dukung_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Chunk pedoman/rubric/lkps yg dipakai SELAMA tahap rekomendasi (bukan
    -- sintesis) -- disimpan supaya tab Pedoman/Rubric/LKPS di UI bisa
    -- tampilkan referensi ini SEBELUM narasi/draft ada (lihat database.md #9c).
    pedoman_used          JSONB NOT NULL DEFAULT '[]'::jsonb,
    rubric_used           JSONB NOT NULL DEFAULT '[]'::jsonb,
    lkps_used             JSONB NOT NULL DEFAULT '[]'::jsonb,
    status                TEXT NOT NULL DEFAULT 'recommended'
                              CHECK (status IN ('recommended','confirmed','superseded')),
    dibuat_pada           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bab_doc_rec_lookup ON bab_document_recommendation(dokumen_id, urutan_bab, model, dibuat_pada DESC);
CREATE INDEX idx_bab_doc_rec_draft ON bab_document_recommendation(bab_draft_id);
-- 1 baris 'confirmed' per DRAFT (bukan per section+model lagi) -- tiap draft
-- (versi) punya rekomendasi & evidence konfirmasi sendiri, independen dari
-- draft lain milik section yang sama. Baris lama ditandai 'superseded'
-- (bukan dihapus) saat user regenerate rekomendasi pada draft yg sama.
CREATE UNIQUE INDEX uq_bab_doc_rec_confirmed_per_draft
    ON bab_document_recommendation(bab_draft_id) WHERE status = 'confirmed' AND bab_draft_id IS NOT NULL;

-- Kartu jenis dokumen hasil kesimpulan LLM (satu baris = satu card di tab
-- "Dokumen Pendukung"), relasional (bukan JSONB) supaya persist lepas dari
-- memory Zustand & bisa di-refresh. Dihapus (bukan superseded) begitu user
-- klik "Konfirmasi & Lanjut" -- tugas rekomendasi selesai, lihat
-- routes/sections.py confirm_recommendation.
CREATE TABLE bab_recommendation_item (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID NOT NULL REFERENCES bab_document_recommendation(id) ON DELETE CASCADE,
    label             TEXT NOT NULL,
    reason            TEXT,
    urutan            INTEGER NOT NULL DEFAULT 0,
    dibuat_pada       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bab_rec_item_lookup ON bab_recommendation_item(recommendation_id, urutan);

-- ── Kelompok: Skoring ─────────────────────────────────────────────────

CREATE TABLE rubrik_kriteria (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode_kriteria   TEXT NOT NULL,
    deskripsi       TEXT NOT NULL,
    skor_maksimal   INTEGER NOT NULL
);

CREATE TABLE rubrik_kriteria_bab (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kriteria_id   UUID NOT NULL REFERENCES rubrik_kriteria(id) ON DELETE CASCADE,
    urutan_bab    INTEGER NOT NULL,     -- matching key, BUKAN FK (master data global)
    CONSTRAINT uq_rubrik_kriteria_bab UNIQUE (kriteria_id, urutan_bab)
);
CREATE INDEX idx_rkb_urutan_bab ON rubrik_kriteria_bab(urutan_bab);

CREATE TABLE hasil_skor_kriteria (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kriteria_id              UUID NOT NULL REFERENCES rubrik_kriteria(id) ON DELETE CASCADE,
    target_tipe              TEXT NOT NULL CHECK (target_tipe IN ('BAB_AKTIF','BAB_DRAFT')),
    bab_id                   UUID REFERENCES bab_dokumen(id) ON DELETE CASCADE,
    bab_draft_id             UUID REFERENCES bab_draft(id) ON DELETE CASCADE,
    skor_didapat             INTEGER NOT NULL,
    justifikasi              TEXT,
    dijalankan_oleh_user_id  UUID NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
    dijalankan_pada          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_hasil_skor_target CHECK (
        (target_tipe = 'BAB_AKTIF' AND bab_id IS NOT NULL AND bab_draft_id IS NULL) OR
        (target_tipe = 'BAB_DRAFT' AND bab_draft_id IS NOT NULL AND bab_id IS NULL)
    )
);
CREATE INDEX idx_hsk_bab        ON hasil_skor_kriteria(bab_id) WHERE bab_id IS NOT NULL;
CREATE INDEX idx_hsk_bab_draft  ON hasil_skor_kriteria(bab_draft_id) WHERE bab_draft_id IS NOT NULL;
CREATE INDEX idx_hsk_kriteria   ON hasil_skor_kriteria(kriteria_id);
-- "ditimpa" utk bab aktif: 1 baris per (bab_id, kriteria_id) saat aktif
CREATE UNIQUE INDEX uq_hsk_bab_aktif  ON hasil_skor_kriteria(bab_id, kriteria_id)       WHERE target_tipe = 'BAB_AKTIF';
CREATE UNIQUE INDEX uq_hsk_bab_draft  ON hasil_skor_kriteria(bab_draft_id, kriteria_id) WHERE target_tipe = 'BAB_DRAFT';

-- ── Kelompok: Panduan Referensi (Master Data RAG) ────────────────────
-- Menampung dokumen institusional Pedoman (tipe=PANDUAN_LAM) DAN Rubrik
-- (tipe=DOKUMEN_RUBRIK) -- keduanya dipindah keluar dari bukti_dukung
-- krn bukan dokumen upload user, melainkan rujukan/standar akreditasi.

CREATE TABLE panduan_referensi (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipe          TEXT NOT NULL CHECK (tipe IN ('PANDUAN_LAM','TEMPLATE_LKPS','DOKUMEN_RUBRIK')),
    kategori      TEXT NOT NULL DEFAULT 'LAM TEKNIK',  -- deviasi: standar akreditasi yg dipakai
    judul         TEXT NOT NULL,
    file_url      TEXT,
    tipe_file     TEXT,
    dibuat_pada   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE panduan_detail (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    panduan_id    UUID NOT NULL REFERENCES panduan_referensi(id) ON DELETE CASCADE,
    chunk_id      TEXT,      -- deviasi: matching key ke bab_referensi_chunk.chunk_id
    kode_poin     TEXT,
    judul_poin    TEXT,
    isi_teks      TEXT NOT NULL
);
CREATE INDEX idx_panduan_detail_panduan ON panduan_detail(panduan_id);
CREATE UNIQUE INDEX uq_panduan_detail_chunk ON panduan_detail(panduan_id, chunk_id) WHERE chunk_id IS NOT NULL;

CREATE TABLE panduan_detail_bab (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    panduan_detail_id   UUID NOT NULL REFERENCES panduan_detail(id) ON DELETE CASCADE,
    urutan_bab          INTEGER NOT NULL,   -- matching key, BUKAN FK (sama seperti rubrik)
    CONSTRAINT uq_panduan_detail_bab UNIQUE (panduan_detail_id, urutan_bab)
);
CREATE INDEX idx_pdb_urutan_bab ON panduan_detail_bab(urutan_bab);

-- ── Kelompok: LKPS ────────────────────────────────────────────────────
-- Tabel baru: LKPS dipindah keluar dari bukti_dukung ke kelompok sendiri
-- (mirip panduan_referensi/panduan_detail) -- LKPS adalah data terstruktur
-- institusional, bukan bukti dukung upload user. TIDAK ada lkps_detail_bab
-- (urutan_bab matching-key) krn LKPS tidak dipetakan ke nomor bab spesifik,
-- diakses via pencarian semantik langsung spt Evidence.

CREATE TABLE lkps (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    judul         TEXT NOT NULL,
    file_url      TEXT,
    tipe_file     TEXT,
    dibuat_pada   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lkps_detail (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lkps_id       UUID NOT NULL REFERENCES lkps(id) ON DELETE CASCADE,
    chunk_id      TEXT NOT NULL,   -- matching key ke bab_referensi_chunk.chunk_id
    sheet         TEXT,            -- nama sheet Excel asal chunk ini
    judul_poin    TEXT,
    isi_teks      TEXT NOT NULL,
    CONSTRAINT uq_lkps_detail_chunk UNIQUE (lkps_id, chunk_id)
);
CREATE INDEX idx_lkps_detail_lkps ON lkps_detail(lkps_id);
